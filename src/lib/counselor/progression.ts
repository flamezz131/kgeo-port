import { z } from "zod";
import type {
  CounselingProgressionCorrectionType,
  CounselingProgressionStage,
  CounselingProgressionState,
} from "@/types";

export const OFFICIAL_PROGRESSION_PAGE_SIZE = 20;
export const OFFICIAL_PROGRESSION_MAX_PAGE = 100_000;
export const OFFICIAL_PROGRESSION_REASON_MAX_LENGTH = 500;
export const OFFICIAL_PROGRESSION_CORRECTION_PAGE_LIMIT = 20;

export const OFFICIAL_PROGRESSION_CURRENT_COLUMNS =
  "student_id, current_stage, workflow_state, stage_started_at, last_changed_at, last_changed_by, created_at, updated_at" as const;

export const OFFICIAL_PROGRESSION_EVENT_COLUMNS =
  "id, student_id, previous_stage, new_stage, previous_state, new_state, changed_by, change_reason, changed_at" as const;

export const COUNSELING_PROGRESSION_STAGES = [
  "profile_review",
  "initial_counseling",
  "goals_confirmed",
  "country_exploration",
  "program_shortlisting",
  "university_shortlisting",
  "test_preparation",
  "document_preparation",
  "application_ready",
  "application_in_progress",
  "offer_evaluation",
  "visa_preparation",
  "pre_departure",
] as const satisfies readonly CounselingProgressionStage[];

export const COUNSELING_PROGRESSION_STATES = [
  "active",
  "on_hold",
  "completed",
] as const satisfies readonly CounselingProgressionState[];

export const COUNSELING_PROGRESSION_STAGE_LABELS = {
  profile_review: "Profile review",
  initial_counseling: "Initial counseling",
  goals_confirmed: "Goals confirmed",
  country_exploration: "Country exploration",
  program_shortlisting: "Program shortlisting",
  university_shortlisting: "University shortlisting",
  test_preparation: "Test preparation",
  document_preparation: "Document preparation",
  application_ready: "Application ready",
  application_in_progress: "Application in progress",
  offer_evaluation: "Offer evaluation",
  visa_preparation: "Visa preparation",
  pre_departure: "Pre-departure",
} as const satisfies Record<CounselingProgressionStage, string>;

export const COUNSELING_PROGRESSION_STATE_LABELS = {
  active: "Active",
  on_hold: "On hold",
  completed: "Completed",
} as const satisfies Record<CounselingProgressionState, string>;

export const COUNSELING_PROGRESSION_CORRECTION_TYPE_LABELS = {
  undo_transition: "Progression update reversed",
  reset_initialization: "Official progression reset",
} as const satisfies Record<CounselingProgressionCorrectionType, string>;

export const COUNSELING_PROGRESSION_STAGE_OPTIONS = [
  { value: "profile_review", label: "Profile review" },
  { value: "initial_counseling", label: "Initial counseling" },
  { value: "goals_confirmed", label: "Goals confirmed" },
  { value: "country_exploration", label: "Country exploration" },
  { value: "program_shortlisting", label: "Program shortlisting" },
  { value: "university_shortlisting", label: "University shortlisting" },
  { value: "test_preparation", label: "Test preparation" },
  { value: "document_preparation", label: "Document preparation" },
  { value: "application_ready", label: "Application ready" },
  { value: "application_in_progress", label: "Application in progress" },
  { value: "offer_evaluation", label: "Offer evaluation" },
  { value: "visa_preparation", label: "Visa preparation" },
  { value: "pre_departure", label: "Pre-departure" },
] as const satisfies ReadonlyArray<{
  value: CounselingProgressionStage;
  label: string;
}>;

export const COUNSELING_PROGRESSION_STATE_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On hold" },
  { value: "completed", label: "Completed" },
] as const satisfies ReadonlyArray<{
  value: CounselingProgressionState;
  label: string;
}>;

export const COUNSELING_PROGRESSION_STAGE_PERCENTAGES = {
  profile_review: 3,
  initial_counseling: 5,
  goals_confirmed: 7,
  country_exploration: 8,
  program_shortlisting: 9,
  university_shortlisting: 10,
  test_preparation: 15,
  document_preparation: 20,
  application_ready: 30,
  application_in_progress: 40,
  offer_evaluation: 50,
  visa_preparation: 75,
  pre_departure: 85,
} as const satisfies Record<CounselingProgressionStage, number>;

