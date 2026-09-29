import Link from "next/link";
import {
  UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS,
  UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS,
  UNIVERSITY_APPLICATION_STATUS_LABELS,
} from "@/lib/counselor/university-applications";
import {
  buildUniversityApplicationWorkspaceUrl,
  formatUniversityApplicationWorkspaceTimestamp,
  getUniversityApplicationDeadlinePresentation,
  getUniversityApplicationWorkspaceEmptyKind,
  getUniversityApplicationWorkspacePagination,
  hasUniversityApplicationWorkspaceFilters,
  UNIVERSITY_APPLICATION_WORKSPACE_ARCHIVE_FILTERS,
  UNIVERSITY_APPLICATION_WORKSPACE_BASE_PATH,
  UNIVERSITY_APPLICATION_WORKSPACE_DEADLINE_FILTERS,
  UNIVERSITY_APPLICATION_WORKSPACE_DEGREE_LEVELS,
  UNIVERSITY_APPLICATION_WORKSPACE_INTAKE_TERMS,
  UNIVERSITY_APPLICATION_WORKSPACE_PAGE_SIZES,
  UNIVERSITY_APPLICATION_WORKSPACE_PRIMARY_FILTERS,
  UNIVERSITY_APPLICATION_WORKSPACE_SORTS,
  UNIVERSITY_APPLICATION_WORKSPACE_STATUSES,
  type UniversityApplicationWorkspaceListResult,
  type UniversityApplicationWorkspaceQuery,
} from "@/lib/counselor/university-application-workspace";
import {
  STUDENT_360_BASE_PATH,
  isStudent360StudentId,
} from "@/lib/counselor/student-profile";
import type {
  CounselorUniversityApplicationWorkspaceEntry,
  CounselorUniversityApplicationWorkspaceMetrics,
} from "@/types";

const primaryFilterLabels = {
  all: "All",
  primary: "Primary only",
  non_primary: "Non-primary only",
} as const;

const archiveFilterLabels = {
  active: "Active",
  archived: "Archived",
  all: "All",
} as const;

const deadlineFilterLabels = {
  all: "All deadlines",
  overdue: "Overdue",
  due_30_days: "Due in next 30 days",
  no_deadline: "No deadline",
} as const;

const sortLabels = {
  last_changed_desc: "Recently changed",
  deadline_asc: "Deadline: earliest first",
  deadline_desc: "Deadline: latest first",
  student_name_asc: "Student name",
  university_name_asc: "University name",
  intake_year_desc: "Intake year: newest first",
} as const;

const lifecycleMetrics = [
  ["planningCount", "Planning"],
  ["documentsCollectingCount", "Documents collecting"],
  ["applicationPreparingCount", "Application preparing"],
  ["readyToSubmitCount", "Ready to submit"],
  ["submittedCount", "Submitted"],
  ["underUniversityReviewCount", "Under university review"],
  ["additionalInformationRequestedCount", "Additional information requested"],
  ["decisionReceivedCount", "Decision received"],
  ["withdrawnCount", "Withdrawn"],
  ["closedCount", "Closed"],
] as const satisfies ReadonlyArray<
  readonly [keyof CounselorUniversityApplicationWorkspaceMetrics, string]
>;

