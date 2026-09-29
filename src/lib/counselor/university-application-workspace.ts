import { z } from "zod";
import {
  getAsiaKolkataBusinessDateTime,
  isStrictCalendarDate,
} from "@/lib/consultations/booking";
import { isInstitutionalEmail } from "@/lib/validation/institutional-email";
import type {
  CounselorUniversityApplicationWorkspaceEntry,
  CounselorUniversityApplicationWorkspaceMetrics,
  UniversityApplicationDegreeLevel,
  UniversityApplicationIntakeTerm,
  UniversityApplicationStatus,
} from "@/types";
import type { Database } from "@/types/database";

export const UNIVERSITY_APPLICATION_WORKSPACE_MAX_SEARCH_LENGTH = 100;
export const UNIVERSITY_APPLICATION_WORKSPACE_MAX_PAGE = 100_000;
export const UNIVERSITY_APPLICATION_WORKSPACE_DEFAULT_PAGE_SIZE = 20;
export const UNIVERSITY_APPLICATION_WORKSPACE_MAX_PAGE_SIZE = 25;
export const UNIVERSITY_APPLICATION_WORKSPACE_BASE_PATH =
  "/counselor/applications";
export const UNIVERSITY_APPLICATION_WORKSPACE_PAGE_SIZES = [10, 20, 25] as const;

