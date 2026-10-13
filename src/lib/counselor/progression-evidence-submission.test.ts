import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown,
) => unknown;
const { registerHooks } = require("node:module") as {
  registerHooks: (hooks: { resolve: ResolveHook }) => void;
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/counselor/progression-evidence") {
      return {
        shortCircuit: true,
        url: new URL("./progression-evidence.ts", import.meta.url).href,
      };
    }
    if (specifier === "@/lib/counselor/progression") {
      return {
        shortCircuit: true,
        url: new URL("./progression.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  submitProgressionEvidenceFinalize,
  submitProgressionEvidencePrepare,
  submitProgressionEvidenceRemove,
  validateProgressionEvidencePrepareFormData,
  validateProgressionEvidenceRemoveFormData,
} = require("./progression-evidence-submission.ts") as typeof import("./progression-evidence-submission");

const studentId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const evidenceId = "33333333-3333-4333-8333-333333333333";
const counselorId = "44444444-4444-4444-8444-444444444444";
const storagePath = `${studentId}/${eventId}/${evidenceId}.pdf`;
const now = new Date("2026-07-26T05:00:00Z");

function prepareForm(): FormData {
  const formData = new FormData();
  formData.set("studentId", studentId);
  formData.set("progressionEventId", eventId);
  formData.set("originalFileName", "Student confirmation.pdf");
  formData.set("mimeType", "application/pdf");
  formData.set("fileSizeBytes", "320000");
  return formData;
}

function referenceForm(): FormData {
  const formData = new FormData();
  formData.set("studentId", studentId);
  formData.set("progressionEventId", eventId);
  formData.set("evidenceId", evidenceId);
  return formData;
}

function uploadIntent(overrides: Record<string, unknown> = {}) {
  return {
    evidence_id: evidenceId,
    progression_event_id: eventId,
    bucket_id: "counseling-progression-evidence",
    storage_path: storagePath,
    original_file_name: "Student confirmation.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 320000,
    upload_expires_at: "2026-07-26T06:59:30Z",
    ...overrides,
  };
}

function evidenceRow(
  status: "pending" | "available" | "removed",
  overrides: Record<string, unknown> = {},
) {
  const availableAt =
    status === "pending" ? null : "2026-07-26T05:10:00Z";
  const removedAt =
    status === "removed" ? "2026-07-26T05:20:00Z" : null;
  return {
    id: evidenceId,
    progression_event_id: eventId,
    bucket_id: "counseling-progression-evidence",
    storage_path: storagePath,
    original_file_name: "Student confirmation.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 320000,
    status,
    uploaded_by: counselorId,
    prepared_at: "2026-07-26T05:00:00Z",
    upload_expires_at: "2026-07-26T07:00:00Z",
    available_at: availableAt,
    removed_at: removedAt,
    removed_by: status === "removed" ? counselorId : null,
    removal_reason:
      status === "removed" ? "Incorrect supporting file" : null,
    created_at: "2026-07-26T05:00:00Z",
    updated_at:
      removedAt ?? availableAt ?? "2026-07-26T05:00:00Z",
    ...overrides,
  };
}

test("prepare validation rejects duplicate unknown and protected browser fields", () => {
  for (const field of [
    "storagePath",
    "bucketId",
    "evidenceId",
    "uploadedBy",
    "counselorId",
    "status",
    "uploadExpiresAt",
    "signedUrl",
    "uploadToken",
    "studentName",
    "redirectUrl",
  ]) {
    const formData = prepareForm();
    formData.set(field, "injected");
    assert.equal(
      validateProgressionEvidencePrepareFormData(formData).success,
      false,
      field,
    );
  }

  const duplicate = prepareForm();
  duplicate.append("mimeType", "image/png");
  assert.equal(
    validateProgressionEvidencePrepareFormData(duplicate).success,
    false,
  );
});

test("prepare verifies the trusted target and returns only the installed signed-upload contract", async () => {
  const calls: string[] = [];
  const result = await submitProgressionEvidencePrepare(
    prepareForm(),
    {
      verifyTarget: async (student, event) => {
        calls.push(`verify:${student}:${event}`);
        return { valid: true, error: null };
      },
      prepare: async (event, file) => {
        calls.push(
          `prepare:${event}:${file.originalFileName}:${file.mimeType}:${file.fileSizeBytes}`,
        );
        return { data: uploadIntent(), error: null };
      },
      createSignedUpload: async (bucket, path) => {
        calls.push(`sign:${bucket}:${path}`);
        return {
          data: {
            signedUrl:
              "https://project.supabase.co/storage/v1/object/upload/sign/path?token=secret",
            token: "temporary-token",
            path,
          },
          error: null,
        };
      },
    },
    now,
  );

  assert.equal(result.status, "success");
  if (result.status !== "success") return;
  assert.deepEqual(Object.keys(result.upload).sort(), [
    "bucketId",
    "evidenceId",
    "fileSizeBytes",
    "mimeType",
    "originalFileName",
    "path",
    "token",
    "uploadExpiresAt",
  ]);
  assert.equal(calls.length, 3);
  assert.equal(result.upload.path, storagePath);
  assert.equal(result.upload.token, "temporary-token");
  assert.doesNotMatch(JSON.stringify(result), /signedUrl|counselorId/);
});

test("prepare rejects target, malformed intent, concurrency, and five-file failures safely", async () => {
  const baseStore = {
    verifyTarget: async () => ({ valid: true, error: null }),
    prepare: async () => ({ data: uploadIntent(), error: null }),
    createSignedUpload: async () => ({
      data: {
        signedUrl:
          "https://project.supabase.co/storage/v1/object/upload/sign/path?token=secret",
        token: "temporary-token",
        path: storagePath,
      },
      error: null,
    }),
  };

  const denied = await submitProgressionEvidencePrepare(
    prepareForm(),
    {
      ...baseStore,
      verifyTarget: async () => ({ valid: false, error: null }),
    },
    now,
  );
  assert.deepEqual(denied, {
    status: "error",
    message: "Evidence upload could not be prepared.",
  });

  const malformed = await submitProgressionEvidencePrepare(
    prepareForm(),
    {
      ...baseStore,
      prepare: async () => ({
        data: uploadIntent({ storage_path: "browser/path.pdf" }),
        error: null,
      }),
    },
    now,
  );
  assert.equal(malformed.status, "error");

  for (const [error, message] of [
    [
      { code: "40001", message: "private detail" },
      "Another evidence operation is currently in progress.",
    ],
    [
      {
        code: "22023",
        message:
          "This progression event already has five active evidence files",
      },
      "This progression event already has the maximum number of evidence files.",
    ],
  ] as const) {
    const failed = await submitProgressionEvidencePrepare(
      prepareForm(),
      {
        ...baseStore,
        prepare: async () => ({ data: null, error }),
      },
      now,
    );
    assert.equal(failed.status, "error");
    if (failed.status === "error") assert.equal(failed.message, message);
    assert.doesNotMatch(JSON.stringify(failed), /private detail/);
  }
});

test("finalization verifies pending ownership and calls the RPC with evidence ID only", async () => {
  const calls: unknown[] = [];
  const result = await submitProgressionEvidenceFinalize(
    referenceForm(),
    {
      verifyTarget: async (student, event) => {
        calls.push(["verify", student, event]);
        return { valid: true, error: null };
      },
      loadEvidence: async (id) => {
        calls.push(["load", id]);
        return { data: evidenceRow("pending"), error: null };
      },
      finalize: async (id) => {
        calls.push(["finalize", id]);
        return { data: evidenceRow("available"), error: null };
      },
    },
  );
  assert.equal(result.status, "success");
  assert.deepEqual(calls.at(-1), ["finalize", evidenceId]);
});

test("finalization rejects wrong target status malformed responses and maps retry safely", async () => {
  const baseStore = {
    verifyTarget: async () => ({ valid: true, error: null }),
    loadEvidence: async () => ({
      data: evidenceRow("pending"),
      error: null,
    }),
    finalize: async () => ({
      data: evidenceRow("available"),
      error: null,
    }),
  };
  for (const store of [
    {
      ...baseStore,
      verifyTarget: async () => ({ valid: false, error: null }),
    },
    {
      ...baseStore,
      loadEvidence: async () => ({
        data: evidenceRow("available"),
        error: null,
      }),
    },
    {
      ...baseStore,
      finalize: async () => ({
        data: evidenceRow("available", { progression_event_id: uuid(9) }),
        error: null,
      }),
    },
  ]) {
    const result = await submitProgressionEvidenceFinalize(
      referenceForm(),
      store,
    );
    assert.equal(result.status, "error");
  }

  const retry = await submitProgressionEvidenceFinalize(
    referenceForm(),
    {
      ...baseStore,
      finalize: async () => ({
        data: null,
        error: {
          code: "22023",
          message: "The uploaded evidence object was not found",
        },
      }),
    },
  );
  assert.equal(retry.status, "error");
  if (retry.status === "error") {
    assert.equal(
      retry.message,
      "The file was uploaded, but finalization failed. Retry finalization.",
    );
  }
});

test("removal normalizes its reason and preserves the audit-only RPC contract", async () => {
  const formData = referenceForm();
  formData.set("removalReason", "  Incorrect   supporting file  ");
  let removalArguments: unknown[] = [];
  const result = await submitProgressionEvidenceRemove(formData, {
    verifyTarget: async () => ({ valid: true, error: null }),
    loadEvidence: async () => ({
      data: evidenceRow("available"),
      error: null,
    }),
    remove: async (id, reason) => {
      removalArguments = [id, reason];
      return {
        data: {
          evidence_id: evidenceId,
          bucket_id: "counseling-progression-evidence",
          storage_path: storagePath,
          status: "removed",
          removed_at: "2026-07-26T05:20:00Z",
        },
        error: null,
      };
    },
  });
  assert.deepEqual(removalArguments, [
    evidenceId,
    "Incorrect supporting file",
  ]);
  assert.deepEqual(result, {
    status: "success",
    message: "Evidence removed from counselor access.",
  });
});

test("removal rejects empty oversized duplicate unknown and protected values", () => {
  const empty = referenceForm();
  empty.set("removalReason", "   ");
  assert.equal(
    validateProgressionEvidenceRemoveFormData(empty).success,
    false,
  );

  const oversized = referenceForm();
  oversized.set("removalReason", "x".repeat(501));
  assert.equal(
    validateProgressionEvidenceRemoveFormData(oversized).success,
    false,
  );

  for (const field of ["status", "removedBy", "removedAt", "storagePath"]) {
    const injected = referenceForm();
    injected.set("removalReason", "Incorrect file");
    injected.set(field, "injected");
    assert.equal(
      validateProgressionEvidenceRemoveFormData(injected).success,
      false,
    );
  }
});

function uuid(sequence: number): string {
  return `50000000-0000-4000-8000-${sequence.toString(16).padStart(12, "0")}`;
}
