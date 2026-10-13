import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const migration = read(
  "../../../supabase/migrations/202608250002_counselor_journey_progress_semester_summaries.sql",
);
const progressionMigration = read(
  "../../../supabase/migrations/202607250003_official_counseling_progression.sql",
);
const ownershipMigration = read(
  "../../../supabase/migrations/202608130002_primary_counselor_case_ownership_enforcement.sql",
);
const workspaceReadMigration = read(
  "../../../supabase/migrations/202608210002_counselor_student_workspace_read_security.sql",
);
const action = read("../../app/actions/counselor-semester-summary-actions.ts");
const advisory = read("../../components/counselor/student-workspace-sections.tsx");
const progressionUi = read(
  "../../components/counselor/official-progression-section.tsx",
);

function functionBody(name: string): string {
  const match = migration.match(
    new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$function\\$;`),
  );
  assert.ok(match, `${name} must exist`);
  return match[0];
}

test("Journey Progress reuses the canonical progression model and evidence architecture", () => {
  assert.match(progressionUi, /<h2 id="official-progression-heading">Journey Progress<\/h2>/);
  assert.match(progressionUi, /nextAction/);
  assert.equal(
    (progressionUi.match(/<dt>Next action<\/dt>/g) ?? []).length,
    2,
    "Next action must remain visible before and after progression starts",
  );
  assert.match(advisory, /privateRecords\.followUps[\s\S]*?status === "pending"/);
  assert.match(advisory, /ProgressionEvidenceLoadResult/);
  assert.doesNotMatch(migration, /create (?:type|table).*progression/i);
  assert.doesNotMatch(migration, /storage\.buckets|storage\.objects|counseling-progression-evidence/);
  assert.match(progressionMigration, /create type public\.counseling_progression_stage/);
  assert.match(progressionMigration, /create function public\.record_student_counseling_progression/);
});

test("current Primary ownership remains mandatory for Journey mutations and reads", () => {
  assert.match(
    ownershipMigration,
    /create trigger enforce_primary_counselor_case_on_progressions[\s\S]*?enforce_primary_counselor_student_case_row/,
  );
  assert.match(
    workspaceReadMigration,
    /student_counseling_progressions_select_primary_counselor[\s\S]*?is_active_primary_counselor_for_student/,
  );
  assert.match(action, /verifyPrimaryCounselorCaseAccess/);
  assert.doesNotMatch(action, /service[_-]?role|auth\.admin/);
});

test("private notes and follow-ups fail closed immediately after reassignment", () => {
  const notePolicy = migration.match(
    /create policy counselor_student_notes_select_current_primary_own[\s\S]*?\n\);/,
  )?.[0];
  const followUpPolicy = migration.match(
    /create policy counselor_follow_ups_select_current_primary_own[\s\S]*?\n\);/,
  )?.[0];
  assert.ok(notePolicy);
  assert.ok(followUpPolicy);
  for (const policy of [notePolicy, followUpPolicy]) {
    assert.match(policy, /counselor_id = \(select auth\.uid\(\)\)/);
    assert.match(policy, /is_active_primary_counselor_for_student/);
    assert.doesNotMatch(policy, /has_active_verified_kgeo_role/);
  }
});

test("Semester Summary is sealed, append-only, parent-safe, and separate from private notes", () => {
  assert.match(migration, /create table public\.counselor_student_semester_summaries/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(
    migration,
    /revoke all privileges on table[\s\S]*?from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete).*counselor_student_semester_summaries/i);

  const save = functionBody("record_counselor_student_semester_summary");
  const list = functionBody("get_counselor_student_semester_summaries");
  for (const body of [save, list]) {
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
    assert.match(body, /is_active_primary_counselor_for_student\(p_student_id\)/);
    assert.doesNotMatch(body, /counselor_student_notes|note_text|counselor_follow_ups/);
    assert.doesNotMatch(body, /has_active_verified_kgeo_role\(\s*'director'/);
  }
  assert.doesNotMatch(migration, /update public\.counselor_student_semester_summaries|delete from public\.counselor_student_semester_summaries/i);
});

test("Semester Summary RPCs are the only browser path and remain bounded", () => {
  const list = functionBody("get_counselor_student_semester_summaries");
  assert.match(list, /p_limit integer default 20/);
  assert.match(list, /p_limit < 1 or p_limit > 20/);
  assert.match(list, /order by summary\.created_at desc, summary\.id desc[\s\S]*?limit p_limit/);
  assert.match(action, /record_counselor_student_semester_summary/);
  assert.match(action, /get_counselor_student_identity/);
  assert.match(action, /revalidatePath\(`\/counselor\/students\/\$\{trustedStudentId\}\/advisory`\)/);
});

test("unrelated profile-document and application systems are not changed by the feature migration", () => {
  assert.doesNotMatch(
    migration,
    /student_profile_documents|student-profile-documents|student_university_applications|university-application-documents/,
  );
  assert.doesNotMatch(migration, /create policy .*director/i);
});