const progressionStageSchema = z.enum(COUNSELING_PROGRESSION_STAGES);
const progressionStateSchema = z.enum(COUNSELING_PROGRESSION_STATES);
const progressionCorrectionTypeSchema = z.enum([
  "undo_transition",
  "reset_initialization",
]);
const postgresqlTimestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

type PostgreSqlTimestamp = {
  epochSecond: number;
  microsecond: number;
};

function parsePostgreSqlTimestamp(
  value: string,
): PostgreSqlTimestamp | null {
  const match = postgresqlTimestampPattern.exec(value);
  if (!match) return null;

  const [, year, month, day, hour, minute, second, fraction, zone] =
    match;
  const yearNumber = Number(year);
  const monthNumber = Number(month);
  const dayNumber = Number(day);
  const hourNumber = Number(hour);
  const minuteNumber = Number(minute);
  const secondNumber = Number(second);
  const daysInMonth = new Date(
    Date.UTC(yearNumber, monthNumber, 0),
  ).getUTCDate();
  if (
    yearNumber < 1 ||
    monthNumber < 1 ||
    monthNumber > 12 ||
    dayNumber < 1 ||
    dayNumber > daysInMonth ||
    hourNumber > 23 ||
    minuteNumber > 59 ||
    secondNumber > 59
  ) {
    return null;
  }

  const epochSecond = Date.parse(
    `${year}-${month}-${day}T${hour}:${minute}:${second}${zone}`,
  );
  if (Number.isNaN(epochSecond)) return null;

  return {
    epochSecond,
    microsecond: Number((fraction ?? "").padEnd(6, "0")),
  };
}

export function isValidOfficialProgressionTimestamp(
  value: string,
): boolean {
  return parsePostgreSqlTimestamp(value) !== null;
}

function comparePostgreSqlTimestamps(
  left: string,
  right: string,
): number | null {
  const leftTimestamp = parsePostgreSqlTimestamp(left);
  const rightTimestamp = parsePostgreSqlTimestamp(right);
  if (!leftTimestamp || !rightTimestamp) return null;
  if (leftTimestamp.epochSecond !== rightTimestamp.epochSecond) {
    return leftTimestamp.epochSecond - rightTimestamp.epochSecond;
  }
  return leftTimestamp.microsecond - rightTimestamp.microsecond;
}

const timestampSchema = z
  .string()
  .refine(isValidOfficialProgressionTimestamp);

const normalizedReasonSchema = z
  .string()
  .min(1)
  .refine(
    (value) =>
      getOfficialProgressionReasonLength(value) <=
      OFFICIAL_PROGRESSION_REASON_MAX_LENGTH,
  )
  .refine((value) => normalizeOfficialProgressionReason(value) === value)
  .nullable();

