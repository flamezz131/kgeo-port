"use server";

import { revalidatePath } from "next/cache";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import type { CounselorSemesterSummaryActionState } from "@/lib/counselor/semester-summary";
import { submitCounselorSemesterSummary } from "@/lib/counselor/semester-summary-submission";
import { isCounselorStudentIdentity } from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";

export async function saveCounselorSemesterSummaryAction(
  _previousState: CounselorSemesterSummaryActionState,
  formData: FormData,
): Promise<CounselorSemesterSummaryActionState> {
  const { supabase } = await requireCounselor();
  let trustedStudentId: string | null = null;

  const state = await submitCounselorSemesterSummary(formData, {
    verifyTarget: async (studentId) => {
      const identity = await supabase
        .rpc("get_counselor_student_identity", { p_student_id: studentId })
        .maybeSingle();
      if (
        identity.error ||
        !isCounselorStudentIdentity(identity.data, studentId)
      ) {
        return { valid: false, error: identity.error };
      }

      const ownership = await verifyPrimaryCounselorCaseAccess(
        supabase,
        studentId,
      );
      if (ownership.valid && !ownership.error) trustedStudentId = studentId;
      return ownership;
    },
    save: async (input) => {
      const { data, error } = await supabase.rpc(
        "record_counselor_student_semester_summary",
        {
          p_student_id: input.studentId,
          p_academic_period: input.academicPeriod,
          p_progress_summary: input.progressSummary,
          p_achievements_highlights: input.achievementsHighlights,
          p_areas_requiring_attention: input.areasRequiringAttention,
          p_next_semester_actions: input.nextSemesterActions,
        },
      );
      return { data, error };
    },
  });

  if (state.status === "success" && trustedStudentId) {
    revalidatePath(`/counselor/students/${trustedStudentId}`);
    revalidatePath(`/counselor/students/${trustedStudentId}/advisory`);
  }
  return state;
}
