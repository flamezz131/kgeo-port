import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GlobalReadinessAssessmentPage } from "@/components/counselor/global-readiness-assessment";
import { StateBlock } from "@/components/shell/portal-ui";
import { loadGlobalReadinessPage } from "@/lib/counselor/global-readiness-server";

export const metadata: Metadata = {
  title: "Student Workspace readiness",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function CounselorStudentWorkspaceReadinessPage({
  params,
}: {
  params: Promise<{ "student-id": string }>;
}) {
  const studentId = (await params)["student-id"];
  const result = await loadGlobalReadinessPage(studentId);
  if (result.kind === "not_found") notFound();
  if (result.kind === "unavailable") {
    return (
      <StateBlock
        description="Please refresh the page and try again shortly."
        title="Global readiness is temporarily unavailable."
        tone="error"
      />
    );
  }
  return (
    <GlobalReadinessAssessmentPage
      assessments={result.assessments}
      evidence={result.evidence}
      studentId={studentId}
    />
  );
}
