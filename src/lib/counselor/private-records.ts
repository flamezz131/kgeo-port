import { z } from "zod";
import type {
  CounselorFollowUpPriority,
  CounselorFollowUpStatus,
  ConsultationStatus,
} from "@/types";
import type { CounselorConsultationReferenceMap } from "@/lib/consultations/counselor-references";

export const COUNSELOR_PRIVATE_RECORD_PAGE_SIZE = 20;
export const COUNSELOR_PRIVATE_RECORD_MAX_PAGE = 100_000;
export const COUNSELOR_PRIVATE_CONSULTATION_LIMIT = 40;

export const COUNSELOR_PRIVATE_RECORD_LIMITS = {
  noteText: 5000,
  nextAction: 500,
  details: 2000,
} as const;

export const COUNSELOR_PRIVATE_RECORD_LABELS = {
  notes: "Private Counselor Notes",
  followUps: "Follow-ups",
  internalNotice: "Internal — not visible to student",
  noNotes: "No private counselor notes have been added.",
  noFollowUps: "No follow-ups have been added.",
  notesUnavailable: "Counselor notes are temporarily unavailable.",
  followUpsUnavailable: "Follow-up information is temporarily unavailable.",
} as const;

export const COUNSELOR_PRIVATE_RECORD_MESSAGES = {
  noteCreated: "Private note added.",
  noteUpdated: "Private note updated.",
  noteDeleted: "Private note deleted.",
  notePinned: "Private note pinned.",
  noteUnpinned: "Private note unpinned.",
  followUpCreated: "Follow-up added.",
  followUpUpdated: "Follow-up updated.",
  followUpCompleted: "Follow-up marked completed.",
  followUpCancelled: "Follow-up cancelled.",
  noteSaveFailed: "We could not save the private note. Please try again.",
  noteDeleteFailed: "We could not delete the private note. Please try again.",
  followUpSaveFailed: "We could not save the follow-up. Please try again.",
  followUpStatusFailed:
    "We could not change the follow-up status. Please try again.",
  missingRecord:
    "This counselor record could not be changed. It may no longer be available.",
  changedConcurrently:
    "This counselor record changed. Refresh the page and try again.",
  forbidden: "This counselor record could not be changed with your account.",
} as const;

export const COUNSELOR_FOLLOW_UP_PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
] as const satisfies ReadonlyArray<{
  value: CounselorFollowUpPriority;
  label: string;
}>;

const followUpPriorityLabels: Record<CounselorFollowUpPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

const followUpStatusLabels: Record<CounselorFollowUpStatus, string> = {
  pending: "Pending",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type CounselorFollowUpLifecycle =
  | "due_today"
  | "overdue"
  | "upcoming"
  | "completed"
  | "cancelled";

const followUpLifecycleLabels: Record<CounselorFollowUpLifecycle, string> = {
  due_today: "Due today",
  overdue: "Overdue",
  upcoming: "Upcoming",
  completed: "Completed",
  cancelled: "Cancelled",
};

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

export const counselorPrivateDateSchema = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    year >= 2000 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
});

const databaseTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::00(?:\.0+)?)?$/);

function isNormalizedText(value: string): boolean {
  return value === value.trim().replace(/\s+/g, " ");
}

