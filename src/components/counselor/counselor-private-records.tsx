"use client";

import Link from "next/link";
import {
  useActionState,
  useCallback,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import {
  cancelCounselorFollowUp,
  completeCounselorFollowUp,
  createCounselorFollowUp,
  createCounselorStudentNote,
  deleteCounselorStudentNote,
  setCounselorStudentNotePinned,
  updateCounselorFollowUp,
  updateCounselorStudentNote,
} from "@/app/actions/counselor-private-record-actions";
import { FieldError } from "@/components/forms/field-error";
import {
  COUNSELOR_FOLLOW_UP_PRIORITY_OPTIONS,
  COUNSELOR_PRIVATE_RECORD_LABELS,
  COUNSELOR_PRIVATE_RECORD_LIMITS,
  formatCounselorPrivateDate,
  formatCounselorPrivateTimestamp,
  getCounselorFollowUpLifecycle,
  getCounselorFollowUpLifecycleLabel,
  getCounselorFollowUpPriorityLabel,
  type CounselorFollowUp,
  type CounselorPrivateConsultationChoice,
  type CounselorPrivateRecordPage,
  type CounselorPrivateRecords,
  type CounselorStudentNote,
} from "@/lib/counselor/private-records";
import {
  initialCounselorPrivateRecordActionState,
  type CounselorPrivateRecordActionState,
} from "@/lib/counselor/private-record-submission";
import {
  formatConsultationDate,
  formatConsultationTimeRange,
  LEGACY_CONSULTATION_MESSAGE,
} from "@/lib/consultations/booking";
import { STUDENT_360_BASE_PATH } from "@/lib/counselor/student-profile";

type PrivateRecordAction = (
  previousState: CounselorPrivateRecordActionState,
  formData: FormData,
) => Promise<CounselorPrivateRecordActionState>;

function ActionFeedback({
  state,
}: {
  state: CounselorPrivateRecordActionState;
}) {
  if (!state.message || state.status === "idle") return null;
  return (
    <p
      className={state.status === "success" ? "form-success" : "form-error"}
      role={state.status === "success" ? "status" : "alert"}
    >
      {state.message}
    </p>
  );
}

function ConsultationField({
  choices,
  currentReference,
  defaultValue,
  error,
  id,
}: {
  choices: CounselorPrivateConsultationChoice[] | null;
  currentReference?: string | null;
  defaultValue?: string | null;
  error?: string[];
  id: string;
}) {
  if (choices === null) {
    return (
      <div className="field">
        <span className="field-label">Linked consultation (optional)</span>
        <input
          name="consultationId"
          type="hidden"
          value={defaultValue ?? ""}
        />
        <p className="field-hint" role="status">
          Consultation linking is temporarily unavailable. Saving will{" "}
          {defaultValue ? "preserve the current link" : "keep this unlinked"}.
        </p>
      </div>
    );
  }

  const hasCurrentChoice =
    !defaultValue || choices.some((choice) => choice.id === defaultValue);

  return (
    <div className="field">
      <label htmlFor={id}>
        Linked consultation{" "}
        <span className="field-requirement">(optional)</span>
      </label>
      <select
        aria-describedby={`${id}-hint ${id}-error`}
        aria-invalid={Boolean(error)}
        defaultValue={defaultValue ?? ""}
        id={id}
        name="consultationId"
      >
        <option value="">Not linked to a consultation</option>
        {!hasCurrentChoice && currentReference && defaultValue && (
          <option value={defaultValue}>
            {currentReference} — currently linked
          </option>
        )}
        {choices.map((choice) => {
          const schedule =
            choice.consultation_date &&
            choice.slot_start &&
            choice.slot_end
              ? `${formatConsultationDate(choice.consultation_date)}, ${formatConsultationTimeRange(
                  choice.slot_start,
                  choice.slot_end,
                )}`
              : LEGACY_CONSULTATION_MESSAGE;
          return (
            <option key={choice.id} value={choice.id}>
              {choice.request_number} — {schedule}
            </option>
          );
        })}
      </select>
      <span className="field-hint" id={`${id}-hint`}>
        Only consultations belonging to this student are available.
      </span>
      <FieldError id={`${id}-error`} messages={error} />
    </div>
  );
}

function closeParentDetails(event: MouseEvent<HTMLButtonElement>) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

function NoteForm({
  choices,
  note,
  onCancel,
  studentId,
}: {
  choices: CounselorPrivateConsultationChoice[] | null;
  note?: CounselorStudentNote;
  onCancel?: () => void;
  studentId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = note
    ? updateCounselorStudentNote
    : createCounselorStudentNote;
  const actionWithReset = useCallback(
    async (
      previousState: CounselorPrivateRecordActionState,
      formData: FormData,
    ) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success") {
        if (note) onCancel?.();
        else formRef.current?.reset();
      }
      return nextState;
    },
    [action, note, onCancel],
  );
  const [state, formAction, pending] = useActionState(
    actionWithReset,
    initialCounselorPrivateRecordActionState,
  );
  const prefix = note ? `private-note-${note.id}` : "private-note-create";

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="counselor-private-form form-stack"
      ref={formRef}
    >
      <input name="studentId" type="hidden" value={studentId} />
      {note && <input name="recordId" type="hidden" value={note.id} />}
      <ActionFeedback state={state} />
      <fieldset className="form-fields" disabled={pending}>
        <div className="field">
          <label htmlFor={`${prefix}-text`}>
            Private note <span aria-hidden="true">*</span>
          </label>
          <textarea
            aria-describedby={`${prefix}-text-hint ${prefix}-text-error`}
            aria-invalid={Boolean(state.errors?.noteText)}
            defaultValue={note?.note_text ?? ""}
            id={`${prefix}-text`}
            maxLength={COUNSELOR_PRIVATE_RECORD_LIMITS.noteText}
            name="noteText"
            required
            rows={5}
          />
          <span className="field-hint" id={`${prefix}-text-hint`}>
            Internal counseling context, up to 5,000 characters.
          </span>
          <FieldError
            id={`${prefix}-text-error`}
            messages={state.errors?.noteText}
          />
        </div>
        <ConsultationField
          choices={choices}
          currentReference={note?.consultation_reference}
          defaultValue={note?.consultation_id}
          error={state.errors?.consultationId}
          id={`${prefix}-consultation`}
        />
        <div className="counselor-private-inline-actions">
          <button className="button button-small" disabled={pending} type="submit">
            {pending
              ? "Saving private note..."
              : note
                ? "Save note changes"
                : "Add private note"}
          </button>
          {note && (
            <button
              className="button button-secondary button-small"
              disabled={pending}
              onClick={onCancel}
              type="button"
            >
              Cancel editing
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}

function NotePinControl({
  note,
  studentId,
}: {
  note: CounselorStudentNote;
  studentId: string;
}) {
  const [state, formAction, pending] = useActionState(
    setCounselorStudentNotePinned,
    initialCounselorPrivateRecordActionState,
  );
  const actionLabel = note.is_pinned ? "Unpin" : "Pin";
  return (
    <form action={formAction} aria-busy={pending}>
      <input name="studentId" type="hidden" value={studentId} />
      <input name="recordId" type="hidden" value={note.id} />
      <input
        name="isPinned"
        type="hidden"
        value={note.is_pinned ? "false" : "true"}
      />
      <button
        aria-label={`${actionLabel} private note created ${formatCounselorPrivateTimestamp(note.created_at)}`}
        className="button button-secondary button-small"
        disabled={pending}
        type="submit"
      >
        {pending ? "Saving pin..." : actionLabel}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function NoteDeleteControl({
  note,
  studentId,
}: {
  note: CounselorStudentNote;
  studentId: string;
}) {
  const [state, formAction, pending] = useActionState(
    deleteCounselorStudentNote,
    initialCounselorPrivateRecordActionState,
  );
  const created = formatCounselorPrivateTimestamp(note.created_at);

  return (
    <details className="counselor-private-delete">
      <summary aria-label={`Delete private note created ${created}`}>
        Delete note
      </summary>
      <div className="counselor-private-confirmation">
        <p>
          Delete this private note permanently? Follow-ups and consultations
          are not changed.
        </p>
        <form action={formAction} aria-busy={pending}>
          <input name="studentId" type="hidden" value={studentId} />
          <input name="recordId" type="hidden" value={note.id} />
          <input name="confirmDelete" type="hidden" value="delete" />
          <ActionFeedback state={state} />
          <div className="counselor-private-inline-actions">
            <button
              className="button button-danger button-small"
              disabled={pending}
              type="submit"
            >
              {pending ? "Deleting private note..." : "Confirm deletion"}
            </button>
            <button
              className="button button-secondary button-small"
              disabled={pending}
              onClick={closeParentDetails}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </details>
  );
}

function NoteCard({
  canManageCase,
  choices,
  note,
  studentId,
}: {
  canManageCase: boolean;
  choices: CounselorPrivateConsultationChoice[] | null;
  note: CounselorStudentNote;
  studentId: string;
}) {
  const [editing, setEditing] = useState(false);

  return (
    <li>
      <article className="counselor-private-card">
        <header>
          <div>
            {note.is_pinned && (
              <span className="counselor-private-badge">Pinned</span>
            )}
            <h3>Private note</h3>
          </div>
          <span>{formatCounselorPrivateTimestamp(note.created_at)}</span>
        </header>
        <p className="counselor-private-body">{note.note_text}</p>
        <dl className="counselor-private-meta">
          <div>
            <dt>Consultation</dt>
            <dd>{note.consultation_reference ?? "Not linked"}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{formatCounselorPrivateTimestamp(note.updated_at)}</dd>
          </div>
        </dl>

        {canManageCase && editing ? (
          <NoteForm
            choices={choices}
            note={note}
            onCancel={() => setEditing(false)}
            studentId={studentId}
          />
        ) : canManageCase ? (
          <div className="counselor-private-record-actions">
            <button
              aria-label={`Edit private note created ${formatCounselorPrivateTimestamp(note.created_at)}`}
              className="button button-secondary button-small"
              onClick={() => setEditing(true)}
              type="button"
            >
              Edit note
            </button>
            <NotePinControl note={note} studentId={studentId} />
            <NoteDeleteControl note={note} studentId={studentId} />
          </div>
        ) : null}
      </article>
    </li>
  );
}

function FollowUpForm({
  choices,
  followUp,
  onCancel,
  studentId,
}: {
  choices: CounselorPrivateConsultationChoice[] | null;
  followUp?: CounselorFollowUp;
  onCancel?: () => void;
  studentId: string;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = followUp
    ? updateCounselorFollowUp
    : createCounselorFollowUp;
  const actionWithReset = useCallback(
    async (
      previousState: CounselorPrivateRecordActionState,
      formData: FormData,
    ) => {
      const nextState = await action(previousState, formData);
      if (nextState.status === "success") {
        if (followUp) onCancel?.();
        else formRef.current?.reset();
      }
      return nextState;
    },
    [action, followUp, onCancel],
  );
  const [state, formAction, pending] = useActionState(
    actionWithReset,
    initialCounselorPrivateRecordActionState,
  );
  const prefix = followUp
    ? `follow-up-${followUp.id}`
    : "follow-up-create";

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="counselor-private-form form-stack"
      ref={formRef}
    >
      <input name="studentId" type="hidden" value={studentId} />
      {followUp && (
        <input name="recordId" type="hidden" value={followUp.id} />
      )}
      <ActionFeedback state={state} />
      <fieldset className="form-fields" disabled={pending}>
        <div className="counselor-private-field-grid">
          <div className="field">
            <label htmlFor={`${prefix}-due-date`}>
              Due date <span aria-hidden="true">*</span>
            </label>
            <input
              aria-describedby={`${prefix}-due-date-error`}
              aria-invalid={Boolean(state.errors?.dueDate)}
              defaultValue={followUp?.due_date ?? ""}
              id={`${prefix}-due-date`}
              name="dueDate"
              required
              type="date"
            />
            <FieldError
              id={`${prefix}-due-date-error`}
              messages={state.errors?.dueDate}
            />
          </div>
          <div className="field">
            <label htmlFor={`${prefix}-priority`}>
              Priority <span aria-hidden="true">*</span>
            </label>
            <select
              aria-describedby={`${prefix}-priority-error`}
              aria-invalid={Boolean(state.errors?.priority)}
              defaultValue={followUp?.priority ?? "normal"}
              id={`${prefix}-priority`}
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
              id={`${prefix}-priority-error`}
              messages={state.errors?.priority}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-next-action`}>
            Next action <span aria-hidden="true">*</span>
          </label>
          <textarea
            aria-describedby={`${prefix}-next-action-hint ${prefix}-next-action-error`}
            aria-invalid={Boolean(state.errors?.nextAction)}
            defaultValue={followUp?.next_action ?? ""}
            id={`${prefix}-next-action`}
            maxLength={COUNSELOR_PRIVATE_RECORD_LIMITS.nextAction}
            name="nextAction"
            required
            rows={3}
          />
          <span className="field-hint" id={`${prefix}-next-action-hint`}>
            Up to 500 characters.
          </span>
          <FieldError
            id={`${prefix}-next-action-error`}
            messages={state.errors?.nextAction}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-details`}>
            Details <span className="field-requirement">(optional)</span>
          </label>
          <textarea
            aria-describedby={`${prefix}-details-hint ${prefix}-details-error`}
            aria-invalid={Boolean(state.errors?.details)}
            defaultValue={followUp?.details ?? ""}
            id={`${prefix}-details`}
            maxLength={COUNSELOR_PRIVATE_RECORD_LIMITS.details}
            name="details"
            rows={4}
          />
          <span className="field-hint" id={`${prefix}-details-hint`}>
            Internal context, up to 2,000 characters.
          </span>
          <FieldError
            id={`${prefix}-details-error`}
            messages={state.errors?.details}
          />
        </div>
        <ConsultationField
          choices={choices}
          currentReference={followUp?.consultation_reference}
          defaultValue={followUp?.consultation_id}
          error={state.errors?.consultationId}
          id={`${prefix}-consultation`}
        />
        <div className="counselor-private-inline-actions">
          <button className="button button-small" disabled={pending} type="submit">
            {pending
              ? "Saving follow-up..."
              : followUp
                ? "Save follow-up changes"
                : "Add follow-up"}
          </button>
          {followUp && (
            <button
              className="button button-secondary button-small"
              disabled={pending}
              onClick={onCancel}
              type="button"
            >
              Cancel editing
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}

function FollowUpStatusControl({
  action,
  followUp,
  label,
  pendingLabel,
  studentId,
  tone = "primary",
}: {
  action: PrivateRecordAction;
  followUp: CounselorFollowUp;
  label: string;
  pendingLabel: string;
  studentId: string;
  tone?: "primary" | "secondary";
}) {
  const [state, formAction, pending] = useActionState(
    action,
    initialCounselorPrivateRecordActionState,
  );
  return (
    <form action={formAction} aria-busy={pending}>
      <input name="studentId" type="hidden" value={studentId} />
      <input name="recordId" type="hidden" value={followUp.id} />
      <button
        aria-label={`${label}: ${followUp.next_action}`}
        className={`button button-small${tone === "secondary" ? " button-secondary" : ""}`}
        disabled={pending}
        type="submit"
      >
        {pending ? pendingLabel : label}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

function FollowUpCard({
  businessToday,
  canManageCase,
  choices,
  followUp,
  studentId,
}: {
  businessToday: string;
  canManageCase: boolean;
  choices: CounselorPrivateConsultationChoice[] | null;
  followUp: CounselorFollowUp;
  studentId: string;
}) {
  const [editing, setEditing] = useState(false);
  const lifecycle = getCounselorFollowUpLifecycle(
    followUp,
    businessToday,
  );
  const pending = followUp.status === "pending";

  return (
    <li>
      <article className="counselor-private-card">
        <header>
          <div>
            <span
              className={`counselor-private-badge counselor-follow-up-${lifecycle}`}
            >
              {getCounselorFollowUpLifecycleLabel(lifecycle)}
            </span>
            <h3>{followUp.next_action}</h3>
          </div>
          <span>{getCounselorFollowUpPriorityLabel(followUp.priority)}</span>
        </header>
        {followUp.details && (
          <p className="counselor-private-body">{followUp.details}</p>
        )}
        <dl className="counselor-private-meta">
          <div>
            <dt>Due date</dt>
            <dd>{formatCounselorPrivateDate(followUp.due_date)}</dd>
          </div>
          <div>
            <dt>Consultation</dt>
            <dd>{followUp.consultation_reference ?? "Not linked"}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatCounselorPrivateTimestamp(followUp.created_at)}</dd>
          </div>
          <div>
            <dt>Last updated</dt>
            <dd>{formatCounselorPrivateTimestamp(followUp.updated_at)}</dd>
          </div>
          {followUp.completed_at && (
            <div>
              <dt>Completed</dt>
              <dd>
                {formatCounselorPrivateTimestamp(followUp.completed_at)}
              </dd>
            </div>
          )}
        </dl>

        {canManageCase && editing && pending ? (
          <FollowUpForm
            choices={choices}
            followUp={followUp}
            onCancel={() => setEditing(false)}
            studentId={studentId}
          />
        ) : canManageCase && pending ? (
          <div className="counselor-private-record-actions">
            <button
              aria-label={`Edit follow-up: ${followUp.next_action}`}
              className="button button-secondary button-small"
              onClick={() => setEditing(true)}
              type="button"
            >
              Edit follow-up
            </button>
            <FollowUpStatusControl
              action={completeCounselorFollowUp}
              followUp={followUp}
              label="Mark completed"
              pendingLabel="Completing..."
              studentId={studentId}
            />
            <FollowUpStatusControl
              action={cancelCounselorFollowUp}
              followUp={followUp}
              label="Cancel follow-up"
              pendingLabel="Cancelling..."
              studentId={studentId}
              tone="secondary"
            />
          </div>
        ) : (
          <p className="counselor-private-final-state">
            Final records cannot be edited or deleted.
          </p>
        )}
      </article>
    </li>
  );
}

function getPrivateRecordsUrl(
  studentId: string,
  notesPage: number,
  followUpsPage: number,
): string {
  const query = new URLSearchParams();
  if (notesPage > 1) query.set("notesPage", String(notesPage));
  if (followUpsPage > 1) {
    query.set("followUpsPage", String(followUpsPage));
  }
  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  return `${STUDENT_360_BASE_PATH}/${studentId}/advisory${suffix}`;
}

function PrivateRecordPagination({
  currentPage,
  followUpsPage,
  notesPage,
  pageCount,
  section,
  studentId,
}: {
  currentPage: number;
  followUpsPage: number;
  notesPage: number;
  pageCount: number;
  section: "notes" | "followUps";
  studentId: string;
}) {
  if (pageCount <= 1) return null;
  const getUrl = (page: number) =>
    getPrivateRecordsUrl(
      studentId,
      section === "notes" ? page : notesPage,
      section === "followUps" ? page : followUpsPage,
    );
  return (
    <nav
      aria-label={`${section === "notes" ? "Private notes" : "Follow-ups"} pagination`}
      className="counselor-private-pagination"
    >
      {currentPage > 1 ? (
        <Link href={getUrl(currentPage - 1)}>Previous</Link>
      ) : (
        <span aria-disabled="true">Previous</span>
      )}
      <span aria-current="page">
        Page {currentPage} of {pageCount}
      </span>
      {currentPage < pageCount ? (
        <Link href={getUrl(currentPage + 1)}>Next</Link>
      ) : (
        <span aria-disabled="true">Next</span>
      )}
    </nav>
  );
}

function unavailableSection(message: string) {
  return (
    <p className="form-error counselor-private-unavailable" role="alert">
      {message}
    </p>
  );
}

function readyPage<T>(
  page: CounselorPrivateRecordPage<T>,
): page is Extract<CounselorPrivateRecordPage<T>, { kind: "ready" }> {
  return page.kind === "ready";
}

export function CounselorPrivateRecords({
  canManageCase,
  records,
  studentId,
}: {
  canManageCase: boolean;
  records: CounselorPrivateRecords;
  studentId: string;
}) {
  const choices = records.consultationChoices;
  const notesPage = readyPage(records.notes) ? records.notes.page : 1;
  const followUpsPage = readyPage(records.followUps)
    ? records.followUps.page
    : 1;

  return (
    <>
      <section
        aria-labelledby="student-360-private-notes"
        className="student-360-section counselor-private-section"
      >
        <header className="student-360-section-heading">
          <span className="eyebrow">Section 7 · Counselor-owned record</span>
          <h2 id="student-360-private-notes">
            {COUNSELOR_PRIVATE_RECORD_LABELS.notes}
          </h2>
          <p className="counselor-private-notice">
            {COUNSELOR_PRIVATE_RECORD_LABELS.internalNotice}
          </p>
        </header>

        {!readyPage(records.notes) ? (
          unavailableSection(
            COUNSELOR_PRIVATE_RECORD_LABELS.notesUnavailable,
          )
        ) : (
          <>
            {canManageCase && (
              <NoteForm choices={choices} studentId={studentId} />
            )}
            {records.notes.records.length === 0 ? (
              <p className="student-360-empty" role="status">
                {COUNSELOR_PRIVATE_RECORD_LABELS.noNotes}
              </p>
            ) : (
              <ul className="counselor-private-list">
                {records.notes.records.map((note) => (
                  <NoteCard
                    canManageCase={canManageCase}
                    choices={choices}
                    key={note.id}
                    note={note}
                    studentId={studentId}
                  />
                ))}
              </ul>
            )}
            <PrivateRecordPagination
              currentPage={records.notes.page}
              followUpsPage={followUpsPage}
              notesPage={records.notes.page}
              pageCount={records.notes.pageCount}
              section="notes"
              studentId={studentId}
            />
          </>
        )}
      </section>

      <section
        aria-labelledby="student-360-follow-ups"
        className="student-360-section counselor-private-section"
      >
        <header className="student-360-section-heading">
          <span className="eyebrow">Section 8 · Operational action</span>
          <h2 id="student-360-follow-ups">
            {COUNSELOR_PRIVATE_RECORD_LABELS.followUps}
          </h2>
          <p className="counselor-private-notice">
            {COUNSELOR_PRIVATE_RECORD_LABELS.internalNotice}
          </p>
          <Link href="/counselor/follow-ups">View all follow-ups</Link>
        </header>

        {!readyPage(records.followUps) ? (
          unavailableSection(
            COUNSELOR_PRIVATE_RECORD_LABELS.followUpsUnavailable,
          )
        ) : (
          <>
            {canManageCase && (
              <FollowUpForm choices={choices} studentId={studentId} />
            )}
            {records.followUps.records.length === 0 ? (
              <p className="student-360-empty" role="status">
                {COUNSELOR_PRIVATE_RECORD_LABELS.noFollowUps}
              </p>
            ) : (
              <ul className="counselor-private-list">
                {records.followUps.records.map((followUp) => (
                  <FollowUpCard
                    businessToday={records.businessToday}
                    canManageCase={canManageCase}
                    choices={choices}
                    followUp={followUp}
                    key={followUp.id}
                    studentId={studentId}
                  />
                ))}
              </ul>
            )}
            <PrivateRecordPagination
              currentPage={records.followUps.page}
              followUpsPage={records.followUps.page}
              notesPage={notesPage}
              pageCount={records.followUps.pageCount}
              section="followUps"
              studentId={studentId}
            />
          </>
        )}
      </section>
    </>
  );
}
