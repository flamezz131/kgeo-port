import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { StoragePolicyContract } from "./achievement-evidence-verifier";

const require = createRequire(import.meta.url);
const {
  STUDENT_ACHIEVEMENT_DOCUMENT_MAX_BYTES,
  parseStudentAchievementDocumentUploadIntent,
  parseStudentAchievementDocuments,
  validateAchievementEvidenceFile,
} = require("./achievement-evidence.ts") as typeof import("./achievement-evidence");
const { detectAchievementEvidenceMimeType } = require(
  "./achievement-evidence-signature.ts",
) as typeof import("./achievement-evidence-signature");
const {
  canDeleteAchievementWithEvidence,
  commitAuthenticatedAchievementEvidenceUpload,
  completeAchievementEvidenceRemoval,
  deleteAchievementEvidenceObject,
  finalizeAchievementEvidenceUpload,
  rejectInvalidAchievementEvidence,
  requestAchievementEvidenceRemoval,
} = require("./achievement-evidence-lifecycle.ts") as typeof import("./achievement-evidence-lifecycle");
const { storagePolicyInventoryMatches } = require(
  "./achievement-evidence-verifier.ts",
) as typeof import("./achievement-evidence-verifier");

const validJpeg = new Uint8Array([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x00,
  0xff, 0xd9,
]);

test("PDF JPEG and PNG evidence requires matching safe extensions", () => {
  for (const file of [
    { name: "Internship Certificate.pdf", type: "application/pdf", size: 100 },
    { name: "Award.JPG", type: "image/jpeg", size: 100 },
    { name: "Research Evidence.png", type: "image/png", size: 100 },
  ]) {
    assert.equal(validateAchievementEvidenceFile(file).success, true);
  }
  assert.equal(
    validateAchievementEvidenceFile({
      name: "certificate.png",
      type: "application/pdf",
      size: 100,
    }).success,
    false,
  );
});

test("unsupported empty oversized path and control files fail closed", () => {
  for (const file of [
    { name: "payload.exe", type: "application/octet-stream", size: 10 },
    { name: "bundle.zip", type: "application/zip", size: 10 },
    { name: "page.html", type: "text/html", size: 10 },
    { name: "vector.svg", type: "image/svg+xml", size: 10 },
    { name: "../certificate.pdf", type: "application/pdf", size: 10 },
    { name: "certificate\u202E.pdf", type: "application/pdf", size: 10 },
    { name: "certificate.pdf", type: "application/pdf", size: 0 },
    {
      name: "certificate.pdf",
      type: "application/pdf",
      size: STUDENT_ACHIEVEMENT_DOCUMENT_MAX_BYTES + 1,
    },
  ]) {
    assert.equal(validateAchievementEvidenceFile(file).success, false);
  }
});

test("display filenames normalize without becoming trusted storage paths", () => {
  assert.deepEqual(
    validateAchievementEvidenceFile({
      name: "  Internship   Certificate.pdf  ",
      type: "application/pdf",
      size: 1024,
    }),
    {
      success: true,
      data: {
        documentName: "Internship Certificate.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: 1024,
      },
    },
  );
});

test("trusted signatures identify supported PDF PNG and structured JPEG families", () => {
  assert.equal(
    detectAchievementEvidenceMimeType(new TextEncoder().encode("%PDF-1.7\n")),
    "application/pdf",
  );
  assert.equal(
    detectAchievementEvidenceMimeType(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    ),
    "image/png",
  );
  assert.equal(detectAchievementEvidenceMimeType(validJpeg), "image/jpeg");
});

