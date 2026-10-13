import {
  COUNSELOR_PRIVATE_RECORD_MESSAGES,
  type CounselorFollowUpBase,
  type CounselorStudentNoteBase,
} from "@/lib/counselor/private-records";
import {
  validateCounselorFollowUp,
  validateCounselorFollowUpStatus,
  validateCounselorWorkloadFollowUp,
  validateCounselorNote,
  validateCounselorNoteDelete,
  validateCounselorNotePin,
} from "@/lib/validation/counselor-private-records";
import type {
  CounselorFollowUpPriority,
  CounselorFollowUpStatus,
} from "@/types";

export type CounselorPrivateRecordOperation =
  | "create_note"
  | "update_note"
  | "delete_note"
  | "pin_note"
  | "create_follow_up"
  | "update_follow_up"
  | "update_workload_follow_up"
  | "complete_follow_up"
  | "cancel_follow_up";

export type CounselorPrivateRecordActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string[]>;
  operation?: CounselorPrivateRecordOperation;
};

export const initialCounselorPrivateRecordActionState: CounselorPrivateRecordActionState =
  { status: "idle" };

type MutationResult<T = undefined> = {
  data?: T;
  affected: boolean;
  error: unknown;
};

type TargetVerifier = (
  studentId: string,
  consultationId: string | null,
) => Promise<{ valid: boolean; error: unknown }>;

type NotePayload = Pick<
  CounselorStudentNoteBase,
  "student_id" | "consultation_id" | "note_text"
>;

type FollowUpPayload = Pick<
  CounselorFollowUpBase,
  | "student_id"
  | "consultation_id"
  | "due_date"
  | "priority"
  | "next_action"
  | "details"
>;

type NoteCreateStore = {
  verifyTarget: TargetVerifier;
  create: (payload: NotePayload) => Promise<MutationResult>;
};

type NoteUpdateStore = {
  verifyTarget: TargetVerifier;
  update: (
    studentId: string,
    recordId: string,
    payload: Omit<NotePayload, "student_id">,
  ) => Promise<MutationResult>;
};

type NotePinStore = {
  verifyTarget: TargetVerifier;
  pin: (
    studentId: string,
    recordId: string,
    isPinned: boolean,
  ) => Promise<MutationResult>;
};

type NoteDeleteStore = {
  verifyTarget: TargetVerifier;
  delete: (studentId: string, recordId: string) => Promise<MutationResult>;
};

type FollowUpCreateStore = {
  verifyTarget: TargetVerifier;
  create: (payload: FollowUpPayload) => Promise<MutationResult>;
};

type FollowUpUpdateStore = {
  verifyTarget: TargetVerifier;
  update: (
    studentId: string,
    recordId: string,
    payload: Omit<FollowUpPayload, "student_id">,
  ) => Promise<MutationResult>;
};

type FollowUpStatusStore = {
  verifyTarget: TargetVerifier;
  record: (
    studentId: string,
    recordId: string,
    status: "completed" | "cancelled",
  ) => Promise<MutationResult<CounselorFollowUpStatus>>;
};

type WorkloadFollowUpUpdateStore = {
  verifyTarget: TargetVerifier;
  update: (
    studentId: string,
    recordId: string,
    payload: Pick<
      CounselorFollowUpBase,
      "due_date" | "priority" | "next_action"
    >,
  ) => Promise<MutationResult>;
};

function readErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  try {
    const code = Reflect.get(error, "code");
    return typeof code === "string" ? code : "";
  } catch {
    return "";
  }
}

function isNoteOperation(operation: CounselorPrivateRecordOperation): boolean {
  return operation.endsWith("note");
}

function getSafeDatabaseError(
  error: unknown,
  operation: CounselorPrivateRecordOperation,
): CounselorPrivateRecordActionState {
  const code = readErrorCode(error);
  if (code === "42501") {
    return {
      status: "error",
      operation,
      message: COUNSELOR_PRIVATE_RECORD_MESSAGES.forbidden,
    };
  }
  if (code === "40001") {
    return {
      status: "error",
      operation,
      message: COUNSELOR_PRIVATE_RECORD_MESSAGES.changedConcurrently,
    };
  }
  if (code === "22023" || code === "23503" || code === "23514") {
    return {
      status: "error",
      operation,
      message: "Check the counselor record values and try again.",
    };
  }
  if (operation === "delete_note") {
    return {
      status: "error",
      operation,
      message: COUNSELOR_PRIVATE_RECORD_MESSAGES.noteDeleteFailed,
    };
  }
  if (
    operation === "complete_follow_up" ||
    operation === "cancel_follow_up"
  ) {
    return {
      status: "error",
      operation,
      message: COUNSELOR_PRIVATE_RECORD_MESSAGES.followUpStatusFailed,
    };
  }
  return {
    status: "error",
    operation,
    message: isNoteOperation(operation)
      ? COUNSELOR_PRIVATE_RECORD_MESSAGES.noteSaveFailed
      : COUNSELOR_PRIVATE_RECORD_MESSAGES.followUpSaveFailed,
  };
}

