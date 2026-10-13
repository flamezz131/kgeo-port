import { z } from "zod";
import type {
  CounselorUniversityApplicationDocument,
  UniversityApplicationDocumentMetadata,
  UniversityApplicationDocumentMimeType,
  UniversityApplicationDocumentStatus,
} from "@/types";

export const UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID =
  "university-application-documents";
export const UNIVERSITY_APPLICATION_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const UNIVERSITY_APPLICATION_DOCUMENT_MAX_ACTIVE = 20;
export const UNIVERSITY_APPLICATION_DOCUMENT_UPLOAD_INTENT_SECONDS =
  2 * 60 * 60;
export const UNIVERSITY_APPLICATION_DOCUMENT_SIGNED_VIEW_SECONDS = 5 * 60;
export const UNIVERSITY_APPLICATION_DOCUMENT_TITLE_MAX_LENGTH = 100;
export const UNIVERSITY_APPLICATION_DOCUMENT_FILE_NAME_MAX_LENGTH = 255;
export const UNIVERSITY_APPLICATION_DOCUMENT_REMOVAL_REASON_MAX_LENGTH = 500;
export const UNIVERSITY_APPLICATION_DOCUMENT_ACCEPT =
  "application/pdf,image/jpeg,image/png,image/webp";

export const UNIVERSITY_APPLICATION_DOCUMENT_STATUSES = [
  "pending",
  "available",
  "removed",
] as const satisfies readonly UniversityApplicationDocumentStatus[];

export const UNIVERSITY_APPLICATION_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
] as const satisfies readonly UniversityApplicationDocumentMimeType[];

export const UNIVERSITY_APPLICATION_DOCUMENT_EXTENSIONS = [
  "pdf",
  "jpg",
  "jpeg",
  "png",
  "webp",
] as const;

export type UniversityApplicationDocumentExtension =
  (typeof UNIVERSITY_APPLICATION_DOCUMENT_EXTENSIONS)[number];

export const UNIVERSITY_APPLICATION_DOCUMENT_EXTENSIONS_BY_MIME = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
  "image/webp": ["webp"],
} as const satisfies Record<
  UniversityApplicationDocumentMimeType,
  readonly UniversityApplicationDocumentExtension[]
>;

export type UniversityApplicationDocumentFileDescriptor = {
  name: string;
  type: string;
  size: number;
};

export type ValidatedUniversityApplicationDocumentFile = {
  originalFileName: string;
  mimeType: UniversityApplicationDocumentMimeType;
  fileSizeBytes: number;
  extension: UniversityApplicationDocumentExtension;
};

export type UniversityApplicationDocumentValidation<T> =
  | { success: true; data: T }
  | { success: false; message: string };

export type PrepareUniversityApplicationDocumentUploadArgs = {
  applicationId: string;
  documentTitle: string;
  originalFileName: string;
  mimeType: UniversityApplicationDocumentMimeType;
  fileSizeBytes: number;
};

export type PrepareUniversityApplicationDocumentUploadResult = {
  documentId: string;
  applicationId: string;
  bucketId: typeof UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID;
  storagePath: string;
  documentTitle: string;
  originalFileName: string;
  mimeType: UniversityApplicationDocumentMimeType;
  fileSizeBytes: number;
  uploadExpiresAt: string;
};

export type FinalizeUniversityApplicationDocumentUploadArgs = {
  documentId: string;
};

export type FinalizeUniversityApplicationDocumentUploadResult =
  CounselorUniversityApplicationDocument & {
    status: "available";
  };

export type ListUniversityApplicationDocumentsArgs = {
  applicationId: string;
};

export type ListUniversityApplicationDocumentsResult =
  CounselorUniversityApplicationDocument[];

export type AuthorizeUniversityApplicationDocumentViewArgs = {
  applicationId: string;
  documentId: string;
};

export type UniversityApplicationDocumentViewAuthorization = {
  documentId: string;
  applicationId: string;
  bucketId: typeof UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID;
  storagePath: string;
};

export type SoftRemoveUniversityApplicationDocumentArgs = {
  documentId: string;
  removalReason: string;
};

export type SoftRemoveUniversityApplicationDocumentResult = {
  documentId: string;
  applicationId: string;
  status: "removed";
  removedAt: string;
};

