-- K-GEO live-schema verification through the Phase E1.3.3 foundation.
--
-- Reconstructed from the eighteen immutable migrations listed in
-- docs/database.md. This script is read-only, inspects catalog metadata
-- instead of migration history, and returns aggregate legacy counts only.
-- It never selects a student identifier, name, email, contact value, or other
-- private row data.

begin transaction isolation level repeatable read read only;

set local statement_timeout = '30s';

-- Every row in the following result sets should report passed = true.

with required_enums(enum_name, expected_values) as (
  values
    (
      'user_role',
      array['student', 'counselor', 'admin', 'director']::text[]
    ),
    (
      'consultation_status',
      array[
        'submitted',
        'waiting_for_assignment',
        'counselor_assigned',
        'scheduled',
        'completed',
        'no_show',
        'cancelled'
      ]::text[]
    ),
    (
      'consultation_slot_availability_status',
      array['available', 'booked', 'expired']::text[]
    ),
    (
      'higher_studies_interest',
      array['interested', 'exploring', 'not_interested']::text[]
    ),
    (
      'student_profile_status',
      array['draft', 'submitted']::text[]
    ),
    (
      'student_directory_profile_state',
      array[
        'profile_not_started',
        'profile_in_progress',
        'ready_for_counseling',
        'submitted'
      ]::text[]
    ),
    (
      'student_preferred_study_level',
      array[
        'masters',
        'postgraduate_diploma',
        'mba',
        'phd',
        'other'
      ]::text[]
    ),
    (
      'student_study_mode',
      array['full_time', 'part_time', 'either']::text[]
    ),
    (
      'student_academic_preference',
      array['coursework', 'research', 'either', 'undecided']::text[]
    ),
    (
      'student_planning_stage',
      array[
        'exploring',
        'preparing_exams',
        'shortlisting',
        'preparing_documents',
        'applications_started'
      ]::text[]
    ),
    (
      'student_exam_name',
      array[
        'ielts',
        'toefl',
        'pte',
        'gre',
        'gmat',
        'gate',
        'other'
      ]::text[]
    ),
    (
      'student_exam_status',
      array[
        'not_planned',
        'planning',
        'booked',
        'completed',
        'not_required'
      ]::text[]
    ),
    (
      'student_achievement_type',
      array[
        'internship',
        'project',
        'certification',
        'research',
        'publication',
        'award',
        'hackathon',
        'leadership',
        'volunteering',
        'work_experience',
        'other'
      ]::text[]
    ),
    (
      'counselor_follow_up_priority',
      array['low', 'normal', 'high']::text[]
    ),
    (
      'counselor_follow_up_status',
      array['pending', 'completed', 'cancelled']::text[]
    ),
    (
      'counseling_progression_stage',
      array[
        'profile_review',
        'initial_counseling',
        'goals_confirmed',
        'country_exploration',
        'program_shortlisting',
        'university_shortlisting',
        'test_preparation',
        'document_preparation',
        'application_ready',
        'application_in_progress',
        'offer_evaluation',
        'visa_preparation',
        'pre_departure'
      ]::text[]
    ),
    (
      'counseling_progression_state',
      array['active', 'on_hold', 'completed']::text[]
    ),
    (
      'counseling_progression_correction_type',
      array['undo_transition', 'reset_initialization']::text[]
    ),
    (
      'university_application_status',
      array[
        'planning',
        'documents_collecting',
        'application_preparing',
        'ready_to_submit',
        'submitted',
        'under_university_review',
        'additional_information_requested',
        'decision_received',
        'withdrawn',
        'closed'
      ]::text[]
    ),
    (
      'university_application_degree_level',
      array[
        'bachelors',
        'masters',
        'postgraduate_diploma',
        'doctorate',
        'other'
      ]::text[]
    ),
    (
      'university_application_intake_term',
      array[
        'spring',
        'summer',
        'fall',
        'winter',
        'rolling',
        'other'
      ]::text[]
    ),
    (
      'university_application_event_type',
      array[
        'created',
        'details_updated',
        'status_changed',
        'primary_changed',
        'archived'
      ]::text[]
    )
),
actual_enums as (
  select
    type_name.typname as enum_name,
    array(
      select enum_value.enumlabel::text
      from pg_catalog.pg_enum as enum_value
      where enum_value.enumtypid = type_name.oid
      order by enum_value.enumsortorder
    ) as actual_values
  from pg_catalog.pg_type as type_name
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = type_name.typnamespace
  where namespace.nspname = 'public'
    and type_name.typtype = 'e'
)
select
  'enum'::text as category,
  required.enum_name as object_name,
  actual.actual_values = required.expected_values as passed
from required_enums as required
left join actual_enums as actual using (enum_name)
order by required.enum_name;

with required_tables(table_name) as (
  values
    ('counselor_student_notes'),
    ('counselor_follow_ups'),
    ('student_counseling_progressions'),
    ('student_counseling_progression_events'),
    ('student_university_applications'),
    ('student_university_application_events')
)
select
  'table'::text as category,
  required.table_name as object_name,
  table_record.relkind = 'r' as passed
from required_tables as required
left join pg_catalog.pg_namespace as namespace
  on namespace.nspname = 'public'
left join pg_catalog.pg_class as table_record
  on table_record.relnamespace = namespace.oid
  and table_record.relname = required.table_name
order by required.table_name;

with required_columns(table_name, column_name, udt_name, is_nullable) as (
  values
    ('profiles', 'id', 'uuid', 'NO'),
    ('profiles', 'college_email', 'text', 'NO'),
    ('profiles', 'role', 'user_role', 'NO'),
    ('profiles', 'full_name', 'text', 'YES'),
    ('profiles', 'is_active', 'bool', 'NO'),
    ('profiles', 'created_at', 'timestamptz', 'NO'),
    ('profiles', 'updated_at', 'timestamptz', 'NO'),

    ('consultation_requests', 'id', 'uuid', 'NO'),
    ('consultation_requests', 'student_id', 'uuid', 'NO'),
    ('consultation_requests', 'request_number', 'text', 'NO'),
    ('consultation_requests', 'student_name', 'text', 'NO'),
    ('consultation_requests', 'roll_number', 'text', 'NO'),
    ('consultation_requests', 'college_email', 'text', 'NO'),
    ('consultation_requests', 'personal_email', 'text', 'NO'),
    ('consultation_requests', 'college_end_year', 'int4', 'NO'),
    ('consultation_requests', 'department', 'text', 'NO'),
    ('consultation_requests', 'course', 'text', 'NO'),
    ('consultation_requests', 'mobile_number', 'text', 'NO'),
    (
      'consultation_requests',
      'higher_studies_interest',
      'higher_studies_interest',
      'NO'
    ),
    ('consultation_requests', 'status', 'consultation_status', 'NO'),
    ('consultation_requests', 'assigned_counselor_id', 'uuid', 'YES'),
    ('consultation_requests', 'consultation_date', 'date', 'YES'),
    ('consultation_requests', 'slot_start', 'time', 'YES'),
    ('consultation_requests', 'slot_end', 'time', 'YES'),
    ('consultation_requests', 'outcome_recorded_at', 'timestamptz', 'YES'),
    ('consultation_requests', 'outcome_recorded_by', 'uuid', 'YES'),
    ('consultation_requests', 'submitted_at', 'timestamptz', 'NO'),
    ('consultation_requests', 'assigned_at', 'timestamptz', 'YES'),
    ('consultation_requests', 'created_at', 'timestamptz', 'NO'),
    ('consultation_requests', 'updated_at', 'timestamptz', 'NO'),

    ('student_profiles', 'student_id', 'uuid', 'NO'),
    ('student_profiles', 'roll_number', 'text', 'NO'),
    ('student_profiles', 'personal_email', 'text', 'NO'),
    ('student_profiles', 'mobile_number', 'text', 'NO'),
    ('student_profiles', 'college', 'text', 'NO'),
    ('student_profiles', 'course', 'text', 'NO'),
    ('student_profiles', 'department', 'text', 'NO'),
    ('student_profiles', 'current_year', 'int4', 'YES'),
    ('student_profiles', 'current_semester', 'int4', 'YES'),
    ('student_profiles', 'graduation_year', 'int4', 'NO'),
    ('student_profiles', 'cgpa', 'numeric', 'YES'),
    ('student_profiles', 'cgpa_scale', 'numeric', 'NO'),
    ('student_profiles', 'cgpa_unavailable', 'bool', 'NO'),
    ('student_profiles', 'active_backlogs', 'int4', 'NO'),
    ('student_profiles', 'cleared_backlogs', 'int4', 'NO'),
    ('student_profiles', 'sslc_percentage', 'numeric', 'YES'),
    ('student_profiles', 'hsc_percentage', 'numeric', 'YES'),
    ('student_profiles', 'diploma_percentage', 'numeric', 'YES'),
    ('student_profiles', 'academic_remarks', 'text', 'YES'),
    ('student_profiles', 'profile_status', 'student_profile_status', 'NO'),
    ('student_profiles', 'profile_submitted_at', 'timestamptz', 'YES'),
    ('student_profiles', 'created_at', 'timestamptz', 'NO'),
    ('student_profiles', 'updated_at', 'timestamptz', 'NO'),

    ('student_preferences', 'student_id', 'uuid', 'NO'),
    (
      'student_preferences',
      'higher_studies_interest',
      'higher_studies_interest',
      'NO'
    ),
    (
      'student_preferences',
      'preferred_study_level',
      'student_preferred_study_level',
      'YES'
    ),
    ('student_preferences', 'preferred_countries', '_text', 'NO'),
    ('student_preferences', 'preferred_program_areas', '_text', 'NO'),
    ('student_preferences', 'target_intake', 'text', 'YES'),
    ('student_preferences', 'budget_range', 'text', 'YES'),
    ('student_preferences', 'scholarship_required', 'bool', 'YES'),
    ('student_preferences', 'funding_required', 'bool', 'YES'),
    ('student_preferences', 'study_mode', 'student_study_mode', 'YES'),
    (
      'student_preferences',
      'academic_preference',
      'student_academic_preference',
      'YES'
    ),
    (
      'student_preferences',
      'student_planning_stage',
      'student_planning_stage',
      'YES'
    ),
    ('student_preferences', 'created_at', 'timestamptz', 'NO'),
    ('student_preferences', 'updated_at', 'timestamptz', 'NO'),

    ('student_test_scores', 'id', 'uuid', 'NO'),
    ('student_test_scores', 'student_id', 'uuid', 'NO'),
    ('student_test_scores', 'exam_name', 'student_exam_name', 'NO'),
    ('student_test_scores', 'custom_exam_name', 'text', 'YES'),
    ('student_test_scores', 'exam_status', 'student_exam_status', 'NO'),
    ('student_test_scores', 'attempt_number', 'int4', 'NO'),
    ('student_test_scores', 'planned_date', 'date', 'YES'),
    ('student_test_scores', 'completed_date', 'date', 'YES'),
    ('student_test_scores', 'score', 'text', 'YES'),
    ('student_test_scores', 'valid_until', 'date', 'YES'),
    ('student_test_scores', 'remarks', 'text', 'YES'),
    ('student_test_scores', 'created_at', 'timestamptz', 'NO'),
    ('student_test_scores', 'updated_at', 'timestamptz', 'NO'),

    ('student_achievements', 'id', 'uuid', 'NO'),
    ('student_achievements', 'student_id', 'uuid', 'NO'),
    (
      'student_achievements',
      'achievement_type',
      'student_achievement_type',
      'NO'
    ),
    ('student_achievements', 'title', 'text', 'NO'),
    ('student_achievements', 'organization', 'text', 'YES'),
    ('student_achievements', 'achievement_date', 'date', 'YES'),
    ('student_achievements', 'description', 'text', 'YES'),
    ('student_achievements', 'created_at', 'timestamptz', 'NO'),
    ('student_achievements', 'updated_at', 'timestamptz', 'NO'),

    ('counselor_student_notes', 'id', 'uuid', 'NO'),
    ('counselor_student_notes', 'student_id', 'uuid', 'NO'),
    ('counselor_student_notes', 'counselor_id', 'uuid', 'NO'),
    ('counselor_student_notes', 'consultation_id', 'uuid', 'YES'),
    ('counselor_student_notes', 'note_text', 'text', 'NO'),
    ('counselor_student_notes', 'is_pinned', 'bool', 'NO'),
    ('counselor_student_notes', 'created_at', 'timestamptz', 'NO'),
    ('counselor_student_notes', 'updated_at', 'timestamptz', 'NO'),

    ('counselor_follow_ups', 'id', 'uuid', 'NO'),
    ('counselor_follow_ups', 'student_id', 'uuid', 'NO'),
    ('counselor_follow_ups', 'counselor_id', 'uuid', 'NO'),
    ('counselor_follow_ups', 'consultation_id', 'uuid', 'YES'),
    ('counselor_follow_ups', 'due_date', 'date', 'NO'),
    (
      'counselor_follow_ups',
      'priority',
      'counselor_follow_up_priority',
      'NO'
    ),
    (
      'counselor_follow_ups',
      'status',
      'counselor_follow_up_status',
      'NO'
    ),
    ('counselor_follow_ups', 'next_action', 'text', 'NO'),
    ('counselor_follow_ups', 'details', 'text', 'YES'),
    ('counselor_follow_ups', 'completed_at', 'timestamptz', 'YES'),
    ('counselor_follow_ups', 'completed_by', 'uuid', 'YES'),
    ('counselor_follow_ups', 'created_at', 'timestamptz', 'NO'),
    ('counselor_follow_ups', 'updated_at', 'timestamptz', 'NO'),

    ('student_counseling_progressions', 'student_id', 'uuid', 'NO'),
    (
      'student_counseling_progressions',
      'current_stage',
      'counseling_progression_stage',
      'NO'
    ),
    (
      'student_counseling_progressions',
      'workflow_state',
      'counseling_progression_state',
      'NO'
    ),
    (
      'student_counseling_progressions',
      'stage_started_at',
      'timestamptz',
      'NO'
    ),
    (
      'student_counseling_progressions',
      'last_changed_at',
      'timestamptz',
      'NO'
    ),
    (
      'student_counseling_progressions',
      'last_changed_by',
      'uuid',
      'NO'
    ),
    ('student_counseling_progressions', 'created_at', 'timestamptz', 'NO'),
    ('student_counseling_progressions', 'updated_at', 'timestamptz', 'NO'),

    ('student_counseling_progression_events', 'id', 'uuid', 'NO'),
    (
      'student_counseling_progression_events',
      'student_id',
      'uuid',
      'NO'
    ),
    (
      'student_counseling_progression_events',
      'previous_stage',
      'counseling_progression_stage',
      'YES'
    ),
    (
      'student_counseling_progression_events',
      'new_stage',
      'counseling_progression_stage',
      'NO'
    ),
    (
      'student_counseling_progression_events',
      'previous_state',
      'counseling_progression_state',
      'YES'
    ),
    (
      'student_counseling_progression_events',
      'new_state',
      'counseling_progression_state',
      'NO'
    ),
    (
      'student_counseling_progression_events',
      'changed_by',
      'uuid',
      'NO'
    ),
    (
      'student_counseling_progression_events',
      'change_reason',
      'text',
      'YES'
    ),
    (
      'student_counseling_progression_events',
      'changed_at',
      'timestamptz',
      'NO'
    ),

    ('student_profile_completion', 'student_id', 'uuid', 'YES'),
    (
      'student_profile_completion',
      'profile_status',
      'student_profile_status',
      'YES'
    ),
    (
      'student_profile_completion',
      'academic_section_complete',
      'bool',
      'YES'
    ),
    (
      'student_profile_completion',
      'preferences_section_complete',
      'bool',
      'YES'
    ),
    (
      'student_profile_completion',
      'test_scores_section_started',
      'bool',
      'YES'
    ),
    (
      'student_profile_completion',
      'achievements_section_started',
      'bool',
      'YES'
    ),
    (
      'student_profile_completion',
      'essential_fields_completed',
      'int4',
      'YES'
    ),
    (
      'student_profile_completion',
      'essential_fields_total',
      'int4',
      'YES'
    ),
    (
      'student_profile_completion',
      'overall_completion_percentage',
      'int4',
      'YES'
    ),
    (
      'student_profile_completion',
      'ready_for_counseling',
      'bool',
      'YES'
    )
)
select
  'column'::text as category,
  required.table_name || '.' || required.column_name as object_name,
  (
    actual.column_name is not null
    and actual.udt_name = required.udt_name
    and actual.is_nullable = required.is_nullable
  ) as passed
from required_columns as required
left join information_schema.columns as actual
  on actual.table_schema = 'public'
  and actual.table_name = required.table_name
  and actual.column_name = required.column_name
order by required.table_name, required.column_name;

with required_defaults(table_name, column_name, expected_fragment) as (
  values
    ('counselor_student_notes', 'id', 'gen_random_uuid()'),
    ('counselor_student_notes', 'is_pinned', 'false'),
    ('counselor_student_notes', 'created_at', 'now()'),
    ('counselor_student_notes', 'updated_at', 'now()'),
    ('counselor_follow_ups', 'id', 'gen_random_uuid()'),
    ('counselor_follow_ups', 'priority', '''normal'''),
    ('counselor_follow_ups', 'status', '''pending'''),
    ('counselor_follow_ups', 'created_at', 'now()'),
    ('counselor_follow_ups', 'updated_at', 'now()'),
    (
      'student_counseling_progressions',
      'workflow_state',
      '''active'''
    ),
    (
      'student_counseling_progressions',
      'stage_started_at',
      'now()'
    ),
    (
      'student_counseling_progressions',
      'last_changed_at',
      'now()'
    ),
    ('student_counseling_progressions', 'created_at', 'now()'),
    ('student_counseling_progressions', 'updated_at', 'now()'),
    (
      'student_counseling_progression_events',
      'id',
      'gen_random_uuid()'
    ),
    (
      'student_counseling_progression_events',
      'changed_at',
      'now()'
    )
)
select
  'column_default'::text as category,
  required.table_name || '.' || required.column_name as object_name,
  (
    actual.column_default is not null
    and pg_catalog.strpos(
      pg_catalog.lower(actual.column_default),
      required.expected_fragment
    ) > 0
  ) as passed
from required_defaults as required
left join information_schema.columns as actual
  on actual.table_schema = 'public'
  and actual.table_name = required.table_name
  and actual.column_name = required.column_name
order by required.table_name, required.column_name;

with required_constraints(table_name, constraint_name) as (
  values
    ('profiles', 'profiles_pkey'),
    ('profiles', 'profiles_user_id_fkey'),
    ('profiles', 'profiles_college_email_key'),
    ('profiles', 'profiles_college_email_check'),
    ('profiles', 'profiles_full_name_check'),
    ('consultation_requests', 'consultation_requests_pkey'),
    (
      'consultation_requests',
      'consultation_requests_request_number_key'
    ),
    (
      'consultation_requests',
      'consultation_requests_student_id_fkey'
    ),
    (
      'consultation_requests',
      'consultation_requests_assigned_counselor_id_fkey'
    ),
    (
      'consultation_requests',
      'consultation_requests_request_number_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_student_name_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_roll_number_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_college_email_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_personal_email_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_college_end_year_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_department_check'
    ),
    ('consultation_requests', 'consultation_requests_course_check'),
    (
      'consultation_requests',
      'consultation_requests_mobile_number_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_counselor_not_student_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_assignment_pair_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_booking_fields_together_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_slot_start_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_slot_duration_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_booking_weekday_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_status_assignment_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_outcome_pair_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_no_show_audit_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_assigned_at_check'
    ),
    (
      'consultation_requests',
      'consultation_requests_updated_at_check'
    ),
    ('student_profiles', 'student_profiles_pkey'),
    ('student_profiles', 'student_profiles_student_id_fkey'),
    ('student_profiles', 'student_profiles_roll_number_check'),
    ('student_profiles', 'student_profiles_personal_email_check'),
    ('student_profiles', 'student_profiles_mobile_number_check'),
    ('student_profiles', 'student_profiles_college_check'),
    ('student_profiles', 'student_profiles_course_check'),
    ('student_profiles', 'student_profiles_department_check'),
    ('student_profiles', 'student_profiles_current_year_check'),
    ('student_profiles', 'student_profiles_current_semester_check'),
    ('student_profiles', 'student_profiles_year_semester_check'),
    ('student_profiles', 'student_profiles_graduation_year_check'),
    ('student_profiles', 'student_profiles_cgpa_scale_check'),
    ('student_profiles', 'student_profiles_cgpa_check'),
    ('student_profiles', 'student_profiles_cgpa_availability_check'),
    ('student_profiles', 'student_profiles_active_backlogs_check'),
    ('student_profiles', 'student_profiles_cleared_backlogs_check'),
    ('student_profiles', 'student_profiles_sslc_percentage_check'),
    ('student_profiles', 'student_profiles_hsc_percentage_check'),
    ('student_profiles', 'student_profiles_diploma_percentage_check'),
    ('student_profiles', 'student_profiles_academic_remarks_check'),
    ('student_profiles', 'student_profiles_submission_state_check'),
    ('student_profiles', 'student_profiles_submitted_at_check'),
    ('student_profiles', 'student_profiles_updated_at_check'),
    ('student_preferences', 'student_preferences_pkey'),
    (
      'student_preferences',
      'student_preferences_student_id_fkey'
    ),
    ('student_preferences', 'student_preferences_countries_check'),
    (
      'student_preferences',
      'student_preferences_program_areas_check'
    ),
    (
      'student_preferences',
      'student_preferences_target_intake_check'
    ),
    ('student_preferences', 'student_preferences_budget_range_check'),
    ('student_preferences', 'student_preferences_updated_at_check'),
    ('student_test_scores', 'student_test_scores_pkey'),
    (
      'student_test_scores',
      'student_test_scores_student_id_fkey'
    ),
    (
      'student_test_scores',
      'student_test_scores_completed_status_check'
    ),
    (
      'student_test_scores',
      'student_test_scores_custom_exam_name_check'
    ),
    (
      'student_test_scores',
      'student_test_scores_attempt_number_check'
    ),
    ('student_test_scores', 'student_test_scores_booked_status_check'),
    ('student_test_scores', 'student_test_scores_inactive_status_check'),
    ('student_test_scores', 'student_test_scores_date_order_check'),
    ('student_test_scores', 'student_test_scores_valid_until_check'),
    ('student_test_scores', 'student_test_scores_score_check'),
    ('student_test_scores', 'student_test_scores_remarks_check'),
    ('student_test_scores', 'student_test_scores_updated_at_check'),
    ('student_achievements', 'student_achievements_pkey'),
    (
      'student_achievements',
      'student_achievements_student_id_fkey'
    ),
    ('student_achievements', 'student_achievements_title_check'),
    (
      'student_achievements',
      'student_achievements_organization_check'
    ),
    ('student_achievements', 'student_achievements_date_check'),
    (
      'student_achievements',
      'student_achievements_description_check'
    ),
    (
      'student_achievements',
      'student_achievements_updated_at_check'
    ),
    ('counselor_student_notes', 'counselor_student_notes_pkey'),
    (
      'counselor_student_notes',
      'counselor_student_notes_student_id_fkey'
    ),
    (
      'counselor_student_notes',
      'counselor_student_notes_counselor_id_fkey'
    ),
    (
      'counselor_student_notes',
      'counselor_student_notes_consultation_id_fkey'
    ),
    (
      'counselor_student_notes',
      'counselor_student_notes_distinct_people_check'
    ),
    (
      'counselor_student_notes',
      'counselor_student_notes_note_text_check'
    ),
    (
      'counselor_student_notes',
      'counselor_student_notes_updated_at_check'
    ),
    ('counselor_follow_ups', 'counselor_follow_ups_pkey'),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_student_id_fkey'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_counselor_id_fkey'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_consultation_id_fkey'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_completed_by_fkey'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_distinct_people_check'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_due_date_check'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_next_action_check'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_details_check'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_completion_state_check'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_completed_at_check'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_updated_at_check'
    ),
    (
      'student_counseling_progressions',
      'student_counseling_progressions_pkey'
    ),
    (
      'student_counseling_progressions',
      'student_counseling_progressions_student_id_fkey'
    ),
    (
      'student_counseling_progressions',
      'student_counseling_progressions_last_changed_by_fkey'
    ),
    (
      'student_counseling_progressions',
      'student_counseling_progressions_distinct_people_check'
    ),
    (
      'student_counseling_progressions',
      'student_counseling_progressions_timestamp_order_check'
    ),
    (
      'student_counseling_progression_events',
      'student_counseling_progression_events_pkey'
    ),
    (
      'student_counseling_progression_events',
      'student_counseling_progression_events_student_id_fkey'
    ),
    (
      'student_counseling_progression_events',
      'student_counseling_progression_events_changed_by_fkey'
    ),
    (
      'student_counseling_progression_events',
      'student_counseling_progression_events_distinct_people_check'
    ),
    (
      'student_counseling_progression_events',
      'student_counseling_progression_events_previous_pair_check'
    ),
    (
      'student_counseling_progression_events',
      'student_counseling_progression_events_transition_check'
    ),
    (
      'student_counseling_progression_events',
      'student_counseling_progression_events_reason_check'
    )
)
select
  'constraint'::text as category,
  required.table_name || '.' || required.constraint_name as object_name,
  constraint_record.oid is not null as passed
from required_constraints as required
left join pg_catalog.pg_namespace as namespace
  on namespace.nspname = 'public'
left join pg_catalog.pg_class as table_record
  on table_record.relnamespace = namespace.oid
  and table_record.relname = required.table_name
left join pg_catalog.pg_constraint as constraint_record
  on constraint_record.conrelid = table_record.oid
  and constraint_record.conname = required.constraint_name
order by required.table_name, required.constraint_name;

with required_functions(function_signature, security_definer) as (
  values
    ('public.set_profiles_updated_at()', false),
    ('public.handle_new_user()', true),
    ('public.prepare_consultation_request_insert()', true),
    ('public.get_consultation_slot_availability(date)', true),
    (
      'public.get_counselor_consultation_references(uuid[])',
      true
    ),
    (
      'public.is_valid_student_profile_text_array(text[],integer,integer)',
      false
    ),
    ('public.has_active_verified_kgeo_role(public.user_role)', true),
    ('public.prepare_student_owned_insert()', false),
    ('public.normalize_student_profile_record()', false),
    ('public.normalize_student_preferences_record()', false),
    ('public.normalize_student_test_score_record()', false),
    ('public.normalize_student_achievement_record()', false),
    (
      'public.list_counselor_student_directory(text,text,text,text,integer,boolean,public.student_directory_profile_state,public.higher_studies_interest,public.student_preferred_study_level,text,text,integer,integer)',
      true
    ),
    ('public.get_counselor_student_identity(uuid)', true),
    ('public.record_consultation_outcome(uuid,text)', true),
    (
      'public.save_student_identity(text,text,text,text,text,text,text,integer,integer,integer)',
      true
    ),
    ('public.prepare_counselor_private_record()', true),
    ('public.normalize_counselor_student_note()', false),
    ('public.normalize_counselor_follow_up()', false),
    (
      'public.record_counselor_follow_up_status(uuid,text)',
      true
    ),
    (
      'public.list_counselor_follow_up_workload(text,text,text,date,date,integer,integer)',
      true
    ),
    (
      'public.record_student_counseling_progression(uuid,text,text,text)',
      true
    )
),
resolved_functions as (
  select
    required.function_signature,
    required.security_definer,
    pg_catalog.to_regprocedure(required.function_signature) as function_oid
  from required_functions as required
)
select
  'function'::text as category,
  resolved.function_signature as object_name,
  (
    function_record.oid is not null
    and function_record.prosecdef = resolved.security_definer
    and coalesce(function_record.proconfig, array[]::text[]) in (array['search_path=']::text[], array['search_path=""']::text[])
  ) as passed
from resolved_functions as resolved
left join pg_catalog.pg_proc as function_record
  on function_record.oid = resolved.function_oid
order by resolved.function_signature;

with expected_return_columns(
  column_position,
  column_name,
  udt_name
) as (
  values
    (1, 'follow_up_id', 'uuid'),
    (2, 'student_id', 'uuid'),
    (3, 'consultation_id', 'uuid'),
    (4, 'due_date', 'date'),
    (5, 'priority', 'counselor_follow_up_priority'),
    (6, 'stored_status', 'counselor_follow_up_status'),
    (7, 'next_action', 'text'),
    (8, 'completed_at', 'timestamptz'),
    (9, 'created_at', 'timestamptz'),
    (10, 'updated_at', 'timestamptz'),
    (11, 'full_name', 'text'),
    (12, 'college_email', 'text'),
    (13, 'roll_number', 'text'),
    (14, 'total_count', 'int8'),
    (15, 'overdue_count', 'int8'),
    (16, 'due_today_count', 'int8'),
    (17, 'upcoming_count', 'int8'),
    (18, 'completed_count', 'int8'),
    (19, 'cancelled_count', 'int8'),
    (20, 'total_pending_count', 'int8')
),
target_function as (
  select pg_catalog.to_regprocedure(
    'public.list_counselor_follow_up_workload(text,text,text,date,date,integer,integer)'
  )::oid as function_oid
),
actual_return_columns as (
  select
    pg_catalog.row_number() over (
      order by parameter.ordinal_position
    )::integer as column_position,
    parameter.parameter_name as column_name,
    parameter.udt_name
  from information_schema.parameters as parameter
  cross join target_function as target
  where parameter.specific_schema = 'public'
    and parameter.specific_name =
      'list_counselor_follow_up_workload_' ||
      target.function_oid::text
    and parameter.parameter_mode = 'OUT'
)
select
  'function_return_column'::text as category,
  expected.column_position::text || ':' || expected.column_name
    as object_name,
  (
    actual.column_name = expected.column_name
    and actual.udt_name = expected.udt_name
  ) as passed
from expected_return_columns as expected
left join actual_return_columns as actual
  on actual.column_position = expected.column_position
order by expected.column_position;

with expected_progression_arguments(
  argument_position,
  argument_name,
  udt_name
) as (
  values
    (1, 'p_student_id', 'uuid'),
    (2, 'p_stage', 'text'),
    (3, 'p_state', 'text'),
    (4, 'p_change_reason', 'text')
),
target_progression_function as (
  select pg_catalog.to_regprocedure(
    'public.record_student_counseling_progression(uuid,text,text,text)'
  )::oid as function_oid
),
actual_progression_arguments as (
  select
    pg_catalog.row_number() over (
      order by parameter.ordinal_position
    )::integer as argument_position,
    parameter.parameter_name as argument_name,
    parameter.udt_name
  from information_schema.parameters as parameter
  cross join target_progression_function as target
  where parameter.specific_schema = 'public'
    and parameter.specific_name =
      'record_student_counseling_progression_' ||
      target.function_oid::text
    and parameter.parameter_mode = 'IN'
)
select
  'function_argument'::text as category,
  'D3:' || expected.argument_position::text || ':' ||
    expected.argument_name as object_name,
  (
    actual.argument_name = expected.argument_name
    and actual.udt_name = expected.udt_name
  ) as passed
from expected_progression_arguments as expected
left join actual_progression_arguments as actual
  on actual.argument_position = expected.argument_position
order by expected.argument_position;

with expected_progression_return_columns(
  column_position,
  column_name,
  udt_name
) as (
  values
    (1, 'student_id', 'uuid'),
    (2, 'current_stage', 'counseling_progression_stage'),
    (3, 'workflow_state', 'counseling_progression_state'),
    (4, 'stage_started_at', 'timestamptz'),
    (5, 'last_changed_at', 'timestamptz'),
    (6, 'last_changed_by', 'uuid'),
    (7, 'created_at', 'timestamptz'),
    (8, 'updated_at', 'timestamptz')
),
target_progression_function as (
  select pg_catalog.to_regprocedure(
    'public.record_student_counseling_progression(uuid,text,text,text)'
  )::oid as function_oid
),
actual_progression_return_columns as (
  select
    pg_catalog.row_number() over (
      order by parameter.ordinal_position
    )::integer as column_position,
    parameter.parameter_name as column_name,
    parameter.udt_name
  from information_schema.parameters as parameter
  cross join target_progression_function as target
  where parameter.specific_schema = 'public'
    and parameter.specific_name =
      'record_student_counseling_progression_' ||
      target.function_oid::text
    and parameter.parameter_mode = 'OUT'
)
select
  'function_return_column'::text as category,
  'D3:' || expected.column_position::text || ':' ||
    expected.column_name as object_name,
  (
    actual.column_name = expected.column_name
    and actual.udt_name = expected.udt_name
  ) as passed
from expected_progression_return_columns as expected
left join actual_progression_return_columns as actual
  on actual.column_position = expected.column_position
order by expected.column_position;

with required_triggers(table_schema, table_name, trigger_name) as (
  values
    ('public', 'profiles', 'profiles_set_updated_at'),
    ('auth', 'users', 'on_auth_user_created'),
    (
      'public',
      'consultation_requests',
      'consultation_requests_prepare_insert'
    ),
    (
      'public',
      'consultation_requests',
      'consultation_requests_set_updated_at'
    ),
    ('public', 'student_profiles', 'student_profiles_10_prepare_insert'),
    ('public', 'student_profiles', 'student_profiles_20_normalize'),
    ('public', 'student_profiles', 'student_profiles_30_set_updated_at'),
    (
      'public',
      'student_preferences',
      'student_preferences_10_prepare_insert'
    ),
    (
      'public',
      'student_preferences',
      'student_preferences_20_normalize'
    ),
    (
      'public',
      'student_preferences',
      'student_preferences_30_set_updated_at'
    ),
    (
      'public',
      'student_test_scores',
      'student_test_scores_10_prepare_insert'
    ),
    (
      'public',
      'student_test_scores',
      'student_test_scores_20_normalize'
    ),
    (
      'public',
      'student_test_scores',
      'student_test_scores_30_set_updated_at'
    ),
    (
      'public',
      'student_achievements',
      'student_achievements_10_prepare_insert'
    ),
    (
      'public',
      'student_achievements',
      'student_achievements_20_normalize'
    ),
    (
      'public',
      'student_achievements',
      'student_achievements_30_set_updated_at'
    ),
    (
      'public',
      'counselor_student_notes',
      'counselor_student_notes_10_prepare'
    ),
    (
      'public',
      'counselor_student_notes',
      'counselor_student_notes_20_normalize'
    ),
    (
      'public',
      'counselor_follow_ups',
      'counselor_follow_ups_10_prepare'
    ),
    (
      'public',
      'counselor_follow_ups',
      'counselor_follow_ups_20_normalize'
    )
)
select
  'trigger'::text as category,
  required.table_schema || '.' || required.table_name || '.' ||
    required.trigger_name as object_name,
  (
    trigger_record.oid is not null
    and trigger_record.tgenabled <> 'D'
  ) as passed
