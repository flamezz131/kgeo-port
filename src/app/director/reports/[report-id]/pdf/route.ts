import { loadParentReportRenderPayloadForDirector } from "@/lib/parent-reports/server";
import { createParentReportPdfResponse } from "@/lib/parent-reports/response";

export async function GET(
  _request: Request,
  context: RouteContext<"/director/reports/[report-id]/pdf">,
) {
  const { "report-id": reportId } = await context.params;
  const payload = await loadParentReportRenderPayloadForDirector(reportId);
  if (!payload) return new Response("Not found", { status: 404 });
  try {
    return await createParentReportPdfResponse(payload);
  } catch {
    return new Response("Parent Report preview is temporarily unavailable.", {
      status: 503,
    });
  }
}
