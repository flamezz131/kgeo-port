"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireCounselor, requireDirector } from "@/lib/permissions";
import {
  isAllowedParentReportAttachment,
  normalizeParentReportText,
  parseParentReportRenderPayload,
  type ParentReportActionState,
  type ParentReportUploadPrepareState,
} from "@/lib/parent-reports/parent-report";
import {
  createParentReportPdf,
  type ParentReportPdfAttachment,
} from "@/lib/parent-reports/pdf";
import { createAdminClient } from "@/lib/supabase/admin";

const uuidSchema = z.uuid();
const academicPeriodSchema = z
  .string()
  .min(1)
  .max(80)
  .transform(normalizeParentReportText)
  .refine((value) => value.length > 0);
const narrativeSchema = z.object({
  reportId: uuidSchema,
  semesterOverview: z.string().max(3000).transform(normalizeOptionalText),
  strengthsHighlights: z.string().max(3000).transform(normalizeOptionalText),
  areasRequiringAttention: z.string().max(3000).transform(normalizeOptionalText),
  nextActions: z.string().max(3000).transform(normalizeOptionalText),
  counselorRemarks: z.string().max(2000).transform(normalizeOptionalText),
  directorRemarks: z.string().max(2000).transform(normalizeOptionalText).optional(),
});
const existingAttachmentSchema = z.object({
  reportId: uuidSchema,
  sourceType: z.enum([
    "profile_document",
    "application_document",
    "progression_evidence",
  ]),
  sourceDocumentId: uuidSchema,
  displayName: z.string().min(2).max(100).transform(normalizeParentReportText),
});

export async function createParentReportDraftAction(
  _previousState: ParentReportActionState,
  formData: FormData,
): Promise<ParentReportActionState> {
  const { supabase } = await requireCounselor();
  const parsed = z
    .object({
      studentId: uuidSchema,
      academicPeriod: academicPeriodSchema,
    })
    .safeParse(readFields(formData, ["studentId", "academicPeriod"]));
  if (!parsed.success) return errorState("Enter a valid academic period.");

  const result = await supabase
    .rpc("create_parent_report_draft", {
      p_student_id: parsed.data.studentId,
      p_academic_period: parsed.data.academicPeriod,
    })
    .maybeSingle();
  if (result.error || !result.data || !uuidSchema.safeParse(result.data.report_id).success) {
    return errorState(
      result.error?.code === "23505"
        ? "An editable report already exists for this academic period."
        : "The Parent Report draft could not be created.",
    );
  }
  revalidateReportPaths(parsed.data.studentId, result.data.report_id);
  return {
    status: "success",
    message: "Parent Report draft created from the current verified snapshot.",
    reportId: result.data.report_id,
  };
}

export async function saveCounselorParentReportAction(
  _previousState: ParentReportActionState,
  formData: FormData,
): Promise<ParentReportActionState> {
  const { supabase } = await requireCounselor();
  const parsed = narrativeSchema.safeParse(readFields(formData, [
    "reportId",
    "semesterOverview",
    "strengthsHighlights",
    "areasRequiringAttention",
    "nextActions",
    "counselorRemarks",
  ]));
  if (!parsed.success) return errorState("Check the Parent Report narrative fields.");
  const value = parsed.data;
  const result = await supabase.rpc("save_counselor_parent_report_narrative", {
    p_report_id: value.reportId,
    p_semester_overview: value.semesterOverview,
    p_strengths_highlights: value.strengthsHighlights,
    p_areas_requiring_attention: value.areasRequiringAttention,
    p_next_actions: value.nextActions,
    p_counselor_remarks: value.counselorRemarks,
  });
  if (result.error) return errorState("The Parent Report changes could not be saved.");
  revalidateReportPaths(undefined, value.reportId);
  return { status: "success", message: "Draft changes saved.", reportId: value.reportId };
}

