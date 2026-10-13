import { z } from "zod";
import type {
  StudentAchievementDocument,
  StudentAchievementDocumentMimeType,
} from "@/types";

export const STUDENT_ACHIEVEMENT_DOCUMENT_BUCKET_ID =
  "student-achievement-documents";
export const STUDENT_ACHIEVEMENT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const STUDENT_ACHIEVEMENT_DOCUMENT_SIGNED_VIEW_SECONDS = 5 * 60;
export const STUDENT_ACHIEVEMENT_DOCUMENT_ACCEPT =
  "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

export const STUDENT_ACHIEVEMENT_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const satisfies readonly StudentAchievementDocumentMimeType[];

const extensionsByMime = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
} as const satisfies Record<
  StudentAchievementDocumentMimeType,
  readonly string[]
>;

const unsafeControlPattern =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
const uuidSchema = z.uuid();
const timestampSchema = z
  .string()
  .refine((value) => Number.isFinite(Date.parse(value)));

export type AchievementEvidenceFileDescriptor = {
  name: string;
  type: string;
  size: number;
};

export type ValidatedAchievementEvidenceFile = {
  documentName: string;
  mimeType: StudentAchievementDocumentMimeType;
  fileSizeBytes: number;
};

export type AchievementEvidenceValidationResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

export function validateAchievementEvidenceFile(
  file: AchievementEvidenceFileDescriptor,
): AchievementEvidenceValidationResult<ValidatedAchievementEvidenceFile> {
  const documentName = file.name.normalize("NFC").trim().replace(/\s+/gu, " ");
  if (
    documentName.length < 1 ||
    documentName.length > 255 ||
    /[/\\]/u.test(documentName) ||
    unsafeControlPattern.test(documentName)
  ) {
    return { success: false, message: "Choose a file with a safe file name." };
  }
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > STUDENT_ACHIEVEMENT_DOCUMENT_MAX_BYTES
  ) {
    return { success: false, message: "Choose a file no larger than 10 MB." };
  }
  if (
    !STUDENT_ACHIEVEMENT_DOCUMENT_MIME_TYPES.includes(
      file.type as StudentAchievementDocumentMimeType,
    )
  ) {
    return { success: false, message: "Choose a PDF, JPEG, or PNG file." };
  }
  const mimeType = file.type as StudentAchievementDocumentMimeType;
  const extension = documentName.includes(".")
    ? documentName.slice(documentName.lastIndexOf(".") + 1).toLowerCase()
    : "";
  if (!(extensionsByMime[mimeType] as readonly string[]).includes(extension)) {
    return {
      success: false,
      message: "The file extension does not match its file type.",
    };
  }
  return {
    success: true,
    data: { documentName, mimeType, fileSizeBytes: file.size },
  };
}

const safeDocumentSchema = z
  .object({
    document_id: uuidSchema,
    achievement_id: uuidSchema,
    document_name: z.string().min(1).max(255),
    mime_type: z.enum(STUDENT_ACHIEVEMENT_DOCUMENT_MIME_TYPES),
    file_size_bytes: z.number().int().min(1).max(STUDENT_ACHIEVEMENT_DOCUMENT_MAX_BYTES),
    status: z.enum(["pending", "available", "removal_pending"]),
    prepared_at: timestampSchema,
    upload_expires_at: timestampSchema,
    available_at: timestampSchema.nullable(),
  })
  .strict();

export function parseStudentAchievementDocuments(
  value: unknown,
): StudentAchievementDocument[] | null {
  const parsed = z.array(safeDocumentSchema).max(500).safeParse(value);
  if (!parsed.success) return null;
  const seen = new Set<string>();
  const documents: StudentAchievementDocument[] = [];
  for (const row of parsed.data) {
    if (seen.has(row.document_id)) return null;
    seen.add(row.document_id);
    documents.push({
      documentId: row.document_id,
      achievementId: row.achievement_id,
      documentName: row.document_name,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes,
      status: row.status,
      preparedAt: row.prepared_at,
      uploadExpiresAt: row.upload_expires_at,
      availableAt: row.available_at,
    });
  }
  return documents;
}

const uploadIntentSchema = z
  .object({
    document_id: uuidSchema,
    achievement_id: uuidSchema,
    document_name: z.string().min(1).max(255),
    bucket_id: z.literal(STUDENT_ACHIEVEMENT_DOCUMENT_BUCKET_ID),
    storage_path: z.string().min(1).max(700),
    mime_type: z.enum(STUDENT_ACHIEVEMENT_DOCUMENT_MIME_TYPES),
    file_size_bytes: z.number().int().min(1).max(STUDENT_ACHIEVEMENT_DOCUMENT_MAX_BYTES),
    upload_expires_at: timestampSchema,
  })
  .strict();