from required_triggers as required
left join pg_catalog.pg_namespace as namespace
  on namespace.nspname = required.table_schema
left join pg_catalog.pg_class as table_record
  on table_record.relnamespace = namespace.oid
  and table_record.relname = required.table_name
left join pg_catalog.pg_trigger as trigger_record
  on trigger_record.tgrelid = table_record.oid
  and trigger_record.tgname = required.trigger_name
  and not trigger_record.tgisinternal
order by required.table_schema, required.table_name, required.trigger_name;

with required_policies(table_name, policy_name, command_name) as (
  values
    ('profiles', 'profiles_select_own', 'SELECT'),
    ('profiles', 'profiles_update_own', 'UPDATE'),
    (
      'consultation_requests',
      'consultation_requests_select_own',
      'SELECT'
    ),
    (
      'consultation_requests',
      'consultation_requests_insert_own',
      'INSERT'
    ),
    (
      'consultation_requests',
      'consultation_requests_select_counselor_all',
      'SELECT'
    ),
    (
      'consultation_requests',
      'consultation_requests_select_director_admin_all',
      'SELECT'
    ),
    ('student_profiles', 'student_profiles_select_own', 'SELECT'),
    ('student_profiles', 'student_profiles_insert_own', 'INSERT'),
    ('student_profiles', 'student_profiles_update_own', 'UPDATE'),
    (
      'student_profiles',
      'student_profiles_select_counselor_all',
      'SELECT'
    ),
    ('student_preferences', 'student_preferences_select_own', 'SELECT'),
    ('student_preferences', 'student_preferences_insert_own', 'INSERT'),
    ('student_preferences', 'student_preferences_update_own', 'UPDATE'),
    (
      'student_preferences',
      'student_preferences_select_counselor_all',
      'SELECT'
    ),
    ('student_test_scores', 'student_test_scores_select_own', 'SELECT'),
    ('student_test_scores', 'student_test_scores_insert_own', 'INSERT'),
    ('student_test_scores', 'student_test_scores_update_own', 'UPDATE'),
    ('student_test_scores', 'student_test_scores_delete_own', 'DELETE'),
    (
      'student_test_scores',
      'student_test_scores_select_counselor_all',
      'SELECT'
    ),
    ('student_achievements', 'student_achievements_select_own', 'SELECT'),
    ('student_achievements', 'student_achievements_insert_own', 'INSERT'),
    ('student_achievements', 'student_achievements_update_own', 'UPDATE'),
    ('student_achievements', 'student_achievements_delete_own', 'DELETE'),
    (
      'student_achievements',
      'student_achievements_select_counselor_all',
      'SELECT'
    ),
    (
      'counselor_student_notes',
      'counselor_student_notes_select_own',
      'SELECT'
    ),
    (
      'counselor_student_notes',
      'counselor_student_notes_insert_own',
      'INSERT'
    ),
    (
      'counselor_student_notes',
      'counselor_student_notes_update_own',
      'UPDATE'
    ),
    (
      'counselor_student_notes',
      'counselor_student_notes_delete_own',
      'DELETE'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_select_own',
      'SELECT'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_insert_own',
      'INSERT'
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_update_pending_own',
      'UPDATE'
    ),
    (
      'student_counseling_progressions',
      'student_counseling_progressions_select_counselor',
      'SELECT'
    ),
    (
      'student_counseling_progression_events',
      'student_counseling_progression_events_select_counselor',
      'SELECT'
    )
)
select
  'policy'::text as category,
  required.table_name || '.' || required.policy_name as object_name,
  (
    actual.policyname is not null
    and actual.cmd = required.command_name
    and actual.roles = array['authenticated']::name[]
  ) as passed
from required_policies as required
left join pg_catalog.pg_policies as actual
  on actual.schemaname = 'public'
  and actual.tablename = required.table_name
  and actual.policyname = required.policy_name
order by required.table_name, required.policy_name;

with required_indexes(table_name, index_name, must_be_unique) as (
  values
    ('profiles', 'profiles_pkey', true),
    ('profiles', 'profiles_college_email_key', true),
    (
      'consultation_requests',
      'consultation_requests_active_slot_key',
      true
    ),
    (
      'consultation_requests',
      'consultation_requests_student_history_idx',
      false
    ),
    (
      'consultation_requests',
      'consultation_requests_status_idx',
      false
    ),
    (
      'consultation_requests',
      'consultation_requests_submitted_at_idx',
      false
    ),
    (
      'consultation_requests',
      'consultation_requests_assigned_counselor_id_idx',
      false
    ),
    (
      'consultation_requests',
      'consultation_requests_fcfs_idx',
      false
    ),
    (
      'consultation_requests',
      'consultation_requests_scheduled_end_idx',
      false
    ),
    (
      'student_profiles',
      'student_profiles_college_roll_number_key',
      true
    ),
    ('student_profiles', 'student_profiles_status_updated_idx', false),
    ('student_profiles', 'student_profiles_academic_filter_idx', false),
    (
      'student_profiles',
      'student_profiles_roll_number_pattern_idx',
      false
    ),
    (
      'student_preferences',
      'student_preferences_directory_filter_idx',
      false
    ),
    (
      'student_preferences',
      'student_preferences_countries_idx',
      false
    ),
    (
      'student_preferences',
      'student_preferences_program_areas_idx',
      false
    ),
    (
      'student_test_scores',
      'student_test_scores_student_history_idx',
      false
    ),
    ('student_test_scores', 'student_test_scores_attempt_key', true),
    (
      'student_test_scores',
      'student_test_scores_directory_filter_idx',
      false
    ),
    (
      'student_achievements',
      'student_achievements_student_history_idx',
      false
    ),
    (
      'counselor_student_notes',
      'counselor_student_notes_student_history_idx',
      false
    ),
    (
      'counselor_student_notes',
      'counselor_student_notes_counselor_activity_idx',
      false
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_student_status_due_idx',
      false
    ),
    (
      'counselor_follow_ups',
      'counselor_follow_ups_counselor_status_due_idx',
      false
    ),
    (
      'student_counseling_progressions',
      'student_counseling_progressions_state_stage_updated_idx',
      false
    ),
    (
      'student_counseling_progression_events',
      'student_counseling_progression_events_student_history_idx',
      false
    )
)
select
  'index'::text as category,
  required.table_name || '.' || required.index_name as object_name,
  (
    index_record.indexrelid is not null
    and index_record.indisvalid
    and index_record.indisready
    and index_record.indisunique = required.must_be_unique
  ) as passed
from required_indexes as required
left join pg_catalog.pg_namespace as namespace
  on namespace.nspname = 'public'
left join pg_catalog.pg_class as table_record
  on table_record.relnamespace = namespace.oid
  and table_record.relname = required.table_name
left join pg_catalog.pg_class as named_index
  on named_index.relnamespace = namespace.oid
  and named_index.relname = required.index_name
left join pg_catalog.pg_index as index_record
  on index_record.indrelid = table_record.oid
  and index_record.indexrelid = named_index.oid
order by required.table_name, required.index_name;

with required_rls(table_name) as (
  values
    ('profiles'),
    ('consultation_requests'),
    ('student_profiles'),
    ('student_preferences'),
    ('student_test_scores'),
    ('student_achievements'),
    ('counselor_student_notes'),
    ('counselor_follow_ups'),
    ('student_counseling_progressions'),
    ('student_counseling_progression_events')
)
select
  'row_level_security'::text as category,
  required.table_name as object_name,
  coalesce(table_record.relrowsecurity, false) as passed
from required_rls as required
left join pg_catalog.pg_namespace as namespace
  on namespace.nspname = 'public'
left join pg_catalog.pg_class as table_record
  on table_record.relnamespace = namespace.oid
  and table_record.relname = required.table_name
order by required.table_name;

with callable_functions(function_signature) as (
  values
    ('public.get_consultation_slot_availability(date)'),
    ('public.get_counselor_consultation_references(uuid[])'),
    (
      'public.is_valid_student_profile_text_array(text[],integer,integer)'
    ),
    ('public.has_active_verified_kgeo_role(public.user_role)'),
    (
      'public.list_counselor_student_directory(text,text,text,text,integer,boolean,public.student_directory_profile_state,public.higher_studies_interest,public.student_preferred_study_level,text,text,integer,integer)'
    ),
    ('public.get_counselor_student_identity(uuid)'),
    ('public.record_consultation_outcome(uuid,text)'),
    (
      'public.save_student_identity(text,text,text,text,text,text,text,integer,integer,integer)'
    ),
    ('public.record_counselor_follow_up_status(uuid,text)'),
    (
      'public.list_counselor_follow_up_workload(text,text,text,date,date,integer,integer)'
    ),
    (
      'public.record_student_counseling_progression(uuid,text,text,text)'
    )
),
resolved_functions as (
  select
    callable.function_signature,
    pg_catalog.to_regprocedure(callable.function_signature) as function_oid
  from callable_functions as callable
)
select
  'function_privilege'::text as category,
  resolved.function_signature as object_name,
  (
    resolved.function_oid is not null
    and pg_catalog.has_function_privilege(
      'authenticated',
      resolved.function_oid,
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'anon',
      resolved.function_oid,
      'EXECUTE'
    )
    and not exists (
      select 1
      from pg_catalog.pg_proc as function_record
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          function_record.proacl,
          pg_catalog.acldefault('f', function_record.proowner)
        )
      ) as access_entry
      where function_record.oid = resolved.function_oid
        and access_entry.grantee = 0
        and access_entry.privilege_type = 'EXECUTE'
    )
  ) as passed
from resolved_functions as resolved
order by resolved.function_signature;

with internal_functions(function_signature) as (
  values
    ('public.set_profiles_updated_at()'),
    ('public.handle_new_user()'),
    ('public.prepare_consultation_request_insert()'),
    ('public.prepare_student_owned_insert()'),
    ('public.normalize_student_profile_record()'),
    ('public.normalize_student_preferences_record()'),
    ('public.normalize_student_test_score_record()'),
    ('public.normalize_student_achievement_record()'),
    ('public.prepare_counselor_private_record()'),
    ('public.normalize_counselor_student_note()'),
    ('public.normalize_counselor_follow_up()')
),
resolved_functions as (
  select
    internal.function_signature,
    pg_catalog.to_regprocedure(internal.function_signature) as function_oid
  from internal_functions as internal
)
select
  'function_privilege'::text as category,
  resolved.function_signature as object_name,
  (
    resolved.function_oid is not null
    and not pg_catalog.has_function_privilege(
      'authenticated',
      resolved.function_oid,
      'EXECUTE'
    )
    and not pg_catalog.has_function_privilege(
      'anon',
      resolved.function_oid,
      'EXECUTE'
    )
    and not exists (
      select 1
      from pg_catalog.pg_proc as function_record
      cross join lateral pg_catalog.aclexplode(
        coalesce(
          function_record.proacl,
          pg_catalog.acldefault('f', function_record.proowner)
        )
      ) as access_entry
      where function_record.oid = resolved.function_oid
        and access_entry.grantee = 0
        and access_entry.privilege_type = 'EXECUTE'
    )
  ) as passed
from resolved_functions as resolved
order by resolved.function_signature;

select
  'privilege_boundary'::text as category,
  check_name as object_name,
  passed
from (
  values
    (
      'anonymous has no private table privileges',
      not exists (
        select 1
        from information_schema.table_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name in (
            'profiles',
            'consultation_requests',
            'student_profiles',
            'student_preferences',
            'student_test_scores',
            'student_achievements',
            'student_profile_completion',
            'counselor_student_notes',
            'counselor_follow_ups',
            'student_counseling_progressions',
            'student_counseling_progression_events'
          )
          and privilege.grantee in ('anon', 'PUBLIC')
      )
      and not exists (
        select 1
        from information_schema.column_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name in (
            'profiles',
            'consultation_requests',
            'student_profiles',
            'student_preferences',
            'student_test_scores',
            'student_achievements',
            'student_profile_completion',
            'counselor_student_notes',
            'counselor_follow_ups',
            'student_counseling_progressions',
            'student_counseling_progression_events'
          )
          and privilege.grantee in ('anon', 'PUBLIC')
      )
    ),
    (
      'authenticated has no table-wide consultation select',
      not exists (
        select 1
        from information_schema.table_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name = 'consultation_requests'
          and privilege.grantee = 'authenticated'
          and privilege.privilege_type = 'SELECT'
      )
    ),
    (
      'authenticated cannot select consultation request number',
      not pg_catalog.has_column_privilege(
        'authenticated',
        'public.consultation_requests',
        'request_number',
        'SELECT'
      )
    ),
    (
      'authenticated retains safe consultation columns',
      pg_catalog.has_column_privilege(
        'authenticated',
        'public.consultation_requests',
        'id',
        'SELECT'
      )
      and pg_catalog.has_column_privilege(
        'authenticated',
        'public.consultation_requests',
        'student_id',
        'SELECT'
      )
      and pg_catalog.has_column_privilege(
        'authenticated',
        'public.consultation_requests',
        'student_name',
        'SELECT'
      )
      and pg_catalog.has_column_privilege(
        'authenticated',
        'public.consultation_requests',
        'status',
        'SELECT'
      )
      and pg_catalog.has_column_privilege(
        'authenticated',
        'public.consultation_requests',
        'consultation_date',
        'SELECT'
      )
      and pg_catalog.has_column_privilege(
        'authenticated',
        'public.consultation_requests',
        'slot_start',
        'SELECT'
      )
      and pg_catalog.has_column_privilege(
        'authenticated',
        'public.consultation_requests',
        'slot_end',
        'SELECT'
      )
      and pg_catalog.has_column_privilege(
        'authenticated',
        'public.consultation_requests',
        'submitted_at',
        'SELECT'
      )
    ),
    (
      'authenticated cannot update or delete consultations directly',
      not pg_catalog.has_table_privilege(
        'authenticated',
        'public.consultation_requests',
        'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.consultation_requests',
        'DELETE'
      )
      and not exists (
        select 1
        from information_schema.column_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name = 'consultation_requests'
          and privilege.grantee = 'authenticated'
          and privilege.privilege_type = 'UPDATE'
      )
    ),
    (
      'authenticated cannot split-update canonical full name',
      not pg_catalog.has_column_privilege(
        'authenticated',
        'public.profiles',
        'full_name',
        'UPDATE'
      )
    ),
    (
      'authenticated cannot split-insert identity roll number',
      not pg_catalog.has_column_privilege(
        'authenticated',
        'public.student_profiles',
        'roll_number',
        'INSERT'
      )
      and not exists (
        select 1
        from information_schema.column_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name = 'student_profiles'
          and privilege.grantee = 'authenticated'
          and privilege.privilege_type = 'INSERT'
          and privilege.column_name in (
            'roll_number',
            'personal_email',
            'mobile_number',
            'college',
            'course',
            'department',
            'current_year',
            'current_semester',
            'graduation_year'
          )
      )
    ),
    (
      'authenticated cannot split-update identity roll number',
      not pg_catalog.has_column_privilege(
        'authenticated',
        'public.student_profiles',
        'roll_number',
        'UPDATE'
      )
      and not exists (
        select 1
        from information_schema.column_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name = 'student_profiles'
          and privilege.grantee = 'authenticated'
          and privilege.privilege_type = 'UPDATE'
          and privilege.column_name in (
            'roll_number',
            'personal_email',
            'mobile_number',
            'college',
            'course',
            'department',
            'current_year',
            'current_semester',
            'graduation_year'
          )
      )
    ),
    (
      'authenticated retains academic CGPA update',
      pg_catalog.has_column_privilege(
        'authenticated',
        'public.student_profiles',
        'cgpa',
        'UPDATE'
      )
    ),
    (
      'authenticated retains preference update',
      pg_catalog.has_column_privilege(
        'authenticated',
        'public.student_preferences',
        'higher_studies_interest',
        'UPDATE'
      )
    ),
    (
      'authenticated note mutations are column-limited',
      pg_catalog.has_column_privilege(
        'authenticated',
        'public.counselor_student_notes',
        'note_text',
        'INSERT'
      )
      and pg_catalog.has_column_privilege(
        'authenticated',
        'public.counselor_student_notes',
        'note_text',
        'UPDATE'
      )
      and pg_catalog.has_table_privilege(
        'authenticated',
        'public.counselor_student_notes',
        'DELETE'
      )
      and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.counselor_student_notes',
        'counselor_id',
        'INSERT'
      )
      and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.counselor_student_notes',
        'student_id',
        'UPDATE'
      )
      and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.counselor_student_notes',
        'updated_at',
        'UPDATE'
      )
    ),
    (
      'authenticated follow-up mutations are column-limited',
      pg_catalog.has_column_privilege(
        'authenticated',
        'public.counselor_follow_ups',
        'next_action',
        'INSERT'
      )
      and pg_catalog.has_column_privilege(
        'authenticated',
        'public.counselor_follow_ups',
        'next_action',
        'UPDATE'
      )
      and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.counselor_follow_ups',
        'counselor_id',
        'INSERT'
      )
      and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.counselor_follow_ups',
        'status',
        'UPDATE'
      )
      and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.counselor_follow_ups',
        'completed_at',
        'UPDATE'
      )
      and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.counselor_follow_ups',
        'completed_by',
        'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.counselor_follow_ups',
        'DELETE'
      )
    ),
    (
      'D1 has no broad authenticated insert or update grants',
      not exists (
        select 1
        from information_schema.table_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name in (
            'counselor_student_notes',
            'counselor_follow_ups'
          )
          and privilege.grantee = 'authenticated'
          and privilege.privilege_type in ('INSERT', 'UPDATE')
      )
    ),
    (
      'D3 authenticated reads are column-limited',
      not exists (
        select 1
        from information_schema.table_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name in (
            'student_counseling_progressions',
            'student_counseling_progression_events'
          )
          and privilege.grantee = 'authenticated'
          and privilege.privilege_type = 'SELECT'
      )
      and (
        select pg_catalog.count(distinct privilege.column_name) = 8
        from information_schema.column_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name =
            'student_counseling_progressions'
          and privilege.grantee = 'authenticated'
          and privilege.privilege_type = 'SELECT'
      )
      and (
        select pg_catalog.count(distinct privilege.column_name) = 9
        from information_schema.column_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name =
            'student_counseling_progression_events'
          and privilege.grantee = 'authenticated'
          and privilege.privilege_type = 'SELECT'
      )
    ),
    (
      'D3 has no direct authenticated table mutations',
      not exists (
        select 1
        from information_schema.table_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name in (
            'student_counseling_progressions',
            'student_counseling_progression_events'
          )
          and privilege.grantee = 'authenticated'
          and privilege.privilege_type in (
            'INSERT',
            'UPDATE',
            'DELETE',
            'TRUNCATE'
          )
      )
      and not exists (
        select 1
        from information_schema.column_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name in (
            'student_counseling_progressions',
            'student_counseling_progression_events'
          )
          and privilege.grantee = 'authenticated'
          and privilege.privilege_type in ('INSERT', 'UPDATE')
      )
    ),
    (
      'D3 enum usage is authenticated-only',
      pg_catalog.has_type_privilege(
        'authenticated',
        'public.counseling_progression_stage',
        'USAGE'
      )
      and pg_catalog.has_type_privilege(
        'authenticated',
        'public.counseling_progression_state',
        'USAGE'
      )
      and not pg_catalog.has_type_privilege(
        'anon',
        'public.counseling_progression_stage',
        'USAGE'
      )
      and not pg_catalog.has_type_privilege(
        'anon',
        'public.counseling_progression_state',
        'USAGE'
      )
    )
) as checks(check_name, passed)
order by check_name;

-- Critical definitions that require more than object-name existence.
select
  'definition'::text as category,
  check_name as object_name,
  passed
from (
  values
    (
      'active slot index is unique and releases cancelled rows',
      coalesce(
        (
          select
            index_record.indisunique
            and pg_catalog.pg_get_expr(
              index_record.indpred,
              index_record.indrelid
            ) like '%status <> %cancelled%'
          from pg_catalog.pg_index as index_record
          inner join pg_catalog.pg_class as index_name
            on index_name.oid = index_record.indexrelid
          inner join pg_catalog.pg_namespace as namespace
            on namespace.oid = index_name.relnamespace
          where namespace.nspname = 'public'
            and index_name.relname =
              'consultation_requests_active_slot_key'
        ),
        false
      )
    ),
    (
      'preference insert requires a core profile',
      coalesce(
        (
          select policy.with_check like '%student_profiles%'
          from pg_catalog.pg_policies as policy
          where policy.schemaname = 'public'
            and policy.tablename = 'student_preferences'
            and policy.policyname = 'student_preferences_insert_own'
        ),
        false
      )
    ),
    (
      'preference update requires a core profile',
      coalesce(
        (
          select
            policy.qual like '%student_profiles%'
            and policy.with_check like '%student_profiles%'
          from pg_catalog.pg_policies as policy
          where policy.schemaname = 'public'
            and policy.tablename = 'student_preferences'
            and policy.policyname = 'student_preferences_update_own'
        ),
        false
      )
    ),
    (
      'consultation read requires verified counselor helper',
      coalesce(
        (
          select policy.qual like '%has_active_verified_kgeo_role%'
          from pg_catalog.pg_policies as policy
          where policy.schemaname = 'public'
            and policy.tablename = 'consultation_requests'
            and policy.policyname =
              'consultation_requests_select_counselor_all'
        ),
        false
      )
    ),
    (
      'profile completion remains eleven fields',
      coalesce(
        (
          select pg_catalog.lower(
            pg_catalog.pg_get_viewdef(view_record.oid, true)
          ) like '%11% as essential_fields_total%'
          from pg_catalog.pg_class as view_record
          inner join pg_catalog.pg_namespace as namespace
            on namespace.oid = view_record.relnamespace
          where namespace.nspname = 'public'
            and view_record.relname = 'student_profile_completion'
            and view_record.relkind = 'v'
        ),
        false
      )
    ),
    (
      'D1 policies are counselor-owned only',
      (
        select
          pg_catalog.count(*) = 7
          and pg_catalog.bool_and(
            policy.roles = array['authenticated']::name[]
            and coalesce(policy.qual, policy.with_check, '')
              like '%counselor_id%'
            and coalesce(policy.qual, policy.with_check, '')
              like '%has_active_verified_kgeo_role%'
          )
        from pg_catalog.pg_policies as policy
        where policy.schemaname = 'public'
          and policy.tablename in (
            'counselor_student_notes',
            'counselor_follow_ups'
          )
      )
    ),
    (
      'follow-up direct update is pending-only',
      coalesce(
        (
          select
            policy.qual like '%pending%'
            and policy.with_check like '%pending%'
          from pg_catalog.pg_policies as policy
          where policy.schemaname = 'public'
            and policy.tablename = 'counselor_follow_ups'
            and policy.policyname =
              'counselor_follow_ups_update_pending_own'
        ),
        false
      )
    ),
    (
      'D1 profile history uses restrict and consultation links use set null',
      (
        select
          pg_catalog.count(*) filter (
            where constraint_record.conname in (
              'counselor_student_notes_student_id_fkey',
              'counselor_student_notes_counselor_id_fkey',
              'counselor_follow_ups_student_id_fkey',
              'counselor_follow_ups_counselor_id_fkey',
              'counselor_follow_ups_completed_by_fkey'
            )
              and constraint_record.confdeltype = 'r'
          ) = 5
          and pg_catalog.count(*) filter (
            where constraint_record.conname in (
              'counselor_student_notes_consultation_id_fkey',
              'counselor_follow_ups_consultation_id_fkey'
            )
              and constraint_record.confdeltype = 'n'
          ) = 2
        from pg_catalog.pg_constraint as constraint_record
        inner join pg_catalog.pg_class as table_record
          on table_record.oid = constraint_record.conrelid
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = table_record.relnamespace
        where namespace.nspname = 'public'
          and table_record.relname in (
            'counselor_student_notes',
            'counselor_follow_ups'
          )
          and constraint_record.contype = 'f'
      )
    ),
    (
      'follow-up status RPC locks and finalizes pending owned rows',
      coalesce(
        (
          select
            pg_catalog.lower(
              pg_catalog.pg_get_functiondef(function_record.oid)
            ) like '%for update%'
            and pg_catalog.pg_get_functiondef(function_record.oid)
              like '%target_counselor_id <> caller_id%'
            and pg_catalog.pg_get_functiondef(function_record.oid)
              like '%target_status <> ''pending''%'
            and pg_catalog.pg_get_functiondef(function_record.oid)
              like '%role = ''counselor''%'
            and pg_catalog.pg_get_functiondef(function_record.oid)
              like '%email_confirmed_at is not null%'
            and pg_catalog.pg_get_functiondef(function_record.oid)
              like '%completed_at%'
            and pg_catalog.pg_get_functiondef(function_record.oid)
              like '%completed_by%'
          from pg_catalog.pg_proc as function_record
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.record_counselor_follow_up_status(uuid,text)'
          )
        ),
        false
      )
    ),
    (
      'D2 workload RPC has trusted ownership and authorization',
      coalesce(
        (
          select
            owner_role.rolname = 'postgres'
            and definition.definition_text like
              '%caller_id := (select auth.uid())%'
            and definition.definition_text like
              '%role = ''counselor''%'
            and definition.definition_text like
              '%is_active is true%'
            and definition.definition_text like
              '%email_confirmed_at is not null%'
            and definition.definition_text like
              '%follow_up.counselor_id = caller_id%'
            and definition.definition_text like
              '%student_account.role = ''student''%'
          from pg_catalog.pg_proc as function_record
          inner join pg_catalog.pg_roles as owner_role
            on owner_role.oid = function_record.proowner
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.list_counselor_follow_up_workload(text,text,text,date,date,integer,integer)'
          )
        ),
        false
      )
    ),
    (
      'D2 workload RPC validates filters and Asia Kolkata boundaries',
      coalesce(
        (
          select
            definition.definition_text like
              '%normalized_lifecycle not in (%'
            and definition.definition_text like
              '%normalized_priority not in (%'
            and definition.definition_text like
              '%p_due_from > p_due_to%'
            and definition.definition_text like
              '%p_page not between 1 and 100000%'
            and definition.definition_text like
              '%p_page_size not between 1 and 25%'
            and definition.definition_text like
              '%at time zone ''Asia/Kolkata''%'
          from pg_catalog.pg_proc as function_record
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.list_counselor_follow_up_workload(text,text,text,date,date,integer,integer)'
          )
        ),
        false
      )
    ),
    (
      'D2 workload RPC searches only approved identity fields',
      coalesce(
        (
          select
            definition.definition_text like '%student_full_name%'
            and definition.definition_text like
              '%student_college_email%'
            and definition.definition_text like
              '%student_roll_number%'
            and definition.definition_text not like '%personal_email%'
            and definition.definition_text not like '%mobile_number%'
            and definition.definition_text not like '%note_text%'
            and definition.definition_text not like
              '%counselor_student_notes%'
            and definition.definition_text not like '%request_number%'
            and definition.definition_text not like '%details%'
            and definition.definition_text not like
              '%raw_user_meta_data%'
            and definition.definition_text not like
              '%raw_app_meta_data%'
          from pg_catalog.pg_proc as function_record
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.list_counselor_follow_up_workload(text,text,text,date,date,integer,integer)'
          )
        ),
        false
      )
    ),
    (
      'D2 workload RPC returns global metrics on empty pages',
      coalesce(
        (
          select
            definition.definition_text like '%global_metrics as (%'
            and definition.definition_text like
              '%metric_overdue_count%'
            and definition.definition_text like
              '%metric_due_today_count%'
            and definition.definition_text like
              '%metric_upcoming_count%'
            and definition.definition_text like
              '%metric_completed_count%'
            and definition.definition_text like
              '%metric_cancelled_count%'
            and definition.definition_text like
              '%metric_total_pending_count%'
            and definition.definition_text like
              '%cross join filtered_total%'
            and definition.definition_text like
              '%left join page_rows as page_row%'
          from pg_catalog.pg_proc as function_record
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.list_counselor_follow_up_workload(text,text,text,date,date,integer,integer)'
          )
        ),
        false
      )
    ),
    (
      'D2 workload RPC uses deterministic operational ordering',
      coalesce(
        (
          select
            definition.definition_text like '%lifecycle_rank asc%'
            and definition.definition_text like '%priority_rank%'
            and definition.definition_text like
              '%workload_due_date%'
            and definition.definition_text like
              '%workload_completed_at%'
            and definition.definition_text like
              '%workload_updated_at%'
            and definition.definition_text like
              '%workload_follow_up_id asc%'
            and definition.definition_text like '%limit p_page_size%'
            and definition.definition_text like '%offset page_offset%'
          from pg_catalog.pg_proc as function_record
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.list_counselor_follow_up_workload(text,text,text,date,date,integer,integer)'
          )
        ),
        false
      )
    ),
    (
      'D3 policies are counselor-only SELECT with no mutation policy',
      (
        select
          pg_catalog.count(*) = 2
          and pg_catalog.bool_and(
            policy.cmd = 'SELECT'
            and policy.roles = array['authenticated']::name[]
            and policy.qual like '%has_active_verified_kgeo_role%'
            and policy.qual like '%counselor%'
            and policy.with_check is null
          )
        from pg_catalog.pg_policies as policy
        where policy.schemaname = 'public'
          and policy.tablename in (
            'student_counseling_progressions',
            'student_counseling_progression_events'
          )
      )
    ),
    (
      'D3 profile and history foreign keys retain records',
      (
        select
          pg_catalog.count(*) = 4
          and pg_catalog.bool_and(
            constraint_record.confdeltype = 'r'
            and constraint_record.confrelid =
              pg_catalog.to_regclass('public.profiles')
          )
        from pg_catalog.pg_constraint as constraint_record
        inner join pg_catalog.pg_class as table_record
          on table_record.oid = constraint_record.conrelid
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = table_record.relnamespace
        where namespace.nspname = 'public'
          and constraint_record.conname in (
            'student_counseling_progressions_student_id_fkey',
            'student_counseling_progressions_last_changed_by_fkey',
            'student_counseling_progression_events_student_id_fkey',
            'student_counseling_progression_events_changed_by_fkey'
          )
      )
    ),
    (
      'D3 initialization history is correction-aware',
      pg_catalog.to_regclass(
        'public.student_counseling_progression_events_initial_key'
      ) is null
      and coalesce(
        (
          select
            definition.definition_text like
              '%uncorrected_initialization_count%'
            and definition.definition_text like
              '%student_counseling_progression_event_corrections%'
            and definition.definition_text like
              '%reset_initialization%'
          from pg_catalog.pg_proc as function_record
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.record_student_counseling_progression(uuid,text,text,text)'
          )
        ),
        false
      )
    ),
    (
      'D3 indexes match current and history access paths',
      (
        select pg_catalog.count(*) = 2
          and pg_catalog.bool_and(
            case index_name.relname
              when
                'student_counseling_progressions_state_stage_updated_idx'
              then pg_catalog.lower(
                pg_catalog.pg_get_indexdef(index_record.indexrelid)
              ) like
                '%(workflow_state, current_stage, updated_at desc, student_id)%'
              when
                'student_counseling_progression_events_student_history_idx'
              then pg_catalog.lower(
                pg_catalog.pg_get_indexdef(index_record.indexrelid)
              ) like
                '%(student_id, changed_at desc, id desc)%'
            end
          )
        from pg_catalog.pg_index as index_record
        inner join pg_catalog.pg_class as index_name
          on index_name.oid = index_record.indexrelid
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = index_name.relnamespace
        where namespace.nspname = 'public'
          and index_name.relname in (
            'student_counseling_progressions_state_stage_updated_idx',
            'student_counseling_progression_events_student_history_idx'
          )
      )
    ),
    (
      'D3 RPC has trusted owner and counselor authorization',
      coalesce(
        (
          select
            function_record.prosecdef
            and owner_role.rolname = 'postgres'
            and coalesce(function_record.proconfig, array[]::text[]) in (array['search_path=']::text[], array['search_path=""']::text[])
            and definition.definition_text like
              '%caller_id := (select auth.uid())%'
            and definition.definition_text like
              '%has_active_verified_kgeo_role(%'
            and definition.definition_text like
              '%''counselor''::public.user_role%'
          from pg_catalog.pg_proc as function_record
          inner join pg_catalog.pg_roles as owner_role
            on owner_role.oid = function_record.proowner
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.record_student_counseling_progression(uuid,text,text,text)'
          )
        ),
        false
      )
    ),
    (
      'D3 RPC validates student role and no browser audit actor',
      coalesce(
        (
          select
            definition.definition_text like
              '%student_profile.id = p_student_id%'
            and definition.definition_text like
              '%student_profile.role = ''student''%'
            and definition.definition_text not like '%p_counselor%'
            and definition.definition_text not like '%p_changed_by%'
            and definition.definition_text not like '%p_changed_at%'
            and definition.definition_text not like
              '%raw_user_meta_data%'
            and definition.definition_text not like
              '%raw_app_meta_data%'
          from pg_catalog.pg_proc as function_record
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.record_student_counseling_progression(uuid,text,text,text)'
          )
        ),
        false
      )
    ),
    (
      'D3 RPC validates enums and normalizes bounded reason',
      coalesce(
        (
          select
            definition.definition_text like
              '%normalized_stage not in (%'
            and definition.definition_text like
              '%normalized_state not in (%'
            and definition.definition_text like
              '%normalized_stage::public.counseling_progression_stage%'
            and definition.definition_text like
              '%normalized_state::public.counseling_progression_state%'
            and definition.definition_text like
              '%regexp_replace(%'
            and definition.definition_text like
              '%char_length(normalized_reason) > 500%'
          from pg_catalog.pg_proc as function_record
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.record_student_counseling_progression(uuid,text,text,text)'
          )
        ),
        false
      )
    ),
    (
      'D3 RPC uses first-writer concurrency and row locking',
      coalesce(
        (
          select
            definition.definition_text like
              '%pg_try_advisory_xact_lock(%'
            and definition.definition_text like
              '%hashtextextended(p_student_id::text%'
            and pg_catalog.lower(definition.definition_text) like
              '%for update%'
            and definition.definition_text like
              '%errcode = ''40001''%'
          from pg_catalog.pg_proc as function_record
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.record_student_counseling_progression(uuid,text,text,text)'
          )
        ),
        false
      )
    ),
    (
      'D3 RPC enforces separate no-op completed and on-hold rules',
      coalesce(
        (
          select
            definition.definition_text like
              '%previous_state_value =%completed%'
            and definition.definition_text like
              '%previous_stage_value = requested_stage%'
            and definition.definition_text like
              '%previous_state_value = requested_state%'
            and definition.definition_text like
              '%previous_state_value =%on_hold%'
            and definition.definition_text like
              '%previous_stage_value is distinct from requested_stage%'
            and definition.definition_text like
              '%previous_state_value is distinct from requested_state%'
            and definition.definition_text like
              '%requested_state <>%active%'
          from pg_catalog.pg_proc as function_record
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.record_student_counseling_progression(uuid,text,text,text)'
          )
        ),
        false
      )
    ),
    (
      'D3 RPC writes current and history atomically with one timestamp',
      coalesce(
        (
          select
            definition.definition_text like
              '%insert into public.student_counseling_progressions%'
            and definition.definition_text like
              '%update public.student_counseling_progressions%'
            and definition.definition_text like
              '%insert into public.student_counseling_progression_events%'
            and definition.definition_text like
              '%change_time := pg_catalog.statement_timestamp()%'
            and definition.definition_text like
              '%change_time <= existing_last_changed_at%'
            and definition.definition_text like
              '%interval ''1 microsecond''%'
            and definition.definition_text like
              '%last_changed_by = caller_id%'
            and definition.definition_text like
              '%changed_by,%'
            and definition.definition_text like
              '%stage_started_at = case%'
            and definition.definition_text not like
              '%counselor_student_notes%'
            and definition.definition_text not like
              '%counselor_follow_ups%'
            and definition.definition_text not like '%note_text%'
            and definition.definition_text not like '%next_action%'
            and definition.definition_text not like '%details%'
          from pg_catalog.pg_proc as function_record
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.record_student_counseling_progression(uuid,text,text,text)'
          )
        ),
        false
      )
    ),
    (
      'D3 RPC sanitizes unexpected failures',
      coalesce(
        (
          select
            definition.definition_text like
              '%Official progression could not be updated%'
            and definition.definition_text not like '%SQLERRM%'
          from pg_catalog.pg_proc as function_record
          cross join lateral (
            select pg_catalog.pg_get_functiondef(
              function_record.oid
            ) as definition_text
          ) as definition
          where function_record.oid = pg_catalog.to_regprocedure(
            'public.record_student_counseling_progression(uuid,text,text,text)'
          )
        ),
        false
      )
    ),
    (
      'D1 security definer functions are owned by postgres',
      not exists (
        select 1
        from pg_catalog.pg_proc as function_record
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = function_record.pronamespace
        inner join pg_catalog.pg_roles as owner_role
          on owner_role.oid = function_record.proowner
        where namespace.nspname = 'public'
          and function_record.proname in (
            'prepare_counselor_private_record',
            'record_counselor_follow_up_status'
          )
          and owner_role.rolname <> 'postgres'
      )
      and pg_catalog.to_regprocedure(
        'public.prepare_counselor_private_record()'
      ) is not null
      and pg_catalog.to_regprocedure(
        'public.record_counselor_follow_up_status(uuid,text)'
      ) is not null
    ),
    (
      'security definer functions retain a trusted owner',
      not exists (
        select 1
        from pg_catalog.pg_proc as function_record
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = function_record.pronamespace
        inner join pg_catalog.pg_roles as owner_role
          on owner_role.oid = function_record.proowner
        where namespace.nspname = 'public'
          and function_record.prosecdef
          and function_record.proname in (
            'handle_new_user',
            'prepare_consultation_request_insert',
            'get_consultation_slot_availability',
            'get_counselor_consultation_references',
            'has_active_verified_kgeo_role',
            'list_counselor_student_directory',
            'get_counselor_student_identity',
            'record_consultation_outcome',
            'save_student_identity',
            'prepare_counselor_private_record',
            'record_counselor_follow_up_status',
            'list_counselor_follow_up_workload',
            'record_student_counseling_progression'
          )
          and owner_role.rolname in ('anon', 'authenticated')
      )
    )
) as checks(check_name, passed)
order by check_name;

