import { z } from "zod";
import {
  normalizeUniversityApplicationText,
  parseUniversityApplicationTimestamp,
  type CounselorUniversityApplication,
  type UniversityApplicationQueryResult,
} from "@/lib/counselor/university-application-management";
import {
  UNIVERSITY_APPLICATION_COUNTRY_CODE_PATTERN,
  UNIVERSITY_APPLICATION_DEGREE_LEVELS,
  UNIVERSITY_APPLICATION_INTAKE_TERMS,
  UNIVERSITY_APPLICATION_INTAKE_YEAR_MAX,
  UNIVERSITY_APPLICATION_INTAKE_YEAR_MIN,
  UNIVERSITY_APPLICATION_NAME_MAX_LENGTH,
  UNIVERSITY_APPLICATION_NAME_MIN_LENGTH,
  UNIVERSITY_APPLICATION_PORTAL_URL_MAX_LENGTH,
  UNIVERSITY_APPLICATION_PORTAL_URL_PATTERN,
  UNIVERSITY_APPLICATION_REASON_MAX_LENGTH,
  UNIVERSITY_APPLICATION_REFERENCE_MAX_LENGTH,
  UNIVERSITY_APPLICATION_STATUSES,
  UNIVERSITY_APPLICATION_STATUS_TRANSITIONS,
  UNIVERSITY_APPLICATION_TERMINAL_STATUSES,
} from "@/lib/counselor/university-applications";
import type {
  UniversityApplicationDegreeLevel,
  UniversityApplicationIntakeTerm,
  UniversityApplicationStatus,
} from "@/types";

export type UniversityApplicationOperation =
  | "create"
  | "details"
  | "status"
  | "primary"
  | "archive";

export type UniversityApplicationActionState = {
  status: "idle" | "error" | "success";
  operation?: UniversityApplicationOperation;
  message?: string;
  errors?: Record<string, string[]>;
};

export const initialUniversityApplicationActionState: UniversityApplicationActionState =
  { status: "idle" };

type StrictFieldsResult =
  | { success: true; values: Record<string, string> }
  | { success: false; errors: Record<string, string[]> };

type ApplicationDetailsInput = {
  studentId: string;
  applicationId?: string;
  countryCode: string;
  universityName: string;
  programmeName: string;
  degreeLevel: UniversityApplicationDegreeLevel;
  intakeTerm: UniversityApplicationIntakeTerm;
  intakeYear: number;
  applicationReference: string | null;
  portalUrl: string | null;
  submissionDeadline: string | null;
  changeReason?: string;
};

type TargetResult = {
  valid: boolean;
  error: unknown;
  application?: CounselorUniversityApplication;
};

type MutationResponse = Promise<UniversityApplicationQueryResult>;

type CreateStore = {
  verifyStudent: (studentId: string) => Promise<TargetResult>;
  create: (input: ApplicationDetailsInput) => MutationResponse;
};

type ApplicationMutationStore = {
  verifyTarget: (
    studentId: string,
    applicationId: string,
  ) => Promise<TargetResult>;
};

type DetailsStore = ApplicationMutationStore & {
  update: (
    input: ApplicationDetailsInput & {
      applicationId: string;
      changeReason: string;
    },
  ) => MutationResponse;
};

type StatusStore = ApplicationMutationStore & {
  updateStatus: (
    applicationId: string,
    status: UniversityApplicationStatus,
    reason: string,
  ) => MutationResponse;
};

type PrimaryStore = ApplicationMutationStore & {
  setPrimary: (applicationId: string, reason: string) => MutationResponse;
};

type ArchiveStore = ApplicationMutationStore & {
  archive: (applicationId: string, reason: string) => MutationResponse;
};

const timestampSchema = z
  .string()
  .refine((value) => parseUniversityApplicationTimestamp(value) !== null);
