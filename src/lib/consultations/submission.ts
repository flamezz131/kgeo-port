import type {
  ConsultationActionState,
  HigherStudiesInterest,
  ConsultationReceipt,
} from "@/types";
import { validateConsultationRequest } from "@/lib/validation/consultation";

export type ConsultationBookingPayload = {
  studentName: string;
  rollNumber: string;
  personalEmail: string;
  collegeEndYear: number;
  department: string;
  course: string;
  mobileNumber: string;
  higherStudiesInterest: HigherStudiesInterest;
  consultationDate: string;
  slotStart: string;
};

export type ConsultationBooking = (
  payload: ConsultationBookingPayload,
) => Promise<{ data: ConsultationReceipt | null; error: unknown }>;

function readErrorText(error: unknown, property: string) {
  if (
    (typeof error !== "object" || error === null) &&
    typeof error !== "function"
  ) {
    return "";
  }

  try {
    const value = Reflect.get(error, property);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

export function getConsultationDatabaseErrorState(
  error: unknown,
): ConsultationActionState {
  const code = readErrorText(error, "code");
  const constraint = readErrorText(error, "constraint");
  const internalText = ["message", "details", "hint"]
    .map((property) => readErrorText(error, property))
    .join(" ")
    .toLowerCase();

  if (
    code === "23505" &&
    (constraint === "consultation_requests_active_slot_key" ||
      constraint === "consultation_requests_active_student_slot_key" ||
      constraint === "consultation_requests_active_counselor_slot_key" ||
      internalText.includes("consultation_requests_active_slot_key") ||
      internalText.includes("consultation_requests_active_student_slot_key") ||
      internalText.includes(
        "consultation_requests_active_counselor_slot_key",
      ))
  ) {
    return {
      status: "error",
      message:
        "This time slot is no longer available. Please choose another available slot.",
      errors: { slotStart: ["Choose another available time slot."] },
      refreshAvailability: true,
    };
  }

  if (code === "23514" && internalText.includes("slot has expired")) {
    return {
      status: "error",
      message: "This time slot has expired. Please choose another available slot.",
      errors: { slotStart: ["Choose another available time slot."] },
      refreshAvailability: true,
    };
  }

  if (code === "23514" && internalText.includes("not an approved slot")) {
    return {
      status: "error",
      message: "This time slot is not available. Please choose another slot.",
      errors: { slotStart: ["Choose an available time slot."] },
      refreshAvailability: true,
    };
  }

  if (
    code === "23514" &&
    (internalText.includes("date cannot be in the past") ||
      internalText.includes("next seven calendar dates") ||
      internalText.includes("monday through friday"))
  ) {
    return {
      status: "error",
      message: "That consultation date is no longer available. Choose another date.",
      errors: { consultationDate: ["Choose an available weekday."] },
      refreshAvailability: true,
    };
  }

  if (
    internalText.includes(
      "no counselor is available for the selected consultation slot",
    ) ||
    internalText.includes("selected consultation date or slot is unavailable")
  ) {
    return {
      status: "error",
      message:
        "No counselor is available for that time. Please choose another slot.",
      errors: { slotStart: ["Choose another available time slot."] },
      refreshAvailability: true,
    };
  }

  if (
    code === "23514" &&
    internalText.includes("requires operational resolution")
  ) {
    return {
      status: "error",
      message:
        "An earlier consultation needs review before another can be booked.",
    };
  }

  if (code === "42501") {
    return {
      status: "error",
      message: "You are not authorized to book this consultation.",
    };
  }

  return {
    status: "error",
    message: "We could not book your consultation. Please try again.",
  };
}

export async function submitConsultationRequest(
  formData: FormData,
  book: ConsultationBooking,
  now = new Date(),
): Promise<ConsultationActionState> {
  const validation = validateConsultationRequest(formData, now);
  if (!validation.success) {
    return { status: "error", errors: validation.errors };
  }

  const payload: ConsultationBookingPayload = {
    studentName: validation.data.studentName,
    rollNumber: validation.data.rollNumber,
    personalEmail: validation.data.personalEmail,
    collegeEndYear: validation.data.collegeEndYear,
    department: validation.data.department,
    course: validation.data.course,
    mobileNumber: validation.data.mobileNumber,
    higherStudiesInterest: validation.data.higherStudiesInterest,
    consultationDate: validation.data.consultationDate,
    slotStart: validation.data.slotStart,
  };

  try {
    const { data, error } = await book(payload);
    if (error) return getConsultationDatabaseErrorState(error);
    if (!data || data.status !== "scheduled") {
      return getConsultationDatabaseErrorState(null);
    }

    return {
      status: "success",
      message: "Consultation Confirmed",
      receipt: data,
    };
  } catch (error) {
    return getConsultationDatabaseErrorState(error);
  }
}