const uuidSchema = z.uuid();
const timestampPattern =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(?:Z|([+-])(\d{2}):(\d{2}))$/;
const unsafeUnicodeControlPattern =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
const timestampSchema = z.string().refine(isUniversityApplicationDocumentTimestamp);
const statusSchema = z.enum(UNIVERSITY_APPLICATION_DOCUMENT_STATUSES);
const mimeTypeSchema = z.enum(UNIVERSITY_APPLICATION_DOCUMENT_MIME_TYPES);

const documentTitleSchema = z
  .string()
  .min(2)
  .max(UNIVERSITY_APPLICATION_DOCUMENT_TITLE_MAX_LENGTH)
  .refine((value) => normalizeUniversityApplicationDocumentText(value) === value)
  .refine((value) => !unsafeUnicodeControlPattern.test(value));

const originalFileNameSchema = z
  .string()
  .min(1)
  .max(UNIVERSITY_APPLICATION_DOCUMENT_FILE_NAME_MAX_LENGTH)
  .refine(
    (value) => normalizeUniversityApplicationDocumentFileName(value) === value,
  )
  .refine((value) => !unsafeUnicodeControlPattern.test(value))
  .refine((value) => !value.includes("/") && !value.includes("\\"))
  .refine((value) => !value.includes(".."))
  .regex(/^[^.]+\.[^.]+$/)
  .refine((value) => getUniversityApplicationDocumentExtension(value) !== null);

const removalReasonSchema = z
  .string()
  .min(1)
  .max(UNIVERSITY_APPLICATION_DOCUMENT_REMOVAL_REASON_MAX_LENGTH)
  .refine((value) => normalizeUniversityApplicationDocumentText(value) === value)
  .refine((value) => !unsafeUnicodeControlPattern.test(value));

function hasMatchingUniversityApplicationDocumentFileMetadata(
  fileName: string,
  mimeType: UniversityApplicationDocumentMimeType,
): boolean {
  const extension = getUniversityApplicationDocumentExtension(fileName);
  return (
    extension !== null &&
    UNIVERSITY_APPLICATION_DOCUMENT_EXTENSIONS_BY_MIME[mimeType].some(
      (candidate) => candidate === extension,
    )
  );
}

function addInvalidRelationalRowIssue(context: z.RefinementCtx): void {
  context.addIssue({
    code: "custom",
    message: "Invalid university application document relationship.",
  });
}

const safeDocumentRowShape = {
  document_id: uuidSchema,
  application_id: uuidSchema,
  document_title: documentTitleSchema,
  original_file_name: originalFileNameSchema,
  mime_type: mimeTypeSchema,
  file_size_bytes: z
    .number()
    .int()
    .min(1)
    .max(UNIVERSITY_APPLICATION_DOCUMENT_MAX_BYTES),
  available_at: timestampSchema,
} as const;

function validateUniversityApplicationDocumentFileMetadataRelationship(
  row: { original_file_name: string; mime_type: UniversityApplicationDocumentMimeType },
  context: z.RefinementCtx,
): void {
  if (
    !hasMatchingUniversityApplicationDocumentFileMetadata(
      row.original_file_name,
      row.mime_type,
    )
  ) {
    addInvalidRelationalRowIssue(context);
  }
}

const safeDocumentRowSchema = z
  .object(safeDocumentRowShape)
  .strict()
  .superRefine(validateUniversityApplicationDocumentFileMetadataRelationship);

const prepareUploadRowSchema = z
  .object({
    document_id: uuidSchema,
    application_id: uuidSchema,
    bucket_id: z.literal(UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID),
    storage_path: z.string().min(1),
    document_title: documentTitleSchema,
    original_file_name: originalFileNameSchema,
    mime_type: mimeTypeSchema,
    file_size_bytes: z
      .number()
      .int()
      .min(1)
      .max(UNIVERSITY_APPLICATION_DOCUMENT_MAX_BYTES),
    upload_expires_at: timestampSchema,
  })
  .strict()
  .superRefine(validateUniversityApplicationDocumentFileMetadataRelationship);

