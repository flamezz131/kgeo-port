import { z } from "zod";
import {
  UNIVERSITY_APPLICATION_COUNTRY_CODE_PATTERN,
  UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS,
  UNIVERSITY_APPLICATION_DEGREE_LEVELS,
  UNIVERSITY_APPLICATION_EVENT_PAGE_SIZE,
  UNIVERSITY_APPLICATION_EVENT_TYPE_LABELS,
  UNIVERSITY_APPLICATION_EVENT_TYPES,
  UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS,
  UNIVERSITY_APPLICATION_INTAKE_TERMS,
  UNIVERSITY_APPLICATION_INTAKE_YEAR_MAX,
  UNIVERSITY_APPLICATION_INTAKE_YEAR_MIN,
  UNIVERSITY_APPLICATION_NAME_MAX_LENGTH,
  UNIVERSITY_APPLICATION_NAME_MIN_LENGTH,
  UNIVERSITY_APPLICATION_PORTAL_URL_MAX_LENGTH,
  UNIVERSITY_APPLICATION_PORTAL_URL_PATTERN,
  UNIVERSITY_APPLICATION_REFERENCE_MAX_LENGTH,
  UNIVERSITY_APPLICATION_STATUS_DEFINITIONS,
  UNIVERSITY_APPLICATION_STATUS_LABELS,
  UNIVERSITY_APPLICATION_STATUSES,
  UNIVERSITY_APPLICATION_STUDENT_READ_LIMIT,
  UNIVERSITY_APPLICATION_SUBMITTED_STATUSES,
  UNIVERSITY_APPLICATION_TERMINAL_STATUSES,
} from "@/lib/counselor/university-applications";
import type {
  UniversityApplicationDegreeLevel,
  UniversityApplicationEventType,
  UniversityApplicationIntakeTerm,
  UniversityApplicationStatus,
} from "@/types";

export const UNIVERSITY_APPLICATION_PROJECTION_COLUMNS =
  "id, student_id, country_code, university_name, programme_name, degree_level, intake_term, intake_year, current_status, application_reference, portal_url, submission_deadline, submitted_at, is_primary, is_archived, archived_at, version_number, created_at, updated_at, last_changed_at";

export const UNIVERSITY_APPLICATION_EVENT_COLUMNS =
  "application_id, event_type, version_number, country_code, university_name, programme_name, degree_level, intake_term, intake_year, application_status, application_reference, portal_url, submission_deadline, submitted_at, is_primary, is_archived, change_reason, changed_at";

export const UNIVERSITY_APPLICATION_LIST_ERROR =
  "University applications are temporarily unavailable.";

export const UNIVERSITY_APPLICATION_HISTORY_ERROR =
  "Application history is temporarily unavailable.";

const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

export function parseUniversityApplicationTimestamp(
  value: string,
): bigint | null {
  const match = timestampPattern.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fractionalMicroseconds = BigInt(
    (match[7] ?? "").padEnd(6, "0"),
  );
  const zone = match[8];
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  ) {
    return null;
  }

  const localTime = new Date(0);
  localTime.setUTCFullYear(year, month - 1, day);
  localTime.setUTCHours(hour, minute, second, 0);
  if (
    localTime.getUTCFullYear() !== year ||
    localTime.getUTCMonth() !== month - 1 ||
    localTime.getUTCDate() !== day ||
    localTime.getUTCHours() !== hour ||
    localTime.getUTCMinutes() !== minute ||
    localTime.getUTCSeconds() !== second
  ) {
    return null;
  }

  let offsetMinutes = 0;
  if (zone !== "Z") {
    const offsetHours = Number(zone.slice(1, 3));
    const offsetRemainder = Number(zone.slice(4, 6));
    if (
      offsetHours > 14 ||
      offsetRemainder > 59 ||
      (offsetHours === 14 && offsetRemainder !== 0)
    ) {
      return null;
    }
    const sign = zone.startsWith("+") ? 1 : -1;
    offsetMinutes = sign * (offsetHours * 60 + offsetRemainder);
  }

  const epochMilliseconds =
    localTime.getTime() - offsetMinutes * 60_000;
  if (!Number.isFinite(epochMilliseconds)) return null;
  return (
    BigInt(epochMilliseconds) * BigInt(1_000) +
    fractionalMicroseconds
  );
}

