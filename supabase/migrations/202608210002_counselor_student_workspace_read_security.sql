-- K-GEO Final Client Review Step 2: Counselor Student Workspace read security.
-- Detailed student data is readable by a counselor only while that counselor
-- owns the student's current active Primary Counselor assignment.

begin;

-- This existing predicate derives the counselor identity from auth.uid() and
-- checks the one active assignment (ended_at is null). It returns only a
-- boolean and is therefore safe to expose to authenticated RLS evaluation.
revoke all on function public.is_active_primary_counselor_for_student(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.is_active_primary_counselor_for_student(uuid)
  to authenticated;

-- Remove the four historical Counselor-wide direct-read branches.
drop policy student_profiles_select_counselor_all
  on public.student_profiles;
drop policy student_preferences_select_counselor_all
  on public.student_preferences;
drop policy student_test_scores_select_counselor_all
  on public.student_test_scores;
drop policy student_achievements_select_counselor_all
  on public.student_achievements;

create policy student_profiles_select_primary_counselor
on public.student_profiles
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_profiles.student_id
  ))
);

create policy student_preferences_select_primary_counselor
on public.student_preferences
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_preferences.student_id
  ))
);

create policy student_test_scores_select_primary_counselor
on public.student_test_scores
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_test_scores.student_id
  ))
);

create policy student_achievements_select_primary_counselor
on public.student_achievements
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_achievements.student_id
  ))
);

-- Director organization-wide reads are a separate, role-derived branch.
-- Student-own policies from the historical foundation remain unchanged.
create policy student_profiles_select_director_all
on public.student_profiles
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ))
);

create policy student_preferences_select_director_all
on public.student_preferences
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ))
);

create policy student_test_scores_select_director_all
on public.student_test_scores
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ))
);

create policy student_achievements_select_director_all
on public.student_achievements
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ))
);

comment on policy student_profiles_select_primary_counselor
  on public.student_profiles is
  'Only the current active Primary Counselor may read a student detailed profile.';
comment on policy student_preferences_select_primary_counselor
  on public.student_preferences is
  'Only the current active Primary Counselor may read a student preferences.';
comment on policy student_test_scores_select_primary_counselor
  on public.student_test_scores is
  'Only the current active Primary Counselor may read student test records.';
comment on policy student_achievements_select_primary_counselor
  on public.student_achievements is
  'Only the current active Primary Counselor may read student achievements.';

-- Current Student 360 institutional reads must follow the same assignment
-- boundary. These policies do not change any mutation grant or trigger.
drop policy student_counseling_progressions_select_counselor
  on public.student_counseling_progressions;
drop policy student_counseling_progression_events_select_counselor
  on public.student_counseling_progression_events;
drop policy progression_event_corrections_select_counselor
  on public.student_counseling_progression_event_corrections;
drop policy progression_evidence_select_counselor
  on public.student_counseling_progression_evidence;
drop policy student_university_applications_select_counselor
  on public.student_university_applications;
drop policy student_university_application_events_select_counselor
  on public.student_university_application_events;
drop policy university_application_documents_select_counselor
  on public.student_university_application_documents;

create policy student_counseling_progressions_select_primary_counselor
on public.student_counseling_progressions
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_counseling_progressions.student_id
  ))
);

create policy student_counseling_progression_events_select_primary_counselor
on public.student_counseling_progression_events
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_counseling_progression_events.student_id
  ))
);

create policy progression_event_corrections_select_primary_counselor
on public.student_counseling_progression_event_corrections
for select
to authenticated
using (
  exists (
    select 1
    from public.student_counseling_progression_events as event
    where event.id =
      student_counseling_progression_event_corrections.target_event_id
      and public.is_active_primary_counselor_for_student(
        event.student_id
      ) is true
  )
);

create policy progression_evidence_select_primary_counselor
on public.student_counseling_progression_evidence
for select
to authenticated
using (
  exists (
    select 1
    from public.student_counseling_progression_events as event
    where event.id =
      student_counseling_progression_evidence.progression_event_id
      and public.is_active_primary_counselor_for_student(
        event.student_id
      ) is true
  )
);

create policy student_university_applications_select_primary_counselor
on public.student_university_applications
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_university_applications.student_id
  ))
);

