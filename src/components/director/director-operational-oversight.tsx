import Link from "next/link";
import {
  applicationStatuses,
  consultationStatuses,
  formatOversightLabel,
  progressionFilters,
  type ApplicationOversightFilters,
  type ConsultationOversightFilters,
  type DirectorOversightResult,
  type StudentOversightFilters,
} from "@/lib/director/operational-oversight";
import {
  getConsultationLifecycleLabel,
  getConsultationLifecycleState,
  getConsultationPresentationGroup,
  getConsultationPresentationGroupLabel,
} from "@/lib/consultations/lifecycle";
import type { DirectorCounselorsData } from "@/lib/director/operational-oversight-server";
import type {
  DirectorApplicationOversightEntry,
  DirectorConsultationOversightEntry,
  DirectorStudentOversightEntry,
} from "@/types";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string | null): string {
  if (!value) return "Not recorded";
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  return Number.isNaN(date.valueOf()) ? "Not recorded" : dateFormatter.format(date);
}

function getDirectorConsultationPresentation(
  item: DirectorConsultationOversightEntry,
  now: Date,
) {
  const lifecycleState = getConsultationLifecycleState(
    {
      status: item.consultationStatus,
      consultationDate: item.consultationDate,
      slotStart: item.slotStart,
      slotEnd: item.slotEnd,
    },
    now,
  );
  const group = getConsultationPresentationGroup(lifecycleState);
  return {
    groupLabel: getConsultationPresentationGroupLabel(group),
    stateLabel:
      lifecycleState === "outcome_required"
        ? "Outcome Pending"
        : getConsultationLifecycleLabel(lifecycleState),
  };
}

function DirectorConsultationTemporalState({
  item,
  now,
}: {
  item: DirectorConsultationOversightEntry;
  now: Date;
}) {
  const presentation = getDirectorConsultationPresentation(item, now);
  return (
    <>
      <span className="director-status-badge">{presentation.groupLabel}</span>
      <span>{presentation.stateLabel}</span>
    </>
  );
}

function DirectorConsultationOutcome({
  item,
  now,
}: {
  item: DirectorConsultationOversightEntry;
  now: Date;
}) {
  const presentation = getDirectorConsultationPresentation(item, now);
  if (presentation.stateLabel === "Outcome Pending") {
    return <>Outcome Pending</>;
  }
  return <>{item.outcomeRecordedAt ? `Recorded ${formatDate(item.outcomeRecordedAt)}` : "Not recorded"}</>;
}

function Person({ name, email }: { name: string | null; email: string | null }) {
  if (!name && !email) {
    return (
      <span className="director-oversight-person">
        <strong>Unassigned</strong>
        <span>Not assigned</span>
      </span>
    );
  }
  return (
    <span className="director-oversight-person">
      <strong>{name ?? "Name unavailable"}</strong>
      <span>{email ?? "Not assigned"}</span>
    </span>
  );
}

function SafeState({ kind }: { kind: "invalid" | "unavailable" | "empty" }) {
  const content = {
    invalid: ["Filters could not be used", "Remove invalid or duplicated filters and try again."],
    unavailable: ["Oversight data is temporarily unavailable", "Please refresh the page and try again."],
    empty: ["No matching records", "Adjust the filters or check again later."],
  } as const;
  return (
    <div className={`director-state director-oversight-state is-${kind}`} role={kind === "empty" ? "status" : "alert"}>
      <h2>{content[kind][0]}</h2>
      <p>{content[kind][1]}</p>
    </div>
  );
}

function Summary({ total, page, totalPages }: { total: number; page: number; totalPages: number }) {
  return (
    <dl className="director-oversight-summary" aria-label="Result summary">
      <div><dt>Matching records</dt><dd>{total}</dd></div>
      <div><dt>Current page</dt><dd>{page}</dd></div>
      <div><dt>Total pages</dt><dd>{totalPages}</dd></div>
    </dl>
  );
}