const mutationResultSchema = z
  .object({
    application_id: z.uuid(),
    student_id: z.uuid(),
    current_status: z.enum(UNIVERSITY_APPLICATION_STATUSES),
    is_primary: z.boolean(),
    is_archived: z.boolean(),
    version_number: z.number().int().min(1),
    created_at: timestampSchema,
    updated_at: timestampSchema,
    last_changed_at: timestampSchema,
  })
  .strict()
  .superRefine((result, context) => {
    const createdAt = parseUniversityApplicationTimestamp(
      result.created_at,
    );
    const updatedAt = parseUniversityApplicationTimestamp(
      result.updated_at,
    );
    const lastChangedAt = parseUniversityApplicationTimestamp(
      result.last_changed_at,
    );
    if (
      createdAt !== null &&
      updatedAt !== null &&
      lastChangedAt !== null &&
      (updatedAt < createdAt || updatedAt !== lastChangedAt)
    ) {
      context.addIssue({
        code: "custom",
        path: ["updated_at"],
        message: "Invalid mutation timestamps.",
      });
    }
  });
const archiveResultSchema = z
  .object({
    application_id: z.uuid(),
    student_id: z.uuid(),
    is_archived: z.literal(true),
    is_primary: z.literal(false),
    version_number: z.number().int().min(1),
    archived_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict()
  .superRefine((result, context) => {
    const archivedAt = parseUniversityApplicationTimestamp(
      result.archived_at,
    );
    const updatedAt = parseUniversityApplicationTimestamp(
      result.updated_at,
    );
    if (
      archivedAt !== null &&
      updatedAt !== null &&
      archivedAt !== updatedAt
    ) {
      context.addIssue({
        code: "custom",
        path: ["archived_at"],
        message: "Invalid archive timestamps.",
      });
    }
  });

const createFields = [
  "studentId",
  "countryCode",
  "universityName",
  "programmeName",
  "degreeLevel",
  "intakeTerm",
  "intakeYear",
  "applicationReference",
  "portalUrl",
  "submissionDeadline",
] as const;
const detailsFields = [
  ...createFields,
  "applicationId",
  "changeReason",
] as const;
const statusFields = [
  "studentId",
  "applicationId",
  "newStatus",
  "changeReason",
] as const;
const primaryFields = [
  "studentId",
  "applicationId",
  "changeReason",
] as const;
const archiveFields = [
  "studentId",
  "applicationId",
  "archiveReason",
] as const;

function addError(
  errors: Record<string, string[]>,
  field: string,
  message: string,
) {
  if (!errors[field]) errors[field] = [message];
}

function readStrictFields(
  formData: FormData,
  allowedFields: readonly string[],
): StrictFieldsResult {
  const allowed = new Set(allowedFields);
  const errors: Record<string, string[]> = {};
  for (const key of new Set(formData.keys())) {
    if (!allowed.has(key)) {
      addError(
        errors,
        "_form",
        "The submitted form contains an unsupported field.",
      );
    }
  }

  const values: Record<string, string> = {};
  for (const field of allowedFields) {
    const entries = formData.getAll(field);
    if (entries.length !== 1 || typeof entries[0] !== "string") {
      addError(errors, field, "Submit exactly one text value.");
    } else {
      values[field] = entries[0];
    }
  }
  return Object.keys(errors).length > 0
    ? { success: false, errors }
    : { success: true, values };
}

function hasControlCharacters(value: string): boolean {
  return /[\u0000-\u001f\u007f]/.test(value);
}

function normalizeOptionalText(value: string): string | null {
  const normalized = normalizeUniversityApplicationText(value);
  return normalized === "" ? null : normalized;
}

function isNullLikeValue(value: string): boolean {
  return /^(?:null|undefined)$/i.test(
    normalizeUniversityApplicationText(value),
  );
}

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function validateDetailsFields(
  formData: FormData,
  operation: "create" | "details",
):
  | { success: true; data: ApplicationDetailsInput }
  | { success: false; errors: Record<string, string[]> } {
  const fields = operation === "create" ? createFields : detailsFields;
  const strict = readStrictFields(formData, fields);
  if (!strict.success) return strict;
  const { values } = strict;
  const errors: Record<string, string[]> = {};

  const studentId = z.uuid().safeParse(values.studentId);
  if (!studentId.success) {
    addError(errors, "studentId", "Choose a valid student.");
  }
  const applicationId =
    operation === "details"
      ? z.uuid().safeParse(values.applicationId)
      : null;
  if (applicationId && !applicationId.success) {
    addError(errors, "applicationId", "Choose a valid application.");
  }

  const countryCode = values.countryCode.trim().toUpperCase();
  if (!UNIVERSITY_APPLICATION_COUNTRY_CODE_PATTERN.test(countryCode)) {
    addError(
      errors,
      "countryCode",
      "Enter a valid two-letter country code.",
    );
  }

  const universityName = normalizeUniversityApplicationText(
    values.universityName,
  );
  if (
    universityName.length < UNIVERSITY_APPLICATION_NAME_MIN_LENGTH ||
    universityName.length > UNIVERSITY_APPLICATION_NAME_MAX_LENGTH ||
    isNullLikeValue(values.universityName) ||
    hasControlCharacters(values.universityName)
  ) {
    addError(
      errors,
      "universityName",
      "Enter a university name between 2 and 200 characters.",
    );
  }
  const programmeName = normalizeUniversityApplicationText(
    values.programmeName,
  );
  if (
    programmeName.length < UNIVERSITY_APPLICATION_NAME_MIN_LENGTH ||
    programmeName.length > UNIVERSITY_APPLICATION_NAME_MAX_LENGTH ||
    isNullLikeValue(values.programmeName) ||
    hasControlCharacters(values.programmeName)
  ) {
    addError(
      errors,
      "programmeName",
      "Enter a programme name between 2 and 200 characters.",
    );
  }

  const degreeLevel = z
    .enum(UNIVERSITY_APPLICATION_DEGREE_LEVELS)
    .safeParse(values.degreeLevel);
  if (!degreeLevel.success) {
    addError(errors, "degreeLevel", "Choose a valid degree level.");
  }
  const intakeTerm = z
    .enum(UNIVERSITY_APPLICATION_INTAKE_TERMS)
    .safeParse(values.intakeTerm);
  if (!intakeTerm.success) {
    addError(errors, "intakeTerm", "Choose a valid intake term.");
  }
  const intakeYear = Number(values.intakeYear);
  if (
    !/^\d{4}$/.test(values.intakeYear) ||
    !Number.isInteger(intakeYear) ||
    intakeYear < UNIVERSITY_APPLICATION_INTAKE_YEAR_MIN ||
    intakeYear > UNIVERSITY_APPLICATION_INTAKE_YEAR_MAX
  ) {
    addError(errors, "intakeYear", "Enter a valid intake year.");
  }

  const applicationReference = normalizeOptionalText(
    values.applicationReference,
  );
  if (
    applicationReference !== null &&
    (applicationReference.length > UNIVERSITY_APPLICATION_REFERENCE_MAX_LENGTH ||
      isNullLikeValue(values.applicationReference) ||
      hasControlCharacters(values.applicationReference))
  ) {
    addError(
      errors,
      "applicationReference",
      "Enter a reference of 100 characters or fewer.",
    );
  }
  const portalUrl = values.portalUrl.trim() || null;
  if (
    portalUrl !== null &&
    (portalUrl.length > UNIVERSITY_APPLICATION_PORTAL_URL_MAX_LENGTH ||
      !UNIVERSITY_APPLICATION_PORTAL_URL_PATTERN.test(portalUrl))
  ) {
    addError(
      errors,
      "portalUrl",
      "Enter a valid HTTPS application portal URL or leave it blank.",
    );
  }
  const submissionDeadline = values.submissionDeadline.trim() || null;
  if (
    submissionDeadline !== null &&
    !isValidDate(submissionDeadline)
  ) {
    addError(
      errors,
      "submissionDeadline",
      "Enter a valid submission deadline or leave it blank.",
    );
  }

  let changeReason: string | undefined;
  if (operation === "details") {
    changeReason = normalizeUniversityApplicationText(
      values.changeReason,
    );
    if (
      changeReason.length < 1 ||
      changeReason.length > UNIVERSITY_APPLICATION_REASON_MAX_LENGTH ||
      isNullLikeValue(values.changeReason) ||
      hasControlCharacters(values.changeReason)
    ) {
      addError(
        errors,
        "changeReason",
        "Enter a change reason of 500 characters or fewer.",
      );
    }
  }

  if (
    Object.keys(errors).length > 0 ||
    !studentId.success ||
    !degreeLevel.success ||
    !intakeTerm.success ||
    (applicationId !== null && !applicationId.success)
  ) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      studentId: studentId.data,
      applicationId: applicationId?.data,
      countryCode,
      universityName,
      programmeName,
      degreeLevel: degreeLevel.data,
      intakeTerm: intakeTerm.data,
      intakeYear,
      applicationReference,
      portalUrl,
      submissionDeadline,
      changeReason,
    },
  };
}

