import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../../../supabase/migrations/202608240002_student_profile_documents.sql", import.meta.url),
  "utf8",
);
const storageOwner = readFileSync(
  new URL("../../../supabase/storage-owner/202608240002_student_profile_document_policies.sql", import.meta.url),
  "utf8",
);
const verification = readFileSync(
  new URL("../../../supabase/verification/202608240002_student_profile_documents.sql", import.meta.url),
  "utf8",
);
const actions = readFileSync(
  new URL("../../app/actions/student-profile-document-actions.ts", import.meta.url),
  "utf8",
);
const studentPage = readFileSync(
  new URL("../../app/student/profile/page.tsx", import.meta.url),
  "utf8",
);
const studentComponent = readFileSync(
  new URL("../../components/forms/student-profile-documents.tsx", import.meta.url),
  "utf8",
);
const counselorPage = readFileSync(
  new URL("../../app/counselor/students/[student-id]/documents/page.tsx", import.meta.url),
  "utf8",
);
const counselorServer = readFileSync(
  new URL("../counselor/profile-documents-server.ts", import.meta.url),
  "utf8",
);
const counselorRoute = readFileSync(
  new URL("../../app/counselor/students/[student-id]/documents/[document-id]/view/route.ts", import.meta.url),
  "utf8",
);

test("one additive model is exact and supports multiple files per category", () => {
  assert.match(migration, /create type public\.student_profile_document_type as enum/);
  assert.match(migration, /create table public\.student_profile_documents/);
  assert.doesNotMatch(migration, /unique[\s\S]{0,100}document_type/i);
  assert.doesNotMatch(migration, /'resume'|'marksheet'/i);
});

test("profile documents use a separate private bounded bucket", () => {
  assert.match(migration, /'student-profile-documents'[\s\S]*?false,[\s\S]*?10485760/);
  assert.doesNotMatch(storageOwner, /counseling-progression-evidence|university-application-documents/);
  assert.doesNotMatch(migration, /public\s*=\s*true|getPublicUrl/i);
});