-- Phase D3.4.1 audited official progression correction foundation. These
-- checks cover the approved D3.1 constraint repairs, trusted correction/write
-- boundaries, and the bounded correction-aware read contract.
with
expected_columns(column_name, data_type, is_nullable) as (
  values
    ('id', 'uuid', 'NO'),
    ('target_event_id', 'uuid', 'NO'),
    (
      'correction_type',
      'counseling_progression_correction_type',
      'NO'
    ),
    ('restored_stage', 'counseling_progression_stage', 'YES'),
    ('restored_state', 'counseling_progression_state', 'YES'),
    ('restored_stage_started_at', 'timestamptz', 'YES'),
    ('corrected_by', 'uuid', 'NO'),
    ('correction_reason', 'text', 'NO'),
    ('corrected_at', 'timestamptz', 'NO')
),
actual_columns as (
  select
    attribute.attname::text as column_name,
    type_record.typname::text as data_type,
    case when attribute.attnotnull then 'NO' else 'YES' end::text
      as is_nullable
  from pg_catalog.pg_attribute as attribute
  inner join pg_catalog.pg_class as relation
    on relation.oid = attribute.attrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  inner join pg_catalog.pg_type as type_record
    on type_record.oid = attribute.atttypid
  where namespace.nspname = 'public'
    and relation.relname =
      'student_counseling_progression_event_corrections'
    and attribute.attnum > 0
    and not attribute.attisdropped
),
function_definitions as (
  select
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.record_student_counseling_progression(uuid,text,text,text)'
      )
    ) as normal_definition,
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.undo_latest_student_counseling_progression_event(uuid,uuid,text)'
      )
    ) as correction_definition,
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.get_counselor_progression_correction_context(uuid,uuid[])'
      )
    ) as read_definition
),
checks(check_name, passed) as (
  values
    (
      'D3.4.1 correction enum has exact values',
      array(
        select enum_value.enumlabel::text
        from pg_catalog.pg_enum as enum_value
        inner join pg_catalog.pg_type as enum_type
          on enum_type.oid = enum_value.enumtypid
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = enum_type.typnamespace
        where namespace.nspname = 'public'
          and enum_type.typname =
            'counseling_progression_correction_type'
        order by enum_value.enumsortorder
      ) = array['undo_transition', 'reset_initialization']::text[]
    ),
    (
      'D3.4.1 correction table has exact columns and nullability',
      pg_catalog.to_regclass(
        'public.student_counseling_progression_event_corrections'
      ) is not null
      and not exists (
        select column_name, data_type, is_nullable
        from expected_columns
        except
        select column_name, data_type, is_nullable
        from actual_columns
      )
      and not exists (
        select column_name, data_type, is_nullable
        from actual_columns
        except
        select column_name, data_type, is_nullable
        from expected_columns
      )
    ),
    (
      'D3.4.1 correction constraints retain targets actors and consistency',
      (
        select pg_catalog.count(*) = 5
        from pg_catalog.pg_constraint as constraint_record
        where constraint_record.conrelid = pg_catalog.to_regclass(
          'public.student_counseling_progression_event_corrections'
        )
          and constraint_record.conname in (
            'progression_event_corrections_pkey',
            'progression_event_corrections_target_event_id_key',
            'progression_event_corrections_target_event_id_fkey',
            'progression_event_corrections_corrected_by_fkey',
            'progression_event_corrections_restoration_check'
          )
      )
      and (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_constraint as constraint_record
        where constraint_record.conrelid = pg_catalog.to_regclass(
          'public.student_counseling_progression_event_corrections'
        )
          and constraint_record.conname =
            'progression_event_corrections_reason_check'
          and pg_catalog.pg_get_constraintdef(
            constraint_record.oid
          ) like '%char_length(correction_reason)%500%'
      )
    ),
    (
      'D3.4.1 event FK points to profiles with RESTRICT',
      (
        select
          referenced_namespace.nspname = 'public'
          and referenced_relation.relname = 'profiles'
          and constraint_record.confdeltype = 'r'
        from pg_catalog.pg_constraint as constraint_record
        inner join pg_catalog.pg_class as referenced_relation
          on referenced_relation.oid = constraint_record.confrelid
        inner join pg_catalog.pg_namespace as referenced_namespace
          on referenced_namespace.oid =
            referenced_relation.relnamespace
        where constraint_record.conrelid = pg_catalog.to_regclass(
          'public.student_counseling_progression_events'
        )
          and constraint_record.conname =
            'student_counseling_progression_events_student_id_fkey'
      )
      and not exists (
        select 1
        from pg_catalog.pg_constraint as constraint_record
        where constraint_record.conrelid = pg_catalog.to_regclass(
          'public.student_counseling_progression_events'
        )
          and constraint_record.confrelid = pg_catalog.to_regclass(
            'public.student_counseling_progressions'
          )
      )
    ),
    (
      'D3.4.1 lifetime initialization index is absent',
      pg_catalog.to_regclass(
        'public.student_counseling_progression_events_initial_key'
      ) is null
    ),
    (
      'D3.4.1 correction RLS is counselor SELECT only',
      (
        select relation.relrowsecurity
        from pg_catalog.pg_class as relation
        where relation.oid = pg_catalog.to_regclass(
          'public.student_counseling_progression_event_corrections'
        )
      )
      and (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'public'
          and policy_record.tablename =
            'student_counseling_progression_event_corrections'
          and policy_record.policyname =
            'progression_event_corrections_select_counselor'
          and policy_record.cmd = 'SELECT'
          and policy_record.roles =
            array['authenticated']::name[]
          and policy_record.qual like
            '%has_active_verified_kgeo_role%''counselor''%'
      )
    ),
    (
      'D3.4.1 correction grants are narrow and append-only',
      not exists (
        select 1
        from information_schema.role_table_grants as table_grant
        where table_grant.table_schema = 'public'
          and table_grant.table_name =
            'student_counseling_progression_event_corrections'
          and table_grant.grantee in (
            'PUBLIC',
            'anon',
            'authenticated'
          )
          and table_grant.privilege_type in (
            'INSERT',
            'UPDATE',
            'DELETE',
            'TRUNCATE',
            'REFERENCES',
            'TRIGGER'
          )
      )
      and (
        select pg_catalog.count(*) = 9
        from information_schema.column_privileges as column_grant
        where column_grant.table_schema = 'public'
          and column_grant.table_name =
            'student_counseling_progression_event_corrections'
          and column_grant.grantee = 'authenticated'
          and column_grant.privilege_type = 'SELECT'
      )
    ),
    (
      'D3.4.1 RPC signatures and relational returns exist',
      pg_catalog.to_regprocedure(
        'public.undo_latest_student_counseling_progression_event(uuid,uuid,text)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'public.get_counselor_progression_correction_context(uuid,uuid[])'
      ) is not null
      and pg_catalog.pg_get_function_result(
        pg_catalog.to_regprocedure(
          'public.undo_latest_student_counseling_progression_event(uuid,uuid,text)'
        )
      ) like
        'TABLE(correction_id uuid, target_event_id uuid,%'
      and pg_catalog.pg_get_function_result(
        pg_catalog.to_regprocedure(
          'public.get_counselor_progression_correction_context(uuid,uuid[])'
        )
      ) like
        'TABLE(target_event_id uuid, correction_id uuid,%'
    ),
    (
      'D3.4.1 RPCs are trusted and authenticated-only',
      (
        select pg_catalog.count(*) = 2
        from pg_catalog.pg_proc as function_record
        inner join pg_catalog.pg_roles as owner_role
          on owner_role.oid = function_record.proowner
        where function_record.oid in (
          pg_catalog.to_regprocedure(
            'public.undo_latest_student_counseling_progression_event(uuid,uuid,text)'
          ),
          pg_catalog.to_regprocedure(
            'public.get_counselor_progression_correction_context(uuid,uuid[])'
          )
        )
          and function_record.prosecdef
          and function_record.proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_role.rolname = 'postgres'
          and pg_catalog.has_function_privilege(
            'authenticated',
            function_record.oid,
            'EXECUTE'
          )
          and not pg_catalog.has_function_privilege(
            'anon',
            function_record.oid,
            'EXECUTE'
          )
          and not exists (
            select 1
            from pg_catalog.aclexplode(
              coalesce(
                function_record.proacl,
                pg_catalog.acldefault(
                  'f',
                  function_record.proowner
                )
              )
            ) as access_entry
            where access_entry.grantee = 0
              and access_entry.privilege_type = 'EXECUTE'
          )
      )
    ),
    (
      'D3.4.1 normal RPC is correction-aware and lock-compatible',
      (
        select
          normal_definition like
            '%hashtextextended(p_student_id::text, 202607250003)%'
          and normal_definition like
            '%uncorrected_initialization_count%'
          and normal_definition like
            '%student_counseling_progression_event_corrections%'
          and normal_definition like
            '%reset_initialization%'
          and normal_definition like
            '%The progression history is inconsistent%'
        from function_definitions
      )
    ),
    (
      'D3.4.1 correction RPC uses ordered student event and row locks',
      (
        select
          pg_catalog.strpos(
            correction_definition,
            'hashtextextended(p_student_id::text, 202607250003)'
          ) > 0
          and pg_catalog.strpos(
            correction_definition,
            'hashtextextended(p_event_id::text, 202607260001)'
          ) > pg_catalog.strpos(
            correction_definition,
            'hashtextextended(p_student_id::text, 202607250003)'
          )
          and pg_catalog.strpos(
            pg_catalog.lower(correction_definition),
            'for update'
          ) > pg_catalog.strpos(
            correction_definition,
            'hashtextextended(p_event_id::text, 202607260001)'
          )
        from function_definitions
      )
    ),
    (
      'D3.4.1 correction RPC enforces latest effective event and current match',
      (
        select
          pg_catalog.lower(correction_definition) like
            '%correction.target_event_id = event.id%'
          and pg_catalog.lower(correction_definition) like
            '%order by event.changed_at desc, event.id desc%'
          and pg_catalog.lower(correction_definition) like
            '%latest_effective_event_id is distinct from p_event_id%'
          and pg_catalog.lower(correction_definition) like
            '%current_stage_value is distinct from target_event.new_stage%'
          and pg_catalog.lower(correction_definition) like
            '%current_state_value is distinct from target_event.new_state%'
        from function_definitions
      )
    ),
    (
      'D3.4.1 correction RPC enforces evidence gate without mutation',
      (
        select
          correction_definition like
            '%student_counseling_progression_evidence%'
          and correction_definition like '%status =%available%'
          and correction_definition like '%status =%pending%'
          and correction_definition like
            '%upload_expires_at >%'
          and pg_catalog.lower(correction_definition) not like
            '%update public.student_counseling_progression_evidence%'
          and pg_catalog.lower(correction_definition) not like
            '%delete from public.student_counseling_progression_evidence%'
          and correction_definition not like '%storage.objects%'
        from function_definitions
      )
    ),
    (
      'D3.4.1 correction RPC restores stages and resets only projection',
      (
        select
          correction_definition like
            '%result_restored_stage := target_event.previous_stage%'
          and correction_definition like
            '%result_restored_state := target_event.previous_state%'
          and correction_definition like
            '%result_restored_stage_started_at := current_stage_started_at%'
          and correction_definition like
            '%origin.new_stage = target_event.previous_stage%'
          and correction_definition like
            '%correction.target_event_id = origin.id%'
          and pg_catalog.lower(correction_definition) like
            '%delete from public.student_counseling_progressions%'
          and pg_catalog.lower(correction_definition) not like
            '%delete from public.student_counseling_progression_events%'
        from function_definitions
      )
    ),
    (
      'D3.4.1 read RPC is counselor-only bounded and student-scoped',
      (
        select
          pg_catalog.lower(read_definition) like
            '%has_active_verified_kgeo_role%counselor%'
          and pg_catalog.lower(read_definition) like
            '%requested_count > 20%'
          and pg_catalog.lower(read_definition) like
            '%count(distinct requested.event_id)%'
          and pg_catalog.lower(read_definition) like
            '%event.id = any (p_event_ids)%'
          and pg_catalog.lower(read_definition) like
            '%event.student_id = p_student_id%'
          and pg_catalog.lower(read_definition) like
            '%order by event.changed_at desc, event.id desc%'
          and pg_catalog.lower(read_definition) like
            '%unnest(p_event_ids) with ordinality%'
        from function_definitions
      )
    ),
    (
      'D3.4.1 failures are sanitized',
      (
        select
          correction_definition like
            '%Official progression could not be corrected%'
          and read_definition like
            '%Official progression corrections could not be loaded%'
          and correction_definition not like '%SQLERRM%'
          and read_definition not like '%SQLERRM%'
        from function_definitions
      )
    )
)
select
  'definition'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

-- Phase E1.1 university application tracking foundation.
with expected_columns(
  table_name,
  column_position,
  column_name,
  udt_name,
  is_nullable
) as (
  values
    ('student_university_applications', 1, 'id', 'uuid', 'NO'),
    (
      'student_university_applications',
      2,
      'student_id',
      'uuid',
      'NO'
    ),
    (
      'student_university_applications',
      3,
      'country_code',
      'text',
      'NO'
    ),
    (
      'student_university_applications',
      4,
      'university_name',
      'text',
      'NO'
    ),
    (
      'student_university_applications',
      5,
      'programme_name',
      'text',
      'NO'
    ),
    (
      'student_university_applications',
      6,
      'degree_level',
      'university_application_degree_level',
      'NO'
    ),
    (
      'student_university_applications',
      7,
      'intake_term',
      'university_application_intake_term',
      'NO'
    ),
    (
      'student_university_applications',
      8,
      'intake_year',
      'int2',
      'NO'
    ),
    (
      'student_university_applications',
      9,
      'current_status',
      'university_application_status',
      'NO'
    ),
    (
      'student_university_applications',
      10,
      'application_reference',
      'text',
      'YES'
    ),
    (
      'student_university_applications',
      11,
      'portal_url',
      'text',
      'YES'
    ),
    (
      'student_university_applications',
      12,
      'submission_deadline',
      'date',
      'YES'
    ),
    (
      'student_university_applications',
      13,
      'submitted_at',
      'timestamptz',
      'YES'
    ),
    (
      'student_university_applications',
      14,
      'is_primary',
      'bool',
      'NO'
    ),
    (
      'student_university_applications',
      15,
      'is_archived',
      'bool',
      'NO'
    ),
    (
      'student_university_applications',
      16,
      'archived_at',
      'timestamptz',
      'YES'
    ),
    (
      'student_university_applications',
      17,
      'archived_by',
      'uuid',
      'YES'
    ),
    (
      'student_university_applications',
      18,
      'archive_reason',
      'text',
      'YES'
    ),
    (
      'student_university_applications',
      19,
      'version_number',
      'int4',
      'NO'
    ),
    (
      'student_university_applications',
      20,
      'created_by',
      'uuid',
      'NO'
    ),
    (
      'student_university_applications',
      21,
      'last_changed_by',
      'uuid',
      'NO'
    ),
    (
      'student_university_applications',
      22,
      'created_at',
      'timestamptz',
      'NO'
    ),
    (
      'student_university_applications',
      23,
      'updated_at',
      'timestamptz',
      'NO'
    ),
    (
      'student_university_applications',
      24,
      'last_changed_at',
      'timestamptz',
      'NO'
    ),
    (
      'student_university_application_events',
      1,
      'id',
      'uuid',
      'NO'
    ),
    (
      'student_university_application_events',
      2,
      'application_id',
      'uuid',
      'NO'
    ),
    (
      'student_university_application_events',
      3,
      'event_type',
      'university_application_event_type',
      'NO'
    ),
    (
      'student_university_application_events',
      4,
      'version_number',
      'int4',
      'NO'
    ),
    (
      'student_university_application_events',
      5,
      'country_code',
      'text',
      'NO'
    ),
    (
      'student_university_application_events',
      6,
      'university_name',
      'text',
      'NO'
    ),
    (
      'student_university_application_events',
      7,
      'programme_name',
      'text',
      'NO'
    ),
    (
      'student_university_application_events',
      8,
      'degree_level',
      'university_application_degree_level',
      'NO'
    ),
    (
      'student_university_application_events',
      9,
      'intake_term',
      'university_application_intake_term',
      'NO'
    ),
    (
      'student_university_application_events',
      10,
      'intake_year',
      'int2',
      'NO'
    ),
    (
      'student_university_application_events',
      11,
      'application_status',
      'university_application_status',
      'NO'
    ),
    (
      'student_university_application_events',
      12,
      'application_reference',
      'text',
      'YES'
    ),
    (
      'student_university_application_events',
      13,
      'portal_url',
      'text',
      'YES'
    ),
    (
      'student_university_application_events',
      14,
      'submission_deadline',
      'date',
      'YES'
    ),
    (
      'student_university_application_events',
      15,
      'submitted_at',
      'timestamptz',
      'YES'
    ),
    (
      'student_university_application_events',
      16,
      'is_primary',
      'bool',
      'NO'
    ),
    (
      'student_university_application_events',
      17,
      'is_archived',
      'bool',
      'NO'
    ),
    (
      'student_university_application_events',
      18,
      'change_reason',
      'text',
      'YES'
    ),
    (
      'student_university_application_events',
      19,
      'changed_by',
      'uuid',
      'NO'
    ),
    (
      'student_university_application_events',
      20,
      'changed_at',
      'timestamptz',
      'NO'
    )
),
actual_columns as (
  select
    column_record.table_name,
    column_record.ordinal_position::integer as column_position,
    column_record.column_name,
    column_record.udt_name,
    column_record.is_nullable
  from information_schema.columns as column_record
  where column_record.table_schema = 'public'
    and column_record.table_name in (
      'student_university_applications',
      'student_university_application_events'
    )
)
select
  'column'::text as category,
  'E1.1:' || expected.table_name || '.' || expected.column_name
    as object_name,
  (
    actual.column_position = expected.column_position
    and actual.column_name = expected.column_name
    and actual.udt_name = expected.udt_name
    and actual.is_nullable = expected.is_nullable
  ) as passed
from expected_columns as expected
left join actual_columns as actual
  on actual.table_name = expected.table_name
  and actual.column_position = expected.column_position

union all

select
  'definition'::text,
  'E1.1 tables have no unexpected columns',
  (
    select pg_catalog.count(*)
    from actual_columns
  ) = (
    select pg_catalog.count(*)
    from expected_columns
  )
order by object_name;

with expected_defaults(table_name, column_name, expected_fragment) as (
  values
    (
      'student_university_applications',
      'id',
      'gen_random_uuid()'
    ),
    (
      'student_university_applications',
      'current_status',
      '''planning'''
    ),
    ('student_university_applications', 'is_primary', 'false'),
    ('student_university_applications', 'is_archived', 'false'),
    ('student_university_applications', 'version_number', '1'),
    ('student_university_applications', 'created_at', 'now()'),
    ('student_university_applications', 'updated_at', 'now()'),
    ('student_university_applications', 'last_changed_at', 'now()'),
    (
      'student_university_application_events',
      'id',
      'gen_random_uuid()'
    ),
    (
      'student_university_application_events',
      'changed_at',
      'now()'
    )
)
select
  'column_default'::text as category,
  'E1.1:' || expected.table_name || '.' || expected.column_name
    as object_name,
  (
    actual.column_default is not null
    and pg_catalog.strpos(
      pg_catalog.lower(actual.column_default),
      expected.expected_fragment
    ) > 0
  ) as passed
from expected_defaults as expected
left join information_schema.columns as actual
  on actual.table_schema = 'public'
  and actual.table_name = expected.table_name
  and actual.column_name = expected.column_name
order by expected.table_name, expected.column_name;

with required_constraints(table_name, constraint_name) as (
  values
    (
      'student_university_applications',
      'student_university_applications_pkey'
    ),
    (
      'student_university_applications',
      'student_university_applications_country_code_check'
    ),
    (
      'student_university_applications',
      'student_university_applications_university_name_check'
    ),
    (
      'student_university_applications',
      'student_university_applications_programme_name_check'
    ),
    (
      'student_university_applications',
      'student_university_applications_intake_year_check'
    ),
    (
      'student_university_applications',
      'student_university_applications_reference_check'
    ),
    (
      'student_university_applications',
      'student_university_applications_portal_url_check'
    ),
    (
      'student_university_applications',
      'student_university_applications_submission_state_check'
    ),
    (
      'student_university_applications',
      'student_university_applications_primary_consistency_check'
    ),
    (
      'student_university_applications',
      'student_university_applications_archive_state_check'
    ),
    (
      'student_university_applications',
      'student_university_applications_version_check'
    ),
    (
      'student_university_applications',
      'student_university_applications_actor_check'
    ),
    (
      'student_university_applications',
      'student_university_applications_timestamp_check'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_pkey'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_application_version_key'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_country_code_check'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_university_name_check'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_programme_name_check'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_intake_year_check'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_reference_check'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_portal_url_check'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_submission_state_check'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_primary_consistency_check'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_reason_check'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_type_version_check'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_version_check'
    )
)
select
  'constraint'::text as category,
  'E1.1:' || required.constraint_name as object_name,
  constraint_record.oid is not null as passed
from required_constraints as required
left join pg_catalog.pg_namespace as namespace
  on namespace.nspname = 'public'
left join pg_catalog.pg_class as table_record
  on table_record.relnamespace = namespace.oid
  and table_record.relname = required.table_name
left join pg_catalog.pg_constraint as constraint_record
  on constraint_record.conrelid = table_record.oid
  and constraint_record.conname = required.constraint_name
order by required.constraint_name;

with expected_constraint_definitions(
  constraint_name,
  expected_fragments
) as (
  values
    (
      'student_university_applications_portal_url_check',
      array[
        'https://',
        '[a-za-z0-9-]{0,61}',
        'char_length(portal_url)',
        '2048',
        '@'
      ]::text[]
    ),
    (
      'student_university_application_events_portal_url_check',
      array[
        'https://',
        '[a-za-z0-9-]{0,61}',
        'char_length(portal_url)',
        '2048',
        '@'
      ]::text[]
    ),
    (
      'student_university_applications_primary_consistency_check',
      array[
        'not is_primary',
        'not is_archived',
        'withdrawn',
        'closed'
      ]::text[]
    ),
    (
      'student_university_applications_archive_state_check',
      array[
        'is_archived',
        'archived_at',
        'archived_by',
        'archive_reason',
        '500'
      ]::text[]
    ),
    (
      'student_university_applications_submission_state_check',
      array[
        'submitted_at',
        'planning',
        'submitted',
        'withdrawn',
        'closed'
      ]::text[]
    ),
    (
      'student_university_application_events_reason_check',
      array[
        'event_type',
        'created',
        'change_reason',
        '500'
      ]::text[]
    ),
    (
      'student_university_application_events_type_version_check',
      array[
        'version_number = 1',
        'version_number > 1',
        'event_type',
        'created'
      ]::text[]
    )
),
actual_constraint_definitions as (
  select
    constraint_record.conname as constraint_name,
    pg_catalog.lower(
      pg_catalog.pg_get_constraintdef(constraint_record.oid)
    ) as constraint_definition
  from pg_catalog.pg_constraint as constraint_record
  inner join pg_catalog.pg_class as table_record
    on table_record.oid = constraint_record.conrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = table_record.relnamespace
  where namespace.nspname = 'public'
    and table_record.relname in (
      'student_university_applications',
      'student_university_application_events'
    )
)
select
  'constraint_definition'::text as category,
  'E1.1:' || expected.constraint_name as object_name,
  (
    actual.constraint_definition is not null
    and not exists (
      select 1
      from pg_catalog.unnest(expected.expected_fragments) as fragment
      where pg_catalog.strpos(
        actual.constraint_definition,
        fragment
      ) = 0
    )
  ) as passed
from expected_constraint_definitions as expected
left join actual_constraint_definitions as actual
  on actual.constraint_name = expected.constraint_name
order by expected.constraint_name;

with expected_foreign_keys(
  constraint_name,
  local_column,
  foreign_table,
  foreign_column,
  delete_rule
) as (
  values
    (
      'student_university_applications_student_id_fkey',
      'student_id',
      'profiles',
      'id',
      'RESTRICT'
    ),
    (
      'student_university_applications_created_by_fkey',
      'created_by',
      'profiles',
      'id',
      'RESTRICT'
    ),
    (
      'student_university_applications_last_changed_by_fkey',
      'last_changed_by',
      'profiles',
      'id',
      'RESTRICT'
    ),
    (
      'student_university_applications_archived_by_fkey',
      'archived_by',
      'profiles',
      'id',
      'RESTRICT'
    ),
    (
      'student_university_application_events_application_id_fkey',
      'application_id',
      'student_university_applications',
      'id',
      'RESTRICT'
    ),
    (
      'student_university_application_events_changed_by_fkey',
      'changed_by',
      'profiles',
      'id',
      'RESTRICT'
    )
)
select
  'constraint'::text as category,
  'E1.1:' || expected.constraint_name as object_name,
  (
    actual.delete_rule = expected.delete_rule
    and local_key.column_name = expected.local_column
    and foreign_key.table_schema = 'public'
    and foreign_key.table_name = expected.foreign_table
    and foreign_key.column_name = expected.foreign_column
  ) as passed
from expected_foreign_keys as expected
left join information_schema.referential_constraints as actual
  on actual.constraint_schema = 'public'
  and actual.constraint_name = expected.constraint_name
left join information_schema.key_column_usage as local_key
  on local_key.constraint_schema = actual.constraint_schema
  and local_key.constraint_name = actual.constraint_name
left join information_schema.constraint_column_usage as foreign_key
  on foreign_key.constraint_schema = actual.unique_constraint_schema
  and foreign_key.constraint_name = actual.unique_constraint_name
order by expected.constraint_name;

with expected_indexes(index_name, expected_fragments) as (
  values
    (
      'student_university_applications_student_active_idx',
      array[
        'student_id',
        'is_archived',
        'is_primary desc',
        'updated_at desc',
        'id desc'
      ]::text[]
    ),
    (
      'student_university_applications_student_status_idx',
      array[
        'student_id',
        'current_status',
        'updated_at desc',
        'id desc'
      ]::text[]
    ),
    (
      'student_university_applications_one_primary_idx',
      array[
        'unique index',
        '(student_id)',
        'where (is_primary is true)'
      ]::text[]
    ),
    (
      'student_university_application_events_history_idx',
      array[
        'application_id',
        'version_number desc',
        'changed_at desc',
        'id desc'
      ]::text[]
    )
),
index_definitions as (
  select
    index_record.relname as index_name,
    pg_catalog.lower(
      pg_catalog.pg_get_indexdef(index_record.oid)
    ) as index_definition
  from pg_catalog.pg_class as index_record
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = index_record.relnamespace
  where namespace.nspname = 'public'
)
select
  'index'::text as category,
  'E1.1:' || expected.index_name as object_name,
  (
    actual.index_definition is not null
    and not exists (
      select 1
      from pg_catalog.unnest(expected.expected_fragments) as fragment
      where pg_catalog.strpos(
        actual.index_definition,
        fragment
      ) = 0
    )
  ) as passed
from expected_indexes as expected
left join index_definitions as actual
  on actual.index_name = expected.index_name
order by expected.index_name;

with expected_functions(
  function_signature,
  argument_names,
  argument_types,
  return_names,
  return_types
) as (
  values
    (
      'public.create_student_university_application(uuid,text,text,text,text,text,integer,text,text,date)',
      array[
        'p_student_id',
        'p_country_code',
        'p_university_name',
        'p_programme_name',
        'p_degree_level',
        'p_intake_term',
        'p_intake_year',
        'p_application_reference',
        'p_portal_url',
        'p_submission_deadline'
      ]::text[],
      array[
        'uuid',
        'text',
        'text',
        'text',
        'text',
        'text',
        'int4',
        'text',
        'text',
        'date'
      ]::text[],
      array[
        'application_id',
        'student_id',
        'current_status',
        'is_primary',
        'is_archived',
        'version_number',
        'created_at',
        'updated_at',
        'last_changed_at'
      ]::text[],
      array[
        'uuid',
        'uuid',
        'university_application_status',
        'bool',
        'bool',
        'int4',
        'timestamptz',
        'timestamptz',
        'timestamptz'
      ]::text[]
    ),
    (
      'public.update_student_university_application_details(uuid,text,text,text,text,text,integer,text,text,date,text)',
      array[
        'p_application_id',
        'p_country_code',
        'p_university_name',
        'p_programme_name',
        'p_degree_level',
        'p_intake_term',
        'p_intake_year',
        'p_application_reference',
        'p_portal_url',
        'p_submission_deadline',
        'p_change_reason'
      ]::text[],
      array[
        'uuid',
        'text',
        'text',
        'text',
        'text',
        'text',
        'int4',
        'text',
        'text',
        'date',
        'text'
      ]::text[],
      array[
        'application_id',
        'student_id',
        'current_status',
        'is_primary',
        'is_archived',
        'version_number',
        'created_at',
        'updated_at',
        'last_changed_at'
      ]::text[],
      array[
        'uuid',
        'uuid',
        'university_application_status',
        'bool',
        'bool',
        'int4',
        'timestamptz',
        'timestamptz',
        'timestamptz'
      ]::text[]
    ),
    (
      'public.record_student_university_application_status(uuid,text,text)',
      array[
        'p_application_id',
        'p_new_status',
        'p_change_reason'
      ]::text[],
      array['uuid', 'text', 'text']::text[],
      array[
        'application_id',
        'student_id',
        'current_status',
        'is_primary',
        'is_archived',
        'version_number',
        'created_at',
        'updated_at',
        'last_changed_at'
      ]::text[],
      array[
        'uuid',
        'uuid',
        'university_application_status',
        'bool',
        'bool',
        'int4',
        'timestamptz',
        'timestamptz',
        'timestamptz'
      ]::text[]
    ),
    (
      'public.set_primary_student_university_application(uuid,text)',
      array['p_application_id', 'p_change_reason']::text[],
      array['uuid', 'text']::text[],
      array[
        'application_id',
        'student_id',
        'current_status',
        'is_primary',
        'is_archived',
        'version_number',
        'created_at',
        'updated_at',
        'last_changed_at'
      ]::text[],
      array[
        'uuid',
        'uuid',
        'university_application_status',
        'bool',
        'bool',
        'int4',
        'timestamptz',
        'timestamptz',
        'timestamptz'
      ]::text[]
    ),
    (
      'public.archive_student_university_application(uuid,text)',
      array['p_application_id', 'p_archive_reason']::text[],
      array['uuid', 'text']::text[],
      array[
        'application_id',
        'student_id',
        'is_archived',
        'is_primary',
        'version_number',
        'archived_at',
        'updated_at'
      ]::text[],
      array[
        'uuid',
        'uuid',
        'bool',
        'bool',
        'int4',
        'timestamptz',
        'timestamptz'
      ]::text[]
    )
),
resolved_functions as (
  select
    expected.*,
    pg_catalog.to_regprocedure(
      expected.function_signature
    ) as function_oid
  from expected_functions as expected
),
function_catalog as (
  select
    resolved.*,
    function_record.proname,
    function_record.prosecdef,
    function_record.proconfig,
    owner_role.rolname as owner_name
  from resolved_functions as resolved
  left join pg_catalog.pg_proc as function_record
    on function_record.oid = resolved.function_oid
  left join pg_catalog.pg_roles as owner_role
    on owner_role.oid = function_record.proowner
),
actual_parameters as (
  select
    catalog.function_signature,
    pg_catalog.array_agg(
      parameter.parameter_name::text
      order by parameter.ordinal_position
    ) filter (where parameter.parameter_mode = 'IN') as argument_names,
    pg_catalog.array_agg(
      parameter.udt_name::text
      order by parameter.ordinal_position
    ) filter (where parameter.parameter_mode = 'IN') as argument_types,
    pg_catalog.array_agg(
      parameter.parameter_name::text
      order by parameter.ordinal_position
    ) filter (where parameter.parameter_mode = 'OUT') as return_names,
    pg_catalog.array_agg(
      parameter.udt_name::text
      order by parameter.ordinal_position
    ) filter (where parameter.parameter_mode = 'OUT') as return_types
  from function_catalog as catalog
  left join information_schema.parameters as parameter
    on parameter.specific_schema = 'public'
    and parameter.specific_name =
      catalog.proname || '_' || catalog.function_oid::oid::text
  group by catalog.function_signature
)
select
  'function'::text as category,
  'E1.1:' || catalog.function_signature as object_name,
  (
    catalog.function_oid is not null
    and catalog.prosecdef
    and catalog.owner_name = 'postgres'
    and coalesce(catalog.proconfig, array[]::text[]) in (array['search_path=']::text[], array['search_path=""']::text[])
    and actual.argument_names = catalog.argument_names
    and actual.argument_types = catalog.argument_types
    and actual.return_names = catalog.return_names
    and actual.return_types = catalog.return_types
  ) as passed
