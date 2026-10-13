import Link from "next/link";
import { OfficialProgressionActionForm } from "@/components/counselor/official-progression-actions";
import { ProgressionCorrectionControl } from "@/components/counselor/progression-correction-control";
import { ProgressionEvidenceControls } from "@/components/counselor/progression-evidence-controls";
import {
  COUNSELING_PROGRESSION_CORRECTION_TYPE_LABELS,
  COUNSELING_PROGRESSION_STAGE_LABELS,
  COUNSELING_PROGRESSION_STATE_LABELS,
  buildOfficialProgressionUrl,
  getOfficialProgressionPercentage,
  type OfficialProgressionEvent,
  type OfficialProgressionLoadResult,
  type OfficialProgressionReadyResult,
  type Student360ApprovedPages,
} from "@/lib/counselor/progression";
import {
  PROGRESSION_CORRECTION_EVIDENCE_BLOCK_MESSAGE,
  buildOfficialProgressionHistoryPresentation,
  type OfficialProgressionEventPresentation,
} from "@/lib/counselor/progression-correction";
import type { ProgressionEvidenceLoadResult } from "@/lib/counselor/progression-evidence";
import { formatCounselorPrivateDate } from "@/lib/counselor/private-records";
import { formatStudent360Timestamp } from "@/lib/counselor/student-profile";

function ProgressBar({ percentage }: { percentage: number }) {
  return (
    <div className="official-progression-progress">
      <strong>Official journey progress: {percentage}%</strong>
      <div
        aria-label="Official counseling journey progress"
        aria-valuemax={100}
        aria-valuemin={0}
        aria-valuenow={percentage}
        className="official-progression-progress-track"
        role="progressbar"
      >
        <span style={{ width: `${percentage}%` }} />
      </div>
      <small>
        Approximate institutional progress, not an academic score or a
        guarantee of admission or visa approval.
      </small>
    </div>
  );
}

function eventTitle(event: OfficialProgressionEvent): string {
  if (event.previous_stage === null) {
    return "Official progression started.";
  }
  if (event.previous_stage !== event.new_stage) {
    return "Official stage changed.";
  }
  if (event.new_state === "on_hold") {
    return "Progression put on hold.";
  }
  if (event.new_state === "active") {
    return "Progression resumed.";
  }
  return "Official progression completed.";
}

