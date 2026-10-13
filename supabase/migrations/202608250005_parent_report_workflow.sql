-- K-GEO Parent Report Workflow V1.
-- Structured source facts are snapshotted independently from editable,
-- parent-safe narrative. Private Counselor Notes and follow-ups are not read.

begin;

set local search_path = '';

create type public.parent_report_status as enum (
  'draft',
  'director_review',
  'revision_requested',
  'approved',
  'finalized'
);

create type public.parent_report_event_type as enum (
  'created',
  'counselor_edited',
  'submitted',
  'director_edited',
  'revision_requested',
  'resubmitted',
  'approved',
  'finalized',
  'new_version_created',
  'attachment_added',
  'attachment_removed'
);

create type public.parent_report_attachment_source as enum (
  'report_upload',
  'profile_document',
  'application_document',
  'progression_evidence'
);

create type public.parent_report_attachment_status as enum (
  'pending',
  'available',
  'removed'
);

create table public.parent_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  academic_period text not null,
  version_number integer not null,
  status public.parent_report_status not null,
  source_snapshot jsonb not null,
  semester_overview text,
  strengths_highlights text,
  areas_requiring_attention text,
  next_actions text,
  counselor_remarks text,
  director_remarks text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  last_edited_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  finalized_by uuid references public.profiles(id) on delete restrict,
  finalized_at timestamptz,
  final_pdf_bucket_id text,
  final_pdf_storage_path text,
  final_pdf_size_bytes bigint,
  final_pdf_sha256 text,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint parent_reports_student_period_version_key
    unique (student_id, academic_period, version_number),
  constraint parent_reports_period_check check (
    academic_period = pg_catalog.regexp_replace(
      pg_catalog.btrim(academic_period), '[[:space:]]+', ' ', 'g'
    )
    and pg_catalog.char_length(academic_period) between 1 and 80
    and academic_period !~ '[[:cntrl:]]'
  ),
  constraint parent_reports_version_check check (version_number >= 1),
  constraint parent_reports_source_snapshot_check check (
    pg_catalog.jsonb_typeof(source_snapshot) = 'object'
    and source_snapshot ? 'schema_version'
    and source_snapshot ? 'student'
    and source_snapshot ? 'applications'
    and pg_catalog.octet_length(source_snapshot::text) <= 262144
    and not (source_snapshot ? 'private_notes')
    and not (source_snapshot ? 'private_follow_ups')
  ),
  constraint parent_reports_narrative_check check (
    (semester_overview is null or (
      semester_overview = pg_catalog.regexp_replace(
        pg_catalog.btrim(semester_overview), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(semester_overview) between 1 and 3000
      and semester_overview !~ '[[:cntrl:]]'
    ))
    and (strengths_highlights is null or (
      strengths_highlights = pg_catalog.regexp_replace(
        pg_catalog.btrim(strengths_highlights), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(strengths_highlights) between 1 and 3000
      and strengths_highlights !~ '[[:cntrl:]]'
    ))
    and (areas_requiring_attention is null or (
      areas_requiring_attention = pg_catalog.regexp_replace(
        pg_catalog.btrim(areas_requiring_attention), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(areas_requiring_attention) between 1 and 3000
      and areas_requiring_attention !~ '[[:cntrl:]]'
    ))
    and (next_actions is null or (
      next_actions = pg_catalog.regexp_replace(
        pg_catalog.btrim(next_actions), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(next_actions) between 1 and 3000
      and next_actions !~ '[[:cntrl:]]'
    ))
    and (counselor_remarks is null or (
      counselor_remarks = pg_catalog.regexp_replace(
        pg_catalog.btrim(counselor_remarks), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(counselor_remarks) between 1 and 2000
      and counselor_remarks !~ '[[:cntrl:]]'
    ))
    and (director_remarks is null or (
      director_remarks = pg_catalog.regexp_replace(
        pg_catalog.btrim(director_remarks), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(director_remarks) between 1 and 2000
      and director_remarks !~ '[[:cntrl:]]'
    ))
  ),
  constraint parent_reports_final_pdf_check check (
    (
      status <> 'finalized'::public.parent_report_status
      and finalized_by is null and finalized_at is null
      and final_pdf_bucket_id is null and final_pdf_storage_path is null
      and final_pdf_size_bytes is null and final_pdf_sha256 is null
    )
    or (
      status = 'finalized'::public.parent_report_status
      and finalized_by is not null and finalized_at is not null
      and approved_by is not null and approved_at is not null
      and final_pdf_bucket_id = 'parent-report-attachments'
      and final_pdf_storage_path is not null
      and final_pdf_size_bytes between 1 and 52428800
      and final_pdf_sha256 ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint parent_reports_review_check check (
    (reviewed_by is null) = (reviewed_at is null)
    and (approved_by is null) = (approved_at is null)
  ),
  constraint parent_reports_timestamp_check check (updated_at >= created_at)
);

create unique index parent_reports_one_active_period_idx
  on public.parent_reports (student_id, academic_period)
  where status <> 'finalized'::public.parent_report_status;

create index parent_reports_director_queue_idx
  on public.parent_reports (status, updated_at desc, id desc);

create table public.parent_report_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  report_id uuid not null references public.parent_reports(id) on delete restrict,
  event_type public.parent_report_event_type not null,
  from_status public.parent_report_status,
  to_status public.parent_report_status not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  event_reason text,
  narrative_snapshot jsonb not null,
  attachment_manifest_snapshot jsonb not null,
  occurred_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint parent_report_events_reason_check check (
    event_reason is null or (
      event_reason = pg_catalog.regexp_replace(
        pg_catalog.btrim(event_reason), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(event_reason) between 1 and 1000
      and event_reason !~ '[[:cntrl:]]'
    )
  ),
  constraint parent_report_events_snapshots_check check (
    pg_catalog.jsonb_typeof(narrative_snapshot) = 'object'
    and pg_catalog.jsonb_typeof(attachment_manifest_snapshot) = 'array'
  )
);

create index parent_report_events_history_idx
  on public.parent_report_events (report_id, occurred_at desc, id desc);

create table public.parent_report_attachments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  report_id uuid not null references public.parent_reports(id) on delete restrict,
  source_type public.parent_report_attachment_source not null,
  source_document_id uuid,
  display_name text not null,
  bucket_id text not null,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  sort_order integer not null,
  status public.parent_report_attachment_status not null,
  added_by uuid not null references public.profiles(id) on delete restrict,
  added_at timestamptz not null default pg_catalog.statement_timestamp(),
  upload_expires_at timestamptz,
  available_at timestamptz,
  removed_by uuid references public.profiles(id) on delete restrict,
  removed_at timestamptz,
  constraint parent_report_attachments_report_sort_key
    unique (report_id, sort_order),
  constraint parent_report_attachments_display_check check (
    display_name = pg_catalog.regexp_replace(
      pg_catalog.btrim(display_name), '[[:space:]]+', ' ', 'g'
    ) and pg_catalog.char_length(display_name) between 2 and 100
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint parent_report_attachments_mime_check check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png')
    and file_size_bytes between 1 and 10485760
  ),
  constraint parent_report_attachments_source_check check (
    (
      source_type = 'report_upload'::public.parent_report_attachment_source
      and source_document_id is null
      and bucket_id = 'parent-report-attachments'
      and upload_expires_at is not null
    )
    or (
      source_type <> 'report_upload'::public.parent_report_attachment_source
      and source_document_id is not null
      and upload_expires_at is null
      and status <> 'pending'::public.parent_report_attachment_status
    )
  ),
  constraint parent_report_attachments_lifecycle_check check (
    (
      status = 'pending'::public.parent_report_attachment_status
      and available_at is null and removed_by is null and removed_at is null
    )
    or (
      status = 'available'::public.parent_report_attachment_status
      and available_at is not null and removed_by is null and removed_at is null
    )
    or (
      status = 'removed'::public.parent_report_attachment_status
      and available_at is not null and removed_by is not null
      and removed_at is not null and removed_at >= available_at
    )
  )
);

create index parent_report_attachments_available_idx
  on public.parent_report_attachments (report_id, sort_order, id)
  where status = 'available'::public.parent_report_attachment_status;

create unique index parent_report_attachments_active_source_idx
  on public.parent_report_attachments (
    report_id, source_type, source_document_id
  )
  where source_document_id is not null
    and status <> 'removed'::public.parent_report_attachment_status;

alter table public.parent_reports owner to postgres;
alter table public.parent_report_events owner to postgres;
alter table public.parent_report_attachments owner to postgres;

alter table public.parent_reports enable row level security;
alter table public.parent_reports force row level security;
alter table public.parent_report_events enable row level security;
alter table public.parent_report_events force row level security;
alter table public.parent_report_attachments enable row level security;
alter table public.parent_report_attachments force row level security;

revoke all on table public.parent_reports
  from public, anon, authenticated, service_role;
revoke all on table public.parent_report_events
  from public, anon, authenticated, service_role;
revoke all on table public.parent_report_attachments
  from public, anon, authenticated, service_role;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'parent-report-attachments',
  'parent-report-attachments',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do nothing;

do $bucket_contract$
begin
  if not exists (
    select 1 from storage.buckets as bucket
    where bucket.id = 'parent-report-attachments'
      and bucket.name = 'parent-report-attachments'
      and bucket.public is false
      and bucket.file_size_limit = 52428800
      and bucket.allowed_mime_types =
        array['application/pdf', 'image/jpeg', 'image/png']::text[]
  ) then
    raise exception using errcode = '55000',
      message = 'Parent Report bucket does not match the reviewed contract';
  end if;
end;
$bucket_contract$;

create function private.build_parent_report_source_snapshot(
  p_student_id uuid,
  p_academic_period text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'captured_at', pg_catalog.statement_timestamp(),
    'academic_period', p_academic_period,
    'student', coalesce((
      select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'full_name', profile.full_name,
        'roll_number', student_profile.roll_number,
        'course', student_profile.course,
        'department', student_profile.department,
        'current_year', student_profile.current_year,
        'current_semester', student_profile.current_semester,
        'graduation_year', student_profile.graduation_year,
        'cgpa', student_profile.cgpa,
        'cgpa_scale', student_profile.cgpa_scale,
        'active_backlogs', student_profile.active_backlogs,
        'cleared_backlogs', student_profile.cleared_backlogs,
        'academic_remarks', student_profile.academic_remarks
      ))
      from public.profiles as profile
      left join public.student_profiles as student_profile
        on student_profile.student_id = profile.id
      where profile.id = p_student_id
        and profile.role = 'student'::public.user_role
        and profile.is_active
    ), '{}'::jsonb),
    'preferences', coalesce((
      select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'preferred_study_area', preference.preferred_study_area,
        'preferred_domain', preference.preferred_domain,
        'study_pathway', preference.study_pathway,
        'global_track_program', preference.global_track_program,
        'preferred_countries', preference.preferred_countries,
        'preferred_program_areas', preference.preferred_program_areas,
        'target_intake', preference.target_intake,
        'budget_range', preference.budget_range,
        'study_mode', preference.study_mode,
        'funding_method', preference.funding_method
      ))
      from public.student_preferences as preference
      where preference.student_id = p_student_id
    ), '{}'::jsonb),
    'achievements', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'type', achievement.achievement_type,
          'title', achievement.title,
          'organization', achievement.organization,
          'date', achievement.achievement_date,
          'description', achievement.description
        )) order by achievement.achievement_date desc nulls last,
          achievement.created_at desc, achievement.id desc
      )
      from (
        select source.*
        from public.student_achievements as source
        where source.student_id = p_student_id
        order by source.achievement_date desc nulls last,
          source.created_at desc, source.id desc
        limit 50
      ) as achievement
    ), '[]'::jsonb),
    'study_abroad_exams', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'exam_name', exam.exam_name,
          'custom_exam_name', exam.custom_exam_name,
          'status', exam.exam_status,
          'attempt_number', exam.attempt_number,
          'planned_date', exam.planned_date,
          'completed_date', exam.completed_date,
          'score', exam.score,
          'valid_until', exam.valid_until
        )) order by exam.created_at desc, exam.id desc
      )
      from (
        select source.*
        from public.student_test_scores as source
        where source.student_id = p_student_id
        order by source.created_at desc, source.id desc
        limit 50
      ) as exam
    ), '[]'::jsonb),
    'journey_progress', coalesce((
      select pg_catalog.jsonb_build_object(
        'current_stage', progression.current_stage,
        'workflow_state', progression.workflow_state,
        'stage_started_at', progression.stage_started_at,
        'last_changed_at', progression.last_changed_at
      )
      from public.student_counseling_progressions as progression
      where progression.student_id = p_student_id
    ), '{}'::jsonb),
    'applications', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'university_name', application.university_name,
          'programme_name', application.programme_name,
          'country_code', application.country_code,
          'degree_level', application.degree_level,
          'intake_term', application.intake_term,
          'intake_year', application.intake_year,
          'application_status', application.current_status,
          'submitted_at', application.submitted_at,
          'university_decision', coalesce(
            journey.university_decision,
            'pending'::public.university_application_decision
          ),
          'offer_status', coalesce(
            journey.offer_status,
            'none'::public.university_application_offer_status
          ),
          'student_decision', coalesce(
            journey.student_decision,
            'pending'::public.university_application_student_decision
          ),
          'fee_status', coalesce(
            journey.fee_status,
            'not_started'::public.university_application_fee_status
          ),
          'visa_status', coalesce(
            journey.visa_status,
            'not_started'::public.university_application_visa_status
          ),
          'enrollment_status', coalesce(
            journey.enrollment_status,
            'not_enrolled'::public.university_application_enrollment_status
          )
        )) order by application.is_primary desc,
          application.last_changed_at desc, application.id desc
      )
      from (
        select source.*
        from public.student_university_applications as source
        where source.student_id = p_student_id
          and source.is_archived is false
        order by source.is_primary desc, source.last_changed_at desc,
          source.id desc
        limit 50
      ) as application
      left join public.student_university_application_journeys as journey
        on journey.application_id = application.id
    ), '[]'::jsonb),
    'semester_summary', coalesce((
      select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'academic_period', summary.academic_period,
        'progress_summary', summary.progress_summary,
        'achievements_highlights', summary.achievements_highlights,
        'areas_requiring_attention', summary.areas_requiring_attention,
        'next_semester_actions', summary.next_semester_actions,
        'recorded_at', summary.created_at
      ))
      from public.counselor_student_semester_summaries as summary
      where summary.student_id = p_student_id
        and summary.academic_period = p_academic_period
      order by summary.created_at desc, summary.id desc
      limit 1
    ), '{}'::jsonb)
  );
