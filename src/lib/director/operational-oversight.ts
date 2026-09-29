import { z } from "zod";
import type {
  ConsultationStatus,
  DirectorApplicationOversightEntry,
  DirectorConsultationOversightEntry,
  DirectorProgressionFilter,
  DirectorStudentOversightEntry,
  DirectorCounselorWorkloadSummary,
  UniversityApplicationStatus,
} from "@/types";

export const DIRECTOR_OVERSIGHT_PAGE_SIZE = 25;
export const DIRECTOR_OVERSIGHT_MAX_PAGE = 100_000;
export const DIRECTOR_OVERSIGHT_MAX_SEARCH_LENGTH = 100;
export const DIRECTOR_COUNSELOR_LIMIT = 50;

export const consultationStatuses = [
  "submitted",
  "waiting_for_assignment",
  "counselor_assigned",
  "scheduled",
  "completed",
  "no_show",
  "cancelled",
] as const satisfies readonly ConsultationStatus[];

export const applicationStatuses = [
  "planning",
  "documents_collecting",
  "application_preparing",
  "ready_to_submit",
  "submitted",
  "under_university_review",
  "additional_information_requested",
  "decision_received",
  "withdrawn",
  "closed",
] as const satisfies readonly UniversityApplicationStatus[];

export const progressionFilters = [
  "not_started",
  "active",
  "on_hold",
  "completed",
] as const satisfies readonly DirectorProgressionFilter[];

type SearchValue = string | string[] | undefined;
export type DirectorSearchParams = Record<string, SearchValue>;

export type StudentOversightFilters = {
  search: string | null;
  active: boolean | null;
  progression: DirectorProgressionFilter | null;
  page: number;
};

export type ConsultationOversightFilters = {
  search: string | null;
  status: ConsultationStatus | null;
  dateFrom: string | null;
  dateTo: string | null;
  page: number;
};

export type ApplicationOversightFilters = {
  search: string | null;
  status: UniversityApplicationStatus | null;
  archive: "active" | "archived" | "all";
  page: number;
};

export type DirectorOversightResult<T, F> =
  | { status: "invalid" }
  | { status: "unavailable"; filters: F }
  | {
      status: "ready";
      filters: F;
      items: T[];
      totalCount: number;
      totalPages: number;
    };

const searchSchema = z
  .string()
  .trim()
  .max(DIRECTOR_OVERSIGHT_MAX_SEARCH_LENGTH)
  .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value));
const pageSchema = z.coerce
  .number()
  .int()
  .min(1)
  .max(DIRECTOR_OVERSIGHT_MAX_PAGE);
const dateSchema = z.iso.date();

function one(params: DirectorSearchParams, key: string): string | undefined {
  const value = params[key];
  if (Array.isArray(value)) throw new Error("Duplicate query parameter.");
  return value;
}

function optionalSearch(value: string | undefined): string | null {
  if (value === undefined || value.trim() === "") return null;
  return searchSchema.parse(value);
}

function page(value: string | undefined): number {
  return value === undefined || value === "" ? 1 : pageSchema.parse(value);
}

export function parseStudentOversightFilters(
  params: DirectorSearchParams,
): StudentOversightFilters | null {
  try {
    const activeValue = one(params, "active") ?? "all";
    const progressionValue = one(params, "progression") ?? "all";
    if (!["all", "active", "inactive"].includes(activeValue)) return null;
    if (
      progressionValue !== "all" &&
      !progressionFilters.includes(
        progressionValue as DirectorProgressionFilter,
      )
    ) return null;

    return {
      search: optionalSearch(one(params, "q")),
      active:
        activeValue === "all" ? null : activeValue === "active",
      progression:
        progressionValue === "all"
          ? null
          : (progressionValue as DirectorProgressionFilter),
      page: page(one(params, "page")),
    };
  } catch {
    return null;
  }
}

export function parseConsultationOversightFilters(
  params: DirectorSearchParams,
): ConsultationOversightFilters | null {
  try {
    const statusValue = one(params, "status") ?? "all";
    const dateFromValue = one(params, "dateFrom");
    const dateToValue = one(params, "dateTo");
    if (
      statusValue !== "all" &&
      !consultationStatuses.includes(statusValue as ConsultationStatus)
    ) return null;
    const dateFrom = dateFromValue ? dateSchema.parse(dateFromValue) : null;
    const dateTo = dateToValue ? dateSchema.parse(dateToValue) : null;
    if (dateFrom && dateTo) {
      const range = Date.parse(`${dateTo}T00:00:00Z`) -
        Date.parse(`${dateFrom}T00:00:00Z`);
      if (range < 0 || range > 3_660 * 86_400_000) return null;
    }

    return {
      search: optionalSearch(one(params, "q")),
      status:
        statusValue === "all" ? null : (statusValue as ConsultationStatus),
      dateFrom,
      dateTo,
      page: page(one(params, "page")),
    };
  } catch {
    return null;
  }
}