const timestampSchema = z
  .string()
  .refine((value) => parseUniversityApplicationTimestamp(value) !== null);
const dateSchema = z
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
const nullableReferenceSchema = z
  .string()
  .min(1)
  .max(UNIVERSITY_APPLICATION_REFERENCE_MAX_LENGTH)
  .refine((value) => value === normalizeUniversityApplicationText(value))
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value))
  .nullable();
const nullablePortalSchema = z
  .string()
  .min(1)
  .max(UNIVERSITY_APPLICATION_PORTAL_URL_MAX_LENGTH)
  .regex(UNIVERSITY_APPLICATION_PORTAL_URL_PATTERN)
  .nullable();

const projectionSchema = z
  .object({
    id: z.uuid(),
    student_id: z.uuid(),
    country_code: z
      .string()
      .regex(UNIVERSITY_APPLICATION_COUNTRY_CODE_PATTERN),
    university_name: normalizedNameSchema,
    programme_name: normalizedNameSchema,
    degree_level: z.enum(UNIVERSITY_APPLICATION_DEGREE_LEVELS),
    intake_term: z.enum(UNIVERSITY_APPLICATION_INTAKE_TERMS),
    intake_year: z
      .number()
      .int()
      .min(UNIVERSITY_APPLICATION_INTAKE_YEAR_MIN)
      .max(UNIVERSITY_APPLICATION_INTAKE_YEAR_MAX),
    current_status: z.enum(UNIVERSITY_APPLICATION_STATUSES),
    application_reference: nullableReferenceSchema,
    portal_url: nullablePortalSchema,
    submission_deadline: dateSchema.nullable(),
    submitted_at: timestampSchema.nullable(),
    is_primary: z.boolean(),
    is_archived: z.boolean(),
    archived_at: timestampSchema.nullable(),
    version_number: z.number().int().min(1),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    last_changed_at: timestampSchema,
  })
  .strict()
  .superRefine((application, context) => {
    const submittedStatus =
      UNIVERSITY_APPLICATION_SUBMITTED_STATUSES.some(
        (status) => status === application.current_status,
      );
    const terminalStatus =
      UNIVERSITY_APPLICATION_TERMINAL_STATUSES.some(
        (status) => status === application.current_status,
      );

    if (submittedStatus !== (application.submitted_at !== null)) {
      if (!terminalStatus) {
        context.addIssue({
          code: "custom",
          path: ["submitted_at"],
          message: "Invalid submitted timestamp state.",
        });
      }
    }
    if (application.is_archived !== (application.archived_at !== null)) {
      context.addIssue({
        code: "custom",
        path: ["archived_at"],
        message: "Invalid archive state.",
      });
    }
    if (
      application.is_primary &&
      (application.is_archived || terminalStatus)
    ) {
      context.addIssue({
        code: "custom",
        path: ["is_primary"],
        message: "Invalid primary state.",
      });
    }
    const createdAt = parseUniversityApplicationTimestamp(
      application.created_at,
    );
    const updatedAt = parseUniversityApplicationTimestamp(
      application.updated_at,
    );
    const lastChangedAt = parseUniversityApplicationTimestamp(
      application.last_changed_at,
    );
    const submittedAt =
      application.submitted_at === null
        ? null
        : parseUniversityApplicationTimestamp(application.submitted_at);
    const archivedAt =
      application.archived_at === null
        ? null
        : parseUniversityApplicationTimestamp(application.archived_at);
    if (
      createdAt === null ||
      updatedAt === null ||
      lastChangedAt === null ||
      (application.submitted_at !== null && submittedAt === null) ||
      (application.archived_at !== null && archivedAt === null)
    ) {
      return;
    }
    if (
      updatedAt !== lastChangedAt ||
      updatedAt < createdAt ||
      (submittedAt !== null &&
        (submittedAt < createdAt || submittedAt > updatedAt)) ||
      (archivedAt !== null && archivedAt !== updatedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["updated_at"],
        message: "Invalid application timestamps.",
      });
    }
  });

