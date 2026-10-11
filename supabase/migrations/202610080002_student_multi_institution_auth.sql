-- K-GEO Student Multi-Institution Authentication
-- Migration: 202610080002_student_multi_institution_auth.sql
--
-- Purpose:
-- Extend public Student registration from KCT-only to the exact approved
-- Student institution domains:
--
--   @kct.ac.in
--   @kclas.ac.in
--   @kctbs.ac.in
--
-- Important:
-- - Public registration still creates ONLY Student profiles.
-- - The selected institution in the UI is not trusted by the database.
-- - The normalized email domain remains the database source of truth.
-- - Existing Counselor registration/provisioning behaviour is preserved.
-- - Existing Director/staff provisioning behaviour is preserved.
-- - No historical rows are rewritten.
-- - No table data is migrated.
--
-- This migration changes exactly two database objects, in one transaction:
--
--   1. public.handle_new_user()
--      The public Student branch accepts the three exact Student domains.
--
--   2. public.profiles.profiles_college_email_check
--      The live constraint limited every role other than Counselor and
--      Director to exact @kct.ac.in. It is replaced, under the same name,
--      with explicit role handling:
--        - Counselor / Director: unchanged generic valid-email rule
--        - Student: exact @kct.ac.in, @kclas.ac.in or @kctbs.ac.in
--        - any other role (currently only admin): unchanged exact
--          @kct.ac.in rule
--      The normalization and generic email-syntax rules are unchanged.
--
-- public.profiles.profiles_full_name_check is not changed.
-- The replacement constraint validates existing rows; it rewrites none.

begin;


-- ============================================================
-- 0. PRE-FLIGHT
-- ============================================================
--
-- Fail closed if the function we are about to replace does not have the
-- expected security characteristics, is no longer attached to auth.users,
-- or if profiles_college_email_check is absent or no longer carries the
-- reviewed pre-migration contract.

do $preflight$
declare
  v_function_count integer;
  v_trigger_count integer;
  v_current_definition text;
  v_constraint_count integer;
  v_email_check_definition text;
  v_full_name_check_fingerprint text;
  v_profile_check_count integer;
  v_generic_email_pattern constant text :=
    '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$';
  v_kct_only_pattern constant text :=
    '^[^@[:space:]]+@kct[.]ac[.]in$';