function validateReasonOperation(
  formData: FormData,
  operation: "status" | "primary" | "archive",
):
  | {
      success: true;
      studentId: string;
      applicationId: string;
      reason: string;
      newStatus?: UniversityApplicationStatus;
    }
  | { success: false; errors: Record<string, string[]> } {
  const fields =
    operation === "status"
      ? statusFields
      : operation === "primary"
        ? primaryFields
        : archiveFields;
  const strict = readStrictFields(formData, fields);
  if (!strict.success) return strict;
  const { values } = strict;
  const errors: Record<string, string[]> = {};
  const studentId = z.uuid().safeParse(values.studentId);
  const applicationId = z.uuid().safeParse(values.applicationId);
  if (!studentId.success) {
    addError(errors, "studentId", "Choose a valid student.");
  }
  if (!applicationId.success) {
    addError(errors, "applicationId", "Choose a valid application.");
  }
  const reasonField =
    operation === "archive" ? "archiveReason" : "changeReason";
  const reason = normalizeUniversityApplicationText(
    values[reasonField],
  );
  if (
    reason.length < 1 ||
    reason.length > UNIVERSITY_APPLICATION_REASON_MAX_LENGTH ||
    isNullLikeValue(values[reasonField]) ||
    hasControlCharacters(values[reasonField])
  ) {
    addError(
      errors,
      reasonField,
      `Enter a ${operation === "archive" ? "archive" : "change"} reason of 500 characters or fewer.`,
    );
  }
  const newStatus =
    operation === "status"
      ? z.enum(UNIVERSITY_APPLICATION_STATUSES).safeParse(values.newStatus)
      : null;
  if (newStatus && !newStatus.success) {
    addError(errors, "newStatus", "Choose a valid application status.");
  }
  if (
    Object.keys(errors).length > 0 ||
    !studentId.success ||
    !applicationId.success ||
    (newStatus !== null && !newStatus.success)
  ) {
    return { success: false, errors };
  }
  return {
    success: true,
    studentId: studentId.data,
    applicationId: applicationId.data,
    reason,
    newStatus: newStatus?.data,
  };
}

