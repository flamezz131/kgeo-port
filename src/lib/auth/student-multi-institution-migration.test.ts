import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const rawMigration = read(
  "../../../supabase/migrations/202610080002_student_multi_institution_auth.sql",
);
const previousTriggerMigration = read(
  "../../../supabase/migrations/202608200001_counselor_registration_insert_timing_fix.sql",
).replace(/\r\n/g, "\n");
const previousConstraintMigration = read(
  "../../../supabase/migrations/202608180002_counselor_registration_approval.sql",
).replace(/\r\n/g, "\n");
const initialSchemaMigration = read(
  "../../../supabase/migrations/202607170001_initial_kgeo_schema.sql",
).replace(/\r\n/g, "\n");

const executable = rawMigration.replace(/--.*$/gm, "");

const GENERIC_EMAIL_PATTERN =
  "^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$";
const STUDENT_DOMAIN_PATTERN =
  "^[^@[:space:]]+@(kct[.]ac[.]in|kclas[.]ac[.]in|kctbs[.]ac[.]in)$";
const KCT_ONLY_PATTERN = "^[^@[:space:]]+@kct[.]ac[.]in$";

// Translates the POSIX bracket forms used by the migration into their
// JavaScript equivalents.
function posixToRegExp(pattern: string): RegExp {
  return new RegExp(
    pattern
      .replaceAll("[:space:]", "\\s")
      .replaceAll("[[]", "\\[")
      .replaceAll("[]]", "\\]"),
  );
}

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

function normalizeSql(source: string): string {
  return source
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .replace(/\( /g, "(")
    .replace(/ \)/g, ")")
    .trim();
}

const newFunction = extractBetween(
  rawMigration,
  "create or replace function public.handle_new_user()",
  "\n$function$;",
);
const previousFunction = extractBetween(
  previousTriggerMigration,
  "create or replace function public.handle_new_user()",
  "\n$function$;",
);
const newConstraint = extractBetween(
  executable,
  "alter table public.profiles",
  "\n    );",
);
const previousConstraint = extractBetween(
  previousConstraintMigration.replace(/--.*$/gm, ""),
  "alter table public.profiles",
  "\n    );",
);
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

// Mirrors the replacement CHECK constraint, using the pattern literals taken
// from the migration itself.
function profileEmailAllowed(role: string, email: string): boolean {
  const generic = posixToRegExp(GENERIC_EMAIL_PATTERN);
  if (email !== email.trim().toLowerCase()) return false;
  if (email.length < 3 || email.length > 254) return false;
  const localPart = email.split("@")[0];
  if (localPart.length < 1 || localPart.length > 64) return false;
  if (!generic.test(email)) return false;
  if (role === "counselor" || role === "director") return true;
  if (role === "student") return posixToRegExp(STUDENT_DOMAIN_PATTERN).test(email);
  return posixToRegExp(KCT_ONLY_PATTERN).test(email);
}

