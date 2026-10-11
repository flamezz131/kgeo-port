import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApplicationJourneySection } from "@/components/counselor/application-journey-section";
import { CounselorStudentApplicationDetail } from "@/components/counselor/student-workspace-sections";
import { loadCounselorApplicationJourney } from "@/lib/counselor/application-journey-server";
import { isStudent360StudentId } from "@/lib/counselor/student-profile";
import { loadCounselorUniversityApplications } from "@/lib/counselor/university-application-server";

export const metadata: Metadata = {
  title: "Student Workspace application",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default async function CounselorStudentApplicationDetailPage({
  params,
}: {
  params: Promise<{ "application-id": string; "student-id": string }>;
}) {
  const route = await params;
  const studentId = route["student-id"];
  const applicationId = route["application-id"];
  if (!isStudent360StudentId(applicationId)) notFound();

  const [result, journey] = await Promise.all([
    loadCounselorUniversityApplications(studentId),
    loadCounselorApplicationJourney(studentId, applicationId),
  ]);
  if (result.kind !== "ready") {
    return (
      <p className="student-workspace-empty" role="alert">
        Application information is temporarily unavailable.
      </p>
    );
  }

  const application = result.applications.find(
    (candidate) => candidate.id === applicationId,
  );
  if (!application) notFound();

  return (
    <>
      <CounselorStudentApplicationDetail
        application={application}
        studentId={studentId}
      />
      <ApplicationJourneySection
        applicationId={application.id}
        applicationStatusLabel={application.currentStatusLabel}
        result={journey}
        studentId={studentId}
      />
    </>
  );
}
