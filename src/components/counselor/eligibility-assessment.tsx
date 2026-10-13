"use client";

import { useActionState } from "react";
import { saveStudentEligibilityAssessmentAction } from "@/app/actions/counselor-eligibility-actions";
import { FieldError } from "@/components/forms/field-error";
import {
  STUDENT_ELIGIBILITY_ACADEMIC_STATUSES,
  STUDENT_ELIGIBILITY_ACADEMIC_STATUS_LABELS,
  STUDENT_ELIGIBILITY_APPLICATION_READINESS,
  STUDENT_ELIGIBILITY_APPLICATION_READINESS_LABELS,
  STUDENT_ELIGIBILITY_APTITUDE_READINESS,
  STUDENT_ELIGIBILITY_APTITUDE_READINESS_LABELS,
  STUDENT_ELIGIBILITY_BACKLOG_STATUSES,
  STUDENT_ELIGIBILITY_BACKLOG_STATUS_LABELS,
  STUDENT_ELIGIBILITY_ENGLISH_READINESS,
  STUDENT_ELIGIBILITY_ENGLISH_READINESS_LABELS,
  STUDENT_ELIGIBILITY_PROFILE_STRENGTHS,
  STUDENT_ELIGIBILITY_PROFILE_STRENGTH_LABELS,
  STUDENT_ELIGIBILITY_STATUSES,
  STUDENT_ELIGIBILITY_STATUS_LABELS,
  formatEligibilityDateTime,
  type CounselorEligibilityAssessment,
} from "@/lib/counselor/eligibility";
import {
  initialEligibilityAssessmentActionState,
} from "@/lib/counselor/eligibility-submission";
import type { CounselorEligibilityContext } from "@/lib/counselor/eligibility-server";
import {
  formatStudent360Date,
  formatStudent360TargetIntake,
} from "@/lib/counselor/student-profile";

function ContextValue({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function AssessmentSummary({
  assessment,
}: {
  assessment: CounselorEligibilityAssessment;
}) {
  return (
    <article className="eligibility-current-card">
      <header>
        <div>
          <span className="eyebrow">Current assessment</span>
          <h3>{STUDENT_ELIGIBILITY_STATUS_LABELS[assessment.overall_status]}</h3>
        </div>
        <time>{formatEligibilityDateTime(assessment.assessed_at)}</time>
      </header>
      <dl className="student-workspace-definition-list">
        <ContextValue
          label="Academic"
          value={STUDENT_ELIGIBILITY_ACADEMIC_STATUS_LABELS[assessment.academic_status]}
        />
        <ContextValue
          label="Backlogs"
          value={STUDENT_ELIGIBILITY_BACKLOG_STATUS_LABELS[assessment.backlog_status]}
        />
        <ContextValue
          label="English"
          value={STUDENT_ELIGIBILITY_ENGLISH_READINESS_LABELS[assessment.english_readiness]}
        />
        <ContextValue
          label="GRE / GMAT"
          value={STUDENT_ELIGIBILITY_APTITUDE_READINESS_LABELS[assessment.aptitude_readiness]}
        />
        <ContextValue
          label="Profile strength"
          value={STUDENT_ELIGIBILITY_PROFILE_STRENGTH_LABELS[assessment.profile_strength]}
        />
        <ContextValue
          label="Application readiness"
          value={STUDENT_ELIGIBILITY_APPLICATION_READINESS_LABELS[assessment.application_readiness]}
        />
        <ContextValue
          label="Recommended countries"
          value={assessment.recommended_countries.join(", ") || "Not recorded"}
        />
        <ContextValue
          label="Recommended intake"
          value={assessment.recommended_intake ?? "Not recorded"}
        />
        <ContextValue label="Assessed by" value={assessment.assessor_full_name} />
      </dl>
      <div className="eligibility-summary-copy">
        <h4>Counselor Assessment Summary</h4>
        <p>{assessment.assessment_summary}</p>
      </div>
    </article>
  );
}

function SelectField({
  defaultValue,
  errors,
  label,
  labels,
  name,
  options,
}: {
  defaultValue: string;
  errors?: string[];
  label: string;
  labels: Record<string, string>;
  name: string;
  options: readonly string[];
}) {
  const id = `eligibility-${name}`;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        aria-describedby={`${id}-error`}
        aria-invalid={Boolean(errors)}
        defaultValue={defaultValue}
        id={id}
        name={name}
        required
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {labels[option]}
          </option>
        ))}
      </select>
      <FieldError id={`${id}-error`} messages={errors} />
    </div>
  );
}