function validationError(
  operation: CounselorPrivateRecordOperation,
  message: string,
  errors: Record<string, string[]>,
): CounselorPrivateRecordActionState {
  return { status: "error", operation, message, errors };
}

async function validateTrustedTarget(
  operation: CounselorPrivateRecordOperation,
  studentId: string,
  consultationId: string | null,
  verifyTarget: TargetVerifier,
): Promise<CounselorPrivateRecordActionState | null> {
  try {
    const result = await verifyTarget(studentId, consultationId);
    if (result.error) return getSafeDatabaseError(result.error, operation);
    if (!result.valid) {
      return {
        status: "error",
        operation,
        message: COUNSELOR_PRIVATE_RECORD_MESSAGES.missingRecord,
      };
    }
    return null;
  } catch (error) {
    return getSafeDatabaseError(error, operation);
  }
}

async function runMutation(
  operation: CounselorPrivateRecordOperation,
  mutation: () => Promise<MutationResult>,
): Promise<CounselorPrivateRecordActionState | null> {
  try {
    const result = await mutation();
    if (result.error) return getSafeDatabaseError(result.error, operation);
    if (!result.affected) {
      return {
        status: "error",
        operation,
        message: COUNSELOR_PRIVATE_RECORD_MESSAGES.missingRecord,
      };
    }
    return null;
  } catch (error) {
    return getSafeDatabaseError(error, operation);
  }
}

export async function submitCreateCounselorNote(
  formData: FormData,
  store: NoteCreateStore,
): Promise<CounselorPrivateRecordActionState> {
  const operation = "create_note";
  const validation = validateCounselorNote(formData, "create");
  if (!validation.success) {
    return validationError(
      operation,
      "Check the highlighted private-note fields and try again.",
      validation.errors,
    );
  }
  const targetError = await validateTrustedTarget(
    operation,
    validation.data.studentId,
    validation.data.consultationId,
    store.verifyTarget,
  );
  if (targetError) return targetError;

  const mutationError = await runMutation(operation, () =>
    store.create({
      student_id: validation.data.studentId,
      consultation_id: validation.data.consultationId,
      note_text: validation.data.noteText,
    }),
  );
  return (
    mutationError ?? {
      status: "success",
      operation,
      message: COUNSELOR_PRIVATE_RECORD_MESSAGES.noteCreated,
    }
  );
}

export async function submitUpdateCounselorNote(
  formData: FormData,
  store: NoteUpdateStore,
): Promise<CounselorPrivateRecordActionState> {
  const operation = "update_note";
  const validation = validateCounselorNote(formData, "update");
  if (!validation.success || !validation.data.recordId) {
    return validationError(
      operation,
      "Check the highlighted private-note fields and try again.",
      validation.success
        ? { recordId: ["Choose a valid private note."] }
        : validation.errors,
    );
  }
  const recordId = validation.data.recordId;
  const targetError = await validateTrustedTarget(
    operation,
    validation.data.studentId,
    validation.data.consultationId,
    store.verifyTarget,
  );
  if (targetError) return targetError;

  const mutationError = await runMutation(operation, () =>
    store.update(validation.data.studentId, recordId, {
      consultation_id: validation.data.consultationId,
      note_text: validation.data.noteText,
    }),
  );
  return (
    mutationError ?? {
      status: "success",
      operation,
      message: COUNSELOR_PRIVATE_RECORD_MESSAGES.noteUpdated,
    }
  );
}

export async function submitSetCounselorNotePinned(
  formData: FormData,
  store: NotePinStore,
): Promise<CounselorPrivateRecordActionState> {
  const operation = "pin_note";
  const validation = validateCounselorNotePin(formData);
  if (!validation.success) {
    return validationError(
      operation,
      "Choose a valid private note.",
      validation.errors,
    );
  }
  const targetError = await validateTrustedTarget(
    operation,
    validation.data.studentId,
    null,
    store.verifyTarget,
  );
  if (targetError) return targetError;

  const mutationError = await runMutation(operation, () =>
    store.pin(
      validation.data.studentId,
      validation.data.recordId,
      validation.data.isPinned,
    ),
  );
  return (
    mutationError ?? {
      status: "success",
      operation,
      message: validation.data.isPinned
        ? COUNSELOR_PRIVATE_RECORD_MESSAGES.notePinned
        : COUNSELOR_PRIVATE_RECORD_MESSAGES.noteUnpinned,
    }
  );
}

export async function submitDeleteCounselorNote(
  formData: FormData,
  store: NoteDeleteStore,
): Promise<CounselorPrivateRecordActionState> {
  const operation = "delete_note";
  const validation = validateCounselorNoteDelete(formData);
  if (!validation.success) {
    return validationError(
      operation,
      "Confirm one valid private note for deletion.",
      validation.errors,
    );
  }
  const targetError = await validateTrustedTarget(
    operation,
    validation.data.studentId,
    null,
    store.verifyTarget,
  );
  if (targetError) return targetError;

  const mutationError = await runMutation(operation, () =>
    store.delete(validation.data.studentId, validation.data.recordId),
  );
  return (
    mutationError ?? {
      status: "success",
      operation,
      message: COUNSELOR_PRIVATE_RECORD_MESSAGES.noteDeleted,
    }
  );
}

