import { z } from "zod";
import {
  parseGlobalReadinessAssessments,
  type GlobalReadinessAssessment,
} from "@/lib/counselor/global-readiness";
import type {
  StudentAchievementDocument,
  StudentProfileDocument,
} from "@/types";

const timestamp = z.iso.datetime({ offset: true });
const nullableDate = z.iso.date().nullable();

const eligibilitySchema = z
  .object({
    student_id: z.uuid(),
    overall_status: z.string().min(1),
    academic_status: z.string().min(1),
    backlog_status: z.string().min(1),
    english_readiness: z.string().min(1),
    aptitude_readiness: z.string().min(1),
    profile_strength: z.string().min(1),
    application_readiness: z.string().min(1),
    recommended_countries: z.array(z.string().min(1)).max(50),
    recommended_intake: z.string().nullable(),
    assessment_summary: z.string().min(1),
    assessor_full_name: z.string().min(1),
    assessed_at: timestamp,
  })
  .strict();

const progressCurrentSchema = z
  .object({
    currentStage: z.string().min(1),
    workflowState: z.string().min(1),
    stageStartedAt: timestamp,
    lastChangedAt: timestamp,
  })
  .strict()
  .nullable();

const progressEventSchema = z
  .object({
    eventId: z.uuid(),
    previousStage: z.string().nullable(),
    newStage: z.string().min(1),
    previousState: z.string().nullable(),
    newState: z.string().min(1),
    changedAt: timestamp,
  })
  .strict();

const semesterSummarySchema = z
  .object({
    summaryId: z.uuid(),
    academicPeriod: z.string().min(1),
    progressSummary: z.string().min(1),
    achievementsHighlights: z.string().nullable(),
    areasRequiringAttention: z.string().nullable(),
    nextSemesterActions: z.string().min(1),
    counselorFullName: z.string().min(1),
    createdAt: timestamp,
  })
  .strict();

const journeySchema = z
  .object({
    universityDecision: z.string().min(1),
    universityDecisionDate: nullableDate,
    offerStatus: z.string().min(1),
    offerDate: nullableDate,
    conditionalOfferRequirements: z.string().nullable(),
    conditionDueDate: nullableDate,
    conditionsSatisfiedDate: nullableDate,
    studentDecision: z.string().min(1),
    studentDecisionDate: nullableDate,
    feeStatus: z.string().min(1),
    feePaymentDate: nullableDate,
    visaStatus: z.string().min(1),
    visaSubmissionDate: nullableDate,
    visaDecisionDate: nullableDate,
    enrollmentStatus: z.string().min(1),
    enrollmentDate: nullableDate,
    versionNumber: z.number().int().nonnegative(),
    updatedAt: timestamp.nullable(),
  })
  .strict();

const journeyHistorySchema = z
  .object({
    eventId: z.uuid(),
    versionNumber: z.number().int().positive(),
    universityDecision: z.string().min(1),
    offerStatus: z.string().min(1),
    studentDecision: z.string().min(1),
    feeStatus: z.string().min(1),
    visaStatus: z.string().min(1),
    enrollmentStatus: z.string().min(1),
    changedAt: timestamp,
  })
  .strict();

const applicationSchema = z
  .object({
    applicationId: z.uuid(),
    universityName: z.string().min(1),
    programmeName: z.string().min(1),
    countryCode: z.string().min(1),
    degreeLevel: z.string().min(1),
    intakeTerm: z.string().min(1),
    intakeYear: z.number().int(),
    applicationStatus: z.string().min(1),
    submissionDeadline: nullableDate,
    submittedAt: timestamp.nullable(),
    isPrimary: z.boolean(),
    isArchived: z.boolean(),
    lastChangedAt: timestamp,
    journey: journeySchema,
    history: z
      .array(journeyHistorySchema)
      .max(20)
      .nullable()
      .transform((history) => history ?? []),
  })
  .strict();

const consultationSchema = z
  .object({
    consultationId: z.uuid(),
    requestNumber: z.string().min(1),
    consultationDate: nullableDate,
    slotStart: z.string().nullable(),
    slotEnd: z.string().nullable(),
    status: z.string().min(1),
    counselorFullName: z.string().nullable(),
    outcomeRecordedAt: timestamp.nullable(),
    submittedAt: timestamp,
  })
  .strict();

const primaryCounselorSchema = z
  .object({
    assignmentId: z.uuid(),
    counselorId: z.uuid(),
    fullName: z.string().nullable(),
    collegeEmail: z.email(),
    assignedAt: timestamp,
    status: z.literal("active"),
  })
  .strict()
  .nullable();

const parentReportSchema = z
  .object({
    reportId: z.uuid(),
    academicPeriod: z.string().min(1),
    versionNumber: z.number().int().positive(),
    status: z.string().min(1),
    updatedAt: timestamp,
    finalizedAt: timestamp.nullable(),
    finalPdfAvailable: z.boolean(),
  })
  .strict();

const progressSchema = z.object({
  current: progressCurrentSchema,
  history: z.array(progressEventSchema).max(50).nullable(),
});

const semesterSummariesSchema = z
  .array(semesterSummarySchema)
  .max(20)
  .nullable();
