"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireDirector } from "@/lib/permissions";
import type { ActionState } from "@/types";

const counselorUserIdSchema = z.uuid();

async function transitionCounselorApproval(
  userId: string,
  operation: "approve_counselor" | "reject_counselor",
): Promise<ActionState> {
  const validation = counselorUserIdSchema.safeParse(userId);
  if (!validation.success) {
    return { status: "error", message: "The counselor request is invalid." };
  }

  const { supabase } = await requireDirector();
  const { error } = await supabase.rpc(operation, {
    p_user_id: validation.data,
  });

  if (error) {
    return {
      status: "error",
      message: "The counselor approval state could not be changed.",
    };
  }

  revalidatePath("/director/counselors");
  return {
    status: "success",
    message:
      operation === "approve_counselor"
        ? "Counselor approved successfully."
        : "Counselor registration rejected.",
  };
}

export async function approveCounselorAction(
  userId: string,
): Promise<ActionState> {
  return transitionCounselorApproval(userId, "approve_counselor");
}

export async function rejectCounselorAction(
  userId: string,
): Promise<ActionState> {
  return transitionCounselorApproval(userId, "reject_counselor");
}
