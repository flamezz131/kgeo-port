import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CounselorStudentWorkspaceOverview } from "@/components/counselor/student-workspace-sections";
import { StateBlock } from "@/components/shell/portal-ui";
import { loadCounselorStudentProgression } from "@/lib/counselor/progression-server";
import { loadCounselorStudentWorkspaceOverview } from "@/lib/counselor/student-workspace-server";
import { loadCounselorUniversityApplications } from "@/lib/counselor/university-application-server";

export const metadata: Metadata = {
  title: "Student Workspace overview",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function CounselorStudentWorkspaceOverviewPage({ params }: { params: Promise<{ "student-id": string }> }) {
  const studentId = (await params)["student-id"];
  const result = await loadCounselorStudentWorkspaceOverview(studentId);
  if (result.kind === "not_found") notFound();
  if (result.kind !== "ready") {
    return (
      <StateBlock
        description="Please refresh the page and try again shortly."
        title="Student overview is temporarily unavailable."
        tone="error"
      />
    );
  }

  const [progression, applications] = await Promise.all([
    loadCounselorStudentProgression(studentId, 1),
    loadCounselorUniversityApplications(studentId),
  ]);
  return <CounselorStudentWorkspaceOverview applications={applications} progression={progression} result={result.overview} />;
}
