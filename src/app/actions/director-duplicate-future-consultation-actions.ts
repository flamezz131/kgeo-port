"use server";

import { revalidatePath } from "next/cache";
import {
  submitDuplicateFutureConsultationClosure,
  type DuplicateFutureClosureActionState,
} from "@/lib/director/duplicate-future-consultation";
import { requireDirector } from "@/lib/permissions";

export async function closeDuplicateFutureWaitingConsultationAction(
  consultationId: string,
  _previousState: DuplicateFutureClosureActionState,
  formData: FormData,
): Promise<DuplicateFutureClosureActionState> {
  const { supabase } = await requireDirector();
  const state = await submitDuplicateFutureConsultationClosure(
    consultationId,
    formData,
    async (trustedConsultationId, trustedReason) => {
      const { data, error } = await supabase.rpc(
        "close_duplicate_future_waiting_consultation",
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
