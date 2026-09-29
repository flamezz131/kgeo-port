"use server";

import { revalidatePath } from "next/cache";
import {
  submitConsultationOutcome,
  type ConsultationOutcome,
  type ConsultationOutcomeActionState,
} from "@/lib/consultations/outcome";
import { requireCounselor } from "@/lib/permissions";

async function recordOutcome(
  formData: FormData,
  outcome: ConsultationOutcome,
): Promise<ConsultationOutcomeActionState> {
  const { supabase } = await requireCounselor();
  const state = await submitConsultationOutcome(formData, outcome, {
    record: async (consultationId, trustedOutcome) => {
      const { data, error } = await supabase.rpc(
        "record_consultation_outcome",
        {
          p_consultation_id: consultationId,
          p_outcome: trustedOutcome,
        },
      );
      return { data, error };
    },
  });

  if (state.status === "success") {
    revalidatePath("/counselor/dashboard");
    revalidatePath("/counselor/schedule");
    revalidatePath("/counselor/students/[student-id]", "page");
  }
  return state;
}

export async function markConsultationCompleted(
  _previousState: ConsultationOutcomeActionState,
  formData: FormData,
) {
  return recordOutcome(formData, "completed");
}

export async function markConsultationNoShow(
  _previousState: ConsultationOutcomeActionState,
  formData: FormData,
) {
  return recordOutcome(formData, "no_show");
}
