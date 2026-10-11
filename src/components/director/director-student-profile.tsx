import Link from "next/link";
import {
  GLOBAL_READINESS_BAND_LABELS,
  GLOBAL_READINESS_CRITERIA,
  GLOBAL_READINESS_DIMENSIONS,
} from "@/lib/counselor/global-readiness";
import {
  STUDENT_360_FALLBACKS,
  STUDENT_360_SECTION_LIMIT,
  formatStudent360Boolean,
  formatStudent360Date,
  formatStudent360Number,
  formatStudent360TargetIntake,
  formatStudent360Timestamp,
  getStudent360AcademicPreferenceLabel,
  getStudent360AchievementTypeLabel,
  getStudent360DomainLabel,
  getStudent360ExamName,
  getStudent360ExamStatusLabel,
  getStudent360FundingMethodLabel,
  getStudent360GlobalTrackProgramLabel,
  getStudent360InterestLabel,
  getStudent360PlanningStageLabel,
  getStudent360ProfileStateLabel,
  getStudent360StudyAreaLabel,
  getStudent360StudyModeLabel,
  getStudent360StudyPathwayLabel,
} from "@/lib/counselor/student-profile";
import {
  formatBytes,
  formatDirectorCaseLabel,
} from "@/lib/director/student-profile-detail";
import type { DirectorStudentProfileReadyResult } from "@/lib/director/student-profile-server";

type DetailValue = { label: string; value: string };

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

function SectionHeading({ id, title }: { id: string; title: string }) {
  return (
    <header className="student-360-section-heading">
      <h2 id={id}>{title}</h2>
    </header>
  );
}

function TagList({ items }: { items: string[] }) {
  if (items.length === 0) return <span>{STUDENT_360_FALLBACKS.notSelected}</span>;
  return <ul className="student-360-tag-list">{items.map((item) => <li key={item}>{item}</li>)}</ul>;
}

function SectionUnavailable() {
  return (
    <p className="student-360-empty" role="status">
      Temporarily unavailable
    </p>
  );
}

