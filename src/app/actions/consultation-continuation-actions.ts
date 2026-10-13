"use server";

import { revalidatePath } from "next/cache";
import {
  submitContinueWithKgeo,
  type ContinueWithKgeoActionState,
} from "@/lib/consultations/continuation";
import { requireStudent } from "@/lib/permissions";

export async function continueWithKgeoAction(
  previousState: ContinueWithKgeoActionState,
  formData: FormData,
): Promise<ContinueWithKgeoActionState> {
  void previousState;
  void formData;
  const { supabase } = await requireStudent();
  const state = await submitContinueWithKgeo({
    activate: async () => {
      const { data, error } = await supabase.rpc("continue_with_kgeo");
      return { data, error };
    },
  });

  if (state.status === "success") {
    revalidatePath("/student/dashboard");
    revalidatePath("/counselor/students");
  }

  return state;
}
