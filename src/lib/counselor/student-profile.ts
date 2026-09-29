import { z } from "zod";
import {
  loadCounselorConsultationReferences,
  mergeCounselorConsultationReferences,
} from "@/lib/consultations/counselor-references";
import { getAsiaKolkataBusinessDateTime } from "@/lib/consultations/booking";
import {
  COUNSELOR_PRIVATE_RECORD_PAGE_SIZE,
  attachCounselorPrivateReferences,
  getCounselorPrivateConsultationIds,
  parseCounselorPrivateRecords,
  type CounselorPrivateQueryResult,
  type CounselorPrivateRecords,
} from "@/lib/counselor/private-records";
import {
  ACADEMIC_PREFERENCE_OPTIONS,
  FUNDING_METHOD_OPTIONS,
  GLOBAL_TRACK_PROGRAM_OPTIONS,
  HIGHER_STUDIES_INTEREST_PROFILE_OPTIONS,
  PREFERRED_DOMAIN_OPTIONS,
  PREFERRED_STUDY_AREA_OPTIONS,
  STUDY_PATHWAY_OPTIONS,
  STUDENT_PLANNING_STAGE_OPTIONS,
  formatOptionalProfileDate,
  getStudentAchievementTypeLabel,
  getStudentExamNameLabel,
  getStudentExamStatusLabel,
  getStudentStudyModeLabel,
} from "@/lib/profiles/options";
import { institutionalEmailSchema } from "@/lib/validation/institutional-email";
import type {
  ConsultationStatus,
  StudentAchievementType,
  StudentExamName,
  StudentExamStatus,
} from "@/types";

export const STUDENT_360_HISTORY_PAGE_SIZE = 20;
export const STUDENT_360_SECTION_LIMIT = 50;
export const STUDENT_360_MAX_HISTORY_PAGE = 100_000;
export const STUDENT_360_BASE_PATH = "/counselor/students";

export const STUDENT_360_PROFILE_COLUMNS =
  "student_id, roll_number, personal_email, mobile_number, college, course, department, current_year, current_semester, graduation_year, cgpa, cgpa_scale, cgpa_unavailable, active_backlogs, cleared_backlogs, sslc_percentage, hsc_percentage, diploma_percentage, academic_remarks, profile_status, profile_submitted_at, created_at, updated_at" as const;

export const STUDENT_360_PREFERENCE_COLUMNS =
  "student_id, higher_studies_interest, preferred_study_area, preferred_domain, study_pathway, global_track_program, preferred_countries, preferred_program_areas, target_intake, budget_range, scholarship_required, funding_required, funding_method, study_mode, academic_preference, student_planning_stage, created_at, updated_at" as const;

export const STUDENT_360_COMPLETION_COLUMNS =
  "student_id, profile_status, academic_section_complete, preferences_section_complete, test_scores_section_started, achievements_section_started, essential_fields_completed, essential_fields_total, overall_completion_percentage, ready_for_counseling" as const;

export const STUDENT_360_TEST_SCORE_COLUMNS =
  "id, student_id, exam_name, custom_exam_name, exam_status, attempt_number, planned_date, completed_date, score, valid_until, remarks, created_at, updated_at" as const;

export const STUDENT_360_ACHIEVEMENT_COLUMNS =
  "id, student_id, achievement_type, title, organization, achievement_date, description, created_at, updated_at" as const;

export const STUDENT_360_CONSULTATION_COLUMNS =
  "id, student_id, student_name, roll_number, course, department, status, assigned_counselor_id, consultation_date, slot_start, slot_end, submitted_at" as const;

export const STUDENT_360_SECTION_LABELS = {
  overview: "Overview",
  academics: "Academic Portfolio",
  preferences: "Higher-Studies Preferences",
  consultations: "Consultation History",
  exams: "Study Abroad Exams",
  achievements: "Achievements",
} as const;

export const STUDENT_360_FALLBACKS = {
  name: "Name not available",
  notAdded: "Not added",
  notSelected: "Not selected",
  notAvailable: "Not available",
  noDate: "Date not added",
  noRemarks: "No remarks added",
} as const;

