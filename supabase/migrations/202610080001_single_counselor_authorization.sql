-- K-GEO Single Counselor Portal Conversion - Phase 3A
--
-- Forward-only authorization cutover from per-Student Primary Counselor
-- ownership to one approved, active, verified institutional Counselor.
--
-- Historical student_counselor_assignments remain unchanged.
-- Continue with K-GEO and reassignment are NOT retired in this migration.

begin;


-- ============================================================
-- 0. FAIL-CLOSED PRECONDITION
-- Exactly one operational Counselor must exist, and it must
-- be the reviewed Durga / institutional Counselor identity.
-- ============================================================

do $preflight$
declare
  v_operational_counselor_count integer;
begin

  select pg_catalog.count(*)
  into v_operational_counselor_count
  from public.profiles as counselor_profile
  inner join public.counselor_accounts as counselor_account
    on counselor_account.user_id = counselor_profile.id
  inner join auth.users as counselor_auth
    on counselor_auth.id = counselor_profile.id
  where counselor_profile.role =
      'counselor'::public.user_role
    and counselor_profile.is_active is true
    and counselor_account.approval_status =
      'approved'::public.counselor_approval_status
    and counselor_auth.email_confirmed_at is not null
    and (
      counselor_auth.banned_until is null
      or counselor_auth.banned_until <=
        pg_catalog.statement_timestamp()
    );

  if v_operational_counselor_count <> 1 then
    raise exception using
      errcode = '55000',
      message =
        'Single Counselor cutover requires exactly one operational Counselor';
  end if;

  if not exists (
    select 1
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as counselor_account
      on counselor_account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id =
      'eaaccd6a-9e05-46e4-bc59-60455f1da7f7'::uuid
      and counselor_profile.role =
        'counselor'::public.user_role
      and counselor_profile.is_active is true
      and counselor_account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
      and (
        counselor_auth.banned_until is null
        or counselor_auth.banned_until <=
          pg_catalog.statement_timestamp()
      )
  ) then
    raise exception using
      errcode = '55000',
      message =
        'Reviewed institutional Counselor account is not operational';
  end if;

end;
$preflight$;


-- ============================================================
-- 1. CANONICAL INSTITUTIONAL COUNSELOR AUTHORIZATION
-- ============================================================

create or replace function
  public.is_approved_active_verified_counselor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.profiles as counselor_profile
      inner join public.counselor_accounts as counselor_account
        on counselor_account.user_id = counselor_profile.id
      inner join auth.users as counselor_auth
        on counselor_auth.id = counselor_profile.id
      where counselor_profile.id = (select auth.uid())
        and counselor_profile.role =
          'counselor'::public.user_role
        and counselor_profile.is_active is true
        and counselor_account.approval_status =
          'approved'::public.counselor_approval_status
        and counselor_auth.email_confirmed_at is not null
        and (
          counselor_auth.banned_until is null
          or counselor_auth.banned_until <=
            pg_catalog.statement_timestamp()
        )
    );
$function$;

alter function
  public.is_approved_active_verified_counselor()
  owner to postgres;

comment on function
  public.is_approved_active_verified_counselor() is
  'Returns true only for the approved, active, verified K-GEO institutional Counselor identity.';

revoke all on function
  public.is_approved_active_verified_counselor()
  from public, anon, authenticated, service_role;

grant execute on function
  public.is_approved_active_verified_counselor()
  to authenticated;


-- ============================================================
-- 2. TEMPORARY COMPATIBILITY BRIDGE
-- ============================================================
--
-- Existing RLS policies, triggers and RPCs still call this
-- historical function name.
--
-- It no longer means:
--   "caller owns this Student as current Primary Counselor"
--
-- It temporarily means:
--   "caller is the approved institutional Counselor
--    and the supplied target is a Student profile"
--
-- Historical assignment data is NOT modified.

create or replace function
  public.is_active_primary_counselor_for_student(
    p_student_id uuid
  )
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_student_id is not null
    and public.is_approved_active_verified_counselor()
    and exists (
      select 1
      from public.profiles as student_profile
      where student_profile.id = p_student_id
        and student_profile.role =
          'student'::public.user_role
    );
$function$;

alter function
  public.is_active_primary_counselor_for_student(uuid)
  owner to postgres;

comment on function
  public.is_active_primary_counselor_for_student(uuid) is
  'Temporary compatibility bridge for the single institutional Counselor architecture. Returns true for an approved active verified Counselor when the supplied target is a Student profile.';

revoke all on function
  public.is_active_primary_counselor_for_student(uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  public.is_active_primary_counselor_for_student(uuid)
  to authenticated;


-- ============================================================
-- 3. CATALOG VERIFICATION
-- ============================================================
--
-- PostgreSQL may represent:
--
--   SET search_path = ''
--
-- in pg_proc.proconfig as:
--
--   search_path=""
--
-- Accept both catalog representations.

do $verification$
declare
  v_count integer;
begin

  -- ----------------------------------------------------------
  -- Canonical institutional Counselor helper
  -- ----------------------------------------------------------

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname =
      'is_approved_active_verified_counselor'
    and pg_catalog.pg_get_function_identity_arguments(
      procedure.oid
    ) = ''
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

  if v_count <> 1 then
    raise exception using
      errcode = '55000',
      message =
        'Institutional Counselor authorization helper verification failed';
  end if;


  -- ----------------------------------------------------------
  -- Compatibility bridge
  -- ----------------------------------------------------------

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname =
      'is_active_primary_counselor_for_student'
    and pg_catalog.pg_get_function_identity_arguments(
      procedure.oid
    ) = 'p_student_id uuid'
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

  if v_count <> 1 then
    raise exception using
      errcode = '55000',
      message =
        'Student Counselor compatibility helper verification failed';
  end if;


  -- ----------------------------------------------------------
  -- ACL assertions
  -- ----------------------------------------------------------

  if pg_catalog.has_function_privilege(
      'public',
      'public.is_approved_active_verified_counselor()',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'anon',
      'public.is_approved_active_verified_counselor()',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'service_role',
      'public.is_approved_active_verified_counselor()',
      'EXECUTE'
    )
    or not pg_catalog.has_function_privilege(
      'authenticated',
      'public.is_approved_active_verified_counselor()',
      'EXECUTE'
    )
  then
    raise exception using
      errcode = '55000',
      message =
        'Institutional Counselor helper privileges are invalid';
  end if;

end;
$verification$;


commit;