function Pagination({
  basePath,
  page,
  totalPages,
  values,
}: {
  basePath: string;
  page: number;
  totalPages: number;
  values: Record<string, string | null>;
}) {
  const href = (target: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
      if (value) query.set(key, value);
    }
    if (target > 1) query.set("page", String(target));
    const suffix = query.toString();
    return suffix ? `${basePath}?${suffix}` : basePath;
  };
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Oversight results pages" className="director-oversight-pagination">
      {page > 1 ? <Link href={href(page - 1)}>Previous</Link> : <span aria-disabled="true">Previous</span>}
      <span>Page {page} of {totalPages}</span>
      {page < totalPages ? <Link href={href(page + 1)}>Next</Link> : <span aria-disabled="true">Next</span>}
    </nav>
  );
}

function PageHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="counselor-page-header director-page-header">
      <div><h1>{title}</h1><p>{description}</p></div>
      <span className="director-read-only-badge">Read-only oversight</span>
    </header>
  );
}

export function DirectorStudentsOversight({ result }: {
  result: DirectorOversightResult<DirectorStudentOversightEntry, StudentOversightFilters>;
}) {
  const filters = result.status === "invalid" ? null : result.filters;
  return (
    <section className="counselor-page director-page director-oversight-page">
      <PageHeader title="Student oversight" description="Review safe student identity, profile readiness, progression, and aggregate activity." />
      <form action="/director/students" className="director-oversight-filters" method="get">
        <label>Search<input defaultValue={filters?.search ?? ""} maxLength={100} name="q" placeholder="Name or college email" /></label>
        <label>Account<select defaultValue={filters?.active === null || filters === null ? "all" : filters.active ? "active" : "inactive"} name="active"><option value="all">All accounts</option><option value="active">Active</option><option value="inactive">Inactive</option></select></label>
        <label>Progression<select defaultValue={filters?.progression ?? "all"} name="progression"><option value="all">All states</option>{progressionFilters.map((value) => <option key={value} value={value}>{formatOversightLabel(value)}</option>)}</select></label>
        <button className="button button-primary button-small" type="submit">Apply filters</button>
        <Link className="button button-light button-small" href="/director/students">Reset</Link>
      </form>
      {result.status === "invalid" ? <SafeState kind="invalid" /> : result.status === "unavailable" ? <SafeState kind="unavailable" /> : result.items.length === 0 ? <SafeState kind="empty" /> : <>
        <Summary page={result.filters.page} total={result.totalCount} totalPages={result.totalPages} />
        <div className="director-oversight-table-wrapper"><table className="director-oversight-table"><caption>Students matching the current oversight filters</caption><thead><tr><th scope="col">Student</th><th scope="col">Primary Counselor</th><th scope="col">Academic</th><th scope="col">Account</th><th scope="col">Profile</th><th scope="col">Progression</th><th scope="col">Activity</th></tr></thead><tbody>{result.items.map((student) => <tr key={student.studentId}><th scope="row"><Link href={`/director/students/${student.studentId}`}><Person email={student.collegeEmail} name={student.fullName} /></Link></th><td><Person email={student.primaryCounselorCollegeEmail} name={student.primaryCounselorFullName} />{student.primaryCounselorAssignedAt && <span>Assigned {formatDate(student.primaryCounselorAssignedAt)}</span>}</td><td>{student.course ?? "Not recorded"}<span>{student.department ?? "Department not recorded"}{student.graduationYear ? ` · ${student.graduationYear}` : ""}</span></td><td><span className={`director-status-badge ${student.isActive ? "is-active" : "is-inactive"}`}>{student.isActive ? "Active" : "Inactive"}</span><span>Since {formatDate(student.accountCreatedAt)}</span></td><td>{formatOversightLabel(student.profileState)}</td><td>{student.progressionState ? formatOversightLabel(student.progressionState) : "Not started"}<span>{student.progressionStage ? formatOversightLabel(student.progressionStage) : "No stage"}</span></td><td>{student.openConsultations} open / {student.totalConsultations} total<span>{student.activeApplications} active applications</span></td></tr>)}</tbody></table></div>
        <ul className="director-oversight-mobile" aria-label="Student oversight results">{result.items.map((student) => <li key={student.studentId}><article><header><Link href={`/director/students/${student.studentId}`}><Person email={student.collegeEmail} name={student.fullName} /></Link><span className={`director-status-badge ${student.isActive ? "is-active" : "is-inactive"}`}>{student.isActive ? "Active" : "Inactive"}</span></header><dl><div><dt>Primary Counselor</dt><dd><Person email={student.primaryCounselorCollegeEmail} name={student.primaryCounselorFullName} /></dd></div><div><dt>Course</dt><dd>{student.course ?? "Not recorded"}</dd></div><div><dt>Department</dt><dd>{student.department ?? "Not recorded"}</dd></div><div><dt>Graduation year</dt><dd>{student.graduationYear ?? "Not recorded"}</dd></div><div><dt>Account since</dt><dd>{formatDate(student.accountCreatedAt)}</dd></div><div><dt>Profile</dt><dd>{formatOversightLabel(student.profileState)}</dd></div><div><dt>Progression</dt><dd>{student.progressionState ? formatOversightLabel(student.progressionState) : "Not started"}</dd></div><div><dt>Progression stage</dt><dd>{student.progressionStage ? formatOversightLabel(student.progressionStage) : "No stage"}</dd></div><div><dt>Consultations</dt><dd>{student.openConsultations} open / {student.totalConsultations} total</dd></div><div><dt>Active applications</dt><dd>{student.activeApplications}</dd></div></dl></article></li>)}</ul>
        <Pagination basePath="/director/students" page={result.filters.page} totalPages={result.totalPages} values={{ q: result.filters.search, active: result.filters.active === null ? null : result.filters.active ? "active" : "inactive", progression: result.filters.progression }} />
      </>}
    </section>
  );
}

