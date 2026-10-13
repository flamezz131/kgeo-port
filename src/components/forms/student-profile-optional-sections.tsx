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
  createStudentAchievement,
  createStudentTestScore,
  deleteStudentAchievement,
  deleteStudentTestScore,
  updateStudentAchievement,
  updateStudentTestScore,
} from "@/app/actions/student-profile-record-actions";
import { FieldError } from "@/components/forms/field-error";
import { StudentAchievementEvidence } from "@/components/forms/student-achievement-evidence";
import {
  OPTIONAL_PROFILE_RECORD_FALLBACKS,
  STUDENT_ACHIEVEMENT_TYPE_OPTIONS,
  STUDENT_EXAM_NAME_OPTIONS,
  STUDENT_EXAM_STATUS_OPTIONS,
  formatOptionalProfileDate,
  getStudentAchievementTypeLabel,
  getStudentExamNameLabel,
  getStudentExamStatusLabel,
  getStudentProfileOptionalRecordUrl,
  isStudentExamName,
  isStudentExamStatus,
} from "@/lib/profiles/options";
import {
  initialStudentOptionalRecordActionState,
  type StudentOptionalRecordActionState,
} from "@/lib/profiles/optional-record-types";
import type {
  StudentAchievementRecord,
  StudentOptionalRecordPage,
  StudentTestScoreRecord,
} from "@/lib/profiles/optional-records";
import type { StudentAchievementDocument } from "@/types";
import { sectionPlainClass } from "@/components/shell/form-ui";

type RecordAction = (
  previousState: StudentOptionalRecordActionState,
  formData: FormData,
) => Promise<StudentOptionalRecordActionState>;

type OptionalSectionsProps = {
  achievementDocuments: StudentAchievementDocument[] | null;
  achievements: StudentOptionalRecordPage<StudentAchievementRecord>;
  businessToday: string;
  exams: StudentOptionalRecordPage<StudentTestScoreRecord>;
};

function ActionFeedback({
  state,
}: {
  state: StudentOptionalRecordActionState;
}) {
  if (state.status !== "error" || !state.message) return null;
  return (
    <p className="form-error optional-record-feedback" role="alert">
      {state.message}
    </p>
  );
}

function closeParentDetails(
  event: MouseEvent<HTMLButtonElement>,
) {
  event.currentTarget.closest("details")?.removeAttribute("open");
}

function RecordPagination({
  achievementPage,
  examPage,
  page,
  pageCount,
  section,
}: {
  achievementPage: number;
  examPage: number;
  page: number;
  pageCount: number;
  section: "achievements" | "exams";
}) {
  if (pageCount <= 1) return null;

  const getUrl = (destinationPage: number) =>
    getStudentProfileOptionalRecordUrl(
      section === "exams" ? destinationPage : examPage,
      section === "achievements" ? destinationPage : achievementPage,
    );

  return (
    <nav
      aria-label={`${section === "exams" ? "Study Abroad Exam" : "Achievement"} pagination`}
      className="optional-record-pagination"
    >
      {page > 1 ? (
        <Link href={getUrl(page - 1)}>Previous</Link>
      ) : (
        <span aria-disabled="true">Previous</span>
      )}
      <span aria-current="page">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? (
        <Link href={getUrl(page + 1)}>Next</Link>
      ) : (
        <span aria-disabled="true">Next</span>
      )}
    </nav>
  );
}

