import {
  UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID,
  isUniversityApplicationDocumentUuid,
  parseFinalizeUniversityApplicationDocumentUploadById,
  parsePrepareUniversityApplicationDocumentUploadResult,
  parseSoftRemoveUniversityApplicationDocumentById,
  parseUniversityApplicationDocumentList,
  validateUniversityApplicationDocumentFile,
  validateUniversityApplicationDocumentRemovalReason,
  validateUniversityApplicationDocumentTitle,
  type PrepareUniversityApplicationDocumentUploadArgs,
} from "@/lib/counselor/university-application-documents";
import type { CounselorUniversityApplicationDocument } from "@/types";

export type UniversityApplicationDocumentListState =
  | {
      status: "ready";
      applicationId: string;
      documents: CounselorUniversityApplicationDocument[];
    }
  | { status: "error"; message: string };

export type UniversityApplicationDocumentUploadCapability = {
  documentId: string;
  bucketId: typeof UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID;
  path: string;
  token: string;
  mimeType: PrepareUniversityApplicationDocumentUploadArgs["mimeType"];
};

export type UniversityApplicationDocumentPrepareState =
  | { status: "success"; upload: UniversityApplicationDocumentUploadCapability }
  | { status: "error"; message: string; errors?: Record<string, string[]> };

export type UniversityApplicationDocumentMutationState =
  | {
      status: "success";
      message: string;
      applicationId: string;
      documentId: string;
    }
  | { status: "error"; message: string; errors?: Record<string, string[]> };

type RpcResult = { data: unknown; error: unknown };

type SignedUploadResult = {
  data: { signedUrl: string; token: string; path: string } | null;
  error: unknown;
};

const unavailableMessage = "Application documents are temporarily unavailable.";
const prepareErrorMessage = "The document upload could not be prepared.";
const finalizeErrorMessage = "The document upload could not be finalized.";
const removeErrorMessage = "The document could not be removed.";

function readExactFields(
  formData: FormData,
  names: readonly string[],
): Record<string, string> | null {
  const allowed = new Set(names);
  for (const key of new Set(formData.keys())) {
    if (!allowed.has(key)) return null;
  }

  const values: Record<string, string> = {};
  for (const name of names) {
    const entries = formData.getAll(name);
    if (
      entries.length !== 1 ||
      typeof entries[0] !== "string" ||
      entries[0] === "" ||
      entries[0] === "null" ||
      entries[0] === "undefined"
    ) {
      return null;
    }
    values[name] = entries[0];
  }
  return values;
}

function isValidSignedUploadResult(
  result: SignedUploadResult,
  expectedSupabaseUrl: string,
  expectedBucketId: typeof UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID,
  expectedPath: string,
): result is {
  data: { signedUrl: string; token: string; path: string };
  error: null;
} {
  if (
    result.error ||
    !result.data ||
    result.data.path !== expectedPath ||
    result.data.token.length < 1 ||
    result.data.token.length > 4096
  ) {
    return false;
  }
  try {
    const signedUrl = new URL(result.data.signedUrl);
    const supabaseUrl = new URL(expectedSupabaseUrl);
    const tokenValues = signedUrl.searchParams.getAll("token");
    const queryEntries = Array.from(signedUrl.searchParams.entries());
    return (
      signedUrl.origin === supabaseUrl.origin &&
      signedUrl.username === "" &&
      signedUrl.password === "" &&
      signedUrl.hash === "" &&
      signedUrl.pathname ===
        `/storage/v1/object/upload/sign/${expectedBucketId}/${expectedPath}` &&
      queryEntries.length === 1 &&
      queryEntries[0]?.[0] === "token" &&
      tokenValues.length === 1 &&
      tokenValues[0] === result.data.token
    );
  } catch {
    return false;
  }
}

export async function submitListUniversityApplicationDocuments(
  formData: FormData,
  list: (applicationId: string) => Promise<RpcResult>,
): Promise<UniversityApplicationDocumentListState> {
  const fields = readExactFields(formData, ["applicationId"]);
  const applicationId = fields?.applicationId;
  if (!applicationId || !isUniversityApplicationDocumentUuid(applicationId)) {
    return { status: "error", message: unavailableMessage };
  }

  const result = await list(applicationId);
  const documents = result.error
    ? null
    : parseUniversityApplicationDocumentList(result.data, applicationId);
  return documents
    ? { status: "ready", applicationId, documents }
    : { status: "error", message: unavailableMessage };
}