test("002 is LF-only and schema-qualifies no SQL special form", () => {
  assert.equal(rawMigration.includes("\r"), false);
  assert.equal(countOccurrences(rawMigration, "pg_catalog.coalesce"), 0);
  assert.doesNotMatch(
    rawMigration,
    /pg_catalog\.(?:coalesce|nullif|greatest|least|case|cast|exists|array)\s*\(/i,
  );
  assert.ok(countOccurrences(executable, "coalesce(") >= 6);
});

test("002 keeps one fail-closed transaction in the reviewed order", () => {
  assert.equal(executable.match(/^begin;$/gm)?.length, 1);
  assert.equal(executable.match(/^commit;$/gm)?.length, 1);
  assert.match(executable.trimEnd(), /commit;$/);
  assert.doesNotMatch(executable, /^rollback;$/m);

  const order = [
    "begin;",
    "do $preflight$",
    "create or replace function public.handle_new_user()",
    "alter function public.handle_new_user()",
    "alter table public.profiles",
    "do $verification$",
    "commit;",
  ].map((fragment) => executable.indexOf(fragment));
  assert.ok(order.every((position) => position >= 0));
  assert.deepEqual(
    order,
    [...order].sort((left, right) => left - right),
  );

  assert.equal(
    countOccurrences(executable, "create or replace function"),
    1,
  );
  assert.equal(countOccurrences(executable, "alter table"), 1);
  assert.doesNotMatch(executable, /\bnot\s+valid\b(?!ated)/i);
  assert.ok(countOccurrences(executable, "errcode = '55000'") >= 20);
});

test("002 changes only the reviewed objects and rewrites no rows", () => {
  const outsideFunction = executable.replace(
    newFunction.replace(/--.*$/gm, ""),
    "",
  );
  assert.doesNotMatch(
    outsideFunction,
    /\b(?:insert\s+into|update\s+public|delete\s+from|truncate|drop\s+table|drop\s+function|create\s+table|grant|revoke)\b/i,
  );
  assert.equal(
    countOccurrences(outsideFunction, "drop constraint"),
    1,
  );
  assert.equal(countOccurrences(outsideFunction, "add constraint"), 1);
  assert.match(
    outsideFunction,
    /drop constraint profiles_college_email_check,\s*add constraint profiles_college_email_check\s*check \(/,
  );
  assert.doesNotMatch(
    outsideFunction,
    /(?:drop|add|alter|rename) constraint profiles_full_name_check/,
  );
  assert.doesNotMatch(outsideFunction, /alter type|add value|user_role as enum/);
});

test("handle_new_user differs from the previous definition only in the Student domain rule", () => {
  const expected = normalizeSql(previousFunction)
    .replace(
      `if v_normalized_email !~ '${KCT_ONLY_PATTERN}' then`,
      // A replacer function avoids "$'" being read as a replacement pattern.
      () => `if v_normalized_email !~ '${STUDENT_DOMAIN_PATTERN}' then`,
    )
    .replace(
      "'K-GEO requires a valid @kct.ac.in email address'",
      () => "'K-GEO requires a valid KCT, KCLAS, or KCTBS college email address'",
    );

  assert.notEqual(expected, normalizeSql(previousFunction));
  assert.equal(normalizeSql(newFunction), expected);
});

test("public registration still hard-codes the Student role and trusts no client role", () => {
  assert.equal(
    countOccurrences(newFunction, "'student'::public.user_role"),
    1,
  );
  assert.match(
    newFunction,
    /values \(\s*new\.id,\s*v_normalized_email,\s*'student'::public\.user_role,\s*v_normalized_full_name,\s*true\s*\);/,
  );
  assert.doesNotMatch(
    newFunction,
    /raw_user_meta_data\s*->>?\s*'(?:role|institution|is_active|is_admin)'/,
  );
  assert.doesNotMatch(newFunction, /raw_app_meta_data/);
  assert.doesNotMatch(newFunction, /institution/i);
  assert.equal(countOccurrences(newFunction, "'admin'::public.user_role"), 0);
  assert.equal(
    countOccurrences(newFunction, `'${STUDENT_DOMAIN_PATTERN}'`),
    1,
  );
});

test("staff and Counselor provisioning branches are preserved and not broadened", () => {
  for (const fragment of [
    "kgeo_staff_provisioning_token",
    "private.kgeo_counselor_registration_requests",
    "private.kgeo_staff_provisioning_requests",
    "'pending'::public.counselor_approval_status",
    "v_approved_role not in (",
    "K-GEO staff provisioning is invalid",
    "K-GEO counselor registration is invalid",
  ]) {
    assert.ok(newFunction.includes(fragment), fragment);
  }

  // The staff Counselor provisioning rule remains exact-KCT.
  assert.match(
    normalizeSql(newFunction),
    /v_approved_role = 'counselor'::public\.user_role and v_normalized_email !~ '\^\[\^@\[:space:\]\]\+@kct\[\.\]ac\[\.\]in\$'/,
  );
  assert.equal(countOccurrences(newFunction, `'${KCT_ONLY_PATTERN}'`), 1);
  assert.equal(countOccurrences(newFunction, "kclas"), 2);
  assert.equal(countOccurrences(newFunction, "kctbs"), 2);
});

test("the replacement CHECK keeps the generic rules and makes Student explicit", () => {
  const normalizedNew = normalizeSql(newConstraint);
  const normalizedPrevious = normalizeSql(previousConstraint);
  const genericEnd = "and (role in (";

  // Normalization, lengths and generic syntax are identical to the previous
  // repository definition up to the role branch.
  assert.equal(
    normalizedNew.slice(0, normalizedNew.indexOf(genericEnd)),
    normalizedPrevious.slice(0, normalizedPrevious.indexOf(genericEnd)),
  );
  assert.ok(normalizedNew.includes(`'${GENERIC_EMAIL_PATTERN}'`));

  assert.equal(
    normalizedNew.slice(normalizedNew.indexOf(genericEnd)),
    [
      "and (role in ('counselor'::public.user_role, 'director'::public.user_role)",
      `or (role = 'student'::public.user_role and college_email ~ '${STUDENT_DOMAIN_PATTERN}')`,
      "or (role not in ('student'::public.user_role, 'counselor'::public.user_role, 'director'::public.user_role)",
      `and college_email ~ '${KCT_ONLY_PATTERN}')));`,
    ].join(" "),
  );

  // The previous definition applied KCT-only to every non-staff role.
  assert.ok(
    normalizedPrevious.includes(
      `or (role not in ('counselor'::public.user_role, 'director'::public.user_role) and college_email ~ '${KCT_ONLY_PATTERN}')`,
    ),
  );
  assert.match(
    executable,
    /comment on constraint profiles_college_email_check on public\.profiles is/,
  );
});

test("every user_role value keeps or gains exactly the intended domain rule", () => {
  const enumValues =
    initialSchemaMigration
      .match(/create type public\.user_role as enum \(([^)]*)\)/)?.[1]
      .match(/'([a-z_]+)'/g)
      ?.map((value) => value.slice(1, -1)) ?? [];
  assert.deepEqual(enumValues, ["student", "counselor", "admin", "director"]);

  const approved = ["abc@kct.ac.in", "abc@kclas.ac.in", "abc@kctbs.ac.in"];
  const rejectedForStudents = [
    "abc@gmail.com",
    "abc@student.kct.ac.in",
    "abc@student.kclas.ac.in",
    "abc@student.kctbs.ac.in",
    "abc@kct.ac.in.fake.com",
    "abc@kclas.ac.in.fake.com",
    "abc@kctbs.ac.in.fake.com",
    "abc@fakekct.ac.in",
    "abc@counselor-auth.kgeo.internal",
    "abc@kct-ac.in",
    "a@b@kct.ac.in",
    " abc@kct.ac.in",
    "ABC@kct.ac.in",
  ];

  for (const email of approved) {
    assert.equal(profileEmailAllowed("student", email), true, email);
  }
  for (const email of rejectedForStudents) {
    assert.equal(profileEmailAllowed("student", email), false, email);
  }

  // Every other non-staff role keeps the old exact-KCT rule.
  for (const role of enumValues.filter(
    (value) => !["student", "counselor", "director"].includes(value),
  )) {
    assert.equal(profileEmailAllowed(role, "abc@kct.ac.in"), true, role);
    for (const email of [
      "abc@kclas.ac.in",
      "abc@kctbs.ac.in",
      ...rejectedForStudents,
    ]) {
      assert.equal(profileEmailAllowed(role, email), false, `${role} ${email}`);
    }
  }

  // Counselor and Director keep the generic valid-email rule.
  for (const role of ["counselor", "director"]) {
    for (const email of [
      "durga@counselor-auth.kgeo.internal",
      "director@kclas.ac.in",
      "abc@kct.ac.in",
      "abc@example.org",
    ]) {
      assert.equal(profileEmailAllowed(role, email), true, `${role} ${email}`);
    }
    assert.equal(profileEmailAllowed(role, "not-an-email"), false);
  }
});

test("the trigger and the constraint share one exact Student domain pattern", () => {
  assert.equal(
    countOccurrences(newFunction, `'${STUDENT_DOMAIN_PATTERN}'`),
    1,
  );
  assert.equal(
    countOccurrences(newConstraint, `'${STUDENT_DOMAIN_PATTERN}'`),
    1,
  );
  assert.equal(
    countOccurrences(verificationBlock, `'${STUDENT_DOMAIN_PATTERN}'`),
    1,
  );

  const student = posixToRegExp(STUDENT_DOMAIN_PATTERN);
  for (const email of ["abc@kct.ac.in", "abc@kclas.ac.in", "abc@kctbs.ac.in"]) {
    assert.equal(student.test(email), true, email);
  }
  for (const email of [
    "abc@gmail.com",
    "abc@student.kct.ac.in",
    "abc@student.kclas.ac.in",
    "abc@student.kctbs.ac.in",
    "abc@kct.ac.in.fake.com",
    "abc@kclas.ac.in.fake.com",
    "abc@kctbs.ac.in.fake.com",
    "abc@fakekct.ac.in",
    "abc@counselor-auth.kgeo.internal",
  ]) {
    assert.equal(student.test(email), false, email);
    assert.ok(verificationBlock.includes(`'${email}'`), email);
  }
});

test("the preflight recognizes the live pre-migration constraint and refuses a changed one", () => {
  // Single-line catalog rendering of the live constraint, as reported by
  // pg_get_constraintdef before this migration.
  const liveDefinition =
    "CHECK (((college_email = lower(btrim(college_email))) AND (char_length(college_email) >= 3) AND (char_length(college_email) <= 254) AND (char_length(split_part(college_email, '@'::text, 1)) >= 1) AND (char_length(split_part(college_email, '@'::text, 1)) <= 64) AND (college_email ~ '" +
    GENERIC_EMAIL_PATTERN +
    "'::text) AND ((role = ANY (ARRAY['counselor'::user_role, 'director'::user_role])) OR ((role <> ALL (ARRAY['counselor'::user_role, 'director'::user_role])) AND (college_email ~ '" +
    KCT_ONLY_PATTERN +
    "'::text)))))";

  const required = [
    "college_email = lower(btrim(college_email))",
    `'${GENERIC_EMAIL_PATTERN}'`,
    `'${KCT_ONLY_PATTERN}'`,
    "role = ANY",
    "role <> ALL",
    "'counselor'::",
    "'director'::",
  ];
  const forbidden = ["'student'::", "'admin'::", "kclas", "kctbs"];

  for (const fragment of required) {
    assert.ok(liveDefinition.includes(fragment), fragment);
  }
  for (const fragment of forbidden) {
    assert.equal(liveDefinition.includes(fragment), false, fragment);
  }

  // The preflight asserts exactly those fragments against the catalog text.
  for (const fragment of [
    "'college_email = lower(btrim(college_email))'",
    "pg_catalog.quote_literal(v_generic_email_pattern)",
    "pg_catalog.quote_literal(v_kct_only_pattern)",
    "'role = ANY'",
    "'role <> ALL'",
    "'''counselor''::'",
    "'''director''::'",
    "'''student''::'",
    "'''admin''::'",
    "'kclas'",
    "'kctbs'",
    "constraint_record.conname = 'profiles_college_email_check'",
    "constraint_record.convalidated is true",
    "pg_catalog.pg_get_constraintdef(constraint_record.oid)",
  ]) {
    assert.ok(preflightBlock.includes(fragment), fragment);
  }
  assert.doesNotMatch(preflightBlock, /'[^']*kct\.ac\.in[^']*'\s*\)\s*=\s*0\s+or/);
  assert.match(
    preflightBlock,
    /v_kct_only_pattern constant text :=\s*'\^\[\^@\[:space:\]\]\+@kct\[\.\]ac\[\.\]in\$';/,
  );
  assert.match(
    preflightBlock,
    /K-GEO requires a valid @kct\.ac\.in email address/,
  );
});