function DeleteRecordControl({
  accessibleLabel,
  action,
  confirmation,
  label,
  onActionStart,
  onSuccess,
  recordId,
}: {
  accessibleLabel: string;
  action: RecordAction;
  confirmation: string;
  label: string;
  onActionStart: () => void;
  onSuccess: (message: string) => void;
  recordId: string;
}) {
  const actionWithFeedback = useCallback(
    async (
      previousState: StudentOptionalRecordActionState,
      formData: FormData,
    ) => {
      onActionStart();
      const nextState = await action(previousState, formData);
      if (nextState.status === "success") {
        onSuccess(nextState.message ?? "Record deleted.");
      }
      return nextState;
    },
    [action, onActionStart, onSuccess],
  );
  const [state, formAction, pending] = useActionState(
    actionWithFeedback,
    initialStudentOptionalRecordActionState,
  );

  return (
    <details className="optional-record-delete">
      <summary aria-label={accessibleLabel}>{label}</summary>
      <div className="optional-record-confirmation">
        <p>{confirmation} This cannot be undone.</p>
        <form action={formAction} aria-busy={pending}>
          <input name="recordId" type="hidden" value={recordId} />
          <ActionFeedback state={state} />
          <div className="optional-record-inline-actions">
            <button
              className="button button-danger button-small"
              disabled={pending}
              type="submit"
            >
              {pending ? "Deleting..." : "Confirm deletion"}
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

function ExamForm({
  businessToday,
  onActionStart,
  onCancel,
  onSuccess,
  record,
}: {
  businessToday: string;
  onActionStart: () => void;
  onCancel?: () => void;
  onSuccess: (message: string) => void;
  record?: StudentTestScoreRecord;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [examName, setExamName] = useState(record?.exam_name ?? "ielts");
  const [examStatus, setExamStatus] = useState(
    record?.exam_status ?? "planning",
  );
  const action = record ? updateStudentTestScore : createStudentTestScore;
  const actionWithFeedback = useCallback(
    async (
      previousState: StudentOptionalRecordActionState,
      formData: FormData,
    ) => {
      onActionStart();
      const nextState = await action(previousState, formData);
      if (nextState.status === "success") {
        onSuccess(nextState.message ?? "Study Abroad Exam attempt saved.");
        if (!record) {
          formRef.current?.reset();
          setExamName("ielts");
          setExamStatus("planning");
        }
      }
      return nextState;
    },
    [action, onActionStart, onSuccess, record],
  );
  const [state, formAction, pending] = useActionState(
    actionWithFeedback,
    initialStudentOptionalRecordActionState,
  );
  const inactive =
    examStatus === "not_planned" || examStatus === "not_required";
  const completed = examStatus === "completed";
  const prefix = record ? `exam-${record.id}` : "exam-create";

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="optional-record-form form-stack"
      ref={formRef}
    >
      {record && <input name="recordId" type="hidden" value={record.id} />}
      <ActionFeedback state={state} />
      <fieldset className="form-fields" disabled={pending}>
        <div className="optional-record-field-grid">
          <div className="field">
            <label htmlFor={`${prefix}-name`}>
              Study Abroad Exam <span aria-hidden="true">*</span>
            </label>
            <select
              aria-describedby={`${prefix}-name-error`}
              aria-invalid={Boolean(state.errors?.examName)}
              defaultValue={record?.exam_name ?? "ielts"}
              id={`${prefix}-name`}
              name="examName"
              onChange={(event) => {
                if (isStudentExamName(event.target.value)) {
                  setExamName(event.target.value);
                }
              }}
              required
            >
              {STUDENT_EXAM_NAME_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError
              id={`${prefix}-name-error`}
              messages={state.errors?.examName}
            />
          </div>

          <div className="field">
            <label htmlFor={`${prefix}-custom`}>
              Custom exam name{" "}
              {examName === "other" ? (
                <span className="field-requirement">(required)</span>
              ) : (
                <span className="field-requirement">(optional)</span>
              )}
            </label>
            <input
              aria-describedby={`${prefix}-custom-hint ${prefix}-custom-error`}
              aria-invalid={Boolean(state.errors?.customExamName)}
              defaultValue={record?.custom_exam_name ?? ""}
              disabled={examName !== "other"}
              id={`${prefix}-custom`}
              maxLength={100}
              name="customExamName"
              required={examName === "other"}
            />
            <span className="field-hint" id={`${prefix}-custom-hint`}>
              Choose Other to record an exam not listed, such as Duolingo
              English Test.
            </span>
            <FieldError
              id={`${prefix}-custom-error`}
              messages={state.errors?.customExamName}
            />
          </div>

          <div className="field">
            <label htmlFor={`${prefix}-status`}>
              Exam status <span aria-hidden="true">*</span>
            </label>
            <select
              aria-describedby={`${prefix}-status-error`}
              aria-invalid={Boolean(state.errors?.examStatus)}
              defaultValue={record?.exam_status ?? "planning"}
              id={`${prefix}-status`}
              name="examStatus"
              onChange={(event) => {
                if (isStudentExamStatus(event.target.value)) {
                  setExamStatus(event.target.value);
                }
              }}
              required
            >
              {STUDENT_EXAM_STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError
              id={`${prefix}-status-error`}
              messages={state.errors?.examStatus}
            />
          </div>

          <div className="field">
            <label htmlFor={`${prefix}-attempt`}>
              Attempt number <span aria-hidden="true">*</span>
            </label>
            <input
              aria-describedby={`${prefix}-attempt-hint ${prefix}-attempt-error`}
              aria-invalid={Boolean(state.errors?.attemptNumber)}
              defaultValue={record?.attempt_number ?? 1}
              id={`${prefix}-attempt`}
              inputMode="numeric"
              max={20}
              min={1}
              name="attemptNumber"
              required
              type="number"
            />
            <span className="field-hint" id={`${prefix}-attempt-hint`}>
              Multiple attempts are supported; use a different number for each.
            </span>
            <FieldError
              id={`${prefix}-attempt-error`}
              messages={state.errors?.attemptNumber}
            />
          </div>

          <div className="field">
            <label htmlFor={`${prefix}-planned`}>
              Planned or booked date{" "}
              <span className="field-requirement">
                ({examStatus === "booked" ? "required" : "optional"})
              </span>
            </label>
            <input
              aria-describedby={`${prefix}-planned-error`}
              aria-invalid={Boolean(state.errors?.plannedDate)}
              defaultValue={record?.planned_date ?? ""}
              disabled={inactive}
              id={`${prefix}-planned`}
              name="plannedDate"
              required={examStatus === "booked"}
              type="date"
            />
            <FieldError
              id={`${prefix}-planned-error`}
              messages={state.errors?.plannedDate}
            />
          </div>

          <div className="field">
            <label htmlFor={`${prefix}-completed`}>
              Completed date{" "}
              <span className="field-requirement">
                ({completed ? "required" : "optional"})
              </span>
            </label>
            <input
              aria-describedby={`${prefix}-completed-error`}
              aria-invalid={Boolean(state.errors?.completedDate)}
              defaultValue={record?.completed_date ?? ""}
              disabled={!completed}
              id={`${prefix}-completed`}
              max={businessToday}
              name="completedDate"
              required={completed}
              type="date"
            />
            <FieldError
              id={`${prefix}-completed-error`}
              messages={state.errors?.completedDate}
            />
          </div>

          <div className="field">
            <label htmlFor={`${prefix}-score`}>
              Score or result{" "}
              <span className="field-requirement">(optional)</span>
            </label>
            <input
              aria-describedby={`${prefix}-score-hint ${prefix}-score-error`}
              aria-invalid={Boolean(state.errors?.score)}
              defaultValue={record?.score ?? ""}
              disabled={!completed}
              id={`${prefix}-score`}
              maxLength={100}
              name="score"
            />
            <span className="field-hint" id={`${prefix}-score-hint`}>
              Enter the score exactly as reported, for example 7.5, 320, or
              Pass.
            </span>
            <FieldError
              id={`${prefix}-score-error`}
              messages={state.errors?.score}
            />
          </div>

          <div className="field">
            <label htmlFor={`${prefix}-valid`}>
              Score valid until{" "}
              <span className="field-requirement">(optional)</span>
            </label>
            <input
              aria-describedby={`${prefix}-valid-error`}
              aria-invalid={Boolean(state.errors?.validUntil)}
              defaultValue={record?.valid_until ?? ""}
              disabled={!completed}
              id={`${prefix}-valid`}
              min={record?.completed_date ?? undefined}
              name="validUntil"
              type="date"
            />
            <FieldError
              id={`${prefix}-valid-error`}
              messages={state.errors?.validUntil}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${prefix}-remarks`}>
            Remarks <span className="field-requirement">(optional)</span>
          </label>
          <textarea
            aria-describedby={`${prefix}-remarks-hint ${prefix}-remarks-error`}
            aria-invalid={Boolean(state.errors?.remarks)}
            defaultValue={record?.remarks ?? ""}
            id={`${prefix}-remarks`}
            maxLength={1000}
            name="remarks"
            rows={3}
          />
          <span className="field-hint" id={`${prefix}-remarks-hint`}>
            Up to 1,000 characters.
          </span>
          <FieldError
            id={`${prefix}-remarks-error`}
            messages={state.errors?.remarks}
          />
        </div>

        <div className="mt-2 flex justify-end gap-3 max-[650px]:flex-col max-[650px]:items-stretch max-[650px]:[&_.button]:w-full">
          {onCancel && (
            <button
              className="button button-secondary"
              onClick={onCancel}
              type="button"
            >
              Cancel edit
            </button>
          )}
          <button className="button" disabled={pending} type="submit">
            {pending
              ? record
                ? "Saving changes..."
                : "Adding attempt..."
              : record
                ? "Save exam changes"
                : "Add exam attempt"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

function AchievementForm({
  businessToday,
  onActionStart,
  onCancel,
  onSuccess,
  record,
}: {
  businessToday: string;
  onActionStart: () => void;
  onCancel?: () => void;
  onSuccess: (message: string) => void;
  record?: StudentAchievementRecord;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const action = record
    ? updateStudentAchievement
    : createStudentAchievement;
  const actionWithFeedback = useCallback(
    async (
      previousState: StudentOptionalRecordActionState,
      formData: FormData,
    ) => {
      onActionStart();
      const nextState = await action(previousState, formData);
      if (nextState.status === "success") {
        onSuccess(nextState.message ?? "Achievement saved.");
        if (!record) formRef.current?.reset();
      }
      return nextState;
    },
    [action, onActionStart, onSuccess, record],
  );
  const [state, formAction, pending] = useActionState(
    actionWithFeedback,
    initialStudentOptionalRecordActionState,
  );
  const prefix = record
    ? `achievement-${record.id}`
    : "achievement-create";

  return (
    <form
      action={formAction}
      aria-busy={pending}
      className="optional-record-form form-stack"
      ref={formRef}
    >
      {record && <input name="recordId" type="hidden" value={record.id} />}
      <ActionFeedback state={state} />
      <fieldset className="form-fields" disabled={pending}>
        <div className="optional-record-field-grid">
          <div className="field">
            <label htmlFor={`${prefix}-type`}>
              Category <span aria-hidden="true">*</span>
            </label>
            <select
              aria-describedby={`${prefix}-type-error`}
              aria-invalid={Boolean(state.errors?.achievementType)}
              defaultValue={record?.achievement_type ?? "certification"}
              id={`${prefix}-type`}
              name="achievementType"
              required
            >
              {STUDENT_ACHIEVEMENT_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <FieldError
              id={`${prefix}-type-error`}
              messages={state.errors?.achievementType}
            />
          </div>

          <div className="field">
            <label htmlFor={`${prefix}-title`}>
              Achievement title <span aria-hidden="true">*</span>
            </label>
            <input
              aria-describedby={`${prefix}-title-error`}
              aria-invalid={Boolean(state.errors?.title)}
              defaultValue={record?.title ?? ""}
              id={`${prefix}-title`}
              maxLength={200}
              name="title"
              required
            />
            <FieldError
              id={`${prefix}-title-error`}
              messages={state.errors?.title}
            />
          </div>

          <div className="field">
            <label htmlFor={`${prefix}-organization`}>
              Issuing organization{" "}
              <span className="field-requirement">(optional)</span>
            </label>
            <input
              aria-describedby={`${prefix}-organization-error`}
              aria-invalid={Boolean(state.errors?.organization)}
              defaultValue={record?.organization ?? ""}
              id={`${prefix}-organization`}
              maxLength={200}
              name="organization"
            />
            <FieldError
              id={`${prefix}-organization-error`}
              messages={state.errors?.organization}
            />
          </div>

          <div className="field">
            <label htmlFor={`${prefix}-date`}>
              Achievement date{" "}
              <span className="field-requirement">(optional)</span>
            </label>
            <input
              aria-describedby={`${prefix}-date-error`}
              aria-invalid={Boolean(state.errors?.achievementDate)}
              defaultValue={record?.achievement_date ?? ""}
              id={`${prefix}-date`}
              max={businessToday}
              min="1950-01-01"
              name="achievementDate"
              type="date"
            />
            <FieldError
              id={`${prefix}-date-error`}
              messages={state.errors?.achievementDate}
            />
          </div>
        </div>

        <div className="field">
          <label htmlFor={`${prefix}-description`}>
            Description <span className="field-requirement">(optional)</span>
          </label>
          <textarea
            aria-describedby={`${prefix}-description-hint ${prefix}-description-error`}
            aria-invalid={Boolean(state.errors?.description)}
            defaultValue={record?.description ?? ""}
            id={`${prefix}-description`}
            maxLength={2000}
            name="description"
            rows={4}
          />
          <span className="field-hint" id={`${prefix}-description-hint`}>
            Up to 2,000 characters. File uploads and evidence links are not
            collected in this section.
          </span>
          <FieldError
            id={`${prefix}-description-error`}
            messages={state.errors?.description}
          />
        </div>

        <div className="mt-2 flex justify-end gap-3 max-[650px]:flex-col max-[650px]:items-stretch max-[650px]:[&_.button]:w-full">
          {onCancel && (
            <button
              className="button button-secondary"
              onClick={onCancel}
              type="button"
            >
              Cancel edit
            </button>
          )}
          <button className="button" disabled={pending} type="submit">
            {pending
              ? record
                ? "Saving changes..."
                : "Adding achievement..."
              : record
                ? "Save achievement changes"
                : "Add achievement"}
          </button>
        </div>
      </fieldset>
    </form>
  );
}

export function StudentProfileExamSection({
  achievements,
  businessToday,
  exams,
}: OptionalSectionsProps) {
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const clearNotice = useCallback(() => setNotice(""), []);

  if (exams.kind === "unavailable") {
    return (
      <section
        aria-labelledby="student-exams-heading"
        className={`${sectionPlainClass} grid gap-6 motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:[scroll-behavior:auto]`}
      >
        <header>
          <h2 id="student-exams-heading">Study Abroad Exams</h2>
        </header>
        <div className="optional-record-unavailable" role="alert">
          <p>Study Abroad Exam information is temporarily unavailable.</p>
          <Link className="button button-secondary" href="/student/profile">
            Try again
          </Link>
        </div>
      </section>
    );
  }

  const editingRecord =
    exams.records.find((record) => record.id === editingId) ?? null;
  const achievementPage =
    achievements.kind === "ready" ? achievements.page : 1;
  const handleEditSuccess = (message: string) => {
    setNotice(message);
    setEditingId(null);
  };

  return (
    <section
      aria-labelledby="student-exams-heading"
      className={`${sectionPlainClass} grid gap-6 motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:[scroll-behavior:auto]`}
    >
      <header>
        <h2 id="student-exams-heading">Study Abroad Exams</h2>
        <p>
          Track planned, booked, and completed exam attempts. This section does
          not change your essential profile completion.
        </p>
      </header>

      {notice && (
        <p className="form-success optional-record-notice" role="status">
          {notice}
        </p>
      )}

      <div
        aria-labelledby="add-exam-heading"
        className="optional-record-editor"
      >
        <h3 id="add-exam-heading">Add an exam attempt</h3>
        <ExamForm
          businessToday={businessToday}
          onActionStart={clearNotice}
          onSuccess={setNotice}
        />
      </div>

      <div
        aria-labelledby="saved-exams-heading"
        className="optional-record-history"
      >
        <div className="optional-record-history-heading">
          <div>
            <h3 id="saved-exams-heading">Saved exam attempts</h3>
            <p>
              {exams.totalCount}{" "}
              {exams.totalCount === 1 ? "record" : "records"}
            </p>
          </div>
        </div>

        {exams.records.length === 0 ? (
          <p className="optional-record-empty" role="status">
            No Study Abroad Exam attempts have been added.
          </p>
        ) : (
          <div className="optional-record-table-wrapper">
            <table className="optional-record-table">
              <caption>
                Student-reported Study Abroad Exam attempts
              </caption>
              <thead>
                <tr>
                  <th scope="col">Exam</th>
                  <th scope="col">Status</th>
                  <th scope="col">Attempt</th>
                  <th scope="col">Completed</th>
                  <th scope="col">Score</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {exams.records.map((record) => {
                  const examName =
                    record.exam_name === "other" &&
                    record.custom_exam_name
                      ? record.custom_exam_name
                      : getStudentExamNameLabel(record.exam_name);
                  return (
                    <tr key={record.id}>
                      <th data-label="Exam" scope="row">
                        {examName}
                      </th>
                      <td data-label="Status">
                        {getStudentExamStatusLabel(record.exam_status)}
                      </td>
                      <td data-label="Attempt">{record.attempt_number}</td>
                      <td data-label="Completed">
                        {formatOptionalProfileDate(record.completed_date)}
                      </td>
                      <td data-label="Score">
                        {record.score ??
                          OPTIONAL_PROFILE_RECORD_FALLBACKS.notAdded}
                      </td>
                      <td data-label="Actions">
                        <div className="optional-record-row-actions">
                          <button
                            aria-label={`Edit ${examName} attempt ${record.attempt_number}`}
                            className="profile-text-button"
                            onClick={() => setEditingId(record.id)}
                            type="button"
                          >
                            Edit
                          </button>
                          <DeleteRecordControl
                            accessibleLabel={`Delete ${examName} attempt ${record.attempt_number}`}
                            action={deleteStudentTestScore}
                            confirmation={`Delete ${examName} attempt ${record.attempt_number}?`}
                            label="Delete exam attempt"
                            onActionStart={clearNotice}
                            onSuccess={setNotice}
                            recordId={record.id}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {editingRecord && (
          <div
            aria-labelledby="edit-exam-heading"
            className="optional-record-editor optional-record-edit"
          >
            <h3 id="edit-exam-heading">
              Edit{" "}
              {editingRecord.exam_name === "other" &&
              editingRecord.custom_exam_name
                ? editingRecord.custom_exam_name
                : getStudentExamNameLabel(editingRecord.exam_name)}{" "}
              attempt {editingRecord.attempt_number}
            </h3>
            <ExamForm
              businessToday={businessToday}
              key={`${editingRecord.id}-${editingRecord.updated_at}`}
              onActionStart={clearNotice}
              onCancel={() => setEditingId(null)}
              onSuccess={handleEditSuccess}
              record={editingRecord}
            />
          </div>
        )}

        <RecordPagination
          achievementPage={achievementPage}
          examPage={exams.page}
          page={exams.page}
          pageCount={exams.pageCount}
          section="exams"
        />
      </div>
    </section>
  );
}

export function StudentProfileAchievementSection({
  achievementDocuments,
  achievements,
  businessToday,
  exams,
}: OptionalSectionsProps) {
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const clearNotice = useCallback(() => setNotice(""), []);

  if (achievements.kind === "unavailable") {
    return (
      <section
        aria-labelledby="student-achievements-heading"
        className={`${sectionPlainClass} grid gap-6 motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:[scroll-behavior:auto]`}
      >
        <header>
          <h2 id="student-achievements-heading">Achievements</h2>
        </header>
        <div className="optional-record-unavailable" role="alert">
          <p>Achievement information is temporarily unavailable.</p>
          <Link className="button button-secondary" href="/student/profile">
            Try again
          </Link>
        </div>
      </section>
    );
  }

  const editingRecord =
    achievements.records.find((record) => record.id === editingId) ?? null;
  const examPage = exams.kind === "ready" ? exams.page : 1;
  const handleEditSuccess = (message: string) => {
    setNotice(message);
    setEditingId(null);
  };

  return (
    <section
      aria-labelledby="student-achievements-heading"
      className={`${sectionPlainClass} grid gap-6 motion-reduce:[&_*]:transition-none motion-reduce:[&_*]:[scroll-behavior:auto]`}
    >
      <header>
        <h2 id="student-achievements-heading">Achievements</h2>
        <p>
          Add student-reported experience and accomplishments. This optional
          section does not change counseling readiness.
        </p>
      </header>

      {notice && (
        <p className="form-success optional-record-notice" role="status">
          {notice}
        </p>
      )}

      <div
        aria-labelledby="add-achievement-heading"
        className="optional-record-editor"
      >
        <h3 id="add-achievement-heading">Add an achievement</h3>
        <AchievementForm
          businessToday={businessToday}
          onActionStart={clearNotice}
          onSuccess={setNotice}
        />
      </div>

      <div
        aria-labelledby="saved-achievements-heading"
        className="optional-record-history"
      >
        <div className="optional-record-history-heading">
          <div>
            <h3 id="saved-achievements-heading">Saved achievements</h3>
            <p>
              {achievements.totalCount}{" "}
              {achievements.totalCount === 1 ? "record" : "records"}
            </p>
          </div>
        </div>

        {achievements.records.length === 0 ? (
          <p className="optional-record-empty" role="status">
            No achievements have been added.
          </p>
        ) : (
          <div className="optional-record-table-wrapper">
            <table className="optional-record-table">
              <caption>Student-reported achievements</caption>
              <thead>
                <tr>
                  <th scope="col">Achievement</th>
                  <th scope="col">Category</th>
                  <th scope="col">Organization</th>
                  <th scope="col">Date</th>
                  <th scope="col">Evidence / Certificates</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {achievements.records.map((record) => (
                  <tr key={record.id}>
                    <th data-label="Achievement" scope="row">
                      {record.title}
                    </th>
                    <td data-label="Category">
                      {getStudentAchievementTypeLabel(
                        record.achievement_type,
                      )}
                    </td>
                    <td data-label="Organization">
                      {record.organization ??
                        OPTIONAL_PROFILE_RECORD_FALLBACKS.notAdded}
                    </td>
                    <td data-label="Date">
                      {formatOptionalProfileDate(
                        record.achievement_date,
                      )}
                    </td>
                    <td data-label="Evidence / Certificates">
                      <StudentAchievementEvidence
                        achievementId={record.id}
                        achievementTitle={record.title}
                        documents={
                          achievementDocuments?.filter(
                            (document) => document.achievementId === record.id,
                          ) ?? []
                        }
                        unavailable={achievementDocuments === null}
                      />
                    </td>
                    <td data-label="Actions">
                      <div className="optional-record-row-actions">
                        <button
                          aria-label={`Edit achievement ${record.title}`}
                          className="profile-text-button"
                          onClick={() => setEditingId(record.id)}
                          type="button"
                        >
                          Edit
                        </button>
                        <DeleteRecordControl
                          accessibleLabel={`Delete achievement ${record.title}`}
                          action={deleteStudentAchievement}
                          confirmation={`Delete achievement ${record.title}?`}
                          label="Delete achievement"
                          onActionStart={clearNotice}
                          onSuccess={setNotice}
                          recordId={record.id}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {editingRecord && (
          <div
            aria-labelledby="edit-achievement-heading"
            className="optional-record-editor optional-record-edit"
          >
            <h3 id="edit-achievement-heading">
              Edit {editingRecord.title}
            </h3>
            <AchievementForm
              businessToday={businessToday}
              key={`${editingRecord.id}-${editingRecord.updated_at}`}
              onActionStart={clearNotice}
              onCancel={() => setEditingId(null)}
              onSuccess={handleEditSuccess}
              record={editingRecord}
            />
          </div>
        )}

        <RecordPagination
          achievementPage={achievements.page}
          examPage={examPage}
          page={achievements.page}
          pageCount={achievements.pageCount}
          section="achievements"
        />
      </div>
    </section>
  );
}

export function StudentProfileOptionalSections(
  props: OptionalSectionsProps,
) {
  return (
    <div className="mt-5 grid gap-5">
      <StudentProfileAchievementSection {...props} />
      <StudentProfileExamSection {...props} />
    </div>
  );
}
