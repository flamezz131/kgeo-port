import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  StudentDirectoryFilters,
  StudentDirectoryResults,
} from "@/components/counselor/student-directory";
import { MyPrimaryStudents } from "@/components/counselor/my-primary-students";
import { PageHeader, SectionHeader, StateBlock } from "@/components/shell/portal-ui";
import { loadCounselorPrimaryStudents } from "@/lib/counselor/primary-assignment-server";
import { requireCounselor } from "@/lib/permissions";
import { loadCounselorStudentDirectory } from "@/lib/counselor/student-directory-server";
import type { DirectorySearchParams } from "@/lib/counselor/student-directory";

export const metadata: Metadata = {
  title: "Students",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type CounselorStudentsPageProps = {
  searchParams: Promise<DirectorySearchParams>;
};

export default async function CounselorStudentsPage({
  searchParams,
}: CounselorStudentsPageProps) {
  await requireCounselor();
  const [result, primaryStudents] = await Promise.all([
    loadCounselorStudentDirectory(await searchParams),
    loadCounselorPrimaryStudents(),
  ]);

  if (result.kind === "out_of_range") {
    redirect(result.redirectTo);
  }

  return (
    <div className="flex flex-col gap-7">
      <PageHeader
        description="View registered students, profile progress, higher-studies readiness, and target intake."
        eyebrow="Counselor directory"
        title="Students"
      />

      <MyPrimaryStudents result={primaryStudents} />

      <section aria-labelledby="student-directory-heading">
        <SectionHeader
          description="This broader directory is not a Primary Counselor assignment list."
          eyebrow="Organization-wide students"
          title="Student directory"
          titleId="student-directory-heading"
        />

        <StudentDirectoryFilters query={result.query} />

        {result.kind === "unavailable" ? (
          <StateBlock
            description="Please refresh the page and try again shortly."
            title="Student directory is temporarily unavailable."
            tone="error"
          />
        ) : (
          <StudentDirectoryResults result={result} />
        )}
      </section>
    </div>
  );
}
