import { z } from "zod";
import type {
  StudentAchievementType,
  StudentExamName,
  StudentExamStatus,
} from "@/types";

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]> };

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

const EXAM_FIELDS = [
  "examName",
  "customExamName",
  "examStatus",
  "attemptNumber",
  "plannedDate",
  "completedDate",
  "score",
  "validUntil",
  "remarks",
] as const;

const ACHIEVEMENT_FIELDS = [
  "achievementType",
  "title",
  "organization",
  "achievementDate",
  "description",
] as const;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function optionalText(maximum: number, message: string) {
  return z
    .union([z.string(), z.null()])
    .transform((value) =>
      value === null ? "" : normalizeWhitespace(value),
    )
    .refine((value) => value.length <= maximum, message)
    .transform((value) => (value === "" ? null : value));
}

function requiredText(maximum: number, emptyMessage: string, lengthMessage: string) {
  return z
    .string({ error: emptyMessage })
    .transform(normalizeWhitespace)
    .pipe(z.string().min(1, emptyMessage).max(maximum, lengthMessage));
}

function isStrictDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return day >= 1 && day <= daysInMonth;
}

function optionalDate(message: string) {
  return z
    .union([z.string(), z.null()])
    .transform((value) => (value === null ? "" : value.trim()))
    .refine((value) => value === "" || isStrictDate(value), message)
    .transform((value) => (value === "" ? null : value));
}

function requiredAttemptNumber() {
  return z
    .string({ error: "Enter an attempt number from 1 to 20." })
    .trim()
    .regex(/^\d+$/, "Enter an attempt number from 1 to 20.")
    .transform(Number)
    .refine(
      (value) => Number.isSafeInteger(value) && value >= 1 && value <= 20,
      "Enter an attempt number from 1 to 20.",
    );
}

function toValidationResult<T>(
  result: z.ZodSafeParseResult<T>,
): ValidationResult<T> {
  if (result.success) return { success: true, data: result.data };

  const flattened = z.flattenError(result.error).fieldErrors;
  const errors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(flattened)) {
    const parsedMessages = z.array(z.string()).safeParse(messages);
    if (parsedMessages.success && parsedMessages.data.length > 0) {
      errors[field] = parsedMessages.data;
    }
  }
  return { success: false, errors };
}

function validateFormShape(
  formData: FormData,
  allowedFields: readonly string[],
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const allowed = new Set(allowedFields);

  for (const field of allowedFields) {
    if (formData.getAll(field).length > 1) {
      errors[field] = ["Submit exactly one value for this field."];
    }
  }

  for (const field of new Set(formData.keys())) {
    if (!allowed.has(field) && !field.startsWith("$ACTION_")) {
      errors._form = ["The submitted form contains an unsupported field."];
      break;
    }
  }

  return errors;
}

function hasErrors(errors: Record<string, string[]>): boolean {
  return Object.keys(errors).length > 0;
}

function studentTestScoreSchema(
  businessToday: string,
  operation: "create" | "update",
) {
  return z
    .object({
      recordId:
        operation === "update"
          ? z.uuid("Choose a valid exam attempt.")
          : z.undefined().optional(),
      examName: z.enum(examNames, { error: "Choose an entrance exam." }),
      customExamName: optionalText(
        100,
        "Custom exam name must not exceed 100 characters.",
      ),
      examStatus: z.enum(examStatuses, {
        error: "Choose the current exam status.",
      }),
      attemptNumber: requiredAttemptNumber(),
      plannedDate: optionalDate("Enter a valid planned date."),
      completedDate: optionalDate("Enter a valid completed date."),
      score: optionalText(100, "Score must not exceed 100 characters."),
      validUntil: optionalDate("Enter a valid score-validity date."),
      remarks: optionalText(
        1000,
        "Remarks must not exceed 1,000 characters.",
      ),
    })
    .strict()
    .superRefine((record, context) => {
      if (
        (record.examName === "other") !==
        (record.customExamName !== null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["customExamName"],
          message:
            record.examName === "other"
              ? "Enter the custom exam name."
              : "Custom exam name is available only for Other exam.",
        });
      }

      if (
        (record.examStatus === "completed") !==
        (record.completedDate !== null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["completedDate"],
          message:
            record.examStatus === "completed"
              ? "Enter the completed exam date."
              : "Completed date is available only for a completed exam.",
        });
      }

      if (record.examStatus === "booked" && record.plannedDate === null) {
        context.addIssue({
          code: "custom",
          path: ["plannedDate"],
          message: "Enter the booked exam date.",
        });
      }

      if (
        (record.examStatus === "not_planned" ||
          record.examStatus === "not_required") &&
        (record.plannedDate !== null ||
          record.completedDate !== null ||
          record.score !== null ||
          record.validUntil !== null)
      ) {
        context.addIssue({
          code: "custom",
          path: ["examStatus"],
          message:
            "Clear exam dates, score, and validity for this exam status.",
        });
      }

      if (record.score !== null && record.examStatus !== "completed") {
        context.addIssue({
          code: "custom",
          path: ["score"],
          message: "A score may be added only for a completed exam.",
        });
      }

      if (
        record.score !== null &&
        /^(?:[+-]?infinity|nan)$/i.test(record.score)
      ) {
        context.addIssue({
          code: "custom",
          path: ["score"],
          message: "Enter a valid score or result.",
        });
      }

      if (
        record.completedDate !== null &&
        record.completedDate > businessToday
      ) {
        context.addIssue({
          code: "custom",
          path: ["completedDate"],
          message: "Completed exam date cannot be in the future.",
        });
      }

      if (
        record.plannedDate !== null &&
        record.completedDate !== null &&
        record.completedDate < record.plannedDate
      ) {
        context.addIssue({
          code: "custom",
          path: ["completedDate"],
          message: "Completed date cannot be before the planned date.",
        });
      }

      if (
        record.validUntil !== null &&
        (record.completedDate === null ||
          record.validUntil < record.completedDate)
      ) {
        context.addIssue({
          code: "custom",
          path: ["validUntil"],
          message:
            "Score validity must be on or after the completed exam date.",
        });
      }
    })
    .transform((record) => ({
      ...record,
      customExamName:
        record.customExamName === null
          ? null
          : record.customExamName.toUpperCase(),
    }));
}

