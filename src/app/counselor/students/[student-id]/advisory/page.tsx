import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { CounselorStudentWorkspaceAdvisory } from "@/components/counselor/student-workspace-sections";
import { StateBlock } from "@/components/shell/portal-ui";
import { parseCounselorPrivatePage } from "@/lib/counselor/private-records";
import { parseStudent360HistoryPage } from "@/lib/counselor/student-profile";
import { loadCounselorStudentProfile } from "@/lib/counselor/student-profile-server";
import { loadCounselorProgressionEvidence } from "@/lib/counselor/progression-evidence-server";
import {
  buildOfficialProgressionUrl,
  isOfficialProgressionPageCanonical,
  parseOfficialProgressionPage,
} from "@/lib/counselor/progression";
import { loadCounselorStudentProgression } from "@/lib/counselor/progression-server";
import { loadCounselorSemesterSummaries } from "@/lib/counselor/semester-summary-server";
import { requireCounselor } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Student Workspace advisory",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type AdvisorySearchParams = {
  historyPage?: string | string[];
  notesPage?: string | string[];
  followUpsPage?: string | string[];
  progressionPage?: string | string[];
};

export default async function CounselorStudentWorkspaceAdvisoryPage({ params, searchParams }: { params: Promise<{ "student-id": string }>; searchParams: Promise<AdvisorySearchParams> }) {
  const studentId = (await params)["student-id"];
  const query = await searchParams;
  const historyPage = parseStudent360HistoryPage(query.historyPage);
  const notesPage = parseCounselorPrivatePage(query.notesPage);
  const followUpsPage = parseCounselorPrivatePage(query.followUpsPage);
  const progressionPage = parseOfficialProgressionPage(query.progressionPage);
  const { user } = await requireCounselor();
  const result = await loadCounselorStudentProfile(studentId, historyPage, notesPage, followUpsPage);
  if (result.kind === "not_found") notFound();
  if (result.kind === "out_of_range") redirect(`/counselor/students/${studentId}/advisory`);
  if (result.kind !== "ready") {
    return (
      <StateBlock
        description="Please refresh the page and try again shortly."
        title="Advisory information is temporarily unavailable."
        tone="error"
      />
    );
  }
  if (result.privateRecords.notes.kind === "out_of_range" || result.privateRecords.followUps.kind === "out_of_range") {
    redirect(buildOfficialProgressionUrl(result.identity.student_id, {
      historyPage,
      notesPage: result.privateRecords.notes.kind === "out_of_range" ? 1 : notesPage,
      followUpsPage: result.privateRecords.followUps.kind === "out_of_range" ? 1 : followUpsPage,
      progressionPage,
    }));
  }

  const pages = { historyPage, notesPage, followUpsPage, progressionPage };
  if (!isOfficialProgressionPageCanonical(query.progressionPage, progressionPage)) {
    redirect(buildOfficialProgressionUrl(result.identity.student_id, pages));
  }

  const [progression, semesterSummaries] = await Promise.all([
    loadCounselorStudentProgression(result.identity.student_id, progressionPage),
    loadCounselorSemesterSummaries(result.identity.student_id),
  ]);
  if (progression.kind === "out_of_range") {
    redirect(buildOfficialProgressionUrl(result.identity.student_id, {
      ...pages,
      progressionPage: progression.finalPage,
    }));
  }
  const progressionEvidence = progression.kind === "ready"
    ? await loadCounselorProgressionEvidence(result.identity.student_id, progression.events.map((event) => event.id))
    : { kind: "unavailable" as const };

  return <CounselorStudentWorkspaceAdvisory currentCounselorId={user.id} pages={pages} progression={progression} progressionEvidence={progressionEvidence} result={result} semesterSummaries={semesterSummaries} />;
}
