import type { Database } from "@/types/database";
import type {
  StudentOptionalRecordActionState,
  StudentOptionalRecordOperation,
} from "@/lib/profiles/optional-record-types";
import {
  validateStudentAchievement,
  validateStudentOptionalRecordDelete,
  validateStudentTestScore,
  type StudentAchievementInput,
  type StudentTestScoreInput,
} from "@/lib/validation/student-optional-records";

type StudentTestScoreInsert =
  Database["public"]["Tables"]["student_test_scores"]["Insert"];
type StudentTestScoreUpdate =
  Database["public"]["Tables"]["student_test_scores"]["Update"];
type StudentAchievementInsert =
  Database["public"]["Tables"]["student_achievements"]["Insert"];
type StudentAchievementUpdate =
  Database["public"]["Tables"]["student_achievements"]["Update"];

type MutationResult = {
  affected: boolean;
  error: unknown;
};

export type OptionalRecordCreateStore<Payload> = {
  create: (payload: Payload) => Promise<MutationResult>;
};

export type OptionalRecordUpdateStore<Payload> = {
  update: (recordId: string, payload: Payload) => Promise<MutationResult>;
};

export type OptionalRecordDeleteStore = {
  delete: (recordId: string) => Promise<MutationResult>;
};

function readErrorText(error: unknown, property: string): string {
  if (
    (typeof error !== "object" || error === null) &&
    typeof error !== "function"
  ) {
    return "";
  }
  try {
    const value = Reflect.get(error, property);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function getSafeDatabaseError(
  error: unknown,
  operation: StudentOptionalRecordOperation,
): StudentOptionalRecordActionState {
  const code = readErrorText(error, "code");
  const examOperation =
    operation === "create_exam" || operation === "update_exam";

  if (code === "23505" && examOperation) {
    return {
      status: "error",
      operation,
      message:
        "That attempt number already exists for this exam. Choose another attempt number.",
      errors: {
        attemptNumber: [
          "Use a different attempt number for this exam.",
        ],
      },
    };
  }

  if (code === "42501") {
    return {
      status: "error",
      operation,
      message: "This record could not be changed with your account.",
    };
  }

  if (code === "23514") {
    return {
      status: "error",
      operation,
      message: "Check the record values and try again.",
    };
  }

  const deleting =
    operation === "delete_exam" || operation === "delete_achievement";
  return {
    status: "error",
    operation,
    message: deleting
      ? "We could not delete this record. Please try again."
      : "We could not save this record. Please try again.",
  };
}

function getMissingRecordState(
  operation: StudentOptionalRecordOperation,
): StudentOptionalRecordActionState {
  return {
    status: "error",
    operation,
    message:
      "This record could not be changed. It may no longer be available.",
  };
}

function getValidationState(
  operation: StudentOptionalRecordOperation,
  message: string,
  errors: Record<string, string[]>,
): StudentOptionalRecordActionState {
  return { status: "error", operation, message, errors };
}

async function runMutation(
  operation: StudentOptionalRecordOperation,
  mutation: () => Promise<MutationResult>,
): Promise<StudentOptionalRecordActionState | null> {
  try {
    const result = await mutation();
    if (result.error) return getSafeDatabaseError(result.error, operation);
    return result.affected ? null : getMissingRecordState(operation);
  } catch (error) {
    return getSafeDatabaseError(error, operation);
  }
}

function getTestScorePayload(
  data: StudentTestScoreInput,
): StudentTestScoreInsert {
  return {
    exam_name: data.examName,
    custom_exam_name: data.customExamName,
    exam_status: data.examStatus,
    attempt_number: data.attemptNumber,
    planned_date: data.plannedDate,
    completed_date: data.completedDate,
    score: data.score,
    valid_until: data.validUntil,
    remarks: data.remarks,
  };
}

function getAchievementPayload(
  data: StudentAchievementInput,
): StudentAchievementInsert {
  return {
    achievement_type: data.achievementType,
    title: data.title,
    organization: data.organization,
    achievement_date: data.achievementDate,
    description: data.description,
  };
}

export async function submitCreateStudentTestScore(
  formData: FormData,
  businessToday: string,
  store: OptionalRecordCreateStore<StudentTestScoreInsert>,
): Promise<StudentOptionalRecordActionState> {
  const operation = "create_exam";
  const validation = validateStudentTestScore(
    formData,
    "create",
    businessToday,
  );
  if (!validation.success) {
    return getValidationState(
      operation,
      "Check the highlighted exam fields and try again.",
      validation.errors,
    );
  }

  const errorState = await runMutation(operation, () =>
    store.create(getTestScorePayload(validation.data)),
  );
  return (
    errorState ?? {
      status: "success",
      operation,
      message: "Study Abroad Exam attempt added.",
    }
  );
}

export async function submitUpdateStudentTestScore(
  formData: FormData,
  businessToday: string,
  store: OptionalRecordUpdateStore<StudentTestScoreUpdate>,
): Promise<StudentOptionalRecordActionState> {
  const operation = "update_exam";
  const validation = validateStudentTestScore(
    formData,
    "update",
    businessToday,
  );
  if (!validation.success) {
    return getValidationState(
      operation,
      "Check the highlighted exam fields and try again.",
      validation.errors,
    );
  }
  const recordId = validation.data.recordId;
  if (!recordId) return getMissingRecordState(operation);

  const errorState = await runMutation(operation, () =>
    store.update(
      recordId,
      getTestScorePayload(validation.data),
    ),
  );
  return (
    errorState ?? {
      status: "success",
      operation,
      message: "Study Abroad Exam attempt updated.",
    }
  );
}

export async function submitDeleteStudentTestScore(
  formData: FormData,
  store: OptionalRecordDeleteStore,
): Promise<StudentOptionalRecordActionState> {
  const operation = "delete_exam";
  const validation = validateStudentOptionalRecordDelete(formData);
  if (!validation.success) {
    return getValidationState(
      operation,
      "Choose a valid exam attempt.",
      validation.errors,
    );
  }

  const errorState = await runMutation(operation, () =>
    store.delete(validation.data.recordId),
  );
  return (
    errorState ?? {
      status: "success",
      operation,
      message: "Study Abroad Exam attempt deleted.",
    }
  );
}

export async function submitCreateStudentAchievement(
  formData: FormData,
  businessToday: string,
  store: OptionalRecordCreateStore<StudentAchievementInsert>,
): Promise<StudentOptionalRecordActionState> {
  const operation = "create_achievement";
  const validation = validateStudentAchievement(
    formData,
    "create",
    businessToday,
  );
  if (!validation.success) {
    return getValidationState(
      operation,
      "Check the highlighted achievement fields and try again.",
      validation.errors,
    );
  }

  const errorState = await runMutation(operation, () =>
    store.create(getAchievementPayload(validation.data)),
  );
  return (
    errorState ?? {
      status: "success",
      operation,
      message: "Achievement added.",
    }
  );
}

export async function submitUpdateStudentAchievement(
  formData: FormData,
  businessToday: string,
  store: OptionalRecordUpdateStore<StudentAchievementUpdate>,
): Promise<StudentOptionalRecordActionState> {
  const operation = "update_achievement";
  const validation = validateStudentAchievement(
    formData,
    "update",
    businessToday,
  );
  if (!validation.success) {
    return getValidationState(
      operation,
      "Check the highlighted achievement fields and try again.",
      validation.errors,
    );
  }
  const recordId = validation.data.recordId;
  if (!recordId) return getMissingRecordState(operation);

  const errorState = await runMutation(operation, () =>
    store.update(
      recordId,
      getAchievementPayload(validation.data),
    ),
  );
  return (
    errorState ?? {
      status: "success",
      operation,
      message: "Achievement updated.",
    }
  );
}

export async function submitDeleteStudentAchievement(
  formData: FormData,
  store: OptionalRecordDeleteStore,
): Promise<StudentOptionalRecordActionState> {
  const operation = "delete_achievement";
  const validation = validateStudentOptionalRecordDelete(formData);
  if (!validation.success) {
    return getValidationState(
      operation,
      "Choose a valid achievement.",
      validation.errors,
    );
  }

  const errorState = await runMutation(operation, () =>
    store.delete(validation.data.recordId),
  );
  return (
    errorState ?? {
      status: "success",
      operation,
      message: "Achievement deleted.",
    }
  );
}
