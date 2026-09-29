import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const migration = read("../../../supabase/migrations/202609020002_student_achievement_evidence.sql");
const storageOwner = read("../../../supabase/storage-owner/202609020002_student_achievement_document_policies.sql");
const verification = read("../../../supabase/verification/202609020002_student_achievement_evidence.sql");
const actions = read("../../app/actions/student-achievement-evidence-actions.ts");
const signatureValidation = read("achievement-evidence-signature.ts");
const studentComponent = read("../../components/forms/student-achievement-evidence.tsx");
const studentPage = read("../../app/student/profile/page.tsx");
const counselorPage = read("../../app/counselor/students/[student-id]/achievements/page.tsx");
const counselorComponent = read("../../components/counselor/student-workspace-sections.tsx");
const counselorServer = read("../counselor/achievement-evidence-server.ts");
const studentRoute = read("../../app/student/profile/achievements/[achievement-id]/evidence/[document-id]/view/route.ts");
const counselorRoute = read("../../app/counselor/students/[student-id]/achievements/[achievement-id]/evidence/[document-id]/view/route.ts");
const nextConfig = read("../../../next.config.ts");

test("dedicated model allows multiple files and keeps deletion safe and auditable", () => {
  assert.match(migration, /create table public\.student_achievement_documents/);
  assert.match(migration, /achievement_id uuid[\s\S]*?references public\.student_achievements\(id\) on delete set null/);
  assert.match(migration, /achievement_reference_id uuid not null/);
  assert.match(migration, /student_achievement_documents_enforce_owner/);
  assert.match(migration, /student_achievements_protect_active_evidence[\s\S]*?before delete on public\.student_achievements/);
  assert.match(migration, /status in \([\s\S]*?'pending'[\s\S]*?'available'/);
  assert.doesNotMatch(migration, /unique[\s\S]{0,80}achievement_id/i);
  assert.match(migration, /alter table public\.student_achievement_documents force row level security/);
});

test("server-only preparation derives an unguessable Student-owned path", () => {
  const prepare = migration.match(/create function public\.prepare_student_achievement_document_upload\([\s\S]*?\$function\$;/)?.[0];
  assert.ok(prepare);
  assert.match(prepare, /p_student_id uuid/);
  assert.match(prepare, /achievement\.student_id = p_student_id/);
  assert.match(prepare, /join auth\.users as auth_user/);
  assert.match(prepare, /v_path_nonce := pg_catalog\.gen_random_uuid\(\)/);
  assert.match(prepare, /v_storage_path := pg_catalog\.concat\([\s\S]*?p_student_id[\s\S]*?p_achievement_id[\s\S]*?v_document_id[\s\S]*?v_path_nonce/);
  assert.match(migration, /grant execute on function public\.prepare_student_achievement_document_upload\([\s\S]*?\) to service_role;/);
  assert.doesNotMatch(migration, /grant execute on function public\.prepare_student_achievement_document_upload\([\s\S]*?\) to authenticated;/);
  assert.match(actions, /p_student_id: user\.id/);
  assert.doesNotMatch(studentComponent, /storage_path|storagePath|document_id/);
});

test("finalization verifies the actual object size MIME owner path and linkage", () => {
  const finalize = migration.match(/create function public\.finalize_student_achievement_document_upload\([\s\S]*?\$function\$;/)?.[0];
  assert.ok(finalize);
  assert.match(finalize, /storage_object\.metadata ->> 'size'/);
  assert.match(finalize, /storage_object\.metadata ->> 'mimetype'/);
  assert.match(finalize, /storage_object\.owner_id/);
  assert.match(finalize, /v_actual_size <> v_document\.file_size_bytes/);
  assert.match(finalize, /v_actual_mime_type <> v_document\.mime_type/);
  assert.match(finalize, /v_document\.detected_mime_type is distinct from v_document\.mime_type/);
  assert.match(finalize, /v_document\.signature_validated_at is null/);
  assert.match(finalize, /v_actual_owner_id <> v_caller_id::text/);
  assert.match(finalize, /achievement\.id = v_document\.achievement_id[\s\S]*?achievement\.student_id = v_caller_id/);
});

test("server-mediated upload validates bytes without issuing a browser capability", () => {
  assert.match(actions, /createAdminClient\(\)/);
  assert.match(actions, /selectedFile\.arrayBuffer\(\)/);
  assert.match(actions, /detectAchievementEvidenceMimeType\(bytes\)/);
  assert.match(actions, /supabase\.storage[\s\S]*?\.upload\(prepared\.storage_path, selectedFile,[\s\S]*?upsert: false/);
  assert.match(actions, /record_student_achievement_document_signature_validation/);
  assert.match(actions, /reject_student_achievement_document_signature/);
  assert.doesNotMatch(actions + studentComponent, /createSignedUploadUrl|uploadToSignedUrl|signedUploadToken/);
  assert.match(nextConfig, /serverActions:[\s\S]*?bodySizeLimit: "11mb"/);
  assert.match(signatureValidation, /0x25, 0x50, 0x44, 0x46, 0x2d/);
  assert.match(signatureValidation, /0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a/);
  assert.match(signatureValidation, /bytes\[0\] !== 0xff[\s\S]*?bytes\[1\] !== 0xd8/);
  assert.match(signatureValidation, /sawFrame/);
  assert.match(signatureValidation, /This is not antivirus scanning/);
});

test("private Storage policies are isolated and owner-run", () => {
  assert.match(migration, /'student-achievement-documents'[\s\S]*?false,[\s\S]*?10485760/);
  assert.match(storageOwner, /for insert[\s\S]*?to authenticated[\s\S]*?can_upload_student_achievement_document_object/);
  assert.match(storageOwner, /for select[\s\S]*?can_view_student_achievement_document_object/);
  assert.match(storageOwner, /for delete[\s\S]*?can_delete_student_achievement_document_object/);
  assert.doesNotMatch(storageOwner, /^\s*(?:set role|alter\s+\S+\s+.*owner to)/im);
  assert.doesNotMatch(migration + storageOwner, /getPublicUrl|public\s*=\s*true/i);
});

test("authenticated upload and cancellation serialize on the reservation row", () => {
  const uploadHelper = migration.match(/create function public\.can_upload_student_achievement_document_object\([\s\S]*?\$function\$;/)?.[0];
  const authorizeDelete = migration.match(/create function public\.authorize_student_achievement_document_delete\([\s\S]*?\$function\$;/)?.[0];
  assert.ok(uploadHelper && authorizeDelete);
  assert.match(uploadHelper, /language plpgsql[\s\S]*?volatile/);
  assert.match(uploadHelper, /document\.status = 'pending'/);
  assert.match(uploadHelper, /document\.upload_expires_at > pg_catalog\.statement_timestamp\(\)/);
  assert.match(uploadHelper, /for update of document/);
  assert.match(authorizeDelete, /document\.status = p_expected_status/);
  assert.match(authorizeDelete, /for update/);
});

test("authorization grants Student ownership and current Primary Counselor read only", () => {
  assert.match(migration, /list_my_student_achievement_documents\(\)[\s\S]*?document\.student_id = v_caller_id/);
  assert.match(migration, /list_primary_counselor_student_achievement_documents[\s\S]*?is_active_primary_counselor_for_student/);
  assert.match(migration, /authorize_student_achievement_document_delete[\s\S]*?'student'::public\.user_role[\s\S]*?document\.student_id = v_caller_id/);
  assert.doesNotMatch(migration, /'director'::public\.user_role|'admin'::public\.user_role/);
  assert.match(migration, /revoke all privileges on table public\.student_achievement_documents[\s\S]*?public, anon, authenticated, service_role/);
  assert.match(counselorServer, /verifyPrimaryCounselorCaseAccess/);
  assert.doesNotMatch(counselorPage + counselorComponent + counselorServer + counselorRoute, /deleteStudentAchievementEvidence|prepareStudentAchievementEvidence/);
});

test("Storage deletion cannot bypass the metadata audit lifecycle", () => {
  const authorizeDelete = migration.match(/create function public\.authorize_student_achievement_document_delete\([\s\S]*?\$function\$;/)?.[0];
  const finalizeDelete = migration.match(/create function public\.finalize_student_achievement_document_delete\([\s\S]*?\$function\$;/)?.[0];
  const deleteHelper = migration.match(/create function public\.can_delete_student_achievement_document_object\([\s\S]*?\$function\$;/)?.[0];
  assert.ok(authorizeDelete && finalizeDelete && deleteHelper);
  assert.match(authorizeDelete, /for update/);
  assert.match(authorizeDelete, /p_expected_status public\.student_achievement_document_status/);
  assert.match(authorizeDelete, /'pending'::public\.student_achievement_document_status/);
  assert.match(authorizeDelete, /v_object_exists := exists/);
  assert.match(authorizeDelete, /'pending_cancel'::public\.student_achievement_document_removal_reason/);
  assert.match(authorizeDelete, /set status = 'removal_pending'/);
  assert.doesNotMatch(authorizeDelete, /set status = 'removed'/);
  assert.match(deleteHelper, /document\.status =\s*'removal_pending'/);
  assert.match(deleteHelper, /document\.removal_requested_at >[\s\S]*?interval '5 minutes'/);
  assert.match(finalizeDelete, /v_document\.status <>\s*'removal_pending'/);
  assert.match(finalizeDelete, /status = 'removed'/);
  assert.match(migration, /'invalid_file'::public\.student_achievement_document_removal_reason/);
  assert.match(migration, /status in \([\s\S]*?'pending'[\s\S]*?'available'[\s\S]*?'removal_pending'/);
  assert.match(actions, /p_expected_status: expectedStatus/);
  assert.match(actions, /finalize_student_achievement_document_delete/);
});

test("student and counselor UI expose only approved evidence controls", () => {
  assert.match(studentPage, /list_my_student_achievement_documents/);
  assert.match(studentComponent, /Evidence \/ Certificates/);
  assert.match(studentComponent, /No evidence uploaded/);
  assert.match(studentComponent, /Upload Evidence/);
  assert.match(studentComponent, />\s*View\s*</);
  assert.match(studentComponent, /"Cancel upload"[\s\S]*?"Retry delete"[\s\S]*?"Delete"/);
  assert.match(counselorPage, /loadPrimaryCounselorAchievementEvidence/);
  assert.match(counselorComponent, /View Evidence/);
  assert.match(studentRoute + counselorRoute, /createSignedUrl\([\s\S]*?STUDENT_ACHIEVEMENT_DOCUMENT_SIGNED_VIEW_SECONDS/);
  assert.doesNotMatch(studentRoute + counselorRoute, /getPublicUrl|3600/);
});

test("existing document and scoring systems remain separate", () => {
  assert.doesNotMatch(migration + storageOwner, /student_profile_documents|student_university_application_documents|student_counseling_progression_evidence|parent_report_attachments/);
  for (const path of [
    "../../../supabase/migrations/202608240002_student_profile_documents.sql",
    "../../../supabase/migrations/202608010001_university_application_documents_foundation.sql",
    "../../../supabase/migrations/202607260001_progression_evidence_foundation.sql",
    "../../../supabase/migrations/202608250005_parent_report_workflow.sql",
    "../../../supabase/migrations/202609020001_global_masters_readiness_index.sql",
  ]) {
    assert.doesNotMatch(read(path), /student_achievement_documents|student-achievement-documents/);
  }
});

test("verification is strictly read only and checks live security contracts", () => {
  assert.match(verification, /begin transaction read only;/);
  assert.match(verification, /SEALED_ACHIEVEMENT_DOCUMENT_TABLE/);
  assert.match(verification, /PRIVATE_ACHIEVEMENT_BUCKET_EXACT/);
  assert.match(verification, /ACHIEVEMENT_DOCUMENT_CONSTRAINTS_EXACT/);
  assert.match(verification, /ACHIEVEMENT_DOCUMENT_INDEXES_EXACT/);
  assert.match(verification, /ACHIEVEMENT_EVIDENCE_TRIGGERS_EXACT/);
  assert.match(verification, /ACHIEVEMENT_EVIDENCE_FUNCTION_METADATA_AND_ACLS_EXACT/);
  assert.match(verification, /ACHIEVEMENT_EVIDENCE_FUNCTION_BODIES_FAIL_CLOSED/);
  assert.match(verification, /pg_catalog\.to_regprocedure/);
  assert.match(verification, /pg_catalog\.count\(\*\) = 15/);
  assert.match(verification, /acl\.grantee <> proowner/);
  assert.match(verification, /COMPLETE_STORAGE_OBJECTS_POLICY_INVENTORY_EXACT/);
  assert.match(verification, /select pg_catalog\.count\(\*\) = 15 from actual/);
  assert.match(verification, /full join actual using \(name\)/);
  assert.doesNotMatch(verification, /relevant_expression|not like '% or %'|bucket_id = bucket_id/);
  assert.match(verification, /rollback;/);
  assert.doesNotMatch(verification, /^\s*(?:insert|update|delete|alter|create|drop|grant|revoke)\b/gim);
});

test("verifier pins complete schema function ACL trigger and Storage definitions", () => {
  for (const requiredOracle of [
    "student_achievement_documents_lifecycle_check",
    "pg_get_constraintdef",
    "pg_get_triggerdef",
    "pg_get_indexdef",
    "kgeo-exact-constraint-sha256",
    "kgeo-exact-trigger-sha256",
    "kgeo-exact-index-sha256",
    "prosecdef",
    "proconfig",
    "pg_catalog.has_function_privilege",
    "procedure_record.proname",
    "actual.command is distinct from expected.command",
    "actual.roles is distinct from expected.roles",
    "actual.using_sha256 is distinct from expected.using_sha256",
    "actual.check_sha256 is distinct from expected.check_sha256",
  ]) {
    assert.ok(verification.includes(requiredOracle));
  }
  assert.match(verification, /array\['a', 'd', 'r'\]::text\[\]/);
  assert.match(verification, /student_achievement_document_object_insert_student/);
  assert.match(verification, /students upload own marksheets/);
  assert.match(verification, /parent_report_attachment_object_delete_staff/);
});

// Hashes are pinned against the LF-normalized working tree. K-GEO-combine
// carries no git history, so src/test/setup.ts cannot fall back to committed
// blobs; the migration bytes themselves are unchanged from K-GEO-new.
test("historical migration bytes remain at their implementation baseline", () => {
  const expected = new Map([
    ["../../../supabase/migrations/202607190002_student_profile_foundation.sql", "370cf60acdef96ad57b5e1c384a1c4b29f7ee2f5cb0e822f77572c1db33c3219"],
    ["../../../supabase/migrations/202607260001_progression_evidence_foundation.sql", "c2161759110a1531ac3bb48189648c73123a89111f3d0aee29f78fd4075b9727"],
    ["../../../supabase/migrations/202608010001_university_application_documents_foundation.sql", "9cff3f5849fffa9d610b3d7a8bbab2ac0f04dc3e7729ca95bc46d0c0a6d548a1"],
    ["../../../supabase/migrations/202608240002_student_profile_documents.sql", "984aae4600646c6d780bccd127ce27552e03102aaabddeee8ed140385d0daf38"],
    ["../../../supabase/migrations/202608250005_parent_report_workflow.sql", "6308a713aaa10c90a02e47f3ceb3c1a4e4060a4de0a614970e6e8c0028a1dcbf"],
  ]);
  for (const [path, sha] of expected) {
    assert.equal(createHash("sha256").update(read(path)).digest("hex"), sha);
  }
});