from function_catalog as catalog
left join actual_parameters as actual
  on actual.function_signature = catalog.function_signature
order by catalog.function_signature;

with target_tables(table_name) as (
  values
    ('student_university_applications'),
    ('student_university_application_events')
)
select
  'row_level_security'::text as category,
  'E1.1:' || target.table_name as object_name,
  table_record.relrowsecurity as passed
from target_tables as target
left join pg_catalog.pg_namespace as namespace
  on namespace.nspname = 'public'
left join pg_catalog.pg_class as table_record
  on table_record.relnamespace = namespace.oid
  and table_record.relname = target.table_name
order by target.table_name;

with expected_policies(table_name, policy_name) as (
  values
    (
      'student_university_applications',
      'student_university_applications_select_counselor'
    ),
    (
      'student_university_application_events',
      'student_university_application_events_select_counselor'
    )
)
select
  'policy'::text as category,
  'E1.1:' || expected.policy_name as object_name,
  (
    actual.policyname = expected.policy_name
    and actual.cmd = 'SELECT'
    and (
      select pg_catalog.array_agg(role_name::text order by role_name::text)
      from pg_catalog.unnest(actual.roles) as role_name
    ) = array['authenticated']::text[]
    and pg_catalog.lower(actual.qual) like
      '%has_active_verified_kgeo_role%counselor%'
    and (
      select pg_catalog.count(*)
      from pg_catalog.pg_policies as policy_count
      where policy_count.schemaname = 'public'
        and policy_count.tablename = expected.table_name
    ) = 1
  ) as passed
from expected_policies as expected
left join pg_catalog.pg_policies as actual
  on actual.schemaname = 'public'
  and actual.tablename = expected.table_name
  and actual.policyname = expected.policy_name
order by expected.policy_name;

with checks(check_name, passed) as (
  values
    (
      'E1.1 application grants are counselor-column SELECT only',
      pg_catalog.has_any_column_privilege(
        'authenticated',
        'public.student_university_applications',
        'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.student_university_applications',
        'SELECT'
      )
      and not exists (
        select 1
        from pg_catalog.pg_attribute as attribute
        where attribute.attrelid = pg_catalog.to_regclass(
            'public.student_university_applications'
          )
          and attribute.attnum > 0
          and not attribute.attisdropped
          and pg_catalog.has_column_privilege(
            'authenticated',
            'public.student_university_applications',
            attribute.attname::text,
            'SELECT'
          ) is distinct from (
            attribute.attname::text = any(array[
              'id',
              'student_id',
              'country_code',
              'university_name',
              'programme_name',
              'degree_level',
              'intake_term',
              'intake_year',
              'current_status',
              'application_reference',
              'portal_url',
              'submission_deadline',
              'submitted_at',
              'is_primary',
              'is_archived',
              'archived_at',
              'archive_reason',
              'version_number',
              'created_at',
              'updated_at',
              'last_changed_at'
            ]::text[])
          )
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.student_university_applications',
        'INSERT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.student_university_applications',
        'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.student_university_applications',
        'DELETE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.student_university_applications',
        'TRUNCATE'
      )
      and not pg_catalog.has_any_column_privilege(
        'authenticated',
        'public.student_university_applications',
        'INSERT'
      )
      and not pg_catalog.has_any_column_privilege(
        'authenticated',
        'public.student_university_applications',
        'UPDATE'
      )
      and not pg_catalog.has_any_column_privilege(
        'authenticated',
        'public.student_university_applications',
        'REFERENCES'
      )
      and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.student_university_applications',
        'created_by',
        'SELECT'
      )
      and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.student_university_applications',
        'last_changed_by',
        'SELECT'
      )
      and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.student_university_applications',
        'archived_by',
        'SELECT'
      )
      and not pg_catalog.has_any_column_privilege(
        'anon',
        'public.student_university_applications',
        'SELECT'
      )
      and not pg_catalog.has_any_column_privilege(
        'anon',
        'public.student_university_applications',
        'INSERT'
      )
      and not pg_catalog.has_any_column_privilege(
        'anon',
        'public.student_university_applications',
        'UPDATE'
      )
      and not pg_catalog.has_any_column_privilege(
        'anon',
        'public.student_university_applications',
        'REFERENCES'
      )
      and not pg_catalog.has_table_privilege(
        'anon',
        'public.student_university_applications',
        'DELETE'
      )
      and not pg_catalog.has_table_privilege(
        'anon',
        'public.student_university_applications',
        'TRUNCATE'
      )
    ),
    (
      'E1.1 event grants are append-only counselor-column SELECT',
      pg_catalog.has_any_column_privilege(
        'authenticated',
        'public.student_university_application_events',
        'SELECT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.student_university_application_events',
        'SELECT'
      )
      and not exists (
        select 1
        from pg_catalog.pg_attribute as attribute
        where attribute.attrelid = pg_catalog.to_regclass(
            'public.student_university_application_events'
          )
          and attribute.attnum > 0
          and not attribute.attisdropped
          and pg_catalog.has_column_privilege(
            'authenticated',
            'public.student_university_application_events',
            attribute.attname::text,
            'SELECT'
          ) is distinct from (
            attribute.attname::text = any(array[
              'id',
              'application_id',
              'event_type',
              'version_number',
              'country_code',
              'university_name',
              'programme_name',
              'degree_level',
              'intake_term',
              'intake_year',
              'application_status',
              'application_reference',
              'portal_url',
              'submission_deadline',
              'submitted_at',
              'is_primary',
              'is_archived',
              'change_reason',
              'changed_at'
            ]::text[])
          )
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.student_university_application_events',
        'INSERT'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.student_university_application_events',
        'UPDATE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.student_university_application_events',
        'DELETE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.student_university_application_events',
        'TRUNCATE'
      )
      and not pg_catalog.has_any_column_privilege(
        'authenticated',
        'public.student_university_application_events',
        'INSERT'
      )
      and not pg_catalog.has_any_column_privilege(
        'authenticated',
        'public.student_university_application_events',
        'UPDATE'
      )
      and not pg_catalog.has_any_column_privilege(
        'authenticated',
        'public.student_university_application_events',
        'REFERENCES'
      )
      and not pg_catalog.has_column_privilege(
        'authenticated',
        'public.student_university_application_events',
        'changed_by',
        'SELECT'
      )
      and not pg_catalog.has_any_column_privilege(
        'anon',
        'public.student_university_application_events',
        'SELECT'
      )
      and not pg_catalog.has_any_column_privilege(
        'anon',
        'public.student_university_application_events',
        'INSERT'
      )
      and not pg_catalog.has_any_column_privilege(
        'anon',
        'public.student_university_application_events',
        'UPDATE'
      )
      and not pg_catalog.has_any_column_privilege(
        'anon',
        'public.student_university_application_events',
        'REFERENCES'
      )
      and not pg_catalog.has_table_privilege(
        'anon',
        'public.student_university_application_events',
        'DELETE'
      )
      and not pg_catalog.has_table_privilege(
        'anon',
        'public.student_university_application_events',
        'TRUNCATE'
      )
    ),
    (
      'E1.1 enum usage is authenticated only',
      pg_catalog.has_type_privilege(
        'authenticated',
        'public.university_application_status',
        'USAGE'
      )
      and pg_catalog.has_type_privilege(
        'authenticated',
        'public.university_application_degree_level',
        'USAGE'
      )
      and pg_catalog.has_type_privilege(
        'authenticated',
        'public.university_application_intake_term',
        'USAGE'
      )
      and pg_catalog.has_type_privilege(
        'authenticated',
        'public.university_application_event_type',
        'USAGE'
      )
      and not pg_catalog.has_type_privilege(
        'anon',
        'public.university_application_status',
        'USAGE'
      )
    )
)
select
  'privilege_boundary'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

with function_definitions as (
  select
    pg_catalog.string_agg(
      pg_catalog.pg_get_functiondef(function_record.oid),
      E'\n'
      order by function_record.proname
    ) as definitions
  from pg_catalog.pg_proc as function_record
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = function_record.pronamespace
  where namespace.nspname = 'public'
    and function_record.proname in (
      'create_student_university_application',
      'update_student_university_application_details',
      'record_student_university_application_status',
      'set_primary_student_university_application',
      'archive_student_university_application'
    )
),
function_oids as (
  select
    function_record.oid as function_oid,
    function_record.proacl,
    function_record.proowner
  from pg_catalog.unnest(array[
    'public.create_student_university_application(uuid,text,text,text,text,text,integer,text,text,date)',
    'public.update_student_university_application_details(uuid,text,text,text,text,text,integer,text,text,date,text)',
    'public.record_student_university_application_status(uuid,text,text)',
    'public.set_primary_student_university_application(uuid,text)',
    'public.archive_student_university_application(uuid,text)'
  ]::text[]) as signature
  left join pg_catalog.pg_proc as function_record
    on function_record.oid =
      pg_catalog.to_regprocedure(signature)::oid
),
checks(check_name, passed) as (
  values
    (
      'E1.1 RPC execution is authenticated only',
      (
        select
          pg_catalog.count(*) = 5
          and pg_catalog.bool_and(
            pg_catalog.has_function_privilege(
              'authenticated',
              function_oid,
              'EXECUTE'
            )
            and not pg_catalog.has_function_privilege(
              'anon',
              function_oid,
              'EXECUTE'
            )
            and not exists (
              select 1
              from pg_catalog.aclexplode(
                coalesce(
                  proacl,
                  pg_catalog.acldefault('f', proowner)
                )
              ) as function_acl
              where function_acl.grantee = 0
                and function_acl.privilege_type = 'EXECUTE'
            )
          )
        from function_oids
        where function_oid is not null
      )
    ),
    (
      'E1.1 RPCs derive active verified counselor and student role',
      (
        select
          pg_catalog.lower(definitions) like
            '%caller_id := (select auth.uid())%'
          and (
            pg_catalog.length(pg_catalog.lower(definitions))
            - pg_catalog.length(
              pg_catalog.replace(
                pg_catalog.lower(definitions),
                'has_active_verified_kgeo_role',
                ''
              )
            )
          ) / pg_catalog.length('has_active_verified_kgeo_role') = 5
          and pg_catalog.lower(definitions) like
            '%student_profile.role = ''student''::public.user_role%'
        from function_definitions
      )
    ),
    (
      'E1.1 RPCs share one application lock domain and lock rows',
      (
        select
          (
            pg_catalog.length(definitions)
            - pg_catalog.length(
              pg_catalog.replace(
                definitions,
                '202607270001',
                ''
              )
            )
          ) / pg_catalog.length('202607270001') = 5
          and (
            pg_catalog.length(pg_catalog.lower(definitions))
            - pg_catalog.length(
              pg_catalog.replace(
                pg_catalog.lower(definitions),
                'for update',
                ''
              )
            )
          ) / pg_catalog.length('for update') >= 4
          and pg_catalog.lower(definitions) like
            '%order by application.id%for update%'
        from function_definitions
      )
    ),
    (
      'E1.1 creation fixes planning version and audit values',
      (
        select
          pg_catalog.lower(definitions) like
            '%''planning''::public.university_application_status%'
          and pg_catalog.lower(definitions) like
            '%''created''::public.university_application_event_type%'
          and pg_catalog.lower(definitions) like
            '%new_application_id%'
          and pg_catalog.lower(definitions) like
            '%statement_timestamp()%'
        from function_definitions
      )
    ),
    (
      'E1.1 details update rejects no-op and audits one version',
      (
        select
          pg_catalog.lower(definitions) like
            '%current_application.country_code = normalized_country_code%'
          and pg_catalog.lower(definitions) like
            '%''details_updated''::public.university_application_event_type%'
          and pg_catalog.lower(definitions) like
            '%version_number = application.version_number + 1%'
        from function_definitions
      )
    ),
    (
      'E1.1 status graph and submitted timestamp are database controlled',
      (
        select
          pg_catalog.lower(definitions) like
            '%transition_allowed := case current_application.current_status%'
          and pg_catalog.lower(definitions) like
            '%current_application.current_status in (%withdrawn%closed%'
          and pg_catalog.lower(definitions) like
            '%requested_status =%submitted%next_submitted_at is null%'
          and pg_catalog.lower(definitions) not like
            '%p_submitted_at%'
        from function_definitions
      )
    ),
    (
      'E1.1 primary switching is atomic and audits every affected row',
      (
        select
          pg_catalog.lower(definitions) like
            '%previous_primary_exists%'
          and pg_catalog.lower(definitions) like
            '%is_primary = false%'
          and pg_catalog.lower(definitions) like
            '%is_primary = true%'
          and pg_catalog.lower(definitions) like
            '%''primary_changed''::public.university_application_event_type%'
        from function_definitions
      )
    ),
    (
      'E1.1 archive is final soft retention with status preserved',
      (
        select
          pg_catalog.lower(definitions) like
            '%is_archived = true%'
          and pg_catalog.lower(definitions) like
            '%archived_at = change_time%'
          and pg_catalog.lower(definitions) like
            '%''archived''::public.university_application_event_type%'
          and pg_catalog.lower(definitions) not like
            '%delete from public.student_university_application%'
        from function_definitions
      )
    ),
    (
      'E1.1 has no progression Storage offer or visa mutation',
      (
        select
          pg_catalog.lower(definitions) not like
            '%student_counseling_progression%'
          and pg_catalog.lower(definitions) not like '%storage.objects%'
          and pg_catalog.lower(definitions) not like '%service_role%'
          and pg_catalog.lower(definitions) not like '%execute %'
          and not exists (
            select 1
            from information_schema.columns as application_column
            where application_column.table_schema = 'public'
              and application_column.table_name in (
                'student_university_applications',
                'student_university_application_events'
              )
              and application_column.column_name ~
                '(offer|scholarship|deposit|visa|cas|i_20|travel|accommodation)'
          )
        from function_definitions
      )
    ),
    (
      'E1.1 failures are sanitized',
      (
        select
          definitions not like '%SQLERRM%'
          and definitions not like '%PG_EXCEPTION_DETAIL%'
          and definitions like
            '%The university application request is invalid%'
          and definitions like
            '%The university applications changed concurrently%'
        from function_definitions
      )
    )
)
select
  'definition'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

-- Phase E1.3.1 student-safe university application read foundation.
with expected_return_columns(
  column_position,
  column_name,
  udt_name
) as (
  values
    (1, 'application_id', 'uuid'),
    (2, 'university_name', 'text'),
    (3, 'programme_name', 'text'),
    (4, 'country_code', 'text'),
    (5, 'degree_level', 'university_application_degree_level'),
    (6, 'intake_term', 'university_application_intake_term'),
    (7, 'intake_year', 'int4'),
    (8, 'current_status', 'university_application_status'),
    (9, 'submission_deadline', 'date'),
    (10, 'submitted_at', 'timestamptz'),
    (11, 'is_primary', 'bool'),
    (12, 'last_changed_at', 'timestamptz')
),
student_read_function as (
  select pg_catalog.to_regprocedure(
    'public.get_my_university_applications()'
  )::oid as function_oid
),
actual_return_columns as (
  select
    pg_catalog.row_number() over (
      order by parameter.ordinal_position
    )::integer as column_position,
    parameter.parameter_name as column_name,
    parameter.udt_name
  from information_schema.parameters as parameter
  cross join student_read_function as target
  where parameter.specific_schema = 'public'
    and parameter.specific_name =
      'get_my_university_applications_' || target.function_oid::text
    and parameter.parameter_mode = 'OUT'
)
select
  'function_return_column'::text as category,
  'E1.3.1:' || expected.column_position::text || ':' ||
    expected.column_name as object_name,
  (
    actual.column_name = expected.column_name
    and actual.udt_name = expected.udt_name
  ) as passed
from expected_return_columns as expected
left join actual_return_columns as actual
  on actual.column_position = expected.column_position
order by expected.column_position;

with expected_return_columns(
  column_position,
  column_name,
  udt_name
) as (
  values
    (1, 'application_id', 'uuid'),
    (2, 'university_name', 'text'),
    (3, 'programme_name', 'text'),
    (4, 'country_code', 'text'),
    (5, 'degree_level', 'university_application_degree_level'),
    (6, 'intake_term', 'university_application_intake_term'),
    (7, 'intake_year', 'int4'),
    (8, 'current_status', 'university_application_status'),
    (9, 'submission_deadline', 'date'),
    (10, 'submitted_at', 'timestamptz'),
    (11, 'is_primary', 'bool'),
    (12, 'last_changed_at', 'timestamptz')
),
student_read_function as (
  select
    function_record.oid as function_oid,
    function_record.prosecdef,
    function_record.provolatile,
    function_record.proretset,
    function_record.proconfig,
    function_record.proacl,
    function_record.proowner,
    owner_role.rolname as owner_name,
    pg_catalog.lower(
      pg_catalog.pg_get_functiondef(function_record.oid)
    ) as definition
  from pg_catalog.pg_proc as function_record
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = function_record.pronamespace
  inner join pg_catalog.pg_roles as owner_role
    on owner_role.oid = function_record.proowner
  where namespace.nspname = 'public'
    and function_record.proname = 'get_my_university_applications'
    and function_record.pronargs = 0
),
actual_return_columns as (
  select
    pg_catalog.row_number() over (
      order by parameter.ordinal_position
    )::integer as column_position,
    parameter.parameter_name as column_name,
    parameter.udt_name
  from information_schema.parameters as parameter
  cross join student_read_function as target
  where parameter.specific_schema = 'public'
    and parameter.specific_name =
      'get_my_university_applications_' || target.function_oid::text
    and parameter.parameter_mode = 'OUT'
),
checks(check_name, passed) as (
  values
    (
      'E1.3.1 student read RPC has zero arguments',
      (
        select
          pg_catalog.count(*) = 1
          and pg_catalog.count(*) filter (
            where function_record.pronargs = 0
          ) = 1
        from pg_catalog.pg_proc as function_record
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = function_record.pronamespace
        where namespace.nspname = 'public'
          and function_record.proname =
            'get_my_university_applications'
      )
    ),
    (
      'E1.3.1 student read RPC has exact relational return contract',
      (
        select
          (select pg_catalog.count(*) from actual_return_columns) = 12
          and not exists (
            select column_position, column_name, udt_name
            from expected_return_columns
            except
            select column_position, column_name, udt_name
            from actual_return_columns
          )
          and not exists (
            select column_position, column_name, udt_name
            from actual_return_columns
            except
            select column_position, column_name, udt_name
            from expected_return_columns
          )
      )
    ),
    (
      'E1.3.1 student read RPC is trusted stable SECURITY DEFINER',
      coalesce(
        (
          select
            target.prosecdef
            and target.provolatile = 's'
            and target.proretset
            and target.owner_name = 'postgres'
            and target.proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          from student_read_function as target
        ),
        false
      )
    ),
    (
      'E1.3.1 student read RPC execution is authenticated only',
      coalesce(
        (
          select
            pg_catalog.has_function_privilege(
              'authenticated',
              target.function_oid,
              'EXECUTE'
            )
            and not pg_catalog.has_function_privilege(
              'anon',
              target.function_oid,
              'EXECUTE'
            )
            and not exists (
              select 1
              from pg_catalog.aclexplode(
                coalesce(
                  target.proacl,
                  pg_catalog.acldefault('f', target.proowner)
                )
              ) as function_acl
              where function_acl.grantee = 0
                and function_acl.privilege_type = 'EXECUTE'
            )
          from student_read_function as target
        ),
        false
      )
    ),
    (
      'E1.3.1 tables retain counselor-only RLS and no table-wide grant',
      (
        select pg_catalog.count(*) = 2
          and pg_catalog.bool_and(table_record.relrowsecurity)
        from pg_catalog.pg_class as table_record
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = table_record.relnamespace
        where namespace.nspname = 'public'
          and table_record.relname in (
            'student_university_applications',
            'student_university_application_events'
          )
      )
      and (
        select pg_catalog.count(*) = 2
          and pg_catalog.bool_and(
            policy.policyname in (
              'student_university_applications_select_counselor',
              'student_university_application_events_select_counselor'
            )
            and policy.cmd = 'SELECT'
            and policy.roles = array['authenticated']::name[]
            and policy.qual like '%has_active_verified_kgeo_role%'
            and policy.qual like '%counselor%'
          )
        from pg_catalog.pg_policies as policy
        where policy.schemaname = 'public'
          and policy.tablename in (
            'student_university_applications',
            'student_university_application_events'
          )
      )
      and not exists (
        select 1
        from information_schema.table_privileges as privilege
        where privilege.table_schema = 'public'
          and privilege.table_name in (
            'student_university_applications',
            'student_university_application_events'
          )
          and privilege.grantee in ('authenticated', 'anon', 'PUBLIC')
      )
    ),
    (
      'E1.3.1 student read RPC derives and authorizes own identity',
      coalesce(
        (
          select
            target.definition like '%caller_id := (select auth.uid())%'
            and target.definition like '%caller_id is null%'
            and target.definition like
              '%has_active_verified_kgeo_role(%student%'
            and target.definition like
              '%application.student_id = caller_id%application.student_id = caller_id%'
            and target.definition not like '%p_student_id%'
          from student_read_function as target
        ),
        false
      )
    ),
    (
      'E1.3.1 student read RPC excludes archives and bounds overflow',
      coalesce(
        (
          select
            target.definition like
              '%application.is_archived is false%application.is_archived is false%'
            and target.definition like '%limit 101%'
            and target.definition like
              '%bounded_application_count > 100%'
            and target.definition not like
              '%bounded_application_count >= 100%'
            and target.definition like '%limit 100%'
          from student_read_function as target
        ),
        false
      )
    ),
    (
      'E1.3.1 student read RPC uses deterministic safe ordering',
      coalesce(
        (
          select
            target.definition like
              '%return query%order by%application.is_primary desc nulls last,%application.last_changed_at desc nulls last,%application.id desc%limit 100%'
          from student_read_function as target
        ),
        false
      )
    ),
    (
      'E1.3.1 student read RPC exposes no private or event fields',
      (
        select
          (select pg_catalog.count(*) from actual_return_columns) = 12
          and not exists (
            select 1
            from actual_return_columns as actual
            where actual.column_name in (
              'student_id',
              'application_reference',
              'portal_url',
              'is_archived',
              'archive_reason',
              'archived_at',
              'archived_by',
              'created_by',
              'last_changed_by',
              'version_number',
              'change_reason'
            )
          )
      )
    ),
    (
      'E1.3.1 student read RPC has no mutation progression or dynamic SQL',
      coalesce(
        (
          select
            target.definition not like
              '%student_university_application_events%'
            and target.definition not like
              '%student_counseling_progression%'
            and target.definition not like '%service_role%'
            and target.definition not like '%auth.admin%'
            and target.definition not like '%execute format%'
            and target.definition not like
              '%insert into public.student_university_applications%'
            and target.definition not like
              '%update public.student_university_applications%'
            and target.definition not like
              '%delete from public.student_university_applications%'
            and target.definition not like
              '%merge into public.student_university_applications%'
          from student_read_function as target
        ),
        false
      )
    )
)
select
  'definition'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

-- Aggregate-only E1.3.1 drift diagnostic. The grouped student identifiers
-- remain inside the subquery and only the number of oversized sets is returned.
select
  'aggregate_count'::text as category,
  'students with more than 100 nonarchived university applications'::text
    as object_name,
  pg_catalog.count(*)::bigint as row_count
from (
  select application.student_id
  from public.student_university_applications as application
  where application.is_archived is false
  group by application.student_id
  having pg_catalog.count(*) > 100
) as oversized_student_application_sets;

-- Aggregate-only E1.1 inventory. No student, application, counselor,
-- university, programme, reference, URL, timestamp, or reason is returned.
select
  'aggregate_count'::text as category,
  count_name as object_name,
  row_count
from (
  select
    'university application rows'::text as count_name,
    pg_catalog.count(*)::bigint as row_count
  from public.student_university_applications

  union all

  select
    'active university application rows',
    pg_catalog.count(*)::bigint
  from public.student_university_applications as application
  where not application.is_archived

  union all

  select
    'archived university application rows',
    pg_catalog.count(*)::bigint
  from public.student_university_applications as application
  where application.is_archived

  union all

  select
    'primary university application rows',
    pg_catalog.count(*)::bigint
  from public.student_university_applications as application
  where application.is_primary
) as E1_1_inventory
order by count_name;

select
  'drift_count'::text as category,
  count_name as object_name,
  row_count