test("Student upload derives identity path and lifecycle server-side", () => {
  const prepare = migration.match(/create function public\.prepare_student_profile_document_upload\([\s\S]*?\$function\$;/)?.[0];
  assert.ok(prepare);
  assert.doesNotMatch(prepare, /p_student_id/);
  assert.match(prepare, /v_caller_id := \(select auth\.uid\(\)\)/);
  assert.match(prepare, /v_storage_path := pg_catalog\.concat\([\s\S]*?v_caller_id[\s\S]*?v_document_id/);
  assert.match(prepare, /limit has been reached|>= 50/);
  assert.doesNotMatch(prepare, /consultation|primary_counselor|continue_with_kgeo/i);
});

test("Student browser input cannot inject ownership path role or storage system", () => {
  assert.match(actions, /readExactStringFields\(formData, \[[\s\S]*?"documentType"[\s\S]*?"fileSizeBytes"[\s\S]*?\]\)/);
  assert.doesNotMatch(actions, /formData\.get\("studentId"\)|formData\.get\("storagePath"\)|formData\.get\("role"\)/);
  assert.match(actions, /\.createSignedUploadUrl\([\s\S]*?upsert: false/);
  assert.match(studentComponent, /\.uploadToSignedUrl\(/);
});

test("finalization prevents metadata rows pointing to missing objects", () => {
  const finalize = migration.match(/create function public\.finalize_student_profile_document_upload\([\s\S]*?\$function\$;/)?.[0];
  assert.ok(finalize);
  assert.match(finalize, /from storage\.objects/);
  assert.match(finalize, /status = 'available'/);
  assert.match(finalize, /upload_expires_at <= pg_catalog\.statement_timestamp\(\)/);
  assert.match(studentComponent, /retryFinalizeDocumentId/);
  assert.match(studentComponent, /Retry finalization/);
});

test("Student list view and delete remain own-account only", () => {
  assert.match(migration, /list_my_student_profile_documents\(\)[\s\S]*?document\.student_id = v_caller_id/);
  assert.match(migration, /authorize_student_profile_document_delete[\s\S]*?'student'::public\.user_role[\s\S]*?document\.student_id = v_caller_id/);
  assert.match(actions, /authorize_student_profile_document_delete[\s\S]*?\.remove\(\[authorization\.storage_path\]\)[\s\S]*?finalize_student_profile_document_delete/);
  assert.doesNotMatch(actions, /service_role|SUPABASE_SERVICE_ROLE_KEY/);
});

test("current Primary Counselor has bounded read-only access", () => {
  assert.match(migration, /list_primary_counselor_student_profile_documents[\s\S]*?is_active_primary_counselor_for_student/);
  assert.match(counselorServer, /verifyPrimaryCounselorCaseAccess/);
  assert.match(counselorRoute, /verifyPrimaryCounselorCaseAccess[\s\S]*?authorize_student_profile_document_view/);
  assert.doesNotMatch(counselorPage + counselorServer + counselorRoute, /deleteStudentProfileDocument|prepareStudentProfileDocument/);
});

test("covering old Director admin and anonymous access fail closed", () => {
  assert.match(migration, /is_active_primary_counselor_for_student/);
  assert.doesNotMatch(migration, /'director'::public\.user_role|'admin'::public\.user_role/);
  assert.match(migration, /revoke all privileges on table public\.student_profile_documents[\s\S]*?public, anon, authenticated/);
  assert.doesNotMatch(storageOwner, /\bto\s+(?:public|anon)\b/i);
});

test("Storage policies are exact role-specific and owner-run without ownership changes", () => {
  assert.match(storageOwner, /for insert[\s\S]*?to authenticated[\s\S]*?can_upload_student_profile_document_object/);
  assert.match(storageOwner, /for select[\s\S]*?can_view_student_profile_document_object/);
  assert.match(storageOwner, /for delete[\s\S]*?can_delete_student_profile_document_object/);
  assert.doesNotMatch(storageOwner, /^\s*(?:set role|alter\s+\S+\s+.*owner to)/im);
});

test("Student Profile is extended without replacing existing forms or readiness", () => {
  assert.match(studentPage, /StudentProfileOnboarding/);
  assert.match(studentPage, /StudentProfileAchievementSection/);
  assert.match(studentPage, /StudentProfileExamSection/);
  assert.match(studentPage, /StudentProfileDocuments/);
  assert.match(studentPage, /mapProfileCompletion/);
});

test("Counselor Documents route presents Profile Documents and preserves separation", () => {
  assert.match(counselorPage, /loadPrimaryCounselorProfileDocuments/);
  assert.doesNotMatch(counselorPage, /loadCounselorProgressionEvidence|loadCounselorUniversityApplications/);
  assert.match(studentComponent, /PDF, JPEG, or PNG/);
});

test("verification is read-only and checks live RLS bucket RPC and Storage policy state", () => {
  assert.match(verification, /begin transaction read only;/);
  assert.match(verification, /SEALED_PROFILE_DOCUMENT_TABLE/);
  assert.match(verification, /PRIVATE_BUCKET_EXACT/);
  assert.match(verification, /STORAGE_POLICY_INVENTORY_EXACT/);
  assert.match(verification, /NO_DIRECTOR_PROFILE_DOCUMENT_POLICY/);
  assert.match(verification, /rollback;/);
  assert.doesNotMatch(
    verification,
    /^\s*(?:insert|update|delete|alter|create|drop|grant|revoke)\b/gim,
  );
  assert.equal(
    verification.match(/array_agg\([\s\S]*?enumlabel::text[\s\S]*?\)/g)?.length,
    2,
  );
  assert.doesNotMatch(
    verification,
    /array_agg\(\s*enum_label\.enumlabel\s+order by/,
  );
  assert.match(verification, /procedure\.proname::text = any\(/);
  assert.equal(verification.match(/policy\.polname::text = any\(/g)?.length, 2);
  assert.match(
    verification,
    /procedure\.proconfig in \([\s\S]*?array\['search_path='\]::text\[\],[\s\S]*?array\['search_path=""'\]::text\[\][\s\S]*?\)/,
  );
});