export function DirectorConsultationsOversight({ result }: {
  result: DirectorOversightResult<DirectorConsultationOversightEntry, ConsultationOversightFilters>;
}) {
  const filters = result.status === "invalid" ? null : result.filters;
  const now = new Date();
  return (
    <section className="counselor-page director-page director-oversight-page">
      <PageHeader title="Consultation oversight" description="Monitor assignment, schedules, lifecycle state, and outcome completion without private narrative. Unassigned consultations require an FCFS counselor claim." />
      <form action="/director/consultations" className="director-oversight-filters" method="get">
        <label>Search<input defaultValue={filters?.search ?? ""} maxLength={100} name="q" placeholder="Student, counselor, or request" /></label>
        <label>Status<select defaultValue={filters?.status ?? "all"} name="status"><option value="all">All statuses</option>{consultationStatuses.map((value) => <option key={value} value={value}>{formatOversightLabel(value)}</option>)}</select></label>
        <label>From<input defaultValue={filters?.dateFrom ?? ""} name="dateFrom" type="date" /></label><label>To<input defaultValue={filters?.dateTo ?? ""} name="dateTo" type="date" /></label>
        <button className="button button-primary button-small" type="submit">Apply filters</button><Link className="button button-light button-small" href="/director/consultations">Reset</Link>
      </form>
      {result.status === "invalid" ? <SafeState kind="invalid" /> : result.status === "unavailable" ? <SafeState kind="unavailable" /> : result.items.length === 0 ? <SafeState kind="empty" /> : <>
        <Summary page={result.filters.page} total={result.totalCount} totalPages={result.totalPages} />
        <div className="director-oversight-table-wrapper"><table className="director-oversight-table"><caption>Consultations matching the current oversight filters</caption><thead><tr><th scope="col">Request</th><th scope="col">Student</th><th scope="col">Counselor</th><th scope="col">Schedule</th><th scope="col">Temporal state</th><th scope="col">Outcome</th></tr></thead><tbody>{result.items.map((item) => <tr key={item.consultationId}><th scope="row">{item.requestNumber}<span>Submitted {formatDate(item.submittedAt)}</span></th><td><Person email={item.studentCollegeEmail} name={item.studentFullName} /></td><td><Person email={item.counselorCollegeEmail} name={item.counselorFullName} /></td><td>{formatDate(item.consultationDate)}<span>{item.slotStart.slice(0, 5)}–{item.slotEnd.slice(0, 5)}</span></td><td data-stored-status={item.consultationStatus}><DirectorConsultationTemporalState item={item} now={now} /></td><td data-outcome-recorded-at={item.outcomeRecordedAt ?? undefined}><DirectorConsultationOutcome item={item} now={now} /></td></tr>)}</tbody></table></div>
        <ul className="director-oversight-mobile" aria-label="Consultation oversight results">{result.items.map((item) => <li data-stored-status={item.consultationStatus} key={item.consultationId}><article><header><strong>{item.requestNumber}</strong><DirectorConsultationTemporalState item={item} now={now} /></header><dl><div><dt>Submitted</dt><dd>{formatDate(item.submittedAt)}</dd></div><div><dt>Student</dt><dd><Person email={item.studentCollegeEmail} name={item.studentFullName} /></dd></div><div><dt>Counselor</dt><dd><Person email={item.counselorCollegeEmail} name={item.counselorFullName} /></dd></div><div><dt>Schedule</dt><dd>{formatDate(item.consultationDate)}, {item.slotStart.slice(0, 5)}–{item.slotEnd.slice(0, 5)}</dd></div><div><dt>Outcome</dt><dd data-outcome-recorded-at={item.outcomeRecordedAt ?? undefined}><DirectorConsultationOutcome item={item} now={now} /></dd></div></dl></article></li>)}</ul>
        <Pagination basePath="/director/consultations" page={result.filters.page} totalPages={result.totalPages} values={{ q: result.filters.search, status: result.filters.status, dateFrom: result.filters.dateFrom, dateTo: result.filters.dateTo }} />
      </>}
    </section>
  );
}

