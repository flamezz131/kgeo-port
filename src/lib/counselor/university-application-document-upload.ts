import {
  validateUniversityApplicationDocumentFile,
  validateUniversityApplicationDocumentTitle,
} from "@/lib/counselor/university-application-documents";
import type {
  UniversityApplicationDocumentMutationState,
  UniversityApplicationDocumentPrepareState,
  UniversityApplicationDocumentUploadCapability,
} from "@/lib/counselor/university-application-document-submission";

export type UniversityApplicationDocumentUploadPhase =
  | "idle"
  | "preparing"
  | "uploading"
  | "finalizing"
  | "succeeded"
  | "prepare_failed"
  | "upload_failed"
  | "finalize_failed";

type UploadResult = {
  data: { path: string; fullPath: string } | null;
  error: unknown;
};

export type UniversityApplicationDocumentUploadResult =
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      failurePhase: Extract<
        UniversityApplicationDocumentUploadPhase,
        "prepare_failed" | "upload_failed" | "finalize_failed"
      >;
      retryFinalizeDocumentId?: string;
      errors?: Record<string, string[]>;
    };

function isSameSelectedFile(current: File | null, expected: File): boolean {
  return (
    current === expected &&
    current.name === expected.name &&
    current.type === expected.type &&
    current.size === expected.size &&
    current.lastModified === expected.lastModified
  );
}

export async function runUniversityApplicationDocumentUpload(
  applicationId: string,
  documentTitle: string,
  selectedFile: File,
  dependencies: {
    getCurrentFile: () => File | null;
    onPhase: (phase: UniversityApplicationDocumentUploadPhase) => void;
    prepare: (
      input: {
        applicationId: string;
        documentTitle: string;
        originalFileName: string;
        mimeType: string;
        fileSizeBytes: number;
      },
    ) => Promise<UniversityApplicationDocumentPrepareState>;
    upload: (
      capability: UniversityApplicationDocumentUploadCapability,
      file: File,
    ) => Promise<UploadResult>;
    finalize: (
      documentId: string,
    ) => Promise<UniversityApplicationDocumentMutationState>;
  },
): Promise<UniversityApplicationDocumentUploadResult> {
  const title = validateUniversityApplicationDocumentTitle(documentTitle);
  const file = validateUniversityApplicationDocumentFile(selectedFile);
  const errors: Record<string, string[]> = {};
  if (!title.success) errors.documentTitle = [title.message];
  if (!file.success) errors.documentFile = [file.message];
  if (!title.success || !file.success) {
    dependencies.onPhase("prepare_failed");
    return {
      status: "error",
      failurePhase: "prepare_failed",
      message: "Check the document title and selected file.",
      errors,
    };
  }

  let capability: UniversityApplicationDocumentUploadCapability | null = null;
  let operationPhase: "preparing" | "uploading" | "finalizing" = "preparing";
  try {
    dependencies.onPhase("preparing");
    const prepared = await dependencies.prepare({
      applicationId,
      documentTitle: title.data,
      originalFileName: file.data.originalFileName,
      mimeType: file.data.mimeType,
      fileSizeBytes: file.data.fileSizeBytes,
    });
    if (prepared.status !== "success") {
      dependencies.onPhase("prepare_failed");
      return {
        status: "error",
        failurePhase: "prepare_failed",
        message: prepared.message,
        errors: prepared.errors,
      };
    }
    capability = prepared.upload;

    if (!isSameSelectedFile(dependencies.getCurrentFile(), selectedFile)) {
      dependencies.onPhase("upload_failed");
      return {
        status: "error",
        failurePhase: "upload_failed",
        message: "The selected file changed. Select it again and retry.",
      };
    }

    operationPhase = "uploading";
    dependencies.onPhase("uploading");
    const uploaded = await dependencies.upload(capability, selectedFile);
    if (
      uploaded.error ||
      !uploaded.data ||
      uploaded.data.path !== capability.path ||
      uploaded.data.fullPath !== `${capability.bucketId}/${capability.path}`
    ) {
      dependencies.onPhase("upload_failed");
      return {
        status: "error",
        failurePhase: "upload_failed",
        message: "The document could not be uploaded. Retry the upload.",
      };
    }

    operationPhase = "finalizing";
    dependencies.onPhase("finalizing");
    const finalized = await dependencies.finalize(capability.documentId);
    if (finalized.status !== "success") {
      dependencies.onPhase("finalize_failed");
      return {
        status: "error",
        failurePhase: "finalize_failed",
        message: finalized.message,
        retryFinalizeDocumentId: capability.documentId,
      };
    }

    dependencies.onPhase("succeeded");
    return { status: "success", message: finalized.message };
  } catch {
    const failurePhase =
      operationPhase === "finalizing"
        ? "finalize_failed"
        : capability
          ? "upload_failed"
          : "prepare_failed";
    dependencies.onPhase(failurePhase);
    return {
      status: "error",
      failurePhase,
      message:
        failurePhase === "finalize_failed"
          ? "The document upload could not be finalized."
          : failurePhase === "upload_failed"
            ? "The document could not be uploaded. Retry the upload."
            : "The document upload could not be prepared.",
      retryFinalizeDocumentId:
        failurePhase === "finalize_failed"
          ? capability?.documentId
          : undefined,
    };
  } finally {
    capability = null;
  }
}
