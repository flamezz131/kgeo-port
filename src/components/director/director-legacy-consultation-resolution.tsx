"use client";

import { useActionState, useRef } from "react";
import { closeLegacyWaitingConsultationAction } from "@/app/actions/director-consultation-actions";
import {
  DEFAULT_LEGACY_CONSULTATION_REASON,
  LEGACY_CONSULTATION_REASON_MAX_LENGTH,
  initialLegacyConsultationClosureActionState,
  type DirectorLegacyWaitingConsultation,
} from "@/lib/director/legacy-consultation";
import type { DirectorLegacyConsultationData } from "@/lib/director/legacy-consultation-server";

const submittedAtFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

function formatSubmittedAt(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Submitted date unavailable"
    : submittedAtFormatter.format(date);
}

function LegacyClosureCard({
  consultation,
}: {
  consultation: DirectorLegacyWaitingConsultation;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const action = closeLegacyWaitingConsultationAction.bind(
    null,
    consultation.consultationId,
  );
  const [state, formAction, isPending] = useActionState(
    action,
    initialLegacyConsultationClosureActionState,
  );

  function openDialog() {
    formRef.current?.reset();
    dialogRef.current?.showModal();
  }

  return (
    <li>
      <article className="director-assignment-summary">
        <dl>
          <div>
            <dt>Student</dt>
            <dd>
              {consultation.studentFullName ?? "Name unavailable"}
              <span>{consultation.studentCollegeEmail}</span>
            </dd>
          </div>
          <div>
            <dt>Submitted</dt>
            <dd>{formatSubmittedAt(consultation.submittedAt)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className="director-status-badge">
                Legacy unscheduled request
              </span>
            </dd>
          </div>
        </dl>
        <button
          className="button button-primary button-small"
          onClick={openDialog}
          type="button"
        >
          Close Legacy Request
        </button>
      </article>

      <dialog
        aria-labelledby={`legacy-closure-title-${consultation.requestNumber}`}
        className="director-assignment-dialog"
        ref={dialogRef}
      >
        <form action={formAction} aria-busy={isPending} ref={formRef}>
          <header>
            <h2 id={`legacy-closure-title-${consultation.requestNumber}`}>
              Close Legacy Request
            </h2>
            <p>Close this old unscheduled consultation request?</p>
          </header>

          <label>
            Reason
            <textarea
              aria-describedby={
                state.fieldErrors?.reason
                  ? `legacy-closure-reason-${consultation.requestNumber}`
                  : undefined
              }
              aria-invalid={Boolean(state.fieldErrors?.reason)}
              defaultValue={DEFAULT_LEGACY_CONSULTATION_REASON}
              maxLength={LEGACY_CONSULTATION_REASON_MAX_LENGTH}
              name="reason"
              required
              rows={4}
            />
          </label>

          {state.message && (
            <p
              className={state.status === "success" ? "form-success" : "form-error"}
              id={`legacy-closure-reason-${consultation.requestNumber}`}
              role={state.status === "success" ? "status" : "alert"}
            >
              {state.message}
            </p>
          )}

          <div className="director-assignment-dialog-actions">
            <button
              className="button button-light"
              disabled={isPending}
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              Keep Request
            </button>
            <button
              className="button button-primary"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Closing…" : "Confirm Closure"}
            </button>
          </div>
        </form>
      </dialog>
    </li>
  );
}

export function DirectorLegacyConsultationResolution({
  data,
}: {
  data: DirectorLegacyConsultationData;
}) {
  return (
    <section
      aria-labelledby="legacy-consultation-resolution-heading"
      className="counselor-page director-page director-assignment-panel"
    >
      <header className="director-assignment-heading">
        <div>
          <h2 id="legacy-consultation-resolution-heading">
            Legacy unscheduled requests
          </h2>
          <p>
            Close only old null-slot requests superseded by an active Primary
            Counselor relationship. Scheduled consultations are never eligible.
          </p>
        </div>
      </header>

      {data.status === "unavailable" ? (
        <div className="director-state director-state-error" role="alert">
          <h3>Legacy resolution is temporarily unavailable</h3>
          <p>Refresh the page before attempting a closure.</p>
        </div>
      ) : data.items.length === 0 ? (
        <p className="director-assignment-notice" role="status">
          No eligible legacy unscheduled requests require closure.
        </p>
      ) : (
        <ul className="director-assignment-history">
          {data.items.map((consultation) => (
            <LegacyClosureCard
              consultation={consultation}
              key={consultation.consultationId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
