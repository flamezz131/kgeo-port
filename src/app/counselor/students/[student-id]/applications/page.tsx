import type { Metadata } from "next";
import { UniversityApplicationsSection } from "@/components/counselor/university-applications-section";
import { loadCounselorUniversityApplications } from "@/lib/counselor/university-application-server";

export const metadata: Metadata = {
  title: "Student Workspace applications",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function CounselorStudentWorkspaceApplicationsPage({
  params,
}: {
  params: Promise<{ "student-id": string }>;
}) {
  const studentId = (await params)["student-id"];
  const result = await loadCounselorUniversityApplications(studentId);

  return (
    <UniversityApplicationsSection
      canManageCase
      result={result}
      studentId={studentId}
    />
  );
}
