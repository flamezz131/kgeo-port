-- K-GEO counselor student-directory foundation (Phase C0).
-- Review this migration before applying it. Apply it only after
-- 202607190002_student_profile_foundation.sql.
--
-- This migration adds read-only RPC projections. It does not change existing
-- rows, table grants, RLS policies, consultations, or student-owned writes.

begin;

create type public.student_directory_profile_state as enum (
  'profile_not_started',
  'profile_in_progress',
  'ready_for_counseling',
  'submitted'
);

comment on type public.student_directory_profile_state is
  'Counselor-directory presentation state derived from profile existence, stored workflow status, and the authoritative completion view.';

revoke all privileges on type public.student_directory_profile_state
  from public, anon;

grant usage on type public.student_directory_profile_state
  to authenticated;

-- SECURITY: profiles RLS intentionally exposes only the caller's own identity.
-- This definer function is the narrower cross-user boundary: it checks the
-- caller against both profiles and Auth, returns student-role rows only, and
-- projects no authentication metadata or private Student 360 fields.
create function public.list_counselor_student_directory(
  p_search text default null,
  p_college text default null,
  p_course text default null,
  p_department text default null,
  p_graduation_year integer default null,
  p_is_active boolean default null,
  p_profile_state public.student_directory_profile_state default null,
  p_higher_studies_interest public.higher_studies_interest default null,
  p_preferred_study_level public.student_preferred_study_level default null,
  p_target_intake text default null,
  p_sort text default 'name_asc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  student_id uuid,
  full_name text,
  college_email text,
  account_created_at timestamptz,
  is_active boolean,
  roll_number text,
  college text,
  course text,
  department text,
  graduation_year integer,
  profile_state public.student_directory_profile_state,
  completion_percentage integer,
  ready_for_counseling boolean,
  higher_studies_interest public.higher_studies_interest,
  preferred_study_level public.student_preferred_study_level,
  target_intake text,
  last_profile_update timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  requester_id uuid;
  normalized_search text;
  normalized_college text;
  normalized_course text;
  normalized_department text;
  normalized_target_intake text;
  normalized_sort text;
  page_offset bigint;
begin
  requester_id := (select auth.uid());

  -- Return no rows for every unauthorized role or identity state. This keeps
  -- caller failures closed without exposing which authorization check failed.
  if requester_id is null or not exists (
    select 1
    from public.profiles as caller_profile
    inner join auth.users as caller_auth
      on caller_auth.id = caller_profile.id
    where caller_profile.id = requester_id
      and caller_profile.role = 'counselor'::public.user_role
      and caller_profile.is_active is true
      and caller_auth.email_confirmed_at is not null
  ) then
    return;
  end if;

  normalized_search := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_search)),
    ''
  );
  normalized_college := nullif(pg_catalog.btrim(p_college), '');
  normalized_course := nullif(pg_catalog.btrim(p_course), '');
  normalized_department := nullif(pg_catalog.btrim(p_department), '');
  normalized_target_intake := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_target_intake)),
    ''
  );
  normalized_sort := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_sort)), ''),
    'name_asc'
  );

  if pg_catalog.char_length(normalized_search) > 100
    or pg_catalog.char_length(normalized_college) > 150
    or pg_catalog.char_length(normalized_course) > 150
    or pg_catalog.char_length(normalized_department) > 150 then
    raise exception using
      errcode = '22023',
      message = 'One or more directory filters are invalid';
  end if;

  if p_graduation_year is not null
    and p_graduation_year not between 2024 and 2040 then
    raise exception using
      errcode = '22023',
      message = 'The graduation-year filter is invalid';
  end if;

  if normalized_target_intake is not null
    and normalized_target_intake !~
      '^(spring|summer|fall|winter)-20[2-9][0-9]$' then
    raise exception using
      errcode = '22023',
      message = 'The target-intake filter is invalid';
  end if;

  if normalized_sort not in (
    'name_asc',
    'recently_registered',
    'recently_updated',
    'completion_low_to_high',
    'completion_high_to_low',
    'graduation_year'
  ) then
    raise exception using
      errcode = '22023',
      message = 'The directory sort is invalid';
  end if;

  if p_page is null or p_page not between 1 and 100000 then
    raise exception using
      errcode = '22023',
      message = 'The directory page is invalid';
  end if;

  if p_page_size is null or p_page_size not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'The directory page size is invalid';
  end if;

  page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  with directory_base as (
    select
      student_account.id as student_id,
      student_account.full_name,
      student_account.college_email,
      student_account.created_at as account_created_at,
      student_account.is_active,
      student_profile.roll_number,
      student_profile.college,
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
      coalesce(
        completion.overall_completion_percentage,
        0
      ) as completion_percentage,
      coalesce(
        completion.ready_for_counseling,
        false
      ) as ready_for_counseling,
      preference.higher_studies_interest,
      preference.preferred_study_level,
      preference.target_intake,
      greatest(
        student_profile.updated_at,
        preference.updated_at,
        (
          select pg_catalog.max(test_score.updated_at)
          from public.student_test_scores as test_score
          where test_score.student_id = student_profile.student_id
        ),
        (
          select pg_catalog.max(achievement.updated_at)
          from public.student_achievements as achievement
          where achievement.student_id = student_profile.student_id
        )
      ) as last_profile_update
    from public.profiles as student_account
    left join public.student_profiles as student_profile
      on student_profile.student_id = student_account.id
    left join public.student_preferences as preference
      on preference.student_id = student_profile.student_id
    left join public.student_profile_completion as completion
      on completion.student_id = student_profile.student_id
    -- Retain inactive student identities for historical visibility. The
    -- optional active-state filter is applied by the outer query.
    where student_account.role = 'student'::public.user_role
  ),
  filtered_directory as (
    select directory_entry.*
    from directory_base as directory_entry
    where (
      normalized_search is null
      or pg_catalog.strpos(
        pg_catalog.lower(
          coalesce(directory_entry.full_name, '')
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(
          coalesce(directory_entry.roll_number, '')
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(directory_entry.college_email),
        normalized_search
      ) > 0
    )
      and (
        normalized_college is null
        or pg_catalog.lower(directory_entry.college) =
          pg_catalog.lower(normalized_college)
      )
      and (
        normalized_course is null
        or pg_catalog.lower(directory_entry.course) =
          pg_catalog.lower(normalized_course)
      )
      and (
        normalized_department is null
        or pg_catalog.lower(directory_entry.department) =
          pg_catalog.lower(normalized_department)
      )
      and (
        p_graduation_year is null
        or directory_entry.graduation_year = p_graduation_year
      )
      and (
        p_is_active is null
        or directory_entry.is_active = p_is_active
      )
      and (
        p_profile_state is null
        or directory_entry.profile_state = p_profile_state
      )
      and (
        p_higher_studies_interest is null
        or directory_entry.higher_studies_interest =
          p_higher_studies_interest
      )
      and (
        p_preferred_study_level is null
        or directory_entry.preferred_study_level =
          p_preferred_study_level
      )
      and (
        normalized_target_intake is null
        or directory_entry.target_intake = normalized_target_intake
      )
  )
  select
    directory_entry.student_id,
    directory_entry.full_name,
    directory_entry.college_email,
    directory_entry.account_created_at,
    directory_entry.is_active,
    directory_entry.roll_number,
    directory_entry.college,
    directory_entry.course,
    directory_entry.department,
    directory_entry.graduation_year,
    directory_entry.profile_state,
    directory_entry.completion_percentage,
    directory_entry.ready_for_counseling,
    directory_entry.higher_studies_interest,
    directory_entry.preferred_study_level,
    directory_entry.target_intake,
    directory_entry.last_profile_update,
    pg_catalog.count(*) over () as total_count
  from filtered_directory as directory_entry
  order by
    case when normalized_sort = 'name_asc' then
      pg_catalog.lower(
        coalesce(
          nullif(pg_catalog.btrim(directory_entry.full_name), ''),
          directory_entry.college_email
        )
      )
    end asc,
    case when normalized_sort = 'recently_registered' then
      directory_entry.account_created_at
    end desc,
    case when normalized_sort = 'recently_updated' then
      directory_entry.last_profile_update
    end desc nulls last,
    case when normalized_sort = 'completion_low_to_high' then
      directory_entry.completion_percentage
    end asc,
    case when normalized_sort = 'completion_high_to_low' then
      directory_entry.completion_percentage
    end desc,
    case when normalized_sort = 'graduation_year' then
      directory_entry.graduation_year
    end asc nulls last,
    directory_entry.student_id asc
  limit p_page_size
  offset page_offset;
exception
  when sqlstate '22023' then
    -- Parameter-validation messages above are intentionally generic and safe.
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The student directory is temporarily unavailable';
end;
$function$;

comment on function public.list_counselor_student_directory(
  text,
  text,
  text,
  text,
  integer,
  boolean,
  public.student_directory_profile_state,
  public.higher_studies_interest,
  public.student_preferred_study_level,
  text,
  text,
  integer,
  integer
) is
  'Returns one bounded, privacy-minimized student directory page to an active verified counselor.';

revoke all on function public.list_counselor_student_directory(
  text,
  text,
  text,
  text,
  integer,
  boolean,
  public.student_directory_profile_state,
  public.higher_studies_interest,
  public.student_preferred_study_level,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.list_counselor_student_directory(
  text,
  text,
  text,
  text,
  integer,
  boolean,
  public.student_directory_profile_state,
  public.higher_studies_interest,
  public.student_preferred_study_level,
  text,
  text,
  integer,
  integer
) to authenticated;

-- The future Student 360 route needs only a trusted UUID-to-identity bridge.
-- Unknown UUIDs and non-student UUIDs both return no row, preventing staff
-- identity discovery and avoiding account-existence distinctions.
create function public.get_counselor_student_identity(
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
declare
  requester_id uuid;
begin
  requester_id := (select auth.uid());

  if requester_id is null or p_student_id is null or not exists (
    select 1
    from public.profiles as caller_profile
    inner join auth.users as caller_auth
      on caller_auth.id = caller_profile.id
    where caller_profile.id = requester_id
      and caller_profile.role = 'counselor'::public.user_role
      and caller_profile.is_active is true
      and caller_auth.email_confirmed_at is not null
  ) then
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

comment on function public.get_counselor_student_identity(uuid) is
  'Returns minimal identity and account-active state for one student UUID to an active verified counselor; unknown and staff UUIDs return no row.';

revoke all on function public.get_counselor_student_identity(uuid)
  from public, anon, authenticated;

grant execute on function public.get_counselor_student_identity(uuid)
  to authenticated;

commit;
