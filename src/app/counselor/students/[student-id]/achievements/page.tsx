import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CounselorStudentWorkspaceAchievements } from "@/components/counselor/student-workspace-sections";
import { StateBlock } from "@/components/shell/portal-ui";
import { loadPrimaryCounselorAchievementEvidence } from "@/lib/counselor/achievement-evidence-server";
import { loadCounselorStudentProfile } from "@/lib/counselor/student-profile-server";

export const metadata: Metadata = {
  title: "Student Workspace achievements",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function CounselorStudentWorkspaceAchievementsPage({ params }: { params: Promise<{ "student-id": string }> }) {
  const studentId = (await params)["student-id"];
  const [result, evidence] = await Promise.all([
    loadCounselorStudentProfile(studentId, 1, 1, 1),
    loadPrimaryCounselorAchievementEvidence(studentId),
  ]);
  if (result.kind === "not_found") notFound();
  if (result.kind !== "ready") {
    return (
      <StateBlock
        description="Please refresh the page and try again shortly."
        title="Achievements are temporarily unavailable."
        tone="error"
      />
    );
  }
  return (
    <CounselorStudentWorkspaceAchievements evidence={evidence} result={result} />
  );
}
