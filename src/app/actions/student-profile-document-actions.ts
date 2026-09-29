"use server";

import { revalidatePath } from "next/cache";
import type {
  ProfileDocumentMutationState,
  ProfileDocumentPrepareState,
} from "@/lib/student/profile-document-action-state";
import {
  STUDENT_PROFILE_DOCUMENT_BUCKET_ID,
  isProfileDocumentUuid,
  parseProfileDocumentDeleteAuthorization,
  parseProfileDocumentDeleteFinalization,
  parseProfileDocumentList,
  parseProfileDocumentUploadIntent,
  validateProfileDocumentDisplayName,
  validateProfileDocumentFile,
  validateProfileDocumentType,
} from "@/lib/student/profile-documents";
import { requireStudent } from "@/lib/permissions";
import { getSupabaseEnv } from "@/lib/supabase/env";

function readExactStringFields(
  formData: FormData,
  names: readonly string[],
): Record<string, string> | null {
  const allowed = new Set(names);
  for (const key of new Set(formData.keys())) {
    if (!allowed.has(key)) return null;
  }
  const fields: Record<string, string> = {};
  for (const name of names) {
    const values = formData.getAll(name);
    if (values.length !== 1 || typeof values[0] !== "string") return null;
    fields[name] = values[0];
  }
  return fields;
}

function validSignedUpload(
  signedUrl: string,
  token: string,
  path: string,
): boolean {
  try {
    const signed = new URL(signedUrl);
    const base = new URL(getSupabaseEnv().url);
    return (
      token.length >= 1 &&
      token.length <= 4096 &&
      signed.origin === base.origin &&
      signed.username === "" &&
      signed.password === "" &&
      signed.hash === "" &&
      signed.pathname ===
        `/storage/v1/object/upload/sign/${STUDENT_PROFILE_DOCUMENT_BUCKET_ID}/${path}` &&
      signed.searchParams.getAll("token").length === 1 &&
      signed.searchParams.get("token") === token
    );
  } catch {
    return false;
  }
}

export async function prepareStudentProfileDocumentUploadAction(
  formData: FormData,
): Promise<ProfileDocumentPrepareState> {
  const { supabase, user } = await requireStudent();
  const fields = readExactStringFields(formData, [
    "documentType",
    "displayName",
    "originalFileName",
    "mimeType",
    "fileSizeBytes",
  ]);
  if (!fields) {
    return { status: "error", message: "The document upload could not be prepared." };
  }

  const documentType = validateProfileDocumentType(fields.documentType ?? "");
  const displayName = validateProfileDocumentDisplayName(fields.displayName ?? "");
  const size = /^[1-9]\d{0,8}$/u.test(fields.fileSizeBytes ?? "")
    ? Number(fields.fileSizeBytes)
    : Number.NaN;
  const file = validateProfileDocumentFile({
    name: fields.originalFileName ?? "",
    type: fields.mimeType ?? "",
    size,
  });
  const errors: Record<string, string[]> = {};
  if (!documentType.success) errors.documentType = [documentType.message];
  if (!displayName.success) errors.displayName = [displayName.message];
  if (!file.success) errors.documentFile = [file.message];
  if (!documentType.success || !displayName.success || !file.success) {
    return {
      status: "error",
      message: "Check the document type, name, and selected file.",
      errors,
    };
  }

  try {
    const preparedResult = await supabase
      .rpc("prepare_student_profile_document_upload", {
        p_document_type: documentType.data,
        p_display_name: displayName.data,
        p_original_file_name: file.data.originalFileName,
        p_mime_type: file.data.mimeType,
        p_file_size_bytes: file.data.fileSizeBytes,
      })
      .maybeSingle();
    const prepared = preparedResult.error
      ? null
      : parseProfileDocumentUploadIntent(preparedResult.data);
    if (
      !prepared ||
      !prepared.storage_path.startsWith(`${user.id}/`)
    ) {
      return { status: "error", message: "The document upload could not be prepared." };
    }

    const signed = await supabase.storage
      .from(prepared.bucket_id)
      .createSignedUploadUrl(prepared.storage_path, { upsert: false });
    if (
      signed.error ||
      !signed.data ||
      !validSignedUpload(
        signed.data.signedUrl,
        signed.data.token,
        prepared.storage_path,
      )
    ) {
      return { status: "error", message: "The document upload could not be prepared." };
    }
    return {
      status: "success",
      upload: {
        documentId: prepared.document_id,
        bucketId: prepared.bucket_id,
        path: prepared.storage_path,
        token: signed.data.token,
        mimeType: prepared.mime_type,
      },
    };
  } catch {
    return { status: "error", message: "The document upload could not be prepared." };
  }
}

export async function finalizeStudentProfileDocumentUploadAction(
  formData: FormData,
): Promise<ProfileDocumentMutationState> {
  const { supabase } = await requireStudent();
  const fields = readExactStringFields(formData, ["documentId"]);
  const documentId = fields?.documentId ?? "";
  if (!isProfileDocumentUuid(documentId)) {
    return { status: "error", message: "The document upload could not be finalized." };
  }
  try {
    const result = await supabase
      .rpc("finalize_student_profile_document_upload", {
        p_document_id: documentId,
      })
      .maybeSingle();
    const finalized = result.error
      ? null
      : parseProfileDocumentList(result.data ? [result.data] : null);
    if (!finalized || finalized[0]?.documentId !== documentId) {
      return { status: "error", message: "The document upload could not be finalized." };
    }
    revalidatePath("/student/profile");
    return { status: "success", message: "Document uploaded successfully.", documentId };
  } catch {
    return { status: "error", message: "The document upload could not be finalized." };
  }
}

export async function deleteStudentProfileDocumentAction(
  formData: FormData,
): Promise<ProfileDocumentMutationState> {
  const { supabase } = await requireStudent();
  const fields = readExactStringFields(formData, ["documentId"]);
  const documentId = fields?.documentId ?? "";
  if (!isProfileDocumentUuid(documentId)) {
    return { status: "error", message: "The document could not be deleted." };
  }
  try {
    const authorizationResult = await supabase
      .rpc("authorize_student_profile_document_delete", {
        p_document_id: documentId,
      })
      .maybeSingle();
    const authorization = authorizationResult.error
      ? null
      : parseProfileDocumentDeleteAuthorization(
          authorizationResult.data,
          documentId,
        );
    if (!authorization) {
      return { status: "error", message: "The document could not be deleted." };
    }
    const removedObject = await supabase.storage
      .from(authorization.bucket_id)
      .remove([authorization.storage_path]);
    if (removedObject.error) {
      return { status: "error", message: "The document could not be deleted." };
    }
    const finalizedResult = await supabase
      .rpc("finalize_student_profile_document_delete", {
        p_document_id: documentId,
      })
      .maybeSingle();
    if (
      finalizedResult.error ||
      !parseProfileDocumentDeleteFinalization(
        finalizedResult.data,
        documentId,
      )
    ) {
      return {
        status: "error",
        message: "The file was removed, but the document list could not be updated. Retry deletion.",
      };
    }
    revalidatePath("/student/profile");
    return { status: "success", message: "Document deleted.", documentId };
  } catch {
    return { status: "error", message: "The document could not be deleted." };
  }
}