const finalizeUploadRowSchema = z
  .object({ ...safeDocumentRowShape, status: z.literal("available") })
  .strict()
  .superRefine(validateUniversityApplicationDocumentFileMetadataRelationship);

const viewAuthorizationRowSchema = z
  .object({
    document_id: uuidSchema,
    application_id: uuidSchema,
    bucket_id: z.literal(UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID),
    storage_path: z.string().min(1),
  })
  .strict();

const softRemoveRowSchema = z
  .object({
    document_id: uuidSchema,
    application_id: uuidSchema,
    status: z.literal("removed"),
    removed_at: timestampSchema,
  })
  .strict();

const metadataRowSchema = z
  .object({
    id: uuidSchema,
    application_id: uuidSchema,
    status: statusSchema,
    document_title: documentTitleSchema,
    original_file_name: originalFileNameSchema,
    bucket_id: z.literal(UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID),
    storage_path: z.string().min(1),
    mime_type: mimeTypeSchema,
    file_size_bytes: z
      .number()
      .int()
      .min(1)
      .max(UNIVERSITY_APPLICATION_DOCUMENT_MAX_BYTES),
    uploaded_by: uuidSchema,
    prepared_at: timestampSchema,
    upload_expires_at: timestampSchema,
    available_at: timestampSchema.nullable(),
    removed_at: timestampSchema.nullable(),
    removed_by: uuidSchema.nullable(),
    removal_reason: removalReasonSchema.nullable(),
    created_at: timestampSchema,
    updated_at: timestampSchema,
  })
  .strict()
  .superRefine((row, context) => {
    const extension = getUniversityApplicationDocumentExtension(
      row.original_file_name,
    );
    if (
      !hasMatchingUniversityApplicationDocumentFileMetadata(
        row.original_file_name,
        row.mime_type,
      ) ||
      extension === null ||
      !isUniversityApplicationDocumentStoragePath(
        row.storage_path,
        row.application_id,
        row.id,
        extension,
      )
    ) {
      addInvalidRelationalRowIssue(context);
      return;
    }

    const preparedAt = parseUniversityApplicationDocumentTimestamp(row.prepared_at);
    const uploadExpiresAt = parseUniversityApplicationDocumentTimestamp(
      row.upload_expires_at,
    );
    const createdAt = parseUniversityApplicationDocumentTimestamp(row.created_at);
    const updatedAt = parseUniversityApplicationDocumentTimestamp(row.updated_at);
    const availableAt = row.available_at
      ? parseUniversityApplicationDocumentTimestamp(row.available_at)
      : null;
    const removedAt = row.removed_at
      ? parseUniversityApplicationDocumentTimestamp(row.removed_at)
      : null;

    if (
      preparedAt === null ||
      uploadExpiresAt === null ||
      createdAt === null ||
      updatedAt === null ||
      uploadExpiresAt - preparedAt !==
        UNIVERSITY_APPLICATION_DOCUMENT_UPLOAD_INTENT_SECONDS * 1000 ||
      createdAt !== preparedAt
    ) {
      addInvalidRelationalRowIssue(context);
      return;
    }

    const pendingIsValid =
      row.status === "pending" &&
      availableAt === null &&
      removedAt === null &&
      row.removed_by === null &&
      row.removal_reason === null &&
      updatedAt === preparedAt;
    const availableIsValid =
      row.status === "available" &&
      availableAt !== null &&
      availableAt >= preparedAt &&
      availableAt <= uploadExpiresAt &&
      removedAt === null &&
      row.removed_by === null &&
      row.removal_reason === null &&
      updatedAt === availableAt;
    const removedIsValid =
      row.status === "removed" &&
      availableAt !== null &&
      availableAt >= preparedAt &&
      availableAt <= uploadExpiresAt &&
      removedAt !== null &&
      removedAt >= availableAt &&
      row.removed_by !== null &&
      row.removal_reason !== null &&
      updatedAt === removedAt;

    if (!pendingIsValid && !availableIsValid && !removedIsValid) {
      addInvalidRelationalRowIssue(context);
    }
  });

