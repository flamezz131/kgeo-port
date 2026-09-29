import Link from "next/link";
import { FollowUpWorkloadActions } from "@/components/counselor/follow-up-workload-actions";
import {
  FOLLOW_UP_LIFECYCLE_OPTIONS,
  FOLLOW_UP_PRIORITY_FILTER_OPTIONS,
  FOLLOW_UP_WORKLOAD_BASE_PATH,
  formatFollowUpWorkloadDate,
  formatFollowUpWorkloadTimestamp,
  getFollowUpWorkloadLifecycle,
  getFollowUpWorkloadLifecycleLabel,
  getFollowUpWorkloadPagination,
  getFollowUpWorkloadPriorityLabel,
  type FollowUpWorkloadMetrics as WorkloadMetrics,
  type FollowUpWorkloadLinkedRecord,
  type FollowUpWorkloadReadyResult,
  type ParsedFollowUpWorkloadQuery,
} from "@/lib/counselor/follow-up-workload";

const metricDefinitions: ReadonlyArray<{
  key: keyof WorkloadMetrics;
  label: string;
}> = [
  { key: "overdueCount", label: "Overdue" },
  { key: "dueTodayCount", label: "Due Today" },
  { key: "upcomingCount", label: "Upcoming" },
  { key: "totalPendingCount", label: "Total Pending" },
  { key: "completedCount", label: "Completed" },
  { key: "cancelledCount", label: "Cancelled" },
];

export function FollowUpWorkloadMetrics({
  metrics,
}: {
  metrics: WorkloadMetrics;
}) {
  return (
    <section aria-labelledby="follow-up-metrics-heading">
      <div className="follow-up-workload-section-heading">
        <div>
          <span className="eyebrow">Complete counselor workload</span>
          <h2 id="follow-up-metrics-heading">Workload summary</h2>
        </div>
        <p>These global counts remain unchanged when list filters change.</p>
      </div>
      <div className="follow-up-workload-metrics">
        {metricDefinitions.map(({ key, label }) => (
          <article
            aria-label={`${label}: ${metrics[key]}`}
            className="follow-up-workload-metric"
            key={key}
          >
            <span>{label}</span>
            <strong>{metrics[key]}</strong>
          </article>
        ))}
      </div>
    </section>
  );
}

function getActiveFilterLabels(query: ParsedFollowUpWorkloadQuery): string[] {
  const labels: string[] = [];
  if (query.lifecycle !== "all") {
    labels.push(
      FOLLOW_UP_LIFECYCLE_OPTIONS.find(
        (option) => option.value === query.lifecycle,
      )?.label ?? query.lifecycle,
    );
  }
  if (query.priority !== "all") {
    labels.push(`${getFollowUpWorkloadPriorityLabel(query.priority)} priority`);
  }
  if (query.search) labels.push(`Search: ${query.search}`);
  if (query.dueFrom) labels.push(`Due from ${query.dueFrom}`);
  if (query.dueTo) labels.push(`Due to ${query.dueTo}`);
  return labels;
}

