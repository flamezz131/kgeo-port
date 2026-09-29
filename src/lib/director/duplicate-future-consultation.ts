import { z } from "zod";

export const DUPLICATE_FUTURE_REASON_MAX_LENGTH = 300;
export const DEFAULT_DUPLICATE_FUTURE_REASON =
  "Duplicate future consultation request closed because the Student already has an active scheduled consultation.";

export type DirectorDuplicateFutureWaitingConsultation = {
  consultationId: string;
  requestNumber: string;
  studentFullName: string | null;
  requestedDate: string;
  requestedSlotStart: string;
  requestedSlotEnd: string;
  scheduledDate: string;
  scheduledSlotStart: string;
  scheduledSlotEnd: string;
  scheduledCounselorFullName: string | null;
};

export type DuplicateFutureClosureActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: { reason?: string };
};

export const initialDuplicateFutureClosureActionState:
  DuplicateFutureClosureActionState = { status: "idle" };

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);
const timeSchema = z.string().regex(/^\d{2}:\d{2}(?::\d{2})?$/u);

const duplicateFutureRowSchema = z.object({
  consultation_id: z.uuid(),
  request_number: z.string().trim().min(1).max(40),
  student_full_name: z.string().trim().min(1).max(150).nullable(),
  requested_date: dateSchema,
  requested_slot_start: timeSchema,
  requested_slot_end: timeSchema,
  scheduled_date: dateSchema,
  scheduled_slot_start: timeSchema,
  scheduled_slot_end: timeSchema,
  scheduled_counselor_full_name: z.string().trim().min(1).max(150).nullable(),
}).strict();

const closureResultSchema = z.object({
  request_number: z.string().trim().min(1).max(40),
  consultation_status: z.literal("cancelled"),
  cancelled_at: z.string().min(1),
}).strict();

const closureInputSchema = z.object({
  consultationId: z.uuid(),
  reason: z
    .string()
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
    .transform((value) => value.trim().replace(/\s+/gu, " "))
    .pipe(z.string().min(1).max(DUPLICATE_FUTURE_REASON_MAX_LENGTH)),
});

export function parseDirectorDuplicateFutureWaitingConsultations(
  value: unknown,
): DirectorDuplicateFutureWaitingConsultation[] {
  return z.array(duplicateFutureRowSchema).max(25).parse(value).map((row) => ({
    consultationId: row.consultation_id,
    requestNumber: row.request_number,
    studentFullName: row.student_full_name,
    requestedDate: row.requested_date,
    requestedSlotStart: row.requested_slot_start,
    requestedSlotEnd: row.requested_slot_end,
    scheduledDate: row.scheduled_date,
    scheduledSlotStart: row.scheduled_slot_start,
    scheduledSlotEnd: row.scheduled_slot_end,
    scheduledCounselorFullName: row.scheduled_counselor_full_name,
  }));
}

type CloseDuplicateFutureConsultation = (
  consultationId: string,
  reason: string,
) => Promise<{ data: unknown; error: unknown }>;

export async function submitDuplicateFutureConsultationClosure(
  consultationId: string,
  formData: FormData,
  close: CloseDuplicateFutureConsultation,
): Promise<DuplicateFutureClosureActionState> {
  const allowedFields = new Set(["reason"]);
  for (const field of new Set(formData.keys())) {
    if (!allowedFields.has(field) && !field.startsWith("$ACTION_")) {
      return {
        status: "error",
        message: "Check the duplicate-request closure reason and try again.",
      };
    }
  }

  const reasonEntries = formData.getAll("reason");
  const reason =
    reasonEntries.length === 1 && typeof reasonEntries[0] === "string"
      ? reasonEntries[0]
      : null;
  const parsed = closureInputSchema.safeParse({ consultationId, reason });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Enter a valid reason before closing this duplicate request.",
      fieldErrors: {
        reason: `Use plain text between 1 and ${DUPLICATE_FUTURE_REASON_MAX_LENGTH} characters.`,
      },
    };
  }

  const result = await close(parsed.data.consultationId, parsed.data.reason);
  if (result.error || result.data === null) {
    return {
      status: "error",
      message:
        "This duplicate request could not be closed. Refresh and confirm both consultations are still eligible.",
    };
  }

  const response = z.array(closureResultSchema).length(1).safeParse(result.data);
  if (!response.success) {
    return {
      status: "error",
      message:
        "This duplicate request could not be closed. Refresh the page and try again.",
    };
  }

  return {
    status: "success",
    message: "Duplicate future consultation request closed.",
  };
}