from (
  select
    'students with more than one primary application'::text
      as count_name,
    pg_catalog.count(*)::bigint as row_count
  from (
    select application.student_id
    from public.student_university_applications as application
    where application.is_primary
    group by application.student_id
    having pg_catalog.count(*) > 1
  ) as duplicate_primary_students

  union all

  select
    'archived or terminal primary applications',
    pg_catalog.count(*)::bigint
  from public.student_university_applications as application
  where application.is_primary
    and (
      application.is_archived
      or application.current_status in (
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    )

  union all

  select
    'applications without created events',
    pg_catalog.count(*)::bigint
  from public.student_university_applications as application
  where not exists (
    select 1
    from public.student_university_application_events as event
    where event.application_id = application.id
      and event.event_type =
        'created'::public.university_application_event_type
      and event.version_number = 1
  )

  union all

  select
    'application version mismatches latest event',
    pg_catalog.count(*)::bigint
  from public.student_university_applications as application
  left join lateral (
    select event.version_number
    from public.student_university_application_events as event
    where event.application_id = application.id
    order by event.version_number desc
    limit 1
  ) as latest_event on true
  where latest_event.version_number is distinct from
    application.version_number

  union all

  select
    'application projections differing from latest snapshot',
    pg_catalog.count(*)::bigint
  from public.student_university_applications as application
  left join lateral (
    select event.*
    from public.student_university_application_events as event
    where event.application_id = application.id
    order by event.version_number desc
    limit 1
  ) as latest_event on true
  where latest_event.application_id is null
    or latest_event.country_code is distinct from application.country_code
    or latest_event.university_name is distinct from
      application.university_name
    or latest_event.programme_name is distinct from
      application.programme_name
    or latest_event.degree_level is distinct from application.degree_level
    or latest_event.intake_term is distinct from application.intake_term
    or latest_event.intake_year is distinct from application.intake_year
    or latest_event.application_status is distinct from
      application.current_status
    or latest_event.application_reference is distinct from
      application.application_reference
    or latest_event.portal_url is distinct from application.portal_url
    or latest_event.submission_deadline is distinct from
      application.submission_deadline
    or latest_event.submitted_at is distinct from application.submitted_at
    or latest_event.is_primary is distinct from application.is_primary
    or latest_event.is_archived is distinct from application.is_archived
    or latest_event.changed_at is distinct from application.last_changed_at
    or latest_event.changed_by is distinct from application.last_changed_by
    or (
      application.is_archived
      and (
        latest_event.event_type is distinct from
          'archived'::public.university_application_event_type
        or latest_event.changed_at is distinct from application.archived_at
        or latest_event.change_reason is distinct from
          application.archive_reason
      )
    )

  union all

  select
    'duplicate application event versions',
    pg_catalog.count(*)::bigint
  from (
    select event.application_id, event.version_number
    from public.student_university_application_events as event
    group by event.application_id, event.version_number
    having pg_catalog.count(*) > 1
  ) as duplicate_event_versions

  union all

  select
    'application events without applications',
    pg_catalog.count(*)::bigint
  from public.student_university_application_events as event
  left join public.student_university_applications as application
    on application.id = event.application_id
  where application.id is null

  union all

  select
    'submitted lifecycle applications missing submitted timestamp',
    pg_catalog.count(*)::bigint
  from public.student_university_applications as application
  where application.submitted_at is null
    and (
      application.current_status in (
        'submitted'::public.university_application_status,
        'under_university_review'::public.university_application_status,
        'additional_information_requested'::public.university_application_status,
        'decision_received'::public.university_application_status
      )
      or (
        application.current_status in (
          'withdrawn'::public.university_application_status,
          'closed'::public.university_application_status
        )
        and exists (
          select 1
          from public.student_university_application_events as event
          where event.application_id = application.id
            and event.application_status in (
              'submitted'::public.university_application_status,
              'under_university_review'::public.university_application_status,
              'additional_information_requested'::public.university_application_status,
              'decision_received'::public.university_application_status
            )
        )
      )
    )

  union all

  select
    'pre-submission applications with submitted timestamp',
    pg_catalog.count(*)::bigint
  from public.student_university_applications as application
  where application.current_status in (
      'planning'::public.university_application_status,
      'documents_collecting'::public.university_application_status,
      'application_preparing'::public.university_application_status,
      'ready_to_submit'::public.university_application_status
    )
    and application.submitted_at is not null
) as E1_1_drift
order by count_name;

-- Aggregate-only D3.4.1 inventory. No identifiers, correction reasons,
-- stages, actor values, or evidence metadata are returned.
select
  'aggregate_count'::text as category,
  count_name as object_name,
  row_count
from (
  select
    'total progression corrections'::text as count_name,
    pg_catalog.count(*)::bigint as row_count
  from public.student_counseling_progression_event_corrections

  union all

  select
    'transition progression corrections',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progression_event_corrections
  where correction_type =
    'undo_transition'::public.counseling_progression_correction_type

  union all

  select
    'initialization progression resets',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progression_event_corrections
  where correction_type =
    'reset_initialization'::public.counseling_progression_correction_type

  union all

  select
    'current rows mismatching latest effective event',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progressions as progression
  left join lateral (
    select event.new_stage, event.new_state
    from public.student_counseling_progression_events as event
    where event.student_id = progression.student_id
      and not exists (
        select 1
        from public.student_counseling_progression_event_corrections
          as correction
        where correction.target_event_id = event.id
      )
    order by event.changed_at desc, event.id desc
    limit 1
  ) as effective_event on true
  where effective_event.new_stage is null
    or progression.current_stage is distinct from
      effective_event.new_stage
    or progression.workflow_state is distinct from
      effective_event.new_state

  union all

  select
    'effective histories missing current projection',
    pg_catalog.count(*)::bigint
  from (
    select distinct event.student_id
    from public.student_counseling_progression_events as event
    where not exists (
      select 1
      from public.student_counseling_progression_event_corrections
        as correction
      where correction.target_event_id = event.id
    )
  ) as effective_student
  left join public.student_counseling_progressions as progression
    on progression.student_id = effective_student.student_id
  where progression.student_id is null

  union all

  select
    'students with multiple effective initializations',
    pg_catalog.count(*)::bigint
  from (
    select event.student_id
    from public.student_counseling_progression_events as event
    where event.previous_stage is null
      and event.previous_state is null
      and not exists (
        select 1
        from public.student_counseling_progression_event_corrections
          as correction
        where correction.target_event_id = event.id
      )
    group by event.student_id
    having pg_catalog.count(*) > 1
  ) as duplicate_initialization

  union all

  select
    'corrections with missing target event',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progression_event_corrections
    as correction
  left join public.student_counseling_progression_events as event
    on event.id = correction.target_event_id
  where event.id is null

  union all

  select
    'corrections with invalid restored-field shape',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progression_event_corrections
    as correction
  inner join public.student_counseling_progression_events as event
    on event.id = correction.target_event_id
  where (
    correction.correction_type =
      'reset_initialization'::public.counseling_progression_correction_type
    and (
      event.previous_stage is not null
      or event.previous_state is not null
      or event.new_state <>
        'active'::public.counseling_progression_state
      or correction.restored_stage is not null
      or correction.restored_state is not null
      or correction.restored_stage_started_at is not null
    )
  ) or (
    correction.correction_type =
      'undo_transition'::public.counseling_progression_correction_type
    and (
      event.previous_stage is null
      or event.previous_state is null
      or correction.restored_stage is distinct from event.previous_stage
      or correction.restored_state is distinct from event.previous_state
      or correction.restored_stage_started_at is null
    )
  )
) as d3_4_counts
order by count_name;

-- Phase D3.3.1 official progression evidence foundation. These checks inspect
-- only catalog definitions and aggregate state. No evidence filename, path,
-- event/student/counselor identifier, or removal reason is returned.
--
-- The public-schema checks can pass after the corrected migration is applied.
-- The bucket and two Storage-policy checks are expected to remain false until
-- the private bucket and both exact policies have been created through the
-- Supabase Dashboard-managed Storage path. Full readiness requires both
-- stages; these checks deliberately do not treat missing policies as ready.
with
expected_columns(column_name, data_type, is_nullable) as (
  values
    ('id', 'uuid', 'NO'),
    ('progression_event_id', 'uuid', 'NO'),
    ('bucket_id', 'text', 'NO'),
    ('storage_path', 'text', 'NO'),
    ('original_file_name', 'text', 'NO'),
    ('mime_type', 'text', 'NO'),
    ('file_size_bytes', 'int8', 'NO'),
    (
      'status',
      'counseling_progression_evidence_status',
      'NO'
    ),
    ('uploaded_by', 'uuid', 'NO'),
    ('prepared_at', 'timestamptz', 'NO'),
    ('upload_expires_at', 'timestamptz', 'NO'),
    ('available_at', 'timestamptz', 'YES'),
    ('removed_at', 'timestamptz', 'YES'),
    ('removed_by', 'uuid', 'YES'),
    ('removal_reason', 'text', 'YES'),
    ('created_at', 'timestamptz', 'NO'),
    ('updated_at', 'timestamptz', 'NO')
),
actual_columns as (
  select
    attribute.attname::text as column_name,
    type_record.typname::text as data_type,
    case when attribute.attnotnull then 'NO' else 'YES' end::text
      as is_nullable
  from pg_catalog.pg_attribute as attribute
  inner join pg_catalog.pg_class as relation
    on relation.oid = attribute.attrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  inner join pg_catalog.pg_type as type_record
    on type_record.oid = attribute.atttypid
  where namespace.nspname = 'public'
    and relation.relname =
      'student_counseling_progression_evidence'
    and attribute.attnum > 0
    and not attribute.attisdropped
),
evidence_function_definitions as (
  select
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.prepare_student_counseling_progression_evidence_upload(uuid,text,text,bigint)'
      )
    ) as prepare_definition,
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.finalize_student_counseling_progression_evidence_upload(uuid)'
      )
    ) as finalize_definition,
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.remove_student_counseling_progression_evidence(uuid,text)'
      )
    ) as remove_definition
),
checks(check_name, passed) as (
  values
    (
      'D3.3.1 evidence enum has exact lifecycle values',
      array(
        select enum_value.enumlabel::text
        from pg_catalog.pg_enum as enum_value
        inner join pg_catalog.pg_type as enum_type
          on enum_type.oid = enum_value.enumtypid
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = enum_type.typnamespace
        where namespace.nspname = 'public'
          and enum_type.typname =
            'counseling_progression_evidence_status'
        order by enum_value.enumsortorder
      ) = array['pending', 'available', 'removed']::text[]
    ),
    (
      'D3.3.1 evidence table has exact columns and nullability',
      pg_catalog.to_regclass(
        'public.student_counseling_progression_evidence'
      ) is not null
      and not exists (
        select column_name, data_type, is_nullable
        from expected_columns
        except
        select column_name, data_type, is_nullable
        from actual_columns
      )
      and not exists (
        select column_name, data_type, is_nullable
        from actual_columns
        except
        select column_name, data_type, is_nullable
        from expected_columns
      )
    ),
    (
      'D3.3.1 evidence defaults are database controlled',
      (
        select
          pg_catalog.pg_get_expr(
            id_default.adbin,
            id_default.adrelid
          ) = 'gen_random_uuid()'
          and pg_catalog.pg_get_expr(
            bucket_default.adbin,
            bucket_default.adrelid
          ) = '''counseling-progression-evidence''::text'
          and pg_catalog.pg_get_expr(
            status_default.adbin,
            status_default.adrelid
          ) like
            '%''pending''%counseling_progression_evidence_status%'
        from pg_catalog.pg_class as relation
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = relation.relnamespace
        inner join pg_catalog.pg_attribute as id_attribute
          on id_attribute.attrelid = relation.oid
          and id_attribute.attname = 'id'
        inner join pg_catalog.pg_attrdef as id_default
          on id_default.adrelid = relation.oid
          and id_default.adnum = id_attribute.attnum
        inner join pg_catalog.pg_attribute as bucket_attribute
          on bucket_attribute.attrelid = relation.oid
          and bucket_attribute.attname = 'bucket_id'
        inner join pg_catalog.pg_attrdef as bucket_default
          on bucket_default.adrelid = relation.oid
          and bucket_default.adnum = bucket_attribute.attnum
        inner join pg_catalog.pg_attribute as status_attribute
          on status_attribute.attrelid = relation.oid
          and status_attribute.attname = 'status'
        inner join pg_catalog.pg_attrdef as status_default
          on status_default.adrelid = relation.oid
          and status_default.adnum = status_attribute.attnum
        where namespace.nspname = 'public'
          and relation.relname =
            'student_counseling_progression_evidence'
      )
    ),
    (
      'D3.3.1 evidence constraints enforce path file and lifecycle',
      (
        select pg_catalog.count(*) = 9
        from pg_catalog.pg_constraint as constraint_record
        where constraint_record.conrelid =
          pg_catalog.to_regclass(
            'public.student_counseling_progression_evidence'
          )
          and constraint_record.conname in (
            'progression_evidence_bucket_check',
            'progression_evidence_storage_path_key',
            'progression_evidence_storage_path_check',
            'progression_evidence_original_name_check',
            'progression_evidence_mime_type_check',
            'progression_evidence_mime_extension_check',
            'progression_evidence_file_size_check',
            'progression_evidence_upload_window_check',
            'progression_evidence_status_consistency_check'
          )
      )
    ),
    (
      'D3.3.1 evidence foreign keys retain event and actor history',
      (
        select pg_catalog.count(*) = 3
        from pg_catalog.pg_constraint as constraint_record
        where constraint_record.conrelid =
          pg_catalog.to_regclass(
            'public.student_counseling_progression_evidence'
          )
          and constraint_record.contype = 'f'
          and constraint_record.confdeltype = 'r'
          and constraint_record.conname in (
            'progression_evidence_event_id_fkey',
            'progression_evidence_uploaded_by_fkey',
            'progression_evidence_removed_by_fkey'
          )
      )
    ),
    (
      'D3.3.1 evidence indexes match uniqueness event and expiry access',
      (
        select pg_catalog.count(*) = 3
        from pg_catalog.pg_indexes as index_record
        where index_record.schemaname = 'public'
          and index_record.tablename =
            'student_counseling_progression_evidence'
          and index_record.indexname in (
            'progression_evidence_storage_path_key',
            'progression_evidence_event_status_available_idx',
            'progression_evidence_status_expiry_idx'
          )
      )
    ),
    (
      'D3.3.1 evidence RLS is enabled with counselor SELECT only',
      (
        select relation.relrowsecurity
        from pg_catalog.pg_class as relation
        where relation.oid = pg_catalog.to_regclass(
          'public.student_counseling_progression_evidence'
        )
      )
      and (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'public'
          and policy_record.tablename =
            'student_counseling_progression_evidence'
          and policy_record.policyname =
            'progression_evidence_select_counselor'
          and policy_record.cmd = 'SELECT'
          and policy_record.roles = array['authenticated']::name[]
          and policy_record.qual like
            '%has_active_verified_kgeo_role%''counselor''%'
      )
    ),
    (
      'D3.3.1 evidence grants are SELECT only for authenticated',
      not exists (
        select 1
        from information_schema.role_table_grants as table_grant
        where table_grant.table_schema = 'public'
          and table_grant.table_name =
            'student_counseling_progression_evidence'
          and table_grant.grantee in (
            'PUBLIC',
            'anon',
            'authenticated'
          )
          and table_grant.privilege_type in (
            'INSERT',
            'UPDATE',
            'DELETE',
            'TRUNCATE',
            'REFERENCES',
            'TRIGGER'
          )
      )
      and (
        select pg_catalog.count(*) = 17
        from information_schema.column_privileges as column_grant
        where column_grant.table_schema = 'public'
          and column_grant.table_name =
            'student_counseling_progression_evidence'
          and column_grant.grantee = 'authenticated'
          and column_grant.privilege_type = 'SELECT'
      )
    ),
    (
      'D3.3.1 RPC signatures and return contracts exist',
      pg_catalog.to_regprocedure(
        'public.prepare_student_counseling_progression_evidence_upload(uuid,text,text,bigint)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'public.finalize_student_counseling_progression_evidence_upload(uuid)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'public.remove_student_counseling_progression_evidence(uuid,text)'
      ) is not null
      and pg_catalog.pg_get_function_result(
        pg_catalog.to_regprocedure(
          'public.prepare_student_counseling_progression_evidence_upload(uuid,text,text,bigint)'
        )
      ) like
        'TABLE(evidence_id uuid, progression_event_id uuid,%'
      and pg_catalog.pg_get_function_result(
        pg_catalog.to_regprocedure(
          'public.finalize_student_counseling_progression_evidence_upload(uuid)'
        )
      ) like
        'TABLE(id uuid, progression_event_id uuid,%'
      and pg_catalog.pg_get_function_result(
        pg_catalog.to_regprocedure(
          'public.remove_student_counseling_progression_evidence(uuid,text)'
        )
      ) like
        'TABLE(evidence_id uuid, bucket_id text,%'
    ),
    (
      'D3.3.1 RPCs are trusted SECURITY DEFINER with empty search path',
      (
        select pg_catalog.count(*) = 3
        from pg_catalog.pg_proc as function_record
        inner join pg_catalog.pg_roles as owner_role
          on owner_role.oid = function_record.proowner
        where function_record.oid in (
          pg_catalog.to_regprocedure(
            'public.prepare_student_counseling_progression_evidence_upload(uuid,text,text,bigint)'
          ),
          pg_catalog.to_regprocedure(
            'public.finalize_student_counseling_progression_evidence_upload(uuid)'
          ),
          pg_catalog.to_regprocedure(
            'public.remove_student_counseling_progression_evidence(uuid,text)'
          )
        )
          and function_record.prosecdef
          and function_record.proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_role.rolname = 'postgres'
      )
    ),
    (
      'D3.3.1 RPC execution is authenticated only',
      (
        select pg_catalog.count(*) = 3
        from pg_catalog.pg_proc as function_record
        where function_record.oid in (
          pg_catalog.to_regprocedure(
            'public.prepare_student_counseling_progression_evidence_upload(uuid,text,text,bigint)'
          ),
          pg_catalog.to_regprocedure(
            'public.finalize_student_counseling_progression_evidence_upload(uuid)'
          ),
          pg_catalog.to_regprocedure(
            'public.remove_student_counseling_progression_evidence(uuid,text)'
          )
        )
          and pg_catalog.has_function_privilege(
            'authenticated',
            function_record.oid,
            'EXECUTE'
          )
          and not pg_catalog.has_function_privilege(
            'anon',
            function_record.oid,
            'EXECUTE'
          )
          and not exists (
            select 1
            from pg_catalog.aclexplode(
              coalesce(
                function_record.proacl,
                pg_catalog.acldefault(
                  'f',
                  function_record.proowner
                )
              )
            ) as access_entry
            where access_entry.grantee = 0
              and access_entry.privilege_type = 'EXECUTE'
          )
      )
    ),
    (
      'D3.3.1 prepare RPC validates actor event file and generated path',
      (
        select
          prepare_definition like '%auth.uid()%'
          and prepare_definition like
            '%has_active_verified_kgeo_role%counselor%'
          and prepare_definition like
            '%student_counseling_progression_events%'
          and prepare_definition like '%role = ''student''%'
          and prepare_definition like '%p_original_file_name%'
          and prepare_definition like '%10485760%'
          and prepare_definition like '%gen_random_uuid()%'
          and prepare_definition not like '%p_student_id%'
          and prepare_definition not like '%p_storage_path%'
        from evidence_function_definitions
      )
    ),
    (
      'D3.3.1 prepare RPC locks before enforcing five active files',
      (
        select
          pg_catalog.strpos(
            prepare_definition,
            'pg_try_advisory_xact_lock'
          ) > 0
          and pg_catalog.strpos(
            prepare_definition,
            'pg_try_advisory_xact_lock'
          ) < pg_catalog.strpos(
            prepare_definition,
            'select pg_catalog.count(*)'
          )
          and prepare_definition like '%active_evidence_count >= 5%'
          and prepare_definition like
            '%upload_expires_at > prepared_time%'
          and prepare_definition like
            '%prepared_time + interval ''2 hours''%'
        from evidence_function_definitions
      )
    ),
    (
      'D3.3.1 finalize RPC is uploader-bound and object-existence only',
      (
        select
          finalize_definition like '%FOR UPDATE%'
          and finalize_definition like
            '%uploaded_by <> caller_id%'
          and finalize_definition like
            '%upload_expires_at <= finalized_time%'
          and finalize_definition like '%storage.objects%'
          and finalize_definition like
            '%bucket_id = evidence_record.bucket_id%'
          and finalize_definition like
            '%name = evidence_record.storage_path%'
          and pg_catalog.lower(finalize_definition) not like
            '%insert into storage.objects%'
          and pg_catalog.lower(finalize_definition) not like
            '%update storage.objects%'
          and pg_catalog.lower(finalize_definition) not like
            '%delete from storage.objects%'
        from evidence_function_definitions
      )
    ),
    (
      'D3.3.1 removal RPC is final audited soft removal',
      (
        select
          remove_definition like '%FOR UPDATE%'
          and remove_definition like
            '%status = ''removed''%'
          and remove_definition like '%removed_at = removal_time%'
          and remove_definition like '%removed_by = caller_id%'
          and remove_definition like
            '%char_length(normalized_removal_reason) > 500%'
          and remove_definition not like '%DELETE FROM%'
          and remove_definition not like '%storage.objects%'
        from evidence_function_definitions
      )
    ),
    (
      'D3.3.1 Storage policies are exact INSERT and SELECT only',
      (
        select pg_catalog.count(*) = 2
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'storage'
          and policy_record.tablename = 'objects'
          and policy_record.policyname in (
            'progression_evidence_object_insert_counselor',
            'progression_evidence_object_select_counselor'
          )
          and policy_record.roles =
            array['authenticated']::name[]
          and policy_record.cmd in ('INSERT', 'SELECT')
      )
      and not exists (
        select 1
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'storage'
          and policy_record.tablename = 'objects'
          and policy_record.policyname like
            'progression_evidence_object_%'
          and policy_record.cmd in ('UPDATE', 'DELETE', 'ALL')
      )
    ),
    (
      'D3.3.1 Storage denies UPDATE DELETE public and anonymous evidence access',
      not exists (
        select 1
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'storage'
          and policy_record.tablename = 'objects'
          and (
            policy_record.policyname like
              'progression_evidence_object_%'
            or coalesce(policy_record.qual, '') like
              '%counseling-progression-evidence%'
            or coalesce(policy_record.with_check, '') like
              '%counseling-progression-evidence%'
          )
          and (
            policy_record.cmd in ('UPDATE', 'DELETE', 'ALL')
            or policy_record.roles &&
              array['public', 'anon']::name[]
          )
      )
    ),
    (
      'D3.3.1 Storage INSERT policy is pending uploader and expiry bound',
      (
        select
          policy_record.with_check like
            '%counseling-progression-evidence%'
          and policy_record.with_check like
            '%has_active_verified_kgeo_role%counselor%'
          and policy_record.with_check like
            '%student_counseling_progression_evidence%'
          and policy_record.with_check like '%status%pending%'
          and policy_record.with_check like '%uploaded_by%uid%'
          and policy_record.with_check like
            '%upload_expires_at%statement_timestamp%'
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'storage'
          and policy_record.tablename = 'objects'
          and policy_record.policyname =
            'progression_evidence_object_insert_counselor'
      )
    ),
    (
      'D3.3.1 Storage SELECT policy is available counselor only',
      (
        select
          policy_record.qual like
            '%counseling-progression-evidence%'
          and policy_record.qual like
            '%has_active_verified_kgeo_role%counselor%'
          and policy_record.qual like '%status%available%'
          and policy_record.qual not like '%status%pending%'
          and policy_record.qual not like '%status%removed%'
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'storage'
          and policy_record.tablename = 'objects'
          and policy_record.policyname =
            'progression_evidence_object_select_counselor'
      )
    ),
    (
      'D3.3.1 private bucket has exact size and MIME configuration',
      (
        select
          not bucket.public
          and bucket.file_size_limit = 10485760
          and (
            select pg_catalog.array_agg(mime_type order by mime_type)
            from pg_catalog.unnest(
              bucket.allowed_mime_types
            ) as mime_type
          ) = array[
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/jpeg',
            'image/png',
            'image/webp'
          ]
        from storage.buckets as bucket
        where bucket.id = 'counseling-progression-evidence'
      )
    )
)
select
  'D3.3.1_check'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

-- Aggregate-only D3.3.1 inventory. Counts do not return evidence metadata.
select
  'aggregate_count'::text as category,
  count_name as object_name,
  row_count
from (
  select
    'available progression evidence'::text as count_name,
    pg_catalog.count(*)::bigint as row_count
  from public.student_counseling_progression_evidence as evidence
  where evidence.status =
    'available'::public.counseling_progression_evidence_status

  union all

  select
    'pending progression evidence',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progression_evidence as evidence
  where evidence.status =
    'pending'::public.counseling_progression_evidence_status

  union all

  select
    'expired pending progression evidence',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progression_evidence as evidence
  where evidence.status =
      'pending'::public.counseling_progression_evidence_status
    and evidence.upload_expires_at <=
      pg_catalog.statement_timestamp()

  union all

  select
    'removed progression evidence',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progression_evidence as evidence
  where evidence.status =
    'removed'::public.counseling_progression_evidence_status

  union all

  select
    'events at progression evidence limit',
    pg_catalog.count(*)::bigint
  from (
    select evidence.progression_event_id
    from public.student_counseling_progression_evidence as evidence
    where evidence.status =
        'available'::public.counseling_progression_evidence_status
      or (
        evidence.status =
          'pending'::public.counseling_progression_evidence_status
        and evidence.upload_expires_at >
          pg_catalog.statement_timestamp()
      )
    group by evidence.progression_event_id
    having pg_catalog.count(*) >= 5
  ) as events_at_limit

  union all

  select
    'available evidence missing Storage object',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progression_evidence as evidence
  where evidence.status =
      'available'::public.counseling_progression_evidence_status
    and not exists (
      select 1
      from storage.objects as storage_object
      where storage_object.bucket_id = evidence.bucket_id
        and storage_object.name = evidence.storage_path
    )

  union all

  select
    'pending evidence with Storage object',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progression_evidence as evidence
  where evidence.status =
      'pending'::public.counseling_progression_evidence_status
    and exists (
      select 1
      from storage.objects as storage_object
      where storage_object.bucket_id = evidence.bucket_id
        and storage_object.name = evidence.storage_path
    )

  union all

  select
    'removed evidence retaining Storage object',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progression_evidence as evidence
  where evidence.status =
      'removed'::public.counseling_progression_evidence_status
    and exists (
      select 1
      from storage.objects as storage_object
      where storage_object.bucket_id = evidence.bucket_id
        and storage_object.name = evidence.storage_path
    )
) as D3_3_counts
order by count_name;

-- Aggregate-only D3 inventory. No student/counselor identifier, stage, actor,
-- timestamp, or reason is returned.
select
  'aggregate_count'::text as category,
  count_name as object_name,
  row_count
from (
  select
    'students without official progression'::text as count_name,
    pg_catalog.count(*)::bigint as row_count
  from public.profiles as student_profile
  left join public.student_counseling_progressions as progression
    on progression.student_id = student_profile.id
  where student_profile.role = 'student'::public.user_role
    and progression.student_id is null

  union all

  select
    'active progression count',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progressions as progression
  where progression.workflow_state =
    'active'::public.counseling_progression_state

  union all

  select
    'on-hold progression count',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progressions as progression
  where progression.workflow_state =
    'on_hold'::public.counseling_progression_state

  union all

  select
    'completed progression count',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progressions as progression
  where progression.workflow_state =
    'completed'::public.counseling_progression_state

  union all

  select
    'current rows without history',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progressions as progression
  where not exists (
    select 1
    from public.student_counseling_progression_events as event
    where event.student_id = progression.student_id
  )

  union all

  select
    'latest-event/current-row mismatches',
    pg_catalog.count(*)::bigint
  from public.student_counseling_progressions as progression
  left join lateral (
    select
      event.new_stage,
      event.new_state
    from public.student_counseling_progression_events as event
    where event.student_id = progression.student_id
      and not exists (
        select 1
        from public.student_counseling_progression_event_corrections
          as correction
        where correction.target_event_id = event.id
      )
    order by event.changed_at desc, event.id desc
    limit 1
  ) as latest_event on true
  where latest_event.new_stage is null
    or latest_event.new_stage is distinct from progression.current_stage
    or latest_event.new_state is distinct from progression.workflow_state
) as D3_counts
order by count_name;

-- Phase E1.3.3 university application document foundation. All catalog checks
-- and diagnostics are read-only. No document, application, student, counselor,
-- filename, title, path, removal reason, or signed URL is returned.
with
expected_columns(column_name, data_type, is_nullable) as (
  values
    ('id', 'uuid', 'NO'),
    ('application_id', 'uuid', 'NO'),
    ('status', 'university_application_document_status', 'NO'),
    ('document_title', 'text', 'NO'),
    ('original_file_name', 'text', 'NO'),
    ('bucket_id', 'text', 'NO'),
    ('storage_path', 'text', 'NO'),
    ('mime_type', 'text', 'NO'),
    ('file_size_bytes', 'int8', 'NO'),
    ('uploaded_by', 'uuid', 'NO'),
    ('prepared_at', 'timestamptz', 'NO'),
    ('upload_expires_at', 'timestamptz', 'NO'),
    ('available_at', 'timestamptz', 'YES'),
    ('removed_at', 'timestamptz', 'YES'),
    ('removed_by', 'uuid', 'YES'),
    ('removal_reason', 'text', 'YES'),
    ('created_at', 'timestamptz', 'NO'),
    ('updated_at', 'timestamptz', 'NO')
),
actual_columns as (
  select
    attribute.attname::text as column_name,
    type_record.typname::text as data_type,
    case when attribute.attnotnull then 'NO' else 'YES' end::text
      as is_nullable
  from pg_catalog.pg_attribute as attribute
  inner join pg_catalog.pg_class as relation
    on relation.oid = attribute.attrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  inner join pg_catalog.pg_type as type_record
    on type_record.oid = attribute.atttypid
  where namespace.nspname = 'public'
    and relation.relname =
      'student_university_application_documents'
    and attribute.attnum > 0
    and not attribute.attisdropped
),
document_function_definitions as (
  select
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.prepare_university_application_document_upload(uuid,text,text,text,bigint)'
      )
    ) as prepare_definition,
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.finalize_university_application_document_upload(uuid)'
      )
    ) as finalize_definition,
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.list_university_application_documents(uuid)'
      )
    ) as list_definition,
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.authorize_university_application_document_view(uuid,uuid)'
      )
    ) as view_definition,
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.soft_remove_university_application_document(uuid,text)'
      )
    ) as remove_definition,
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.can_upload_university_application_document_object(text,text)'
      )
    ) as storage_upload_definition,
    pg_catalog.pg_get_functiondef(
      pg_catalog.to_regprocedure(
        'public.can_view_university_application_document_object(text,text)'
      )
    ) as storage_view_definition
),
document_functions(signature) as (
  values
    ('public.prepare_university_application_document_upload(uuid,text,text,text,bigint)'),
    ('public.finalize_university_application_document_upload(uuid)'),
    ('public.list_university_application_documents(uuid)'),
    ('public.authorize_university_application_document_view(uuid,uuid)'),
    ('public.soft_remove_university_application_document(uuid,text)'),
    ('public.can_upload_university_application_document_object(text,text)'),
    ('public.can_view_university_application_document_object(text,text)')
),
checks(check_name, passed) as (
  values
    (
      'E1.3.3 document enum has exact lifecycle values',
      array(
        select enum_value.enumlabel::text
        from pg_catalog.pg_enum as enum_value
        inner join pg_catalog.pg_type as enum_type
          on enum_type.oid = enum_value.enumtypid
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = enum_type.typnamespace
        where namespace.nspname = 'public'
          and enum_type.typname =
            'university_application_document_status'
        order by enum_value.enumsortorder
      ) = array['pending', 'available', 'removed']::text[]
    ),
    (
      'E1.3.3 document table has exact columns and nullability',
      pg_catalog.to_regclass(
        'public.student_university_application_documents'
      ) is not null
      and not exists (
        select column_name, data_type, is_nullable
        from expected_columns
        except
        select column_name, data_type, is_nullable
        from actual_columns
      )
      and not exists (
        select column_name, data_type, is_nullable
        from actual_columns
        except
        select column_name, data_type, is_nullable
        from expected_columns
      )
    ),
    (
      'E1.3.3 document defaults are database controlled',
      (
        select
          pg_catalog.pg_get_expr(
            id_default.adbin,
            id_default.adrelid
          ) = 'gen_random_uuid()'
          and pg_catalog.pg_get_expr(
            bucket_default.adbin,
            bucket_default.adrelid
          ) = '''university-application-documents''::text'
          and pg_catalog.pg_get_expr(
            status_default.adbin,
            status_default.adrelid
          ) like
            '%''pending''%university_application_document_status%'
          and pg_catalog.pg_get_expr(
            expiry_default.adbin,
            expiry_default.adrelid
          ) like '%statement_timestamp()%02:00:00%'
        from pg_catalog.pg_class as relation
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = relation.relnamespace
        inner join pg_catalog.pg_attribute as id_attribute
          on id_attribute.attrelid = relation.oid
          and id_attribute.attname = 'id'
        inner join pg_catalog.pg_attrdef as id_default
          on id_default.adrelid = relation.oid
          and id_default.adnum = id_attribute.attnum
        inner join pg_catalog.pg_attribute as bucket_attribute
          on bucket_attribute.attrelid = relation.oid
          and bucket_attribute.attname = 'bucket_id'
        inner join pg_catalog.pg_attrdef as bucket_default
          on bucket_default.adrelid = relation.oid
          and bucket_default.adnum = bucket_attribute.attnum
        inner join pg_catalog.pg_attribute as status_attribute
          on status_attribute.attrelid = relation.oid
          and status_attribute.attname = 'status'
        inner join pg_catalog.pg_attrdef as status_default
          on status_default.adrelid = relation.oid
          and status_default.adnum = status_attribute.attnum
        inner join pg_catalog.pg_attribute as expiry_attribute
          on expiry_attribute.attrelid = relation.oid
          and expiry_attribute.attname = 'upload_expires_at'
        inner join pg_catalog.pg_attrdef as expiry_default
          on expiry_default.adrelid = relation.oid
          and expiry_default.adnum = expiry_attribute.attnum
        where namespace.nspname = 'public'
          and relation.relname =
            'student_university_application_documents'
      )
    ),
    (
      'E1.3.3 document constraints enforce title path file size expiry and lifecycle',
      (
        select pg_catalog.count(*) = 10
        from pg_catalog.pg_constraint as constraint_record
        where constraint_record.conrelid =
          pg_catalog.to_regclass(
            'public.student_university_application_documents'
          )
          and constraint_record.conname in (
            'university_application_documents_bucket_check',
            'university_application_documents_storage_path_key',
            'university_application_documents_storage_path_check',
            'university_application_documents_title_check',
            'university_application_documents_original_name_check',
            'university_application_documents_mime_type_check',
            'university_application_documents_mime_extension_check',
            'university_application_documents_file_size_check',
            'university_application_documents_upload_window_check',
            'university_application_documents_status_consistency_check'
          )
      )
    ),
    (
      'E1.3.3 document foreign keys retain application and actor history',
      (
        select pg_catalog.count(*) = 3
        from pg_catalog.pg_constraint as constraint_record
        where constraint_record.conrelid =
          pg_catalog.to_regclass(
            'public.student_university_application_documents'
          )
          and constraint_record.contype = 'f'
          and constraint_record.confdeltype = 'r'
          and constraint_record.conname in (
            'university_application_documents_application_id_fkey',
            'university_application_documents_uploaded_by_fkey',
            'university_application_documents_removed_by_fkey'
          )
      )
    ),
    (
      'E1.3.3 document indexes match unique path list and expiry access',
      (
        select pg_catalog.count(*) = 3
        from pg_catalog.pg_indexes as index_record
        where index_record.schemaname = 'public'
          and index_record.tablename =
            'student_university_application_documents'
          and index_record.indexname in (
            'university_application_documents_storage_path_key',
            'university_application_documents_application_available_idx',
            'university_application_documents_status_expiry_idx'
          )
      )
    ),
    (
      'E1.3.3 document RLS is enabled with available counselor policy only',
      (
        select relation.relrowsecurity
        from pg_catalog.pg_class as relation
        where relation.oid = pg_catalog.to_regclass(
          'public.student_university_application_documents'
        )
      )
      and (
        select pg_catalog.count(*) = 1
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'public'
          and policy_record.tablename =
            'student_university_application_documents'
          and policy_record.policyname =
            'university_application_documents_select_counselor'
          and policy_record.cmd = 'SELECT'
          and policy_record.roles = array['authenticated']::name[]
          and policy_record.qual like
            '%has_active_verified_kgeo_role%''counselor''%'
          and policy_record.qual like '%status%available%'
      )
    ),
    (
      'E1.3.3 document table has no direct public anon or authenticated grants',
      not exists (
        select 1
        from information_schema.role_table_grants as table_grant
        where table_grant.table_schema = 'public'
          and table_grant.table_name =
            'student_university_application_documents'
          and table_grant.grantee in (
            'PUBLIC',
            'anon',
            'authenticated'
          )
      )
      and not exists (
        select 1
        from information_schema.column_privileges as column_grant
        where column_grant.table_schema = 'public'
          and column_grant.table_name =
            'student_university_application_documents'
          and column_grant.grantee in (
            'PUBLIC',
            'anon',
            'authenticated'
          )
      )
    ),
    (
      'E1.3.3 document enum usage is authenticated only',
      pg_catalog.has_type_privilege(
        'authenticated',
        'public.university_application_document_status',
        'USAGE'
      )
      and not pg_catalog.has_type_privilege(
        'anon',
        'public.university_application_document_status',
        'USAGE'
      )
      and not exists (
        select 1
        from pg_catalog.pg_type as type_record
        cross join lateral pg_catalog.aclexplode(
          coalesce(
            type_record.typacl,
            pg_catalog.acldefault('T', type_record.typowner)
          )
        ) as access_entry
        where type_record.oid = pg_catalog.to_regtype(
          'public.university_application_document_status'
        )
          and access_entry.grantee = 0
          and access_entry.privilege_type = 'USAGE'
      )
    ),
    (
      'E1.3.3 document RPC signatures and relational returns exist',
      not exists (
        select 1
        from document_functions as expected_function
        where pg_catalog.to_regprocedure(
          expected_function.signature
        ) is null
      )
      and (
        select pg_catalog.count(*) = 7
        from pg_catalog.pg_proc as function_record
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = function_record.pronamespace
        where namespace.nspname = 'public'
          and function_record.proname in (
            'prepare_university_application_document_upload',
            'finalize_university_application_document_upload',
            'list_university_application_documents',
            'authorize_university_application_document_view',
            'soft_remove_university_application_document',
            'can_upload_university_application_document_object',
            'can_view_university_application_document_object'
          )
      )
      and pg_catalog.pg_get_function_result(
        pg_catalog.to_regprocedure(
          'public.prepare_university_application_document_upload(uuid,text,text,text,bigint)'
        )
      ) =
        'TABLE(document_id uuid, application_id uuid, bucket_id text, storage_path text, document_title text, original_file_name text, mime_type text, file_size_bytes bigint, upload_expires_at timestamp with time zone)'
      and pg_catalog.pg_get_function_result(
        pg_catalog.to_regprocedure(
          'public.finalize_university_application_document_upload(uuid)'
        )
      ) =
        'TABLE(document_id uuid, application_id uuid, document_title text, original_file_name text, mime_type text, file_size_bytes bigint, status university_application_document_status, available_at timestamp with time zone)'
      and pg_catalog.pg_get_function_result(
        pg_catalog.to_regprocedure(
          'public.list_university_application_documents(uuid)'
        )
      ) =
        'TABLE(document_id uuid, application_id uuid, document_title text, original_file_name text, mime_type text, file_size_bytes bigint, available_at timestamp with time zone)'
      and pg_catalog.pg_get_function_result(
        pg_catalog.to_regprocedure(
          'public.authorize_university_application_document_view(uuid,uuid)'
        )
      ) =
        'TABLE(document_id uuid, application_id uuid, bucket_id text, storage_path text)'
      and pg_catalog.pg_get_function_result(
        pg_catalog.to_regprocedure(
          'public.soft_remove_university_application_document(uuid,text)'
        )
      ) =
        'TABLE(document_id uuid, application_id uuid, status university_application_document_status, removed_at timestamp with time zone)'
      and pg_catalog.pg_get_function_result(
        pg_catalog.to_regprocedure(
          'public.can_upload_university_application_document_object(text,text)'
        )
      ) = 'boolean'
      and pg_catalog.pg_get_function_result(
        pg_catalog.to_regprocedure(
          'public.can_view_university_application_document_object(text,text)'
        )
      ) = 'boolean'
    ),
    (
      'E1.3.3 document RPC argument names and types are exact',
      pg_catalog.pg_get_function_arguments(
        pg_catalog.to_regprocedure(
          'public.prepare_university_application_document_upload(uuid,text,text,text,bigint)'
        )
      ) =
        'p_application_id uuid, p_document_title text, p_original_file_name text, p_mime_type text, p_file_size_bytes bigint'
      and pg_catalog.pg_get_function_arguments(
        pg_catalog.to_regprocedure(
          'public.finalize_university_application_document_upload(uuid)'
        )
      ) = 'p_document_id uuid'
      and pg_catalog.pg_get_function_arguments(
        pg_catalog.to_regprocedure(
          'public.list_university_application_documents(uuid)'
        )
      ) = 'p_application_id uuid'
      and pg_catalog.pg_get_function_arguments(
        pg_catalog.to_regprocedure(
          'public.authorize_university_application_document_view(uuid,uuid)'
        )
      ) = 'p_application_id uuid, p_document_id uuid'
      and pg_catalog.pg_get_function_arguments(
        pg_catalog.to_regprocedure(
          'public.soft_remove_university_application_document(uuid,text)'
        )
      ) = 'p_document_id uuid, p_removal_reason text'
      and pg_catalog.pg_get_function_arguments(
        pg_catalog.to_regprocedure(
          'public.can_upload_university_application_document_object(text,text)'
        )
      ) = 'p_bucket_id text, p_storage_path text'
      and pg_catalog.pg_get_function_arguments(
        pg_catalog.to_regprocedure(
          'public.can_view_university_application_document_object(text,text)'
        )
      ) = 'p_bucket_id text, p_storage_path text'
    ),
    (
      'E1.3.3 document functions are trusted SECURITY DEFINER with empty search path',
      (
        select pg_catalog.count(*) = 7
        from document_functions as expected_function
        inner join pg_catalog.pg_proc as function_record
          on function_record.oid = pg_catalog.to_regprocedure(
            expected_function.signature
          )
        inner join pg_catalog.pg_roles as owner_role
          on owner_role.oid = function_record.proowner
        where function_record.prosecdef
          and function_record.proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_role.rolname = 'postgres'
      )
    ),
    (
      'E1.3.3 document function execution is authenticated only',
      (
        select pg_catalog.count(*) = 7
        from document_functions as expected_function
        inner join pg_catalog.pg_proc as function_record
          on function_record.oid = pg_catalog.to_regprocedure(
            expected_function.signature
          )
        where pg_catalog.has_function_privilege(
            'authenticated',
            function_record.oid,
            'EXECUTE'
          )
          and not pg_catalog.has_function_privilege(
            'anon',
            function_record.oid,
            'EXECUTE'
          )
          and not exists (
            select 1
            from pg_catalog.aclexplode(
              coalesce(
                function_record.proacl,
                pg_catalog.acldefault('f', function_record.proowner)
              )
            ) as access_entry
            where access_entry.grantee = 0
              and access_entry.privilege_type = 'EXECUTE'
          )
      )
    ),
    (
      'E1.3.3 prepare derives identity path expiry and bounded application lock',
      (
        select
          prepare_definition like '%auth.uid()%'
          and prepare_definition like
            '%has_active_verified_kgeo_role%counselor%'
          and prepare_definition like
            '%student_university_applications%'
          and prepare_definition like '%role = ''student''%'
          and prepare_definition like '%is_archived%'
          and prepare_definition like '%gen_random_uuid()%'
          and prepare_definition like '%applications/%'
          and prepare_definition like '%10485760%'
          and prepare_definition like '%limit 21%'
          and prepare_definition like '%active_document_count >= 20%'
          and prepare_definition like '%202608010001%'
          and prepare_definition like
            '%prepared_time + interval ''2 hours''%'
          and prepare_definition like
            '%p_original_file_name <> normalized_file_name%'
          and prepare_definition like
            '%strpos(normalized_file_name, ''..'') > 0%'
          and prepare_definition like
            '%normalized_file_name !~ ''^[^.]+\.[^.]+$''%'
          and pg_catalog.strpos(
            prepare_definition,
            'pg_try_advisory_xact_lock'
          ) > 0
          and pg_catalog.strpos(
            prepare_definition,
            'pg_try_advisory_xact_lock'
          ) < pg_catalog.strpos(
            prepare_definition,
            'select pg_catalog.count(*)'
          )
          and prepare_definition not like '%p_student_id%'
          and prepare_definition not like '%p_counselor_id%'
          and prepare_definition not like '%p_storage_path%'
        from document_function_definitions
      )
    ),
    (
      'E1.3.3 finalize is uploader-bound unexpired object-existence transition',
      (
        select
          finalize_definition like '%FOR UPDATE%'
          and finalize_definition like '%uploaded_by <> caller_id%'
          and finalize_definition like '%status <>%pending%'
          and finalize_definition like '%is_archived%'
          and finalize_definition like
            '%upload_expires_at <= finalized_time%'
          and finalize_definition like '%storage.objects%'
          and finalize_definition like
            '%bucket_id = document_record.bucket_id%'
          and finalize_definition like
            '%name = document_record.storage_path%'
          and finalize_definition like '%status = ''available''%'
          and pg_catalog.lower(finalize_definition) not like
            '%insert into storage.objects%'
          and pg_catalog.lower(finalize_definition) not like
            '%update storage.objects%'
          and pg_catalog.lower(finalize_definition) not like
            '%delete from storage.objects%'
        from document_function_definitions
      )
    ),
    (
      'E1.3.3 list and view are application-bound available-only and bounded',
      (
        select
          list_definition like '%application_id = p_application_id%'
          and list_definition like '%status =%available%'
          and list_definition like '%available_at DESC%id DESC%'
          and list_definition like '%LIMIT 20%'
          and list_definition not like '%uploaded_by%'
          and list_definition not like '%storage_path%'
          and view_definition like '%application_id = p_application_id%'
          and view_definition like '%id = p_document_id%'
          and view_definition like '%status =%available%'
          and view_definition not like '%signed_url%'
          and pg_catalog.obj_description(
            pg_catalog.to_regprocedure(
              'public.authorize_university_application_document_view(uuid,uuid)'
            ),
            'pg_proc'
          ) like '%five-minute signed URL%'
        from document_function_definitions
      )
    ),
    (
      'E1.3.3 removal is archived-safe final audited soft retention',
      (
        select
          remove_definition like '%FOR UPDATE%'
          and remove_definition like '%status <>%available%'
          and remove_definition like '%is_archived%'
          and remove_definition like '%status = ''removed''%'
          and remove_definition like '%removed_at = removal_time%'
          and remove_definition like '%removed_by = caller_id%'
          and remove_definition like
            '%removal_reason = normalized_removal_reason%'
          and pg_catalog.lower(remove_definition) not like '%delete from%'
          and remove_definition not like '%storage.objects%'
        from document_function_definitions
      )
    ),
    (
      'E1.3.3 Storage helpers bind pending upload and available viewing',
      (
        select
          storage_upload_definition like '%auth.uid()%'
          and storage_upload_definition like
            '%is_active_primary_counselor_for_student%'
          and storage_upload_definition like '%is_archived IS FALSE%'
          and storage_upload_definition like '%role = ''student''%'
          and storage_upload_definition like '%status =%pending%'
          and storage_upload_definition like '%uploaded_by%auth.uid()%'
          and storage_upload_definition like
            '%upload_expires_at%statement_timestamp()%'
          and storage_upload_definition like
            '%p_bucket_id = ''university-application-documents''%'
          and storage_upload_definition like
            '%EXCEPTION%WHEN OTHERS%RETURN false%'
          and storage_view_definition like
            '%has_active_verified_kgeo_role%counselor%'
          and storage_view_definition like '%role = ''student''%'
          and storage_view_definition like '%status =%available%'
          and storage_view_definition not like '%is_archived IS FALSE%'
          and storage_view_definition like
            '%p_bucket_id = ''university-application-documents''%'
          and storage_view_definition like
            '%EXCEPTION%WHEN OTHERS%RETURN false%'
        from document_function_definitions
      )
    ),
    (
      'E1.3.3 Storage policies are exact INSERT and SELECT helper contracts',
      (
        select pg_catalog.count(*) = 2
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'storage'
          and policy_record.tablename = 'objects'
          and policy_record.policyname in (
            'university_application_document_object_insert_counselor',
            'university_application_document_object_select_counselor'
          )
          and policy_record.roles = array['authenticated']::name[]
          and policy_record.cmd in ('INSERT', 'SELECT')
      )
      and coalesce((
        select policy_record.with_check like
          '%can_upload_university_application_document_object%bucket_id%name%'
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'storage'
          and policy_record.tablename = 'objects'
          and policy_record.policyname =
            'university_application_document_object_insert_counselor'
      ), false)
      and coalesce((
        select policy_record.qual like
          '%can_view_university_application_document_object%bucket_id%name%'
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'storage'
          and policy_record.tablename = 'objects'
          and policy_record.policyname =
            'university_application_document_object_select_counselor'
      ), false)
      and (
        select pg_catalog.count(*) = 2
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'storage'
          and policy_record.tablename = 'objects'
          and (
            policy_record.policyname like
              'university_application_document_object_%'
            or coalesce(policy_record.qual, '') like
              '%university-application-documents%'
            or coalesce(policy_record.with_check, '') like
              '%university-application-documents%'
          )
      )
      and not exists (
        select 1
        from pg_catalog.pg_policies as policy_record
        where policy_record.schemaname = 'storage'
          and policy_record.tablename = 'objects'
          and (
            policy_record.policyname like
              'university_application_document_object_%'
            or coalesce(policy_record.qual, '') like
              '%university-application-documents%'
            or coalesce(policy_record.with_check, '') like
              '%university-application-documents%'
          )
          and (
            policy_record.cmd in ('UPDATE', 'DELETE', 'ALL')
            or policy_record.roles && array['public', 'anon']::name[]
          )
      )
    ),
    (
      'E1.3.3 private bucket has exact size and MIME configuration',
      coalesce((
        select
          not bucket.public
          and bucket.file_size_limit = 10485760
          and (
            select pg_catalog.array_agg(mime_type order by mime_type)
            from pg_catalog.unnest(
              bucket.allowed_mime_types
            ) as mime_type
          ) = array[
            'application/pdf',
            'image/jpeg',
            'image/png',
            'image/webp'
          ]::text[]
        from storage.buckets as bucket
        where bucket.id = 'university-application-documents'
      ), false)
    ),
    (
      'E1.3.3 document functions do not mutate applications events progression or Storage',
      (
        select
          pg_catalog.lower(
            prepare_definition || finalize_definition || list_definition ||
            view_definition || remove_definition ||
            storage_upload_definition || storage_view_definition
          ) not like '%update public.student_university_applications%'
          and pg_catalog.lower(
            prepare_definition || finalize_definition || list_definition ||
            view_definition || remove_definition ||
            storage_upload_definition || storage_view_definition
          ) not like '%insert into public.student_university_application_events%'
          and pg_catalog.lower(
            prepare_definition || finalize_definition || list_definition ||
            view_definition || remove_definition ||
            storage_upload_definition || storage_view_definition
          ) not like '%student_counseling_progression%'
          and pg_catalog.lower(
            prepare_definition || finalize_definition || list_definition ||
            view_definition || remove_definition ||
            storage_upload_definition || storage_view_definition
          ) not like '%delete from storage.objects%'
          and pg_catalog.lower(
            prepare_definition || finalize_definition || list_definition ||
            view_definition || remove_definition ||
            storage_upload_definition || storage_view_definition
          ) not like '%service_role%'
          and pg_catalog.lower(
            prepare_definition || finalize_definition || list_definition ||
            view_definition || remove_definition ||
            storage_upload_definition || storage_view_definition
          ) not like '%getpublicurl%'
        from document_function_definitions
      )
    )
)
select
  'E1.3.3_check'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

