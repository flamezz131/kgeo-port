import { z } from "zod";

export const PARENT_REPORT_MAX_ATTACHMENTS = 20;
export const PARENT_REPORT_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
export const PARENT_REPORT_ALLOWED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export const parentReportStatusSchema = z.enum([
  "draft",
  "director_review",
  "revision_requested",
  "approved",
  "finalized",
]);

export const parentReportAttachmentSourceSchema = z.enum([
  "report_upload",
  "profile_document",
  "application_document",
  "progression_evidence",
]);

const normalizedNullableText = (maximum: number) =>
  z
    .string()
    .max(maximum)
    .refine((value) => normalizeParentReportText(value) === value)
    .nullable();

const sourceSnapshotSchema = z
  .object({
    schema_version: z.literal(1),
    captured_at: z.iso.datetime({ offset: true }),
    academic_period: z.string().min(1).max(80),
    student: z.record(z.string(), z.unknown()),
    preferences: z.record(z.string(), z.unknown()),
    achievements: z.array(z.record(z.string(), z.unknown())).max(50),
    study_abroad_exams: z.array(z.record(z.string(), z.unknown())).max(50),
    journey_progress: z.record(z.string(), z.unknown()),
    applications: z.array(z.record(z.string(), z.unknown())).max(50),
    semester_summary: z.record(z.string(), z.unknown()),
  })
  .strict()
  .superRefine((value, context) => {
    if (containsForbiddenPrivateSource(value)) {
      context.addIssue({
        code: "custom",
        message: "Private Counselor content is not a Parent Report source.",
      });
    }
  });

const attachmentSchema = z
  .object({
    attachment_id: z.uuid(),
    source_type: parentReportAttachmentSourceSchema,
    display_name: z.string().min(2).max(100),
    mime_type: z.enum(PARENT_REPORT_ALLOWED_MIME_TYPES),
    file_size_bytes: z.number().int().positive().max(PARENT_REPORT_ATTACHMENT_MAX_BYTES),
    sort_order: z.number().int().positive(),
  })
  .strict();

const eventSchema = z
  .object({
    event_id: z.uuid(),
    event_type: z.enum([
      "created",
      "counselor_edited",
      "submitted",
      "director_edited",
      "revision_requested",
      "resubmitted",
      "approved",
      "finalized",
      "new_version_created",
      "attachment_added",
      "attachment_removed",
    ]),
    from_status: parentReportStatusSchema.nullish(),
    to_status: parentReportStatusSchema,
    actor_name: z.string().min(1).max(200),
    event_reason: z.string().min(1).max(1000).nullish(),
    occurred_at: z.iso.datetime({ offset: true }),
  })
  .strict();

const workspaceSchema = z
  .object({
    report: z
      .object({
        report_id: z.uuid(),
        student_id: z.uuid(),
        academic_period: z.string().min(1).max(80),
        version_number: z.number().int().positive(),
        status: parentReportStatusSchema,
        source_snapshot: sourceSnapshotSchema,
        semester_overview: normalizedNullableText(3000),
        strengths_highlights: normalizedNullableText(3000),
        areas_requiring_attention: normalizedNullableText(3000),
        next_actions: normalizedNullableText(3000),
        counselor_remarks: normalizedNullableText(2000),
        director_remarks: normalizedNullableText(2000),
        created_at: z.iso.datetime({ offset: true }),
        updated_at: z.iso.datetime({ offset: true }),
        submitted_at: z.iso.datetime({ offset: true }).nullish(),
        reviewed_at: z.iso.datetime({ offset: true }).nullish(),
        approved_at: z.iso.datetime({ offset: true }).nullish(),
        finalized_at: z.iso.datetime({ offset: true }).nullish(),
        final_pdf_available: z.boolean(),
        viewer_role: z.enum(["counselor", "director"]),
      })
      .strict(),
    attachments: z.array(attachmentSchema).max(PARENT_REPORT_MAX_ATTACHMENTS),
    events: z.array(eventSchema).max(50),
  })
  .strict();

const reportListItemSchema = z
  .object({
    report_id: z.uuid(),
    academic_period: z.string().min(1).max(80),
    version_number: z.number().int().positive(),
    status: parentReportStatusSchema,
    updated_at: z.iso.datetime({ offset: true }),
    finalized_at: z.iso.datetime({ offset: true }).nullable(),
  })
  .strict();

const directorReportListItemSchema = reportListItemSchema.extend({
  student_id: z.uuid(),
  student_name: z.string().min(1).max(200),
  counselor_name: z.string().min(1).max(200),
});

const attachmentCandidateSchema = z
  .object({
    source_type: z.enum([
      "profile_document",
      "application_document",
      "progression_evidence",
    ]),
    source_document_id: z.uuid(),
    display_name: z.string().min(2).max(100),
    mime_type: z.enum(PARENT_REPORT_ALLOWED_MIME_TYPES),
    file_size_bytes: z.number().int().positive().max(PARENT_REPORT_ATTACHMENT_MAX_BYTES),
  })
  .strict();

