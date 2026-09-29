import { z } from "zod";
import type {
  StudentEligibilityAcademicStatus,
  StudentEligibilityApplicationReadiness,
  StudentEligibilityAptitudeReadiness,
  StudentEligibilityBacklogStatus,
  StudentEligibilityEnglishReadiness,
  StudentEligibilityProfileStrength,
  StudentEligibilityStatus,
} from "@/types";

export const ELIGIBILITY_HISTORY_LIMIT = 20;
export const ELIGIBILITY_COUNTRY_LIMIT = 10;
export const ELIGIBILITY_COUNTRY_MAX_LENGTH = 80;
export const ELIGIBILITY_INTAKE_MAX_LENGTH = 40;
export const ELIGIBILITY_SUMMARY_MAX_LENGTH = 1500;

export const STUDENT_ELIGIBILITY_STATUSES = [
  "needs_review",
  "eligible",
  "conditionally_eligible",
  "not_yet_eligible",
] as const satisfies readonly StudentEligibilityStatus[];

export const STUDENT_ELIGIBILITY_ACADEMIC_STATUSES = [
  "needs_review",
  "meets_requirement",
  "conditionally_meets",
  "does_not_meet",
] as const satisfies readonly StudentEligibilityAcademicStatus[];

export const STUDENT_ELIGIBILITY_BACKLOG_STATUSES = [
  "needs_review",
  "clear",
  "acceptable",
  "concern",
] as const satisfies readonly StudentEligibilityBacklogStatus[];

export const STUDENT_ELIGIBILITY_ENGLISH_READINESS = [
  "needs_review",
  "ready",
  "in_progress",
  "required",
] as const satisfies readonly StudentEligibilityEnglishReadiness[];

export const STUDENT_ELIGIBILITY_APTITUDE_READINESS = [
  "needs_review",
  "ready",
  "in_progress",
  "not_required",
  "required",
] as const satisfies readonly StudentEligibilityAptitudeReadiness[];

export const STUDENT_ELIGIBILITY_PROFILE_STRENGTHS = [
  "needs_review",
  "strong",
  "good",
  "developing",
  "weak",
] as const satisfies readonly StudentEligibilityProfileStrength[];

export const STUDENT_ELIGIBILITY_APPLICATION_READINESS = [
  "needs_review",
  "ready",
  "partially_ready",
  "not_ready",
] as const satisfies readonly StudentEligibilityApplicationReadiness[];

export const STUDENT_ELIGIBILITY_STATUS_LABELS = {
  needs_review: "Needs Review",
  eligible: "Eligible",
  conditionally_eligible: "Conditionally Eligible",
  not_yet_eligible: "Not Yet Eligible",
} as const satisfies Record<StudentEligibilityStatus, string>;

export const STUDENT_ELIGIBILITY_ACADEMIC_STATUS_LABELS = {
  needs_review: "Needs Review",
  meets_requirement: "Meets Requirement",
  conditionally_meets: "Conditionally Meets",
  does_not_meet: "Does Not Meet",
} as const satisfies Record<StudentEligibilityAcademicStatus, string>;

export const STUDENT_ELIGIBILITY_BACKLOG_STATUS_LABELS = {
  needs_review: "Needs Review",
  clear: "Clear",
  acceptable: "Acceptable",
  concern: "Concern",
} as const satisfies Record<StudentEligibilityBacklogStatus, string>;

export const STUDENT_ELIGIBILITY_ENGLISH_READINESS_LABELS = {
  needs_review: "Needs Review",
  ready: "Ready",
  in_progress: "In Progress",
  required: "Required",
} as const satisfies Record<StudentEligibilityEnglishReadiness, string>;

export const STUDENT_ELIGIBILITY_APTITUDE_READINESS_LABELS = {
  needs_review: "Needs Review",
  ready: "Ready",
  in_progress: "In Progress",
  not_required: "Not Required",
  required: "Required",
} as const satisfies Record<StudentEligibilityAptitudeReadiness, string>;

export const STUDENT_ELIGIBILITY_PROFILE_STRENGTH_LABELS = {
  needs_review: "Needs Review",
  strong: "Strong",
  good: "Good",
  developing: "Developing",
  weak: "Weak",
} as const satisfies Record<StudentEligibilityProfileStrength, string>;

export const STUDENT_ELIGIBILITY_APPLICATION_READINESS_LABELS = {
  needs_review: "Needs Review",
  ready: "Ready",
  partially_ready: "Partially Ready",
  not_ready: "Not Ready",
} as const satisfies Record<StudentEligibilityApplicationReadiness, string>;