const eventSchema = z
  .object({
    application_id: z.uuid(),
    event_type: z.enum(UNIVERSITY_APPLICATION_EVENT_TYPES),
    version_number: z.number().int().min(1),
    country_code: z
      .string()
      .regex(UNIVERSITY_APPLICATION_COUNTRY_CODE_PATTERN),
    university_name: normalizedNameSchema,
    programme_name: normalizedNameSchema,
    degree_level: z.enum(UNIVERSITY_APPLICATION_DEGREE_LEVELS),
    intake_term: z.enum(UNIVERSITY_APPLICATION_INTAKE_TERMS),
    intake_year: z
      .number()
      .int()
      .min(UNIVERSITY_APPLICATION_INTAKE_YEAR_MIN)
      .max(UNIVERSITY_APPLICATION_INTAKE_YEAR_MAX),
    application_status: z.enum(UNIVERSITY_APPLICATION_STATUSES),
    application_reference: nullableReferenceSchema,
    portal_url: nullablePortalSchema,
    submission_deadline: dateSchema.nullable(),
    submitted_at: timestampSchema.nullable(),
    is_primary: z.boolean(),
    is_archived: z.boolean(),
    change_reason: z
      .string()
      .min(1)
      .max(500)
      .refine((value) => value === normalizeUniversityApplicationText(value))
      .refine((value) => !/[\u0000-\u001f\u007f]/.test(value))
      .nullable(),
    changed_at: timestampSchema,
  })
  .strict()
  .superRefine((event, context) => {
    const terminalStatus =
      UNIVERSITY_APPLICATION_TERMINAL_STATUSES.some(
        (status) => status === event.application_status,
      );
    const submittedStatus =
      UNIVERSITY_APPLICATION_SUBMITTED_STATUSES.some(
        (status) => status === event.application_status,
      );
    if (
      !terminalStatus &&
      submittedStatus !== (event.submitted_at !== null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["submitted_at"],
        message: "Invalid submitted timestamp state.",
      });
    }
    if (
      event.is_primary &&
      (event.is_archived || terminalStatus)
    ) {
      context.addIssue({
        code: "custom",
        path: ["is_primary"],
        message: "Invalid primary state.",
      });
    }
    if (
      (event.event_type === "created") !==
        (event.version_number === 1) ||
      (event.event_type === "created") !==
        (event.change_reason === null)
    ) {
      context.addIssue({
        code: "custom",
        path: ["event_type"],
        message: "Invalid event version or reason.",
      });
    }
    const changedAt = parseUniversityApplicationTimestamp(
      event.changed_at,
    );
    const submittedAt =
      event.submitted_at === null
        ? null
        : parseUniversityApplicationTimestamp(event.submitted_at);
    if (
      changedAt !== null &&
      submittedAt !== null &&
      submittedAt > changedAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["submitted_at"],
        message: "Invalid event timestamps.",
      });
    }
  });

type ParsedProjection = z.infer<typeof projectionSchema>;
type ParsedEvent = z.infer<typeof eventSchema>;

export type CounselorUniversityApplication = {
  id: string;
  countryCode: string;
  universityName: string;
  programmeName: string;
  degreeLevel: UniversityApplicationDegreeLevel;
  degreeLevelLabel: string;
  intakeTerm: UniversityApplicationIntakeTerm;
  intakeLabel: string;
  intakeYear: number;
  currentStatus: UniversityApplicationStatus;
  currentStatusLabel: string;
  currentStatusDescription: string;
  applicationReference: string | null;
  portalUrl: string | null;
  submissionDeadline: string | null;
  submittedAt: string | null;
  isPrimary: boolean;
  isArchived: boolean;
  versionNumber: number;
  updatedAt: string;
};

