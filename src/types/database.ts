import type {
  CounselingProgressionCorrectionType,
  CounselingProgressionEvidenceStatus,
  CounselingProgressionStage,
  CounselingProgressionState,
  CounselorApprovalStatus,
  CounselorFollowUpPriority,
  CounselorFollowUpStatus,
  GlobalReadinessBand,
  ConsultationSlotAvailabilityStatus,
  ConsultationStatus,
  HigherStudiesInterest,
  ParentReportAttachmentSource,
  ParentReportAttachmentStatus,
  ParentReportEventType,
  ParentReportStatus,
  StudentConsultationAvailabilityStatus,
  StudentAcademicPreference,
  StudentAchievementDocumentMimeType,
  StudentAchievementDocumentRemovalReason,
  StudentAchievementDocumentStatus,
  StudentAchievementType,
  StudentDirectoryProfileState,
  StudentExamName,
  StudentExamStatus,
  StudentEligibilityAcademicStatus,
  StudentEligibilityApplicationReadiness,
  StudentEligibilityAptitudeReadiness,
  StudentEligibilityBacklogStatus,
  StudentEligibilityEnglishReadiness,
  StudentEligibilityProfileStrength,
  StudentEligibilityStatus,
  StudentPlanningStage,
  StudentPreferredDomain,
  StudentPreferredStudyArea,
  StudentGlobalTrackProgram,
  StudentProfileDocumentMimeType,
  StudentProfileDocumentStatus,
  StudentProfileDocumentType,
  StudentPreferredStudyLevel,
  StudentStudyPathway,
  StudentFundingMethod,
  StudentProfileStatus,
  StudentStudyMode,
  UniversityApplicationDegreeLevel,
  UniversityApplicationDecision,
  UniversityApplicationDocumentMimeType,
  UniversityApplicationDocumentStatus,
  UniversityApplicationEnrollmentStatus,
  UniversityApplicationEventType,
  UniversityApplicationFeeStatus,
  UniversityApplicationIntakeTerm,
  UniversityApplicationOfferStatus,
  UniversityApplicationStatus,
  UniversityApplicationStudentDecision,
  UniversityApplicationVisaStatus,
  UserRole,
} from "@/types";

