import type { Metadata } from "next";
import { DirectorCounselorsOversight } from "@/components/director/director-operational-oversight";
import { loadDirectorCounselors } from "@/lib/director/operational-oversight-server";
import { requireDirector } from "@/lib/permissions";
import { DirectorCounselorList } from "./counselor-list";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export const metadata: Metadata = {
  title: "Director counselor management",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default async function DirectorCounselorsPage() {
  const { supabase } = await requireDirector();
  const [accountResult, workload] = await Promise.all([
    supabase.rpc("list_director_counselor_accounts"),
    loadDirectorCounselors(),
  ]);

  const counselors = (accountResult.data ?? []).map((account) => ({
    userId: account.user_id,
    username: account.username,
    fullName: account.full_name ?? "Name unavailable",
    approvalStatus: account.approval_status,
    isActive: account.is_active,
    createdAt: account.created_at,
  }));

  return (
    <div className="director-counselor-page">
      <section className="counselor-page director-page director-approval-page">
        <header className="counselor-page-header director-page-header">
          <div>
            <span className="eyebrow">Counselor access control</span>
            <h1>Counselor management</h1>
            <p>
              Review counselor registrations and control access to the
              working Counselor Portal.
            </p>
          </div>
          <span className="director-read-only-badge">
            Director approval required
          </span>
        </header>
        <DirectorCounselorList
          counselors={counselors}
          isUnavailable={Boolean(accountResult.error)}
        />
      </section>
      <DirectorCounselorsOversight data={workload} />
    </div>
  );
}