function studentAchievementSchema(
  businessToday: string,
  operation: "create" | "update",
) {
  return z
    .object({
      recordId:
        operation === "update"
          ? z.uuid("Choose a valid achievement.")
          : z.undefined().optional(),
      achievementType: z.enum(achievementTypes, {
        error: "Choose an achievement category.",
      }),
      title: requiredText(
        200,
        "Enter an achievement title.",
        "Achievement title must not exceed 200 characters.",
      ),
      organization: optionalText(
        200,
        "Organization must not exceed 200 characters.",
      ),
      achievementDate: optionalDate("Enter a valid achievement date."),
      description: optionalText(
        2000,
        "Description must not exceed 2,000 characters.",
      ),
    })
    .strict()
    .superRefine((record, context) => {
      if (
        record.achievementDate !== null &&
        record.achievementDate < "1950-01-01"
      ) {
        context.addIssue({
          code: "custom",
          path: ["achievementDate"],
          message: "Achievement date must be on or after 1 January 1950.",
        });
      }
      if (
        record.achievementDate !== null &&
        record.achievementDate > businessToday
      ) {
        context.addIssue({
          code: "custom",
          path: ["achievementDate"],
          message: "Achievement date cannot be in the future.",
        });
      }
    });
}

export type StudentTestScoreInput = z.infer<
  ReturnType<typeof studentTestScoreSchema>
>;
export type StudentAchievementInput = z.infer<
  ReturnType<typeof studentAchievementSchema>
>;

export function validateStudentTestScore(
  formData: FormData,
  operation: "create" | "update",
  businessToday: string,
): ValidationResult<StudentTestScoreInput> {
  const allowedFields =
    operation === "update"
      ? ["recordId", ...EXAM_FIELDS]
      : EXAM_FIELDS;
  const shapeErrors = validateFormShape(formData, allowedFields);
  if (hasErrors(shapeErrors)) {
    return { success: false, errors: shapeErrors };
  }

  return toValidationResult(
    studentTestScoreSchema(businessToday, operation).safeParse({
      recordId:
        operation === "update" ? formData.get("recordId") : undefined,
      examName: formData.get("examName"),
      customExamName: formData.get("customExamName"),
      examStatus: formData.get("examStatus"),
      attemptNumber: formData.get("attemptNumber"),
      plannedDate: formData.get("plannedDate"),
      completedDate: formData.get("completedDate"),
      score: formData.get("score"),
      validUntil: formData.get("validUntil"),
      remarks: formData.get("remarks"),
    }),
  );
}

export function validateStudentAchievement(
  formData: FormData,
  operation: "create" | "update",
  businessToday: string,
): ValidationResult<StudentAchievementInput> {
  const allowedFields =
    operation === "update"
      ? ["recordId", ...ACHIEVEMENT_FIELDS]
      : ACHIEVEMENT_FIELDS;
  const shapeErrors = validateFormShape(formData, allowedFields);
  if (hasErrors(shapeErrors)) {
    return { success: false, errors: shapeErrors };
  }

  return toValidationResult(
    studentAchievementSchema(businessToday, operation).safeParse({
      recordId:
        operation === "update" ? formData.get("recordId") : undefined,
      achievementType: formData.get("achievementType"),
      title: formData.get("title"),
      organization: formData.get("organization"),
      achievementDate: formData.get("achievementDate"),
      description: formData.get("description"),
    }),
  );
}

export function validateStudentOptionalRecordDelete(
  formData: FormData,
): ValidationResult<{ recordId: string }> {
  const shapeErrors = validateFormShape(formData, ["recordId"]);
  if (hasErrors(shapeErrors)) {
    return { success: false, errors: shapeErrors };
  }

  return toValidationResult(
    z
      .object({ recordId: z.uuid("Choose a valid record.") })
      .strict()
      .safeParse({ recordId: formData.get("recordId") }),
  );
}