begin

  select pg_catalog.count(*)
  into v_function_count
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  inner join pg_catalog.pg_language as language
    on language.oid = procedure.prolang
  where namespace.nspname = 'public'
    and procedure.proname = 'handle_new_user'
    and pg_catalog.pg_get_function_identity_arguments(
      procedure.oid
    ) = ''
    and procedure.prorettype = 'trigger'::pg_catalog.regtype
    and language.lanname = 'plpgsql'
    and procedure.prosecdef is true
    and owner_role.rolname = 'postgres'
    and exists (
      select 1
      from pg_catalog.unnest(
        coalesce(
          procedure.proconfig,
          '{}'::text[]
        )
      ) as setting
      where setting in (
        'search_path=',
        'search_path=""'
      )
    );

  if v_function_count <> 1 then
    raise exception using
      errcode = '55000',
      message =
        'Student multi-institution migration requires the reviewed public.handle_new_user() security contract';
  end if;


  select pg_catalog.count(*)
  into v_trigger_count
  from pg_catalog.pg_trigger as trigger
  inner join pg_catalog.pg_class as relation
    on relation.oid = trigger.tgrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where trigger.tgfoid =
      'public.handle_new_user()'::pg_catalog.regprocedure
    and trigger.tgisinternal is false
    and namespace.nspname = 'auth'
    and relation.relname = 'users';

  if v_trigger_count < 1 then
    raise exception using
      errcode = '55000',
      message =
        'public.handle_new_user() is not attached to auth.users';
  end if;


  select pg_catalog.pg_get_functiondef(
    'public.handle_new_user()'::pg_catalog.regprocedure
  )
  into v_current_definition;

  -- The current live public Student branch must still be the reviewed
  -- KCT-only version before this forward migration is applied.
  if pg_catalog.strpos(
      v_current_definition,
      'K-GEO requires a valid @kct.ac.in email address'
    ) = 0
  then
    raise exception using
      errcode = '55000',
      message =
        'public.handle_new_user() no longer matches the expected pre-migration Student domain contract';
  end if;


  -- ----------------------------------------------------------
  -- profiles_college_email_check must exist exactly once, be
  -- validated, and still carry the reviewed KCT-only contract.
  -- ----------------------------------------------------------
  --
  -- The catalog stores the domain as kct[.]ac[.]in, so the literal
  -- text "kct.ac.in" never appears in the constraint definition.

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
    v_email_check_definition
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.profiles'::pg_catalog.regclass
    and constraint_record.conname = 'profiles_college_email_check'
    and constraint_record.contype = 'c'
    and constraint_record.convalidated is true;

  if v_constraint_count <> 1
    or v_email_check_definition is null
  then
    raise exception using
      errcode = '55000',
      message =
        'public.profiles.profiles_college_email_check is missing or not validated';
  end if;

  if pg_catalog.strpos(
      v_email_check_definition,
      'college_email = lower(btrim(college_email))'
    ) = 0
    or pg_catalog.strpos(
      v_email_check_definition,
      pg_catalog.quote_literal(v_generic_email_pattern)
    ) = 0
    or pg_catalog.strpos(
      v_email_check_definition,
      pg_catalog.quote_literal(v_kct_only_pattern)
    ) = 0
    or pg_catalog.strpos(
      v_email_check_definition,
      'role = ANY'
    ) = 0
    or pg_catalog.strpos(
      v_email_check_definition,
      'role <> ALL'
    ) = 0
    or pg_catalog.strpos(
      v_email_check_definition,
      '''counselor''::'
    ) = 0
    or pg_catalog.strpos(
      v_email_check_definition,
      '''director''::'
    ) = 0
    or pg_catalog.strpos(
      v_email_check_definition,
      '''student''::'
    ) <> 0
    or pg_catalog.strpos(
      v_email_check_definition,
      '''admin''::'
    ) <> 0
    or pg_catalog.strpos(
      v_email_check_definition,
      'kclas'
    ) <> 0
    or pg_catalog.strpos(
      v_email_check_definition,
      'kctbs'
    ) <> 0
  then
    raise exception using
      errcode = '55000',
      message =
        'public.profiles.profiles_college_email_check no longer matches the expected pre-migration KCT-only contract';
  end if;


  -- ----------------------------------------------------------
  -- Record the untouched constraints so the post-replacement
  -- verification can prove they did not change.
  -- ----------------------------------------------------------

  select
    pg_catalog.count(*),
    pg_catalog.min(
      constraint_record.oid::text
        || ':'
        || pg_catalog.pg_get_constraintdef(constraint_record.oid)
    )
  into
    v_constraint_count,
    v_full_name_check_fingerprint
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.profiles'::pg_catalog.regclass
    and constraint_record.conname = 'profiles_full_name_check'
    and constraint_record.contype = 'c';

  if v_constraint_count <> 1
    or v_full_name_check_fingerprint is null
  then
    raise exception using
      errcode = '55000',
      message =
        'public.profiles.profiles_full_name_check is missing';
  end if;

  select pg_catalog.count(*)
  into v_profile_check_count
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.profiles'::pg_catalog.regclass
    and constraint_record.contype = 'c';

  perform pg_catalog.set_config(
    'kgeo_migration.profiles_full_name_check',
    v_full_name_check_fingerprint,
    true
  );

  perform pg_catalog.set_config(
    'kgeo_migration.profiles_check_count',
    v_profile_check_count::text,
    true
  );

end;
$preflight$;


-- ============================================================
-- 1. REPLACE AUTH USER CREATION TRIGGER FUNCTION
-- ============================================================
--
-- The existing staff provisioning branches are preserved.
--
-- The intentional Student change is only:
--
-- OLD:
--   exact @kct.ac.in
--
-- NEW:
--   exact @kct.ac.in
--   exact @kclas.ac.in
--   exact @kctbs.ac.in

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_normalized_email text;
  v_normalized_full_name text;
  v_normalized_username text;
  v_provisioning_token text;
  v_token_hash text;
  v_approved_role public.user_role;
  v_request_time timestamptz := pg_catalog.statement_timestamp();
  v_affected_rows bigint;
