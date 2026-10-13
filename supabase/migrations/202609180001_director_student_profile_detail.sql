-- Complete read-only Director Student 360 projections.
-- No function below grants mutation privileges or returns private Counselor data.

begin;

create function public.get_director_student_identity(p_student_id uuid)
returns table (
  student_id uuid,
  full_name text,
  college_email text,
  account_created_at timestamptz,
  is_active boolean
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Director student profile is temporarily unavailable.';
  end if;
  return query
  select profile.id, profile.full_name, profile.college_email,
    profile.created_at, profile.is_active
  from public.profiles as profile
  where profile.id = p_student_id
    and profile.role = 'student'::public.user_role;
end;
$function$;

create function public.list_director_student_achievement_documents(
  p_student_id uuid
)
returns table (
  document_id uuid,
  achievement_id uuid,
  document_name text,
  mime_type text,
  file_size_bytes bigint,
  status public.student_achievement_document_status,
  prepared_at timestamptz,
  upload_expires_at timestamptz,
  available_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Achievement evidence is temporarily unavailable.';
  end if;
  return query
  select document.id, document.achievement_id, document.document_name,
    document.mime_type, document.file_size_bytes, document.status,
    document.prepared_at, document.upload_expires_at, document.available_at
  from public.student_achievement_documents as document
  where document.student_id = p_student_id
    and document.status = 'available'::public.student_achievement_document_status
  order by document.available_at desc, document.id desc
  limit 500;
end;
$function$;

create function public.authorize_director_student_achievement_document_view(
  p_student_id uuid,
  p_achievement_id uuid,
  p_document_id uuid
)
returns table (
  document_id uuid,
  bucket_id text,
  storage_path text,
  mime_type text
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Achievement evidence could not be opened.';
  end if;
  return query
  select document.id, document.bucket_id, document.storage_path,
    document.mime_type
  from public.student_achievement_documents as document
  where document.id = p_document_id
    and document.achievement_id = p_achievement_id
    and document.student_id = p_student_id
    and document.status = 'available'::public.student_achievement_document_status
  limit 1;
end;
$function$;

create function public.list_director_student_profile_documents(
  p_student_id uuid
)
returns table (
  document_id uuid,
  document_type public.student_profile_document_type,
  display_name text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  available_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Profile documents are temporarily unavailable.';
  end if;
  return query
  select document.id, document.document_type, document.display_name,
    document.original_file_name, document.mime_type,
    document.file_size_bytes, document.available_at
  from public.student_profile_documents as document
  where document.student_id = p_student_id
    and document.status = 'available'::public.student_profile_document_status
  order by document.available_at desc, document.id desc
  limit 500;
end;
$function$;

create function public.authorize_director_student_profile_document_view(
  p_student_id uuid,
  p_document_id uuid
)
returns table (
  document_id uuid,
  bucket_id text,
  storage_path text,
  mime_type text
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Profile document could not be opened.';
  end if;
  return query
  select document.id, document.bucket_id, document.storage_path,
    document.mime_type
  from public.student_profile_documents as document
  where document.id = p_document_id
    and document.student_id = p_student_id
    and document.status = 'available'::public.student_profile_document_status
  limit 1;
end;
$function$;

create function public.get_director_student_case_detail(p_student_id uuid)
returns table (payload jsonb)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Director Student 360 is temporarily unavailable.';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = p_student_id
      and profile.role = 'student'::public.user_role
  ) then
    return;
  end if;

  return query select pg_catalog.jsonb_build_object(
    'progress', pg_catalog.jsonb_build_object(
      'current', (
        select pg_catalog.jsonb_build_object(
          'currentStage', progression.current_stage,
          'workflowState', progression.workflow_state,
          'stageStartedAt', progression.stage_started_at,
          'lastChangedAt', progression.last_changed_at
        )
        from public.student_counseling_progressions as progression
        where progression.student_id = p_student_id
      ),
      'history', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'eventId', event.id,
          'previousStage', event.previous_stage,
          'newStage', event.new_stage,
          'previousState', event.previous_state,
          'newState', event.new_state,
          'changedAt', event.changed_at
        ) order by event.changed_at desc, event.id desc)
        from (
          select history.*
          from public.student_counseling_progression_events as history
          where history.student_id = p_student_id
          order by history.changed_at desc, history.id desc limit 50
        ) as event
      ), '[]'::jsonb),
      'semesterSummaries', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'summaryId', summary.id,
          'academicPeriod', summary.academic_period,
          'progressSummary', summary.progress_summary,
          'achievementsHighlights', summary.achievements_highlights,
          'areasRequiringAttention', summary.areas_requiring_attention,
          'nextSemesterActions', summary.next_semester_actions,
          'counselorFullName', coalesce(counselor.full_name, 'Counselor'),
          'createdAt', summary.created_at
        ) order by summary.created_at desc, summary.id desc)
        from (
          select semester.*
          from public.counselor_student_semester_summaries as semester
          where semester.student_id = p_student_id
          order by semester.created_at desc, semester.id desc limit 20
        ) as summary
        inner join public.profiles as counselor on counselor.id = summary.created_by
      ), '[]'::jsonb)
    ),
    'applications', coalesce((
      select pg_catalog.jsonb_agg(application_payload.payload
        order by application_payload.last_changed_at desc,
          application_payload.application_id desc)
      from (
        select application.id as application_id, application.last_changed_at,
          pg_catalog.jsonb_build_object(
            'applicationId', application.id,
            'universityName', application.university_name,
            'programmeName', application.programme_name,
            'countryCode', application.country_code,
            'degreeLevel', application.degree_level,
            'intakeTerm', application.intake_term,
            'intakeYear', application.intake_year,
            'applicationStatus', application.current_status,
            'submissionDeadline', application.submission_deadline,
            'submittedAt', application.submitted_at,
            'isPrimary', application.is_primary,
            'isArchived', application.is_archived,
            'lastChangedAt', application.last_changed_at,
            'journey', pg_catalog.jsonb_build_object(
              'universityDecision', coalesce(journey.university_decision,
                'pending'::public.university_application_decision),
              'universityDecisionDate', journey.university_decision_date,
              'offerStatus', coalesce(journey.offer_status,
                'none'::public.university_application_offer_status),
              'offerDate', journey.offer_date,
              'conditionalOfferRequirements', journey.conditional_offer_requirements,
              'conditionDueDate', journey.condition_due_date,
              'conditionsSatisfiedDate', journey.conditions_satisfied_date,
              'studentDecision', coalesce(journey.student_decision,
                'pending'::public.university_application_student_decision),
              'studentDecisionDate', journey.student_decision_date,
              'feeStatus', coalesce(journey.fee_status,
                'not_started'::public.university_application_fee_status),
              'feePaymentDate', journey.fee_payment_date,
              'visaStatus', coalesce(journey.visa_status,
                'not_started'::public.university_application_visa_status),
              'visaSubmissionDate', journey.visa_submission_date,
              'visaDecisionDate', journey.visa_decision_date,
              'enrollmentStatus', coalesce(journey.enrollment_status,
                'not_enrolled'::public.university_application_enrollment_status),
              'enrollmentDate', journey.enrollment_date,
              'versionNumber', coalesce(journey.version_number, 0),
              'updatedAt', journey.updated_at
            ),
            'history', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'eventId', event.id,
                'versionNumber', event.version_number,
                'universityDecision', event.university_decision,
                'offerStatus', event.offer_status,
                'studentDecision', event.student_decision,
                'feeStatus', event.fee_status,
                'visaStatus', event.visa_status,
                'enrollmentStatus', event.enrollment_status,
                'changedAt', event.changed_at
              ) order by event.version_number desc, event.id desc)
              from (
                select journey_event.*
                from public.student_university_application_journey_events
                  as journey_event
                where journey_event.application_id = application.id
                order by journey_event.version_number desc,
                  journey_event.changed_at desc, journey_event.id desc limit 20
              ) as event
            ), '[]'::jsonb)
          ) as payload
        from public.student_university_applications as application
        left join public.student_university_application_journeys as journey
          on journey.application_id = application.id
        where application.student_id = p_student_id
        order by application.last_changed_at desc, application.id desc limit 100
      ) as application_payload
    ), '[]'::jsonb),
    'readinessAssessments', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'assessmentId', assessment.id,
        'revisionNumber', assessment.revision_number,
        'rubricVersion', assessment.rubric_version,
        'scores', pg_catalog.jsonb_build_object(
          'academicReadiness', assessment.academic_readiness_score,
          'intellectualProjects', assessment.intellectual_projects_score,
          'intellectualDistinction', assessment.intellectual_distinction_score,
          'professionalExperience', assessment.professional_experience_score,
          'professionalIndustry', assessment.professional_industry_score,
          'globalLeadership', assessment.global_leadership_score,
          'globalExposure', assessment.global_exposure_score,
          'globalDistinction', assessment.global_distinction_score,
          'applicationGmap', assessment.application_gmap_score,
          'applicationAdvisory', assessment.application_advisory_score,
          'applicationDocuments', assessment.application_documents_score,
          'applicationShortlist', assessment.application_shortlist_score,
          'applicationSubmitted', assessment.application_submitted_score
        ),
        'rationales', pg_catalog.jsonb_build_object(
          'academicReadiness', assessment.academic_readiness_rationale,
          'intellectualProjects', assessment.intellectual_projects_rationale,
          'intellectualDistinction', assessment.intellectual_distinction_rationale,
          'professionalExperience', assessment.professional_experience_rationale,
          'professionalIndustry', assessment.professional_industry_rationale,
          'globalLeadership', assessment.global_leadership_rationale,
          'globalExposure', assessment.global_exposure_rationale,
          'globalDistinction', assessment.global_distinction_rationale,
          'applicationGmap', assessment.application_gmap_rationale,
          'applicationAdvisory', assessment.application_advisory_rationale,
          'applicationDocuments', assessment.application_documents_rationale,
          'applicationShortlist', assessment.application_shortlist_rationale,
          'applicationSubmitted', assessment.application_submitted_rationale
        ),
        'dimensionTotals', pg_catalog.jsonb_build_object(
          'academicReadiness', assessment.academic_readiness_total,
          'intellectualDepth', assessment.intellectual_depth_total,
          'professionalReadiness', assessment.professional_readiness_total,
          'globalLeadershipProfile', assessment.global_leadership_total,
          'applicationStrength', assessment.application_strength_total
        ),
        'totalScore', assessment.total_score,
        'readinessBand', assessment.readiness_band,
        'assessmentRationale', assessment.assessment_rationale,
        'parentSafeSummary', assessment.parent_safe_summary,
        'evidenceSchemaVersion', assessment.evidence_schema_version,
        'evidenceSnapshot', assessment.evidence_snapshot,
        'evidenceCapturedAt', assessment.evidence_captured_at,
        'assessorFullName', coalesce(counselor.full_name, 'Counselor'),
        'assessedAt', assessment.assessed_at
      ) order by assessment.revision_number desc, assessment.id desc)
      from (
        select readiness.*
        from public.student_global_readiness_assessments as readiness
        where readiness.student_id = p_student_id
        order by readiness.revision_number desc, readiness.id desc limit 20
      ) as assessment
      inner join public.profiles as counselor on counselor.id = assessment.assessed_by
    ), '[]'::jsonb),
    'consultations', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'consultationId', consultation.id,
        'requestNumber', consultation.request_number,
        'consultationDate', consultation.consultation_date,
        'slotStart', consultation.slot_start,
        'slotEnd', consultation.slot_end,
        'status', consultation.status,
        'counselorFullName', counselor.full_name,
        'outcomeRecordedAt', consultation.outcome_recorded_at,
        'submittedAt', consultation.submitted_at
      ) order by consultation.submitted_at desc, consultation.id desc)
      from (
        select request.*
        from public.consultation_requests as request
        where request.student_id = p_student_id
        order by request.submitted_at desc, request.id desc limit 100
      ) as consultation
      left join public.profiles as counselor
        on counselor.id = consultation.assigned_counselor_id
        and counselor.role = 'counselor'::public.user_role
    ), '[]'::jsonb),
    'primaryCounselor', (
      select pg_catalog.jsonb_build_object(
        'assignmentId', assignment.id,
        'counselorId', counselor.id,
        'fullName', counselor.full_name,
        'collegeEmail', counselor.college_email,
        'assignedAt', assignment.assigned_at,
        'status', 'active'
      )
      from public.student_counselor_assignments as assignment
      inner join public.profiles as counselor
        on counselor.id = assignment.counselor_id
        and counselor.role = 'counselor'::public.user_role
      where assignment.student_id = p_student_id
        and assignment.ended_at is null
      limit 1
    ),
    'parentReports', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reportId', report.id,
        'academicPeriod', report.academic_period,
        'versionNumber', report.version_number,
        'status', report.status,
        'updatedAt', report.updated_at,
        'finalizedAt', report.finalized_at,
        'finalPdfAvailable', report.final_pdf_storage_path is not null
      ) order by report.updated_at desc, report.id desc)
      from (
        select parent_report.*
        from public.parent_reports as parent_report
        where parent_report.student_id = p_student_id
        order by parent_report.updated_at desc, parent_report.id desc limit 50
      ) as report
    ), '[]'::jsonb)
  );
end;
$function$;

do $function_contract$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'get_director_student_identity(uuid)',
    'list_director_student_achievement_documents(uuid)',
    'authorize_director_student_achievement_document_view(uuid,uuid,uuid)',
    'list_director_student_profile_documents(uuid)',
    'authorize_director_student_profile_document_view(uuid,uuid)',
    'get_director_student_case_detail(uuid)'
  ]::text[] loop
    execute pg_catalog.format(
      'alter function public.%s owner to postgres', v_signature
    );
    execute pg_catalog.format(
      'revoke all on function public.%s from public, anon, authenticated, service_role',
      v_signature
    );
    execute pg_catalog.format(
      'grant execute on function public.%s to authenticated', v_signature
    );
  end loop;
end;
$function_contract$;

comment on function public.get_director_student_case_detail(uuid) is
  'Bounded read-only Director Student 360 projection. Excludes private notes, follow-ups, actor identifiers, Storage paths, and signed URLs.';

commit;
