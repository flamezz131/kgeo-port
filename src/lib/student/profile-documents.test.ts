import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  STUDENT_PROFILE_DOCUMENT_MAX_BYTES,
  STUDENT_PROFILE_DOCUMENT_TYPES,
  parseProfileDocumentList,
  validateProfileDocumentDisplayName,
  validateProfileDocumentFile,
  validateProfileDocumentType,
} = require("./profile-documents.ts") as typeof import("./profile-documents");

test("profile document categories are exact and exclude Resume and Marksheet", () => {
  assert.deepEqual(STUDENT_PROFILE_DOCUMENT_TYPES, [
    "passport",
    "academic_transcript",
    "test_score",
    "sop",
    "lor",
    "financial_document",
    "other_supporting_document",
  ]);
  assert.equal(validateProfileDocumentType("resume").success, false);
  assert.equal(validateProfileDocumentType("marksheet").success, false);
  assert.equal(validateProfileDocumentType("passport").success, true);
});

test("display names normalize safely and reject controls", () => {
  assert.deepEqual(validateProfileDocumentDisplayName("  Visa   Passport  "), {
    success: true,
    data: "Visa Passport",
  });
  assert.equal(validateProfileDocumentDisplayName("A\u202E.pdf").success, false);
});

test("PDF JPEG and PNG require matching extensions", () => {
  for (const file of [
    { name: "passport.pdf", type: "application/pdf", size: 100 },
    { name: "score.JPG", type: "image/jpeg", size: 100 },
    { name: "transcript.png", type: "image/png", size: 100 },
  ]) {
    assert.equal(validateProfileDocumentFile(file).success, true);
  }
  assert.equal(
    validateProfileDocumentFile({
      name: "passport.png",
      type: "application/pdf",
      size: 100,
    }).success,
    false,
  );
});

test("unsupported MIME archives executables and oversized files are rejected", () => {
  for (const file of [
    { name: "payload.exe", type: "application/octet-stream", size: 10 },
    { name: "bundle.zip", type: "application/zip", size: 10 },
    { name: "resume.pdf", type: "application/pdf", size: STUDENT_PROFILE_DOCUMENT_MAX_BYTES + 1 },
  ]) {
    assert.equal(validateProfileDocumentFile(file).success, false);
  }
});

test("safe document lists reject private fields malformed rows and duplicates", () => {
  const row = {
    document_id: "10000000-0000-4000-8000-000000000001",
    document_type: "passport",
    display_name: "Passport",
    original_file_name: "passport.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 1024,
    available_at: "2026-08-24T10:00:00Z",
  };
  assert.equal(parseProfileDocumentList([row])?.length, 1);
  assert.equal(parseProfileDocumentList([{ ...row, storage_path: "private" }]), null);
  assert.equal(parseProfileDocumentList([row, row]), null);
});