-- Zero-required E1.3.3 drift. Grouping keys remain inside bounded aggregate
-- subqueries; only stable labels and counts are returned.
select
  'drift_count'::text as category,
  count_name as object_name,
  row_count
from (
  select
    'invalid university application document lifecycle rows'::text
      as count_name,
    pg_catalog.count(*)::bigint as row_count
  from public.student_university_application_documents as document
  where not (
    (
      document.status =
        'pending'::public.university_application_document_status
      and document.available_at is null
      and document.removed_at is null
      and document.removed_by is null
      and document.removal_reason is null
    )
    or (
      document.status =
        'available'::public.university_application_document_status
      and document.available_at is not null
      and document.removed_at is null
      and document.removed_by is null
      and document.removal_reason is null
    )
    or (
      document.status =
        'removed'::public.university_application_document_status
      and document.available_at is not null
      and document.removed_at is not null
      and document.removed_by is not null
      and document.removal_reason is not null
    )
  )

  union all

  select
    'available university application documents missing available_at',
    pg_catalog.count(*)::bigint
  from public.student_university_application_documents as document
  where document.status =
      'available'::public.university_application_document_status
    and document.available_at is null

  union all

  select
    'removed university application documents missing removal audit',
    pg_catalog.count(*)::bigint
  from public.student_university_application_documents as document
  where document.status =
      'removed'::public.university_application_document_status
    and (
      document.removed_at is null
      or document.removed_by is null
      or document.removal_reason is null
    )

  union all

  select
    'applications with more than 20 active university application documents',
    pg_catalog.count(*)::bigint
  from (
    select document.application_id
    from public.student_university_application_documents as document
    where document.status =
        'available'::public.university_application_document_status
      or (
        document.status =
          'pending'::public.university_application_document_status
        and document.upload_expires_at >
          pg_catalog.statement_timestamp()
      )
    group by document.application_id
    having pg_catalog.count(*) > 20
  ) as applications_over_document_limit

  union all

  select
    'duplicate university application document storage paths',
    pg_catalog.count(*)::bigint
  from (
    select document.storage_path
    from public.student_university_application_documents as document
    group by document.storage_path
    having pg_catalog.count(*) > 1
  ) as duplicate_document_paths

  union all

  select
    'orphan university application document application references',
    pg_catalog.count(*)::bigint
  from public.student_university_application_documents as document
  left join public.student_university_applications as application
    on application.id = document.application_id
  where application.id is null

  union all

  select
    'available university application documents missing Storage object',
    pg_catalog.count(*)::bigint
  from public.student_university_application_documents as document
  where document.status =
      'available'::public.university_application_document_status
    and not exists (
      select 1
      from storage.objects as storage_object
      where storage_object.bucket_id = document.bucket_id
        and storage_object.name = document.storage_path
    )
) as E1_3_3_drift
order by count_name;

-- Informational E1.3.3 Storage lifecycle counts. These may be nonzero during
-- normal upload, expiry, and soft-retention workflows and require review, not
-- automatic repair.
select
  'informational_count'::text as category,
  count_name as object_name,
  row_count
from (
  select
    'expired pending university application documents'::text as count_name,
    pg_catalog.count(*)::bigint as row_count
  from public.student_university_application_documents as document
  where document.status =
      'pending'::public.university_application_document_status
    and document.upload_expires_at <= pg_catalog.statement_timestamp()

  union all

  select
    'pending university application documents with Storage object',
    pg_catalog.count(*)::bigint
  from public.student_university_application_documents as document
  where document.status =
      'pending'::public.university_application_document_status
    and exists (
      select 1
      from storage.objects as storage_object
      where storage_object.bucket_id = document.bucket_id
        and storage_object.name = document.storage_path
    )

  union all

  select
    'removed university application documents retaining Storage object',
    pg_catalog.count(*)::bigint
  from public.student_university_application_documents as document
  where document.status =
      'removed'::public.university_application_document_status
    and exists (
      select 1
      from storage.objects as storage_object
      where storage_object.bucket_id = document.bucket_id
        and storage_object.name = document.storage_path
    )
) as E1_3_3_information
order by count_name;

-- Phase E1.4.1 counselor applications workspace read foundation.
with expected_return_columns(
  function_name,
  column_position,
  column_name,
  udt_name
) as (
  values
    ('list_counselor_university_application_workspace', 1, 'application_id', 'uuid'),
    ('list_counselor_university_application_workspace', 2, 'student_id', 'uuid'),
    ('list_counselor_university_application_workspace', 3, 'student_full_name', 'text'),
    ('list_counselor_university_application_workspace', 4, 'college_email', 'text'),
    ('list_counselor_university_application_workspace', 5, 'roll_number', 'text'),
    ('list_counselor_university_application_workspace', 6, 'university_name', 'text'),
    ('list_counselor_university_application_workspace', 7, 'programme_name', 'text'),
    ('list_counselor_university_application_workspace', 8, 'country_code', 'text'),
    ('list_counselor_university_application_workspace', 9, 'degree_level', 'university_application_degree_level'),
    ('list_counselor_university_application_workspace', 10, 'intake_term', 'university_application_intake_term'),
    ('list_counselor_university_application_workspace', 11, 'intake_year', 'int4'),
    ('list_counselor_university_application_workspace', 12, 'current_status', 'university_application_status'),
    ('list_counselor_university_application_workspace', 13, 'application_reference', 'text'),
    ('list_counselor_university_application_workspace', 14, 'submission_deadline', 'date'),
    ('list_counselor_university_application_workspace', 15, 'submitted_at', 'timestamptz'),
    ('list_counselor_university_application_workspace', 16, 'is_primary', 'bool'),
    ('list_counselor_university_application_workspace', 17, 'is_archived', 'bool'),
    ('list_counselor_university_application_workspace', 18, 'last_changed_at', 'timestamptz'),
    ('list_counselor_university_application_workspace', 19, 'available_document_count', 'int8'),
    ('list_counselor_university_application_workspace', 20, 'total_count', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 1, 'total_active_applications', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 2, 'total_archived_applications', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 3, 'students_with_applications', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 4, 'primary_applications', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 5, 'planning_count', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 6, 'documents_collecting_count', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 7, 'application_preparing_count', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 8, 'ready_to_submit_count', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 9, 'submitted_count', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 10, 'under_university_review_count', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 11, 'additional_information_requested_count', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 12, 'decision_received_count', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 13, 'withdrawn_count', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 14, 'closed_count', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 15, 'overdue_deadline_count', 'int8'),
    ('get_counselor_university_application_workspace_metrics', 16, 'due_next_30_days_count', 'int8')
),
target_functions(function_name, function_oid) as (
  values
    (
      'list_counselor_university_application_workspace',
      pg_catalog.to_regprocedure(
        'public.list_counselor_university_application_workspace(text,text,text,text,text,integer,text,text,text,text,integer,integer)'
      )::oid
    ),
    (
      'get_counselor_university_application_workspace_metrics',
      pg_catalog.to_regprocedure(
        'public.get_counselor_university_application_workspace_metrics()'
      )::oid
    )
),
actual_return_columns as (
  select
    target.function_name,
    pg_catalog.row_number() over (
      partition by target.function_name
      order by parameter.ordinal_position
    )::integer as column_position,
    parameter.parameter_name as column_name,
    parameter.udt_name
  from target_functions as target
  inner join information_schema.parameters as parameter
    on parameter.specific_schema = 'public'
    and parameter.specific_name =
      target.function_name || '_' || target.function_oid::text
    and parameter.parameter_mode = 'OUT'
)
select
  'function_return_column'::text as category,
  'E1.4.1:' || expected.function_name || ':' ||
    expected.column_position::text || ':' || expected.column_name as object_name,
  (
    actual.column_name = expected.column_name
    and actual.udt_name = expected.udt_name
  ) as passed
from expected_return_columns as expected
left join actual_return_columns as actual
  on actual.function_name = expected.function_name
  and actual.column_position = expected.column_position
order by expected.function_name, expected.column_position;

with workspace_functions as (
  select
    function_record.oid as function_oid,
    function_record.proname as function_name,
    function_record.prosecdef,
    function_record.provolatile,
    function_record.proretset,
    function_record.proconfig,
    function_record.proacl,
    function_record.proowner,
    owner_role.rolname as owner_name,
    pg_catalog.pg_get_function_identity_arguments(function_record.oid)
      as identity_arguments,
    pg_catalog.lower(
      pg_catalog.pg_get_functiondef(function_record.oid)
    ) as definition
  from pg_catalog.pg_proc as function_record
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = function_record.pronamespace
  inner join pg_catalog.pg_roles as owner_role
    on owner_role.oid = function_record.proowner
  where namespace.nspname = 'public'
    and function_record.proname in (
      'list_counselor_university_application_workspace',
      'get_counselor_university_application_workspace_metrics'
    )
),
list_function as (
  select *
  from workspace_functions
  where function_name =
    'list_counselor_university_application_workspace'
),
metrics_function as (
  select *
  from workspace_functions
  where function_name =
    'get_counselor_university_application_workspace_metrics'
),
checks(check_name, passed) as (
  values
    (
      'E1.4.1 workspace RPC signatures have no overloads',
      (select pg_catalog.count(*) = 2 from workspace_functions)
      and (select pg_catalog.count(*) = 1 from list_function)
      and (select pg_catalog.count(*) = 1 from metrics_function)
      and pg_catalog.to_regprocedure(
        'public.list_counselor_university_application_workspace(text,text,text,text,text,integer,text,text,text,text,integer,integer)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'public.get_counselor_university_application_workspace_metrics()'
      ) is not null
    ),
    (
      'E1.4.1 workspace list RPC has exact arguments',
      coalesce(
        (
          select identity_arguments =
            'p_search text, p_status text, p_country_code text, p_degree_level text, p_intake_term text, p_intake_year integer, p_primary_filter text, p_archive_filter text, p_deadline_filter text, p_sort text, p_page integer, p_page_size integer'
          from list_function
        ),
        false
      )
    ),
    (
      'E1.4.1 workspace metrics RPC has zero arguments',
      coalesce(
        (
          select identity_arguments = ''
          from metrics_function
        ),
        false
      )
    ),
    (
      'E1.4.1 workspace RPCs have exact return-column counts',
      coalesce(
        (
          select pg_catalog.count(*) = 20
          from information_schema.parameters as parameter
          cross join list_function as target
          where parameter.specific_schema = 'public'
            and parameter.specific_name =
              target.function_name || '_' || target.function_oid::text
            and parameter.parameter_mode = 'OUT'
        ),
        false
      )
      and coalesce(
        (
          select pg_catalog.count(*) = 16
          from information_schema.parameters as parameter
          cross join metrics_function as target
          where parameter.specific_schema = 'public'
            and parameter.specific_name =
              target.function_name || '_' || target.function_oid::text
            and parameter.parameter_mode = 'OUT'
        ),
        false
      )
    ),
    (
      'E1.4.1 workspace RPCs are trusted stable SECURITY DEFINER',
      (
        select
          pg_catalog.count(*) = 2
          and pg_catalog.bool_and(
            prosecdef
            and provolatile = 's'
            and proretset
            and owner_name = 'postgres'
            and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          )
        from workspace_functions
      )
    ),
    (
      'E1.4.1 workspace RPC execution is authenticated only',
      (
        select
          pg_catalog.count(*) = 2
          and pg_catalog.bool_and(
            pg_catalog.has_function_privilege(
              'authenticated',
              function_oid,
              'EXECUTE'
            )
            and not pg_catalog.has_function_privilege(
              'anon',
              function_oid,
              'EXECUTE'
            )
            and not exists (
              select 1
              from pg_catalog.aclexplode(
                coalesce(
                  proacl,
                  pg_catalog.acldefault('f', proowner)
                )
              ) as function_acl
              where function_acl.grantee = 0
                and function_acl.privilege_type = 'EXECUTE'
            )
          )
        from workspace_functions
      )
    ),
    (
      'E1.4.1 workspace RPCs derive active verified counselor authorization',
      (
        select
          pg_catalog.count(*) = 2
          and pg_catalog.bool_and(
            definition like '%auth.uid()%'
            and definition like
              '%has_active_verified_kgeo_role%counselor%'
            and definition not like '%p_counselor_id%'
            and definition not like '%raw_user_meta_data%'
          )
        from workspace_functions
      )
    ),
    (
      'E1.4.1 workspace list RPC searches only approved identity fields',
      coalesce(
        (
          select
            definition like '%char_length(normalized_search) > 100%'
            and definition like '%p_search ~ ''[[:cntrl:]]''%'
            and definition like '%generate_series(128, 159)%'
            and definition like '%160, 173, 847, 1564, 5760, 6158%'
            and definition like '%8303, 12288, 65279%'
            and definition like '%regexp_replace%'' +''%'
            and definition like '%strpos%workspace_student_full_name%'
            and definition like '%strpos%workspace_college_email%'
            and definition like '%strpos%workspace_roll_number%'
            and definition like '%strpos%workspace_university_name%'
            and definition like '%strpos%workspace_programme_name%'
            and definition like '%strpos%workspace_application_reference%'
            and definition not like '%personal_email%'
            and definition not like '%mobile_number%'
            and definition not like '%portal_url%'
            and definition not like '%original_file_name%'
            and definition not like '%storage_path%'
            and definition not like '%normalized_search ~~%'
            and definition not like '%normalized_search ~ %'
          from list_function
        ),
        false
      )
    ),
    (
      'E1.4.1 workspace list RPC validates filters and bounded pagination',
      coalesce(
        (
          select
            definition like '%p_intake_year not between 2020 and 2100%'
            and definition like '%p_page not between 1 and 100000%'
            and definition like '%p_page_size not between 1 and 25%'
            and definition like
              '%p_archive_filter text default ''active''%'
            and definition like '%normalized_archive_filter%active%archived%'
            and definition like '%normalized_deadline_filter%overdue%due_30_days%no_deadline%'
            and definition like '%normalized_primary_filter%primary%non_primary%'
          from list_function
        ),
        false
      )
    ),
    (
      'E1.4.1 workspace list RPC uses exact lifecycle and academic allowlists',
      coalesce(
        (
          select
            definition like
              '%planning%documents_collecting%application_preparing%ready_to_submit%submitted%under_university_review%additional_information_requested%decision_received%withdrawn%closed%'
            and definition like
              '%bachelors%masters%postgraduate_diploma%doctorate%other%'
            and definition like
              '%spring%summer%fall%winter%rolling%other%'
          from list_function
        ),
        false
      )
    ),
    (
      'E1.4.1 workspace list RPC uses deterministic static ordering',
      coalesce(
        (
          select
            definition like '%last_changed_desc%'
            and definition like '%deadline_asc%'
            and definition like '%deadline_desc%'
            and definition like '%student_name_asc%'
            and definition like '%university_name_asc%'
            and definition like '%intake_year_desc%'
            and definition like '%workspace_application_id end desc%'
            and definition like '%workspace_application_id end asc%'
            and definition like '%collate pg_catalog."c"%'
            and definition not like '%execute format%'
          from list_function
        ),
        false
      )
    ),
    (
      'E1.4.1 workspace list RPC returns sentinel count and available documents only',
      coalesce(
        (
          select
            definition like '%status = ''available''%'
            and definition like '%left join page_rows%'
            and definition like '%filtered_total.filtered_count%'
            and definition like '%limit p_page_size%'
            and definition like '%offset page_offset%'
          from list_function
        ),
        false
      )
    ),
    (
      'E1.4.1 workspace metrics RPC is aggregate only and Asia Kolkata based',
      coalesce(
        (
          select
            definition like '%at time zone ''asia/kolkata''%'
            and definition like
              '%count(distinct application.student_id) filter%is_archived is false%'
            and definition like '%submission_deadline < business_date%'
            and definition like
              '%submission_deadline between%business_date and business_date + 30%'
            and definition like '%is_archived is false%'
          from metrics_function
        ),
        false
      )
    ),
    (
      'E1.4.1 workspace RPCs do not mutate application data',
      (
        select
          pg_catalog.count(*) = 2
          and pg_catalog.bool_and(
            definition not like '%insert into%'
            and definition not like '%update public.%'
            and definition not like '%delete from%'
            and definition not like '%merge into%'
            and definition not like
              '%student_university_application_events%'
            and definition not like
              '%student_counseling_progression%'
            and definition not like '%storage.objects%'
          )
        from workspace_functions
      )
    )
)
select
  'E1.4.1_check'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

-- Aggregate-only E1.4.1 required-zero diagnostics. No application, student,
-- counselor, document, or profile value is returned.
select
  'required_zero_count'::text as category,
  count_name as object_name,
  row_count
from (
  select
    'active primary applications without a student-role owner'::text
      as count_name,
    pg_catalog.count(*)::bigint as row_count
  from public.student_university_applications as application
  left join public.profiles as student_account
    on student_account.id = application.student_id
    and student_account.role = 'student'::public.user_role
  where application.is_archived is false
    and application.is_primary is true
    and student_account.id is null

  union all

  select
    'workspace applications missing an owning profile',
    pg_catalog.count(*)::bigint
  from public.student_university_applications as application
  left join public.profiles as student_account
    on student_account.id = application.student_id
  where student_account.id is null

  union all

  select
    'university applications with more than 20 available documents',
    pg_catalog.count(*)::bigint
  from (
    select document.application_id
    from public.student_university_application_documents as document
    where document.status =
      'available'::public.university_application_document_status
    group by document.application_id
    having pg_catalog.count(*) > 20
  ) as applications_over_available_document_limit

  union all

  select
    'nonarchived university applications with invalid country codes',
    pg_catalog.count(*)::bigint
  from public.student_university_applications as application
  where application.is_archived is false
    and application.country_code !~ '^[A-Z]{2}$'
) as E1_4_1_drift
order by count_name;

-- Phase A1.1 director dashboard read foundation.
with director_functions as (
  select
    procedure.oid,
    procedure.proname,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) as identity_arguments,
    pg_catalog.pg_get_function_arguments(procedure.oid) as arguments,
    pg_catalog.pg_get_function_result(procedure.oid) as result_type,
    procedure.prorettype,
    procedure.proretset,
    pg_catalog.regexp_replace(pg_catalog.btrim(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))), '\s+', ' ', 'g') as definition,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig,
    owner.rolname as owner_name
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname in (
      'get_director_dashboard_metrics',
      'list_director_counselor_workload',
      'list_director_attention_items'
    )
),
checks as (
  select *
  from (
    values
      (
        'A1.1 director RPC signatures have no overloads',
        (select pg_catalog.count(*) = 3 from director_functions)
      ),
      (
        'A1.1 director metrics RPC has exact signature and returns',
        coalesce((
          select
            identity_arguments = ''
            and arguments = ''
            and result_type = 'TABLE(total_students bigint, active_students bigint, active_counselors bigint, consultations_today bigint, upcoming_scheduled_consultations bigint, unresolved_past_consultations bigint, completed_consultations bigint, no_show_consultations bigint, pending_follow_ups bigint, overdue_follow_ups bigint, due_today_follow_ups bigint, active_progressions bigint, on_hold_progressions bigint, completed_progressions bigint, active_applications bigint, submitted_applications bigint, additional_information_requested_applications bigint, overdue_application_deadlines bigint)'
          from director_functions
          where proname = 'get_director_dashboard_metrics'
        ), false)
      ),
      (
        'A1.1 director workload RPC has exact signature and returns',
        coalesce((
          select
            identity_arguments = 'p_limit integer'
            and arguments = 'p_limit integer DEFAULT 20'
            and result_type = 'TABLE(counselor_id uuid, counselor_full_name text, college_email text, is_active boolean, overdue_follow_ups bigint, pending_follow_ups bigint, pending_outcomes bigint, consultations_today bigint)'
          from director_functions
          where proname = 'list_director_counselor_workload'
        ), false)
      ),
      (
        'A1.1 director attention RPC has exact signature and returns',
        coalesce((
          select
            identity_arguments = 'p_limit integer'
            and arguments = 'p_limit integer DEFAULT 25'
            and result_type = 'TABLE(attention_kind text, severity text, student_id uuid, student_full_name text, college_email text, application_id uuid, consultation_id uuid, application_status university_application_status, submission_deadline date, consultation_scheduled_at timestamp without time zone)'
          from director_functions
          where proname = 'list_director_attention_items'
        ), false)
      ),
      (
        'A1.1 director RPCs are trusted stable SECURITY DEFINER',
        coalesce((
          select pg_catalog.bool_and(
            prosecdef
            and provolatile = 's'
            and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
            and owner_name = 'postgres'
          ) and pg_catalog.count(*) = 3
          from director_functions
        ), false)
      ),
      (
        'A1.1 director RPC execution is authenticated only',
        coalesce((
          select pg_catalog.bool_and(
            not pg_catalog.has_function_privilege('public', oid, 'EXECUTE')
            and not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
            and pg_catalog.has_function_privilege('authenticated', oid, 'EXECUTE')
          ) and pg_catalog.count(*) = 3
          from director_functions
        ), false)
      ),
      (
        'A1.1 director RPCs derive exact active verified director authorization',
        coalesce((
          select pg_catalog.bool_and(
            definition like '%caller_id := (select auth.uid())%'
            and definition like '%has_active_verified_kgeo_role(%'
            and definition like '%''director''::public.user_role%'
            and definition not like '%''admin''::public.user_role%'
            and definition not like '%''counselor''::public.user_role%'
            and definition not like
            '%caller_id%''student''::public.user_role%'
          ) and pg_catalog.count(*) = 3
          from director_functions
        ), false)
      ),
      (
        'A1.1 director RPCs use bounded generic errors',
        coalesce((
          select pg_catalog.bool_and(
            definition like '%director dashboard data is temporarily unavailable.%'
            and definition like '%when insufficient_privilege%'
            and definition like '%when others%'
          ) and pg_catalog.count(*) = 3
          from director_functions
        ), false)
      ),
      (
        'A1.1 director list RPCs validate exact bounded one-page limits',
        coalesce((
          select pg_catalog.bool_and(
            definition like '%p_limit not between 1 and 50%'
            and definition not like '%p_page%'
            and definition not like '%offset %'
            and definition not like '%total_count%'
          ) and pg_catalog.count(*) = 2
          from director_functions
          where proname like 'list_director_%'
        ), false)
      ),
      (
        'A1.1 attention uses exact kinds severities relationships and no follow-up rows',
        coalesce((
          select
            definition like '%''overdue_application_deadline''::text%'
            and definition like '%''due_soon_application_deadline''::text%'
            and definition like '%''additional_information_requested''::text%'
            and definition like '%''pending_consultation_outcome''::text%'
            and definition like '%''high''::text%'
            and definition like '%''medium''::text%'
            and definition not like '%counselor_follow_ups%'
            and definition not like '%follow_up_id%'
            and definition not like '%overdue_follow_up%'
          from director_functions
          where proname = 'list_director_attention_items'
        ), false)
      ),
      (
        'A1.1 workload uses grouped aggregates and exact deterministic ordering',
        coalesce((
          select
            definition like '%group by follow_up.counselor_id%'
            and definition like '%group by request.assigned_counselor_id%'
            and definition like '%overdue_count, 0::bigint) desc%'
            and definition like '%pending_outcome_count, 0::bigint) desc%'
            and definition like '%today_count, 0::bigint) desc%'
            and definition like '%full_name collate pg_catalog."c" asc nulls last%'
            and definition like '%counselor.id asc%'
            and definition not like '%student_university_applications%'
            and definition not like '%student_counseling_progressions%'
          from director_functions
          where proname = 'list_director_counselor_workload'
        ), false)
      ),
      (
        'A1.1 director metrics and attention use Asia Kolkata current state',
        coalesce((select
          definition like '%at time zone ''asia/kolkata''%'
          and definition like '%student_counseling_progressions%'
          and definition like '%student_university_applications%'
          and definition not like '%student_counseling_progression_events%'
          and definition not like '%student_university_application_events%'
          from director_functions
          where proname = 'get_director_dashboard_metrics'
        ), false)
        and coalesce((select
          definition like '%at time zone ''asia/kolkata''%'
          and definition like '%consultation_requests%'
          and definition like '%student_university_applications%'
          and definition not like '%student_counseling_progression_events%'
          and definition not like '%student_university_application_events%'
          from director_functions
          where proname = 'list_director_attention_items'
        ), false)
      ),
      (
        'A1.1 director RPCs exclude private notes documents and sensitive fields',
        coalesce((
          select pg_catalog.bool_and(
            definition not like '%counselor_student_notes%'
            and definition not like '%student_university_application_documents%'
            and definition not like '%next_action%'
            and definition not like '%details%'
            and definition not like '%personal_email%'
            and definition not like '%mobile_number%'
            and definition not like '%original_file_name%'
            and definition not like '%storage_path%'
            and definition not like '%change_reason%'
            and definition not like '%archive_reason%'
          ) and pg_catalog.count(*) = 3
          from director_functions
        ), false)
      ),
      (
        'A1.1 director RPCs contain no dynamic SQL or mutations',
        coalesce((
          select pg_catalog.bool_and(
            definition not like '%execute %'
            and definition not like '%insert into %'
            and definition not like '%update public.%'
            and definition not like '%delete from %'
            and definition not like '%service_role%'
          ) and pg_catalog.count(*) = 3
          from director_functions
        ), false)
      )
  ) as result(check_name, passed)
)
select
  'A1.1_check'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

