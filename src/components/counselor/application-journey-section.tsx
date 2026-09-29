"use client";

import { useActionState, useState } from "react";
import { saveApplicationJourneyAction } from "@/app/actions/counselor-application-journey-actions";
import {
  APPLICATION_JOURNEY_REASON_LIMIT,
  APPLICATION_JOURNEY_REQUIREMENTS_LIMIT,
  UNIVERSITY_APPLICATION_DECISIONS,
  UNIVERSITY_APPLICATION_DECISION_LABELS,
  UNIVERSITY_APPLICATION_ENROLLMENT_STATUSES,
  UNIVERSITY_APPLICATION_ENROLLMENT_STATUS_LABELS,
  UNIVERSITY_APPLICATION_FEE_STATUSES,
  UNIVERSITY_APPLICATION_FEE_STATUS_LABELS,
  UNIVERSITY_APPLICATION_OFFER_STATUSES,
  UNIVERSITY_APPLICATION_OFFER_STATUS_LABELS,
  UNIVERSITY_APPLICATION_STUDENT_DECISIONS,
  UNIVERSITY_APPLICATION_STUDENT_DECISION_LABELS,
  UNIVERSITY_APPLICATION_VISA_STATUSES,
  UNIVERSITY_APPLICATION_VISA_STATUS_LABELS,
  formatApplicationJourneyDate,
  formatApplicationJourneyTimestamp,
  initialApplicationJourneyActionState,
  type CounselorApplicationJourneyLoadResult,
} from "@/lib/counselor/application-journey";

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <span className="field-error">{messages[0]}</span>;
}

function JourneyValue({ date, label }: { date?: string | null; label: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>
        {date === undefined ? label : formatApplicationJourneyDate(date)}
      </dd>
    </div>
  );
}