export function normalizeUniversityApplicationDocumentText(
  value: string,
): string {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeUniversityApplicationDocumentFileName(
  value: string,
): string {
  return value.trim();
}

export function isUniversityApplicationDocumentUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

export function isUniversityApplicationDocumentTimestamp(
  value: string,
): boolean {
  return parseUniversityApplicationDocumentTimestamp(value) !== null;
}

function parseUniversityApplicationDocumentTimestamp(value: string): number | null {
  const match = timestampPattern.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = Number((match[7] ?? "").padEnd(3, "0").slice(0, 3));
  const offsetSign = match[8];
  const offsetHour = Number(match[9] ?? 0);
  const offsetMinute = Number(match[10] ?? 0);

  if (
    year < 1 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > 31 ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 23 ||
    offsetMinute > 59
  ) {
    return null;
  }

  const localDate = new Date(0);
  localDate.setUTCFullYear(year, month - 1, day);
  localDate.setUTCHours(hour, minute, second, millisecond);
  if (
    localDate.getUTCFullYear() !== year ||
    localDate.getUTCMonth() !== month - 1 ||
    localDate.getUTCDate() !== day ||
    localDate.getUTCHours() !== hour ||
    localDate.getUTCMinutes() !== minute ||
    localDate.getUTCSeconds() !== second
  ) {
    return null;
  }

  const offsetMilliseconds =
    (offsetHour * 60 + offsetMinute) * 60 * 1000 *
    (offsetSign === "-" ? -1 : 1);
  const timestamp = localDate.getTime() - offsetMilliseconds;
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getUniversityApplicationDocumentExtension(
  fileName: string,
): UniversityApplicationDocumentExtension | null {
  const finalDot = fileName.lastIndexOf(".");
  if (finalDot <= 0 || finalDot === fileName.length - 1) return null;
  const extension = fileName.slice(finalDot + 1).toLowerCase();
  return (
    UNIVERSITY_APPLICATION_DOCUMENT_EXTENSIONS.find(
      (candidate) => candidate === extension,
    ) ?? null
  );
}

export function isUniversityApplicationDocumentMimeType(
  value: string,
): value is UniversityApplicationDocumentMimeType {
  return UNIVERSITY_APPLICATION_DOCUMENT_MIME_TYPES.some(
    (mimeType) => mimeType === value,
  );
}

export function getUniversityApplicationDocumentMimeLabel(
  mimeType: UniversityApplicationDocumentMimeType,
): string {
  switch (mimeType) {
    case "application/pdf":
      return "PDF";
    case "image/jpeg":
      return "JPEG image";
    case "image/png":
      return "PNG image";
    case "image/webp":
      return "WebP image";
  }
}

export function formatUniversityApplicationDocumentSize(
  fileSizeBytes: number,
): string {
  if (!Number.isSafeInteger(fileSizeBytes) || fileSizeBytes < 1) {
    return "Unknown size";
  }
  if (fileSizeBytes < 1024) return `${fileSizeBytes} B`;
  if (fileSizeBytes < 1024 * 1024) {
    return `${(fileSizeBytes / 1024).toFixed(1)} KiB`;
  }
  return `${(fileSizeBytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function validateUniversityApplicationDocumentTitle(
  value: string,
): UniversityApplicationDocumentValidation<string> {
  const normalized = normalizeUniversityApplicationDocumentText(value);
  if (
    unsafeUnicodeControlPattern.test(value) ||
    !documentTitleSchema.safeParse(normalized).success
  ) {
    return {
      success: false,
      message: "Enter a document title between 2 and 100 characters.",
    };
  }
  return { success: true, data: normalized };
}

export function validateUniversityApplicationDocumentRemovalReason(
  value: string,
): UniversityApplicationDocumentValidation<string> {
  const normalized = normalizeUniversityApplicationDocumentText(value);
  if (
    unsafeUnicodeControlPattern.test(value) ||
    normalized.length < 1 ||
    normalized.length >
      UNIVERSITY_APPLICATION_DOCUMENT_REMOVAL_REASON_MAX_LENGTH ||
    unsafeUnicodeControlPattern.test(normalized)
  ) {
    return {
      success: false,
      message: "Enter a valid removal reason.",
    };
  }
  return { success: true, data: normalized };
}

export function validateUniversityApplicationDocumentFile(
  file: UniversityApplicationDocumentFileDescriptor,
): UniversityApplicationDocumentValidation<ValidatedUniversityApplicationDocumentFile> {
  const originalFileName = normalizeUniversityApplicationDocumentFileName(
    file.name,
  );
  if (
    file.name !== originalFileName ||
    unsafeUnicodeControlPattern.test(file.name) ||
    !originalFileNameSchema.safeParse(originalFileName).success
  ) {
    return {
      success: false,
      message: "Select a supported PDF or image file.",
    };
  }

  if (!Number.isSafeInteger(file.size) || file.size < 1) {
    return { success: false, message: "The file must not be empty." };
  }
  if (file.size > UNIVERSITY_APPLICATION_DOCUMENT_MAX_BYTES) {
    return {
      success: false,
      message: "The file must be 10 MiB or smaller.",
    };
  }

  const extension = getUniversityApplicationDocumentExtension(originalFileName);
  const normalizedMimeType = file.type.trim().toLowerCase();
  if (!extension || !isUniversityApplicationDocumentMimeType(normalizedMimeType)) {
    return {
      success: false,
      message: "Select a supported PDF or image file.",
    };
  }
  if (
    !UNIVERSITY_APPLICATION_DOCUMENT_EXTENSIONS_BY_MIME[
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

export function isUniversityApplicationDocumentStoragePath(
  value: string,
  applicationId: string,
  documentId: string,
  extension: UniversityApplicationDocumentExtension,
): boolean {
  const segments = value.split("/");
  return (
    segments.length === 5 &&
    segments[0] === "applications" &&
    isUniversityApplicationDocumentUuid(segments[1] ?? "") &&
    segments[2] === applicationId &&
    segments[3] === documentId &&
    segments[4] === `${documentId}.${extension}` &&
    value === value.toLowerCase()
  );
}

export function parsePrepareUniversityApplicationDocumentUploadResult(
  value: unknown,
  expected: PrepareUniversityApplicationDocumentUploadArgs,
  now = new Date(),
): PrepareUniversityApplicationDocumentUploadResult | null {
  const parsed = prepareUploadRowSchema.safeParse(value);
  if (!parsed.success || Number.isNaN(now.getTime())) return null;
  const row = parsed.data;
  const extension = getUniversityApplicationDocumentExtension(
    row.original_file_name,
  );
  const expiry = parseUniversityApplicationDocumentTimestamp(row.upload_expires_at);
  const maximumExpiry =
    now.getTime() +
    (UNIVERSITY_APPLICATION_DOCUMENT_UPLOAD_INTENT_SECONDS + 60) * 1000;
  if (
    row.application_id !== expected.applicationId ||
    row.document_title !== expected.documentTitle ||
    row.original_file_name !== expected.originalFileName ||
    row.mime_type !== expected.mimeType ||
    row.file_size_bytes !== expected.fileSizeBytes ||
    !extension ||
    expiry === null ||
    expiry <= now.getTime() ||
    expiry > maximumExpiry ||
    !isUniversityApplicationDocumentStoragePath(
      row.storage_path,
      row.application_id,
      row.document_id,
      extension,
    )
  ) {
    return null;
  }

  return {
    documentId: row.document_id,
    applicationId: row.application_id,
    bucketId: row.bucket_id,
    storagePath: row.storage_path,
    documentTitle: row.document_title,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    uploadExpiresAt: row.upload_expires_at,
  };
}

function mapSafeDocumentRow(
  row: z.infer<typeof safeDocumentRowSchema>,
): CounselorUniversityApplicationDocument {
  return {
    documentId: row.document_id,
    applicationId: row.application_id,
    documentTitle: row.document_title,
    originalFileName: row.original_file_name,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    availableAt: row.available_at,
  };
}

export function parseUniversityApplicationDocumentList(
  value: unknown,
  applicationId: string,
): ListUniversityApplicationDocumentsResult | null {
  if (!Array.isArray(value) || value.length > UNIVERSITY_APPLICATION_DOCUMENT_MAX_ACTIVE) {
    return null;
  }
  const documents: CounselorUniversityApplicationDocument[] = [];
  const documentIds = new Set<string>();
  let previous: { availableAt: number; documentId: string } | null = null;

  for (const candidate of value) {
    const parsed = safeDocumentRowSchema.safeParse(candidate);
    if (
      !parsed.success ||
      parsed.data.application_id !== applicationId ||
      documentIds.has(parsed.data.document_id)
    ) {
      return null;
    }
    const availableAt = parseUniversityApplicationDocumentTimestamp(
      parsed.data.available_at,
    );
    if (availableAt === null) return null;
    const current = {
      availableAt,
      documentId: parsed.data.document_id,
    };
    if (
      previous &&
      (previous.availableAt < current.availableAt ||
        (previous.availableAt === current.availableAt &&
          previous.documentId < current.documentId))
    ) {
      return null;
    }
    previous = current;
    documentIds.add(parsed.data.document_id);
    documents.push(mapSafeDocumentRow(parsed.data));
  }

  return documents;
}

export function parseFinalizeUniversityApplicationDocumentUploadResult(
  value: unknown,
  expected: FinalizeUniversityApplicationDocumentUploadArgs & {
    applicationId: string;
  },
): FinalizeUniversityApplicationDocumentUploadResult | null {
  const finalized = parseFinalizeUniversityApplicationDocumentUploadById(
    value,
    expected.documentId,
  );
  return finalized?.applicationId === expected.applicationId
    ? finalized
    : null;
}

export function parseFinalizeUniversityApplicationDocumentUploadById(
  value: unknown,
  documentId: string,
): FinalizeUniversityApplicationDocumentUploadResult | null {
  const parsed = finalizeUploadRowSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.document_id !== documentId
  ) {
    return null;
  }
  return { ...mapSafeDocumentRow(parsed.data), status: "available" };
}

export function parseUniversityApplicationDocumentViewAuthorization(
  value: unknown,
  expected: AuthorizeUniversityApplicationDocumentViewArgs,
): UniversityApplicationDocumentViewAuthorization | null {
  const parsed = viewAuthorizationRowSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.document_id !== expected.documentId ||
    parsed.data.application_id !== expected.applicationId
  ) {
    return null;
  }
  const extension = getUniversityApplicationDocumentExtension(
    parsed.data.storage_path,
  );
  if (
    !extension ||
    !isUniversityApplicationDocumentStoragePath(
      parsed.data.storage_path,
      expected.applicationId,
      expected.documentId,
      extension,
    )
  ) {
    return null;
  }
  return {
    documentId: parsed.data.document_id,
    applicationId: parsed.data.application_id,
    bucketId: parsed.data.bucket_id,
    storagePath: parsed.data.storage_path,
  };
}

export function parseSoftRemoveUniversityApplicationDocumentResult(
  value: unknown,
  expected: SoftRemoveUniversityApplicationDocumentArgs & {
    applicationId: string;
  },
): SoftRemoveUniversityApplicationDocumentResult | null {
  const removed = parseSoftRemoveUniversityApplicationDocumentById(
    value,
    expected.documentId,
  );
  return removed?.applicationId === expected.applicationId ? removed : null;
}

export function parseSoftRemoveUniversityApplicationDocumentById(
  value: unknown,
  documentId: string,
): SoftRemoveUniversityApplicationDocumentResult | null {
  const parsed = softRemoveRowSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.document_id !== documentId
  ) {
    return null;
  }
  return {
    documentId: parsed.data.document_id,
    applicationId: parsed.data.application_id,
    status: parsed.data.status,
    removedAt: parsed.data.removed_at,
  };
}

export function parseUniversityApplicationDocumentMetadata(
  value: unknown,
): UniversityApplicationDocumentMetadata | null {
  const parsed = metadataRowSchema.safeParse(value);
  if (!parsed.success) return null;
  const row = parsed.data;
  return {
    id: row.id,
    applicationId: row.application_id,
    status: row.status,
    documentTitle: row.document_title,
    originalFileName: row.original_file_name,
    bucketId: row.bucket_id,
    storagePath: row.storage_path,
    mimeType: row.mime_type,
    fileSizeBytes: row.file_size_bytes,
    uploadedBy: row.uploaded_by,
    preparedAt: row.prepared_at,
    uploadExpiresAt: row.upload_expires_at,
    availableAt: row.available_at,
    removedAt: row.removed_at,
    removedBy: row.removed_by,
    removalReason: row.removal_reason,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