export const UNIVERSITY_APPLICATION_WORKSPACE_STATUSES = [
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

export const UNIVERSITY_APPLICATION_WORKSPACE_DEGREE_LEVELS = [
  "bachelors",
  "masters",
  "postgraduate_diploma",
  "doctorate",
  "other",
] as const satisfies readonly UniversityApplicationDegreeLevel[];

export const UNIVERSITY_APPLICATION_WORKSPACE_INTAKE_TERMS = [
  "spring",
  "summer",
  "fall",
  "winter",
  "rolling",
  "other",
] as const satisfies readonly UniversityApplicationIntakeTerm[];

export const UNIVERSITY_APPLICATION_WORKSPACE_PRIMARY_FILTERS = [
  "all",
  "primary",
  "non_primary",
] as const;
export const UNIVERSITY_APPLICATION_WORKSPACE_ARCHIVE_FILTERS = [
  "active",
  "archived",
  "all",
] as const;
export const UNIVERSITY_APPLICATION_WORKSPACE_DEADLINE_FILTERS = [
  "all",
  "overdue",
  "due_30_days",
  "no_deadline",
] as const;
export const UNIVERSITY_APPLICATION_WORKSPACE_SORTS = [
  "last_changed_desc",
  "deadline_asc",
  "deadline_desc",
  "student_name_asc",
  "university_name_asc",
  "intake_year_desc",
] as const;

export type UniversityApplicationWorkspacePrimaryFilter =
  (typeof UNIVERSITY_APPLICATION_WORKSPACE_PRIMARY_FILTERS)[number];
export type UniversityApplicationWorkspaceArchiveFilter =
  (typeof UNIVERSITY_APPLICATION_WORKSPACE_ARCHIVE_FILTERS)[number];
export type UniversityApplicationWorkspaceDeadlineFilter =
  (typeof UNIVERSITY_APPLICATION_WORKSPACE_DEADLINE_FILTERS)[number];
export type UniversityApplicationWorkspaceSort =
  (typeof UNIVERSITY_APPLICATION_WORKSPACE_SORTS)[number];

export type UniversityApplicationWorkspaceQuery = {
  search: string | null;
  status: UniversityApplicationStatus | null;
  countryCode: string | null;
  degreeLevel: UniversityApplicationDegreeLevel | null;
  intakeTerm: UniversityApplicationIntakeTerm | null;
  intakeYear: number | null;
  primaryFilter: UniversityApplicationWorkspacePrimaryFilter;
  archiveFilter: UniversityApplicationWorkspaceArchiveFilter;
  deadlineFilter: UniversityApplicationWorkspaceDeadlineFilter;
  sort: UniversityApplicationWorkspaceSort;
  page: number;
  pageSize: number;
};

export type UniversityApplicationWorkspaceSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type UniversityApplicationWorkspacePagination = {
  currentPage: number;
  pageCount: number;
  previousUrl: string | null;
  nextUrl: string | null;
};

export type UniversityApplicationWorkspaceListRpcArgs =
  Database["public"]["Functions"]["list_counselor_university_application_workspace"]["Args"];
export type UniversityApplicationWorkspaceListRpcRow =
  Database["public"]["Functions"]["list_counselor_university_application_workspace"]["Returns"][number];
export type UniversityApplicationWorkspaceMetricsRpcRow =
  Database["public"]["Functions"]["get_counselor_university_application_workspace_metrics"]["Returns"][number];

export type UniversityApplicationWorkspaceListResult = {
  entries: CounselorUniversityApplicationWorkspaceEntry[];
  totalCount: number;
  pageBeyondRange: boolean;
};

export type UniversityApplicationWorkspaceReadResult =
  | { kind: "invalid" }
  | {
      kind: "ready";
      list: UniversityApplicationWorkspaceListResult | null;
      metrics: CounselorUniversityApplicationWorkspaceMetrics | null;
      query: UniversityApplicationWorkspaceQuery;
    };

type UniversityApplicationWorkspaceRpcResponse = {
  data: unknown;
  error: unknown | null;
};

type UniversityApplicationWorkspaceListExecutor = (
  args: UniversityApplicationWorkspaceListRpcArgs,
) => Promise<UniversityApplicationWorkspaceRpcResponse>;

type UniversityApplicationWorkspaceMetricsExecutor = () => Promise<
  UniversityApplicationWorkspaceRpcResponse
>;

const queryInputSchema = z
  .object({
    search: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    countryCode: z.string().nullable().optional(),
    degreeLevel: z.string().nullable().optional(),
    intakeTerm: z.string().nullable().optional(),
    intakeYear: z.number().int().nullable().optional(),
    primaryFilter: z.string().nullable().optional(),
    archiveFilter: z.string().nullable().optional(),
    deadlineFilter: z.string().nullable().optional(),
    sort: z.string().nullable().optional(),
    page: z.number().int().nullable().optional(),
    pageSize: z.number().int().nullable().optional(),
  })
  .strict();

const unsafeWorkspaceSearchCharacter =
  /[\u0000-\u001f\u007f-\u00a0\u00ad\u034f\u061c\u1680\u180e\u2000-\u200f\u2028-\u202f\u205f\u2060-\u206f\u3000\ud800-\udfff\ufeff]/u;
const utf8Encoder = new TextEncoder();

function foldAsciiCase(value: string): string {
  return value.replace(/[A-Z]/gu, (character) =>
    String.fromCharCode(character.charCodeAt(0) + 32),
  );
}

function isOneOf<T extends string>(
  value: string,
  values: readonly T[],
): value is T {
  return values.some((candidate) => candidate === value);
}

function normalizeOptional(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return normalized === "" ? null : normalized;
}

export function parseUniversityApplicationWorkspaceQuery(
  input: unknown,
): UniversityApplicationWorkspaceQuery | null {
  const parsed = queryInputSchema.safeParse(input);
  if (!parsed.success) return null;

  if (
    parsed.data.search &&
    unsafeWorkspaceSearchCharacter.test(parsed.data.search)
  ) {
    return null;
  }
  const normalizedSearch = parsed.data.search?.replace(/ +/gu, " ").trim() ?? "";
  const search = normalizedSearch === "" ? null : foldAsciiCase(normalizedSearch);
  const status = normalizeOptional(parsed.data.status);
  const countryCode = parsed.data.countryCode?.trim().toUpperCase() || null;
  const degreeLevel = normalizeOptional(parsed.data.degreeLevel);
  const intakeTerm = normalizeOptional(parsed.data.intakeTerm);
  const primaryFilter =
    normalizeOptional(parsed.data.primaryFilter) ?? "all";
  const archiveFilter =
    normalizeOptional(parsed.data.archiveFilter) ?? "active";
  const deadlineFilter =
    normalizeOptional(parsed.data.deadlineFilter) ?? "all";
  const sort = normalizeOptional(parsed.data.sort) ?? "last_changed_desc";
  const page = parsed.data.page ?? 1;
  const pageSize =
    parsed.data.pageSize ?? UNIVERSITY_APPLICATION_WORKSPACE_DEFAULT_PAGE_SIZE;

  if (
    (search !== null &&
      Array.from(search).length >
        UNIVERSITY_APPLICATION_WORKSPACE_MAX_SEARCH_LENGTH) ||
    (status !== null &&
      !isOneOf(status, UNIVERSITY_APPLICATION_WORKSPACE_STATUSES)) ||
    (countryCode !== null && !/^[A-Z]{2}$/u.test(countryCode)) ||
    (degreeLevel !== null &&
      !isOneOf(degreeLevel, UNIVERSITY_APPLICATION_WORKSPACE_DEGREE_LEVELS)) ||
    (intakeTerm !== null &&
      !isOneOf(intakeTerm, UNIVERSITY_APPLICATION_WORKSPACE_INTAKE_TERMS)) ||
    (parsed.data.intakeYear !== null &&
      parsed.data.intakeYear !== undefined &&
      (parsed.data.intakeYear < 2020 || parsed.data.intakeYear > 2100)) ||
    !isOneOf(
      primaryFilter,
      UNIVERSITY_APPLICATION_WORKSPACE_PRIMARY_FILTERS,
    ) ||
    !isOneOf(archiveFilter, UNIVERSITY_APPLICATION_WORKSPACE_ARCHIVE_FILTERS) ||
    !isOneOf(
      deadlineFilter,
      UNIVERSITY_APPLICATION_WORKSPACE_DEADLINE_FILTERS,
    ) ||
    !isOneOf(sort, UNIVERSITY_APPLICATION_WORKSPACE_SORTS) ||
    page < 1 ||
    page > UNIVERSITY_APPLICATION_WORKSPACE_MAX_PAGE ||
    pageSize < 1 ||
    pageSize > UNIVERSITY_APPLICATION_WORKSPACE_MAX_PAGE_SIZE
  ) {
    return null;
  }

  return {
    search,
    status,
    countryCode,
    degreeLevel,
    intakeTerm,
    intakeYear: parsed.data.intakeYear ?? null,
    primaryFilter,
    archiveFilter,
    deadlineFilter,
    sort,
    page,
    pageSize,
  };
}

export function buildUniversityApplicationWorkspaceRpcArgs(
  query: UniversityApplicationWorkspaceQuery,
): UniversityApplicationWorkspaceListRpcArgs {
  return {
    p_search: query.search,
    p_status: query.status,
    p_country_code: query.countryCode,
    p_degree_level: query.degreeLevel,
    p_intake_term: query.intakeTerm,
    p_intake_year: query.intakeYear,
    p_primary_filter: query.primaryFilter,
    p_archive_filter: query.archiveFilter,
    p_deadline_filter: query.deadlineFilter,
    p_sort: query.sort,
    p_page: query.page,
    p_page_size: query.pageSize,
  };
}

const workspaceSearchParameterNames = [
  "q",
  "status",
  "country",
  "degree",
  "intakeTerm",
  "intakeYear",
  "primary",
  "archive",
  "deadline",
  "sort",
  "page",
  "pageSize",
] as const;

function readScalarSearchParameter(
  searchParams: UniversityApplicationWorkspaceSearchParams,
  name: (typeof workspaceSearchParameterNames)[number],
): string | null | undefined {
  const value = searchParams[name];
  if (Array.isArray(value)) return undefined;
  return value ?? null;
}

function parseOptionalInteger(value: string | null): number | null | undefined {
  if (value === null || value === "") return null;
  if (!/^(?:0|[1-9]\d*)$/u.test(value)) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

export function parseUniversityApplicationWorkspaceSearchParams(
  input: UniversityApplicationWorkspaceSearchParams,
): UniversityApplicationWorkspaceQuery | null {
  const allowedNames = new Set<string>(workspaceSearchParameterNames);
  if (Object.keys(input).some((name) => !allowedNames.has(name))) return null;

  const values = Object.fromEntries(
    workspaceSearchParameterNames.map((name) => [
      name,
      readScalarSearchParameter(input, name),
    ]),
  ) as Record<(typeof workspaceSearchParameterNames)[number], string | null | undefined>;
  if (Object.values(values).some((value) => value === undefined)) return null;

  const intakeYear = parseOptionalInteger(values.intakeYear ?? null);
  const page = parseOptionalInteger(values.page ?? null);
  const pageSize = parseOptionalInteger(values.pageSize ?? null);
  if (intakeYear === undefined || page === undefined || pageSize === undefined) {
    return null;
  }
  if (
    pageSize !== null &&
    !UNIVERSITY_APPLICATION_WORKSPACE_PAGE_SIZES.some(
      (candidate) => candidate === pageSize,
    )
  ) {
    return null;
  }

  return parseUniversityApplicationWorkspaceQuery({
    search: values.q,
    status: values.status,
    countryCode: values.country,
    degreeLevel: values.degree,
    intakeTerm: values.intakeTerm,
    intakeYear,
    primaryFilter: values.primary,
    archiveFilter: values.archive,
    deadlineFilter: values.deadline,
    sort: values.sort,
    page,
    pageSize,
  });
}

export async function executeUniversityApplicationWorkspaceRead(
  searchParams: UniversityApplicationWorkspaceSearchParams,
  executeList: UniversityApplicationWorkspaceListExecutor,
  executeMetrics: UniversityApplicationWorkspaceMetricsExecutor,
  now = new Date(),
): Promise<UniversityApplicationWorkspaceReadResult> {
  const query = parseUniversityApplicationWorkspaceSearchParams(searchParams);
  if (query === null) return { kind: "invalid" };

  const [listResponse, metricsResponse] = await Promise.all([
    executeList(buildUniversityApplicationWorkspaceRpcArgs(query)),
    executeMetrics(),
  ]);

  return {
    kind: "ready",
    list: listResponse.error
      ? null
      : parseUniversityApplicationWorkspaceListResponse(
          listResponse.data,
          query,
          now,
        ),
    metrics: metricsResponse.error
      ? null
      : parseUniversityApplicationWorkspaceMetricsResponse(
          metricsResponse.data,
        ),
    query,
  };
}

export function buildUniversityApplicationWorkspaceUrl(
  query: UniversityApplicationWorkspaceQuery,
  overrides: Partial<UniversityApplicationWorkspaceQuery> = {},
): string {
  const next = { ...query, ...overrides };
  const parameters = new URLSearchParams();
  if (next.search) parameters.set("q", next.search);
  if (next.status) parameters.set("status", next.status);
  if (next.countryCode) parameters.set("country", next.countryCode);
  if (next.degreeLevel) parameters.set("degree", next.degreeLevel);
  if (next.intakeTerm) parameters.set("intakeTerm", next.intakeTerm);
  if (next.intakeYear !== null) {
    parameters.set("intakeYear", String(next.intakeYear));
  }
  if (next.primaryFilter !== "all") {
    parameters.set("primary", next.primaryFilter);
  }
  if (next.archiveFilter !== "active") {
    parameters.set("archive", next.archiveFilter);
  }
  if (next.deadlineFilter !== "all") {
    parameters.set("deadline", next.deadlineFilter);
  }
  if (next.sort !== "last_changed_desc") parameters.set("sort", next.sort);
  if (next.page !== 1) parameters.set("page", String(next.page));
  if (next.pageSize !== UNIVERSITY_APPLICATION_WORKSPACE_DEFAULT_PAGE_SIZE) {
    parameters.set("pageSize", String(next.pageSize));
  }
  const search = parameters.toString();
  return search
    ? `${UNIVERSITY_APPLICATION_WORKSPACE_BASE_PATH}?${search}`
    : UNIVERSITY_APPLICATION_WORKSPACE_BASE_PATH;
}

export function hasUniversityApplicationWorkspaceFilters(
  query: UniversityApplicationWorkspaceQuery,
): boolean {
  return (
    query.search !== null ||
    query.status !== null ||
    query.countryCode !== null ||
    query.degreeLevel !== null ||
    query.intakeTerm !== null ||
    query.intakeYear !== null ||
    query.primaryFilter !== "all" ||
    query.archiveFilter !== "active" ||
    query.deadlineFilter !== "all"
  );
}

export type UniversityApplicationWorkspaceEmptyKind =
  | "active"
  | "all"
  | "archived"
  | "filters"
  | "search";

export function getUniversityApplicationWorkspaceEmptyKind(
  query: UniversityApplicationWorkspaceQuery,
): UniversityApplicationWorkspaceEmptyKind {
  if (query.search !== null) return "search";
  if (
    query.status !== null ||
    query.countryCode !== null ||
    query.degreeLevel !== null ||
    query.intakeTerm !== null ||
    query.intakeYear !== null ||
    query.primaryFilter !== "all" ||
    query.deadlineFilter !== "all"
  ) {
    return "filters";
  }
  if (query.archiveFilter === "archived") return "archived";
  if (query.archiveFilter === "all") return "all";
  return "active";
}

export function getUniversityApplicationWorkspacePagination(
  query: UniversityApplicationWorkspaceQuery,
  totalCount: number,
): UniversityApplicationWorkspacePagination {
  const pageCount = Math.max(
    1,
    Math.min(
      UNIVERSITY_APPLICATION_WORKSPACE_MAX_PAGE,
      Math.ceil(totalCount / query.pageSize),
    ),
  );
  return {
    currentPage: query.page,
    pageCount,
    previousUrl:
      query.page > 1
        ? buildUniversityApplicationWorkspaceUrl(query, {
            page: query.page - 1,
          })
        : null,
    nextUrl:
      query.page < pageCount
        ? buildUniversityApplicationWorkspaceUrl(query, {
            page: query.page + 1,
          })
        : null,
  };
}

const countSchema = z
  .union([z.number(), z.string()])
  .transform((value, context) => {
    const numericValue =
      typeof value === "number"
        ? value
        : /^\d+$/u.test(value)
          ? Number(value)
          : Number.NaN;
    if (!Number.isSafeInteger(numericValue) || numericValue < 0) {
      context.addIssue({ code: "custom", message: "Invalid aggregate count" });
      return z.NEVER;
    }
    return numericValue;
  });

const boundedDocumentCountSchema = countSchema.refine(
  (value) => value <= 20,
  "Invalid available-document count",
);

function isNormalizedText(value: string): boolean {
  return value === value.trim().replace(/\s+/gu, " ");
}

function parseStrictTimestampKey(value: string): bigint | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2}):(\d{2}))$/u.exec(
      value,
    );
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[8] === "Z" ? 0 : Number(match[10]);
  const offsetMinute = match[8] === "Z" ? 0 : Number(match[11]);
  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > new Date(Date.UTC(year, month, 0)).getUTCDate() ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    return null;
  }

  const instant = new Date(0);
  instant.setUTCFullYear(year, month - 1, day);
  instant.setUTCHours(hour, minute, second, 0);
  const offsetDirection = match[9] === "-" ? -1 : 1;
  const offsetSeconds =
    match[8] === "Z"
      ? 0
      : offsetDirection * (offsetHour * 3600 + offsetMinute * 60);
  const epochSeconds = BigInt(instant.getTime() / 1000 - offsetSeconds);
  const fractionalMicroseconds = BigInt((match[7] ?? "").padEnd(6, "0") || "0");
  return epochSeconds * BigInt(1_000_000) + fractionalMicroseconds;
}

