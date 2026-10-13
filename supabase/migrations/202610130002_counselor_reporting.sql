-- K-GEO Counselor Reports - read-only reporting contract
-- Migration: 202610130002_counselor_reporting.sql
--
-- Purpose:
-- Add the database contract for /counselor/reports. Three read-only RPCs
-- share one private row builder so that the Student table, the summary
-- cards and the breakdowns can never disagree about a filter:
--
--   public.get_counselor_report_students(...)    paginated Student rows
--   public.get_counselor_report_summary(...)     five Student-count KPIs
--   public.get_counselor_report_breakdowns(...)  institution / country / stage
--
-- - No table, materialized view, column or index is created.
-- - No existing function, policy, grant or row is changed.
-- - Authorization is public.is_approved_active_verified_counselor() only.
--   Historical Primary Counselor assignments are not read.
-- - Only report-safe columns are projected. Personal email, mobile number,
--   Counselor notes, follow-ups, semester summaries, readiness rationales and
--   evidence, eligibility detail, Parent Report content, document paths,
--   portal URLs, AI output, Auth metadata and audit events are never read.
--
-- Derivations (each mirrors an existing K-GEO rule):
--
--   institution          exact college_email domain: kct.ac.in -> KCT,
--                        kclas.ac.in -> KCLAS, kctbs.ac.in -> KCTBS
--   profile_state        the Counselor Student Directory derivation
--   last_profile_update  the Counselor Student Directory calculation
--   consultation_status  one state per Student, highest precedence first:
--                        in_progress, outcome_required, upcoming,
--                        booking_pending, completed, no_show, cancelled,
--                        no_consultation. Appointment times are compared in
--                        Asia/Kolkata exactly as
--                        public.get_my_consultation_dashboard_metrics() does.
--   global readiness     latest revision of
--                        public.student_global_readiness_assessments
--   application_stage    current_status of the primary non-archived
--                        application, otherwise 'No primary application'

begin;


-- ============================================================
-- 0. PRE-FLIGHT
-- ============================================================

do $preflight$
declare
  v_count integer;
begin

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'is_approved_active_verified_counselor'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = ''
    and procedure.prosecdef is true;

  if v_count <> 1 then
    raise exception using
      errcode = '55000',
      message =
        'Counselor reporting requires the institutional Counselor helper';
  end if;

  if pg_catalog.to_regnamespace('private') is null then
    raise exception using
      errcode = '55000',
      message = 'Counselor reporting requires the private schema';
  end if;

end;
$preflight$;


-- ============================================================
-- 1. PRIVATE ROW BUILDER
-- ============================================================
--
-- Validates every filter and returns one row per matching Student. It is not
-- an API: nobody is granted EXECUTE, and it performs no caller
-- authorization. Only the three public RPCs below call it, after they have
-- verified the institutional Counselor.

create function private.counselor_report_student_rows(
  p_search text,
  p_institution text,
  p_department text,
  p_graduation_year integer,
  p_higher_studies_interest text,
  p_profile_state text,
  p_active text,
  p_consultation_status text,
  p_country text,
  p_application_status text,
  p_readiness_min integer,
  p_readiness_max integer
)
returns table (
  student_id uuid,
  student_name text,
  college_email text,
  is_active boolean,
  institution text,
  roll_number text,
  department text,
  graduation_year integer,
  higher_studies_interest public.higher_studies_interest,
  target_countries text[],
  profile_state public.student_directory_profile_state,
  profile_completion_percentage integer,
  ready_for_counseling boolean,
  consultation_status text,
  has_completed_consultation boolean,
  global_readiness_score integer,
  global_readiness_band public.global_readiness_band,
  application_stage text,
  has_active_application boolean,
  has_offer_received boolean,
  last_profile_update timestamptz
)
language plpgsql
stable
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_search text;
  v_institution text;
  v_department text;
  v_interest text;
  v_profile_state text;
  v_active text;
  v_consultation_status text;
  v_country text;
  v_application_status text;
  v_business_now timestamp without time zone;
  v_business_date date;
  v_business_time time without time zone;
