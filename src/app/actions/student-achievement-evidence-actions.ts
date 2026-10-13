"use server";

import { revalidatePath } from "next/cache";
import type { AchievementEvidenceMutationState } from "@/lib/student/achievement-evidence-action-state";
import {
  STUDENT_ACHIEVEMENT_DOCUMENT_MAX_BYTES,
  isAchievementEvidenceUuid,
  parseStudentAchievementDocumentDeleteAuthorization,
  parseStudentAchievementDocumentDeleteFinalization,
  parseStudentAchievementDocumentUploadIntent,
  parseStudentAchievementDocumentValidationAuthorization,
  parseStudentAchievementDocuments,
  validateAchievementEvidenceFile,
} from "@/lib/student/achievement-evidence";
import { detectAchievementEvidenceMimeType } from "@/lib/student/achievement-evidence-signature";
import { requireStudent } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

type StudentSupabaseClient = SupabaseClient<Database>;
type RemovableEvidenceStatus = "pending" | "available" | "removal_pending";

function hasExactKeys(formData: FormData, names: readonly string[]): boolean {
  const allowed = new Set(names);
  const keys = [...new Set(formData.keys())];
  return keys.length === allowed.size && keys.every((key) => allowed.has(key));
}

function readExactStringFields(
  formData: FormData,
  names: readonly string[],
): Record<string, string> | null {
  if (!hasExactKeys(formData, names)) return null;
  const fields: Record<string, string> = {};
  for (const name of names) {
    const values = formData.getAll(name);
    if (values.length !== 1 || typeof values[0] !== "string") return null;
    fields[name] = values[0];
  }
  return fields;
}

async function cleanupAchievementEvidence(
  supabase: StudentSupabaseClient,
  documentId: string,
  expectedStatus: RemovableEvidenceStatus,
): Promise<boolean> {
  const authorizationResult = await supabase
    .rpc("authorize_student_achievement_document_delete", {
      p_document_id: documentId,
      p_expected_status: expectedStatus,
    })
    .maybeSingle();
  const authorization = authorizationResult.error
    ? null
    : parseStudentAchievementDocumentDeleteAuthorization(
        authorizationResult.data,
        documentId,
      );
  if (!authorization) return false;
  if (authorization.storage_object_exists) {
    const removedObject = await supabase.storage
      .from(authorization.bucket_id)
      .remove([authorization.storage_path]);
    if (removedObject.error) return false;
  }
  const finalizedResult = await supabase
    .rpc("finalize_student_achievement_document_delete", {
      p_document_id: documentId,
    })
    .maybeSingle();
  return (
    !finalizedResult.error &&
    parseStudentAchievementDocumentDeleteFinalization(
      finalizedResult.data,
      documentId,
    )
  );
}

async function cleanupFailedUpload(
  supabase: StudentSupabaseClient,
  documentId: string,
): Promise<void> {
  if (await cleanupAchievementEvidence(supabase, documentId, "pending")) return;
  await cleanupAchievementEvidence(supabase, documentId, "removal_pending");
}

