-- Read-only verification for K-GEO Student Profile V2 client corrections.

begin transaction read only;
set local search_path = '';

with checks as (
  select 'ACHIEVEMENT_SPORTS_INSTALLED'::text as check_name,
    exists (
      select 1
      from pg_catalog.pg_enum as enum_value
      where enum_value.enumtypid =
        'public.student_achievement_type'::pg_catalog.regtype
        and enum_value.enumlabel::text = 'sports'
    ) as passed
  union all
  select 'EXAM_DMAT_INSTALLED', exists (
    select 1
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid =
      'public.student_exam_name'::pg_catalog.regtype
      and enum_value.enumlabel::text = 'dmat'
  )
  union all
  select 'CURRENT_STUDY_MODES_INSTALLED', coalesce((
    select pg_catalog.array_agg(
      enum_value.enumlabel::text order by enum_value.enumsortorder
    ) filter (where enum_value.enumlabel::text in ('on_campus', 'online'))
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid =
      'public.student_study_mode'::pg_catalog.regtype
  ) = array['on_campus', 'online']::text[], false)
  union all
  select 'V2_ENUMS_EXACT',
    coalesce((
      select pg_catalog.array_agg(
        enum_value.enumlabel::text order by enum_value.enumsortorder
      )
      from pg_catalog.pg_enum as enum_value
      where enum_value.enumtypid =
        pg_catalog.to_regtype('public.student_preferred_study_area')
    ) = array['engineering', 'business', 'psychology']::text[], false)
    and coalesce((
      select pg_catalog.array_agg(
        enum_value.enumlabel::text order by enum_value.enumsortorder
      )
      from pg_catalog.pg_enum as enum_value
      where enum_value.enumtypid =
        pg_catalog.to_regtype('public.student_preferred_domain')
    ) = array[
      'engineering_computing', 'engineering_electrical',
      'engineering_mechanical', 'business_management', 'business_finance',
      'business_analytics', 'psychology_clinical',
      'psychology_counseling', 'psychology_organizational'
    ]::text[], false)
    and coalesce((
      select pg_catalog.array_agg(
        enum_value.enumlabel::text order by enum_value.enumsortorder
      )
      from pg_catalog.pg_enum as enum_value
      where enum_value.enumtypid =
        pg_catalog.to_regtype('public.student_study_pathway')
    ) = array['masters_degree', 'global_track']::text[], false)
    and coalesce((
      select pg_catalog.array_agg(
        enum_value.enumlabel::text order by enum_value.enumsortorder
      )
      from pg_catalog.pg_enum as enum_value
      where enum_value.enumtypid =
        pg_catalog.to_regtype('public.student_global_track_program')
    ) = array[
      'fifteen_day_program', 'one_year_program', 'two_year_program'
    ]::text[], false)
    and coalesce((
      select pg_catalog.array_agg(
        enum_value.enumlabel::text order by enum_value.enumsortorder
      )
      from pg_catalog.pg_enum as enum_value
      where enum_value.enumtypid =
        pg_catalog.to_regtype('public.student_funding_method')
    ) = array['self_funded']::text[], false)
  union all
  select 'PREFERENCE_COLUMNS_EXACT', pg_catalog.count(*) = 5
  from (
    values
      ('preferred_study_area'::text, 'public.student_preferred_study_area'::text),
      ('preferred_domain'::text, 'public.student_preferred_domain'::text),
      ('study_pathway'::text, 'public.student_study_pathway'::text),
      ('global_track_program'::text, 'public.student_global_track_program'::text),
      ('funding_method'::text, 'public.student_funding_method'::text)
  ) as expected(column_name, type_name)
  join pg_catalog.pg_attribute as attribute
    on attribute.attrelid = 'public.student_preferences'::pg_catalog.regclass
    and attribute.attname::text = expected.column_name
    and not attribute.attisdropped
    and pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) =
      expected.type_name
  union all
  select 'STUDY_AREA_DOMAIN_CONSTRAINT_VALID', exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid =
      'public.student_preferences'::pg_catalog.regclass
      and constraint_record.conname::text =
        'student_preferences_study_area_domain_check'
      and constraint_record.contype = 'c'
      and constraint_record.convalidated
  )
  union all
  select 'STUDY_PATHWAY_CONSTRAINT_VALID', exists (
    select 1
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid =
      'public.student_preferences'::pg_catalog.regclass
      and constraint_record.conname::text =
        'student_preferences_study_pathway_check'
      and constraint_record.contype = 'c'
      and constraint_record.convalidated
      and pg_catalog.pg_get_constraintdef(
        constraint_record.oid,
        true
      ) like '%study_pathway%masters_degree%global_track_program IS NULL%global_track%global_track_program IS NOT NULL%'
  )
  union all
  select 'V2_INPUT_TRIGGERS_ENABLED', pg_catalog.count(*) = 2
  from pg_catalog.pg_trigger as trigger_record
  where trigger_record.tgrelid in (
      'public.student_profiles'::pg_catalog.regclass,
      'public.student_preferences'::pg_catalog.regclass
    )
    and trigger_record.tgname::text = any(array[
      'student_profiles_25_enforce_v2_input',
      'student_preferences_25_enforce_v2_input'
    ]::text[])
    and trigger_record.tgenabled = 'O'
    and not trigger_record.tgisinternal
  union all
  select 'PROFILE_DOCUMENTS_UNCHANGED',
    pg_catalog.to_regclass('public.student_profile_documents') is not null
    and exists (
      select 1 from storage.buckets as bucket
      where bucket.id = 'student-profile-documents'
        and bucket.public is false
        and bucket.file_size_limit = 10485760
    )
)
select check_name, coalesce(passed, false) as passed
from checks
order by check_name;

rollback;