export function DirectorApplicationsOversight({ result }: {
  result: DirectorOversightResult<DirectorApplicationOversightEntry, ApplicationOversightFilters>;
}) {
  const filters = result.status === "invalid" ? null : result.filters;
  return (
    <section className="counselor-page director-page director-oversight-page">
      <PageHeader title="Application oversight" description="Review the safe university-application pipeline, deadlines, and recorded ownership context." />
      <form action="/director/applications" className="director-oversight-filters" method="get">
        <label>Search<input defaultValue={filters?.search ?? ""} maxLength={100} name="q" placeholder="Student, counselor, university, or program" /></label>
        <label>Status<select defaultValue={filters?.status ?? "all"} name="status"><option value="all">All statuses</option>{applicationStatuses.map((value) => <option key={value} value={value}>{formatOversightLabel(value)}</option>)}</select></label>
        <label>Archive<select defaultValue={filters?.archive ?? "active"} name="archive"><option value="active">Active only</option><option value="archived">Archived only</option><option value="all">All records</option></select></label>
        <button className="button button-primary button-small" type="submit">Apply filters</button><Link className="button button-light button-small" href="/director/applications">Reset</Link>
      </form>
      {result.status === "invalid" ? <SafeState kind="invalid" /> : result.status === "unavailable" ? <SafeState kind="unavailable" /> : result.items.length === 0 ? <SafeState kind="empty" /> : <>
        <Summary page={result.filters.page} total={result.totalCount} totalPages={result.totalPages} />
        <div className="director-oversight-table-wrapper"><table className="director-oversight-table"><caption>University applications matching the current oversight filters</caption><thead><tr><th scope="col">Student</th><th scope="col">University / program</th><th scope="col">Intake</th><th scope="col">Status</th><th scope="col">Deadline</th><th scope="col">Last counselor change</th></tr></thead><tbody>{result.items.map((item) => <tr key={item.applicationId}><th scope="row"><Person email={item.studentCollegeEmail} name={item.studentFullName} /></th><td>{item.universityName}<span>{item.programmeName} · {item.countryCode}</span></td><td>{formatOversightLabel(item.intakeTerm)} {item.intakeYear}<span>{formatOversightLabel(item.degreeLevel)}</span></td><td><span className="director-status-badge">{formatOversightLabel(item.applicationStatus)}</span>{item.isPrimary && <span>Primary</span>}{item.isArchived && <span>Archived</span>}</td><td>{formatDate(item.submissionDeadline)}</td><td><Person email={item.counselorCollegeEmail} name={item.counselorFullName} /><span>{formatDate(item.lastChangedAt)}</span></td></tr>)}</tbody></table></div>
        <ul className="director-oversight-mobile" aria-label="Application oversight results">{result.items.map((item) => <li key={item.applicationId}><article><header><Person email={item.studentCollegeEmail} name={item.studentFullName} /><span className="director-status-badge">{formatOversightLabel(item.applicationStatus)}</span></header><dl><div><dt>University</dt><dd>{item.universityName}</dd></div><div><dt>Program</dt><dd>{item.programmeName}</dd></div><div><dt>Country</dt><dd>{item.countryCode}</dd></div><div><dt>Degree level</dt><dd>{formatOversightLabel(item.degreeLevel)}</dd></div><div><dt>Intake</dt><dd>{formatOversightLabel(item.intakeTerm)} {item.intakeYear}</dd></div><div><dt>Primary</dt><dd>{item.isPrimary ? "Primary" : "Not primary"}</dd></div><div><dt>Archive</dt><dd>{item.isArchived ? "Archived" : "Active"}</dd></div><div><dt>Deadline</dt><dd>{formatDate(item.submissionDeadline)}</dd></div><div><dt>Last counselor change</dt><dd><Person email={item.counselorCollegeEmail} name={item.counselorFullName} /><span>{formatDate(item.lastChangedAt)}</span></dd></div></dl></article></li>)}</ul>
        <Pagination basePath="/director/applications" page={result.filters.page} totalPages={result.totalPages} values={{ q: result.filters.search, status: result.filters.status, archive: result.filters.archive === "active" ? null : result.filters.archive }} />
      </>}
    </section>
  );
}

