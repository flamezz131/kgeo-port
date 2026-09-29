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
    if (specifier === "@/lib/counselor/university-application-documents") {
      return {
        shortCircuit: true,
        url: new URL("./university-application-documents.ts", import.meta.url).href,
      };
    }
    if (
      specifier ===
      "@/lib/counselor/university-application-document-submission"
    ) {
      return {
        shortCircuit: true,
        url: new URL(
          "./university-application-document-submission.ts",
          import.meta.url,
        ).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { runUniversityApplicationDocumentUpload } = require(
  "./university-application-document-upload.ts",
) as typeof import("./university-application-document-upload");
type UniversityApplicationDocumentUploadCapability =
  import("./university-application-document-submission").UniversityApplicationDocumentUploadCapability;

const applicationId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";
const path = `applications/11111111-1111-4111-8111-111111111111/${applicationId}/${documentId}/${documentId}.pdf`;

function file(): File {
  return new File([new Uint8Array([1, 2, 3])], "offer.pdf", {
    type: "application/pdf",
    lastModified: 10,
  });
}

function capability(): UniversityApplicationDocumentUploadCapability {
  return {
    documentId,
    bucketId: "university-application-documents",
    path,
    token: "private-token",
    mimeType: "application/pdf",
  };
}

test("upload follows prepare upload finalize success phases exactly once", async () => {
  const selected = file();
  const phases: string[] = [];
  let prepareCalls = 0;
  let uploadCalls = 0;
  let finalizeCalls = 0;
  const result = await runUniversityApplicationDocumentUpload(
    applicationId,
    "  Offer   letter ",
    selected,
    {
      getCurrentFile: () => selected,
      onPhase: (phase) => phases.push(phase),
      prepare: async (input) => {
        prepareCalls += 1;
        assert.equal(input.documentTitle, "Offer letter");
        return { status: "success", upload: capability() };
      },
      upload: async (upload, receivedFile) => {
        uploadCalls += 1;
        assert.equal(upload.token, "private-token");
        assert.equal(receivedFile, selected);
        return {
          data: { path, fullPath: `university-application-documents/${path}` },
          error: null,
        };
      },
      finalize: async (receivedDocumentId) => {
        finalizeCalls += 1;
        assert.equal(receivedDocumentId, documentId);
        return {
          status: "success",
          message: "Document uploaded successfully.",
          applicationId,
          documentId,
        };
      },
    },
  );
  assert.deepEqual(phases, ["preparing", "uploading", "finalizing", "succeeded"]);
  assert.equal(prepareCalls, 1);
  assert.equal(uploadCalls, 1);
  assert.equal(finalizeCalls, 1);
  assert.equal(result.status, "success");
});

test("changed selection and upload failure never finalize", async () => {
  const selected = file();
  let finalizeCalls = 0;
  const changed = await runUniversityApplicationDocumentUpload(
    applicationId,
    "Offer letter",
    selected,
    {
      getCurrentFile: () => file(),
      onPhase: () => undefined,
      prepare: async () => ({ status: "success", upload: capability() }),
      upload: async () => {
        throw new Error("must not upload");
      },
      finalize: async () => {
        finalizeCalls += 1;
        throw new Error("must not finalize");
      },
    },
  );
  assert.equal(changed.status, "error");
  if (changed.status === "error") assert.equal(changed.failurePhase, "upload_failed");
  assert.equal(finalizeCalls, 0);

  const failedUpload = await runUniversityApplicationDocumentUpload(
    applicationId,
    "Offer letter",
    selected,
    {
      getCurrentFile: () => selected,
      onPhase: () => undefined,
      prepare: async () => ({ status: "success", upload: capability() }),
      upload: async () => ({ data: null, error: new Error("private failure") }),
      finalize: async () => {
        finalizeCalls += 1;
        throw new Error("must not finalize");
      },
    },
  );
  assert.equal(failedUpload.status, "error");
  if (failedUpload.status === "error") {
    assert.equal(failedUpload.failurePhase, "upload_failed");
    assert.doesNotMatch(failedUpload.message, /private failure/);
  }
  assert.equal(finalizeCalls, 0);
});

test("finalization failure retains only the document id for a safe retry", async () => {
  const selected = file();
  const result = await runUniversityApplicationDocumentUpload(
    applicationId,
    "Offer letter",
    selected,
    {
      getCurrentFile: () => selected,
      onPhase: () => undefined,
      prepare: async () => ({ status: "success", upload: capability() }),
      upload: async () => ({
        data: { path, fullPath: `university-application-documents/${path}` },
        error: null,
      }),
      finalize: async () => ({
        status: "error",
        message: "The document upload could not be finalized.",
      }),
    },
  );
  assert.equal(result.status, "error");
  if (result.status === "error") {
    assert.equal(result.failurePhase, "finalize_failed");
    assert.equal(result.retryFinalizeDocumentId, documentId);
    assert.doesNotMatch(JSON.stringify(result), /private-token|storagePath|bucketId/);
  }
});

test("invalid title or file fails before creating an upload intent", async () => {
  let prepareCalls = 0;
  const selected = new File([], "offer.pdf", { type: "application/pdf" });
  const result = await runUniversityApplicationDocumentUpload(
    applicationId,
    " ",
    selected,
    {
      getCurrentFile: () => selected,
      onPhase: () => undefined,
      prepare: async () => {
        prepareCalls += 1;
        return { status: "success", upload: capability() };
      },
      upload: async () => ({ data: null, error: null }),
      finalize: async () => ({
        status: "error",
        message: "Unexpected.",
      }),
    },
  );
  assert.equal(result.status, "error");
  assert.equal(prepareCalls, 0);
});