begin
  v_search := nullif(pg_catalog.lower(pg_catalog.btrim(p_search)), '');
  v_institution := nullif(pg_catalog.btrim(p_institution), '');
  v_department := nullif(pg_catalog.btrim(p_department), '');
  v_interest := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_higher_studies_interest)),
    ''
  );
  v_profile_state := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_profile_state)),
    ''
  );
  v_active := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_active)), ''),
    'active'
  );
  v_consultation_status := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_consultation_status)),
    ''
  );
  v_country := nullif(pg_catalog.btrim(p_country), '');
  v_application_status := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_application_status)),
    ''
  );

  if pg_catalog.char_length(v_search) > 100
    or v_search ~ '[[:cntrl:]]'
    or pg_catalog.char_length(v_department) > 150
    or v_department ~ '[[:cntrl:]]'
    or pg_catalog.char_length(v_country) > 80
    or v_country ~ '[[:cntrl:]]'
  then
    raise exception using
      errcode = '22023',
      message = 'One or more report filters are invalid';
  end if;

  -- Student institutions are exactly the three approved college domains.
  if v_institution is not null
    and v_institution not in ('KCT', 'KCLAS', 'KCTBS')
  then
    raise exception using
      errcode = '22023',
      message = 'One or more report filters are invalid';
  end if;

  -- The database safety envelope for a stored graduation year.
  if p_graduation_year is not null
    and p_graduation_year not between 2000 and 2100
  then
    raise exception using
      errcode = '22023',
      message = 'One or more report filters are invalid';
  end if;

  if v_active not in ('active', 'inactive', 'all') then
    raise exception using
      errcode = '22023',
      message = 'One or more report filters are invalid';
  end if;

  if v_interest is not null and not exists (
    select 1
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid =
        'public.higher_studies_interest'::pg_catalog.regtype
      and enum_value.enumlabel::text = v_interest
  ) then
    raise exception using
      errcode = '22023',
      message = 'One or more report filters are invalid';
  end if;

  if v_profile_state is not null and not exists (
    select 1
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid =
        'public.student_directory_profile_state'::pg_catalog.regtype
      and enum_value.enumlabel::text = v_profile_state
  ) then
    raise exception using
      errcode = '22023',
      message = 'One or more report filters are invalid';
  end if;

  if v_application_status is not null and not exists (
    select 1
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid =
        'public.university_application_status'::pg_catalog.regtype
      and enum_value.enumlabel::text = v_application_status
  ) then
    raise exception using
      errcode = '22023',
      message = 'One or more report filters are invalid';
  end if;

  if v_consultation_status is not null
    and v_consultation_status not in (
      'in_progress',
      'outcome_required',
      'upcoming',
      'booking_pending',
      'completed',
      'no_show',
      'cancelled',
      'no_consultation'
    )
  then
    raise exception using
      errcode = '22023',
      message = 'One or more report filters are invalid';
  end if;

  if (p_readiness_min is not null and p_readiness_min not between 0 and 100)
    or (p_readiness_max is not null and p_readiness_max not between 0 and 100)
    or (
      p_readiness_min is not null
      and p_readiness_max is not null
      and p_readiness_min > p_readiness_max
    )
  then
    raise exception using
      errcode = '22023',
      message = 'One or more report filters are invalid';
  end if;

  -- Appointment times are stored as a business date and wall-clock slot.
  -- They are compared with the current Asia/Kolkata business date and time,
  -- exactly as public.get_my_consultation_dashboard_metrics() does.
  v_business_now :=
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata';
  v_business_date := v_business_now::date;
  v_business_time := v_business_now::time;

  return query
  with report_base as (
    select
      student_account.id as student_id,
      student_account.full_name as student_name,
      student_account.college_email,
      student_account.is_active,
      case pg_catalog.split_part(student_account.college_email, '@', 2)
        when 'kct.ac.in' then 'KCT'
        when 'kclas.ac.in' then 'KCLAS'
        when 'kctbs.ac.in' then 'KCTBS'
      end as institution,
      student_profile.roll_number,
      student_profile.department,
      student_profile.graduation_year,
      preference.higher_studies_interest,
      coalesce(
        preference.preferred_countries,
        array[]::text[]
      ) as target_countries,
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
      ) as profile_completion_percentage,
      coalesce(
        completion.ready_for_counseling,
        false
      ) as ready_for_counseling,
      case consultation.state_rank
        when 1 then 'in_progress'
        when 2 then 'outcome_required'
        when 3 then 'upcoming'
        when 4 then 'booking_pending'
        when 5 then 'completed'
        when 6 then 'no_show'
        when 7 then 'cancelled'
        else 'no_consultation'
      end as consultation_status,
      coalesce(
        consultation.has_completed,
        false
      ) as has_completed_consultation,
      latest_readiness.total_score as global_readiness_score,
      latest_readiness.readiness_band as global_readiness_band,
      coalesce(
        primary_application.current_status::text,
        'No primary application'
      ) as application_stage,
      exists (
        select 1
        from public.student_university_applications as application
        where application.student_id = student_account.id
          and application.is_archived is false
      ) as has_active_application,
      exists (
        select 1
        from public.student_university_applications as application
        inner join public.student_university_application_journeys as journey
          on journey.application_id = application.id
        where application.student_id = student_account.id
          and journey.university_decision =
            'offer_received'::public.university_application_decision
      ) as has_offer_received,
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
    left join lateral (
      select
        pg_catalog.min(
          case
            when request.status = 'scheduled'::public.consultation_status
              and request.consultation_date = v_business_date
              and request.slot_start <= v_business_time
              and request.slot_end > v_business_time
              then 1
            when request.status = 'scheduled'::public.consultation_status
              and (
                request.consultation_date < v_business_date
                or (
                  request.consultation_date = v_business_date
                  and request.slot_end <= v_business_time
                )
              )
              then 2
            when request.status = 'scheduled'::public.consultation_status
              and (
                request.consultation_date > v_business_date
                or (
                  request.consultation_date = v_business_date
                  and request.slot_start > v_business_time
                )
              )
              then 3
            when request.status in (
              'submitted'::public.consultation_status,
              'waiting_for_assignment'::public.consultation_status,
              'counselor_assigned'::public.consultation_status,
              'scheduled'::public.consultation_status
            )
              then 4
            when request.status = 'completed'::public.consultation_status
              then 5
            when request.status = 'no_show'::public.consultation_status
              then 6
            when request.status = 'cancelled'::public.consultation_status
              then 7
          end
        ) as state_rank,
        pg_catalog.bool_or(
          request.status = 'completed'::public.consultation_status
        ) as has_completed
      from public.consultation_requests as request
      where request.student_id = student_account.id
    ) as consultation on true
    left join lateral (
      select
        assessment.total_score,
        assessment.readiness_band
      from public.student_global_readiness_assessments as assessment
      where assessment.student_id = student_account.id
      order by
        assessment.revision_number desc,
        assessment.assessed_at desc,
        assessment.id desc
      limit 1
    ) as latest_readiness on true
    left join public.student_university_applications as primary_application
      on primary_application.student_id = student_account.id
      and primary_application.is_primary is true
      and primary_application.is_archived is false
    where student_account.role = 'student'::public.user_role
  )
  select
    report_entry.student_id,
    report_entry.student_name,
    report_entry.college_email,
    report_entry.is_active,
    report_entry.institution,
    report_entry.roll_number,
    report_entry.department,
    report_entry.graduation_year,
    report_entry.higher_studies_interest,
    report_entry.target_countries,
    report_entry.profile_state,
    report_entry.profile_completion_percentage,
    report_entry.ready_for_counseling,
    report_entry.consultation_status,
    report_entry.has_completed_consultation,
    report_entry.global_readiness_score,
    report_entry.global_readiness_band,
    report_entry.application_stage,
    report_entry.has_active_application,
    report_entry.has_offer_received,
    report_entry.last_profile_update
  from report_base as report_entry
  where (
    v_active = 'all'
    or (v_active = 'active' and report_entry.is_active is true)
    or (v_active = 'inactive' and report_entry.is_active is false)
  )
    and (
      v_search is null
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(report_entry.student_name, '')),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(report_entry.roll_number, '')),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(report_entry.college_email),
        v_search
      ) > 0
    )
    and (
      v_institution is null
      or report_entry.institution = v_institution
    )
    and (
      v_department is null
      or pg_catalog.lower(report_entry.department) =
        pg_catalog.lower(v_department)
    )
    and (
      p_graduation_year is null
      or report_entry.graduation_year = p_graduation_year
    )
    and (
      v_interest is null
      or report_entry.higher_studies_interest::text = v_interest
    )
    and (
      v_profile_state is null
      or report_entry.profile_state::text = v_profile_state
    )
    and (
      v_consultation_status is null
      or report_entry.consultation_status = v_consultation_status
    )
    and (
      v_country is null
      or report_entry.target_countries @> array[v_country]::text[]
    )
    and (
      v_application_status is null
      or report_entry.application_stage = v_application_status
    )
    and (
      p_readiness_min is null
      or report_entry.global_readiness_score >= p_readiness_min
    )
    and (
      p_readiness_max is null
      or report_entry.global_readiness_score <= p_readiness_max
    );
