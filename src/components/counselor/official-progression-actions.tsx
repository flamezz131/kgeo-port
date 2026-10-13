"use client";

import { useActionState } from "react";
import { recordStudentCounselingProgressionAction } from "@/app/actions/counselor-progression-actions";
import { FieldError } from "@/components/forms/field-error";
import {
  COUNSELING_PROGRESSION_STAGE_OPTIONS,
} from "@/lib/counselor/progression";
import {
  initialOfficialProgressionActionState,
  type OfficialProgressionOperation,
} from "@/lib/counselor/progression-submission";
import type { CounselingProgressionStage } from "@/types";

const operationContent = {
  initialize: {
    heading: "Start official progression",
    stageLabel: "Starting stage",
    button: "Start official progression",
    pending: "Starting official progression...",
  },
  change_stage: {
    heading: "Change stage",
    stageLabel: "New stage",
    button: "Change official stage",
    pending: "Changing official stage...",
  },
  pause: {
    heading: "Put on hold",
    stageLabel: null,
    button: "Put progression on hold",
    pending: "Putting progression on hold...",
  },
  resume: {
    heading: "Resume",
    stageLabel: null,
    button: "Resume progression",
    pending: "Resuming progression...",
  },
  complete: {
    heading: "Complete",
    stageLabel: null,
    button: "Mark progression completed",
    pending: "Completing official progression...",
  },
} as const satisfies Record<
  OfficialProgressionOperation,
  {
    heading: string;
    stageLabel: string | null;
    button: string;
    pending: string;
  }
>;

export function OfficialProgressionActionForm({
  currentStage,
  operation,
  studentId,
}: {
  currentStage?: CounselingProgressionStage;
  operation: OfficialProgressionOperation;
  studentId: string;
}) {
  const [state, formAction, pending] = useActionState(
    recordStudentCounselingProgressionAction,
    initialOfficialProgressionActionState,
  );
  const content = operationContent[operation];
  const prefix = `official-progression-${operation}`;
  const stageOptions =
    operation === "change_stage"
      ? COUNSELING_PROGRESSION_STAGE_OPTIONS.filter(
          (option) => option.value !== currentStage,
        )
      : COUNSELING_PROGRESSION_STAGE_OPTIONS;

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="official-progression-action-form form-stack"
    >
      <input name="studentId" type="hidden" value={studentId} />
      <input name="operation" type="hidden" value={operation} />
      <h3>{content.heading}</h3>
      {state.message && state.status !== "idle" && (
        <p
          className={
            state.status === "success" ? "form-success" : "form-error"
          }
          role={state.status === "success" ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
      <fieldset className="form-fields" disabled={pending}>
        {content.stageLabel && (
          <div className="field">
            <label htmlFor={`${prefix}-stage`}>
              {content.stageLabel} <span aria-hidden="true">*</span>
            </label>
            <select
              aria-describedby={`${prefix}-stage-error`}
              aria-invalid={Boolean(state.errors?.requestedStage)}
              defaultValue={stageOptions[0]?.value}
              id={`${prefix}-stage`}
              name="requestedStage"
              required
            >
              {stageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError
              id={`${prefix}-stage-error`}
              messages={state.errors?.requestedStage}
            />
          </div>
        )}

        <div className="field">
          <label htmlFor={`${prefix}-reason`}>
            Change reason{" "}
            <span className="field-requirement">(optional)</span>
          </label>
          <textarea
            aria-describedby={`${prefix}-reason-hint ${prefix}-reason-error`}
            aria-invalid={Boolean(state.errors?.changeReason)}
            id={`${prefix}-reason`}
            name="changeReason"
            rows={3}
          />
          <span className="field-hint" id={`${prefix}-reason-hint`}>
            Operational context only, up to 500 characters.
          </span>
          <FieldError
            id={`${prefix}-reason-error`}
            messages={state.errors?.changeReason}
          />
        </div>

        <button
          aria-label={`${content.button} for this student`}
          className="button button-small"
          disabled={pending}
          type="submit"
        >
          {pending ? content.pending : content.button}
        </button>
      </fieldset>
    </form>
  );
}
