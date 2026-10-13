import { z } from "zod";
import { OFFICIAL_PROGRESSION_PAGE_SIZE } from "@/lib/counselor/progression";

export const PROGRESSION_EVIDENCE_BUCKET_ID =
  "counseling-progression-evidence";

export const PROGRESSION_EVIDENCE_MAX_BYTES = 10 * 1024 * 1024;
export const PROGRESSION_EVIDENCE_MAX_FILES_PER_EVENT = 5;
export const PROGRESSION_EVIDENCE_MAX_VISIBLE_ROWS =
  OFFICIAL_PROGRESSION_PAGE_SIZE *
  PROGRESSION_EVIDENCE_MAX_FILES_PER_EVENT;
export const PROGRESSION_EVIDENCE_UPLOAD_INTENT_SECONDS = 2 * 60 * 60;
export const PROGRESSION_EVIDENCE_SIGNED_VIEW_SECONDS = 5 * 60;
export const PROGRESSION_EVIDENCE_REMOVAL_REASON_MAX_LENGTH = 500;
export const PROGRESSION_EVIDENCE_FILE_NAME_MAX_LENGTH = 200;

export const PROGRESSION_EVIDENCE_AVAILABLE_COLUMNS =
  "id, progression_event_id, storage_path, original_file_name, mime_type, file_size_bytes, status, available_at" as const;

export const PROGRESSION_EVIDENCE_PENDING_COLUMNS =
  "id, progression_event_id, status, upload_expires_at" as const;

export const PROGRESSION_EVIDENCE_OPERATION_COLUMNS =
  "id, progression_event_id, bucket_id, storage_path, original_file_name, mime_type, file_size_bytes, status, uploaded_by, prepared_at, upload_expires_at, available_at, removed_at, removed_by, removal_reason, created_at, updated_at" as const;

export const PROGRESSION_EVIDENCE_MIME_TYPES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const PROGRESSION_EVIDENCE_EXTENSIONS = [
  "pdf",
  "docx",
  "jpg",
  "jpeg",
  "png",
  "webp",
] as const;

export type ProgressionEvidenceMimeType =
  (typeof PROGRESSION_EVIDENCE_MIME_TYPES)[number];

export type ProgressionEvidenceExtension =
  (typeof PROGRESSION_EVIDENCE_EXTENSIONS)[number];

export const PROGRESSION_EVIDENCE_ACCEPT = [
  ".pdf",
  ".docx",
  ".jpg",
  ".jpeg",
  ".png",
  ".webp",
  ...PROGRESSION_EVIDENCE_MIME_TYPES,
].join(",");

export const PROGRESSION_EVIDENCE_EXTENSIONS_BY_MIME = {
  "application/pdf": ["pdf"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    "docx",
  ],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
} as const satisfies Record<
  ProgressionEvidenceMimeType,
  readonly ProgressionEvidenceExtension[]
>;

export type ProgressionEvidenceFileDescriptor = {
  name: string;
  type: string;
  size: number;
};

export type ValidatedProgressionEvidenceFile = {
  originalFileName: string;
  mimeType: ProgressionEvidenceMimeType;
  fileSizeBytes: number;
  extension: ProgressionEvidenceExtension;
};

export type ProgressionEvidenceFileValidation =
  | { success: true; data: ValidatedProgressionEvidenceFile }
  | { success: false; message: string };

export type ProgressionEvidenceVisibleFile = {
  id: string;
  progressionEventId: string;
  originalFileName: string;
  mimeType: ProgressionEvidenceMimeType;
  fileSizeBytes: number;
  availableAt: string;
};

export type ProgressionEvidenceReadyResult = {
  kind: "ready";
  evidenceByEvent: Record<string, ProgressionEvidenceVisibleFile[]>;
  correctionBlockByEvent: Record<
    string,
    "available" | "pending" | null
  >;
};

export type ProgressionEvidenceLoadResult =
  | ProgressionEvidenceReadyResult
  | { kind: "unavailable" };

export type ProgressionEvidenceQueryResult = {
  data: unknown;
  error: unknown;
};

