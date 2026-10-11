import Link from "next/link";
import { COURSES } from "@/lib/consultations/options";
import {
  DIRECTORY_ACTIVE_OPTIONS,
  DIRECTORY_BASE_PATH,
  DIRECTORY_DEPARTMENTS,
  DIRECTORY_FALLBACKS,
  DIRECTORY_PROFILE_STATE_OPTIONS,
  DIRECTORY_SORT_OPTIONS,
  formatDirectoryUpdate,
  formatTargetIntake,
  getProfileStateLabel,
  getStudentDirectoryPagination,
  type CounselorStudentDirectoryEntry,
  type ParsedStudentDirectoryQuery,
  type StudentDirectoryReadyResult,
} from "@/lib/counselor/student-directory";
import {
  HIGHER_STUDIES_INTEREST_PROFILE_OPTIONS,
  PREFERRED_STUDY_LEVEL_OPTIONS,
  PROFILE_CATALOG_NOTICE,
  PROFILE_COLLEGES,
  PROFILE_GRADUATION_YEARS,
} from "@/lib/profiles/options";

function displayAddedValue(value: string | number | null): string {
  return value === null || value === ""
    ? DIRECTORY_FALLBACKS.notAdded
    : String(value);
}

function ProfileStateBadge({
  student,
}: {
  student: CounselorStudentDirectoryEntry;
}) {
  return (
    <span
      className={`directory-badge directory-profile-${student.profile_state}`}
    >
      {getProfileStateLabel(student.profile_state)}
    </span>
  );
}

function AccountStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`directory-badge ${
        isActive ? "directory-account-active" : "directory-account-inactive"
      }`}
    >
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

function CompletionProgress({
  percentage,
  studentName,
}: {
  percentage: number;
  studentName: string;
}) {
  return (
    <div className="directory-completion">
      <div
        aria-label={`${studentName} profile completion`}
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percentage}
        className="directory-progress"
        role="progressbar"
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
      <strong>{percentage}%</strong>
    </div>
  );
}

