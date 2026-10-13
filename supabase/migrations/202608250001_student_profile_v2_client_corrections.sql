-- K-GEO Student Profile V2 client-meeting corrections.
-- Profile Documents and the consultation workflow remain unchanged.

begin;

set local search_path = '';

alter type public.student_achievement_type add value if not exists 'sports' before 'other';
alter type public.student_exam_name add value if not exists 'dmat' before 'gate';
alter type public.student_study_mode add value if not exists 'on_campus';
alter type public.student_study_mode add value if not exists 'online';

do $block$
declare
  v_type_oid oid := pg_catalog.to_regtype(
    'public.student_preferred_study_area'
  )::oid;
  v_actual_labels text[];
begin
  if v_type_oid is null then
    execute $ddl$create type public.student_preferred_study_area as enum (
      'engineering',
      'business',
      'psychology'
    )$ddl$;
  else
    select pg_catalog.array_agg(
      enum_value.enumlabel::text order by enum_value.enumsortorder
    )
    into v_actual_labels
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid = v_type_oid;

    if v_actual_labels is distinct from
      array['engineering', 'business', 'psychology']::text[] then
      raise exception using
        errcode = '55000',
        message = 'Existing Student Preferred Study Area type does not match the reviewed contract';
    end if;
  end if;
end;
$block$;

do $block$
declare
  v_type_oid oid := pg_catalog.to_regtype(
    'public.student_preferred_domain'
  )::oid;
  v_actual_labels text[];
begin
  if v_type_oid is null then
    execute $ddl$create type public.student_preferred_domain as enum (
      'engineering_computing',
      'engineering_electrical',
      'engineering_mechanical',
      'business_management',
      'business_finance',
      'business_analytics',
      'psychology_clinical',
      'psychology_counseling',
      'psychology_organizational'
    )$ddl$;
  else
    select pg_catalog.array_agg(
      enum_value.enumlabel::text order by enum_value.enumsortorder
    )
    into v_actual_labels
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid = v_type_oid;

    if v_actual_labels is distinct from array[
      'engineering_computing', 'engineering_electrical',
      'engineering_mechanical', 'business_management', 'business_finance',
      'business_analytics', 'psychology_clinical',
      'psychology_counseling', 'psychology_organizational'
    ]::text[] then
      raise exception using
        errcode = '55000',
        message = 'Existing Student Preferred Domain type does not match the reviewed contract';
    end if;
  end if;
end;
$block$;

do $block$
declare
  v_type_oid oid := pg_catalog.to_regtype(
    'public.student_study_pathway'
  )::oid;
  v_actual_labels text[];
begin
  if v_type_oid is null then
    execute $ddl$create type public.student_study_pathway as enum (
      'masters_degree',
      'global_track'
    )$ddl$;
  else
    select pg_catalog.array_agg(
      enum_value.enumlabel::text order by enum_value.enumsortorder
    )
    into v_actual_labels
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid = v_type_oid;

    if v_actual_labels is distinct from
      array['masters_degree', 'global_track']::text[] then
      raise exception using
        errcode = '55000',
        message = 'Existing Student Study Pathway type does not match the reviewed contract';
    end if;
  end if;
end;
$block$;

do $block$
declare
  v_type_oid oid := pg_catalog.to_regtype(
    'public.student_global_track_program'
  )::oid;
  v_actual_labels text[];
begin
  if v_type_oid is null then
    execute $ddl$create type public.student_global_track_program as enum (
      'fifteen_day_program',
      'one_year_program',
      'two_year_program'
    )$ddl$;
  else
    select pg_catalog.array_agg(
      enum_value.enumlabel::text order by enum_value.enumsortorder
    )
    into v_actual_labels
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid = v_type_oid;

    if v_actual_labels is distinct from array[
      'fifteen_day_program', 'one_year_program', 'two_year_program'
    ]::text[] then
      raise exception using
        errcode = '55000',
        message = 'Existing Student Global Track Program type does not match the reviewed contract';
    end if;
  end if;
end;
$block$;

do $block$
declare
  v_type_oid oid := pg_catalog.to_regtype(
    'public.student_funding_method'
  )::oid;
  v_actual_labels text[];
begin
  if v_type_oid is null then
    execute $ddl$create type public.student_funding_method as enum (
      'self_funded'
    )$ddl$;
  else
    select pg_catalog.array_agg(
      enum_value.enumlabel::text order by enum_value.enumsortorder
    )
    into v_actual_labels
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid = v_type_oid;

    if v_actual_labels is distinct from array['self_funded']::text[] then
      raise exception using
        errcode = '55000',
        message = 'Existing Student Funding Method type does not match the reviewed contract';
    end if;
  end if;