export async function submitPrepareUniversityApplicationDocumentUpload(
  formData: FormData,
  store: {
    prepare: (input: PrepareUniversityApplicationDocumentUploadArgs) => Promise<RpcResult>;
    createSignedUpload: (
      bucketId: typeof UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID,
      path: string,
    ) => Promise<SignedUploadResult>;
    supabaseUrl: string;
  },
): Promise<UniversityApplicationDocumentPrepareState> {
  const fields = readExactFields(formData, [
    "applicationId",
    "documentTitle",
    "originalFileName",
    "mimeType",
    "fileSizeBytes",
  ]);
  if (!fields || !isUniversityApplicationDocumentUuid(fields.applicationId)) {
    return { status: "error", message: prepareErrorMessage };
  }

  const title = validateUniversityApplicationDocumentTitle(fields.documentTitle);
  const size = /^[1-9]\d{0,8}$/.test(fields.fileSizeBytes)
    ? Number(fields.fileSizeBytes)
    : Number.NaN;
  const file = validateUniversityApplicationDocumentFile({
    name: fields.originalFileName,
    type: fields.mimeType,
    size,
  });
  const errors: Record<string, string[]> = {};
  if (!title.success) errors.documentTitle = [title.message];
  if (!file.success) errors.documentFile = [file.message];
  if (!title.success || !file.success) {
    return { status: "error", message: prepareErrorMessage, errors };
  }

  const input: PrepareUniversityApplicationDocumentUploadArgs = {
    applicationId: fields.applicationId,
    documentTitle: title.data,
    originalFileName: file.data.originalFileName,
    mimeType: file.data.mimeType,
    fileSizeBytes: file.data.fileSizeBytes,
  };
  const preparedRpc = await store.prepare(input);
  const prepared = preparedRpc.error
    ? null
    : parsePrepareUniversityApplicationDocumentUploadResult(
        preparedRpc.data,
        input,
      );
  if (!prepared) return { status: "error", message: prepareErrorMessage };

  const signedUpload = await store.createSignedUpload(
    prepared.bucketId,
    prepared.storagePath,
  );
  if (
    !isValidSignedUploadResult(
      signedUpload,
      store.supabaseUrl,
      prepared.bucketId,
      prepared.storagePath,
    )
  ) {
    return { status: "error", message: prepareErrorMessage };
  }

  return {
    status: "success",
    upload: {
      documentId: prepared.documentId,
      bucketId: prepared.bucketId,
      path: prepared.storagePath,
      token: signedUpload.data.token,
      mimeType: prepared.mimeType,
    },
  };
}

export async function submitFinalizeUniversityApplicationDocumentUpload(
  formData: FormData,
  finalize: (documentId: string) => Promise<RpcResult>,
): Promise<UniversityApplicationDocumentMutationState> {
  const fields = readExactFields(formData, ["documentId"]);
  const documentId = fields?.documentId;
  if (!documentId || !isUniversityApplicationDocumentUuid(documentId)) {
    return { status: "error", message: finalizeErrorMessage };
  }
  const result = await finalize(documentId);
  const finalized = result.error
    ? null
    : parseFinalizeUniversityApplicationDocumentUploadById(
        result.data,
        documentId,
      );
  return finalized
    ? {
        status: "success",
        message: "Document uploaded successfully.",
        applicationId: finalized.applicationId,
        documentId: finalized.documentId,
      }
    : { status: "error", message: finalizeErrorMessage };
}

export async function submitRemoveUniversityApplicationDocument(
  formData: FormData,
  remove: (documentId: string, reason: string) => Promise<RpcResult>,
): Promise<UniversityApplicationDocumentMutationState> {
  const fields = readExactFields(formData, ["documentId", "removalReason"]);
  const documentId = fields?.documentId;
  if (!fields || !documentId || !isUniversityApplicationDocumentUuid(documentId)) {
    return { status: "error", message: removeErrorMessage };
  }
  const reason = validateUniversityApplicationDocumentRemovalReason(
    fields.removalReason,
  );
  if (!reason.success) {
    return {
      status: "error",
      message: removeErrorMessage,
      errors: { removalReason: [reason.message] },
    };
  }
  const result = await remove(documentId, reason.data);
  const removed = result.error
    ? null
    : parseSoftRemoveUniversityApplicationDocumentById(
        result.data,
        documentId,
      );
  return removed
    ? {
        status: "success",
        message: "Document removed from counselor access.",
        applicationId: removed.applicationId,
        documentId: removed.documentId,
      }
    : { status: "error", message: removeErrorMessage };
}
