-- K-GEO Phase A1.3 Director operational oversight foundation.
-- This migration adds three bounded, read-only Director RPCs. It does not
-- change table grants, RLS policies, workflow mutations, or historical data.

begin;

create function public.list_director_student_oversight(
  p_search text default null,
  p_is_active boolean default null,
  p_progression_state text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  student_id uuid,
  full_name text,
  college_email text,
  is_active boolean,
  account_created_at timestamptz,
  course text,
  department text,
  graduation_year integer,
  profile_state public.student_directory_profile_state,
  progression_stage public.counseling_progression_stage,
  progression_state public.counseling_progression_state,
  total_consultations bigint,
  open_consultations bigint,
  active_applications bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_search text;
  v_progression_state text;
  v_page_offset bigint;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Director oversight data is temporarily unavailable.';
  end if;

  v_search := nullif(pg_catalog.lower(pg_catalog.btrim(p_search)), '');
  v_progression_state := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_progression_state)),
    ''
  );

  if pg_catalog.char_length(v_search) > 100
    or v_search ~ '[[:cntrl:]]'
    or v_progression_state not in (
      'not_started',
      'active',
      'on_hold',
      'completed'
    )
    or p_page is null
    or p_page not between 1 and 100000
    or p_page_size is null
    or p_page_size not between 1 and 50 then
    raise exception using
      errcode = '22023',
      message = 'Director oversight filters are invalid.';
  end if;

  v_page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  with consultation_counts as (
    select
      request.student_id,
      pg_catalog.count(*)::bigint as total_consultations,
      pg_catalog.count(*) filter (
        where request.status not in (
          'completed'::public.consultation_status,
          'no_show'::public.consultation_status,
          'cancelled'::public.consultation_status
        )
      )::bigint as open_consultations
    from public.consultation_requests as request
    group by request.student_id
  ),
  application_counts as (
    select
      application.student_id,
      pg_catalog.count(*) filter (
        where application.is_archived is false
      )::bigint as active_applications
    from public.student_university_applications as application
    group by application.student_id
  ),
  student_rows as (
    select
      student.id as student_id,
      student.full_name,
      student.college_email,
      student.is_active,
      student.created_at as account_created_at,
      student_profile.course,
      student_profile.department,
      student_profile.graduation_year,
      case
        when student_profile.student_id is null then
          'profile_not_started'::public.student_directory_profile_state
        when completion.profile_status =
          'submitted'::public.student_profile_status then
          'submitted'::public.student_directory_profile_state
        when completion.ready_for_counseling is true then
          'ready_for_counseling'::public.student_directory_profile_state
        else
          'profile_in_progress'::public.student_directory_profile_state
      end as profile_state,
      progression.current_stage as progression_stage,
      progression.workflow_state as progression_state,
      coalesce(consultation.total_consultations, 0::bigint)
        as total_consultations,
      coalesce(consultation.open_consultations, 0::bigint)
        as open_consultations,
      coalesce(application.active_applications, 0::bigint)
        as active_applications
    from public.profiles as student
    left join public.student_profiles as student_profile
      on student_profile.student_id = student.id
    left join public.student_profile_completion as completion
      on completion.student_id = student.id
    left join public.student_counseling_progressions as progression
      on progression.student_id = student.id
    left join consultation_counts as consultation
      on consultation.student_id = student.id
    left join application_counts as application
      on application.student_id = student.id
    where student.role = 'student'::public.user_role
  ),
  filtered_rows as (
    select student.*
    from student_rows as student
    where (
      v_search is null
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(student.full_name, '')),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(student.college_email),
        v_search
      ) > 0
    )
      and (p_is_active is null or student.is_active = p_is_active)
      and (
        v_progression_state is null
        or (
          v_progression_state = 'not_started'
          and student.progression_state is null
        )
        or student.progression_state::text = v_progression_state
      )
  )
  select
    student.student_id,
    student.full_name,
    student.college_email,
    student.is_active,
    student.account_created_at,
    student.course,
    student.department,
    student.graduation_year,
    student.profile_state,
    student.progression_stage,
    student.progression_state,
    student.total_consultations,
    student.open_consultations,
    student.active_applications,
    pg_catalog.count(*) over () as total_count
  from filtered_rows as student
  order by
    pg_catalog.lower(
      coalesce(
        nullif(pg_catalog.btrim(student.full_name), ''),
        student.college_email
      )
    ) collate pg_catalog."C" asc,
    student.student_id asc
  limit p_page_size
  offset v_page_offset;
