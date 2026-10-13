import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CounselorEligibilityAssessmentPage } from "@/components/counselor/eligibility-assessment";
import { StateBlock } from "@/components/shell/portal-ui";
import { loadCounselorEligibilityPage } from "@/lib/counselor/eligibility-server";

export const metadata: Metadata = {
  title: "Student Workspace eligibility",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function CounselorStudentWorkspaceEligibilityPage({
  params,
}: {
  params: Promise<{ "student-id": string }>;
}) {
  const studentId = (await params)["student-id"];
  const result = await loadCounselorEligibilityPage(studentId);
  if (result.kind === "not_found") notFound();
  if (result.kind === "unavailable") {
    return (
      <StateBlock
        description="Please refresh the page and try again shortly."
        title="Eligibility Assessment is temporarily unavailable."
        tone="error"
      />
    );
  }

  return (
    <CounselorEligibilityAssessmentPage
      assessments={result.assessments}
      context={result.context}
      studentId={studentId}
    />
  );
}
