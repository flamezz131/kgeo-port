"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { reassignPrimaryCounselorAction } from "@/app/actions/director-student-assignment-actions";
import {
  DIRECTOR_ASSIGNMENT_REASON_MAX_LENGTH,
  initialDirectorAssignmentActionState,
  type DirectorAssignmentActionState,
  type DirectorAssignmentStudent,
} from "@/lib/director/student-assignment";
import type { DirectorAssignmentManagementData } from "@/lib/director/student-assignment-server";

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatDate(value: string | null): string {
  if (!value) return "Not assigned";
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date unavailable"
    : dateFormatter.format(date);
}

function displayStudentName(student: DirectorAssignmentStudent): string {
  return student.fullName ?? "Name unavailable";
}

export function DirectorStudentAssignmentManagement({
  students,
  data,
}: {
  students: DirectorAssignmentStudent[];
  data: DirectorAssignmentManagementData;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [selectedStudentId, setSelectedStudentId] = useState(
    students[0]?.studentId ?? "",
  );
  const [feedback, setFeedback] = useState<DirectorAssignmentActionState>(
    initialDirectorAssignmentActionState,
  );
  const [isPending, startTransition] = useTransition();

  const selectedStudent =
    students.find((student) => student.studentId === selectedStudentId) ??
    students[0];

  const eligibleCounselors = useMemo(
    () =>
      data.status === "ready" && selectedStudent
        ? data.counselors.filter(
            (counselor) =>
              counselor.counselorId !== selectedStudent.currentCounselorId,
          )
        : [],
    [data, selectedStudent],
  );

  if (!selectedStudent) return null;

  if (data.status === "unavailable") {
    return (
      <section
        aria-labelledby="director-assignment-heading"
        className="director-assignment-panel"
      >
        <header>
          <div>
            <span className="eyebrow">Primary Counselor control</span>
            <h2 id="director-assignment-heading">Student assignment</h2>
          </div>
        </header>
        <div className="director-state director-state-error" role="alert">
          <h3>Assignment controls are temporarily unavailable</h3>
          <p>Refresh the page before attempting an assignment change.</p>
        </div>
      </section>
    );
  }

  const history = data.history.filter(
    (entry) => entry.studentId === selectedStudent.studentId,
  );

  function openDialog() {
    formRef.current?.reset();
    setFeedback(initialDirectorAssignmentActionState);
    dialogRef.current?.showModal();
  }

  function submitAssignment(formData: FormData) {
    setFeedback(initialDirectorAssignmentActionState);
    startTransition(async () => {
      const result = await reassignPrimaryCounselorAction(formData);
      setFeedback(result);
      if (result.status === "success") {
        dialogRef.current?.close();
        router.refresh();
      }
    });
  }

  return (
    <section
      aria-labelledby="director-assignment-heading"
      className="director-assignment-panel"
    >
      <header className="director-assignment-heading">
        <div>
          <span className="eyebrow">Primary Counselor control</span>
          <h2 id="director-assignment-heading">Student assignment</h2>
          <p>
            Reassign established case ownership without changing
            consultation-specific FCFS ownership.
          </p>
        </div>
        <label>
          Select Student
          <select
            onChange={(event) => {
              setSelectedStudentId(event.target.value);
              setFeedback(initialDirectorAssignmentActionState);
            }}
            value={selectedStudent.studentId}
          >
            {students.map((student) => (
              <option key={student.studentId} value={student.studentId}>
                {displayStudentName(student)}
              </option>
            ))}
          </select>
        </label>
      </header>

      <div className="director-assignment-summary">
        <dl>
          <div>
            <dt>Student Name</dt>
            <dd>{displayStudentName(selectedStudent)}</dd>
          </div>
          <div>
            <dt>Programme</dt>
            <dd>
              {selectedStudent.programme ?? "Not recorded"}
              {selectedStudent.department
                ? ` · ${selectedStudent.department}`
                : ""}
            </dd>
          </div>
          <div>
            <dt>Current Primary Counselor</dt>
            <dd>{selectedStudent.currentCounselorFullName ?? "Unassigned"}</dd>
          </div>
          <div>
            <dt>Assignment Since</dt>
            <dd>{formatDate(selectedStudent.assignedAt)}</dd>
          </div>
          <div>
            <dt>Current Status</dt>
            <dd>
              <span
                className={`director-status-badge ${
                  selectedStudent.isActive ? "is-active" : "is-inactive"
                }`}
              >
                {selectedStudent.isActive ? "Active Student" : "Inactive Student"}
              </span>
              <span className="director-assignment-status-detail">
                {selectedStudent.currentCounselorId
                  ? "Primary Counselor assigned"
                  : "Awaiting assignment through the FCFS consultation queue"}
              </span>
            </dd>
          </div>
        </dl>

        {selectedStudent.currentCounselorId && (
          <button
            className="button button-primary"
            disabled={eligibleCounselors.length === 0}
            onClick={openDialog}
            type="button"
          >
            Reassign Counselor
          </button>
        )}
      </div>

      {!selectedStudent.currentCounselorId ? (
        <p className="director-assignment-notice" role="status">
          No Primary Counselor assigned. Awaiting assignment through the FCFS
          consultation queue.
        </p>
      ) : eligibleCounselors.length === 0 && (
        <p className="director-assignment-notice" role="status">
          No other approved active Counselor is available for this Student.
        </p>
      )}

      {feedback.status !== "idle" && (
        <p
          className={feedback.status === "success" ? "form-success" : "form-error"}
          role={feedback.status === "error" ? "alert" : "status"}
        >
          {feedback.message}
        </p>
      )}

      <section aria-labelledby="director-assignment-history-heading">
        <h3 id="director-assignment-history-heading">Recent assignment history</h3>
        {history.length === 0 ? (
          <p className="director-assignment-empty">No assignment history yet.</p>
        ) : (
          <ol className="director-assignment-history">
            {history.map((entry) => (
              <li key={`${entry.assignedAt}-${entry.counselorFullName}`}>
                <div>
                  <strong>{entry.counselorFullName}</strong>
                  <span>
                    {formatDate(entry.assignedAt)} · {entry.endedAt ? `Ended ${formatDate(entry.endedAt)}` : "Current"}
                  </span>
                </div>
                <p>{entry.reason ?? "Initial FCFS assignment"}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <dialog
        aria-labelledby="director-assignment-dialog-title"
        className="director-assignment-dialog"
        ref={dialogRef}
      >
        <form action={submitAssignment} ref={formRef}>
          <header>
            <span className="eyebrow">Director-controlled ownership</span>
            <h2 id="director-assignment-dialog-title">
              Reassign Primary Counselor
            </h2>
            <p>
              {displayStudentName(selectedStudent)} will move immediately to the
              selected Counselor&apos;s active case list.
            </p>
          </header>

          <input name="studentId" type="hidden" value={selectedStudent.studentId} />

          <label>
            New Counselor
            <select
              aria-describedby={
                feedback.fieldErrors?.counselorId
                  ? "director-assignment-counselor-error"
                  : undefined
              }
              aria-invalid={Boolean(feedback.fieldErrors?.counselorId)}
              defaultValue=""
              name="counselorId"
              required
            >
              <option disabled value="">
                Select an approved active Counselor
              </option>
              {eligibleCounselors.map((counselor) => (
                <option key={counselor.counselorId} value={counselor.counselorId}>
                  {counselor.fullName} ({counselor.username})
                </option>
              ))}
            </select>
            {feedback.fieldErrors?.counselorId && (
              <span
                className="form-error"
                id="director-assignment-counselor-error"
              >
                {feedback.fieldErrors.counselorId}
              </span>
            )}
          </label>

          <label>
            Short reason
            <textarea
              aria-describedby={
                feedback.fieldErrors?.reason
                  ? "director-assignment-reason-error"
                  : undefined
              }
              aria-invalid={Boolean(feedback.fieldErrors?.reason)}
              maxLength={DIRECTOR_ASSIGNMENT_REASON_MAX_LENGTH}
              name="reason"
              placeholder="Brief operational reason for this assignment"
              required
              rows={4}
            />
            {feedback.fieldErrors?.reason && (
              <span
                className="form-error"
                id="director-assignment-reason-error"
              >
                {feedback.fieldErrors.reason}
              </span>
            )}
          </label>

          <div aria-live="polite">
            {feedback.status === "error" &&
              (!feedback.fieldErrors ||
                Object.keys(feedback.fieldErrors).length === 0) && (
              <p className="form-error" role="alert">
                {feedback.message}
              </p>
            )}
          </div>

          <div className="director-assignment-dialog-actions">
            <button
              className="button button-light"
              disabled={isPending}
              onClick={() => dialogRef.current?.close()}
              type="button"
            >
              Cancel
            </button>
            <button
              className="button button-primary"
              disabled={isPending}
              type="submit"
            >
              {isPending ? "Saving…" : "Confirm Reassignment"}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