$function$;

create function private.parent_report_narrative_snapshot(p_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'semester_overview', report.semester_overview,
    'strengths_highlights', report.strengths_highlights,
    'areas_requiring_attention', report.areas_requiring_attention,
    'next_actions', report.next_actions,
    'counselor_remarks', report.counselor_remarks,
    'director_remarks', report.director_remarks
  ))
  from public.parent_reports as report
  where report.id = p_report_id;
$function$;

create function private.parent_report_attachment_manifest(p_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'attachment_id', attachment.id,
      'source_type', attachment.source_type,
      'display_name', attachment.display_name,
      'mime_type', attachment.mime_type,
      'file_size_bytes', attachment.file_size_bytes,
      'sort_order', attachment.sort_order
    ) order by attachment.sort_order, attachment.id
  ), '[]'::jsonb)
  from public.parent_report_attachments as attachment
  where attachment.report_id = p_report_id
    and attachment.status =
      'available'::public.parent_report_attachment_status;
$function$;

create function private.append_parent_report_event(
  p_report_id uuid,
  p_event_type public.parent_report_event_type,
  p_from_status public.parent_report_status,
  p_to_status public.parent_report_status,
  p_actor_id uuid,
  p_event_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_reason text;
begin
  v_reason := nullif(pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_event_reason, '')),
    '[[:space:]]+', ' ', 'g'
  ), '');
  if v_reason is not null and (
    pg_catalog.char_length(v_reason) > 1000
    or v_reason ~ '[[:cntrl:]]'
  ) then
    raise exception using errcode = '22023',
      message = 'Parent Report event is invalid.';
  end if;

  insert into public.parent_report_events (
    report_id, event_type, from_status, to_status, actor_id,
    event_reason, narrative_snapshot, attachment_manifest_snapshot,
    occurred_at
  ) values (
    p_report_id, p_event_type, p_from_status, p_to_status, p_actor_id,
    v_reason,
    private.parent_report_narrative_snapshot(p_report_id),
    private.parent_report_attachment_manifest(p_report_id),
    pg_catalog.statement_timestamp()
  );