export function parseApplicationOversightFilters(
  params: DirectorSearchParams,
): ApplicationOversightFilters | null {
  try {
    const statusValue = one(params, "status") ?? "all";
    const archiveValue = one(params, "archive") ?? "active";
    if (
      statusValue !== "all" &&
      !applicationStatuses.includes(statusValue as UniversityApplicationStatus)
    ) return null;
    if (!["active", "archived", "all"].includes(archiveValue)) return null;

    return {
      search: optionalSearch(one(params, "q")),
      status:
        statusValue === "all"
          ? null
          : (statusValue as UniversityApplicationStatus),
      archive: archiveValue as ApplicationOversightFilters["archive"],
      page: page(one(params, "page")),
    };
  } catch {
    return null;
  }
}

const countSchema = z.number().int().nonnegative().safe();
const timestampSchema = z.string().min(1);
const nullableEmailSchema = z.string().email().nullable();

const studentRowSchema = z.object({
  student_id: z.string().uuid(),
  full_name: z.string().nullable(),
  college_email: z.string().email(),
  is_active: z.boolean(),
  account_created_at: timestampSchema,
  course: z.string().nullable(),
  department: z.string().nullable(),
  graduation_year: z.number().int().nullable(),
  profile_state: z.enum([
    "profile_not_started",
    "profile_in_progress",
    "ready_for_counseling",
    "submitted",
  ]),
  progression_stage: z.enum([
    "profile_review", "initial_counseling", "goals_confirmed",
    "country_exploration", "program_shortlisting", "university_shortlisting",
    "test_preparation", "document_preparation", "application_ready",
    "application_in_progress", "offer_evaluation", "visa_preparation",
    "pre_departure",
  ]).nullable(),
  progression_state: z.enum(["active", "on_hold", "completed"]).nullable(),
  total_consultations: countSchema,
  open_consultations: countSchema,
  active_applications: countSchema,
  total_count: countSchema,
}).strict();

const consultationRowSchema = z.object({
  consultation_id: z.string().uuid(),
  request_number: z.string().min(1),
  student_id: z.string().uuid(),
  student_full_name: z.string().nullable(),
  student_college_email: z.string().email(),
  counselor_id: z.string().uuid().nullable(),
  counselor_full_name: z.string().nullable(),
  counselor_college_email: nullableEmailSchema,
  consultation_date: dateSchema,
  slot_start: z.string().min(1),
  slot_end: z.string().min(1),
  consultation_status: z.enum(consultationStatuses),
  outcome_recorded_at: timestampSchema.nullable(),
  submitted_at: timestampSchema,
  total_count: countSchema,
}).strict();

const applicationRowSchema = z.object({
  application_id: z.string().uuid(),
  student_id: z.string().uuid(),
  student_full_name: z.string().nullable(),
  student_college_email: z.string().email(),
  counselor_id: z.string().uuid().nullable(),
  counselor_full_name: z.string().nullable(),
  counselor_college_email: nullableEmailSchema,
  university_name: z.string().min(1),
  programme_name: z.string().min(1),
  country_code: z.string().min(1),
  degree_level: z.enum([
    "bachelors", "masters", "postgraduate_diploma", "doctorate", "other",
  ]),
  intake_term: z.enum(["spring", "summer", "fall", "winter", "rolling", "other"]),
  intake_year: z.number().int(),
  application_status: z.enum(applicationStatuses),
  submission_deadline: dateSchema.nullable(),
  submitted_at: timestampSchema.nullable(),
  is_primary: z.boolean(),
  is_archived: z.boolean(),
  last_changed_at: timestampSchema,
  total_count: countSchema,
}).strict();

const primaryCounselorAssignmentRowSchema = z.object({
  student_id: z.string().uuid(),
  counselor_id: z.string().uuid(),
  counselor_full_name: z.string().nullable(),
  counselor_college_email: z.string().email(),
  assigned_at: timestampSchema,
}).strict();

const primaryCounselorCountRowSchema = z.object({
  counselor_id: z.string().uuid(),
  assigned_student_count: countSchema,
}).strict();

function validatePageRows<T extends { total_count: number }>(
  rows: T[],
): { rows: T[]; totalCount: number } {
  const totalCount = rows[0]?.total_count ?? 0;
  if (rows.some((row) => row.total_count !== totalCount)) {
    throw new Error("Inconsistent Director oversight count.");
  }
  return { rows, totalCount };
}

export function parseDirectorStudentOversight(value: unknown): {
  items: DirectorStudentOversightEntry[];
  totalCount: number;
} {
  const parsed = validatePageRows(z.array(studentRowSchema).parse(value));
  return {
    totalCount: parsed.totalCount,
    items: parsed.rows.map((row) => ({
      studentId: row.student_id, fullName: row.full_name,
      collegeEmail: row.college_email, isActive: row.is_active,
      accountCreatedAt: row.account_created_at, course: row.course,
      department: row.department, graduationYear: row.graduation_year,
      profileState: row.profile_state, progressionStage: row.progression_stage,
      progressionState: row.progression_state,
      totalConsultations: row.total_consultations,
      openConsultations: row.open_consultations,
      activeApplications: row.active_applications,
      primaryCounselorId: null,
      primaryCounselorFullName: null,
      primaryCounselorCollegeEmail: null,
      primaryCounselorAssignedAt: null,
    })),
  };
}

