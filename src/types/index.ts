export type UserRole = "student" | "counselor" | "admin" | "director";

export type ParentReportStatus =
  | "draft"
  | "director_review"
  | "revision_requested"
  | "approved"
  | "finalized";

export type ParentReportEventType =
  | "created"
  | "counselor_edited"
  | "submitted"
  | "director_edited"
  | "revision_requested"
  | "resubmitted"
  | "approved"
  | "finalized"
  | "new_version_created"
  | "attachment_added"
  | "attachment_removed";

export type ParentReportAttachmentSource =
  | "report_upload"
  | "profile_document"
  | "application_document"
  | "progression_evidence";

export type ParentReportAttachmentStatus = "pending" | "available" | "removed";

export type CounselorApprovalStatus = "pending" | "approved" | "rejected";

export type PublicProgressMetricKey =
  | "applications_initiated"
  | "applications_submitted"
  | "offers_received"
  | "confirmed_acceptance"
  | "visa_approved"
  | "enrolled_overseas";

export type KgeoPublicProgressValues = Record<PublicProgressMetricKey, number>;

export type KgeoPublicProgressSnapshot = {
  values: KgeoPublicProgressValues;
  publishedAt: string;
};

export type ConsultationStatus =
  | "submitted"
  | "waiting_for_assignment"
  | "counselor_assigned"
  | "scheduled"
  | "completed"
  | "no_show"
  | "cancelled";

export type HigherStudiesInterest =
  | "interested"
  | "exploring"
  | "not_interested";

export type ConsultationSlotAvailabilityStatus =
  | "available"
  | "booked"
  | "expired";

export type StudentConsultationAvailabilityStatus =
  | "available"
  | "unavailable"
  | "expired";

export type StudentProfileStatus = "draft" | "submitted";

export type StudentProfileDocumentType =
  | "passport"
  | "academic_transcript"
  | "test_score"
  | "sop"
  | "lor"
  | "financial_document"
  | "other_supporting_document";

export type StudentProfileDocumentStatus =
  | "pending"
  | "available"
  | "removed";

export type StudentProfileDocumentMimeType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png";

export type StudentProfileDocument = {
  documentId: string;
  documentType: StudentProfileDocumentType;
  displayName: string;
  originalFileName: string;
  mimeType: StudentProfileDocumentMimeType;
  fileSizeBytes: number;
  availableAt: string;
};

export type StudentDirectoryProfileState =
  | "profile_not_started"
  | "profile_in_progress"
  | "ready_for_counseling"
  | "submitted";

export type StudentPreferredStudyLevel =
  | "masters"
  | "postgraduate_diploma"
  | "mba"
  | "phd"
  | "global_track"
  | "other";

export type StudentStudyMode =
  | "full_time"
  | "part_time"
  | "either"
  | "on_campus"
  | "online";

export type StudentPreferredStudyArea =
  | "engineering"
  | "business"
  | "psychology";

export type StudentPreferredDomain =
  | "engineering_computing"
  | "engineering_electrical"
  | "engineering_mechanical"
  | "business_management"
  | "business_finance"
  | "business_analytics"
  | "psychology_clinical"
  | "psychology_counseling"
  | "psychology_organizational";

export type StudentStudyPathway = "masters_degree" | "global_track";

export type StudentGlobalTrackProgram =
  | "fifteen_day_program"
  | "one_year_program"
  | "two_year_program";

export type StudentFundingMethod =
  | "self_funded"
  | "education_loan"
  | "scholarship_fully_funded"
  | "scholarship_partially_funded"
  | "other";

export type StudentAcademicPreference =
  | "coursework"
  | "research"
  | "either"
  | "undecided";

export type StudentPlanningStage =
  | "exploring"
  | "preparing_exams"
  | "shortlisting"
  | "preparing_documents"
  | "applications_started";

export type StudentExamName =
  | "ielts"
  | "toefl"
  | "pte"
  | "gre"
  | "gmat"
  | "dmat"
  | "gate"
  | "other";

export type StudentExamStatus =
  | "not_planned"
  | "planning"
  | "booked"
  | "completed"
  | "not_required";

export type StudentAchievementType =
  | "internship"
  | "project"
  | "certification"
  | "research"
  | "publication"
  | "award"
  | "hackathon"
  | "leadership"
  | "volunteering"
  | "work_experience"
  | "sports"
  | "other";

export type StudentAchievementDocumentStatus =
  | "pending"
  | "available"
  | "removal_pending"
  | "removed";

export type StudentAchievementDocumentMimeType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png";

export type StudentAchievementDocumentRemovalReason =
  | "student_delete"
  | "pending_cancel"
  | "invalid_file";

export type StudentAchievementDocument = {
  documentId: string;
  achievementId: string;
  documentName: string;
  mimeType: StudentAchievementDocumentMimeType;
  fileSizeBytes: number;
  status: Exclude<StudentAchievementDocumentStatus, "removed">;
  preparedAt: string;
  uploadExpiresAt: string;
  availableAt: string | null;
};

export type StudentEligibilityStatus =
  | "needs_review"
  | "eligible"
  | "conditionally_eligible"
  | "not_yet_eligible";

