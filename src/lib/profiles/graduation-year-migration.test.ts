import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const rawMigration = read(
  "../../../supabase/migrations/202610080003_student_graduation_year_range.sql",
);
const multiInstitutionMigration = read(
  "../../../supabase/migrations/202610080002_student_multi_institution_auth.sql",
);
const profileFoundation = read(
  "../../../supabase/migrations/202607190002_student_profile_foundation.sql",
).replace(/\r\n/g, "\n");

const {
  GRADUATION_YEAR_STORAGE_MAXIMUM,
  GRADUATION_YEAR_STORAGE_MINIMUM,
  getGraduationYearOptions,
  isStorableGraduationYear,
} = require("./options.ts") as typeof import("./options");

const executable = rawMigration.replace(/--.*$/gm, "");

function countOccurrences(source: string, fragment: string): number {
  return source.split(fragment).length - 1;
}

function extractBetween(source: string, start: string, end: string): string {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, start);
  const endIndex = source.indexOf(end, startIndex);
  assert.notEqual(endIndex, -1, end);
  return source.slice(startIndex, endIndex + end.length);
}

const preflightBlock = extractBetween(
  executable,
  "do $preflight$",
  "$preflight$;",
);
const verificationBlock = extractBetween(
  executable,
  "do $verification$",
  "$verification$;",
);
const statementsOutsideBlocks = executable
  .replace(preflightBlock, "")
  .replace(verificationBlock, "");