function getFollowUpPayload(
  data: {
    studentId: string;
    consultationId: string | null;
    dueDate: string;
    priority: CounselorFollowUpPriority;
    nextAction: string;
    details: string | null;
  },
): FollowUpPayload {
  return {
    student_id: data.studentId,
    consultation_id: data.consultationId,
    due_date: data.dueDate,
    priority: data.priority,
    next_action: data.nextAction,
    details: data.details,
  };
}

export async function submitCreateCounselorFollowUp(
  formData: FormData,
  store: FollowUpCreateStore,
): Promise<CounselorPrivateRecordActionState> {
  const operation = "create_follow_up";
  const validation = validateCounselorFollowUp(formData, "create");
  if (!validation.success) {
    return validationError(
      operation,
      "Check the highlighted follow-up fields and try again.",
      validation.errors,
    );
  }
  const targetError = await validateTrustedTarget(
    operation,
    validation.data.studentId,
    validation.data.consultationId,
    store.verifyTarget,
  );
  if (targetError) return targetError;

  const mutationError = await runMutation(operation, () =>
    store.create(getFollowUpPayload(validation.data)),
  );
  return (
    mutationError ?? {
      status: "success",
      operation,
      message: COUNSELOR_PRIVATE_RECORD_MESSAGES.followUpCreated,
    }
  );
}

export async function submitUpdateCounselorFollowUp(
  formData: FormData,
  store: FollowUpUpdateStore,
): Promise<CounselorPrivateRecordActionState> {
  const operation = "update_follow_up";
  const validation = validateCounselorFollowUp(formData, "update");
  if (!validation.success || !validation.data.recordId) {
    return validationError(
      operation,
      "Check the highlighted follow-up fields and try again.",
      validation.success
        ? { recordId: ["Choose a valid follow-up."] }
        : validation.errors,
    );
  }
  const recordId = validation.data.recordId;
  const targetError = await validateTrustedTarget(
    operation,
    validation.data.studentId,
    validation.data.consultationId,
    store.verifyTarget,
  );
  if (targetError) return targetError;

  const payload: Omit<FollowUpPayload, "student_id"> = {
    consultation_id: validation.data.consultationId,
    due_date: validation.data.dueDate,
    priority: validation.data.priority,
    next_action: validation.data.nextAction,
    details: validation.data.details,
  };
  const mutationError = await runMutation(operation, () =>
    store.update(validation.data.studentId, recordId, payload),
  );
  return (
    mutationError ?? {
      status: "success",
      operation,
      message: COUNSELOR_PRIVATE_RECORD_MESSAGES.followUpUpdated,
    }
  );
}

export async function submitUpdateCounselorWorkloadFollowUp(
  formData: FormData,
  store: WorkloadFollowUpUpdateStore,
): Promise<CounselorPrivateRecordActionState> {
  const operation = "update_workload_follow_up";
  const validation = validateCounselorWorkloadFollowUp(formData);
  if (!validation.success) {
    return validationError(
      operation,
      "Check the highlighted follow-up fields and try again.",
      validation.errors,
    );
  }
  const targetError = await validateTrustedTarget(
    operation,
    validation.data.studentId,
    null,
    store.verifyTarget,
  );
  if (targetError) return targetError;

  const mutationError = await runMutation(operation, () =>
    store.update(validation.data.studentId, validation.data.recordId, {
      due_date: validation.data.dueDate,
      priority: validation.data.priority,
      next_action: validation.data.nextAction,
    }),
  );
  return (
    mutationError ?? {
      status: "success",
      operation,
      message: COUNSELOR_PRIVATE_RECORD_MESSAGES.followUpUpdated,
    }
  );
}

export async function submitRecordCounselorFollowUpStatus(
  formData: FormData,
  status: "completed" | "cancelled",
  store: FollowUpStatusStore,
): Promise<CounselorPrivateRecordActionState> {
  const operation =
    status === "completed" ? "complete_follow_up" : "cancel_follow_up";
  const validation = validateCounselorFollowUpStatus(formData);
  if (!validation.success) {
    return validationError(
      operation,
      "Choose a valid follow-up.",
      validation.errors,
    );
  }
  const targetError = await validateTrustedTarget(
    operation,
    validation.data.studentId,
    null,
    store.verifyTarget,
  );
  if (targetError) return targetError;

  try {
    const result = await store.record(
      validation.data.studentId,
      validation.data.recordId,
      status,
    );
    if (result.error) return getSafeDatabaseError(result.error, operation);
    if (!result.affected || result.data !== status) {
      return {
        status: "error",
        operation,
        message: COUNSELOR_PRIVATE_RECORD_MESSAGES.missingRecord,
      };
    }
  } catch (error) {
    return getSafeDatabaseError(error, operation);
  }

  return {
    status: "success",
    operation,
    message:
      status === "completed"
        ? COUNSELOR_PRIVATE_RECORD_MESSAGES.followUpCompleted
        : COUNSELOR_PRIVATE_RECORD_MESSAGES.followUpCancelled,
  };
}
