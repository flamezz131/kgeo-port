"use client";

import { useActionState, useRef } from "react";
import { closeDuplicateFutureWaitingConsultationAction } from "@/app/actions/director-duplicate-future-consultation-actions";
import {
  DEFAULT_DUPLICATE_FUTURE_REASON,
  DUPLICATE_FUTURE_REASON_MAX_LENGTH,
  initialDuplicateFutureClosureActionState,
  type DirectorDuplicateFutureWaitingConsultation,
} from "@/lib/director/duplicate-future-consultation";
import type { DirectorDuplicateFutureConsultationData } from "@/lib/director/duplicate-future-consultation-server";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.valueOf())
    ? "Date unavailable"
    : dateFormatter.format(date);
}

function formatTimeRange(start: string, end: string): string {
  return `${start.slice(0, 5)}–${end.slice(0, 5)}`;
}

function DuplicateFutureClosureCard({
  consultation,
}: {
  consultation: DirectorDuplicateFutureWaitingConsultation;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const action = closeDuplicateFutureWaitingConsultationAction.bind(
    null,
    consultation.consultationId,
  );
  const [state, formAction, isPending] = useActionState(
    action,
    initialDuplicateFutureClosureActionState,
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
            <dd>{consultation.studentFullName ?? "Name unavailable"}</dd>
          </div>
          <div>
            <dt>Duplicate future request</dt>
            <dd>
              {formatDate(consultation.requestedDate)}
              <span>
                {formatTimeRange(
                  consultation.requestedSlotStart,
                  consultation.requestedSlotEnd,
                )}
              </span>
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className="director-status-badge">
                Waiting for assignment
              </span>
            </dd>
          </div>
          <div>
            <dt>Existing active appointment</dt>
            <dd>
              {formatDate(consultation.scheduledDate)}
              <span>
                {formatTimeRange(
                  consultation.scheduledSlotStart,
                  consultation.scheduledSlotEnd,
                )}
                {" · "}
                {consultation.scheduledCounselorFullName ?? "Counselor name unavailable"}
              </span>
            </dd>
          </div>
        </dl>
        <button
          className="button button-primary button-small"
          onClick={openDialog}
          type="button"
        >
          Close Duplicate Request
        </button>
      </article>

      <dialog
        aria-labelledby={`duplicate-future-title-${consultation.requestNumber}`}
        className="director-assignment-dialog"
        ref={dialogRef}
      >
        <form action={formAction} aria-busy={isPending} ref={formRef}>
          <header>
            <h2 id={`duplicate-future-title-${consultation.requestNumber}`}>
              Close Duplicate Request
            </h2>
            <p>
              This Student already has another scheduled consultation. Closing
              this duplicate request keeps the existing scheduled appointment
              unchanged.
            </p>
          </header>

          <label>
            Reason
            <textarea
              aria-describedby={
                state.fieldErrors?.reason
                  ? `duplicate-future-reason-${consultation.requestNumber}`
                  : undefined
              }
              aria-invalid={Boolean(state.fieldErrors?.reason)}
              defaultValue={DEFAULT_DUPLICATE_FUTURE_REASON}
              maxLength={DUPLICATE_FUTURE_REASON_MAX_LENGTH}
              name="reason"
              required
              rows={4}
            />
          </label>

          {state.message && (
            <p
              className={state.status === "success" ? "form-success" : "form-error"}
              id={`duplicate-future-reason-${consultation.requestNumber}`}
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

export function DirectorDuplicateFutureConsultationResolution({
  data,
}: {
  data: DirectorDuplicateFutureConsultationData;
}) {
  return (
    <section
      aria-labelledby="duplicate-future-resolution-heading"
      className="counselor-page director-page director-assignment-panel"
    >
      <header className="director-assignment-heading">
        <div>
          <h2 id="duplicate-future-resolution-heading">
            Duplicate future requests
          </h2>
          <p>
            Close only future unassigned requests whose Student already has a
            different future scheduled consultation. The scheduled appointment
            remains unchanged.
          </p>
        </div>
      </header>

      {data.status === "unavailable" ? (
        <div className="director-state director-state-error" role="alert">
          <h3>Duplicate-request resolution is temporarily unavailable</h3>
          <p>Refresh the page before attempting a closure.</p>
        </div>
      ) : data.items.length === 0 ? (
        <p className="director-assignment-notice" role="status">
          No eligible duplicate future requests require closure.
        </p>
      ) : (
        <ul className="director-assignment-history">
          {data.items.map((consultation) => (
            <DuplicateFutureClosureCard
              consultation={consultation}
              key={consultation.consultationId}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