exception
  when sqlstate '22023' then
    raise exception using
      errcode = '22023',
      message = 'Director oversight filters are invalid.';
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Director oversight data is temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Director oversight data is temporarily unavailable.';
end;
$function$;

alter function public.list_director_student_oversight(
  text,
  boolean,
  text,
  integer,
  integer
) owner to postgres;

comment on function public.list_director_student_oversight(
  text,
  boolean,
  text,
  integer,
  integer
) is
  'Returns a bounded student operational summary to an active verified Director without personal contact, private note, or follow-up content.';

create function public.list_director_consultation_oversight(
  p_search text default null,
  p_status public.consultation_status default null,
  p_date_from date default null,
  p_date_to date default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  consultation_id uuid,
  request_number text,
  student_id uuid,
  student_full_name text,
  student_college_email text,
  counselor_id uuid,
  counselor_full_name text,
  counselor_college_email text,
  consultation_date date,
  slot_start time without time zone,
  slot_end time without time zone,
  consultation_status public.consultation_status,
  outcome_recorded_at timestamptz,
  submitted_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_search text;
  v_page_offset bigint;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Director oversight data is temporarily unavailable.';
  end if;

  v_search := nullif(pg_catalog.lower(pg_catalog.btrim(p_search)), '');

  if pg_catalog.char_length(v_search) > 100
    or v_search ~ '[[:cntrl:]]'
    or (
      p_date_from is not null
      and p_date_to is not null
      and (
        p_date_from > p_date_to
        or p_date_to - p_date_from > 3660
      )
    )
    or p_page is null
    or p_page not between 1 and 100000
    or p_page_size is null
    or p_page_size not between 1 and 50 then
    raise exception using
      errcode = '22023',
      message = 'Director oversight filters are invalid.';
  end if;

  v_page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  with consultation_rows as (
    select
      request.id as consultation_id,
      request.request_number,
      student.id as student_id,
      student.full_name as student_full_name,
      student.college_email as student_college_email,
      counselor.id as counselor_id,
      counselor.full_name as counselor_full_name,
      counselor.college_email as counselor_college_email,
      request.consultation_date,
      request.slot_start,
      request.slot_end,
      request.status as consultation_status,
      request.outcome_recorded_at,
      request.submitted_at
    from public.consultation_requests as request
    inner join public.profiles as student
      on student.id = request.student_id
      and student.role = 'student'::public.user_role
    left join public.profiles as counselor
      on counselor.id = request.assigned_counselor_id
      and counselor.role = 'counselor'::public.user_role
    where (
      v_search is null
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(student.full_name, '')),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(student.college_email),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(request.request_number),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(counselor.full_name, '')),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(counselor.college_email, '')),
        v_search
      ) > 0
    )
      and (p_status is null or request.status = p_status)
      and (
        p_date_from is null
        or request.consultation_date >= p_date_from
      )
      and (
        p_date_to is null
        or request.consultation_date <= p_date_to
      )
  )
  select
    consultation.consultation_id,
    consultation.request_number,
    consultation.student_id,
    consultation.student_full_name,
    consultation.student_college_email,
    consultation.counselor_id,
    consultation.counselor_full_name,
    consultation.counselor_college_email,
    consultation.consultation_date,
    consultation.slot_start,
    consultation.slot_end,
    consultation.consultation_status,
    consultation.outcome_recorded_at,
    consultation.submitted_at,
    pg_catalog.count(*) over () as total_count
  from consultation_rows as consultation
  order by
    consultation.submitted_at desc,
    consultation.consultation_id desc
  limit p_page_size
  offset v_page_offset;
exception
  when sqlstate '22023' then
    raise exception using
      errcode = '22023',
      message = 'Director oversight filters are invalid.';
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Director oversight data is temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Director oversight data is temporarily unavailable.';
end;
$function$;

alter function public.list_director_consultation_oversight(
  text,
  public.consultation_status,
  date,
  date,
  integer,
  integer
) owner to postgres;

comment on function public.list_director_consultation_oversight(
  text,
  public.consultation_status,
  date,
  date,
  integer,
  integer
) is
  'Returns a bounded consultation lifecycle summary to an active verified Director without personal contact, private narrative, or follow-up content.';

