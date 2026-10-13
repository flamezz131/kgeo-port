import { z } from "zod";
import {
  COUNSELING_PROGRESSION_STAGES,
  OFFICIAL_PROGRESSION_REASON_MAX_LENGTH,
  getOfficialProgressionReasonLength,
  normalizeOfficialProgressionReason,
  parseOfficialProgressionCurrent,
  type OfficialProgressionCurrent,
  type OfficialProgressionQueryResult,
} from "@/lib/counselor/progression";
import type {
  CounselingProgressionStage,
  CounselingProgressionState,
} from "@/types";

export const OFFICIAL_PROGRESSION_OPERATIONS = [
  "initialize",
  "change_stage",
  "pause",
  "resume",
  "complete",
] as const;

export type OfficialProgressionOperation =
  (typeof OFFICIAL_PROGRESSION_OPERATIONS)[number];

export type OfficialProgressionActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string[]>;
  operation?: OfficialProgressionOperation;
};

export const initialOfficialProgressionActionState: OfficialProgressionActionState =
  { status: "idle" };

type ProgressionInput = {
  studentId: string;
  operation: OfficialProgressionOperation;
  requestedStage: CounselingProgressionStage | null;
  changeReason: string | null;
};

type ProgressionMutationStore = {
  verifyTarget: (
    studentId: string,
  ) => Promise<{ valid: boolean; error: unknown }>;
  loadCurrent: (
    studentId: string,
  ) => Promise<OfficialProgressionQueryResult>;
  record: (
    studentId: string,
    stage: CounselingProgressionStage,
    state: CounselingProgressionState,
    reason: string | null,
  ) => Promise<OfficialProgressionQueryResult>;
};

type ValidationResult =
  | { success: true; data: ProgressionInput }
  | {
      success: false;
      operation?: OfficialProgressionOperation;
      errors: Record<string, string[]>;
    };

const operationSchema = z.enum(OFFICIAL_PROGRESSION_OPERATIONS);
const stageSchema = z.enum(COUNSELING_PROGRESSION_STAGES);
const baseFields = ["studentId", "operation", "changeReason"] as const;
const allFields = new Set([...baseFields, "requestedStage"]);

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