create policy student_university_application_events_select_primary_counselor
on public.student_university_application_events
for select
to authenticated
using (
  exists (
    select 1
    from public.student_university_applications as application
    where application.id =
      student_university_application_events.application_id
      and public.is_active_primary_counselor_for_student(
        application.student_id
      ) is true
  )
);

create policy university_application_documents_select_primary_counselor
on public.student_university_application_documents
for select
to authenticated
using (
  status = 'available'::public.university_application_document_status
  and exists (
    select 1
    from public.student_university_applications as application
    where application.id =
      student_university_application_documents.application_id
      and public.is_active_primary_counselor_for_student(
        application.student_id
      ) is true
  )
);

-- Preserve the established UUID-to-identity signature while turning it into
-- the common fail-closed Student Workspace entry boundary.
create or replace function public.get_counselor_student_identity(
  p_student_id uuid
)
returns table (
  student_id uuid,
  full_name text,
  college_email text,
  account_created_at timestamptz,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_student_id is null
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    return;
  end if;

  return query
  select
    student_account.id,
    student_account.full_name,
    student_account.college_email,
    student_account.created_at,
    student_account.is_active
  from public.profiles as student_account
  where student_account.id = p_student_id
    and student_account.role = 'student'::public.user_role;
exception
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The student identity is temporarily unavailable';
end;
$function$;

alter function public.get_counselor_student_identity(uuid)
  owner to postgres;

revoke all on function public.get_counselor_student_identity(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_counselor_student_identity(uuid)
  to authenticated;

comment on function public.get_counselor_student_identity(uuid) is
  'Returns one student identity only to that student current active Primary Counselor.';

-- The historical correction-context RPC is security-definer and therefore
-- must enforce assignment ownership itself instead of relying on table RLS.
create or replace function
  public.get_counselor_progression_correction_context(
    p_student_id uuid,
    p_event_ids uuid[]
  )
returns table (
  target_event_id uuid,
  correction_id uuid,
  correction_type public.counseling_progression_correction_type,
  restored_stage public.counseling_progression_stage,
  restored_state public.counseling_progression_state,
  restored_stage_started_at timestamptz,
  correction_reason text,
  corrected_at timestamptz,
  effective_event_exists boolean,
  latest_effective_event_id uuid,
  latest_effective_stage public.counseling_progression_stage,
  latest_effective_state public.counseling_progression_state,
  latest_effective_changed_at timestamptz,
  latest_effective_changed_by uuid,
  total_correction_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  requested_count integer;
  distinct_count integer;
  effective_event public.student_counseling_progression_events%rowtype;
  effective_exists boolean;
  correction_count bigint;
begin
  if public.is_active_primary_counselor_for_student(p_student_id)
    is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor access is required';
  end if;

  requested_count := pg_catalog.cardinality(p_event_ids);

  if requested_count is null
    or requested_count < 1
    or requested_count > 20
    or pg_catalog.array_position(p_event_ids, null) is not null then
    raise exception using
      errcode = '22023',
      message = 'The progression correction read request is invalid';
  end if;

  select pg_catalog.count(distinct requested.event_id)::integer
  into distinct_count
  from pg_catalog.unnest(p_event_ids) as requested(event_id);

  if distinct_count <> requested_count
    or (
      select pg_catalog.count(*)::integer
      from public.student_counseling_progression_events as event
      where event.student_id = p_student_id
        and event.id = any(p_event_ids)
    ) <> requested_count then
    raise exception using
      errcode = '22023',
      message = 'The progression correction read request is invalid';
  end if;

  select event.*
  into effective_event
  from public.student_counseling_progression_events as event
  where event.student_id = p_student_id
    and not exists (
      select 1
      from public.student_counseling_progression_event_corrections
        as correction
      where correction.target_event_id = event.id
    )
  order by event.changed_at desc, event.id desc
  limit 1;

  effective_exists := found;

  select pg_catalog.count(*)
  into correction_count
  from public.student_counseling_progression_event_corrections
    as correction
  inner join public.student_counseling_progression_events as event
    on event.id = correction.target_event_id
  where event.student_id = p_student_id;

  return query
  select
    requested.event_id,
    correction.id,
    correction.correction_type,
    correction.restored_stage,
    correction.restored_state,
    correction.restored_stage_started_at,
    correction.correction_reason,
    correction.corrected_at,
    effective_exists,
    case when effective_exists then effective_event.id else null end,
    case
      when effective_exists then effective_event.new_stage
      else null
    end,
    case
      when effective_exists then effective_event.new_state
      else null
    end,
    case
      when effective_exists then effective_event.changed_at
      else null
    end,
    case
      when effective_exists then effective_event.changed_by
      else null
    end,
    correction_count
  from pg_catalog.unnest(p_event_ids) with ordinality
    as requested(event_id, position)
  left join public.student_counseling_progression_event_corrections
    as correction
    on correction.target_event_id = requested.event_id
  order by requested.position;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor access is required';
  when invalid_parameter_value then
    raise exception using
      errcode = '22023',
      message = 'The progression correction read request is invalid';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Official progression corrections could not be loaded';
end;
$function$;

alter function
  public.get_counselor_progression_correction_context(uuid, uuid[])
  owner to postgres;

revoke all on function
  public.get_counselor_progression_correction_context(uuid, uuid[])
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_counselor_progression_correction_context(uuid, uuid[])
  to authenticated;

-- Application-document metadata and private Storage paths remain available
-- only for applications owned by the caller's active Primary Counselor case.
create or replace function public.list_university_application_documents(
  p_application_id uuid
)
returns table (
  document_id uuid,
  application_id uuid,
  document_title text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  available_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
begin
  select application.student_id
  into v_student_id
  from public.student_university_applications as application
  where application.id = p_application_id;

  if public.is_active_primary_counselor_for_student(v_student_id)
    is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Documents are temporarily unavailable.';
  end if;

  return query
  select
    document.id,
    document.application_id,
    document.document_title,
    document.original_file_name,
    document.mime_type,
    document.file_size_bytes,
    document.available_at
  from public.student_university_application_documents as document
  where document.application_id = p_application_id
    and document.status =
      'available'::public.university_application_document_status
  order by document.available_at desc, document.id desc
  limit 20;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Documents are temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Documents are temporarily unavailable.';
end;
$function$;

create or replace function public.authorize_university_application_document_view(
  p_application_id uuid,
  p_document_id uuid
)
returns table (
  document_id uuid,
  application_id uuid,
  bucket_id text,
  storage_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
begin
  select application.student_id
  into v_student_id
  from public.student_university_applications as application
  where application.id = p_application_id;

  if p_document_id is null
    or public.is_active_primary_counselor_for_student(v_student_id)
      is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Document could not be opened.';
  end if;

  return query
  select
    document.id,
    document.application_id,
    document.bucket_id,
    document.storage_path
  from public.student_university_application_documents as document
  where document.id = p_document_id
    and document.application_id = p_application_id
    and document.status =
      'available'::public.university_application_document_status
  limit 1;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'The document is no longer available.';
  end if;
exception
  when insufficient_privilege or invalid_parameter_value then
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Document could not be opened.';
end;
$function$;

create or replace function public.can_view_university_application_document_object(
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
  return (
    p_bucket_id = 'university-application-documents'
    and (select auth.uid()) is not null
    and exists (
      select 1
      from public.student_university_application_documents as document
      inner join public.student_university_applications as application
        on application.id = document.application_id
      inner join public.profiles as student_profile
        on student_profile.id = application.student_id
        and student_profile.role = 'student'::public.user_role
      where document.bucket_id = p_bucket_id
        and document.storage_path = p_storage_path
        and document.status =
          'available'::public.university_application_document_status
        and public.is_active_primary_counselor_for_student(
          application.student_id
        ) is true
    )
  );
exception
  when others then
    return false;
end;
$function$;

alter function public.list_university_application_documents(uuid)
  owner to postgres;
alter function public.authorize_university_application_document_view(uuid, uuid)
  owner to postgres;
alter function public.can_view_university_application_document_object(text, text)
  owner to postgres;

revoke all on function public.list_university_application_documents(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_university_application_document_view(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_view_university_application_document_object(text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.list_university_application_documents(uuid)
  to authenticated;
grant execute on function public.authorize_university_application_document_view(uuid, uuid)
  to authenticated;
grant execute on function public.can_view_university_application_document_object(text, text)
  to authenticated;

commit;