begin
  v_normalized_email := pg_catalog.lower(
    pg_catalog.btrim(new.email)
  );

  if v_normalized_email is null
    or pg_catalog.char_length(v_normalized_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(v_normalized_email, '@', 1)
    ) not between 1 and 64
    or v_normalized_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
  then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid email address';
  end if;


  -- ==========================================================
  -- TRUSTED STAFF / COUNSELOR PROVISIONING
  -- ==========================================================

  if coalesce(
      new.raw_user_meta_data,
      '{}'::jsonb
    ) ? 'kgeo_staff_provisioning_token'
  then

    if pg_catalog.jsonb_typeof(
        new.raw_user_meta_data -> 'kgeo_staff_provisioning_token'
      ) <> 'string'
    then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;


    v_provisioning_token :=
      new.raw_user_meta_data ->> 'kgeo_staff_provisioning_token';


    if v_provisioning_token !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;


    v_token_hash := pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          v_provisioning_token,
          'UTF8'
        )
      ),
      'hex'
    );


    -- --------------------------------------------------------
    -- Existing Counselor self-registration request path
    -- --------------------------------------------------------

    select
      request.normalized_full_name,
      request.normalized_username
    into
      v_normalized_full_name,
      v_normalized_username
    from private.kgeo_counselor_registration_requests as request
    where request.normalized_email = v_normalized_email
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time
    for update;


    if found then

      if not (
          coalesce(
            new.raw_user_meta_data,
            '{}'::jsonb
          ) ? 'kgeo_counselor_full_name'
        )
        or not (
          coalesce(
            new.raw_user_meta_data,
            '{}'::jsonb
          ) ? 'kgeo_counselor_username'
        )
        or pg_catalog.jsonb_typeof(
          new.raw_user_meta_data -> 'kgeo_counselor_full_name'
        ) is distinct from 'string'
        or pg_catalog.jsonb_typeof(
          new.raw_user_meta_data -> 'kgeo_counselor_username'
        ) is distinct from 'string'
        or pg_catalog.regexp_replace(
          pg_catalog.btrim(
            new.raw_user_meta_data
              ->> 'kgeo_counselor_full_name'
          ),
          '[[:space:]]+',
          ' ',
          'g'
        ) <> v_normalized_full_name
        or pg_catalog.lower(
          pg_catalog.btrim(
            new.raw_user_meta_data
              ->> 'kgeo_counselor_username'
          )
        ) <> v_normalized_username
        or v_normalized_username !~
          '^[a-z0-9._-]{3,32}$'
        or v_normalized_username in (
          'admin',
          'administrator',
          'director',
          'kgeo',
          'root',
          'student',
          'support',
          'system'
        )
        or pg_catalog.split_part(
          v_normalized_email,
          '@',
          1
        ) <> v_normalized_username
      then
        raise exception using
          errcode = '23514',
          message =
            'K-GEO counselor registration is invalid';
      end if;


      update private.kgeo_counselor_registration_requests
        as request
      set consumed_at = v_request_time
      where request.normalized_email = v_normalized_email
        and request.normalized_full_name =
          v_normalized_full_name
        and request.normalized_username =
          v_normalized_username
        and request.token_hash = v_token_hash
        and request.consumed_at is null
        and request.expires_at > v_request_time;


      get diagnostics v_affected_rows = row_count;


      if v_affected_rows <> 1 then
        raise exception using
          errcode = '23514',
          message =
            'K-GEO counselor registration is invalid';
      end if;


      insert into public.profiles (
        id,
        college_email,
        role,
        full_name,
        is_active
      )
      values (
        new.id,
        v_normalized_email,
        'counselor'::public.user_role,
        v_normalized_full_name,
        false
      );


      insert into public.counselor_accounts (
        user_id,
        username,
        approval_status
      )
      values (
        new.id,
        v_normalized_username,
        'pending'::public.counselor_approval_status
      );


      return new;
    end if;


    -- --------------------------------------------------------
    -- Existing trusted staff provisioning path
    -- --------------------------------------------------------

    select request.approved_role
    into v_approved_role
    from private.kgeo_staff_provisioning_requests as request
    where request.normalized_email = v_normalized_email
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time
    for update;


    if not found then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;


    if v_approved_role not in (
        'counselor'::public.user_role,
        'director'::public.user_role
      )
      or (
        v_approved_role =
          'counselor'::public.user_role
        and v_normalized_email !~
          '^[^@[:space:]]+@kct[.]ac[.]in$'
      )
    then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;


    update private.kgeo_staff_provisioning_requests
      as request
    set consumed_at = v_request_time
    where request.normalized_email = v_normalized_email
      and request.approved_role = v_approved_role
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time;


    get diagnostics v_affected_rows = row_count;


    if v_affected_rows <> 1 then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;


    insert into public.profiles (
      id,
      college_email,
      role,
      full_name,
      is_active
    )
    values (
      new.id,
      v_normalized_email,
      v_approved_role,
      null,
      true
    );


    return new;
  end if;


  -- ==========================================================
  -- PUBLIC STUDENT REGISTRATION
  -- ==========================================================
  --
  -- Public registration remains Student-only.
  --
  -- Exact approved Student domains:
  --
  --   kct.ac.in
  --   kclas.ac.in
  --   kctbs.ac.in
  --
  -- Subdomains and lookalike domains do not match.

  if v_normalized_email !~
    '^[^@[:space:]]+@(kct[.]ac[.]in|kclas[.]ac[.]in|kctbs[.]ac[.]in)$'
  then
    raise exception using
      errcode = '23514',
      message =
        'K-GEO requires a valid KCT, KCLAS, or KCTBS college email address';
  end if;


  if not (
      coalesce(
        new.raw_user_meta_data,
        '{}'::jsonb
      ) ? 'full_name'
    )
    or pg_catalog.jsonb_typeof(
      new.raw_user_meta_data -> 'full_name'
    ) <> 'string'
  then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;


  v_normalized_full_name :=
    pg_catalog.regexp_replace(
      pg_catalog.btrim(
        new.raw_user_meta_data ->> 'full_name'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    );


  if pg_catalog.char_length(
      v_normalized_full_name
    ) not between 1 and 150
  then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;


  insert into public.profiles (
    id,
    college_email,
    role,
    full_name,
    is_active
  )
  values (
    new.id,
    v_normalized_email,
    'student'::public.user_role,
    v_normalized_full_name,
    true
  );


  return new;
end;
$function$;


alter function public.handle_new_user()
  owner to postgres;


-- ============================================================
-- 2. REPLACE THE PROFILE EMAIL CHECK CONSTRAINT
-- ============================================================
--
-- The first four conditions (normalization, total length, local-part
-- length, generic email syntax) are identical to the live constraint.
--
-- Only the role/domain branch changes:
--
-- OLD:
--   counselor / director -> generic valid email
--   every other role     -> exact @kct.ac.in
--
-- NEW:
--   counselor / director -> generic valid email          (unchanged)
--   student              -> exact @kct.ac.in, @kclas.ac.in, @kctbs.ac.in
--   every other role     -> exact @kct.ac.in             (unchanged)
--
-- Student is named explicitly so that no other role inherits the wider
-- Student domain set. The constraint is added validated: every existing
-- row is checked, and no row is rewritten.

alter table public.profiles
  drop constraint profiles_college_email_check,
  add constraint profiles_college_email_check
    check (
      college_email = pg_catalog.lower(pg_catalog.btrim(college_email))
      and pg_catalog.char_length(college_email) between 3 and 254
      and pg_catalog.char_length(
        pg_catalog.split_part(college_email, '@', 1)
      ) between 1 and 64
      and college_email ~
        '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
      and (
        role in (
          'counselor'::public.user_role,
          'director'::public.user_role
        )
        or (
          role = 'student'::public.user_role
          and college_email ~
            '^[^@[:space:]]+@(kct[.]ac[.]in|kclas[.]ac[.]in|kctbs[.]ac[.]in)$'
        )
        or (
          role not in (
            'student'::public.user_role,
            'counselor'::public.user_role,
            'director'::public.user_role
          )
          and college_email ~ '^[^@[:space:]]+@kct[.]ac[.]in$'
        )
      )
    );

comment on constraint profiles_college_email_check on public.profiles is
  'Requires normalized valid email; Students use an exact KCT, KCLAS or KCTBS college domain, any other non-staff role remains exact-KCT, while trusted counselor and Director identity paths may use a valid server-managed email.';


-- ============================================================
-- 3. POST-REPLACEMENT CATALOG VERIFICATION
-- ============================================================

do $verification$
declare
  v_function_count integer;
  v_trigger_count integer;
  v_definition text;
  v_constraint_count integer;
  v_email_check_definition text;
  v_full_name_check_fingerprint text;
  v_profile_check_count integer;
  v_mismatch_count integer;
  v_staff_position integer;
  v_student_role_position integer;
  v_student_pattern_position integer;
  v_other_role_position integer;
  v_kct_only_position integer;
  v_generic_email_pattern constant text :=
    '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$';
  v_student_domain_pattern constant text :=
    '^[^@[:space:]]+@(kct[.]ac[.]in|kclas[.]ac[.]in|kctbs[.]ac[.]in)$';
  v_kct_only_pattern constant text :=
    '^[^@[:space:]]+@kct[.]ac[.]in$';
begin

  select pg_catalog.count(*)
  into v_function_count
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  inner join pg_catalog.pg_language as language
    on language.oid = procedure.prolang
  where namespace.nspname = 'public'
    and procedure.proname = 'handle_new_user'
    and pg_catalog.pg_get_function_identity_arguments(
      procedure.oid
    ) = ''
    and procedure.prorettype = 'trigger'::pg_catalog.regtype
    and language.lanname = 'plpgsql'
    and procedure.prosecdef is true
    and owner_role.rolname = 'postgres'
    and exists (
      select 1
      from pg_catalog.unnest(
        coalesce(
          procedure.proconfig,
          '{}'::text[]
        )
      ) as setting
      where setting in (
        'search_path=',
        'search_path=""'
      )
    );

  if v_function_count <> 1 then
    raise exception using
      errcode = '55000',
      message =
        'Student multi-institution handle_new_user() catalog verification failed';
  end if;


  select pg_catalog.pg_get_functiondef(
    'public.handle_new_user()'::pg_catalog.regprocedure
  )
  into v_definition;


  -- New Student domain contract must exist.

  if pg_catalog.strpos(
      v_definition,
      '@(kct[.]ac[.]in|kclas[.]ac[.]in|kctbs[.]ac[.]in)'
    ) = 0
  then
    raise exception using
      errcode = '55000',
      message =
        'Student multi-institution domain contract verification failed';
  end if;


  -- Old Student-only KCT error contract must no longer be present.

  if pg_catalog.strpos(
      v_definition,
      'K-GEO requires a valid @kct.ac.in email address'
    ) <> 0
  then
    raise exception using
      errcode = '55000',
      message =
        'Legacy KCT-only Student registration contract is still active';
  end if;


  -- Public registration must still explicitly create Student role.

  if pg_catalog.strpos(
      v_definition,
      '''student''::public.user_role'
    ) = 0
  then
    raise exception using
      errcode = '55000',
      message =
        'Student role assignment verification failed';
  end if;


  -- Existing staff provisioning machinery must still be present.

  if pg_catalog.strpos(
      v_definition,
      'private.kgeo_staff_provisioning_requests'
    ) = 0
    or pg_catalog.strpos(
      v_definition,
      'private.kgeo_counselor_registration_requests'
    ) = 0
  then
    raise exception using
      errcode = '55000',
      message =
        'Existing K-GEO staff provisioning contract was not preserved';
  end if;


  -- handle_new_user must remain wired to auth.users.

  select pg_catalog.count(*)
  into v_trigger_count
  from pg_catalog.pg_trigger as trigger
  inner join pg_catalog.pg_class as relation
    on relation.oid = trigger.tgrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where trigger.tgfoid =
      'public.handle_new_user()'::pg_catalog.regprocedure
    and trigger.tgisinternal is false
    and namespace.nspname = 'auth'
    and relation.relname = 'users';


  if v_trigger_count < 1 then
    raise exception using
      errcode = '55000',
      message =
        'Student registration trigger is not attached to auth.users';
  end if;


  -- ----------------------------------------------------------
  -- The handle_new_user() Student branch must use the exact
  -- three-domain pattern verified below.
  -- ----------------------------------------------------------

  if pg_catalog.strpos(
      v_definition,
      pg_catalog.quote_literal(v_student_domain_pattern)
    ) = 0
  then
    raise exception using
      errcode = '55000',
      message =
        'Student registration trigger does not use the reviewed exact domain pattern';
  end if;


  -- ----------------------------------------------------------
  -- profiles_college_email_check: exactly one, validated.
  -- ----------------------------------------------------------

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
    v_email_check_definition
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.profiles'::pg_catalog.regclass
    and constraint_record.conname = 'profiles_college_email_check'
    and constraint_record.contype = 'c'
    and constraint_record.convalidated is true;

  if v_constraint_count <> 1
    or v_email_check_definition is null
  then
    raise exception using
      errcode = '55000',
      message =
        'Replacement profiles_college_email_check is missing or not validated';
  end if;


  -- Generic normalization and email-syntax rules remain.

  if pg_catalog.strpos(
      v_email_check_definition,
      'college_email = lower(btrim(college_email))'
    ) = 0
    or pg_catalog.strpos(
      v_email_check_definition,
      'char_length(college_email) >= 3'
    ) = 0
    or pg_catalog.strpos(
      v_email_check_definition,
      'char_length(college_email) <= 254'
    ) = 0
    or pg_catalog.strpos(
      v_email_check_definition,
      'split_part(college_email, ''@''::text, 1)) >= 1'
    ) = 0
    or pg_catalog.strpos(
      v_email_check_definition,
      'split_part(college_email, ''@''::text, 1)) <= 64'
    ) = 0
    or pg_catalog.strpos(
      v_email_check_definition,
      pg_catalog.quote_literal(v_generic_email_pattern)
    ) = 0
  then
    raise exception using
      errcode = '55000',
      message =
        'Replacement profiles_college_email_check lost the generic email rules';
  end if;


  -- Role handling: Counselor/Director generic branch, explicit
  -- Student three-domain branch, every other role KCT-only.
  -- The type may be rendered with or without its schema.

  if v_email_check_definition !~
      'role = ANY [(]ARRAY[[]''counselor''::(public[.])?user_role, ''director''::(public[.])?user_role[]][)]'
    or v_email_check_definition !~
      'role = ''student''::(public[.])?user_role'
    or v_email_check_definition !~
      'role <> ALL [(]ARRAY[[]''student''::(public[.])?user_role, ''counselor''::(public[.])?user_role, ''director''::(public[.])?user_role[]][)]'
    or pg_catalog.strpos(
      v_email_check_definition,
      '''admin''::'
    ) <> 0
  then
    raise exception using
      errcode = '55000',
      message =
        'Replacement profiles_college_email_check role handling verification failed';
  end if;

  v_staff_position := pg_catalog.strpos(
    v_email_check_definition,
    'role = ANY'
  );
  v_student_role_position := pg_catalog.strpos(
    v_email_check_definition,
    'role = ''student''::'
  );
  v_student_pattern_position := pg_catalog.strpos(
    v_email_check_definition,
    pg_catalog.quote_literal(v_student_domain_pattern)
  );
  v_other_role_position := pg_catalog.strpos(
    v_email_check_definition,
    'role <> ALL'
  );
  v_kct_only_position := pg_catalog.strpos(
    v_email_check_definition,
    pg_catalog.quote_literal(v_kct_only_pattern)
  );

  -- Each domain rule must belong to its own role branch, in order:
  -- staff, Student + three domains, other roles + KCT-only.

  if v_staff_position = 0
    or v_student_role_position <= v_staff_position
    or v_student_pattern_position <= v_student_role_position
    or v_other_role_position <= v_student_pattern_position
    or v_kct_only_position <= v_other_role_position
  then
    raise exception using
      errcode = '55000',
      message =
        'Replacement profiles_college_email_check domain rules are not bound to the expected roles';
  end if;


  -- ----------------------------------------------------------
  -- The exact Student domain pattern accepts only the three
  -- exact domains. These are pure expression checks; no row is
  -- read, inserted or changed.
  -- ----------------------------------------------------------

  select pg_catalog.count(*)
  into v_mismatch_count
  from pg_catalog.unnest(
    array[
      'abc@kct.ac.in',
      'abc@kclas.ac.in',
      'abc@kctbs.ac.in'
    ]::text[]
  ) as candidate
  where candidate !~ v_student_domain_pattern
    or candidate !~ v_generic_email_pattern;

  if v_mismatch_count <> 0 then
    raise exception using
      errcode = '55000',
      message =
        'Student domain pattern rejects an approved Student domain';
  end if;

  select pg_catalog.count(*)
  into v_mismatch_count
  from pg_catalog.unnest(
    array[
      'abc@gmail.com',
      'abc@student.kct.ac.in',
      'abc@student.kclas.ac.in',
      'abc@student.kctbs.ac.in',
      'abc@kct.ac.in.fake.com',
      'abc@kclas.ac.in.fake.com',
      'abc@kctbs.ac.in.fake.com',
      'abc@fakekct.ac.in',
      'abc@counselor-auth.kgeo.internal'
    ]::text[]
  ) as candidate
  where candidate ~ v_student_domain_pattern;

  if v_mismatch_count <> 0 then
    raise exception using
      errcode = '55000',
      message =
        'Student domain pattern accepts a subdomain, lookalike or external domain';
  end if;

  -- The unchanged other-role rule still accepts exact KCT only.

  select pg_catalog.count(*)
  into v_mismatch_count
  from pg_catalog.unnest(
    array[
      'abc@kclas.ac.in',
      'abc@kctbs.ac.in',
      'abc@student.kct.ac.in',
      'abc@kct.ac.in.fake.com'
    ]::text[]
  ) as candidate
  where candidate ~ v_kct_only_pattern;

  if v_mismatch_count <> 0
    or 'abc@kct.ac.in' !~ v_kct_only_pattern
  then
    raise exception using
      errcode = '55000',
      message =
        'Other-role KCT-only pattern verification failed';
  end if;


  -- ----------------------------------------------------------
  -- profiles_full_name_check and the number of profile CHECK
  -- constraints must be exactly as recorded by the preflight.
  -- ----------------------------------------------------------

  select
    pg_catalog.count(*),
    pg_catalog.min(
      constraint_record.oid::text
        || ':'
        || pg_catalog.pg_get_constraintdef(constraint_record.oid)
    )
  into
    v_constraint_count,
    v_full_name_check_fingerprint
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.profiles'::pg_catalog.regclass
    and constraint_record.conname = 'profiles_full_name_check'
    and constraint_record.contype = 'c';

  if v_constraint_count <> 1
    or v_full_name_check_fingerprint is distinct from
      pg_catalog.current_setting(
        'kgeo_migration.profiles_full_name_check',
        true
      )
  then
    raise exception using
      errcode = '55000',
      message =
        'public.profiles.profiles_full_name_check changed unexpectedly';
  end if;

  select pg_catalog.count(*)
  into v_profile_check_count
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid =
      'public.profiles'::pg_catalog.regclass
    and constraint_record.contype = 'c';

  if v_profile_check_count::text is distinct from
    pg_catalog.current_setting(
      'kgeo_migration.profiles_check_count',
      true
    )
  then
    raise exception using
      errcode = '55000',
      message =
        'The set of public.profiles CHECK constraints changed unexpectedly';
  end if;

end;
$verification$;


commit;