const timestampSchema = z
  .string()
  .refine((value) => parseStrictTimestampKey(value) !== null);

const workspaceRowSchema = z
  .object({
    application_id: z.uuid().nullable(),
    student_id: z.uuid().nullable(),
    student_full_name: z
      .string()
      .min(1)
      .max(150)
      .refine(isNormalizedText)
      .nullable(),
    college_email: z
      .string()
      .refine(
        (value) => value === value.toLowerCase() && isInstitutionalEmail(value),
      )
      .nullable(),
    roll_number: z
      .string()
      .min(1)
      .max(50)
      .refine((value) => value === value.trim())
      .nullable(),
    university_name: z
      .string()
      .min(2)
      .max(200)
      .refine(isNormalizedText)
      .nullable(),
    programme_name: z
      .string()
      .min(2)
      .max(200)
      .refine(isNormalizedText)
      .nullable(),
    country_code: z.string().regex(/^[A-Z]{2}$/u).nullable(),
    degree_level: z.enum(UNIVERSITY_APPLICATION_WORKSPACE_DEGREE_LEVELS).nullable(),
    intake_term: z.enum(UNIVERSITY_APPLICATION_WORKSPACE_INTAKE_TERMS).nullable(),
    intake_year: z.number().int().min(2020).max(2100).nullable(),
    current_status: z.enum(UNIVERSITY_APPLICATION_WORKSPACE_STATUSES).nullable(),
    application_reference: z
      .string()
      .min(1)
      .max(100)
      .refine(isNormalizedText)
      .nullable(),
    submission_deadline: z.string().refine(isStrictCalendarDate).nullable(),
    submitted_at: timestampSchema.nullable(),
    is_primary: z.boolean().nullable(),
    is_archived: z.boolean().nullable(),
    last_changed_at: timestampSchema.nullable(),
    available_document_count: boundedDocumentCountSchema.nullable(),
    total_count: countSchema,
  })
  .strict();