function ProgressionEvent({
  canManageCase,
  presentation,
  progressionEvidence,
  studentId,
}: {
  canManageCase: boolean;
  presentation: OfficialProgressionEventPresentation;
  progressionEvidence: ProgressionEvidenceLoadResult;
  studentId: string;
}) {
  const {
    correction,
    correctionAction,
    event,
    evidenceBlock,
    isLatestEffectiveEvent,
  } = presentation;
  const stageChanged =
    event.previous_stage !== null &&
    event.previous_stage !== event.new_stage;
  const stateChanged =
    event.previous_state !== null &&
    event.previous_state !== event.new_state;

  return (
    <li>
      <article className="official-progression-event">
        <header>
          <div>
            <h4>{eventTitle(event)}</h4>
          </div>
          <time dateTime={event.changed_at}>
            {formatStudent360Timestamp(event.changed_at)}
          </time>
        </header>

        <dl>
          {event.previous_stage === null ? (
            <>
              <div>
                <dt>Stage</dt>
                <dd>
                  {COUNSELING_PROGRESSION_STAGE_LABELS[event.new_stage]}
                </dd>
              </div>
              <div>
                <dt>State</dt>
                <dd>
                  {COUNSELING_PROGRESSION_STATE_LABELS[event.new_state]}
                </dd>
              </div>
            </>
          ) : (
            <>
              <div>
                <dt>{stageChanged ? "Stage change" : "Stage remained"}</dt>
                <dd>
                  {stageChanged
                    ? `${COUNSELING_PROGRESSION_STAGE_LABELS[event.previous_stage]} → ${COUNSELING_PROGRESSION_STAGE_LABELS[event.new_stage]}`
                    : COUNSELING_PROGRESSION_STAGE_LABELS[
                        event.new_stage
                      ]}
                </dd>
              </div>
              <div>
                <dt>{stateChanged ? "State change" : "State remained"}</dt>
                <dd>
                  {stateChanged && event.previous_state
                    ? `${COUNSELING_PROGRESSION_STATE_LABELS[event.previous_state]} → ${COUNSELING_PROGRESSION_STATE_LABELS[event.new_state]}`
                    : COUNSELING_PROGRESSION_STATE_LABELS[
                        event.new_state
                      ]}
                </dd>
              </div>
            </>
          )}
          {event.change_reason && (
            <div className="official-progression-event-reason">
              <dt>Reason</dt>
              <dd>{event.change_reason}</dd>
            </div>
          )}
        </dl>
        <p>Updated by an authorized counselor.</p>
        {correction && (
          <section
            aria-label={
              COUNSELING_PROGRESSION_CORRECTION_TYPE_LABELS[
                correction.correctionType
              ]
            }
            className="progression-correction-audit"
          >
            <strong>
              {
                COUNSELING_PROGRESSION_CORRECTION_TYPE_LABELS[
                  correction.correctionType
                ]
              }
            </strong>
            <p>
              This update is retained for audit and no longer determines
              the current official progression.
            </p>
            <dl>
              <div>
                <dt>Correction reason</dt>
                <dd>{correction.correctionReason}</dd>
              </div>
              <div>
                <dt>Corrected</dt>
                <dd>
                  {formatStudent360Timestamp(correction.correctedAt)}
                </dd>
              </div>
            </dl>
          </section>
        )}
        {progressionEvidence.kind === "unavailable" ? (
          <section
            aria-labelledby={`progression-evidence-${event.id}`}
            className="progression-evidence progression-evidence-unavailable"
          >
            <h5 id={`progression-evidence-${event.id}`}>
              Supporting evidence
            </h5>
            <p className="form-error" role="alert">
              Supporting evidence is temporarily unavailable.
            </p>
          </section>
        ) : progressionEvidence.evidenceByEvent[event.id] ? (
          <ProgressionEvidenceControls
            canManageCase={canManageCase}
            evidence={progressionEvidence.evidenceByEvent[event.id]}
            progressionEventId={event.id}
            studentId={studentId}
          />
        ) : (
          <section
            aria-labelledby={`progression-evidence-${event.id}`}
            className="progression-evidence progression-evidence-unavailable"
          >
            <h5 id={`progression-evidence-${event.id}`}>
              Supporting evidence
            </h5>
            <p className="form-error" role="alert">
              Supporting evidence is temporarily unavailable.
            </p>
          </section>
        )}
        {isLatestEffectiveEvent && evidenceBlock && (
          <div
            className="progression-correction-blocked"
            role="status"
          >
            <strong>Progression correction blocked</strong>
            <p>{PROGRESSION_CORRECTION_EVIDENCE_BLOCK_MESSAGE}</p>
            {evidenceBlock === "pending" && (
              <p>
                The pending upload reservation must be finalized or allowed
                to expire. It cannot be cancelled from this page.
              </p>
            )}
          </div>
        )}
        {correctionAction && (
          canManageCase ? (
            <ProgressionCorrectionControl
              action={correctionAction}
              eventId={event.id}
              eventLabel={`${eventTitle(event)} ${formatStudent360Timestamp(event.changed_at)}`}
              isCompletion={event.new_state === "completed"}
              studentId={studentId}
            />
          ) : null
        )}
      </article>
    </li>
  );
}

