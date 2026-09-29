import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const migration = read(
  "../../../supabase/migrations/202608210002_counselor_student_workspace_read_security.sql",
);
const storageOwnerPolicy = read(
  "../../../supabase/storage-owner/202608210002_progression_evidence_primary_counselor_select.sql",
);
const helperMigration = read(
  "../../../supabase/migrations/202608130001_primary_counselor_storage_authorization_helpers.sql",
);
const profileFoundation = read(
  "../../../supabase/migrations/202607190002_student_profile_foundation.sql",
);
const profileServer = read("./student-profile-server.ts");
const progressionServer = read("./progression-server.ts");
const evidenceServer = read("./progression-evidence-server.ts");
const applicationServer = read("./university-application-server.ts");

const affectedStudentTables = [
  "student_profiles",
  "student_preferences",
  "student_test_scores",
  "student_achievements",
] as const;

test("Step 2 is one transactional forward migration reusing the trusted helper", () => {
  assert.match(migration, /^--[\s\S]*?\nbegin;/);
  assert.match(migration, /\ncommit;\s*$/);
  assert.doesNotMatch(migration, /create function public\.is_active_primary_counselor_for_student/);
  assert.match(
    migration,
    /grant execute on function public\.is_active_primary_counselor_for_student\(uuid\)\s+to authenticated/,
  );
  assert.match(helperMigration, /assignment\.counselor_id = \(select auth\.uid\(\)\)/);
  assert.match(helperMigration, /assignment\.ended_at is null/);
  assert.match(helperMigration, /counselor_profile\.is_active is true/);
  assert.match(helperMigration, /counselor_auth\.email_confirmed_at is not null/);
});

test("all four historical Counselor-wide profile policies are removed", () => {
  for (const table of affectedStudentTables) {
    assert.match(
      profileFoundation,
      new RegExp(`create policy ${table}_select_counselor_all`),
    );
    assert.match(
      migration,
      new RegExp(`drop policy ${table}_select_counselor_all\\s+on public\\.${table}`),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(`create policy ${table}_select_counselor_all`),
    );
  }
});

