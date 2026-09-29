"use server";

import {
  submitFinalizeUniversityApplicationDocumentUpload,
  submitListUniversityApplicationDocuments,
  submitPrepareUniversityApplicationDocumentUpload,
  submitRemoveUniversityApplicationDocument,
  type UniversityApplicationDocumentListState,
  type UniversityApplicationDocumentMutationState,
  type UniversityApplicationDocumentPrepareState,
} from "@/lib/counselor/university-application-document-submission";
import { requireCounselor } from "@/lib/permissions";
import { getSupabaseEnv } from "@/lib/supabase/env";

export async function loadUniversityApplicationDocumentsAction(
  formData: FormData,
): Promise<UniversityApplicationDocumentListState> {
  const { supabase } = await requireCounselor();
  try {
    return await submitListUniversityApplicationDocuments(
      formData,
      async (applicationId) => {
        const { data, error } = await supabase.rpc(
          "list_university_application_documents",
          { p_application_id: applicationId },
        );
        return { data, error };
      },
    );
  } catch {
    return {
      status: "error",
      message: "Application documents are temporarily unavailable.",
    };
  }
}

export async function prepareUniversityApplicationDocumentUploadAction(
  formData: FormData,
): Promise<UniversityApplicationDocumentPrepareState> {
  const { supabase } = await requireCounselor();
  try {
    return await submitPrepareUniversityApplicationDocumentUpload(formData, {
      supabaseUrl: getSupabaseEnv().url,
      prepare: async (input) => {
        const { data, error } = await supabase
          .rpc("prepare_university_application_document_upload", {
            p_application_id: input.applicationId,
            p_document_title: input.documentTitle,
            p_original_file_name: input.originalFileName,
            p_mime_type: input.mimeType,
            p_file_size_bytes: input.fileSizeBytes,
          })
          .maybeSingle();
        return { data, error };
      },
      createSignedUpload: async (bucketId, path) => {
        const { data, error } = await supabase.storage
          .from(bucketId)
          .createSignedUploadUrl(path, { upsert: false });
        return { data, error };
      },
    });
  } catch {
    return {
      status: "error",
      message: "The document upload could not be prepared.",
    };
  }
}

export async function finalizeUniversityApplicationDocumentUploadAction(
  formData: FormData,
): Promise<UniversityApplicationDocumentMutationState> {
  const { supabase } = await requireCounselor();
  try {
    return await submitFinalizeUniversityApplicationDocumentUpload(
      formData,
      async (documentId) => {
        const { data, error } = await supabase
          .rpc("finalize_university_application_document_upload", {
            p_document_id: documentId,
          })
          .maybeSingle();
        return { data, error };
      },
    );
  } catch {
    return {
      status: "error",
      message: "The document upload could not be finalized.",
    };
  }
}

export async function removeUniversityApplicationDocumentAction(
  formData: FormData,
): Promise<UniversityApplicationDocumentMutationState> {
  const { supabase } = await requireCounselor();
  try {
    return await submitRemoveUniversityApplicationDocument(
      formData,
      async (documentId, removalReason) => {
        const { data, error } = await supabase
          .rpc("soft_remove_university_application_document", {
            p_document_id: documentId,
            p_removal_reason: removalReason,
          })
          .maybeSingle();
        return { data, error };
      },
    );
  } catch {
    return {
      status: "error",
      message: "The document could not be removed.",
    };
  }
}