function ProgressionPagination({
  eventCount,
  page,
  pageCount,
  pages,
  studentId,
}: {
  eventCount: number;
  page: number;
  pageCount: number;
  pages: Student360ApprovedPages;
  studentId: string;
}) {
  if (pageCount <= 1) return null;
  const url = (progressionPage: number) =>
    buildOfficialProgressionUrl(studentId, {
      ...pages,
      progressionPage,
    });

  return (
    <nav
      aria-label="Official progression history pagination"
      className="official-progression-pagination"
    >
      <p>
        <span aria-current="page">
          Page {page} of {pageCount}
        </span>
        {" · "}
        {eventCount} events
      </p>
      <div>
        {page > 1 ? (
          <>
            <Link href={url(1)}>First</Link>
            <Link href={url(page - 1)} rel="prev">
              Previous
            </Link>
          </>
        ) : (
          <>
            <span aria-disabled="true">First</span>
            <span aria-disabled="true">Previous</span>
          </>
        )}
        {page < pageCount ? (
          <>
            <Link href={url(page + 1)} rel="next">
              Next
            </Link>
            <Link href={url(pageCount)}>Final</Link>
          </>
        ) : (
          <>
            <span aria-disabled="true">Next</span>
            <span aria-disabled="true">Final</span>
          </>
        )}
      </div>
    </nav>
  );
}

function ProgressionHistory({
  canManageCase,
  pages,
  progression,
  progressionEvidence,
  studentId,
}: {
  canManageCase: boolean;
  pages: Student360ApprovedPages;
  progression: OfficialProgressionReadyResult;
  progressionEvidence: ProgressionEvidenceLoadResult;
  studentId: string;
}) {
  const presentation = buildOfficialProgressionHistoryPresentation(
    progression,
    progressionEvidence,
  );

  return (
    <section
      aria-labelledby="official-progression-history-heading"
      className="official-progression-history"
    >
      <h3 id="official-progression-history-heading">
        Progression history
      </h3>
      {!presentation.correctionMetadataAvailable &&
        progression.events.length > 0 && (
          <p className="form-error" role="alert">
            Progression correction controls are temporarily unavailable.
          </p>
        )}
      {presentation.events.length === 0 ? (
        <p className="student-360-empty" role="status">
          History will appear after official progression is started.
        </p>
      ) : (
        <ol className="official-progression-event-list">
          {presentation.events.map((eventPresentation) => (
            <ProgressionEvent
              canManageCase={canManageCase}
              key={eventPresentation.event.id}
              presentation={eventPresentation}
              progressionEvidence={progressionEvidence}
              studentId={studentId}
            />
          ))}
        </ol>
      )}
      <ProgressionPagination
        eventCount={progression.eventCount}
        page={progression.page}
        pageCount={progression.pageCount}
        pages={pages}
        studentId={studentId}
      />
    </section>
  );
}