end;
$function$;

alter function private.counselor_report_student_rows(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer
) owner to postgres;

comment on function private.counselor_report_student_rows(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer
) is
  'Internal Counselor report row builder. Validates filters and returns one report-safe row per matching Student. Performs no caller authorization and is not granted to any API role.';

revoke all on function private.counselor_report_student_rows(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer
) from public, anon, authenticated, service_role;


-- ============================================================
-- 2. STUDENT ROWS
-- ============================================================

create function public.get_counselor_report_students(
  p_search text default null,
  p_institution text default null,
  p_department text default null,
  p_graduation_year integer default null,
  p_higher_studies_interest text default null,
  p_profile_state text default null,
  p_active text default 'active',
  p_consultation_status text default null,
  p_country text default null,
  p_application_status text default null,
  p_readiness_min integer default null,
  p_readiness_max integer default null,
  p_sort text default 'name_asc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  student_id uuid,
  student_name text,
  college_email text,
  is_active boolean,
  institution text,
  roll_number text,
  department text,
  graduation_year integer,
  higher_studies_interest public.higher_studies_interest,
  target_countries text[],
  profile_state public.student_directory_profile_state,
  profile_completion_percentage integer,
  consultation_status text,
  global_readiness_score integer,
  global_readiness_band public.global_readiness_band,
  application_stage text,
  last_profile_update timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
declare
  v_sort text;
  v_page_offset bigint;
begin
  if (select auth.uid()) is null
    or public.is_approved_active_verified_counselor() is distinct from true
  then
    raise exception using
      errcode = '42501',
      message = 'Counselor report data is temporarily unavailable.';
  end if;

  v_sort := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_sort)), ''),
    'name_asc'
  );

  if v_sort not in (
    'name_asc',
    'name_desc',
    'roll_number_asc',
    'roll_number_desc',
    'graduation_year_asc',
    'graduation_year_desc',
    'readiness_asc',
    'readiness_desc',
    'recently_updated'
  )
    or p_page is null
    or p_page not between 1 and 100000
    or p_page_size is null
    or p_page_size not between 1 and 100
  then
    raise exception using
      errcode = '22023',
      message = 'Counselor report filters are invalid.';
  end if;

  v_page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  select
    report_row.student_id,
    report_row.student_name,
    report_row.college_email,
    report_row.is_active,
    report_row.institution,
    report_row.roll_number,
    report_row.department,
    report_row.graduation_year,
    report_row.higher_studies_interest,
    report_row.target_countries,
    report_row.profile_state,
    report_row.profile_completion_percentage,
    report_row.consultation_status,
    report_row.global_readiness_score,
    report_row.global_readiness_band,
    report_row.application_stage,
    report_row.last_profile_update,
    pg_catalog.count(*) over () as total_count
  from private.counselor_report_student_rows(
    p_search,
    p_institution,
    p_department,
    p_graduation_year,
    p_higher_studies_interest,
    p_profile_state,
    p_active,
    p_consultation_status,
    p_country,
    p_application_status,
    p_readiness_min,
    p_readiness_max
  ) as report_row
  order by
    case when v_sort = 'name_asc' then
      pg_catalog.lower(
        coalesce(
          nullif(pg_catalog.btrim(report_row.student_name), ''),
          report_row.college_email
        )
      )
    end asc,
    case when v_sort = 'name_desc' then
      pg_catalog.lower(
        coalesce(
          nullif(pg_catalog.btrim(report_row.student_name), ''),
          report_row.college_email
        )
      )
    end desc,
    case when v_sort = 'roll_number_asc' then
      pg_catalog.lower(report_row.roll_number)
    end asc nulls last,
    case when v_sort = 'roll_number_desc' then
      pg_catalog.lower(report_row.roll_number)
    end desc nulls last,
    case when v_sort = 'graduation_year_asc' then
      report_row.graduation_year
    end asc nulls last,
    case when v_sort = 'graduation_year_desc' then
      report_row.graduation_year
    end desc nulls last,
    case when v_sort = 'readiness_asc' then
      report_row.global_readiness_score
    end asc nulls last,
    case when v_sort = 'readiness_desc' then
      report_row.global_readiness_score
    end desc nulls last,
    case when v_sort = 'recently_updated' then
      report_row.last_profile_update
    end desc nulls last,
    report_row.student_id asc
  limit p_page_size
  offset v_page_offset;