test("the verification role patterns match the expected catalog rendering in either schema form", () => {
  const rolePatterns = Array.from(
    verificationBlock.matchAll(/!~\s*'(role (?:''|[^'])*)'/g),
    (match) => match[1].replaceAll("''", "'"),
  );
  assert.equal(rolePatterns.length, 3);

  for (const typeName of ["user_role", "public.user_role"]) {
    const rendered =
      `CHECK (((college_email = lower(btrim(college_email))) AND ((role = ANY (ARRAY['counselor'::${typeName}, 'director'::${typeName}])) ` +
      `OR ((role = 'student'::${typeName}) AND (college_email ~ '${STUDENT_DOMAIN_PATTERN}'::text)) ` +
      `OR ((role <> ALL (ARRAY['student'::${typeName}, 'counselor'::${typeName}, 'director'::${typeName}])) AND (college_email ~ '${KCT_ONLY_PATTERN}'::text)))))`;

    for (const pattern of rolePatterns) {
      assert.match(rendered, posixToRegExp(pattern), `${typeName} ${pattern}`);
    }

    const positions = [
      rendered.indexOf("role = ANY"),
      rendered.indexOf("role = 'student'::"),
      rendered.indexOf(`'${STUDENT_DOMAIN_PATTERN}'`),
      rendered.indexOf("role <> ALL"),
      rendered.indexOf(`'${KCT_ONLY_PATTERN}'`),
    ];
    assert.ok(positions.every((position) => position > 0));
    assert.deepEqual(
      positions,
      [...positions].sort((left, right) => left - right),
    );
  }

  // The old two-role exclusion list must not satisfy the new other-role rule.
  const oldOtherRole =
    "role <> ALL (ARRAY['counselor'::user_role, 'director'::user_role])";
  assert.doesNotMatch(oldOtherRole, posixToRegExp(rolePatterns[2]));
});