export async function uploadStudentAchievementEvidenceAction(
  formData: FormData,
): Promise<AchievementEvidenceMutationState> {
  const { supabase, user } = await requireStudent();
  if (!hasExactKeys(formData, ["achievementId", "evidenceFile"])) {
    return { status: "error", message: "The evidence upload could not be completed." };
  }
  const achievementValues = formData.getAll("achievementId");
  const fileValues = formData.getAll("evidenceFile");
  const achievementId = achievementValues[0];
  const selectedFile = fileValues[0];
  if (
    achievementValues.length !== 1 ||
    typeof achievementId !== "string" ||
    !isAchievementEvidenceUuid(achievementId) ||
    fileValues.length !== 1 ||
    !(selectedFile instanceof File)
  ) {
    return { status: "error", message: "The evidence upload could not be completed." };
  }
  const file = validateAchievementEvidenceFile(selectedFile);
  if (!file.success) return { status: "error", message: file.message };

  let documentId: string | null = null;
  try {
    const bytes = new Uint8Array(await selectedFile.arrayBuffer());
    const detectedMimeType = detectAchievementEvidenceMimeType(bytes);
    const admin = createAdminClient();
    const preparedResult = await admin
      .rpc("prepare_student_achievement_document_upload", {
        p_student_id: user.id,
        p_achievement_id: achievementId,
        p_document_name: file.data.documentName,
        p_mime_type: file.data.mimeType,
        p_file_size_bytes: file.data.fileSizeBytes,
      })
      .maybeSingle();
    const prepared = preparedResult.error
      ? null
      : parseStudentAchievementDocumentUploadIntent(preparedResult.data);
    if (
      !prepared ||
      prepared.achievement_id !== achievementId ||
      !prepared.storage_path.startsWith(`${user.id}/${achievementId}/`)
    ) {
      return { status: "error", message: "The evidence upload could not be prepared." };
    }
    documentId = prepared.document_id;

    if (
      bytes.byteLength !== prepared.file_size_bytes ||
      bytes.byteLength > STUDENT_ACHIEVEMENT_DOCUMENT_MAX_BYTES ||
      detectedMimeType !== prepared.mime_type
    ) {
      await admin.rpc("reject_student_achievement_document_signature", {
        p_document_id: documentId,
        p_student_id: user.id,
      });
      await cleanupFailedUpload(supabase, documentId);
      return {
        status: "error",
        message: "The file content does not match the approved PDF, JPEG, or PNG type.",
      };
    }

    const uploaded = await supabase.storage
      .from(prepared.bucket_id)
      .upload(prepared.storage_path, selectedFile, {
        contentType: prepared.mime_type,
        upsert: false,
      });
    if (
      uploaded.error ||
      uploaded.data?.path !== prepared.storage_path ||
      uploaded.data.fullPath !== `${prepared.bucket_id}/${prepared.storage_path}`
    ) {
      await cleanupFailedUpload(supabase, documentId);
      return { status: "error", message: "The evidence could not be uploaded." };
    }

    const authorizationResult = await supabase
      .rpc("authorize_student_achievement_document_validation", {
        p_document_id: documentId,
      })
      .maybeSingle();
    const authorization = authorizationResult.error
      ? null
      : parseStudentAchievementDocumentValidationAuthorization(
          authorizationResult.data,
          documentId,
        );
    if (
      !authorization ||
      authorization.bucket_id !== prepared.bucket_id ||
      authorization.storage_path !== prepared.storage_path ||
      authorization.mime_type !== detectedMimeType ||
      authorization.file_size_bytes !== bytes.byteLength
    ) {
      await cleanupFailedUpload(supabase, documentId);
      return { status: "error", message: "The evidence upload could not be finalized." };
    }

    const recorded = await admin.rpc(
      "record_student_achievement_document_signature_validation",
      {
        p_document_id: documentId,
        p_student_id: user.id,
        p_detected_mime_type: detectedMimeType,
        p_detected_size_bytes: bytes.byteLength,
      },
    );
    if (recorded.error) {
      await cleanupFailedUpload(supabase, documentId);
      return { status: "error", message: "The evidence upload could not be finalized." };
    }

    const result = await supabase
      .rpc("finalize_student_achievement_document_upload", {
        p_document_id: documentId,
      })
      .maybeSingle();
    const finalized = result.error
      ? null
      : parseStudentAchievementDocuments(result.data ? [result.data] : null);
    if (!finalized || finalized[0]?.documentId !== documentId) {
      await cleanupFailedUpload(supabase, documentId);
      return { status: "error", message: "The evidence upload could not be finalized." };
    }
    revalidatePath("/student/profile");
    return { status: "success", message: "Evidence uploaded successfully.", documentId };
  } catch {
    if (documentId) await cleanupFailedUpload(supabase, documentId);
    return { status: "error", message: "The evidence upload could not be completed." };
  }
}

export async function deleteStudentAchievementEvidenceAction(
  formData: FormData,
): Promise<AchievementEvidenceMutationState> {
  const { supabase } = await requireStudent();
  const fields = readExactStringFields(formData, ["documentId", "expectedStatus"]);
  const documentId = fields?.documentId ?? "";
  const expectedStatus = fields?.expectedStatus ?? "";
  if (
    !isAchievementEvidenceUuid(documentId) ||
    !["pending", "available", "removal_pending"].includes(expectedStatus)
  ) {
    return { status: "error", message: "The evidence could not be deleted." };
  }
  try {
    if (!(await cleanupAchievementEvidence(
      supabase,
      documentId,
      expectedStatus as RemovableEvidenceStatus,
    ))) {
      return {
        status: "error",
        message: "The evidence could not be deleted. Retry cleanup.",
      };
    }
    revalidatePath("/student/profile");
    return { status: "success", message: "Evidence deleted.", documentId };
  } catch {
    return { status: "error", message: "The evidence could not be deleted." };
  }
}
