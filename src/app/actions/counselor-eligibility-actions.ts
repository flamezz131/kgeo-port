"use server";

import { revalidatePath } from "next/cache";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import {
  submitEligibilityAssessment,
  type EligibilityAssessmentActionState,
} from "@/lib/counselor/eligibility-submission";
import { isCounselorStudentIdentity } from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";

export async function saveStudentEligibilityAssessmentAction(
  _previousState: EligibilityAssessmentActionState,
  formData: FormData,
): Promise<EligibilityAssessmentActionState> {
  const { supabase } = await requireCounselor();
  let trustedStudentId: string | null = null;

  const state = await submitEligibilityAssessment(formData, {
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
        "save_student_eligibility_assessment",
        {
          p_student_id: input.studentId,
          p_overall_status: input.overallStatus,
          p_academic_status: input.academicStatus,
          p_backlog_status: input.backlogStatus,
          p_english_readiness: input.englishReadiness,
          p_aptitude_readiness: input.aptitudeReadiness,
          p_profile_strength: input.profileStrength,
          p_application_readiness: input.applicationReadiness,
          p_recommended_countries: input.recommendedCountries,
          p_recommended_intake: input.recommendedIntake,
          p_assessment_summary: input.assessmentSummary,
        },
      );
      return { data, error };
    },
  });

  if (state.status === "success" && trustedStudentId) {
    revalidatePath(`/counselor/students/${trustedStudentId}`);
    revalidatePath(`/counselor/students/${trustedStudentId}/eligibility`);
  }
  return state;
}
