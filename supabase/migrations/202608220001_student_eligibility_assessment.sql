-- K-GEO Final Client Review Step 4: immutable Counselor Eligibility Assessment.
-- Student facts remain Student-owned; this migration stores only professional
-- Counselor assessments and their permanent revision history.

begin;

create type public.student_eligibility_status as enum (
  'needs_review',
  'eligible',
  'conditionally_eligible',
  'not_yet_eligible'
);

create type public.student_eligibility_academic_status as enum (
  'needs_review',
  'meets_requirement',
  'conditionally_meets',
  'does_not_meet'
);

create type public.student_eligibility_backlog_status as enum (
  'needs_review',
  'clear',
  'acceptable',
  'concern'
);

create type public.student_eligibility_english_readiness as enum (
  'needs_review',
  'ready',
  'in_progress',
  'required'
);

create type public.student_eligibility_aptitude_readiness as enum (
  'needs_review',
  'ready',
  'in_progress',
  'not_required',
  'required'
);

create type public.student_eligibility_profile_strength as enum (
  'needs_review',
  'strong',
  'good',
  'developing',
  'weak'
);

create type public.student_eligibility_application_readiness as enum (
  'needs_review',
  'ready',
  'partially_ready',
  'not_ready'
);

alter type public.student_eligibility_status owner to postgres;
alter type public.student_eligibility_academic_status owner to postgres;
alter type public.student_eligibility_backlog_status owner to postgres;
alter type public.student_eligibility_english_readiness owner to postgres;
alter type public.student_eligibility_aptitude_readiness owner to postgres;
alter type public.student_eligibility_profile_strength owner to postgres;
alter type public.student_eligibility_application_readiness owner to postgres;

revoke all on type public.student_eligibility_status
  from public, anon, authenticated, service_role;
revoke all on type public.student_eligibility_academic_status
  from public, anon, authenticated, service_role;
revoke all on type public.student_eligibility_backlog_status
  from public, anon, authenticated, service_role;
revoke all on type public.student_eligibility_english_readiness
  from public, anon, authenticated, service_role;
revoke all on type public.student_eligibility_aptitude_readiness
  from public, anon, authenticated, service_role;
revoke all on type public.student_eligibility_profile_strength
  from public, anon, authenticated, service_role;
revoke all on type public.student_eligibility_application_readiness
  from public, anon, authenticated, service_role;

grant usage on type public.student_eligibility_status to authenticated;
grant usage on type public.student_eligibility_academic_status to authenticated;
grant usage on type public.student_eligibility_backlog_status to authenticated;
grant usage on type public.student_eligibility_english_readiness to authenticated;
grant usage on type public.student_eligibility_aptitude_readiness to authenticated;
grant usage on type public.student_eligibility_profile_strength to authenticated;
grant usage on type public.student_eligibility_application_readiness
  to authenticated;

create function public.is_valid_eligibility_country_list(
  p_countries text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select
    p_countries is not null
    and (
      pg_catalog.cardinality(p_countries) = 0
      or pg_catalog.array_ndims(p_countries) = 1
    )
    and pg_catalog.cardinality(p_countries) <= 10
    and not exists (
      select 1
      from pg_catalog.unnest(p_countries) as country(value)
      where country.value is null
        or pg_catalog.char_length(country.value) not between 1 and 80
        or country.value <> pg_catalog.regexp_replace(
          pg_catalog.btrim(country.value),
          '[[:space:]]+',
          ' ',
          'g'
        )
        or country.value ~ '[[:cntrl:]]'
    )
    and pg_catalog.cardinality(p_countries) = (
      select pg_catalog.count(distinct pg_catalog.lower(country.value))
      from pg_catalog.unnest(p_countries) as country(value)
    );
$function$;

alter function public.is_valid_eligibility_country_list(text[])
  owner to postgres;

revoke all on function public.is_valid_eligibility_country_list(text[])
  from public, anon, authenticated, service_role;

create table public.student_eligibility_assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references public.profiles (id) on update restrict on delete restrict,
  overall_status public.student_eligibility_status not null,
  academic_status public.student_eligibility_academic_status not null,
  backlog_status public.student_eligibility_backlog_status not null,
  english_readiness public.student_eligibility_english_readiness not null,
  aptitude_readiness public.student_eligibility_aptitude_readiness not null,
  profile_strength public.student_eligibility_profile_strength not null,
  application_readiness
    public.student_eligibility_application_readiness not null,
  recommended_countries text[] not null default '{}'::text[],
  recommended_intake text,
  assessment_summary text not null,
  assessed_by uuid not null
    references public.profiles (id) on update restrict on delete restrict,
  assessed_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint student_eligibility_assessments_countries_check check (
    public.is_valid_eligibility_country_list(recommended_countries)
  ),
  constraint student_eligibility_assessments_intake_check check (
    recommended_intake is null
    or (
      pg_catalog.char_length(recommended_intake) between 1 and 40
      and recommended_intake = pg_catalog.regexp_replace(
        pg_catalog.btrim(recommended_intake),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and recommended_intake !~ '[[:cntrl:]]'
    )
  ),
  constraint student_eligibility_assessments_summary_check check (
    pg_catalog.char_length(assessment_summary) between 1 and 1500
    and assessment_summary = pg_catalog.regexp_replace(
      pg_catalog.btrim(assessment_summary),
      '[[:space:]]+',
      ' ',
      'g'
    )
    and assessment_summary !~ '[[:cntrl:]]'
  )
);

alter table public.student_eligibility_assessments owner to postgres;
alter table public.student_eligibility_assessments enable row level security;
alter table public.student_eligibility_assessments force row level security;

create index student_eligibility_assessments_latest_idx
  on public.student_eligibility_assessments (
    student_id,
    assessed_at desc,
    id desc
  );

revoke all on table public.student_eligibility_assessments
  from public, anon, authenticated, service_role;

comment on table public.student_eligibility_assessments is
  'Append-only Counselor Eligibility Assessment history. The deterministic newest row is the current assessment.';

create policy student_eligibility_assessments_select_primary_counselor
on public.student_eligibility_assessments
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_eligibility_assessments.student_id
  ))
);