const consultationStatuses = [
  "submitted",
  "waiting_for_assignment",
  "counselor_assigned",
  "scheduled",
  "completed",
  "no_show",
  "cancelled",
] as const satisfies readonly ConsultationStatus[];

const examNames = [
  "ielts",
  "toefl",
  "pte",
  "gre",
  "gmat",
  "dmat",
  "gate",
  "other",
] as const satisfies readonly StudentExamName[];

const examStatuses = [
  "not_planned",
  "planning",
  "booked",
  "completed",
  "not_required",
] as const satisfies readonly StudentExamStatus[];

const achievementTypes = [
  "internship",
  "project",
  "certification",
  "research",
  "publication",
  "award",
  "hackathon",
  "leadership",
  "volunteering",
  "work_experience",
  "sports",
  "other",
] as const satisfies readonly StudentAchievementType[];

const timestampSchema = z.string().refine((value) => {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
});

const dateOnlySchema = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
});

const databaseTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/);
const nullableTextSchema = (maximum: number) =>
  z.string().trim().min(1).max(maximum).nullable();
const nullablePercentageSchema = z.number().min(0).max(100).nullable();

const identitySchema = z
  .object({
    student_id: z.uuid(),
    full_name: z.string().trim().max(150).nullable(),
    college_email: institutionalEmailSchema,
    account_created_at: timestampSchema,
    is_active: z.boolean(),
  })
  .strict();

