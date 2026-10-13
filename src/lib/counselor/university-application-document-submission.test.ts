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
    return nextResolve(specifier, context);
  },
});

const {
  submitFinalizeUniversityApplicationDocumentUpload,
  submitListUniversityApplicationDocuments,
  submitPrepareUniversityApplicationDocumentUpload,
  submitRemoveUniversityApplicationDocument,
} = require("./university-application-document-submission.ts") as typeof import(
  "./university-application-document-submission"
);

const studentId = "11111111-1111-4111-8111-111111111111";
const applicationId = "22222222-2222-4222-8222-222222222222";
const documentId = "33333333-3333-4333-8333-333333333333";
const path = `applications/${studentId}/${applicationId}/${documentId}/${documentId}.pdf`;

function exactFormData(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [name, value] of Object.entries(values)) formData.set(name, value);
  return formData;
}

test("lazy list accepts one application UUID and rejects duplicates or protected fields", async () => {
  let calls = 0;
  const list = async (receivedApplicationId: string) => {
    calls += 1;
    assert.equal(receivedApplicationId, applicationId);
    return { data: [], error: null };
  };
  const ready = await submitListUniversityApplicationDocuments(
    exactFormData({ applicationId }),
    list,
  );
  assert.deepEqual(ready, { status: "ready", applicationId, documents: [] });
  assert.equal(calls, 1);

  const duplicate = exactFormData({ applicationId });
  duplicate.append("applicationId", applicationId);
  assert.equal(
    (await submitListUniversityApplicationDocuments(duplicate, list)).status,
    "error",
  );
  assert.equal(
    (
      await submitListUniversityApplicationDocuments(
        exactFormData({ applicationId, counselorId: studentId }),
        list,
      )
    ).status,
    "error",
  );
  assert.equal(calls, 1);
});

test("prepare normalizes title and creates only a bounded in-memory capability", async () => {
  const expiry = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const state = await submitPrepareUniversityApplicationDocumentUpload(
    exactFormData({
      applicationId,
      documentTitle: "  Offer   letter  ",
      originalFileName: "offer.pdf",
      mimeType: "application/pdf",
      fileSizeBytes: "1024",
    }),
    {
      supabaseUrl: "https://example.supabase.co",
      prepare: async (input) => {
        assert.deepEqual(input, {
          applicationId,
          documentTitle: "Offer letter",
          originalFileName: "offer.pdf",
          mimeType: "application/pdf",
          fileSizeBytes: 1024,
        });
        return {
          data: {
            document_id: documentId,
            application_id: applicationId,
            bucket_id: "university-application-documents",
            storage_path: path,
            document_title: "Offer letter",
            original_file_name: "offer.pdf",
            mime_type: "application/pdf",
            file_size_bytes: 1024,
            upload_expires_at: expiry,
          },
          error: null,
        };
      },
      createSignedUpload: async (_bucket, receivedPath) => ({
        data: {
          signedUrl: `https://example.supabase.co/storage/v1/object/upload/sign/university-application-documents/${receivedPath}?token=private-token`,
          token: "private-token",
          path: receivedPath,
        },
        error: null,
      }),
    },
  );
  assert.equal(state.status, "success");
  if (state.status === "success") {
    assert.deepEqual(Object.keys(state.upload).sort(), [
      "bucketId",
      "documentId",
      "mimeType",
      "path",
      "token",
    ]);
    assert.equal(state.upload.token, "private-token");
  }
});

