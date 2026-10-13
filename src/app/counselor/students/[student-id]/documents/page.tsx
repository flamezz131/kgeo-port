import type { Metadata } from "next";
import { CounselorStudentProfileDocuments } from "@/components/counselor/student-profile-documents";
import { loadPrimaryCounselorProfileDocuments } from "@/lib/counselor/profile-documents-server";

export const metadata: Metadata = {
  title: "Student Workspace documents",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function CounselorStudentWorkspaceDocumentsPage({
  params,
}: {
  params: Promise<{ "student-id": string }>;
}) {
  const studentId = (await params)["student-id"];
  const result = await loadPrimaryCounselorProfileDocuments(studentId);

  return (
    <CounselorStudentProfileDocuments result={result} studentId={studentId} />
  );
}