type ParsedWorkspaceRow = z.infer<typeof workspaceRowSchema>;

const applicationFieldNames = [
  "application_id",
  "student_id",
  "student_full_name",
  "college_email",
  "roll_number",
  "university_name",
  "programme_name",
  "country_code",
  "degree_level",
  "intake_term",
  "intake_year",
  "current_status",
  "application_reference",
  "submission_deadline",
  "submitted_at",
  "is_primary",
  "is_archived",
  "last_changed_at",
  "available_document_count",
] as const satisfies ReadonlyArray<keyof ParsedWorkspaceRow>;

function isSentinelRow(row: ParsedWorkspaceRow): boolean {
  return applicationFieldNames.every((field) => row[field] === null);
}

const submittedRequiredStatuses = new Set<UniversityApplicationStatus>([
  "submitted",
  "under_university_review",
  "additional_information_requested",
  "decision_received",
]);
const submittedForbiddenStatuses = new Set<UniversityApplicationStatus>([
  "planning",
  "documents_collecting",
  "application_preparing",
  "ready_to_submit",
]);

function toWorkspaceEntry(
  row: ParsedWorkspaceRow,
): CounselorUniversityApplicationWorkspaceEntry | null {
  if (
    row.application_id === null ||
    row.student_id === null ||
    row.college_email === null ||
    row.university_name === null ||
    row.programme_name === null ||
    row.country_code === null ||
    row.degree_level === null ||
    row.intake_term === null ||
    row.intake_year === null ||
    row.current_status === null ||
    row.is_primary === null ||
    row.is_archived === null ||
    row.last_changed_at === null ||
    row.available_document_count === null
  ) {
    return null;
  }
  if (
    (submittedRequiredStatuses.has(row.current_status) &&
      row.submitted_at === null) ||
    (submittedForbiddenStatuses.has(row.current_status) &&
      row.submitted_at !== null) ||
    (row.is_primary &&
      (row.is_archived ||
        row.current_status === "withdrawn" ||
        row.current_status === "closed"))
  ) {
    return null;
  }

  return {
    applicationId: row.application_id,
    studentId: row.student_id,
    studentFullName: row.student_full_name,
    collegeEmail: row.college_email,
    rollNumber: row.roll_number,
    universityName: row.university_name,
    programmeName: row.programme_name,
    countryCode: row.country_code,
    degreeLevel: row.degree_level,
    intakeTerm: row.intake_term,
    intakeYear: row.intake_year,
    currentStatus: row.current_status,
    applicationReference: row.application_reference,
    submissionDeadline: row.submission_deadline,
    submittedAt: row.submitted_at,
    isPrimary: row.is_primary,
    isArchived: row.is_archived,
    lastChangedAt: row.last_changed_at,
    availableDocumentCount: row.available_document_count,
  };
}

