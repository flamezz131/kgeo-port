import type { StudentProfileDocumentMimeType } from "@/types";

export type ProfileDocumentUploadCapability = {
  documentId: string;
  bucketId: "student-profile-documents";
  path: string;
  token: string;
  mimeType: StudentProfileDocumentMimeType;
};

export type ProfileDocumentPrepareState =
  | { status: "success"; upload: ProfileDocumentUploadCapability }
  | { status: "error"; message: string; errors?: Record<string, string[]> };

export type ProfileDocumentMutationState =
  | { status: "success"; message: string; documentId: string }
  | { status: "error"; message: string; errors?: Record<string, string[]> };
