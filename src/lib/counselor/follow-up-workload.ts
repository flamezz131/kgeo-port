import { z } from "zod";
import { getAsiaKolkataBusinessDateTime, isStrictCalendarDate } from "@/lib/consultations/booking";
import {
  formatCounselorPrivateDate,
  formatCounselorPrivateTimestamp,
  getCounselorFollowUpLifecycle,
  getCounselorFollowUpLifecycleLabel,
  getCounselorFollowUpPriorityLabel,
  type CounselorFollowUpLifecycle,
} from "@/lib/counselor/private-records";
import { institutionalEmailSchema } from "@/lib/validation/institutional-email";
import type { Database } from "@/types/database";
import type {
  CounselorFollowUpPriority,
  CounselorFollowUpStatus,
} from "@/types";

export const FOLLOW_UP_WORKLOAD_BASE_PATH = "/counselor/follow-ups";
export const FOLLOW_UP_WORKLOAD_PAGE_SIZE = 25;
export const FOLLOW_UP_WORKLOAD_MAX_PAGE = 100_000;
export const FOLLOW_UP_WORKLOAD_UNAVAILABLE =
  "Follow-up information is temporarily unavailable.";

export const FOLLOW_UP_LIFECYCLE_OPTIONS = [
  { value: "all", label: "All lifecycle states" },
  { value: "overdue", label: "Overdue" },
  { value: "due_today", label: "Due today" },
  { value: "upcoming", label: "Upcoming" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const FOLLOW_UP_PRIORITY_FILTER_OPTIONS = [
  { value: "all", label: "All priorities" },
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
] as const;

export type FollowUpLifecycleFilter =
  (typeof FOLLOW_UP_LIFECYCLE_OPTIONS)[number]["value"];
export type FollowUpPriorityFilter =
  (typeof FOLLOW_UP_PRIORITY_FILTER_OPTIONS)[number]["value"];
export type FollowUpWorkloadSearchParams = Record<
  string,
  string | string[] | undefined
>;

export type ParsedFollowUpWorkloadQuery = {
  lifecycle: FollowUpLifecycleFilter;
  priority: FollowUpPriorityFilter;
  search: string | null;
  dueFrom: string | null;
  dueTo: string | null;
  page: number;
  hasFilters: boolean;
  hadInvalidParameters: boolean;
};

export type FollowUpWorkloadRpcArgs =
  Database["public"]["Functions"]["list_counselor_follow_up_workload"]["Args"];

export type FollowUpWorkloadMetrics = {
  overdueCount: number;
  dueTodayCount: number;
  upcomingCount: number;
  completedCount: number;
  cancelledCount: number;
  totalPendingCount: number;
};

export type FollowUpWorkloadRecord = {
  followUpId: string;
  studentId: string;
  consultationId: string | null;
  dueDate: string;
  priority: CounselorFollowUpPriority;
  storedStatus: CounselorFollowUpStatus;
  nextAction: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  fullName: string | null;
  collegeEmail: string;
  rollNumber: string | null;
};

export type FollowUpWorkloadLinkedRecord = FollowUpWorkloadRecord & {
  consultationReference: string | null;
};

export type FollowUpWorkloadReadyResult = {
  kind: "ready";
  query: ParsedFollowUpWorkloadQuery;
  records: FollowUpWorkloadLinkedRecord[];
  totalCount: number;
  metrics: FollowUpWorkloadMetrics;
  businessToday: string;
};

export type FollowUpWorkloadRawReadyResult = Omit<
  FollowUpWorkloadReadyResult,
  "records"
> & {
  records: FollowUpWorkloadRecord[];
};

export type FollowUpWorkloadLoadResult =
  | FollowUpWorkloadReadyResult
  | {
      kind: "out_of_range";
      redirectTo: string;
    }
  | {
      kind: "reference_unavailable";
      query: ParsedFollowUpWorkloadQuery;
      metrics: FollowUpWorkloadMetrics;
    }
  | {
      kind: "unavailable";
      query: ParsedFollowUpWorkloadQuery;
    };

export type FollowUpWorkloadRawLoadResult =
  | FollowUpWorkloadRawReadyResult
  | Exclude<FollowUpWorkloadLoadResult, FollowUpWorkloadReadyResult>;

const lifecycleValues = FOLLOW_UP_LIFECYCLE_OPTIONS.map(
  (option) => option.value,
);
const priorityValues = FOLLOW_UP_PRIORITY_FILTER_OPTIONS.map(
  (option) => option.value,
);
const knownParameterKeys = [
  "lifecycle",
  "priority",
  "search",
  "dueFrom",
  "dueTo",
  "page",
] as const;

function isOneOf<T extends string>(
  value: string,
  values: readonly T[],
): value is T {
  return values.some((candidate) => candidate === value);
}

function readSingleValue(
  searchParams: FollowUpWorkloadSearchParams,
  key: string,
): string | undefined {
  const value = searchParams[key];
  return typeof value === "string" ? value : undefined;
}

function normalizeSearch(value: string | undefined): string | null {
  if (value === undefined) return null;
  const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
  return normalized.length === 0 || normalized.length > 100
    ? null
    : normalized;
}

function parseDate(value: string | undefined): string | null {
  if (!value || !isStrictCalendarDate(value)) return null;
  return value;
}

function parsePage(value: string | undefined): number {
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= FOLLOW_UP_WORKLOAD_MAX_PAGE
    ? page
    : 1;
}

function hasInvalidExplicitValue(
  rawValue: string | undefined,
  parsedValue: string | null,
): boolean {
  return (
    rawValue !== undefined &&
    rawValue.trim() !== "" &&
    parsedValue === null
  );
}

export function parseFollowUpWorkloadQuery(
  searchParams: FollowUpWorkloadSearchParams,
): ParsedFollowUpWorkloadQuery {
  const rawLifecycle = readSingleValue(searchParams, "lifecycle");
  const lifecycle: FollowUpLifecycleFilter =
    rawLifecycle && isOneOf(rawLifecycle, lifecycleValues)
      ? rawLifecycle
      : "all";
  const rawPriority = readSingleValue(searchParams, "priority");
  const priority: FollowUpPriorityFilter =
    rawPriority && isOneOf(rawPriority, priorityValues)
      ? rawPriority
      : "all";
  const rawSearch = readSingleValue(searchParams, "search");
  const search = normalizeSearch(rawSearch);
  const rawDueFrom = readSingleValue(searchParams, "dueFrom");
  const rawDueTo = readSingleValue(searchParams, "dueTo");
  const parsedDueFrom = parseDate(rawDueFrom);
  const parsedDueTo = parseDate(rawDueTo);
  const reversedRange =
    parsedDueFrom !== null &&
    parsedDueTo !== null &&
    parsedDueFrom > parsedDueTo;
  const dueFrom = reversedRange ? null : parsedDueFrom;
  const dueTo = reversedRange ? null : parsedDueTo;
  const rawPage = readSingleValue(searchParams, "page");
  const page = parsePage(rawPage);
  const hasDuplicate = knownParameterKeys.some((key) =>
    Array.isArray(searchParams[key]),
  );
  const hasUnknownParameter = Object.keys(searchParams).some(
    (key) => !knownParameterKeys.some((knownKey) => knownKey === key),
  );
  const pageInvalid =
    rawPage !== undefined &&
    rawPage.trim() !== "" &&
    (page === 1 ? rawPage !== "1" : String(page) !== rawPage);
  const hadInvalidParameters =
    hasDuplicate ||
    hasUnknownParameter ||
    (rawLifecycle !== undefined &&
      rawLifecycle.trim() !== "" &&
      !isOneOf(rawLifecycle, lifecycleValues)) ||
    (rawPriority !== undefined &&
      rawPriority.trim() !== "" &&
      !isOneOf(rawPriority, priorityValues)) ||
    hasInvalidExplicitValue(rawSearch, search) ||
    hasInvalidExplicitValue(rawDueFrom, parsedDueFrom) ||
    hasInvalidExplicitValue(rawDueTo, parsedDueTo) ||
    reversedRange ||
    pageInvalid;

  return {
    lifecycle,
    priority,
    search,
    dueFrom,
    dueTo,
    page,
    hasFilters:
      lifecycle !== "all" ||
      priority !== "all" ||
      search !== null ||
      dueFrom !== null ||
      dueTo !== null,
    hadInvalidParameters,
  };
}

export function buildFollowUpWorkloadRpcArgs(
  query: ParsedFollowUpWorkloadQuery,
): FollowUpWorkloadRpcArgs {
  return {
    p_lifecycle: query.lifecycle,
    p_priority: query.priority,
    p_search: query.search,
    p_due_from: query.dueFrom,
    p_due_to: query.dueTo,
    p_page: query.page,
    p_page_size: FOLLOW_UP_WORKLOAD_PAGE_SIZE,
  };
}

export function buildFollowUpWorkloadUrl(
  query: ParsedFollowUpWorkloadQuery,
  page = query.page,
): string {
  const params = new URLSearchParams();
  if (query.lifecycle !== "all") {
    params.set("lifecycle", query.lifecycle);
  }
  if (query.priority !== "all") {
    params.set("priority", query.priority);
  }
  if (query.search) params.set("search", query.search);
  if (query.dueFrom) params.set("dueFrom", query.dueFrom);
  if (query.dueTo) params.set("dueTo", query.dueTo);
  if (page > 1) params.set("page", String(page));
  const queryString = params.toString();
  return queryString
    ? `${FOLLOW_UP_WORKLOAD_BASE_PATH}?${queryString}`
    : FOLLOW_UP_WORKLOAD_BASE_PATH;
}

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

const countSchema = z
  .union([z.number(), z.string()])
  .transform((value, context) => {
    const numericValue =
      typeof value === "number"
        ? value
        : /^\d+$/.test(value)
          ? Number(value)
          : Number.NaN;
    if (!Number.isSafeInteger(numericValue) || numericValue < 0) {
      context.addIssue({ code: "custom", message: "Invalid workload count" });
      return z.NEVER;
    }
    return numericValue;
  });

function isNormalizedText(value: string): boolean {
  return value === value.trim().replace(/\s+/g, " ");
}

const workloadRowSchema = z
  .object({
    follow_up_id: z.uuid().nullable(),
    student_id: z.uuid().nullable(),
    consultation_id: z.uuid().nullable(),
    due_date: z
      .string()
      .refine(isStrictCalendarDate)
      .nullable(),
    priority: z.enum(["low", "normal", "high"]).nullable(),
    stored_status: z.enum(["pending", "completed", "cancelled"]).nullable(),
    next_action: z
      .string()
      .min(1)
      .max(500)
      .refine(isNormalizedText)
      .nullable(),
    completed_at: timestampSchema.nullable(),
    created_at: timestampSchema.nullable(),
    updated_at: timestampSchema.nullable(),
    full_name: z
      .string()
      .max(150)
      .refine(
        (value) => value.trim().length === 0 || isNormalizedText(value),
      )
      .nullable(),
    college_email: institutionalEmailSchema.nullable(),
    roll_number: z
      .string()
      .min(1)
      .max(50)
      .refine((value) => value === value.trim())
      .nullable(),
    total_count: countSchema,
    overdue_count: countSchema,
    due_today_count: countSchema,
    upcoming_count: countSchema,
    completed_count: countSchema,
    cancelled_count: countSchema,
    total_pending_count: countSchema,
  })
  .strict();

type ParsedWorkloadRow = z.infer<typeof workloadRowSchema>;

const recordFieldNames = [
  "follow_up_id",
  "student_id",
  "consultation_id",
  "due_date",
  "priority",
  "stored_status",
  "next_action",
  "completed_at",
  "created_at",
  "updated_at",
  "full_name",
  "college_email",
  "roll_number",
] as const satisfies ReadonlyArray<keyof ParsedWorkloadRow>;

function getMetrics(row: ParsedWorkloadRow): FollowUpWorkloadMetrics {
  return {
    overdueCount: row.overdue_count,
    dueTodayCount: row.due_today_count,
    upcomingCount: row.upcoming_count,
    completedCount: row.completed_count,
    cancelledCount: row.cancelled_count,
    totalPendingCount: row.total_pending_count,
  };
}

function metricsAreValid(metrics: FollowUpWorkloadMetrics): boolean {
  return (
    metrics.overdueCount +
      metrics.dueTodayCount +
      metrics.upcomingCount ===
    metrics.totalPendingCount
  );
}

function metricsMatch(
  left: FollowUpWorkloadMetrics,
  right: FollowUpWorkloadMetrics,
): boolean {
  return (
    left.overdueCount === right.overdueCount &&
    left.dueTodayCount === right.dueTodayCount &&
    left.upcomingCount === right.upcomingCount &&
    left.completedCount === right.completedCount &&
    left.cancelledCount === right.cancelledCount &&
    left.totalPendingCount === right.totalPendingCount
  );
}

function isMetricsOnlyRow(row: ParsedWorkloadRow): boolean {
  return recordFieldNames.every((field) => row[field] === null);
}

function toRecord(row: ParsedWorkloadRow): FollowUpWorkloadRecord | null {
  if (
    !row.follow_up_id ||
    !row.student_id ||
    !row.due_date ||
    !row.priority ||
    !row.stored_status ||
    !row.next_action ||
    !row.created_at ||
    !row.updated_at ||
    !row.college_email
  ) {
    return null;
  }

  const completedAuditIsValid =
    row.stored_status === "completed"
      ? row.completed_at !== null
      : row.completed_at === null;
  const timestampsAreValid =
    Date.parse(row.updated_at) >= Date.parse(row.created_at) &&
    (row.completed_at === null ||
      (Date.parse(row.completed_at) >= Date.parse(row.created_at) &&
        Date.parse(row.completed_at) <= Date.parse(row.updated_at)));
  if (!completedAuditIsValid || !timestampsAreValid) return null;

  return {
    followUpId: row.follow_up_id,
    studentId: row.student_id,
    consultationId: row.consultation_id,
    dueDate: row.due_date,
    priority: row.priority,
    storedStatus: row.stored_status,
    nextAction: row.next_action,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    fullName:
      row.full_name === null || row.full_name.trim().length === 0
        ? null
        : row.full_name,
    collegeEmail: row.college_email,
    rollNumber: row.roll_number,
  };
}

export function getFollowUpWorkloadLifecycle(
  record: FollowUpWorkloadRecord,
  businessToday: string,
): CounselorFollowUpLifecycle {
  return getCounselorFollowUpLifecycle(
    { status: record.storedStatus, due_date: record.dueDate },
    businessToday,
  );
}

function recordMatchesQuery(
  record: FollowUpWorkloadRecord,
  query: ParsedFollowUpWorkloadQuery,
  businessToday: string,
): boolean {
  const lifecycle = getFollowUpWorkloadLifecycle(record, businessToday);
  const searchFields = [
    record.fullName ?? "",
    record.collegeEmail,
    record.rollNumber ?? "",
  ].map((value) => value.toLowerCase());
  return (
    (query.lifecycle === "all" || query.lifecycle === lifecycle) &&
    (query.priority === "all" || query.priority === record.priority) &&
    (query.search === null ||
      searchFields.some((value) => value.includes(query.search ?? ""))) &&
    (query.dueFrom === null || record.dueDate >= query.dueFrom) &&
    (query.dueTo === null || record.dueDate <= query.dueTo)
  );
}

const lifecycleRank: Record<CounselorFollowUpLifecycle, number> = {
  overdue: 1,
  due_today: 2,
  upcoming: 3,
  completed: 4,
  cancelled: 5,
};
const priorityRank: Record<CounselorFollowUpPriority, number> = {
  high: 1,
  normal: 2,
  low: 3,
};

function compareDescendingTimestamp(left: string, right: string): number {
  return Date.parse(right) - Date.parse(left);
}

function compareWorkloadRecords(
  left: FollowUpWorkloadRecord,
  right: FollowUpWorkloadRecord,
  businessToday: string,
): number {
  const leftLifecycle = getFollowUpWorkloadLifecycle(left, businessToday);
  const rightLifecycle = getFollowUpWorkloadLifecycle(right, businessToday);
  const lifecycleDifference =
    lifecycleRank[leftLifecycle] - lifecycleRank[rightLifecycle];
  if (lifecycleDifference !== 0) return lifecycleDifference;

  if (left.storedStatus === "pending" && right.storedStatus === "pending") {
    const priorityDifference =
      priorityRank[left.priority] - priorityRank[right.priority];
    if (priorityDifference !== 0) return priorityDifference;
    const dateDifference = left.dueDate.localeCompare(right.dueDate);
    if (dateDifference !== 0) return dateDifference;
  }
  if (
    left.storedStatus === "completed" &&
    right.storedStatus === "completed" &&
    left.completedAt &&
    right.completedAt
  ) {
    const completionDifference = compareDescendingTimestamp(
      left.completedAt,
      right.completedAt,
    );
    if (completionDifference !== 0) return completionDifference;
    const updateDifference = compareDescendingTimestamp(
      left.updatedAt,
      right.updatedAt,
    );
    if (updateDifference !== 0) return updateDifference;
  }
  if (
    left.storedStatus === "cancelled" &&
    right.storedStatus === "cancelled"
  ) {
    const updateDifference = compareDescendingTimestamp(
      left.updatedAt,
      right.updatedAt,
    );
    if (updateDifference !== 0) return updateDifference;
  }
  return left.followUpId.localeCompare(right.followUpId);
}

function recordsAreOrdered(
  records: FollowUpWorkloadRecord[],
  businessToday: string,
): boolean {
  return records.every(
    (record, index) =>
      index === 0 ||
      compareWorkloadRecords(records[index - 1], record, businessToday) <= 0,
  );
}

export function parseFollowUpWorkloadResponse(
  data: unknown,
  query: ParsedFollowUpWorkloadQuery,
  now = new Date(),
): FollowUpWorkloadRawLoadResult {
  const parsed = z
    .array(workloadRowSchema)
    .max(FOLLOW_UP_WORKLOAD_PAGE_SIZE)
    .safeParse(data);
  if (!parsed.success || parsed.data.length === 0) {
    return { kind: "unavailable", query };
  }

  const firstRow = parsed.data[0];
  const metrics = getMetrics(firstRow);
  const totalCount = firstRow.total_count;
  const globalTotal =
    metrics.totalPendingCount +
    metrics.completedCount +
    metrics.cancelledCount;
  if (
    !metricsAreValid(metrics) ||
    totalCount > globalTotal ||
    parsed.data.some(
      (row) =>
        row.total_count !== totalCount ||
        !metricsMatch(metrics, getMetrics(row)),
    )
  ) {
    return { kind: "unavailable", query };
  }

  const metricsRows = parsed.data.filter(isMetricsOnlyRow);
  if (metricsRows.length > 0) {
    if (metricsRows.length !== 1 || parsed.data.length !== 1) {
      return { kind: "unavailable", query };
    }
    const pageCount = Math.max(
      1,
      Math.ceil(totalCount / FOLLOW_UP_WORKLOAD_PAGE_SIZE),
    );
    if (query.page > pageCount) {
      return {
        kind: "out_of_range",
        redirectTo: buildFollowUpWorkloadUrl(query, pageCount),
      };
    }
    if (totalCount !== 0) return { kind: "unavailable", query };
    return {
      kind: "ready",
      query,
      records: [],
      totalCount,
      metrics,
      businessToday: getAsiaKolkataBusinessDateTime(now).date,
    };
  }

  const records = parsed.data.map(toRecord);
  if (records.some((record) => record === null)) {
    return { kind: "unavailable", query };
  }
  const validatedRecords = records.filter(
    (record): record is FollowUpWorkloadRecord => record !== null,
  );
  const businessToday = getAsiaKolkataBusinessDateTime(now).date;
  const minimumCount =
    (query.page - 1) * FOLLOW_UP_WORKLOAD_PAGE_SIZE +
    validatedRecords.length;
  const expectedRows = Math.min(
    FOLLOW_UP_WORKLOAD_PAGE_SIZE,
    Math.max(
      0,
      totalCount - (query.page - 1) * FOLLOW_UP_WORKLOAD_PAGE_SIZE,
    ),
  );
  if (
    totalCount < minimumCount ||
    expectedRows !== validatedRecords.length ||
    new Set(validatedRecords.map((record) => record.followUpId)).size !==
      validatedRecords.length ||
    validatedRecords.some(
      (record) => !recordMatchesQuery(record, query, businessToday),
    ) ||
    !recordsAreOrdered(validatedRecords, businessToday)
  ) {
    return { kind: "unavailable", query };
  }

  return {
    kind: "ready",
    query,
    records: validatedRecords,
    totalCount,
    metrics,
    businessToday,
  };
}

export type FollowUpWorkloadRpcExecutor = (
  args: FollowUpWorkloadRpcArgs,
) => Promise<{ data: unknown; error: unknown }>;

export async function fetchFollowUpWorkload(
  query: ParsedFollowUpWorkloadQuery,
  executeRpc: FollowUpWorkloadRpcExecutor,
  now = new Date(),
): Promise<FollowUpWorkloadRawLoadResult> {
  try {
    const result = await executeRpc(buildFollowUpWorkloadRpcArgs(query));
    if (result.error) return { kind: "unavailable", query };
    return parseFollowUpWorkloadResponse(result.data, query, now);
  } catch {
    return { kind: "unavailable", query };
  }
}

export function attachFollowUpWorkloadReferences(
  result: FollowUpWorkloadRawReadyResult,
  references: ReadonlyMap<string, string>,
): FollowUpWorkloadReadyResult | null {
  const records = result.records.map((record) => ({
    ...record,
    consultationReference: record.consultationId
      ? references.get(record.consultationId) ?? null
      : null,
  }));
  if (
    records.some(
      (record) =>
        record.consultationId !== null &&
        record.consultationReference === null,
    )
  ) {
    return null;
  }
  return { ...result, records };
}

export function getFollowUpWorkloadPagination(
  result: FollowUpWorkloadReadyResult,
) {
  const pageCount = Math.max(
    1,
    Math.ceil(result.totalCount / FOLLOW_UP_WORKLOAD_PAGE_SIZE),
  );
  const currentPage = result.query.page;
  return {
    currentPage,
    pageCount,
    firstUrl:
      currentPage > 1 ? buildFollowUpWorkloadUrl(result.query, 1) : null,
    previousUrl:
      currentPage > 1
        ? buildFollowUpWorkloadUrl(result.query, currentPage - 1)
        : null,
    nextUrl:
      currentPage < pageCount
        ? buildFollowUpWorkloadUrl(result.query, currentPage + 1)
        : null,
    finalUrl:
      currentPage < pageCount
        ? buildFollowUpWorkloadUrl(result.query, pageCount)
        : null,
  };
}

export {
  formatCounselorPrivateDate as formatFollowUpWorkloadDate,
  formatCounselorPrivateTimestamp as formatFollowUpWorkloadTimestamp,
  getCounselorFollowUpLifecycleLabel as getFollowUpWorkloadLifecycleLabel,
  getCounselorFollowUpPriorityLabel as getFollowUpWorkloadPriorityLabel,
};
