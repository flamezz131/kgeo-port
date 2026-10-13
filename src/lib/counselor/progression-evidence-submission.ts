import { z } from "zod";
import {
  PROGRESSION_EVIDENCE_BUCKET_ID,
  PROGRESSION_EVIDENCE_REMOVAL_REASON_MAX_LENGTH,
  isRemovedProgressionEvidenceMutation,
  normalizeProgressionEvidenceRemovalReason,
  parseAvailableProgressionEvidenceMutation,
  parseProgressionEvidenceUploadIntent,
  parseTrustedProgressionEvidenceOperationRow,
  validateProgressionEvidenceFile,
  type ProgressionEvidenceVisibleFile,
  type ValidatedProgressionEvidenceFile,
} from "@/lib/counselor/progression-evidence";

export type ProgressionEvidenceFieldErrors = Record<string, string[]>;

export type ProgressionEvidenceUploadData = {
  evidenceId: string;
  bucketId: typeof PROGRESSION_EVIDENCE_BUCKET_ID;
  path: string;
  token: string;
  uploadExpiresAt: string;
  originalFileName: string;
  mimeType: ValidatedProgressionEvidenceFile["mimeType"];
  fileSizeBytes: number;
};

export type ProgressionEvidencePrepareActionState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      errors?: ProgressionEvidenceFieldErrors;
    }
  | {
      status: "success";
      message: string;
      upload: ProgressionEvidenceUploadData;
    };

export type ProgressionEvidenceMutationActionState =
  | { status: "idle" }
  | {
      status: "error";
      message: string;
      errors?: ProgressionEvidenceFieldErrors;
    }
  | { status: "success"; message: string };

export const initialProgressionEvidencePrepareState:
  ProgressionEvidencePrepareActionState = { status: "idle" };
export const initialProgressionEvidenceMutationState:
  ProgressionEvidenceMutationActionState = { status: "idle" };

export type ProgressionEvidenceQueryResult = {
  data: unknown;
  error: unknown;
};

type TrustedTargetVerifier = (
  studentId: string,
  progressionEventId: string,
) => Promise<{ valid: boolean; error: unknown }>;

export type ProgressionEvidencePrepareStore = {
  verifyTarget: TrustedTargetVerifier;
  prepare: (
    progressionEventId: string,
    file: ValidatedProgressionEvidenceFile,
  ) => Promise<ProgressionEvidenceQueryResult>;
  createSignedUpload: (
    bucketId: typeof PROGRESSION_EVIDENCE_BUCKET_ID,
    storagePath: string,
  ) => Promise<ProgressionEvidenceQueryResult>;
};

export type ProgressionEvidenceFinalizeStore = {
  verifyTarget: TrustedTargetVerifier;
  loadEvidence: (
    evidenceId: string,
  ) => Promise<ProgressionEvidenceQueryResult>;
  finalize: (
    evidenceId: string,
  ) => Promise<ProgressionEvidenceQueryResult>;
};

export type ProgressionEvidenceRemoveStore = {
  verifyTarget: TrustedTargetVerifier;
  loadEvidence: (
    evidenceId: string,
  ) => Promise<ProgressionEvidenceQueryResult>;
  remove: (
    evidenceId: string,
    removalReason: string,
  ) => Promise<ProgressionEvidenceQueryResult>;
};

type EvidenceReferenceInput = {
  studentId: string;
  progressionEventId: string;
  evidenceId: string;
};

type PrepareInput = {
  studentId: string;
  progressionEventId: string;
  file: ValidatedProgressionEvidenceFile;
};

type RemoveInput = EvidenceReferenceInput & {
  removalReason: string;
};

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: ProgressionEvidenceFieldErrors };

const uuidSchema = z.uuid();
const signedUploadResponseSchema = z
  .object({
    signedUrl: z.url(),
    token: z.string().min(1).max(8192),
    path: z.string().min(1),
  })
  .strict();

function addError(
  errors: ProgressionEvidenceFieldErrors,
  field: string,
  message: string,
) {
  if (!errors[field]) errors[field] = [message];
}

function readExactlyOneString(
  formData: FormData,
  field: string,
  errors: ProgressionEvidenceFieldErrors,
): string | null {
  const values = formData.getAll(field);
  if (values.length !== 1 || typeof values[0] !== "string") {
    addError(errors, field, "Submit exactly one value for this field.");
    return null;
  }
  return values[0];
}

