import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CounselorPrivateRecords } from "@/components/counselor/counselor-private-records";
import { CounselorSemesterSummary } from "@/components/counselor/counselor-semester-summary";
import { OfficialProgressionSection } from "@/components/counselor/official-progression-section";
import { ProgressionEvidenceControls } from "@/components/counselor/progression-evidence-controls";
import { UniversityApplicationDocuments } from "@/components/counselor/university-application-documents";
import { CounselorStudentConsultationHistory } from "@/components/counselor/student-profile-view";
import { Panel, SectionHeader, StateBlock } from "@/components/shell/portal-ui";
import type { CounselorAchievementEvidenceResult } from "@/lib/counselor/achievement-evidence-server";
import {
  formatAchievementEvidenceDate,
  formatAchievementEvidenceSize,
} from "@/lib/student/achievement-evidence";
import {
  COUNSELING_PROGRESSION_STAGE_LABELS,
  COUNSELING_PROGRESSION_STATE_LABELS,
  type OfficialProgressionLoadResult,
  type Student360ApprovedPages,
} from "@/lib/counselor/progression";
import type { ProgressionEvidenceLoadResult } from "@/lib/counselor/progression-evidence";
import {
  STUDENT_ELIGIBILITY_STATUS_LABELS,
  formatEligibilityDate,
} from "@/lib/counselor/eligibility";
import {
  formatStudent360Date,
  formatStudent360Number,
  formatStudent360TargetIntake,
  getStudent360AcademicPreferenceLabel,
  getStudent360AchievementTypeLabel,
  getStudent360ExamName,
  getStudent360ExamStatusLabel,
  getStudent360InterestLabel,
  getStudent360DomainLabel,
  getStudent360FundingMethodLabel,
  getStudent360GlobalTrackProgramLabel,
  getStudent360PlanningStageLabel,
  getStudent360StudyPathwayLabel,
  getStudent360StudyAreaLabel,
  getStudent360StudyModeLabel,
  type Student360ReadyResult,
} from "@/lib/counselor/student-profile";
import type {
  CounselorUniversityApplication,
  CounselorUniversityApplicationListResult,
} from "@/lib/counselor/university-application-management";
import type { CounselorStudentWorkspaceOverviewData } from "@/lib/counselor/student-workspace-server";
import type { CounselorSemesterSummaryLoadResult } from "@/lib/counselor/semester-summary";

const PANEL_TITLE = "text-[var(--ink)]";

function PanelSection({
  children,
  flat = false,
  title,
}: {
  children: React.ReactNode;
  /** Sit directly on the page, separated from the previous section by a hairline. */
  flat?: boolean;
  title: string;
}) {
  if (flat) {
    return (
      <section className="border-t border-[var(--line)] pt-7 first:border-t-0 first:pt-0">
        <h3 className={PANEL_TITLE}>{title}</h3>
        {children}
      </section>
    );
  }
  return (
    <Panel>
      <h3 className={PANEL_TITLE}>{title}</h3>
      {children}
    </Panel>
  );
}