end;
$block$;

alter table public.student_preferences
  add column preferred_study_area public.student_preferred_study_area,
  add column preferred_domain public.student_preferred_domain,
  add column study_pathway public.student_study_pathway,
  add column global_track_program public.student_global_track_program,
  add column funding_method public.student_funding_method;

alter table public.student_preferences
  add constraint student_preferences_study_area_domain_check
  check (
    (preferred_study_area is null and preferred_domain is null)
    or (
      preferred_study_area = 'engineering'::public.student_preferred_study_area
      and preferred_domain in (
        'engineering_computing'::public.student_preferred_domain,
        'engineering_electrical'::public.student_preferred_domain,
        'engineering_mechanical'::public.student_preferred_domain
      )
    )
    or (
      preferred_study_area = 'business'::public.student_preferred_study_area
      and preferred_domain in (
        'business_management'::public.student_preferred_domain,
        'business_finance'::public.student_preferred_domain,
        'business_analytics'::public.student_preferred_domain
      )
    )
    or (
      preferred_study_area = 'psychology'::public.student_preferred_study_area
      and preferred_domain in (
        'psychology_clinical'::public.student_preferred_domain,
        'psychology_counseling'::public.student_preferred_domain,
        'psychology_organizational'::public.student_preferred_domain
      )
    )
  );

alter table public.student_preferences
  add constraint student_preferences_study_pathway_check
  check (
    (study_pathway is null and global_track_program is null)
    or (
      study_pathway = 'masters_degree'::public.student_study_pathway
      and global_track_program is null
    )
    or (
      study_pathway = 'global_track'::public.student_study_pathway
      and global_track_program is not null
    )
  );

-- The current Study Pathway replaces the legacy Student-facing study-level
-- question while preserving historical rows in the existing completion view.
create or replace view public.student_profile_completion
with (security_invoker = true, security_barrier = true)
as
select
  student_profile.student_id,
  student_profile.profile_status,
  completion.academic_section_complete,
  completion.preferences_section_complete,
  exists (
    select 1
    from public.student_test_scores as test_score
    where test_score.student_id = student_profile.student_id
  ) as test_scores_section_started,
  exists (
    select 1
    from public.student_achievements as achievement
    where achievement.student_id = student_profile.student_id
  ) as achievements_section_started,
  completion.essential_fields_completed,
  11::integer as essential_fields_total,
  pg_catalog.round(
    completion.essential_fields_completed::numeric * 100.0 / 11.0
  )::integer as overall_completion_percentage,
  (
    completion.academic_section_complete
    and completion.preferences_section_complete
  ) as ready_for_counseling
from public.student_profiles as student_profile
left join public.student_preferences as preference
  on preference.student_id = student_profile.student_id
cross join lateral (
  select
    (
      student_profile.roll_number is not null
      and student_profile.personal_email is not null
      and student_profile.mobile_number is not null
      and student_profile.college is not null
      and student_profile.course is not null
      and student_profile.department is not null
      and student_profile.graduation_year is not null
      and (
        student_profile.cgpa is not null
        or student_profile.cgpa_unavailable is true
      )
    ) as academic_section_complete,
    (
      preference.student_id is not null
      and preference.higher_studies_interest is not null
      and (
        preference.study_pathway is not null
        or preference.preferred_study_level is not null
      )
      and preference.target_intake is not null
    ) as preferences_section_complete,
    (
      case when student_profile.roll_number is not null then 1 else 0 end
      + case when student_profile.personal_email is not null then 1 else 0 end
      + case when student_profile.mobile_number is not null then 1 else 0 end
      + case when student_profile.college is not null then 1 else 0 end
      + case when student_profile.course is not null then 1 else 0 end
      + case when student_profile.department is not null then 1 else 0 end
      + case when student_profile.graduation_year is not null then 1 else 0 end
      + case
          when student_profile.cgpa is not null
            or student_profile.cgpa_unavailable is true
          then 1
          else 0
        end
      + case
          when preference.higher_studies_interest is not null then 1 else 0
        end
      + case
          when preference.study_pathway is not null
            or preference.preferred_study_level is not null
          then 1
          else 0
        end
      + case when preference.target_intake is not null then 1 else 0 end
    )::integer as essential_fields_completed
) as completion;

