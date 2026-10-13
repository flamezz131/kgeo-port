import {
  validateProgressionEvidenceFile,
  type ProgressionEvidenceFileDescriptor,
} from "@/lib/counselor/progression-evidence";
import type { ProgressionEvidenceUploadData } from "@/lib/counselor/progression-evidence-submission";

export type ProgressionEvidenceUploadPhase =
  | "idle"
  | "validating"
  | "preparing"
  | "uploading"
  | "finalizing"
  | "succeeded"
  | "failed";

export type ProgressionEvidenceUploadResult =
  | { status: "success"; message: string }
  | {
      status: "error";
      message: string;
      retryFinalizeEvidenceId?: string;
    };

type PrepareResult =
  | { status: "success"; upload: ProgressionEvidenceUploadData }
  | { status: "error"; message: string };

type UploadResult =
  | { data: { path: string; fullPath: string }; error: null }
  | { data: null; error: unknown };

type FinalizeResult =
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export type ProgressionEvidenceUploadOperations<TFile> = {
  getCurrentFile: () => TFile | null;
  prepare: (file: TFile) => Promise<PrepareResult>;
  upload: (
    upload: ProgressionEvidenceUploadData,
    file: TFile,
  ) => Promise<UploadResult>;
  finalize: (
    evidenceId: string,
  ) => Promise<FinalizeResult>;
  onPhase: (phase: ProgressionEvidenceUploadPhase) => void;
};

function samePreparedFile(
  file: ProgressionEvidenceFileDescriptor,
  upload: ProgressionEvidenceUploadData,
): boolean {
  return (
    file.name === upload.originalFileName &&
    file.type.trim().toLowerCase() === upload.mimeType &&
    file.size === upload.fileSizeBytes
  );
}

export async function runProgressionEvidenceUpload<
  TFile extends ProgressionEvidenceFileDescriptor,
>(
  selectedFile: TFile,
  operations: ProgressionEvidenceUploadOperations<TFile>,
): Promise<ProgressionEvidenceUploadResult> {
  let uploadIntent: ProgressionEvidenceUploadData | null = null;
  try {
    operations.onPhase("validating");
    const validation = validateProgressionEvidenceFile(selectedFile);
    if (!validation.success) {
      operations.onPhase("failed");
      return { status: "error", message: validation.message };
    }

    operations.onPhase("preparing");
    const prepared = await operations.prepare(selectedFile);
    if (prepared.status === "error") {
      operations.onPhase("failed");
      return prepared;
    }
    uploadIntent = prepared.upload;

    const currentFile = operations.getCurrentFile();
    if (
      currentFile !== selectedFile ||
      !samePreparedFile(selectedFile, uploadIntent)
    ) {
      operations.onPhase("failed");
      return {
        status: "error",
        message:
          "The selected file changed. Select the file and try again.",
      };
    }

    operations.onPhase("uploading");
    let uploaded: UploadResult;
    try {
      uploaded = await operations.upload(uploadIntent, selectedFile);
    } catch {
      operations.onPhase("failed");
      return {
        status: "error",
        message:
          "The file upload failed. The pending reservation will expire automatically.",
      };
    }
    if (
      uploaded.error ||
      uploaded.data?.path !== uploadIntent.path ||
      !uploaded.data.fullPath.endsWith(
        `${uploadIntent.bucketId}/${uploadIntent.path}`,
      )
    ) {
      operations.onPhase("failed");
      return {
        status: "error",
        message:
          "The file upload failed. The pending reservation will expire automatically.",
      };
    }

    const evidenceId = uploadIntent.evidenceId;
    uploadIntent = null;
    operations.onPhase("finalizing");
    let finalized: FinalizeResult;
    try {
      finalized = await operations.finalize(evidenceId);
    } catch {
      finalized = {
        status: "error",
        message:
          "The file was uploaded, but finalization failed. Retry finalization.",
      };
    }
    if (finalized.status === "error") {
      operations.onPhase("failed");
      return {
        status: "error",
        message: finalized.message,
        retryFinalizeEvidenceId: evidenceId,
      };
    }

    operations.onPhase("succeeded");
    return {
      status: "success",
      message: "Evidence uploaded successfully.",
    };
  } finally {
    uploadIntent = null;
  }
}