export async function saveDirectorParentReportAction(
  _previousState: ParentReportActionState,
  formData: FormData,
): Promise<ParentReportActionState> {
  const { supabase } = await requireDirector();
  const parsed = narrativeSchema.safeParse(readFields(formData, [
    "reportId",
    "semesterOverview",
    "strengthsHighlights",
    "areasRequiringAttention",
    "nextActions",
    "counselorRemarks",
    "directorRemarks",
  ]));
  if (!parsed.success) return errorState("Check the Parent Report narrative fields.");
  const value = parsed.data;
  const result = await supabase.rpc("save_director_parent_report_narrative", {
    p_report_id: value.reportId,
    p_semester_overview: value.semesterOverview,
    p_strengths_highlights: value.strengthsHighlights,
    p_areas_requiring_attention: value.areasRequiringAttention,
    p_next_actions: value.nextActions,
    p_counselor_remarks: value.counselorRemarks,
    p_director_remarks: value.directorRemarks ?? null,
  });
  if (result.error) return errorState("The Director review changes could not be saved.");
  revalidateReportPaths(undefined, value.reportId);
  return { status: "success", message: "Director review changes saved.", reportId: value.reportId };
}

export async function submitParentReportAction(
  formData: FormData,
): Promise<ParentReportActionState> {
  const { supabase } = await requireCounselor();
  return runStatusTransition(
    formData,
    (reportId) => supabase.rpc("submit_parent_report", { p_report_id: reportId }),
    "Parent Report submitted for Director review.",
    "The Parent Report could not be submitted.",
  );
}

export async function requestParentReportRevisionAction(
  formData: FormData,
): Promise<ParentReportActionState> {
  const { supabase } = await requireDirector();
  const parsed = z
    .object({ reportId: uuidSchema, reason: z.string().min(2).max(1000).transform(normalizeParentReportText) })
    .safeParse(readFields(formData, ["reportId", "reason"]));
  if (!parsed.success) return errorState("Enter a clear revision request.");
  const result = await supabase.rpc("request_parent_report_revision", {
    p_report_id: parsed.data.reportId,
    p_reason: parsed.data.reason,
  });
  if (result.error) return errorState("The revision request could not be saved.");
  revalidateReportPaths(undefined, parsed.data.reportId);
  return { status: "success", message: "Revision requested from the Primary Counselor.", reportId: parsed.data.reportId };
}

export async function approveParentReportAction(
  formData: FormData,
): Promise<ParentReportActionState> {
  const { supabase } = await requireDirector();
  return runStatusTransition(
    formData,
    (reportId) => supabase.rpc("approve_parent_report", { p_report_id: reportId }),
    "Parent Report approved and ready for finalization.",
    "The Parent Report could not be approved.",
  );
}

export async function addParentReportExistingAttachmentAction(
  formData: FormData,
): Promise<ParentReportActionState> {
  const role = getFormString(formData, "viewerRole");
  const { supabase } = role === "director" ? await requireDirector() : await requireCounselor();
  const parsed = existingAttachmentSchema.safeParse(readFields(formData, [
    "reportId",
    "sourceType",
    "sourceDocumentId",
    "displayName",
  ]));
  if (!parsed.success) return errorState("The selected attachment is invalid.");
  const value = parsed.data;
  const result = await supabase.rpc("add_parent_report_existing_attachment", {
    p_report_id: value.reportId,
    p_source_type: value.sourceType,
    p_source_document_id: value.sourceDocumentId,
    p_display_name: value.displayName,
  });
  if (result.error) return errorState("The selected attachment could not be added.");
  revalidateReportPaths(undefined, value.reportId);
  return { status: "success", message: "Attachment added to the report.", reportId: value.reportId };
}

