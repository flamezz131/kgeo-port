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
    if (
      specifier ===
      "@/lib/counselor/progression-evidence-submission"
    ) {
      return {
        shortCircuit: true,
        url: new URL(
          "./progression-evidence-submission.ts",
          import.meta.url,
        ).href,
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
  runProgressionEvidenceUpload,
} = require("./progression-evidence-upload.ts") as typeof import("./progression-evidence-upload");

type ProgressionEvidenceUploadPhase =
  import("./progression-evidence-upload").ProgressionEvidenceUploadPhase;

const evidenceId = "33333333-3333-4333-8333-333333333333";
const eventId = "22222222-2222-4222-8222-222222222222";
const studentId = "11111111-1111-4111-8111-111111111111";
const path = `${studentId}/${eventId}/${evidenceId}.pdf`;
const file = {
  name: "Student confirmation.pdf",
  type: "application/pdf",
  size: 320000,
};

function uploadIntent() {
  return {
    evidenceId,
    bucketId: "counseling-progression-evidence" as const,
    path,
    token: "temporary-token",
    uploadExpiresAt: "2026-07-26T07:00:00Z",
    originalFileName: file.name,
    mimeType: "application/pdf" as const,
    fileSizeBytes: file.size,
  };
}

test("signed upload uses one prepare upload finalize sequence with exact data", async () => {
  const phases: ProgressionEvidenceUploadPhase[] = [];
  const calls: unknown[][] = [];
  const result = await runProgressionEvidenceUpload(file, {
    getCurrentFile: () => file,
    onPhase: (phase) => phases.push(phase),
    prepare: async (selected) => {
      calls.push(["prepare", selected]);
      return { status: "success", upload: uploadIntent() };
    },
    upload: async (upload, selected) => {
      calls.push([
        "upload",
        upload.bucketId,
        upload.path,
        upload.token,
        selected,
        upload.mimeType,
      ]);
      return {
        data: {
          path: upload.path,
          fullPath: `${upload.bucketId}/${upload.path}`,
        },
        error: null,
      };
    },
    finalize: async (id) => {
      calls.push(["finalize", id]);
      return {
        status: "success",
        message: "Evidence uploaded successfully.",
      };
    },
  });
  assert.deepEqual(result, {
    status: "success",
    message: "Evidence uploaded successfully.",
  });
  assert.deepEqual(phases, [
    "validating",
    "preparing",
    "uploading",
    "finalizing",
    "succeeded",
  ]);
  assert.equal(calls.filter(([name]) => name === "upload").length, 1);
  assert.deepEqual(calls.at(-1), ["finalize", evidenceId]);
});

test("a changed selected file aborts before Storage upload", async () => {
  let uploadCalls = 0;
  let finalizeCalls = 0;
  const replacement = { ...file };
  const result = await runProgressionEvidenceUpload(file, {
    getCurrentFile: () => replacement,
    onPhase: () => undefined,
    prepare: async () => ({
      status: "success",
      upload: uploadIntent(),
    }),
    upload: async () => {
      uploadCalls += 1;
      return { data: null, error: true };
    },
    finalize: async () => {
      finalizeCalls += 1;
      return { status: "success", message: "unexpected" };
    },
  });
  assert.equal(result.status, "error");
  assert.equal(uploadCalls, 0);
  assert.equal(finalizeCalls, 0);
});

test("Storage failure never finalizes and explains reservation expiry", async () => {
  let finalizeCalls = 0;
  const result = await runProgressionEvidenceUpload(file, {
    getCurrentFile: () => file,
    onPhase: () => undefined,
    prepare: async () => ({
      status: "success",
      upload: uploadIntent(),
    }),
    upload: async () => ({
      data: null,
      error: new Error("private storage failure"),
    }),
    finalize: async () => {
      finalizeCalls += 1;
      return { status: "success", message: "unexpected" };
    },
  });
  assert.equal(finalizeCalls, 0);
  assert.equal(result.status, "error");
  assert.doesNotMatch(JSON.stringify(result), /private storage failure/);
  if (result.status === "error") {
    assert.match(result.message, /expire automatically/);
  }
});

test("finalization failure retains only the evidence ID for a safe retry", async () => {
  const result = await runProgressionEvidenceUpload(file, {
    getCurrentFile: () => file,
    onPhase: () => undefined,
    prepare: async () => ({
      status: "success",
      upload: uploadIntent(),
    }),
    upload: async (upload) => ({
      data: {
        path: upload.path,
        fullPath: `${upload.bucketId}/${upload.path}`,
      },
      error: null,
    }),
    finalize: async () => ({
      status: "error",
      message:
        "The file was uploaded, but finalization failed. Retry finalization.",
    }),
  });
  assert.deepEqual(result, {
    status: "error",
    message:
      "The file was uploaded, but finalization failed. Retry finalization.",
    retryFinalizeEvidenceId: evidenceId,
  });
  assert.doesNotMatch(
    JSON.stringify(result),
    /temporary-token|storage\/v1|counseling-progression-evidence/,
  );
});

test("invalid file metadata fails before preparation", async () => {
  let prepareCalls = 0;
  const result = await runProgressionEvidenceUpload(
    { name: "evidence.svg", type: "image/svg+xml", size: 100 },
    {
      getCurrentFile: () => null,
      onPhase: () => undefined,
      prepare: async () => {
        prepareCalls += 1;
        return { status: "success", upload: uploadIntent() };
      },
      upload: async () => ({ data: null, error: true }),
      finalize: async () => ({
        status: "success",
        message: "unexpected",
      }),
    },
  );
  assert.equal(result.status, "error");
  assert.equal(prepareCalls, 0);
});
