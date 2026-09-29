import { z } from "zod";
import type {
  UniversityApplicationDecision,
  UniversityApplicationEnrollmentStatus,
  UniversityApplicationFeeStatus,
  UniversityApplicationOfferStatus,
  UniversityApplicationStudentDecision,
  UniversityApplicationVisaStatus,
} from "@/types";

export const UNIVERSITY_APPLICATION_DECISIONS = [
  "pending",
  "waitlisted",
  "rejected",
  "offer_received",
] as const satisfies readonly UniversityApplicationDecision[];

export const UNIVERSITY_APPLICATION_OFFER_STATUSES = [
  "none",
  "conditional",
  "unconditional",
] as const satisfies readonly UniversityApplicationOfferStatus[];

export const UNIVERSITY_APPLICATION_STUDENT_DECISIONS = [
  "pending",
  "accepted",
  "declined",
] as const satisfies readonly UniversityApplicationStudentDecision[];

export const UNIVERSITY_APPLICATION_FEE_STATUSES = [
  "not_started",
  "pending",
  "paid",
] as const satisfies readonly UniversityApplicationFeeStatus[];

export const UNIVERSITY_APPLICATION_VISA_STATUSES = [
  "not_started",
  "preparing",
  "submitted",
  "approved",
  "refused",
] as const satisfies readonly UniversityApplicationVisaStatus[];

export const UNIVERSITY_APPLICATION_ENROLLMENT_STATUSES = [
  "not_enrolled",
  "enrolled",
] as const satisfies readonly UniversityApplicationEnrollmentStatus[];

export const UNIVERSITY_APPLICATION_DECISION_LABELS = {
  pending: "Pending",
  waitlisted: "Waitlisted",
  rejected: "Rejected",
  offer_received: "Offer received",
} as const satisfies Record<UniversityApplicationDecision, string>;

export const UNIVERSITY_APPLICATION_OFFER_STATUS_LABELS = {
  none: "No offer",
  conditional: "Conditional offer",
  unconditional: "Unconditional offer",
} as const satisfies Record<UniversityApplicationOfferStatus, string>;

export const UNIVERSITY_APPLICATION_STUDENT_DECISION_LABELS = {
  pending: "Pending",
  accepted: "Accepted",
  declined: "Declined",
} as const satisfies Record<UniversityApplicationStudentDecision, string>;

export const UNIVERSITY_APPLICATION_FEE_STATUS_LABELS = {
  not_started: "Not started",
  pending: "Fee pending",
  paid: "Fee paid",
} as const satisfies Record<UniversityApplicationFeeStatus, string>;

export const UNIVERSITY_APPLICATION_VISA_STATUS_LABELS = {
  not_started: "Not started",
  preparing: "Preparing",
  submitted: "Submitted",
  approved: "Approved",
  refused: "Refused",
} as const satisfies Record<UniversityApplicationVisaStatus, string>;

export const UNIVERSITY_APPLICATION_ENROLLMENT_STATUS_LABELS = {
  not_enrolled: "Not enrolled",
  enrolled: "Enrolled",
} as const satisfies Record<UniversityApplicationEnrollmentStatus, string>;

export const APPLICATION_JOURNEY_HISTORY_LIMIT = 20;
export const APPLICATION_JOURNEY_REQUIREMENTS_LIMIT = 2000;
export const APPLICATION_JOURNEY_REASON_LIMIT = 500;

const nullableDate = z.iso.date().nullable();
const normalizedRequirements = z
  .string()
  .min(1)
  .max(APPLICATION_JOURNEY_REQUIREMENTS_LIMIT)
  .refine((value) => normalizeApplicationJourneyText(value) === value)
  .nullable();

const safeJourneySchema = z
  .object({
    application_id: z.uuid(),
    university_decision: z.enum(UNIVERSITY_APPLICATION_DECISIONS),
    university_decision_date: nullableDate,
    offer_status: z.enum(UNIVERSITY_APPLICATION_OFFER_STATUSES),
    offer_date: nullableDate,
    conditional_offer_requirements: normalizedRequirements,
    condition_due_date: nullableDate,
    conditions_satisfied_date: nullableDate,
    student_decision: z.enum(UNIVERSITY_APPLICATION_STUDENT_DECISIONS),
    student_decision_date: nullableDate,
    fee_status: z.enum(UNIVERSITY_APPLICATION_FEE_STATUSES),
    fee_payment_date: nullableDate,
    visa_status: z.enum(UNIVERSITY_APPLICATION_VISA_STATUSES),
    visa_submission_date: nullableDate,
    visa_decision_date: nullableDate,
    enrollment_status: z.enum(UNIVERSITY_APPLICATION_ENROLLMENT_STATUSES),
    enrollment_date: nullableDate,
    updated_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

const counselorJourneySchema = safeJourneySchema
  .extend({ version_number: z.number().int().min(0) })
  .strict();

const journeyHistorySchema = safeJourneySchema
  .omit({ application_id: true, updated_at: true })
  .extend({
    event_id: z.uuid(),
    version_number: z.number().int().positive(),
    change_reason: z
      .string()
      .min(1)
      .max(APPLICATION_JOURNEY_REASON_LIMIT)
      .refine((value) => normalizeApplicationJourneyText(value) === value),
    changed_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export type StudentApplicationJourney = z.infer<typeof safeJourneySchema>;
export type CounselorApplicationJourney = z.infer<
  typeof counselorJourneySchema
>;
export type CounselorApplicationJourneyEvent = z.infer<
  typeof journeyHistorySchema
>;

export type CounselorApplicationJourneyLoadResult =
  | {
      kind: "ready";
      journey: CounselorApplicationJourney;
      events: CounselorApplicationJourneyEvent[];
    }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export type StudentApplicationJourneyLoadResult =
  | { kind: "ready"; journeys: StudentApplicationJourney[] }
  | { kind: "unavailable" };

export type ApplicationJourneyActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string[]>;
};

export const initialApplicationJourneyActionState: ApplicationJourneyActionState =
  { status: "idle" };

export function normalizeApplicationJourneyText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function parseCounselorApplicationJourney(
  value: unknown,
  applicationId: string,
): CounselorApplicationJourney | null {
  const parsed = z.array(counselorJourneySchema).length(1).safeParse(value);
  if (!parsed.success || parsed.data[0].application_id !== applicationId) {
    return null;
  }
  return parsed.data[0];
}

export function parseCounselorApplicationJourneyHistory(
  value: unknown,
): CounselorApplicationJourneyEvent[] | null {
  const parsed = z
    .array(journeyHistorySchema)
    .max(APPLICATION_JOURNEY_HISTORY_LIMIT)
    .safeParse(value);
  if (!parsed.success) return null;

  const ids = new Set<string>();
  for (let index = 0; index < parsed.data.length; index += 1) {
    const event = parsed.data[index];
    if (ids.has(event.event_id)) return null;
    ids.add(event.event_id);
    const older = parsed.data[index + 1];
    if (older && event.version_number <= older.version_number) return null;
  }
  return parsed.data;
}

export function parseStudentApplicationJourneys(
  value: unknown,
): StudentApplicationJourney[] | null {
  const parsed = z.array(safeJourneySchema).max(100).safeParse(value);
  if (!parsed.success) return null;
  const ids = new Set<string>();
  for (const journey of parsed.data) {
    if (ids.has(journey.application_id)) return null;
    ids.add(journey.application_id);
  }
  return parsed.data;
}

export function formatApplicationJourneyDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(`${value}T00:00:00+05:30`));
}

export function formatApplicationJourneyTimestamp(
  value: string | null,
): string {
  if (!value) return "Not updated yet";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