function rejectUnknownFields(
  formData: FormData,
  allowedFields: ReadonlySet<string>,
  errors: ProgressionEvidenceFieldErrors,
) {
  for (const field of new Set(formData.keys())) {
    if (!allowedFields.has(field) && !field.startsWith("$ACTION_")) {
      addError(
        errors,
        "_form",
        "The submitted form contains an unsupported field.",
      );
    }
  }
}

function parseUuidField(
  value: string | null,
  field: string,
  errors: ProgressionEvidenceFieldErrors,
): string | null {
  const parsed = uuidSchema.safeParse(value);
  if (!parsed.success) {
    addError(errors, field, "Submit a valid reference.");
    return null;
  }
  return parsed.data;
}

function validateEvidenceReferenceFormData(
  formData: FormData,
  extraFields: readonly string[] = [],
): ValidationResult<EvidenceReferenceInput> {
  const errors: ProgressionEvidenceFieldErrors = {};
  const fields = new Set([
    "studentId",
    "progressionEventId",
    "evidenceId",
    ...extraFields,
  ]);
  rejectUnknownFields(formData, fields, errors);

  const studentId = parseUuidField(
    readExactlyOneString(formData, "studentId", errors),
    "studentId",
    errors,
  );
  const progressionEventId = parseUuidField(
    readExactlyOneString(formData, "progressionEventId", errors),
    "progressionEventId",
    errors,
  );
  const evidenceId = parseUuidField(
    readExactlyOneString(formData, "evidenceId", errors),
    "evidenceId",
    errors,
  );

  if (
    Object.keys(errors).length > 0 ||
    !studentId ||
    !progressionEventId ||
    !evidenceId
  ) {
    return { success: false, errors };
  }
  return {
    success: true,
    data: { studentId, progressionEventId, evidenceId },
  };
}

export function validateProgressionEvidencePrepareFormData(
  formData: FormData,
): ValidationResult<PrepareInput> {
  const errors: ProgressionEvidenceFieldErrors = {};
  rejectUnknownFields(
    formData,
    new Set([
      "studentId",
      "progressionEventId",
      "originalFileName",
      "mimeType",
      "fileSizeBytes",
    ]),
    errors,
  );

  const studentId = parseUuidField(
    readExactlyOneString(formData, "studentId", errors),
    "studentId",
    errors,
  );
  const progressionEventId = parseUuidField(
    readExactlyOneString(formData, "progressionEventId", errors),
    "progressionEventId",
    errors,
  );
  const originalFileName = readExactlyOneString(
    formData,
    "originalFileName",
    errors,
  );
  const mimeType = readExactlyOneString(formData, "mimeType", errors);
  const sizeValue = readExactlyOneString(
    formData,
    "fileSizeBytes",
    errors,
  );
  const fileSizeBytes =
    typeof sizeValue === "string" && /^(?:0|[1-9]\d*)$/.test(sizeValue)
      ? Number(sizeValue)
      : Number.NaN;
  const fileValidation =
    typeof originalFileName === "string" &&
    typeof mimeType === "string"
      ? validateProgressionEvidenceFile({
          name: originalFileName,
          type: mimeType,
          size: fileSizeBytes,
        })
      : null;
  if (!fileValidation?.success) {
    addError(
      errors,
      "file",
      fileValidation?.message ??
        "Select a supported PDF, DOCX or image file.",
    );
  }

  if (
    Object.keys(errors).length > 0 ||
    !studentId ||
    !progressionEventId ||
    !fileValidation?.success
  ) {
    return { success: false, errors };
  }
  return {
    success: true,
    data: {
      studentId,
      progressionEventId,
      file: fileValidation.data,
    },
  };
}

export function validateProgressionEvidenceFinalizeFormData(
  formData: FormData,
): ValidationResult<EvidenceReferenceInput> {
  return validateEvidenceReferenceFormData(formData);
}