test("current Primary Counselor is the only Counselor direct-read branch", () => {
  for (const table of affectedStudentTables) {
    assert.match(
      migration,
      new RegExp(
        `create policy ${table}_select_primary_counselor[\\s\\S]*?is_active_primary_counselor_for_student\\([\\s\\S]*?${table}\\.student_id`,
      ),
    );
  }
  assert.doesNotMatch(
    migration,
    /select_primary_counselor[\s\S]*?has_active_verified_kgeo_role\(\s*'counselor'/,
  );
});

test("ended history cannot authorize and reassignment changes access immediately", () => {
  type Assignment = {
    counselorId: string;
    studentId: string;
    endedAt: string | null;
  };
  const canRead = (
    assignments: Assignment[],
    counselorId: string,
    studentId: string,
  ) =>
    assignments.some(
      (assignment) =>
        assignment.studentId === studentId &&
        assignment.counselorId === counselorId &&
        assignment.endedAt === null,
    );

  const before = [
    { counselorId: "A", studentId: "X", endedAt: null },
  ];
  assert.equal(canRead(before, "A", "X"), true);
  assert.equal(canRead(before, "B", "X"), false);

  const after = [
    { counselorId: "A", studentId: "X", endedAt: "2026-08-21" },
    { counselorId: "B", studentId: "X", endedAt: null },
  ];
  assert.equal(canRead(after, "A", "X"), false);
  assert.equal(canRead(after, "B", "X"), true);
});

test("Director reads are separate verified organization-wide policies", () => {
  for (const table of affectedStudentTables) {
    assert.match(
      migration,
      new RegExp(
        `create policy ${table}_select_director_all[\\s\\S]*?has_active_verified_kgeo_role\\([\\s\\S]*?'director'::public\\.user_role`,
      ),
    );
  }
  assert.doesNotMatch(migration, /counselor_student_notes_select_director/);
  assert.doesNotMatch(migration, /counselor_follow_ups_select_director/);
});

test("Student own-data policies remain intact and no cross-student policy is added", () => {
  for (const table of affectedStudentTables) {
    assert.match(
      profileFoundation,
      new RegExp(
        `create policy ${table}_select_own[\\s\\S]*?student_id = \\(select auth\\.uid\\(\\)\\)[\\s\\S]*?'student'::public\\.user_role`,
      ),
    );
    assert.doesNotMatch(
      migration,
      new RegExp(`drop policy ${table}_select_own`),
    );
  }
  assert.doesNotMatch(migration, /select_student_all|student_y|using \(true\)/i);
});

test("progression, evidence, and application direct reads use Primary ownership", () => {
  for (const policy of [
    "student_counseling_progressions_select_primary_counselor",
    "student_counseling_progression_events_select_primary_counselor",
    "progression_event_corrections_select_primary_counselor",
    "progression_evidence_select_primary_counselor",
    "student_university_applications_select_primary_counselor",
    "student_university_application_events_select_primary_counselor",
    "university_application_documents_select_primary_counselor",
  ]) {
    const start = migration.indexOf(`create policy ${policy}`);
    assert.notEqual(start, -1, `${policy} must exist`);
    const section = migration.slice(start, migration.indexOf(";", start) + 1);
    assert.match(section, /is_active_primary_counselor_for_student/);
  }
});

test("Student Workspace identity RPC fails closed before returning identity", () => {
  const identity = migration.match(
    /create or replace function public\.get_counselor_student_identity[\s\S]*?\$function\$;/,
  )?.[0];
  assert.ok(identity);
  assert.match(identity, /security definer/);
  assert.match(identity, /set search_path = ''/);
  assert.match(
    identity,
    /is_active_primary_counselor_for_student\(p_student_id\)[\s\S]*?is distinct from true then\s+return/,
  );
  assert.doesNotMatch(identity, /p_counselor_id|caller_id\s*:=\s*p_/);
});

test("security-definer correction reads enforce the same Primary boundary", () => {
  const correction = migration.match(
    /create or replace function\s+public\.get_counselor_progression_correction_context[\s\S]*?\$function\$;/,
  )?.[0];
  assert.ok(correction);
  assert.match(
    correction,
    /is_active_primary_counselor_for_student\(p_student_id\)[\s\S]*?is distinct from true then/,
  );
  assert.match(correction, /security definer[\s\S]*?set search_path = ''/);
});

test("application document metadata, path authorization, and Storage helper are Primary-scoped", () => {
  for (const functionName of [
    "list_university_application_documents",
    "authorize_university_application_document_view",
    "can_view_university_application_document_object",
  ]) {
    const start = migration.indexOf(`function public.${functionName}`);
    assert.notEqual(start, -1, `${functionName} must be replaced`);
    const bodyEnd = migration.indexOf("$function$;", start);
    const body = migration.slice(start, bodyEnd);
    assert.match(body, /is_active_primary_counselor_for_student/);
    assert.doesNotMatch(body, /has_active_verified_kgeo_role\(\s*'counselor'/);
  }
});

test("progression evidence Storage SELECT is owner-run and Primary-scoped", () => {
  assert.doesNotMatch(migration, /(?:alter|create|drop) policy[\s\S]*?storage\.objects/i);
  assert.match(
    storageOwnerPolicy,
    /alter policy progression_evidence_object_select_counselor\s+on storage\.objects\s+to authenticated\s+using/,
  );
  assert.match(
    storageOwnerPolicy,
    /evidence\.bucket_id = storage\.objects\.bucket_id[\s\S]*?evidence\.storage_path = storage\.objects\.name/,
  );
  assert.match(
    storageOwnerPolicy,
    /evidence\.status =[\s\S]*?'available'::public\.counseling_progression_evidence_status/,
  );
  assert.match(
    storageOwnerPolicy,
    /is_active_primary_counselor_for_student\([\s\S]*?event\.student_id/,
  );
  assert.doesNotMatch(storageOwnerPolicy, /\bset\s+role\b|owner\s+to|alter\s+table/i);
  assert.equal(
    storageOwnerPolicy.match(/\balter policy\b/gi)?.length,
    1,
  );
});

test("all modular Student Workspace loaders verify Primary access server-side", () => {
  for (const source of [
    profileServer,
    progressionServer,
    evidenceServer,
    applicationServer,
  ]) {
    assert.match(source, /verifyPrimaryCounselorCaseAccess/);
    assert.match(source, /if \(!caseAccess\.valid\)/);
  }
  assert.ok(
    profileServer.indexOf("verifyPrimaryCounselorCaseAccess") <
      profileServer.indexOf("fetchCounselorStudentProfile"),
  );
});

test("private notes and follow-ups retain author privacy and existing enforcement", () => {
  assert.doesNotMatch(migration, /drop policy counselor_student_notes/);
  assert.doesNotMatch(migration, /drop policy counselor_follow_ups/);
  assert.doesNotMatch(migration, /create policy counselor_(?:student_notes|follow_ups)/);
  assert.doesNotMatch(migration, /enforce_primary_counselor_student_case_row/);
});

test("Step 2 changes no mutation, assignment, FCFS, or public-progress contract", () => {
  assert.doesNotMatch(
    migration,
    /\b(?:insert into|update|delete from|truncate)\b/i,
  );
  assert.doesNotMatch(
    migration,
    /claim_next_consultation|record_consultation_outcome|student_counselor_assignments|kgeo_public_progress/i,
  );
  assert.doesNotMatch(migration, /create trigger|drop trigger|alter trigger/i);
});

test("all new functions remain postgres-owned, sealed, and authenticated-only", () => {
  for (const signature of [
    "get_counselor_student_identity\\(uuid\\)",
    "get_counselor_progression_correction_context\\(uuid, uuid\\[\\]\\)",
    "list_university_application_documents\\(uuid\\)",
    "authorize_university_application_document_view\\(uuid, uuid\\)",
    "can_view_university_application_document_object\\(text, text\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter function(?:\\s+public\\.| public\\.)${signature}[\\s\\S]*?owner to postgres`),
    );
    assert.match(
      migration,
      new RegExp(`revoke all on function(?:\\s+public\\.| public\\.)${signature}[\\s\\S]*?from public, anon, authenticated, service_role`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function(?:\\s+public\\.| public\\.)${signature}[\\s\\S]*?to authenticated`),
    );
  }
});
