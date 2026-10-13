"use server";

import { revalidatePath } from "next/cache";
import {
  PROGRESSION_EVIDENCE_BUCKET_ID,
} from "@/lib/counselor/progression-evidence";
import {
  loadProgressionEvidenceOperationRow,
  verifyCounselorProgressionEventTarget,
} from "@/lib/counselor/progression-evidence-server";
import {
  submitProgressionEvidenceFinalize,
  submitProgressionEvidencePrepare,
  submitProgressionEvidenceRemove,
  type ProgressionEvidenceMutationActionState,
  type ProgressionEvidencePrepareActionState,
} from "@/lib/counselor/progression-evidence-submission";
import { requireCounselor } from "@/lib/permissions";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";

async function verifyOwnedProgressionEvent(
  supabase: Parameters<typeof verifyCounselorProgressionEventTarget>[0],
  studentId: string,
  progressionEventId: string,
) {
  const ownership = await verifyPrimaryCounselorCaseAccess(
    supabase,
    studentId,
  );
  return ownership.valid && !ownership.error
    ? verifyCounselorProgressionEventTarget(
        supabase,
        studentId,
        progressionEventId,
      )
    : ownership;
}

function revalidateStudent360(studentId: string) {
  revalidatePath(`/counselor/students/${studentId}`);
}

export async function prepareProgressionEvidenceUploadAction(
  formData: FormData,
): Promise<ProgressionEvidencePrepareActionState> {
  const { supabase } = await requireCounselor();

  return submitProgressionEvidencePrepare(formData, {
    verifyTarget: (studentId, progressionEventId) =>
      verifyOwnedProgressionEvent(
        supabase,
        studentId,
        progressionEventId,
      ),
    prepare: async (progressionEventId, file) => {
      const { data, error } = await supabase
        .rpc("prepare_student_counseling_progression_evidence_upload", {
          p_progression_event_id: progressionEventId,
          p_original_file_name: file.originalFileName,
          p_mime_type: file.mimeType,
          p_file_size_bytes: file.fileSizeBytes,
        })
        .maybeSingle();
      return { data, error };
    },
    createSignedUpload: async (bucketId, storagePath) => {
      if (bucketId !== PROGRESSION_EVIDENCE_BUCKET_ID) {
        return { data: null, error: true };
      }
      const { data, error } = await supabase.storage
        .from(bucketId)
        .createSignedUploadUrl(storagePath, { upsert: false });
      return { data, error };
    },
  });
}

export async function finalizeProgressionEvidenceUploadAction(
  formData: FormData,
): Promise<ProgressionEvidenceMutationActionState> {
  const { supabase } = await requireCounselor();
  const state = await submitProgressionEvidenceFinalize(formData, {
    verifyTarget: (studentId, progressionEventId) =>
      verifyOwnedProgressionEvent(
        supabase,
        studentId,
        progressionEventId,
      ),
    loadEvidence: async (evidenceId) => {
      const { data, error } =
        await loadProgressionEvidenceOperationRow(supabase, evidenceId);
      return { data, error };
    },
    finalize: async (evidenceId) => {
      const { data, error } = await supabase
        .rpc("finalize_student_counseling_progression_evidence_upload", {
          p_evidence_id: evidenceId,
        })
        .maybeSingle();
      return { data, error };
    },
  });

  const studentId = formData.get("studentId");
  if (state.status === "success" && typeof studentId === "string") {
    revalidateStudent360(studentId);
  }
  return state;
}

export async function removeProgressionEvidenceAction(
  formData: FormData,
): Promise<ProgressionEvidenceMutationActionState> {
  const { supabase } = await requireCounselor();
  const state = await submitProgressionEvidenceRemove(formData, {
    verifyTarget: (studentId, progressionEventId) =>
      verifyOwnedProgressionEvent(
        supabase,
        studentId,
        progressionEventId,
      ),
    loadEvidence: async (evidenceId) => {
      const { data, error } =
        await loadProgressionEvidenceOperationRow(supabase, evidenceId);
      return { data, error };
    },
    remove: async (evidenceId, removalReason) => {
      const { data, error } = await supabase
        .rpc("remove_student_counseling_progression_evidence", {
          p_evidence_id: evidenceId,
          p_removal_reason: removalReason,
        })
        .maybeSingle();
      return { data, error };
    },
  });

  const studentId = formData.get("studentId");
  if (state.status === "success" && typeof studentId === "string") {
    revalidateStudent360(studentId);
  }
  return state;
}
