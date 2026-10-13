import type { Metadata } from "next";
import { ParentReportWorkspace } from "@/components/parent-reports/parent-report-workspace";
import { StateBlock } from "@/components/shell/portal-ui";
import { loadCounselorParentReports } from "@/lib/parent-reports/server";

export const metadata: Metadata = {
  title: "Student Workspace report",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function CounselorStudentWorkspaceReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ "student-id": string }>;
  searchParams: Promise<{ report?: string }>;
}) {
  const studentId = (await params)["student-id"];
  const selectedReportId = (await searchParams).report;
  const result = await loadCounselorParentReports(studentId, selectedReportId);
  if (result.kind === "unavailable") {
    return (
      <StateBlock
        description="Please refresh and try again shortly."
        title="Parent Reports are temporarily unavailable."
        tone="error"
      />
    );
  }
  return (
    <ParentReportWorkspace
      candidates={result.candidates}
      reports={result.reports}
      studentId={studentId}
      viewerRole="counselor"
      workspace={result.workspace}
    />
  );
}
