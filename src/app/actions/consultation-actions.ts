"use server";

import { revalidatePath } from "next/cache";
import { submitConsultationRequest } from "@/lib/consultations/submission";
import { requireStudent } from "@/lib/permissions";
import type { ConsultationActionState } from "@/types";

export async function createConsultation(
  _previousState: ConsultationActionState,
  formData: FormData,
): Promise<ConsultationActionState> {
  const { supabase } = await requireStudent();

  const state = await submitConsultationRequest(formData, async (payload) => {
    const { data, error } = await supabase
      .rpc("book_student_consultation", {
        p_student_name: payload.studentName,
        p_roll_number: payload.rollNumber,
        p_personal_email: payload.personalEmail,
        p_college_end_year: payload.collegeEndYear,
        p_department: payload.department,
        p_course: payload.course,
        p_mobile_number: payload.mobileNumber,
        p_higher_studies_interest: payload.higherStudiesInterest,
        p_consultation_date: payload.consultationDate,
        p_slot_start: payload.slotStart,
      })
      .single();

    if (
      error ||
      !data?.consultation_date ||
      !data.slot_start ||
      !data.slot_end
    ) {
      return { data: null, error };
    }

    return {
      data: {
        request_number: data.request_number,
        status: data.status,
        consultation_date: data.consultation_date,
        slot_start: data.slot_start,
        slot_end: data.slot_end,
      },
      error: null,
    };
  });

  if (state.status === "success") {
    revalidatePath("/student/dashboard");
  }

  return state;
}