-- Phase A1.1.2 secure one-time staff identity provisioning.
with identity_provisioning as (
  select
    procedure.oid,
    pg_catalog.regexp_replace(pg_catalog.btrim(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))), '\s+', ' ', 'g') as definition,
    procedure.prosecdef,
    procedure.proconfig,
    owner.rolname as owner_name
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname = 'handle_new_user'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = ''
),
prepare_provisioning as (
  select
    procedure.oid,
    pg_catalog.regexp_replace(pg_catalog.btrim(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))), '\s+', ' ', 'g') as definition,
    pg_catalog.pg_get_function_result(procedure.oid) as result_type,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig,
    owner.rolname as owner_name
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname = 'prepare_staff_identity_provisioning'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
      'p_email text, p_role public.user_role, p_token_hash text, p_expires_at timestamp with time zone'
),
provisioning_table as (
  select
    relation.oid,
    relation.relrowsecurity,
    owner.rolname as owner_name
  from pg_catalog.pg_class as relation
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = relation.relowner
  where namespace.nspname = 'private'
    and relation.relname = 'kgeo_staff_provisioning_requests'
    and relation.relkind = 'r'
),
profile_email_constraint as (
  select pg_catalog.pg_get_constraintdef(constraint_record.oid) as definition
  from pg_catalog.pg_constraint as constraint_record
  inner join pg_catalog.pg_class as relation
    on relation.oid = constraint_record.conrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'profiles'
    and constraint_record.conname = 'profiles_college_email_check'
    and constraint_record.contype = 'c'
),
checks as (
  select *
  from (
    values
      (
        'A1.1.2 profile email constraint remains normalized and role-aware',
        coalesce((
          select
            definition like
              '%college_email = lower(btrim(college_email))%'
            and definition like
              '%char_length(college_email)%254%'
            and definition like
              '%split_part(college_email, ''@''::text, 1)%64%'
            and definition like
              '%role = ''director''::user_role%'
            and definition like
              '%role <> ''director''::user_role%'
            and definition like '%@kct[.]ac[.]in%'
            and definition not like '%kclas%'
          from profile_email_constraint
        ), false)
      ),
      (
        'A1.1.2 Auth trigger retains trusted ownership ACL and binding',
        coalesce((
          select
            prosecdef
            and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
            and owner_name = 'postgres'
            and not pg_catalog.has_function_privilege(
              'public', oid, 'EXECUTE'
            )
            and not pg_catalog.has_function_privilege(
              'anon', oid, 'EXECUTE'
            )
            and not pg_catalog.has_function_privilege(
              'authenticated', oid, 'EXECUTE'
            )
          from identity_provisioning
        ), false)
        and (
          select pg_catalog.count(*) = 1
          from pg_catalog.pg_trigger as trigger_record
          inner join pg_catalog.pg_class as relation
            on relation.oid = trigger_record.tgrelid
          inner join pg_catalog.pg_namespace as namespace
            on namespace.oid = relation.relnamespace
          inner join identity_provisioning
            on identity_provisioning.oid = trigger_record.tgfoid
          where namespace.nspname = 'auth'
            and relation.relname = 'users'
            and trigger_record.tgname = 'on_auth_user_created'
            and not trigger_record.tgisinternal
            and trigger_record.tgenabled = 'O'
        )
      ),
      (
        'A1.1.2 public identity path remains exact KCT student only',
        coalesce((
          select
            definition like '%@kct[.]ac[.]in%'
            and definition like
              '%''student''::public.user_role%'
            and definition like
              '%raw_user_meta_data -> ''full_name''%'
            and definition like
              '%raw_user_meta_data ->> ''full_name''%'
          from identity_provisioning
        ), false)
      ),
      (
        'A1.1.2 private staff request has exact role-bound single-use structure',
        coalesce((
          select
            relation.relrowsecurity
            and relation.owner_name = 'postgres'
            and (
              select pg_catalog.count(*) = 6
              from pg_catalog.pg_attribute as attribute
              where attribute.attrelid = relation.oid
                and attribute.attnum > 0
                and not attribute.attisdropped
            )
            and not exists (
              select 1
              from pg_catalog.pg_attribute as attribute
              where attribute.attrelid = relation.oid
                and attribute.attnum > 0
                and not attribute.attisdropped
                and not (
                  (
                    attribute.attname = 'normalized_email'
                    and pg_catalog.format_type(
                      attribute.atttypid, attribute.atttypmod
                    ) = 'text'
                    and attribute.attnotnull
                  )
                  or (
                    attribute.attname = 'approved_role'
                    and pg_catalog.format_type(
                      attribute.atttypid, attribute.atttypmod
                    ) in ('user_role', 'public.user_role')
                    and attribute.attnotnull
                  )
                  or (
                    attribute.attname = 'token_hash'
                    and pg_catalog.format_type(
                      attribute.atttypid, attribute.atttypmod
                    ) = 'text'
                    and attribute.attnotnull
                  )
                  or (
                    attribute.attname = 'expires_at'
                    and pg_catalog.format_type(
                      attribute.atttypid, attribute.atttypmod
                    ) = 'timestamp with time zone'
                    and attribute.attnotnull
                  )
                  or (
                    attribute.attname = 'consumed_at'
                    and pg_catalog.format_type(
                      attribute.atttypid, attribute.atttypmod
                    ) = 'timestamp with time zone'
                    and not attribute.attnotnull
                  )
                  or (
                    attribute.attname = 'created_at'
                    and pg_catalog.format_type(
                      attribute.atttypid, attribute.atttypmod
                    ) = 'timestamp with time zone'
                    and attribute.attnotnull
                  )
                )
            )
            and exists (
              select 1
              from pg_catalog.pg_constraint as constraint_record
              where constraint_record.conrelid = relation.oid
                and constraint_record.conname =
                  'kgeo_staff_provisioning_requests_pkey'
                and constraint_record.contype = 'p'
                and pg_catalog.pg_get_constraintdef(constraint_record.oid)
                  like '%(normalized_email)%'
            )
            and exists (
              select 1
              from pg_catalog.pg_constraint as constraint_record
              where constraint_record.conrelid = relation.oid
                and constraint_record.conname =
                  'kgeo_staff_provisioning_requests_token_hash_check'
                and constraint_record.contype = 'c'
                and constraint_record.convalidated
                and pg_catalog.lower(
                  pg_catalog.pg_get_constraintdef(constraint_record.oid)
                ) like '%[0-9a-f]{64}%'
            )
            and exists (
              select 1
              from pg_catalog.pg_constraint as constraint_record
              where constraint_record.conrelid = relation.oid
                and constraint_record.conname =
                  'kgeo_staff_provisioning_requests_token_hash_key'
                and constraint_record.contype = 'u'
                and pg_catalog.pg_get_constraintdef(constraint_record.oid)
                  like '%(token_hash)%'
            )
            and exists (
              select 1
              from pg_catalog.pg_constraint as constraint_record
              where constraint_record.conrelid = relation.oid
                and constraint_record.conname =
                  'kgeo_staff_provisioning_requests_role_check'
                and constraint_record.contype = 'c'
                and constraint_record.convalidated
                and pg_catalog.regexp_replace(
                  pg_catalog.lower(
                    pg_catalog.pg_get_constraintdef(constraint_record.oid)
                  ),
                  '[[:space:]]+',
                  '',
                  'g'
                ) in (
                  'check((approved_role=any(array[''counselor''::user_role,''director''::user_role])))',
                  'check((approved_role=any(array[''counselor''::public.user_role,''director''::public.user_role])))'
                )
            )
            and exists (
              select 1
              from pg_catalog.pg_constraint as constraint_record
              where constraint_record.conrelid = relation.oid
                and constraint_record.conname =
                  'kgeo_staff_provisioning_requests_expiry_check'
                and constraint_record.contype = 'c'
                and constraint_record.convalidated
                and pg_catalog.lower(
                  pg_catalog.pg_get_constraintdef(constraint_record.oid)
                ) like '%expires_at > created_at%'
                and pg_catalog.lower(
                  pg_catalog.pg_get_constraintdef(constraint_record.oid)
                ) like '%00:15:00%'
            )
            and exists (
              select 1
              from pg_catalog.pg_constraint as constraint_record
              where constraint_record.conrelid = relation.oid
                and constraint_record.conname =
                  'kgeo_staff_provisioning_requests_email_check'
                and constraint_record.contype = 'c'
                and constraint_record.convalidated
                and pg_catalog.lower(
                  pg_catalog.pg_get_constraintdef(constraint_record.oid)
                ) like '%normalized_email = lower(btrim(normalized_email))%'
                and pg_catalog.lower(
                  pg_catalog.pg_get_constraintdef(constraint_record.oid)
                ) like '%char_length(normalized_email)%254%'
                and pg_catalog.lower(
                  pg_catalog.pg_get_constraintdef(constraint_record.oid)
                ) like '%split_part(normalized_email, ''@''::text, 1)%64%'
                and pg_catalog.lower(
                  pg_catalog.pg_get_constraintdef(constraint_record.oid)
                ) like '%[a-z0-9-]{0,61}%'
                and pg_catalog.lower(
                  pg_catalog.pg_get_constraintdef(constraint_record.oid)
                ) like '%approved_role = ''director''::user_role%'
                and pg_catalog.lower(
                  pg_catalog.pg_get_constraintdef(constraint_record.oid)
                ) like '%approved_role = ''counselor''::user_role%'
                and pg_catalog.lower(
                  pg_catalog.pg_get_constraintdef(constraint_record.oid)
                ) like '%@kct[.]ac[.]in%'
            )
            and exists (
              select 1
              from pg_catalog.pg_constraint as constraint_record
              where constraint_record.conrelid = relation.oid
                and constraint_record.conname =
                  'kgeo_staff_provisioning_requests_consumed_check'
                and constraint_record.contype = 'c'
                and constraint_record.convalidated
                and pg_catalog.lower(
                  pg_catalog.pg_get_constraintdef(constraint_record.oid)
                ) like '%consumed_at is null%'
                and pg_catalog.lower(
                  pg_catalog.pg_get_constraintdef(constraint_record.oid)
                ) like '%consumed_at >= created_at%'
            )
            and exists (
              select 1
              from pg_catalog.pg_attribute as attribute
              inner join pg_catalog.pg_attrdef as attribute_default
                on attribute_default.adrelid = attribute.attrelid
                and attribute_default.adnum = attribute.attnum
              where attribute.attrelid = relation.oid
                and attribute.attname = 'created_at'
                and pg_catalog.regexp_replace(
                  pg_catalog.lower(
                    pg_catalog.pg_get_expr(
                      attribute_default.adbin,
                      attribute_default.adrelid
                    )
                  ),
                  '[[:space:]]+',
                  '',
                  'g'
                ) in (
                  'statement_timestamp()',
                  'pg_catalog.statement_timestamp()'
                )
            )
          from provisioning_table as relation
        ), false)
      ),
      (
        'A1.1.2 private staff request has no browser or service direct access',
        coalesce((
          select
            not pg_catalog.has_schema_privilege('public', 'private', 'USAGE')
            and not pg_catalog.has_schema_privilege('anon', 'private', 'USAGE')
            and not pg_catalog.has_schema_privilege(
              'authenticated', 'private', 'USAGE'
            )
            and not pg_catalog.has_schema_privilege(
              'service_role', 'private', 'USAGE'
            )
            and not pg_catalog.has_table_privilege(
              'public', relation.oid,
              'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
            )
            and not pg_catalog.has_table_privilege(
              'anon', relation.oid,
              'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
            )
            and not pg_catalog.has_table_privilege(
              'authenticated', relation.oid,
              'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
            )
            and not pg_catalog.has_table_privilege(
              'service_role', relation.oid,
              'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'
            )
            and not exists (
              select 1
              from pg_catalog.pg_policy as policy
              where policy.polrelid = relation.oid
            )
          from provisioning_table as relation
        ), false)
      ),
      (
        'A1.1.2 staff prepare RPC has exact volatile service-role-only contract',
        coalesce((
          select
            result_type = 'void'
            and prosecdef
            and provolatile = 'v'
            and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
            and owner_name = 'postgres'
            and pg_catalog.has_function_privilege(
              'service_role', oid, 'EXECUTE'
            )
            and not pg_catalog.has_function_privilege(
              'public', oid, 'EXECUTE'
            )
            and not pg_catalog.has_function_privilege(
              'anon', oid, 'EXECUTE'
            )
            and not pg_catalog.has_function_privilege(
              'authenticated', oid, 'EXECUTE'
            )
          from prepare_provisioning
        ), false)
        and (select pg_catalog.count(*) = 1 from prepare_provisioning)
      ),
      (
        'A1.1.2 staff prepare RPC validates role email hash expiry and replacement',
        coalesce((
          select
            definition like
              '%p_email <> lower(btrim(p_email))%'
            and definition like
              '%p_role not in (%''counselor''::public.user_role%''director''::public.user_role%'
            and definition like
              '%p_role = ''counselor''::public.user_role%@kct[.]ac[.]in%'
            and definition like '%[0-9a-f]{64}%'
            and definition like
              '%p_expires_at <= request_time%'
            and definition like
              '%p_expires_at > request_time + interval ''15 minutes''%'
            and definition like
              '%on conflict (normalized_email) do update%'
            and definition like
              '%set approved_role = excluded.approved_role%'
            and definition like '%consumed_at is not null%'
            and definition like
              '%expires_at <= request_time%'
            and definition not like '%auth.users%'
            and definition not like '%public.profiles%'
            and definition not like '%execute %'
          from prepare_provisioning
        ), false)
      ),
      (
        'A1.1.2 live SHA-256 pipeline resolves and matches known vector',
        coalesce((
          select
            pg_catalog.pg_get_function_result(
              pg_catalog.to_regprocedure(
                'pg_catalog.convert_to(text,name)'
              )
            ) = 'bytea'
            and pg_catalog.pg_get_function_result(
              pg_catalog.to_regprocedure('pg_catalog.sha256(bytea)')
            ) = 'bytea'
            and pg_catalog.pg_get_function_result(
              pg_catalog.to_regprocedure('pg_catalog.encode(bytea,text)')
            ) = 'text'
            and known_answer.token_hash =
              'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
            and known_answer.token_hash ~ '^[0-9a-f]{64}$'
          from (
            select pg_catalog.encode(
              pg_catalog.sha256(
                pg_catalog.convert_to('abc'::text, 'UTF8'::name)
              ),
              'hex'::text
            ) as token_hash
          ) as known_answer
        ), false)
      ),
      (
        'A1.1.2 has no additional public provisioning RPC surface',
        (
          select
            pg_catalog.count(*) = 1
            and pg_catalog.bool_and(
              procedure.proname = 'prepare_staff_identity_provisioning'
            )
          from pg_catalog.pg_proc as procedure
          inner join pg_catalog.pg_namespace as namespace
            on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname like '%provision%'
        )
      ),
      (
        'A1.1.2 staff trigger uses only the exact token transport field',
        coalesce((
          select
            definition like
              '%? ''kgeo_staff_provisioning_token''%'
            and definition like
              '%jsonb_typeof(%kgeo_staff_provisioning_token%'
            and definition like
              '%[a-za-z0-9_-]{43}%'
            and definition like '%pg_catalog.encode(%'
            and definition like '%pg_catalog.sha256(%'
            and definition like
              '%pg_catalog.convert_to(v_provisioning_token, ''utf8'')%'
            and definition like '%''hex''%'
            and definition not like '%raw_app_meta_data%'
            and definition not like
              '%raw_user_meta_data -> ''role''%'
            and definition not like
              '%raw_user_meta_data ->> ''role''%'
            and definition not like
              '%raw_user_meta_data -> ''kgeo_bootstrap_role''%'
            and definition not like
              '%raw_user_meta_data ->> ''kgeo_bootstrap_role''%'
            and definition not like
              '%raw_user_meta_data -> ''kgeo_provisioned_role''%'
            and definition not like
              '%raw_user_meta_data ->> ''kgeo_provisioned_role''%'
            and definition not like
              '%raw_user_meta_data -> ''approved_role''%'
            and definition not like
              '%raw_user_meta_data ->> ''approved_role''%'
            and definition not like
              '%''admin''::public.user_role%'
            and definition not like '%execute %'
          from identity_provisioning
        ), false)
      ),
      (
        'A1.1.2 staff token locks exact request derives role and consumes atomically',
        coalesce((
          select
            definition like '%v_normalized_email text%'
            and definition like '%v_provisioning_token text%'
            and definition like '%v_token_hash text%'
            and definition like
              '%v_approved_role public.user_role%'
            and definition ~*
              'v_request_time[[:space:]]+(timestamptz|timestamp with time zone)'
            and definition !~*
              '(^|[[:space:]])(normalized_email|normalized_full_name|provisioning_token|provisioning_token_hash|approved_staff_role|request_time|affected_rows)[[:space:]]+(text|public[.]user_role|timestamptz|bigint)[[:space:]]*;'
            and definition like
              '%request.normalized_email = v_normalized_email%'
            and definition like
              '%request.token_hash = v_token_hash%'
            and definition like
              '%request.consumed_at is null%'
            and definition like
              '%request.expires_at > v_request_time%'
            and definition like '%for update%'
            and definition like
              '%select request.approved_role%into v_approved_role%'
            and definition like
              '%v_approved_role not in (%''counselor''::public.user_role%''director''::public.user_role%'
            and definition like
              '%v_approved_role = ''counselor''::public.user_role%@kct[.]ac[.]in%'
            and definition like
              '%set consumed_at = v_request_time%'
            and definition like
              '%request.approved_role = v_approved_role%'
            and definition like
              '%get diagnostics v_affected_rows = row_count%'
            and definition like
              '%values (new.id, v_normalized_email, v_approved_role, null, true)%'
          from identity_provisioning
        ), false)
      ),
      (
        'A1.1.2 Director authorization remains role active verified and admin denied',
        coalesce((
          select
            pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))
              like '%profile.id = (select auth.uid())%'
            and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))
              like '%profile.role = p_role%'
            and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))
              like '%profile.is_active is true%'
            and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))
              like '%auth_user.email_confirmed_at is not null%'
            and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))
              not like '%@kct%'
            and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))
              not like '%kclas%'
            and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))
              not like '%raw_user_meta_data%'
            and pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))
              not like '%raw_app_meta_data%'
          from pg_catalog.pg_proc as procedure
          inner join pg_catalog.pg_namespace as namespace
            on namespace.oid = procedure.pronamespace
          where namespace.nspname = 'public'
            and procedure.proname = 'has_active_verified_kgeo_role'
            and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
              'p_role public.user_role'
        ), false)
      )
  ) as result(check_name, passed)
)
select
  'A1.1.2_check'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

-- Phase A1.3 Director operational oversight foundation.
with director_oversight_functions as (
  select
    procedure.oid,
    procedure.proname,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      as identity_arguments,
    pg_catalog.pg_get_function_arguments(procedure.oid) as arguments,
    pg_catalog.pg_get_function_result(procedure.oid) as result_type,
    pg_catalog.regexp_replace(pg_catalog.btrim(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))), '\s+', ' ', 'g') as definition,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig,
    owner.rolname as owner_name
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname in (
      'list_director_student_oversight',
      'list_director_consultation_oversight',
      'list_director_application_oversight'
    )
),
checks as (
  select *
  from (
    values
      (
        'A1.3 Director oversight RPC signatures have no overloads',
        (select pg_catalog.count(*) = 3 from director_oversight_functions)
      ),
      (
        'A1.3 student oversight signature and return are exact',
        coalesce((
          select
            identity_arguments =
              'p_search text, p_is_active boolean, p_progression_state text, p_page integer, p_page_size integer'
            and arguments =
              'p_search text DEFAULT NULL::text, p_is_active boolean DEFAULT NULL::boolean, p_progression_state text DEFAULT NULL::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25'
            and result_type =
              'TABLE(student_id uuid, full_name text, college_email text, is_active boolean, account_created_at timestamp with time zone, course text, department text, graduation_year integer, profile_state student_directory_profile_state, progression_stage counseling_progression_stage, progression_state counseling_progression_state, total_consultations bigint, open_consultations bigint, active_applications bigint, total_count bigint)'
          from director_oversight_functions
          where proname = 'list_director_student_oversight'
        ), false)
      ),
      (
        'A1.3 consultation oversight signature and return are exact',
        coalesce((
          select
            identity_arguments =
              'p_search text, p_status public.consultation_status, p_date_from date, p_date_to date, p_page integer, p_page_size integer'
            and arguments like
              'p_search text DEFAULT NULL::text, p_status public.consultation_status DEFAULT NULL::public.consultation_status, p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25'
            and result_type =
              'TABLE(consultation_id uuid, request_number text, student_id uuid, student_full_name text, student_college_email text, counselor_id uuid, counselor_full_name text, counselor_college_email text, consultation_date date, slot_start time without time zone, slot_end time without time zone, consultation_status consultation_status, outcome_recorded_at timestamp with time zone, submitted_at timestamp with time zone, total_count bigint)'
          from director_oversight_functions
          where proname = 'list_director_consultation_oversight'
        ), false)
      ),
      (
        'A1.3 application oversight signature and return are exact',
        coalesce((
          select
            identity_arguments =
              'p_search text, p_status public.university_application_status, p_archive_state text, p_page integer, p_page_size integer'
            and arguments like
              'p_search text DEFAULT NULL::text, p_status public.university_application_status DEFAULT NULL::public.university_application_status, p_archive_state text DEFAULT ''active''::text, p_page integer DEFAULT 1, p_page_size integer DEFAULT 25'
            and result_type =
              'TABLE(application_id uuid, student_id uuid, student_full_name text, student_college_email text, counselor_id uuid, counselor_full_name text, counselor_college_email text, university_name text, programme_name text, country_code text, degree_level university_application_degree_level, intake_term university_application_intake_term, intake_year smallint, application_status university_application_status, submission_deadline date, submitted_at timestamp with time zone, is_primary boolean, is_archived boolean, last_changed_at timestamp with time zone, total_count bigint)'
          from director_oversight_functions
          where proname = 'list_director_application_oversight'
        ), false)
      ),
      (
        'A1.3 Director oversight RPCs are trusted stable SECURITY DEFINER',
        coalesce((
          select pg_catalog.bool_and(
            prosecdef
            and provolatile = 's'
            and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
            and owner_name = 'postgres'
          ) and pg_catalog.count(*) = 3
          from director_oversight_functions
        ), false)
      ),
      (
        'A1.3 Director oversight RPC execution is authenticated only',
        coalesce((
          select pg_catalog.bool_and(
            not pg_catalog.has_function_privilege('public', oid, 'EXECUTE')
            and not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
            and pg_catalog.has_function_privilege(
              'authenticated',
              oid,
              'EXECUTE'
            )
          ) and pg_catalog.count(*) = 3
          from director_oversight_functions
        ), false)
      ),
      (
        'A1.3 RPCs derive exact active verified Director authorization',
        coalesce((
          select pg_catalog.bool_and(
            definition like
              '%v_caller_id := (select auth.uid())%'
            and definition like
              '%has_active_verified_kgeo_role(%'
            and definition like
              '%''director''::public.user_role%'
            and definition not like
              '%''admin''::public.user_role%'
            and definition not like
              '%raw_user_meta_data%'
            and definition not like
              '%raw_app_meta_data%'
          ) and pg_catalog.count(*) = 3
          from director_oversight_functions
        ), false)
      ),
      (
        'A1.3 lists enforce bounded filters pagination and generic errors',
        coalesce((
          select pg_catalog.bool_and(
            definition like
              '%p_page not between 1 and 100000%'
            and definition like
              '%p_page_size not between 1 and 50%'
            and definition like
              '%char_length(v_search) > 100%'
            and definition like '%limit p_page_size%'
            and definition like '%offset v_page_offset%'
            and definition like '%when others%'
            and definition like
              '%director oversight data is temporarily unavailable.%'
          ) and pg_catalog.count(*) = 3
          from director_oversight_functions
        ), false)
      ),
      (
        'A1.3 list ordering has deterministic UUID tie breakers',
        coalesce((select
          definition like '%student.student_id asc%'
          from director_oversight_functions
          where proname = 'list_director_student_oversight'
        ), false)
        and coalesce((select
          definition like
            '%consultation.submitted_at desc%consultation.consultation_id desc%'
          from director_oversight_functions
          where proname = 'list_director_consultation_oversight'
        ), false)
        and coalesce((select
          definition like
            '%application.last_changed_at desc%application.application_id desc%'
          from director_oversight_functions
          where proname = 'list_director_application_oversight'
        ), false)
      ),
      (
        'A1.3 Director oversight excludes private content and mutations',
        coalesce((
          select pg_catalog.bool_and(
            definition not like
              '%counselor_student_notes%'
            and definition not like
              '%counselor_follow_ups%'
            and definition not like '%next_action%'
            and definition not like '%details%'
            and definition not like '%personal_email%'
            and definition not like '%mobile_number%'
            and definition not like
              '%student_university_application_documents%'
            and definition not like '%execute %'
          and definition !~ 'insert into (?!public\.student_counselor_assignments)'
          and definition !~ 'update (?!public\.consultation_requests)'
          and definition not like '%delete from %'
            and definition !~
              '\mupdate\M[[:space:]]+'
          ) and pg_catalog.count(*) = 3
          from director_oversight_functions
        ), false)
      )
  ) as result(check_name, passed)
)
select
  'A1.3_check'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