create function public.list_director_application_oversight(
  p_search text default null,
  p_status public.university_application_status default null,
  p_archive_state text default 'active',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  application_id uuid,
  student_id uuid,
  student_full_name text,
  student_college_email text,
  counselor_id uuid,
  counselor_full_name text,
  counselor_college_email text,
  university_name text,
  programme_name text,
  country_code text,
  degree_level public.university_application_degree_level,
  intake_term public.university_application_intake_term,
  intake_year smallint,
  application_status public.university_application_status,
  submission_deadline date,
  submitted_at timestamptz,
  is_primary boolean,
  is_archived boolean,
  last_changed_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_search text;
  v_archive_state text;
  v_page_offset bigint;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Director oversight data is temporarily unavailable.';
  end if;

  v_search := nullif(pg_catalog.lower(pg_catalog.btrim(p_search)), '');
  v_archive_state := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_archive_state)), ''),
    'active'
  );

  if pg_catalog.char_length(v_search) > 100
    or v_search ~ '[[:cntrl:]]'
    or v_archive_state not in ('active', 'archived', 'all')
    or p_page is null
    or p_page not between 1 and 100000
    or p_page_size is null
    or p_page_size not between 1 and 50 then
    raise exception using
      errcode = '22023',
      message = 'Director oversight filters are invalid.';
  end if;

  v_page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  with application_rows as (
    select
      application.id as application_id,
      student.id as student_id,
      student.full_name as student_full_name,
      student.college_email as student_college_email,
      counselor.id as counselor_id,
      counselor.full_name as counselor_full_name,
      counselor.college_email as counselor_college_email,
      application.university_name,
      application.programme_name,
      application.country_code,
      application.degree_level,
      application.intake_term,
      application.intake_year,
      application.current_status as application_status,
      application.submission_deadline,
      application.submitted_at,
      application.is_primary,
      application.is_archived,
      application.last_changed_at
    from public.student_university_applications as application
    inner join public.profiles as student
      on student.id = application.student_id
      and student.role = 'student'::public.user_role
    left join public.profiles as counselor
      on counselor.id = application.last_changed_by
      and counselor.role = 'counselor'::public.user_role
    where (
      v_search is null
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(student.full_name, '')),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(student.college_email),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(application.university_name),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(application.programme_name),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(counselor.full_name, '')),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(counselor.college_email, '')),
        v_search
      ) > 0
    )
      and (p_status is null or application.current_status = p_status)
      and (
        v_archive_state = 'all'
        or (
          v_archive_state = 'active'
          and application.is_archived is false
        )
        or (
          v_archive_state = 'archived'
          and application.is_archived is true
        )
      )
  )
  select
    application.application_id,
    application.student_id,
    application.student_full_name,
    application.student_college_email,
    application.counselor_id,
    application.counselor_full_name,
    application.counselor_college_email,
    application.university_name,
    application.programme_name,
    application.country_code,
    application.degree_level,
    application.intake_term,
    application.intake_year,
    application.application_status,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.is_archived,
    application.last_changed_at,
    pg_catalog.count(*) over () as total_count
  from application_rows as application
  order by
    application.last_changed_at desc,
    application.application_id desc
  limit p_page_size
  offset v_page_offset;
exception
  when sqlstate '22023' then
    raise exception using
      errcode = '22023',
      message = 'Director oversight filters are invalid.';
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Director oversight data is temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Director oversight data is temporarily unavailable.';
end;
$function$;

alter function public.list_director_application_oversight(
  text,
  public.university_application_status,
  text,
  integer,
  integer
) owner to postgres;

comment on function public.list_director_application_oversight(
  text,
  public.university_application_status,
  text,
  integer,
  integer
) is
  'Returns a bounded university-application operational summary to an active verified Director without references, URLs, documents, private narrative, or follow-up content.';

revoke all on function public.list_director_student_oversight(
  text,
  boolean,
  text,
  integer,
  integer
) from public, anon, authenticated;

revoke all on function public.list_director_consultation_oversight(
  text,
  public.consultation_status,
  date,
  date,
  integer,
  integer
) from public, anon, authenticated;

revoke all on function public.list_director_application_oversight(
  text,
  public.university_application_status,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.list_director_student_oversight(
  text,
  boolean,
  text,
  integer,
  integer
) to authenticated;

grant execute on function public.list_director_consultation_oversight(
  text,
  public.consultation_status,
  date,
  date,
  integer,
  integer
) to authenticated;

grant execute on function public.list_director_application_oversight(
  text,
  public.university_application_status,
  text,
  integer,
  integer
) to authenticated;

commit;
