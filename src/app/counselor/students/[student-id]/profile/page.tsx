import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CounselorStudentWorkspaceProfile } from "@/components/counselor/student-workspace-sections";
import { StateBlock } from "@/components/shell/portal-ui";
import { loadCounselorStudentProfile } from "@/lib/counselor/student-profile-server";

export const metadata: Metadata = {
  title: "Student Workspace profile",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function CounselorStudentWorkspaceProfilePage({ params }: { params: Promise<{ "student-id": string }> }) {
  const studentId = (await params)["student-id"];
  const result = await loadCounselorStudentProfile(studentId, 1, 1, 1);
  if (result.kind === "not_found") notFound();
  if (result.kind !== "ready") {
    return (
      <StateBlock
        description="Please refresh the page and try again shortly."
        title="Student profile is temporarily unavailable."
        tone="error"
      />
    );
  }
  return <CounselorStudentWorkspaceProfile result={result} />;
}
