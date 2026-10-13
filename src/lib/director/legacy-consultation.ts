import { z } from "zod";

export const LEGACY_CONSULTATION_REASON_MAX_LENGTH = 300;
export const DEFAULT_LEGACY_CONSULTATION_REASON =
  "Legacy unscheduled consultation request superseded by the Student's active Primary Counselor relationship.";

export type DirectorLegacyWaitingConsultation = {
  consultationId: string;
  requestNumber: string;
  studentFullName: string | null;
  studentCollegeEmail: string;
  submittedAt: string;
};

export type LegacyConsultationClosureActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: { reason?: string };
};

export const initialLegacyConsultationClosureActionState:
  LegacyConsultationClosureActionState = { status: "idle" };

const legacyWaitingConsultationSchema = z.object({
  consultation_id: z.uuid(),
  request_number: z.string().trim().min(1).max(40),
  student_full_name: z.string().trim().min(1).max(150).nullable(),
  student_college_email: z.string().email(),
  submitted_at: z.string().min(1),
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
    .pipe(
      z.string().min(1).max(LEGACY_CONSULTATION_REASON_MAX_LENGTH),
    ),
});

export function parseDirectorLegacyWaitingConsultations(
  value: unknown,
): DirectorLegacyWaitingConsultation[] {
  return z.array(legacyWaitingConsultationSchema).max(25).parse(value).map(
    (row) => ({
      consultationId: row.consultation_id,
      requestNumber: row.request_number,
      studentFullName: row.student_full_name,
      studentCollegeEmail: row.student_college_email,
      submittedAt: row.submitted_at,
    }),
  );
}

type CloseLegacyConsultation = (
  consultationId: string,
  reason: string,
) => Promise<{ data: unknown; error: unknown }>;

export async function submitLegacyConsultationClosure(
  consultationId: string,
  formData: FormData,
  close: CloseLegacyConsultation,
): Promise<LegacyConsultationClosureActionState> {
  const allowedFields = new Set(["reason"]);
  for (const field of new Set(formData.keys())) {
    if (!allowedFields.has(field) && !field.startsWith("$ACTION_")) {
      return {
        status: "error",
        message: "Check the legacy closure reason and try again.",
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
      message: "Enter a valid reason before closing this legacy request.",
      fieldErrors: {
        reason: `Use plain text between 1 and ${LEGACY_CONSULTATION_REASON_MAX_LENGTH} characters.`,
      },
    };
  }

  const result = await close(parsed.data.consultationId, parsed.data.reason);
  if (result.error || result.data === null) {
    return {
      status: "error",
      message:
        "This legacy request could not be closed. Refresh the page and confirm it is still eligible.",
    };
  }

  const response = z.array(closureResultSchema).length(1).safeParse(result.data);
  if (!response.success) {
    return {
      status: "error",
      message:
        "This legacy request could not be closed. Refresh the page and try again.",
    };
  }

  return {
    status: "success",
    message: "Legacy unscheduled consultation request closed.",
  };
}