export function DirectorStudentProfile({ result }: { result: DirectorStudentProfileReadyResult }) {
  const { identity, profile, preference, completion } = result;
  const displayName = identity.full_name?.trim() || STUDENT_360_FALLBACKS.name;
  const profileStateLabel = getStudent360ProfileStateLabel(result.profileState);

  return (
    <article className="student-360-page">
      <Link className="student-360-back-link" href="/director/students">← Back to Students</Link>

      <header className="student-360-hero">
        <div className="student-360-hero-main">
          <h1>{displayName}</h1>
          <p>{identity.college_email}</p>
          <div className="student-360-badges">
            <span className={`directory-badge ${identity.is_active ? "directory-account-active" : "directory-account-inactive"}`}>
              {identity.is_active ? "Active account" : "Inactive account"}
            </span>
            <span className={`directory-badge directory-profile-${result.profileState}`}>{profileStateLabel}</span>
          </div>
        </div>
        <div className="student-360-completion-card">
          <span>Profile completion</span>
          <strong>{result.completionPercentage}%</strong>
          <div aria-label={`${displayName} profile completion`} aria-valuemax={100} aria-valuemin={0} aria-valuenow={result.completionPercentage} className="directory-progress" role="progressbar">
            <span style={{ width: `${result.completionPercentage}%` }} />
          </div>
          <small>{profileStateLabel}</small>
        </div>
      </header>

      <nav aria-label="Student 360 sections" className="student-360-tag-list">
        {[
          ["Overview", "director-student-overview"],
          ["Academics", "director-student-academics"],
          ["Achievements", "director-student-achievements"],
          ["Documents", "director-student-documents"],
          ["Eligibility", "director-student-eligibility"],
          ["Progress", "director-student-progress"],
          ["Applications", "director-student-applications"],
          ["Readiness", "director-student-readiness"],
          ["Consultations", "director-student-consultations"],
          ["Parent Reports", "director-student-parent-reports"],
        ].map(([label, id]) => <a href={`#${id}`} key={id}>{label}</a>)}
      </nav>

      <section aria-labelledby="director-student-overview" className="student-360-section">
        <SectionHeading id="director-student-overview" title="Overview" />
        <DefinitionGrid values={[
          { label: "Full name", value: displayName },
          { label: "College email", value: identity.college_email },
          { label: "Personal email", value: profile?.personal_email ?? STUDENT_360_FALLBACKS.notAdded },
          { label: "Mobile number", value: profile?.mobile_number ?? STUDENT_360_FALLBACKS.notAdded },
          { label: "Roll number", value: profile?.roll_number ?? STUDENT_360_FALLBACKS.notAdded },
          { label: "College", value: profile?.college ?? STUDENT_360_FALLBACKS.notAdded },
          { label: "Course", value: profile?.course ?? STUDENT_360_FALLBACKS.notAdded },
          { label: "Department", value: profile?.department ?? STUDENT_360_FALLBACKS.notAdded },
          { label: "Current year", value: formatStudent360Number(profile?.current_year ?? null) },
          { label: "Current semester", value: formatStudent360Number(profile?.current_semester ?? null) },
          { label: "Graduation year", value: formatStudent360Number(profile?.graduation_year ?? null) },
          { label: "Profile last updated", value: formatStudent360Timestamp(profile?.updated_at ?? null) },
          { label: "Account created", value: formatStudent360Timestamp(identity.account_created_at) },
        ]} />
      </section>

      <section aria-labelledby="director-student-academics" className="student-360-section">
        <SectionHeading id="director-student-academics" title="Academic Portfolio" />
        {profile ? <DefinitionGrid values={[
          { label: "CGPA and scale", value: profile.cgpa === null ? STUDENT_360_FALLBACKS.notAdded : `${profile.cgpa} / ${profile.cgpa_scale}` },
          { label: "Active backlogs", value: formatStudent360Number(profile.active_backlogs) },
          { label: "Cleared backlogs", value: formatStudent360Number(profile.cleared_backlogs) },
          { label: "SSLC percentage", value: formatStudent360Number(profile.sslc_percentage, "%") },
          { label: "HSC percentage", value: formatStudent360Number(profile.hsc_percentage, "%") },
          { label: "Diploma percentage", value: formatStudent360Number(profile.diploma_percentage, "%") },
          { label: "Academic remarks", value: profile.academic_remarks ?? STUDENT_360_FALLBACKS.noRemarks },
        ]} /> : <p className="student-360-empty" role="status">The student has not started their detailed profile.</p>}
      </section>

      <section aria-labelledby="director-student-preferences" className="student-360-section">
        <SectionHeading id="director-student-preferences" title="Higher-Studies Preferences" />
        {preference ? <>
          <DefinitionGrid values={[
            { label: "Higher-studies interest", value: getStudent360InterestLabel(preference.higher_studies_interest) },
            { label: "Preferred study area", value: getStudent360StudyAreaLabel(preference.preferred_study_area) },
            { label: "Preferred domain", value: getStudent360DomainLabel(preference.preferred_domain) },
            { label: "Study pathway", value: getStudent360StudyPathwayLabel(preference.study_pathway) },
            { label: "Global Track programme", value: getStudent360GlobalTrackProgramLabel(preference.global_track_program) },
            { label: "Target intake", value: formatStudent360TargetIntake(preference.target_intake) },
            { label: "Tuition fee budget", value: preference.budget_range ?? STUDENT_360_FALLBACKS.notSelected },
            { label: "Scholarship requirement", value: formatStudent360Boolean(preference.scholarship_required, "Required", "Not required") },
            { label: "Funding requirement", value: formatStudent360Boolean(preference.funding_required, "Required", "Not required") },
            { label: "Funding method", value: getStudent360FundingMethodLabel(preference.funding_method) },
            { label: "Study mode", value: getStudent360StudyModeLabel(preference.study_mode) },
            { label: "Academic preference", value: getStudent360AcademicPreferenceLabel(preference.academic_preference) },
            { label: "Planning stage", value: getStudent360PlanningStageLabel(preference.student_planning_stage) },
          ]} />
          <div className="student-360-array-grid">
            <div><h3>Preferred countries</h3><TagList items={preference.preferred_countries} /></div>
            <div><h3>Preferred program areas</h3><TagList items={preference.preferred_program_areas} /></div>
          </div>
        </> : <p className="student-360-empty" role="status">Higher-studies preferences have not been added.</p>}
      </section>

      <section aria-labelledby="director-student-exams" className="student-360-section">
        <SectionHeading id="director-student-exams" title="Study Abroad Exams" />
        {result.testScores.length === 0 ? <p className="student-360-empty" role="status">No Study Abroad Exam records have been added.</p> : (
          <ul className="student-360-record-list">{result.testScores.map((score) => <li key={score.id}><article><header><h3>{getStudent360ExamName(score)}</h3><span className="student-360-status">{getStudent360ExamStatusLabel(score.exam_status)}</span></header><DefinitionGrid values={[
            { label: "Attempt", value: String(score.attempt_number) },
            { label: "Planned date", value: formatStudent360Date(score.planned_date) },
            { label: "Completed date", value: formatStudent360Date(score.completed_date) },
            { label: "Score", value: score.score ?? STUDENT_360_FALLBACKS.notAdded },
            { label: "Valid until", value: formatStudent360Date(score.valid_until) },
            { label: "Remarks", value: score.remarks ?? STUDENT_360_FALLBACKS.noRemarks },
          ]} /></article></li>)}</ul>
        )}
        {result.testScoreCount > STUDENT_360_SECTION_LIMIT && <p className="student-360-bound-notice">Showing the latest {STUDENT_360_SECTION_LIMIT} of {result.testScoreCount} exam records.</p>}
      </section>

      <section aria-labelledby="director-student-achievements" className="student-360-section">
        <SectionHeading id="director-student-achievements" title="Achievements" />
        {result.achievements.length === 0 ? <p className="student-360-empty" role="status">No achievements have been added.</p> : (
          <ul className="student-360-record-list">{result.achievements.map((achievement) => <li key={achievement.id}><article><header><div><span className="eyebrow">{getStudent360AchievementTypeLabel(achievement.achievement_type)}</span><h3>{achievement.title}</h3></div><time>{formatStudent360Date(achievement.achievement_date)}</time></header><DefinitionGrid values={[
            { label: "Organization", value: achievement.organization ?? STUDENT_360_FALLBACKS.notAdded },
            { label: "Description", value: achievement.description ?? STUDENT_360_FALLBACKS.notAdded },
          ]} /></article></li>)}</ul>
        )}
        {result.achievementCount > STUDENT_360_SECTION_LIMIT && <p className="student-360-bound-notice">Showing the latest {STUDENT_360_SECTION_LIMIT} of {result.achievementCount} achievements.</p>}
      </section>

      <section aria-labelledby="director-student-documents" className="student-360-section">
        <SectionHeading id="director-student-documents" title="Documents and Achievement Evidence" />
        <h3>Achievement Evidence</h3>
        {result.achievementEvidence.status === "unavailable" ? <SectionUnavailable /> : result.achievementEvidence.data.length === 0 ? <p className="student-360-empty">No available Achievement Evidence.</p> : (
          <ul className="student-360-record-list">{result.achievementEvidence.data.map((document) => <li key={document.documentId}><article><header><h3>{document.documentName}</h3><Link href={`/director/students/${identity.student_id}/achievements/${document.achievementId}/evidence/${document.documentId}/view`} target="_blank">View evidence</Link></header><DefinitionGrid values={[
            { label: "File type", value: document.mimeType },
            { label: "Size", value: formatBytes(document.fileSizeBytes) },
            { label: "Available", value: formatStudent360Timestamp(document.availableAt) },
          ]} /></article></li>)}</ul>
        )}
        <h3>Profile Documents</h3>
        {result.profileDocuments.status === "unavailable" ? <SectionUnavailable /> : result.profileDocuments.data.length === 0 ? <p className="student-360-empty">No approved Profile Documents.</p> : (
          <ul className="student-360-record-list">{result.profileDocuments.data.map((document) => <li key={document.documentId}><article><header><div><span className="eyebrow">{formatDirectorCaseLabel(document.documentType)}</span><h3>{document.displayName}</h3></div><Link href={`/director/students/${identity.student_id}/documents/${document.documentId}/view`} target="_blank">View document</Link></header><DefinitionGrid values={[
            { label: "Original file", value: document.originalFileName },
            { label: "File type", value: document.mimeType },
            { label: "Size", value: formatBytes(document.fileSizeBytes) },
            { label: "Available", value: formatStudent360Timestamp(document.availableAt) },
          ]} /></article></li>)}</ul>
        )}
      </section>

      <section aria-labelledby="director-student-eligibility" className="student-360-section">
        <SectionHeading id="director-student-eligibility" title="Eligibility Assessment" />
        {result.eligibility.status === "unavailable" ? <SectionUnavailable /> : result.eligibility.data ? <>
          <DefinitionGrid values={[
            { label: "Overall", value: formatDirectorCaseLabel(result.eligibility.data.overall_status) },
            { label: "Academic", value: formatDirectorCaseLabel(result.eligibility.data.academic_status) },
            { label: "Backlogs", value: formatDirectorCaseLabel(result.eligibility.data.backlog_status) },
            { label: "English readiness", value: formatDirectorCaseLabel(result.eligibility.data.english_readiness) },
            { label: "Aptitude readiness", value: formatDirectorCaseLabel(result.eligibility.data.aptitude_readiness) },
            { label: "Profile strength", value: formatDirectorCaseLabel(result.eligibility.data.profile_strength) },
            { label: "Application readiness", value: formatDirectorCaseLabel(result.eligibility.data.application_readiness) },
            { label: "Recommended intake", value: result.eligibility.data.recommended_intake ?? STUDENT_360_FALLBACKS.notAdded },
            { label: "Assessor", value: result.eligibility.data.assessor_full_name },
            { label: "Assessed", value: formatStudent360Timestamp(result.eligibility.data.assessed_at) },
          ]} />
          <h3>Recommended countries</h3><TagList items={result.eligibility.data.recommended_countries} />
          <p>{result.eligibility.data.assessment_summary}</p>
        </> : <p className="student-360-empty">No approved Eligibility Assessment is available.</p>}
      </section>

      <section aria-labelledby="director-student-progress" className="student-360-section">
        <SectionHeading id="director-student-progress" title="Journey and Progress" />
        {result.caseDetail.progress.status === "unavailable" ? <SectionUnavailable /> : <>
          {result.caseDetail.progress.data.current ? <DefinitionGrid values={[
            { label: "Current stage", value: formatDirectorCaseLabel(result.caseDetail.progress.data.current.currentStage) },
            { label: "Current status", value: formatDirectorCaseLabel(result.caseDetail.progress.data.current.workflowState) },
            { label: "Stage started", value: formatStudent360Timestamp(result.caseDetail.progress.data.current.stageStartedAt) },
            { label: "Last changed", value: formatStudent360Timestamp(result.caseDetail.progress.data.current.lastChangedAt) },
          ]} /> : <p className="student-360-empty">Official progression has not started.</p>}
          <h3>Progress history</h3>
          {result.caseDetail.progress.data.history.length === 0 ? <p className="student-360-empty">No progression history.</p> : <ul className="student-360-record-list">{result.caseDetail.progress.data.history.map((event) => <li key={event.eventId}><strong>{formatDirectorCaseLabel(event.newStage)}</strong><span> · {formatDirectorCaseLabel(event.newState)} · {formatStudent360Timestamp(event.changedAt)}</span></li>)}</ul>}
        </>}
        <h3>Parent-safe semester summaries</h3>
        {result.caseDetail.semesterSummaries.status === "unavailable" ? <SectionUnavailable /> : result.caseDetail.semesterSummaries.data.length === 0 ? <p className="student-360-empty">No semester summaries.</p> : <ul className="student-360-record-list">{result.caseDetail.semesterSummaries.data.map((summary) => <li key={summary.summaryId}><article><header><h3>{summary.academicPeriod}</h3><time>{formatStudent360Timestamp(summary.createdAt)}</time></header><p>{summary.progressSummary}</p><DefinitionGrid values={[
          { label: "Achievements", value: summary.achievementsHighlights ?? STUDENT_360_FALLBACKS.notAdded },
          { label: "Areas requiring attention", value: summary.areasRequiringAttention ?? STUDENT_360_FALLBACKS.notAdded },
          { label: "Next semester actions", value: summary.nextSemesterActions },
          { label: "Counselor", value: summary.counselorFullName },
        ]} /></article></li>)}</ul>}
      </section>

      <section aria-labelledby="director-student-applications" className="student-360-section">
        <SectionHeading id="director-student-applications" title="University Application Journey" />
        {result.caseDetail.applications.status === "unavailable" ? <SectionUnavailable /> : result.caseDetail.applications.data.length === 0 ? <p className="student-360-empty">No university applications.</p> : <ul className="student-360-record-list">{result.caseDetail.applications.data.map((application) => <li key={application.applicationId}><article><header><div><span className="eyebrow">{application.countryCode} · {formatDirectorCaseLabel(application.applicationStatus)}</span><h3>{application.universityName}</h3><p>{application.programmeName}</p></div>{application.isPrimary && <span className="student-360-status">Primary</span>}</header><DefinitionGrid values={[
          { label: "Intake", value: `${formatDirectorCaseLabel(application.intakeTerm)} ${application.intakeYear}` },
          { label: "University decision", value: formatDirectorCaseLabel(application.journey.universityDecision) },
          { label: "Offer", value: formatDirectorCaseLabel(application.journey.offerStatus) },
          { label: "Student decision", value: formatDirectorCaseLabel(application.journey.studentDecision) },
          { label: "Fee/payment", value: formatDirectorCaseLabel(application.journey.feeStatus) },
          { label: "Visa", value: formatDirectorCaseLabel(application.journey.visaStatus) },
          { label: "Enrollment", value: formatDirectorCaseLabel(application.journey.enrollmentStatus) },
          { label: "Last changed", value: formatStudent360Timestamp(application.lastChangedAt) },
        ]} />{application.history.length > 0 && <details><summary>Journey history ({application.history.length})</summary><ul>{application.history.map((event) => <li key={event.eventId}>Version {event.versionNumber}: {formatDirectorCaseLabel(event.universityDecision)}, {formatDirectorCaseLabel(event.offerStatus)}, {formatDirectorCaseLabel(event.visaStatus)} — {formatStudent360Timestamp(event.changedAt)}</li>)}</ul></details>}</article></li>)}</ul>}
      </section>

      <section aria-labelledby="director-student-readiness" className="student-360-section">
        <SectionHeading id="director-student-readiness" title="Global Master&apos;s Readiness" />
        {result.caseDetail.readinessAssessments.status === "unavailable" ? <SectionUnavailable /> : result.caseDetail.readinessAssessments.data.length === 0 ? <p className="student-360-empty">No Global Master&apos;s Readiness assessment.</p> : result.caseDetail.readinessAssessments.data.map((assessment, index) => <article className="student-360-record-list" key={assessment.assessmentId}><header><div><span className="eyebrow">{index === 0 ? "Latest assessment" : `Revision ${assessment.revisionNumber}`}</span><h3>{assessment.totalScore} / 100 · {GLOBAL_READINESS_BAND_LABELS[assessment.readinessBand]}</h3></div><time>{formatStudent360Timestamp(assessment.assessedAt)}</time></header><DefinitionGrid values={GLOBAL_READINESS_DIMENSIONS.map((dimension) => ({ label: dimension.name, value: `${assessment.dimensionTotals[dimension.totalKey]} / ${dimension.maximum}` }))} /><details open={index === 0}><summary>13 criterion scores and rationales</summary><DefinitionGrid values={GLOBAL_READINESS_CRITERIA.map((criterion) => ({ label: criterion.label, value: `${assessment.scores[criterion.key]} / ${criterion.maximum}${assessment.rationales[criterion.key] ? ` — ${assessment.rationales[criterion.key]}` : ""}` }))} /></details><p>{assessment.assessmentRationale}</p>{assessment.parentSafeSummary && <p>{assessment.parentSafeSummary}</p>}<small>Assessed by {assessment.assessorFullName}. Safe evidence snapshot contains no document paths or private notes.</small></article>)}
      </section>

      <section aria-labelledby="director-student-consultations" className="student-360-section">
        <SectionHeading id="director-student-consultations" title="Consultation History" />
        {result.caseDetail.consultations.status === "unavailable" ? <SectionUnavailable /> : result.caseDetail.consultations.data.length === 0 ? <p className="student-360-empty">No consultation history.</p> : <ul className="student-360-record-list">{result.caseDetail.consultations.data.map((consultation) => <li key={consultation.consultationId}><article><header><h3>{consultation.requestNumber}</h3><span className="student-360-status">{formatDirectorCaseLabel(consultation.status)}</span></header><DefinitionGrid values={[
          { label: "Date", value: formatStudent360Date(consultation.consultationDate) },
          { label: "Time", value: consultation.slotStart && consultation.slotEnd ? `${consultation.slotStart}–${consultation.slotEnd}` : STUDENT_360_FALLBACKS.notAdded },
          { label: "Assigned Counselor", value: consultation.counselorFullName ?? "Awaiting assignment" },
          { label: "Outcome recorded", value: formatStudent360Timestamp(consultation.outcomeRecordedAt) },
        ]} /></article></li>)}</ul>}
      </section>

      <section aria-labelledby="director-student-primary-counselor" className="student-360-section">
        <SectionHeading id="director-student-primary-counselor" title="Primary Counselor" />
        {result.caseDetail.primaryCounselor.status === "unavailable" ? <SectionUnavailable /> : result.caseDetail.primaryCounselor.data ? <DefinitionGrid values={[
          { label: "Name", value: result.caseDetail.primaryCounselor.data.fullName ?? "Name not provided" },
          { label: "College email", value: result.caseDetail.primaryCounselor.data.collegeEmail },
          { label: "Status", value: "Active assignment" },
          { label: "Assigned", value: formatStudent360Timestamp(result.caseDetail.primaryCounselor.data.assignedAt) },
        ]} /> : <p className="student-360-empty">No active Primary Counselor assignment.</p>}
        <Link href="/director/students">Open assignment management</Link>
      </section>

      <section aria-labelledby="director-student-parent-reports" className="student-360-section">
        <SectionHeading id="director-student-parent-reports" title="Parent Reports" />
        <p>Parent Reports are the only Student-case workflow editable by Directors.</p>
        {result.caseDetail.parentReports.status === "unavailable" ? <SectionUnavailable /> : result.caseDetail.parentReports.data.length === 0 ? <p className="student-360-empty">No Parent Reports.</p> : <ul className="student-360-record-list">{result.caseDetail.parentReports.data.map((report) => <li key={report.reportId}><article><header><div><span className="eyebrow">Version {report.versionNumber} · {formatDirectorCaseLabel(report.status)}</span><h3>{report.academicPeriod}</h3></div><Link href={`/director/reports/${report.reportId}`}>Open report workspace</Link></header><DefinitionGrid values={[
          { label: "Updated", value: formatStudent360Timestamp(report.updatedAt) },
          { label: "Finalized", value: formatStudent360Timestamp(report.finalizedAt) },
          { label: "Final PDF", value: report.finalPdfAvailable ? "Available in report workspace" : "Not finalized" },
        ]} />{report.finalPdfAvailable && <Link href={`/director/reports/${report.reportId}/pdf`}>Preview final PDF</Link>}</article></li>)}</ul>}
        <Link href="/director/reports">View all Parent Reports</Link>
      </section>

      <footer className="student-360-readonly-note">
        <strong>Read-only director view</strong>
        <p>Student and case information cannot be edited from this page. Counselor private notes, private follow-ups, and Counselor-only commentary are not included. Parent Report actions remain available only in the existing report workspace.</p>
        {completion && <small>{completion.essential_fields_completed} of {completion.essential_fields_total} essential fields completed.</small>}
      </footer>
    </article>
  );
}