const currentProgressionSchema = z
  .object({
    student_id: z.uuid(),
    current_stage: progressionStageSchema,
    workflow_state: progressionStateSchema,
    stage_started_at: timestampSchema,
    last_changed_at: timestampSchema,
    last_changed_by: z.uuid(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict();

const progressionEventSchema = z
  .object({
    id: z.uuid(),
    student_id: z.uuid(),
    previous_stage: progressionStageSchema.nullable(),
    new_stage: progressionStageSchema,
    previous_state: progressionStateSchema.nullable(),
    new_state: progressionStateSchema,
    changed_by: z.uuid(),
    change_reason: normalizedReasonSchema,
    changed_at: timestampSchema,
  })
  .strict();

const progressionCorrectionContextRowSchema = z
  .object({
    target_event_id: z.uuid(),
    correction_id: z.uuid().nullable(),
    correction_type: progressionCorrectionTypeSchema.nullable(),
    restored_stage: progressionStageSchema.nullable(),
    restored_state: progressionStateSchema.nullable(),
    restored_stage_started_at: timestampSchema.nullable(),
    correction_reason: normalizedReasonSchema,
    corrected_at: timestampSchema.nullable(),
    effective_event_exists: z.boolean(),
    latest_effective_event_id: z.uuid().nullable(),
    latest_effective_stage: progressionStageSchema.nullable(),
    latest_effective_state: progressionStateSchema.nullable(),
    latest_effective_changed_at: timestampSchema.nullable(),
    latest_effective_changed_by: z.uuid().nullable(),
    total_correction_count: z.number().int().nonnegative(),
  })
  .strict();

export type OfficialProgressionCurrent = z.infer<
  typeof currentProgressionSchema
>;
export type OfficialProgressionEvent = z.infer<
  typeof progressionEventSchema
>;
export type OfficialProgressionCorrectionContextRow = z.infer<
  typeof progressionCorrectionContextRowSchema
>;

export type OfficialProgressionCorrectionAudit = {
  correctionType: CounselingProgressionCorrectionType;
  correctionReason: string;
  correctedAt: string;
};

export type OfficialProgressionCorrectionReadModel =
  | {
      kind: "ready";
      correctionByEvent: Partial<
        Record<string, OfficialProgressionCorrectionAudit>
      >;
      latestEffectiveEventId: string | null;
    }
  | { kind: "unavailable" };

export type OfficialProgressionQueryResult = {
  data: unknown;
  error: unknown;
  count?: unknown;
};

export type OfficialProgressionDataSource = {
  loadCurrent: () => Promise<OfficialProgressionQueryResult>;
  loadHistory: (
    from: number,
    to: number,
  ) => Promise<OfficialProgressionQueryResult>;
  loadCorrectionContext: (
    eventIds: string[],
  ) => Promise<OfficialProgressionQueryResult>;
};

export type OfficialProgressionReadyResult = {
  kind: "ready";
  current: OfficialProgressionCurrent | null;
  events: OfficialProgressionEvent[];
  corrections: OfficialProgressionCorrectionReadModel;
  eventCount: number;
  page: number;
  pageCount: number;
};

export type OfficialProgressionLoadResult =
  | OfficialProgressionReadyResult
  | { kind: "out_of_range"; finalPage: number }
  | { kind: "unavailable" };

export type Student360ApprovedPages = {
  historyPage: number;
  notesPage: number;
  followUpsPage: number;
  progressionPage: number;
};

function hasValidCurrentTimestampOrder(
  current: OfficialProgressionCurrent,
): boolean {
  const createdToStage = comparePostgreSqlTimestamps(
    current.created_at,
    current.stage_started_at,
  );
  const stageToLastChanged = comparePostgreSqlTimestamps(
    current.stage_started_at,
    current.last_changed_at,
  );
  const updatedToLastChanged = comparePostgreSqlTimestamps(
    current.updated_at,
    current.last_changed_at,
  );
  return (
    current.last_changed_by !== current.student_id &&
    createdToStage !== null &&
    createdToStage <= 0 &&
    stageToLastChanged !== null &&
    stageToLastChanged <= 0 &&
    updatedToLastChanged === 0
  );
}

function isValidEventTransition(event: OfficialProgressionEvent): boolean {
  const isInitialization =
    event.previous_stage === null && event.previous_state === null;
  if (isInitialization) return event.new_state === "active";
  if (event.previous_stage === null || event.previous_state === null) {
    return false;
  }
  if (event.previous_state === "completed") return false;

  const stageChanged = event.previous_stage !== event.new_stage;
  const stateChanged = event.previous_state !== event.new_state;
  if (stageChanged === stateChanged) return false;

  if (stageChanged) {
    return (
      event.previous_state === "active" && event.new_state === "active"
    );
  }

  return (
    (event.previous_state === "active" &&
      event.new_state === "on_hold") ||
    (event.previous_state === "on_hold" &&
      event.new_state === "active") ||
    ((event.previous_state === "active" ||
      event.previous_state === "on_hold") &&
      event.new_state === "completed")
  );
}

function isNewestFirst(
  newer: OfficialProgressionEvent,
  older: OfficialProgressionEvent,
): boolean {
  const timestampOrder = comparePostgreSqlTimestamps(
    newer.changed_at,
    older.changed_at,
  );
  return (
    timestampOrder !== null &&
    (timestampOrder > 0 ||
      (timestampOrder === 0 && newer.id > older.id))
  );
}

function hasValidUncorrectedEventPage(
  events: OfficialProgressionEvent[],
  current: OfficialProgressionCurrent,
  eventCount: number,
  offset: number,
): boolean {
  const ids = new Set(events.map((event) => event.id));
  if (ids.size !== events.length) return false;

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const globalIndex = offset + index;
    if (
      event.student_id !== current.student_id ||
      event.changed_by === event.student_id ||
      !isValidEventTransition(event)
    ) {
      return false;
    }

    const initialization = event.previous_stage === null;
    if (initialization !== (globalIndex === eventCount - 1)) {
      return false;
    }
    if (
      event.new_state === "completed" &&
      (globalIndex !== 0 || current.workflow_state !== "completed")
    ) {
      return false;
    }
    if (
      current.workflow_state !== "completed" &&
      event.new_state === "completed"
    ) {
      return false;
    }

    const older = events[index + 1];
    if (
      older &&
      (!isNewestFirst(event, older) ||
        event.previous_stage !== older.new_stage ||
        event.previous_state !== older.new_state)
    ) {
      return false;
    }
  }

  if (offset === 0) {
    const newest = events[0];
    if (
      !newest ||
      newest.new_stage !== current.current_stage ||
      newest.new_state !== current.workflow_state ||
      comparePostgreSqlTimestamps(
        newest.changed_at,
        current.last_changed_at,
      ) !== 0 ||
      newest.changed_by !== current.last_changed_by
    ) {
      return false;
    }
  }

  return true;
}

function hasValidEventPage(
  events: OfficialProgressionEvent[],
  current: OfficialProgressionCurrent | null,
  trustedStudentId: string,
  eventCount: number,
  offset: number,
  correctionContext: OfficialProgressionCorrectionContextRow[],
): boolean {
  const ids = new Set(events.map((event) => event.id));
  if (ids.size !== events.length) return false;

  const contextByEvent = new Map(
    correctionContext.map((context) => [
      context.target_event_id,
      context,
    ]),
  );
  if (
    contextByEvent.size !== correctionContext.length ||
    contextByEvent.size !== events.length
  ) {
    return false;
  }

  const firstContext = correctionContext[0];
  if (!firstContext) return false;
  const sharedContext = {
    effectiveEventExists: firstContext.effective_event_exists,
    latestEffectiveEventId: firstContext.latest_effective_event_id,
    latestEffectiveStage: firstContext.latest_effective_stage,
    latestEffectiveState: firstContext.latest_effective_state,
    latestEffectiveChangedAt: firstContext.latest_effective_changed_at,
    latestEffectiveChangedBy: firstContext.latest_effective_changed_by,
    totalCorrectionCount: firstContext.total_correction_count,
  };

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    const context = contextByEvent.get(event.id);
    if (
      !context ||
      event.student_id !== trustedStudentId ||
      event.changed_by === event.student_id ||
      !isValidEventTransition(event) ||
      context.effective_event_exists !==
        sharedContext.effectiveEventExists ||
      context.latest_effective_event_id !==
        sharedContext.latestEffectiveEventId ||
      context.latest_effective_stage !==
        sharedContext.latestEffectiveStage ||
      context.latest_effective_state !==
        sharedContext.latestEffectiveState ||
      context.latest_effective_changed_at !==
        sharedContext.latestEffectiveChangedAt ||
      context.latest_effective_changed_by !==
        sharedContext.latestEffectiveChangedBy ||
      context.total_correction_count !==
        sharedContext.totalCorrectionCount
    ) {
      return false;
    }

    if (context.correction_id === null) {
      if (
        context.correction_type !== null ||
        context.restored_stage !== null ||
        context.restored_state !== null ||
        context.restored_stage_started_at !== null ||
        context.correction_reason !== null ||
        context.corrected_at !== null
      ) {
        return false;
      }
    } else if (
      context.correction_type === "reset_initialization"
    ) {
      if (
        event.previous_stage !== null ||
        event.previous_state !== null ||
        event.new_state !== "active" ||
        context.restored_stage !== null ||
        context.restored_state !== null ||
        context.restored_stage_started_at !== null ||
        context.correction_reason === null ||
        context.corrected_at === null
      ) {
        return false;
      }
    } else if (
      context.correction_type !== "undo_transition" ||
      event.previous_stage === null ||
      event.previous_state === null ||
      context.restored_stage !== event.previous_stage ||
      context.restored_state !== event.previous_state ||
      context.restored_stage_started_at === null ||
      context.correction_reason === null ||
      context.corrected_at === null
    ) {
      return false;
    }

    const older = events[index + 1];
    // An undone transition no longer defines the state that followed it: the
    // next event starts from the restored state instead, so the adjacent-chain
    // check applies only when the older event has not been corrected.
    const olderWasCorrected =
      older !== undefined &&
      (contextByEvent.get(older.id)?.correction_id ?? null) !== null;
    if (
      older &&
      (!isNewestFirst(event, older) ||
        (!olderWasCorrected &&
          event.previous_stage !== null &&
          (event.previous_stage !== older.new_stage ||
            event.previous_state !== older.new_state)))
    ) {
      return false;
    }
  }

  if (sharedContext.totalCorrectionCount === 0) {
    for (let index = 0; index < events.length; index += 1) {
      const event = events[index];
      const globalIndex = offset + index;
      const initialization = event.previous_stage === null;
      if (initialization !== (globalIndex === eventCount - 1)) {
        return false;
      }
      if (
        event.new_state === "completed" &&
        (globalIndex !== 0 || current?.workflow_state !== "completed")
      ) {
        return false;
      }
      if (
        current?.workflow_state !== "completed" &&
        event.new_state === "completed"
      ) {
        return false;
      }
    }
  }

  if (!sharedContext.effectiveEventExists) {
    return (
      current === null &&
      sharedContext.latestEffectiveEventId === null &&
      sharedContext.latestEffectiveStage === null &&
      sharedContext.latestEffectiveState === null &&
      sharedContext.latestEffectiveChangedAt === null &&
      sharedContext.latestEffectiveChangedBy === null &&
      sharedContext.totalCorrectionCount > 0
    );
  }

  if (
    current === null ||
    sharedContext.latestEffectiveEventId === null ||
    sharedContext.latestEffectiveStage === null ||
    sharedContext.latestEffectiveState === null ||
    sharedContext.latestEffectiveChangedAt === null ||
    sharedContext.latestEffectiveChangedBy === null ||
    current.current_stage !== sharedContext.latestEffectiveStage ||
    current.workflow_state !== sharedContext.latestEffectiveState
  ) {
    return false;
  }

  if (offset === 0 && sharedContext.totalCorrectionCount === 0) {
    const newest = events[0];
    if (
      !newest ||
      newest.new_stage !== current.current_stage ||
      newest.new_state !== current.workflow_state ||
      comparePostgreSqlTimestamps(
        newest.changed_at,
        current.last_changed_at,
      ) !== 0 ||
      newest.changed_by !== current.last_changed_by
    ) {
      return false;
    }
  }

  return true;
}

function buildCorrectionReadModel(
  rows: OfficialProgressionCorrectionContextRow[],
): OfficialProgressionCorrectionReadModel | null {
  const first = rows[0];
  if (!first) return null;

  const correctionByEvent: Partial<
    Record<string, OfficialProgressionCorrectionAudit>
  > = {};
  for (const row of rows) {
    if (row.correction_id === null) continue;
    if (
      row.correction_type === null ||
      row.correction_reason === null ||
      row.corrected_at === null
    ) {
      return null;
    }
    correctionByEvent[row.target_event_id] = {
      correctionType: row.correction_type,
      correctionReason: row.correction_reason,
      correctedAt: row.corrected_at,
    };
  }

  return {
    kind: "ready",
    correctionByEvent,
    latestEffectiveEventId: first.latest_effective_event_id,
  };
}

export function normalizeOfficialProgressionReason(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function getOfficialProgressionReasonLength(
  value: string,
): number {
  return Array.from(value).length;
}

export function parseOfficialProgressionPage(
  value: string | string[] | undefined,
): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page <= OFFICIAL_PROGRESSION_MAX_PAGE
    ? page
    : 1;
}

export function isOfficialProgressionPageCanonical(
  value: string | string[] | undefined,
  parsedPage: number,
): boolean {
  return (
    value === undefined ||
    (typeof value === "string" &&
      String(parsedPage) === value &&
      parseOfficialProgressionPage(value) === parsedPage)
  );
}

export function parseOfficialProgressionCurrent(
  value: unknown,
  trustedStudentId: string,
): OfficialProgressionCurrent | null {
  const parsed = currentProgressionSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.student_id !== trustedStudentId ||
    !hasValidCurrentTimestampOrder(parsed.data)
  ) {
    return null;
  }
  return parsed.data;
}

