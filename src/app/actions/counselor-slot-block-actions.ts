"use server";

import { revalidatePath } from "next/cache";
import {
  getCounselorSlotBlockErrorMessage,
  parseCounselorSlotBlock,
  parseCounselorSlotBlockRelease,
  type CounselorSlotBlockActionState,
} from "@/lib/consultations/counselor-slot-blocking";
import { requireCounselor } from "@/lib/permissions";

function revalidateCounselorSchedule() {
  revalidatePath("/counselor/dashboard");
  revalidatePath("/counselor/schedule");
  revalidatePath("/student/consultation");
}

export async function blockCounselorSlot(
  _previousState: CounselorSlotBlockActionState,
  formData: FormData,
): Promise<CounselorSlotBlockActionState> {
  const validation = parseCounselorSlotBlock(formData);
  if (!validation.success) {
    return {
      status: "error",
      errors: validation.error.flatten().fieldErrors,
    };
  }

  const { supabase } = await requireCounselor();
  const { error } = await supabase.rpc("block_my_consultation_slot", {
    p_consultation_date: validation.data.consultationDate,
    p_slot_start: validation.data.slotStart,
    p_reason: validation.data.reason || null,
  });
  if (error) {
    return {
      status: "error",
      message: getCounselorSlotBlockErrorMessage(error),
    };
  }

  revalidateCounselorSchedule();
  return { status: "success", message: "Slot blocked." };
}

export async function releaseCounselorSlotBlock(
  _previousState: CounselorSlotBlockActionState,
  formData: FormData,
): Promise<CounselorSlotBlockActionState> {
  const validation = parseCounselorSlotBlockRelease(formData);
  if (!validation.success) {
    return { status: "error", message: "The slot block is invalid." };
  }

  const { supabase } = await requireCounselor();
  const { data, error } = await supabase.rpc(
    "release_my_consultation_slot_block",
    { p_block_id: validation.data.blockId },
  );
  if (error || data !== true) {
    return {
      status: "error",
      message: getCounselorSlotBlockErrorMessage(error),
    };
  }

  revalidateCounselorSchedule();
  return { status: "success", message: "Slot unblocked." };
}