function failure(
  operation: UniversityApplicationOperation,
  message: string,
  errors?: Record<string, string[]>,
): UniversityApplicationActionState {
  return { status: "error", operation, message, errors };
}

function genericMessage(operation: UniversityApplicationOperation): string {
  switch (operation) {
    case "create":
      return "University application could not be created.";
    case "details":
      return "Application details could not be updated.";
    case "status":
      return "Application status could not be changed.";
    case "primary":
      return "Primary application could not be changed.";
    case "archive":
      return "University application could not be archived.";
  }
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
  operation: UniversityApplicationOperation,
  error: unknown,
): UniversityApplicationActionState {
  if (readErrorCode(error) === "40001") {
    return failure(
      operation,
      "Another application update is in progress. Please try again.",
    );
  }
  if (readErrorCode(error) === "22023") {
    return failure(
      operation,
      "Application data has changed. Refresh and try again.",
    );
  }
  return failure(operation, genericMessage(operation));
}

function parseMutationResult(
  result: UniversityApplicationQueryResult,
  operation: UniversityApplicationOperation,
  studentId: string,
  applicationId?: string,
) {
  if (result.error) return databaseFailure(operation, result.error);
  const parsed = mutationResultSchema.safeParse(result.data);
  if (
    !parsed.success ||
    parsed.data.student_id !== studentId ||
    (applicationId !== undefined &&
      parsed.data.application_id !== applicationId)
  ) {
    return failure(operation, genericMessage(operation));
  }
  return parsed.data;
}

function detailsHaveChanged(
  application: CounselorUniversityApplication,
  input: ApplicationDetailsInput,
): boolean {
  return (
    application.countryCode !== input.countryCode ||
    application.universityName !== input.universityName ||
    application.programmeName !== input.programmeName ||
    application.degreeLevel !== input.degreeLevel ||
    application.intakeTerm !== input.intakeTerm ||
    application.intakeYear !== input.intakeYear ||
    application.applicationReference !== input.applicationReference ||
    application.portalUrl !== input.portalUrl ||
    application.submissionDeadline !== input.submissionDeadline
  );
}

