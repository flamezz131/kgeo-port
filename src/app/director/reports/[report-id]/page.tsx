import { notFound } from "next/navigation";
import { ParentReportWorkspace } from "@/components/parent-reports/parent-report-workspace";
import { loadDirectorParentReport } from "@/lib/parent-reports/server";

export default async function DirectorParentReportPage({ params }: { params: Promise<{ "report-id": string }> }) {
  const reportId = (await params)["report-id"];
  const result = await loadDirectorParentReport(reportId);
  if (result.kind === "not_found") notFound();
  if (result.kind === "unavailable") return <section className="counselor-page" role="alert"><h1>Parent Report is temporarily unavailable.</h1></section>;
  return <section className="counselor-page"><ParentReportWorkspace candidates={result.candidates} viewerRole="director" workspace={result.workspace} /></section>;
}
