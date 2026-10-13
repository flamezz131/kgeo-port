"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type MouseEvent,
  type SyntheticEvent,
} from "react";
import {
  archiveUniversityApplicationAction,
  changeUniversityApplicationStatusAction,
  createUniversityApplicationAction,
  loadUniversityApplicationHistoryAction,
  setPrimaryUniversityApplicationAction,
  updateUniversityApplicationDetailsAction,
} from "@/app/actions/counselor-university-application-actions";
import { FieldError } from "@/components/forms/field-error";
import { UniversityApplicationDocuments } from "@/components/counselor/university-application-documents";
import {
  formatUniversityApplicationDate,
  formatUniversityApplicationTimestamp,
  UNIVERSITY_APPLICATION_HISTORY_ERROR,
  UNIVERSITY_APPLICATION_LIST_ERROR,
  type CounselorUniversityApplication,
  type CounselorUniversityApplicationEvent,
  type CounselorUniversityApplicationHistoryResult,
  type CounselorUniversityApplicationListResult,
} from "@/lib/counselor/university-application-management";
import {
  UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS,
  UNIVERSITY_APPLICATION_DEGREE_LEVELS,
  UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS,
  UNIVERSITY_APPLICATION_INTAKE_TERMS,
  UNIVERSITY_APPLICATION_INTAKE_YEAR_MAX,
  UNIVERSITY_APPLICATION_INTAKE_YEAR_MIN,
  UNIVERSITY_APPLICATION_NAME_MAX_LENGTH,
  UNIVERSITY_APPLICATION_PORTAL_URL_MAX_LENGTH,
  UNIVERSITY_APPLICATION_REASON_MAX_LENGTH,
  UNIVERSITY_APPLICATION_REFERENCE_MAX_LENGTH,
  UNIVERSITY_APPLICATION_STATUS_DEFINITIONS,
  UNIVERSITY_APPLICATION_STATUS_LABELS,
  UNIVERSITY_APPLICATION_STATUS_TRANSITIONS,
  UNIVERSITY_APPLICATION_TERMINAL_STATUSES,
} from "@/lib/counselor/university-applications";
import {
  initialUniversityApplicationActionState,
  type UniversityApplicationActionState,
} from "@/lib/counselor/university-application-submission";
import type { UniversityApplicationStatus } from "@/types";

type MutationDialog =
  | "create"
  | "details"
  | "status"
  | "primary"
  | "archive";

type MutationPhase =
  | "idle"
  | "editing"
  | "submitting"
  | "succeeded"
  | "failed";

type HistoryState =
  | { phase: "idle" | "loading" | "failed"; page: number }
  | {
      phase: "ready";
      page: number;
      result: Extract<
        CounselorUniversityApplicationHistoryResult,
        { kind: "ready" }
      >;
    };

const dialogContent = {
  create: {
    title: "Add university application",
    description:
      "Record the university and programme being considered. New applications begin in Planning status.",
    submit: "Add application",
    pending: "Adding application\u2026",
  },
  details: {
    title: "Edit application details",
    description:
      "Update only the approved university, programme, intake, reference, portal and deadline fields.",
    submit: "Save application details",
    pending: "Saving application details\u2026",
  },
  status: {
    title: "Change application status",
    description:
      "Choose one permitted next status. PostgreSQL remains authoritative for the transition.",
    submit: "Change application status",
    pending: "Changing application status\u2026",
  },
  primary: {
    title: "Set this as the primary application?",
    description:
      "The current primary application, if any, will be changed automatically. Both changes remain in institutional audit history.",
    submit: "Set as primary",
    pending: "Changing primary application\u2026",
  },
  archive: {
    title: "Archive this university application?",
    description:
      "The application will be removed from the normal active list, but the record and complete history will be retained. This action does not withdraw or close the application automatically.",
    submit: "Archive application",
    pending: "Archiving application\u2026",
  },
} as const;

const unexpectedMutationMessages = {
  create: "University application could not be created.",
  details: "Application details could not be updated.",
  status: "Application status could not be changed.",
  primary: "Primary application could not be changed.",
  archive: "University application could not be archived.",
} as const satisfies Record<MutationDialog, string>;

function ActionFeedback({
  state,
  feedbackRef,
}: {
  state: UniversityApplicationActionState;
  feedbackRef: React.RefObject<HTMLParagraphElement | null>;
}) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      className={state.status === "success" ? "form-success" : "form-error"}
      ref={feedbackRef}
      role={state.status === "success" ? "status" : "alert"}
      tabIndex={-1}
    >
      {state.message}
    </p>
  );
}

