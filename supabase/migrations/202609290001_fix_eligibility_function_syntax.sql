-- Fix: eligibility assessment functions failed at run time with
--   42883: function pg_catalog.nullif(text, unknown) does not exist
-- NULLIF and COALESCE are SQL syntax, not catalog functions, so they cannot be
-- schema-qualified. Both are safe to use unqualified under search_path = ''.
--
-- This migration re-creates the three affected functions with identical logic,
-- signatures and return shapes. CREATE OR REPLACE keeps the existing owner,
-- grants and comments. No data is read or changed by this migration.

create or replace function public.save_student_eligibility_assessment(
  p_student_id uuid,
  p_overall_status public.student_eligibility_status,
  p_academic_status public.student_eligibility_academic_status,
  p_backlog_status public.student_eligibility_backlog_status,
  p_english_readiness public.student_eligibility_english_readiness,
  p_aptitude_readiness public.student_eligibility_aptitude_readiness,
  p_profile_strength public.student_eligibility_profile_strength,
  p_application_readiness
    public.student_eligibility_application_readiness,
  p_recommended_countries text[],
  p_recommended_intake text,
  p_assessment_summary text
)
returns table (
  assessment_id uuid,
  assessed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_counselor_id uuid := (select auth.uid());
  v_assessment_id uuid;
  v_assessed_at timestamptz;
  v_recommended_countries text[];
  v_recommended_intake text;
  v_assessment_summary text;
begin
  if v_counselor_id is null then
    raise exception using
      errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  -- Use the same Student-profile lock root as Director reassignment. A save
  -- linearizes before or after reassignment, then checks current ownership.
  perform 1
  from public.profiles as student_profile
  where student_profile.id = p_student_id
    and student_profile.role = 'student'::public.user_role
  for key share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Eligibility Assessment student is invalid';
  end if;

  if public.is_active_primary_counselor_for_student(p_student_id)
    is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  if p_recommended_countries is null
    or exists (
      select 1
      from pg_catalog.unnest(p_recommended_countries) as country(value)
      where country.value is null
        or country.value ~ '[[:cntrl:]]'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Recommended countries are invalid';
  end if;

  select coalesce(
    pg_catalog.array_agg(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(country.value),
        '[[:space:]]+',
        ' ',
        'g'
      )
      order by country.position
    ),
    '{}'::text[]
  )
  into v_recommended_countries
  from pg_catalog.unnest(p_recommended_countries) with ordinality
    as country(value, position);

  if public.is_valid_eligibility_country_list(v_recommended_countries)
    is distinct from true then
    raise exception using
      errcode = '22023',
      message = 'Recommended countries are invalid';
  end if;

  if p_recommended_intake is null
    or pg_catalog.btrim(p_recommended_intake) = '' then
    v_recommended_intake := null;
  else
    if p_recommended_intake ~ '[[:cntrl:]]' then
      raise exception using
        errcode = '22023',
        message = 'Recommended intake is invalid';
    end if;
    v_recommended_intake := pg_catalog.regexp_replace(
      pg_catalog.btrim(p_recommended_intake),
      '[[:space:]]+',
      ' ',
      'g'
    );
  end if;

  if v_recommended_intake is not null
    and pg_catalog.char_length(v_recommended_intake) not between 1 and 40 then
    raise exception using
      errcode = '22023',
      message = 'Recommended intake is invalid';
  end if;

  if p_assessment_summary is null
    or p_assessment_summary ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'Assessment summary is invalid';
  end if;

  v_assessment_summary := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_assessment_summary),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(v_assessment_summary) not between 1 and 1500 then
    raise exception using
      errcode = '22023',
      message = 'Assessment summary is invalid';
  end if;

  v_assessed_at := pg_catalog.clock_timestamp();

  insert into public.student_eligibility_assessments (
    student_id,
    overall_status,
    academic_status,
    backlog_status,
    english_readiness,
    aptitude_readiness,
    profile_strength,
    application_readiness,
    recommended_countries,
    recommended_intake,
    assessment_summary,
    assessed_by,
    assessed_at
  ) values (
    p_student_id,
    p_overall_status,
    p_academic_status,
    p_backlog_status,
    p_english_readiness,
    p_aptitude_readiness,
    p_profile_strength,
    p_application_readiness,
    v_recommended_countries,
    v_recommended_intake,
    v_assessment_summary,
    v_counselor_id,
    v_assessed_at
  )
  returning id into v_assessment_id;

  return query select v_assessment_id, v_assessed_at;
end;
$function$;

create or replace function public.get_counselor_student_eligibility_assessments(
  p_student_id uuid,
  p_limit integer default 20
)
returns table (
  assessment_id uuid,
  overall_status public.student_eligibility_status,
  academic_status public.student_eligibility_academic_status,
  backlog_status public.student_eligibility_backlog_status,
  english_readiness public.student_eligibility_english_readiness,
  aptitude_readiness public.student_eligibility_aptitude_readiness,
  profile_strength public.student_eligibility_profile_strength,
  application_readiness
    public.student_eligibility_application_readiness,
  recommended_countries text[],
  recommended_intake text,
  assessment_summary text,
  assessor_full_name text,
  assessed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using
      errcode = '22023',
      message = 'Eligibility Assessment history request is invalid';
  end if;

  if public.is_active_primary_counselor_for_student(p_student_id)
    is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  return query
  select
    assessment.id,
    assessment.overall_status,
    assessment.academic_status,
    assessment.backlog_status,
    assessment.english_readiness,
    assessment.aptitude_readiness,
    assessment.profile_strength,
    assessment.application_readiness,
    assessment.recommended_countries,
    assessment.recommended_intake,
    assessment.assessment_summary,
    coalesce(
      nullif(pg_catalog.btrim(counselor.full_name), ''),
      'Counselor'
    ),
    assessment.assessed_at
  from public.student_eligibility_assessments as assessment
  inner join public.profiles as counselor
    on counselor.id = assessment.assessed_by
  where assessment.student_id = p_student_id
  order by assessment.assessed_at desc, assessment.id desc
  limit p_limit;
end;
$function$;

create or replace function public.get_director_latest_student_eligibility_assessment(
  p_student_id uuid
)
returns table (
  student_id uuid,
  overall_status public.student_eligibility_status,
  academic_status public.student_eligibility_academic_status,
  backlog_status public.student_eligibility_backlog_status,
  english_readiness public.student_eligibility_english_readiness,
  aptitude_readiness public.student_eligibility_aptitude_readiness,
  profile_strength public.student_eligibility_profile_strength,
  application_readiness
    public.student_eligibility_application_readiness,
  recommended_countries text[],
  recommended_intake text,
  assessment_summary text,
  assessor_full_name text,
  assessed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  return query
  select
    assessment.student_id,
    assessment.overall_status,
    assessment.academic_status,
    assessment.backlog_status,
    assessment.english_readiness,
    assessment.aptitude_readiness,
    assessment.profile_strength,
    assessment.application_readiness,
    assessment.recommended_countries,
    assessment.recommended_intake,
    assessment.assessment_summary,
    coalesce(
      nullif(pg_catalog.btrim(counselor.full_name), ''),
      'Counselor'
    ),
    assessment.assessed_at
  from public.student_eligibility_assessments as assessment
  inner join public.profiles as counselor
    on counselor.id = assessment.assessed_by
  where assessment.student_id = p_student_id
  order by assessment.assessed_at desc, assessment.id desc
  limit 1;
end;
$function$;