const noteRowSchema = z
  .object({
    id: z.uuid(),
    student_id: z.uuid(),
    counselor_id: z.uuid(),
    consultation_id: z.uuid().nullable(),
    note_text: z
      .string()
      .min(1)
      .max(COUNSELOR_PRIVATE_RECORD_LIMITS.noteText)
      .refine(isNormalizedText),
    is_pinned: z.boolean(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict()
  .superRefine((note, context) => {
    if (Date.parse(note.updated_at) < Date.parse(note.created_at)) {
      context.addIssue({ code: "custom", message: "Invalid note timestamps" });
    }
  });

const followUpRowSchema = z
  .object({
    id: z.uuid(),
    student_id: z.uuid(),
    counselor_id: z.uuid(),
    consultation_id: z.uuid().nullable(),
    due_date: counselorPrivateDateSchema,
    priority: z.enum(["low", "normal", "high"]),
    status: z.enum(["pending", "completed", "cancelled"]),
    next_action: z
      .string()
      .min(1)
      .max(COUNSELOR_PRIVATE_RECORD_LIMITS.nextAction)
      .refine(isNormalizedText),
    details: z
      .string()
      .min(1)
      .max(COUNSELOR_PRIVATE_RECORD_LIMITS.details)
      .refine(isNormalizedText)
      .nullable(),
    completed_at: timestampSchema.nullable(),
    completed_by: z.uuid().nullable(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict()
  .superRefine((followUp, context) => {
    const completed =
      followUp.status === "completed" &&
      followUp.completed_at !== null &&
      followUp.completed_by === followUp.counselor_id;
    const openOrCancelled =
      followUp.status !== "completed" &&
      followUp.completed_at === null &&
      followUp.completed_by === null;
    if (!completed && !openOrCancelled) {
      context.addIssue({ code: "custom", message: "Invalid completion audit" });
    }
    if (
      Date.parse(followUp.updated_at) < Date.parse(followUp.created_at) ||
      (followUp.completed_at !== null &&
        (Date.parse(followUp.completed_at) <
          Date.parse(followUp.created_at) ||
          Date.parse(followUp.completed_at) >
            Date.parse(followUp.updated_at)))
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid follow-up timestamps",
      });
    }
  });

const consultationStatuses = [
  "submitted",
  "waiting_for_assignment",
  "counselor_assigned",
  "scheduled",
  "completed",
  "no_show",
  "cancelled",
] as const satisfies readonly ConsultationStatus[];

const consultationChoiceRowSchema = z
  .object({
    id: z.uuid(),
    student_id: z.uuid(),
    status: z.enum(consultationStatuses),
    consultation_date: counselorPrivateDateSchema.nullable(),
    slot_start: databaseTimeSchema.nullable(),
    slot_end: databaseTimeSchema.nullable(),
    submitted_at: timestampSchema,
  })
  .strict()
  .superRefine((consultation, context) => {
    const values = [
      consultation.consultation_date,
      consultation.slot_start,
      consultation.slot_end,
    ];
    if (
      !values.every((value) => value === null) &&
      !values.every((value) => value !== null)
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid consultation schedule",
      });
    }
  });

export type CounselorStudentNoteBase = z.infer<typeof noteRowSchema>;
export type CounselorFollowUpBase = z.infer<typeof followUpRowSchema>;
export type CounselorPrivateConsultationChoiceBase = z.infer<
  typeof consultationChoiceRowSchema
>;

export type CounselorStudentNote = CounselorStudentNoteBase & {
  consultation_reference: string | null;
};

export type CounselorFollowUp = CounselorFollowUpBase & {
  consultation_reference: string | null;
};

export type CounselorPrivateConsultationChoice =
  CounselorPrivateConsultationChoiceBase & {
    request_number: string;
  };

export type CounselorPrivateQueryResult = {
  data: unknown;
  error: unknown;
  count?: number | null;
};

export type CounselorPrivateRecordPage<T> =
  | {
      kind: "ready";
      records: T[];
      count: number;
      page: number;
      pageCount: number;
    }
  | { kind: "out_of_range" }
  | { kind: "unavailable" };

export type CounselorPrivateRecordsRaw = {
  notes: CounselorPrivateRecordPage<CounselorStudentNoteBase>;
  followUps: CounselorPrivateRecordPage<CounselorFollowUpBase>;
  consultationChoices: CounselorPrivateConsultationChoiceBase[] | null;
};

export type CounselorPrivateRecords = {
  notes: CounselorPrivateRecordPage<CounselorStudentNote>;
  followUps: CounselorPrivateRecordPage<CounselorFollowUp>;
  consultationChoices: CounselorPrivateConsultationChoice[] | null;
  businessToday: string;
};

export const COUNSELOR_STUDENT_NOTE_COLUMNS =
  "id, student_id, counselor_id, consultation_id, note_text, is_pinned, created_at, updated_at" as const;

export const COUNSELOR_FOLLOW_UP_COLUMNS =
  "id, student_id, counselor_id, consultation_id, due_date, priority, status, next_action, details, completed_at, completed_by, created_at, updated_at" as const;

export const COUNSELOR_PRIVATE_CONSULTATION_COLUMNS =
  "id, student_id, status, consultation_date, slot_start, slot_end, submitted_at" as const;

export function parseCounselorPrivatePage(
  value: string | string[] | undefined,
): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) &&
    page <= COUNSELOR_PRIVATE_RECORD_MAX_PAGE
    ? page
    : 1;
}

function parseOwnedPage<T extends { id: string; student_id: string; counselor_id: string }>(
  schema: z.ZodType<T>,
  result: CounselorPrivateQueryResult,
  studentId: string,
  counselorId: string,
  page: number,
): CounselorPrivateRecordPage<T> {
  if (result.error) return { kind: "unavailable" };
  const rows = z
    .array(schema)
    .max(COUNSELOR_PRIVATE_RECORD_PAGE_SIZE)
    .safeParse(result.data);
  const count = z.number().int().min(0).safeParse(result.count);
  if (
    !rows.success ||
    !count.success ||
    rows.data.some(
      (row) =>
        row.student_id !== studentId || row.counselor_id !== counselorId,
    ) ||
    new Set(rows.data.map((row) => row.id)).size !== rows.data.length ||
    count.data < rows.data.length
  ) {
    return { kind: "unavailable" };
  }

  const pageCount = Math.max(
    1,
    Math.ceil(count.data / COUNSELOR_PRIVATE_RECORD_PAGE_SIZE),
  );
  if (page > pageCount) return { kind: "out_of_range" };
  const expectedRows = Math.min(
    COUNSELOR_PRIVATE_RECORD_PAGE_SIZE,
    Math.max(
      0,
      count.data - (page - 1) * COUNSELOR_PRIVATE_RECORD_PAGE_SIZE,
    ),
  );
  if (rows.data.length !== expectedRows) return { kind: "unavailable" };

  return {
    kind: "ready",
    records: rows.data,
    count: count.data,
    page,
    pageCount,
  };
}