export type CounselorUniversityApplicationList = {
  kind: "ready";
  applications: CounselorUniversityApplication[];
  totalCount: number;
  activeCount: number;
  archivedCount: number;
  primaryApplicationName: string | null;
};

export type CounselorUniversityApplicationListResult =
  | CounselorUniversityApplicationList
  | { kind: "unavailable" };

export type CounselorUniversityApplicationEvent = {
  eventType: UniversityApplicationEventType;
  eventLabel: string;
  versionNumber: number;
  countryCode: string;
  universityName: string;
  programmeName: string;
  degreeLevelLabel: string;
  intakeLabel: string;
  intakeYear: number;
  status: UniversityApplicationStatus;
  statusLabel: string;
  applicationReference: string | null;
  portalUrl: string | null;
  submissionDeadline: string | null;
  submittedAt: string | null;
  isPrimary: boolean;
  isArchived: boolean;
  changeReason: string | null;
  changedAt: string;
};

export type CounselorUniversityApplicationHistoryResult =
  | {
      kind: "ready";
      applicationId: string;
      page: number;
      events: CounselorUniversityApplicationEvent[];
      hasPreviousPage: boolean;
      hasNextPage: boolean;
    }
  | { kind: "unavailable" };

export type UniversityApplicationQueryResult = {
  data: unknown;
  error: unknown;
};

export function normalizeUniversityApplicationText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function toPresentation(
  application: ParsedProjection,
): CounselorUniversityApplication {
  return {
    id: application.id,
    countryCode: application.country_code,
    universityName: application.university_name,
    programmeName: application.programme_name,
    degreeLevel: application.degree_level,
    degreeLevelLabel:
      UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS[
        application.degree_level
      ],
    intakeTerm: application.intake_term,
    intakeLabel:
      UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS[
        application.intake_term
      ],
    intakeYear: application.intake_year,
    currentStatus: application.current_status,
    currentStatusLabel:
      UNIVERSITY_APPLICATION_STATUS_LABELS[
        application.current_status
      ],
    currentStatusDescription:
      UNIVERSITY_APPLICATION_STATUS_DEFINITIONS[
        application.current_status
      ],
    applicationReference: application.application_reference,
    portalUrl: application.portal_url,
    submissionDeadline: application.submission_deadline,
    submittedAt: application.submitted_at,
    isPrimary: application.is_primary,
    isArchived: application.is_archived,
    versionNumber: application.version_number,
    updatedAt: application.updated_at,
  };
}

function compareApplications(
  left: ParsedProjection,
  right: ParsedProjection,
): number {
  if (left.is_archived !== right.is_archived) {
    return left.is_archived ? 1 : -1;
  }
  if (!left.is_archived && left.is_primary !== right.is_primary) {
    return left.is_primary ? -1 : 1;
  }
  const leftUpdatedAt = parseUniversityApplicationTimestamp(
    left.updated_at,
  );
  const rightUpdatedAt = parseUniversityApplicationTimestamp(
    right.updated_at,
  );
  if (
    leftUpdatedAt !== null &&
    rightUpdatedAt !== null &&
    leftUpdatedAt !== rightUpdatedAt
  ) {
    return rightUpdatedAt > leftUpdatedAt ? 1 : -1;
  }
  return right.id.localeCompare(left.id);
}

export function parseCounselorUniversityApplicationList(
  value: unknown,
  trustedStudentId: string,
): CounselorUniversityApplicationListResult {
  if (!Array.isArray(value) || value.length > UNIVERSITY_APPLICATION_STUDENT_READ_LIMIT) {
    return { kind: "unavailable" };
  }

  const parsed: ParsedProjection[] = [];
  const ids = new Set<string>();
  let primaryCount = 0;
  for (const row of value) {
    const result = projectionSchema.safeParse(row);
    if (
      !result.success ||
      result.data.student_id !== trustedStudentId ||
      ids.has(result.data.id)
    ) {
      return { kind: "unavailable" };
    }
    ids.add(result.data.id);
    if (result.data.is_primary) primaryCount += 1;
    parsed.push(result.data);
  }
  if (primaryCount > 1) return { kind: "unavailable" };

  const sorted = [...parsed].sort(compareApplications);
  if (
    parsed.some(
      (application, index) => application.id !== sorted[index]?.id,
    )
  ) {
    return { kind: "unavailable" };
  }

  const applications = parsed.map(toPresentation);
  const archivedCount = applications.filter(
    (application) => application.isArchived,
  ).length;
  const primary = applications.find(
    (application) => application.isPrimary,
  );
  return {
    kind: "ready",
    applications,
    totalCount: applications.length,
    activeCount: applications.length - archivedCount,
    archivedCount,
    primaryApplicationName: primary?.universityName ?? null,
  };
}

