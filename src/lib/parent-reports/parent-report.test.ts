import assert from "node:assert/strict";
import test from "node:test";
// @ts-expect-error Node's test runner loads this TypeScript module directly.
import { containsForbiddenPrivateSource, isAllowedParentReportAttachment, normalizeParentReportText, parseDirectorParentReportList, parseParentReportAttachmentCandidates, parseParentReportList, parseParentReportRenderPayload, parseParentReportWorkspace } from "./parent-report.ts";

const reportId = "11111111-1111-4111-8111-111111111111";
const studentId = "22222222-2222-4222-8222-222222222222";
const attachmentId = "33333333-3333-4333-8333-333333333333";
const eventId = "44444444-4444-4444-8444-444444444444";
const timestamp = "2026-08-25T10:00:00+05:30";

const sourceSnapshot = { schema_version: 1, captured_at: timestamp, academic_period: "Semester 6 · 2026", student: { full_name: "Student A", roll_number: "KCT001" }, preferences: {}, achievements: [], study_abroad_exams: [], journey_progress: {}, applications: [], semester_summary: {} };
const workspace = {
  report: { report_id: reportId, student_id: studentId, academic_period: "Semester 6 · 2026", version_number: 1, status: "draft", source_snapshot: sourceSnapshot, semester_overview: "Steady academic progress", strengths_highlights: null, areas_requiring_attention: null, next_actions: null, counselor_remarks: null, director_remarks: null, created_at: timestamp, updated_at: timestamp, submitted_at: null, reviewed_at: null, approved_at: null, finalized_at: null, final_pdf_available: false, viewer_role: "counselor" },
  attachments: [{ attachment_id: attachmentId, source_type: "profile_document", display_name: "IELTS score", mime_type: "application/pdf", file_size_bytes: 1024, sort_order: 1 }],
  events: [{ event_id: eventId, event_type: "created", from_status: null, to_status: "draft", actor_name: "Counselor A", event_reason: null, occurred_at: timestamp }],
};

test("narrative normalization is whitespace-safe", () => {
  assert.equal(normalizeParentReportText("  Strong   progress\nthis term "), "Strong progress this term");
});

test("recursive private-note source keys fail closed", () => {
  assert.equal(containsForbiddenPrivateSource({ nested: { private_notes: [] } }), true);
  assert.equal(containsForbiddenPrivateSource({ private_follow_ups: [] }), true);
  assert.equal(containsForbiddenPrivateSource({ privateFollowUp: [] }), true);
  assert.equal(containsForbiddenPrivateSource(sourceSnapshot), false);
});

test("strict Parent Report workspace parses", () => {
  const parsed = parseParentReportWorkspace(workspace);
  assert.equal(parsed?.report.report_id, reportId);
  assert.equal(parsed?.attachments.length, 1);
});

test("workspace rejects unknown browser-visible fields", () => {
  assert.equal(parseParentReportWorkspace({ ...workspace, auth_uuid: studentId }), null);
  assert.equal(parseParentReportWorkspace({ ...workspace, report: { ...workspace.report, technical_email: "hidden@example.test" } }), null);
});

test("workspace rejects private content nested inside source snapshot", () => {
  assert.equal(parseParentReportWorkspace({ ...workspace, report: { ...workspace.report, source_snapshot: { ...sourceSnapshot, student: { private_notes: "hidden" } } } }), null);
});

test("workspace rejects invalid attachment MIME and size", () => {
  assert.equal(parseParentReportWorkspace({ ...workspace, attachments: [{ ...workspace.attachments[0], mime_type: "text/plain" }] }), null);
  assert.equal(parseParentReportWorkspace({ ...workspace, attachments: [{ ...workspace.attachments[0], file_size_bytes: 11 * 1024 * 1024 }] }), null);
});

test("attachment file validation binds MIME extension and size", () => {
  assert.equal(isAllowedParentReportAttachment({ name: "score.pdf", type: "application/pdf", size: 100 }), true);
  assert.equal(isAllowedParentReportAttachment({ name: "score.png", type: "application/pdf", size: 100 }), false);
  assert.equal(isAllowedParentReportAttachment({ name: "score.exe", type: "application/octet-stream", size: 100 }), false);
  assert.equal(isAllowedParentReportAttachment({ name: "score.pdf", type: "application/pdf", size: 0 }), false);
  assert.equal(isAllowedParentReportAttachment({ name: "score.pdf", type: "application/pdf", size: 11 * 1024 * 1024 }), false);
});

test("Counselor report list is strict and bounded", () => {
  const item = { report_id: reportId, academic_period: "Semester 6", version_number: 1, status: "draft", updated_at: timestamp, finalized_at: null };
  assert.equal(parseParentReportList([item])?.length, 1);
  assert.equal(parseParentReportList([{ ...item, student_id: studentId }]), null);
  assert.equal(parseParentReportList(Array.from({ length: 21 }, () => item)), null);
});

test("Director list requires bounded Student and Counselor display names", () => {
  const item = { report_id: reportId, student_id: studentId, student_name: "Student A", counselor_name: "Counselor A", academic_period: "Semester 6", version_number: 1, status: "director_review", updated_at: timestamp, finalized_at: null };
  assert.equal(parseDirectorParentReportList([item])?.[0]?.status, "director_review");
  assert.equal(parseDirectorParentReportList([{ ...item, counselor_name: "" }]), null);
});

test("existing attachment candidates reject report uploads and extra fields", () => {
  const candidate = { source_type: "profile_document", source_document_id: attachmentId, display_name: "IELTS score", mime_type: "application/pdf", file_size_bytes: 1024 };
  assert.equal(parseParentReportAttachmentCandidates([candidate])?.length, 1);
  assert.equal(parseParentReportAttachmentCandidates([{ ...candidate, source_type: "report_upload" }]), null);
  assert.equal(parseParentReportAttachmentCandidates([{ ...candidate, storage_path: "hidden" }]), null);
});

test("render payload permits server-only paths and rejects private snapshot fields", () => {
  const payload = { report_id: reportId, student_id: studentId, academic_period: "Semester 6 · 2026", version_number: 1, status: "approved", source_snapshot: sourceSnapshot, semester_overview: null, strengths_highlights: null, areas_requiring_attention: null, next_actions: null, counselor_remarks: null, director_remarks: null, counselor_name: "Counselor A", director_name: "Director A", approved_at: timestamp, finalized_at: null, final_pdf_bucket_id: null, final_pdf_storage_path: null, attachments: [{ attachment_id: attachmentId, display_name: "IELTS score", bucket_id: "student-profile-documents", storage_path: `${studentId}/score.pdf`, mime_type: "application/pdf", file_size_bytes: 1024, sort_order: 1 }] };
  assert.equal(parseParentReportRenderPayload(payload)?.status, "approved");
  assert.equal(parseParentReportRenderPayload({ ...payload, source_snapshot: { ...sourceSnapshot, private_follow_ups: [] } }), null);
});
