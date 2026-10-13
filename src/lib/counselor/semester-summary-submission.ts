import { z } from "zod";
import {
  COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS,
  normalizeSemesterSummaryText,
  type CounselorSemesterSummaryActionState,
} from "@/lib/counselor/semester-summary";

export type CounselorSemesterSummaryInput = {
  studentId: string;
  academicPeriod: string;
  progressSummary: string;
  achievementsHighlights: string | null;
  areasRequiringAttention: string | null;
  nextSemesterActions: string;
};

type CounselorSemesterSummaryStore = {
  verifyTarget: (
    studentId: string,
  ) => Promise<{ valid: boolean; error: unknown }>;
  save: (
    input: CounselorSemesterSummaryInput,
  ) => Promise<{ data: unknown; error: unknown }>;
};

const allowedFields = new Set([
  "studentId",
  "academicPeriod",
  "progressSummary",
  "achievementsHighlights",
  "areasRequiringAttention",
  "nextSemesterActions",
]);

function addError(
  errors: Record<string, string[]>,
  field: string,
  message: string,
) {
  if (!errors[field]) errors[field] = [message];
}

function exactlyOneString(
  formData: FormData,
  field: string,
  errors: Record<string, string[]>,
): string | null {
  const values = formData.getAll(field);
  if (values.length !== 1 || typeof values[0] !== "string") {
    addError(errors, field, "Submit exactly one value for this field.");
    return null;
  }
  return values[0];
}

function parseRequiredText(
  value: string | null,
  maximumLength: number,
  field: string,
  errors: Record<string, string[]>,
): string | null {
  if (value === null) return null;
  const normalized = normalizeSemesterSummaryText(value);
  if (normalized.length < 1 || normalized.length > maximumLength) {
    addError(
      errors,
      field,
      `Enter between 1 and ${maximumLength} characters.`,
    );
    return null;
  }
  return normalized;
}

function parseOptionalText(
  value: string | null,
  maximumLength: number,
  field: string,
  errors: Record<string, string[]>,
): string | null {
  if (value === null) return null;
  const normalized = normalizeSemesterSummaryText(value);
  if (!normalized) return null;
  if (normalized.length > maximumLength) {
    addError(errors, field, `Enter no more than ${maximumLength} characters.`);
    return null;
  }
  return normalized;
}

export function validateCounselorSemesterSummaryFormData(
  formData: FormData,
):
  | { success: true; data: CounselorSemesterSummaryInput }
  | { success: false; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  for (const field of new Set(formData.keys())) {
    if (!allowedFields.has(field) && !field.startsWith("$ACTION_")) {
      addError(errors, "_form", "The form contains an unsupported field.");
    }
  }

  const studentIdValue = exactlyOneString(formData, "studentId", errors);
  const studentId = z.uuid().safeParse(studentIdValue);
  if (!studentId.success) {
    addError(errors, "studentId", "Choose a valid Student.");
  }

  const academicPeriod = parseRequiredText(
    exactlyOneString(formData, "academicPeriod", errors),
    COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.academicPeriod,
    "academicPeriod",
    errors,
  );
  const progressSummary = parseRequiredText(
    exactlyOneString(formData, "progressSummary", errors),
    COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.progressSummary,
    "progressSummary",
    errors,
  );
  const achievementsHighlights = parseOptionalText(
    exactlyOneString(formData, "achievementsHighlights", errors),
    COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.achievementsHighlights,
    "achievementsHighlights",
    errors,
  );
  const areasRequiringAttention = parseOptionalText(
    exactlyOneString(formData, "areasRequiringAttention", errors),
    COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.areasRequiringAttention,
    "areasRequiringAttention",
    errors,
  );
  const nextSemesterActions = parseRequiredText(
    exactlyOneString(formData, "nextSemesterActions", errors),
    COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.nextSemesterActions,
    "nextSemesterActions",
    errors,
  );

  if (
    Object.keys(errors).length > 0 ||
    !studentId.success ||
    academicPeriod === null ||
    progressSummary === null ||
    nextSemesterActions === null
  ) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      studentId: studentId.data,
      academicPeriod,
      progressSummary,
      achievementsHighlights,
      areasRequiringAttention,
      nextSemesterActions,
    },
  };
}

export async function submitCounselorSemesterSummary(
  formData: FormData,
  store: CounselorSemesterSummaryStore,
): Promise<CounselorSemesterSummaryActionState> {
  const parsed = validateCounselorSemesterSummaryFormData(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted Semester Summary fields.",
      errors: parsed.errors,
    };
  }

  const target = await store.verifyTarget(parsed.data.studentId);
  if (!target.valid || target.error) {
    return {
      status: "error",
      message: "This Student case is no longer available to your account.",
    };
  }

  const saved = await store.save(parsed.data);
  if (saved.error || !Array.isArray(saved.data) || saved.data.length !== 1) {
    return {
      status: "error",
      message: "We could not save the Semester Summary. Please try again.",
    };
  }

  return {
    status: "success",
    message: "Semester Summary saved as a new audited revision.",
  };
}