export type StudentEligibilityAcademicStatus =
  | "needs_review"
  | "meets_requirement"
  | "conditionally_meets"
  | "does_not_meet";

export type StudentEligibilityBacklogStatus =
  | "needs_review"
  | "clear"
  | "acceptable"
  | "concern";

export type StudentEligibilityEnglishReadiness =
  | "needs_review"
  | "ready"
  | "in_progress"
  | "required";

export type StudentEligibilityAptitudeReadiness =
  | "needs_review"
  | "ready"
  | "in_progress"
  | "not_required"
  | "required";

export type StudentEligibilityProfileStrength =
  | "needs_review"
  | "strong"
  | "good"
  | "developing"
  | "weak";

export type StudentEligibilityApplicationReadiness =
  | "needs_review"
  | "ready"
  | "partially_ready"
  | "not_ready";

export type GlobalReadinessBand =
  | "early_readiness"
  | "developing_readiness"
  | "competitive_readiness"
  | "advanced_readiness"
  | "global_distinction";

export type CounselorFollowUpPriority = "low" | "normal" | "high";

export type CounselorFollowUpStatus =
  | "pending"
  | "completed"
  | "cancelled";

export type CounselingProgressionStage =
  | "profile_review"
  | "initial_counseling"
  | "goals_confirmed"
  | "country_exploration"
  | "program_shortlisting"
  | "university_shortlisting"
  | "test_preparation"
  | "document_preparation"
  | "application_ready"
  | "application_in_progress"
  | "offer_evaluation"
  | "visa_preparation"
  | "pre_departure";

export type CounselingProgressionState =
  | "active"
  | "on_hold"
  | "completed";

export type CounselingProgressionEvidenceStatus =
  | "pending"
  | "available"
  | "removed";

export type CounselingProgressionCorrectionType =
  | "undo_transition"
  | "reset_initialization";

export type UniversityApplicationStatus =
  | "planning"
  | "documents_collecting"
  | "application_preparing"
  | "ready_to_submit"
  | "submitted"
  | "under_university_review"
  | "additional_information_requested"
  | "decision_received"
  | "withdrawn"
  | "closed";

export type UniversityApplicationDegreeLevel =
  | "bachelors"
  | "masters"
  | "postgraduate_diploma"
  | "doctorate"
  | "other";

export type UniversityApplicationIntakeTerm =
  | "spring"
  | "summer"
  | "fall"
  | "winter"
  | "rolling"
  | "other";

export type UniversityApplicationEventType =
  | "created"
  | "details_updated"
  | "status_changed"
  | "primary_changed"
  | "archived";

export type UniversityApplicationDecision =
  | "pending"
  | "waitlisted"
  | "rejected"
  | "offer_received";

export type UniversityApplicationOfferStatus =
  | "none"
  | "conditional"
  | "unconditional";

export type UniversityApplicationStudentDecision =
  | "pending"
  | "accepted"
  | "declined";

export type UniversityApplicationFeeStatus =
  | "not_started"
  | "pending"
  | "paid";

export type UniversityApplicationVisaStatus =
  | "not_started"
  | "preparing"
  | "submitted"
  | "approved"
  | "refused";

export type UniversityApplicationEnrollmentStatus =
  | "not_enrolled"
  | "enrolled";

export type UniversityApplicationDocumentStatus =
  | "pending"
  | "available"
  | "removed";

export type UniversityApplicationDocumentMimeType =
  | "application/pdf"
  | "image/jpeg"
  | "image/png"
  | "image/webp";