const applicationsSchema = z.array(applicationSchema).max(100).nullable();
const consultationsSchema = z.array(consultationSchema).max(100).nullable();
const parentReportsSchema = z.array(parentReportSchema).max(50).nullable();

export type DirectorStudentSection<T> =
  | { status: "ready"; data: T }
  | { status: "unavailable" };

export type DirectorProgress = {
  current: z.infer<typeof progressCurrentSchema>;
  history: z.infer<typeof progressEventSchema>[];
};

export type DirectorSemesterSummary = z.infer<typeof semesterSummarySchema>;
export type DirectorApplication = z.infer<typeof applicationSchema>;
export type DirectorConsultation = z.infer<typeof consultationSchema>;
export type DirectorPrimaryCounselor = Exclude<
  z.infer<typeof primaryCounselorSchema>,
  null
>;
export type DirectorParentReport = z.infer<typeof parentReportSchema>;

export type DirectorStudentCaseDetail = {
  progress: DirectorStudentSection<DirectorProgress>;
  semesterSummaries: DirectorStudentSection<DirectorSemesterSummary[]>;
  applications: DirectorStudentSection<DirectorApplication[]>;
  readinessAssessments: DirectorStudentSection<
    GlobalReadinessAssessment[]
  >;
  consultations: DirectorStudentSection<DirectorConsultation[]>;
  primaryCounselor: DirectorStudentSection<
    DirectorPrimaryCounselor | null
  >;
  parentReports: DirectorStudentSection<DirectorParentReport[]>;
};

export type DirectorEligibilityAssessment = z.infer<
  typeof eligibilitySchema
>;

export type DirectorStudentAdditionalDetail = {
  achievementEvidence: DirectorStudentSection<StudentAchievementDocument[]>;
  profileDocuments: DirectorStudentSection<StudentProfileDocument[]>;
  eligibility: DirectorStudentSection<DirectorEligibilityAssessment | null>;
  caseDetail: DirectorStudentCaseDetail;
};

export function parseDirectorEligibility(
  value: unknown,
  studentId: string,
): DirectorEligibilityAssessment | null | undefined {
  if (!Array.isArray(value) || value.length > 1) return undefined;
  if (value.length === 0) return null;
  const parsed = eligibilitySchema.safeParse(value[0]);
  if (!parsed.success || parsed.data.student_id !== studentId) return undefined;
  return parsed.data;
}

export function parseDirectorStudentCaseDetail(
  value: unknown,
): DirectorStudentCaseDetail {
  const unavailable = { status: "unavailable" } as const;
  const unavailableResult: DirectorStudentCaseDetail = {
    progress: unavailable,
    semesterSummaries: unavailable,
    applications: unavailable,
    readinessAssessments: unavailable,
    consultations: unavailable,
    primaryCounselor: unavailable,
    parentReports: unavailable,
  };
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return unavailableResult;
  }

  const payload = value as Record<string, unknown>;
  const progressValue = payload.progress;
  let progress = unavailableResult.progress;
  let semesterSummaries = unavailableResult.semesterSummaries;
  if (progressValue === null) {
    progress = { status: "ready", data: { current: null, history: [] } };
    semesterSummaries = { status: "ready", data: [] };
  } else if (
    typeof progressValue === "object" &&
    !Array.isArray(progressValue)
  ) {
    const progressPayload = progressValue as Record<string, unknown>;
    const parsedProgress = progressSchema.safeParse(progressPayload);
    if (parsedProgress.success) {
      progress = {
        status: "ready",
        data: {
          current: parsedProgress.data.current,
          history: parsedProgress.data.history ?? [],
        },
      };
    }
    const parsedSummaries = semesterSummariesSchema.safeParse(
      progressPayload.semesterSummaries,
    );
    if (parsedSummaries.success) {
      semesterSummaries = {
        status: "ready",
        data: parsedSummaries.data ?? [],
      };
    }
  }

  const parsedApplications = applicationsSchema.safeParse(
    payload.applications,
  );
  const applications = parsedApplications.success
    ? { status: "ready" as const, data: parsedApplications.data ?? [] }
    : unavailable;

  const readinessValue = payload.readinessAssessments;
  const readinessAssessments =
    readinessValue === null
      ? []
      : parseGlobalReadinessAssessments(readinessValue);
  const readiness =
    readinessAssessments === null
      ? unavailable
      : { status: "ready" as const, data: readinessAssessments };

  const parsedConsultations = consultationsSchema.safeParse(
    payload.consultations,
  );
  const consultations = parsedConsultations.success
    ? { status: "ready" as const, data: parsedConsultations.data ?? [] }
    : unavailable;

  const parsedPrimaryCounselor = primaryCounselorSchema.safeParse(
    payload.primaryCounselor,
  );
  const primaryCounselor = parsedPrimaryCounselor.success
    ? { status: "ready" as const, data: parsedPrimaryCounselor.data }
    : unavailable;

  const parsedParentReports = parentReportsSchema.safeParse(
    payload.parentReports,
  );
  const parentReports = parsedParentReports.success
    ? { status: "ready" as const, data: parsedParentReports.data ?? [] }
    : unavailable;

  return {
    progress,
    semesterSummaries,
    applications,
    readinessAssessments: readiness,
    consultations,
    primaryCounselor,
    parentReports,
  };
}

export function formatDirectorCaseLabel(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