end;
$function$;

create function private.can_edit_parent_report(p_report_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_report public.parent_reports%rowtype;
begin
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id;
  if v_report.id is null or (select auth.uid()) is null then return false; end if;

  return (
    v_report.status in (
      'draft'::public.parent_report_status,
      'revision_requested'::public.parent_report_status
    )
    and public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is true
    and public.is_active_primary_counselor_for_student(v_report.student_id)
      is true
  ) or (
    v_report.status = 'director_review'::public.parent_report_status
    and public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is true
  );
exception when others then return false;
end;
$function$;

alter function private.can_edit_parent_report(uuid) owner to postgres;
revoke all on function private.can_edit_parent_report(uuid)
  from public, anon, authenticated, service_role;

create function public.list_parent_report_attachment_candidates(
  p_report_id uuid
)
returns table (
  source_type public.parent_report_attachment_source,
  source_document_id uuid,
  display_name text,
  mime_type text,
  file_size_bytes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_report public.parent_reports%rowtype;
  v_is_counselor boolean;
  v_is_director boolean;
begin
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id;
  if v_report.id is null or (select auth.uid()) is null then
    raise exception using errcode = '42501',
      message = 'Parent Report attachments are temporarily unavailable.';
  end if;
  v_is_counselor := public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ) is true and public.is_active_primary_counselor_for_student(
    v_report.student_id
  ) is true;
  v_is_director := public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is true;
  if v_is_counselor is not true and v_is_director is not true then
    raise exception using errcode = '42501',
      message = 'Parent Report attachments are temporarily unavailable.';
  end if;

  return query
  select 'profile_document'::public.parent_report_attachment_source,
    document.id, document.display_name, document.mime_type,
    document.file_size_bytes
  from public.student_profile_documents as document
  where document.student_id = v_report.student_id
    and document.document_type = 'test_score'::public.student_profile_document_type
    and document.status = 'available'::public.student_profile_document_status
    and document.mime_type in ('application/pdf', 'image/jpeg', 'image/png')
    and not exists (
      select 1 from public.parent_report_attachments as existing
      where existing.report_id = v_report.id
        and existing.source_type =
          'profile_document'::public.parent_report_attachment_source
        and existing.source_document_id = document.id
        and existing.status <>
          'removed'::public.parent_report_attachment_status
    )
  union all
  select 'application_document'::public.parent_report_attachment_source,
    document.id, document.document_title, document.mime_type,
    document.file_size_bytes
  from public.student_university_application_documents as document
  inner join public.student_university_applications as application
    on application.id = document.application_id
  where application.student_id = v_report.student_id
    and document.status =
      'available'::public.university_application_document_status
    and document.mime_type in ('application/pdf', 'image/jpeg', 'image/png')
    and not exists (
      select 1 from public.parent_report_attachments as existing
      where existing.report_id = v_report.id
        and existing.source_type =
          'application_document'::public.parent_report_attachment_source
        and existing.source_document_id = document.id
        and existing.status <>
          'removed'::public.parent_report_attachment_status
    )
  union all
  select 'progression_evidence'::public.parent_report_attachment_source,
    evidence.id, evidence.original_file_name, evidence.mime_type,
    evidence.file_size_bytes
  from public.student_counseling_progression_evidence as evidence
  inner join public.student_counseling_progression_events as progression_event
    on progression_event.id = evidence.progression_event_id
  where progression_event.student_id = v_report.student_id
    and evidence.status =
      'available'::public.counseling_progression_evidence_status
    and evidence.mime_type in ('application/pdf', 'image/jpeg', 'image/png')
    and not exists (
      select 1 from public.parent_report_attachments as existing
      where existing.report_id = v_report.id
        and existing.source_type =
          'progression_evidence'::public.parent_report_attachment_source
        and existing.source_document_id = evidence.id
        and existing.status <>
          'removed'::public.parent_report_attachment_status
    )
  order by 1, 3, 2
  limit 100;
end;
$function$;

create function public.add_parent_report_existing_attachment(
  p_report_id uuid,
  p_source_type public.parent_report_attachment_source,
  p_source_document_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
  v_attachment_id uuid;
  v_name text;
  v_bucket text;
  v_path text;
  v_mime text;
  v_size bigint;
  v_sort integer;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;
  v_name := private.normalize_parent_report_text(p_display_name, 100);

  if v_caller_id is null or v_report.id is null or v_name is null
    or pg_catalog.char_length(v_name) < 2
    or private.can_edit_parent_report(v_report.id) is distinct from true
    or p_source_type not in (
      'profile_document'::public.parent_report_attachment_source,
      'application_document'::public.parent_report_attachment_source,
      'progression_evidence'::public.parent_report_attachment_source
    ) then
    raise exception using errcode = '42501',
      message = 'Parent Report attachment could not be added.';
  end if;

  if (
    select pg_catalog.count(*) from public.parent_report_attachments as item
    where item.report_id = v_report.id
      and (
        item.status = 'available'::public.parent_report_attachment_status
        or (
          item.status = 'pending'::public.parent_report_attachment_status
          and item.upload_expires_at > pg_catalog.statement_timestamp()
        )
      )
  ) >= 20 then
    raise exception using errcode = '22023',
      message = 'The Parent Report attachment limit has been reached.';
  end if;

  case p_source_type
    when 'profile_document'::public.parent_report_attachment_source then
      select document.bucket_id, document.storage_path,
        document.mime_type, document.file_size_bytes
      into v_bucket, v_path, v_mime, v_size
      from public.student_profile_documents as document
      where document.id = p_source_document_id
        and document.student_id = v_report.student_id
        and document.document_type =
          'test_score'::public.student_profile_document_type
        and document.status =
          'available'::public.student_profile_document_status;
    when 'application_document'::public.parent_report_attachment_source then
      select document.bucket_id, document.storage_path,
        document.mime_type, document.file_size_bytes
      into v_bucket, v_path, v_mime, v_size
      from public.student_university_application_documents as document
      inner join public.student_university_applications as application
        on application.id = document.application_id
      where document.id = p_source_document_id
        and application.student_id = v_report.student_id
        and document.status =
          'available'::public.university_application_document_status;
    when 'progression_evidence'::public.parent_report_attachment_source then
      select evidence.bucket_id, evidence.storage_path,
        evidence.mime_type, evidence.file_size_bytes
      into v_bucket, v_path, v_mime, v_size
      from public.student_counseling_progression_evidence as evidence
      inner join public.student_counseling_progression_events as progression_event
        on progression_event.id = evidence.progression_event_id
      where evidence.id = p_source_document_id
        and progression_event.student_id = v_report.student_id
        and evidence.status =
          'available'::public.counseling_progression_evidence_status;
    else null;
  end case;

  if v_path is null
    or v_mime not in ('application/pdf', 'image/jpeg', 'image/png')
    or v_size not between 1 and 10485760 then
    raise exception using errcode = '22023',
      message = 'Parent Report attachment could not be added.';
  end if;

  if (
    select coalesce(pg_catalog.sum(item.file_size_bytes), 0)
    from public.parent_report_attachments as item
    where item.report_id = v_report.id
      and item.status = 'available'::public.parent_report_attachment_status
  ) + v_size > 41943040 then
    raise exception using errcode = '22023',
      message = 'The Parent Report attachment size limit has been reached.';
  end if;

  select coalesce(pg_catalog.max(item.sort_order), 0) + 1 into v_sort
  from public.parent_report_attachments as item
  where item.report_id = v_report.id;
  v_attachment_id := pg_catalog.gen_random_uuid();

  insert into public.parent_report_attachments (
    id, report_id, source_type, source_document_id, display_name,
    bucket_id, storage_path, mime_type, file_size_bytes, sort_order,
    status, added_by, added_at, available_at
  ) values (
    v_attachment_id, v_report.id, p_source_type, p_source_document_id,
    v_name, v_bucket, v_path, v_mime, v_size, v_sort,
    'available'::public.parent_report_attachment_status,
    v_caller_id, pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()
  );

  perform private.append_parent_report_event(
    v_report.id, 'attachment_added'::public.parent_report_event_type,
    v_report.status, v_report.status, v_caller_id,
    'Existing safe document selected.'
  );
  return v_attachment_id;
end;
$function$;

create function public.prepare_parent_report_attachment_upload(
  p_report_id uuid,
  p_display_name text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns table (
  attachment_id uuid,
  bucket_id text,
  storage_path text,
  mime_type text,
  upload_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
  v_attachment_id uuid;
  v_name text;
  v_original_name text;
  v_extension text;
  v_path text;
  v_sort integer;
  v_expires timestamptz;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;
  v_name := private.normalize_parent_report_text(p_display_name, 100);
  v_original_name := nullif(pg_catalog.btrim(p_original_file_name), '');

  if v_caller_id is null or v_report.id is null or v_name is null
    or pg_catalog.char_length(v_name) < 2
    or private.can_edit_parent_report(v_report.id) is distinct from true
    or v_original_name is null
    or pg_catalog.char_length(v_original_name) > 255
    or v_original_name ~ '[/\\]'
    or v_original_name ~ '[[:cntrl:]]'
    or p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png')
    or p_file_size_bytes not between 1 and 10485760 then
    raise exception using errcode = '42501',
      message = 'Parent Report attachment upload could not be prepared.';
  end if;

  v_extension := pg_catalog.lower(
    pg_catalog.regexp_replace(v_original_name, '^.*[.]', '')
  );
  if v_extension = v_original_name or not (
    (p_mime_type = 'application/pdf' and v_extension = 'pdf')
    or (p_mime_type = 'image/jpeg' and v_extension in ('jpg', 'jpeg'))
    or (p_mime_type = 'image/png' and v_extension = 'png')
  ) then
    raise exception using errcode = '22023',
      message = 'Parent Report attachment upload could not be prepared.';
  end if;

  if (
    select pg_catalog.count(*) from public.parent_report_attachments as item
    where item.report_id = v_report.id
      and (
        item.status = 'available'::public.parent_report_attachment_status
        or (
          item.status = 'pending'::public.parent_report_attachment_status
          and item.upload_expires_at > pg_catalog.statement_timestamp()
        )
      )
  ) >= 20 then
    raise exception using errcode = '22023',
      message = 'The Parent Report attachment limit has been reached.';
  end if;

  if (
    select coalesce(pg_catalog.sum(item.file_size_bytes), 0)
    from public.parent_report_attachments as item
    where item.report_id = v_report.id
      and (
        item.status = 'available'::public.parent_report_attachment_status
        or (
          item.status = 'pending'::public.parent_report_attachment_status
          and item.upload_expires_at > pg_catalog.statement_timestamp()
        )
      )
  ) + p_file_size_bytes > 41943040 then
    raise exception using errcode = '22023',
      message = 'The Parent Report attachment size limit has been reached.';
  end if;

  select coalesce(pg_catalog.max(item.sort_order), 0) + 1 into v_sort
  from public.parent_report_attachments as item
  where item.report_id = v_report.id;
  v_attachment_id := pg_catalog.gen_random_uuid();
  v_expires := pg_catalog.statement_timestamp() + interval '2 hours';
  v_path := pg_catalog.concat(
    'attachments/', v_report.id::text, '/', v_attachment_id::text,
    '/', v_attachment_id::text, '.', v_extension
  );

  insert into public.parent_report_attachments (
    id, report_id, source_type, source_document_id, display_name,
    bucket_id, storage_path, mime_type, file_size_bytes, sort_order,
    status, added_by, added_at, upload_expires_at
  ) values (
    v_attachment_id, v_report.id,
    'report_upload'::public.parent_report_attachment_source,
    null, v_name, 'parent-report-attachments', v_path,
    p_mime_type, p_file_size_bytes, v_sort,
    'pending'::public.parent_report_attachment_status,
    v_caller_id, pg_catalog.statement_timestamp(), v_expires
  );

  return query select v_attachment_id, 'parent-report-attachments'::text,
    v_path, p_mime_type, v_expires;
end;
$function$;

create function public.finalize_parent_report_attachment_upload(
  p_attachment_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_attachment public.parent_report_attachments%rowtype;
  v_report public.parent_reports%rowtype;
  v_actual_size bigint;
  v_actual_mime_type text;
begin
  v_caller_id := (select auth.uid());
  select attachment.* into v_attachment
  from public.parent_report_attachments as attachment
  where attachment.id = p_attachment_id
  for update;
  select report.* into v_report
  from public.parent_reports as report
  where report.id = v_attachment.report_id
  for update;

  select
    case
      when coalesce(storage_object.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (storage_object.metadata ->> 'size')::bigint
      else null
    end,
    nullif(pg_catalog.lower(storage_object.metadata ->> 'mimetype'), '')
  into v_actual_size, v_actual_mime_type
  from storage.objects as storage_object
  where storage_object.bucket_id = v_attachment.bucket_id
    and storage_object.name = v_attachment.storage_path;

  if v_caller_id is null or v_attachment.id is null or v_report.id is null
    or private.can_edit_parent_report(v_report.id) is distinct from true
    or v_attachment.source_type <>
      'report_upload'::public.parent_report_attachment_source
    or v_attachment.status <>
      'pending'::public.parent_report_attachment_status
    or v_attachment.upload_expires_at <= pg_catalog.statement_timestamp()
    or v_actual_size is null
    or v_actual_size <> v_attachment.file_size_bytes
    or v_actual_size not between 1 and 10485760
    or v_actual_mime_type is null
    or v_actual_mime_type <> v_attachment.mime_type
    or v_actual_mime_type not in (
      'application/pdf', 'image/jpeg', 'image/png'
    ) then
    raise exception using errcode = '42501',
      message = 'Parent Report attachment upload could not be finalized.';
  end if;

  update public.parent_report_attachments as attachment set
    status = 'available'::public.parent_report_attachment_status,
    available_at = pg_catalog.statement_timestamp()
  where attachment.id = v_attachment.id;

  perform private.append_parent_report_event(
    v_report.id, 'attachment_added'::public.parent_report_event_type,
    v_report.status, v_report.status, v_caller_id,
    'Report-specific attachment uploaded.'
  );
  return v_attachment.id;
end;
$function$;

create function public.remove_parent_report_attachment(p_attachment_id uuid)
returns table (
  attachment_id uuid,
  delete_storage_object boolean,
  bucket_id text,
  storage_path text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_attachment public.parent_report_attachments%rowtype;
  v_report public.parent_reports%rowtype;
begin
  v_caller_id := (select auth.uid());
  select attachment.* into v_attachment
  from public.parent_report_attachments as attachment
  where attachment.id = p_attachment_id
  for update;
  select report.* into v_report
  from public.parent_reports as report
  where report.id = v_attachment.report_id
  for update;

  if v_caller_id is null or v_attachment.id is null or v_report.id is null
    or private.can_edit_parent_report(v_report.id) is distinct from true
    or v_attachment.status <>
      'available'::public.parent_report_attachment_status then
    raise exception using errcode = '42501',
      message = 'Parent Report attachment could not be removed.';
  end if;

  update public.parent_report_attachments as attachment set
    status = 'removed'::public.parent_report_attachment_status,
    removed_by = v_caller_id,
    removed_at = pg_catalog.statement_timestamp()
  where attachment.id = v_attachment.id;

  perform private.append_parent_report_event(
    v_report.id, 'attachment_removed'::public.parent_report_event_type,
    v_report.status, v_report.status, v_caller_id,
    'Attachment removed from report.'
  );

  return query select v_attachment.id,
    v_attachment.source_type =
      'report_upload'::public.parent_report_attachment_source,
    v_attachment.bucket_id, v_attachment.storage_path;
end;
$function$;

create function private.normalize_parent_report_text(
  p_value text,
  p_maximum integer
)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_value text;
begin
  v_value := nullif(pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_value, '')),
    '[[:space:]]+', ' ', 'g'
  ), '');
  if v_value is not null and (
    pg_catalog.char_length(v_value) > p_maximum
    or v_value ~ '[[:cntrl:]]'
  ) then
    raise exception using errcode = '22023',
      message = 'Parent Report narrative is invalid.';
  end if;
  return v_value;
end;
$function$;

alter function private.normalize_parent_report_text(text, integer)
  owner to postgres;
revoke all on function private.normalize_parent_report_text(text, integer)
  from public, anon, authenticated, service_role;

create function public.save_counselor_parent_report_narrative(
  p_report_id uuid,
  p_semester_overview text,
  p_strengths_highlights text,
  p_areas_requiring_attention text,
  p_next_actions text,
  p_counselor_remarks text
)
returns public.parent_report_status
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;

  if v_caller_id is null or v_report.id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true
    or public.is_active_primary_counselor_for_student(v_report.student_id)
      is distinct from true
    or v_report.status not in (
      'draft'::public.parent_report_status,
      'revision_requested'::public.parent_report_status
    ) then
    raise exception using errcode = '42501',
      message = 'Parent Report cannot be edited.';
  end if;

  update public.parent_reports as report set
    semester_overview = private.normalize_parent_report_text(
      p_semester_overview, 3000
    ),
    strengths_highlights = private.normalize_parent_report_text(
      p_strengths_highlights, 3000
    ),
    areas_requiring_attention = private.normalize_parent_report_text(
      p_areas_requiring_attention, 3000
    ),
    next_actions = private.normalize_parent_report_text(p_next_actions, 3000),
    counselor_remarks = private.normalize_parent_report_text(
      p_counselor_remarks, 2000
    ),
    last_edited_by = v_caller_id,
    updated_at = pg_catalog.statement_timestamp()
  where report.id = v_report.id;

  perform private.append_parent_report_event(
    v_report.id, 'counselor_edited'::public.parent_report_event_type,
    v_report.status, v_report.status, v_caller_id, null
  );
  return v_report.status;
end;
$function$;

create function public.save_director_parent_report_narrative(
  p_report_id uuid,
  p_semester_overview text,
  p_strengths_highlights text,
  p_areas_requiring_attention text,
  p_next_actions text,
  p_counselor_remarks text,
  p_director_remarks text
)
returns public.parent_report_status
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;

  if v_caller_id is null or v_report.id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true
    or v_report.status <> 'director_review'::public.parent_report_status then
    raise exception using errcode = '42501',
      message = 'Parent Report cannot be edited.';
  end if;

  update public.parent_reports as report set
    semester_overview = private.normalize_parent_report_text(
      p_semester_overview, 3000
    ),
    strengths_highlights = private.normalize_parent_report_text(
      p_strengths_highlights, 3000
    ),
    areas_requiring_attention = private.normalize_parent_report_text(
      p_areas_requiring_attention, 3000
    ),
    next_actions = private.normalize_parent_report_text(p_next_actions, 3000),
    counselor_remarks = private.normalize_parent_report_text(
      p_counselor_remarks, 2000
    ),
    director_remarks = private.normalize_parent_report_text(
      p_director_remarks, 2000
    ),
    reviewed_by = v_caller_id,
    reviewed_at = pg_catalog.statement_timestamp(),
    last_edited_by = v_caller_id,
    updated_at = pg_catalog.statement_timestamp()
  where report.id = v_report.id;

  perform private.append_parent_report_event(
    v_report.id, 'director_edited'::public.parent_report_event_type,
    v_report.status, v_report.status, v_caller_id, null
  );
  return v_report.status;
end;
$function$;

create function public.submit_parent_report(p_report_id uuid)
returns public.parent_report_status
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
  v_event public.parent_report_event_type;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;

  if v_caller_id is null or v_report.id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true
    or public.is_active_primary_counselor_for_student(v_report.student_id)
      is distinct from true
    or v_report.status not in (
      'draft'::public.parent_report_status,
      'revision_requested'::public.parent_report_status
    ) then
    raise exception using errcode = '42501',
      message = 'Parent Report could not be submitted.';
  end if;

  v_event := case when v_report.status =
      'revision_requested'::public.parent_report_status
    then 'resubmitted'::public.parent_report_event_type
    else 'submitted'::public.parent_report_event_type end;

  update public.parent_reports as report set
    status = 'director_review'::public.parent_report_status,
    submitted_at = pg_catalog.statement_timestamp(),
    reviewed_by = null, reviewed_at = null,
    approved_by = null, approved_at = null,
    last_edited_by = v_caller_id,
    updated_at = pg_catalog.statement_timestamp()
  where report.id = v_report.id;

  perform private.append_parent_report_event(
    v_report.id, v_event, v_report.status,
    'director_review'::public.parent_report_status, v_caller_id, null
  );
  return 'director_review'::public.parent_report_status;
end;
$function$;

create function public.request_parent_report_revision(
  p_report_id uuid,
  p_reason text
)
returns public.parent_report_status
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
  v_reason text;
begin
  v_caller_id := (select auth.uid());
  v_reason := private.normalize_parent_report_text(p_reason, 1000);
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;

  if v_caller_id is null or v_report.id is null or v_reason is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true
    or v_report.status <> 'director_review'::public.parent_report_status then
    raise exception using errcode = '42501',
      message = 'Parent Report revision could not be requested.';
  end if;

  update public.parent_reports as report set
    status = 'revision_requested'::public.parent_report_status,
    director_remarks = coalesce(report.director_remarks, v_reason),
    reviewed_by = v_caller_id,
    reviewed_at = pg_catalog.statement_timestamp(),
    last_edited_by = v_caller_id,
    updated_at = pg_catalog.statement_timestamp()
  where report.id = v_report.id;

  perform private.append_parent_report_event(
    v_report.id,
    'revision_requested'::public.parent_report_event_type,
    v_report.status, 'revision_requested'::public.parent_report_status,
    v_caller_id, v_reason
  );
  return 'revision_requested'::public.parent_report_status;
end;
$function$;

create function public.approve_parent_report(p_report_id uuid)
returns public.parent_report_status
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;

  if v_caller_id is null or v_report.id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true
    or v_report.status <> 'director_review'::public.parent_report_status then
    raise exception using errcode = '42501',
      message = 'Parent Report could not be approved.';
  end if;

  update public.parent_reports as report set
    status = 'approved'::public.parent_report_status,
    reviewed_by = coalesce(report.reviewed_by, v_caller_id),
    reviewed_at = coalesce(report.reviewed_at, pg_catalog.statement_timestamp()),
    approved_by = v_caller_id,
    approved_at = pg_catalog.statement_timestamp(),
    last_edited_by = v_caller_id,
    updated_at = pg_catalog.statement_timestamp()
  where report.id = v_report.id;

  perform private.append_parent_report_event(
    v_report.id, 'approved'::public.parent_report_event_type,
    v_report.status, 'approved'::public.parent_report_status,
    v_caller_id, null
  );
  return 'approved'::public.parent_report_status;
end;
$function$;

alter function private.build_parent_report_source_snapshot(uuid, text)
  owner to postgres;
alter function private.parent_report_narrative_snapshot(uuid)
  owner to postgres;
alter function private.parent_report_attachment_manifest(uuid)
  owner to postgres;
alter function private.append_parent_report_event(
  uuid, public.parent_report_event_type, public.parent_report_status,
  public.parent_report_status, uuid, text
) owner to postgres;

revoke all on function private.build_parent_report_source_snapshot(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function private.parent_report_narrative_snapshot(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.parent_report_attachment_manifest(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.append_parent_report_event(
  uuid, public.parent_report_event_type, public.parent_report_status,
  public.parent_report_status, uuid, text
) from public, anon, authenticated, service_role;

create function public.create_parent_report_draft(
  p_student_id uuid,
  p_academic_period text
)
returns table (
  report_id uuid,
  version_number integer,
  status public.parent_report_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_period text;
  v_version integer;
  v_report_id uuid;
  v_snapshot jsonb;
  v_summary public.counselor_student_semester_summaries%rowtype;
begin
  v_caller_id := (select auth.uid());
  v_period := nullif(pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_academic_period, '')),
    '[[:space:]]+', ' ', 'g'
  ), '');

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true
    or v_period is null
    or pg_catalog.char_length(v_period) > 80
    or v_period ~ '[[:cntrl:]]' then
    raise exception using errcode = '42501',
      message = 'Parent Report draft could not be created.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat(p_student_id::text, ':', v_period), 0
    )
  );

  if exists (
    select 1 from public.parent_reports as report
    where report.student_id = p_student_id
      and report.academic_period = v_period
      and report.status <> 'finalized'::public.parent_report_status
  ) then
    raise exception using errcode = '23505',
      message = 'An editable Parent Report already exists.';
  end if;

  select coalesce(pg_catalog.max(report.version_number), 0) + 1
  into v_version
  from public.parent_reports as report
  where report.student_id = p_student_id
    and report.academic_period = v_period;

  v_snapshot := private.build_parent_report_source_snapshot(
    p_student_id, v_period
  );
  if v_snapshot -> 'student' = '{}'::jsonb then
    raise exception using errcode = '22023',
      message = 'Parent Report source facts are unavailable.';
  end if;

  select summary.* into v_summary
  from public.counselor_student_semester_summaries as summary
  where summary.student_id = p_student_id
    and summary.academic_period = v_period
  order by summary.created_at desc, summary.id desc
  limit 1;

  v_report_id := pg_catalog.gen_random_uuid();
  insert into public.parent_reports (
    id, student_id, academic_period, version_number, status,
    source_snapshot, semester_overview, strengths_highlights,
    areas_requiring_attention, next_actions, counselor_remarks,
    director_remarks, created_by, last_edited_by, created_at, updated_at
  ) values (
    v_report_id, p_student_id, v_period, v_version,
    'draft'::public.parent_report_status, v_snapshot,
    v_summary.progress_summary,
    v_summary.achievements_highlights,
    v_summary.areas_requiring_attention,
    v_summary.next_semester_actions,
    null, null, v_caller_id, v_caller_id,
    pg_catalog.statement_timestamp(), pg_catalog.statement_timestamp()
  );

  perform private.append_parent_report_event(
    v_report_id,
    case when v_version = 1
      then 'created'::public.parent_report_event_type
      else 'new_version_created'::public.parent_report_event_type
    end,
    null,
    'draft'::public.parent_report_status,
    v_caller_id,
    case when v_version = 1 then null else 'Correction version created.' end
  );

  return query select v_report_id, v_version,
    'draft'::public.parent_report_status;
end;
$function$;

create function public.list_counselor_parent_reports(
  p_student_id uuid,
  p_limit integer default 20
)
returns table (
  report_id uuid,
  academic_period text,
  version_number integer,
  status public.parent_report_status,
  updated_at timestamptz,
  finalized_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 20
    or (select auth.uid()) is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Parent Reports are temporarily unavailable.';
  end if;

  return query
  select report.id, report.academic_period, report.version_number,
    report.status, report.updated_at, report.finalized_at
  from public.parent_reports as report
  where report.student_id = p_student_id
  order by report.academic_period desc, report.version_number desc,
    report.id desc
  limit p_limit;
end;
$function$;

create function public.list_director_parent_reports(p_limit integer default 100)
returns table (
  report_id uuid,
  student_id uuid,
  student_name text,
  academic_period text,
  version_number integer,
  status public.parent_report_status,
  counselor_name text,
  updated_at timestamptz,
  finalized_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
    or (select auth.uid()) is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using errcode = '42501',
      message = 'Parent Reports are temporarily unavailable.';
  end if;

  return query
  select report.id, report.student_id,
    coalesce(student.full_name, 'Name not provided'),
    report.academic_period, report.version_number, report.status,
    coalesce(counselor.full_name, creator.full_name, 'Counselor'),
    report.updated_at, report.finalized_at
  from public.parent_reports as report
  inner join public.profiles as student on student.id = report.student_id
  left join public.student_counselor_assignments as assignment
    on assignment.student_id = report.student_id
    and assignment.ended_at is null
  left join public.profiles as counselor
    on counselor.id = assignment.counselor_id
  inner join public.profiles as creator
    on creator.id = report.created_by
  order by
    case report.status
      when 'director_review'::public.parent_report_status then 1
      when 'approved'::public.parent_report_status then 2
      when 'revision_requested'::public.parent_report_status then 3
      when 'draft'::public.parent_report_status then 4
      else 5
    end,
    report.updated_at desc, report.id desc
  limit p_limit;
end;
$function$;

create function public.get_parent_report_workspace(p_report_id uuid)
returns table (payload jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_report public.parent_reports%rowtype;
  v_is_counselor boolean;
  v_is_director boolean;
begin
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id;

  if v_report.id is null or (select auth.uid()) is null then
    raise exception using errcode = '42501',
      message = 'Parent Report is temporarily unavailable.';
  end if;

  v_is_counselor := public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ) is true and public.is_active_primary_counselor_for_student(
    v_report.student_id
  ) is true;
  v_is_director := public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is true;

  if v_is_counselor is not true and v_is_director is not true then
    raise exception using errcode = '42501',
      message = 'Parent Report is temporarily unavailable.';
  end if;

  return query
  select pg_catalog.jsonb_build_object(
    'report', pg_catalog.jsonb_build_object(
      'report_id', v_report.id,
      'student_id', v_report.student_id,
      'academic_period', v_report.academic_period,
      'version_number', v_report.version_number,
      'status', v_report.status,
      'source_snapshot', v_report.source_snapshot,
      'semester_overview', v_report.semester_overview,
      'strengths_highlights', v_report.strengths_highlights,
      'areas_requiring_attention', v_report.areas_requiring_attention,
      'next_actions', v_report.next_actions,
      'counselor_remarks', v_report.counselor_remarks,
      'director_remarks', v_report.director_remarks,
      'created_at', v_report.created_at,
      'updated_at', v_report.updated_at,
      'submitted_at', v_report.submitted_at,
      'reviewed_at', v_report.reviewed_at,
      'approved_at', v_report.approved_at,
      'finalized_at', v_report.finalized_at,
      'final_pdf_available', v_report.final_pdf_storage_path is not null,
      'viewer_role', case when v_is_director then 'director' else 'counselor' end
    ),
    'attachments', private.parent_report_attachment_manifest(v_report.id),
    'events', coalesce((
      select pg_catalog.jsonb_agg(event_row.payload order by event_row.occurred_at desc)
      from (
        select event.occurred_at,
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'event_id', event.id,
            'event_type', event.event_type,
            'from_status', event.from_status,
            'to_status', event.to_status,
            'actor_name', coalesce(actor.full_name, 'K-GEO staff'),
            'event_reason', event.event_reason,
            'occurred_at', event.occurred_at
          )) as payload
        from public.parent_report_events as event
        inner join public.profiles as actor on actor.id = event.actor_id
        where event.report_id = v_report.id
        order by event.occurred_at desc, event.id desc
        limit 50
      ) as event_row
    ), '[]'::jsonb)
  );
end;
$function$;

create function public.get_parent_report_render_payload(p_report_id uuid)
returns table (payload jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_report public.parent_reports%rowtype;
  v_is_counselor boolean;
  v_is_director boolean;
begin
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id;

  if v_report.id is null or (select auth.uid()) is null then
    raise exception using errcode = '42501',
      message = 'Parent Report is temporarily unavailable.';
  end if;

  v_is_counselor := public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ) is true and public.is_active_primary_counselor_for_student(
    v_report.student_id
  ) is true;
  v_is_director := public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is true;

  if v_is_counselor is not true and v_is_director is not true then
    raise exception using errcode = '42501',
      message = 'Parent Report is temporarily unavailable.';
  end if;

  return query
  select pg_catalog.jsonb_build_object(
    'report_id', v_report.id,
    'student_id', v_report.student_id,
    'academic_period', v_report.academic_period,
    'version_number', v_report.version_number,
    'status', v_report.status,
    'source_snapshot', v_report.source_snapshot,
    'semester_overview', v_report.semester_overview,
    'strengths_highlights', v_report.strengths_highlights,
    'areas_requiring_attention', v_report.areas_requiring_attention,
    'next_actions', v_report.next_actions,
    'counselor_remarks', v_report.counselor_remarks,
    'director_remarks', v_report.director_remarks,
    'counselor_name', coalesce((
      select actor.full_name
      from public.parent_report_events as event
      inner join public.profiles as actor on actor.id = event.actor_id
      where event.report_id = v_report.id
        and event.event_type in (
          'submitted'::public.parent_report_event_type,
          'resubmitted'::public.parent_report_event_type
        )
      order by event.occurred_at desc, event.id desc
      limit 1
    ), (
      select creator.full_name from public.profiles as creator
      where creator.id = v_report.created_by
    )),
    'director_name', coalesce((
      select approver.full_name from public.profiles as approver
      where approver.id = v_report.approved_by
    ), (
      select reviewer.full_name from public.profiles as reviewer
      where reviewer.id = v_report.reviewed_by
    )),
    'approved_at', v_report.approved_at,
    'finalized_at', v_report.finalized_at,
    'final_pdf_bucket_id', v_report.final_pdf_bucket_id,
    'final_pdf_storage_path', v_report.final_pdf_storage_path,
    'attachments', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'attachment_id', attachment.id,
          'display_name', attachment.display_name,
          'bucket_id', attachment.bucket_id,
          'storage_path', attachment.storage_path,
          'mime_type', attachment.mime_type,
          'file_size_bytes', attachment.file_size_bytes,
          'sort_order', attachment.sort_order
        ) order by attachment.sort_order, attachment.id
      )
      from public.parent_report_attachments as attachment
      where attachment.report_id = v_report.id
        and attachment.status =
          'available'::public.parent_report_attachment_status
    ), '[]'::jsonb)
  );