export type StudentAchievementDocumentUploadIntent = z.infer<
  typeof uploadIntentSchema
>;

export function parseStudentAchievementDocumentUploadIntent(
  value: unknown,
): StudentAchievementDocumentUploadIntent | null {
  const parsed = uploadIntentSchema.safeParse(value);
  if (!parsed.success) return null;
  const pathParts = parsed.data.storage_path.split("/");
  const expectedLeafPrefix = `${parsed.data.document_id}.`;
  if (
    pathParts.length !== 5 ||
    pathParts[1] !== parsed.data.achievement_id ||
    pathParts[2] !== parsed.data.document_id ||
    !uuidSchema.safeParse(pathParts[0]).success ||
    !uuidSchema.safeParse(pathParts[3]).success ||
    !pathParts[4]?.startsWith(expectedLeafPrefix)
  ) {
    return null;
  }
  return parsed.data;
}

const viewAuthorizationSchema = z
  .object({
    document_id: uuidSchema,
    bucket_id: z.literal(STUDENT_ACHIEVEMENT_DOCUMENT_BUCKET_ID),
    storage_path: z.string().min(1).max(700),
    mime_type: z.enum(STUDENT_ACHIEVEMENT_DOCUMENT_MIME_TYPES),
  })
  .strict();

export function parseStudentAchievementDocumentViewAuthorization(
  value: unknown,
  documentId: string,
): z.infer<typeof viewAuthorizationSchema> | null {
  const parsed = viewAuthorizationSchema.safeParse(value);
  return parsed.success && parsed.data.document_id === documentId
    ? parsed.data
    : null;
}

const deleteAuthorizationSchema = z
  .object({
    document_id: uuidSchema,
    bucket_id: z.literal(STUDENT_ACHIEVEMENT_DOCUMENT_BUCKET_ID),
    storage_path: z.string().min(1).max(700),
    storage_object_exists: z.boolean(),
    removed_at: timestampSchema.nullable(),
  })
  .strict();

export function parseStudentAchievementDocumentDeleteAuthorization(
  value: unknown,
  documentId: string,
): z.infer<typeof deleteAuthorizationSchema> | null {
  const parsed = deleteAuthorizationSchema.safeParse(value);
  return parsed.success && parsed.data.document_id === documentId
    ? parsed.data
    : null;
}

const validationAuthorizationSchema = z
  .object({
    document_id: uuidSchema,
    bucket_id: z.literal(STUDENT_ACHIEVEMENT_DOCUMENT_BUCKET_ID),
    storage_path: z.string().min(1).max(700),
    mime_type: z.enum(STUDENT_ACHIEVEMENT_DOCUMENT_MIME_TYPES),
    file_size_bytes: z.number().int().min(1).max(STUDENT_ACHIEVEMENT_DOCUMENT_MAX_BYTES),
  })
  .strict();

export function parseStudentAchievementDocumentValidationAuthorization(
  value: unknown,
  documentId: string,
): z.infer<typeof validationAuthorizationSchema> | null {
  const parsed = validationAuthorizationSchema.safeParse(value);
  return parsed.success && parsed.data.document_id === documentId
    ? parsed.data
    : null;
}

export function parseStudentAchievementDocumentDeleteFinalization(
  value: unknown,
  documentId: string,
): boolean {
  const parsed = z
    .object({ document_id: uuidSchema, removed_at: timestampSchema })
    .strict()
    .safeParse(value);
  return parsed.success && parsed.data.document_id === documentId;
}

export function isAchievementEvidenceUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

export function formatAchievementEvidenceSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatAchievementEvidenceDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function isTrustedAchievementEvidenceSignedUrl(
  signedUrl: string,
  supabaseUrl: string,
  expectedPath: string,
): boolean {
  try {
    const signed = new URL(signedUrl);
    const base = new URL(supabaseUrl);
    return (
      signed.origin === base.origin &&
      signed.username === "" &&
      signed.password === "" &&
      signed.hash === "" &&
      signed.pathname ===
        `/storage/v1/object/sign/${STUDENT_ACHIEVEMENT_DOCUMENT_BUCKET_ID}/${expectedPath}` &&
      signed.searchParams.has("token")
    );
  } catch {
    return false;
  }
}