function ApplicationDetailsFields({
  application,
  errors,
  firstFieldRef,
  prefix,
}: {
  application: CounselorUniversityApplication | null;
  errors?: Record<string, string[]>;
  firstFieldRef: React.RefObject<HTMLInputElement | null>;
  prefix: string;
}) {
  return (
    <div className="university-application-field-grid">
      <div className="field">
        <label htmlFor={`${prefix}-country-code`}>
          Country code <span aria-hidden="true">*</span>
        </label>
        <input
          aria-describedby={`${prefix}-country-code-hint ${prefix}-country-code-error`}
          aria-invalid={Boolean(errors?.countryCode)}
          autoCapitalize="characters"
          defaultValue={application?.countryCode ?? ""}
          id={`${prefix}-country-code`}
          maxLength={2}
          name="countryCode"
          onInput={(event) => {
            event.currentTarget.value =
              event.currentTarget.value.toUpperCase();
          }}
          placeholder="AU"
          ref={firstFieldRef}
          required
        />
        <span className="field-hint" id={`${prefix}-country-code-hint`}>
          Enter a two-letter code such as AU, US, GB, CA or DE.
        </span>
        <FieldError
          id={`${prefix}-country-code-error`}
          messages={errors?.countryCode}
        />
      </div>

      <div className="field">
        <label htmlFor={`${prefix}-degree-level`}>
          Degree level <span aria-hidden="true">*</span>
        </label>
        <select
          aria-describedby={`${prefix}-degree-level-error`}
          aria-invalid={Boolean(errors?.degreeLevel)}
          defaultValue={application?.degreeLevel ?? "masters"}
          id={`${prefix}-degree-level`}
          name="degreeLevel"
          required
        >
          {UNIVERSITY_APPLICATION_DEGREE_LEVELS.map((value) => (
            <option key={value} value={value}>
              {UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS[value]}
            </option>
          ))}
        </select>
        <FieldError
          id={`${prefix}-degree-level-error`}
          messages={errors?.degreeLevel}
        />
      </div>

      <div className="field university-application-field-wide">
        <label htmlFor={`${prefix}-university-name`}>
          University name <span aria-hidden="true">*</span>
        </label>
        <input
          aria-describedby={`${prefix}-university-name-error`}
          aria-invalid={Boolean(errors?.universityName)}
          defaultValue={application?.universityName ?? ""}
          id={`${prefix}-university-name`}
          maxLength={UNIVERSITY_APPLICATION_NAME_MAX_LENGTH}
          name="universityName"
          required
        />
        <FieldError
          id={`${prefix}-university-name-error`}
          messages={errors?.universityName}
        />
      </div>

      <div className="field university-application-field-wide">
        <label htmlFor={`${prefix}-programme-name`}>
          Programme name <span aria-hidden="true">*</span>
        </label>
        <input
          aria-describedby={`${prefix}-programme-name-error`}
          aria-invalid={Boolean(errors?.programmeName)}
          defaultValue={application?.programmeName ?? ""}
          id={`${prefix}-programme-name`}
          maxLength={UNIVERSITY_APPLICATION_NAME_MAX_LENGTH}
          name="programmeName"
          required
        />
        <FieldError
          id={`${prefix}-programme-name-error`}
          messages={errors?.programmeName}
        />
      </div>

      <div className="field">
        <label htmlFor={`${prefix}-intake-term`}>
          Intake term <span aria-hidden="true">*</span>
        </label>
        <select
          aria-describedby={`${prefix}-intake-term-error`}
          aria-invalid={Boolean(errors?.intakeTerm)}
          defaultValue={application?.intakeTerm ?? "fall"}
          id={`${prefix}-intake-term`}
          name="intakeTerm"
          required
        >
          {UNIVERSITY_APPLICATION_INTAKE_TERMS.map((value) => (
            <option key={value} value={value}>
              {UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS[value]}
            </option>
          ))}
        </select>
        <FieldError
          id={`${prefix}-intake-term-error`}
          messages={errors?.intakeTerm}
        />
      </div>

      <div className="field">
        <label htmlFor={`${prefix}-intake-year`}>
          Intake year <span aria-hidden="true">*</span>
        </label>
        <input
          aria-describedby={`${prefix}-intake-year-error`}
          aria-invalid={Boolean(errors?.intakeYear)}
          defaultValue={application?.intakeYear ?? ""}
          id={`${prefix}-intake-year`}
          max={UNIVERSITY_APPLICATION_INTAKE_YEAR_MAX}
          min={UNIVERSITY_APPLICATION_INTAKE_YEAR_MIN}
          name="intakeYear"
          required
          type="number"
        />
        <FieldError
          id={`${prefix}-intake-year-error`}
          messages={errors?.intakeYear}
        />
      </div>

      <div className="field">
        <label htmlFor={`${prefix}-reference`}>
          Application reference{" "}
          <span className="field-requirement">(optional)</span>
        </label>
        <input
          aria-describedby={`${prefix}-reference-hint ${prefix}-reference-error`}
          aria-invalid={Boolean(errors?.applicationReference)}
          defaultValue={application?.applicationReference ?? ""}
          id={`${prefix}-reference`}
          maxLength={UNIVERSITY_APPLICATION_REFERENCE_MAX_LENGTH}
          name="applicationReference"
        />
        <span className="field-hint" id={`${prefix}-reference-hint`}>
          Leave blank until the university issues a reference.
        </span>
        <FieldError
          id={`${prefix}-reference-error`}
          messages={errors?.applicationReference}
        />
      </div>

      <div className="field">
        <label htmlFor={`${prefix}-deadline`}>
          Submission deadline{" "}
          <span className="field-requirement">(optional)</span>
        </label>
        <input
          aria-describedby={`${prefix}-deadline-hint ${prefix}-deadline-error`}
          aria-invalid={Boolean(errors?.submissionDeadline)}
          defaultValue={application?.submissionDeadline ?? ""}
          id={`${prefix}-deadline`}
          name="submissionDeadline"
          type="date"
        />
        <span className="field-hint" id={`${prefix}-deadline-hint`}>
          Leave blank when the deadline is not yet known.
        </span>
        <FieldError
          id={`${prefix}-deadline-error`}
          messages={errors?.submissionDeadline}
        />
      </div>

      <div className="field university-application-field-wide">
        <label htmlFor={`${prefix}-portal`}>
          Application portal URL{" "}
          <span className="field-requirement">(optional)</span>
        </label>
        <input
          aria-describedby={`${prefix}-portal-hint ${prefix}-portal-error`}
          aria-invalid={Boolean(errors?.portalUrl)}
          defaultValue={application?.portalUrl ?? ""}
          id={`${prefix}-portal`}
          maxLength={UNIVERSITY_APPLICATION_PORTAL_URL_MAX_LENGTH}
          name="portalUrl"
          placeholder="https://apply.example.edu"
          type="url"
        />
        <span className="field-hint" id={`${prefix}-portal-hint`}>
          Use the university&apos;s official HTTPS application portal. Leave
          this blank when the portal is not yet known.
        </span>
        <FieldError
          id={`${prefix}-portal-error`}
          messages={errors?.portalUrl}
        />
      </div>
    </div>
  );
}