export function attachDirectorPrimaryCounselors(
  students: DirectorStudentOversightEntry[],
  value: unknown,
): DirectorStudentOversightEntry[] {
  const rows = z.array(primaryCounselorAssignmentRowSchema).max(50).parse(value);
  const studentIds = new Set(students.map((student) => student.studentId));
  const assignmentIds = new Set<string>();
  for (const row of rows) {
    if (!studentIds.has(row.student_id) || assignmentIds.has(row.student_id)) {
      throw new Error("Invalid Director Primary Counselor assignment response.");
    }
    assignmentIds.add(row.student_id);
  }
  const assignments = new Map(rows.map((row) => [row.student_id, row]));

  return students.map((student) => {
    const assignment = assignments.get(student.studentId);
    return {
      ...student,
      primaryCounselorId: assignment?.counselor_id ?? null,
      primaryCounselorFullName: assignment?.counselor_full_name ?? null,
      primaryCounselorCollegeEmail:
        assignment?.counselor_college_email ?? null,
      primaryCounselorAssignedAt: assignment?.assigned_at ?? null,
    };
  });
}

export type DirectorCounselorAssignmentWorkload =
  DirectorCounselorWorkloadSummary & { assignedStudents: number };

export function attachDirectorPrimaryCounselorCounts(
  counselors: DirectorCounselorWorkloadSummary[],
  value: unknown,
): DirectorCounselorAssignmentWorkload[] {
  const rows = z.array(primaryCounselorCountRowSchema).max(50).parse(value);
  const counselorIds = new Set(counselors.map((item) => item.counselorId));
  const seen = new Set<string>();
  for (const row of rows) {
    if (!counselorIds.has(row.counselor_id) || seen.has(row.counselor_id)) {
      throw new Error("Invalid Director Primary Counselor count response.");
    }
    seen.add(row.counselor_id);
  }
  const counts = new Map(
    rows.map((row) => [row.counselor_id, row.assigned_student_count]),
  );
  return counselors.map((counselor) => ({
    ...counselor,
    assignedStudents: counts.get(counselor.counselorId) ?? 0,
  }));
}

export function parseDirectorConsultationOversight(value: unknown): {
  items: DirectorConsultationOversightEntry[];
  totalCount: number;
} {
  const parsed = validatePageRows(z.array(consultationRowSchema).parse(value));
  return {
    totalCount: parsed.totalCount,
    items: parsed.rows.map((row) => ({
      consultationId: row.consultation_id, requestNumber: row.request_number,
      studentId: row.student_id, studentFullName: row.student_full_name,
      studentCollegeEmail: row.student_college_email,
      counselorId: row.counselor_id, counselorFullName: row.counselor_full_name,
      counselorCollegeEmail: row.counselor_college_email,
      consultationDate: row.consultation_date, slotStart: row.slot_start,
      slotEnd: row.slot_end, consultationStatus: row.consultation_status,
      outcomeRecordedAt: row.outcome_recorded_at, submittedAt: row.submitted_at,
    })),
  };
}

export function parseDirectorApplicationOversight(value: unknown): {
  items: DirectorApplicationOversightEntry[];
  totalCount: number;
} {
  const parsed = validatePageRows(z.array(applicationRowSchema).parse(value));
  return {
    totalCount: parsed.totalCount,
    items: parsed.rows.map((row) => ({
      applicationId: row.application_id, studentId: row.student_id,
      studentFullName: row.student_full_name,
      studentCollegeEmail: row.student_college_email,
      counselorId: row.counselor_id, counselorFullName: row.counselor_full_name,
      counselorCollegeEmail: row.counselor_college_email,
      universityName: row.university_name, programmeName: row.programme_name,
      countryCode: row.country_code, degreeLevel: row.degree_level,
      intakeTerm: row.intake_term, intakeYear: row.intake_year,
      applicationStatus: row.application_status,
      submissionDeadline: row.submission_deadline, submittedAt: row.submitted_at,
      isPrimary: row.is_primary, isArchived: row.is_archived,
      lastChangedAt: row.last_changed_at,
    })),
  };
}

export function formatOversightLabel(value: string): string {
  return value.split("_").map((word) =>
    `${word.charAt(0).toUpperCase()}${word.slice(1)}`,
  ).join(" ");
}

export function oversightTotalPages(totalCount: number): number {
  return Math.max(1, Math.ceil(totalCount / DIRECTOR_OVERSIGHT_PAGE_SIZE));
}
