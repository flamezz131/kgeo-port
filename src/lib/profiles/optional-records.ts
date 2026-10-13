import { z } from "zod";
import type { Database } from "@/types/database";
import type {
  StudentAchievementType,
  StudentExamName,
  StudentExamStatus,
} from "@/types";

export const STUDENT_OPTIONAL_RECORD_PAGE_SIZE = 20;
export const STUDENT_OPTIONAL_RECORD_MAX_PAGE = 100_000;

export const STUDENT_TEST_SCORE_COLUMNS =
  "id, student_id, exam_name, custom_exam_name, exam_status, attempt_number, planned_date, completed_date, score, valid_until, remarks, created_at, updated_at" as const;

export const STUDENT_ACHIEVEMENT_COLUMNS =
  "id, student_id, achievement_type, title, organization, achievement_date, description, created_at, updated_at" as const;

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

const timestampSchema = z.iso.datetime({ offset: true });

const dateOnlySchema = z.string().refine((value) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
});

const canonicalTextSchema = (maximum: number) =>
  z
    .string()
    .min(1)
    .max(maximum)
    .refine((value) => value === value.trim());

const nullableTextSchema = (maximum: number) =>
  canonicalTextSchema(maximum).nullable();

export const studentTestScoreRowSchema = z
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
  .superRefine((record, context) => {
    if (
      (record.exam_name === "other") !==
      (record.custom_exam_name !== null)
    ) {
      context.addIssue({ code: "custom", message: "Invalid custom exam" });
    }
    if (
      (record.exam_status === "completed") !==
      (record.completed_date !== null)
    ) {
      context.addIssue({ code: "custom", message: "Invalid completed exam" });
    }
    if (record.exam_status === "booked" && record.planned_date === null) {
      context.addIssue({ code: "custom", message: "Invalid booked exam" });
    }
    if (
      (record.exam_status === "not_planned" ||
        record.exam_status === "not_required") &&
      (record.planned_date !== null ||
        record.completed_date !== null ||
        record.score !== null ||
        record.valid_until !== null)
    ) {
      context.addIssue({ code: "custom", message: "Invalid inactive exam" });
    }
    if (record.score !== null && record.exam_status !== "completed") {
      context.addIssue({ code: "custom", message: "Invalid exam score" });
    }
    if (
      record.planned_date !== null &&
      record.completed_date !== null &&
      record.completed_date < record.planned_date
    ) {
      context.addIssue({ code: "custom", message: "Invalid exam date order" });
    }
    if (
      record.valid_until !== null &&
      (record.completed_date === null ||
        record.valid_until < record.completed_date)
    ) {
      context.addIssue({ code: "custom", message: "Invalid score validity" });
    }
    if (Date.parse(record.updated_at) < Date.parse(record.created_at)) {
      context.addIssue({ code: "custom", message: "Invalid timestamps" });
    }
  });

export const studentAchievementRowSchema = z
  .object({
    id: z.uuid(),
    student_id: z.uuid(),
    achievement_type: z.enum(achievementTypes),
    title: canonicalTextSchema(200),
    organization: nullableTextSchema(200),
    achievement_date: dateOnlySchema
      .refine((value) => value >= "1950-01-01")
      .nullable(),
    description: nullableTextSchema(2000),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict()
  .superRefine((record, context) => {
    if (Date.parse(record.updated_at) < Date.parse(record.created_at)) {
      context.addIssue({ code: "custom", message: "Invalid timestamps" });
    }
  });

export type StudentTestScoreRecord =
  Database["public"]["Tables"]["student_test_scores"]["Row"];
export type StudentAchievementRecord =
  Database["public"]["Tables"]["student_achievements"]["Row"];

export type StudentOptionalRecordPage<T> =
  | {
      kind: "ready";
      records: T[];
      page: number;
      pageCount: number;
      totalCount: number;
    }
  | { kind: "unavailable" };

type OptionalRecordQueryResult = {
  data: unknown;
  count: unknown;
  error: unknown;
};

export function parseStudentOptionalRecordPage(
  value: string | string[] | undefined,
): number {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) &&
    page <= STUDENT_OPTIONAL_RECORD_MAX_PAGE
    ? page
    : 1;
}

function mapOptionalRecordPage<T extends { id: string; student_id: string }>(
  result: OptionalRecordQueryResult,
  schema: z.ZodType<T>,
  authenticatedStudentId: string,
  page: number,
): StudentOptionalRecordPage<T> {
  if (result.error) return { kind: "unavailable" };
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > STUDENT_OPTIONAL_RECORD_MAX_PAGE
  ) {
    return { kind: "unavailable" };
  }

  const rows = z
    .array(schema)
    .max(STUDENT_OPTIONAL_RECORD_PAGE_SIZE)
    .safeParse(result.data);
  const count = z
    .number()
    .int()
    .min(0)
    .max(
      STUDENT_OPTIONAL_RECORD_PAGE_SIZE *
        STUDENT_OPTIONAL_RECORD_MAX_PAGE,
    )
    .safeParse(result.count);
  if (!rows.success || !count.success) return { kind: "unavailable" };

  const uniqueIds = new Set(rows.data.map((record) => record.id));
  const offset = (page - 1) * STUDENT_OPTIONAL_RECORD_PAGE_SIZE;
  const pageCount = Math.max(
    1,
    Math.ceil(count.data / STUDENT_OPTIONAL_RECORD_PAGE_SIZE),
  );
  const expectedRowCount =
    page > pageCount
      ? 0
      : Math.min(
          STUDENT_OPTIONAL_RECORD_PAGE_SIZE,
          Math.max(0, count.data - offset),
        );
  if (
    rows.data.some(
      (record) => record.student_id !== authenticatedStudentId,
    ) ||
    uniqueIds.size !== rows.data.length ||
    rows.data.length !== expectedRowCount
  ) {
    return { kind: "unavailable" };
  }

  return {
    kind: "ready",
    records: rows.data,
    page,
    pageCount,
    totalCount: count.data,
  };
}

export function mapStudentTestScorePage(
  result: OptionalRecordQueryResult,
  authenticatedStudentId: string,
  page: number,
): StudentOptionalRecordPage<StudentTestScoreRecord> {
  return mapOptionalRecordPage(
    result,
    studentTestScoreRowSchema,
    authenticatedStudentId,
    page,
  );
}

export function mapStudentAchievementPage(
  result: OptionalRecordQueryResult,
  authenticatedStudentId: string,
  page: number,
): StudentOptionalRecordPage<StudentAchievementRecord> {
  return mapOptionalRecordPage(
    result,
    studentAchievementRowSchema,
    authenticatedStudentId,
    page,
  );
}

export function getStudentOptionalRecordRange(page: number): {
  from: number;
  to: number;
} {
  const from = (page - 1) * STUDENT_OPTIONAL_RECORD_PAGE_SIZE;
  return {
    from,
    to: from + STUDENT_OPTIONAL_RECORD_PAGE_SIZE - 1,
  };
}
