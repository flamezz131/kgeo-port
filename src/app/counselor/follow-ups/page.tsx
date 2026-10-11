import type { Metadata } from "next";
import { redirect } from "next/navigation";
import {
  FollowUpWorkloadFilters,
  FollowUpWorkloadMetrics,
  FollowUpWorkloadResults,
} from "@/components/counselor/follow-up-workload";
import {
  FOLLOW_UP_WORKLOAD_UNAVAILABLE,
  buildFollowUpWorkloadUrl,
  parseFollowUpWorkloadQuery,
  type FollowUpWorkloadSearchParams,
} from "@/lib/counselor/follow-up-workload";
import { loadCounselorFollowUpWorkload } from "@/lib/counselor/follow-up-workload-server";
import { requireCounselor } from "@/lib/permissions";

export const metadata: Metadata = {
  title: "Follow-ups",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

type CounselorFollowUpsPageProps = {
  searchParams: Promise<FollowUpWorkloadSearchParams>;
};

function FollowUpWorkloadUnavailable() {
  return (
    <section className="follow-up-workload-unavailable" role="alert">
      <h2>{FOLLOW_UP_WORKLOAD_UNAVAILABLE}</h2>
      <p>Please refresh the page and try again shortly.</p>
    </section>
  );
}

export default async function CounselorFollowUpsPage({
  searchParams,
}: CounselorFollowUpsPageProps) {
  await requireCounselor();
  const rawSearchParams = await searchParams;
  const parsedQuery = parseFollowUpWorkloadQuery(rawSearchParams);

  if (parsedQuery.hadInvalidParameters) {
    redirect(buildFollowUpWorkloadUrl(parsedQuery));
  }

  const result = await loadCounselorFollowUpWorkload(rawSearchParams);
  if (result.kind === "out_of_range") {
    redirect(result.redirectTo);
  }

  return (
    <section className="counselor-page follow-up-workload-page">
      <header className="counselor-page-header">
        <div>
          <h1>Follow-ups</h1>
          <p className="muted">
            Track overdue, due-today, upcoming and completed student actions.
          </p>
        </div>
      </header>

      {result.kind === "unavailable" ? (
        <FollowUpWorkloadUnavailable />
      ) : (
        <>
          <FollowUpWorkloadMetrics metrics={result.metrics} />
          <FollowUpWorkloadFilters query={result.query} />
          {result.kind === "reference_unavailable" ? (
            <FollowUpWorkloadUnavailable />
          ) : (
            <FollowUpWorkloadResults result={result} />
          )}
        </>
      )}
    </section>
  );
}