export function FollowUpWorkloadFilters({
  query,
}: {
  query: ParsedFollowUpWorkloadQuery;
}) {
  const activeFilters = getActiveFilterLabels(query);
  return (
    <section
      aria-labelledby="follow-up-filters-heading"
      className="follow-up-workload-panel"
    >
      <div className="follow-up-workload-section-heading">
        <div>
          <span className="eyebrow">Workload controls</span>
          <h2 id="follow-up-filters-heading">Search and filter</h2>
        </div>
        {query.hasFilters && (
          <Link
            className="follow-up-workload-clear"
            href={FOLLOW_UP_WORKLOAD_BASE_PATH}
          >
            Clear filters
          </Link>
        )}
      </div>

      <form
        action={FOLLOW_UP_WORKLOAD_BASE_PATH}
        className="follow-up-workload-filter-form"
        method="get"
      >
        <div className="follow-up-workload-field follow-up-workload-search">
          <label htmlFor="follow-up-search">Student search</label>
          <input
            defaultValue={query.search ?? ""}
            id="follow-up-search"
            maxLength={100}
            name="search"
            placeholder="Search by student name, college email or roll number"
            type="search"
          />
        </div>
        <div className="follow-up-workload-field">
          <label htmlFor="follow-up-lifecycle">Lifecycle</label>
          <select
            defaultValue={query.lifecycle}
            id="follow-up-lifecycle"
            name="lifecycle"
          >
            {FOLLOW_UP_LIFECYCLE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="follow-up-workload-field">
          <label htmlFor="follow-up-priority">Priority</label>
          <select
            defaultValue={query.priority}
            id="follow-up-priority"
            name="priority"
          >
            {FOLLOW_UP_PRIORITY_FILTER_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
        <div className="follow-up-workload-field">
          <label htmlFor="follow-up-due-from">Due from</label>
          <input
            defaultValue={query.dueFrom ?? ""}
            id="follow-up-due-from"
            name="dueFrom"
            type="date"
          />
        </div>
        <div className="follow-up-workload-field">
          <label htmlFor="follow-up-due-to">Due to</label>
          <input
            defaultValue={query.dueTo ?? ""}
            id="follow-up-due-to"
            name="dueTo"
            type="date"
          />
        </div>
        <div className="follow-up-workload-filter-actions">
          <button className="button counselor-primary-button" type="submit">
            Apply filters
          </button>
          {query.hasFilters && (
            <Link
              className="button button-secondary"
              href={FOLLOW_UP_WORKLOAD_BASE_PATH}
            >
              Clear filters
            </Link>
          )}
        </div>
      </form>

      <div className="follow-up-workload-active-filters" role="status">
        <strong>Active filters:</strong>{" "}
        {activeFilters.length > 0 ? activeFilters.join(" · ") : "None"}
      </div>
    </section>
  );
}

function LifecycleBadge({
  businessToday,
  record,
}: {
  businessToday: string;
  record: FollowUpWorkloadLinkedRecord;
}) {
  const lifecycle = getFollowUpWorkloadLifecycle(record, businessToday);
  return (
    <span
      className={`counselor-private-badge counselor-follow-up-${lifecycle}`}
    >
      {getFollowUpWorkloadLifecycleLabel(lifecycle)}
    </span>
  );
}

function ProfileLink({ record }: { record: FollowUpWorkloadLinkedRecord }) {
  const studentName = record.fullName ?? "Name not available";
  return (
    <Link
      aria-label={`View Student Profile for ${studentName}`}
      className="follow-up-workload-profile-link"
      href={`/counselor/students/${record.studentId}`}
    >
      View Student Profile
    </Link>
  );
}

function RecordActions({
  instance,
  record,
}: {
  instance: "desktop" | "mobile";
  record: FollowUpWorkloadLinkedRecord;
}) {
  return (
    <div className="follow-up-workload-record-controls">
      <ProfileLink record={record} />
      {record.storedStatus === "pending" ? (
        <FollowUpWorkloadActions followUp={record} instance={instance} />
      ) : (
        <p className="counselor-private-final-state">
          Final records cannot be edited, reopened or deleted.
        </p>
      )}
    </div>
  );
}

function WorkloadDesktopTable({
  businessToday,
  records,
}: {
  businessToday: string;
  records: FollowUpWorkloadLinkedRecord[];
}) {
  return (
    <div className="follow-up-workload-table-wrapper">
      <table className="follow-up-workload-table">
        <caption>
          Counselor-owned follow-ups with student identity, due dates, status,
          and available actions
        </caption>
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Due / lifecycle</th>
            <th scope="col">Priority</th>
            <th scope="col">Next action</th>
            <th scope="col">Consultation</th>
            <th scope="col">Audit dates</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={record.followUpId}>
              <th scope="row">
                <strong>{record.fullName ?? "Name not available"}</strong>
                <span>{record.collegeEmail}</span>
                <small>{record.rollNumber ?? "Not provided"}</small>
              </th>
              <td>
                <time dateTime={record.dueDate}>
                  {formatFollowUpWorkloadDate(record.dueDate)}
                </time>
                <LifecycleBadge
                  businessToday={businessToday}
                  record={record}
                />
              </td>
              <td>{getFollowUpWorkloadPriorityLabel(record.priority)}</td>
              <td className="follow-up-workload-next-action">
                {record.nextAction}
              </td>
              <td>
                {record.consultationReference ? (
                  <span>{record.consultationReference}</span>
                ) : (
                  <span className="muted">Not linked</span>
                )}
              </td>
              <td>
                <span>
                  Created{" "}
                  {formatFollowUpWorkloadTimestamp(record.createdAt)}
                </span>
                <span>
                  Updated{" "}
                  {formatFollowUpWorkloadTimestamp(record.updatedAt)}
                </span>
                {record.completedAt && (
                  <span>
                    Completed{" "}
                    {formatFollowUpWorkloadTimestamp(record.completedAt)}
                  </span>
                )}
              </td>
              <td>
                <RecordActions instance="desktop" record={record} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function WorkloadMobileCards({
  businessToday,
  records,
}: {
  businessToday: string;
  records: FollowUpWorkloadLinkedRecord[];
}) {
  return (
    <ul
      aria-label="Counselor follow-up workload"
      className="follow-up-workload-mobile-list"
    >
      {records.map((record) => (
        <li key={record.followUpId}>
          <article className="follow-up-workload-card">
            <header>
              <div>
                <h3>{record.fullName ?? "Name not available"}</h3>
                <p>{record.collegeEmail}</p>
              </div>
              <LifecycleBadge
                businessToday={businessToday}
                record={record}
              />
            </header>
            <dl>
              <div>
                <dt>Roll number</dt>
                <dd>{record.rollNumber ?? "Not provided"}</dd>
              </div>
              <div>
                <dt>Due date</dt>
                <dd>{formatFollowUpWorkloadDate(record.dueDate)}</dd>
              </div>
              <div>
                <dt>Priority</dt>
                <dd>{getFollowUpWorkloadPriorityLabel(record.priority)}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>{formatFollowUpWorkloadTimestamp(record.createdAt)}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{formatFollowUpWorkloadTimestamp(record.updatedAt)}</dd>
              </div>
              <div>
                <dt>Consultation</dt>
                <dd>{record.consultationReference ?? "Not linked"}</dd>
              </div>
              {record.completedAt && (
                <div>
                  <dt>Completed</dt>
                  <dd>
                    {formatFollowUpWorkloadTimestamp(record.completedAt)}
                  </dd>
                </div>
              )}
            </dl>
            <section aria-label="Next action">
              <h4>Next action</h4>
              <p>{record.nextAction}</p>
            </section>
            <RecordActions instance="mobile" record={record} />
          </article>
        </li>
      ))}
    </ul>
  );
}

function WorkloadPagination({
  result,
}: {
  result: FollowUpWorkloadReadyResult;
}) {
  const pagination = getFollowUpWorkloadPagination(result);
  if (result.records.length === 0 || pagination.pageCount <= 1) return null;
  return (
    <nav
      aria-label="Follow-up workload pagination"
      className="follow-up-workload-pagination"
    >
      <div>
        {pagination.firstUrl ? (
          <Link href={pagination.firstUrl}>First</Link>
        ) : (
          <span aria-disabled="true">First</span>
        )}
        {pagination.previousUrl ? (
          <Link href={pagination.previousUrl} rel="prev">
            Previous
          </Link>
        ) : (
          <span aria-disabled="true">Previous</span>
        )}
      </div>
      <span aria-current="page">
        Page {pagination.currentPage} of {pagination.pageCount}
      </span>
      <div>
        {pagination.nextUrl ? (
          <Link href={pagination.nextUrl} rel="next">
            Next
          </Link>
        ) : (
          <span aria-disabled="true">Next</span>
        )}
        {pagination.finalUrl ? (
          <Link href={pagination.finalUrl}>Final</Link>
        ) : (
          <span aria-disabled="true">Final</span>
        )}
      </div>
    </nav>
  );
}

function getEmptyState(result: FollowUpWorkloadReadyResult) {
  const globalTotal =
    result.metrics.totalPendingCount +
    result.metrics.completedCount +
    result.metrics.cancelledCount;
  if (globalTotal === 0) {
    return {
      heading: "No follow-ups have been added.",
      message:
        "Student-specific follow-ups created from Student 360 will appear here.",
    };
  }
  if (result.query.lifecycle === "overdue") {
    return {
      heading: "No overdue follow-ups.",
      message: "There are no pending actions before today.",
    };
  }
  if (result.query.lifecycle === "due_today") {
    return {
      heading: "No follow-ups are due today.",
      message: "There are no pending actions due on the current business date.",
    };
  }
  return {
    heading: "No follow-ups match the current filters.",
    message: "Adjust or clear the filters to view other counselor follow-ups.",
  };
}

export function FollowUpWorkloadResults({
  result,
}: {
  result: FollowUpWorkloadReadyResult;
}) {
  if (result.records.length === 0) {
    const emptyState = getEmptyState(result);
    return (
      <section className="follow-up-workload-empty" role="status">
        <h2>{emptyState.heading}</h2>
        <p>{emptyState.message}</p>
        {result.query.hasFilters && (
          <Link
            className="button button-secondary"
            href={FOLLOW_UP_WORKLOAD_BASE_PATH}
          >
            Clear filters
          </Link>
        )}
      </section>
    );
  }

  return (
    <section
      aria-labelledby="follow-up-workload-results-heading"
      className="follow-up-workload-results"
    >
      <div className="follow-up-workload-section-heading">
        <div>
          <span className="eyebrow">Filtered operational list</span>
          <h2 id="follow-up-workload-results-heading">Follow-up records</h2>
        </div>
        <p>{result.totalCount} matching follow-ups</p>
      </div>
      <WorkloadDesktopTable
        businessToday={result.businessToday}
        records={result.records}
      />
      <WorkloadMobileCards
        businessToday={result.businessToday}
        records={result.records}
      />
      <WorkloadPagination result={result} />
    </section>
  );
}
