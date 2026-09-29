"use server";

import { revalidatePath } from "next/cache";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import type { ApplicationJourneyActionState } from "@/lib/counselor/application-journey";
import { submitApplicationJourney } from "@/lib/counselor/application-journey-submission";
import { requireCounselor } from "@/lib/permissions";

export async function saveApplicationJourneyAction(
  _previousState: ApplicationJourneyActionState,
  formData: FormData,
): Promise<ApplicationJourneyActionState> {
  const { supabase } = await requireCounselor();
  let trustedStudentId: string | null = null;
  let trustedApplicationId: string | null = null;

  const state = await submitApplicationJourney(formData, {
    verifyTarget: async (studentId, applicationId) => {
      const ownership = await verifyPrimaryCounselorCaseAccess(
        supabase,
        studentId,
      );
      if (!ownership.valid || ownership.error) return ownership;

      const application = await supabase
        .from("student_university_applications")
        .select("id, student_id, is_archived")
        .eq("id", applicationId)
        .eq("student_id", studentId)
        .maybeSingle();
      const valid =
        !application.error &&
        application.data?.id === applicationId &&
        application.data.student_id === studentId &&
        application.data.is_archived === false;
      if (valid) {
        trustedStudentId = studentId;
        trustedApplicationId = applicationId;
      }
      return { valid, error: application.error };
    },
    save: async (input) => {
      const result = await supabase.rpc(
        "record_university_application_journey",
        {
          p_application_id: input.applicationId,
          p_university_decision: input.universityDecision,
          p_university_decision_date: input.universityDecisionDate,
          p_offer_status: input.offerStatus,
          p_offer_date: input.offerDate,
          p_conditional_offer_requirements:
            input.conditionalOfferRequirements,
          p_condition_due_date: input.conditionDueDate,
          p_conditions_satisfied_date: input.conditionsSatisfiedDate,
          p_student_decision: input.studentDecision,
          p_student_decision_date: input.studentDecisionDate,
          p_fee_status: input.feeStatus,
          p_fee_payment_date: input.feePaymentDate,
          p_visa_status: input.visaStatus,
          p_visa_submission_date: input.visaSubmissionDate,
          p_visa_decision_date: input.visaDecisionDate,
          p_enrollment_status: input.enrollmentStatus,
          p_enrollment_date: input.enrollmentDate,
          p_change_reason: input.changeReason,
        },
      );
      return { data: result.data, error: result.error };
    },
  });

  if (
    state.status === "success" &&
    trustedStudentId &&
    trustedApplicationId
  ) {
    revalidatePath(`/counselor/students/${trustedStudentId}/applications`);
    revalidatePath(
      `/counselor/students/${trustedStudentId}/applications/${trustedApplicationId}`,
    );
    revalidatePath("/counselor/applications");
    revalidatePath("/student/dashboard");
    revalidatePath("/director/applications");
  }

  return state;
}
