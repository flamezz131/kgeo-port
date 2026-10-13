"use client";

import { useActionState, useMemo, useState } from "react";
import { createGlobalReadinessAssessmentAction } from "@/app/actions/counselor-global-readiness-actions";
import { FieldError } from "@/components/forms/field-error";
import {
  GLOBAL_READINESS_BAND_LABELS,
  GLOBAL_READINESS_CRITERIA,
  GLOBAL_READINESS_DIMENSIONS,
  formatGlobalReadinessDate,
  getGlobalReadinessBand,
  type GlobalReadinessAssessment,
  type GlobalReadinessCriterionKey,
  type GlobalReadinessEvidence,
} from "@/lib/counselor/global-readiness";
import { initialGlobalReadinessActionState } from "@/lib/counselor/global-readiness-submission";

function CurrentAssessment({ assessment }: { assessment: GlobalReadinessAssessment }) {
  return (
    <article className="readiness-current-card">
      <div>
        <span className="eyebrow">Latest immutable assessment</span>
        <strong>{assessment.totalScore} / 100</strong>
      </div>
      <dl>
        <div><dt>Readiness Band</dt><dd>{GLOBAL_READINESS_BAND_LABELS[assessment.readinessBand]}</dd></div>
        <div><dt>Assessment date</dt><dd>{formatGlobalReadinessDate(assessment.assessedAt)}</dd></div>
        <div><dt>Revision</dt><dd>{assessment.revisionNumber}</dd></div>
        <div><dt>Assessed by</dt><dd>{assessment.assessorFullName}</dd></div>
      </dl>
    </article>
  );
}

