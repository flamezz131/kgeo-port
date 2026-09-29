import Link from "next/link";
import {
  ConsultationNextWorkLinks,
  ConsultationOutcomeControls,
} from "@/components/counselor/consultation-outcome-controls";
import { CounselorPrivateRecords } from "@/components/counselor/counselor-private-records";
import { OfficialProgressionSection } from "@/components/counselor/official-progression-section";
import { UniversityApplicationsSection } from "@/components/counselor/university-applications-section";
import {
  getCounselorCaseAccessMessage,
  type CounselorCaseAccessResult,
} from "@/lib/counselor/case-ownership";
import {
  formatConsultationDate,
  formatConsultationTimeRange,
  LEGACY_CONSULTATION_MESSAGE,
} from "@/lib/consultations/booking";
import {
  getConsultationLifecycleLabel,
  getConsultationLifecycleState,
} from "@/lib/consultations/lifecycle";
import {
  STUDENT_360_BASE_PATH,
  STUDENT_360_FALLBACKS,
  STUDENT_360_HISTORY_PAGE_SIZE,
  STUDENT_360_SECTION_LABELS,
  STUDENT_360_SECTION_LIMIT,
  formatStudent360Boolean,
  formatStudent360Date,
  formatStudent360Number,
  formatStudent360TargetIntake,
  formatStudent360Timestamp,
  getStudent360AcademicPreferenceLabel,
  getStudent360AchievementTypeLabel,
  getStudent360ExamName,
  getStudent360ExamStatusLabel,
  getStudent360InterestLabel,
  getStudent360DomainLabel,
  getStudent360FundingMethodLabel,
  getStudent360GlobalTrackProgramLabel,
  getStudent360PlanningStageLabel,
  getStudent360ProfileStateLabel,
  getStudent360StudyAreaLabel,
  getStudent360StudyModeLabel,
  getStudent360StudyPathwayLabel,
  isLegacyStudentConsultation,
  type CounselorStudentConsultation,
  type Student360ReadyResult,
} from "@/lib/counselor/student-profile";
import type {
  OfficialProgressionLoadResult,
  Student360ApprovedPages,
} from "@/lib/counselor/progression";
import type { ProgressionEvidenceLoadResult } from "@/lib/counselor/progression-evidence";
import type { CounselorUniversityApplicationListResult } from "@/lib/counselor/university-application-management";

type DetailValue = {
  label: string;
  value: string;
};