exception
  when sqlstate '22023' then
    raise exception using
      errcode = '22023',
      message = 'Counselor report filters are invalid.';
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Counselor report data is temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Counselor report data is temporarily unavailable.';
end;
$function$;

alter function public.get_counselor_report_students(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer, text, integer, integer
) owner to postgres;

comment on function public.get_counselor_report_students(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer, text, integer, integer
) is
  'Returns one bounded page of report-safe Student rows to the approved active verified institutional Counselor.';

revoke all on function public.get_counselor_report_students(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer, text, integer, integer
) from public, anon, authenticated, service_role;

grant execute on function public.get_counselor_report_students(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer, text, integer, integer
) to authenticated;


-- ============================================================
-- 3. SUMMARY KPIS
-- ============================================================
--
-- Every KPI counts distinct Students, never child rows.

create function public.get_counselor_report_summary(
  p_search text default null,
  p_institution text default null,
  p_department text default null,
  p_graduation_year integer default null,
  p_higher_studies_interest text default null,
  p_profile_state text default null,
  p_active text default 'active',
  p_consultation_status text default null,
  p_country text default null,
  p_application_status text default null,
  p_readiness_min integer default null,
  p_readiness_max integer default null
)
returns table (
  total_students bigint,
  profile_complete bigint,
  consultations_completed bigint,
  applications_started bigint,
  offers_received bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if (select auth.uid()) is null
    or public.is_approved_active_verified_counselor() is distinct from true
  then
    raise exception using
      errcode = '42501',
      message = 'Counselor report data is temporarily unavailable.';
  end if;

  return query
  select
    pg_catalog.count(distinct report_row.student_id) as total_students,
    pg_catalog.count(distinct report_row.student_id) filter (
      where report_row.ready_for_counseling is true
    ) as profile_complete,
    pg_catalog.count(distinct report_row.student_id) filter (
      where report_row.has_completed_consultation is true
    ) as consultations_completed,
    pg_catalog.count(distinct report_row.student_id) filter (
      where report_row.has_active_application is true
    ) as applications_started,
    pg_catalog.count(distinct report_row.student_id) filter (
      where report_row.has_offer_received is true
    ) as offers_received
  from private.counselor_report_student_rows(
    p_search,
    p_institution,
    p_department,
    p_graduation_year,
    p_higher_studies_interest,
    p_profile_state,
    p_active,
    p_consultation_status,
    p_country,
    p_application_status,
    p_readiness_min,
    p_readiness_max
  ) as report_row;
exception
  when sqlstate '22023' then
    raise exception using
      errcode = '22023',
      message = 'Counselor report filters are invalid.';
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Counselor report data is temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Counselor report data is temporarily unavailable.';
end;
$function$;

alter function public.get_counselor_report_summary(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer
) owner to postgres;

comment on function public.get_counselor_report_summary(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer
) is
  'Returns five Student-count KPIs for the filtered report population to the approved active verified institutional Counselor.';

revoke all on function public.get_counselor_report_summary(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer
) from public, anon, authenticated, service_role;

grant execute on function public.get_counselor_report_summary(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer
) to authenticated;


-- ============================================================
-- 4. BREAKDOWNS
-- ============================================================
--
-- institution        one institution per Student
-- target_country     Student-country selections; a Student with three
--                    preferred countries contributes to all three, so this
--                    dimension can total more than the Student count
-- application_stage  primary non-archived application status, otherwise
--                    'No primary application'

create function public.get_counselor_report_breakdowns(
  p_search text default null,
  p_institution text default null,
  p_department text default null,
  p_graduation_year integer default null,
  p_higher_studies_interest text default null,
  p_profile_state text default null,
  p_active text default 'active',
  p_consultation_status text default null,
  p_country text default null,
  p_application_status text default null,
  p_readiness_min integer default null,
  p_readiness_max integer default null
)
returns table (
  dimension text,
  label text,
  student_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
#variable_conflict use_column
begin
  if (select auth.uid()) is null
    or public.is_approved_active_verified_counselor() is distinct from true
  then
    raise exception using
      errcode = '42501',
      message = 'Counselor report data is temporarily unavailable.';
  end if;

  return query
  with report_rows as (
    select
      report_row.student_id,
      report_row.institution,
      report_row.target_countries,
      report_row.application_stage
    from private.counselor_report_student_rows(
      p_search,
      p_institution,
      p_department,
      p_graduation_year,
      p_higher_studies_interest,
      p_profile_state,
      p_active,
      p_consultation_status,
      p_country,
      p_application_status,
      p_readiness_min,
      p_readiness_max
    ) as report_row
  ),
  breakdown as (
    select
      'institution'::text as dimension,
      report_rows.institution as label,
      pg_catalog.count(distinct report_rows.student_id) as student_count
    from report_rows
    where report_rows.institution is not null
    group by report_rows.institution

    union all

    select
      'target_country'::text as dimension,
      selected_country.label as label,
      pg_catalog.count(distinct report_rows.student_id) as student_count
    from report_rows
    cross join lateral pg_catalog.unnest(
      report_rows.target_countries
    ) as selected_country(label)
    group by selected_country.label

    union all

    select
      'application_stage'::text as dimension,
      report_rows.application_stage as label,
      pg_catalog.count(distinct report_rows.student_id) as student_count
    from report_rows
    group by report_rows.application_stage
  )
  select
    breakdown.dimension,
    breakdown.label,
    breakdown.student_count
  from breakdown
  order by
    breakdown.dimension asc,
    breakdown.student_count desc,
    breakdown.label asc;
exception
  when sqlstate '22023' then
    raise exception using
      errcode = '22023',
      message = 'Counselor report filters are invalid.';
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Counselor report data is temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Counselor report data is temporarily unavailable.';
end;
$function$;

alter function public.get_counselor_report_breakdowns(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer
) owner to postgres;

comment on function public.get_counselor_report_breakdowns(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer
) is
  'Returns institution, target-country and application-stage Student counts for the filtered report population to the approved active verified institutional Counselor.';

revoke all on function public.get_counselor_report_breakdowns(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer
) from public, anon, authenticated, service_role;

grant execute on function public.get_counselor_report_breakdowns(
  text, text, text, integer, text, text, text, text, text, text,
  integer, integer
) to authenticated;


-- ============================================================
-- 5. CATALOG VERIFICATION
-- ============================================================

do $verification$
declare
  v_count integer;
  v_signature text;
begin

  -- The three public RPCs: SECURITY DEFINER, STABLE, postgres-owned, empty
  -- search_path.

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname in (
      'get_counselor_report_students',
      'get_counselor_report_summary',
      'get_counselor_report_breakdowns'
    )
    and procedure.prosecdef is true
    and procedure.provolatile = 's'
    and owner_role.rolname = 'postgres'
    and exists (
      select 1
      from pg_catalog.unnest(procedure.proconfig) as setting
      where setting in (
        'search_path=',
        'search_path=""'
      )
    );

  if v_count <> 3 then
    raise exception using
      errcode = '55000',
      message = 'Counselor report RPC catalog verification failed';
  end if;

  -- Only authenticated may execute them; the function body is the
  -- authorization boundary.

  foreach v_signature in array array[
    'public.get_counselor_report_students(text, text, text, integer, text, text, text, text, text, text, integer, integer, text, integer, integer)',
    'public.get_counselor_report_summary(text, text, text, integer, text, text, text, text, text, text, integer, integer)',
    'public.get_counselor_report_breakdowns(text, text, text, integer, text, text, text, text, text, text, integer, integer)'
  ]::text[]
  loop
    if pg_catalog.has_function_privilege('public', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
      or pg_catalog.has_function_privilege(
        'service_role',
        v_signature,
        'EXECUTE'
      )
      or not pg_catalog.has_function_privilege(
        'authenticated',
        v_signature,
        'EXECUTE'
      )
    then
      raise exception using
        errcode = '55000',
        message = 'Counselor report RPC privileges are invalid';
    end if;
  end loop;

  -- The private row builder is callable by no API role.

  v_signature :=
    'private.counselor_report_student_rows(text, text, text, integer, text, text, text, text, text, text, integer, integer)';

  if pg_catalog.has_function_privilege('public', v_signature, 'EXECUTE')
    or pg_catalog.has_function_privilege('anon', v_signature, 'EXECUTE')
    or pg_catalog.has_function_privilege(
      'authenticated',
      v_signature,
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      v_signature,
      'EXECUTE'
    )
  then
    raise exception using
      errcode = '55000',
      message = 'Counselor report row builder privileges are invalid';
  end if;

end;
$verification$;


commit;
