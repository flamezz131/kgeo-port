"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OFFICIAL_PROGRESSION_CURRENT_COLUMNS,
} from "@/lib/counselor/progression";
import {
  submitOfficialProgressionMutation,
  type OfficialProgressionActionState,
} from "@/lib/counselor/progression-submission";
import {
  submitProgressionCorrection,
  type ProgressionCorrectionActionState,
} from "@/lib/counselor/progression-correction-submission";
import {
  verifyCounselorProgressionEventTarget,
} from "@/lib/counselor/progression-evidence-server";
import { isCounselorStudentIdentity } from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";
import type { Database } from "@/types/database";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";

type KgeoSupabaseClient = SupabaseClient<Database>;

function createTrustedCorrectionTargetVerifier(
  supabase: KgeoSupabaseClient,
) {
  let trustedStudentId: string | null = null;

  return {
    verify: async (studentId: string, eventId: string) => {
      const ownership = await verifyPrimaryCounselorCaseAccess(
        supabase,
        studentId,
      );
      const result = ownership.valid && !ownership.error
        ? await verifyCounselorProgressionEventTarget(
        supabase,
        studentId,
        eventId,
          )
        : ownership;
      if (result.valid && !result.error) trustedStudentId = studentId;
      return result;
    },
    getTrustedStudentId: () => trustedStudentId,
  };
}

function createTrustedProgressionTargetVerifier(
  supabase: KgeoSupabaseClient,
) {
  let trustedStudentId: string | null = null;

  return {
    verify: async (studentId: string) => {
      const { data, error } = await supabase
        .rpc("get_counselor_student_identity", {
          p_student_id: studentId,
        })
        .maybeSingle();
      const ownership = !error && isCounselorStudentIdentity(data, studentId)
        ? await verifyPrimaryCounselorCaseAccess(supabase, studentId)
        : { valid: false, error };
      const valid = ownership.valid && !ownership.error;
      if (valid) trustedStudentId = studentId;
      return { valid, error: ownership.error };
    },
    getTrustedStudentId: () => trustedStudentId,
  };
}

export async function recordStudentCounselingProgressionAction(
  _previousState: OfficialProgressionActionState,
  formData: FormData,
): Promise<OfficialProgressionActionState> {
  const { supabase } = await requireCounselor();
  const targetVerifier =
    createTrustedProgressionTargetVerifier(supabase);

  const state = await submitOfficialProgressionMutation(formData, {
    verifyTarget: targetVerifier.verify,
    loadCurrent: async (studentId) => {
      const { data, error } = await supabase
        .from("student_counseling_progressions")
        .select(OFFICIAL_PROGRESSION_CURRENT_COLUMNS)
        .eq("student_id", studentId)
        .maybeSingle();
      return { data, error };
    },
    record: async (studentId, stage, workflowState, reason) => {
      const { data, error } = await supabase
        .rpc("record_student_counseling_progression", {
          p_student_id: studentId,
          p_stage: stage,
          p_state: workflowState,
          p_change_reason: reason,
        })
        .maybeSingle();
      return { data, error };
    },
  });

  const trustedStudentId = targetVerifier.getTrustedStudentId();
  if (state.status === "success" && trustedStudentId) {
    revalidatePath(`/counselor/students/${trustedStudentId}`);
  }
  return state;
}

export async function undoLatestProgressionEventAction(
  _previousState: ProgressionCorrectionActionState,
  formData: FormData,
): Promise<ProgressionCorrectionActionState> {
  const { supabase } = await requireCounselor();
  const targetVerifier =
    createTrustedCorrectionTargetVerifier(supabase);

  const state = await submitProgressionCorrection(formData, {
    verifyTarget: targetVerifier.verify,
    correct: async (studentId, eventId, correctionReason) => {
      const { data, error } = await supabase
        .rpc("undo_latest_student_counseling_progression_event", {
          p_student_id: studentId,
          p_event_id: eventId,
          p_correction_reason: correctionReason,
        })
        .maybeSingle();
      return { data, error };
    },
  });

  const trustedStudentId = targetVerifier.getTrustedStudentId();
  if (state.status === "success" && trustedStudentId) {
    revalidatePath(`/counselor/students/${trustedStudentId}`);
  }
  return state;
}