test("003 is LF-only and schema-qualifies no SQL special form", () => {
  assert.equal(rawMigration.includes("\r"), false);
  assert.doesNotMatch(
    rawMigration,
    /pg_catalog\.(?:coalesce|nullif|greatest|least|case|cast|exists|array)\s*\(/i,
  );
});

test("the historical constraint is the reviewed validated 2024-2040 rule on a NOT NULL integer column", () => {
  assert.match(
    profileFoundation,
    /graduation_year integer\s+constraint student_profiles_graduation_year_not_null not null,/,
  );
  assert.match(
    profileFoundation,
    /constraint student_profiles_graduation_year_check\s+check \(graduation_year between 2024 and 2040\),/,
  );
  assert.doesNotMatch(
    profileFoundation,
    /student_profiles_graduation_year_check[\s\S]{0,80}not valid/i,
  );
});

test("003 keeps one fail-closed transaction in the reviewed order", () => {
  assert.equal(executable.match(/^begin;$/gm)?.length, 1);
  assert.equal(executable.match(/^commit;$/gm)?.length, 1);
  assert.match(executable.trimEnd(), /commit;$/);
  assert.doesNotMatch(executable, /^rollback;$/m);

  const order = [
    "begin;",
    "do $preflight$",
    "alter table public.student_profiles",
    "do $verification$",
    "commit;",
  ].map((fragment) => executable.indexOf(fragment));
  assert.ok(order.every((position) => position >= 0));
  assert.deepEqual(
    order,
    [...order].sort((left, right) => left - right),
  );
  assert.ok(countOccurrences(executable, "errcode = '55000'") >= 8);
});

test("003 changes only the graduation year constraint and rewrites no rows", () => {
  assert.equal(countOccurrences(statementsOutsideBlocks, "alter table"), 1);
  assert.equal(countOccurrences(statementsOutsideBlocks, "drop constraint"), 1);
  assert.equal(countOccurrences(statementsOutsideBlocks, "add constraint"), 1);
  assert.match(
    statementsOutsideBlocks,
    /alter table public\.student_profiles\s+drop constraint student_profiles_graduation_year_check,\s+add constraint student_profiles_graduation_year_check\s+check \(graduation_year between 2000 and 2100\);/,
  );
  assert.match(
    statementsOutsideBlocks,
    /comment on constraint student_profiles_graduation_year_check\s+on public\.student_profiles is/,
  );

  // No data statement, no other object, no deferred validation.
  assert.doesNotMatch(
    executable,
    /\b(?:insert\s+into|update\s+public|delete\s+from|truncate|create\s+(?:or\s+replace\s+)?(?:function|table|policy|trigger|index|type)|drop\s+(?:table|function|policy|trigger|index|column)|alter\s+(?:function|type|policy)|grant|revoke)\b/i,
  );
  assert.doesNotMatch(executable, /\bnot\s+valid\b(?!ated)/i);
  assert.doesNotMatch(executable, /alter column|set not null|drop not null/i);

  // Only student_profiles is touched; the profiles email work stays in 002.
  assert.doesNotMatch(executable, /public\.profiles\b/);
  assert.doesNotMatch(executable, /handle_new_user|profiles_college_email_check/);
  for (const otherConstraint of [
    "student_profiles_cgpa_check",
    "student_profiles_cgpa_scale_check",
    "student_profiles_graduation_year_not_null",
  ]) {
    assert.equal(countOccurrences(executable, otherConstraint), 0);
  }
});

test("the preflight expects the old 2024-2040 contract and fails closed otherwise", () => {
  for (const fragment of [
    "attribute.attname = 'graduation_year'",
    "attribute.atttypid = 'pg_catalog.int4'::pg_catalog.regtype",
    "attribute.attnotnull is true",
    "'student_profiles_graduation_year_check'",
    "constraint_record.contype = 'c'",
    "constraint_record.convalidated is true",
    "pg_catalog.pg_get_constraintdef(constraint_record.oid)",
    "'graduation_year >= 2024'",
    "'graduation_year <= 2040'",
    "'kgeo_migration.student_profiles_other_constraints'",
    "'kgeo_migration.student_profiles_other_constraint_count'",
    "'kgeo_migration.student_profiles_filenode'",
  ]) {
    assert.ok(preflightBlock.includes(fragment), fragment);
  }
  assert.match(preflightBlock, /if v_constraint_count <> 1/);
  assert.equal(countOccurrences(preflightBlock, "pg_catalog.set_config("), 3);

  // The fragments match PostgreSQL's rendering of the historical rule.
  const liveDefinition =
    "CHECK (((graduation_year >= 2024) AND (graduation_year <= 2040)))";
  for (const fragment of ["graduation_year >= 2024", "graduation_year <= 2040"]) {
    assert.ok(liveDefinition.includes(fragment), fragment);
  }
  for (const fragment of ["2000", "2100", " OR "]) {
    assert.equal(liveDefinition.includes(fragment), false, fragment);
  }
});

test("the verification proves the 2000-2100 envelope and that nothing else changed", () => {
  for (const fragment of [
    "'student_profiles_graduation_year_check'",
    "constraint_record.convalidated is true",
    "'graduation_year >= 2000'",
    "'graduation_year <= 2100'",
    "'2024'",
    "'2040'",
    "'kgeo_migration.student_profiles_other_constraints'",
    "'kgeo_migration.student_profiles_other_constraint_count'",
    "'kgeo_migration.student_profiles_filenode'",
    "pg_catalog.pg_relation_filenode(",
    "attribute.attnotnull is true",
  ]) {
    assert.ok(verificationBlock.includes(fragment), fragment);
  }
  assert.match(verificationBlock, /if v_constraint_count <> 1/);
  assert.equal(
    countOccurrences(verificationBlock, "pg_catalog.current_setting("),
    3,
  );
  assert.doesNotMatch(verificationBlock, /pg_catalog\.set_config\(/);

  // Catalog-only: verification never reads Student rows.
  assert.doesNotMatch(
    verificationBlock,
    /\bfrom public\.|\bjoin public\.|\bfrom auth\./i,
  );

  const newDefinition =
    "CHECK (((graduation_year >= 2000) AND (graduation_year <= 2100)))";
  for (const fragment of ["graduation_year >= 2000", "graduation_year <= 2100"]) {
    assert.ok(newDefinition.includes(fragment), fragment);
  }
  for (const fragment of ["2024", "2040", " OR "]) {
    assert.equal(newDefinition.includes(fragment), false, fragment);
  }
});

test("the database envelope matches the shared storage constants and never encodes the calendar year", () => {
  assert.equal(GRADUATION_YEAR_STORAGE_MINIMUM, 2000);
  assert.equal(GRADUATION_YEAR_STORAGE_MAXIMUM, 2100);
  assert.match(
    executable,
    new RegExp(
      `check \\(graduation_year between ${GRADUATION_YEAR_STORAGE_MINIMUM} and ${GRADUATION_YEAR_STORAGE_MAXIMUM}\\)`,
    ),
  );
  assert.doesNotMatch(
    executable,
    /current_date|extract\s*\(|date_part|now\s*\(|statement_timestamp|clock_timestamp/i,
  );

  for (const year of [2000, 2022, 2023, 2024, 2035, 2040, 2100]) {
    assert.equal(isStorableGraduationYear(year), true, String(year));
  }
  for (const year of [1999, 2101, 2026.5, Number.NaN]) {
    assert.equal(isStorableGraduationYear(year), false, String(year));
  }

  // Every year a Student can select for decades stays inside the envelope.
  for (const referenceYear of [2026, 2040, 2060, 2090]) {
    for (const year of getGraduationYearOptions(referenceYear)) {
      assert.equal(isStorableGraduationYear(year), true, String(year));
    }
  }
});

test("the graduation year work is separate from the multi-institution migration", () => {
  assert.doesNotMatch(multiInstitutionMigration, /graduation_year/);
  assert.doesNotMatch(multiInstitutionMigration, /student_profiles\b/);
});
