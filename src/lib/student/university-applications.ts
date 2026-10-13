import { z } from "zod";
import {
  UNIVERSITY_APPLICATION_COUNTRY_CODE_PATTERN,
  UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS,
  UNIVERSITY_APPLICATION_DEGREE_LEVELS,
  UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS,
  UNIVERSITY_APPLICATION_INTAKE_TERMS,
  UNIVERSITY_APPLICATION_INTAKE_YEAR_MAX,
  UNIVERSITY_APPLICATION_INTAKE_YEAR_MIN,
  UNIVERSITY_APPLICATION_NAME_MAX_LENGTH,
  UNIVERSITY_APPLICATION_NAME_MIN_LENGTH,
  UNIVERSITY_APPLICATION_STATUSES,
  UNIVERSITY_APPLICATION_STATUS_LABELS,
  UNIVERSITY_APPLICATION_STUDENT_READ_LIMIT,
  UNIVERSITY_APPLICATION_SUBMITTED_STATUSES,
  UNIVERSITY_APPLICATION_TERMINAL_STATUSES,
} from "@/lib/counselor/university-applications";
import {
  normalizeUniversityApplicationText,
  parseUniversityApplicationTimestamp,
} from "@/lib/counselor/university-application-management";

export const STUDENT_UNIVERSITY_APPLICATION_ERROR =
  "University applications are temporarily unavailable.";

const canonicalUuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const timestampSchema = z
  .string()
  .refine((value) => parseUniversityApplicationTimestamp(value) !== null);

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  });

const normalizedNameSchema = z
  .string()
  .min(UNIVERSITY_APPLICATION_NAME_MIN_LENGTH)
  .max(UNIVERSITY_APPLICATION_NAME_MAX_LENGTH)
  .refine((value) => value === normalizeUniversityApplicationText(value))
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value));

const studentApplicationRowSchema = z
  .object({
    application_id: z.string().uuid().regex(canonicalUuidPattern),
    university_name: normalizedNameSchema,
    programme_name: normalizedNameSchema,
    country_code: z
      .string()
      .regex(UNIVERSITY_APPLICATION_COUNTRY_CODE_PATTERN),
    degree_level: z.enum(UNIVERSITY_APPLICATION_DEGREE_LEVELS),
    intake_term: z.enum(UNIVERSITY_APPLICATION_INTAKE_TERMS),
    intake_year: z
      .number()
      .int()
      .min(UNIVERSITY_APPLICATION_INTAKE_YEAR_MIN)
      .max(UNIVERSITY_APPLICATION_INTAKE_YEAR_MAX),
    current_status: z.enum(UNIVERSITY_APPLICATION_STATUSES),
    submission_deadline: dateOnlySchema.nullable(),
    submitted_at: timestampSchema.nullable(),
    is_primary: z.boolean(),
    last_changed_at: timestampSchema,
  })
  .strict()
  .superRefine((application, context) => {
    const requiresSubmittedAt =
      UNIVERSITY_APPLICATION_SUBMITTED_STATUSES.some(
        (status) => status === application.current_status,
      );
    const isTerminal = UNIVERSITY_APPLICATION_TERMINAL_STATUSES.some(
      (status) => status === application.current_status,
    );

    if (
      (requiresSubmittedAt && application.submitted_at === null) ||
      (!requiresSubmittedAt &&
        !isTerminal &&
        application.submitted_at !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["submitted_at"],
        message: "Invalid submitted timestamp state.",
      });
    }

    if (application.is_primary && isTerminal) {
      context.addIssue({
        code: "custom",
        path: ["is_primary"],
        message: "Invalid primary state.",
      });
    }
  });

type ParsedStudentApplication = z.infer<typeof studentApplicationRowSchema>;

const STUDENT_UNIVERSITY_APPLICATION_STATUS_DESCRIPTIONS = {
  planning: "The application is being planned with the counseling team.",
  documents_collecting:
    "Required application information and documents are being gathered.",
  application_preparing: "The application is being prepared.",
  ready_to_submit: "The application is ready for submission.",
  submitted: "The application has been submitted.",
  under_university_review:
    "The university is reviewing the application.",
  additional_information_requested:
    "The university has requested additional information.",
  decision_received:
    "A university decision has been recorded. Contact the counseling team for guidance.",
  withdrawn: "This application is no longer continuing.",
  closed: "This application record has been closed.",
} as const;

