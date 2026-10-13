import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationName =
  "202608020001_counselor_application_workspace_read_foundation.sql";
const migrationUrl = new URL(
  `../../../supabase/migrations/${migrationName}`,
  import.meta.url,
);
const migration = readFileSync(migrationUrl, "utf8");
const executableMigration = migration.replace(/--.*$/gm, "");
const databaseTypes = readFileSync(
  new URL("../../types/database.ts", import.meta.url),
  "utf8",
);
const domainTypes = readFileSync(
  new URL("../../types/index.ts", import.meta.url),
  "utf8",
);
const packageJson = readFileSync(new URL("../../../package.json", import.meta.url), "utf8");
const readiness = readFileSync(
  new URL("../../../supabase/verification/pre_phase_c2_readiness.sql", import.meta.url),
  "utf8",
);
const documentation = readFileSync(
  new URL("../../../docs/database.md", import.meta.url),
  "utf8",
);
const profileFoundation = readFileSync(
  new URL(
    "../../../supabase/migrations/202607190002_student_profile_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);

const predecessorHashes = {
  "202607170001_initial_kgeo_schema.sql":
    "5c3c7a5b4628db997f91d577b3f1b51400cf4693213e2daeaf7828c1f18024bb",
  "202607180001_consultation_requests_v1.sql":
    "f5beca24476a0c5d9f48cd3fbc222b9c278ebf9781291faa1cff8b250951e02d",
  "202607190001_single_counselor_slot_booking.sql":
    "5e814237b6230c04f517f2083393adc5818c3bd040fd3d7a26d1df8b541cc075",
  "202607190002_student_profile_foundation.sql":
    "370cf60acdef96ad57b5e1c384a1c4b29f7ee2f5cb0e822f77572c1db33c3219",
  "202607200001_require_core_profile_for_preferences.sql":
    "aec0c0207b54cd54387af6ce1d075de6a4830d6f8bc7dae9e8cd29e9b0fe3ab1",
  "202607200002_counselor_student_directory_foundation.sql":
    "38bdda3750f3c5398c1ae5144b93b40059327ae553bfffc9967b81bb385590ad",
  "202607230001_canonical_names_and_consultation_outcomes.sql":
    "500e575889108dad91bb6a08a6d01560f607707fac9656c3b5438ae476964b69",
  "202607230002_atomic_student_identity_save.sql":
    "0e8cf2228c80d3a58bdec3cdc520f65b0066aecccc14c51671e3a8960a171b64",
  "202607230003_counselor_consultation_reference_rpc.sql":
    "1cfd1e5ff871f76cacd290b3427d3652b537f18690056faa62e896422203a397",
  "202607230004_consultation_reference_column_hardening.sql":
    "11c7d770301f439ada3d4b8082c8bab48ebd4941cd331eeee9e1b7fdbfefbb51",
  "202607250001_counselor_notes_and_follow_ups_foundation.sql":
    "946782e65887ceacfe87bc028aed0f24f36519ab311390dd60e87dbb26b3d37f",
  "202607250002_counselor_follow_up_workload.sql":
    "8b03ad6970913d2d6e216e4985dda1f5ac5aa87f22a94d7ac670cd42c43c990f",
  "202607250003_official_counseling_progression.sql":
    "7f59a16d970db1e79b6dd9789f35e71c07b9f0a90d2802741cb76fd6141a523c",
  "202607260001_progression_evidence_foundation.sql":
    "c2161759110a1531ac3bb48189648c73123a89111f3d0aee29f78fd4075b9727",
  "202607260002_progression_correction_foundation.sql":
    "90d9a6e6f1b7fecb5a8a2e667c61eeb62b8546b33db402c3e1faf21a09e207fb",
  "202607270001_university_application_foundation.sql":
    "09d8c32734b159535387a4f6e21fda54d4b59ba4bbb60de4f93b7179794cb35b",
  "202607280001_student_university_application_read_foundation.sql":
    "3209de9d8bae1a8a2762fc9e539f3193cb9db2e6bd520cf60b420d85ea0d8875",
  "202608010001_university_application_documents_foundation.sql":
    "9cff3f5849fffa9d610b3d7a8bbab2ac0f04dc3e7729ca95bc46d0c0a6d548a1",
} as const;

function hash(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

test("E1.4.1 adds exactly one migration and preserves every predecessor", () => {
  const migrationDirectory = new URL("../../../supabase/migrations/", import.meta.url);
  const names = readdirSync(migrationDirectory).filter(
    (name) => name.endsWith(".sql") && name <= migrationName,
  );
  assert.deepEqual(names.sort(), [...Object.keys(predecessorHashes), migrationName].sort());
  for (const [name, expectedHash] of Object.entries(predecessorHashes)) {
    assert.equal(
      hash(readFileSync(new URL(name, migrationDirectory))),
      expectedHash,
      name,
    );
  }
  assert.equal(
    hash(readFileSync(migrationUrl)),
    "d08643961a2bba54946cfd595fbc86f02b99b56696e705cf5b502fd5f467865d",
  );
});

test("migration is one additive transaction containing only two read RPCs", () => {
  assert.match(executableMigration, /^\s*begin;/i);
  assert.match(executableMigration, /commit;\s*$/i);
  assert.equal(executableMigration.match(/\bcreate function\b/gi)?.length, 2);
  assert.equal(
    executableMigration.match(/\bcreate (?:table|type|index|trigger|policy|view)\b/gi)
      ?.length ?? 0,
    0,
  );
  assert.doesNotMatch(
    executableMigration,
    /\balter table\b|\binsert into\b|\bupdate\s+public\.|\bdelete from\b|\bmerge into\b/i,
  );
});

test("list RPC has the exact parameter and return contract", () => {
  assert.match(
    migration,
    /list_counselor_university_application_workspace\(\s*p_search text default null,\s*p_status text default null,\s*p_country_code text default null,\s*p_degree_level text default null,\s*p_intake_term text default null,\s*p_intake_year integer default null,\s*p_primary_filter text default 'all',\s*p_archive_filter text default 'active',\s*p_deadline_filter text default 'all',\s*p_sort text default 'last_changed_desc',\s*p_page integer default 1,\s*p_page_size integer default 20\s*\)/,
  );
  const returnContract = migration.match(
    /create function public\.list_counselor_university_application_workspace[\s\S]*?returns table \(([\s\S]*?)\)\s*language plpgsql/,
  )?.[1] ?? "";
  const names = [...returnContract.matchAll(/^\s{2}([a-z_]+)\s+/gm)].map(
    (match) => match[1],
  );
  assert.deepEqual(names, [
    "application_id",
    "student_id",
    "student_full_name",
    "college_email",
    "roll_number",
    "university_name",
    "programme_name",
    "country_code",
    "degree_level",
    "intake_term",
    "intake_year",
    "current_status",
    "application_reference",
    "submission_deadline",
    "submitted_at",
    "is_primary",
    "is_archived",
    "last_changed_at",
    "available_document_count",
    "total_count",
  ]);
});

test("both RPCs independently enforce the counselor-only trusted boundary", () => {
  for (const functionName of [
    "list_counselor_university_application_workspace",
    "get_counselor_university_application_workspace_metrics",
  ]) {
    const definition = migration.match(
      new RegExp(`create function public\\.${functionName}[\\s\\S]*?\\$function\\$;`),
    )?.[0] ?? "";
    assert.match(definition, /caller_id := \(select auth\.uid\(\)\)/);
    assert.match(definition, /has_active_verified_kgeo_role/);
    assert.match(definition, /'counselor'::public\.user_role/);
    assert.match(definition, /stable\s+security definer\s+set search_path = ''/);
    assert.doesNotMatch(definition, /p_counselor_id|p_student_id|raw_user_meta_data/);
  }
  assert.equal(migration.match(/owner to postgres/g)?.length, 2);
  assert.equal(migration.match(/from public, anon, authenticated/g)?.length, 2);
  assert.equal(migration.match(/to authenticated;/g)?.length, 2);

  const roleHelper = profileFoundation.match(
    /create function public\.has_active_verified_kgeo_role[\s\S]*?\$function\$;/,
  )?.[0] ?? "";
  assert.match(roleHelper, /profile\.id = \(select auth\.uid\(\)\)/);
  assert.match(roleHelper, /profile\.role = p_role/);
  assert.match(roleHelper, /profile\.is_active is true/);
  assert.match(roleHelper, /auth_user\.email_confirmed_at is not null/);
});

test("search is static literal substring matching over approved fields only", () => {
  const listDefinition = migration.match(
    /create function public\.list_counselor_university_application_workspace[\s\S]*?\$function\$;/,
  )?.[0] ?? "";
  const searchPredicate = listDefinition.match(
    /filtered_workspace as \([\s\S]*?\),\s*filtered_total as/,
  )?.[0] ?? "";

  assert.match(migration, /pg_catalog\.regexp_replace\([\s\S]*?' \+'/);
  assert.match(migration, /pg_catalog\.char_length\(normalized_search\) > 100/);
  assert.match(migration, /p_search ~ '\[\[:cntrl:\]\]'/);
  assert.match(migration, /pg_catalog\.generate_series\(128, 159\)/);
  assert.match(migration, /160, 173, 847, 1564, 5760, 6158/);
  assert.match(migration, /8232, 8233, 8234, 8235, 8236, 8237, 8238, 8239/);
  assert.match(migration, /8303, 12288, 65279/);
  assert.equal(searchPredicate.match(/pg_catalog\.strpos\(/g)?.length, 6);
  assert.equal(searchPredicate.match(/pg_catalog\.translate\(/g)?.length, 6);
  for (const approved of [
    "workspace_student_full_name",
    "workspace_college_email",
    "workspace_roll_number",
    "workspace_university_name",
    "workspace_programme_name",
    "workspace_application_reference",
  ]) {
    assert.match(migration, new RegExp(approved));
  }
  assert.doesNotMatch(
    listDefinition,
    /\bexecute\b|\bformat\s*\(|personal_email|mobile_number|note_text|original_file_name|storage_path|portal_url|raw_user_meta_data/i,
  );
});

test("filters sorting and pagination are exact static allowlists", () => {
  for (const value of [
    "primary",
    "non_primary",
    "active",
    "archived",
    "overdue",
    "due_30_days",
    "no_deadline",
    "last_changed_desc",
    "deadline_asc",
    "deadline_desc",
    "student_name_asc",
    "university_name_asc",
    "intake_year_desc",
  ]) {
    assert.match(migration, new RegExp(`'${value}'`));
  }
  assert.match(migration, /p_intake_year not between 2020 and 2100/);
  assert.match(migration, /p_page not between 1 and 100000/);
  assert.match(migration, /p_page_size not between 1 and 25/);
  assert.match(migration, /page_offset := \(p_page::bigint - 1\) \* p_page_size::bigint/);
  assert.match(migration, /workspace\.workspace_application_id end desc/);
  assert.match(migration, /workspace\.workspace_application_id end asc/);
  assert.equal(migration.match(/collate pg_catalog\."C"/g)?.length, 5);
  assert.doesNotMatch(migration, /p_offset|p_order|p_column|dynamic sql/i);
});

test("list count sentinel and available-document aggregation are bounded", () => {
  assert.match(
    migration,
    /document\.status =\s*'available'::public\.university_application_document_status/,
  );
  assert.doesNotMatch(
    migration.match(/with available_document_counts[\s\S]*?workspace_base/)?.[0] ?? "",
    /pending|removed|document_title|original_file_name|storage_path/i,
  );
  assert.match(migration, /left join page_rows as page_row\s+on true/);
  assert.match(migration, /filtered_total\.filtered_count/);
  assert.match(migration, /limit p_page_size\s+offset page_offset/);
});

test("metrics are aggregate-only active status and Asia Kolkata deadline counts", () => {
  const metrics = migration.match(
    /create function public\.get_counselor_university_application_workspace_metrics[\s\S]*?\$function\$;/,
  )?.[0] ?? "";
  assert.match(metrics, /at time zone 'Asia\/Kolkata'/);
  assert.match(metrics, /submission_deadline < business_date/);
  assert.match(
    metrics,
    /submission_deadline between\s*business_date and business_date \+ 30/,
  );
  assert.equal(metrics.match(/current_status =/g)?.length, 10);
  assert.match(
    metrics,
    /count\(distinct application\.student_id\) filter \(\s*where application\.is_archived is false\s*\)/,
  );
  assert.doesNotMatch(
    metrics,
    /application_id|student_full_name|college_email|university_name|programme_name|application_reference/,
  );
});

test("database types expose exact RPC parity and E1.4.2 owns a separate UI contract", () => {
  assert.match(databaseTypes, /list_counselor_university_application_workspace:/);
  assert.match(databaseTypes, /get_counselor_university_application_workspace_metrics:/);
  assert.match(domainTypes, /CounselorUniversityApplicationWorkspaceEntry/);
  assert.match(domainTypes, /CounselorUniversityApplicationWorkspaceMetrics/);
  assert.match(packageJson, /university-application-workspace\.test\.ts/);
  assert.match(packageJson, /university-application-workspace-ui-contract\.test\.ts/);
  assert.doesNotMatch(packageJson, /university-application-workspace-action/);
});

test("readiness and documentation contain the E1.4.1 read-only boundary", () => {
  assert.match(readiness, /Phase E1\.4\.1/);
  assert.match(readiness, /E1\.4\.1 workspace list RPC/);
  assert.match(readiness, /E1\.4\.1 workspace metrics RPC/);
  assert.match(documentation, /Phase E1\.4\.1/);
  assert.match(documentation, /On 2026-08-02, the E1\.4\.1 migration application/);
  assert.match(documentation, /kgeo-stable-after-e1-4-1/);
  assert.match(
    documentation,
    /approved as the verified staging read foundation for E1\.4\.2/,
  );
  assert.match(documentation, /does not constitute production rollout approval/i);
  assert.match(documentation, /Phase E1\.4\.2/);
  assert.match(documentation, /E1\.4\.2 does not modify SQL/i);
  assert.match(documentation, /students_with_applications[^.]*active/i);
  assert.match(documentation, /inactive student identities/i);
});

test("new executable SQL rejects invalid schema-qualified SQL special forms", () => {
  for (const specialForm of ["coalesce", "nullif", "greatest", "least"]) {
    assert.doesNotMatch(
      executableMigration,
      new RegExp(`pg_catalog\\.${specialForm}\\s*\\(`, "i"),
    );
  }
});
