import { z } from "zod";
import type {
  StudentProfileDocument,
  StudentProfileDocumentMimeType,
  StudentProfileDocumentType,
} from "@/types";

export const STUDENT_PROFILE_DOCUMENT_BUCKET_ID = "student-profile-documents";
export const STUDENT_PROFILE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
export const STUDENT_PROFILE_DOCUMENT_MAX_ACTIVE = 50;
export const STUDENT_PROFILE_DOCUMENT_SIGNED_VIEW_SECONDS = 5 * 60;
export const STUDENT_PROFILE_DOCUMENT_ACCEPT =
  "application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png";

export const STUDENT_PROFILE_DOCUMENT_TYPES = [
  "passport",
  "academic_transcript",
  "test_score",
  "sop",
  "lor",
  "financial_document",
  "other_supporting_document",
] as const satisfies readonly StudentProfileDocumentType[];

export const STUDENT_PROFILE_DOCUMENT_TYPE_LABELS = {
  passport: "Passport",
  academic_transcript: "Academic Transcript",
  test_score: "Test Score",
  sop: "SOP",
  lor: "LoR",
  financial_document: "Financial Document",
  other_supporting_document: "Other Supporting Document",
} as const satisfies Record<StudentProfileDocumentType, string>;

export const STUDENT_PROFILE_DOCUMENT_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const satisfies readonly StudentProfileDocumentMimeType[];

const extensionsByMime = {
  "application/pdf": ["pdf"],
  "image/jpeg": ["jpg", "jpeg"],
  "image/png": ["png"],
} as const satisfies Record<StudentProfileDocumentMimeType, readonly string[]>;

const unsafeControlPattern =
  /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/u;
const uuidSchema = z.uuid();

export type ProfileDocumentFileDescriptor = {
  name: string;
  type: string;
  size: number;
};

export type ValidatedProfileDocumentFile = {
  originalFileName: string;
  mimeType: StudentProfileDocumentMimeType;
  fileSizeBytes: number;
};

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; message: string };

export function normalizeProfileDocumentDisplayName(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/gu, " ");
}

export function validateProfileDocumentDisplayName(
  value: string,
): ValidationResult<string> {
  const normalized = normalizeProfileDocumentDisplayName(value);
  if (
    normalized.length < 2 ||
    normalized.length > 100 ||
    unsafeControlPattern.test(normalized)
  ) {
    return {
      success: false,
      message: "Enter a document name between 2 and 100 safe characters.",
    };
  }
  return { success: true, data: normalized };
}

export function validateProfileDocumentType(
  value: string,
): ValidationResult<StudentProfileDocumentType> {
  return STUDENT_PROFILE_DOCUMENT_TYPES.includes(
    value as StudentProfileDocumentType,
  )
    ? { success: true, data: value as StudentProfileDocumentType }
    : { success: false, message: "Choose a supported document type." };
}

export function validateProfileDocumentFile(
  file: ProfileDocumentFileDescriptor,
): ValidationResult<ValidatedProfileDocumentFile> {
  const originalFileName = file.name.normalize("NFC").trim();
  if (
    originalFileName.length < 1 ||
    originalFileName.length > 255 ||
    /[/\\]/u.test(originalFileName) ||
    unsafeControlPattern.test(originalFileName)
  ) {
    return { success: false, message: "Choose a file with a safe file name." };
  }
  if (
    !Number.isSafeInteger(file.size) ||
    file.size < 1 ||
    file.size > STUDENT_PROFILE_DOCUMENT_MAX_BYTES
  ) {
    return { success: false, message: "Choose a file no larger than 10 MB." };
  }
  if (
    !STUDENT_PROFILE_DOCUMENT_MIME_TYPES.includes(
      file.type as StudentProfileDocumentMimeType,
    )
  ) {
    return { success: false, message: "Choose a PDF, JPEG, or PNG file." };
  }
  const mimeType = file.type as StudentProfileDocumentMimeType;
  const extension = originalFileName.includes(".")
    ? originalFileName.slice(originalFileName.lastIndexOf(".") + 1).toLowerCase()
    : "";
  if (!(extensionsByMime[mimeType] as readonly string[]).includes(extension)) {
    return {
      success: false,
      message: "The file extension does not match its file type.",
    };
  }
  return {
    success: true,
    data: { originalFileName, mimeType, fileSizeBytes: file.size },
  };
}

const safeRowSchema = z
  .object({
    document_id: uuidSchema,
    document_type: z.enum(STUDENT_PROFILE_DOCUMENT_TYPES),
    display_name: z.string().min(2).max(100),
    original_file_name: z.string().min(1).max(255),
    mime_type: z.enum(STUDENT_PROFILE_DOCUMENT_MIME_TYPES),
    file_size_bytes: z.number().int().min(1).max(STUDENT_PROFILE_DOCUMENT_MAX_BYTES),
    available_at: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  })
  .strict();