export type UniversityApplicationDocumentMetadata = {
  id: string;
  applicationId: string;
  status: UniversityApplicationDocumentStatus;
  documentTitle: string;
  originalFileName: string;
  bucketId: string;
  storagePath: string;
  mimeType: UniversityApplicationDocumentMimeType;
  fileSizeBytes: number;
  uploadedBy: string;
  preparedAt: string;
  uploadExpiresAt: string;
  availableAt: string | null;
  removedAt: string | null;
  removedBy: string | null;
  removalReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CounselorUniversityApplicationDocument = {
  documentId: string;
  applicationId: string;
  documentTitle: string;
  originalFileName: string;
  mimeType: UniversityApplicationDocumentMimeType;
  fileSizeBytes: number;
  availableAt: string;
};

export type StudentUniversityApplicationSummary = {
  applicationId: string;
  universityName: string;
  programmeName: string;
  countryCode: string;
  degreeLevel: UniversityApplicationDegreeLevel;
  intakeTerm: UniversityApplicationIntakeTerm;
  intakeYear: number;
  currentStatus: UniversityApplicationStatus;
  submissionDeadline: string | null;
  submittedAt: string | null;
  isPrimary: boolean;
  lastChangedAt: string;
};

export type CounselorUniversityApplicationWorkspaceEntry = {
  applicationId: string;
  studentId: string;
  studentFullName: string | null;
  collegeEmail: string;
  rollNumber: string | null;
  universityName: string;
  programmeName: string;
  countryCode: string;
  degreeLevel: UniversityApplicationDegreeLevel;
  intakeTerm: UniversityApplicationIntakeTerm;
  intakeYear: number;
  currentStatus: UniversityApplicationStatus;
  applicationReference: string | null;
  submissionDeadline: string | null;
  submittedAt: string | null;
  isPrimary: boolean;
  isArchived: boolean;
  lastChangedAt: string;
  availableDocumentCount: number;
};

export type CounselorUniversityApplicationWorkspaceMetrics = {
  totalActiveApplications: number;
  totalArchivedApplications: number;
  studentsWithApplications: number;
  primaryApplications: number;
  planningCount: number;
  documentsCollectingCount: number;
  applicationPreparingCount: number;
  readyToSubmitCount: number;
  submittedCount: number;
  underUniversityReviewCount: number;
  additionalInformationRequestedCount: number;
  decisionReceivedCount: number;
  withdrawnCount: number;
  closedCount: number;
  overdueDeadlineCount: number;
  dueNext30DaysCount: number;
};

export type DirectorAttentionType =
  | "overdue_application_deadline"
  | "due_soon_application_deadline"
  | "additional_information_requested"
  | "pending_consultation_outcome";

export type DirectorAttentionSeverity = "high" | "medium";

export type DirectorDashboardMetrics = {
  totalStudents: number;
  activeStudents: number;
  activeCounselors: number;
  consultationsToday: number;
  upcomingScheduledConsultations: number;
  unresolvedPastConsultations: number;
  completedConsultations: number;
  noShowConsultations: number;
  pendingFollowUps: number;
  overdueFollowUps: number;
  dueTodayFollowUps: number;
  activeProgressions: number;
  onHoldProgressions: number;
  completedProgressions: number;
  activeApplications: number;
  submittedApplications: number;
  additionalInformationRequestedApplications: number;
  overdueApplicationDeadlines: number;
};

export type DirectorCounselorWorkloadSummary = {
  counselorId: string;
  counselorFullName: string | null;
  collegeEmail: string;
  isActive: boolean;
  pendingFollowUps: number;
  overdueFollowUps: number;
  pendingOutcomes: number;
  consultationsToday: number;
};

export type DirectorProgressionFilter =
  | "not_started"
  | CounselingProgressionState;

export type DirectorStudentOversightEntry = {
  studentId: string;
  fullName: string | null;
  collegeEmail: string;
  isActive: boolean;
  accountCreatedAt: string;
  course: string | null;
  department: string | null;
  graduationYear: number | null;
  profileState: StudentDirectoryProfileState;
  progressionStage: CounselingProgressionStage | null;
  progressionState: CounselingProgressionState | null;
  totalConsultations: number;
  openConsultations: number;
  activeApplications: number;
  primaryCounselorId: string | null;
  primaryCounselorFullName: string | null;
  primaryCounselorCollegeEmail: string | null;
  primaryCounselorAssignedAt: string | null;
};

export type CounselorPrimaryStudent = {
  assignmentId: string;
  studentId: string;
  fullName: string | null;
  collegeEmail: string;
  isActive: boolean;
  course: string | null;
  department: string | null;
  assignedAt: string;
};

export type DirectorConsultationOversightEntry = {
  consultationId: string;
  requestNumber: string;
  studentId: string;
  studentFullName: string | null;
  studentCollegeEmail: string;
  counselorId: string | null;
  counselorFullName: string | null;
  counselorCollegeEmail: string | null;
  consultationDate: string;
  slotStart: string;
  slotEnd: string;
  consultationStatus: ConsultationStatus;
  outcomeRecordedAt: string | null;
  submittedAt: string;
};

export type DirectorApplicationOversightEntry = {
  applicationId: string;
  studentId: string;
  studentFullName: string | null;
  studentCollegeEmail: string;
  counselorId: string | null;
  counselorFullName: string | null;
  counselorCollegeEmail: string | null;
  universityName: string;
  programmeName: string;
  countryCode: string;
  degreeLevel: UniversityApplicationDegreeLevel;
  intakeTerm: UniversityApplicationIntakeTerm;
  intakeYear: number;
  applicationStatus: UniversityApplicationStatus;
  submissionDeadline: string | null;
  submittedAt: string | null;
  isPrimary: boolean;
  isArchived: boolean;
  lastChangedAt: string;
};

export type DirectorAttentionItem = {
  attentionType: DirectorAttentionType;
  severity: DirectorAttentionSeverity;
  studentId: string;
  studentFullName: string | null;
  collegeEmail: string;
  applicationId: string | null;
  consultationId: string | null;
  applicationStatus: UniversityApplicationStatus | null;
  submissionDeadline: string | null;
  consultationScheduledAt: string | null;
};

export type ActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string[]>;
};

export const initialActionState: ActionState = { status: "idle" };

export type ConsultationReceipt = {
  request_number: string;
  status: ConsultationStatus;
  consultation_date: string;
  slot_start: string;
  slot_end: string;
};

export type ConsultationActionState = ActionState & {
  receipt?: ConsultationReceipt;
  refreshAvailability?: boolean;
};

export const initialConsultationActionState: ConsultationActionState = {
  status: "idle",
};
