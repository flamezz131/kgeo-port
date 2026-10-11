-- K-GEO Student Graduation Year Storage Envelope
-- Migration: 202610080003_student_graduation_year_range.sql
--
-- Purpose:
-- Widen the database safety envelope for
-- public.student_profiles.graduation_year from 2024-2040 to 2000-2100.
--
-- The application owns the selectable rule (current calendar year, the four
-- years before it and the four after it). The database deliberately does NOT
-- encode the current calendar year, so the selectable range can move every
-- year without another migration. Application validation stays stricter
-- than this envelope.
--
-- This migration changes exactly one database object:
--
--   public.student_profiles.student_profiles_graduation_year_check
--
-- - No other constraint, column, function, policy or trigger is changed.
-- - graduation_year remains NOT NULL through its own existing constraint.
-- - Every existing row already satisfies the wider rule.
-- - The replacement constraint validates existing rows; it rewrites none.

begin;


-- ============================================================
-- 0. PRE-FLIGHT
-- ============================================================
--
-- Fail closed unless the column and the reviewed 2024-2040 constraint are
-- exactly as expected.

do $preflight$
declare
  v_column_count integer;
  v_constraint_count integer;
  v_constraint_definition text;
  v_other_constraint_count integer;
  v_other_constraint_fingerprint text;
