import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationDirectory = new URL("../../../supabase/migrations/", import.meta.url);
const migrationPath = new URL(
  "../../../supabase/migrations/202607280001_student_university_application_read_foundation.sql",
  import.meta.url,
);
const authorizationHelperPath = new URL(
  "../../../supabase/migrations/202607190002_student_profile_foundation.sql",
  import.meta.url,
);
const readinessPath = new URL(
  "../../../supabase/verification/pre_phase_c2_readiness.sql",
  import.meta.url,
);
const databaseTypesPath = new URL("../../types/database.ts", import.meta.url);
const publicTypesPath = new URL("../../types/index.ts", import.meta.url);

const migration = readFileSync(migrationPath, "utf8");
const executableMigration = migration.replace(/--.*$/gm, "");
const authorizationHelperMigration = readFileSync(
  authorizationHelperPath,
  "utf8",
);
const readiness = readFileSync(readinessPath, "utf8");
const databaseTypes = readFileSync(databaseTypesPath, "utf8");
const publicTypes = readFileSync(publicTypesPath, "utf8");

const reviewedMigrationHashes = {
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
} as const;

function hashFile(path: URL): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

test("E1.3.1 remains byte-identical with reviewed later migrations", () => {
  const migrationNames = readdirSync(migrationDirectory)
    .filter(
      (name) =>
        name.endsWith(".sql") &&
        name <= "202608020001_counselor_application_workspace_read_foundation.sql",
    )
    .sort();

  assert.deepEqual(migrationNames, [
    ...Object.keys(reviewedMigrationHashes),
    "202607280001_student_university_application_read_foundation.sql",
    "202608010001_university_application_documents_foundation.sql",
    "202608020001_counselor_application_workspace_read_foundation.sql",
  ]);

  for (const [name, expectedHash] of Object.entries(reviewedMigrationHashes)) {
    assert.equal(hashFile(new URL(name, migrationDirectory)), expectedHash);
  }

  assert.equal(
    hashFile(migrationPath),
    "3209de9d8bae1a8a2762fc9e539f3193cb9db2e6bd520cf60b420d85ea0d8875",
  );
});

test("migration creates only the zero-argument student read RPC", () => {
  assert.equal(executableMigration.match(/\bcreate function\b/g)?.length, 1);
  assert.match(
    executableMigration,
    /create function public\.get_my_university_applications\(\)/,
  );
  assert.doesNotMatch(
    executableMigration,
    /\bcreate (?:table|type|view|materialized view|policy)\b/i,
  );
  assert.doesNotMatch(
    executableMigration,
    /\balter table public\.student_university_application/i,
  );
  assert.doesNotMatch(
    executableMigration,
    /create_student_university_application|update_student_university_application_details|record_student_university_application_status|set_primary_student_university_application|archive_student_university_application/,
  );
});

test("RPC has the exact relational student-safe return contract", () => {
  const returnContract =
    executableMigration.match(/returns table \(([\s\S]*?)\)\s*language/)?.[1] ??
    "";
  const expectedColumns = [
    "application_id uuid",
    "university_name text",
    "programme_name text",
    "country_code text",
    "degree_level public.university_application_degree_level",
    "intake_term public.university_application_intake_term",
    "intake_year integer",
    "current_status public.university_application_status",
    "submission_deadline date",
    "submitted_at timestamptz",
    "is_primary boolean",
    "last_changed_at timestamptz",
  ];

  assert.deepEqual(
    returnContract
      .split(",")
      .map((column) => column.trim().replace(/\s+/g, " "))
      .filter(Boolean),
    expectedColumns,
  );
  assert.doesNotMatch(
    returnContract,
    /student_id|application_reference|portal_url|is_archived|archive_reason|archived_at|archived_by|created_by|last_changed_by|created_at|updated_at|version_number|email|reason/,
  );
});