test("the verification block proves both objects and the untouched full-name constraint", () => {
  for (const fragment of [
    "procedure.proname = 'handle_new_user'",
    "procedure.prorettype = 'trigger'::pg_catalog.regtype",
    "language.lanname = 'plpgsql'",
    "procedure.prosecdef is true",
    "owner_role.rolname = 'postgres'",
    "'search_path='",
    "'search_path=\"\"'",
    "namespace.nspname = 'auth'",
    "relation.relname = 'users'",
    "'K-GEO requires a valid @kct.ac.in email address'",
    "'''student''::public.user_role'",
    "'private.kgeo_staff_provisioning_requests'",
    "'private.kgeo_counselor_registration_requests'",
    "constraint_record.conname = 'profiles_college_email_check'",
    "constraint_record.convalidated is true",
    "'char_length(college_email) >= 3'",
    "'char_length(college_email) <= 254'",
    "constraint_record.conname = 'profiles_full_name_check'",
    "'kgeo_migration.profiles_full_name_check'",
    "'kgeo_migration.profiles_check_count'",
    "v_student_role_position <= v_staff_position",
    "v_student_pattern_position <= v_student_role_position",
    "v_other_role_position <= v_student_pattern_position",
    "v_kct_only_position <= v_other_role_position",
  ]) {
    assert.ok(verificationBlock.includes(fragment), fragment);
  }

  // The preflight records the full-name constraint; verification compares it.
  assert.equal(
    countOccurrences(preflightBlock, "pg_catalog.set_config("),
    2,
  );
  assert.equal(
    countOccurrences(verificationBlock, "pg_catalog.current_setting("),
    2,
  );
  assert.doesNotMatch(verificationBlock, /pg_catalog\.set_config\(/);

  // Verification never touches table rows.
  assert.doesNotMatch(
    verificationBlock,
    /\bfrom public\.|\bjoin public\.|\bfrom auth\.users\b|insert into|update |delete from/i,
  );
});