export function ApplicationJourneySection({
  applicationId,
  applicationStatusLabel,
  result,
  studentId,
}: {
  applicationId: string;
  applicationStatusLabel: string;
  result: CounselorApplicationJourneyLoadResult;
  studentId: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveApplicationJourneyAction,
    initialApplicationJourneyActionState,
  );
  const journey = result.kind === "ready" ? result.journey : null;
  const [offerStatus, setOfferStatus] = useState(
    journey?.offer_status ?? "none",
  );
  const [studentDecision, setStudentDecision] = useState(
    journey?.student_decision ?? "pending",
  );
  const [feeStatus, setFeeStatus] = useState(
    journey?.fee_status ?? "not_started",
  );
  const [visaStatus, setVisaStatus] = useState(
    journey?.visa_status ?? "not_started",
  );
  const [enrollmentStatus, setEnrollmentStatus] = useState(
    journey?.enrollment_status ?? "not_enrolled",
  );

  return (
    <section
      aria-labelledby="application-journey-heading"
      className="student-workspace-panel application-journey-section"
    >
      <header className="student-360-section-heading">
        <span className="eyebrow">Separated operational lifecycle</span>
        <h2 id="application-journey-heading">Application Journey</h2>
        <p>
          Track the application, university decision, offer, Student decision,
          fee, visa, and enrollment as separate business states.
        </p>
      </header>

      {result.kind === "unavailable" ? (
        <p className="form-error" role="alert">
          Application Journey is temporarily unavailable.
        </p>
      ) : result.kind === "not_found" || !journey ? null : (
        <>
          <div className="application-journey-overview">
            <article>
              <span>Application</span>
              <strong>{applicationStatusLabel}</strong>
            </article>
            <article>
              <span>University decision</span>
              <strong>
                {UNIVERSITY_APPLICATION_DECISION_LABELS[
                  journey.university_decision
                ]}
              </strong>
            </article>
            <article>
              <span>Offer</span>
              <strong>
                {UNIVERSITY_APPLICATION_OFFER_STATUS_LABELS[
                  journey.offer_status
                ]}
              </strong>
            </article>
            <article>
              <span>Student decision</span>
              <strong>
                {UNIVERSITY_APPLICATION_STUDENT_DECISION_LABELS[
                  journey.student_decision
                ]}
              </strong>
            </article>
            <article>
              <span>Fee</span>
              <strong>
                {UNIVERSITY_APPLICATION_FEE_STATUS_LABELS[journey.fee_status]}
              </strong>
            </article>
            <article>
              <span>Visa</span>
              <strong>
                {UNIVERSITY_APPLICATION_VISA_STATUS_LABELS[journey.visa_status]}
              </strong>
            </article>
            <article>
              <span>Enrollment</span>
              <strong>
                {UNIVERSITY_APPLICATION_ENROLLMENT_STATUS_LABELS[
                  journey.enrollment_status
                ]}
              </strong>
            </article>
          </div>

          <dl className="student-workspace-definition-list application-journey-dates">
            <JourneyValue
              date={journey.university_decision_date}
              label="University decision date"
            />
            <JourneyValue date={journey.offer_date} label="Offer date" />
            <JourneyValue
              date={journey.student_decision_date}
              label="Student decision date"
            />
            <JourneyValue
              date={journey.fee_payment_date}
              label="Fee payment date"
            />
            <JourneyValue
              date={journey.visa_submission_date}
              label="Visa submission date"
            />
            <JourneyValue
              date={journey.visa_decision_date}
              label="Visa decision date"
            />
            <JourneyValue
              date={journey.enrollment_date}
              label="Enrollment date"
            />
            <div>
              <dt>Last updated</dt>
              <dd>{formatApplicationJourneyTimestamp(journey.updated_at)}</dd>
            </div>
          </dl>

          {journey.conditional_offer_requirements && (
            <section className="application-journey-conditions">
              <h3>Conditional-offer requirements</h3>
              <p>{journey.conditional_offer_requirements}</p>
              <dl>
                <JourneyValue
                  date={journey.condition_due_date}
                  label="Condition deadline"
                />
                <JourneyValue
                  date={journey.conditions_satisfied_date}
                  label="Conditions satisfied"
                />
              </dl>
            </section>
          )}

          <form
            action={formAction}
            aria-busy={pending}
            className="application-journey-form form-stack"
          >
            <input name="studentId" type="hidden" value={studentId} />
            <input name="applicationId" type="hidden" value={applicationId} />
            <header>
              <h3>Update Application Journey</h3>
              <p>
                Every successful change creates an immutable audit snapshot.
                Use Application Documents for supporting files or payment
                evidence.
              </p>
            </header>
            {state.message && state.status !== "idle" && (
              <p
                className={state.status === "success" ? "form-success" : "form-error"}
                role={state.status === "success" ? "status" : "alert"}
              >
                {state.message}
              </p>
            )}
            <FieldError messages={state.errors?._form} />
            <fieldset disabled={pending}>
              <div className="application-journey-field-grid">
                <div className="field">
                  <label htmlFor="journey-university-decision">University decision</label>
                  <select
                    defaultValue={journey.university_decision}
                    id="journey-university-decision"
                    name="universityDecision"
                  >
                    {UNIVERSITY_APPLICATION_DECISIONS.map((value) => (
                      <option key={value} value={value}>
                        {UNIVERSITY_APPLICATION_DECISION_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  <FieldError messages={state.errors?.universityDecision} />
                </div>
                <div className="field">
                  <label htmlFor="journey-university-decision-date">Decision date</label>
                  <input
                    defaultValue={journey.university_decision_date ?? ""}
                    id="journey-university-decision-date"
                    name="universityDecisionDate"
                    type="date"
                  />
                  <FieldError messages={state.errors?.universityDecisionDate} />
                </div>

                <div className="field">
                  <label htmlFor="journey-offer-status">Offer status</label>
                  <select
                    id="journey-offer-status"
                    name="offerStatus"
                    onChange={(event) =>
                      setOfferStatus(event.target.value as typeof offerStatus)
                    }
                    value={offerStatus}
                  >
                    {UNIVERSITY_APPLICATION_OFFER_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {UNIVERSITY_APPLICATION_OFFER_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  <FieldError messages={state.errors?.offerStatus} />
                </div>
                <div className="field">
                  <label htmlFor="journey-offer-date">Offer date</label>
                  <input
                    defaultValue={journey.offer_date ?? ""}
                    disabled={offerStatus === "none"}
                    id="journey-offer-date"
                    name="offerDate"
                    type="date"
                  />
                  {offerStatus === "none" && <input name="offerDate" type="hidden" value="" />}
                  <FieldError messages={state.errors?.offerDate} />
                </div>

                <div className="field application-journey-field-wide">
                  <label htmlFor="journey-conditions">Outstanding conditions / documents</label>
                  <textarea
                    defaultValue={journey.conditional_offer_requirements ?? ""}
                    disabled={offerStatus === "none"}
                    id="journey-conditions"
                    maxLength={APPLICATION_JOURNEY_REQUIREMENTS_LIMIT}
                    name="conditionalOfferRequirements"
                    required={offerStatus === "conditional"}
                    rows={3}
                  />
                  {offerStatus === "none" && (
                    <input name="conditionalOfferRequirements" type="hidden" value="" />
                  )}
                  <FieldError messages={state.errors?.conditionalOfferRequirements} />
                </div>
                <div className="field">
                  <label htmlFor="journey-condition-due">Condition deadline</label>
                  <input
                    defaultValue={journey.condition_due_date ?? ""}
                    disabled={offerStatus === "none"}
                    id="journey-condition-due"
                    name="conditionDueDate"
                    type="date"
                  />
                  {offerStatus === "none" && <input name="conditionDueDate" type="hidden" value="" />}
                  <FieldError messages={state.errors?.conditionDueDate} />
                </div>
                <div className="field">
                  <label htmlFor="journey-conditions-satisfied">Conditions satisfied date</label>
                  <input
                    defaultValue={journey.conditions_satisfied_date ?? ""}
                    disabled={offerStatus === "none"}
                    id="journey-conditions-satisfied"
                    name="conditionsSatisfiedDate"
                    type="date"
                  />
                  {offerStatus === "none" && <input name="conditionsSatisfiedDate" type="hidden" value="" />}
                  <FieldError messages={state.errors?.conditionsSatisfiedDate} />
                </div>

                <div className="field">
                  <label htmlFor="journey-student-decision">Student decision</label>
                  <select
                    id="journey-student-decision"
                    name="studentDecision"
                    onChange={(event) =>
                      setStudentDecision(event.target.value as typeof studentDecision)
                    }
                    value={studentDecision}
                  >
                    {UNIVERSITY_APPLICATION_STUDENT_DECISIONS.map((value) => (
                      <option key={value} value={value}>
                        {UNIVERSITY_APPLICATION_STUDENT_DECISION_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  <FieldError messages={state.errors?.studentDecision} />
                </div>
                <div className="field">
                  <label htmlFor="journey-student-decision-date">Student decision date</label>
                  <input
                    defaultValue={journey.student_decision_date ?? ""}
                    disabled={studentDecision === "pending"}
                    id="journey-student-decision-date"
                    name="studentDecisionDate"
                    type="date"
                  />
                  {studentDecision === "pending" && <input name="studentDecisionDate" type="hidden" value="" />}
                  <FieldError messages={state.errors?.studentDecisionDate} />
                </div>

                <div className="field">
                  <label htmlFor="journey-fee-status">Fee status</label>
                  <select
                    id="journey-fee-status"
                    name="feeStatus"
                    onChange={(event) =>
                      setFeeStatus(event.target.value as typeof feeStatus)
                    }
                    value={feeStatus}
                  >
                    {UNIVERSITY_APPLICATION_FEE_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {UNIVERSITY_APPLICATION_FEE_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  <FieldError messages={state.errors?.feeStatus} />
                </div>
                <div className="field">
                  <label htmlFor="journey-fee-date">Fee payment date</label>
                  <input
                    defaultValue={journey.fee_payment_date ?? ""}
                    disabled={feeStatus !== "paid"}
                    id="journey-fee-date"
                    name="feePaymentDate"
                    required={feeStatus === "paid"}
                    type="date"
                  />
                  {feeStatus !== "paid" && <input name="feePaymentDate" type="hidden" value="" />}
                  <FieldError messages={state.errors?.feePaymentDate} />
                </div>

                <div className="field">
                  <label htmlFor="journey-visa-status">Visa status</label>
                  <select
                    id="journey-visa-status"
                    name="visaStatus"
                    onChange={(event) =>
                      setVisaStatus(event.target.value as typeof visaStatus)
                    }
                    value={visaStatus}
                  >
                    {UNIVERSITY_APPLICATION_VISA_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {UNIVERSITY_APPLICATION_VISA_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  <FieldError messages={state.errors?.visaStatus} />
                </div>
                <div className="field">
                  <label htmlFor="journey-visa-submitted">Visa submission date</label>
                  <input
                    defaultValue={journey.visa_submission_date ?? ""}
                    disabled={visaStatus === "not_started" || visaStatus === "preparing"}
                    id="journey-visa-submitted"
                    name="visaSubmissionDate"
                    required={visaStatus === "submitted" || visaStatus === "approved" || visaStatus === "refused"}
                    type="date"
                  />
                  {(visaStatus === "not_started" || visaStatus === "preparing") && <input name="visaSubmissionDate" type="hidden" value="" />}
                  <FieldError messages={state.errors?.visaSubmissionDate} />
                </div>
                <div className="field">
                  <label htmlFor="journey-visa-decision">Visa decision date</label>
                  <input
                    defaultValue={journey.visa_decision_date ?? ""}
                    disabled={visaStatus !== "approved" && visaStatus !== "refused"}
                    id="journey-visa-decision"
                    name="visaDecisionDate"
                    required={visaStatus === "approved" || visaStatus === "refused"}
                    type="date"
                  />
                  {visaStatus !== "approved" && visaStatus !== "refused" && <input name="visaDecisionDate" type="hidden" value="" />}
                  <FieldError messages={state.errors?.visaDecisionDate} />
                </div>

                <div className="field">
                  <label htmlFor="journey-enrollment-status">Enrollment</label>
                  <select
                    id="journey-enrollment-status"
                    name="enrollmentStatus"
                    onChange={(event) =>
                      setEnrollmentStatus(event.target.value as typeof enrollmentStatus)
                    }
                    value={enrollmentStatus}
                  >
                    {UNIVERSITY_APPLICATION_ENROLLMENT_STATUSES.map((value) => (
                      <option key={value} value={value}>
                        {UNIVERSITY_APPLICATION_ENROLLMENT_STATUS_LABELS[value]}
                      </option>
                    ))}
                  </select>
                  <FieldError messages={state.errors?.enrollmentStatus} />
                </div>
                <div className="field">
                  <label htmlFor="journey-enrollment-date">Enrollment date</label>
                  <input
                    defaultValue={journey.enrollment_date ?? ""}
                    disabled={enrollmentStatus !== "enrolled"}
                    id="journey-enrollment-date"
                    name="enrollmentDate"
                    required={enrollmentStatus === "enrolled"}
                    type="date"
                  />
                  {enrollmentStatus !== "enrolled" && <input name="enrollmentDate" type="hidden" value="" />}
                  <FieldError messages={state.errors?.enrollmentDate} />
                </div>

                <div className="field application-journey-field-wide">
                  <label htmlFor="journey-change-reason">Change reason</label>
                  <textarea
                    id="journey-change-reason"
                    maxLength={APPLICATION_JOURNEY_REASON_LIMIT}
                    name="changeReason"
                    required
                    rows={3}
                  />
                  <span className="field-hint">
                    Institutional audit reason. Do not enter private Counselor Notes here.
                  </span>
                  <FieldError messages={state.errors?.changeReason} />
                </div>
              </div>
              <button className="button" disabled={pending} type="submit">
                {pending ? "Updating Journey..." : "Update Application Journey"}
              </button>
            </fieldset>
          </form>

          <details className="application-journey-history">
            <summary>Application Journey history ({result.events.length})</summary>
            {result.events.length === 0 ? (
              <p className="student-workspace-empty">
                No extended Journey update has been recorded. Legacy defaults remain active.
              </p>
            ) : (
              <ol>
                {result.events.map((event) => (
                  <li key={event.event_id}>
                    <article>
                      <header>
                        <strong>Version {event.version_number}</strong>
                        <time dateTime={event.changed_at}>
                          {formatApplicationJourneyTimestamp(event.changed_at)}
                        </time>
                      </header>
                      <p>{event.change_reason}</p>
                      <p>
                        {UNIVERSITY_APPLICATION_DECISION_LABELS[event.university_decision]}
                        {" · "}
                        {UNIVERSITY_APPLICATION_OFFER_STATUS_LABELS[event.offer_status]}
                        {" · "}
                        {UNIVERSITY_APPLICATION_STUDENT_DECISION_LABELS[event.student_decision]}
                        {" · "}
                        {UNIVERSITY_APPLICATION_FEE_STATUS_LABELS[event.fee_status]}
                        {" · Visa "}
                        {UNIVERSITY_APPLICATION_VISA_STATUS_LABELS[event.visa_status]}
                      </p>
                    </article>
                  </li>
                ))}
              </ol>
            )}
          </details>
        </>
      )}
    </section>
  );
}
