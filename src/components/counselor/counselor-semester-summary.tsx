"use client";

import { useActionState } from "react";
import { saveCounselorSemesterSummaryAction } from "@/app/actions/counselor-semester-summary-actions";
import {
  COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS,
  formatSemesterSummaryTimestamp,
  initialCounselorSemesterSummaryActionState,
  type CounselorSemesterSummaryLoadResult,
} from "@/lib/counselor/semester-summary";

function FieldError({ messages }: { messages?: string[] }) {
  if (!messages?.length) return null;
  return <span className="field-error">{messages[0]}</span>;
}

export function CounselorSemesterSummary({
  result,
  studentId,
}: {
  result: CounselorSemesterSummaryLoadResult;
  studentId: string;
}) {
  const [state, formAction, pending] = useActionState(
    saveCounselorSemesterSummaryAction,
    initialCounselorSemesterSummaryActionState,
  );
  const latest = result.kind === "ready" ? result.summaries[0] : null;

  return (
    <section
      aria-labelledby="counselor-semester-summary-heading"
      className="student-360-section counselor-semester-summary"
    >
      <header className="student-360-section-heading">
        <span className="eyebrow">Parent-safe structured record</span>
        <h2 id="counselor-semester-summary-heading">
          Counselor Semester Summary
        </h2>
        <p>
          Keep this concise and suitable for a future Parent Report. Private
          observations belong only in Counselor Notes above.
        </p>
      </header>

      {result.kind === "unavailable" ? (
        <p className="form-error" role="alert">
          Semester Summaries are temporarily unavailable.
        </p>
      ) : result.kind === "not_found" ? null : (
        <>
          <form
            action={formAction}
            aria-busy={pending}
            className="student-workspace-panel counselor-semester-summary-form"
          >
            <input name="studentId" type="hidden" value={studentId} />
            <header>
              <h3>{latest ? "Save a new summary revision" : "Create summary"}</h3>
              <p>
                Revisions are append-only so earlier parent-safe summaries
                remain auditable.
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
              <div className="field">
                <label htmlFor="semester-summary-period">Semester / academic period</label>
                <input
                  aria-invalid={Boolean(state.errors?.academicPeriod)}
                  defaultValue={latest?.academic_period ?? ""}
                  id="semester-summary-period"
                  maxLength={COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.academicPeriod}
                  name="academicPeriod"
                  placeholder="Semester 5 · 2026–27"
                  required
                />
                <FieldError messages={state.errors?.academicPeriod} />
              </div>
              <div className="field">
                <label htmlFor="semester-summary-progress">Progress summary</label>
                <textarea
                  aria-invalid={Boolean(state.errors?.progressSummary)}
                  defaultValue={latest?.progress_summary ?? ""}
                  id="semester-summary-progress"
                  maxLength={COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.progressSummary}
                  name="progressSummary"
                  required
                  rows={4}
                />
                <FieldError messages={state.errors?.progressSummary} />
              </div>
              <div className="field">
                <label htmlFor="semester-summary-highlights">Achievements / highlights</label>
                <textarea
                  aria-invalid={Boolean(state.errors?.achievementsHighlights)}
                  defaultValue={latest?.achievements_highlights ?? ""}
                  id="semester-summary-highlights"
                  maxLength={COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.achievementsHighlights}
                  name="achievementsHighlights"
                  rows={3}
                />
                <FieldError messages={state.errors?.achievementsHighlights} />
              </div>
              <div className="field">
                <label htmlFor="semester-summary-attention">Areas requiring attention</label>
                <textarea
                  aria-invalid={Boolean(state.errors?.areasRequiringAttention)}
                  defaultValue={latest?.areas_requiring_attention ?? ""}
                  id="semester-summary-attention"
                  maxLength={COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.areasRequiringAttention}
                  name="areasRequiringAttention"
                  rows={3}
                />
                <FieldError messages={state.errors?.areasRequiringAttention} />
              </div>
              <div className="field">
                <label htmlFor="semester-summary-actions">Next semester actions</label>
                <textarea
                  aria-invalid={Boolean(state.errors?.nextSemesterActions)}
                  defaultValue={latest?.next_semester_actions ?? ""}
                  id="semester-summary-actions"
                  maxLength={COUNSELOR_SEMESTER_SUMMARY_FIELD_LIMITS.nextSemesterActions}
                  name="nextSemesterActions"
                  required
                  rows={3}
                />
                <FieldError messages={state.errors?.nextSemesterActions} />
              </div>
              <button className="button" disabled={pending} type="submit">
                {pending ? "Saving Summary..." : "Save Summary Revision"}
              </button>
            </fieldset>
          </form>

          <section className="student-workspace-panel counselor-semester-summary-history">
            <h3>Semester Summary history</h3>
            {result.summaries.length === 0 ? (
              <p className="student-workspace-empty">
                No parent-safe Semester Summary has been recorded.
              </p>
            ) : (
              <ol>
                {result.summaries.map((summary, index) => (
                  <li key={summary.summary_id}>
                    <article>
                      <header>
                        <div>
                          <span className="eyebrow">{index === 0 ? "Latest revision" : "Historical revision"}</span>
                          <h4>{summary.academic_period}</h4>
                        </div>
                        <time dateTime={summary.created_at}>
                          {formatSemesterSummaryTimestamp(summary.created_at)}
                        </time>
                      </header>
                      <dl className="student-workspace-definition-list">
                        <div><dt>Progress summary</dt><dd>{summary.progress_summary}</dd></div>
                        <div><dt>Achievements / highlights</dt><dd>{summary.achievements_highlights ?? "None recorded"}</dd></div>
                        <div><dt>Areas requiring attention</dt><dd>{summary.areas_requiring_attention ?? "None recorded"}</dd></div>
                        <div><dt>Next semester actions</dt><dd>{summary.next_semester_actions}</dd></div>
                        <div><dt>Prepared by</dt><dd>{summary.counselor_full_name}</dd></div>
                      </dl>
                    </article>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </section>
  );
}