function AssessmentHistory({ assessments }: { assessments: GlobalReadinessAssessment[] }) {
  return (
    <section className="student-workspace-panel readiness-history">
      <h3>Assessment History</h3>
      {assessments.length === 0 ? (
        <p className="student-workspace-empty">No readiness assessment has been created.</p>
      ) : (
        <ol>
          {assessments.map((assessment, index) => (
            <li key={assessment.assessmentId}>
              <details>
                <summary>
                  <span>Revision {assessment.revisionNumber}</span>
                  <strong>{assessment.totalScore} / 100 · {GLOBAL_READINESS_BAND_LABELS[assessment.readinessBand]}</strong>
                  <time>{formatGlobalReadinessDate(assessment.assessedAt)}</time>
                  <small>{index === 0 ? "Current" : "Historical"}</small>
                </summary>
                <dl className="readiness-history-totals">
                  {GLOBAL_READINESS_DIMENSIONS.map((dimension) => (
                    <div key={dimension.name}>
                      <dt>{dimension.name}</dt>
                      <dd>{assessment.dimensionTotals[dimension.totalKey]} / {dimension.maximum}</dd>
                    </div>
                  ))}
                </dl>
                <p>{assessment.assessmentRationale}</p>
              </details>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

export function GlobalReadinessAssessmentPage({
  assessments,
  evidence,
  studentId,
}: {
  assessments: GlobalReadinessAssessment[];
  evidence: GlobalReadinessEvidence;
  studentId: string;
}) {
  const action = createGlobalReadinessAssessmentAction.bind(null, studentId);
  const [state, formAction, pending] = useActionState(
    action,
    initialGlobalReadinessActionState,
  );
  const [scores, setScores] = useState<Partial<Record<GlobalReadinessCriterionKey, string>>>({});
  const preview = useMemo(() => {
    const values = GLOBAL_READINESS_CRITERIA.map((criterion) => {
      const value = scores[criterion.key];
      if (value === undefined || !/^\d+$/.test(value)) return null;
      const number = Number(value);
      return number <= criterion.maximum ? number : null;
    });
    if (values.some((value) => value === null)) return null;
    const total = values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
    return { total, band: getGlobalReadinessBand(total) };
  }, [scores]);
  const current = assessments[0] ?? null;

  return (
    <section className="readiness-workspace">
      <header className="student-workspace-section-header">
        <h2>Global Master&apos;s Readiness</h2>
        <p>Review canonical K-GEO evidence separately from scoring. Every submission creates a permanent revision.</p>
      </header>

      {current ? <CurrentAssessment assessment={current} /> : (
        <div className="student-workspace-placeholder" role="status">
          <h3>Global readiness has not been assessed.</h3>
          <p>Complete all 13 criteria to create revision 1.</p>
        </div>
      )}

      <form action={formAction} aria-busy={pending} className="readiness-form">
        {state.message && state.status !== "idle" && (
          <p className={state.status === "success" ? "form-success" : "form-error"} role={state.status === "success" ? "status" : "alert"}>
            {state.message}
          </p>
        )}
        <FieldError messages={state.errors?._form} />
        <fieldset disabled={pending}>
          {GLOBAL_READINESS_DIMENSIONS.map((dimension) => (
            <section className="student-workspace-panel readiness-dimension" key={dimension.name}>
              <header><h3>{dimension.name}</h3><span>{dimension.maximum} points</span></header>
              {GLOBAL_READINESS_CRITERIA.filter((criterion) => criterion.dimension === dimension.name).map((criterion) => {
                const scoreField = `${criterion.key}Score`;
                const rationaleField = `${criterion.key}Rationale`;
                const criterionEvidence = evidence.criteria[criterion.key];
                return (
                  <article className="readiness-criterion" key={criterion.key}>
                    <div className="readiness-evidence">
                      <span className="eyebrow">Canonical evidence</span>
                      <h4>{criterion.label}</h4>
                      <ul>{criterionEvidence.facts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
                    </div>
                    <div className="readiness-scoring">
                      <div className="field">
                        <label htmlFor={scoreField}>Score for {criterion.label} (maximum {criterion.maximum})</label>
                        <input
                          aria-describedby={`${scoreField}-error`}
                          aria-invalid={Boolean(state.errors?.[scoreField])}
                          id={scoreField}
                          inputMode="numeric"
                          max={criterion.maximum}
                          min={0}
                          name={scoreField}
                          onChange={(event) => setScores((currentScores) => ({ ...currentScores, [criterion.key]: event.target.value }))}
                          required
                          step={1}
                          type="number"
                          value={scores[criterion.key] ?? ""}
                        />
                        <FieldError id={`${scoreField}-error`} messages={state.errors?.[scoreField]} />
                      </div>
                      <div className="field">
                        <label htmlFor={rationaleField}>Criterion rationale</label>
                        <textarea
                          aria-describedby={`${rationaleField}-hint ${rationaleField}-error`}
                          aria-invalid={Boolean(state.errors?.[rationaleField])}
                          id={rationaleField}
                          maxLength={1000}
                          name={rationaleField}
                          required={
                            !criterionEvidence.recorded &&
                            Number(scores[criterion.key] ?? 0) > 0
                          }
                          rows={3}
                        />
                        <span className="field-hint" id={`${rationaleField}-hint`}>
                          Required by the database for a non-zero score when canonical evidence is not recorded.
                        </span>
                        <FieldError id={`${rationaleField}-error`} messages={state.errors?.[rationaleField]} />
                      </div>
                    </div>
                  </article>
                );
              })}
            </section>
          ))}

          <section className="student-workspace-panel readiness-narrative">
            <div className="readiness-preview" aria-live="polite">
              <span>Preview only</span>
              <strong>{preview ? `${preview.total} / 100` : "Complete all scores"}</strong>
              <small>{preview ? GLOBAL_READINESS_BAND_LABELS[preview.band] : "Database totals remain authoritative"}</small>
            </div>
            <div className="field">
              <label htmlFor="assessmentRationale">Assessment Rationale</label>
              <textarea id="assessmentRationale" maxLength={2000} name="assessmentRationale" required rows={5} aria-invalid={Boolean(state.errors?.assessmentRationale)} aria-describedby="assessmentRationale-error" />
              <FieldError id="assessmentRationale-error" messages={state.errors?.assessmentRationale} />
            </div>
            <div className="field">
              <label htmlFor="parentSafeSummary">Parent-safe Summary (optional)</label>
              <textarea id="parentSafeSummary" maxLength={1500} name="parentSafeSummary" rows={4} aria-invalid={Boolean(state.errors?.parentSafeSummary)} aria-describedby="parentSafeSummary-hint parentSafeSummary-error" />
              <span className="field-hint" id="parentSafeSummary-hint">Stored for future review; not exposed to Parent Report in Phase 1.</span>
              <FieldError id="parentSafeSummary-error" messages={state.errors?.parentSafeSummary} />
            </div>
            <button className="button" disabled={pending} type="submit">
              {pending ? "Creating Readiness Assessment..." : "Create Readiness Assessment"}
            </button>
          </section>
        </fieldset>
      </form>

      <AssessmentHistory assessments={assessments} />
    </section>
  );
}