export function StudentDirectoryFilters({
  query,
}: {
  query: ParsedStudentDirectoryQuery;
}) {
  const canClearFilters = query.hasFilters || query.hadInvalidParameters;

  return (
    <section
      aria-labelledby="directory-filter-heading"
      className="directory-filter-panel"
    >
      <div className="directory-section-heading">
        <div>
          <h2 id="directory-filter-heading">Search and filter</h2>
        </div>
        {canClearFilters && (
          <Link className="directory-clear-link" href={DIRECTORY_BASE_PATH}>
            Clear filters
          </Link>
        )}
      </div>

      {query.hadInvalidParameters && (
        <p className="directory-filter-notice" role="status">
          Some invalid or duplicate filter values were ignored. The controls
          below show the filters currently applied.
        </p>
      )}

      <form action={DIRECTORY_BASE_PATH} className="directory-filter-form" method="get">
        <div className="directory-field directory-search-field">
          <label htmlFor="directory-search">
            Search by name, roll number, or college email
          </label>
          <input
            defaultValue={query.q ?? ""}
            id="directory-search"
            maxLength={100}
            name="q"
            placeholder="Search registered students"
            type="search"
          />
        </div>

        <div className="directory-field">
          <label htmlFor="directory-college">College</label>
          <select
            defaultValue={query.college ?? ""}
            id="directory-college"
            name="college"
          >
            <option value="">All colleges</option>
            {PROFILE_COLLEGES.map((college) => (
              <option key={college} value={college}>
                {college}
              </option>
            ))}
          </select>
        </div>

        <div className="directory-field">
          <label htmlFor="directory-course">Course</label>
          <select
            defaultValue={query.course ?? ""}
            id="directory-course"
            name="course"
          >
            <option value="">All courses</option>
            {COURSES.map((course) => (
              <option key={course} value={course}>
                {course}
              </option>
            ))}
          </select>
        </div>

        <div className="directory-field">
          <label htmlFor="directory-department">Department</label>
          <select
            defaultValue={query.department ?? ""}
            id="directory-department"
            name="department"
          >
            <option value="">All departments</option>
            {DIRECTORY_DEPARTMENTS.map((department) => (
              <option key={department} value={department}>
                {department}
              </option>
            ))}
          </select>
        </div>

        <div className="directory-field">
          <label htmlFor="directory-graduation-year">Graduation year</label>
          <select
            defaultValue={query.graduationYear ?? ""}
            id="directory-graduation-year"
            name="graduationYear"
          >
            <option value="">All years</option>
            {PROFILE_GRADUATION_YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>

        <div className="directory-field">
          <label htmlFor="directory-active">Account status</label>
          <select
            defaultValue={query.active}
            id="directory-active"
            name="active"
          >
            {DIRECTORY_ACTIVE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="directory-field">
          <label htmlFor="directory-profile-state">Profile state</label>
          <select
            defaultValue={query.profileState ?? ""}
            id="directory-profile-state"
            name="profileState"
          >
            <option value="">All profile states</option>
            {DIRECTORY_PROFILE_STATE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="directory-field">
          <label htmlFor="directory-interest">Higher-studies interest</label>
          <select
            defaultValue={query.interest ?? ""}
            id="directory-interest"
            name="interest"
          >
            <option value="">All interest states</option>
            {HIGHER_STUDIES_INTEREST_PROFILE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="directory-field">
          <label htmlFor="directory-study-level">Preferred study level</label>
          <select
            defaultValue={query.studyLevel ?? ""}
            id="directory-study-level"
            name="studyLevel"
          >
            <option value="">All study levels</option>
            {PREFERRED_STUDY_LEVEL_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="directory-field">
          <label htmlFor="directory-target-intake">Target intake</label>
          <input
            defaultValue={query.targetIntake ?? ""}
            id="directory-target-intake"
            maxLength={11}
            name="targetIntake"
            pattern="(spring|summer|fall|winter)-20[2-9][0-9]"
            placeholder="fall-2027"
            type="text"
          />
        </div>

        <div className="directory-field">
          <label htmlFor="directory-sort">Sort</label>
          <select defaultValue={query.sort} id="directory-sort" name="sort">
            {DIRECTORY_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="directory-filter-actions">
          <button className="button counselor-primary-button" type="submit">
            Apply filters
          </button>
          {canClearFilters && (
            <Link className="button button-secondary" href={DIRECTORY_BASE_PATH}>
              Clear filters
            </Link>
          )}
        </div>
      </form>

      <p className="directory-catalog-notice">{PROFILE_CATALOG_NOTICE}</p>
    </section>
  );
}

function DirectorySummary({ result }: { result: StudentDirectoryReadyResult }) {
  const activeOnPage = result.students.filter(
    (student) => student.is_active,
  ).length;
  const readyOnPage = result.students.filter(
    (student) => student.ready_for_counseling,
  ).length;
  const notStartedOnPage = result.students.filter(
    (student) => student.profile_state === "profile_not_started",
  ).length;

  const summaries = [
    {
      label: "Total matching students",
      value: result.totalCount,
      scope: "All matching records",
    },
    {
      label: "Active students",
      value: activeOnPage,
      scope: "Current page",
    },
    {
      label: "Ready for counseling",
      value: readyOnPage,
      scope: "Current page",
    },
    {
      label: "Profiles not started",
      value: notStartedOnPage,
      scope: "Current page",
    },
  ];

  return (
    <section aria-labelledby="directory-summary-heading">
      <div className="directory-section-heading">
        <div>
          <h2 id="directory-summary-heading">Student overview</h2>
        </div>
        <p>Page-level cards use only the students visible below.</p>
      </div>
      <div className="directory-summary-grid">
        {summaries.map((summary) => (
          <article className="directory-summary-card" key={summary.label}>
            <span>{summary.label}</span>
            <strong>{summary.value}</strong>
            <small>{summary.scope}</small>
          </article>
        ))}
      </div>
    </section>
  );
}

function StudentDesktopTable({
  students,
}: {
  students: CounselorStudentDirectoryEntry[];
}) {
  return (
    <div className="directory-table-wrapper">
      <table className="directory-table">
        <caption>
          Registered student directory with profile progress and account status
        </caption>
        <thead>
          <tr>
            <th scope="col">Student</th>
            <th scope="col">Roll number</th>
            <th scope="col">College / Course</th>
            <th scope="col">Department</th>
            <th scope="col">Graduation year</th>
            <th scope="col">Profile status</th>
            <th scope="col">Completion</th>
            <th scope="col">Target intake</th>
            <th scope="col">Account status</th>
            <th scope="col">Updated</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => {
            const studentName =
              student.full_name?.trim() || DIRECTORY_FALLBACKS.name;
            return (
              <tr key={student.student_id}>
                <th scope="row">
                  <strong>{studentName}</strong>
                  <span>{student.college_email}</span>
                </th>
                <td>{displayAddedValue(student.roll_number)}</td>
                <td>
                  <strong>{displayAddedValue(student.college)}</strong>
                  <span>{displayAddedValue(student.course)}</span>
                </td>
                <td>{displayAddedValue(student.department)}</td>
                <td>{displayAddedValue(student.graduation_year)}</td>
                <td>
                  <ProfileStateBadge student={student} />
                </td>
                <td>
                  <CompletionProgress
                    percentage={student.completion_percentage}
                    studentName={studentName}
                  />
                </td>
                <td>{formatTargetIntake(student.target_intake)}</td>
                <td>
                  <AccountStatusBadge isActive={student.is_active} />
                </td>
                <td>{formatDirectoryUpdate(student.last_profile_update)}</td>
                <td>
                  <Link
                    aria-label={`View profile for ${studentName}`}
                    className="directory-profile-link"
                    href={`${DIRECTORY_BASE_PATH}/${student.student_id}`}
                  >
                    View Profile
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function StudentMobileCards({
  students,
}: {
  students: CounselorStudentDirectoryEntry[];
}) {
  return (
    <ul aria-label="Registered students" className="directory-mobile-list">
      {students.map((student) => {
        const studentName =
          student.full_name?.trim() || DIRECTORY_FALLBACKS.name;
        return (
          <li className="directory-student-card" key={student.student_id}>
            <header>
              <div>
                <h3>{studentName}</h3>
                <p>{student.college_email}</p>
              </div>
              <AccountStatusBadge isActive={student.is_active} />
            </header>

            <div className="directory-card-badges">
              <ProfileStateBadge student={student} />
            </div>

            <dl>
              <div>
                <dt>Roll number</dt>
                <dd>{displayAddedValue(student.roll_number)}</dd>
              </div>
              <div>
                <dt>Course</dt>
                <dd>{displayAddedValue(student.course)}</dd>
              </div>
              <div>
                <dt>Department</dt>
                <dd>{displayAddedValue(student.department)}</dd>
              </div>
              <div>
                <dt>Target intake</dt>
                <dd>{formatTargetIntake(student.target_intake)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDirectoryUpdate(student.last_profile_update)}</dd>
              </div>
            </dl>

            <CompletionProgress
              percentage={student.completion_percentage}
              studentName={studentName}
            />
            <Link
              aria-label={`View profile for ${studentName}`}
              className="button button-secondary button-small directory-card-profile-link"
              href={`${DIRECTORY_BASE_PATH}/${student.student_id}`}
            >
              View Profile
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function DirectoryPagination({
  result,
}: {
  result: StudentDirectoryReadyResult;
}) {
  const pagination = getStudentDirectoryPagination(result);
  if (result.students.length === 0) return null;

  return (
    <nav aria-label="Student directory pagination" className="directory-pagination">
      <p>
        Showing {pagination.rangeStart}–{pagination.rangeEnd} of{" "}
        {result.totalCount}
      </p>
      <div>
        {pagination.previousUrl ? (
          <Link href={pagination.previousUrl} rel="prev">
            Previous
          </Link>
        ) : (
          <span aria-disabled="true">Previous</span>
        )}
        <span aria-current="page">
          Page {result.query.page} of {pagination.pageCount}
        </span>
        {pagination.nextUrl ? (
          <Link href={pagination.nextUrl} rel="next">
            Next
          </Link>
        ) : (
          <span aria-disabled="true">Next</span>
        )}
      </div>
    </nav>
  );
}

export function StudentDirectoryResults({
  result,
}: {
  result: StudentDirectoryReadyResult;
}) {
  return (
    <>
      <DirectorySummary result={result} />
      {result.students.length === 0 ? (
        <section className="directory-empty-state" role="status">
          <h2>
            {result.query.hasFilters
              ? "No students match the selected search or filters."
              : "No student accounts are available yet."}
          </h2>
          <p>
            {result.query.hasFilters
              ? "Clear the current filters to return to the complete directory."
              : "Registered student accounts will appear here when they become available."}
          </p>
          {result.query.hasFilters && (
            <Link className="button button-secondary" href={DIRECTORY_BASE_PATH}>
              Clear filters
            </Link>
          )}
        </section>
      ) : (
        <>
          <section
            aria-labelledby="directory-results-heading"
            className="directory-results"
          >
            <div className="directory-section-heading">
              <div>
                <h2 id="directory-results-heading">Directory results</h2>
              </div>
            </div>
            <StudentDesktopTable students={result.students} />
            <StudentMobileCards students={result.students} />
          </section>
          <DirectoryPagination result={result} />
        </>
      )}
    </>
  );
}