test("renamed executable HTML ZIP SVG and malformed JPEG bytes are rejected", () => {
  for (const bytes of [
    new Uint8Array([0x4d, 0x5a, 0x90, 0x00]),
    new TextEncoder().encode("<html>not a pdf</html>"),
    new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
    new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'/>"),
    new Uint8Array([0xff, 0xd8, 0x01, 0x02, 0xff, 0xd9]),
  ]) {
    assert.equal(detectAchievementEvidenceMimeType(bytes), null);
  }
  assert.notEqual(
    detectAchievementEvidenceMimeType(new TextEncoder().encode("%PDF-1.7")),
    "image/png",
  );
});

test("upload intent requires the five-part nonce-protected server path", () => {
  const intent = {
    document_id: "30000000-0000-4000-8000-000000000003",
    achievement_id: "20000000-0000-4000-8000-000000000002",
    document_name: "Certificate.pdf",
    bucket_id: "student-achievement-documents",
    storage_path:
      "10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000002/30000000-0000-4000-8000-000000000003/40000000-0000-4000-8000-000000000004/30000000-0000-4000-8000-000000000003.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 1024,
    upload_expires_at: "2026-09-02T12:00:00Z",
  };
  assert.ok(parseStudentAchievementDocumentUploadIntent(intent));
  assert.equal(
    parseStudentAchievementDocumentUploadIntent({
      ...intent,
      storage_path: "another-student/certificate.pdf",
    }),
    null,
  );
});

test("safe lists reject private fields malformed rows and duplicates", () => {
  const row = {
    document_id: "30000000-0000-4000-8000-000000000003",
    achievement_id: "20000000-0000-4000-8000-000000000002",
    document_name: "Certificate.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 1024,
    status: "available",
    prepared_at: "2026-09-02T11:00:00Z",
    upload_expires_at: "2026-09-02T13:00:00Z",
    available_at: "2026-09-02T12:00:00Z",
  };
  assert.equal(parseStudentAchievementDocuments([row])?.length, 1);
  assert.equal(
    parseStudentAchievementDocuments([{ ...row, storage_path: "private" }]),
    null,
  );
  assert.equal(parseStudentAchievementDocuments([row, row]), null);
});

const pendingEvidence = {
  status: "pending" as const,
  objectPresent: false,
  removalReason: null,
};

test("cancellation wins against a delayed authenticated upload without an orphan", () => {
  const cancelled = requestAchievementEvidenceRemoval(pendingEvidence, "pending");
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.next.status, "removal_pending");
  const delayedUpload = commitAuthenticatedAchievementEvidenceUpload(cancelled.next);
  assert.equal(delayedUpload.accepted, false);
  assert.equal(delayedUpload.next.objectPresent, false);
  const removed = completeAchievementEvidenceRemoval(cancelled.next);
  assert.equal(removed.accepted, true);
  assert.equal(removed.next.status, "removed");
});

test("an in-flight upload that wins the row lock remains discoverable for deletion", () => {
  const uploaded = commitAuthenticatedAchievementEvidenceUpload(pendingEvidence);
  assert.equal(uploaded.accepted, true);
  const cancelled = requestAchievementEvidenceRemoval(uploaded.next, "pending");
  assert.equal(cancelled.accepted, true);
  assert.equal(cancelled.next.objectPresent, true);
  assert.equal(completeAchievementEvidenceRemoval(cancelled.next).accepted, false);
  const deleted = deleteAchievementEvidenceObject(cancelled.next);
  assert.equal(completeAchievementEvidenceRemoval(deleted.next).accepted, true);
});

test("cancel and finalize races obey the locked current state", () => {
  const uploaded = commitAuthenticatedAchievementEvidenceUpload(pendingEvidence).next;
  const finalizedFirst = finalizeAchievementEvidenceUpload(uploaded);
  assert.equal(finalizedFirst.next.status, "available");
  assert.equal(
    requestAchievementEvidenceRemoval(finalizedFirst.next, "pending").accepted,
    false,
  );

  const cancelledFirst = requestAchievementEvidenceRemoval(uploaded, "pending");
  assert.equal(cancelledFirst.next.status, "removal_pending");
  assert.equal(finalizeAchievementEvidenceUpload(cancelledFirst.next).accepted, false);
});

