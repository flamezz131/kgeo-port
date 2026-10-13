import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CounselorUniversityApplicationWorkspace } from "@/components/counselor/university-application-workspace";
import {
  buildUniversityApplicationWorkspaceUrl,
  UNIVERSITY_APPLICATION_WORKSPACE_BASE_PATH,
  type UniversityApplicationWorkspaceSearchParams,
} from "@/lib/counselor/university-application-workspace";
import { loadCounselorUniversityApplicationWorkspace } from "@/lib/counselor/university-application-workspace-server";
import { requireCounselor } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Applications",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type CounselorApplicationsPageProps = {
  searchParams: Promise<UniversityApplicationWorkspaceSearchParams>;
};

function InvalidWorkspaceQuery() {
  return (
    <section
      aria-labelledby="application-workspace-invalid-heading"
      className="application-workspace-invalid"
      role="alert"
    >
      <h2 id="application-workspace-invalid-heading">
        Application filters could not be used.
      </h2>
      <p>
        One or more search or filter values were invalid or duplicated. No
        application data was loaded.
      </p>
      <Link
        className="button button-secondary button-small"
        href={UNIVERSITY_APPLICATION_WORKSPACE_BASE_PATH}
      >
        Return to default view
      </Link>
    </section>
  );
}

export default async function CounselorApplicationsPage({
  searchParams,
}: CounselorApplicationsPageProps) {
  const { supabase } = await requireCounselor();
  const result = await loadCounselorUniversityApplicationWorkspace(
    supabase,
    await searchParams,
  );

  if (result.kind === "invalid") {
    return (
      <section className="counselor-page application-workspace-page">
        <header className="counselor-page-header">
          <div>
            <h1>Applications</h1>
            <p className="muted">
              Review university applications across students and open Student
              360 for detailed management.
            </p>
          </div>
        </header>
        <InvalidWorkspaceQuery />
      </section>
    );
  }

  if (result.list?.pageBeyondRange) {
    redirect(buildUniversityApplicationWorkspaceUrl(result.query, { page: 1 }));
  }

  return (
    <CounselorUniversityApplicationWorkspace
      list={result.list}
      metrics={result.metrics}
      query={result.query}
    />
  );
}