export type ProgressionEvidenceDataSource = {
  loadAvailable: (
    eventIds: string[],
    maximumRows: number,
  ) => Promise<ProgressionEvidenceQueryResult>;
  loadPending: (
    eventIds: string[],
    nowIso: string,
    maximumRows: number,
  ) => Promise<ProgressionEvidenceQueryResult>;
};

export type ProgressionEvidenceUploadIntent = {
  evidenceId: string;
  progressionEventId: string;
  bucketId: typeof PROGRESSION_EVIDENCE_BUCKET_ID;
  storagePath: string;
  originalFileName: string;
  mimeType: ProgressionEvidenceMimeType;
  fileSizeBytes: number;
  uploadExpiresAt: string;
};

export type TrustedProgressionEvidenceOperationRow = z.infer<
  typeof evidenceOperationRowSchema
>;

const uuidSchema = z.uuid();
const mimeTypeSchema = z.enum(PROGRESSION_EVIDENCE_MIME_TYPES);
const evidenceStatusSchema = z.enum(["pending", "available", "removed"]);
const timestampPattern =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const timestampSchema = z.string().refine(isValidEvidenceTimestamp);
const normalizedFileNameSchema = z
  .string()
  .min(1)
  .max(PROGRESSION_EVIDENCE_FILE_NAME_MAX_LENGTH)
  .refine((value) => normalizeProgressionEvidenceFileName(value) === value)
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value))
  .refine((value) => !value.includes("/") && !value.includes("\\"))
  .refine((value) => value !== "." && value !== "..")
  .refine((value) => getProgressionEvidenceExtension(value) !== null);

const availableEvidenceRowSchema = z
  .object({
    id: uuidSchema,
    progression_event_id: uuidSchema,
    storage_path: z.string().min(1),
    original_file_name: normalizedFileNameSchema,
    mime_type: mimeTypeSchema,
    file_size_bytes: z
      .number()
      .int()
      .min(1)
      .max(PROGRESSION_EVIDENCE_MAX_BYTES),
    status: z.literal("available"),
    available_at: timestampSchema,
  })
  .strict();

const pendingEvidenceRowSchema = z
  .object({
    id: uuidSchema,
    progression_event_id: uuidSchema,
    status: z.literal("pending"),
    upload_expires_at: timestampSchema,
  })
  .strict();

const uploadIntentRowSchema = z
  .object({
    evidence_id: uuidSchema,
    progression_event_id: uuidSchema,
    bucket_id: z.literal(PROGRESSION_EVIDENCE_BUCKET_ID),
    storage_path: z.string().min(1),
    original_file_name: normalizedFileNameSchema,
    mime_type: mimeTypeSchema,
    file_size_bytes: z
      .number()
      .int()
      .min(1)
      .max(PROGRESSION_EVIDENCE_MAX_BYTES),
    upload_expires_at: timestampSchema,
  })
  .strict();