test("prepare rejects ambiguous or untrusted signed-upload URL shapes", async () => {
  const expiry = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  const expectedPath =
    `/storage/v1/object/upload/sign/university-application-documents/${path}`;
  const validOrigin = "https://example.supabase.co";
  const invalidUrls = [
    `http://example.supabase.co${expectedPath}?token=private-token`,
    `https://example.supabase.co:444${expectedPath}?token=private-token`,
    `https://user@example.supabase.co${expectedPath}?token=private-token`,
    `${validOrigin}${expectedPath}/wrong?token=private-token`,
    `${validOrigin}${expectedPath}?token=private-token&token=private-token`,
    `${validOrigin}${expectedPath}?token=private-token&redirect=https://attacker.example`,
    `${validOrigin}${expectedPath}?token=private-token#fragment`,
    `${validOrigin}${expectedPath.replace("/applications/", "/applications%2F")}?token=private-token`,
    "not-a-url",
  ];

  for (const signedUrl of invalidUrls) {
    const state = await submitPrepareUniversityApplicationDocumentUpload(
      exactFormData({
        applicationId,
        documentTitle: "Offer letter",
        originalFileName: "offer.pdf",
        mimeType: "application/pdf",
        fileSizeBytes: "1024",
      }),
      {
        supabaseUrl: validOrigin,
        prepare: async () => ({
          data: {
            document_id: documentId,
            application_id: applicationId,
            bucket_id: "university-application-documents",
            storage_path: path,
            document_title: "Offer letter",
            original_file_name: "offer.pdf",
            mime_type: "application/pdf",
            file_size_bytes: 1024,
            upload_expires_at: expiry,
          },
          error: null,
        }),
        createSignedUpload: async () => ({
          data: {
            signedUrl,
            token: "private-token",
            path,
          },
          error: null,
        }),
      },
    );
    assert.deepEqual(state, {
      status: "error",
      message: "The document upload could not be prepared.",
    });
  }
});

test("prepare rejects duplicate scalar data unsafe files and injected trusted fields", async () => {
  let called = false;
  const store = {
    supabaseUrl: "https://example.supabase.co",
    prepare: async () => {
      called = true;
      return { data: null, error: null };
    },
    createSignedUpload: async () => {
      called = true;
      return { data: null, error: null };
    },
  };
  const base = {
    applicationId,
    documentTitle: "Offer letter",
    originalFileName: "offer.pdf",
    mimeType: "application/pdf",
    fileSizeBytes: "1024",
  };
  const duplicate = exactFormData(base);
  duplicate.append("documentTitle", "Injected title");
  assert.equal(
    (await submitPrepareUniversityApplicationDocumentUpload(duplicate, store)).status,
    "error",
  );
  assert.equal(
    (
      await submitPrepareUniversityApplicationDocumentUpload(
        exactFormData({ ...base, studentId, bucketId: "public" }),
        store,
      )
    ).status,
    "error",
  );
  assert.equal(
    (
      await submitPrepareUniversityApplicationDocumentUpload(
        exactFormData({ ...base, originalFileName: "offer.pdf.exe" }),
        store,
      )
    ).status,
    "error",
  );
  assert.equal(
    (
      await submitPrepareUniversityApplicationDocumentUpload(
        exactFormData({ ...base, fileSizeBytes: "1e3" }),
        store,
      )
    ).status,
    "error",
  );
  assert.equal(called, false);
});

test("finalize accepts only documentId and validates the trusted RPC row", async () => {
  let received = "";
  const result = await submitFinalizeUniversityApplicationDocumentUpload(
    exactFormData({ documentId }),
    async (value) => {
      received = value;
      return {
        data: {
          document_id: documentId,
          application_id: applicationId,
          document_title: "Offer letter",
          original_file_name: "offer.pdf",
          mime_type: "application/pdf",
          file_size_bytes: 1024,
          status: "available",
          available_at: "2026-08-02T10:00:00.000Z",
        },
        error: null,
      };
    },
  );
  assert.equal(received, documentId);
  assert.equal(result.status, "success");
  if (result.status === "success") assert.equal(result.applicationId, applicationId);

  assert.equal(
    (
      await submitFinalizeUniversityApplicationDocumentUpload(
        exactFormData({ documentId, applicationId }),
        async () => ({ data: null, error: null }),
      )
    ).status,
    "error",
  );
});

test("soft removal normalizes one reason and never exposes a raw failure", async () => {
  let receivedReason = "";
  const result = await submitRemoveUniversityApplicationDocument(
    exactFormData({ documentId, removalReason: "  Superseded   copy  " }),
    async (_documentId, reason) => {
      receivedReason = reason;
      return {
        data: {
          document_id: documentId,
          application_id: applicationId,
          status: "removed",
          removed_at: "2026-08-02T10:00:00.000Z",
        },
        error: null,
      };
    },
  );
  assert.equal(receivedReason, "Superseded copy");
  assert.equal(result.status, "success");

  const failed = await submitRemoveUniversityApplicationDocument(
    exactFormData({ documentId, removalReason: "Valid reason" }),
    async () => ({ data: null, error: new Error("private database detail") }),
  );
  assert.deepEqual(failed, {
    status: "error",
    message: "The document could not be removed.",
  });
  assert.doesNotMatch(JSON.stringify(failed), /private database detail/);
});
