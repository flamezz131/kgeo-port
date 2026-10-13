"use server";

import { revalidatePath } from "next/cache";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import {
  submitGlobalReadinessAssessment,
  type GlobalReadinessActionState,
} from "@/lib/counselor/global-readiness-submission";
import { isStudent360StudentId } from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";

export async function createGlobalReadinessAssessmentAction(
  studentId: string,
  _previousState: GlobalReadinessActionState,
  formData: FormData,
): Promise<GlobalReadinessActionState> {
  if (!isStudent360StudentId(studentId)) {
    return { status: "error", message: "Readiness assessment could not be created." };
  }

  const { supabase } = await requireCounselor();
  const state = await submitGlobalReadinessAssessment(formData, {
    verifyTarget: async () => {
      const identity = await supabase
        .rpc("get_counselor_student_identity", { p_student_id: studentId })
        .maybeSingle();
      if (identity.error || identity.data?.student_id !== studentId) {
        return { valid: false, error: identity.error };
      }
      return verifyPrimaryCounselorCaseAccess(supabase, studentId);
    },
    save: async (input) => {
      const { scores, rationales } = input;
      return supabase.rpc("create_student_global_readiness_assessment", {
        p_student_id: studentId,
        p_academic_readiness_score: scores.academicReadiness,
        p_intellectual_projects_score: scores.intellectualProjects,
        p_intellectual_distinction_score: scores.intellectualDistinction,
        p_professional_experience_score: scores.professionalExperience,
        p_professional_industry_score: scores.professionalIndustry,
        p_global_leadership_score: scores.globalLeadership,
        p_global_exposure_score: scores.globalExposure,
        p_global_distinction_score: scores.globalDistinction,
        p_application_gmap_score: scores.applicationGmap,
        p_application_advisory_score: scores.applicationAdvisory,
        p_application_documents_score: scores.applicationDocuments,
        p_application_shortlist_score: scores.applicationShortlist,
        p_application_submitted_score: scores.applicationSubmitted,
        p_academic_readiness_rationale: rationales.academicReadiness,
        p_intellectual_projects_rationale: rationales.intellectualProjects,
        p_intellectual_distinction_rationale: rationales.intellectualDistinction,
        p_professional_experience_rationale: rationales.professionalExperience,
        p_professional_industry_rationale: rationales.professionalIndustry,
        p_global_leadership_rationale: rationales.globalLeadership,
        p_global_exposure_rationale: rationales.globalExposure,
        p_global_distinction_rationale: rationales.globalDistinction,
        p_application_gmap_rationale: rationales.applicationGmap,
        p_application_advisory_rationale: rationales.applicationAdvisory,
        p_application_documents_rationale: rationales.applicationDocuments,
        p_application_shortlist_rationale: rationales.applicationShortlist,
        p_application_submitted_rationale: rationales.applicationSubmitted,
        p_assessment_rationale: input.assessmentRationale,
        p_parent_safe_summary: input.parentSafeSummary,
      });
    },
  });

  if (state.status === "success") {
    revalidatePath(`/counselor/students/${studentId}/readiness`);
  }
  return state;
}