const renderAttachmentSchema = z
  .object({
    attachment_id: z.uuid(),
    display_name: z.string().min(2).max(100),
    bucket_id: z.string().min(1).max(100),
    storage_path: z.string().min(1).max(1024),
    mime_type: z.enum(PARENT_REPORT_ALLOWED_MIME_TYPES),
    file_size_bytes: z.number().int().positive().max(PARENT_REPORT_ATTACHMENT_MAX_BYTES),
    sort_order: z.number().int().positive(),
  })
  .strict();

const renderPayloadSchema = z
  .object({
    report_id: z.uuid(),
    student_id: z.uuid(),
    academic_period: z.string().min(1).max(80),
    version_number: z.number().int().positive(),
    status: parentReportStatusSchema,
    source_snapshot: sourceSnapshotSchema,
    semester_overview: normalizedNullableText(3000),
    strengths_highlights: normalizedNullableText(3000),
    areas_requiring_attention: normalizedNullableText(3000),
    next_actions: normalizedNullableText(3000),
    counselor_remarks: normalizedNullableText(2000),
    director_remarks: normalizedNullableText(2000),
    counselor_name: z.string().min(1).max(200).nullable(),
    director_name: z.string().min(1).max(200).nullable(),
    approved_at: z.iso.datetime({ offset: true }).nullish(),
    finalized_at: z.iso.datetime({ offset: true }).nullish(),
    final_pdf_bucket_id: z.string().nullable(),
    final_pdf_storage_path: z.string().nullable(),
    attachments: z.array(renderAttachmentSchema).max(PARENT_REPORT_MAX_ATTACHMENTS),
  })
  .strict()
  .superRefine((value, context) => {
    const totalBytes = value.attachments.reduce(
      (total, attachment) => total + attachment.file_size_bytes,
      0,
    );
    if (totalBytes > 40 * 1024 * 1024) {
      context.addIssue({
        code: "custom",
        message: "Parent Report attachments exceed the safe rendering limit.",
      });
    }
  });

export type ParentReportStatus = z.infer<typeof parentReportStatusSchema>;
export type ParentReportWorkspace = z.infer<typeof workspaceSchema>;
export type ParentReportListItem = z.infer<typeof reportListItemSchema>;
export type DirectorParentReportListItem = z.infer<
  typeof directorReportListItemSchema
>;
export type ParentReportAttachmentCandidate = z.infer<
  typeof attachmentCandidateSchema
>;
export type ParentReportRenderPayload = z.infer<typeof renderPayloadSchema>;

export type ParentReportActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  reportId?: string;
};

export type ParentReportUploadPrepareState =
  | {
      status: "success";
      upload: {
        attachmentId: string;
        bucketId: "parent-report-attachments";
        path: string;
        token: string;
        mimeType: (typeof PARENT_REPORT_ALLOWED_MIME_TYPES)[number];
      };
    }
  | { status: "error"; message: string };

export const initialParentReportActionState: ParentReportActionState = {
  status: "idle",
};

export function normalizeParentReportText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

export function containsForbiddenPrivateSource(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsForbiddenPrivateSource);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => {
    const normalizedKey = key
      .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
      .toLowerCase()
      .replace(/[-\s]+/g, "_");
    return (
      normalizedKey.includes("private_note") ||
      normalizedKey.includes("private_follow_up") ||
      containsForbiddenPrivateSource(nested)
    );
  });
}

export function parseParentReportWorkspace(
  value: unknown,
): ParentReportWorkspace | null {
  const parsed = workspaceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseParentReportList(
  value: unknown,
): ParentReportListItem[] | null {
  const parsed = z.array(reportListItemSchema).max(20).safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseDirectorParentReportList(
  value: unknown,
): DirectorParentReportListItem[] | null {
  const parsed = z.array(directorReportListItemSchema).max(100).safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseParentReportAttachmentCandidates(
  value: unknown,
): ParentReportAttachmentCandidate[] | null {
  const parsed = z.array(attachmentCandidateSchema).max(100).safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseParentReportRenderPayload(
  value: unknown,
): ParentReportRenderPayload | null {
  const parsed = renderPayloadSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function isAllowedParentReportAttachment(file: {
  name: string;
  size: number;
  type: string;
}): boolean {
  const extension = file.name.toLowerCase().split(".").pop();
  const extensionMatches =
    (file.type === "application/pdf" && extension === "pdf") ||
    (file.type === "image/jpeg" && (extension === "jpg" || extension === "jpeg")) ||
    (file.type === "image/png" && extension === "png");
  return (
    PARENT_REPORT_ALLOWED_MIME_TYPES.includes(
      file.type as (typeof PARENT_REPORT_ALLOWED_MIME_TYPES)[number],
    ) &&
    file.size > 0 &&
    file.size <= PARENT_REPORT_ATTACHMENT_MAX_BYTES &&
    extensionMatches
  );
}

export function formatParentReportTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

export const parentReportStatusLabels: Record<ParentReportStatus, string> = {
  draft: "Draft",
  director_review: "Director review",
  revision_requested: "Revision requested",
  approved: "Approved",
  finalized: "Finalized",
};