export async function prepareParentReportAttachmentUploadAction(
  formData: FormData,
): Promise<ParentReportUploadPrepareState> {
  const role = getFormString(formData, "viewerRole");
  const { supabase } = role === "director" ? await requireDirector() : await requireCounselor();
  const fields = readFields(formData, [
    "reportId",
    "displayName",
    "originalFileName",
    "mimeType",
    "fileSizeBytes",
  ]);
  const parsed = z
    .object({
      reportId: uuidSchema,
      displayName: z.string().min(2).max(100).transform(normalizeParentReportText),
      originalFileName: z.string().min(1).max(255),
      mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
      fileSizeBytes: z.coerce.number().int().positive().max(10 * 1024 * 1024),
    })
    .safeParse(fields);
  if (!parsed.success || !isAllowedParentReportAttachment({
    name: fields?.originalFileName ?? "",
    type: fields?.mimeType ?? "",
    size: Number(fields?.fileSizeBytes),
  })) {
    return { status: "error", message: "Select a PDF, JPEG, or PNG file up to 10 MB." };
  }
  const value = parsed.data;
  const preparedResult = await supabase
    .rpc("prepare_parent_report_attachment_upload", {
      p_report_id: value.reportId,
      p_display_name: value.displayName,
      p_original_file_name: value.originalFileName,
      p_mime_type: value.mimeType,
      p_file_size_bytes: value.fileSizeBytes,
    })
    .maybeSingle();
  const prepared = preparedResult.data;
  if (
    preparedResult.error ||
    !prepared ||
    prepared.bucket_id !== "parent-report-attachments" ||
    !uuidSchema.safeParse(prepared.attachment_id).success ||
    prepared.mime_type !== value.mimeType ||
    !prepared.storage_path.startsWith(`attachments/${value.reportId}/`)
  ) {
    return { status: "error", message: "The secure attachment upload could not be prepared." };
  }
  const signed = await supabase.storage
    .from(prepared.bucket_id)
    .createSignedUploadUrl(prepared.storage_path, { upsert: false });
  if (signed.error || !signed.data?.token) {
    return { status: "error", message: "The secure attachment upload could not be prepared." };
  }
  return {
    status: "success",
    upload: {
      attachmentId: prepared.attachment_id,
      bucketId: "parent-report-attachments",
      path: prepared.storage_path,
      token: signed.data.token,
      mimeType: value.mimeType,
    },
  };
}

export async function finalizeParentReportAttachmentUploadAction(
  formData: FormData,
): Promise<ParentReportActionState> {
  const role = getFormString(formData, "viewerRole");
  const { supabase } = role === "director" ? await requireDirector() : await requireCounselor();
  const parsed = z
    .object({ attachmentId: uuidSchema, reportId: uuidSchema })
    .safeParse(readFields(formData, ["attachmentId", "reportId"]));
  if (!parsed.success) return errorState("The attachment upload could not be finalized.");
  const result = await supabase.rpc("finalize_parent_report_attachment_upload", {
    p_attachment_id: parsed.data.attachmentId,
  });
  if (result.error) return errorState("The attachment upload could not be finalized.");
  revalidateReportPaths(undefined, parsed.data.reportId);
  return { status: "success", message: "Attachment uploaded.", reportId: parsed.data.reportId };
}

export async function removeParentReportAttachmentAction(
  formData: FormData,
): Promise<ParentReportActionState> {
  const role = getFormString(formData, "viewerRole");
  const { supabase } = role === "director" ? await requireDirector() : await requireCounselor();
  const parsed = z
    .object({ attachmentId: uuidSchema, reportId: uuidSchema })
    .safeParse(readFields(formData, ["attachmentId", "reportId"]));
  if (!parsed.success) return errorState("The attachment could not be removed.");
  const result = await supabase
    .rpc("remove_parent_report_attachment", {
      p_attachment_id: parsed.data.attachmentId,
    })
    .maybeSingle();
  if (result.error || !result.data) return errorState("The attachment could not be removed.");
  if (result.data.delete_storage_object) {
    const removed = await supabase.storage
      .from(result.data.bucket_id)
      .remove([result.data.storage_path]);
    if (removed.error) {
      return errorState("The attachment was removed from the report, but file cleanup must be retried.");
    }
  }
  revalidateReportPaths(undefined, parsed.data.reportId);
  return { status: "success", message: "Attachment removed.", reportId: parsed.data.reportId };
}

