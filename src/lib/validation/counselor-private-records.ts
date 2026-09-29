import { z } from "zod";
import {
  COUNSELOR_PRIVATE_RECORD_LIMITS,
  counselorPrivateDateSchema,
} from "@/lib/counselor/private-records";

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]> };

const NOTE_FIELDS = ["studentId", "noteText", "consultationId"] as const;
const FOLLOW_UP_FIELDS = [
  "studentId",
  "dueDate",
  "priority",
  "nextAction",
  "details",
  "consultationId",
] as const;
const WORKLOAD_FOLLOW_UP_FIELDS = [
  "studentId",
  "recordId",
  "dueDate",
  "priority",
  "nextAction",
] as const;

function normalizeWhitespace(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function requiredText(
  maximum: number,
  emptyMessage: string,
  lengthMessage: string,
) {
  return z
    .string({ error: emptyMessage })
    .transform(normalizeWhitespace)
    .pipe(z.string().min(1, emptyMessage).max(maximum, lengthMessage));
}

function optionalText(maximum: number, lengthMessage: string) {
  return z
    .union([z.string(), z.null()])
    .transform((value) => (value === null ? "" : normalizeWhitespace(value)))
    .refine((value) => value.length <= maximum, lengthMessage)
    .transform((value) => (value === "" ? null : value));
}

function optionalUuid(message: string) {
  return z
    .union([z.string(), z.null()])
    .transform((value) => (value === null ? "" : value.trim()))
    .pipe(z.union([z.literal(""), z.uuid(message)]))
    .transform((value) => (value === "" ? null : value));
}

function validateFormShape(
  formData: FormData,
  allowedFields: readonly string[],
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  const allowed = new Set(allowedFields);

  for (const field of allowedFields) {
    if (formData.getAll(field).length !== 1) {
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

function toValidationResult<T>(
  shapeErrors: Record<string, string[]>,
  result: z.ZodSafeParseResult<T>,
): ValidationResult<T> {
  if (Object.keys(shapeErrors).length > 0) {
    return { success: false, errors: shapeErrors };
  }
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

const noteSchema = z
  .object({
    studentId: z.uuid("Choose a valid student."),
    recordId: z.uuid("Choose a valid private note.").optional(),
    noteText: requiredText(
      COUNSELOR_PRIVATE_RECORD_LIMITS.noteText,
      "Enter a private counselor note.",
      "Private note must not exceed 5,000 characters.",
    ),
    consultationId: optionalUuid("Choose a valid consultation."),
  })
  .strict();

const followUpSchema = z
  .object({
    studentId: z.uuid("Choose a valid student."),
    recordId: z.uuid("Choose a valid follow-up.").optional(),
    dueDate: counselorPrivateDateSchema.refine(
      (value) => value >= "2000-01-01",
      "Enter a valid due date.",
    ),
    priority: z.enum(["low", "normal", "high"], {
      error: "Choose a follow-up priority.",
    }),
    nextAction: requiredText(
      COUNSELOR_PRIVATE_RECORD_LIMITS.nextAction,
      "Enter the next action.",
      "Next action must not exceed 500 characters.",
    ),
    details: optionalText(
      COUNSELOR_PRIVATE_RECORD_LIMITS.details,
      "Details must not exceed 2,000 characters.",
    ),
    consultationId: optionalUuid("Choose a valid consultation."),
  })
  .strict();

const workloadFollowUpSchema = followUpSchema
  .pick({
    studentId: true,
    recordId: true,
    dueDate: true,
    priority: true,
    nextAction: true,
  })
  .required({ recordId: true });

export type CounselorNoteInput = z.infer<typeof noteSchema>;
export type CounselorFollowUpInput = z.infer<typeof followUpSchema>;
export type CounselorWorkloadFollowUpInput = z.infer<
  typeof workloadFollowUpSchema
>;

export function validateCounselorNote(
  formData: FormData,
  operation: "create" | "update",
): ValidationResult<CounselorNoteInput> {
  const allowedFields =
    operation === "update" ? ["recordId", ...NOTE_FIELDS] : NOTE_FIELDS;
  const shapeErrors = validateFormShape(formData, allowedFields);
  return toValidationResult(
    shapeErrors,
    noteSchema.safeParse({
      studentId: formData.get("studentId"),
      recordId:
        operation === "update" ? formData.get("recordId") : undefined,
      noteText: formData.get("noteText"),
      consultationId: formData.get("consultationId"),
    }),
  );
}

export function validateCounselorNotePin(
  formData: FormData,
): ValidationResult<{
  studentId: string;
  recordId: string;
  isPinned: boolean;
}> {
  const fields = ["studentId", "recordId", "isPinned"] as const;
  const shapeErrors = validateFormShape(formData, fields);
  return toValidationResult(
    shapeErrors,
    z
      .object({
        studentId: z.uuid("Choose a valid student."),
        recordId: z.uuid("Choose a valid private note."),
        isPinned: z
          .enum(["true", "false"], {
            error: "Choose a valid pin state.",
          })
          .transform((value) => value === "true"),
      })
      .strict()
      .safeParse({
        studentId: formData.get("studentId"),
        recordId: formData.get("recordId"),
        isPinned: formData.get("isPinned"),
      }),
  );
}

export function validateCounselorNoteDelete(
  formData: FormData,
): ValidationResult<{
  studentId: string;
  recordId: string;
}> {
  const fields = ["studentId", "recordId", "confirmDelete"] as const;
  const shapeErrors = validateFormShape(formData, fields);
  return toValidationResult(
    shapeErrors,
    z
      .object({
        studentId: z.uuid("Choose a valid student."),
        recordId: z.uuid("Choose a valid private note."),
        confirmDelete: z.literal("delete", {
          error: "Confirm private-note deletion.",
        }),
      })
      .strict()
      .transform(({ studentId, recordId }) => ({ studentId, recordId }))
      .safeParse({
        studentId: formData.get("studentId"),
        recordId: formData.get("recordId"),
        confirmDelete: formData.get("confirmDelete"),
      }),
  );
}

export function validateCounselorFollowUp(
  formData: FormData,
  operation: "create" | "update",
): ValidationResult<CounselorFollowUpInput> {
  const allowedFields =
    operation === "update"
      ? ["recordId", ...FOLLOW_UP_FIELDS]
      : FOLLOW_UP_FIELDS;
  const shapeErrors = validateFormShape(formData, allowedFields);
  return toValidationResult(
    shapeErrors,
    followUpSchema.safeParse({
      studentId: formData.get("studentId"),
      recordId:
        operation === "update" ? formData.get("recordId") : undefined,
      dueDate: formData.get("dueDate"),
      priority: formData.get("priority"),
      nextAction: formData.get("nextAction"),
      details: formData.get("details"),
      consultationId: formData.get("consultationId"),
    }),
  );
}

export function validateCounselorFollowUpStatus(
  formData: FormData,
): ValidationResult<{ studentId: string; recordId: string }> {
  const fields = ["studentId", "recordId"] as const;
  const shapeErrors = validateFormShape(formData, fields);
  return toValidationResult(
    shapeErrors,
    z
      .object({
        studentId: z.uuid("Choose a valid student."),
        recordId: z.uuid("Choose a valid follow-up."),
      })
      .strict()
      .safeParse({
        studentId: formData.get("studentId"),
        recordId: formData.get("recordId"),
      }),
  );
}

export function validateCounselorWorkloadFollowUp(
  formData: FormData,
): ValidationResult<CounselorWorkloadFollowUpInput> {
  const shapeErrors = validateFormShape(
    formData,
    WORKLOAD_FOLLOW_UP_FIELDS,
  );
  return toValidationResult(
    shapeErrors,
    workloadFollowUpSchema.safeParse({
      studentId: formData.get("studentId"),
      recordId: formData.get("recordId"),
      dueDate: formData.get("dueDate"),
      priority: formData.get("priority"),
      nextAction: formData.get("nextAction"),
    }),
  );
}