begin

  select pg_catalog.count(*)
  into v_column_count
  from pg_catalog.pg_attribute as attribute
  where attribute.attrelid =
      'public.student_profiles'::pg_catalog.regclass
    and attribute.attname = 'graduation_year'
    and attribute.attnum > 0
    and attribute.attisdropped is false
    and attribute.atttypid = 'pg_catalog.int4'::pg_catalog.regtype
    and attribute.attnotnull is true;

  if v_column_count <> 1 then
    raise exception using
      errcode = '55000',
      message =
        'public.student_profiles.graduation_year is not the reviewed NOT NULL integer column';
  end if;


  select
    pg_catalog.count(*),
    pg_catalog.min(
      pg_catalog.regexp_replace(
        pg_catalog.pg_get_constraintdef(constraint_record.oid),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  into
    v_constraint_count,
    v_constraint_definition
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.student_profiles'::pg_catalog.regclass
    and constraint_record.conname =
      'student_profiles_graduation_year_check'
    and constraint_record.contype = 'c'
    and constraint_record.convalidated is true;

  if v_constraint_count <> 1
    or v_constraint_definition is null
  then
    raise exception using
      errcode = '55000',
      message =
        'public.student_profiles.student_profiles_graduation_year_check is missing or not validated';
  end if;

  -- The reviewed pre-migration rule is exactly 2024-2040.

  if pg_catalog.strpos(
      v_constraint_definition,
      'graduation_year >= 2024'
    ) = 0
    or pg_catalog.strpos(
      v_constraint_definition,
      'graduation_year <= 2040'
    ) = 0
    or pg_catalog.strpos(
      v_constraint_definition,
      '2000'
    ) <> 0
    or pg_catalog.strpos(
      v_constraint_definition,
      '2100'
    ) <> 0
    or pg_catalog.strpos(
      v_constraint_definition,
      ' OR '
    ) <> 0
  then
    raise exception using
      errcode = '55000',
      message =
        'student_profiles_graduation_year_check no longer matches the expected 2024-2040 contract';
  end if;


  -- Record every other CHECK constraint on the table so the verification
  -- can prove that none of them changed.

  select
    pg_catalog.count(*),
    pg_catalog.md5(
      coalesce(
        pg_catalog.string_agg(
          constraint_record.oid::text
            || ':'
            || constraint_record.conname::text
            || ':'
            || pg_catalog.pg_get_constraintdef(constraint_record.oid),
          '|'
          order by constraint_record.conname::text
        ),
        ''
      )
    )
  into
    v_other_constraint_count,
    v_other_constraint_fingerprint
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.student_profiles'::pg_catalog.regclass
    and constraint_record.conname <>
      'student_profiles_graduation_year_check';

  perform pg_catalog.set_config(
    'kgeo_migration.student_profiles_other_constraint_count',
    v_other_constraint_count::text,
    true
  );

  perform pg_catalog.set_config(
    'kgeo_migration.student_profiles_other_constraints',
    v_other_constraint_fingerprint,
    true
  );

  -- A table rewrite would assign a new relation file node.

  perform pg_catalog.set_config(
    'kgeo_migration.student_profiles_filenode',
    pg_catalog.pg_relation_filenode(
      'public.student_profiles'::pg_catalog.regclass
    )::text,
    true
  );

end;
$preflight$;


-- ============================================================
-- 1. REPLACE THE GRADUATION YEAR CHECK CONSTRAINT
-- ============================================================
--
-- OLD:
--   graduation_year between 2024 and 2040
--
-- NEW:
--   graduation_year between 2000 and 2100
--
-- The constraint is added validated: every existing row is checked, and no
-- row is rewritten.

alter table public.student_profiles
  drop constraint student_profiles_graduation_year_check,
  add constraint student_profiles_graduation_year_check
    check (graduation_year between 2000 and 2100);

comment on constraint student_profiles_graduation_year_check
  on public.student_profiles is
  'Database safety envelope only. The selectable Student graduation year range is enforced by trusted application validation relative to the current calendar year.';


-- ============================================================
-- 2. POST-REPLACEMENT CATALOG VERIFICATION
-- ============================================================

do $verification$
declare
  v_constraint_count integer;
  v_constraint_definition text;
  v_other_constraint_count integer;
  v_other_constraint_fingerprint text;
begin

  select
    pg_catalog.count(*),
    pg_catalog.min(
      pg_catalog.regexp_replace(
        pg_catalog.pg_get_constraintdef(constraint_record.oid),
        '[[:space:]]+',
        ' ',
        'g'
      )
    )
  into
    v_constraint_count,
    v_constraint_definition
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.student_profiles'::pg_catalog.regclass
    and constraint_record.conname =
      'student_profiles_graduation_year_check'
    and constraint_record.contype = 'c'
    and constraint_record.convalidated is true;

  if v_constraint_count <> 1
    or v_constraint_definition is null
  then
    raise exception using
      errcode = '55000',
      message =
        'Replacement student_profiles_graduation_year_check is missing or not validated';
  end if;

  -- New safety envelope present, old contract gone.

  if pg_catalog.strpos(
      v_constraint_definition,
      'graduation_year >= 2000'
    ) = 0
    or pg_catalog.strpos(
      v_constraint_definition,
      'graduation_year <= 2100'
    ) = 0
    or pg_catalog.strpos(
      v_constraint_definition,
      '2024'
    ) <> 0
    or pg_catalog.strpos(
      v_constraint_definition,
      '2040'
    ) <> 0
    or pg_catalog.strpos(
      v_constraint_definition,
      ' OR '
    ) <> 0
  then
    raise exception using
      errcode = '55000',
      message =
        'Replacement student_profiles_graduation_year_check does not carry the 2000-2100 envelope';
  end if;


  -- Every other constraint on the table is exactly as recorded.

  select
    pg_catalog.count(*),
    pg_catalog.md5(
      coalesce(
        pg_catalog.string_agg(
          constraint_record.oid::text
            || ':'
            || constraint_record.conname::text
            || ':'
            || pg_catalog.pg_get_constraintdef(constraint_record.oid),
          '|'
          order by constraint_record.conname::text
        ),
        ''
      )
    )
  into
    v_other_constraint_count,
    v_other_constraint_fingerprint
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.student_profiles'::pg_catalog.regclass
    and constraint_record.conname <>
      'student_profiles_graduation_year_check';

  if v_other_constraint_count::text is distinct from
      pg_catalog.current_setting(
        'kgeo_migration.student_profiles_other_constraint_count',
        true
      )
    or v_other_constraint_fingerprint is distinct from
      pg_catalog.current_setting(
        'kgeo_migration.student_profiles_other_constraints',
        true
      )
  then
    raise exception using
      errcode = '55000',
      message =
        'Another public.student_profiles constraint changed unexpectedly';
  end if;


  -- The table was validated in place, not rewritten.

  if pg_catalog.pg_relation_filenode(
      'public.student_profiles'::pg_catalog.regclass
    )::text is distinct from
    pg_catalog.current_setting(
      'kgeo_migration.student_profiles_filenode',
      true
    )
  then
    raise exception using
      errcode = '55000',
      message =
        'public.student_profiles was rewritten unexpectedly';
  end if;


  -- The column itself is unchanged.

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute
    where attribute.attrelid =
        'public.student_profiles'::pg_catalog.regclass
      and attribute.attname = 'graduation_year'
      and attribute.attnum > 0
      and attribute.attisdropped is false
      and attribute.atttypid = 'pg_catalog.int4'::pg_catalog.regtype
      and attribute.attnotnull is true
  ) then
    raise exception using
      errcode = '55000',
      message =
        'public.student_profiles.graduation_year changed unexpectedly';
  end if;

end;
$verification$;


commit;
