import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const migration = read(
  "../../../supabase/migrations/202608250003_university_application_journey_extension.sql",
);
const applicationFoundation = read(
  "../../../supabase/migrations/202607270001_university_application_foundation.sql",
);
const documentFoundation = read(
  "../../../supabase/migrations/202608010001_university_application_documents_foundation.sql",
);
const action = read(
  "../../app/actions/counselor-application-journey-actions.ts",
);
const counselorPage = read(
  "../../app/counselor/students/[student-id]/applications/[application-id]/page.tsx",
);
const counselorUi = read(
  "../../components/counselor/application-journey-section.tsx",
);
const studentUi = read(
  "../../components/student/university-applications-section.tsx",
);
const verification = read(
  "../../../supabase/verification/202608250003_university_application_journey_extension.sql",
);

function functionBody(name: string): string {
  const match = migration.match(
    new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$function\\$;`),
  );
  assert.ok(match, `${name} must exist`);
  return match[0];
}

test("existing application lifecycle remains canonical and unmodified by the extension", () => {
  assert.match(
    applicationFoundation,
    /create type public\.university_application_status as enum[\s\S]*?'decision_received'[\s\S]*?'closed'/,
  );
  assert.match(
    applicationFoundation,
    /offer and visa outcomes are separate future domains/,
  );
  assert.doesNotMatch(
    migration,
    /alter table public\.student_university_applications|alter type public\.university_application_status/,
  );
  assert.doesNotMatch(migration, /update public\.student_university_applications/);
});

test("application decision offer Student decision fee visa and enrollment are separate", () => {
  for (const typeName of [
    "university_application_decision",
    "university_application_offer_status",
    "university_application_student_decision",
    "university_application_fee_status",
    "university_application_visa_status",
    "university_application_enrollment_status",
  ]) {
    assert.match(migration, new RegExp(`create type public\\.${typeName} as enum`));
  }
  assert.match(migration, /'conditional',[\s\S]*?'unconditional'/);
  assert.match(migration, /'accepted',[\s\S]*?'declined'/);
  assert.match(migration, /'pending',[\s\S]*?'paid'/);
  assert.match(migration, /'preparing',[\s\S]*?'submitted',[\s\S]*?'approved',[\s\S]*?'refused'/);
});

test("legacy applications use read-time defaults without a rewrite", () => {
  for (const name of [
    "get_counselor_university_application_journey",
    "get_my_university_application_journeys",
  ]) {
    const body = functionBody(name);
    assert.match(body, /left join public\.student_university_application_journeys/);
    assert.match(body, /'pending'::public\.university_application_decision/);
    assert.match(body, /'none'::public\.university_application_offer_status/);
    assert.match(body, /'not_started'::public\.university_application_fee_status/);
    assert.match(body, /'not_started'::public\.university_application_visa_status/);
    assert.match(body, /'not_enrolled'::public\.university_application_enrollment_status/);
  }
});

test("journey tables are sealed forced-RLS and browser-policy-free", () => {
  for (const relation of [
    "student_university_application_journeys",
    "student_university_application_journey_events",
  ]) {
    assert.match(migration, new RegExp(`alter table public\\.${relation}[\\s\\S]*?enable row level security`));
    assert.match(migration, new RegExp(`alter table public\\.${relation}[\\s\\S]*?force row level security`));
  }
  assert.match(
    migration,
    /revoke all privileges on table[\s\S]*?from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(migration, /create policy/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete).*table/i);
});

test("current Primary ownership is rechecked inside every Counselor RPC and action", () => {
  for (const name of [
    "get_counselor_university_application_journey",
    "get_counselor_university_application_journey_history",
    "record_university_application_journey",
  ]) {
    const body = functionBody(name);
    assert.match(body, /has_active_verified_kgeo_role\([\s\S]*?'counselor'/);
    assert.match(body, /is_active_primary_counselor_for_student/);
    assert.match(body, /security definer/);
    assert.match(body, /set search_path = ''/);
  }
  assert.match(action, /verifyPrimaryCounselorCaseAccess/);
  assert.match(action, /record_university_application_journey/);
  assert.doesNotMatch(action, /service[_-]?role|auth\.admin/);
});

test("Counselor journey history remains bounded for explicit null limits", () => {
  const body = functionBody(
    "get_counselor_university_application_journey_history",
  );
  assert.match(body, /p_limit is null or p_limit < 1 or p_limit > 20/);
  assert.match(body, /limit p_limit/);
});

test("mutation locks the application and writes one complete immutable snapshot", () => {
  const body = functionBody("record_university_application_journey");
  assert.match(
    body,
    /from public\.student_university_applications as application[\s\S]*?for update/,
  );
  assert.match(
    body,
    /from public\.student_university_application_journeys as journey[\s\S]*?for update/,
  );
  assert.match(
    body,
    /insert into public\.student_university_application_journey_events/,
  );
  assert.match(migration, /unique \(application_id, version_number\)/);
  assert.doesNotMatch(migration, /update public\.student_university_application_journey_events|delete from public\.student_university_application_journey_events/);
});

test("Student read is own-account safe and excludes history reasons and actors", () => {
  const body = functionBody("get_my_university_application_journeys");
  assert.match(body, /has_active_verified_kgeo_role\([\s\S]*?'student'/);
  assert.match(body, /application\.student_id = v_caller_id/);
  assert.match(body, /application\.is_archived is false/);
  assert.doesNotMatch(body, /change_reason|changed_by|created_by|last_changed_by/);
  assert.match(studentUi, /Offer[\s\S]*?Your decision[\s\S]*?Fee[\s\S]*?Visa/);
  assert.doesNotMatch(studentUi, /Counselor Notes|change_reason|changed_by/);
});

test("Director remains read-only and no Director mutation grant is introduced", () => {
  assert.doesNotMatch(migration, /has_active_verified_kgeo_role\([\s\S]*?'director'[\s\S]*?record_university_application_journey/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*?to director/);
  assert.doesNotMatch(action, /requireDirector|has_active_verified_kgeo_role\([\s\S]*?'director'/);
});

test("existing document systems and private notes remain isolated", () => {
  assert.match(documentFoundation, /student_university_application_documents/);
  assert.match(counselorUi, /Use Application Documents for supporting files or payment/);
  assert.doesNotMatch(
    migration,
    /storage\.objects|storage\.buckets|student_profile_documents|student_counseling_progression_evidence|counselor_student_notes|counselor_follow_ups/,
  );
});

test("UI extends the linked application detail without rebuilding the portal", () => {
  assert.match(counselorPage, /ApplicationJourneySection/);
  assert.match(counselorUi, /Application[\s\S]*?University decision[\s\S]*?Offer[\s\S]*?Student decision[\s\S]*?Fee[\s\S]*?Visa[\s\S]*?Enrollment/);
  assert.match(counselorUi, /Application Journey history/);
});

test("migration contains no invalid schema-qualified SQL special forms", () => {
  assert.doesNotMatch(migration, /pg_catalog\.(?:coalesce|nullif|extract)\s*\(/i);
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.equal((migration.match(/^begin;/gm) ?? []).length, 1);
  assert.equal((migration.match(/^commit;/gm) ?? []).length, 1);
});

test("live verification is read-only and checks sealed metadata and ACLs", () => {
  assert.match(verification, /ENUMS_EXACT/);
  assert.match(verification, /SEALED_RELATIONS_EXACT/);
  assert.match(verification, /NO_BROWSER_TABLE_ACCESS_OR_POLICIES/);
  assert.match(verification, /FUNCTION_METADATA_AND_ACLS_EXACT/);
  assert.doesNotMatch(
    verification,
    /^\s*(?:create|alter|drop|insert|update|delete|grant|revoke)\b/im,
  );
  assert.doesNotMatch(verification, /pg_catalog\.(?:coalesce|nullif|extract)\s*\(/i);
});