export function getOfficialProgressionPercentage(
  stage: CounselingProgressionStage | null,
  state: CounselingProgressionState | null,
): number {
  if (stage === null || state === null) return 0;
  if (state === "completed") return 100;
  return COUNSELING_PROGRESSION_STAGE_PERCENTAGES[stage];
}

export function buildOfficialProgressionUrl(
  studentId: string,
  pages: Student360ApprovedPages,
): string {
  const query = new URLSearchParams();
  if (pages.historyPage > 1) {
    query.set("historyPage", String(pages.historyPage));
  }
  if (pages.notesPage > 1) {
    query.set("notesPage", String(pages.notesPage));
  }
  if (pages.followUpsPage > 1) {
    query.set("followUpsPage", String(pages.followUpsPage));
  }
  if (pages.progressionPage > 1) {
    query.set("progressionPage", String(pages.progressionPage));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `/counselor/students/${studentId}/advisory${suffix}#official-progression`;
}

export async function fetchCounselorStudentProgression(
  trustedStudentId: string,
  progressionPage: number,
  source: OfficialProgressionDataSource,
): Promise<OfficialProgressionLoadResult> {
  if (
    !z.uuid().safeParse(trustedStudentId).success ||
    !Number.isSafeInteger(progressionPage) ||
    progressionPage < 1 ||
    progressionPage > OFFICIAL_PROGRESSION_MAX_PAGE
  ) {
    return { kind: "unavailable" };
  }

  const offset = (progressionPage - 1) * OFFICIAL_PROGRESSION_PAGE_SIZE;
  let currentResult: OfficialProgressionQueryResult;
  let historyResult: OfficialProgressionQueryResult;
  try {
    [currentResult, historyResult] = await Promise.all([
      source.loadCurrent(),
      source.loadHistory(
        offset,
        offset + OFFICIAL_PROGRESSION_PAGE_SIZE - 1,
      ),
    ]);
  } catch {
    return { kind: "unavailable" };
  }

  if (currentResult.error || historyResult.error) {
    return { kind: "unavailable" };
  }

  const countResult = z
    .number()
    .int()
    .nonnegative()
    .max(
      OFFICIAL_PROGRESSION_MAX_PAGE *
        OFFICIAL_PROGRESSION_PAGE_SIZE,
    )
    .safeParse(historyResult.count);
  const rowsResult = z
    .array(progressionEventSchema)
    .max(OFFICIAL_PROGRESSION_PAGE_SIZE)
    .safeParse(historyResult.data);
  if (!countResult.success || !rowsResult.success) {
    return { kind: "unavailable" };
  }
  const eventCount = countResult.data;
  const pageCount = Math.max(
    1,
    Math.ceil(eventCount / OFFICIAL_PROGRESSION_PAGE_SIZE),
  );

  if (eventCount === 0) {
    if (currentResult.data !== null || rowsResult.data.length !== 0) {
      return { kind: "unavailable" };
    }
    if (progressionPage > 1) {
      return { kind: "out_of_range", finalPage: 1 };
    }
    return {
      kind: "ready",
      current: null,
      events: [],
      corrections: {
        kind: "ready",
        correctionByEvent: {},
        latestEffectiveEventId: null,
      },
      eventCount: 0,
      page: 1,
      pageCount: 1,
    };
  }

  if (progressionPage > pageCount) {
    return { kind: "out_of_range", finalPage: pageCount };
  }

  const expectedRows = Math.min(
    OFFICIAL_PROGRESSION_PAGE_SIZE,
    eventCount - offset,
  );
  if (rowsResult.data.length !== expectedRows) {
    return { kind: "unavailable" };
  }

  const eventIds = rowsResult.data.map((event) => event.id);
  const current =
    currentResult.data === null
      ? null
      : parseOfficialProgressionCurrent(
          currentResult.data,
          trustedStudentId,
        );
  if (currentResult.data !== null && current === null) {
    return { kind: "unavailable" };
  }

  let correctionResult: OfficialProgressionQueryResult;
  try {
    correctionResult = await source.loadCorrectionContext(eventIds);
  } catch {
    correctionResult = { data: null, error: true };
  }
  if (correctionResult.error) {
    if (
      current === null ||
      !hasValidUncorrectedEventPage(
        rowsResult.data,
        current,
        eventCount,
        offset,
      )
    ) {
      return { kind: "unavailable" };
    }

    return {
      kind: "ready",
      current,
      events: rowsResult.data,
      corrections: { kind: "unavailable" },
      eventCount,
      page: progressionPage,
      pageCount,
    };
  }

  const correctionRows = z
    .array(progressionCorrectionContextRowSchema)
    .length(eventIds.length)
    .safeParse(correctionResult.data);
  if (!correctionRows.success) return { kind: "unavailable" };

  if (
    !hasValidEventPage(
      rowsResult.data,
      current,
      trustedStudentId,
      eventCount,
      offset,
      correctionRows.data,
    )
  ) {
    return { kind: "unavailable" };
  }
  const corrections = buildCorrectionReadModel(correctionRows.data);
  if (!corrections) return { kind: "unavailable" };

  return {
    kind: "ready",
    current,
    events: rowsResult.data,
    corrections,
    eventCount,
    page: progressionPage,
    pageCount,
  };
}