const normalizedText = (maximumLength: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximumLength)
    .refine((value) => !/[\u0000-\u001f\u007f]/.test(value))
    .refine((value) => value === normalizeEligibilityText(value));

const eligibilityTimestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.(\d{1,6}))?(?:Z|[+-]\d{2}:\d{2})$/;

export function parseEligibilityTimestamp(value: string): bigint | null {
  const match = eligibilityTimestampPattern.exec(value);
  if (!match) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const microseconds = (match[1] ?? "").padEnd(6, "0");
  return (
    BigInt(Math.trunc(milliseconds)) * BigInt(1000) +
    BigInt(microseconds.slice(3) || "0")
  );
}

const assessmentSchema = z
  .object({
    assessment_id: z.uuid(),
    overall_status: z.enum(STUDENT_ELIGIBILITY_STATUSES),
    academic_status: z.enum(STUDENT_ELIGIBILITY_ACADEMIC_STATUSES),
    backlog_status: z.enum(STUDENT_ELIGIBILITY_BACKLOG_STATUSES),
    english_readiness: z.enum(STUDENT_ELIGIBILITY_ENGLISH_READINESS),
    aptitude_readiness: z.enum(STUDENT_ELIGIBILITY_APTITUDE_READINESS),
    profile_strength: z.enum(STUDENT_ELIGIBILITY_PROFILE_STRENGTHS),
    application_readiness: z.enum(
      STUDENT_ELIGIBILITY_APPLICATION_READINESS,
    ),
    recommended_countries: z
      .array(normalizedText(ELIGIBILITY_COUNTRY_MAX_LENGTH))
      .max(ELIGIBILITY_COUNTRY_LIMIT),
    recommended_intake: normalizedText(ELIGIBILITY_INTAKE_MAX_LENGTH).nullable(),
    assessment_summary: normalizedText(ELIGIBILITY_SUMMARY_MAX_LENGTH),
    assessor_full_name: normalizedText(200),
    assessed_at: z.string().refine(
      (value) => parseEligibilityTimestamp(value) !== null,
    ),
  })
  .strict();

const latestSchema = z
  .object({
    overall_status: z.enum(STUDENT_ELIGIBILITY_STATUSES),
    assessed_at: z.string().refine(
      (value) => parseEligibilityTimestamp(value) !== null,
    ),
  })
  .strict();

export type CounselorEligibilityAssessment = z.infer<
  typeof assessmentSchema
>;
export type CounselorEligibilityLatest = z.infer<typeof latestSchema>;

export function normalizeEligibilityText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeEligibilityCountries(value: string): string[] {
  return value
    .split(",")
    .map(normalizeEligibilityText)
    .filter((country) => country.length > 0);
}

export function parseCounselorEligibilityAssessments(
  value: unknown,
): CounselorEligibilityAssessment[] | null {
  if (!Array.isArray(value) || value.length > ELIGIBILITY_HISTORY_LIMIT) {
    return null;
  }
  const parsed = z.array(assessmentSchema).safeParse(value);
  if (!parsed.success) return null;

  const ids = new Set<string>();
  const countryKeys = new Set<string>();
  for (let index = 0; index < parsed.data.length; index += 1) {
    const assessment = parsed.data[index];
    if (ids.has(assessment.assessment_id)) return null;
    ids.add(assessment.assessment_id);

    countryKeys.clear();
    for (const country of assessment.recommended_countries) {
      const key = country.toLocaleLowerCase("en");
      if (countryKeys.has(key)) return null;
      countryKeys.add(key);
    }

    const next = parsed.data[index + 1];
    if (!next) continue;
    const currentTime = parseEligibilityTimestamp(
      assessment.assessed_at,
    );
    const nextTime = parseEligibilityTimestamp(next.assessed_at);
    if (
      currentTime === null ||
      nextTime === null ||
      currentTime < nextTime ||
      (currentTime === nextTime &&
        assessment.assessment_id.localeCompare(next.assessment_id) <= 0)
    ) {
      return null;
    }
  }
  return parsed.data;
}

export function parseCounselorEligibilityLatest(
  value: unknown,
): CounselorEligibilityLatest | null | undefined {
  if (!Array.isArray(value) || value.length > 1) return undefined;
  if (value.length === 0) return null;
  const parsed = latestSchema.safeParse(value[0]);
  return parsed.success ? parsed.data : undefined;
}

export function formatEligibilityDateTime(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function formatEligibilityDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