end;
$function$;

create function public.finalize_parent_report(
  p_report_id uuid,
  p_file_size_bytes bigint,
  p_sha256 text
)
returns table (
  report_id uuid,
  bucket_id text,
  storage_path text,
  status public.parent_report_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
  v_path text;
  v_actual_size bigint;
  v_actual_mime_type text;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;
  v_path := pg_catalog.concat(
    'final/', v_report.student_id::text, '/', v_report.id::text,
    '/v', v_report.version_number::text, '.pdf'
  );

  select
    case
      when coalesce(storage_object.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (storage_object.metadata ->> 'size')::bigint
      else null
    end,
    nullif(pg_catalog.lower(storage_object.metadata ->> 'mimetype'), '')
  into v_actual_size, v_actual_mime_type
  from storage.objects as storage_object
  where storage_object.bucket_id = 'parent-report-attachments'
    and storage_object.name = v_path;

  if v_caller_id is null or v_report.id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true
    or v_report.status <> 'approved'::public.parent_report_status
    or p_file_size_bytes not between 1 and 52428800
    or p_sha256 !~ '^[0-9a-f]{64}$'
    or v_actual_size is null
    or v_actual_size <> p_file_size_bytes
    or v_actual_size not between 1 and 52428800
    or v_actual_mime_type is null
    or v_actual_mime_type <> 'application/pdf' then
    raise exception using errcode = '42501',
      message = 'Parent Report could not be finalized.';
  end if;

  update public.parent_reports as report set
    status = 'finalized'::public.parent_report_status,
    finalized_by = v_caller_id,
    finalized_at = pg_catalog.statement_timestamp(),
    final_pdf_bucket_id = 'parent-report-attachments',
    final_pdf_storage_path = v_path,
    final_pdf_size_bytes = v_actual_size,
    final_pdf_sha256 = p_sha256,
    last_edited_by = v_caller_id,
    updated_at = pg_catalog.statement_timestamp()
  where report.id = v_report.id;

  perform private.append_parent_report_event(
    v_report.id, 'finalized'::public.parent_report_event_type,
    v_report.status, 'finalized'::public.parent_report_status,
    v_caller_id, null
  );

  return query select v_report.id, 'parent-report-attachments'::text,
    v_path, 'finalized'::public.parent_report_status;
end;
$function$;

create function public.authorize_parent_report_download(p_report_id uuid)
returns table (
  bucket_id text,
  storage_path text,
  download_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_report public.parent_reports%rowtype;
  v_allowed boolean;
begin
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id;
  if v_report.id is null or (select auth.uid()) is null then
    raise exception using errcode = '42501',
      message = 'Parent Report download is unavailable.';
  end if;
  v_allowed := public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is true or (
    public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is true
    and public.is_active_primary_counselor_for_student(v_report.student_id)
      is true
  );

  if v_allowed is not true
    or v_report.status <> 'finalized'::public.parent_report_status
    or v_report.final_pdf_bucket_id is null
    or v_report.final_pdf_storage_path is null then
    raise exception using errcode = '42501',
      message = 'Parent Report download is unavailable.';
  end if;

  return query select v_report.final_pdf_bucket_id,
    v_report.final_pdf_storage_path,
    pg_catalog.concat(
      'K-GEO-Parent-Report-', v_report.academic_period, '-v',
      v_report.version_number::text, '.pdf'
    );
end;
$function$;

create function public.can_upload_parent_report_object(
  p_bucket_id text,
  p_storage_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or p_bucket_id <> 'parent-report-attachments' then return false; end if;
  return exists (
    select 1
    from public.parent_report_attachments as attachment
    where attachment.bucket_id = p_bucket_id
      and attachment.storage_path = p_storage_path
      and attachment.source_type =
        'report_upload'::public.parent_report_attachment_source
      and attachment.status =
        'pending'::public.parent_report_attachment_status
      and attachment.added_by = (select auth.uid())
      and attachment.upload_expires_at > pg_catalog.statement_timestamp()
      and private.can_edit_parent_report(attachment.report_id) is true
  );
exception when others then return false;
end;
$function$;

create function public.can_view_parent_report_object(
  p_bucket_id text,
  p_storage_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
begin
  if (select auth.uid()) is null
    or p_bucket_id <> 'parent-report-attachments' then return false; end if;

  select report.student_id into v_student_id
  from public.parent_reports as report
  where (
    report.final_pdf_bucket_id = p_bucket_id
    and report.final_pdf_storage_path = p_storage_path
    and report.status = 'finalized'::public.parent_report_status
  ) or exists (
    select 1 from public.parent_report_attachments as attachment
    where attachment.report_id = report.id
      and attachment.bucket_id = p_bucket_id
      and attachment.storage_path = p_storage_path
      and attachment.status =
        'available'::public.parent_report_attachment_status
  )
  limit 1;

  return v_student_id is not null and (
    public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is true or (
      public.has_active_verified_kgeo_role(
        'counselor'::public.user_role
      ) is true
      and public.is_active_primary_counselor_for_student(v_student_id) is true
    )
  );
exception when others then return false;
end;
$function$;

create function public.can_delete_parent_report_object(
  p_bucket_id text,
  p_storage_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or p_bucket_id <> 'parent-report-attachments' then return false; end if;
  return exists (
    select 1 from public.parent_report_attachments as attachment
    where attachment.bucket_id = p_bucket_id
      and attachment.storage_path = p_storage_path
      and attachment.source_type =
        'report_upload'::public.parent_report_attachment_source
      and private.can_edit_parent_report(attachment.report_id) is true
      and (
        (
          attachment.status =
            'removed'::public.parent_report_attachment_status
          and attachment.removed_by = (select auth.uid())
          and attachment.removed_at >
            pg_catalog.statement_timestamp() - interval '5 minutes'
        )
        or (
          attachment.status =
            'pending'::public.parent_report_attachment_status
          and attachment.added_by = (select auth.uid())
          and attachment.upload_expires_at is not null
        )
      )
  );
exception when others then return false;
end;
$function$;

do $function_contract$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'create_parent_report_draft(uuid,text)',
    'list_counselor_parent_reports(uuid,integer)',
    'list_director_parent_reports(integer)',
    'get_parent_report_workspace(uuid)',
    'get_parent_report_render_payload(uuid)',
    'save_counselor_parent_report_narrative(uuid,text,text,text,text,text)',
    'save_director_parent_report_narrative(uuid,text,text,text,text,text,text)',
    'submit_parent_report(uuid)',
    'request_parent_report_revision(uuid,text)',
    'approve_parent_report(uuid)',
    'finalize_parent_report(uuid,bigint,text)',
    'authorize_parent_report_download(uuid)',
    'list_parent_report_attachment_candidates(uuid)',
    'add_parent_report_existing_attachment(uuid,public.parent_report_attachment_source,uuid,text)',
    'prepare_parent_report_attachment_upload(uuid,text,text,text,bigint)',
    'finalize_parent_report_attachment_upload(uuid)',
    'remove_parent_report_attachment(uuid)',
    'can_upload_parent_report_object(text,text)',
    'can_view_parent_report_object(text,text)',
    'can_delete_parent_report_object(text,text)'
  ]::text[] loop
    execute pg_catalog.format(
      'alter function public.%s owner to postgres', v_signature
    );
    execute pg_catalog.format(
      'revoke all on function public.%s from public, anon, authenticated, service_role',
      v_signature
    );
  end loop;
end;
$function_contract$;

grant execute on function public.create_parent_report_draft(uuid, text)
  to authenticated;
grant execute on function public.list_counselor_parent_reports(uuid, integer)
  to authenticated;
grant execute on function public.list_director_parent_reports(integer)
  to authenticated;
grant execute on function public.get_parent_report_workspace(uuid)
  to authenticated;
grant execute on function public.get_parent_report_render_payload(uuid)
  to authenticated;
grant execute on function public.save_counselor_parent_report_narrative(
  uuid, text, text, text, text, text
) to authenticated;
grant execute on function public.save_director_parent_report_narrative(
  uuid, text, text, text, text, text, text
) to authenticated;
grant execute on function public.submit_parent_report(uuid) to authenticated;
grant execute on function public.request_parent_report_revision(uuid, text)
  to authenticated;
grant execute on function public.approve_parent_report(uuid) to authenticated;
grant execute on function public.finalize_parent_report(uuid, bigint, text)
  to authenticated;
grant execute on function public.authorize_parent_report_download(uuid)
  to authenticated;
grant execute on function public.list_parent_report_attachment_candidates(uuid)
  to authenticated;
grant execute on function public.add_parent_report_existing_attachment(
  uuid, public.parent_report_attachment_source, uuid, text
) to authenticated;
grant execute on function public.prepare_parent_report_attachment_upload(
  uuid, text, text, text, bigint
) to authenticated;
grant execute on function public.finalize_parent_report_attachment_upload(uuid)
  to authenticated;
grant execute on function public.remove_parent_report_attachment(uuid)
  to authenticated;
grant execute on function public.can_upload_parent_report_object(text, text)
  to authenticated;
grant execute on function public.can_view_parent_report_object(text, text)
  to authenticated;
grant execute on function public.can_delete_parent_report_object(text, text)
  to authenticated;

grant usage on type public.parent_report_status to authenticated;
grant usage on type public.parent_report_event_type to authenticated;
grant usage on type public.parent_report_attachment_source to authenticated;
grant usage on type public.parent_report_attachment_status to authenticated;

commit;