export function validateOfficialProgressionFormData(
  formData: FormData,
): ValidationResult {
  const errors: Record<string, string[]> = {};
  for (const field of new Set(formData.keys())) {
    if (!allFields.has(field) && !field.startsWith("$ACTION_")) {
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
  const operationValue = exactlyOneString(
    formData,
    "operation",
    errors,
  );
  const reasonValue = exactlyOneString(
    formData,
    "changeReason",
    errors,
  );
  const operationResult = operationSchema.safeParse(operationValue);
  const operation = operationResult.success
    ? operationResult.data
    : undefined;
  if (!operationResult.success) {
    addError(errors, "operation", "Choose a valid progression operation.");
  }

  let requestedStageValue: string | null = null;
  if (operation === "initialize" || operation === "change_stage") {
    requestedStageValue = exactlyOneString(
      formData,
      "requestedStage",
      errors,
    );
  } else if (
    operation &&
    formData.getAll("requestedStage").length !== 0
  ) {
    addError(
      errors,
      "requestedStage",
      "A progression stage is not accepted for this operation.",
    );
  }

  const studentIdResult = z.uuid().safeParse(studentIdValue);
  if (!studentIdResult.success) {
    addError(errors, "studentId", "Choose a valid student.");
  }

  let requestedStage: CounselingProgressionStage | null = null;
  if (operation === "initialize" || operation === "change_stage") {
    const stageResult = stageSchema.safeParse(requestedStageValue);
    if (!stageResult.success) {
      addError(
        errors,
        "requestedStage",
        "Select a valid progression stage.",
      );
    } else {
      requestedStage = stageResult.data;
    }
  }

  let changeReason: string | null = null;
  if (typeof reasonValue === "string") {
    const normalized = normalizeOfficialProgressionReason(reasonValue);
    if (
      getOfficialProgressionReasonLength(normalized) >
      OFFICIAL_PROGRESSION_REASON_MAX_LENGTH
    ) {
      addError(
        errors,
        "changeReason",
        "Enter a reason of 500 characters or fewer.",
      );
    } else {
      changeReason = normalized === "" ? null : normalized;
    }
  }

  if (
    Object.keys(errors).length > 0 ||
    !operation ||
    !studentIdResult.success
  ) {
    return { success: false, operation, errors };
  }

  return {
    success: true,
    data: {
      studentId: studentIdResult.data,
      operation,
      requestedStage,
      changeReason,
    },
  };
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

function failure(
  operation: OfficialProgressionOperation | undefined,
  message = "Official progression could not be updated.",
  errors?: Record<string, string[]>,
): OfficialProgressionActionState {
  return { status: "error", operation, message, errors };
}

function databaseFailure(
  operation: OfficialProgressionOperation,
  error: unknown,
): OfficialProgressionActionState {
  const code = readErrorCode(error);
  if (code === "40001") {
    return failure(
      operation,
      "Another progression update is currently in progress. Please try again.",
    );
  }
  if (code === "22023") {
    return failure(
      operation,
      "Official progression has changed. Refresh the page and try again.",
    );
  }
  return failure(operation);
}

function deriveTarget(
  input: ProgressionInput,
  current: OfficialProgressionCurrent | null,
):
  | {
      stage: CounselingProgressionStage;
      state: CounselingProgressionState;
    }
  | OfficialProgressionActionState {
  const { operation, requestedStage } = input;

  if (operation === "initialize") {
    if (current) {
      return failure(
        operation,
        "Official progression has already been started.",
      );
    }
    if (!requestedStage) {
      return failure(operation, "Select a valid progression stage.", {
        requestedStage: ["Select a valid progression stage."],
      });
    }
    return { stage: requestedStage, state: "active" };
  }

  if (!current) {
    return failure(
      operation,
      "Official progression has changed. Refresh the page and try again.",
    );
  }
  if (current.workflow_state === "completed") {
    return failure(
      operation,
      "Completed progression cannot be changed.",
    );
  }

  switch (operation) {
    case "change_stage":
      if (current.workflow_state !== "active") {
        return failure(
          operation,
          "Only active progression can change stage.",
        );
      }
      if (!requestedStage || requestedStage === current.current_stage) {
        return failure(operation, "Select a different progression stage.", {
          requestedStage: ["Select a different progression stage."],
        });
      }
      return { stage: requestedStage, state: "active" };
    case "pause":
      if (current.workflow_state !== "active") {
        return failure(
          operation,
          "Only active progression can be put on hold.",
        );
      }
      return { stage: current.current_stage, state: "on_hold" };
    case "resume":
      if (current.workflow_state !== "on_hold") {
        return failure(
          operation,
          "Only on-hold progression can be resumed.",
        );
      }
      return { stage: current.current_stage, state: "active" };
    case "complete":
      return { stage: current.current_stage, state: "completed" };
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

function successMessage(
  operation: OfficialProgressionOperation,
): string {
  switch (operation) {
    case "initialize":
      return "Official progression started.";
    case "change_stage":
      return "Official stage updated.";
    case "pause":
      return "Official progression put on hold.";
    case "resume":
      return "Official progression resumed.";
    case "complete":
      return "Official progression completed.";
    default: {
      const exhaustive: never = operation;
      return exhaustive;
    }
  }
}

export async function submitOfficialProgressionMutation(
  formData: FormData,
  store: ProgressionMutationStore,
): Promise<OfficialProgressionActionState> {
  const validation = validateOfficialProgressionFormData(formData);
  if (!validation.success) {
    return failure(
      validation.operation,
      "Check the highlighted progression fields and try again.",
      validation.errors,
    );
  }
  const input = validation.data;

  let targetResult: { valid: boolean; error: unknown };
  try {
    targetResult = await store.verifyTarget(input.studentId);
  } catch {
    return failure(input.operation);
  }
  if (targetResult.error || !targetResult.valid) {
    return failure(input.operation);
  }

  let currentResult: OfficialProgressionQueryResult;
  try {
    currentResult = await store.loadCurrent(input.studentId);
  } catch {
    return failure(input.operation);
  }
  if (currentResult.error) {
    return databaseFailure(input.operation, currentResult.error);
  }

  let current: OfficialProgressionCurrent | null = null;
  if (currentResult.data !== null) {
    current = parseOfficialProgressionCurrent(
      currentResult.data,
      input.studentId,
    );
    if (!current) return failure(input.operation);
  }

  const target = deriveTarget(input, current);
  if ("status" in target) return target;

  let mutationResult: OfficialProgressionQueryResult;
  try {
    mutationResult = await store.record(
      input.studentId,
      target.stage,
      target.state,
      input.changeReason,
    );
  } catch {
    return failure(input.operation);
  }
  if (mutationResult.error) {
    return databaseFailure(input.operation, mutationResult.error);
  }

  const returnedCurrent = parseOfficialProgressionCurrent(
    mutationResult.data,
    input.studentId,
  );
  if (
    !returnedCurrent ||
    returnedCurrent.current_stage !== target.stage ||
    returnedCurrent.workflow_state !== target.state
  ) {
    return failure(input.operation);
  }

  return {
    status: "success",
    operation: input.operation,
    message: successMessage(input.operation),
  };
}
