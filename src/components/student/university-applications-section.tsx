import {
  STUDENT_UNIVERSITY_APPLICATION_ERROR,
  formatStudentApplicationDate,
  formatStudentApplicationTimestamp,
} from "@/lib/student/university-applications";
import {
  UNIVERSITY_APPLICATION_DECISION_LABELS,
  UNIVERSITY_APPLICATION_ENROLLMENT_STATUS_LABELS,
  UNIVERSITY_APPLICATION_FEE_STATUS_LABELS,
  UNIVERSITY_APPLICATION_OFFER_STATUS_LABELS,
  UNIVERSITY_APPLICATION_STUDENT_DECISION_LABELS,
  UNIVERSITY_APPLICATION_VISA_STATUS_LABELS,
  formatApplicationJourneyDate,
} from "@/lib/counselor/application-journey";
import { getMyUniversityApplicationJourneys } from "@/lib/student/application-journey-server";
import { getMyUniversityApplications } from "@/lib/student/university-application-server";

const SECTION_HEADING_ID = "student-university-applications-heading";

export function StudentUniversityApplicationsSkeleton() {
  return (
    <section
      aria-busy="true"
      aria-labelledby={SECTION_HEADING_ID}
      className="student-university-applications"
      role="status"
    >
      <div className="student-university-applications-heading">
        <div>
          <h2 id={SECTION_HEADING_ID}>My university applications</h2>
          <p>
            These application statuses are updated by the K-GEO counseling
            team and are tracked separately from your overall counseling
            progression.
          </p>
        </div>
      </div>
      <span className="sr-only">Loading university applications.</span>
      <div
        aria-hidden="true"
        className="student-university-application-skeletons"
      >
        <span />
        <span />
      </div>
    </section>
  );
}

export async function StudentUniversityApplicationsSection() {
  const [result, journeyResult] = await Promise.all([
    getMyUniversityApplications(),
    getMyUniversityApplicationJourneys(),
  ]);
  const journeys = new Map(
    journeyResult.kind === "ready"
      ? journeyResult.journeys.map((journey) => [
          journey.application_id,
          journey,
        ])
      : [],
  );

  return (
    <section
      aria-labelledby={SECTION_HEADING_ID}
      className="student-university-applications"
    >
      <div className="student-university-applications-heading">
        <div>
          <h2 id={SECTION_HEADING_ID}>My university applications</h2>
          <p>
            These application statuses are updated by the K-GEO counseling
            team and are tracked separately from your overall counseling
            progression.
          </p>
        </div>
      </div>

      {result.kind === "unavailable" ? (
        <div className="student-university-application-message" role="alert">
          <h3>{STUDENT_UNIVERSITY_APPLICATION_ERROR}</h3>
          <p>Please try again later.</p>
        </div>
      ) : result.applications.length === 0 ? (
        <div className="student-university-application-message student-university-application-empty">
          <h3>No university applications have been added yet.</h3>
          <p>
            Your K-GEO counselor will add application details when university
            and programme planning begins.
          </p>
        </div>
      ) : (
        <ul className="student-university-application-list">
          {result.applications.map((application) => {
            const journey = journeys.get(application.applicationId);
            return (
            <li key={application.applicationId}>
              <article className="student-university-application-card">
                <header>
                  <div>
                    <h3>{application.universityName}</h3>
                    <p>{application.programmeName}</p>
                  </div>
                  {application.isPrimary && (
                    <span className="student-university-application-primary">
                      Primary application
                    </span>
                  )}
                </header>

                <p className="student-university-application-overview">
                  <span>{application.countryCode}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span>{application.degreeLevelLabel}</span>
                  <span aria-hidden="true">&middot;</span>
                  <span>
                    {application.intakeTermLabel} {application.intakeYear}
                  </span>
                </p>

                <div className="student-university-application-status">
                  <span>Status</span>
                  <strong>{application.currentStatusLabel}</strong>
                  <p>{application.currentStatusDescription}</p>
                </div>

                {journeyResult.kind === "unavailable" ? (
                  <p className="student-university-application-journey-unavailable">
                    Offer, fee, and visa progress is temporarily unavailable.
                  </p>
                ) : journey ? (
                  <div className="student-university-application-journey">
                    <h4>Application Journey</h4>
                    <dl>
                      <div>
                        <dt>University decision</dt>
                        <dd>{UNIVERSITY_APPLICATION_DECISION_LABELS[journey.university_decision]}</dd>
                      </div>
                      <div>
                        <dt>Offer</dt>
                        <dd>{UNIVERSITY_APPLICATION_OFFER_STATUS_LABELS[journey.offer_status]}</dd>
                      </div>
                      <div>
                        <dt>Your decision</dt>
                        <dd>{UNIVERSITY_APPLICATION_STUDENT_DECISION_LABELS[journey.student_decision]}</dd>
                      </div>
                      <div>
                        <dt>Fee</dt>
                        <dd>{UNIVERSITY_APPLICATION_FEE_STATUS_LABELS[journey.fee_status]}</dd>
                      </div>
                      <div>
                        <dt>Visa</dt>
                        <dd>{UNIVERSITY_APPLICATION_VISA_STATUS_LABELS[journey.visa_status]}</dd>
                      </div>
                      <div>
                        <dt>Enrollment</dt>
                        <dd>{UNIVERSITY_APPLICATION_ENROLLMENT_STATUS_LABELS[journey.enrollment_status]}</dd>
                      </div>
                    </dl>
                    {journey.conditional_offer_requirements && (
                      <div className="student-university-application-conditions">
                        <strong>Outstanding offer conditions</strong>
                        <p>{journey.conditional_offer_requirements}</p>
                        <p>
                          Deadline: {formatApplicationJourneyDate(journey.condition_due_date)}
                          {journey.conditions_satisfied_date
                            ? ` · Satisfied ${formatApplicationJourneyDate(journey.conditions_satisfied_date)}`
                            : ""}
                        </p>
                      </div>
                    )}
                  </div>
                ) : null}

                <dl className="student-university-application-dates">
                  <div>
                    <dt>Submission deadline</dt>
                    <dd>
                      {application.submissionDeadline ? (
                        <time dateTime={application.submissionDeadline}>
                          {formatStudentApplicationDate(
                            application.submissionDeadline,
                          )}
                        </time>
                      ) : (
                        "Not added"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Submitted</dt>
                    <dd>
                      {application.submittedAt ? (
                        <time dateTime={application.submittedAt}>
                          {formatStudentApplicationTimestamp(
                            application.submittedAt,
                          )}
                        </time>
                      ) : (
                        "Not submitted yet"
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Last updated</dt>
                    <dd>
                      <time dateTime={application.lastChangedAt}>
                        {formatStudentApplicationTimestamp(
                          application.lastChangedAt,
                        )}
                      </time>
                    </dd>
                  </div>
                </dl>
              </article>
            </li>
          );})}
        </ul>
      )}
    </section>
  );
}