function entryMatchesQuery(
  entry: CounselorUniversityApplicationWorkspaceEntry,
  query: UniversityApplicationWorkspaceQuery,
  businessDate: string,
): boolean {
  const searchableValues = [
    entry.studentFullName ?? "",
    entry.collegeEmail,
    entry.rollNumber ?? "",
    entry.universityName,
    entry.programmeName,
    entry.applicationReference ?? "",
  ].map(foldAsciiCase);
  const deadlineMatches =
    query.deadlineFilter === "all" ||
    (query.deadlineFilter === "no_deadline" &&
      entry.submissionDeadline === null) ||
    (query.deadlineFilter === "overdue" &&
      entry.submissionDeadline !== null &&
      entry.submissionDeadline < businessDate) ||
    (query.deadlineFilter === "due_30_days" &&
      entry.submissionDeadline !== null &&
      entry.submissionDeadline >= businessDate &&
      entry.submissionDeadline <= addCalendarDays(businessDate, 30));
  return (
    (query.search === null ||
      searchableValues.some((value) => value.includes(query.search ?? ""))) &&
    (query.status === null || entry.currentStatus === query.status) &&
    (query.countryCode === null || entry.countryCode === query.countryCode) &&
    (query.degreeLevel === null || entry.degreeLevel === query.degreeLevel) &&
    (query.intakeTerm === null || entry.intakeTerm === query.intakeTerm) &&
    (query.intakeYear === null || entry.intakeYear === query.intakeYear) &&
    (query.primaryFilter === "all" ||
      (query.primaryFilter === "primary" && entry.isPrimary) ||
      (query.primaryFilter === "non_primary" && !entry.isPrimary)) &&
    (query.archiveFilter === "all" ||
      (query.archiveFilter === "active" && !entry.isArchived) ||
      (query.archiveFilter === "archived" && entry.isArchived)) &&
    deadlineMatches
  );
}

function addCalendarDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day + days);
  date.setUTCHours(0, 0, 0, 0);
  return `${String(date.getUTCFullYear()).padStart(4, "0")}-${String(
    date.getUTCMonth() + 1,
  ).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export type UniversityApplicationDeadlinePresentation = {
  kind: "none" | "overdue" | "due_today" | "due_soon" | "upcoming";
  label: string;
  dateLabel: string | null;
};

export function formatUniversityApplicationWorkspaceDate(value: string): string {
  if (!isStrictCalendarDate(value)) return "Date unavailable";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(0, 0, 0, 0);
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

export function formatUniversityApplicationWorkspaceTimestamp(
  value: string,
): string {
  if (parseStrictTimestampKey(value) === null) return "Time unavailable";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function getUniversityApplicationDeadlinePresentation(
  deadline: string | null,
  now = new Date(),
): UniversityApplicationDeadlinePresentation {
  if (deadline === null) {
    return { kind: "none", label: "No deadline", dateLabel: null };
  }
  const businessDate = getAsiaKolkataBusinessDateTime(now).date;
  const dateLabel = formatUniversityApplicationWorkspaceDate(deadline);
  if (deadline < businessDate) {
    return { kind: "overdue", label: "Overdue", dateLabel };
  }
  if (deadline === businessDate) {
    return { kind: "due_today", label: "Due today", dateLabel };
  }
  if (deadline <= addCalendarDays(businessDate, 30)) {
    return { kind: "due_soon", label: "Due soon", dateLabel };
  }
  return { kind: "upcoming", label: "Upcoming deadline", dateLabel };
}

function compareValues(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareUtf8Bytes(left: string, right: string): number {
  const leftBytes = utf8Encoder.encode(left);
  const rightBytes = utf8Encoder.encode(right);
  const sharedLength = Math.min(leftBytes.length, rightBytes.length);
  for (let index = 0; index < sharedLength; index += 1) {
    if (leftBytes[index] !== rightBytes[index]) {
      return leftBytes[index] < rightBytes[index] ? -1 : 1;
    }
  }
  return leftBytes.length < rightBytes.length
    ? -1
    : leftBytes.length > rightBytes.length
      ? 1
      : 0;
}

function compareTimestampValues(left: string, right: string): number {
  const leftKey = parseStrictTimestampKey(left);
  const rightKey = parseStrictTimestampKey(right);
  if (leftKey === null || rightKey === null) return 0;
  return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
}

function compareWorkspaceEntries(
  left: CounselorUniversityApplicationWorkspaceEntry,
  right: CounselorUniversityApplicationWorkspaceEntry,
  sort: UniversityApplicationWorkspaceSort,
): number {
  let comparison = 0;
  if (sort === "last_changed_desc") {
    comparison = compareTimestampValues(right.lastChangedAt, left.lastChangedAt);
  } else if (sort === "deadline_asc" || sort === "deadline_desc") {
    if (left.submissionDeadline === null || right.submissionDeadline === null) {
      comparison =
        left.submissionDeadline === right.submissionDeadline
          ? 0
          : left.submissionDeadline === null
            ? 1
            : -1;
    } else {
      comparison = compareValues(left.submissionDeadline, right.submissionDeadline);
      if (sort === "deadline_desc") comparison *= -1;
    }
  } else if (sort === "student_name_asc") {
    comparison = compareUtf8Bytes(
      foldAsciiCase(left.studentFullName ?? left.collegeEmail),
      foldAsciiCase(right.studentFullName ?? right.collegeEmail),
    );
  } else if (sort === "university_name_asc") {
    comparison = compareUtf8Bytes(
      foldAsciiCase(left.universityName),
      foldAsciiCase(right.universityName),
    );
  } else {
    comparison = right.intakeYear - left.intakeYear;
  }
  if (comparison !== 0) return comparison;
  return ["last_changed_desc", "deadline_desc", "intake_year_desc"].includes(
    sort,
  )
    ? compareValues(right.applicationId, left.applicationId)
    : compareValues(left.applicationId, right.applicationId);
}

export function parseUniversityApplicationWorkspaceListResponse(
  data: unknown,
  query: UniversityApplicationWorkspaceQuery,
  now = new Date(),
): UniversityApplicationWorkspaceListResult | null {
  const parsed = z
    .array(workspaceRowSchema)
    .min(1)
    .max(UNIVERSITY_APPLICATION_WORKSPACE_MAX_PAGE_SIZE)
    .safeParse(data);
  if (!parsed.success) return null;
  const totalCount = parsed.data[0].total_count;
  if (parsed.data.some((row) => row.total_count !== totalCount)) return null;

  const sentinels = parsed.data.filter(isSentinelRow);
  if (sentinels.length > 0) {
    if (sentinels.length !== 1 || parsed.data.length !== 1) return null;
    const pageOffset = (query.page - 1) * query.pageSize;
    if (totalCount > 0 && pageOffset < totalCount) return null;
    return {
      entries: [],
      totalCount,
      pageBeyondRange: totalCount > 0,
    };
  }

  const entries = parsed.data.map(toWorkspaceEntry);
  if (entries.some((entry) => entry === null)) return null;
  const validatedEntries = entries.filter(
    (entry): entry is CounselorUniversityApplicationWorkspaceEntry =>
      entry !== null,
  );
  const expectedRows = Math.min(
    query.pageSize,
    Math.max(0, totalCount - (query.page - 1) * query.pageSize),
  );
  const businessDate = getAsiaKolkataBusinessDateTime(now).date;
  if (
    expectedRows !== validatedEntries.length ||
    new Set(validatedEntries.map((entry) => entry.applicationId)).size !==
      validatedEntries.length ||
    validatedEntries.some(
      (entry) => !entryMatchesQuery(entry, query, businessDate),
    ) ||
    validatedEntries.some(
      (entry, index) =>
        index > 0 &&
        compareWorkspaceEntries(
          validatedEntries[index - 1],
          entry,
          query.sort,
        ) > 0,
    )
  ) {
    return null;
  }
  return { entries: validatedEntries, totalCount, pageBeyondRange: false };
}

const metricsRowSchema = z
  .object({
    total_active_applications: countSchema,
    total_archived_applications: countSchema,
    students_with_applications: countSchema,
    primary_applications: countSchema,
    planning_count: countSchema,
    documents_collecting_count: countSchema,
    application_preparing_count: countSchema,
    ready_to_submit_count: countSchema,
    submitted_count: countSchema,
    under_university_review_count: countSchema,
    additional_information_requested_count: countSchema,
    decision_received_count: countSchema,
    withdrawn_count: countSchema,
    closed_count: countSchema,
    overdue_deadline_count: countSchema,
    due_next_30_days_count: countSchema,
  })
  .strict();

export function parseUniversityApplicationWorkspaceMetricsResponse(
  data: unknown,
): CounselorUniversityApplicationWorkspaceMetrics | null {
  const parsed = z.array(metricsRowSchema).length(1).safeParse(data);
  if (!parsed.success) return null;
  const row = parsed.data[0];
  const statusTotal =
    row.planning_count +
    row.documents_collecting_count +
    row.application_preparing_count +
    row.ready_to_submit_count +
    row.submitted_count +
    row.under_university_review_count +
    row.additional_information_requested_count +
    row.decision_received_count +
    row.withdrawn_count +
    row.closed_count;
  if (
    statusTotal !== row.total_active_applications ||
    row.primary_applications > row.total_active_applications ||
    row.students_with_applications > row.total_active_applications ||
    row.overdue_deadline_count + row.due_next_30_days_count >
      row.total_active_applications
  ) {
    return null;
  }
  return {
    totalActiveApplications: row.total_active_applications,
    totalArchivedApplications: row.total_archived_applications,
    studentsWithApplications: row.students_with_applications,
    primaryApplications: row.primary_applications,
    planningCount: row.planning_count,
    documentsCollectingCount: row.documents_collecting_count,
    applicationPreparingCount: row.application_preparing_count,
    readyToSubmitCount: row.ready_to_submit_count,
    submittedCount: row.submitted_count,
    underUniversityReviewCount: row.under_university_review_count,
    additionalInformationRequestedCount:
      row.additional_information_requested_count,
    decisionReceivedCount: row.decision_received_count,
    withdrawnCount: row.withdrawn_count,
    closedCount: row.closed_count,
    overdueDeadlineCount: row.overdue_deadline_count,
    dueNext30DaysCount: row.due_next_30_days_count,
  };
}