async function verifyTarget(
  operation: UniversityApplicationOperation,
  store: ApplicationMutationStore,
  studentId: string,
  applicationId: string,
): Promise<
  | CounselorUniversityApplication
  | UniversityApplicationActionState
> {
  let target: TargetResult;
  try {
    target = await store.verifyTarget(studentId, applicationId);
  } catch {
    return failure(operation, genericMessage(operation));
  }
  if (
    target.error ||
    !target.valid ||
    !target.application ||
    target.application.id !== applicationId
  ) {
    return failure(operation, genericMessage(operation));
  }
  return target.application;
}

export async function submitCreateUniversityApplication(
  formData: FormData,
  store: CreateStore,
): Promise<UniversityApplicationActionState> {
  const validation = validateDetailsFields(formData, "create");
  if (!validation.success) {
    return failure(
      "create",
      "Check the highlighted application fields and try again.",
      validation.errors,
    );
  }
  const input = validation.data;
  let target: TargetResult;
  try {
    target = await store.verifyStudent(input.studentId);
  } catch {
    return failure("create", genericMessage("create"));
  }
  if (target.error || !target.valid) {
    return failure("create", genericMessage("create"));
  }

  let result: UniversityApplicationQueryResult;
  try {
    result = await store.create(input);
  } catch {
    return failure("create", genericMessage("create"));
  }
  const parsed = parseMutationResult(
    result,
    "create",
    input.studentId,
  );
  if ("status" in parsed) return parsed;
  if (
    parsed.current_status !== "planning" ||
    parsed.version_number !== 1 ||
    parsed.is_primary ||
    parsed.is_archived ||
    parseUniversityApplicationTimestamp(parsed.created_at) !==
      parseUniversityApplicationTimestamp(parsed.updated_at)
  ) {
    return failure("create", genericMessage("create"));
  }
  return {
    status: "success",
    operation: "create",
    message: "University application added.",
  };
}

export async function submitUpdateUniversityApplicationDetails(
  formData: FormData,
  store: DetailsStore,
): Promise<UniversityApplicationActionState> {
  const validation = validateDetailsFields(formData, "details");
  if (!validation.success) {
    return failure(
      "details",
      "Check the highlighted application fields and try again.",
      validation.errors,
    );
  }
  const input = validation.data;
  const applicationId = input.applicationId;
  if (!applicationId) {
    return failure("details", genericMessage("details"));
  }
  const target = await verifyTarget(
    "details",
    store,
    input.studentId,
    applicationId,
  );
  if ("status" in target) return target;
  if (target.isArchived) {
    return failure(
      "details",
      "This application is archived and cannot be changed.",
    );
  }
  if (!detailsHaveChanged(target, input)) {
    return failure(
      "details",
      "The application details have not changed.",
    );
  }

  let result: UniversityApplicationQueryResult;
  try {
    result = await store.update({
      ...input,
      applicationId,
      changeReason: input.changeReason ?? "",
    });
  } catch {
    return failure("details", genericMessage("details"));
  }
  const parsed = parseMutationResult(
    result,
    "details",
    input.studentId,
    applicationId,
  );
  if ("status" in parsed) return parsed;
  if (
    parsed.is_archived ||
    parsed.version_number <= target.versionNumber ||
    parsed.current_status !== target.currentStatus ||
    parsed.is_primary !== target.isPrimary
  ) {
    return failure("details", genericMessage("details"));
  }
  return {
    status: "success",
    operation: "details",
    message: "Application details updated.",
  };
}

