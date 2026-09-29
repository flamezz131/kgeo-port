import { z } from "zod";

export const COUNSELOR_SEMESTER_SUMMARY_LIMIT = 20;

export const COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS = {
  academicPeriod: 80,
  progressSummary: 1500,
  achievementsHighlights: 1000,
  areasRequiringAttention: 1000,
  nextSemesterActions: 1000,
} as const;

const normalizedRequiredText = (maximumLength: number) =>
  z
    .string()
    .min(1)
    .max(maximumLength)
    .refine((value) => normalizeSemesterSummaryText(value) === value);

const normalizedOptionalText = (maximumLength: number) =>
  normalizedRequiredText(maximumLength).nullable();

const semesterSummarySchema = z
  .object({
    summary_id: z.uuid(),
    academic_period: normalizedRequiredText(
      COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.academicPeriod,
    ),
    progress_summary: normalizedRequiredText(
      COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.progressSummary,
    ),
    achievements_highlights: normalizedOptionalText(
      COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.achievementsHighlights,
    ),
    areas_requiring_attention: normalizedOptionalText(
      COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.areasRequiringAttention,
    ),
    next_semester_actions: normalizedRequiredText(
      COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.nextSemesterActions,
    ),
    counselor_full_name: normalizedRequiredText(200),
    created_at: z.iso.datetime({ offset: true }),
  })
  .strict();

export type CounselorSemesterSummary = z.infer<
  typeof semesterSummarySchema
>;

export type CounselorSemesterSummaryLoadResult =
  | { kind: "ready"; summaries: CounselorSemesterSummary[] }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export type CounselorSemesterSummaryActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string[]>;
};

export const initialCounselorSemesterSummaryActionState: CounselorSemesterSummaryActionState =
  { status: "idle" };

export function normalizeSemesterSummaryText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function parseCounselorSemesterSummaries(
  value: unknown,
): CounselorSemesterSummary[] | null {
  const parsed = z
    .array(semesterSummarySchema)
    .max(COUNSELOR_SEMESTER_SUMMARY_LIMIT)
    .safeParse(value);
  if (!parsed.success) return null;

  const ids = new Set<string>();
  for (let index = 0; index < parsed.data.length; index += 1) {
    const summary = parsed.data[index];
    if (ids.has(summary.summary_id)) return null;
    ids.add(summary.summary_id);

    const older = parsed.data[index + 1];
    if (
      older &&
      (Date.parse(summary.created_at) < Date.parse(older.created_at) ||
        (summary.created_at === older.created_at &&
          summary.summary_id.localeCompare(older.summary_id) <= 0))
    ) {
      return null;
    }
  }

  return parsed.data;
}

export function formatSemesterSummaryTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