function ReasonField({
  errors,
  label,
  name,
  prefix,
}: {
  errors?: Record<string, string[]>;
  label: string;
  name: "changeReason" | "archiveReason";
  prefix: string;
}) {
  return (
    <div className="field">
      <label htmlFor={`${prefix}-reason`}>
        {label} <span aria-hidden="true">*</span>
      </label>
      <textarea
        aria-describedby={`${prefix}-reason-hint ${prefix}-reason-error`}
        aria-invalid={Boolean(errors?.[name])}
        id={`${prefix}-reason`}
        maxLength={UNIVERSITY_APPLICATION_REASON_MAX_LENGTH}
        name={name}
        required
        rows={4}
      />
      <span className="field-hint" id={`${prefix}-reason-hint`}>
        Required for the retained audit history, up to 500 characters. Plain
        text only.
      </span>
      <FieldError
        id={`${prefix}-reason-error`}
        messages={errors?.[name]}
      />
    </div>
  );
}

function StatusFields({
  application,
  errors,
  newStatus,
  onStatusChange,
  prefix,
}: {
  application: CounselorUniversityApplication;
  errors?: Record<string, string[]>;
  newStatus: UniversityApplicationStatus;
  onStatusChange: (status: UniversityApplicationStatus) => void;
  prefix: string;
}) {
  const nextStatuses =
    UNIVERSITY_APPLICATION_STATUS_TRANSITIONS[application.currentStatus];
  const terminal = UNIVERSITY_APPLICATION_TERMINAL_STATUSES.some(
    (status) => status === newStatus,
  );
  return (
    <>
      <div className="university-application-field-grid">
        <div className="field">
          <label htmlFor={`${prefix}-current-status`}>Current status</label>
          <input
            id={`${prefix}-current-status`}
            readOnly
            value={application.currentStatusLabel}
          />
        </div>
        <div className="field">
          <label htmlFor={`${prefix}-new-status`}>
            New status <span aria-hidden="true">*</span>
          </label>
          <select
            aria-describedby={`${prefix}-new-status-description ${prefix}-new-status-error`}
            aria-invalid={Boolean(errors?.newStatus)}
            id={`${prefix}-new-status`}
            name="newStatus"
            onChange={(event) =>
              onStatusChange(
                event.target.value as UniversityApplicationStatus,
              )
            }
            required
            value={newStatus}
          >
            {nextStatuses.map((status) => (
              <option key={status} value={status}>
                {UNIVERSITY_APPLICATION_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <span
            className="field-hint"
            id={`${prefix}-new-status-description`}
          >
            {UNIVERSITY_APPLICATION_STATUS_DEFINITIONS[newStatus]}
          </span>
          <FieldError
            id={`${prefix}-new-status-error`}
            messages={errors?.newStatus}
          />
        </div>
      </div>
      {terminal && (
        <p className="university-application-terminal-warning">
          {newStatus === "withdrawn"
            ? "This will end normal status updates for this application."
            : "This will close the application record. Normal status updates cannot continue."}
        </p>
      )}
      <ReasonField
        errors={errors}
        label="Change reason"
        name="changeReason"
        prefix={prefix}
      />
    </>
  );
}

function ApplicationCard({
  application,
  canManageCase,
  mutationDisabled,
  onAction,
  onHistory,
  studentId,
}: {
  application: CounselorUniversityApplication;
  canManageCase: boolean;
  mutationDisabled: boolean;
  studentId: string;
  onAction: (
    dialog: Exclude<MutationDialog, "create">,
    application: CounselorUniversityApplication,
    trigger: HTMLButtonElement,
  ) => void;
  onHistory: (
    application: CounselorUniversityApplication,
    trigger: HTMLButtonElement,
  ) => void;
}) {
  const terminal = UNIVERSITY_APPLICATION_TERMINAL_STATUSES.some(
    (status) => status === application.currentStatus,
  );
  return (
    <li>
      <article
        className={`university-application-card${
          application.isArchived ? " university-application-archived" : ""
        }`}
      >
        <header>
          <div>
            <div className="university-application-badges">
              {application.isPrimary && (
                <span className="university-application-badge-primary">
                  Primary application
                </span>
              )}
              {application.isArchived && (
                <span className="university-application-badge-archived">
                  Archived
                </span>
              )}
            </div>
            <h3>{application.universityName}</h3>
            <p>{application.programmeName}</p>
          </div>
          <span className="student-360-status">
            {application.currentStatusLabel}
          </span>
        </header>

        <dl className="university-application-details">
          <div>
            <dt>Country and degree</dt>
            <dd>
              {application.countryCode} {"\u00b7"}{" "}
              {application.degreeLevelLabel}
            </dd>
          </div>
          <div>
            <dt>Intake</dt>
            <dd>
              {application.intakeLabel} {application.intakeYear}
            </dd>
          </div>
          <div>
            <dt>
              {application.isArchived ? "Status at archive" : "Status"}
            </dt>
            <dd>{application.currentStatusLabel}</dd>
          </div>
          <div>
            <dt>Deadline</dt>
            <dd>
              {formatUniversityApplicationDate(
                application.submissionDeadline,
              )}
            </dd>
          </div>
          <div>
            <dt>Reference</dt>
            <dd>{application.applicationReference ?? "Not added"}</dd>
          </div>
          <div>
            <dt>Portal</dt>
            <dd>
              {application.portalUrl ? (
                <a
                  href={application.portalUrl}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Open application portal{" "}
                  <span className="university-application-new-tab">
                    (opens in a new tab)
                  </span>
                </a>
              ) : (
                "Not added"
              )}
            </dd>
          </div>
          {application.submittedAt && (
            <div>
              <dt>Submitted</dt>
              <dd>
                {formatUniversityApplicationTimestamp(
                  application.submittedAt,
                )}
              </dd>
            </div>
          )}
          <div>
            <dt>Last updated</dt>
            <dd>
              {formatUniversityApplicationTimestamp(application.updatedAt)}
            </dd>
          </div>
        </dl>

        <UniversityApplicationDocuments
          applicationId={application.id}
          applicationLabel={`${application.universityName}, ${application.programmeName}`}
          canManageCase={canManageCase}
          isArchived={application.isArchived}
        />

        <div className="university-application-card-actions">
          <Link
            className="button button-secondary button-small"
            href={`/counselor/students/${studentId}/applications/${application.id}`}
          >
            View Application
          </Link>
          <button
            aria-label={`View application history for ${application.universityName}, ${application.programmeName}`}
            className="button button-secondary button-small"
            disabled={mutationDisabled}
            onClick={(event) => onHistory(application, event.currentTarget)}
            type="button"
          >
            View history
          </button>
          {canManageCase && !application.isArchived && (
            <>
              <button
                aria-label={`Edit application details for ${application.universityName}, ${application.programmeName}`}
                className="button button-secondary button-small"
                disabled={mutationDisabled}
                onClick={(event) =>
                  onAction("details", application, event.currentTarget)
                }
                type="button"
              >
                Edit details
              </button>
              {!terminal && (
                <button
                  aria-label={`Change application status for ${application.universityName}, ${application.programmeName}`}
                  className="button button-secondary button-small"
                  disabled={mutationDisabled}
                  onClick={(event) =>
                    onAction("status", application, event.currentTarget)
                  }
                  type="button"
                >
                  Change status
                </button>
              )}
              {!terminal && !application.isPrimary && (
                <button
                  aria-label={`Set ${application.universityName}, ${application.programmeName} as primary application`}
                  className="button button-secondary button-small"
                  disabled={mutationDisabled}
                  onClick={(event) =>
                    onAction("primary", application, event.currentTarget)
                  }
                  type="button"
                >
                  Set primary
                </button>
              )}
              <button
                aria-label={`Archive application for ${application.universityName}, ${application.programmeName}`}
                className="button button-danger button-small"
                disabled={mutationDisabled}
                onClick={(event) =>
                  onAction("archive", application, event.currentTarget)
                }
                type="button"
              >
                Archive
              </button>
            </>
          )}
        </div>
      </article>
    </li>
  );
}

function getStatusEventSummary(
  events: CounselorUniversityApplicationEvent[],
  index: number,
): string {
  const event = events[index];
  const previous = events[index + 1];
  if (
    event.eventType === "status_changed" &&
    previous &&
    previous.versionNumber === event.versionNumber - 1
  ) {
    return `${previous.statusLabel} \u2192 ${event.statusLabel}`;
  }
  return `Status changed to ${event.statusLabel}`;
}

function HistoryEvent({
  event,
  events,
  index,
}: {
  event: CounselorUniversityApplicationEvent;
  events: CounselorUniversityApplicationEvent[];
  index: number;
}) {
  let summary: string;
  switch (event.eventType) {
    case "created":
      summary = `Created in ${event.statusLabel}`;
      break;
    case "status_changed":
      summary = getStatusEventSummary(events, index);
      break;
    case "primary_changed":
      summary = event.isPrimary
        ? "Marked as the student's primary application"
        : "No longer the student's primary application";
      break;
    case "archived":
      summary = `Archived with status retained as ${event.statusLabel}`;
      break;
    case "details_updated":
      summary = "Application details were updated";
      break;
  }
  return (
    <li>
      <article className="university-application-history-event">
        <header>
          <div>
            <span className="eyebrow">{event.eventLabel}</span>
            <h4>{summary}</h4>
          </div>
          <time dateTime={event.changedAt}>
            {formatUniversityApplicationTimestamp(event.changedAt)}
          </time>
        </header>
        <dl>
          <div>
            <dt>University and programme</dt>
            <dd>
              {event.universityName}
              <br />
              {event.programmeName}
            </dd>
          </div>
          <div>
            <dt>Intake</dt>
            <dd>
              {event.countryCode} {"\u00b7"} {event.degreeLevelLabel}
              <br />
              {event.intakeLabel} {event.intakeYear}
            </dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{event.versionNumber}</dd>
          </div>
          <div>
            <dt>Record state</dt>
            <dd>
              {event.isArchived
                ? "Archived"
                : event.isPrimary
                  ? "Active primary"
                  : "Active"}
            </dd>
          </div>
          {event.changeReason && (
            <div className="university-application-history-reason">
              <dt>Reason</dt>
              <dd>{event.changeReason}</dd>
            </div>
          )}
        </dl>
      </article>
    </li>
  );
}

export function UniversityApplicationsSection({
  canManageCase,
  result,
  studentId,
}: {
  canManageCase: boolean;
  result: CounselorUniversityApplicationListResult;
  studentId: string;
}) {
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [dialog, setDialog] = useState<MutationDialog | null>(null);
  const [selected, setSelected] =
    useState<CounselorUniversityApplication | null>(null);
  const [phase, setPhase] = useState<MutationPhase>("idle");
  const [actionState, setActionState] =
    useState<UniversityApplicationActionState>(
      initialUniversityApplicationActionState,
    );
  const [newStatus, setNewStatus] =
    useState<UniversityApplicationStatus>("planning");
  const [transitionPending, startTransition] = useTransition();
  const mutationDialogRef = useRef<HTMLDialogElement>(null);
  const mutationHeadingRef = useRef<HTMLHeadingElement>(null);
  const mutationTriggerRef = useRef<HTMLButtonElement | null>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const mutationInFlightRef = useRef(false);

  const [historyApplication, setHistoryApplication] =
    useState<CounselorUniversityApplication | null>(null);
  const [historyState, setHistoryState] = useState<HistoryState>({
    phase: "idle",
    page: 1,
  });
  const historyDialogRef = useRef<HTMLDialogElement>(null);
  const historyHeadingRef = useRef<HTMLHeadingElement>(null);
  const historyTriggerRef = useRef<HTMLButtonElement | null>(null);
  const historyRequestRef = useRef(0);

  const signature = useMemo(
    () =>
      result.kind === "ready"
        ? result.applications
            .map(
              (application) =>
                `${application.id}:${application.versionNumber}`,
            )
            .join("|")
        : "unavailable",
    [result],
  );
  const previousSignatureRef = useRef(signature);

  useEffect(() => {
    if (
      phase === "succeeded" &&
      previousSignatureRef.current !== signature
    ) {
      mutationDialogRef.current?.close();
      setDialog(null);
      setSelected(null);
      setPhase("idle");
      setActionState(initialUniversityApplicationActionState);
      mutationInFlightRef.current = false;
      requestAnimationFrame(() => mutationTriggerRef.current?.focus());
    }
    previousSignatureRef.current = signature;
  }, [phase, signature]);

  useEffect(() => {
    if (phase !== "editing") return;
    const modal = mutationDialogRef.current;
    if (modal && !modal.open) modal.showModal();
    if (firstFieldRef.current) {
      firstFieldRef.current.focus();
    } else {
      mutationHeadingRef.current?.focus();
    }
  }, [dialog, phase]);

  useEffect(() => {
    if (phase === "failed" || phase === "succeeded") {
      feedbackRef.current?.focus();
    }
  }, [actionState.message, phase]);

  function openMutation(
    nextDialog: MutationDialog,
    application: CounselorUniversityApplication | null,
    trigger: HTMLButtonElement,
  ) {
    if (mutationInFlightRef.current || phase === "succeeded") return;
    mutationTriggerRef.current = trigger;
    setDialog(nextDialog);
    setSelected(application);
    setActionState(initialUniversityApplicationActionState);
    const nextStatuses = application
      ? UNIVERSITY_APPLICATION_STATUS_TRANSITIONS[
          application.currentStatus
        ]
      : [];
    setNewStatus(nextStatuses[0] ?? "planning");
    setPhase("editing");
  }

  function closeMutation() {
    if (
      phase === "submitting" ||
      phase === "succeeded" ||
      transitionPending
    ) {
      return;
    }
    mutationDialogRef.current?.close();
    setDialog(null);
    setSelected(null);
    setPhase("idle");
    setActionState(initialUniversityApplicationActionState);
    requestAnimationFrame(() => mutationTriggerRef.current?.focus());
  }

  function handleMutationCancel(
    event: SyntheticEvent<HTMLDialogElement>,
  ) {
    event.preventDefault();
    closeMutation();
  }

  async function runMutation(
    activeDialog: MutationDialog,
    formData: FormData,
  ) {
    switch (activeDialog) {
      case "create":
        return createUniversityApplicationAction(formData);
      case "details":
        return updateUniversityApplicationDetailsAction(formData);
      case "status":
        return changeUniversityApplicationStatusAction(formData);
      case "primary":
        return setPrimaryUniversityApplicationAction(formData);
      case "archive":
        return archiveUniversityApplicationAction(formData);
    }
  }

  function handleMutationSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !dialog ||
      mutationInFlightRef.current ||
      phase === "submitting" ||
      phase === "succeeded" ||
      transitionPending
    ) {
      return;
    }
    mutationInFlightRef.current = true;
    setPhase("submitting");
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      let nextState: UniversityApplicationActionState;
      try {
        nextState = await runMutation(dialog, formData);
      } catch {
        nextState = {
          status: "error",
          operation: dialog,
          message: unexpectedMutationMessages[dialog],
        };
      }
      setActionState(nextState);
      if (nextState.status === "success") {
        setPhase("succeeded");
        router.refresh();
      } else {
        mutationInFlightRef.current = false;
        setPhase("failed");
      }
    });
  }

  async function loadHistoryPage(
    application: CounselorUniversityApplication,
    page: number,
  ) {
    const request = historyRequestRef.current + 1;
    historyRequestRef.current = request;
    setHistoryState({ phase: "loading", page });
    const formData = new FormData();
    formData.set("studentId", studentId);
    formData.set("applicationId", application.id);
    formData.set("historyPage", String(page));
    let history: CounselorUniversityApplicationHistoryResult;
    try {
      history = await loadUniversityApplicationHistoryAction(formData);
    } catch {
      history = { kind: "unavailable" };
    }
    if (historyRequestRef.current !== request) return;
    if (history.kind !== "ready" || history.applicationId !== application.id) {
      setHistoryState({ phase: "failed", page });
      return;
    }
    setHistoryState({ phase: "ready", page, result: history });
  }

  function openHistory(
    application: CounselorUniversityApplication,
    trigger: HTMLButtonElement,
  ) {
    historyTriggerRef.current = trigger;
    setHistoryApplication(application);
    setHistoryState({ phase: "loading", page: 1 });
    const modal = historyDialogRef.current;
    if (modal && !modal.open) modal.showModal();
    requestAnimationFrame(() => historyHeadingRef.current?.focus());
    void loadHistoryPage(application, 1);
  }

  function closeHistory() {
    historyRequestRef.current += 1;
    historyDialogRef.current?.close();
    setHistoryApplication(null);
    setHistoryState({ phase: "idle", page: 1 });
    requestAnimationFrame(() => historyTriggerRef.current?.focus());
  }

  function handleHistoryCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    closeHistory();
  }

  if (result.kind === "unavailable") {
    return (
      <section
        aria-labelledby="student-360-university-applications"
        className="student-360-section university-applications-section"
      >
        <header className="student-360-section-heading">
          <h2 id="student-360-university-applications">
            University applications
          </h2>
        </header>
        <p className="form-error" role="alert">
          {UNIVERSITY_APPLICATION_LIST_ERROR}
        </p>
      </section>
    );
  }

  const active = result.applications.filter(
    (application) => !application.isArchived,
  );
  const archived = result.applications.filter(
    (application) => application.isArchived,
  );
  const submitting =
    phase === "submitting" || transitionPending || phase === "succeeded";
  const prefix = `university-application-${dialog ?? "none"}`;
  const content = dialog ? dialogContent[dialog] : null;

  return (
    <section
      aria-labelledby="student-360-university-applications"
      className="student-360-section university-applications-section"
    >
      <header className="student-360-section-heading university-applications-heading">
        <div>
          <h2 id="student-360-university-applications">
            University applications
          </h2>
          <p>
            Application statuses are tracked separately from the
            student&apos;s overall official counseling progression.
          </p>
        </div>
        {canManageCase && (
          <button
            className="button button-small"
            disabled={phase !== "idle"}
            onClick={(event: MouseEvent<HTMLButtonElement>) =>
              openMutation("create", null, event.currentTarget)
            }
            type="button"
          >
            Add application
          </button>
        )}
      </header>

      <dl className="university-application-summary">
        <div>
          <dt>Total applications</dt>
          <dd>{result.totalCount}</dd>
        </div>
        <div>
          <dt>Active applications</dt>
          <dd>{result.activeCount}</dd>
        </div>
        <div>
          <dt>Archived applications</dt>
          <dd>{result.archivedCount}</dd>
        </div>
        <div>
          <dt>Primary application</dt>
          <dd>{result.primaryApplicationName ?? "Not selected"}</dd>
        </div>
      </dl>

      {active.length === 0 ? (
        <div className="student-360-empty university-application-empty">
          <strong>
            {result.totalCount === 0
              ? "No university applications have been added."
              : "No active university applications are available."}
          </strong>
          <p>
            {result.totalCount === 0
              ? "Add the first application when university and programme planning begins."
              : "Archived applications remain available through the separate history list below."}
          </p>
          {canManageCase && (
            <button
              className="button button-small"
              disabled={phase !== "idle"}
              onClick={(event) =>
                openMutation("create", null, event.currentTarget)
              }
              type="button"
            >
              Add application
            </button>
          )}
        </div>
      ) : (
        <ul className="university-application-list">
          {active.map((application) => (
            <ApplicationCard
              application={application}
              canManageCase={canManageCase}
              key={application.id}
              mutationDisabled={phase !== "idle"}
              onAction={openMutation}
              onHistory={openHistory}
              studentId={studentId}
            />
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <div className="university-application-archived-group">
          <button
            aria-controls="university-application-archived-list"
            aria-expanded={showArchived}
            className="button button-secondary button-small"
            onClick={() => setShowArchived((current) => !current)}
            type="button"
          >
            {showArchived ? "Hide" : "Show"} archived applications (
            {archived.length})
          </button>
          {showArchived && (
            <ul
              className="university-application-list"
              id="university-application-archived-list"
            >
              {archived.map((application) => (
                <ApplicationCard
                  application={application}
                  canManageCase={canManageCase}
                  key={application.id}
                  mutationDisabled={phase !== "idle"}
                  onAction={openMutation}
                  onHistory={openHistory}
                  studentId={studentId}
                />
              ))}
            </ul>
          )}
        </div>
      )}

      <dialog
        aria-describedby={`${prefix}-description`}
        aria-labelledby={`${prefix}-title`}
        aria-modal="true"
        className="university-application-dialog"
        onCancel={handleMutationCancel}
        ref={mutationDialogRef}
      >
        {dialog && content && (
          <form
            aria-busy={submitting}
            className="university-application-form form-stack"
            onSubmit={handleMutationSubmit}
          >
            <input name="studentId" type="hidden" value={studentId} />
            {selected && (
              <input
                name="applicationId"
                type="hidden"
                value={selected.id}
              />
            )}
            <div>
              <h3
                id={`${prefix}-title`}
                ref={mutationHeadingRef}
                tabIndex={-1}
              >
                {content.title}
              </h3>
              <p id={`${prefix}-description`}>{content.description}</p>
            </div>
            <fieldset disabled={submitting}>
              {(dialog === "create" || dialog === "details") && (
                <>
                  <ApplicationDetailsFields
                    application={selected}
                    errors={actionState.errors}
                    firstFieldRef={firstFieldRef}
                    prefix={prefix}
                  />
                  {dialog === "details" && (
                    <ReasonField
                      errors={actionState.errors}
                      label="Change reason"
                      name="changeReason"
                      prefix={prefix}
                    />
                  )}
                </>
              )}
              {dialog === "status" && selected && (
                <StatusFields
                  application={selected}
                  errors={actionState.errors}
                  newStatus={newStatus}
                  onStatusChange={setNewStatus}
                  prefix={prefix}
                />
              )}
              {dialog === "primary" && (
                <ReasonField
                  errors={actionState.errors}
                  label="Change reason"
                  name="changeReason"
                  prefix={prefix}
                />
              )}
              {dialog === "archive" && (
                <ReasonField
                  errors={actionState.errors}
                  label="Archive reason"
                  name="archiveReason"
                  prefix={prefix}
                />
              )}
            </fieldset>

            <ActionFeedback
              feedbackRef={feedbackRef}
              state={actionState}
            />
            <div className="university-application-dialog-actions">
              <button
                className={`button button-small${
                  dialog === "archive" ? " button-danger" : ""
                }`}
                disabled={submitting}
                type="submit"
              >
                {submitting
                  ? phase === "succeeded"
                    ? "Refreshing trusted applications\u2026"
                    : content.pending
                  : content.submit}
              </button>
              <button
                className="button button-secondary button-small"
                disabled={submitting}
                onClick={closeMutation}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </dialog>

      <dialog
        aria-describedby="university-application-history-description"
        aria-labelledby="university-application-history-title"
        aria-modal="true"
        className="university-application-dialog university-application-history-dialog"
        onCancel={handleHistoryCancel}
        ref={historyDialogRef}
      >
        <div className="university-application-history-content">
          <header>
            <h3
              id="university-application-history-title"
              ref={historyHeadingRef}
              tabIndex={-1}
            >
              {historyApplication
                ? `${historyApplication.universityName} application history`
                : "Application history"}
            </h3>
            <p id="university-application-history-description">
              Complete post-mutation snapshots are shown without counselor
              actor identifiers.
            </p>
          </header>

          {historyState.phase === "loading" && (
            <p aria-live="polite" role="status">
              Loading application history{"\u2026"}
            </p>
          )}
          {historyState.phase === "failed" && (
            <p className="form-error" role="alert">
              {UNIVERSITY_APPLICATION_HISTORY_ERROR}
            </p>
          )}
          {historyState.phase === "ready" && (
            <>
              <ul className="university-application-history-list">
                {historyState.result.events.map((event, index) => (
                  <HistoryEvent
                    event={event}
                    events={historyState.result.events}
                    index={index}
                    key={event.versionNumber}
                  />
                ))}
              </ul>
              <nav
                aria-label="Application history pagination"
                className="university-application-history-pagination"
              >
                <button
                  className="button button-secondary button-small"
                  disabled={!historyState.result.hasPreviousPage}
                  onClick={() => {
                    if (historyApplication) {
                      void loadHistoryPage(
                        historyApplication,
                        historyState.page - 1,
                      );
                    }
                  }}
                  type="button"
                >
                  Previous
                </button>
                <span aria-current="page">
                  Page {historyState.page}
                </span>
                <button
                  className="button button-secondary button-small"
                  disabled={!historyState.result.hasNextPage}
                  onClick={() => {
                    if (historyApplication) {
                      void loadHistoryPage(
                        historyApplication,
                        historyState.page + 1,
                      );
                    }
                  }}
                  type="button"
                >
                  Next
                </button>
              </nav>
            </>
          )}
          <div className="university-application-dialog-actions">
            <button
              className="button button-secondary button-small"
              onClick={closeHistory}
              type="button"
            >
              Close history
            </button>
          </div>
        </div>
      </dialog>
    </section>
  );
}