function DefinitionList({
  values,
}: {
  values: Array<{ label: string; value: React.ReactNode }>;
}) {
  return (
    <dl className="mt-4 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
      {values.map((item) => (
        <div
          className="min-w-0 border-t border-[var(--line)] py-3"
          key={item.label}
        >
          <dt className="text-[0.7rem] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
            {item.label}
          </dt>
          <dd className="mt-1 break-words text-[var(--ink-soft)]">
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function workspacePath(studentId: string, suffix: string): string {
  return `/counselor/students/${studentId}${suffix}`;
}

export function CounselorStudentWorkspaceOverview({
  applications,
  progression,
  result,
}: {
  applications: CounselorUniversityApplicationListResult;
  progression: OfficialProgressionLoadResult;
  result: CounselorStudentWorkspaceOverviewData;
}) {
  const { profile, preference } = result;
  const applicationSummary =
    applications.kind === "ready"
      ? `${applications.activeCount} active · ${applications.totalCount} total`
      : "Temporarily unavailable";
  const progressionSummary =
    progression.kind === "ready" && progression.current
      ? `${COUNSELING_PROGRESSION_STAGE_LABELS[progression.current.current_stage]} · ${COUNSELING_PROGRESSION_STATE_LABELS[progression.current.workflow_state]}`
      : progression.kind === "ready"
        ? "Not recorded"
        : "Temporarily unavailable";
  const eligibilitySummary =
    result.eligibilityLatest === undefined
      ? ["Temporarily unavailable"]
      : result.eligibilityLatest === null
        ? ["Assessment not completed"]
        : [
            STUDENT_ELIGIBILITY_STATUS_LABELS[
              result.eligibilityLatest.overall_status
            ],
            `Last assessed ${formatEligibilityDate(result.eligibilityLatest.assessed_at)}`,
          ];

  const cards = [
    {
      title: "Student Profile",
      href: "/profile",
      values: [
        profile?.course ?? "Not provided",
        profile?.cgpa === null || !profile
          ? "CGPA not provided"
          : `CGPA ${profile.cgpa} / ${profile.cgpa_scale}`,
        profile
          ? `Graduating ${profile.graduation_year}`
          : "Graduation year not provided",
      ],
    },
    {
      title: "Higher Studies Goal",
      href: "/profile",
      values: [
        preference?.study_pathway
          ? getStudent360StudyPathwayLabel(preference.study_pathway)
          : "Study pathway not provided",
        preference?.preferred_countries.length
          ? preference.preferred_countries.join(", ")
          : "Preferred countries not provided",
        preference?.target_intake
          ? formatStudent360TargetIntake(preference.target_intake)
          : "Target intake not provided",
      ],
    },
    {
      title: "Eligibility",
      href: "/eligibility",
      values: eligibilitySummary,
    },
    {
      title: "Applications",
      href: "/applications",
      values: [
        applicationSummary,
        applications.kind === "ready"
          ? (applications.primaryApplicationName ?? "No primary application")
          : "Status unavailable",
      ],
    },
    {
      title: "Readiness",
      href: "/readiness",
      values: [
        result.testScoreCount
          ? `${result.testScoreCount} test record${result.testScoreCount === 1 ? "" : "s"}`
          : "No test scores recorded",
        "Global readiness is not yet assessed",
      ],
    },
    {
      title: "Achievements",
      href: "/achievements",
      values: [
        result.achievementCount
          ? `${result.achievementCount} achievement${result.achievementCount === 1 ? "" : "s"}`
          : "No achievements added",
        result.recentAchievementTitle ?? "No recent highlight",
      ],
    },
    {
      title: "Current Journey",
      href: "/advisory",
      values: [progressionSummary],
    },
    {
      title: "Next Action",
      href: "/advisory",
      values: ["Not recorded"],
    },
  ];

  return (
    <section>
      <SectionHeader
        description="A concise view of the Student's profile, goals and current higher-studies journey."
        title="Overview"
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <article
            className="flex flex-col rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4 shadow-[0_1px_3px_rgb(15_23_42/0.06)] transition-shadow hover:shadow-[0_10px_24px_-14px_rgb(15_23_42/0.3)]"
            key={card.title}
          >
            <h3 className={PANEL_TITLE}>{card.title}</h3>
            <ul className="mt-3 flex flex-1 list-disc flex-col gap-1 pl-5 text-sm text-[var(--ink-soft)]">
              {card.values.map((value, index) => (
                <li className="break-words" key={`${card.title}-${index}`}>
                  {value}
                </li>
              ))}
            </ul>
            <Link
              className="mt-4 text-sm font-bold text-[var(--brand-600)] underline decoration-1 underline-offset-4 transition-colors hover:text-[var(--brand-700)]"
              href={workspacePath(result.studentId, card.href)}
            >
              View details
            </Link>
          </article>
        ))}
      </div>
    </section>
  );
}

export function CounselorStudentWorkspaceProfile({
  result,
}: {
  result: Student360ReadyResult;
}) {
  const { identity, profile, preference } = result;
  return (
    <section>
      <SectionHeader
        description="Read-only information supplied by the Student."
        title="Profile"
      />
      <div className="flex flex-col gap-7">
        <PanelSection flat title="Personal / College Information">
          <DefinitionList
            values={[
              { label: "Name", value: identity.full_name ?? "Not provided" },
              {
                label: "Roll number",
                value: profile?.roll_number ?? "Not provided",
              },
              { label: "College email", value: identity.college_email },
              {
                label: "Personal email",
                value: profile?.personal_email ?? "Not provided",
              },
              {
                label: "Mobile number",
                value: profile?.mobile_number ?? "Not provided",
              },
              { label: "College", value: profile?.college ?? "Not provided" },
              {
                label: "Course / Programme",
                value: profile?.course ?? "Not provided",
              },
              {
                label: "Department",
                value: profile?.department ?? "Not provided",
              },
            ]}
          />
        </PanelSection>

        <PanelSection flat title="Academic Portfolio">
          <DefinitionList
            values={[
              {
                label: "Current year",
                value: formatStudent360Number(profile?.current_year ?? null),
              },
              {
                label: "Current semester",
                value: formatStudent360Number(profile?.current_semester ?? null),
              },
              {
                label: "Graduation year",
                value: formatStudent360Number(profile?.graduation_year ?? null),
              },
              {
                label: "CGPA",
                value:
                  profile?.cgpa === null || !profile
                    ? "Not provided"
                    : `${profile.cgpa} / ${profile.cgpa_scale}`,
              },
              {
                label: "Active backlogs",
                value: formatStudent360Number(profile?.active_backlogs ?? null),
              },
              {
                label: "Cleared backlogs",
                value: formatStudent360Number(profile?.cleared_backlogs ?? null),
              },
              {
                label: "Academic remarks",
                value: profile?.academic_remarks ?? "Not provided",
              },
            ]}
          />
        </PanelSection>

        <PanelSection flat title="Higher Studies Preferences">
          {preference ? (
            <DefinitionList
              values={[
                {
                  label: "Interest",
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
                  value: getStudent360DomainLabel(preference.preferred_domain),
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
                  label: "Preferred countries",
                  value:
                    preference.preferred_countries.join(", ") || "Not provided",
                },
                {
                  label: "Preferred programme areas",
                  value:
                    preference.preferred_program_areas.join(", ") ||
                    "Not provided",
                },
                {
                  label: "Target intake",
                  value: preference.target_intake
                    ? formatStudent360TargetIntake(preference.target_intake)
                    : "Not provided",
                },
                {
                  label: "Tuition Fee Budget",
                  value: preference.budget_range ?? "Not provided",
                },
                {
                  label: "Study mode",
                  value: getStudent360StudyModeLabel(preference.study_mode),
                },
                {
                  label: "Funding Method",
                  value: getStudent360FundingMethodLabel(
                    preference.funding_method,
                  ),
                },
                {
                  label: "Academic preference",
                  value: getStudent360AcademicPreferenceLabel(
                    preference.academic_preference,
                  ),
                },
                {
                  label: "Student planning stage",
                  value: getStudent360PlanningStageLabel(
                    preference.student_planning_stage,
                  ),
                },
              ]}
            />
          ) : (
            <p className="mt-3 text-sm text-[var(--muted)]">
              Higher-studies preferences have not been provided.
            </p>
          )}
        </PanelSection>

        <CounselorStudentWorkspaceTests profileContext result={result} />
      </div>
    </section>
  );
}

export function CounselorStudentWorkspaceTests({
  result,
  profileContext = false,
}: {
  result: Student360ReadyResult;
  profileContext?: boolean;
}) {
  return (
    <PanelSection
      flat={profileContext}
      title={profileContext ? "Study Abroad Exams" : "Recorded Tests"}
    >
      {result.testScores.length === 0 ? (
        <p className="mt-3 text-sm text-[var(--muted)]">
          No test scores recorded.
        </p>
      ) : (
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          {result.testScores.map((score) => (
            <article
              className="min-w-0 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4"
              key={score.id}
            >
              <header className="flex items-start justify-between gap-3">
                <h4 className="min-w-0 break-words">
                  {getStudent360ExamName(score)}
                </h4>
                <span className="shrink-0 rounded-full bg-[var(--surface)] px-2.5 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-[var(--ink-soft)] ring-1 ring-inset ring-[var(--line-strong)]">
                  {getStudent360ExamStatusLabel(score.exam_status)}
                </span>
              </header>
              <DefinitionList
                values={[
                  { label: "Score", value: score.score ?? "Not provided" },
                  {
                    label: "Planned date",
                    value: formatStudent360Date(score.planned_date),
                  },
                  {
                    label: "Completed date",
                    value: formatStudent360Date(score.completed_date),
                  },
                ]}
              />
            </article>
          ))}
        </div>
      )}
    </PanelSection>
  );
}

export function CounselorStudentWorkspaceAchievements({
  evidence,
  result,
}: {
  evidence: CounselorAchievementEvidenceResult;
  result: Student360ReadyResult;
}) {
  return (
    <section>
      <SectionHeader title="Achievements" />
      {result.achievements.length === 0 ? (
        <StateBlock title="No achievements added." />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {result.achievements.map((achievement) => {
            const documents =
              evidence.kind === "ready"
                ? evidence.documents.filter(
                    (document) => document.achievementId === achievement.id,
                  )
                : [];
            return (
            <Panel className="min-w-0" key={achievement.id}>
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[var(--brand-600)]">
                    {getStudent360AchievementTypeLabel(
                      achievement.achievement_type,
                    )}
                  </span>
                  <h3 className={`mt-1 break-words ${PANEL_TITLE}`}>
                    {achievement.title}
                  </h3>
                </div>
                <time className="shrink-0 text-[0.78rem] font-semibold tabular-nums text-[var(--muted)]">
                  {formatStudent360Date(achievement.achievement_date)}
                </time>
              </header>
              <DefinitionList
                values={[
                  {
                    label: "Organization",
                    value: achievement.organization ?? "Not provided",
                  },
                  {
                    label: "Description",
                    value: achievement.description ?? "Not provided",
                  },
                ]}
              />
              <div className="achievement-evidence counselor-achievement-evidence mt-4">
                <strong>Evidence</strong>
                {evidence.kind === "unavailable" ? (
                  <p className="achievement-evidence-empty" role="alert">
                    Evidence is temporarily unavailable.
                  </p>
                ) : evidence.kind === "not_found" ? (
                  <p className="achievement-evidence-empty">
                    Evidence is unavailable outside your active Primary
                    caseload.
                  </p>
                ) : documents.length === 0 ? (
                  <p className="achievement-evidence-empty">
                    No evidence uploaded
                  </p>
                ) : (
                  <ul className="achievement-evidence-list">
                    {documents.map((document) => (
                      <li key={document.documentId}>
                        <span>
                          {document.documentName}
                          <small>
                            {document.mimeType} ·{" "}
                            {formatAchievementEvidenceSize(
                              document.fileSizeBytes,
                            )}{" "}
                            ·{" "}
                            {document.availableAt
                              ? `Uploaded ${formatAchievementEvidenceDate(document.availableAt)}`
                              : "Available"}
                          </small>
                        </span>
                        <a
                          className="button button-secondary"
                          href={`/counselor/students/${result.identity.student_id}/achievements/${achievement.id}/evidence/${document.documentId}/view`}
                          rel="noreferrer"
                          target="_blank"
                        >
                          View Evidence
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
            );
          })}
        </div>
      )}
    </section>
  );
}

export function CounselorStudentWorkspaceAdvisory({
  currentCounselorId,
  pages,
  progression,
  progressionEvidence,
  result,
  semesterSummaries,
}: {
  currentCounselorId: string;
  pages: Student360ApprovedPages;
  progression: OfficialProgressionLoadResult;
  progressionEvidence: ProgressionEvidenceLoadResult;
  result: Student360ReadyResult;
  semesterSummaries: CounselorSemesterSummaryLoadResult;
}) {
  const nextFollowUp =
    result.privateRecords.followUps.kind === "ready"
      ? (result.privateRecords.followUps.records.find(
          (followUp) => followUp.status === "pending",
        ) ?? null)
      : null;

  return (
    <section>
      <SectionHeader
        description="Consultations, private follow-up work, Journey Progress and parent-safe Semester Summaries."
        title="Advisory"
      />
      <div className="flex flex-col gap-5">
        <CounselorStudentConsultationHistory
          currentCounselorId={currentCounselorId}
          result={result}
        />
        <CounselorPrivateRecords
          canManageCase
          records={result.privateRecords}
          studentId={result.identity.student_id}
        />
        <OfficialProgressionSection
          canManageCase
          nextAction={nextFollowUp?.next_action ?? null}
          nextActionDueDate={nextFollowUp?.due_date ?? null}
          pages={pages}
          progression={progression}
          progressionEvidence={progressionEvidence}
          studentId={result.identity.student_id}
        />
        <CounselorSemesterSummary
          result={semesterSummaries}
          studentId={result.identity.student_id}
        />
      </div>
    </section>
  );
}

export function CounselorStudentWorkspaceDocuments({
  applications,
  progression,
  progressionEvidence,
  studentId,
}: {
  applications: CounselorUniversityApplicationListResult;
  progression: OfficialProgressionLoadResult;
  progressionEvidence: ProgressionEvidenceLoadResult;
  studentId: string;
}) {
  const eventIds =
    progression.kind === "ready" ? progression.events.map((event) => event.id) : [];
  const evidenceAvailable = progressionEvidence.kind === "ready";
  const evidenceCount = evidenceAvailable
    ? eventIds.reduce(
        (count, eventId) =>
          count + (progressionEvidence.evidenceByEvent[eventId]?.length ?? 0),
        0,
      )
    : 0;

  return (
    <section>
      <SectionHeader
        description="Progression evidence and university application documents only."
        title="Documents"
      />
      <div className="flex flex-col gap-5">
        <PanelSection title="Progression Evidence">
          {!evidenceAvailable ? (
            <div className="mt-4">
              <StateBlock
                title="Progression evidence is temporarily unavailable."
                tone="error"
              />
            </div>
          ) : evidenceCount === 0 ? (
            <div className="mt-4">
              <StateBlock title="No available progression evidence." />
            </div>
          ) : (
            eventIds.map((eventId) => {
              const files = progressionEvidence.evidenceByEvent[eventId] ?? [];
              if (!files.length) return null;
              return (
                <div
                  className="mt-4 border-t border-[var(--line)] pt-4"
                  key={eventId}
                >
                  <ProgressionEvidenceControls
                    canManageCase
                    evidence={files}
                    progressionEventId={eventId}
                    studentId={studentId}
                  />
                </div>
              );
            })
          )}
        </PanelSection>

        <PanelSection title="Application Documents">
          {applications.kind !== "ready" ? (
            <div className="mt-4">
              <StateBlock
                title="Application documents are temporarily unavailable."
                tone="error"
              />
            </div>
          ) : applications.applications.length === 0 ? (
            <div className="mt-4">
              <StateBlock title="No application documents available." />
            </div>
          ) : (
            applications.applications.map((application) => (
              <article
                className="mt-4 border-t border-[var(--line)] pt-4"
                key={application.id}
              >
                <h4 className="break-words">
                  {application.universityName} · {application.programmeName}
                </h4>
                <UniversityApplicationDocuments
                  applicationId={application.id}
                  applicationLabel={`${application.universityName}, ${application.programmeName}`}
                  canManageCase
                  isArchived={application.isArchived}
                />
              </article>
            ))
          )}
        </PanelSection>
      </div>
    </section>
  );
}

export function CounselorStudentApplicationDetail({
  application,
  studentId,
}: {
  application: CounselorUniversityApplication;
  studentId: string;
}) {
  return (
    <section>
      <Link
        className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--brand-600)] transition-colors hover:text-[var(--brand-700)]"
        href={workspacePath(studentId, "/applications")}
      >
        <ArrowLeft aria-hidden="true" size={16} />
        Back to Applications
      </Link>
      <div className="mt-5">
        <SectionHeader
          description={application.programmeName}
          title={application.universityName}
        />
      </div>
      <Panel>
        <DefinitionList
          values={[
            { label: "Country", value: application.countryCode },
            { label: "Degree level", value: application.degreeLevelLabel },
            {
              label: "Intake",
              value: `${application.intakeLabel} ${application.intakeYear}`,
            },
            { label: "Current status", value: application.currentStatusLabel },
            {
              label: "Submitted",
              value: application.submittedAt
                ? formatStudent360Date(application.submittedAt.slice(0, 10))
                : "Not provided",
            },
          ]}
        />
        <UniversityApplicationDocuments
          applicationId={application.id}
          applicationLabel={`${application.universityName}, ${application.programmeName}`}
          canManageCase
          isArchived={application.isArchived}
        />
      </Panel>
    </section>
  );
}

export function CounselorStudentWorkspacePlaceholder({
  title,
  message,
  supportingText,
}: {
  title: string;
  message: string;
  supportingText: string;
}) {
  return (
    <section>
      <SectionHeader title={title} />
      <StateBlock description={supportingText} title={message} />
    </section>
  );
}