function DefinitionGrid({ values }: { values: DetailValue[] }) {
  return (
    <dl className="student-360-definition-grid">
      {values.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SectionHeading({
  id,
  kicker,
  title,
}: {
  id: string;
  kicker: string;
  title: string;
}) {
  return (
    <header className="student-360-section-heading">
      <span className="eyebrow">{kicker}</span>
      <h2 id={id}>{title}</h2>
    </header>
  );
}

function TagList({
  emptyLabel,
  items,
}: {
  emptyLabel: string;
  items: string[];
}) {
  if (items.length === 0) return <span>{emptyLabel}</span>;
  return (
    <ul className="student-360-tag-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function getHistoryUrl(studentId: string, page: number) {
  const base = `${STUDENT_360_BASE_PATH}/${studentId}`;
  return page > 1 ? `${base}?historyPage=${page}` : base;
}

function ConsultationCard({
  consultation,
  currentCounselorId,
  now,
}: {
  consultation: CounselorStudentConsultation;
  currentCounselorId: string;
  now: Date;
}) {
  const legacy = isLegacyStudentConsultation(consultation);
  const lifecycle = legacy
    ? null
    : getConsultationLifecycleState(
        {
          status: consultation.status,
          consultationDate: consultation.consultation_date,
          slotStart: consultation.slot_start,
          slotEnd: consultation.slot_end,
        },
        now,
      );
  const lifecycleLabel = legacy
    ? "Legacy request"
    : getConsultationLifecycleLabel(lifecycle ?? "pending");

  return (
    <article className="student-360-history-card">
      <header>
        <div>
          <span className="card-number">{consultation.request_number}</span>
          <h3>{consultation.student_name}</h3>
        </div>
        <span
          className={`student-360-status student-360-status-${
            legacy ? "legacy" : lifecycle
          }`}
        >
          {lifecycleLabel}
        </span>
      </header>

      <DefinitionGrid
        values={[
          {
            label: "Historical student-name snapshot",
            value: consultation.student_name,
          },
          { label: "Roll number", value: consultation.roll_number },
          {
            label: "Course and department",
            value: `${consultation.course} · ${consultation.department}`,
          },
          {
            label: "Appointment date",
            value: consultation.consultation_date
              ? formatConsultationDate(consultation.consultation_date)
              : LEGACY_CONSULTATION_MESSAGE,
          },
          {
            label: "Appointment time",
            value:
              consultation.slot_start && consultation.slot_end
                ? formatConsultationTimeRange(
                    consultation.slot_start,
                    consultation.slot_end,
                  )
                : STUDENT_360_FALLBACKS.notAvailable,
          },
          {
            label: "Submitted",
            value: formatStudent360Timestamp(consultation.submitted_at),
          },
        ]}
      />

      {lifecycle === "outcome_required" &&
        consultation.assigned_counselor_id === currentCounselorId && (
        <ConsultationOutcomeControls consultationId={consultation.id} />
      )}
      {(consultation.status === "completed" ||
        consultation.status === "no_show") &&
        consultation.assigned_counselor_id === currentCounselorId && (
          <ConsultationNextWorkLinks studentId={consultation.student_id} />
        )}
    </article>
  );
}

export function CounselorStudentConsultationHistory({
  currentCounselorId,
  result,
}: {
  currentCounselorId: string;
  result: Student360ReadyResult;
}) {
  const current = result.consultations.filter(
    (consultation) => !isLegacyStudentConsultation(consultation),
  );
  const legacy = result.consultations.filter(isLegacyStudentConsultation);
  const now = new Date();

  return (
    <section
      aria-labelledby="student-360-consultations"
      className="student-360-section"
    >
      <SectionHeading
        id="student-360-consultations"
        kicker="Read-only operational history"
        title={STUDENT_360_SECTION_LABELS.consultations}
      />

      {result.consultations.length === 0 ? (
        <p className="student-360-empty" role="status">
          No consultation history is available for this student.
        </p>
      ) : (
        <div className="student-360-history-groups">
          {current.length > 0 && (
            <section aria-labelledby="student-360-appointments">
              <h3 id="student-360-appointments">Appointments</h3>
              <div className="student-360-card-list">
                {current.map((consultation) => (
                  <ConsultationCard
                    consultation={consultation}
                    currentCounselorId={currentCounselorId}
                    key={consultation.id}
                    now={now}
                  />
                ))}
              </div>
            </section>
          )}

          {legacy.length > 0 && (
            <section aria-labelledby="student-360-legacy">
              <h3 id="student-360-legacy">Legacy requests</h3>
              <p className="muted">
                These retained requests did not include an appointment slot.
              </p>
              <div className="student-360-card-list">
                {legacy.map((consultation) => (
                  <ConsultationCard
                    consultation={consultation}
                    currentCounselorId={currentCounselorId}
                    key={consultation.id}
                    now={now}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {result.consultationCount > STUDENT_360_HISTORY_PAGE_SIZE && (
        <nav
          aria-label="Consultation history pagination"
          className="student-360-history-pagination"
        >
          <p>
            <span aria-current="page">
              Page {result.historyPage} of {result.historyPageCount}
            </span>
            {" · "}
            {result.consultationCount} consultations
          </p>
          <div>
            {result.historyPage > 1 ? (
              <Link
                href={getHistoryUrl(
                  result.identity.student_id,
                  result.historyPage - 1,
                )}
                rel="prev"
              >
                Previous
              </Link>
            ) : (
              <span aria-disabled="true">Previous</span>
            )}
            {result.historyPage < result.historyPageCount ? (
              <Link
                href={getHistoryUrl(
                  result.identity.student_id,
                  result.historyPage + 1,
                )}
                rel="next"
              >
                Next
              </Link>
            ) : (
              <span aria-disabled="true">Next</span>
            )}
          </div>
        </nav>
      )}
    </section>
  );
}

export function CounselorStudentProfileView({
  caseAccess,
  currentCounselorId,
  pages,
  progression,
  progressionEvidence,
  result,
  universityApplications,
}: {
  caseAccess: CounselorCaseAccessResult;
  currentCounselorId: string;
  pages: Student360ApprovedPages;
  progression: OfficialProgressionLoadResult;
  progressionEvidence: ProgressionEvidenceLoadResult;
  result: Student360ReadyResult;
  universityApplications: CounselorUniversityApplicationListResult;
}) {
  const { identity, profile, preference, completion } = result;
  const displayName =
    identity.full_name?.trim() || STUDENT_360_FALLBACKS.name;
  const profileStateLabel = getStudent360ProfileStateLabel(
    result.profileState,
  );
  const canManageCase =
    caseAccess.kind === "ready" && caseAccess.state === "primary";
  const caseAccessMessage =
    caseAccess.kind === "ready" && caseAccess.state !== "primary"
      ? getCounselorCaseAccessMessage(caseAccess.state)
      : caseAccess.kind === "unavailable"
        ? "Primary Counselor ownership could not be verified. Long-term case records are read-only."
        : null;

  return (
    <article className="student-360-page">
      <Link className="student-360-back-link" href={STUDENT_360_BASE_PATH}>
        ← Back to Students
      </Link>

      <header className="student-360-hero">
        <div className="student-360-hero-main">
          <span className="eyebrow">Counselor Student 360</span>
          <h1>{displayName}</h1>
          <p>{identity.college_email}</p>
          <div className="student-360-badges">
            <span
              className={`directory-badge ${
                identity.is_active
                  ? "directory-account-active"
                  : "directory-account-inactive"
              }`}
            >
              {identity.is_active ? "Active account" : "Inactive account"}
            </span>
            <span
              className={`directory-badge directory-profile-${result.profileState}`}
            >
              {profileStateLabel}
            </span>
          </div>
        </div>

        <div className="student-360-completion-card">
          <span>Profile completion</span>
          <strong>{result.completionPercentage}%</strong>
          <div
            aria-label={`${displayName} profile completion`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={result.completionPercentage}
            className="directory-progress"
            role="progressbar"
          >
            <span style={{ width: `${result.completionPercentage}%` }} />
          </div>
          <small>{profileStateLabel}</small>
        </div>

        <dl className="student-360-summary-grid">
          <div>
            <dt>Roll number</dt>
            <dd>{profile?.roll_number ?? STUDENT_360_FALLBACKS.notAdded}</dd>
          </div>
          <div>
            <dt>Course / Department</dt>
            <dd>
              {profile
                ? `${profile.course} · ${profile.department}`
                : STUDENT_360_FALLBACKS.notAdded}
            </dd>
          </div>
          <div>
            <dt>Graduation year</dt>
            <dd>
              {profile?.graduation_year ??
                STUDENT_360_FALLBACKS.notAdded}
            </dd>
          </div>
          <div>
            <dt>Target intake</dt>
            <dd>
              {formatStudent360TargetIntake(
                preference?.target_intake ?? null,
              )}
            </dd>
          </div>
        </dl>
      </header>

      {caseAccessMessage && (
        <aside className="student-360-readonly-note" role="status">
          <strong>Long-term case updates are read-only</strong>
          <p>{caseAccessMessage}</p>
        </aside>
      )}

      <section
        aria-labelledby="student-360-overview"
        className="student-360-section"
      >
        <SectionHeading
          id="student-360-overview"
          kicker="Identity and contact"
          title={STUDENT_360_SECTION_LABELS.overview}
        />
        <DefinitionGrid
          values={[
            { label: "Full name", value: displayName },
            { label: "College email", value: identity.college_email },
            {
              label: "Personal email",
              value:
                profile?.personal_email ?? STUDENT_360_FALLBACKS.notAdded,
            },
            {
              label: "Mobile number",
              value:
                profile?.mobile_number ?? STUDENT_360_FALLBACKS.notAdded,
            },
            {
              label: "College",
              value: profile?.college ?? STUDENT_360_FALLBACKS.notAdded,
            },
            {
              label: "Course",
              value: profile?.course ?? STUDENT_360_FALLBACKS.notAdded,
            },
            {
              label: "Department",
              value: profile?.department ?? STUDENT_360_FALLBACKS.notAdded,
            },
            {
              label: "Current year",
              value: formatStudent360Number(profile?.current_year ?? null),
            },
            {
              label: "Current semester",
              value: formatStudent360Number(
                profile?.current_semester ?? null,
              ),
            },
            {
              label: "Graduation year",
              value: formatStudent360Number(
                profile?.graduation_year ?? null,
              ),
            },
            {
              label: "Profile last updated",
              value: formatStudent360Timestamp(profile?.updated_at ?? null),
            },
            {
              label: "Account created",
              value: formatStudent360Timestamp(
                identity.account_created_at,
              ),
            },
          ]}
        />
      </section>

      <section
        aria-labelledby="student-360-academics"
        className="student-360-section"
      >
        <SectionHeading
          id="student-360-academics"
          kicker="Student-reported results"
          title={STUDENT_360_SECTION_LABELS.academics}
        />
        {profile ? (
          <DefinitionGrid
            values={[
              {
                label: "CGPA and scale",
                value:
                  profile.cgpa === null
                    ? STUDENT_360_FALLBACKS.notAdded
                    : `${profile.cgpa} / ${profile.cgpa_scale}`,
              },
              {
                label: "Active backlogs",
                value: formatStudent360Number(profile.active_backlogs),
              },
              {
                label: "Cleared backlogs",
                value: formatStudent360Number(profile.cleared_backlogs),
              },
              {
                label: "SSLC percentage",
                value: formatStudent360Number(
                  profile.sslc_percentage,
                  "%",
                ),
              },
              {
                label: "HSC percentage",
                value: formatStudent360Number(
                  profile.hsc_percentage,
                  "%",
                ),
              },
              {
                label: "Diploma percentage",
                value: formatStudent360Number(
                  profile.diploma_percentage,
                  "%",
                ),
              },
              {
                label: "Academic remarks",
                value:
                  profile.academic_remarks ??
                  STUDENT_360_FALLBACKS.noRemarks,
              },
            ]}
          />
        ) : (
          <p className="student-360-empty" role="status">
            The student has not started their detailed profile.
          </p>
        )}
      </section>

      <section
        aria-labelledby="student-360-preferences"
        className="student-360-section"
      >
        <SectionHeading
          id="student-360-preferences"
          kicker="Student-reported goals"
          title={STUDENT_360_SECTION_LABELS.preferences}
        />
        {preference ? (
          <>
            <DefinitionGrid
              values={[
                {
                  label: "Higher-studies interest",
                  value: getStudent360InterestLabel(
                    preference.higher_studies_interest,
                  ),
                },
                {
                  label: "Preferred Study Area",
                  value: getStudent360StudyAreaLabel(
                    preference.preferred_study_area,
                  ),
                },
                {
                  label: "Preferred Domain",
                  value: getStudent360DomainLabel(
                    preference.preferred_domain,
                  ),
                },
                {
                  label: "Study Pathway",
                  value: getStudent360StudyPathwayLabel(
                    preference.study_pathway,
                  ),
                },
                {
                  label: "Global Track Programme",
                  value: getStudent360GlobalTrackProgramLabel(
                    preference.global_track_program,
                  ),
                },
                {
                  label: "Target intake",
                  value: formatStudent360TargetIntake(
                    preference.target_intake,
                  ),
                },
                {
                  label: "Tuition Fee Budget",
                  value:
                    preference.budget_range ??
                    STUDENT_360_FALLBACKS.notSelected,
                },
                {
                  label: "Scholarship requirement",
                  value: formatStudent360Boolean(
                    preference.scholarship_required,
                    "Required",
                    "Not required",
                  ),
                },
                {
                  label: "Funding requirement",
                  value: formatStudent360Boolean(
                    preference.funding_required,
                    "Required",
                    "Not required",
                  ),
                },
                {
                  label: "Funding Method",
                  value: getStudent360FundingMethodLabel(
                    preference.funding_method,
                  ),
                },
                {
                  label: "Study mode",
                  value: getStudent360StudyModeLabel(
                    preference.study_mode,
                  ),
                },
                {
                  label: "Academic preference",
                  value: getStudent360AcademicPreferenceLabel(
                    preference.academic_preference,
                  ),
                },
                {
                  label: "Student-reported planning stage",
                  value: getStudent360PlanningStageLabel(
                    preference.student_planning_stage,
                  ),
                },
              ]}
            />
            <div className="student-360-array-grid">
              <div>
                <h3>Preferred countries</h3>
                <TagList
                  emptyLabel={STUDENT_360_FALLBACKS.notSelected}
                  items={preference.preferred_countries}
                />
              </div>
              <div>
                <h3>Preferred program areas</h3>
                <TagList
                  emptyLabel={STUDENT_360_FALLBACKS.notSelected}
                  items={preference.preferred_program_areas}
                />
              </div>
            </div>
          </>
        ) : (
          <p className="student-360-empty" role="status">
            Higher-studies preferences have not been added.
          </p>
        )}
      </section>

      <CounselorStudentConsultationHistory
        currentCounselorId={currentCounselorId}
        result={result}
      />

      <section
        aria-labelledby="student-360-exams"
        className="student-360-section"
      >
        <SectionHeading
          id="student-360-exams"
          kicker="Student-reported records"
          title={STUDENT_360_SECTION_LABELS.exams}
        />
        {result.testScores.length === 0 ? (
          <p className="student-360-empty" role="status">
            No Study Abroad Exam records have been added.
          </p>
        ) : (
          <ul className="student-360-record-list">
            {result.testScores.map((score) => (
              <li key={score.id}>
                <article>
                  <header>
                    <h3>{getStudent360ExamName(score)}</h3>
                    <span className="student-360-status">
                      {getStudent360ExamStatusLabel(score.exam_status)}
                    </span>
                  </header>
                  <DefinitionGrid
                    values={[
                      {
                        label: "Attempt",
                        value: String(score.attempt_number),
                      },
                      {
                        label: "Planned date",
                        value: formatStudent360Date(score.planned_date),
                      },
                      {
                        label: "Completed date",
                        value: formatStudent360Date(score.completed_date),
                      },
                      {
                        label: "Score",
                        value:
                          score.score ?? STUDENT_360_FALLBACKS.notAdded,
                      },
                      {
                        label: "Valid until",
                        value: formatStudent360Date(score.valid_until),
                      },
                      {
                        label: "Remarks",
                        value:
                          score.remarks ??
                          STUDENT_360_FALLBACKS.noRemarks,
                      },
                    ]}
                  />
                </article>
              </li>
            ))}
          </ul>
        )}
        {result.testScoreCount > STUDENT_360_SECTION_LIMIT && (
          <p className="student-360-bound-notice">
            Showing the latest {STUDENT_360_SECTION_LIMIT} of{" "}
            {result.testScoreCount} exam records.
          </p>
        )}
      </section>

      <section
        aria-labelledby="student-360-achievements"
        className="student-360-section"
      >
        <SectionHeading
          id="student-360-achievements"
          kicker="Student-reported experience"
          title={STUDENT_360_SECTION_LABELS.achievements}
        />
        {result.achievements.length === 0 ? (
          <p className="student-360-empty" role="status">
            No achievements have been added.
          </p>
        ) : (
          <ul className="student-360-record-list">
            {result.achievements.map((achievement) => (
              <li key={achievement.id}>
                <article>
                  <header>
                    <div>
                      <span className="eyebrow">
                        {getStudent360AchievementTypeLabel(
                          achievement.achievement_type,
                        )}
                      </span>
                      <h3>{achievement.title}</h3>
                    </div>
                    <time>
                      {formatStudent360Date(
                        achievement.achievement_date,
                      )}
                    </time>
                  </header>
                  <DefinitionGrid
                    values={[
                      {
                        label: "Organization",
                        value:
                          achievement.organization ??
                          STUDENT_360_FALLBACKS.notAdded,
                      },
                      {
                        label: "Description",
                        value:
                          achievement.description ??
                          STUDENT_360_FALLBACKS.notAdded,
                      },
                    ]}
                  />
                </article>
              </li>
            ))}
          </ul>
        )}
        {result.achievementCount > STUDENT_360_SECTION_LIMIT && (
          <p className="student-360-bound-notice">
            Showing the latest {STUDENT_360_SECTION_LIMIT} of{" "}
            {result.achievementCount} achievement records.
          </p>
        )}
      </section>

      <CounselorPrivateRecords
        canManageCase={canManageCase}
        records={result.privateRecords}
        studentId={result.identity.student_id}
      />

      <OfficialProgressionSection
        canManageCase={canManageCase}
        pages={pages}
        progression={progression}
        progressionEvidence={progressionEvidence}
        studentId={result.identity.student_id}
      />

      <UniversityApplicationsSection
        canManageCase={canManageCase}
        result={universityApplications}
        studentId={result.identity.student_id}
      />

      <footer className="student-360-readonly-note">
        <strong>Student-reported profile is read-only</strong>
        <p>
          Student-reported profile information cannot be edited from this
          page. Planning stage is not an official counselor progression
          status.
        </p>
        {completion && (
          <small>
            {completion.essential_fields_completed} of{" "}
            {completion.essential_fields_total} essential fields completed.
          </small>
        )}
      </footer>
    </article>
  );
}