type ProfileRow = {
  id: string;
  college_email: string;
  role: UserRole;
  full_name: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

type CounselorAccountRow = {
  user_id: string;
  username: string;
  approval_status: CounselorApprovalStatus;
  approved_by: string | null;
  approved_at: string | null;
  rejected_by: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
};

type DirectorCounselorAccountRow = Pick<
  CounselorAccountRow,
  "user_id" | "username" | "approval_status" | "created_at"
> & {
  full_name: string | null;
  is_active: boolean;
};

type KgeoPublicProgressRow = {
  singleton: boolean;
  registered_for_advisory: number;
  applications_initiated: number;
  applications_submitted: number;
  offers_received: number;
  confirmed_acceptance: number;
  visa_approved: number;
  enrolled_overseas: number;
  updated_by: string;
  updated_at: string;
};

type PublicKgeoProgressRow = {
  registered_for_advisory: number;
  applications_initiated: number;
  applications_submitted: number;
  offers_received: number;
  confirmed_acceptance: number;
  visa_approved: number;
  enrolled_overseas: number;
  published_at: string;
};

type PublicProgressPublishedRow = {
  published_at: string;
};

type ConsultationRequestRow = {
  id: string;
  student_id: string;
  request_number: string;
  student_name: string;
  roll_number: string;
  college_email: string;
  personal_email: string;
  college_end_year: number;
  department: string;
  course: string;
  mobile_number: string;
  higher_studies_interest: HigherStudiesInterest;
  status: ConsultationStatus;
  assigned_counselor_id: string | null;
  consultation_date: string | null;
  slot_start: string | null;
  slot_end: string | null;
  outcome_recorded_at: string | null;
  outcome_recorded_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  submitted_at: string;
  assigned_at: string | null;
  created_at: string;
  updated_at: string;
};

type ConsultationRequestInsert = Pick<
  ConsultationRequestRow,
  | "student_name"
  | "roll_number"
  | "personal_email"
  | "college_end_year"
  | "department"
  | "course"
  | "mobile_number"
  | "higher_studies_interest"
  | "consultation_date"
  | "slot_start"
>;

type StudentCounselorAssignmentRow = {
  id: string;
  student_id: string;
  counselor_id: string;
  assigned_at: string;
  assigned_by: string | null;
  ended_at: string | null;
  created_at: string;
  assignment_reason: string | null;
};

type CounselorConsultationSlotBlockRow = {
  id: string;
  counselor_id: string;
  consultation_date: string;
  slot_start: string;
  reason: string | null;
  created_at: string;
  released_at: string | null;
  released_by: string | null;
};

type CounselorAssignedConsultationRow = {
  id: string;
  request_number: string;
  student_id: string | null;
  student_name: string;
  course: string;
  department: string;
  college_end_year: number;
  cgpa: number | null;
  cgpa_scale: number | null;
  active_backlogs: number | null;
  higher_studies_interest: HigherStudiesInterest;
  target_intake: string | null;
  preferred_countries: string[];
  ready_for_counseling: boolean | null;
  consultation_date: string | null;
  slot_start: string | null;
  slot_end: string | null;
  status: ConsultationStatus;
  submitted_at: string;
  is_primary_counselor: boolean;
};

type CounselorConsultationDashboardMetricsRow = {
  today_count: number;
  upcoming_count: number;
  outcome_required_count: number;
  completed_count: number;
  no_show_count: number;
  cancelled_count: number;
};

type CounselorActiveSlotBlockRow = {
  block_id: string;
  consultation_date: string;
  slot_start: string;
  slot_end: string;
  reason: string | null;
  created_at: string;
};

type StudentConsultationBookingReceiptRow = {
  request_number: string;
  consultation_date: string;
  slot_start: string;
  slot_end: string;
  status: ConsultationStatus;
};

type StudentEligibilityAssessmentRow = {
  id: string;
  student_id: string;
  overall_status: StudentEligibilityStatus;
  academic_status: StudentEligibilityAcademicStatus;
  backlog_status: StudentEligibilityBacklogStatus;
  english_readiness: StudentEligibilityEnglishReadiness;
  aptitude_readiness: StudentEligibilityAptitudeReadiness;
  profile_strength: StudentEligibilityProfileStrength;
  application_readiness: StudentEligibilityApplicationReadiness;
  recommended_countries: string[];
  recommended_intake: string | null;
  assessment_summary: string;
  assessed_by: string;
  assessed_at: string;
};

type StudentEligibilityAssessmentReadRow = Omit<
  StudentEligibilityAssessmentRow,
  "id" | "student_id" | "assessed_by"
> & {
  assessment_id: string;
  assessor_full_name: string;
};

type StudentEligibilityLatestRow = Pick<
  StudentEligibilityAssessmentRow,
  "overall_status" | "assessed_at"
>;

type DirectorStudentEligibilityLatestRow = Omit<
  StudentEligibilityAssessmentReadRow,
  "assessment_id"
> & {
  student_id: string;
};

type StudentEligibilityAssessmentSavedRow = {
  assessment_id: string;
  assessed_at: string;
};

type StudentGlobalReadinessAssessmentRow = {
  id: string;
  student_id: string;
  revision_number: number;
  primary_assignment_id: string;
  assessed_by: string;
  rubric_version: string;
  academic_readiness_score: number;
  intellectual_projects_score: number;
  intellectual_distinction_score: number;
  professional_experience_score: number;
  professional_industry_score: number;
  global_leadership_score: number;
  global_exposure_score: number;
  global_distinction_score: number;
  application_gmap_score: number;
  application_advisory_score: number;
  application_documents_score: number;
  application_shortlist_score: number;
  application_submitted_score: number;
  academic_readiness_rationale: string | null;
  intellectual_projects_rationale: string | null;
  intellectual_distinction_rationale: string | null;
  professional_experience_rationale: string | null;
  professional_industry_rationale: string | null;
  global_leadership_rationale: string | null;
  global_exposure_rationale: string | null;
  global_distinction_rationale: string | null;
  application_gmap_rationale: string | null;
  application_advisory_rationale: string | null;
  application_documents_rationale: string | null;
  application_shortlist_rationale: string | null;
  application_submitted_rationale: string | null;
  academic_readiness_total: number;
  intellectual_depth_total: number;
  professional_readiness_total: number;
  global_leadership_total: number;
  application_strength_total: number;
  total_score: number;
  readiness_band: GlobalReadinessBand;
  assessment_rationale: string;
  parent_safe_summary: string | null;
  evidence_schema_version: number;
  evidence_snapshot: Record<string, unknown>;
  evidence_captured_at: string;
  assessed_at: string;
  created_at: string;
};

type StudentProfileRow = {
  student_id: string;
  roll_number: string;
  personal_email: string;
  mobile_number: string;
  college: string;
  course: string;
  department: string;
  current_year: number | null;
  current_semester: number | null;
  graduation_year: number;
  cgpa: number | null;
  cgpa_scale: number;
  cgpa_unavailable: boolean;
  active_backlogs: number;
  cleared_backlogs: number;
  sslc_percentage: number | null;
  hsc_percentage: number | null;
  diploma_percentage: number | null;
  academic_remarks: string | null;
  profile_status: StudentProfileStatus;
  profile_submitted_at: string | null;
  resume_path: string | null;
  last_pr_generated_at: string | null;
  created_at: string;
  updated_at: string;
};

type StudentProfileInsert = Pick<
  StudentProfileRow,
  | "roll_number"
  | "personal_email"
  | "mobile_number"
  | "college"
  | "course"
  | "department"
  | "graduation_year"
> &
  Partial<
    Pick<
      StudentProfileRow,
      | "current_year"
      | "current_semester"
      | "cgpa"
      | "cgpa_scale"
      | "cgpa_unavailable"
      | "active_backlogs"
      | "cleared_backlogs"
      | "sslc_percentage"
      | "hsc_percentage"
      | "diploma_percentage"
      | "academic_remarks"
      | "resume_path"
      | "last_pr_generated_at"
    >
  >;

type StudentProfileUpdate = Partial<StudentProfileInsert>;

type StudentPreferenceRow = {
  student_id: string;
  higher_studies_interest: HigherStudiesInterest;
  preferred_study_level: StudentPreferredStudyLevel | null;
  preferred_countries: string[];
  preferred_program_areas: string[];
  preferred_courses: string[];
  preferred_study_area: StudentPreferredStudyArea | null;
  preferred_domain: StudentPreferredDomain | null;
  study_pathway: StudentStudyPathway | null;
  global_track_program: StudentGlobalTrackProgram | null;
  target_intake: string | null;
  budget_range: string | null;
  scholarship_required: boolean | null;
  funding_required: boolean | null;
  funding_method: StudentFundingMethod | null;
  study_mode: StudentStudyMode | null;
  academic_preference: StudentAcademicPreference | null;
  student_planning_stage: StudentPlanningStage | null;
  same_as_ug: boolean | null;
  domain_specializations: string[] | null;
  global_track_duration: string | null;
  created_at: string;
  updated_at: string;
};

type StudentPreferenceInsert = Pick<
  StudentPreferenceRow,
  "higher_studies_interest"
> &
  Partial<
    Pick<
      StudentPreferenceRow,
      | "preferred_study_level"
      | "preferred_countries"
      | "preferred_program_areas"
      | "preferred_courses"
      | "preferred_study_area"
      | "preferred_domain"
      | "study_pathway"
      | "global_track_program"
      | "target_intake"
      | "budget_range"
      | "scholarship_required"
      | "funding_required"
      | "funding_method"
      | "study_mode"
      | "academic_preference"
      | "student_planning_stage"
      | "same_as_ug"
      | "domain_specializations"
      | "global_track_duration"
    >
  >;

type StudentTestScoreRow = {
  id: string;
  student_id: string;
  exam_name: StudentExamName;
  custom_exam_name: string | null;
  exam_status: StudentExamStatus;
  attempt_number: number;
  planned_date: string | null;
  completed_date: string | null;
  score: string | null;
  valid_until: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
};

type StudentTestScoreInsert = Pick<
  StudentTestScoreRow,
  "exam_name" | "exam_status"
> &
  Partial<
    Pick<
      StudentTestScoreRow,
      | "custom_exam_name"
      | "attempt_number"
      | "planned_date"
      | "completed_date"
      | "score"
      | "valid_until"
      | "remarks"
    >
  >;

type StudentAchievementRow = {
  id: string;
  student_id: string;
  achievement_type: StudentAchievementType;
  title: string;
  organization: string | null;
  achievement_date: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type StudentAchievementInsert = Pick<
  StudentAchievementRow,
  "achievement_type" | "title"
> &
  Partial<
    Pick<
      StudentAchievementRow,
      "organization" | "achievement_date" | "description"
    >
  >;

type StudentProfileCompletionRow = {
  student_id: string;
  profile_status: StudentProfileStatus;
  academic_section_complete: boolean;
  preferences_section_complete: boolean;
  test_scores_section_started: boolean;
  achievements_section_started: boolean;
  essential_fields_completed: number;
  essential_fields_total: number;
  overall_completion_percentage: number;
  ready_for_counseling: boolean;
};

type CounselorStudentDirectoryRow = {
  student_id: string;
  full_name: string | null;
  college_email: string;
  account_created_at: string;
  is_active: boolean;
  roll_number: string | null;
  college: string | null;
  course: string | null;
  department: string | null;
  graduation_year: number | null;
  profile_state: StudentDirectoryProfileState;
  completion_percentage: number;
  ready_for_counseling: boolean;
  higher_studies_interest: HigherStudiesInterest | null;
  preferred_study_level: StudentPreferredStudyLevel | null;
  target_intake: string | null;
  last_profile_update: string | null;
  total_count: number;
};

type CounselorStudentIdentityRow = Pick<
  CounselorStudentDirectoryRow,
  | "student_id"
  | "full_name"
  | "college_email"
  | "account_created_at"
  | "is_active"
>;

type CounselorStudentNoteRow = {
  id: string;
  student_id: string;
  counselor_id: string;
  consultation_id: string | null;
  note_text: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

type CounselorStudentNoteInsert = Pick<
  CounselorStudentNoteRow,
  "student_id" | "note_text"
> &
  Partial<
    Pick<
      CounselorStudentNoteRow,
      "consultation_id" | "is_pinned"
    >
  >;

type CounselorFollowUpRow = {
  id: string;
  student_id: string;
  counselor_id: string;
  consultation_id: string | null;
  due_date: string;
  priority: CounselorFollowUpPriority;
  status: CounselorFollowUpStatus;
  next_action: string;
  details: string | null;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
};

type CounselorFollowUpInsert = Pick<
  CounselorFollowUpRow,
  "student_id" | "due_date" | "priority" | "next_action"
> &
  Partial<
    Pick<CounselorFollowUpRow, "consultation_id" | "details">
  >;

type StudentAchievementDocumentRow = {
  id: string;
  achievement_id: string | null;
  achievement_reference_id: string;
  student_id: string;
  document_name: string;
  bucket_id: string;
  storage_path: string;
  mime_type: StudentAchievementDocumentMimeType;
  file_size_bytes: number;
  status: StudentAchievementDocumentStatus;
  uploaded_by: string;
  prepared_at: string;
  upload_expires_at: string;
  detected_mime_type: StudentAchievementDocumentMimeType | null;
  signature_validated_at: string | null;
  available_at: string | null;
  removal_requested_at: string | null;
  removal_reason: StudentAchievementDocumentRemovalReason | null;
  removed_at: string | null;
  removed_by: string | null;
  created_at: string;
  updated_at: string;
};

type StudentAchievementDocumentSafeRow = Pick<
  StudentAchievementDocumentRow,
  | "achievement_id"
  | "document_name"
  | "mime_type"
  | "file_size_bytes"
  | "status"
  | "prepared_at"
  | "upload_expires_at"
  | "available_at"
> & { document_id: string };

type StudentAchievementDocumentUploadIntentRow = Pick<
  StudentAchievementDocumentRow,
  | "achievement_id"
  | "document_name"
  | "bucket_id"
  | "storage_path"
  | "mime_type"
  | "file_size_bytes"
  | "upload_expires_at"
> & { document_id: string };

type StudentAchievementDocumentViewAuthorizationRow = Pick<
  StudentAchievementDocumentRow,
  "bucket_id" | "storage_path" | "mime_type"
> & { document_id: string };

type StudentAchievementDocumentDeleteAuthorizationRow = Pick<
  StudentAchievementDocumentRow,
  "bucket_id" | "storage_path"
> & {
  document_id: string;
  storage_object_exists: boolean;
  removed_at: string | null;
};

type StudentAchievementDocumentValidationAuthorizationRow = Pick<
  StudentAchievementDocumentRow,
  "bucket_id" | "storage_path" | "mime_type" | "file_size_bytes"
> & { document_id: string };

type StudentAchievementDocumentDeleteFinalizedRow = {
  document_id: string;
  removed_at: string;
};

type CounselorStudentSemesterSummaryRow = {
  id: string;
  student_id: string;
  academic_period: string;
  progress_summary: string;
  achievements_highlights: string | null;
  areas_requiring_attention: string | null;
  next_semester_actions: string;
  created_by: string;
  created_at: string;
};

type CounselorStudentSemesterSummaryReadRow = Omit<
  CounselorStudentSemesterSummaryRow,
  "id" | "student_id" | "created_by"
> & {
  summary_id: string;
  counselor_full_name: string;
};

type CounselorStudentSemesterSummarySavedRow = Omit<
  CounselorStudentSemesterSummaryReadRow,
  "counselor_full_name"
>;

type CounselorFollowUpWorkloadRow = {
  follow_up_id: string | null;
  student_id: string | null;
  consultation_id: string | null;
  due_date: string | null;
  priority: CounselorFollowUpPriority | null;
  stored_status: CounselorFollowUpStatus | null;
  next_action: string | null;
  completed_at: string | null;
  created_at: string | null;
  updated_at: string | null;
  full_name: string | null;
  college_email: string | null;
  roll_number: string | null;
  total_count: number;
  overdue_count: number;
  due_today_count: number;
  upcoming_count: number;
  completed_count: number;
  cancelled_count: number;
  total_pending_count: number;
};

type StudentCounselingProgressionRow = {
  student_id: string;
  current_stage: CounselingProgressionStage;
  workflow_state: CounselingProgressionState;
  stage_started_at: string;
  last_changed_at: string;
  last_changed_by: string;
  created_at: string;
  updated_at: string;
};

type StudentCounselingProgressionInsert = Pick<
  StudentCounselingProgressionRow,
  "student_id" | "current_stage" | "last_changed_by"
> &
  Partial<
    Pick<
      StudentCounselingProgressionRow,
      | "workflow_state"
      | "stage_started_at"
      | "last_changed_at"
      | "created_at"
      | "updated_at"
    >
  >;

type StudentCounselingProgressionEventRow = {
  id: string;
  student_id: string;
  previous_stage: CounselingProgressionStage | null;
  new_stage: CounselingProgressionStage;
  previous_state: CounselingProgressionState | null;
  new_state: CounselingProgressionState;
  changed_by: string;
  change_reason: string | null;
  changed_at: string;
};

type StudentCounselingProgressionEventInsert = Omit<
  StudentCounselingProgressionEventRow,
  "id" | "changed_at"
> &
  Partial<
    Pick<StudentCounselingProgressionEventRow, "id" | "changed_at">
  >;

type StudentCounselingProgressionEvidenceRow = {
  id: string;
  progression_event_id: string;
  bucket_id: string;
  storage_path: string;
  original_file_name: string;
  mime_type: string;
  file_size_bytes: number;
  status: CounselingProgressionEvidenceStatus;
  uploaded_by: string;
  prepared_at: string;
  upload_expires_at: string;
  available_at: string | null;
  removed_at: string | null;
  removed_by: string | null;
  removal_reason: string | null;
  created_at: string;
  updated_at: string;
};

type StudentCounselingProgressionEvidenceInsert = Pick<
  StudentCounselingProgressionEvidenceRow,
  | "progression_event_id"
  | "storage_path"
  | "original_file_name"
  | "mime_type"
  | "file_size_bytes"
  | "uploaded_by"
  | "prepared_at"
  | "upload_expires_at"
  | "created_at"
  | "updated_at"
> &
  Partial<
    Pick<
      StudentCounselingProgressionEvidenceRow,
      | "id"
      | "bucket_id"
      | "status"
      | "available_at"
      | "removed_at"
      | "removed_by"
      | "removal_reason"
    >
  >;

type ProgressionEvidenceUploadIntentRow = Pick<
  StudentCounselingProgressionEvidenceRow,
  | "progression_event_id"
  | "bucket_id"
  | "storage_path"
  | "original_file_name"
  | "mime_type"
  | "file_size_bytes"
  | "upload_expires_at"
> & {
  evidence_id: string;
};

type RemovedProgressionEvidenceRow = Pick<
  StudentCounselingProgressionEvidenceRow,
  "bucket_id" | "storage_path" | "status" | "removed_at"
> & {
  evidence_id: string;
};

type StudentCounselingProgressionEventCorrectionRow = {
  id: string;
  target_event_id: string;
  correction_type: CounselingProgressionCorrectionType;
  restored_stage: CounselingProgressionStage | null;
  restored_state: CounselingProgressionState | null;
  restored_stage_started_at: string | null;
  corrected_by: string;
  correction_reason: string;
  corrected_at: string;
};

type StudentCounselingProgressionEventCorrectionInsert = Pick<
  StudentCounselingProgressionEventCorrectionRow,
  | "target_event_id"
  | "correction_type"
  | "corrected_by"
  | "correction_reason"
> &
  Partial<
    Pick<
      StudentCounselingProgressionEventCorrectionRow,
      | "id"
      | "restored_stage"
      | "restored_state"
      | "restored_stage_started_at"
      | "corrected_at"
    >
  >;

type ProgressionCorrectionResultRow = {
  correction_id: string;
  target_event_id: string;
  correction_type: CounselingProgressionCorrectionType;
  current_progression_exists: boolean;
  restored_stage: CounselingProgressionStage | null;
  restored_state: CounselingProgressionState | null;
  restored_stage_started_at: string | null;
  corrected_at: string;
};

type ProgressionCorrectionContextRow = {
  target_event_id: string;
  correction_id: string | null;
  correction_type: CounselingProgressionCorrectionType | null;
  restored_stage: CounselingProgressionStage | null;
  restored_state: CounselingProgressionState | null;
  restored_stage_started_at: string | null;
  correction_reason: string | null;
  corrected_at: string | null;
  effective_event_exists: boolean;
  latest_effective_event_id: string | null;
  latest_effective_stage: CounselingProgressionStage | null;
  latest_effective_state: CounselingProgressionState | null;
  latest_effective_changed_at: string | null;
  latest_effective_changed_by: string | null;
  total_correction_count: number;
};

type StudentUniversityApplicationRow = {
  id: string;
  student_id: string;
  country_code: string;
  university_name: string;
  programme_name: string;
  degree_level: UniversityApplicationDegreeLevel;
  intake_term: UniversityApplicationIntakeTerm;
  intake_year: number;
  current_status: UniversityApplicationStatus;
  application_reference: string | null;
  portal_url: string | null;
  submission_deadline: string | null;
  submitted_at: string | null;
  is_primary: boolean;
  is_archived: boolean;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
  version_number: number;
  created_by: string;
  last_changed_by: string;
  created_at: string;
  updated_at: string;
  last_changed_at: string;
};

type StudentUniversityApplicationInsert = Pick<
  StudentUniversityApplicationRow,
  | "student_id"
  | "country_code"
  | "university_name"
  | "programme_name"
  | "degree_level"
  | "intake_term"
  | "intake_year"
  | "created_by"
  | "last_changed_by"
> &
  Partial<
    Pick<
      StudentUniversityApplicationRow,
      | "id"
      | "current_status"
      | "application_reference"
      | "portal_url"
      | "submission_deadline"
      | "submitted_at"
      | "is_primary"
      | "is_archived"
      | "archived_at"
      | "archived_by"
      | "archive_reason"
      | "version_number"
      | "created_at"
      | "updated_at"
      | "last_changed_at"
    >
  >;

type StudentUniversityApplicationEventRow = {
  id: string;
  application_id: string;
  event_type: UniversityApplicationEventType;
  version_number: number;
  country_code: string;
  university_name: string;
  programme_name: string;
  degree_level: UniversityApplicationDegreeLevel;
  intake_term: UniversityApplicationIntakeTerm;
  intake_year: number;
  application_status: UniversityApplicationStatus;
  application_reference: string | null;
  portal_url: string | null;
  submission_deadline: string | null;
  submitted_at: string | null;
  is_primary: boolean;
  is_archived: boolean;
  change_reason: string | null;
  changed_by: string;
  changed_at: string;
};

type StudentUniversityApplicationEventInsert = Omit<
  StudentUniversityApplicationEventRow,
  "id" | "changed_at"
> &
  Partial<
    Pick<StudentUniversityApplicationEventRow, "id" | "changed_at">
  >;

type UniversityApplicationMutationResultRow = Pick<
  StudentUniversityApplicationRow,
  | "student_id"
  | "current_status"
  | "is_primary"
  | "is_archived"
  | "version_number"
  | "created_at"
  | "updated_at"
  | "last_changed_at"
> & {
  application_id: string;
};

type UniversityApplicationArchiveResultRow = Pick<
  StudentUniversityApplicationRow,
  | "student_id"
  | "is_archived"
  | "is_primary"
  | "version_number"
  | "archived_at"
  | "updated_at"
> & {
  application_id: string;
};

type StudentUniversityApplicationSummaryRow = {
  application_id: string;
  university_name: string;
  programme_name: string;
  country_code: string;
  degree_level: UniversityApplicationDegreeLevel;
  intake_term: UniversityApplicationIntakeTerm;
  intake_year: number;
  current_status: UniversityApplicationStatus;
  submission_deadline: string | null;
  submitted_at: string | null;
  is_primary: boolean;
  last_changed_at: string;
};

type UniversityApplicationJourneyRow = {
  application_id: string;
  university_decision: UniversityApplicationDecision;
  university_decision_date: string | null;
  offer_status: UniversityApplicationOfferStatus;
  offer_date: string | null;
  conditional_offer_requirements: string | null;
  condition_due_date: string | null;
  conditions_satisfied_date: string | null;
  student_decision: UniversityApplicationStudentDecision;
  student_decision_date: string | null;
  fee_status: UniversityApplicationFeeStatus;
  fee_payment_date: string | null;
  visa_status: UniversityApplicationVisaStatus;
  visa_submission_date: string | null;
  visa_decision_date: string | null;
  enrollment_status: UniversityApplicationEnrollmentStatus;
  enrollment_date: string | null;
  version_number: number;
  created_by: string;
  last_changed_by: string;
  created_at: string;
  updated_at: string;
};

type UniversityApplicationJourneyInsert = Omit<
  UniversityApplicationJourneyRow,
  "created_at" | "updated_at"
> &
  Partial<Pick<UniversityApplicationJourneyRow, "created_at" | "updated_at">>;

type UniversityApplicationJourneyEventRow = Omit<
  UniversityApplicationJourneyRow,
  "created_by" | "last_changed_by" | "created_at" | "updated_at"
> & {
  id: string;
  change_reason: string;
  changed_by: string;
  changed_at: string;
};

type UniversityApplicationJourneyEventInsert = Omit<
  UniversityApplicationJourneyEventRow,
  "id"
> &
  Partial<Pick<UniversityApplicationJourneyEventRow, "id">>;

type UniversityApplicationJourneyProjectionRow = Omit<
  UniversityApplicationJourneyRow,
  "created_by" | "last_changed_by" | "created_at"
>;

type UniversityApplicationJourneySafeRow = Omit<
  UniversityApplicationJourneyProjectionRow,
  "version_number"
>;

type UniversityApplicationJourneyHistoryRow = Omit<
  UniversityApplicationJourneyEventRow,
  "application_id" | "changed_by" | "id"
> & {
  event_id: string;
};

type CounselorUniversityApplicationWorkspaceRow = {
  application_id: string | null;
  student_id: string | null;
  student_full_name: string | null;
  college_email: string | null;
  roll_number: string | null;
  university_name: string | null;
  programme_name: string | null;
  country_code: string | null;
  degree_level: UniversityApplicationDegreeLevel | null;
  intake_term: UniversityApplicationIntakeTerm | null;
  intake_year: number | null;
  current_status: UniversityApplicationStatus | null;
  application_reference: string | null;
  submission_deadline: string | null;
  submitted_at: string | null;
  is_primary: boolean | null;
  is_archived: boolean | null;
  last_changed_at: string | null;
  available_document_count: number | null;
  total_count: number;
};

type CounselorUniversityApplicationWorkspaceMetricsRow = {
  total_active_applications: number;
  total_archived_applications: number;
  students_with_applications: number;
  primary_applications: number;
  planning_count: number;
  documents_collecting_count: number;
  application_preparing_count: number;
  ready_to_submit_count: number;
  submitted_count: number;
  under_university_review_count: number;
  additional_information_requested_count: number;
  decision_received_count: number;
  withdrawn_count: number;
  closed_count: number;
  overdue_deadline_count: number;
  due_next_30_days_count: number;
};

type DirectorDashboardMetricsRow = {
  total_students: number;
  active_students: number;
  active_counselors: number;
  consultations_today: number;
  upcoming_scheduled_consultations: number;
  unresolved_past_consultations: number;
  completed_consultations: number;
  no_show_consultations: number;
  pending_follow_ups: number;
  overdue_follow_ups: number;
  due_today_follow_ups: number;
  active_progressions: number;
  on_hold_progressions: number;
  completed_progressions: number;
  active_applications: number;
  submitted_applications: number;
  additional_information_requested_applications: number;
  overdue_application_deadlines: number;
};

type DirectorCounselorWorkloadRow = {
  counselor_id: string;
  counselor_full_name: string | null;
  college_email: string;
  is_active: boolean;
  overdue_follow_ups: number;
  pending_follow_ups: number;
  pending_outcomes: number;
  consultations_today: number;
};

type CounselorPrimaryStudentRow = {
  assignment_id: string;
  student_id: string;
  full_name: string | null;
  college_email: string;
  is_active: boolean;
  course: string | null;
  department: string | null;
  assigned_at: string;
  total_count: number;
};

type DirectorPrimaryCounselorAssignmentRow = {
  student_id: string;
  counselor_id: string;
  counselor_full_name: string | null;
  counselor_college_email: string;
  assigned_at: string;
};

type DirectorPrimaryCounselorCountRow = {
  counselor_id: string;
  assigned_student_count: number;
};

type DirectorPrimaryCounselorReassignmentRow = {
  assignment_id: string;
  assigned_at: string;
};

type DirectorPrimaryCounselorAssignmentHistoryRow = {
  student_id: string;
  counselor_full_name: string | null;
  assigned_at: string;
  ended_at: string | null;
  assignment_reason: string | null;
};

type DirectorStudentOversightRow = {
  student_id: string;
  full_name: string | null;
  college_email: string;
  is_active: boolean;
  account_created_at: string;
  course: string | null;
  department: string | null;
  graduation_year: number | null;
  profile_state: StudentDirectoryProfileState;
  progression_stage: CounselingProgressionStage | null;
  progression_state: CounselingProgressionState | null;
  total_consultations: number;
  open_consultations: number;
  active_applications: number;
  total_count: number;
};

type DirectorConsultationOversightRow = {
  consultation_id: string;
  request_number: string;
  student_id: string;
  student_full_name: string | null;
  student_college_email: string;
  counselor_id: string | null;
  counselor_full_name: string | null;
  counselor_college_email: string | null;
  consultation_date: string;
  slot_start: string;
  slot_end: string;
  consultation_status: ConsultationStatus;
  outcome_recorded_at: string | null;
  submitted_at: string;
  total_count: number;
};

type DirectorLegacyWaitingConsultationRow = {
  consultation_id: string;
  request_number: string;
  student_full_name: string | null;
  student_college_email: string;
  submitted_at: string;
};

type DirectorLegacyConsultationClosureRow = {
  request_number: string;
  consultation_status: ConsultationStatus;
  cancelled_at: string;
};

type DirectorDuplicateFutureWaitingConsultationRow = {
  consultation_id: string;
  request_number: string;
  student_full_name: string | null;
  requested_date: string;
  requested_slot_start: string;
  requested_slot_end: string;
  scheduled_date: string;
  scheduled_slot_start: string;
  scheduled_slot_end: string;
  scheduled_counselor_full_name: string | null;
};

type DirectorDuplicateFutureConsultationClosureRow = {
  request_number: string;
  consultation_status: ConsultationStatus;
  cancelled_at: string;
};

type DirectorApplicationOversightRow = {
  application_id: string;
  student_id: string;
  student_full_name: string | null;
  student_college_email: string;
  counselor_id: string | null;
  counselor_full_name: string | null;
  counselor_college_email: string | null;
  university_name: string;
  programme_name: string;
  country_code: string;
  degree_level: UniversityApplicationDegreeLevel;
  intake_term: UniversityApplicationIntakeTerm;
  intake_year: number;
  application_status: UniversityApplicationStatus;
  submission_deadline: string | null;
  submitted_at: string | null;
  is_primary: boolean;
  is_archived: boolean;
  last_changed_at: string;
  total_count: number;
};

type DirectorAttentionItemRow = {
  attention_kind: string;
  severity: string;
  student_id: string;
  student_full_name: string | null;
  college_email: string;
  application_id: string | null;
  consultation_id: string | null;
  application_status: UniversityApplicationStatus | null;
  submission_deadline: string | null;
  consultation_scheduled_at: string | null;
};

type StudentUniversityApplicationDocumentRow = {
  id: string;
  application_id: string;
  status: UniversityApplicationDocumentStatus;
  document_title: string;
  original_file_name: string;
  bucket_id: string;
  storage_path: string;
  mime_type: UniversityApplicationDocumentMimeType;
  file_size_bytes: number;
  uploaded_by: string;
  prepared_at: string;
  upload_expires_at: string;
  available_at: string | null;
  removed_at: string | null;
  removed_by: string | null;
  removal_reason: string | null;
  created_at: string;
  updated_at: string;
};

type StudentUniversityApplicationDocumentInsert = Pick<
  StudentUniversityApplicationDocumentRow,
  | "application_id"
  | "document_title"
  | "original_file_name"
  | "storage_path"
  | "mime_type"
  | "file_size_bytes"
  | "uploaded_by"
> &
  Partial<
    Pick<
      StudentUniversityApplicationDocumentRow,
      | "id"
      | "status"
      | "bucket_id"
      | "prepared_at"
      | "upload_expires_at"
      | "available_at"
      | "removed_at"
      | "removed_by"
      | "removal_reason"
      | "created_at"
      | "updated_at"
    >
  >;

type UniversityApplicationDocumentUploadIntentRow = Pick<
  StudentUniversityApplicationDocumentRow,
  | "application_id"
  | "bucket_id"
  | "storage_path"
  | "document_title"
  | "original_file_name"
  | "mime_type"
  | "file_size_bytes"
  | "upload_expires_at"
> & {
  document_id: string;
};

type UniversityApplicationDocumentSafeRow = Pick<
  StudentUniversityApplicationDocumentRow,
  | "application_id"
  | "document_title"
  | "original_file_name"
  | "mime_type"
  | "file_size_bytes"
  | "available_at"
> & {
  document_id: string;
};

type UniversityApplicationDocumentFinalizedRow =
  UniversityApplicationDocumentSafeRow & {
    status: UniversityApplicationDocumentStatus;
  };

type UniversityApplicationDocumentViewAuthorizationRow = Pick<
  StudentUniversityApplicationDocumentRow,
  "application_id" | "bucket_id" | "storage_path"
> & {
  document_id: string;
};

type UniversityApplicationDocumentRemovedRow = Pick<
  StudentUniversityApplicationDocumentRow,
  "application_id" | "status" | "removed_at"
> & {
  document_id: string;
};

type StudentProfileDocumentRow = {
  id: string;
  student_id: string;
  document_type: StudentProfileDocumentType;
  display_name: string;
  original_file_name: string;
  bucket_id: string;
  storage_path: string;
  mime_type: StudentProfileDocumentMimeType;
  file_size_bytes: number;
  status: StudentProfileDocumentStatus;
  uploaded_by: string;
  prepared_at: string;
  upload_expires_at: string;
  available_at: string | null;
  removed_at: string | null;
  removed_by: string | null;
  created_at: string;
  updated_at: string;
};

type StudentProfileDocumentSafeRow = Pick<
  StudentProfileDocumentRow,
  | "document_type"
  | "display_name"
  | "original_file_name"
  | "mime_type"
  | "file_size_bytes"
  | "available_at"
> & { document_id: string };

type StudentProfileDocumentUploadIntentRow = Pick<
  StudentProfileDocumentRow,
  | "document_type"
  | "display_name"
  | "original_file_name"
  | "bucket_id"
  | "storage_path"
  | "mime_type"
  | "file_size_bytes"
  | "upload_expires_at"
> & { document_id: string };

type StudentProfileDocumentViewAuthorizationRow = Pick<
  StudentProfileDocumentRow,
  "bucket_id" | "storage_path" | "mime_type"
> & { document_id: string };

type StudentProfileDocumentDeleteAuthorizationRow = Pick<
  StudentProfileDocumentRow,
  "bucket_id" | "storage_path"
> & { document_id: string };

type StudentProfileDocumentDeleteFinalizedRow = {
  document_id: string;
  removed_at: string;
};

type ParentReportRow = {
  id: string;
  student_id: string;
  academic_period: string;
  version_number: number;
  status: ParentReportStatus;
  source_snapshot: Record<string, unknown>;
  semester_overview: string | null;
  strengths_highlights: string | null;
  areas_requiring_attention: string | null;
  next_actions: string | null;
  counselor_remarks: string | null;
  director_remarks: string | null;
  created_by: string;
  last_edited_by: string;
  submitted_at: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  finalized_by: string | null;
  finalized_at: string | null;
  final_pdf_bucket_id: string | null;
  final_pdf_storage_path: string | null;
  final_pdf_size_bytes: number | null;
  final_pdf_sha256: string | null;
  created_at: string;
  updated_at: string;
};

type ParentReportEventRow = {
  id: string;
  report_id: string;
  event_type: ParentReportEventType;
  from_status: ParentReportStatus | null;
  to_status: ParentReportStatus;
  actor_id: string;
  event_reason: string | null;
  narrative_snapshot: Record<string, unknown>;
  attachment_manifest_snapshot: unknown[];
  occurred_at: string;
};

type ParentReportAttachmentRow = {
  id: string;
  report_id: string;
  source_type: ParentReportAttachmentSource;
  source_document_id: string | null;
  display_name: string;
  bucket_id: string;
  storage_path: string;
  mime_type: StudentProfileDocumentMimeType;
  file_size_bytes: number;
  sort_order: number;
  status: ParentReportAttachmentStatus;
  added_by: string;
  added_at: string;
  upload_expires_at: string | null;
  available_at: string | null;
  removed_by: string | null;
  removed_at: string | null;
};

type ParentReportListRow = Pick<
  ParentReportRow,
  "academic_period" | "version_number" | "status" | "updated_at" | "finalized_at"
> & { report_id: string };

type DirectorParentReportListRow = ParentReportListRow & {
  student_id: string;
  student_name: string;
  counselor_name: string;
};

type ParentReportAttachmentCandidateRow = {
  source_type: Exclude<ParentReportAttachmentSource, "report_upload">;
  source_document_id: string;
  display_name: string;
  mime_type: StudentProfileDocumentMimeType;
  file_size_bytes: number;
};

type ParentReportAttachmentUploadIntentRow = {
  attachment_id: string;
  bucket_id: string;
  storage_path: string;
  mime_type: StudentProfileDocumentMimeType;
  upload_expires_at: string;
};

type ParentReportAttachmentRemovalRow = {
  attachment_id: string;
  delete_storage_object: boolean;
  bucket_id: string;
  storage_path: string;
};

type ParentReportFinalizedRow = {
  report_id: string;
  bucket_id: string;
  storage_path: string;
  status: ParentReportStatus;
};

export type Database = {
  public: {
    Tables: {
      counselor_accounts: {
        Row: CounselorAccountRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      kgeo_public_progress: {
        Row: KgeoPublicProgressRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: {
          id: string;
          college_email: string;
          role?: UserRole;
          full_name?: string | null;
          is_active?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: { full_name?: string | null };
        Relationships: [];
      };
      consultation_requests: {
        Row: ConsultationRequestRow;
        Insert: ConsultationRequestInsert;
        Update: Partial<ConsultationRequestRow>;
        Relationships: [];
      };
      student_counselor_assignments: {
        Row: StudentCounselorAssignmentRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      counselor_consultation_slot_blocks: {
        Row: CounselorConsultationSlotBlockRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      student_eligibility_assessments: {
        Row: StudentEligibilityAssessmentRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      student_global_readiness_assessments: {
        Row: StudentGlobalReadinessAssessmentRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      student_profiles: {
        Row: StudentProfileRow;
        Insert: StudentProfileInsert;
        Update: StudentProfileUpdate;
        Relationships: [];
      };
      student_preferences: {
        Row: StudentPreferenceRow;
        Insert: StudentPreferenceInsert;
        Update: Partial<StudentPreferenceInsert>;
        Relationships: [];
      };
      student_test_scores: {
        Row: StudentTestScoreRow;
        Insert: StudentTestScoreInsert;
        Update: Partial<StudentTestScoreInsert>;
        Relationships: [];
      };
      student_achievements: {
        Row: StudentAchievementRow;
        Insert: StudentAchievementInsert;
        Update: Partial<StudentAchievementInsert>;
        Relationships: [];
      };
      student_achievement_documents: {
        Row: StudentAchievementDocumentRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      student_profile_documents: {
        Row: StudentProfileDocumentRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      counselor_student_notes: {
        Row: CounselorStudentNoteRow;
        Insert: CounselorStudentNoteInsert;
        Update: Partial<
          Pick<
            CounselorStudentNoteRow,
            "consultation_id" | "note_text" | "is_pinned"
          >
        >;
        Relationships: [];
      };
      counselor_follow_ups: {
        Row: CounselorFollowUpRow;
        Insert: CounselorFollowUpInsert;
        Update: Partial<
          Pick<
            CounselorFollowUpRow,
            | "consultation_id"
            | "due_date"
            | "priority"
            | "next_action"
            | "details"
          >
        >;
        Relationships: [];
      };
      counselor_student_semester_summaries: {
        Row: CounselorStudentSemesterSummaryRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      student_counseling_progressions: {
        Row: StudentCounselingProgressionRow;
        Insert: StudentCounselingProgressionInsert;
        Update: Partial<StudentCounselingProgressionInsert>;
        Relationships: [];
      };
      student_counseling_progression_events: {
        Row: StudentCounselingProgressionEventRow;
        Insert: StudentCounselingProgressionEventInsert;
        Update: Partial<StudentCounselingProgressionEventInsert>;
        Relationships: [];
      };
      student_counseling_progression_evidence: {
        Row: StudentCounselingProgressionEvidenceRow;
        Insert: StudentCounselingProgressionEvidenceInsert;
        Update: Partial<StudentCounselingProgressionEvidenceRow>;
        Relationships: [];
      };
      student_counseling_progression_event_corrections: {
        Row: StudentCounselingProgressionEventCorrectionRow;
        Insert: StudentCounselingProgressionEventCorrectionInsert;
        Update: Partial<StudentCounselingProgressionEventCorrectionInsert>;
        Relationships: [];
      };
      student_university_applications: {
        Row: StudentUniversityApplicationRow;
        Insert: StudentUniversityApplicationInsert;
        Update: Partial<StudentUniversityApplicationRow>;
        Relationships: [];
      };
      student_university_application_events: {
        Row: StudentUniversityApplicationEventRow;
        Insert: StudentUniversityApplicationEventInsert;
        Update: Partial<StudentUniversityApplicationEventRow>;
        Relationships: [];
      };
      student_university_application_journeys: {
        Row: UniversityApplicationJourneyRow;
        Insert: UniversityApplicationJourneyInsert;
        Update: Partial<UniversityApplicationJourneyRow>;
        Relationships: [];
      };
      student_university_application_journey_events: {
        Row: UniversityApplicationJourneyEventRow;
        Insert: UniversityApplicationJourneyEventInsert;
        Update: Partial<UniversityApplicationJourneyEventRow>;
        Relationships: [];
      };
      student_university_application_documents: {
        Row: StudentUniversityApplicationDocumentRow;
        Insert: StudentUniversityApplicationDocumentInsert;
        Update: Partial<StudentUniversityApplicationDocumentRow>;
        Relationships: [];
      };
      parent_reports: {
        Row: ParentReportRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      parent_report_events: {
        Row: ParentReportEventRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
      parent_report_attachments: {
        Row: ParentReportAttachmentRow;
        Insert: never;
        Update: never;
        Relationships: [];
      };
    };
    Views: {
      student_profile_completion: {
        Row: StudentProfileCompletionRow;
        Relationships: [];
      };
    };
    Functions: {
      approve_counselor: {
        Args: { p_user_id: string };
        Returns: CounselorApprovalStatus;
      };
      reject_counselor: {
        Args: { p_user_id: string };
        Returns: CounselorApprovalStatus;
      };
      list_director_counselor_accounts: {
        Args: Record<string, never>;
        Returns: DirectorCounselorAccountRow[];
      };
      prepare_counselor_registration_provisioning: {
        Args: {
          p_email: string;
          p_full_name: string;
          p_username: string;
          p_token_hash: string;
          p_expires_at: string;
        };
        Returns: undefined;
      };
      publish_kgeo_public_progress: {
        Args: {
          p_registered_for_advisory: number;
          p_applications_initiated: number;
          p_applications_submitted: number;
          p_offers_received: number;
          p_confirmed_acceptance: number;
          p_visa_approved: number;
          p_enrolled_overseas: number;
        };
        Returns: PublicProgressPublishedRow[];
      };
      get_public_kgeo_progress: {
        Args: Record<string, never>;
        Returns: PublicKgeoProgressRow[];
      };
      save_student_eligibility_assessment: {
        Args: {
          p_student_id: string;
          p_overall_status: StudentEligibilityStatus;
          p_academic_status: StudentEligibilityAcademicStatus;
          p_backlog_status: StudentEligibilityBacklogStatus;
          p_english_readiness: StudentEligibilityEnglishReadiness;
          p_aptitude_readiness: StudentEligibilityAptitudeReadiness;
          p_profile_strength: StudentEligibilityProfileStrength;
          p_application_readiness: StudentEligibilityApplicationReadiness;
          p_recommended_countries: string[];
          p_recommended_intake: string | null;
          p_assessment_summary: string;
        };
        Returns: StudentEligibilityAssessmentSavedRow[];
      };
      get_counselor_student_eligibility_assessments: {
        Args: { p_student_id: string; p_limit?: number };
        Returns: StudentEligibilityAssessmentReadRow[];
      };
      get_counselor_latest_student_eligibility_assessment: {
        Args: { p_student_id: string };
        Returns: StudentEligibilityLatestRow[];
      };
      get_director_latest_student_eligibility_assessment: {
        Args: { p_student_id: string };
        Returns: DirectorStudentEligibilityLatestRow[];
      };
      get_primary_counselor_global_readiness_evidence: {
        Args: { p_student_id: string };
        Returns: Record<string, unknown>;
      };
      create_student_global_readiness_assessment: {
        Args: {
          p_student_id: string;
          p_academic_readiness_score: number;
          p_intellectual_projects_score: number;
          p_intellectual_distinction_score: number;
          p_professional_experience_score: number;
          p_professional_industry_score: number;
          p_global_leadership_score: number;
          p_global_exposure_score: number;
          p_global_distinction_score: number;
          p_application_gmap_score: number;
          p_application_advisory_score: number;
          p_application_documents_score: number;
          p_application_shortlist_score: number;
          p_application_submitted_score: number;
          p_academic_readiness_rationale: string | null;
          p_intellectual_projects_rationale: string | null;
          p_intellectual_distinction_rationale: string | null;
          p_professional_experience_rationale: string | null;
          p_professional_industry_rationale: string | null;
          p_global_leadership_rationale: string | null;
          p_global_exposure_rationale: string | null;
          p_global_distinction_rationale: string | null;
          p_application_gmap_rationale: string | null;
          p_application_advisory_rationale: string | null;
          p_application_documents_rationale: string | null;
          p_application_shortlist_rationale: string | null;
          p_application_submitted_rationale: string | null;
          p_assessment_rationale: string;
          p_parent_safe_summary: string | null;
        };
        Returns: Record<string, unknown>;
      };
      list_primary_counselor_global_readiness_assessments: {
        Args: { p_student_id: string; p_limit?: number };
        Returns: Record<string, unknown>[];
      };
      get_primary_counselor_latest_global_readiness_assessment: {
        Args: { p_student_id: string };
        Returns: Record<string, unknown> | null;
      };
      save_student_identity: {
        Args: {
          p_full_name: string;
          p_roll_number: string;
          p_personal_email: string;
          p_mobile_number: string;
          p_college: string;
          p_course: string;
          p_department: string;
          p_current_year: number | null;
          p_current_semester: number | null;
          p_graduation_year: number;
        };
        Returns: undefined;
      };
      get_kgeo_consultation_slot_catalog: {
        Args: Record<string, never>;
        Returns: Array<{
          slot_ordinal: number;
          slot_start: string;
          slot_end: string;
        }>;
      };
      get_consultation_slot_availability: {
        Args: { p_date: string };
        Returns: Array<{
          slot_start: string;
          slot_end: string;
          availability_status: StudentConsultationAvailabilityStatus;
        }>;
      };
      get_counselor_consultation_references: {
        Args: { p_consultation_ids: string[] };
        Returns: Array<{
          consultation_id: string;
          request_number: string;
        }>;
      };
      claim_next_consultation: {
        Args: Record<string, never>;
        Returns: string | null;
      };
      record_consultation_outcome: {
        Args: {
          p_consultation_id: string;
          p_outcome: "completed" | "no_show";
        };
        Returns: ConsultationStatus;
      };
      record_counselor_follow_up_status: {
        Args: {
          p_follow_up_id: string;
          p_status: "completed" | "cancelled";
        };
        Returns: CounselorFollowUpStatus;
      };
      list_counselor_follow_up_workload: {
        Args: {
          p_lifecycle?: string | null;
          p_priority?: string | null;
          p_search?: string | null;
          p_due_from?: string | null;
          p_due_to?: string | null;
          p_page?: number | null;
          p_page_size?: number | null;
        };
        Returns: CounselorFollowUpWorkloadRow[];
      };
      record_counselor_student_semester_summary: {
        Args: {
          p_student_id: string;
          p_academic_period: string;
          p_progress_summary: string;
          p_achievements_highlights: string | null;
          p_areas_requiring_attention: string | null;
          p_next_semester_actions: string;
        };
        Returns: CounselorStudentSemesterSummarySavedRow[];
      };
      get_counselor_student_semester_summaries: {
        Args: { p_student_id: string; p_limit?: number };
        Returns: CounselorStudentSemesterSummaryReadRow[];
      };
      record_student_counseling_progression: {
        Args: {
          p_student_id: string;
          p_stage: string;
          p_state: string;
          p_change_reason?: string | null;
        };
        Returns: StudentCounselingProgressionRow[];
      };
      prepare_student_counseling_progression_evidence_upload: {
        Args: {
          p_progression_event_id: string;
          p_original_file_name: string;
          p_mime_type: string;
          p_file_size_bytes: number;
        };
        Returns: ProgressionEvidenceUploadIntentRow[];
      };
      finalize_student_counseling_progression_evidence_upload: {
        Args: {
          p_evidence_id: string;
        };
        Returns: StudentCounselingProgressionEvidenceRow[];
      };
      remove_student_counseling_progression_evidence: {
        Args: {
          p_evidence_id: string;
          p_removal_reason: string;
        };
        Returns: RemovedProgressionEvidenceRow[];
      };
      undo_latest_student_counseling_progression_event: {
        Args: {
          p_student_id: string;
          p_event_id: string;
          p_correction_reason: string;
        };
        Returns: ProgressionCorrectionResultRow[];
      };
      get_counselor_progression_correction_context: {
        Args: {
          p_student_id: string;
          p_event_ids: string[];
        };
        Returns: ProgressionCorrectionContextRow[];
      };
      create_student_university_application: {
        Args: {
          p_student_id: string;
          p_country_code: string;
          p_university_name: string;
          p_programme_name: string;
          p_degree_level: UniversityApplicationDegreeLevel;
          p_intake_term: UniversityApplicationIntakeTerm;
          p_intake_year: number;
          p_application_reference: string | null;
          p_portal_url: string | null;
          p_submission_deadline: string | null;
        };
        Returns: UniversityApplicationMutationResultRow[];
      };
      update_student_university_application_details: {
        Args: {
          p_application_id: string;
          p_country_code: string;
          p_university_name: string;
          p_programme_name: string;
          p_degree_level: UniversityApplicationDegreeLevel;
          p_intake_term: UniversityApplicationIntakeTerm;
          p_intake_year: number;
          p_application_reference: string | null;
          p_portal_url: string | null;
          p_submission_deadline: string | null;
          p_change_reason: string;
        };
        Returns: UniversityApplicationMutationResultRow[];
      };
      record_student_university_application_status: {
        Args: {
          p_application_id: string;
          p_new_status: UniversityApplicationStatus;
          p_change_reason: string;
        };
        Returns: UniversityApplicationMutationResultRow[];
      };
      set_primary_student_university_application: {
        Args: {
          p_application_id: string;
          p_change_reason: string;
        };
        Returns: UniversityApplicationMutationResultRow[];
      };
      archive_student_university_application: {
        Args: {
          p_application_id: string;
          p_archive_reason: string;
        };
        Returns: UniversityApplicationArchiveResultRow[];
      };
      get_my_university_applications: {
        Args: Record<string, never>;
        Returns: StudentUniversityApplicationSummaryRow[];
      };
      get_counselor_university_application_journey: {
        Args: { p_application_id: string };
        Returns: UniversityApplicationJourneyProjectionRow[];
      };
      get_counselor_university_application_journey_history: {
        Args: { p_application_id: string; p_limit?: number };
        Returns: UniversityApplicationJourneyHistoryRow[];
      };
      get_my_university_application_journeys: {
        Args: Record<string, never>;
        Returns: UniversityApplicationJourneySafeRow[];
      };
      record_university_application_journey: {
        Args: {
          p_application_id: string;
          p_university_decision: UniversityApplicationDecision;
          p_university_decision_date: string | null;
          p_offer_status: UniversityApplicationOfferStatus;
          p_offer_date: string | null;
          p_conditional_offer_requirements: string | null;
          p_condition_due_date: string | null;
          p_conditions_satisfied_date: string | null;
          p_student_decision: UniversityApplicationStudentDecision;
          p_student_decision_date: string | null;
          p_fee_status: UniversityApplicationFeeStatus;
          p_fee_payment_date: string | null;
          p_visa_status: UniversityApplicationVisaStatus;
          p_visa_submission_date: string | null;
          p_visa_decision_date: string | null;
          p_enrollment_status: UniversityApplicationEnrollmentStatus;
          p_enrollment_date: string | null;
          p_change_reason: string;
        };
        Returns: UniversityApplicationJourneyProjectionRow[];
      };
      list_counselor_university_application_workspace: {
        Args: {
          p_search?: string | null;
          p_status?: string | null;
          p_country_code?: string | null;
          p_degree_level?: string | null;
          p_intake_term?: string | null;
          p_intake_year?: number | null;
          p_primary_filter?: string | null;
          p_archive_filter?: string | null;
          p_deadline_filter?: string | null;
          p_sort?: string | null;
          p_page?: number | null;
          p_page_size?: number | null;
        };
        Returns: CounselorUniversityApplicationWorkspaceRow[];
      };
      get_counselor_university_application_workspace_metrics: {
        Args: Record<string, never>;
        Returns: CounselorUniversityApplicationWorkspaceMetricsRow[];
      };
      get_director_dashboard_metrics: {
        Args: Record<string, never>;
        Returns: DirectorDashboardMetricsRow[];
      };
      list_director_counselor_workload: {
        Args: {
          p_limit?: number | null;
        };
        Returns: DirectorCounselorWorkloadRow[];
      };
      list_director_primary_counselor_assignments: {
        Args: { p_student_ids: string[] };
        Returns: DirectorPrimaryCounselorAssignmentRow[];
      };
      list_director_primary_counselor_counts: {
        Args: { p_counselor_ids: string[] };
        Returns: DirectorPrimaryCounselorCountRow[];
      };
      book_student_consultation: {
        Args: {
          p_student_name: string;
          p_roll_number: string;
          p_personal_email: string;
          p_college_end_year: number;
          p_department: string;
          p_course: string;
          p_mobile_number: string;
          p_higher_studies_interest: HigherStudiesInterest;
          p_consultation_date: string;
          p_slot_start: string;
        };
        Returns: StudentConsultationBookingReceiptRow[];
      };
      continue_with_kgeo: {
        Args: Record<string, never>;
        Returns: boolean;
      };
      block_my_consultation_slot: {
        Args: {
          p_consultation_date: string;
          p_slot_start: string;
          p_reason?: string | null;
        };
        Returns: string;
      };
      release_my_consultation_slot_block: {
        Args: { p_block_id: string };
        Returns: boolean;
      };
      list_my_active_consultation_slot_blocks: {
        Args: Record<string, never>;
        Returns: CounselorActiveSlotBlockRow[];
      };
      list_my_assigned_consultations: {
        Args: {
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_limit?: number;
        };
        Returns: CounselorAssignedConsultationRow[];
      };
      get_my_consultation_dashboard_metrics: {
        Args: Record<string, never>;
        Returns: CounselorConsultationDashboardMetricsRow[];
      };
      reassign_primary_counselor: {
        Args: {
          p_student_id: string;
          p_counselor_id: string;
          p_reason: string;
        };
        Returns: DirectorPrimaryCounselorReassignmentRow[];
      };
      list_director_primary_counselor_assignment_history: {
        Args: { p_student_ids: string[] };
        Returns: DirectorPrimaryCounselorAssignmentHistoryRow[];
      };
      get_my_primary_counselor_case_access: {
        Args: { p_student_id: string };
        Returns: { access_state: string }[];
      };
      list_director_attention_items: {
        Args: {
          p_limit?: number | null;
        };
        Returns: DirectorAttentionItemRow[];
      };
      list_director_student_oversight: {
        Args: {
          p_search?: string | null;
          p_is_active?: boolean | null;
          p_progression_state?: string | null;
          p_page?: number | null;
          p_page_size?: number | null;
        };
        Returns: DirectorStudentOversightRow[];
      };
      get_director_student_identity: {
        Args: { p_student_id: string };
        Returns: CounselorStudentIdentityRow[];
      };
      list_director_student_achievement_documents: {
        Args: { p_student_id: string };
        Returns: StudentAchievementDocumentSafeRow[];
      };
      authorize_director_student_achievement_document_view: {
        Args: {
          p_student_id: string;
          p_achievement_id: string;
          p_document_id: string;
        };
        Returns: StudentAchievementDocumentViewAuthorizationRow[];
      };
      list_director_student_profile_documents: {
        Args: { p_student_id: string };
        Returns: StudentProfileDocumentSafeRow[];
      };
      authorize_director_student_profile_document_view: {
        Args: { p_student_id: string; p_document_id: string };
        Returns: StudentProfileDocumentViewAuthorizationRow[];
      };
      get_director_student_case_detail: {
        Args: { p_student_id: string };
        Returns: Array<{ payload: unknown }>;
      };
      list_director_consultation_oversight: {
        Args: {
          p_search?: string | null;
          p_status?: ConsultationStatus | null;
          p_date_from?: string | null;
          p_date_to?: string | null;
          p_page?: number | null;
          p_page_size?: number | null;
        };
        Returns: DirectorConsultationOversightRow[];
      };
      list_director_legacy_waiting_consultations: {
        Args: Record<string, never>;
        Returns: DirectorLegacyWaitingConsultationRow[];
      };
      close_legacy_waiting_consultation: {
        Args: {
          p_consultation_id: string;
          p_reason: string;
        };
        Returns: DirectorLegacyConsultationClosureRow[];
      };
      list_director_duplicate_future_waiting_consultations: {
        Args: Record<string, never>;
        Returns: DirectorDuplicateFutureWaitingConsultationRow[];
      };
      close_duplicate_future_waiting_consultation: {
        Args: {
          p_consultation_id: string;
          p_reason: string;
        };
        Returns: DirectorDuplicateFutureConsultationClosureRow[];
      };
      list_director_application_oversight: {
        Args: {
          p_search?: string | null;
          p_status?: UniversityApplicationStatus | null;
          p_archive_state?: string | null;
          p_page?: number | null;
          p_page_size?: number | null;
        };
        Returns: DirectorApplicationOversightRow[];
      };
      prepare_university_application_document_upload: {
        Args: {
          p_application_id: string;
          p_document_title: string;
          p_original_file_name: string;
          p_mime_type: string;
          p_file_size_bytes: number;
        };
        Returns: UniversityApplicationDocumentUploadIntentRow[];
      };
      finalize_university_application_document_upload: {
        Args: { p_document_id: string };
        Returns: UniversityApplicationDocumentFinalizedRow[];
      };
      list_university_application_documents: {
        Args: { p_application_id: string };
        Returns: UniversityApplicationDocumentSafeRow[];
      };
      authorize_university_application_document_view: {
        Args: {
          p_application_id: string;
          p_document_id: string;
        };
        Returns: UniversityApplicationDocumentViewAuthorizationRow[];
      };
      soft_remove_university_application_document: {
        Args: {
          p_document_id: string;
          p_removal_reason: string;
        };
        Returns: UniversityApplicationDocumentRemovedRow[];
      };
      can_upload_university_application_document_object: {
        Args: {
          p_bucket_id: string;
          p_storage_path: string;
        };
        Returns: boolean;
      };
      can_view_university_application_document_object: {
        Args: {
          p_bucket_id: string;
          p_storage_path: string;
        };
        Returns: boolean;
      };
      prepare_student_profile_document_upload: {
        Args: {
          p_document_type: StudentProfileDocumentType;
          p_display_name: string;
          p_original_file_name: string;
          p_mime_type: string;
          p_file_size_bytes: number;
        };
        Returns: StudentProfileDocumentUploadIntentRow[];
      };
      finalize_student_profile_document_upload: {
        Args: { p_document_id: string };
        Returns: StudentProfileDocumentSafeRow[];
      };
      list_my_student_profile_documents: {
        Args: Record<string, never>;
        Returns: StudentProfileDocumentSafeRow[];
      };
      list_primary_counselor_student_profile_documents: {
        Args: { p_student_id: string };
        Returns: StudentProfileDocumentSafeRow[];
      };
      authorize_student_profile_document_view: {
        Args: { p_student_id: string; p_document_id: string };
        Returns: StudentProfileDocumentViewAuthorizationRow[];
      };
      authorize_student_profile_document_delete: {
        Args: { p_document_id: string };
        Returns: StudentProfileDocumentDeleteAuthorizationRow[];
      };
      finalize_student_profile_document_delete: {
        Args: { p_document_id: string };
        Returns: StudentProfileDocumentDeleteFinalizedRow[];
      };
      can_upload_student_profile_document_object: {
        Args: { p_bucket_id: string; p_storage_path: string };
        Returns: boolean;
      };
      can_view_student_profile_document_object: {
        Args: { p_bucket_id: string; p_storage_path: string };
        Returns: boolean;
      };
      can_delete_student_profile_document_object: {
        Args: { p_bucket_id: string; p_storage_path: string };
        Returns: boolean;
      };
      prepare_student_achievement_document_upload: {
        Args: {
          p_student_id: string;
          p_achievement_id: string;
          p_document_name: string;
          p_mime_type: string;
          p_file_size_bytes: number;
        };
        Returns: StudentAchievementDocumentUploadIntentRow[];
      };
      authorize_student_achievement_document_validation: {
        Args: { p_document_id: string };
        Returns: StudentAchievementDocumentValidationAuthorizationRow[];
      };
      record_student_achievement_document_signature_validation: {
        Args: {
          p_document_id: string;
          p_student_id: string;
          p_detected_mime_type: string;
          p_detected_size_bytes: number;
        };
        Returns: undefined;
      };
      reject_student_achievement_document_signature: {
        Args: { p_document_id: string; p_student_id: string };
        Returns: undefined;
      };
      finalize_student_achievement_document_upload: {
        Args: { p_document_id: string };
        Returns: StudentAchievementDocumentSafeRow[];
      };
      list_my_student_achievement_documents: {
        Args: Record<string, never>;
        Returns: StudentAchievementDocumentSafeRow[];
      };
      list_primary_counselor_student_achievement_documents: {
        Args: { p_student_id: string };
        Returns: StudentAchievementDocumentSafeRow[];
      };
      authorize_student_achievement_document_view: {
        Args: {
          p_student_id: string;
          p_achievement_id: string;
          p_document_id: string;
        };
        Returns: StudentAchievementDocumentViewAuthorizationRow[];
      };
      authorize_student_achievement_document_delete: {
        Args: {
          p_document_id: string;
          p_expected_status: StudentAchievementDocumentStatus;
        };
        Returns: StudentAchievementDocumentDeleteAuthorizationRow[];
      };
      finalize_student_achievement_document_delete: {
        Args: { p_document_id: string };
        Returns: StudentAchievementDocumentDeleteFinalizedRow[];
      };
      can_upload_student_achievement_document_object: {
        Args: { p_bucket_id: string; p_storage_path: string };
        Returns: boolean;
      };
      can_view_student_achievement_document_object: {
        Args: { p_bucket_id: string; p_storage_path: string };
        Returns: boolean;
      };
      can_delete_student_achievement_document_object: {
        Args: { p_bucket_id: string; p_storage_path: string };
        Returns: boolean;
      };
      list_counselor_student_directory: {
        Args: {
          p_search?: string | null;
          p_college?: string | null;
          p_course?: string | null;
          p_department?: string | null;
          p_graduation_year?: number | null;
          p_is_active?: boolean | null;
          p_profile_state?: StudentDirectoryProfileState | null;
          p_higher_studies_interest?: HigherStudiesInterest | null;
          p_preferred_study_level?: StudentPreferredStudyLevel | null;
          p_target_intake?: string | null;
          p_sort?: string | null;
          p_page?: number | null;
          p_page_size?: number | null;
        };
        Returns: CounselorStudentDirectoryRow[];
      };
      list_my_primary_students: {
        Args: {
          p_page?: number | null;
          p_page_size?: number | null;
        };
        Returns: CounselorPrimaryStudentRow[];
      };
      get_counselor_student_identity: {
        Args: { p_student_id: string };
        Returns: CounselorStudentIdentityRow[];
      };
      create_parent_report_draft: {
        Args: { p_student_id: string; p_academic_period: string };
        Returns: Array<{
          report_id: string;
          version_number: number;
          status: ParentReportStatus;
        }>;
      };
      list_counselor_parent_reports: {
        Args: { p_student_id: string; p_limit?: number };
        Returns: ParentReportListRow[];
      };
      list_director_parent_reports: {
        Args: { p_limit?: number };
        Returns: DirectorParentReportListRow[];
      };
      get_parent_report_workspace: {
        Args: { p_report_id: string };
        Returns: Array<{ payload: unknown }>;
      };
      get_parent_report_render_payload: {
        Args: { p_report_id: string };
        Returns: Array<{ payload: unknown }>;
      };
      save_counselor_parent_report_narrative: {
        Args: {
          p_report_id: string;
          p_semester_overview: string | null;
          p_strengths_highlights: string | null;
          p_areas_requiring_attention: string | null;
          p_next_actions: string | null;
          p_counselor_remarks: string | null;
        };
        Returns: ParentReportStatus;
      };
      save_director_parent_report_narrative: {
        Args: {
          p_report_id: string;
          p_semester_overview: string | null;
          p_strengths_highlights: string | null;
          p_areas_requiring_attention: string | null;
          p_next_actions: string | null;
          p_counselor_remarks: string | null;
          p_director_remarks: string | null;
        };
        Returns: ParentReportStatus;
      };
      submit_parent_report: {
        Args: { p_report_id: string };
        Returns: ParentReportStatus;
      };
      request_parent_report_revision: {
        Args: { p_report_id: string; p_reason: string };
        Returns: ParentReportStatus;
      };
      approve_parent_report: {
        Args: { p_report_id: string };
        Returns: ParentReportStatus;
      };
      finalize_parent_report: {
        Args: { p_report_id: string; p_file_size_bytes: number; p_sha256: string };
        Returns: ParentReportFinalizedRow[];
      };
      authorize_parent_report_download: {
        Args: { p_report_id: string };
        Returns: Array<{ bucket_id: string; storage_path: string; download_name: string }>;
      };
      list_parent_report_attachment_candidates: {
        Args: { p_report_id: string };
        Returns: ParentReportAttachmentCandidateRow[];
      };
      add_parent_report_existing_attachment: {
        Args: {
          p_report_id: string;
          p_source_type: Exclude<ParentReportAttachmentSource, "report_upload">;
          p_source_document_id: string;
          p_display_name: string;
        };
        Returns: string;
      };
      prepare_parent_report_attachment_upload: {
        Args: {
          p_report_id: string;
          p_display_name: string;
          p_original_file_name: string;
          p_mime_type: StudentProfileDocumentMimeType;
          p_file_size_bytes: number;
        };
        Returns: ParentReportAttachmentUploadIntentRow[];
      };
      finalize_parent_report_attachment_upload: {
        Args: { p_attachment_id: string };
        Returns: string;
      };
      remove_parent_report_attachment: {
        Args: { p_attachment_id: string };
        Returns: ParentReportAttachmentRemovalRow[];
      };
      can_upload_parent_report_object: {
        Args: { p_bucket_id: string; p_storage_path: string };
        Returns: boolean;
      };
      can_view_parent_report_object: {
        Args: { p_bucket_id: string; p_storage_path: string };
        Returns: boolean;
      };
      can_delete_parent_report_object: {
        Args: { p_bucket_id: string; p_storage_path: string };
        Returns: boolean;
      };
    };
    Enums: {
      counselor_approval_status: CounselorApprovalStatus;
      consultation_status: ConsultationStatus;
      consultation_slot_availability_status: ConsultationSlotAvailabilityStatus;
      counselor_follow_up_priority: CounselorFollowUpPriority;
      counselor_follow_up_status: CounselorFollowUpStatus;
      counseling_progression_stage: CounselingProgressionStage;
      counseling_progression_state: CounselingProgressionState;
      counseling_progression_evidence_status: CounselingProgressionEvidenceStatus;
      counseling_progression_correction_type: CounselingProgressionCorrectionType;
      university_application_status: UniversityApplicationStatus;
      university_application_degree_level: UniversityApplicationDegreeLevel;
      university_application_intake_term: UniversityApplicationIntakeTerm;
      university_application_event_type: UniversityApplicationEventType;
      university_application_decision: UniversityApplicationDecision;
      university_application_offer_status: UniversityApplicationOfferStatus;
      university_application_student_decision: UniversityApplicationStudentDecision;
      university_application_fee_status: UniversityApplicationFeeStatus;
      university_application_visa_status: UniversityApplicationVisaStatus;
      university_application_enrollment_status: UniversityApplicationEnrollmentStatus;
      university_application_document_status: UniversityApplicationDocumentStatus;
      higher_studies_interest: HigherStudiesInterest;
      student_profile_status: StudentProfileStatus;
      student_profile_document_type: StudentProfileDocumentType;
      student_profile_document_status: StudentProfileDocumentStatus;
      student_achievement_document_status: StudentAchievementDocumentStatus;
      student_achievement_document_removal_reason: StudentAchievementDocumentRemovalReason;
      student_directory_profile_state: StudentDirectoryProfileState;
      student_preferred_study_level: StudentPreferredStudyLevel;
      student_preferred_study_area: StudentPreferredStudyArea;
      student_preferred_domain: StudentPreferredDomain;
      student_study_pathway: StudentStudyPathway;
      student_global_track_program: StudentGlobalTrackProgram;
      student_funding_method: StudentFundingMethod;
      student_study_mode: StudentStudyMode;
      student_academic_preference: StudentAcademicPreference;
      student_planning_stage: StudentPlanningStage;
      student_exam_name: StudentExamName;
      student_exam_status: StudentExamStatus;
      student_achievement_type: StudentAchievementType;
      student_eligibility_status: StudentEligibilityStatus;
      student_eligibility_academic_status: StudentEligibilityAcademicStatus;
      student_eligibility_backlog_status: StudentEligibilityBacklogStatus;
      student_eligibility_english_readiness: StudentEligibilityEnglishReadiness;
      student_eligibility_aptitude_readiness: StudentEligibilityAptitudeReadiness;
      student_eligibility_profile_strength: StudentEligibilityProfileStrength;
      student_eligibility_application_readiness: StudentEligibilityApplicationReadiness;
      global_readiness_band: GlobalReadinessBand;
      user_role: UserRole;
      parent_report_status: ParentReportStatus;
      parent_report_event_type: ParentReportEventType;
      parent_report_attachment_source: ParentReportAttachmentSource;
      parent_report_attachment_status: ParentReportAttachmentStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};