export async function finalizeParentReportAction(
  formData: FormData,
): Promise<ParentReportActionState> {
  const { supabase } = await requireDirector();
  const reportId = uuidSchema.safeParse(getFormString(formData, "reportId"));
  if (!reportId.success) return errorState("The Parent Report could not be finalized.");

  const payloadResult = await supabase
    .rpc("get_parent_report_render_payload", { p_report_id: reportId.data })
    .maybeSingle();
  const payload = payloadResult.error
    ? null
    : parseParentReportRenderPayload(payloadResult.data?.payload);
  if (!payload || payload.status !== "approved") {
    return errorState("Only an approved Parent Report can be finalized.");
  }

  try {
    const admin = createAdminClient();
    const attachments: ParentReportPdfAttachment[] = [];
    for (const attachment of payload.attachments) {
      const downloaded = await admin.storage
        .from(attachment.bucket_id)
        .download(attachment.storage_path);
      if (downloaded.error || !downloaded.data) throw new Error("download");
      const bytes = new Uint8Array(await downloaded.data.arrayBuffer());
      if (bytes.byteLength !== attachment.file_size_bytes) throw new Error("size");
      attachments.push({ bytes, displayName: attachment.display_name, mimeType: attachment.mime_type });
    }
    const pdf = await createParentReportPdf(payload, attachments);
    if (pdf.byteLength > 50 * 1024 * 1024) throw new Error("size");
    const sha256 = createHash("sha256").update(pdf).digest("hex");
    const path = `final/${payload.student_id}/${payload.report_id}/v${payload.version_number}.pdf`;
    const uploaded = await admin.storage
      .from("parent-report-attachments")
      .upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (uploaded.error || uploaded.data.path !== path) throw new Error("upload");
    const finalized = await supabase.rpc("finalize_parent_report", {
      p_report_id: payload.report_id,
      p_file_size_bytes: pdf.byteLength,
      p_sha256: sha256,
    });
    if (finalized.error) throw new Error("finalize");
    revalidateReportPaths(payload.student_id, payload.report_id);
    return { status: "success", message: "Parent Report finalized. Its source, narrative, and attachments are now immutable.", reportId: payload.report_id };
  } catch {
    return errorState("The Parent Report could not be finalized. No workflow status was changed.");
  }
}

function normalizeOptionalText(value: string): string | null {
  const normalized = normalizeParentReportText(value);
  return normalized.length > 0 ? normalized : null;
}

function getFormString(formData: FormData, key: string): string {
  const values = formData.getAll(key);
  return values.length === 1 && typeof values[0] === "string" ? values[0] : "";
}

function readFields(formData: FormData, names: readonly string[]): Record<string, string> | null {
  const allowed = new Set([...names, "viewerRole"]);
  for (const key of new Set(formData.keys())) if (!allowed.has(key)) return null;
  const fields: Record<string, string> = {};
  for (const name of names) {
    const value = getFormString(formData, name);
    if (value === "" && formData.getAll(name).length !== 1) return null;
    fields[name] = value;
  }
  return fields;
}

async function runStatusTransition(
  formData: FormData,
  run: (reportId: string) => PromiseLike<{ error: { message: string } | null }>,
  successMessage: string,
  errorMessage: string,
): Promise<ParentReportActionState> {
  const reportId = uuidSchema.safeParse(getFormString(formData, "reportId"));
  if (!reportId.success) return errorState(errorMessage);
  const result = await run(reportId.data);
  if (result.error) return errorState(errorMessage);
  revalidateReportPaths(undefined, reportId.data);
  return { status: "success", message: successMessage, reportId: reportId.data };
}

function errorState(message: string): ParentReportActionState {
  return { status: "error", message };
}

function revalidateReportPaths(studentId?: string, reportId?: string) {
  if (studentId) revalidatePath(`/counselor/students/${studentId}/report`);
  if (reportId) revalidatePath(`/director/reports/${reportId}`);
  revalidatePath("/director/reports");
}