export function OfficialProgressionSection({
  canManageCase,
  nextAction = null,
  nextActionDueDate = null,
  pages,
  progression,
  progressionEvidence,
  studentId,
}: {
  canManageCase: boolean;
  nextAction?: string | null;
  nextActionDueDate?: string | null;
  pages: Student360ApprovedPages;
  progression: OfficialProgressionLoadResult;
  progressionEvidence: ProgressionEvidenceLoadResult;
  studentId: string;
}) {
  if (progression.kind === "out_of_range") return null;

  return (
    <section
      aria-labelledby="official-progression-heading"
      className="student-360-section official-progression-section"
      id="official-progression"
    >
      <header className="student-360-section-heading">
        <h2 id="official-progression-heading">Journey Progress</h2>
        <p>
          Official Counseling Progression for the institution-managed journey.
          This is separate from the student&apos;s self-reported planning stage.
        </p>
      </header>

      {progression.kind === "unavailable" ? (
        <p className="form-error" role="alert">
          Official progression is temporarily unavailable.
        </p>
      ) : progression.current === null ? (
        <>
          <div className="official-progression-summary">
            <dl>
              <div>
                <dt>Official stage</dt>
                <dd>Yet to begin</dd>
              </div>
              <div>
                <dt>Workflow state</dt>
                <dd>Yet to begin</dd>
              </div>
              <div>
                <dt>Next action</dt>
                <dd>
                  {nextAction ?? "No pending follow-up recorded"}
                  {nextActionDueDate
                    ? ` · due ${formatCounselorPrivateDate(nextActionDueDate)}`
                    : ""}
                </dd>
              </div>
            </dl>
            <ProgressBar percentage={0} />
          </div>
          <p className="student-360-empty" role="status">
            {progression.events.length > 0
              ? "Official progression has been reset and is ready for a fresh start."
              : "Official progression has not been started."}
          </p>
          {canManageCase && (
            <div className="official-progression-actions">
              <OfficialProgressionActionForm
                operation="initialize"
                studentId={studentId}
              />
            </div>
          )}
          <ProgressionHistory
            canManageCase={canManageCase}
            pages={pages}
            progression={progression}
            progressionEvidence={progressionEvidence}
            studentId={studentId}
          />
        </>
      ) : (
        <>
          <div className="official-progression-summary">
            <dl>
              <div>
                <dt>Official stage</dt>
                <dd>
                  {
                    COUNSELING_PROGRESSION_STAGE_LABELS[
                      progression.current.current_stage
                    ]
                  }
                </dd>
              </div>
              <div>
                <dt>Workflow state</dt>
                <dd>
                  <span
                    className={`student-360-status official-progression-state-${progression.current.workflow_state}`}
                  >
                    {
                      COUNSELING_PROGRESSION_STATE_LABELS[
                        progression.current.workflow_state
                      ]
                    }
                  </span>
                </dd>
              </div>
              <div>
                <dt>Next action</dt>
                <dd>
                  {nextAction ?? "No pending follow-up recorded"}
                  {nextActionDueDate
                    ? ` · due ${formatCounselorPrivateDate(nextActionDueDate)}`
                    : ""}
                </dd>
              </div>
              <div>
                <dt>Stage started</dt>
                <dd>
                  {formatStudent360Timestamp(
                    progression.current.stage_started_at,
                  )}
                </dd>
              </div>
              <div>
                <dt>Last changed</dt>
                <dd>
                  {formatStudent360Timestamp(
                    progression.current.last_changed_at,
                  )}
                </dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>
                  {formatStudent360Timestamp(
                    progression.current.created_at,
                  )}
                </dd>
              </div>
              <div>
                <dt>Updated by</dt>
                <dd>An authorized counselor</dd>
              </div>
              {progression.current.workflow_state === "completed" && (
                <div>
                  <dt>Completion date</dt>
                  <dd>
                    {formatStudent360Timestamp(
                      progression.current.last_changed_at,
                    )}
                  </dd>
                </div>
              )}
            </dl>
            <ProgressBar
              percentage={getOfficialProgressionPercentage(
                progression.current.current_stage,
                progression.current.workflow_state,
              )}
            />
          </div>

          {canManageCase && progression.current.workflow_state === "active" && (
            <div className="official-progression-actions">
              <OfficialProgressionActionForm
                currentStage={progression.current.current_stage}
                operation="change_stage"
                studentId={studentId}
              />
              <OfficialProgressionActionForm
                operation="pause"
                studentId={studentId}
              />
              <div className="official-progression-completion-control">
                <p>
                  Completed progression cannot be reopened in the current
                  workflow.
                </p>
                <OfficialProgressionActionForm
                  operation="complete"
                  studentId={studentId}
                />
              </div>
            </div>
          )}

          {canManageCase && progression.current.workflow_state === "on_hold" && (
            <>
              <p className="official-progression-guidance">
                Resume the progression before changing its official stage.
              </p>
              <div className="official-progression-actions">
                <OfficialProgressionActionForm
                  operation="resume"
                  studentId={studentId}
                />
                <div className="official-progression-completion-control">
                  <p>
                    Completed progression cannot be reopened in the current
                    workflow.
                  </p>
                  <OfficialProgressionActionForm
                    operation="complete"
                    studentId={studentId}
                  />
                </div>
              </div>
            </>
          )}

          {progression.current.workflow_state === "completed" && (
            <div
              className="official-progression-completed"
              role="status"
            >
              <strong>Counseling journey completed</strong>
              <p>
                This official progression is final in the current K-GEO
                workflow.
              </p>
            </div>
          )}

          <ProgressionHistory
            canManageCase={canManageCase}
            pages={pages}
            progression={progression}
            progressionEvidence={progressionEvidence}
            studentId={studentId}
          />
        </>
      )}
    </section>
  );
}