export function parseProfileDocumentList(
  value: unknown,
): StudentProfileDocument[] | null {
  const parsed = z.array(safeRowSchema).max(STUDENT_PROFILE_DOCUMENT_MAX_ACTIVE).safeParse(value);
  if (!parsed.success) return null;
  const seen = new Set<string>();
  const documents: StudentProfileDocument[] = [];
  for (const row of parsed.data) {
    if (seen.has(row.document_id)) return null;
    seen.add(row.document_id);
    documents.push({
      documentId: row.document_id,
      documentType: row.document_type,
      displayName: row.display_name,
      originalFileName: row.original_file_name,
      mimeType: row.mime_type,
      fileSizeBytes: row.file_size_bytes,
      availableAt: row.available_at,
    });
  }
  return documents;
}

const uploadIntentSchema = z
  .object({
    document_id: uuidSchema,
    document_type: z.enum(STUDENT_PROFILE_DOCUMENT_TYPES),
    display_name: z.string().min(2).max(100),
    original_file_name: z.string().min(1).max(255),
    bucket_id: z.literal(STUDENT_PROFILE_DOCUMENT_BUCKET_ID),
    storage_path: z.string().min(1).max(500),
    mime_type: z.enum(STUDENT_PROFILE_DOCUMENT_MIME_TYPES),
    file_size_bytes: z.number().int().min(1).max(STUDENT_PROFILE_DOCUMENT_MAX_BYTES),
    upload_expires_at: z.string().refine((value) => Number.isFinite(Date.parse(value))),
  })
  .strict();

export type ProfileDocumentUploadIntent = z.infer<typeof uploadIntentSchema>;

export function parseProfileDocumentUploadIntent(
  value: unknown,
): ProfileDocumentUploadIntent | null {
  const parsed = uploadIntentSchema.safeParse(value);
  if (!parsed.success) return null;
  const expectedPrefix = `${parsed.data.document_id}.`;
  const pathParts = parsed.data.storage_path.split("/");
  if (
    pathParts.length !== 3 ||
    !uuidSchema.safeParse(pathParts[0]).success ||
    pathParts[1] !== parsed.data.document_id ||
    !pathParts[2]?.startsWith(expectedPrefix)
  ) {
    return null;
  }
  return parsed.data;
}

export function isProfileDocumentUuid(value: string): boolean {
  return uuidSchema.safeParse(value).success;
}

const viewAuthorizationSchema = z
  .object({
    document_id: uuidSchema,
    bucket_id: z.literal(STUDENT_PROFILE_DOCUMENT_BUCKET_ID),
    storage_path: z.string().min(1).max(500),
    mime_type: z.enum(STUDENT_PROFILE_DOCUMENT_MIME_TYPES),
  })
  .strict();

export type ProfileDocumentViewAuthorization = z.infer<
  typeof viewAuthorizationSchema
>;

export function parseProfileDocumentViewAuthorization(
  value: unknown,
  documentId: string,
): ProfileDocumentViewAuthorization | null {
  const parsed = viewAuthorizationSchema.safeParse(value);
  return parsed.success && parsed.data.document_id === documentId
    ? parsed.data
    : null;
}

const deleteAuthorizationSchema = z
  .object({
    document_id: uuidSchema,
    bucket_id: z.literal(STUDENT_PROFILE_DOCUMENT_BUCKET_ID),
    storage_path: z.string().min(1).max(500),
  })
  .strict();

export function parseProfileDocumentDeleteAuthorization(
  value: unknown,
  documentId: string,
): z.infer<typeof deleteAuthorizationSchema> | null {
  const parsed = deleteAuthorizationSchema.safeParse(value);
  return parsed.success && parsed.data.document_id === documentId
    ? parsed.data
    : null;
}

export function parseProfileDocumentDeleteFinalization(
  value: unknown,
  documentId: string,
): boolean {
  const parsed = z
    .object({
      document_id: uuidSchema,
      removed_at: z.string().refine((timestamp) => Number.isFinite(Date.parse(timestamp))),
    })
    .strict()
    .safeParse(value);
  return parsed.success && parsed.data.document_id === documentId;
}

export function formatProfileDocumentSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatProfileDocumentDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export function isTrustedProfileDocumentSignedUrl(
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
        `/storage/v1/object/sign/${STUDENT_PROFILE_DOCUMENT_BUCKET_ID}/${expectedPath}` &&
      signed.searchParams.has("token")
    );
  } catch {
    return false;
  }
}