test("RPC is trusted, caller-bound, and role-authorized", () => {
  const functionBody =
    executableMigration.match(/as \$function\$([\s\S]*?)\$function\$;/)?.[1] ??
    "";
  const authorizationHelper =
    authorizationHelperMigration.match(
      /create function public\.has_active_verified_kgeo_role\([\s\S]*?\$function\$;/,
    )?.[0] ?? "";

  assert.match(executableMigration, /\blanguage plpgsql\b/);
  assert.match(executableMigration, /\bstable\b/);
  assert.match(executableMigration, /\bsecurity definer\b/);
  assert.match(executableMigration, /\bset search_path = ''\s/);
  assert.match(executableMigration, /\balter function public\.get_my_university_applications\(\)\s+owner to postgres\b/);
  assert.match(executableMigration, /caller_id := \(select auth\.uid\(\)\)/);
  assert.match(executableMigration, /caller_id is null/);
  assert.match(
    executableMigration,
    /public\.has_active_verified_kgeo_role\(\s*'student'::public\.user_role\s*\) is distinct from true/,
  );
  assert.equal(
    executableMigration.match(/application\.student_id = caller_id/g)?.length,
    2,
  );
  assert.doesNotMatch(executableMigration, /\bp_student_id\b|\bp_application_id\b/);
  assert.doesNotMatch(
    functionBody,
    /'counselor'::public\.user_role|'admin'::public\.user_role|'director'::public\.user_role/,
  );
  assert.match(authorizationHelper, /where profile\.id = \(select auth\.uid\(\)\)/);
  assert.match(authorizationHelper, /profile\.role = p_role/);
  assert.match(authorizationHelper, /profile\.is_active is true/);
  assert.match(authorizationHelper, /auth_user\.email_confirmed_at is not null/);
});

test("RPC returns every own nonarchived status with deterministic bounded ordering", () => {
  const returnQuery =
    executableMigration.match(/return query([\s\S]*?)limit 100;/)?.[0] ?? "";

  assert.equal(
    executableMigration.match(/application\.is_archived is false/g)?.length,
    2,
  );
  assert.doesNotMatch(
    executableMigration,
    /application\.current_status\s*(?:=|in|<>|!=)/,
  );
  assert.match(executableMigration, /\blimit 101\b/);
  assert.match(executableMigration, /bounded_application_count > 100/);
  assert.doesNotMatch(executableMigration, /bounded_application_count >= 100/);
  assert.match(executableMigration, /\blimit 100\b/);
  assert.equal(
    executableMigration.match(
      /application\.is_primary desc nulls last,\s*application\.last_changed_at desc nulls last,\s*application\.id desc/g,
    )?.length,
    2,
  );
  assert.match(
    returnQuery,
    /order by\s*application\.is_primary desc nulls last,\s*application\.last_changed_at desc nulls last,\s*application\.id desc\s*limit 100;/,
  );
  assert.match(
    executableMigration,
    /message = 'University applications are temporarily unavailable\.'/,
  );
});

test("STABLE gives both bounded reads one calling-query snapshot", () => {
  const functionBody =
    executableMigration.match(/as \$function\$([\s\S]*?)\$function\$;/)?.[1] ??
    "";

  assert.match(executableMigration, /\blanguage plpgsql\s+stable\b/);
  assert.doesNotMatch(executableMigration, /\bvolatile\b|\bimmutable\b/);
  assert.equal(
    functionBody.match(/from public\.student_university_applications/g)?.length,
    2,
  );
  assert.match(
    functionBody,
    /limit 101[\s\S]*?bounded_application_count > 100[\s\S]*?return query[\s\S]*?limit 100;/,
  );
});

test("RPC has authenticated-only execution and no direct table access", () => {
  assert.match(
    executableMigration,
    /revoke all on function public\.get_my_university_applications\(\)\s+from public, anon, authenticated;/,
  );
  assert.match(
    executableMigration,
    /grant execute on function public\.get_my_university_applications\(\)\s+to authenticated;/,
  );
  assert.doesNotMatch(executableMigration, /\bgrant select\b/i);
  assert.doesNotMatch(executableMigration, /\bcreate policy\b/i);
});

test("RPC has no event, mutation, progression, service-role, or dynamic-SQL path", () => {
  assert.doesNotMatch(
    executableMigration,
    /student_university_application_events|student_counseling_progression|record_student_counseling_progression|service[_-]role|auth\.admin|execute\s+format/i,
  );
  assert.doesNotMatch(
    executableMigration,
    /\b(?:insert into|update|delete from|truncate|merge into)\s+public\.student_university_applications\b/i,
  );
  assert.doesNotMatch(
    executableMigration,
    /pg_advisory|create\s+temp|nextval\s*\(|setval\s*\(/i,
  );
});

test("TypeScript contracts exactly mirror the safe relational result", () => {
  const summaryType =
    publicTypes.match(
      /export type StudentUniversityApplicationSummary = \{([\s\S]*?)\n\};/,
    )?.[1] ?? "";
  const databaseContract =
    databaseTypes.match(
      /get_my_university_applications: \{([\s\S]*?)\n      \};/,
    )?.[1] ?? "";

  for (const field of [
    "applicationId",
    "universityName",
    "programmeName",
    "countryCode",
    "degreeLevel",
    "intakeTerm",
    "intakeYear",
    "currentStatus",
    "submissionDeadline",
    "submittedAt",
    "isPrimary",
    "lastChangedAt",
  ]) {
    assert.match(summaryType, new RegExp(`\\b${field}\\b`));
  }
  assert.match(summaryType, /submissionDeadline: string \| null/);
  assert.match(summaryType, /submittedAt: string \| null/);
  assert.match(
    summaryType,
    /degreeLevel: UniversityApplicationDegreeLevel/,
  );
  assert.match(summaryType, /intakeTerm: UniversityApplicationIntakeTerm/);
  assert.match(summaryType, /currentStatus: UniversityApplicationStatus/);
  assert.doesNotMatch(
    summaryType,
    /studentId|reference|portal|archive|actor|version|reason|email/,
  );
  assert.match(databaseContract, /Args: Record<string, never>/);
  assert.match(
    databaseContract,
    /Returns: StudentUniversityApplicationSummaryRow\[\]/,
  );
  assert.doesNotMatch(
    summaryType + databaseContract,
    /\bany\b|as any|as unknown as|@ts-ignore|@ts-expect-error/,
  );
});

test("E1.3.1 remains a database-only migration with no presentation dependency", () => {
  assert.doesNotMatch(
    executableMigration,
    /src\/|components\/|dashboard|tsx|react|next\//i,
  );
});

test("readiness verifies the RPC and reports only aggregate overflow drift", () => {
  for (const checkName of [
    "E1.3.1 student read RPC has zero arguments",
    "E1.3.1 student read RPC has exact relational return contract",
    "E1.3.1 student read RPC is trusted stable SECURITY DEFINER",
    "E1.3.1 student read RPC execution is authenticated only",
    "E1.3.1 tables retain counselor-only RLS and no table-wide grant",
    "E1.3.1 student read RPC derives and authorizes own identity",
    "E1.3.1 student read RPC excludes archives and bounds overflow",
    "E1.3.1 student read RPC uses deterministic safe ordering",
    "E1.3.1 student read RPC exposes no private or event fields",
    "E1.3.1 student read RPC has no mutation progression or dynamic SQL",
  ]) {
    assert.match(readiness, new RegExp(checkName));
  }

  const diagnostic =
    readiness.match(
      /-- Aggregate-only E1\.3\.1 drift diagnostic[\s\S]*?as oversized_student_application_sets;/,
    )?.[0] ?? "";
  assert.match(
    diagnostic,
    /students with more than 100 nonarchived university applications/,
  );
  assert.match(diagnostic, /pg_catalog\.count\(\*\)::bigint/);
  assert.doesNotMatch(
    diagnostic,
    /as object_name,\s*(?:application\.student_id|application\.id|application\.university_name)/,
  );
  assert.doesNotMatch(readiness, /\benum_value\.enumlabel\b(?!::text)/);
});