function WorkspaceMetrics({
  metrics,
}: {
  metrics: CounselorUniversityApplicationWorkspaceMetrics | null;
}) {
  if (metrics === null) {
    return (
      <section className="application-workspace-metrics-unavailable" role="alert">
        <h2>Application metrics are temporarily unavailable.</h2>
        <p>The application list can still be reviewed below.</p>
      </section>
    );
  }

  const primaryMetrics = [
    ["Active applications", metrics.totalActiveApplications],
    ["Students with active applications", metrics.studentsWithApplications],
    ["Primary applications", metrics.primaryApplications],
    ["Overdue deadlines", metrics.overdueDeadlineCount],
    ["Due in next 30 days", metrics.dueNext30DaysCount],
    ["Archived applications", metrics.totalArchivedApplications],
  ] as const;

  return (
    <section aria-labelledby="application-workspace-metrics-heading">
      <div className="application-workspace-section-heading">
        <div>
          <span className="eyebrow">Operational overview</span>
          <h2 id="application-workspace-metrics-heading">Application metrics</h2>
        </div>
        <span className="application-workspace-scope-badge">
          Lifecycle metrics use active applications; archived total is separate
        </span>
      </div>
      <div className="application-workspace-metrics">
        {primaryMetrics.map(([label, value]) => (
          <article className="application-workspace-metric" key={label}>
            <span>{label}</span>
            <strong>{value.toLocaleString("en-IN")}</strong>
          </article>
        ))}
      </div>
      <details className="application-workspace-lifecycle">
        <summary>View lifecycle breakdown</summary>
        <dl>
          {lifecycleMetrics.map(([key, label]) => (
            <div key={key}>
              <dt>{label}</dt>
              <dd>{metrics[key].toLocaleString("en-IN")}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}

function WorkspaceFilters({
  query,
}: {
  query: UniversityApplicationWorkspaceQuery;
}) {
  const canClear =
    hasUniversityApplicationWorkspaceFilters(query) ||
    query.sort !== "last_changed_desc" ||
    query.page !== 1 ||
    query.pageSize !== 20;
  const activeView = [
    query.search ? "Search applied" : null,
    query.status
      ? `Status: ${UNIVERSITY_APPLICATION_STATUS_LABELS[query.status]}`
      : null,
    query.countryCode ? `Country: ${query.countryCode}` : null,
    query.degreeLevel
      ? `Degree: ${UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS[query.degreeLevel]}`
      : null,
    query.intakeTerm
      ? `Intake term: ${UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS[query.intakeTerm]}`
      : null,
    query.intakeYear ? `Intake year: ${query.intakeYear}` : null,
    query.primaryFilter !== "all"
      ? `Primary: ${primaryFilterLabels[query.primaryFilter]}`
      : null,
    `Archive: ${archiveFilterLabels[query.archiveFilter]}`,
    query.deadlineFilter !== "all"
      ? `Deadline: ${deadlineFilterLabels[query.deadlineFilter]}`
      : null,
  ].filter((value): value is string => value !== null);

  return (
    <section
      aria-labelledby="application-workspace-filter-heading"
      className="application-workspace-filter-panel"
    >
      <div className="application-workspace-section-heading">
        <div>
          <span className="eyebrow">Workspace controls</span>
          <h2 id="application-workspace-filter-heading">Search and filter</h2>
        </div>
        {canClear && (
          <Link
            className="application-workspace-clear"
            href={UNIVERSITY_APPLICATION_WORKSPACE_BASE_PATH}
          >
            Clear all
          </Link>
        )}
      </div>

      <p className="application-workspace-active-filters" role="status">
        Active view: {activeView.join(" · ")}
      </p>

      <form
        action={UNIVERSITY_APPLICATION_WORKSPACE_BASE_PATH}
        className="application-workspace-filter-form"
        method="get"
      >
        <div className="application-workspace-field application-workspace-search">
          <label htmlFor="application-workspace-q">
            Search applications
          </label>
          <input
            aria-describedby="application-workspace-q-hint"
            defaultValue={query.search ?? ""}
            id="application-workspace-q"
            maxLength={200}
            name="q"
            placeholder="Student, college email, roll number, university, programme or reference"
            type="search"
          />
          <small id="application-workspace-q-hint">
            Maximum 100 Unicode characters. Server validation is authoritative.
          </small>
        </div>

        <div className="application-workspace-field">
          <label htmlFor="application-workspace-status">Status</label>
          <select
            defaultValue={query.status ?? ""}
            id="application-workspace-status"
            name="status"
          >
            <option value="">All statuses</option>
            {UNIVERSITY_APPLICATION_WORKSPACE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {UNIVERSITY_APPLICATION_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
        </div>

        <div className="application-workspace-field">
          <label htmlFor="application-workspace-country">Country code</label>
          <input
            autoCapitalize="characters"
            defaultValue={query.countryCode ?? ""}
            id="application-workspace-country"
            maxLength={2}
            name="country"
            pattern="[A-Za-z]{2}"
            placeholder="US"
          />
        </div>

        <div className="application-workspace-field">
          <label htmlFor="application-workspace-degree">Degree level</label>
          <select
            defaultValue={query.degreeLevel ?? ""}
            id="application-workspace-degree"
            name="degree"
          >
            <option value="">All degree levels</option>
            {UNIVERSITY_APPLICATION_WORKSPACE_DEGREE_LEVELS.map((degree) => (
              <option key={degree} value={degree}>
                {UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS[degree]}
              </option>
            ))}
          </select>
        </div>

        <div className="application-workspace-field">
          <label htmlFor="application-workspace-intake-term">Intake term</label>
          <select
            defaultValue={query.intakeTerm ?? ""}
            id="application-workspace-intake-term"
            name="intakeTerm"
          >
            <option value="">All intake terms</option>
            {UNIVERSITY_APPLICATION_WORKSPACE_INTAKE_TERMS.map((term) => (
              <option key={term} value={term}>
                {UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS[term]}
              </option>
            ))}
          </select>
        </div>

        <div className="application-workspace-field">
          <label htmlFor="application-workspace-intake-year">Intake year</label>
          <input
            defaultValue={query.intakeYear ?? ""}
            id="application-workspace-intake-year"
            inputMode="numeric"
            max={2100}
            min={2020}
            name="intakeYear"
            type="number"
          />
        </div>

        <div className="application-workspace-field">
          <label htmlFor="application-workspace-primary">Primary state</label>
          <select
            defaultValue={query.primaryFilter}
            id="application-workspace-primary"
            name="primary"
          >
            {UNIVERSITY_APPLICATION_WORKSPACE_PRIMARY_FILTERS.map((value) => (
              <option key={value} value={value}>
                {primaryFilterLabels[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="application-workspace-field">
          <label htmlFor="application-workspace-archive">Archive scope</label>
          <select
            defaultValue={query.archiveFilter}
            id="application-workspace-archive"
            name="archive"
          >
            {UNIVERSITY_APPLICATION_WORKSPACE_ARCHIVE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {archiveFilterLabels[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="application-workspace-field">
          <label htmlFor="application-workspace-deadline">Deadline state</label>
          <select
            defaultValue={query.deadlineFilter}
            id="application-workspace-deadline"
            name="deadline"
          >
            {UNIVERSITY_APPLICATION_WORKSPACE_DEADLINE_FILTERS.map((value) => (
              <option key={value} value={value}>
                {deadlineFilterLabels[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="application-workspace-field">
          <label htmlFor="application-workspace-sort">Sort by</label>
          <select
            defaultValue={query.sort}
            id="application-workspace-sort"
            name="sort"
          >
            {UNIVERSITY_APPLICATION_WORKSPACE_SORTS.map((value) => (
              <option key={value} value={value}>
                {sortLabels[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="application-workspace-field">
          <label htmlFor="application-workspace-page-size">Rows per page</label>
          <select
            defaultValue={query.pageSize}
            id="application-workspace-page-size"
            name="pageSize"
          >
            {UNIVERSITY_APPLICATION_WORKSPACE_PAGE_SIZES.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>

        <div className="application-workspace-filter-actions">
          <button className="button button-small" type="submit">
            Apply filters
          </button>
          {query.search && (
            <Link
              className="application-workspace-clear-search"
              href={buildUniversityApplicationWorkspaceUrl(query, {
                search: null,
                page: 1,
              })}
            >
              Clear search
            </Link>
          )}
        </div>
      </form>
    </section>
  );
}

function ApplicationBadges({
  application,
}: {
  application: CounselorUniversityApplicationWorkspaceEntry;
}) {
  return (
    <div className="application-workspace-badges">
      <span className={`application-workspace-status status-${application.currentStatus}`}>
        {UNIVERSITY_APPLICATION_STATUS_LABELS[application.currentStatus]}
      </span>
      {application.isPrimary && <span className="application-workspace-primary">Primary</span>}
      {application.isArchived && <span className="application-workspace-archived">Archived</span>}
    </div>
  );
}

function StudentLink({
  application,
}: {
  application: CounselorUniversityApplicationWorkspaceEntry;
}) {
  if (!isStudent360StudentId(application.studentId)) return null;
  return (
    <Link
      aria-label={`Open Student 360 for ${application.studentFullName ?? application.collegeEmail}`}
      className="button button-secondary button-small"
      href={`${STUDENT_360_BASE_PATH}/${application.studentId}`}
    >
      Open Student 360
    </Link>
  );
}

function ApplicationTable({
  entries,
  now,
}: {
  entries: CounselorUniversityApplicationWorkspaceEntry[];
  now: Date;
}) {
  return (
    <div className="application-workspace-table-wrapper">
      <table className="application-workspace-table">
        <caption>University application workspace results</caption>
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Application</th>
            <th scope="col">Intake and state</th>
            <th scope="col">Deadline and activity</th>
            <th scope="col">Documents</th>
            <th scope="col">Action</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((application) => {
            const deadline = getUniversityApplicationDeadlinePresentation(
              application.submissionDeadline,
              now,
            );
            return (
              <tr key={application.applicationId}>
                <th scope="row">
                  <strong>{application.studentFullName ?? "Name not added"}</strong>
                  <span>{application.collegeEmail}</span>
                  {application.rollNumber && <small>{application.rollNumber}</small>}
                </th>
                <td>
                  <strong>{application.universityName}</strong>
                  <span>{application.programmeName}</span>
                  {application.applicationReference && (
                    <small>Reference: {application.applicationReference}</small>
                  )}
                </td>
                <td>
                  <span>
                    {application.countryCode} · {UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS[application.degreeLevel]}
                  </span>
                  <span>
                    {UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS[application.intakeTerm]} {application.intakeYear}
                  </span>
                  <ApplicationBadges application={application} />
                </td>
                <td>
                  <span className={`application-workspace-deadline deadline-${deadline.kind}`}>
                    {deadline.label}
                  </span>
                  {deadline.dateLabel && <span>{deadline.dateLabel}</span>}
                  {application.submittedAt && (
                    <small>
                      Submitted {formatUniversityApplicationWorkspaceTimestamp(application.submittedAt)}
                    </small>
                  )}
                  <small>
                    Changed {formatUniversityApplicationWorkspaceTimestamp(application.lastChangedAt)}
                  </small>
                </td>
                <td>
                  <strong>{application.availableDocumentCount}</strong>
                  <span>available</span>
                </td>
                <td><StudentLink application={application} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ApplicationCards({
  entries,
  now,
}: {
  entries: CounselorUniversityApplicationWorkspaceEntry[];
  now: Date;
}) {
  return (
    <div aria-label="University application workspace results" className="application-workspace-mobile-list">
      {entries.map((application) => {
        const deadline = getUniversityApplicationDeadlinePresentation(
          application.submissionDeadline,
          now,
        );
        return (
          <article className="application-workspace-card" key={application.applicationId}>
            <header>
              <div>
                <h3>{application.studentFullName ?? "Name not added"}</h3>
                <p>{application.collegeEmail}</p>
              </div>
              <ApplicationBadges application={application} />
            </header>
            <dl>
              {application.rollNumber && <div><dt>Roll number</dt><dd>{application.rollNumber}</dd></div>}
              <div><dt>University</dt><dd>{application.universityName}</dd></div>
              <div><dt>Programme</dt><dd>{application.programmeName}</dd></div>
              <div><dt>Country and degree</dt><dd>{application.countryCode} · {UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS[application.degreeLevel]}</dd></div>
              <div><dt>Intake</dt><dd>{UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS[application.intakeTerm]} {application.intakeYear}</dd></div>
              {application.applicationReference && <div><dt>Reference</dt><dd>{application.applicationReference}</dd></div>}
              <div><dt>Deadline</dt><dd><span className={`application-workspace-deadline deadline-${deadline.kind}`}>{deadline.label}</span>{deadline.dateLabel && ` · ${deadline.dateLabel}`}</dd></div>
              {application.submittedAt && <div><dt>Submitted</dt><dd>{formatUniversityApplicationWorkspaceTimestamp(application.submittedAt)}</dd></div>}
              <div><dt>Last changed</dt><dd>{formatUniversityApplicationWorkspaceTimestamp(application.lastChangedAt)}</dd></div>
              <div><dt>Available documents</dt><dd>{application.availableDocumentCount}</dd></div>
            </dl>
            <StudentLink application={application} />
          </article>
        );
      })}
    </div>
  );
}

function WorkspaceEmpty({ query }: { query: UniversityApplicationWorkspaceQuery }) {
  const kind = getUniversityApplicationWorkspaceEmptyKind(query);
  const content = {
    active: {
      heading: "No active applications exist yet.",
      message: "Applications added from Student 360 will appear here.",
      action: null,
    },
    all: {
      heading: "No applications exist yet.",
      message: "Applications added from Student 360 will appear here.",
      action: null,
    },
    archived: {
      heading: "No archived applications were found.",
      message: "Choose the active or all archive scope to review other applications.",
      action: {
        href: UNIVERSITY_APPLICATION_WORKSPACE_BASE_PATH,
        label: "View active applications",
      },
    },
    filters: {
      heading: "No applications match the selected filters.",
      message: "Reset the filters to return to the default active workspace.",
      action: {
        href: UNIVERSITY_APPLICATION_WORKSPACE_BASE_PATH,
        label: "Reset filters",
      },
    },
    search: {
      heading: "No applications match this search.",
      message: "Clear the search to keep the current filters and try again.",
      action: {
        href: buildUniversityApplicationWorkspaceUrl(query, {
          search: null,
          page: 1,
        }),
        label: "Clear search",
      },
    },
  } as const;
  const state = content[kind];

  return (
    <section className="application-workspace-empty" role="status">
      <h2>{state.heading}</h2>
      <p>{state.message}</p>
      {state.action && (
        <Link className="button button-secondary button-small" href={state.action.href}>
          {state.action.label}
        </Link>
      )}
    </section>
  );
}

function WorkspaceResults({
  list,
  now,
  query,
}: {
  list: UniversityApplicationWorkspaceListResult;
  now: Date;
  query: UniversityApplicationWorkspaceQuery;
}) {
  if (list.entries.length === 0) return <WorkspaceEmpty query={query} />;
  const pagination = getUniversityApplicationWorkspacePagination(
    query,
    list.totalCount,
  );
  const firstResult = (query.page - 1) * query.pageSize + 1;
  const lastResult = firstResult + list.entries.length - 1;

  return (
    <section aria-labelledby="application-workspace-results-heading" className="application-workspace-results">
      <div className="application-workspace-results-summary">
        <div>
          <span className="eyebrow">Filtered workspace</span>
          <h2 id="application-workspace-results-heading">Applications</h2>
        </div>
        <p role="status">
          Showing {firstResult}–{lastResult} of {list.totalCount.toLocaleString("en-IN")} · {archiveFilterLabels[query.archiveFilter]}
        </p>
      </div>
      <ApplicationTable entries={list.entries} now={now} />
      <ApplicationCards entries={list.entries} now={now} />
      <nav aria-label="Application workspace pagination" className="application-workspace-pagination">
        <p>Page {pagination.currentPage} of {pagination.pageCount}</p>
        <div>
          {pagination.previousUrl ? (
            <Link href={pagination.previousUrl}>Previous</Link>
          ) : (
            <span aria-disabled="true">Previous</span>
          )}
          <span aria-current="page">{pagination.currentPage}</span>
          {pagination.nextUrl ? (
            <Link href={pagination.nextUrl}>Next</Link>
          ) : (
            <span aria-disabled="true">Next</span>
          )}
        </div>
      </nav>
    </section>
  );
}

export function CounselorUniversityApplicationWorkspace({
  list,
  metrics,
  query,
}: {
  list: UniversityApplicationWorkspaceListResult | null;
  metrics: CounselorUniversityApplicationWorkspaceMetrics | null;
  query: UniversityApplicationWorkspaceQuery;
}) {
  const now = new Date();
  return (
    <section className="counselor-page application-workspace-page">
      <header className="counselor-page-header">
        <div>
          <span className="eyebrow">Counselor operations</span>
          <h1>Applications</h1>
          <p className="muted">
            Review university applications across students and open Student 360
            for detailed management.
          </p>
        </div>
      </header>

      <WorkspaceMetrics metrics={metrics} />
      <WorkspaceFilters query={query} />
      {list === null ? (
        <section className="application-workspace-unavailable" role="alert">
          <h2>Applications are temporarily unavailable.</h2>
          <p>Please refresh the page and try again shortly.</p>
        </section>
      ) : (
        <WorkspaceResults list={list} now={now} query={query} />
      )}
    </section>
  );
}
