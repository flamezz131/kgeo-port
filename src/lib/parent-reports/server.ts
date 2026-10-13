import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireCounselor, requireDirector } from "@/lib/permissions";
import {
  parseDirectorParentReportList,
  parseParentReportAttachmentCandidates,
  parseParentReportList,
  parseParentReportRenderPayload,
  parseParentReportWorkspace,
  type DirectorParentReportListItem,
  type ParentReportAttachmentCandidate,
  type ParentReportListItem,
  type ParentReportRenderPayload,
  type ParentReportWorkspace,
} from "./parent-report";

export type CounselorParentReportLoadResult =
  | {
      kind: "ready";
      reports: ParentReportListItem[];
      workspace: ParentReportWorkspace | null;
      candidates: ParentReportAttachmentCandidate[];
    }
  | { kind: "unavailable" };

export type DirectorParentReportListLoadResult =
  | { kind: "ready"; reports: DirectorParentReportListItem[] }
  | { kind: "unavailable" };

export type DirectorParentReportLoadResult =
  | {
      kind: "ready";
      workspace: ParentReportWorkspace;
      candidates: ParentReportAttachmentCandidate[];
    }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export async function loadCounselorParentReports(
  studentId: string,
  selectedReportId?: string,
): Promise<CounselorParentReportLoadResult> {
  const { supabase } = await requireCounselor();
  const listResult = await supabase.rpc("list_counselor_parent_reports", {
    p_student_id: studentId,
    p_limit: 20,
  });
  const reports = listResult.error ? null : parseParentReportList(listResult.data);
  if (!reports) return { kind: "unavailable" };

  const reportId = selectedReportId ?? reports[0]?.report_id;
  if (!reportId) {
    return { kind: "ready", reports, workspace: null, candidates: [] };
  }

  const [workspaceResult, candidateResult] = await Promise.all([
    supabase.rpc("get_parent_report_workspace", { p_report_id: reportId }),
    supabase.rpc("list_parent_report_attachment_candidates", {
      p_report_id: reportId,
    }),
  ]);
  const workspace = workspaceResult.error
    ? null
    : parseParentReportWorkspace(workspaceResult.data?.[0]?.payload);
  const candidates = candidateResult.error
    ? null
    : parseParentReportAttachmentCandidates(candidateResult.data);
  if (!workspace || !candidates || workspace.report.student_id !== studentId) {
    return { kind: "unavailable" };
  }
  return { kind: "ready", reports, workspace, candidates };
}

export async function loadDirectorParentReports(): Promise<DirectorParentReportListLoadResult> {
  const { supabase } = await requireDirector();
  const result = await supabase.rpc("list_director_parent_reports", {
    p_limit: 100,
  });
  const reports = result.error
    ? null
    : parseDirectorParentReportList(result.data);
  return reports ? { kind: "ready", reports } : { kind: "unavailable" };
}

export async function loadDirectorParentReport(
  reportId: string,
): Promise<DirectorParentReportLoadResult> {
  const { supabase } = await requireDirector();
  const [workspaceResult, candidateResult] = await Promise.all([
    supabase.rpc("get_parent_report_workspace", { p_report_id: reportId }),
    supabase.rpc("list_parent_report_attachment_candidates", {
      p_report_id: reportId,
    }),
  ]);
  if (workspaceResult.error?.code === "42501") return { kind: "not_found" };
  const workspace = workspaceResult.error
    ? null
    : parseParentReportWorkspace(workspaceResult.data?.[0]?.payload);
  const candidates = candidateResult.error
    ? null
    : parseParentReportAttachmentCandidates(candidateResult.data);
  return workspace && candidates
    ? { kind: "ready", workspace, candidates }
    : { kind: "unavailable" };
}

export async function loadParentReportRenderPayloadForCounselor(
  reportId: string,
): Promise<ParentReportRenderPayload | null> {
  const { supabase } = await requireCounselor();
  const result = await supabase.rpc("get_parent_report_render_payload", {
    p_report_id: reportId,
  });
  return result.error
    ? null
    : parseParentReportRenderPayload(result.data?.[0]?.payload);
}

export async function loadParentReportRenderPayloadForDirector(
  reportId: string,
): Promise<ParentReportRenderPayload | null> {
  const { supabase } = await requireDirector();
  const result = await supabase.rpc("get_parent_report_render_payload", {
    p_report_id: reportId,
  });
  return result.error
    ? null
    : parseParentReportRenderPayload(result.data?.[0]?.payload);
}

export async function downloadParentReportAttachmentBytes(
  payload: ParentReportRenderPayload,
): Promise<Array<{ bytes: Uint8Array; displayName: string; mimeType: string }>> {
  const admin = createAdminClient();
  const attachments = [];
  for (const attachment of payload.attachments) {
    const result = await admin.storage
      .from(attachment.bucket_id)
      .download(attachment.storage_path);
    if (result.error || !result.data) {
      throw new Error("A selected Parent Report attachment is unavailable.");
    }
    const bytes = new Uint8Array(await result.data.arrayBuffer());
    if (bytes.byteLength !== attachment.file_size_bytes) {
      throw new Error("A selected Parent Report attachment failed integrity checks.");
    }
    attachments.push({
      bytes,
      displayName: attachment.display_name,
      mimeType: attachment.mime_type,
    });
  }
  return attachments;
}

export async function createFinalParentReportSignedUrl(
  bucketId: string,
  storagePath: string,
): Promise<string | null> {
  const admin = createAdminClient();
  const result = await admin.storage.from(bucketId).createSignedUrl(storagePath, 300);
  return result.error ? null : result.data.signedUrl;
}
