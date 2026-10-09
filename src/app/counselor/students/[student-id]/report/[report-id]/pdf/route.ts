import { loadParentReportRenderPayloadForCounselor } from "@/lib/parent-reports/server";
import { createParentReportPdfResponse } from "@/lib/parent-reports/response";

export async function GET(
  _request: Request,
  context: RouteContext<"/counselor/students/[student-id]/report/[report-id]/pdf">,
) {
  const { "student-id": studentId, "report-id": reportId } = await context.params;
  const payload = await loadParentReportRenderPayloadForCounselor(reportId);
  if (!payload || payload.student_id !== studentId) {
    return new Response("Not found", { status: 404 });
  }
  try {
    return await createParentReportPdfResponse(payload);
  } catch (error: any) {
    console.error("PDF GENERATION ERROR:", error);
    return new Response(`Parent Report preview is temporarily unavailable. Error: ${error?.message || error}`, {
      status: 503,
    });
  }
}