export async function submitChangeUniversityApplicationStatus(
  formData: FormData,
  store: StatusStore,
): Promise<UniversityApplicationActionState> {
  const validation = validateReasonOperation(formData, "status");
  if (!validation.success || !validation.newStatus) {
    return failure(
      "status",
      "Check the highlighted status fields and try again.",
      validation.success ? undefined : validation.errors,
    );
  }
  const target = await verifyTarget(
    "status",
    store,
    validation.studentId,
    validation.applicationId,
  );
  if ("status" in target) return target;
  if (target.isArchived) {
    return failure(
      "status",
      "This application is archived and cannot be changed.",
    );
  }
  if (target.currentStatus === validation.newStatus) {
    return failure(
      "status",
      "This application is already in the selected status.",
    );
  }
  if (target.currentStatus === "closed") {
    return failure(
      "status",
      "This application is closed and cannot be changed.",
    );
  }
  if (target.currentStatus === "withdrawn") {
    return failure(
      "status",
      "This application is withdrawn and cannot be changed.",
    );
  }
  if (
    !UNIVERSITY_APPLICATION_STATUS_TRANSITIONS[
      target.currentStatus
    ].some((status) => status === validation.newStatus)
  ) {
    return failure("status", "This status change is not permitted.");
  }

  let result: UniversityApplicationQueryResult;
  try {
    result = await store.updateStatus(
      validation.applicationId,
      validation.newStatus,
      validation.reason,
    );
  } catch {
    return failure("status", genericMessage("status"));
  }
  const parsed = parseMutationResult(
    result,
    "status",
    validation.studentId,
    validation.applicationId,
  );
  if ("status" in parsed) return parsed;
  const terminalTargetStatus =
    UNIVERSITY_APPLICATION_TERMINAL_STATUSES.some(
      (status) => status === validation.newStatus,
    );
  if (
    parsed.current_status !== validation.newStatus ||
    parsed.is_archived ||
    parsed.version_number <= target.versionNumber ||
    parsed.is_primary !==
      (terminalTargetStatus ? false : target.isPrimary)
  ) {
    return failure("status", genericMessage("status"));
  }
  return {
    status: "success",
    operation: "status",
    message: "Application status updated.",
  };
}

export async function submitSetPrimaryUniversityApplication(
  formData: FormData,
  store: PrimaryStore,
): Promise<UniversityApplicationActionState> {
  const validation = validateReasonOperation(formData, "primary");
  if (!validation.success) {
    return failure(
      "primary",
      "Check the highlighted primary-application fields and try again.",
      validation.errors,
    );
  }
  const target = await verifyTarget(
    "primary",
    store,
    validation.studentId,
    validation.applicationId,
  );
  if ("status" in target) return target;
  if (target.isArchived) {
    return failure(
      "primary",
      "This application is archived and cannot be changed.",
    );
  }
  if (target.isPrimary) {
    return failure("primary", "This application is already primary.");
  }
  if (
    UNIVERSITY_APPLICATION_TERMINAL_STATUSES.some(
      (status) => status === target.currentStatus,
    )
  ) {
    return failure(
      "primary",
      "A closed or withdrawn application cannot be primary.",
    );
  }

  let result: UniversityApplicationQueryResult;
  try {
    result = await store.setPrimary(
      validation.applicationId,
      validation.reason,
    );
  } catch {
    return failure("primary", genericMessage("primary"));
  }
  const parsed = parseMutationResult(
    result,
    "primary",
    validation.studentId,
    validation.applicationId,
  );
  if ("status" in parsed) return parsed;
  if (
    !parsed.is_primary ||
    parsed.is_archived ||
    parsed.version_number <= target.versionNumber ||
    parsed.current_status !== target.currentStatus
  ) {
    return failure("primary", genericMessage("primary"));
  }
  return {
    status: "success",
    operation: "primary",
    message: "Primary application updated.",
  };
}

export async function submitArchiveUniversityApplication(
  formData: FormData,
  store: ArchiveStore,
): Promise<UniversityApplicationActionState> {
  const validation = validateReasonOperation(formData, "archive");
  if (!validation.success) {
    return failure(
      "archive",
      "Check the highlighted archive fields and try again.",
      validation.errors,
    );
  }
  const target = await verifyTarget(
    "archive",
    store,
    validation.studentId,
    validation.applicationId,
  );
  if ("status" in target) return target;
  if (target.isArchived) {
    return failure(
      "archive",
      "This application is already archived.",
    );
  }

  let result: UniversityApplicationQueryResult;
  try {
    result = await store.archive(
      validation.applicationId,
      validation.reason,
    );
  } catch {
    return failure("archive", genericMessage("archive"));
  }
  if (result.error) return databaseFailure("archive", result.error);
  const parsed = archiveResultSchema.safeParse(result.data);
  if (
    !parsed.success ||
    parsed.data.application_id !== validation.applicationId ||
    parsed.data.student_id !== validation.studentId ||
    parsed.data.version_number <= target.versionNumber
  ) {
    return failure("archive", genericMessage("archive"));
  }
  return {
    status: "success",
    operation: "archive",
    message: "University application archived.",
  };
}