export type StudentUniversityApplicationPresentation = {
  applicationId: string;
  universityName: string;
  programmeName: string;
  countryCode: string;
  degreeLevelLabel: string;
  intakeTermLabel: string;
  intakeYear: number;
  currentStatusLabel: string;
  currentStatusDescription: string;
  submissionDeadline: string | null;
  submittedAt: string | null;
  isPrimary: boolean;
  lastChangedAt: string;
};

export type StudentUniversityApplicationListResult =
  | {
      kind: "ready";
      applications: StudentUniversityApplicationPresentation[];
    }
  | { kind: "unavailable" };

export type StudentUniversityApplicationRpcResult = {
  data: unknown;
  error: unknown;
};

function compareStudentApplications(
  left: ParsedStudentApplication,
  right: ParsedStudentApplication,
): number {
  if (left.is_primary !== right.is_primary) {
    return left.is_primary ? -1 : 1;
  }

  const leftChangedAt = parseUniversityApplicationTimestamp(
    left.last_changed_at,
  );
  const rightChangedAt = parseUniversityApplicationTimestamp(
    right.last_changed_at,
  );
  if (
    leftChangedAt !== null &&
    rightChangedAt !== null &&
    leftChangedAt !== rightChangedAt
  ) {
    return leftChangedAt > rightChangedAt ? -1 : 1;
  }

  if (left.application_id === right.application_id) return 0;
  return left.application_id > right.application_id ? -1 : 1;
}

function toPresentation(
  application: ParsedStudentApplication,
): StudentUniversityApplicationPresentation {
  return {
    applicationId: application.application_id,
    universityName: application.university_name,
    programmeName: application.programme_name,
    countryCode: application.country_code,
    degreeLevelLabel:
      UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS[
        application.degree_level
      ],
    intakeTermLabel:
      UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS[
        application.intake_term
      ],
    intakeYear: application.intake_year,
    currentStatusLabel:
      UNIVERSITY_APPLICATION_STATUS_LABELS[
        application.current_status
      ],
    currentStatusDescription:
      STUDENT_UNIVERSITY_APPLICATION_STATUS_DESCRIPTIONS[
        application.current_status
      ],
    submissionDeadline: application.submission_deadline,
    submittedAt: application.submitted_at,
    isPrimary: application.is_primary,
    lastChangedAt: application.last_changed_at,
  };
}

export function parseStudentUniversityApplications(
  value: unknown,
): StudentUniversityApplicationListResult {
  if (
    !Array.isArray(value) ||
    value.length > UNIVERSITY_APPLICATION_STUDENT_READ_LIMIT
  ) {
    return { kind: "unavailable" };
  }

  const parsed: ParsedStudentApplication[] = [];
  const applicationIds = new Set<string>();
  let primaryCount = 0;

  for (const row of value) {
    const result = studentApplicationRowSchema.safeParse(row);
    if (
      !result.success ||
      applicationIds.has(result.data.application_id)
    ) {
      return { kind: "unavailable" };
    }

    applicationIds.add(result.data.application_id);
    if (result.data.is_primary) primaryCount += 1;
    parsed.push(result.data);
  }

  if (primaryCount > 1) return { kind: "unavailable" };

  for (let index = 1; index < parsed.length; index += 1) {
    const previous = parsed[index - 1];
    const current = parsed[index];
    if (
      !previous ||
      !current ||
      compareStudentApplications(previous, current) > 0
    ) {
      return { kind: "unavailable" };
    }
  }

  return {
    kind: "ready",
    applications: parsed.map(toPresentation),
  };
}

export async function fetchMyUniversityApplications(
  executeRpc: () => Promise<StudentUniversityApplicationRpcResult>,
): Promise<StudentUniversityApplicationListResult> {
  try {
    const { data, error } = await executeRpc();
    if (error) return { kind: "unavailable" };
    return parseStudentUniversityApplications(data);
  } catch {
    return { kind: "unavailable" };
  }
}

export function formatStudentApplicationDate(
  value: string | null,
): string {
  if (!value) return "Not added";
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatStudentApplicationTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