create policy student_eligibility_assessments_select_director
on public.student_eligibility_assessments
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ))
);

create function public.protect_student_eligibility_assessment_history()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '42501',
    message = 'Eligibility Assessment history is immutable';
end;
$function$;

alter function public.protect_student_eligibility_assessment_history()
  owner to postgres;

revoke all on function
  public.protect_student_eligibility_assessment_history()
  from public, anon, authenticated, service_role;

create trigger protect_student_eligibility_assessment_history
before update or delete on public.student_eligibility_assessments
for each row
execute function public.protect_student_eligibility_assessment_history();

create function public.save_student_eligibility_assessment(
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

  select pg_catalog.coalesce(
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

alter function public.save_student_eligibility_assessment(
  uuid,
  public.student_eligibility_status,
  public.student_eligibility_academic_status,
  public.student_eligibility_backlog_status,
  public.student_eligibility_english_readiness,
  public.student_eligibility_aptitude_readiness,
  public.student_eligibility_profile_strength,
  public.student_eligibility_application_readiness,
  text[],
  text,
  text
) owner to postgres;

revoke all on function public.save_student_eligibility_assessment(
  uuid,
  public.student_eligibility_status,
  public.student_eligibility_academic_status,
  public.student_eligibility_backlog_status,
  public.student_eligibility_english_readiness,
  public.student_eligibility_aptitude_readiness,
  public.student_eligibility_profile_strength,
  public.student_eligibility_application_readiness,
  text[],
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.save_student_eligibility_assessment(
  uuid,
  public.student_eligibility_status,
  public.student_eligibility_academic_status,
  public.student_eligibility_backlog_status,
  public.student_eligibility_english_readiness,
  public.student_eligibility_aptitude_readiness,
  public.student_eligibility_profile_strength,
  public.student_eligibility_application_readiness,
  text[],
  text,
  text
) to authenticated;

create function public.get_counselor_student_eligibility_assessments(
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
    pg_catalog.coalesce(
      pg_catalog.nullif(pg_catalog.btrim(counselor.full_name), ''),
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

alter function
  public.get_counselor_student_eligibility_assessments(uuid, integer)
  owner to postgres;

revoke all on function
  public.get_counselor_student_eligibility_assessments(uuid, integer)
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_counselor_student_eligibility_assessments(uuid, integer)
  to authenticated;

create function public.get_counselor_latest_student_eligibility_assessment(
  p_student_id uuid
)
returns table (
  overall_status public.student_eligibility_status,
  assessed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if public.is_active_primary_counselor_for_student(p_student_id)
    is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  return query
  select assessment.overall_status, assessment.assessed_at
  from public.student_eligibility_assessments as assessment
  where assessment.student_id = p_student_id
  order by assessment.assessed_at desc, assessment.id desc
  limit 1;
end;
$function$;

alter function
  public.get_counselor_latest_student_eligibility_assessment(uuid)
  owner to postgres;

revoke all on function
  public.get_counselor_latest_student_eligibility_assessment(uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_counselor_latest_student_eligibility_assessment(uuid)
  to authenticated;

create function public.get_director_latest_student_eligibility_assessment(
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
    pg_catalog.coalesce(
      pg_catalog.nullif(pg_catalog.btrim(counselor.full_name), ''),
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

alter function
  public.get_director_latest_student_eligibility_assessment(uuid)
  owner to postgres;

revoke all on function
  public.get_director_latest_student_eligibility_assessment(uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_director_latest_student_eligibility_assessment(uuid)
  to authenticated;

comment on function public.save_student_eligibility_assessment(
  uuid,
  public.student_eligibility_status,
  public.student_eligibility_academic_status,
  public.student_eligibility_backlog_status,
  public.student_eligibility_english_readiness,
  public.student_eligibility_aptitude_readiness,
  public.student_eligibility_profile_strength,
  public.student_eligibility_application_readiness,
  text[],
  text,
  text
) is
  'Appends one immutable Eligibility Assessment as the current active Primary Counselor; identity and time are database-derived.';

comment on function
  public.get_counselor_student_eligibility_assessments(uuid, integer) is
  'Returns at most twenty newest immutable Eligibility Assessment revisions to the current active Primary Counselor.';

comment on function
  public.get_counselor_latest_student_eligibility_assessment(uuid) is
  'Returns only the deterministic latest Eligibility status for the current active Primary Counselor Workspace overview.';

comment on function
  public.get_director_latest_student_eligibility_assessment(uuid) is
  'Returns the deterministic latest Eligibility Assessment to an active verified Director for read-only oversight.';

commit;
