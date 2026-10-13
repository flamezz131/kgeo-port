import {
  getAsiaKolkataBusinessDateTime,
  isStrictCalendarDate,
  isWeekendDate,
  normalizeDatabaseTime,
} from "@/lib/consultations/booking";
import type { ConsultationStatus } from "@/types";

export type ConsultationLifecycleState =
  | "upcoming"
  | "in_progress"
  | "assignment_pending"
  | "counselor_assigned"
  | "outcome_required"
  | "expired_request"
  | "completed"
  | "no_show"
  | "cancelled"
  | "pending";

export type ConsultationPresentationGroup =
  | "upcoming"
  | "pending"
  | "history";

export type ConsultationLifecycleInput = {
  status: ConsultationStatus;
  consultationDate: string | null;
  slotStart: string | null;
  slotEnd: string | null;
};

function getTimeMinutes(value: string): number {
  return Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5));
}

function isCanonicalSchedule(
  consultationDate: string,
  slotStart: string,
  slotEnd: string,
): boolean {
  const startMinutes = getTimeMinutes(slotStart);
  const endMinutes = getTimeMinutes(slotEnd);
  return (
    !isWeekendDate(consultationDate) &&
    startMinutes >= 9 * 60 &&
    startMinutes <= 16 * 60 + 30 &&
    startMinutes % 30 === 0 &&
    endMinutes === startMinutes + 30
  );
}

export function getConsultationLifecycleState(
  consultation: ConsultationLifecycleInput,
  now: Date,
): ConsultationLifecycleState {
  if (consultation.status === "completed") return "completed";
  if (consultation.status === "no_show") return "no_show";
  if (consultation.status === "cancelled") return "cancelled";

  const slotStart = normalizeDatabaseTime(consultation.slotStart);
  const slotEnd = normalizeDatabaseTime(consultation.slotEnd);
  if (
    !consultation.consultationDate ||
    !isStrictCalendarDate(consultation.consultationDate) ||
    !slotStart ||
    !slotEnd ||
    !isCanonicalSchedule(consultation.consultationDate, slotStart, slotEnd)
  ) {
    return "pending";
  }

  const business = getAsiaKolkataBusinessDateTime(now);
  const isElapsed =
    consultation.consultationDate < business.date ||
    (consultation.consultationDate === business.date &&
      slotEnd <= business.time);

  if (isElapsed) {
    return consultation.status === "scheduled" ||
      consultation.status === "counselor_assigned"
      ? "outcome_required"
      : "expired_request";
  }

  if (
    consultation.status === "submitted" ||
    consultation.status === "waiting_for_assignment"
  ) {
    return "assignment_pending";
  }

  if (consultation.status === "counselor_assigned") {
    return "counselor_assigned";
  }

  if (
    consultation.consultationDate > business.date ||
    (consultation.consultationDate === business.date &&
      slotStart > business.time)
  ) {
    return "upcoming";
  }

  if (
    consultation.consultationDate === business.date &&
    slotStart <= business.time &&
    slotEnd > business.time
  ) {
    return "in_progress";
  }

  return "outcome_required";
}

export function getConsultationLifecycleLabel(
  state: ConsultationLifecycleState,
) {
  const labels: Record<ConsultationLifecycleState, string> = {
    upcoming: "Upcoming",
    in_progress: "In progress",
    assignment_pending: "Counselor assignment pending",
    counselor_assigned: "Counselor assigned",
    outcome_required: "Outcome required",
    expired_request: "Expired request",
    completed: "Completed",
    no_show: "Student no-show",
    cancelled: "Cancelled",
    pending: "Pending",
  };

  return labels[state];
}

export function getStudentConsultationLifecycleLabel(
  state: ConsultationLifecycleState,
): string {
  if (state === "outcome_required") return "Outcome Pending";
  if (state === "expired_request") return "Expired Request";
  if (state === "assignment_pending" || state === "pending") {
    return "Booking needs review";
  }
  return getConsultationLifecycleLabel(state);
}

export function getConsultationPresentationGroup(
  state: ConsultationLifecycleState,
): ConsultationPresentationGroup {
  if (
    state === "upcoming" ||
    state === "in_progress" ||
    state === "assignment_pending" ||
    state === "counselor_assigned"
  ) {
    return "upcoming";
  }
  if (state === "pending") return "pending";
  return "history";
}

export function getConsultationPresentationGroupLabel(
  group: ConsultationPresentationGroup,
): string {
  if (group === "upcoming") return "Upcoming";
  if (group === "pending") return "Pending";
  return "Past / History";
}

export function getUpcomingScheduledFilter(
  businessDate: string,
  businessTime: string,
) {
  return `consultation_date.gt.${businessDate},and(consultation_date.eq.${businessDate},slot_start.gt.${businessTime})`;
}

export function getActiveOrFutureScheduledFilter(
  businessDate: string,
  businessTime: string,
) {
  return `consultation_date.gt.${businessDate},and(consultation_date.eq.${businessDate},slot_end.gt.${businessTime})`;
}

export function getOutcomeRequiredScheduledFilter(
  businessDate: string,
  businessTime: string,
) {
  return `consultation_date.lt.${businessDate},and(consultation_date.eq.${businessDate},slot_end.lte.${businessTime})`;
}
