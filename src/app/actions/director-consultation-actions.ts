"use server";

import { revalidatePath } from "next/cache";
import {
  submitLegacyConsultationClosure,
  type LegacyConsultationClosureActionState,
} from "@/lib/director/legacy-consultation";
import { requireDirector } from "@/lib/permissions";

export async function closeLegacyWaitingConsultationAction(
  consultationId: string,
  _previousState: LegacyConsultationClosureActionState,
  formData: FormData,
): Promise<LegacyConsultationClosureActionState> {
  const { supabase } = await requireDirector();
  const state = await submitLegacyConsultationClosure(
    consultationId,
    formData,
    async (trustedConsultationId, trustedReason) => {
      const { data, error } = await supabase.rpc(
        "close_legacy_waiting_consultation",
        {
          p_consultation_id: trustedConsultationId,
          p_reason: trustedReason,
        },
      );
      return { data, error };
    },
  );

  if (state.status === "success") {
    revalidatePath("/director/consultations");
    revalidatePath("/counselor/schedule");
    revalidatePath("/student/dashboard");
  }

  return state;
}