-- Phase A1.4.1 consultation ownership and FCFS assignment foundation.
with consultation_functions as (
  select
    procedure.oid,
    procedure.proname,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      as identity_arguments,
    pg_catalog.pg_get_function_result(procedure.oid) as result_type,
    procedure.prorettype,
    procedure.proretset,
    pg_catalog.regexp_replace(pg_catalog.btrim(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))), '\s+', ' ', 'g') as definition,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig,
    owner.rolname as owner_name
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname in (
      'prepare_consultation_request_insert',
      'claim_next_consultation',
      'record_consultation_outcome'
    )
),
checks as (
  select *
  from (
    values
      (
        'A1.4.1 consultation function signatures have no overloads',
        (select pg_catalog.count(*) = 3 from consultation_functions)
        and coalesce((select
          identity_arguments = ''
            and prorettype = 'trigger'::pg_catalog.regtype
            and proretset is false
          from consultation_functions
          where proname = 'prepare_consultation_request_insert'
        ), false)
        and coalesce((select
          identity_arguments = ''
            and prorettype = 'uuid'::pg_catalog.regtype
            and proretset is false
          from consultation_functions
          where proname = 'claim_next_consultation'
        ), false)
        and coalesce((select
          identity_arguments = 'p_consultation_id uuid, p_outcome text'
            and prorettype = 'public.consultation_status'::pg_catalog.regtype
            and proretset is false
          from consultation_functions
          where proname = 'record_consultation_outcome'
        ), false)
      ),
      (
        'A1.4.1 consultation functions retain trusted ownership and search path',
        coalesce((select pg_catalog.bool_and(
          prosecdef
          and provolatile = 'v'
          and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_name = 'postgres'
        ) and pg_catalog.count(*) = 3
        from consultation_functions), false)
      ),
      (
        'A1.4.1 claim execution is authenticated only',
        coalesce((select
          not pg_catalog.has_function_privilege('public', oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
          and pg_catalog.has_function_privilege(
            'authenticated',
            oid,
            'EXECUTE'
          )
          from consultation_functions
          where proname = 'claim_next_consultation'
        ), false)
      ),
      (
        'A1.4.1 student booking is fixed-slot assignment pending',
        coalesce((select
          definition like
            '%profile.role = ''student''::public.user_role%'
          and definition like
            '%profile.is_active is true%'
          and definition like
            '%auth_user.email_confirmed_at is not null%'
          and definition like
            '%new.slot_end := (new.slot_start + interval ''30 minutes'')::time%'
          and definition like
            '%new.status := ''waiting_for_assignment''::public.consultation_status%'
          and definition like
            '%new.assigned_counselor_id := null%'
          and definition like
            '%new.assigned_at := null%'
          from consultation_functions
          where proname = 'prepare_consultation_request_insert'
        ), false)
      ),
      (
        'A1.4.1 claim derives exact active verified counselor authorization',
        coalesce((select
          definition like
            '%v_caller_id := (select auth.uid())%'
          and definition like
            '%counselor_profile.role = ''counselor''::public.user_role%'
          and definition like
            '%counselor_profile.is_active is true%'
          and definition like
            '%counselor_auth.email_confirmed_at is not null%'
          and definition not like
            '%''director''::public.user_role%'
          and definition not like
            '%''admin''::public.user_role%'
          from consultation_functions
          where proname = 'claim_next_consultation'
        ), false)
      ),
      (
        'A1.4.1 claim locks the exact earliest eligible booked request',
        coalesce((select
          definition like
            '%request.status = ''waiting_for_assignment''::public.consultation_status%'
          and definition like
            '%request.assigned_counselor_id is null%'
          and definition like
            '%request.consultation_date is not null%'
          and definition like
            '%request.slot_start is not null%'
          and definition like
            '%request.slot_end is not null%'
          and definition like
            '%order by request.submitted_at asc, request.id asc limit 1 for update%'
          from consultation_functions
          where proname = 'claim_next_consultation'
        ), false)
      ),
      (
        'A1.4.1 claim assigns atomically and repeats ownership eligibility',
        coalesce((select
          definition like
            '%update public.consultation_requests as request%assigned_counselor_id = v_caller_id%'
          and definition like
            '%assigned_at = v_assignment_time%'
          and definition like
            '%status = ''scheduled''::public.consultation_status%'
          and (
            pg_catalog.length(definition)
            - pg_catalog.length(pg_catalog.replace(
                definition,
                'request.assigned_counselor_id is null',
                ''
              ))
          ) / pg_catalog.length('request.assigned_counselor_id is null') = 2
          from consultation_functions
          where proname = 'claim_next_consultation'
        ), false)
      ),
      (
        'A1.4.1 unresolved ownership states have the exact constraint',
        coalesce((select
          pg_catalog.pg_get_constraintdef(constraint_record.oid, true) ~
            'status = ANY \(ARRAY\[''submitted''::(public\.)?consultation_status, ''waiting_for_assignment''::(public\.)?consultation_status\]\).*assigned_counselor_id IS NULL'
          and pg_catalog.pg_get_constraintdef(constraint_record.oid, true) ~
            'status = ANY \(ARRAY\[''counselor_assigned''::(public\.)?consultation_status, ''scheduled''::(public\.)?consultation_status\]\).*assigned_counselor_id IS NOT NULL'
          and constraint_record.convalidated
          from pg_catalog.pg_constraint as constraint_record
          where constraint_record.conrelid =
              'public.consultation_requests'::pg_catalog.regclass
            and constraint_record.conname =
              'consultation_requests_status_assignment_check'
        ), false)
      ),
      (
        'A1.4.1 outcomes require the assigned counselor in lock and update paths',
        coalesce((select
          definition like
            '%request.assigned_counselor_id%for update%'
          and definition like
            '%target_assigned_counselor_id is distinct from caller_id%'
          and definition like
            '%request.assigned_counselor_id = caller_id%'
          and definition like
            '%target_status <> ''scheduled''::public.consultation_status%'
          from consultation_functions
          where proname = 'record_consultation_outcome'
        ), false)
      ),
      (
        'A1.4.1 ownership functions exclude private content dynamic SQL and unrelated mutations',
        coalesce((select pg_catalog.bool_and(
          definition not like '%counselor_student_notes%'
          and definition not like '%counselor_follow_ups%'
          and definition not like
            '%student_university_applications%'
          and definition not like
            '%student_university_application_documents%'
          and definition not like
            '%kgeo_staff_provisioning_requests%'
          and definition not like '%raw_user_meta_data%'
          and definition not like '%raw_app_meta_data%'
          and definition not like '%execute %'
          and definition !~ 'insert into (?!public\.student_counselor_assignments)'
          and definition !~ 'update (?!public\.consultation_requests)'
          and definition not like '%delete from %'
        ) and pg_catalog.count(*) = 3
        from consultation_functions), false)
      )
  ) as result(check_name, passed)
)
select
  'A1.4.1_check'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

-- Phase A1.4.2A Primary Counselor assignment foundation.
with assignment_relation as (
  select
    relation.oid,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    owner.rolname as owner_name
  from pg_catalog.pg_class as relation
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = relation.relowner
  where namespace.nspname = 'public'
    and relation.relname = 'student_counselor_assignments'
    and relation.relkind = 'r'
),
assignment_functions as (
  select
    procedure.oid,
    procedure.proname,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      as identity_arguments,
    pg_catalog.pg_get_function_result(procedure.oid) as result_type,
    pg_catalog.regexp_replace(pg_catalog.btrim(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))), '\s+', ' ', 'g') as definition,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig,
    owner.rolname as owner_name
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname in (
      'protect_student_counselor_assignment_history',
      'claim_next_consultation',
      'list_my_primary_students',
      'list_director_primary_counselor_assignments',
      'list_director_primary_counselor_counts'
    )
),
checks as (
  select *
  from (
    values
      (
        'A1.4.2A assignment table is exact sealed forced-RLS history',
        coalesce((select
          relrowsecurity
          and relforcerowsecurity
          and owner_name = 'postgres'
          and not pg_catalog.has_table_privilege(
            'public', oid, 'SELECT,INSERT,UPDATE,DELETE'
          )
          and not pg_catalog.has_table_privilege(
            'anon', oid, 'SELECT,INSERT,UPDATE,DELETE'
          )
          and not pg_catalog.has_table_privilege(
            'authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE'
          )
          and not exists (
            select 1 from pg_catalog.pg_policy as policy
            where policy.polrelid = oid
          )
          from assignment_relation
        ), false)
        and coalesce((select pg_catalog.count(*) = 7
          from pg_catalog.pg_attribute as attribute
          where attribute.attrelid =
              'public.student_counselor_assignments'::pg_catalog.regclass
            and attribute.attnum > 0
            and not attribute.attisdropped
            and attribute.attname in (
              'id', 'student_id', 'counselor_id', 'assigned_at',
              'assigned_by', 'ended_at', 'created_at'
            )
        ), false)
      ),
      (
        'A1.4.2A one active assignment and history indexes exist',
        coalesce((select
          pg_catalog.count(*) filter (
            where index_record.indexname =
              'student_counselor_assignments_one_active_student_key'
              and pg_catalog.lower(index_record.indexdef) like
                '%unique index%student_id%where (ended_at is null)%'
          ) = 1
          and pg_catalog.count(*) filter (
            where index_record.indexname =
              'student_counselor_assignments_active_counselor_idx'
          ) = 1
          and pg_catalog.count(*) filter (
            where index_record.indexname =
              'student_counselor_assignments_student_history_idx'
          ) = 1
          from pg_catalog.pg_indexes as index_record
          where index_record.schemaname = 'public'
            and index_record.tablename = 'student_counselor_assignments'
        ), false)
      ),
      (
        'A1.4.2A participant roles and history immutability are trusted',
        coalesce((select
          prosecdef
          and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_name = 'postgres'
          and definition like
            '%v_student_role is distinct from ''student''::public.user_role%'
          and definition like
            '%v_counselor_role is distinct from ''counselor''::public.user_role%'
          and definition like '%tg_op = ''delete''%'
          and definition like
            '%old.ended_at is not null%new.ended_at is null%'
          from assignment_functions
          where proname =
            'protect_student_counselor_assignment_history'
        ), false)
        and coalesce((select pg_catalog.count(*) = 1
          from pg_catalog.pg_trigger as trigger_record
          where trigger_record.tgrelid =
              'public.student_counselor_assignments'::pg_catalog.regclass
            and trigger_record.tgname =
              'protect_student_counselor_assignment_history'
            and not trigger_record.tgisinternal
            and trigger_record.tgenabled = 'O'
        ), false)
      ),
      (
        'A1.4.2A first claim inserts only absent assignment atomically',
        coalesce((select
          identity_arguments = ''
          and result_type = 'uuid'
          and prosecdef
          and provolatile = 'v'
          and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_name = 'postgres'
          and definition like
            '%order by request.submitted_at asc, request.id asc limit 1 for update%'
          and definition like
            '%insert into public.student_counselor_assignments%'
          and definition like
            '%on conflict (student_id) where ended_at is null do nothing%'
          and definition not like
            '%update public.student_counselor_assignments%'
          from assignment_functions
          where proname = 'claim_next_consultation'
        ), false)
      ),
      (
        'A1.4.2A My Students is exact-counselor bounded and active-only',
        coalesce((select
          identity_arguments = 'p_page integer, p_page_size integer'
          and prosecdef
          and provolatile = 's'
          and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_name = 'postgres'
          and definition like
            '%has_active_verified_kgeo_role%''counselor''::public.user_role%'
          and definition like
            '%assignment.counselor_id = v_caller_id%'
          and definition like
            '%assignment.ended_at is null%'
          and definition like
            '%p_page_size not between 1 and 50%'
          from assignment_functions
          where proname = 'list_my_primary_students'
        ), false)
      ),
      (
        'A1.4.2A Director projections are bounded and Director-only',
        coalesce((select
          pg_catalog.bool_and(
            prosecdef
            and provolatile = 's'
            and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
            and owner_name = 'postgres'
            and definition like
              '%has_active_verified_kgeo_role%''director''::public.user_role%'
            and definition like
              '%cardinality(%not between 1 and 50%'
          ) and pg_catalog.count(*) = 2
          from assignment_functions
          where proname in (
            'list_director_primary_counselor_assignments',
            'list_director_primary_counselor_counts'
          )
        ), false)
      ),
      (
        'A1.4.2A assignment RPCs are authenticated-only and private-safe',
        coalesce((select pg_catalog.bool_and(
          not pg_catalog.has_function_privilege('public', oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
          and pg_catalog.has_function_privilege(
            'authenticated', oid, 'EXECUTE'
          )
          and definition not like '%counselor_student_notes%'
          and definition not like '%counselor_follow_ups%'
          and definition not like '%raw_user_meta_data%'
          and definition not like '%raw_app_meta_data%'
          and definition not like '%execute %'
        ) and pg_catalog.count(*) = 4
        from assignment_functions
        where proname in (
          'claim_next_consultation',
          'list_my_primary_students',
          'list_director_primary_counselor_assignments',
          'list_director_primary_counselor_counts'
        )), false)
      )
  ) as result(check_name, passed)
)
select
  'A1.4.2A_check'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

-- Phase A1.4.2B exact installed function and trigger contracts. Complete
-- normalized prosrc hashes are paired with exact catalog metadata and ACLs;
-- retaining expected text in an unreachable branch cannot satisfy a hash.
with expected_case_functions(
  function_name,
  identity_arguments,
  result_type_oid,
  returns_set,
  language_name,
  security_definer,
  volatility,
  body_sha256,
  execute_grantees
) as (
  values
    (
      'is_active_primary_counselor_for_student',
      'p_student_id uuid',
      'pg_catalog.bool'::pg_catalog.regtype::oid,
      false,
      'sql',
      true,
      's'::"char",
      'dbafccbd4bae61d5e20bce09ee3b66075664dc23f69943235344c3d123b9fb6b',
      array[]::text[]
    ),
    (
      'get_my_primary_counselor_case_access',
      'p_student_id uuid',
      'pg_catalog.record'::pg_catalog.regtype::oid,
      true,
      'plpgsql',
      true,
      's'::"char",
      '44c1222d300246040e1bc3b8b20018e0fea0b1d00f693b331903e36de95a6ccd',
      array['authenticated:false']::text[]
    ),
    (
      'enforce_primary_counselor_student_case_row',
      '',
      'pg_catalog.trigger'::pg_catalog.regtype::oid,
      false,
      'plpgsql',
      true,
      'v'::"char",
      '7ee591ff22d8ff5678603d7871bae9e8b74eca5821e096c853b31cf31992e69f',
      array[]::text[]
    ),
    (
      'enforce_primary_counselor_progression_evidence',
      '',
      'pg_catalog.trigger'::pg_catalog.regtype::oid,
      false,
      'plpgsql',
      true,
      'v'::"char",
      '79d4e3dfe83aabff3533a227e6ef1f04712f52a5a4125f75d4d9caadb0dd47ce',
      array[]::text[]
    ),
    (
      'enforce_primary_counselor_application_document',
      '',
      'pg_catalog.trigger'::pg_catalog.regtype::oid,
      false,
      'plpgsql',
      true,
      'v'::"char",
      '59026a5b1da6f6b4288a5ce8f8d586783ae9f270e745edeaf341e09bf976ab3a',
      array[]::text[]
    ),
    (
      'can_upload_university_application_document_object',
      'p_bucket_id text, p_storage_path text',
      'pg_catalog.bool'::pg_catalog.regtype::oid,
      false,
      'plpgsql',
      true,
      's'::"char",
      '0d4229e62145df6905dc51ec545c1c25122ee08280b99e1b2ae94e5d82c9427f',
      array['authenticated:false']::text[]
    ),
    (
      'record_consultation_outcome',
      'p_consultation_id uuid, p_outcome text',
      'public.consultation_status'::pg_catalog.regtype::oid,
      false,
      'plpgsql',
      true,
      'v'::"char",
      '99033348ce71a1261fcd9f0f674824687758d175da8f0204f7240790a6e67c25',
      array['authenticated:false']::text[]
    )
),
actual_case_functions as (
  select
    procedure.proname::text as function_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      as identity_arguments,
    procedure.prorettype as result_type_oid,
    procedure.proretset as returns_set,
    language_record.lanname::text as language_name,
    procedure.prosecdef as security_definer,
    procedure.provolatile as volatility,
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.replace(
            pg_catalog.replace(
              procedure.prosrc,
              pg_catalog.chr(13) || pg_catalog.chr(10),
              pg_catalog.chr(10)
            ),
            pg_catalog.chr(13),
            pg_catalog.chr(10)
          ),
          'UTF8'
        )
      ),
      'hex'
    ) as body_sha256,
    coalesce((
      select pg_catalog.array_agg(
        pg_catalog.format(
          '%s:%s',
          coalesce(grantee_role.rolname, 'PUBLIC'),
          privilege.is_grantable
        ) order by
          coalesce(grantee_role.rolname, 'PUBLIC'),
          privilege.is_grantable
      )
      from pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as privilege
      left join pg_catalog.pg_roles as grantee_role
        on grantee_role.oid = privilege.grantee
      where privilege.privilege_type = 'EXECUTE'
        and privilege.grantee <> procedure.proowner
    ), array[]::text[]) as execute_grantees,
    procedure.prokind,
    procedure.proconfig,
    procedure.proisstrict,
    procedure.proleakproof,
    procedure.proparallel,
    owner_role.rolname::text as owner_name,
    procedure.proallargtypes,
    procedure.proargmodes,
    procedure.proargnames
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  inner join pg_catalog.pg_language as language_record
    on language_record.oid = procedure.prolang
  where namespace.nspname = 'public'
    and procedure.proname in (
      select expected.function_name
      from expected_case_functions as expected
    )
),
expected_case_triggers(
  relation_schema,
  relation_name,
  relation_oid,
  trigger_name,
  function_oid,
  function_schema,
  function_name,
  function_identity_arguments,
  trigger_type,
  enabled_state,
  is_internal,
  argument_count,
  arguments_hex,
  when_expression,
  constraint_oid,
  is_deferrable,
  is_initially_deferred,
  old_transition_table,
  new_transition_table
) as (
  values
    ('public'::text, 'counselor_student_notes'::text, 'public.counselor_student_notes'::pg_catalog.regclass::oid, 'counselor_student_notes_10_prepare'::text, 'public.prepare_counselor_private_record()'::pg_catalog.regprocedure::oid, 'public'::text, 'prepare_counselor_private_record'::text, ''::text, 23::smallint, 'O'::"char", false, 0::smallint, ''::text, null::text, 0::oid, false, false, null::text, null::text),
    ('public', 'counselor_student_notes', 'public.counselor_student_notes'::pg_catalog.regclass::oid, 'counselor_student_notes_20_normalize', 'public.normalize_counselor_student_note()'::pg_catalog.regprocedure::oid, 'public', 'normalize_counselor_student_note', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'counselor_follow_ups_10_prepare', 'public.prepare_counselor_private_record()'::pg_catalog.regprocedure::oid, 'public', 'prepare_counselor_private_record', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'counselor_follow_ups_20_normalize', 'public.normalize_counselor_follow_up()'::pg_catalog.regprocedure::oid, 'public', 'normalize_counselor_follow_up', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'counselor_student_notes', 'public.counselor_student_notes'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_notes', pg_catalog.to_regprocedure('public.enforce_primary_counselor_student_case_row()')::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_follow_ups', pg_catalog.to_regprocedure('public.enforce_primary_counselor_student_case_row()')::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'student_counseling_progressions', 'public.student_counseling_progressions'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_progressions', pg_catalog.to_regprocedure('public.enforce_primary_counselor_student_case_row()')::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'student_university_applications', 'public.student_university_applications'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_applications', pg_catalog.to_regprocedure('public.enforce_primary_counselor_student_case_row()')::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'student_counseling_progression_evidence', 'public.student_counseling_progression_evidence'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_progression_evidence', pg_catalog.to_regprocedure('public.enforce_primary_counselor_progression_evidence()')::oid, 'public', 'enforce_primary_counselor_progression_evidence', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'student_university_application_documents', 'public.student_university_application_documents'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_application_documents', pg_catalog.to_regprocedure('public.enforce_primary_counselor_application_document()')::oid, 'public', 'enforce_primary_counselor_application_document', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null)
),
actual_case_triggers as (
  select
    relation_namespace.nspname::text as relation_schema,
    relation.relname::text as relation_name,
    relation.oid as relation_oid,
    trigger_record.tgname::text as trigger_name,
    procedure.oid as function_oid,
    function_namespace.nspname::text as function_schema,
    procedure.proname::text as function_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      as function_identity_arguments,
    trigger_record.tgtype as trigger_type,
    trigger_record.tgenabled as enabled_state,
    trigger_record.tgisinternal as is_internal,
    trigger_record.tgnargs as argument_count,
    pg_catalog.encode(trigger_record.tgargs, 'hex') as arguments_hex,
    pg_catalog.pg_get_expr(
      trigger_record.tgqual,
      trigger_record.tgrelid,
      false
    )::text as when_expression,
    trigger_record.tgconstraint as constraint_oid,
    trigger_record.tgdeferrable as is_deferrable,
    trigger_record.tginitdeferred as is_initially_deferred,
    trigger_record.tgoldtable::text as old_transition_table,
    trigger_record.tgnewtable::text as new_transition_table
  from pg_catalog.pg_trigger as trigger_record
  inner join pg_catalog.pg_class as relation
    on relation.oid = trigger_record.tgrelid
  inner join pg_catalog.pg_namespace as relation_namespace
    on relation_namespace.oid = relation.relnamespace
  inner join pg_catalog.pg_proc as procedure
    on procedure.oid = trigger_record.tgfoid
  inner join pg_catalog.pg_namespace as function_namespace
    on function_namespace.oid = procedure.pronamespace
  where trigger_record.tgrelid in (
      'public.counselor_student_notes'::pg_catalog.regclass,
      'public.counselor_follow_ups'::pg_catalog.regclass,
      'public.student_counseling_progressions'::pg_catalog.regclass,
      'public.student_university_applications'::pg_catalog.regclass,
      'public.student_counseling_progression_evidence'::pg_catalog.regclass,
      'public.student_university_application_documents'::pg_catalog.regclass
    )
    and trigger_record.tgisinternal is false
),
checks(check_name, passed) as (
  values
    (
      'A1.4.2B complete installed function contracts match reviewed hashes',
      (select pg_catalog.count(*) from actual_case_functions) = 7
      and not exists (
        select * from expected_case_functions
        except
        select
          function_name,
          identity_arguments,
          result_type_oid,
          returns_set,
          language_name,
          security_definer,
          volatility,
          body_sha256,
          execute_grantees
        from actual_case_functions
        where prokind = 'f'
          and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_name = 'postgres'
          and proisstrict is false
          and proleakproof is false
          and proparallel = 'u'
          and (
            function_name <> 'get_my_primary_counselor_case_access'
            or (
              proallargtypes = array[
                'pg_catalog.uuid'::pg_catalog.regtype::oid,
                'pg_catalog.text'::pg_catalog.regtype::oid
              ]::oid[]
              and proargmodes = array['i', 't']::"char"[]
              and proargnames = array[
                'p_student_id',
                'access_state'
              ]::text[]
            )
          )
      )
      and not exists (
        select
          function_name,
          identity_arguments,
          result_type_oid,
          returns_set,
          language_name,
          security_definer,
          volatility,
          body_sha256,
          execute_grantees
        from actual_case_functions
        where prokind = 'f'
          and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_name = 'postgres'
          and proisstrict is false
          and proleakproof is false
          and proparallel = 'u'
          and (
            function_name <> 'get_my_primary_counselor_case_access'
            or (
              proallargtypes = array[
                'pg_catalog.uuid'::pg_catalog.regtype::oid,
                'pg_catalog.text'::pg_catalog.regtype::oid
              ]::oid[]
              and proargmodes = array['i', 't']::"char"[]
              and proargnames = array[
                'p_student_id',
                'access_state'
              ]::text[]
            )
          )
        except
        select * from expected_case_functions
      )
    ),
    (
      'A1.4.2B complete protected relation user-trigger inventory is exact',
      not exists (
        select * from expected_case_triggers
        except
        select * from actual_case_triggers
      )
      and not exists (
        select * from actual_case_triggers
        except
        select * from expected_case_triggers
      )
    )
)
select
  'A1.4.2B_check'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

set local search_path = '';

-- Phase A1.4.2B static Storage upload-policy and reservation-gate checks.
-- The complete expressions preserve every token and schema qualification.
-- pg_depend separately fixes the referenced relation/function OIDs.
with recursive authenticated_role as (
  select role_record.oid
  from pg_catalog.pg_roles as role_record
  where role_record.rolname = 'authenticated'
), applicable_roles(role_oid) as (
  select authenticated_role.oid
  from authenticated_role
  union
  select membership.roleid
  from pg_catalog.pg_auth_members as membership
  inner join applicable_roles as inherited_role
    on inherited_role.role_oid = membership.member
), applicable_insert_policies as (
  select
    policy_record.oid as policy_oid,
    policy_record.polname,
    policy_record.polcmd,
    policy_record.polpermissive,
    policy_record.polroles,
    pg_catalog.pg_get_expr(
      policy_record.polwithcheck,
      policy_record.polrelid,
      false
    ) as rendered_expression
  from pg_catalog.pg_policy as policy_record
  inner join pg_catalog.pg_class as relation
    on relation.oid = policy_record.polrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'storage'
    and relation.relname = 'objects'
    and policy_record.polcmd in ('a', '*')
    and exists (
      select 1
      from pg_catalog.unnest(policy_record.polroles) as policy_role(role_oid)
      where policy_role.role_oid = 0
        or policy_role.role_oid in (
          select applicable_role.role_oid
          from applicable_roles as applicable_role
        )
    )
), policy_contracts as (
  select
    applicable_policy.*,
    pg_catalog.regexp_replace(
      pg_catalog.btrim(
        pg_catalog.replace(
          pg_catalog.replace(
            applicable_policy.rendered_expression,
            pg_catalog.chr(13) || pg_catalog.chr(10),
            pg_catalog.chr(10)
          ),
          pg_catalog.chr(13),
          pg_catalog.chr(10)
        )
      ),
      '[[:space:]]+',
      ' ',
      'g'
    ) as exact_expression,
    array(
      select distinct
        pg_catalog.format(
          '%I.%I',
          dependency_namespace.nspname,
          dependency_relation.relname
        )
      from pg_catalog.pg_depend as dependency_record
      inner join pg_catalog.pg_class as dependency_relation
        on dependency_record.refclassid =
          'pg_catalog.pg_class'::pg_catalog.regclass
        and dependency_relation.oid = dependency_record.refobjid
      inner join pg_catalog.pg_namespace as dependency_namespace
        on dependency_namespace.oid = dependency_relation.relnamespace
      where dependency_record.classid =
          'pg_catalog.pg_policy'::pg_catalog.regclass
        and dependency_record.objid = applicable_policy.policy_oid
      order by 1
    )::text[] as relation_dependencies,
    array(
      select distinct
        pg_catalog.format(
          '%I.%I(%s)',
          dependency_namespace.nspname,
          dependency_procedure.proname,
          pg_catalog.pg_get_function_identity_arguments(
            dependency_procedure.oid
          )
        )
      from pg_catalog.pg_depend as dependency_record
      inner join pg_catalog.pg_proc as dependency_procedure
        on dependency_record.refclassid =
          'pg_catalog.pg_proc'::pg_catalog.regclass
        and dependency_procedure.oid = dependency_record.refobjid
      inner join pg_catalog.pg_namespace as dependency_namespace
        on dependency_namespace.oid = dependency_procedure.pronamespace
      where dependency_record.classid =
          'pg_catalog.pg_policy'::pg_catalog.regclass
        and dependency_record.objid = applicable_policy.policy_oid
      order by 1
    )::text[] as function_dependencies
  from applicable_insert_policies as applicable_policy
), hashed_policy_contracts as (
  select
    policy_contract.*,
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(policy_contract.exact_expression, 'UTF8')
      ),
      'hex'
    ) as expression_sha256
  from policy_contracts as policy_contract
), applicable_select_policies as (
  select
    policy_record.oid as policy_oid,
    policy_record.polname,
    policy_record.polcmd,
    policy_record.polpermissive,
    policy_record.polroles,
    policy_record.polwithcheck,
    pg_catalog.pg_get_expr(
      policy_record.polqual,
      policy_record.polrelid,
      false
    ) as rendered_expression
  from pg_catalog.pg_policy as policy_record
  inner join pg_catalog.pg_class as relation
    on relation.oid = policy_record.polrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'storage'
    and relation.relname = 'objects'
    and policy_record.polcmd in ('r', '*')
    and exists (
      select 1
      from pg_catalog.unnest(policy_record.polroles) as policy_role(role_oid)
      where policy_role.role_oid = 0
        or policy_role.role_oid in (
          select applicable_role.role_oid
          from applicable_roles as applicable_role
        )
    )
), select_policy_contracts as (
  select
    applicable_policy.*,
    pg_catalog.regexp_replace(
      pg_catalog.btrim(
        pg_catalog.replace(
          pg_catalog.replace(
            applicable_policy.rendered_expression,
            pg_catalog.chr(13) || pg_catalog.chr(10),
            pg_catalog.chr(10)
          ),
          pg_catalog.chr(13),
          pg_catalog.chr(10)
        )
      ),
      '[[:space:]]+',
      ' ',
      'g'
    ) as exact_expression,
    array(
      select distinct
        pg_catalog.format(
          '%I.%I',
          dependency_namespace.nspname,
          dependency_relation.relname
        )
      from pg_catalog.pg_depend as dependency_record
      inner join pg_catalog.pg_class as dependency_relation
        on dependency_record.refclassid =
          'pg_catalog.pg_class'::pg_catalog.regclass
        and dependency_relation.oid = dependency_record.refobjid
      inner join pg_catalog.pg_namespace as dependency_namespace
        on dependency_namespace.oid = dependency_relation.relnamespace
      where dependency_record.classid =
          'pg_catalog.pg_policy'::pg_catalog.regclass
        and dependency_record.objid = applicable_policy.policy_oid
      order by 1
    )::text[] as relation_dependencies,
    array(
      select distinct
        pg_catalog.format(
          '%I.%I(%s)',
          dependency_namespace.nspname,
          dependency_procedure.proname,
          pg_catalog.pg_get_function_identity_arguments(
            dependency_procedure.oid
          )
        )
      from pg_catalog.pg_depend as dependency_record
      inner join pg_catalog.pg_proc as dependency_procedure
        on dependency_record.refclassid =
          'pg_catalog.pg_proc'::pg_catalog.regclass
        and dependency_procedure.oid = dependency_record.refobjid
      inner join pg_catalog.pg_namespace as dependency_namespace
        on dependency_namespace.oid = dependency_procedure.pronamespace
      where dependency_record.classid =
          'pg_catalog.pg_policy'::pg_catalog.regclass
        and dependency_record.objid = applicable_policy.policy_oid
      order by 1
    )::text[] as function_dependencies
  from applicable_select_policies as applicable_policy
), hashed_select_policy_contracts as (
  select
    policy_contract.*,
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(policy_contract.exact_expression, 'UTF8')
      ),
      'hex'
    ) as expression_sha256
  from select_policy_contracts as policy_contract
), incompatible_progression_reservations as (
  select pg_catalog.count(*)::bigint as row_count
  from public.student_counseling_progression_evidence as evidence
  inner join public.student_counseling_progression_events as progression_event
    on progression_event.id = evidence.progression_event_id
  where evidence.status =
      'pending'::public.counseling_progression_evidence_status
    and evidence.upload_expires_at > pg_catalog.statement_timestamp()
    and not exists (
      select 1
      from public.student_counselor_assignments as assignment
      inner join public.profiles as student_profile
        on student_profile.id = assignment.student_id
        and student_profile.role = 'student'::public.user_role
      inner join public.profiles as counselor_profile
        on counselor_profile.id = assignment.counselor_id
        and counselor_profile.role = 'counselor'::public.user_role
        and counselor_profile.is_active is true
      inner join auth.users as counselor_auth
        on counselor_auth.id = counselor_profile.id
        and counselor_auth.email_confirmed_at is not null
      where assignment.student_id = progression_event.student_id
        and assignment.counselor_id = evidence.uploaded_by
        and assignment.ended_at is null
    )
), incompatible_document_reservations as (
  select pg_catalog.count(*)::bigint as row_count
  from public.student_university_application_documents as document
  inner join public.student_university_applications as application
    on application.id = document.application_id
  where document.status =
      'pending'::public.university_application_document_status
    and document.upload_expires_at > pg_catalog.statement_timestamp()
    and (
      application.is_archived is true
      or not exists (
        select 1
        from public.student_counselor_assignments as assignment
        inner join public.profiles as student_profile
          on student_profile.id = assignment.student_id
          and student_profile.role = 'student'::public.user_role
        inner join public.profiles as counselor_profile
          on counselor_profile.id = assignment.counselor_id
          and counselor_profile.role = 'counselor'::public.user_role
          and counselor_profile.is_active is true
        inner join auth.users as counselor_auth
          on counselor_auth.id = counselor_profile.id
          and counselor_auth.email_confirmed_at is not null
        where assignment.student_id = application.student_id
          and assignment.counselor_id = document.uploaded_by
          and assignment.ended_at is null
      )
    )
), checks as (
  select *
  from (
    values
      (
        'A1.4.2B applicable Storage INSERT ALL policies match the exact allowlist',
        coalesce((select
          pg_catalog.count(*) = 2
          and pg_catalog.array_agg(polname order by polname) = array[
            'progression_evidence_object_insert_counselor',
            'university_application_document_object_insert_counselor'
          ]::name[]
          from hashed_policy_contracts
        ), false)
      ),
      (
        'A1.4.2B progression evidence static Storage policy contract is exact',
        coalesce((select
          polcmd = 'a'
          and polpermissive is true
          and polroles = array[
            (select authenticated_role.oid from authenticated_role)
          ]::oid[]
          and exact_expression =
            '((bucket_id = ''counseling-progression-evidence''::text) AND ( SELECT public.has_active_verified_kgeo_role(''counselor''::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = ''pending''::public.counseling_progression_evidence_status) AND (evidence.uploaded_by = ( SELECT auth.uid() AS uid)) AND (evidence.upload_expires_at > statement_timestamp())))))'
          and relation_dependencies = array[
            'public.student_counseling_progression_evidence',
            'storage.objects'
          ]::text[]
          and function_dependencies = array[
            'auth.uid()',
            'public.has_active_verified_kgeo_role(p_role public.user_role)'
          ]::text[]
          from hashed_policy_contracts
          where polname =
            'progression_evidence_object_insert_counselor'
        ), false)
      ),
      (
        'A1.4.2B application document static Storage policy contract is exact',
        coalesce((select
          polcmd = 'a'
          and polpermissive is true
          and polroles = array[
            (select authenticated_role.oid from authenticated_role)
          ]::oid[]
          and exact_expression =
            '((bucket_id = ''university-application-documents''::text) AND ( SELECT public.can_upload_university_application_document_object(objects.bucket_id, objects.name) AS can_upload_university_application_document_object))'
          and relation_dependencies = array[
            'storage.objects'
          ]::text[]
          and function_dependencies = array[
            'public.can_upload_university_application_document_object(p_bucket_id text, p_storage_path text)'
          ]::text[]
          from hashed_policy_contracts
          where polname =
            'university_application_document_object_insert_counselor'
        ), false)
      ),
      (
        'A1.4.2B applicable Storage SELECT ALL policies match the exact allowlist',
        coalesce((select
          pg_catalog.count(*) = 2
          and pg_catalog.array_agg(polname order by polname) = array[
            'progression_evidence_object_select_counselor',
            'university_application_document_object_select_counselor'
          ]::name[]
          from applicable_select_policies
        ), false)
      ),
      (
        'A1.4.2B progression evidence Storage SELECT policy contract is exact',
        coalesce((select
          polcmd = 'r'
          and polpermissive is true
          and polroles = array[
            (select authenticated_role.oid from authenticated_role)
          ]::oid[]
          and polwithcheck is null
          and exact_expression =
            '((bucket_id = ''counseling-progression-evidence''::text) AND ( SELECT public.has_active_verified_kgeo_role(''counselor''::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = ''available''::public.counseling_progression_evidence_status)))))'
          and relation_dependencies = array[
            'public.student_counseling_progression_evidence',
            'storage.objects'
          ]::text[]
          and function_dependencies = array[
            'public.has_active_verified_kgeo_role(p_role public.user_role)'
          ]::text[]
          from hashed_select_policy_contracts
          where polname =
            'progression_evidence_object_select_counselor'
        ), false)
      ),
      (
        'A1.4.2B application document Storage SELECT policy contract is exact',
        coalesce((select
          polcmd = 'r'
          and polpermissive is true
          and polroles = array[
            (select authenticated_role.oid from authenticated_role)
          ]::oid[]
          and polwithcheck is null
          and exact_expression =
            '((bucket_id = ''university-application-documents''::text) AND ( SELECT public.can_view_university_application_document_object(objects.bucket_id, objects.name) AS can_view_university_application_document_object))'
          and relation_dependencies = array[
            'storage.objects'
          ]::text[]
          and function_dependencies = array[
            'public.can_view_university_application_document_object(p_bucket_id text, p_storage_path text)'
          ]::text[]
          from hashed_select_policy_contracts
          where polname =
            'university_application_document_object_select_counselor'
        ), false)
      ),
      (
        'A1.4.2B unexpired progression evidence reservations are ownership compatible',
        coalesce((select row_count = 0
          from incompatible_progression_reservations), false)
      ),
      (
        'A1.4.2B unexpired application document reservations are ownership compatible',
        coalesce((select row_count = 0
          from incompatible_document_reservations), false)
      )
  ) as result(check_name, passed)
)
select
  'A1.4.2B_storage_check'::text as category,
  check_name as object_name,
  passed
from checks
order by check_name;

-- Aggregate-only A1.1 required-zero integrity diagnostics. These are schema
-- ownership invariants, not normal operational workload counts.
select
  'A1.1_count'::text as category,
  count_name as object_name,
  row_count
from (
  select
    'profiles whose email violates their role policy'::text as count_name,
    pg_catalog.count(*)::bigint as row_count
  from public.profiles as profile
  where profile.college_email <>
      pg_catalog.lower(pg_catalog.btrim(profile.college_email))
    or pg_catalog.char_length(profile.college_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(profile.college_email, '@', 1)
    ) not between 1 and 64
    or profile.college_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    or (
      profile.role <> 'director'::public.user_role
      and profile.college_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$'
    )

  union all

  select
    'follow-ups owned by a non-counselor profile',
    pg_catalog.count(*)::bigint
  from public.counselor_follow_ups as follow_up
  inner join public.profiles as owner on owner.id = follow_up.counselor_id
  where owner.role <> 'counselor'::public.user_role

  union all

  select
    'assigned consultations referencing a non-counselor profile',
    pg_catalog.count(*)::bigint
  from public.consultation_requests as request
  inner join public.profiles as counselor
    on counselor.id = request.assigned_counselor_id
  where counselor.role <> 'counselor'::public.user_role

  union all

  select
    'current applications with a non-counselor last changer',
    pg_catalog.count(*)::bigint
  from public.student_university_applications as application
  inner join public.profiles as actor on actor.id = application.last_changed_by
  where actor.role <> 'counselor'::public.user_role
) as A1_1_diagnostics
order by count_name;

-- Aggregate-only D1 inventory. No note, follow-up, counselor, or student
-- value is selected.
select
  'aggregate_count'::text as category,
  count_name as object_name,
  row_count
from (
  select
    'counselor private notes'::text as count_name,
    pg_catalog.count(*)::bigint as row_count
  from public.counselor_student_notes

  union all

  select
    'counselor follow-ups',
    pg_catalog.count(*)::bigint
  from public.counselor_follow_ups
) as D1_counts
order by count_name;

-- Aggregate-only legacy diagnostics. These counts contain no student data.
with business_clock as (
  select
    (
      pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
    )::date as business_date,
    (
      pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
    )::time as business_time
)
select
  'legacy_count'::text as category,
  count_name as object_name,
  row_count
from (
  select
    'missing canonical names'::text as count_name,
    pg_catalog.count(*)::bigint as row_count
  from public.profiles as profile
  where profile.role = 'student'::public.user_role
    and (
      profile.full_name is null
      or pg_catalog.btrim(profile.full_name) = ''
    )

  union all

  select
    'unresolved past scheduled consultations',
    pg_catalog.count(*)::bigint
  from public.consultation_requests as request
  cross join business_clock
  where request.status = 'scheduled'::public.consultation_status
    and request.consultation_date is not null
    and request.slot_end is not null
    and (
      request.consultation_date < business_clock.business_date
      or (
        request.consultation_date = business_clock.business_date
        and request.slot_end <= business_clock.business_time
      )
    )

  union all

  select
    'completed consultations without outcome audit',
    pg_catalog.count(*)::bigint
  from public.consultation_requests as request
  where request.status = 'completed'::public.consultation_status
    and request.outcome_recorded_at is null
    and request.outcome_recorded_by is null

  union all

  select
    'invalid outcome audit pairs',
    pg_catalog.count(*)::bigint
  from public.consultation_requests as request
  where (request.outcome_recorded_at is null)
      <> (request.outcome_recorded_by is null)
    or (
      request.outcome_recorded_at is not null
      and request.status::text not in ('completed', 'no_show')
    )
    or (
      request.status::text = 'no_show'
      and (
        request.outcome_recorded_at is null
        or request.outcome_recorded_by is null
      )
    )

  union all

  select
    'profile-not-started students',
    pg_catalog.count(*)::bigint
  from public.profiles as profile
  left join public.student_profiles as student_profile
    on student_profile.student_id = profile.id
  where profile.role = 'student'::public.user_role
    and student_profile.student_id is null
) as legacy_counts
order by count_name;

commit;