export function validateProgressionEvidenceRemoveFormData(
  formData: FormData,
): ValidationResult<RemoveInput> {
  const reference = validateEvidenceReferenceFormData(formData, [
    "removalReason",
  ]);
  const errors = reference.success ? {} : { ...reference.errors };
  const reasonValue = readExactlyOneString(
    formData,
    "removalReason",
    errors,
  );
  const removalReason =
    typeof reasonValue === "string"
      ? normalizeProgressionEvidenceRemovalReason(reasonValue)
      : "";
  if (
    removalReason.length < 1 ||
    Array.from(removalReason).length >
      PROGRESSION_EVIDENCE_REMOVAL_REASON_MAX_LENGTH
  ) {
    addError(
      errors,
      "removalReason",
      "Enter a removal reason of 500 characters or fewer.",
    );
  }
  if (!reference.success || Object.keys(errors).length > 0) {
    return { success: false, errors };
  }
  return {
    success: true,
    data: { ...reference.data, removalReason },
  };
}

function readErrorProperty(error: unknown, property: string): string {
  if (typeof error !== "object" || error === null) return "";
  try {
    const value = Reflect.get(error, property);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function prepareDatabaseFailure(
  error: unknown,
): ProgressionEvidencePrepareActionState {
  const code = readErrorProperty(error, "code");
  const message = readErrorProperty(error, "message");
  if (
    code === "40001" ||
    message === "Another evidence upload is being prepared"
  ) {
    return {
      status: "error",
      message: "Another evidence operation is currently in progress.",
    };
  }
  if (
    message ===
    "This progression event already has five active evidence files"
  ) {
    return {
      status: "error",
      message:
        "This progression event already has the maximum number of evidence files.",
    };
  }
  return {
    status: "error",
    message: "Evidence upload could not be prepared.",
  };
}

function finalizeDatabaseFailure(
  error: unknown,
): ProgressionEvidenceMutationActionState {
  const message = readErrorProperty(error, "message");
  if (message === "The evidence upload intent has expired") {
    return {
      status: "error",
      message:
        "The secure upload request has expired. Select the file and try again.",
    };
  }
  if (message === "The uploaded evidence object was not found") {
    return {
      status: "error",
      message:
        "The file was uploaded, but finalization failed. Retry finalization.",
    };
  }
  if (message === "The evidence upload cannot be finalized") {
    return {
      status: "error",
      message: "Evidence upload could not be finalized.",
    };
  }
  return {
    status: "error",
    message:
      "The file was uploaded, but finalization failed. Retry finalization.",
  };
}

async function verifyTarget(
  verify: TrustedTargetVerifier,
  studentId: string,
  progressionEventId: string,
): Promise<boolean> {
  try {
    const result = await verify(studentId, progressionEventId);
    return result.valid && !result.error;
  } catch {
    return false;
  }
}

export async function submitProgressionEvidencePrepare(
  formData: FormData,
  store: ProgressionEvidencePrepareStore,
  now = new Date(),
): Promise<ProgressionEvidencePrepareActionState> {
  const validation =
    validateProgressionEvidencePrepareFormData(formData);
  if (!validation.success) {
    return {
      status: "error",
      message: "Check the selected evidence file and try again.",
      errors: validation.errors,
    };
  }
  const input = validation.data;
  if (
    !(await verifyTarget(
      store.verifyTarget,
      input.studentId,
      input.progressionEventId,
    ))
  ) {
    return {
      status: "error",
      message: "Evidence upload could not be prepared.",
    };
  }

  let prepared: ProgressionEvidenceQueryResult;
  try {
    prepared = await store.prepare(input.progressionEventId, input.file);
  } catch {
    return {
      status: "error",
      message: "Evidence upload could not be prepared.",
    };
  }
  if (prepared.error) return prepareDatabaseFailure(prepared.error);

  const intent = parseProgressionEvidenceUploadIntent(
    prepared.data,
    {
      studentId: input.studentId,
      progressionEventId: input.progressionEventId,
      ...input.file,
    },
    now,
  );
  if (!intent) {
    return {
      status: "error",
      message: "Evidence upload could not be prepared.",
    };
  }

  let signedUpload: ProgressionEvidenceQueryResult;
  try {
    signedUpload = await store.createSignedUpload(
      intent.bucketId,
      intent.storagePath,
    );
  } catch {
    return {
      status: "error",
      message: "Evidence upload could not be prepared.",
    };
  }
  const signed = signedUploadResponseSchema.safeParse(signedUpload.data);
  if (
    signedUpload.error ||
    !signed.success ||
    signed.data.path !== intent.storagePath
  ) {
    return {
      status: "error",
      message: "Evidence upload could not be prepared.",
    };
  }

  return {
    status: "success",
    message: "Secure upload prepared.",
    upload: {
      evidenceId: intent.evidenceId,
      bucketId: intent.bucketId,
      path: intent.storagePath,
      token: signed.data.token,
      uploadExpiresAt: intent.uploadExpiresAt,
      originalFileName: intent.originalFileName,
      mimeType: intent.mimeType,
      fileSizeBytes: intent.fileSizeBytes,
    },
  };
}

async function loadTrustedEvidence(
  store: ProgressionEvidenceFinalizeStore | ProgressionEvidenceRemoveStore,
  input: EvidenceReferenceInput,
  status: "pending" | "available",
) {
  let result: ProgressionEvidenceQueryResult;
  try {
    result = await store.loadEvidence(input.evidenceId);
  } catch {
    return null;
  }
  if (result.error) return null;
  return parseTrustedProgressionEvidenceOperationRow(result.data, {
    ...input,
    status,
  });
}

export async function submitProgressionEvidenceFinalize(
  formData: FormData,
  store: ProgressionEvidenceFinalizeStore,
): Promise<
  ProgressionEvidenceMutationActionState & {
    evidence?: ProgressionEvidenceVisibleFile;
  }
> {
  const validation =
    validateProgressionEvidenceFinalizeFormData(formData);
  if (!validation.success) {
    return {
      status: "error",
      message: "Evidence upload could not be finalized.",
      errors: validation.errors,
    };
  }
  const input = validation.data;
  if (
    !(await verifyTarget(
      store.verifyTarget,
      input.studentId,
      input.progressionEventId,
    ))
  ) {
    return {
      status: "error",
      message: "Evidence upload could not be finalized.",
    };
  }
  const pendingEvidence = await loadTrustedEvidence(
    store,
    input,
    "pending",
  );
  if (!pendingEvidence) {
    return {
      status: "error",
      message: "Evidence upload could not be finalized.",
    };
  }

  let finalized: ProgressionEvidenceQueryResult;
  try {
    finalized = await store.finalize(input.evidenceId);
  } catch {
    return finalizeDatabaseFailure(null);
  }
  if (finalized.error) return finalizeDatabaseFailure(finalized.error);
  const evidence = parseAvailableProgressionEvidenceMutation(
    finalized.data,
    input,
  );
  if (
    !evidence ||
    evidence.originalFileName !== pendingEvidence.original_file_name ||
    evidence.mimeType !== pendingEvidence.mime_type ||
    evidence.fileSizeBytes !== pendingEvidence.file_size_bytes
  ) {
    return {
      status: "error",
      message:
        "The file was uploaded, but finalization failed. Retry finalization.",
    };
  }
  return {
    status: "success",
    message: "Evidence uploaded successfully.",
    evidence,
  };
}

export async function submitProgressionEvidenceRemove(
  formData: FormData,
  store: ProgressionEvidenceRemoveStore,
): Promise<ProgressionEvidenceMutationActionState> {
  const validation =
    validateProgressionEvidenceRemoveFormData(formData);
  if (!validation.success) {
    return {
      status: "error",
      message: "Evidence could not be removed.",
      errors: validation.errors,
    };
  }
  const input = validation.data;
  if (
    !(await verifyTarget(
      store.verifyTarget,
      input.studentId,
      input.progressionEventId,
    ))
  ) {
    return { status: "error", message: "Evidence could not be removed." };
  }
  const availableEvidence = await loadTrustedEvidence(
    store,
    input,
    "available",
  );
  if (!availableEvidence) {
    return { status: "error", message: "Evidence could not be removed." };
  }

  let removed: ProgressionEvidenceQueryResult;
  try {
    removed = await store.remove(
      input.evidenceId,
      input.removalReason,
    );
  } catch {
    return { status: "error", message: "Evidence could not be removed." };
  }
  if (
    removed.error ||
    !isRemovedProgressionEvidenceMutation(removed.data, {
      ...input,
      originalFileName: availableEvidence.original_file_name,
    })
  ) {
    return { status: "error", message: "Evidence could not be removed." };
  }
  return {
    status: "success",
    message: "Evidence removed from counselor access.",
  };
}