export function CounselorEligibilityAssessmentPage({
  assessments,
  context,
  studentId,
}: {
  assessments: CounselorEligibilityAssessment[];
  context: CounselorEligibilityContext;
  studentId: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveStudentEligibilityAssessmentAction,
    initialEligibilityAssessmentActionState,
  );
  const current = assessments[0] ?? null;

  return (
    <section className="eligibility-workspace">
      <header className="student-workspace-section-header">
        <h2>Eligibility Assessment</h2>
        <p>
          Review Student-provided facts, then save a professional assessment.
          Each save creates a permanent history revision.
        </p>
      </header>

      <section className="student-workspace-panel eligibility-context">
        <h3>Student factual context</h3>
        <p className="muted">Read-only information supplied by the Student.</p>
        <dl className="student-workspace-definition-list">
          <ContextValue
            label="CGPA"
            value={
              context.cgpa === null || context.cgpaScale === null
                ? "Not provided"
                : `${context.cgpa} / ${context.cgpaScale}`
            }
          />
          <ContextValue
            label="Active backlogs"
            value={
              context.activeBacklogs === null
                ? "Not provided"
                : String(context.activeBacklogs)
            }
          />
          <ContextValue
            label="Cleared backlogs"
            value={
              context.clearedBacklogs === null
                ? "Not provided"
                : String(context.clearedBacklogs)
            }
          />
          <ContextValue
            label="Student preferred countries"
            value={context.preferredCountries.join(", ") || "Not provided"}
          />
          <ContextValue
            label="Student target intake"
            value={
              context.targetIntake
                ? formatStudent360TargetIntake(context.targetIntake)
                : "Not provided"
            }
          />
        </dl>
        <div className="eligibility-test-context">
          <h4>Recorded tests</h4>
          {context.tests.length === 0 ? (
            <p className="student-workspace-empty">No relevant test scores recorded.</p>
          ) : (
            <ul>
              {context.tests.map((test) => (
                <li key={test.id}>
                  <strong>{test.name}</strong>
                  <span>{test.status}</span>
                  <span>{test.score ?? "Score not provided"}</span>
                  <span>{formatStudent360Date(test.date)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {current ? (
        <AssessmentSummary assessment={current} />
      ) : (
        <div className="student-workspace-placeholder" role="status">
          <h3>Eligibility assessment has not been completed.</h3>
          <p>Complete the form below to create the first assessment.</p>
        </div>
      )}

      <form
        action={formAction}
        aria-busy={pending}
        className="student-workspace-panel eligibility-form"
        key={current?.assessment_id ?? "new-assessment"}
      >
        <input name="studentId" type="hidden" value={studentId} />
        <header>
          <h3>{current ? "Save New Assessment" : "Create Assessment"}</h3>
          <p>
            Saving never overwrites history. It appends a new current revision.
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
          <div className="eligibility-form-grid">
            <SelectField defaultValue={current?.overall_status ?? "needs_review"} errors={state.errors?.overallStatus} label="Overall Eligibility" labels={STUDENT_ELIGIBILITY_STATUS_LABELS} name="overallStatus" options={STUDENT_ELIGIBILITY_STATUSES} />
            <SelectField defaultValue={current?.academic_status ?? "needs_review"} errors={state.errors?.academicStatus} label="Academic Eligibility" labels={STUDENT_ELIGIBILITY_ACADEMIC_STATUS_LABELS} name="academicStatus" options={STUDENT_ELIGIBILITY_ACADEMIC_STATUSES} />
            <SelectField defaultValue={current?.backlog_status ?? "needs_review"} errors={state.errors?.backlogStatus} label="Backlog Assessment" labels={STUDENT_ELIGIBILITY_BACKLOG_STATUS_LABELS} name="backlogStatus" options={STUDENT_ELIGIBILITY_BACKLOG_STATUSES} />
            <SelectField defaultValue={current?.english_readiness ?? "needs_review"} errors={state.errors?.englishReadiness} label="English Test Readiness" labels={STUDENT_ELIGIBILITY_ENGLISH_READINESS_LABELS} name="englishReadiness" options={STUDENT_ELIGIBILITY_ENGLISH_READINESS} />
            <SelectField defaultValue={current?.aptitude_readiness ?? "needs_review"} errors={state.errors?.aptitudeReadiness} label="GRE / GMAT Readiness" labels={STUDENT_ELIGIBILITY_APTITUDE_READINESS_LABELS} name="aptitudeReadiness" options={STUDENT_ELIGIBILITY_APTITUDE_READINESS} />
            <SelectField defaultValue={current?.profile_strength ?? "needs_review"} errors={state.errors?.profileStrength} label="Profile Strength" labels={STUDENT_ELIGIBILITY_PROFILE_STRENGTH_LABELS} name="profileStrength" options={STUDENT_ELIGIBILITY_PROFILE_STRENGTHS} />
            <SelectField defaultValue={current?.application_readiness ?? "needs_review"} errors={state.errors?.applicationReadiness} label="Application Readiness" labels={STUDENT_ELIGIBILITY_APPLICATION_READINESS_LABELS} name="applicationReadiness" options={STUDENT_ELIGIBILITY_APPLICATION_READINESS} />
          </div>

          <div className="field">
            <label htmlFor="eligibility-recommended-countries">Recommended Countries</label>
            <input
              aria-describedby="eligibility-recommended-countries-hint eligibility-recommended-countries-error"
              aria-invalid={Boolean(state.errors?.recommendedCountries)}
              defaultValue={current?.recommended_countries.join(", ") ?? ""}
              id="eligibility-recommended-countries"
              name="recommendedCountries"
              placeholder="Germany, United Kingdom, Ireland"
              type="text"
            />
            <span className="field-hint" id="eligibility-recommended-countries-hint">Up to 10 distinct country names, separated by commas.</span>
            <FieldError id="eligibility-recommended-countries-error" messages={state.errors?.recommendedCountries} />
          </div>

          <div className="field">
            <label htmlFor="eligibility-recommended-intake">Recommended Intake</label>
            <input
              aria-describedby="eligibility-recommended-intake-hint eligibility-recommended-intake-error"
              aria-invalid={Boolean(state.errors?.recommendedIntake)}
              defaultValue={current?.recommended_intake ?? ""}
              id="eligibility-recommended-intake"
              maxLength={40}
              name="recommendedIntake"
              placeholder="Fall 2027"
              type="text"
            />
            <span className="field-hint" id="eligibility-recommended-intake-hint">Counselor recommendation; this does not change the Student target intake.</span>
            <FieldError id="eligibility-recommended-intake-error" messages={state.errors?.recommendedIntake} />
          </div>

          <div className="field">
            <label htmlFor="eligibility-assessment-summary">Counselor Assessment Summary</label>
            <textarea
              aria-describedby="eligibility-assessment-summary-hint eligibility-assessment-summary-error"
              aria-invalid={Boolean(state.errors?.assessmentSummary)}
              defaultValue={current?.assessment_summary ?? ""}
              id="eligibility-assessment-summary"
              maxLength={1500}
              name="assessmentSummary"
              required
              rows={5}
            />
            <span className="field-hint" id="eligibility-assessment-summary-hint">Concise professional assessment only. Private Counselor notes remain separate.</span>
            <FieldError id="eligibility-assessment-summary-error" messages={state.errors?.assessmentSummary} />
          </div>

          <button className="button" disabled={pending} type="submit">
            {pending ? "Saving Assessment..." : current ? "Save New Assessment" : "Save Assessment"}
          </button>
        </fieldset>
      </form>

      <section className="student-workspace-panel eligibility-history">
        <h3>Assessment History</h3>
        {assessments.length === 0 ? (
          <p className="student-workspace-empty">No assessment history recorded.</p>
        ) : (
          <ol>
            {assessments.map((assessment, index) => (
              <li key={assessment.assessment_id}>
                <div>
                  <time>{formatEligibilityDateTime(assessment.assessed_at)}</time>
                  <strong>{STUDENT_ELIGIBILITY_STATUS_LABELS[assessment.overall_status]}</strong>
                  <span>{assessment.assessor_full_name}</span>
                </div>
                <span>{index === 0 ? "Current" : "Historical"}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}
