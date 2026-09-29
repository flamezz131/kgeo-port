import {
  buildDirectorMetricPresentation,
  getDirectorAttentionPresentation,
  summarizeDirectorAttention,
  type DirectorMetricItem,
} from "@/lib/director/dashboard";
import type {
  DirectorDashboardData,
  DirectorDashboardSection,
} from "@/lib/director/dashboard-server";
import type {
  DirectorAttentionItem,
  DirectorCounselorWorkloadSummary,
} from "@/types";

const SEVERITY_STYLE: Record<string, { edge: string; label: string }> = {
  high: { edge: "border-l-rose-500", label: "text-rose-700" },
  medium: { edge: "border-l-amber-500", label: "text-amber-700" },
  low: { edge: "border-l-[#1D4ED8]", label: "text-[#1D4ED8]" },
};

function SectionUnavailable({ title }: { title: string }) {
  return (
    <div
      className="rounded-xl border border-rose-200 bg-rose-50 p-5 text-rose-800"
      role="alert"
    >
      <h3 className="text-rose-900">{title} temporarily unavailable</h3>
      <p className="mt-1.5 text-sm">Please refresh the page and try again.</p>
    </div>
  );
}

function SectionHeading({
  eyebrow,
  title,
  id,
  aside,
}: {
  eyebrow: string;
  title: string;
  id?: string;
  aside?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[#1D4ED8]">
          {eyebrow}
        </span>
        <h2 className="mt-1.5" id={id}>
          {title}
        </h2>
      </div>
      {aside && (
        <span className="text-[0.78rem] font-medium text-slate-500">
          {aside}
        </span>
      )}
    </div>
  );
}

function MetricCard({ metric }: { metric: DirectorMetricItem }) {
  return (
    <article className="flex flex-col gap-2 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_3px_rgb(15_23_42/0.06)] transition-shadow hover:shadow-[0_10px_24px_-14px_rgb(15_23_42/0.3)]">
      <span className="text-[0.72rem] font-bold leading-snug text-slate-500">
        {metric.label}
      </span>
      <strong className="text-3xl font-extrabold tabular-nums leading-none tracking-tight text-[#0B1F3A]">
        {metric.value}
      </strong>
      <p className="text-[0.72rem] leading-snug text-slate-400">
        {metric.description}
      </p>
    </article>
  );
}

function AttentionSummary({
  attention,
}: {
  attention: DirectorDashboardData["attention"];
}) {
  if (attention.status === "error") {
    return <SectionUnavailable title="Attention queue" />;
  }

  if (attention.data.length === 0) {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"
        role="status"
      >
        <h3 className="text-emerald-900">No Director attention items</h3>
        <p className="mt-1.5 text-sm text-emerald-800">
          The current operational queue is clear.
        </p>
      </div>
    );
  }

  const summary = summarizeDirectorAttention(attention.data);

  return (
    <dl className="grid grid-cols-3 divide-x divide-[#E2E8F0]">
      <div className="pr-3">
        <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
          Current queue
        </dt>
        <dd className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight text-[#0B1F3A]">
          {summary.total}
        </dd>
      </div>
      <div className="px-3">
        <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
          High priority
        </dt>
        <dd className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight text-rose-600">
          {summary.high}
        </dd>
      </div>
      <div className="pl-3">
        <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
          Medium priority
        </dt>
        <dd className="mt-1 text-3xl font-extrabold tabular-nums tracking-tight text-amber-600">
          {summary.medium}
        </dd>
      </div>
    </dl>
  );
}

function PrimaryMetrics({
  metrics,
}: {
  metrics: DirectorDashboardData["metrics"];
}) {
  if (metrics.status === "error") {
    return <SectionUnavailable title="Operational metrics" />;
  }

  const presentation = buildDirectorMetricPresentation(metrics.data);

  return (
    <div
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
      aria-label="Primary metrics"
    >
      {presentation.primary.map((metric) => (
        <MetricCard key={metric.key} metric={metric} />
      ))}
    </div>
  );
}

function AttentionItems({
  attention,
}: {
  attention: DirectorDashboardSection<DirectorAttentionItem[]>;
}) {
  if (attention.status === "error") {
    return <SectionUnavailable title="Attention items" />;
  }

  if (attention.data.length === 0) {
    return (
      <div
        className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"
        role="status"
      >
        <h3 className="text-emerald-900">No Director attention items</h3>
        <p className="mt-1.5 text-sm text-emerald-800">
          New deadline and consultation exceptions will appear here.
        </p>
      </div>
    );
  }

  return (
    <ul
      className="grid gap-3 lg:grid-cols-2"
      aria-label="Director attention items"
    >
      {attention.data.map((item) => {
        const presentation = getDirectorAttentionPresentation(item);
        const entityId = item.applicationId ?? item.consultationId;
        const dateTime = item.submissionDeadline ?? item.consultationScheduledAt;
        const severity = SEVERITY_STYLE[item.severity] ?? SEVERITY_STYLE.low;

        return (
          <li key={`${item.attentionType}:${entityId}`}>
            <article
              className={`flex h-full flex-col gap-3 rounded-xl border border-[#E2E8F0] border-l-[3px] bg-white p-4 shadow-[0_1px_3px_rgb(15_23_42/0.06)] ${severity.edge}`}
            >
              <div>
                <span
                  className={`flex items-center gap-1.5 text-[0.65rem] font-extrabold uppercase tracking-[0.08em] ${severity.label}`}
                >
                  <span aria-hidden="true">!</span>
                  {presentation.priorityLabel}
                </span>
                <h3 className="mt-1.5">{presentation.title}</h3>
              </div>

              <p className="flex flex-col gap-0.5 text-sm">
                <strong className="font-bold text-[#0B1F3A]">
                  {item.studentFullName ?? "Student name unavailable"}
                </strong>
                <span className="break-words text-[0.78rem] text-slate-500">
                  {item.collegeEmail}
                </span>
              </p>

              <dl className="flex flex-wrap gap-x-8 gap-y-2 border-t border-[#E2E8F0] pt-3 text-sm">
                <div>
                  <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                    Timing
                  </dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-[#0B1F3A]">
                    <time dateTime={dateTime ?? undefined}>
                      {presentation.timingLabel}
                    </time>
                  </dd>
                </div>
                {presentation.statusLabel && (
                  <div>
                    <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                      Application status
                    </dt>
                    <dd className="mt-0.5 font-semibold text-[#0B1F3A]">
                      {presentation.statusLabel}
                    </dd>
                  </div>
                )}
              </dl>

              <p className="mt-auto flex flex-col gap-0.5 rounded-lg bg-slate-50 p-3 text-[0.8rem]">
                <strong>Next step</strong>
                <span className="text-slate-600">
                  {presentation.nextAction}
                </span>
              </p>
            </article>
          </li>
        );
      })}
    </ul>
  );
}

function WorkloadCells({
  counselor,
}: {
  counselor: DirectorCounselorWorkloadSummary;
}) {
  return (
    <>
      <div>
        <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
          Consultations today
        </dt>
        <dd className="mt-0.5 font-bold tabular-nums text-[#0B1F3A]">
          {counselor.consultationsToday}
        </dd>
      </div>
      <div>
        <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
          Pending outcomes
        </dt>
        <dd className="mt-0.5 font-bold tabular-nums text-[#0B1F3A]">
          {counselor.pendingOutcomes}
        </dd>
      </div>
      <div>
        <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
          Pending follow-ups
        </dt>
        <dd className="mt-0.5 font-bold tabular-nums text-[#0B1F3A]">
          {counselor.pendingFollowUps}
        </dd>
      </div>
      <div>
        <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
          Overdue follow-ups
        </dt>
        <dd
          className={`mt-0.5 font-bold tabular-nums ${
            counselor.overdueFollowUps > 0 ? "text-rose-600" : "text-[#0B1F3A]"
          }`}
        >
          {counselor.overdueFollowUps}
        </dd>
      </div>
    </>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`director-status-badge ${isActive ? "is-active" : "is-inactive"}`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

function CounselorWorkload({
  workload,
}: {
  workload: DirectorDashboardSection<DirectorCounselorWorkloadSummary[]>;
}) {
  if (workload.status === "error") {
    return <SectionUnavailable title="Counselor workload" />;
  }

  if (workload.data.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5"
        role="status"
      >
        <h3>No counselor workload available</h3>
        <p className="mt-1.5 text-sm text-slate-500">
          Counselor aggregate workload will appear when profiles exist.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="director-workload-table-wrapper">
        <table className="director-workload-table">
          <caption>
            Counselor workload aggregates, ordered by overdue and pending work
          </caption>
          <thead>
            <tr>
              <th scope="col">Counselor</th>
              <th scope="col">Status</th>
              <th scope="col">Today</th>
              <th scope="col">Pending outcomes</th>
              <th scope="col">Pending follow-ups</th>
              <th scope="col">Overdue follow-ups</th>
            </tr>
          </thead>
          <tbody>
            {workload.data.map((counselor) => (
              <tr key={counselor.counselorId}>
                <th scope="row">
                  <strong>
                    {counselor.counselorFullName ?? "Name unavailable"}
                  </strong>
                  <span>{counselor.collegeEmail}</span>
                </th>
                <td>
                  <StatusBadge isActive={counselor.isActive} />
                </td>
                <td>{counselor.consultationsToday}</td>
                <td>{counselor.pendingOutcomes}</td>
                <td>{counselor.pendingFollowUps}</td>
                <td>{counselor.overdueFollowUps}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="director-workload-mobile" aria-label="Counselor workload">
        {workload.data.map((counselor) => (
          <li key={counselor.counselorId}>
            <article className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_3px_rgb(15_23_42/0.06)]">
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate">
                    {counselor.counselorFullName ?? "Name unavailable"}
                  </h3>
                  <p className="mt-0.5 break-words text-[0.78rem] text-slate-500">
                    {counselor.collegeEmail}
                  </p>
                </div>
                <StatusBadge isActive={counselor.isActive} />
              </header>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-[#E2E8F0] pt-4 text-sm">
                <WorkloadCells counselor={counselor} />
              </dl>
            </article>
          </li>
        ))}
      </ul>
    </>
  );
}

function SecondaryMetrics({
  metrics,
}: {
  metrics: DirectorDashboardData["metrics"];
}) {
  if (metrics.status === "error") return null;

  const presentation = buildDirectorMetricPresentation(metrics.data);

  return (
    <div className="grid gap-3 lg:grid-cols-3">
      {presentation.secondary.map((group) => (
        <section
          className="flex flex-col rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgb(15_23_42/0.06)]"
          key={group.key}
        >
          <h3>{group.title}</h3>
          <p className="mt-1 text-[0.78rem] leading-snug text-slate-500">
            {group.description}
          </p>
          <dl className="mt-4 flex flex-col divide-y divide-[#E2E8F0] border-t border-[#E2E8F0]">
            {group.items.map((metric) => (
              <div
                key={metric.key}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <dt className="text-[0.83rem] text-slate-600">
                  {metric.label}
                </dt>
                <dd className="text-base font-extrabold tabular-nums text-[#0B1F3A]">
                  {metric.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function DirectorDashboard({
  dashboard,
}: {
  dashboard: DirectorDashboardData;
}) {
  return (
    <div className="director-page flex flex-col gap-8">
      <header className="director-page-header flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#1D4ED8]">
            Director dashboard
          </span>
          <h1 className="mt-2">Operational overview</h1>
          <p className="mt-2 max-w-2xl text-slate-500">
            Welcome, {dashboard.directorName}. Monitor current demand,
            exceptions, and counselor workload.
          </p>
        </div>
        <span className="director-read-only-badge shrink-0">
          Read-only overview
        </span>
      </header>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] xl:items-start">
        <section
          aria-labelledby="director-attention-summary-heading"
          className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgb(15_23_42/0.06)] sm:p-6"
        >
          <SectionHeading
            eyebrow="Needs attention"
            title="Current queue"
            id="director-attention-summary-heading"
            aside="Up to 25 items"
          />
          <AttentionSummary attention={dashboard.attention} />
        </section>

        <section aria-labelledby="director-primary-metrics-heading">
          <SectionHeading
            eyebrow="System health"
            title="Primary metrics"
            id="director-primary-metrics-heading"
          />
          <PrimaryMetrics metrics={dashboard.metrics} />
        </section>
      </div>

      <section
        aria-labelledby="director-attention-heading"
        className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgb(15_23_42/0.06)] sm:p-6"
      >
        <SectionHeading
          eyebrow="Operational exceptions"
          title="Attention items"
          id="director-attention-heading"
          aside="High priority appears first."
        />
        <AttentionItems attention={dashboard.attention} />
      </section>

      <section
        aria-labelledby="director-workload-heading"
        className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgb(15_23_42/0.06)] sm:p-6"
      >
        <SectionHeading
          eyebrow="Team operations"
          title="Counselor workload"
          id="director-workload-heading"
          aside="Up to 20 counselors"
        />
        <CounselorWorkload workload={dashboard.workload} />
      </section>

      <section aria-labelledby="director-secondary-heading">
        <SectionHeading
          eyebrow="Operating detail"
          title="Secondary metrics"
          id="director-secondary-heading"
        />
        <SecondaryMetrics metrics={dashboard.metrics} />
      </section>
    </div>
  );
}
