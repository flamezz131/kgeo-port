"use server";

import { revalidatePath } from "next/cache";
import {
  type DirectorAssignmentActionState,
  validateDirectorAssignmentFormData,
} from "@/lib/director/student-assignment";
import { mapDirectorAssignmentDatabaseFailure } from "@/lib/director/student-assignment-errors";
import { requireDirector } from "@/lib/permissions";

function safeDatabaseErrorCode(value: unknown): string {
  if (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string" &&
    /^[A-Z0-9]{5}$/u.test(value.code)
  ) {
    return value.code;
  }
  return "unknown";
}

export async function reassignPrimaryCounselorAction(
  formData: FormData,
): Promise<DirectorAssignmentActionState> {
  const { supabase } = await requireDirector();
  const validation = validateDirectorAssignmentFormData(formData);
  if (!validation.success) {
    return {
      status: "error",
      message: validation.message,
      fieldErrors: validation.fieldErrors,
    };
  }

  const { data, error } = await supabase.rpc(
    "reassign_primary_counselor",
    {
      p_student_id: validation.data.studentId,
      p_counselor_id: validation.data.counselorId,
      p_reason: validation.data.reason,
    },
  );

  if (error) {
    const failure = mapDirectorAssignmentDatabaseFailure(error);
    console.error("[Step 2.5 Primary Counselor reassignment]", {
      stage: "reassign_primary_counselor",
      error_code: safeDatabaseErrorCode(error),
      error_message:
        failure?.databaseMessage ?? "Unrecognized database reassignment error",
    });

    if (failure) {
      return {
        status: "error",
        message: failure.userMessage,
        fieldErrors: failure.field
          ? { [failure.field]: failure.userMessage }
          : undefined,
      };
    }

    return {
      status: "error",
      message:
        "The Primary Counselor assignment could not be changed. Refresh and try again.",
    };
  }

  if (data === null || data.length !== 1) {
    console.error("[Step 2.5 Primary Counselor reassignment]", {
      stage: "reassign_primary_counselor_result",
      error_code: "invalid_result",
      error_message: "Unexpected reassignment result shape",
    });
    return {
      status: "error",
      message:
        "The Primary Counselor assignment could not be changed. Refresh and try again.",
    };
  }

  revalidatePath("/director/students");
  revalidatePath("/director/counselors");
  revalidatePath("/counselor/students");

  return {
    status: "success",
    message: "Primary Counselor reassigned successfully.",
  };
}
