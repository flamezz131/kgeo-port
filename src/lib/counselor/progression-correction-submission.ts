import { z } from "zod";
import {
  COUNSELING_PROGRESSION_STAGES,
  COUNSELING_PROGRESSION_STATES,
  OFFICIAL_PROGRESSION_REASON_MAX_LENGTH,
  getOfficialProgressionReasonLength,
  isValidOfficialProgressionTimestamp,
  normalizeOfficialProgressionReason,
  type OfficialProgressionQueryResult,
} from "@/lib/counselor/progression";
import type {
  CounselingProgressionCorrectionType,
  CounselingProgressionStage,
  CounselingProgressionState,
} from "@/types";

export type ProgressionCorrectionActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string[]>;
  correctionType?: CounselingProgressionCorrectionType;
};

export const initialProgressionCorrectionActionState: ProgressionCorrectionActionState =
  { status: "idle" };

type ProgressionCorrectionInput = {
  studentId: string;
  eventId: string;
  correctionReason: string;
};

type ProgressionCorrectionStore = {
  verifyTarget: (
    studentId: string,
    eventId: string,
  ) => Promise<{ valid: boolean; error: unknown }>;
  correct: (
    studentId: string,
    eventId: string,
    correctionReason: string,
  ) => Promise<OfficialProgressionQueryResult>;
};

type ProgressionCorrectionValidationResult =
  | { success: true; data: ProgressionCorrectionInput }
  | { success: false; errors: Record<string, string[]> };

const allowedFields = new Set([
  "studentId",
  "eventId",
  "correctionReason",
]);
const correctionTypeSchema = z.enum([
  "undo_transition",
  "reset_initialization",
]);
const stageSchema = z.enum(COUNSELING_PROGRESSION_STAGES);
const stateSchema = z.enum(COUNSELING_PROGRESSION_STATES);
const timestampSchema = z
  .string()
  .refine(isValidOfficialProgressionTimestamp);
const correctionResultSchema = z
  .object({
    correction_id: z.uuid(),
    target_event_id: z.uuid(),
    correction_type: correctionTypeSchema,
    current_progression_exists: z.boolean(),
    restored_stage: stageSchema.nullable(),
    restored_state: stateSchema.nullable(),
    restored_stage_started_at: timestampSchema.nullable(),
    corrected_at: timestampSchema,
  })
  .strict();

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

export function validateProgressionCorrectionFormData(
  formData: FormData,
): ProgressionCorrectionValidationResult {
  const errors: Record<string, string[]> = {};
  for (const field of new Set(formData.keys())) {
    if (!allowedFields.has(field)) {
      addError(
        errors,
        "_form",
        "The submitted form contains an unsupported field.",
      );
    }
  }

  const studentIdValue = exactlyOneString(
    formData,
    "studentId",
    errors,
  );
  const eventIdValue = exactlyOneString(formData, "eventId", errors);
  const reasonValue = exactlyOneString(
    formData,
    "correctionReason",
    errors,
  );
  const studentId = z.uuid().safeParse(studentIdValue);
  const eventId = z.uuid().safeParse(eventIdValue);
  if (!studentId.success) {
    addError(errors, "studentId", "Choose a valid student.");
  }
  if (!eventId.success) {
    addError(errors, "eventId", "Choose a valid progression update.");
  }

  const correctionReason =
    typeof reasonValue === "string"
      ? normalizeOfficialProgressionReason(reasonValue)
      : "";
  if (
    correctionReason === "" ||
    getOfficialProgressionReasonLength(correctionReason) >
      OFFICIAL_PROGRESSION_REASON_MAX_LENGTH ||
    /[\u0000-\u001f\u007f]/.test(correctionReason)
  ) {
    addError(
      errors,
      "correctionReason",
      "Enter a correction reason of no more than 500 characters.",
    );
  }

  if (
    Object.keys(errors).length > 0 ||
    !studentId.success ||
    !eventId.success
  ) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      studentId: studentId.data,
      eventId: eventId.data,
      correctionReason,
    },
  };
}

function failure(
  message = "Official progression could not be corrected.",
  errors?: Record<string, string[]>,
): ProgressionCorrectionActionState {
  return { status: "error", message, errors };
}

function readErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  try {
    const code = Reflect.get(error, "code");
    return typeof code === "string" ? code : "";
  } catch {
    return "";
  }
}

function databaseFailure(
  error: unknown,
): ProgressionCorrectionActionState {
  switch (readErrorCode(error)) {
    case "K3401":
      return failure(
        "This progression update has already been reversed.",
      );
    case "K3402":
      return failure(
        "This progression update is no longer the latest valid step. Refresh the page and try again.",
      );
    case "K3404":
      return failure(
        "Supporting evidence must be removed or allowed to expire before this progression update can be reversed.",
      );
    case "K3405":
      return failure(
        "Official progression has changed. Refresh the page and try again.",
      );
    case "40001":
      return failure(
        "Another progression correction is currently in progress. Please try again.",
      );
    default:
      return failure();
  }
}

function parseCorrectionResult(
  value: unknown,
  expectedEventId: string,
):
  | {
      correctionType: CounselingProgressionCorrectionType;
      restoredStage: CounselingProgressionStage | null;
      restoredState: CounselingProgressionState | null;
    }
  | null {
  const parsed = correctionResultSchema.safeParse(value);
  if (!parsed.success || parsed.data.target_event_id !== expectedEventId) {
    return null;
  }
  const row = parsed.data;
  if (row.correction_type === "reset_initialization") {
    if (
      row.current_progression_exists ||
      row.restored_stage !== null ||
      row.restored_state !== null ||
      row.restored_stage_started_at !== null
    ) {
      return null;
    }
  } else if (
    !row.current_progression_exists ||
    row.restored_stage === null ||
    row.restored_state === null ||
    row.restored_stage_started_at === null
  ) {
    return null;
  }

  return {
    correctionType: row.correction_type,
    restoredStage: row.restored_stage,
    restoredState: row.restored_state,
  };
}

export async function submitProgressionCorrection(
  formData: FormData,
  store: ProgressionCorrectionStore,
): Promise<ProgressionCorrectionActionState> {
  const validation = validateProgressionCorrectionFormData(formData);
  if (!validation.success) {
    return failure(
      "Check the highlighted correction fields and try again.",
      validation.errors,
    );
  }
  const input = validation.data;

  let target: { valid: boolean; error: unknown };
  try {
    target = await store.verifyTarget(input.studentId, input.eventId);
  } catch {
    return failure();
  }
  if (target.error || !target.valid) return failure();

  let result: OfficialProgressionQueryResult;
  try {
    result = await store.correct(
      input.studentId,
      input.eventId,
      input.correctionReason,
    );
  } catch {
    return failure();
  }
  if (result.error) return databaseFailure(result.error);

  const correction = parseCorrectionResult(result.data, input.eventId);
  if (!correction) return failure();

  return {
    status: "success",
    correctionType: correction.correctionType,
    message:
      correction.correctionType === "reset_initialization"
        ? "Official progression reset successfully."
        : "Progression update reversed successfully.",
  };
}
