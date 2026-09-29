"use client";

import Link from "next/link";
import { useActionState } from "react";
import {
  markConsultationCompleted,
  markConsultationNoShow,
} from "@/app/actions/consultation-outcome-actions";
import {
  initialConsultationOutcomeActionState,
  type ConsultationOutcomeActionState,
} from "@/lib/consultations/outcome";

type OutcomeFormProps = {
  action: (
    previousState: ConsultationOutcomeActionState,
    formData: FormData,
  ) => Promise<ConsultationOutcomeActionState>;
  consultationId: string;
  label: string;
  pendingLabel: string;
  tone?: "primary" | "secondary";
};

function OutcomeForm({
  action,
  consultationId,
  label,
  pendingLabel,
  tone = "primary",
}: OutcomeFormProps) {
  const [state, formAction, isPending] = useActionState(
    action,
    initialConsultationOutcomeActionState,
  );

  return (
    <form action={formAction} aria-busy={isPending}>
      <input name="consultationId" type="hidden" value={consultationId} />
      <button
        className={`button button-small${tone === "secondary" ? " button-secondary" : ""}`}
        disabled={isPending}
        type="submit"
      >
        {isPending ? pendingLabel : label}
      </button>
      {state.message && (
        <p
          className={state.status === "success" ? "form-success" : "form-error"}
          role={state.status === "success" ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}

export function ConsultationOutcomeControls({
  consultationId,
}: {
  consultationId: string;
}) {
  return (
    <div
      aria-label="Record consultation outcome"
      className="consultation-outcome-controls"
      role="group"
    >
      <OutcomeForm
        action={markConsultationCompleted}
        consultationId={consultationId}
        label="Mark completed"
        pendingLabel="Saving completed..."
      />
      <OutcomeForm
        action={markConsultationNoShow}
        consultationId={consultationId}
        label="Mark student no-show"
        pendingLabel="Saving no-show..."
        tone="secondary"
      />
    </div>
  );
}

export function ConsultationNextWorkLinks({
  studentId,
}: {
  studentId: string;
}) {
  const studentPath = `/counselor/students/${studentId}`;
  return (
    <div aria-label="Next counselor actions" className="actions">
      <Link
        className="button button-secondary button-small"
        href={`${studentPath}#official-progression`}
      >
        Review progression
      </Link>
      <Link
        className="button button-secondary button-small"
        href={`${studentPath}#student-360-follow-ups`}
      >
        Create follow-up
      </Link>
    </div>
  );
}