export function DirectorCounselorsOversight({ data }: { data: DirectorCounselorsData }) {
  return (
    <section className="counselor-page director-page director-oversight-page">
      <PageHeader title="Counselor workload" description="Review bounded, aggregate operational workload without private notes or individual follow-up content." />
      {data.status === "unavailable" ? <SafeState kind="unavailable" /> : data.items.length === 0 ? <SafeState kind="empty" /> : <>
        <dl className="director-oversight-summary" aria-label="Counselor summary"><div><dt>Counselors shown</dt><dd>{data.items.length}</dd></div><div><dt>Active</dt><dd>{data.items.filter((item) => item.isActive).length}</dd></div><div><dt>Overdue follow-ups</dt><dd>{data.items.reduce((sum, item) => sum + item.overdueFollowUps, 0)}</dd></div></dl>
        <div className="director-oversight-table-wrapper"><table className="director-oversight-table"><caption>Up to 50 counselor workload aggregates</caption><thead><tr><th scope="col">Counselor</th><th scope="col">Account</th><th scope="col">Primary Students</th><th scope="col">Consultations today</th><th scope="col">Pending outcomes</th><th scope="col">Pending follow-ups</th><th scope="col">Overdue follow-ups</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.counselorId}><th scope="row"><Person email={item.collegeEmail} name={item.counselorFullName} /></th><td><span className={`director-status-badge ${item.isActive ? "is-active" : "is-inactive"}`}>{item.isActive ? "Active" : "Inactive"}</span></td><td>{item.assignedStudents}</td><td>{item.consultationsToday}</td><td>{item.pendingOutcomes}</td><td>{item.pendingFollowUps}</td><td>{item.overdueFollowUps}</td></tr>)}</tbody></table></div>
        <ul className="director-oversight-mobile" aria-label="Counselor workload results">{data.items.map((item) => <li key={item.counselorId}><article><header><Person email={item.collegeEmail} name={item.counselorFullName} /><span className={`director-status-badge ${item.isActive ? "is-active" : "is-inactive"}`}>{item.isActive ? "Active" : "Inactive"}</span></header><dl><div><dt>Primary Students</dt><dd>{item.assignedStudents}</dd></div><div><dt>Consultations today</dt><dd>{item.consultationsToday}</dd></div><div><dt>Pending outcomes</dt><dd>{item.pendingOutcomes}</dd></div><div><dt>Pending follow-ups</dt><dd>{item.pendingFollowUps}</dd></div><div><dt>Overdue follow-ups</dt><dd>{item.overdueFollowUps}</dd></div></dl></article></li>)}</ul>
      </>}
    </section>
  );
}

export function DirectorOversightLoading({ title }: { title: string }) {
  return <section aria-busy="true" aria-live="polite" className="counselor-page director-page director-oversight-loading" role="status"><h1>Loading {title.toLowerCase()}&hellip;</h1><p>Preparing the current bounded operational view.</p><div aria-hidden="true" className="director-loading-sections"><span /><span /></div></section>;
}
