import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createParentReportPdf } from "./pdf";
import {
  downloadParentReportAttachmentBytes,
} from "./server";
import type { ParentReportRenderPayload } from "./parent-report";

export async function createParentReportPdfResponse(
  payload: ParentReportRenderPayload,
): Promise<Response> {
  let bytes: Uint8Array;
  let disposition = "inline";
  if (
    payload.status === "finalized" &&
    payload.final_pdf_bucket_id &&
    payload.final_pdf_storage_path
  ) {
    const admin = createAdminClient();
    const stored = await admin.storage
      .from(payload.final_pdf_bucket_id)
      .download(payload.final_pdf_storage_path);
    if (stored.error || !stored.data) {
      return new Response("Parent Report is temporarily unavailable.", {
        status: 503,
      });
    }
    bytes = new Uint8Array(await stored.data.arrayBuffer());
    disposition = "attachment";
  } else {
    const attachments = await downloadParentReportAttachmentBytes(payload);
    bytes = await createParentReportPdf(payload, attachments);
  }
  const filename = safeFilename(
    `K-GEO-Parent-Report-${payload.academic_period}-v${payload.version_number}.pdf`,
  );
  const responseBytes = Uint8Array.from(bytes);
  return new Response(responseBytes.buffer, {
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Content-Length": String(bytes.byteLength),
      "Content-Type": "application/pdf",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function safeFilename(value: string): string {
  return value.replace(/[^A-Za-z0-9._-]+/g, "-").slice(0, 180);
}
