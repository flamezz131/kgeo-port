"use client";

import { useActionState, useCallback, useState } from "react";
import {
  cancelCounselorFollowUp,
  completeCounselorFollowUp,
  updateCounselorWorkloadFollowUp,
} from "@/app/actions/counselor-private-record-actions";
import { FieldError } from "@/components/forms/field-error";
import { COUNSELOR_FOLLOW_UP_PRIORITY_OPTIONS } from "@/lib/counselor/private-records";
import {
  initialCounselorPrivateRecordActionState,
  type CounselorPrivateRecordActionState,
} from "@/lib/counselor/private-record-submission";
import type { FollowUpWorkloadRecord } from "@/lib/counselor/follow-up-workload";

type FollowUpAction = (
  previousState: CounselorPrivateRecordActionState,
  formData: FormData,
) => Promise<CounselorPrivateRecordActionState>;

function ActionFeedback({
  state,
}: {
  state: CounselorPrivateRecordActionState;
}) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      className={state.status === "success" ? "form-success" : "form-error"}
      role={state.status === "success" ? "status" : "alert"}
    >
      {state.message}
    </p>
  );
}

function StatusAction({
  action,
  followUp,
  label,
  pendingLabel,
  secondary = false,
}: {
  action: FollowUpAction;
  followUp: FollowUpWorkloadRecord;
  label: string;
  pendingLabel: string;
  secondary?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialCounselorPrivateRecordActionState,
  );
  const studentLabel = followUp.fullName ?? followUp.collegeEmail;
  return (
    <form action={formAction} aria-busy={pending}>
      <input name="studentId" type="hidden" value={followUp.studentId} />
      <input name="recordId" type="hidden" value={followUp.followUpId} />
      <button
        aria-label={`${label} for ${studentLabel}: ${followUp.nextAction}`}
        className={`button button-small${secondary ? " button-secondary" : ""}`}
        disabled={pending}
        type="submit"
      >
        {pending ? pendingLabel : label}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function FollowUpWorkloadActions({
  followUp,
  instance,
}: {
  followUp: FollowUpWorkloadRecord;
  instance: "desktop" | "mobile";
}) {
  const [editing, setEditing] = useState(false);
  const editAction = useCallback(
    async (
      previousState: CounselorPrivateRecordActionState,
      formData: FormData,
    ) => {
      const nextState = await updateCounselorWorkloadFollowUp(
        previousState,
        formData,
      );
      if (nextState.status === "success") setEditing(false);
      return nextState;
    },
    [],
  );
  const [editState, editFormAction, editPending] = useActionState(
    editAction,
    initialCounselorPrivateRecordActionState,
  );
  const idPrefix = `workload-${instance}-${followUp.followUpId}`;
  const studentLabel = followUp.fullName ?? followUp.collegeEmail;

  return (
    <div className="follow-up-workload-actions">
      <ActionFeedback state={editState} />
      {editing ? (
        <form
          action={editFormAction}
          aria-busy={editPending}
          className="follow-up-workload-edit-form"
        >
          <input name="studentId" type="hidden" value={followUp.studentId} />
          <input name="recordId" type="hidden" value={followUp.followUpId} />
          <fieldset disabled={editPending}>
            <div className="follow-up-workload-edit-grid">
              <div className="field">
                <label htmlFor={`${idPrefix}-due`}>
                  Due date
                </label>
                <input
                  aria-describedby={`${idPrefix}-due-error`}
                  aria-invalid={Boolean(editState.errors?.dueDate)}
                  defaultValue={followUp.dueDate}
                  id={`${idPrefix}-due`}
                  name="dueDate"
                  required
                  type="date"
                />
                <FieldError
                  id={`${idPrefix}-due-error`}
                  messages={editState.errors?.dueDate}
                />
              </div>
              <div className="field">
                <label htmlFor={`${idPrefix}-priority`}>
                  Priority
                </label>
                <select
                  aria-describedby={`${idPrefix}-priority-error`}
                  aria-invalid={Boolean(editState.errors?.priority)}
                  defaultValue={followUp.priority}
                  id={`${idPrefix}-priority`}
                  name="priority"
                  required
                >
                  {COUNSELOR_FOLLOW_UP_PRIORITY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <FieldError
                  id={`${idPrefix}-priority-error`}
                  messages={editState.errors?.priority}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor={`${idPrefix}-action`}>
                Next action
              </label>
              <textarea
                aria-describedby={`${idPrefix}-action-error`}
                aria-invalid={Boolean(editState.errors?.nextAction)}
                defaultValue={followUp.nextAction}
                id={`${idPrefix}-action`}
                maxLength={500}
                name="nextAction"
                required
                rows={3}
              />
              <FieldError
                id={`${idPrefix}-action-error`}
                messages={editState.errors?.nextAction}
              />
            </div>
            <div className="follow-up-workload-action-row">
              <button
                className="button button-small"
                disabled={editPending}
                type="submit"
              >
                {editPending ? "Saving changes..." : "Save changes"}
              </button>
              <button
                className="button button-secondary button-small"
                disabled={editPending}
                onClick={() => setEditing(false)}
                type="button"
              >
                Cancel editing
              </button>
            </div>
          </fieldset>
        </form>
      ) : (
        <div className="follow-up-workload-action-row">
          <button
            aria-label={`Edit pending follow-up for ${studentLabel}: ${followUp.nextAction}`}
            className="button button-secondary button-small"
            onClick={() => setEditing(true)}
            type="button"
          >
            Edit pending follow-up
          </button>
          <StatusAction
            action={completeCounselorFollowUp}
            followUp={followUp}
            label="Mark completed"
            pendingLabel="Completing..."
          />
          <StatusAction
            action={cancelCounselorFollowUp}
            followUp={followUp}
            label="Mark cancelled"
            pendingLabel="Cancelling..."
            secondary
          />
        </div>
      )}
    </div>
  );
}
