import { z } from "zod";

export const DIRECTOR_ASSIGNMENT_REASON_MAX_LENGTH = 300;

export type DirectorAssignmentFieldErrors = Partial<
  Record<"studentId" | "counselorId" | "reason", string>
>;

export type DirectorAssignmentActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: DirectorAssignmentFieldErrors;
};

export const initialDirectorAssignmentActionState: DirectorAssignmentActionState = {
  status: "idle",
};

export type DirectorAssignmentStudent = {
  studentId: string;
  fullName: string | null;
  programme: string | null;
  department: string | null;
  isActive: boolean;
  currentCounselorId: string | null;
  currentCounselorFullName: string | null;
  assignedAt: string | null;
};

export type DirectorAssignmentCounselor = {
  counselorId: string;
  fullName: string;
  username: string;
};

export type DirectorAssignmentHistoryEntry = {
  studentId: string;
  counselorFullName: string;
  assignedAt: string;
  endedAt: string | null;
  reason: string | null;
};

const counselorAccountSchema = z.object({
  user_id: z.uuid(),
  full_name: z.string().trim().min(1).nullable(),
  username: z.string().trim().min(1),
  approval_status: z.enum(["pending", "approved", "rejected"]),
  is_active: z.boolean(),
  created_at: z.string().min(1),
});

const historyEntrySchema = z.object({
  student_id: z.uuid(),
  counselor_full_name: z.string().trim().min(1).nullable(),
  assigned_at: z.string().min(1),
  ended_at: z.string().min(1).nullable(),
  assignment_reason: z.string().min(1).max(DIRECTOR_ASSIGNMENT_REASON_MAX_LENGTH).nullable(),
});

const assignmentInputSchema = z.object({
  studentId: z.uuid(),
  counselorId: z.uuid(),
  reason: z
    .string()
    .refine((value) => !/[\u0000-\u001f\u007f]/u.test(value))
    .transform((value) => value.trim().replace(/ +/gu, " "))
    .pipe(z.string().min(1).max(DIRECTOR_ASSIGNMENT_REASON_MAX_LENGTH)),
});

export type DirectorAssignmentInput = z.infer<typeof assignmentInputSchema>;

export type DirectorAssignmentFormValidation =
  | { success: true; data: DirectorAssignmentInput }
  | {
      success: false;
      message: string;
      fieldErrors: DirectorAssignmentFieldErrors;
    };

function getSingleStringField(formData: FormData, field: string): string | null {
  const entries = formData.getAll(field);
  return entries.length === 1 && typeof entries[0] === "string"
    ? entries[0]
    : null;
}

function assignmentFieldErrors(values: {
  studentId: string | null;
  counselorId: string | null;
  reason: string | null;
}): DirectorAssignmentFieldErrors {
  const fieldErrors: DirectorAssignmentFieldErrors = {};

  if (!z.uuid().safeParse(values.studentId).success) {
    fieldErrors.studentId = "Select a valid Student.";
  }
  if (!z.uuid().safeParse(values.counselorId).success) {
    fieldErrors.counselorId = "Select an approved and active Counselor.";
  }
  if (typeof values.reason !== "string" || values.reason.trim().length === 0) {
    fieldErrors.reason = "Enter a short assignment reason.";
  } else if (/[\u0000-\u001f\u007f]/u.test(values.reason)) {
    fieldErrors.reason = "Use plain text without control characters.";
  } else if (
    values.reason.trim().replace(/ +/gu, " ").length >
    DIRECTOR_ASSIGNMENT_REASON_MAX_LENGTH
  ) {
    fieldErrors.reason = `Keep the reason to ${DIRECTOR_ASSIGNMENT_REASON_MAX_LENGTH} characters or fewer.`;
  }

  return fieldErrors;
}

export function parseEligibleDirectorAssignmentCounselors(
  value: unknown,
): DirectorAssignmentCounselor[] {
  const rows = z.array(counselorAccountSchema).parse(value);
  return rows
    .filter(
      (row) => row.approval_status === "approved" && row.is_active,
    )
    .map((row) => ({
      counselorId: row.user_id,
      fullName: row.full_name ?? "Name unavailable",
      username: row.username,
    }))
    .sort((left, right) =>
      left.fullName.localeCompare(right.fullName, "en", {
        sensitivity: "base",
      }),
    );
}

export function parseDirectorAssignmentHistory(
  value: unknown,
): DirectorAssignmentHistoryEntry[] {
  return z.array(historyEntrySchema).parse(value).map((row) => ({
    studentId: row.student_id,
    counselorFullName: row.counselor_full_name ?? "Name unavailable",
    assignedAt: row.assigned_at,
    endedAt: row.ended_at,
    reason: row.assignment_reason,
  }));
}

export function parseDirectorAssignmentFormData(
  formData: FormData,
): DirectorAssignmentInput | null {
  const validation = validateDirectorAssignmentFormData(formData);
  return validation.success ? validation.data : null;
}

export function validateDirectorAssignmentFormData(
  formData: FormData,
): DirectorAssignmentFormValidation {
  const allowedFields = new Set(["studentId", "counselorId", "reason"]);
  for (const field of new Set(formData.keys())) {
    if (!allowedFields.has(field) && !field.startsWith("$ACTION_")) {
      return {
        success: false,
        message: "Check the Student, Counselor, and assignment reason.",
        fieldErrors: {},
      };
    }
  }

  const values = {
    studentId: getSingleStringField(formData, "studentId"),
    counselorId: getSingleStringField(formData, "counselorId"),
    reason: getSingleStringField(formData, "reason"),
  };
  const parsed = assignmentInputSchema.safeParse(values);
  if (parsed.success) {
    return { success: true, data: parsed.data };
  }

  return {
    success: false,
    message: "Check the highlighted assignment fields.",
    fieldErrors: assignmentFieldErrors(values),
  };
}