const evidenceOperationRowSchema = z
  .object({
    id: uuidSchema,
    progression_event_id: uuidSchema,
    bucket_id: z.literal(PROGRESSION_EVIDENCE_BUCKET_ID),
    storage_path: z.string().min(1),
    original_file_name: normalizedFileNameSchema,
    mime_type: mimeTypeSchema,
    file_size_bytes: z
      .number()
      .int()
      .min(1)
      .max(PROGRESSION_EVIDENCE_MAX_BYTES),
    status: evidenceStatusSchema,
    uploaded_by: uuidSchema,
    prepared_at: timestampSchema,
    upload_expires_at: timestampSchema,
    available_at: timestampSchema.nullable(),
    removed_at: timestampSchema.nullable(),
    removed_by: uuidSchema.nullable(),
    removal_reason: z.string().min(1).max(500).nullable(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict();

const removedEvidenceRowSchema = z
  .object({
    evidence_id: uuidSchema,
    bucket_id: z.literal(PROGRESSION_EVIDENCE_BUCKET_ID),
    storage_path: z.string().min(1),
    status: z.literal("removed"),
    removed_at: timestampSchema,
  })
  .strict();

export function normalizeProgressionEvidenceFileName(value: string): string {
  return value.trim();
}

export function normalizeProgressionEvidenceRemovalReason(
  value: string,
): string {
  return value.trim().replace(/\s+/g, " ");
}

export function isValidEvidenceTimestamp(value: string): boolean {
  return timestampPattern.test(value) && !Number.isNaN(Date.parse(value));
}

export function getProgressionEvidenceExtension(
  fileName: string,
): ProgressionEvidenceExtension | null {
  const finalDot = fileName.lastIndexOf(".");
  if (finalDot <= 0 || finalDot === fileName.length - 1) return null;
  const extension = fileName.slice(finalDot + 1).toLowerCase();
  return PROGRESSION_EVIDENCE_EXTENSIONS.find(
    (candidate) => candidate === extension,
  ) ?? null;
}

export function isProgressionEvidenceMimeType(
  value: string,
): value is ProgressionEvidenceMimeType {
  return PROGRESSION_EVIDENCE_MIME_TYPES.some(
    (mimeType) => mimeType === value,
  );
}

export function validateProgressionEvidenceFile(
  file: ProgressionEvidenceFileDescriptor,
): ProgressionEvidenceFileValidation {
  const originalFileName = normalizeProgressionEvidenceFileName(file.name);
  if (
    originalFileName !== file.name ||
    !normalizedFileNameSchema.safeParse(originalFileName).success
  ) {
    return {
      success: false,
      message: "Select a supported PDF, DOCX or image file.",
    };
  }

  if (!Number.isSafeInteger(file.size) || file.size < 1) {
    return { success: false, message: "The file must not be empty." };
  }
  if (file.size > PROGRESSION_EVIDENCE_MAX_BYTES) {
    return {
      success: false,
      message: "The file must be 10 MiB or smaller.",
    };
  }

  const extension = getProgressionEvidenceExtension(originalFileName);
  const normalizedMimeType = file.type.trim().toLowerCase();
  if (!extension || !isProgressionEvidenceMimeType(normalizedMimeType)) {
    return {
      success: false,
      message: "Select a supported PDF, DOCX or image file.",
    };
  }
  if (
    !PROGRESSION_EVIDENCE_EXTENSIONS_BY_MIME[
      normalizedMimeType
    ].some((candidate) => candidate === extension)
  ) {
    return {
      success: false,
      message: "The filename and file type do not match.",
    };
  }

  return {
    success: true,
    data: {
      originalFileName,
      mimeType: normalizedMimeType,
      fileSizeBytes: file.size,
      extension,
    },
  };
}

export function isProgressionEvidenceStoragePath(
  value: string,
  studentId: string,
  progressionEventId: string,
  evidenceId: string,
  extension: ProgressionEvidenceExtension,
): boolean {
  return (
    value ===
    `${studentId}/${progressionEventId}/${evidenceId}.${extension}`
  );
}

export function parseProgressionEvidenceUploadIntent(
  value: unknown,
  input: ValidatedProgressionEvidenceFile & {
    studentId: string;
    progressionEventId: string;
  },
  now = new Date(),
): ProgressionEvidenceUploadIntent | null {
  const parsed = uploadIntentRowSchema.safeParse(value);
  if (!parsed.success || Number.isNaN(now.getTime())) return null;
  const row = parsed.data;
  const expiry = Date.parse(row.upload_expires_at);
  const maximumExpiry =
    now.getTime() +
    (PROGRESSION_EVIDENCE_UPLOAD_INTENT_SECONDS + 60) * 1000;
  if (
    row.progression_event_id !== input.progressionEventId ||
    row.original_file_name !== input.originalFileName ||
    row.mime_type !== input.mimeType ||
    row.file_size_bytes !== input.fileSizeBytes ||
    expiry <= now.getTime() ||
    expiry > maximumExpiry ||
    !isProgressionEvidenceStoragePath(
      row.storage_path,
      input.studentId,
      input.progressionEventId,
      row.evidence_id,
      input.extension,
    )
  ) {
    return null;
  }

  return {
    evidenceId: row.evidence_id,
    progressionEventId: row.progression_event_id,
    bucketId: row.bucket_id,
    storagePath: row.storage_path,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    uploadExpiresAt: row.upload_expires_at,
  };
}

export function parseAvailableProgressionEvidenceMutation(
  value: unknown,
  expected: {
    studentId: string;
    progressionEventId: string;
    evidenceId: string;
  },
): ProgressionEvidenceVisibleFile | null {
  const parsed = evidenceOperationRowSchema.safeParse(value);
  if (!parsed.success) return null;
  const row = parsed.data;
  const extension = getProgressionEvidenceExtension(
    row.original_file_name,
  );
  if (
    row.id !== expected.evidenceId ||
    row.progression_event_id !== expected.progressionEventId ||
    row.status !== "available" ||
    row.available_at === null ||
    row.removed_at !== null ||
    row.removed_by !== null ||
    row.removal_reason !== null ||
    !extension ||
    !PROGRESSION_EVIDENCE_EXTENSIONS_BY_MIME[row.mime_type].some(
      (candidate) => candidate === extension,
    ) ||
    !isProgressionEvidenceStoragePath(
      row.storage_path,
      expected.studentId,
      expected.progressionEventId,
      expected.evidenceId,
      extension,
    )
  ) {
    return null;
  }
  return {
    id: row.id,
    progressionEventId: row.progression_event_id,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    availableAt: row.available_at,
  };
}

export function parseTrustedProgressionEvidenceOperationRow(
  value: unknown,
  expected: {
    studentId: string;
    progressionEventId: string;
    evidenceId: string;
    status: "pending" | "available";
  },
): TrustedProgressionEvidenceOperationRow | null {
  const parsed = evidenceOperationRowSchema.safeParse(value);
  if (!parsed.success) return null;
  const row = parsed.data;
  const extension = getProgressionEvidenceExtension(
    row.original_file_name,
  );
  if (
    row.id !== expected.evidenceId ||
    row.progression_event_id !== expected.progressionEventId ||
    row.status !== expected.status ||
    !extension ||
    !PROGRESSION_EVIDENCE_EXTENSIONS_BY_MIME[row.mime_type].some(
      (candidate) => candidate === extension,
    ) ||
    !isProgressionEvidenceStoragePath(
      row.storage_path,
      expected.studentId,
      expected.progressionEventId,
      expected.evidenceId,
      extension,
    )
  ) {
    return null;
  }
  return row;
}

export function isRemovedProgressionEvidenceMutation(
  value: unknown,
  expected: {
    studentId: string;
    progressionEventId: string;
    evidenceId: string;
    originalFileName: string;
  },
): boolean {
  const parsed = removedEvidenceRowSchema.safeParse(value);
  const extension = getProgressionEvidenceExtension(
    expected.originalFileName,
  );
  return Boolean(
    parsed.success &&
      extension &&
      parsed.data.evidence_id === expected.evidenceId &&
      isProgressionEvidenceStoragePath(
        parsed.data.storage_path,
        expected.studentId,
        expected.progressionEventId,
        expected.evidenceId,
        extension,
      ),
  );
}

export async function fetchAvailableProgressionEvidence(
  trustedStudentId: string,
  progressionEventIds: string[],
  source: ProgressionEvidenceDataSource,
  now = new Date(),
): Promise<ProgressionEvidenceLoadResult> {
  const uniqueEventIds = [...new Set(progressionEventIds)];
  if (
    !uuidSchema.safeParse(trustedStudentId).success ||
    Number.isNaN(now.getTime()) ||
    uniqueEventIds.length !== progressionEventIds.length ||
    uniqueEventIds.length > OFFICIAL_PROGRESSION_PAGE_SIZE ||
    uniqueEventIds.some((eventId) => !uuidSchema.safeParse(eventId).success)
  ) {
    return { kind: "unavailable" };
  }
  if (uniqueEventIds.length === 0) {
    return {
      kind: "ready",
      evidenceByEvent: {},
      correctionBlockByEvent: {},
    };
  }

  let availableResult: ProgressionEvidenceQueryResult;
  let pendingResult: ProgressionEvidenceQueryResult;
  try {
    [availableResult, pendingResult] = await Promise.all([
      source.loadAvailable(
        uniqueEventIds,
        PROGRESSION_EVIDENCE_MAX_VISIBLE_ROWS + 1,
      ),
      source.loadPending(
        uniqueEventIds,
        now.toISOString(),
        PROGRESSION_EVIDENCE_MAX_VISIBLE_ROWS + 1,
      ),
    ]);
  } catch {
    return { kind: "unavailable" };
  }
  if (availableResult.error || pendingResult.error) {
    return { kind: "unavailable" };
  }

  const availableRows = z
    .array(availableEvidenceRowSchema)
    .max(PROGRESSION_EVIDENCE_MAX_VISIBLE_ROWS)
    .safeParse(availableResult.data);
  const pendingRows = z
    .array(pendingEvidenceRowSchema)
    .max(PROGRESSION_EVIDENCE_MAX_VISIBLE_ROWS)
    .safeParse(pendingResult.data);
  if (!availableRows.success || !pendingRows.success) {
    return { kind: "unavailable" };
  }

  const eventIdSet = new Set(uniqueEventIds);
  const evidenceIds = new Set<string>();
  const storagePaths = new Set<string>();
  const evidenceByEvent: Record<
    string,
    ProgressionEvidenceVisibleFile[]
  > = Object.fromEntries(uniqueEventIds.map((eventId) => [eventId, []]));
  const correctionBlockByEvent: Record<
    string,
    "available" | "pending" | null
  > = Object.fromEntries(uniqueEventIds.map((eventId) => [eventId, null]));

  for (const row of availableRows.data) {
    const extension = getProgressionEvidenceExtension(
      row.original_file_name,
    );
    if (
      !eventIdSet.has(row.progression_event_id) ||
      evidenceIds.has(row.id) ||
      storagePaths.has(row.storage_path) ||
      !extension ||
      !PROGRESSION_EVIDENCE_EXTENSIONS_BY_MIME[row.mime_type].some(
        (candidate) => candidate === extension,
      ) ||
      !isProgressionEvidenceStoragePath(
        row.storage_path,
        trustedStudentId,
        row.progression_event_id,
        row.id,
        extension,
      )
    ) {
      return { kind: "unavailable" };
    }
    const eventEvidence = evidenceByEvent[row.progression_event_id];
    if (
      !eventEvidence ||
      eventEvidence.length >= PROGRESSION_EVIDENCE_MAX_FILES_PER_EVENT
    ) {
      return { kind: "unavailable" };
    }
    evidenceIds.add(row.id);
    storagePaths.add(row.storage_path);
    correctionBlockByEvent[row.progression_event_id] = "available";
    eventEvidence.push({
      id: row.id,
      progressionEventId: row.progression_event_id,
      originalFileName: row.original_file_name,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes,
      availableAt: row.available_at,
    });
  }

  for (const row of pendingRows.data) {
    if (
      !eventIdSet.has(row.progression_event_id) ||
      evidenceIds.has(row.id) ||
      Date.parse(row.upload_expires_at) <= now.getTime()
    ) {
      return { kind: "unavailable" };
    }
    evidenceIds.add(row.id);
    if (correctionBlockByEvent[row.progression_event_id] === null) {
      correctionBlockByEvent[row.progression_event_id] = "pending";
    }
  }

  return {
    kind: "ready",
    evidenceByEvent,
    correctionBlockByEvent,
  };
}

export function formatProgressionEvidenceSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  const mebibytes = bytes / (1024 * 1024);
  return `${mebibytes.toFixed(mebibytes >= 10 ? 0 : 1)} MiB`;
}

export function getProgressionEvidenceTypeLabel(
  mimeType: ProgressionEvidenceMimeType,
): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      return "DOCX";
    case "image/jpeg":
      return "JPEG";
    case "image/png":
      return "PNG";
    case "image/webp":
      return "WebP";
    default: {
      const exhaustive: never = mimeType;
      return exhaustive;
    }
  }
}