comment on view public.student_profile_completion is
  'RLS-preserving derived completion for eleven essential counseling fields; current Study Pathway and historical Preferred Study Level share one compatibility field.';

create function public.enforce_student_profile_v2_input_contract()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' and new.cgpa_unavailable is true then
    raise exception using
      errcode = '23514',
      message = 'CGPA must be provided through the current Student Profile contract';
  end if;

  if tg_op = 'UPDATE'
    and new.cgpa_unavailable is true
    and old.cgpa_unavailable is distinct from true then
    raise exception using
      errcode = '23514',
      message = 'CGPA must be provided through the current Student Profile contract';
  end if;

  return new;
end;
$function$;

create function public.enforce_student_preference_v2_input_contract()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' and (
    new.preferred_study_area is null
    or new.preferred_domain is null
    or new.study_pathway is null
    or new.funding_method is null
    or new.study_mode not in (
      'on_campus'::public.student_study_mode,
      'online'::public.student_study_mode
    )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Complete the current Student Profile preference fields';
  end if;

  if tg_op = 'UPDATE'
    and row(
      new.preferred_study_area,
      new.preferred_domain,
      new.study_pathway,
      new.global_track_program,
      new.funding_method,
      new.study_mode
    ) is distinct from row(
      old.preferred_study_area,
      old.preferred_domain,
      old.study_pathway,
      old.global_track_program,
      old.funding_method,
      old.study_mode
    )
    and (
      new.preferred_study_area is null
      or new.preferred_domain is null
      or new.study_pathway is null
      or new.funding_method is null
      or new.study_mode not in (
        'on_campus'::public.student_study_mode,
        'online'::public.student_study_mode
      )
    ) then
    raise exception using
      errcode = '23514',
      message = 'Complete the current Student Profile preference fields';
  end if;

  if tg_op = 'INSERT' and new.study_mode in (
    'full_time'::public.student_study_mode,
    'part_time'::public.student_study_mode,
    'either'::public.student_study_mode
  ) then
    raise exception using
      errcode = '23514',
      message = 'Choose On-campus or Online for the current Student Profile';
  end if;

  if tg_op = 'UPDATE'
    and new.study_mode in (
      'full_time'::public.student_study_mode,
      'part_time'::public.student_study_mode,
      'either'::public.student_study_mode
    )
    and old.study_mode is distinct from new.study_mode then
    raise exception using
      errcode = '23514',
      message = 'Choose On-campus or Online for the current Student Profile';
  end if;

  return new;
end;
$function$;

alter function public.enforce_student_profile_v2_input_contract()
  owner to postgres;
alter function public.enforce_student_preference_v2_input_contract()
  owner to postgres;

revoke all on function public.enforce_student_profile_v2_input_contract()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_student_preference_v2_input_contract()
  from public, anon, authenticated, service_role;

create trigger student_profiles_25_enforce_v2_input
before insert or update on public.student_profiles
for each row
execute function public.enforce_student_profile_v2_input_contract();

create trigger student_preferences_25_enforce_v2_input
before insert or update on public.student_preferences
for each row
execute function public.enforce_student_preference_v2_input_contract();

revoke all privileges on type public.student_preferred_study_area
  from public, anon, authenticated;
revoke all privileges on type public.student_preferred_domain
  from public, anon, authenticated;
revoke all privileges on type public.student_study_pathway
  from public, anon, authenticated;
revoke all privileges on type public.student_global_track_program
  from public, anon, authenticated;
revoke all privileges on type public.student_funding_method
  from public, anon, authenticated;

grant usage on type public.student_preferred_study_area to authenticated;
grant usage on type public.student_preferred_domain to authenticated;
grant usage on type public.student_study_pathway to authenticated;
grant usage on type public.student_global_track_program to authenticated;
grant usage on type public.student_funding_method to authenticated;

grant insert (
  preferred_study_area,
  preferred_domain,
  study_pathway,
  global_track_program,
  funding_method
) on public.student_preferences to authenticated;

grant update (
  preferred_study_area,
  preferred_domain,
  study_pathway,
  global_track_program,
  funding_method
) on public.student_preferences to authenticated;

comment on type public.student_preferred_domain is
  'Conservative initial Profile V2 domain catalog; requires client confirmation before expansion.';
comment on column public.student_preferences.budget_range is
  'Student-reported tuition-fee budget; legacy column name retained for compatibility.';

commit;