const profileSchema = z
  .object({
    student_id: z.uuid(),
    roll_number: z.string().trim().min(1).max(50),
    personal_email: z.email().max(320),
    mobile_number: z.string().regex(/^\d{10}$/),
    college: z.string().trim().min(1).max(150),
    course: z.string().trim().min(1).max(150),
    department: z.string().trim().min(1).max(150),
    current_year: z.number().int().min(1).max(8).nullable(),
    current_semester: z.number().int().min(1).max(16).nullable(),
    graduation_year: z.number().int().min(2024).max(2040),
    cgpa: z.number().min(0).nullable(),
    cgpa_scale: z.union([z.literal(4), z.literal(10)]),
    cgpa_unavailable: z.boolean(),
    active_backlogs: z.number().int().min(0).max(100),
    cleared_backlogs: z.number().int().min(0).max(100),
    sslc_percentage: nullablePercentageSchema,
    hsc_percentage: nullablePercentageSchema,
    diploma_percentage: nullablePercentageSchema,
    academic_remarks: nullableTextSchema(2000),
    profile_status: z.enum(["draft", "submitted"]),
    profile_submitted_at: timestampSchema.nullable(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict()
  .superRefine((profile, context) => {
    if (profile.cgpa !== null && profile.cgpa > profile.cgpa_scale) {
      context.addIssue({ code: "custom", message: "Invalid CGPA" });
    }
    if (profile.cgpa !== null && profile.cgpa_unavailable) {
      context.addIssue({ code: "custom", message: "Invalid CGPA state" });
    }
    if (
      profile.current_year !== null &&
      profile.current_semester !== null &&
      (profile.current_semester < (profile.current_year - 1) * 2 + 1 ||
        profile.current_semester > profile.current_year * 2)
    ) {
      context.addIssue({ code: "custom", message: "Invalid semester" });
    }
    if (
      (profile.profile_status === "submitted") !==
      (profile.profile_submitted_at !== null)
    ) {
      context.addIssue({ code: "custom", message: "Invalid profile state" });
    }
  });

const preferenceSchema = z
  .object({
    student_id: z.uuid(),
    higher_studies_interest: z.enum([
      "interested",
      "exploring",
      "not_interested",
    ]),
    preferred_study_area: z
      .enum(["engineering", "business", "psychology"])
      .nullable(),
    preferred_domain: z
      .enum([
        "engineering_computing",
        "engineering_electrical",
        "engineering_mechanical",
        "business_management",
        "business_finance",
        "business_analytics",
        "psychology_clinical",
        "psychology_counseling",
        "psychology_organizational",
      ])
      .nullable(),
    study_pathway: z
      .enum(["masters_degree", "global_track"])
      .nullable(),
    global_track_program: z
      .enum(["fifteen_day_program", "one_year_program", "two_year_program"])
      .nullable(),
    preferred_countries: z.array(z.string().trim().min(1).max(80)).max(10),
    preferred_program_areas: z
      .array(z.string().trim().min(1).max(120))
      .max(10),
    target_intake: z
      .string()
      .regex(/^(spring|summer|fall|winter)-20[2-9]\d$/)
      .nullable(),
    budget_range: nullableTextSchema(100),
    scholarship_required: z.boolean().nullable(),
    funding_required: z.boolean().nullable(),
    funding_method: z.enum(["self_funded"]).nullable(),
    study_mode: z
      .enum(["full_time", "part_time", "either", "on_campus", "online"])
      .nullable(),
    academic_preference: z
      .enum(["coursework", "research", "either", "undecided"])
      .nullable(),
    student_planning_stage: z
      .enum([
        "exploring",
        "preparing_exams",
        "shortlisting",
        "preparing_documents",
        "applications_started",
      ])
      .nullable(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict();

const completionSchema = z
  .object({
    student_id: z.uuid(),
    profile_status: z.enum(["draft", "submitted"]),
    academic_section_complete: z.boolean(),
    preferences_section_complete: z.boolean(),
    test_scores_section_started: z.boolean(),
    achievements_section_started: z.boolean(),
    essential_fields_completed: z.number().int().min(0),
    essential_fields_total: z.literal(11),
    overall_completion_percentage: z.number().int().min(0).max(100),
    ready_for_counseling: z.boolean(),
  })
  .strict()
  .superRefine((completion, context) => {
    if (
      completion.essential_fields_completed >
      completion.essential_fields_total
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid completion total",
      });
    }
    if (
      completion.ready_for_counseling !==
      (
        completion.academic_section_complete &&
        completion.preferences_section_complete
      )
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid readiness state",
      });
    }
  });

const testScoreSchema = z
  .object({
    id: z.uuid(),
    student_id: z.uuid(),
    exam_name: z.enum(examNames),
    custom_exam_name: nullableTextSchema(100),
    exam_status: z.enum(examStatuses),
    attempt_number: z.number().int().min(1).max(20),
    planned_date: dateOnlySchema.nullable(),
    completed_date: dateOnlySchema.nullable(),
    score: nullableTextSchema(100),
    valid_until: dateOnlySchema.nullable(),
    remarks: nullableTextSchema(1000),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict()
  .superRefine((score, context) => {
    if (
      (score.exam_name === "other") !== (score.custom_exam_name !== null)
    ) {
      context.addIssue({ code: "custom", message: "Invalid exam name" });
    }
    if (
      (score.exam_status === "completed") !==
      (score.completed_date !== null)
    ) {
      context.addIssue({ code: "custom", message: "Invalid exam state" });
    }
    if (score.exam_status === "booked" && score.planned_date === null) {
      context.addIssue({ code: "custom", message: "Invalid booked exam" });
    }
    if (score.score !== null && score.exam_status !== "completed") {
      context.addIssue({ code: "custom", message: "Invalid exam score" });
    }
  });

const achievementSchema = z
  .object({
    id: z.uuid(),
    student_id: z.uuid(),
    achievement_type: z.enum(achievementTypes),
    title: z.string().trim().min(1).max(200),
    organization: nullableTextSchema(200),
    achievement_date: dateOnlySchema.nullable(),
    description: nullableTextSchema(2000),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict();

const consultationSchema = z
  .object({
    id: z.uuid(),
    student_id: z.uuid(),
    student_name: z.string().trim().min(1).max(150),
    roll_number: z.string().trim().min(1).max(50),
    course: z.string().trim().min(1).max(150),
    department: z.string().trim().min(1).max(150),
    status: z.enum(consultationStatuses),
    assigned_counselor_id: z.uuid().nullable(),
    consultation_date: dateOnlySchema.nullable(),
    slot_start: databaseTimeSchema.nullable(),
    slot_end: databaseTimeSchema.nullable(),
    submitted_at: timestampSchema,
  })
  .strict()
  .superRefine((consultation, context) => {
    const scheduleValues = [
      consultation.consultation_date,
      consultation.slot_start,
      consultation.slot_end,
    ];
    const hasCompleteSchedule = scheduleValues.every(
      (value) => value !== null,
    );
    const hasNoSchedule = scheduleValues.every((value) => value === null);
    if (!hasCompleteSchedule && !hasNoSchedule) {
      context.addIssue({ code: "custom", message: "Invalid schedule" });
    }
    if (consultation.status === "scheduled" && !hasCompleteSchedule) {
      context.addIssue({ code: "custom", message: "Missing schedule" });
    }
  });

const countSchema = z.number().int().min(0);

export type CounselorStudentIdentity = z.infer<typeof identitySchema>;
export type CounselorStudentProfile = z.infer<typeof profileSchema>;
export type CounselorStudentPreference = z.infer<typeof preferenceSchema>;
export type CounselorStudentCompletion = z.infer<typeof completionSchema>;
export type CounselorStudentTestScore = z.infer<typeof testScoreSchema>;
export type CounselorStudentAchievement = z.infer<typeof achievementSchema>;
export type CounselorStudentConsultationBase = z.infer<
  typeof consultationSchema
>;
export type CounselorStudentConsultation =
  CounselorStudentConsultationBase & { request_number: string };

export type Student360ProfileState =
  | "profile_not_started"
  | "profile_in_progress"
  | "ready_for_counseling"
  | "submitted";

export type Student360QueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

export type Student360SectionResults = {
  profile: Student360QueryResult;
  preference: Student360QueryResult;
  completion: Student360QueryResult;
  testScores: Student360QueryResult;
  achievements: Student360QueryResult;
  consultations: Student360QueryResult;
  notes?: CounselorPrivateQueryResult;
  followUps?: CounselorPrivateQueryResult;
  consultationChoices?: CounselorPrivateQueryResult;
};

export type Student360DataSource = {
  loadIdentity: (studentId: string) => Promise<Student360QueryResult>;
  loadSections: (
    trustedStudentId: string,
    consultationFrom: number,
    consultationTo: number,
    noteFrom: number,
    noteTo: number,
    followUpFrom: number,
    followUpTo: number,
  ) => Promise<Student360SectionResults>;
  loadReferences: (
    consultationIds: string[],
  ) => Promise<{ data: unknown; error: unknown }>;
};

export type Student360ReadyResult = {
  kind: "ready";
  identity: CounselorStudentIdentity;
  profile: CounselorStudentProfile | null;
  preference: CounselorStudentPreference | null;
  completion: CounselorStudentCompletion | null;
  profileState: Student360ProfileState;
  completionPercentage: number;
  testScores: CounselorStudentTestScore[];
  testScoreCount: number;
  achievements: CounselorStudentAchievement[];
  achievementCount: number;
  consultations: CounselorStudentConsultation[];
  consultationCount: number;
  historyPage: number;
  historyPageCount: number;
  privateRecords: CounselorPrivateRecords;
};

export type Student360PrivateOptions = {
  counselorId: string;
  notePage: number;
  followUpPage: number;
  now?: Date;
};

export type Student360LoadResult =
  | Student360ReadyResult
  | { kind: "not_found" }
  | { kind: "out_of_range"; studentId: string }
  | { kind: "unavailable" };

export function parseStudent360HistoryPage(
  value: string | string[] | undefined,
): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= STUDENT_360_MAX_HISTORY_PAGE
    ? page
    : 1;
}

export function isStudent360StudentId(value: string): boolean {
  return z.uuid().safeParse(value).success;
}

export function isCounselorStudentIdentity(
  value: unknown,
  expectedStudentId: string,
): boolean {
  const parsed = identitySchema.safeParse(value);
  return (
    parsed.success && parsed.data.student_id === expectedStudentId
  );
}

function parseOwnedOptionalRow<T>(
  schema: z.ZodType<T & { student_id: string }>,
  value: unknown,
  trustedStudentId: string,
): T | null | undefined {
  if (value === null) return null;
  const parsed = schema.safeParse(value);
  if (!parsed.success || parsed.data.student_id !== trustedStudentId) {
    return undefined;
  }
  return parsed.data;
}

function parseOwnedRows<T>(
  schema: z.ZodType<T & { id: string; student_id: string }>,
  value: unknown,
  trustedStudentId: string,
  maximum: number,
): T[] | null {
  const parsed = z.array(schema).max(maximum).safeParse(value);
  if (
    !parsed.success ||
    parsed.data.some((row) => row.student_id !== trustedStudentId) ||
    new Set(parsed.data.map((row) => row.id)).size !== parsed.data.length
  ) {
    return null;
  }
  return parsed.data;
}

function getProfileState(
  profile: CounselorStudentProfile | null,
  completion: CounselorStudentCompletion | null,
): Student360ProfileState {
  if (!profile) return "profile_not_started";
  if (completion?.profile_status === "submitted") return "submitted";
  if (completion?.ready_for_counseling) return "ready_for_counseling";
  return "profile_in_progress";
}

export function isLegacyStudentConsultation(
  consultation: CounselorStudentConsultationBase,
): boolean {
  return (
    consultation.status === "waiting_for_assignment" &&
    consultation.consultation_date === null &&
    consultation.slot_start === null &&
    consultation.slot_end === null
  );
}

export async function fetchCounselorStudentProfile(
  routeStudentId: string,
  historyPage: number,
  source: Student360DataSource,
  privateOptions?: Student360PrivateOptions,
): Promise<Student360LoadResult> {
  if (
    !isStudent360StudentId(routeStudentId) ||
    !Number.isSafeInteger(historyPage) ||
    historyPage < 1 ||
    historyPage > STUDENT_360_MAX_HISTORY_PAGE
  ) {
    return { kind: "not_found" };
  }
  if (
    privateOptions &&
    (
      !isStudent360StudentId(privateOptions.counselorId) ||
      !Number.isSafeInteger(privateOptions.notePage) ||
      privateOptions.notePage < 1 ||
      privateOptions.notePage > STUDENT_360_MAX_HISTORY_PAGE ||
      !Number.isSafeInteger(privateOptions.followUpPage) ||
      privateOptions.followUpPage < 1 ||
      privateOptions.followUpPage > STUDENT_360_MAX_HISTORY_PAGE ||
      (privateOptions.now !== undefined &&
        Number.isNaN(privateOptions.now.getTime()))
    )
  ) {
    return { kind: "unavailable" };
  }

  let identityResult: Student360QueryResult;
  try {
    identityResult = await source.loadIdentity(routeStudentId);
  } catch {
    return { kind: "unavailable" };
  }

  if (identityResult.error) return { kind: "unavailable" };
  if (identityResult.data === null) return { kind: "not_found" };

  const parsedIdentity = identitySchema.safeParse(identityResult.data);
  if (
    !parsedIdentity.success ||
    parsedIdentity.data.student_id !== routeStudentId
  ) {
    return { kind: "unavailable" };
  }
  const identity = parsedIdentity.data;
  const consultationFrom =
    (historyPage - 1) * STUDENT_360_HISTORY_PAGE_SIZE;
  const consultationTo =
    consultationFrom + STUDENT_360_HISTORY_PAGE_SIZE - 1;
  const notePage = privateOptions?.notePage ?? 1;
  const followUpPage = privateOptions?.followUpPage ?? 1;
  const noteFrom =
    (notePage - 1) * COUNSELOR_PRIVATE_RECORD_PAGE_SIZE;
  const noteTo = noteFrom + COUNSELOR_PRIVATE_RECORD_PAGE_SIZE - 1;
  const followUpFrom =
    (followUpPage - 1) * COUNSELOR_PRIVATE_RECORD_PAGE_SIZE;
  const followUpTo =
    followUpFrom + COUNSELOR_PRIVATE_RECORD_PAGE_SIZE - 1;

  let sections: Student360SectionResults;
  try {
    sections = await source.loadSections(
      identity.student_id,
      consultationFrom,
      consultationTo,
      noteFrom,
      noteTo,
      followUpFrom,
      followUpTo,
    );
  } catch {
    return { kind: "unavailable" };
  }

  if (
    [
      sections.profile,
      sections.preference,
      sections.completion,
      sections.testScores,
      sections.achievements,
      sections.consultations,
    ].some((section) => Boolean(section.error))
  ) {
    return { kind: "unavailable" };
  }

  const profile = parseOwnedOptionalRow(
    profileSchema,
    sections.profile.data,
    identity.student_id,
  );
  const preference = parseOwnedOptionalRow(
    preferenceSchema,
    sections.preference.data,
    identity.student_id,
  );
  const completion = parseOwnedOptionalRow(
    completionSchema,
    sections.completion.data,
    identity.student_id,
  );
  const testScores = parseOwnedRows(
    testScoreSchema,
    sections.testScores.data,
    identity.student_id,
    STUDENT_360_SECTION_LIMIT,
  );
  const achievements = parseOwnedRows(
    achievementSchema,
    sections.achievements.data,
    identity.student_id,
    STUDENT_360_SECTION_LIMIT,
  );
  const consultationRows = parseOwnedRows(
    consultationSchema,
    sections.consultations.data,
    identity.student_id,
    STUDENT_360_HISTORY_PAGE_SIZE,
  );
  const testScoreCount = countSchema.safeParse(sections.testScores.count);
  const achievementCount = countSchema.safeParse(sections.achievements.count);
  const consultationCount = countSchema.safeParse(
    sections.consultations.count,
  );

  if (
    profile === undefined ||
    preference === undefined ||
    completion === undefined ||
    testScores === null ||
    achievements === null ||
    consultationRows === null ||
    !testScoreCount.success ||
    !achievementCount.success ||
    !consultationCount.success ||
    testScoreCount.data < testScores.length ||
    achievementCount.data < achievements.length ||
    consultationCount.data < consultationRows.length ||
    (!profile && (preference !== null || completion !== null)) ||
    (profile !== null && completion === null) ||
    (profile !== null &&
      completion !== null &&
      profile.profile_status !== completion.profile_status) ||
    (preference === null &&
      completion !== null &&
      completion.preferences_section_complete)
  ) {
    return { kind: "unavailable" };
  }

  if (
    historyPage > 1 &&
    consultationRows.length === 0
  ) {
    return { kind: "out_of_range", studentId: identity.student_id };
  }

  const unavailablePrivateQuery: CounselorPrivateQueryResult = {
    data: null,
    error: true,
  };
  const privateRecordsRaw = parseCounselorPrivateRecords(
    {
      notes: sections.notes ?? unavailablePrivateQuery,
      followUps: sections.followUps ?? unavailablePrivateQuery,
      consultationChoices:
        sections.consultationChoices ?? unavailablePrivateQuery,
    },
    identity.student_id,
    privateOptions?.counselorId ?? "",
    notePage,
    followUpPage,
  );
  const referenceIds = [
    ...consultationRows.map((consultation) => consultation.id),
    ...getCounselorPrivateConsultationIds(privateRecordsRaw),
  ];
  const references = await loadCounselorConsultationReferences(
    referenceIds,
    source.loadReferences,
  );
  if (!references) return { kind: "unavailable" };

  const consultations = mergeCounselorConsultationReferences(
    consultationRows,
    references,
  );
  if (!consultations) return { kind: "unavailable" };
  const businessToday = getAsiaKolkataBusinessDateTime(
    privateOptions?.now ?? new Date(),
  ).date;
  const privateRecords = attachCounselorPrivateReferences(
    privateRecordsRaw,
    references,
    businessToday,
  );

  return {
    kind: "ready",
    identity,
    profile,
    preference,
    completion,
    profileState: getProfileState(profile, completion),
    completionPercentage:
      completion?.overall_completion_percentage ?? 0,
    testScores,
    testScoreCount: testScoreCount.data,
    achievements,
    achievementCount: achievementCount.data,
    consultations,
    consultationCount: consultationCount.data,
    historyPage,
    historyPageCount: Math.max(
      1,
      Math.ceil(
        consultationCount.data / STUDENT_360_HISTORY_PAGE_SIZE,
      ),
    ),
    privateRecords,
  };
}

function optionLabel<T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
  value: T | null,
): string {
  if (value === null) return STUDENT_360_FALLBACKS.notSelected;
  return (
    options.find((option) => option.value === value)?.label ??
    STUDENT_360_FALLBACKS.notAvailable
  );
}

export function getStudent360InterestLabel(
  value: CounselorStudentPreference["higher_studies_interest"] | null,
): string {
  return optionLabel(HIGHER_STUDIES_INTEREST_PROFILE_OPTIONS, value);
}

export function getStudent360StudyModeLabel(
  value: CounselorStudentPreference["study_mode"],
): string {
  return value === null
    ? STUDENT_360_FALLBACKS.notSelected
    : getStudentStudyModeLabel(value);
}

export function getStudent360StudyAreaLabel(
  value: CounselorStudentPreference["preferred_study_area"],
): string {
  return optionLabel(PREFERRED_STUDY_AREA_OPTIONS, value);
}

export function getStudent360DomainLabel(
  value: CounselorStudentPreference["preferred_domain"],
): string {
  if (value === null) return STUDENT_360_FALLBACKS.notSelected;
  for (const options of Object.values(PREFERRED_DOMAIN_OPTIONS)) {
    const match = options.find((option) => option.value === value);
    if (match) return match.label;
  }
  return STUDENT_360_FALLBACKS.notAvailable;
}

export function getStudent360StudyPathwayLabel(
  value: CounselorStudentPreference["study_pathway"],
): string {
  return optionLabel(STUDY_PATHWAY_OPTIONS, value);
}

export function getStudent360GlobalTrackProgramLabel(
  value: CounselorStudentPreference["global_track_program"],
): string {
  return optionLabel(GLOBAL_TRACK_PROGRAM_OPTIONS, value);
}

export function getStudent360FundingMethodLabel(
  value: CounselorStudentPreference["funding_method"],
): string {
  return optionLabel(FUNDING_METHOD_OPTIONS, value);
}

export function getStudent360AcademicPreferenceLabel(
  value: CounselorStudentPreference["academic_preference"],
): string {
  return optionLabel(ACADEMIC_PREFERENCE_OPTIONS, value);
}

export function getStudent360PlanningStageLabel(
  value: CounselorStudentPreference["student_planning_stage"],
): string {
  return optionLabel(STUDENT_PLANNING_STAGE_OPTIONS, value);
}

const profileStateLabels: Record<Student360ProfileState, string> = {
  profile_not_started: "Profile not started",
  profile_in_progress: "Profile in progress",
  ready_for_counseling: "Ready for counseling",
  submitted: "Submitted",
};

export function getStudent360ProfileStateLabel(
  state: Student360ProfileState,
): string {
  return profileStateLabels[state];
}

export function getStudent360ExamName(
  score: CounselorStudentTestScore,
): string {
  return score.exam_name === "other" && score.custom_exam_name
    ? score.custom_exam_name
    : getStudentExamNameLabel(score.exam_name);
}

export function getStudent360ExamStatusLabel(
  status: StudentExamStatus,
): string {
  return getStudentExamStatusLabel(status);
}

export function getStudent360AchievementTypeLabel(
  type: StudentAchievementType,
): string {
  return getStudentAchievementTypeLabel(type);
}

export function formatStudent360TargetIntake(value: string | null): string {
  if (!value) return STUDENT_360_FALLBACKS.notSelected;
  const [season, year] = value.split("-");
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}

export function formatStudent360Boolean(
  value: boolean | null,
  trueLabel = "Yes",
  falseLabel = "No",
): string {
  if (value === null) return STUDENT_360_FALLBACKS.notSelected;
  return value ? trueLabel : falseLabel;
}

export function formatStudent360Number(
  value: number | null,
  suffix = "",
): string {
  return value === null
    ? STUDENT_360_FALLBACKS.notAdded
    : `${value}${suffix}`;
}

export function formatStudent360Date(value: string | null): string {
  return formatOptionalProfileDate(value);
}

export function formatStudent360Timestamp(value: string | null): string {
  if (!value) return STUDENT_360_FALLBACKS.notAvailable;
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
