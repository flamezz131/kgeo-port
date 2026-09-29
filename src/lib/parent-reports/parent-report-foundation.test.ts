import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const migration = read("../../../supabase/migrations/202608250005_parent_report_workflow.sql");
const storageArtifact = read("../../../supabase/storage-owner/202608250005_parent_report_attachment_policies.sql");
const verification = read("../../../supabase/verification/202608250005_parent_report_workflow.sql");
const actions = read("../../app/actions/parent-report-actions.ts");
const component = read("../../components/parent-reports/parent-report-workspace.tsx");
const pdf = read("./pdf.ts");
const server = read("./server.ts");
const reportModel = read("./parent-report.ts");
const adminClient = read("../supabase/admin.ts");
const counselorPage = read("../../app/counselor/students/[student-id]/report/page.tsx");
const directorPage = read("../../app/director/reports/[report-id]/page.tsx");
const packageJson = JSON.parse(read("../../../package.json")) as { dependencies: Record<string, string> };

function functionBody(schema: "public" | "private", name: string): string {
  const match = migration.match(new RegExp(`create function ${schema}\\.${name}\\([\\s\\S]*?\\$function\\$;`));
  assert.ok(match, `${schema}.${name} must exist`);
  return match[0];
}

test("migration is one additive transactional Parent Report change", () => {
  assert.equal((migration.match(/^begin;/gm) ?? []).length, 1);
  assert.equal((migration.match(/^commit;/gm) ?? []).length, 1);
  assert.doesNotMatch(migration, /pg_catalog\.(?:coalesce|nullif|extract)\s*\(/i);
  assert.doesNotMatch(migration, /set role|reset role/i);
});

test("workflow domains remain separated into exact enums", () => {
  assert.match(migration, /create type public\.parent_report_status as enum[\s\S]*?'draft'[\s\S]*?'director_review'[\s\S]*?'revision_requested'[\s\S]*?'approved'[\s\S]*?'finalized'/);
  assert.match(migration, /create type public\.parent_report_attachment_source as enum[\s\S]*?'report_upload'[\s\S]*?'profile_document'[\s\S]*?'application_document'[\s\S]*?'progression_evidence'/);
});

test("all three workflow relations are sealed forced-RLS and policy-free", () => {
  for (const relation of ["parent_reports", "parent_report_events", "parent_report_attachments"]) {
    assert.match(migration, new RegExp(`alter table public\\.${relation} enable row level security;`));
    assert.match(migration, new RegExp(`alter table public\\.${relation} force row level security;`));
    assert.match(migration, new RegExp(`revoke all on table public\\.${relation}[\\s\\S]*?service_role;`));
  }
  assert.doesNotMatch(migration, /create policy[\s\S]*?on public\.parent_report/);
});

test("source snapshot uses approved parent-safe canonical sources", () => {
  const body = functionBody("private", "build_parent_report_source_snapshot");
  for (const source of ["student_profiles", "student_preferences", "student_test_scores", "student_achievements", "student_counseling_progressions", "student_university_applications", "counselor_student_semester_summaries"]) assert.match(body, new RegExp(`public\\.${source}`));
  const create = functionBody("public", "create_parent_report_draft");
  assert.match(create, /private\.build_parent_report_source_snapshot\(/);
  assert.doesNotMatch(create, /p_source_snapshot|p_source_json/);
  assert.doesNotMatch(actions, /sourceSnapshot|source_snapshot/);
});

test("private notes and individual follow-ups are absolute non-sources", () => {
  assert.doesNotMatch(migration, /counselor_student_notes|counselor_follow_ups/);
  assert.match(migration, /not \(source_snapshot \? 'private_notes'\)/);
  assert.match(component, /Private Counselor Notes and individual follow-ups are never report sources/);
  assert.doesNotMatch(pdf, /counselor_student_notes|counselor_follow_ups/);
});

test("structured source snapshot and editable narrative stay separate", () => {
  assert.match(migration, /source_snapshot jsonb not null/);
  for (const field of ["semester_overview", "strengths_highlights", "areas_requiring_attention", "next_actions", "counselor_remarks", "director_remarks"]) assert.match(migration, new RegExp(`${field} text`));
  assert.doesNotMatch(migration, /set[\s\S]{0,300}source_snapshot\s*=/i);
});

test("current Primary Counselor is re-derived for Counselor mutations", () => {
  for (const name of ["create_parent_report_draft", "save_counselor_parent_report_narrative", "submit_parent_report"]) {
    const body = functionBody("public", name);
    assert.match(body, /has_active_verified_kgeo_role\([\s\S]*?'counselor'/);
    assert.match(body, /is_active_primary_counselor_for_student/);
    assert.match(body, /security definer[\s\S]*?set search_path = ''/);
  }
});

test("Director queue follows current Primary ownership after reassignment", () => {
  const body = functionBody("public", "list_director_parent_reports");
  assert.match(body, /student_counselor_assignments as assignment/);
  assert.match(body, /assignment\.ended_at is null/);
  assert.match(body, /counselor\.id = assignment\.counselor_id/);
  assert.doesNotMatch(body, /counselor\.id = report\.created_by/);
});

test("Director review mutations require the trusted Director role", () => {
  for (const name of ["save_director_parent_report_narrative", "request_parent_report_revision", "approve_parent_report", "finalize_parent_report"]) {
    const body = functionBody("public", name);
    assert.match(body, /has_active_verified_kgeo_role\([\s\S]*?'director'/);
    assert.match(body, /security definer[\s\S]*?set search_path = ''/);
  }
});

test("admin is not an override and Students receive no report RPC grants", () => {
  assert.doesNotMatch(migration, /'admin'::public\.user_role|to student|to anon/i);
  assert.match(migration, /revoke all on function public\.%s from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*?service_role/);
});

test("workflow transitions are explicit and revision returns to Counselor", () => {
  assert.match(functionBody("public", "submit_parent_report"), /status = 'director_review'/);
  assert.match(functionBody("public", "request_parent_report_revision"), /status = 'revision_requested'/);
  assert.match(functionBody("public", "approve_parent_report"), /status = 'approved'/);
  assert.match(functionBody("public", "finalize_parent_report"), /status = 'finalized'/);
});

test("finalization accepts only approved reports and records immutable artifact integrity", () => {
  const body = functionBody("public", "finalize_parent_report");
  assert.match(body, /v_report\.status <> 'approved'/);
  assert.match(body, /v_actual_size <> p_file_size_bytes/);
  assert.match(body, /v_actual_mime_type <> 'application\/pdf'/);
  assert.match(body, /final_pdf_size_bytes = v_actual_size/);
  assert.match(body, /final_pdf_sha256 = p_sha256/);
  assert.match(migration, /final_pdf_sha256 ~ '\^\[0-9a-f\]\{64\}\$'/);
});

test("corrections create a new version while one editable period remains unique", () => {
  assert.match(migration, /create unique index parent_reports_one_active_period_idx[\s\S]*?where status <> 'finalized'/);
  const body = functionBody("public", "create_parent_report_draft");
  assert.match(body, /max\(report\.version_number\)[\s\S]*?\+ 1/);
  assert.match(body, /'new_version_created'/);
});

test("audit events snapshot narrative and attachment manifest append-only", () => {
  const body = functionBody("private", "append_parent_report_event");
  assert.match(body, /insert into public\.parent_report_events/);
  assert.match(body, /parent_report_narrative_snapshot/);
  assert.match(body, /parent_report_attachment_manifest/);
  assert.doesNotMatch(migration, /update public\.parent_report_events|delete from public\.parent_report_events/);
});

test("attachment lifecycle is limited to PDF JPEG PNG and 10 MB each", () => {
  assert.match(migration, /mime_type in \('application\/pdf', 'image\/jpeg', 'image\/png'\)/);
  assert.match(migration, /file_size_bytes between 1 and 10485760/);
  assert.match(migration, /attachment limit has been reached/);
});

test("existing Profile Document selection is intentionally restricted to Test Score", () => {
  const list = functionBody("public", "list_parent_report_attachment_candidates");
  const add = functionBody("public", "add_parent_report_existing_attachment");
  assert.match(list, /document\.document_type = 'test_score'/);
  assert.match(add, /document\.document_type =[\s\S]*?'test_score'/);
  assert.doesNotMatch(list, /passport|financial_document|\bsop\b|\blor\b/);
});

test("application documents and progression evidence require exact Student linkage", () => {
  const body = functionBody("public", "add_parent_report_existing_attachment");
  assert.match(body, /application\.student_id = v_report\.student_id/);
  assert.match(body, /progression_event\.student_id = v_report\.student_id/);
  assert.match(body, /status =[\s\S]*?'available'/);
});

test("report-specific object upload is reservation path user expiry and edit-state bound", () => {
  const body = functionBody("public", "can_upload_parent_report_object");
  assert.match(body, /attachment\.added_by = \(select auth\.uid\(\)\)/);
  assert.match(body, /attachment\.upload_expires_at > pg_catalog\.statement_timestamp\(\)/);
  assert.match(body, /private\.can_edit_parent_report\(attachment\.report_id\)/);
});

test("attachment finalization requires exact live Storage size and MIME metadata", () => {
  const body = functionBody("public", "finalize_parent_report_attachment_upload");
  assert.match(body, /storage_object\.bucket_id = v_attachment\.bucket_id/);
  assert.match(body, /storage_object\.name = v_attachment\.storage_path/);
  assert.match(body, /metadata ->> 'size'/);
  assert.match(body, /v_actual_size is null/);
  assert.match(body, /v_actual_size <> v_attachment\.file_size_bytes/);
  assert.match(body, /v_actual_size not between 1 and 10485760/);
  assert.match(body, /metadata ->> 'mimetype'/);
  assert.match(body, /v_actual_mime_type <> v_attachment\.mime_type/);
  assert.match(body, /v_actual_mime_type not in \([\s\S]*?'application\/pdf'[\s\S]*?'image\/jpeg'[\s\S]*?'image\/png'/);
  assert.match(body, /set\s+status = 'available'[\s\S]*?where attachment\.id = v_attachment\.id/);
});

test("available report uploads require removal state and audit before Storage deletion", () => {
  const remove = functionBody("public", "remove_parent_report_attachment");
  const deleteGuard = functionBody("public", "can_delete_parent_report_object");
  assert.match(remove, /v_attachment\.status <>[\s\S]*?'available'/);
  assert.match(remove, /status = 'removed'/);
  assert.match(remove, /removed_by = v_caller_id/);
  assert.match(remove, /removed_at = pg_catalog\.statement_timestamp\(\)/);
  assert.match(remove, /'attachment_removed'/);
  assert.doesNotMatch(deleteGuard, /attachment\.status\s*=\s*'available'/);
  assert.match(deleteGuard, /private\.can_edit_parent_report\(attachment\.report_id\) is true/);
  assert.match(deleteGuard, /attachment\.status =[\s\S]*?'removed'/);
  assert.match(deleteGuard, /attachment\.removed_by = \(select auth\.uid\(\)\)/);
  assert.match(deleteGuard, /attachment\.removed_at >[\s\S]*?interval '5 minutes'/);
});

test("pending cleanup is uploader-bound and cannot bypass current workflow authorization", () => {
  const deleteGuard = functionBody("public", "can_delete_parent_report_object");
  const editGuard = functionBody("private", "can_edit_parent_report");
  assert.match(deleteGuard, /attachment\.status =[\s\S]*?'pending'/);
  assert.match(deleteGuard, /attachment\.added_by = \(select auth\.uid\(\)\)/);
  assert.match(deleteGuard, /private\.can_edit_parent_report/);
  assert.match(editGuard, /is_active_primary_counselor_for_student/);
  assert.match(editGuard, /v_report\.status = 'director_review'[\s\S]*?'director'/);
});

test("Storage-owner artifact is minimal and preserves Storage ownership", () => {
  assert.equal((storageArtifact.match(/^create policy/gm) ?? []).length, 3);
  assert.match(storageArtifact, /for insert[\s\S]*?to authenticated[\s\S]*?can_upload_parent_report_object/);
  assert.match(storageArtifact, /for select[\s\S]*?to authenticated[\s\S]*?can_view_parent_report_object/);
  assert.match(storageArtifact, /for delete[\s\S]*?to authenticated[\s\S]*?can_delete_parent_report_object/);
  assert.doesNotMatch(storageArtifact, /set role|alter .* owner|create policy[\s\S]*?for update/i);
});

test("normal migration never changes storage.objects policies or ownership", () => {
  assert.doesNotMatch(migration, /create policy[\s\S]*?storage\.objects|drop policy[\s\S]*?storage\.objects/);
  assert.doesNotMatch(migration, /alter (?:table )?storage\./i);
});

test("read-only verifier checks live sealed ACL Storage and final artifact state", () => {
  for (const check of ["SEALED_RELATIONS_EXACT", "NO_BROWSER_TABLE_POLICIES", "PRIVATE_BUCKET_EXACT", "WORKFLOW_FUNCTIONS_INSTALLED", "STORAGE_POLICIES_EXACT", "SOURCE_BUILDER_EXCLUDES_PRIVATE_RECORDS", "AVAILABLE_REPORT_UPLOADS_HAVE_EXACT_STORAGE_METADATA", "FINALIZED_REPORTS_ARE_COMPLETE"]) assert.match(verification, new RegExp(check));
  assert.match(verification, /^begin transaction read only;/m);
  assert.match(verification, /^rollback;/m);
  assert.doesNotMatch(verification, /^\s*(?:create|alter|drop|insert|update|delete|grant|revoke)\b/im);
});

test("PDF generator creates exactly two core pages before attachments", () => {
  assert.equal((pdf.match(/document\.addPage\(\[A4_WIDTH, A4_HEIGHT\]\)/g) ?? []).length, 3);
  assert.match(pdf, /const pageOne = document\.addPage/);
  assert.match(pdf, /const pageTwo = document\.addPage/);
  assert.match(pdf, /for \(const attachment of attachments\)/);
  assert.match(pdf, /Core page \$\{pageNumber\} of 2/);
});

test("PDF has no numeric readiness score and omits empty facts safely", () => {
  assert.doesNotMatch(pdf, /readiness score|score percentage|numeric readiness/i);
  assert.match(pdf, /No information recorded/);
  assert.match(pdf, /filter\(Boolean\)/);
});

test("preview loaders reauthorize by role and fetch selected objects server-side", () => {
  assert.match(server, /requireCounselor/);
  assert.match(server, /requireDirector/);
  assert.match(server, /createAdminClient/);
  assert.match(server, /attachment\.file_size_bytes/);
  assert.match(counselorPage, /loadCounselorParentReports/);
  assert.match(directorPage, /loadDirectorParentReport/);
});

test("Server Actions expose generic failures and never log credentials", () => {
  assert.doesNotMatch(actions, /console\.|SUPABASE_SERVICE_ROLE_KEY|Authorization|technical email/i);
  assert.match(actions, /requireCounselor/);
  assert.match(actions, /requireDirector/);
  assert.match(actions, /createHash\("sha256"\)/);
});

test("final PDF upload uses deterministic private version path before database finalization", () => {
  assert.match(actions, /const admin = createAdminClient\(\)/);
  assert.match(actions, /admin\.storage[\s\S]*?\.upload\(path, pdf/);
  assert.match(actions, /final\/\$\{payload\.student_id\}\/\$\{payload\.report_id\}\/v\$\{payload\.version_number\}\.pdf/);
  assert.match(actions, /\.rpc\("finalize_parent_report"/);
  assert.match(actions, /contentType: "application\/pdf"/);
  assert.match(adminClient, /^import "server-only";/m);
  assert.match(adminClient, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(component, /createAdminClient|SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey/);
  assert.doesNotMatch(storageArtifact, /final\/.+for insert|for insert[\s\S]*?final\//i);
});

test("existing document systems remain read-only report sources", () => {
  for (const relation of [
    "student_profile_documents",
    "student_university_application_documents",
    "student_counseling_progression_evidence",
  ]) {
    assert.doesNotMatch(
      migration,
      new RegExp(`(?:alter|update|delete from|insert into) public\\.${relation}`, "i"),
    );
  }
  assert.match(reportModel, /containsForbiddenPrivateSource/);
});

test("UI exposes Counselor drafting and Director revision approval finalization", () => {
  for (const text of ["Create Draft", "Submit to Director", "Request Revision", "Approve Report", "Finalize Report", "Download Final PDF"]) assert.match(component, new RegExp(text));
  assert.match(component, /viewerRole === "counselor"/);
  assert.match(component, /viewerRole === "director"/);
});

test("PDF dependency is the only dedicated generation primitive", () => {
  assert.equal(packageJson.dependencies["pdf-lib"], "^1.17.1");
  assert.doesNotMatch(actions, /puppeteer|playwright|window\.print/);
});