test("invalid signatures and repeated cleanup remain fail closed", () => {
  const uploaded = commitAuthenticatedAchievementEvidenceUpload(pendingEvidence).next;
  const rejected = rejectInvalidAchievementEvidence(uploaded);
  assert.equal(rejected.next.removalReason, "invalid_file");
  assert.equal(finalizeAchievementEvidenceUpload(rejected.next).accepted, false);
  const deleted = deleteAchievementEvidenceObject(rejected.next);
  const retry = requestAchievementEvidenceRemoval(deleted.next, "removal_pending");
  assert.equal(retry.accepted, true);
  const removed = completeAchievementEvidenceRemoval(retry.next);
  assert.equal(removed.next.status, "removed");
  assert.equal(completeAchievementEvidenceRemoval(removed.next).accepted, false);
});

test("object absence before reservation expiry is terminal only after cancellation", () => {
  assert.equal(completeAchievementEvidenceRemoval(pendingEvidence).accepted, false);
  const cancelled = requestAchievementEvidenceRemoval(pendingEvidence, "pending").next;
  assert.equal(completeAchievementEvidenceRemoval(cancelled).accepted, true);
  assert.equal(commitAuthenticatedAchievementEvidenceUpload(cancelled).accepted, false);
});

test("an object cannot reappear after cancellation or after reservation expiry", () => {
  const cancelled = requestAchievementEvidenceRemoval(pendingEvidence, "pending").next;
  assert.equal(commitAuthenticatedAchievementEvidenceUpload(cancelled, true).accepted, false);
  assert.equal(commitAuthenticatedAchievementEvidenceUpload(cancelled, false).accepted, false);
  const expiredPending = commitAuthenticatedAchievementEvidenceUpload(
    pendingEvidence,
    false,
  );
  assert.equal(expiredPending.accepted, false);
});

test("achievement deletion is blocked in every nonterminal evidence state", () => {
  for (const status of ["pending", "available", "removal_pending"] as const) {
    assert.equal(
      canDeleteAchievementWithEvidence([{ ...pendingEvidence, status }]),
      false,
    );
  }
  assert.equal(
    canDeleteAchievementWithEvidence([{ ...pendingEvidence, status: "removed" }]),
    true,
  );
});

test("policy inventory comparison rejects every unreviewed or altered policy", () => {
  const expectedPolicy: StoragePolicyContract = {
    name: "expected_insert",
    command: "INSERT",
    permissive: true,
    roles: ["authenticated"],
    usingExpression: null,
    checkExpression: "bucket_id = 'approved' AND helper(bucket_id, name)",
  };
  const approved: StoragePolicyContract[] = [expectedPolicy];
  assert.equal(storagePolicyInventoryMatches(approved, approved), true);

  for (const policy of [
    { ...expectedPolicy, name: "not_other", checkExpression: "NOT (bucket_id = 'other')" },
    { ...expectedPolicy, name: "broad_using", usingExpression: "true" },
    { ...expectedPolicy, name: "broad_check", checkExpression: "true" },
    { ...expectedPolicy, name: "case_policy", checkExpression: "CASE WHEN true THEN true END" },
    { ...expectedPolicy, name: "or_policy", checkExpression: "bucket_id = 'other' OR true" },
    { ...expectedPolicy, name: "all_policy", command: "ALL" as const },
    { ...expectedPolicy, name: "update_policy", command: "UPDATE" as const },
    { ...expectedPolicy, name: "unknown_policy" },
  ]) {
    assert.equal(storagePolicyInventoryMatches([...approved, policy], approved), false);
  }
  assert.equal(
    storagePolicyInventoryMatches(
      [{ ...expectedPolicy, checkExpression: "true" }],
      approved,
    ),
    false,
  );
  assert.equal(storagePolicyInventoryMatches([], approved), false);
});