export function parseCounselorPrivateRecords(
  results: {
    notes: CounselorPrivateQueryResult;
    followUps: CounselorPrivateQueryResult;
    consultationChoices: CounselorPrivateQueryResult;
  },
  studentId: string,
  counselorId: string,
  notePage: number,
  followUpPage: number,
): CounselorPrivateRecordsRaw {
  const notes = parseOwnedPage(
    noteRowSchema,
    results.notes,
    studentId,
    counselorId,
    notePage,
  );
  const followUps = parseOwnedPage(
    followUpRowSchema,
    results.followUps,
    studentId,
    counselorId,
    followUpPage,
  );
  const choices = z
    .array(consultationChoiceRowSchema)
    .max(COUNSELOR_PRIVATE_CONSULTATION_LIMIT)
    .safeParse(results.consultationChoices.data);
  const consultationChoices =
    results.consultationChoices.error ||
    !choices.success ||
    choices.data.some((row) => row.student_id !== studentId) ||
    new Set(choices.success ? choices.data.map((row) => row.id) : []).size !==
      (choices.success ? choices.data.length : 0)
      ? null
      : choices.data;

  return { notes, followUps, consultationChoices };
}

function collectLinkedIds<T extends { consultation_id: string | null }>(
  page: CounselorPrivateRecordPage<T>,
): string[] {
  return page.kind === "ready"
    ? page.records.flatMap((record) =>
        record.consultation_id ? [record.consultation_id] : [],
      )
    : [];
}

export function getCounselorPrivateConsultationIds(
  records: CounselorPrivateRecordsRaw,
): string[] {
  return [
    ...collectLinkedIds(records.notes),
    ...collectLinkedIds(records.followUps),
    ...(records.consultationChoices?.map((choice) => choice.id) ?? []),
  ];
}

function attachPageReferences<
  T extends { consultation_id: string | null },
>(
  page: CounselorPrivateRecordPage<T>,
  references: CounselorConsultationReferenceMap,
): CounselorPrivateRecordPage<T & { consultation_reference: string | null }> {
  if (page.kind !== "ready") return page;
  const records = page.records.map((record) => ({
    ...record,
    consultation_reference: record.consultation_id
      ? references.get(record.consultation_id) ?? null
      : null,
  }));
  if (
    records.some(
      (record) =>
        record.consultation_id !== null &&
        record.consultation_reference === null,
    )
  ) {
    return { kind: "unavailable" };
  }
  return { ...page, records };
}

export function attachCounselorPrivateReferences(
  records: CounselorPrivateRecordsRaw,
  references: CounselorConsultationReferenceMap,
  businessToday: string,
): CounselorPrivateRecords {
  let consultationChoices: CounselorPrivateConsultationChoice[] | null = null;
  if (records.consultationChoices !== null) {
    const linkedChoices: CounselorPrivateConsultationChoice[] = [];
    for (const choice of records.consultationChoices) {
      const requestNumber = references.get(choice.id);
      if (!requestNumber) {
        linkedChoices.length = 0;
        break;
      }
      linkedChoices.push({ ...choice, request_number: requestNumber });
    }
    if (linkedChoices.length === records.consultationChoices.length) {
      consultationChoices = linkedChoices;
    }
  }

  return {
    notes: attachPageReferences(records.notes, references),
    followUps: attachPageReferences(records.followUps, references),
    consultationChoices,
    businessToday,
  };
}

export function getCounselorFollowUpPriorityLabel(
  priority: CounselorFollowUpPriority,
): string {
  return followUpPriorityLabels[priority];
}

export function getCounselorFollowUpStatusLabel(
  status: CounselorFollowUpStatus,
): string {
  return followUpStatusLabels[status];
}

export function getCounselorFollowUpLifecycle(
  followUp: Pick<CounselorFollowUpBase, "status" | "due_date">,
  businessToday: string,
): CounselorFollowUpLifecycle {
  if (followUp.status === "completed") return "completed";
  if (followUp.status === "cancelled") return "cancelled";
  if (followUp.due_date < businessToday) return "overdue";
  if (followUp.due_date === businessToday) return "due_today";
  return "upcoming";
}

export function getCounselorFollowUpLifecycleLabel(
  lifecycle: CounselorFollowUpLifecycle,
): string {
  return followUpLifecycleLabels[lifecycle];
}

export function formatCounselorPrivateDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatCounselorPrivateTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