export function parseOwnedUniversityApplication(
  value: unknown,
  trustedStudentId: string,
  applicationId?: string,
): CounselorUniversityApplication | null {
  const parsed = projectionSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.student_id !== trustedStudentId ||
    (applicationId !== undefined && parsed.data.id !== applicationId)
  ) {
    return null;
  }
  return toPresentation(parsed.data);
}

function toEventPresentation(
  event: ParsedEvent,
): CounselorUniversityApplicationEvent {
  return {
    eventType: event.event_type,
    eventLabel:
      UNIVERSITY_APPLICATION_EVENT_TYPE_LABELS[event.event_type],
    versionNumber: event.version_number,
    countryCode: event.country_code,
    universityName: event.university_name,
    programmeName: event.programme_name,
    degreeLevelLabel:
      UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS[event.degree_level],
    intakeLabel:
      UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS[event.intake_term],
    intakeYear: event.intake_year,
    status: event.application_status,
    statusLabel:
      UNIVERSITY_APPLICATION_STATUS_LABELS[event.application_status],
    applicationReference: event.application_reference,
    portalUrl: event.portal_url,
    submissionDeadline: event.submission_deadline,
    submittedAt: event.submitted_at,
    isPrimary: event.is_primary,
    isArchived: event.is_archived,
    changeReason: event.change_reason,
    changedAt: event.changed_at,
  };
}

export function parseCounselorUniversityApplicationHistory(
  value: unknown,
  applicationId: string,
  page: number,
  currentVersion: number,
): CounselorUniversityApplicationHistoryResult {
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100 ||
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > UNIVERSITY_APPLICATION_EVENT_PAGE_SIZE + 1
  ) {
    return { kind: "unavailable" };
  }

  const parsed: ParsedEvent[] = [];
  const versions = new Set<number>();
  for (const row of value) {
    const result = eventSchema.safeParse(row);
    if (
      !result.success ||
      result.data.application_id !== applicationId ||
      versions.has(result.data.version_number)
    ) {
      return { kind: "unavailable" };
    }
    versions.add(result.data.version_number);
    parsed.push(result.data);
  }

  if (
    parsed.some(
      (event, index) =>
        index > 0 &&
        event.version_number >= parsed[index - 1].version_number,
    ) ||
    (page === 1 && parsed[0]?.version_number !== currentVersion)
  ) {
    return { kind: "unavailable" };
  }

  const hasNextPage =
    parsed.length > UNIVERSITY_APPLICATION_EVENT_PAGE_SIZE;
  const visibleEvents = parsed.slice(
    0,
    UNIVERSITY_APPLICATION_EVENT_PAGE_SIZE,
  );
  const oldestVisibleEvent =
    visibleEvents[visibleEvents.length - 1];
  if (
    !hasNextPage &&
    (oldestVisibleEvent?.version_number !== 1 ||
      oldestVisibleEvent.event_type !== "created")
  ) {
    return { kind: "unavailable" };
  }
  return {
    kind: "ready",
    applicationId,
    page,
    events: visibleEvents.map(toEventPresentation),
    hasPreviousPage: page > 1,
    hasNextPage,
  };
}

export function formatUniversityApplicationDate(
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

export function formatUniversityApplicationTimestamp(
  value: string | null,
): string {
  if (!value) return "Not added";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
