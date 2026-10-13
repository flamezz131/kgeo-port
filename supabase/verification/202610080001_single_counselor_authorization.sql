-- Read-only post-cutover verification for the K-GEO single institutional
-- Counselor authorization migration
-- (202610080001_single_counselor_authorization.sql).
--
-- This supplement verifies the current architecture. The canonical
-- pre_phase_c2_readiness.sql still records the earlier Phase A1.4.2B contract
-- for public.is_active_primary_counselor_for_student(uuid), including its
-- former body hash. That historical expectation is superseded for this helper
-- by the checks below and is intentionally left unchanged.
--
-- Every row returns only a stable label and a boolean. No identity, email or
-- other private value is returned. Body checks compare whitespace-normalized
-- function source against alias-independent fragments.

begin transaction read only;
set local search_path = '';

with helper_functions as (
  select
    procedure.oid as function_oid,
    procedure.proname::text as function_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)::text
      as identity_arguments,
    procedure.prorettype as result_type_oid,
    procedure.proretset as returns_set,
    language_record.lanname::text as language_name,
    procedure.prosecdef as security_definer,
    procedure.provolatile::text as volatility,
    procedure.proconfig as configuration,
    owner_role.rolname::text as owner_name,
    pg_catalog.regexp_replace(
      procedure.prosrc,
      '[[:space:]]+',
      ' ',
      'g'
    ) as normalized_body
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_language as language_record
    on language_record.oid = procedure.prolang
  join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname::text = any(array[
      'is_approved_active_verified_counselor',
      'is_active_primary_counselor_for_student'
    ]::text[])
),
operational_counselors as (
  select counselor_profile.id as counselor_id
  from public.profiles as counselor_profile
  join public.counselor_accounts as counselor_account
    on counselor_account.user_id = counselor_profile.id
  join auth.users as counselor_auth
    on counselor_auth.id = counselor_profile.id
  where counselor_profile.role = 'counselor'::public.user_role
    and counselor_profile.is_active is true
    and counselor_account.approval_status =
      'approved'::public.counselor_approval_status
    and counselor_auth.email_confirmed_at is not null
    and (
      counselor_auth.banned_until is null
      or counselor_auth.banned_until <= pg_catalog.statement_timestamp()
    )
),
checks as (
  select
    'CANONICAL_HELPER_METADATA_EXACT'::text as check_name,
    coalesce((
      select
        pg_catalog.count(*) = 1
        and pg_catalog.bool_and(
          helper.identity_arguments = ''
          and helper.result_type_oid = 'pg_catalog.bool'::pg_catalog.regtype
          and helper.returns_set is false
          and helper.language_name = 'sql'
          and helper.security_definer is true
          and helper.volatility = 's'
          and helper.owner_name = 'postgres'
          and helper.configuration in (
            array['search_path=']::text[],
            array['search_path=""']::text[]
          )
        )
      from helper_functions as helper
      where helper.function_name = 'is_approved_active_verified_counselor'
    ), false) as passed
  union all
  select
    'CANONICAL_HELPER_EXECUTE_AUTHENTICATED_ONLY',
    coalesce((
      select
        pg_catalog.count(*) = 1
        and pg_catalog.bool_and(
          pg_catalog.has_function_privilege(
            'authenticated', helper.function_oid, 'EXECUTE'
          )
          and not pg_catalog.has_function_privilege(
            'anon', helper.function_oid, 'EXECUTE'
          )
          and not pg_catalog.has_function_privilege(
            'service_role', helper.function_oid, 'EXECUTE'
          )
          and not pg_catalog.has_function_privilege(
            'public', helper.function_oid, 'EXECUTE'
          )
        )
      from helper_functions as helper
      where helper.function_name = 'is_approved_active_verified_counselor'
    ), false)
  union all
  select
    'CANONICAL_HELPER_REQUIRES_APPROVED_ACTIVE_VERIFIED_COUNSELOR',
    coalesce((
      select
        pg_catalog.count(*) = 1
        and pg_catalog.bool_and(
          pg_catalog.strpos(helper.normalized_body, 'auth.uid()') > 0
          and pg_catalog.strpos(
            helper.normalized_body, 'public.profiles'
          ) > 0
          and pg_catalog.strpos(
            helper.normalized_body, 'public.counselor_accounts'
          ) > 0
          and pg_catalog.strpos(helper.normalized_body, 'auth.users') > 0
          and pg_catalog.strpos(
            helper.normalized_body, '''counselor''::public.user_role'
          ) > 0
          and pg_catalog.strpos(
            helper.normalized_body, 'is_active is true'
          ) > 0
          and pg_catalog.strpos(
            helper.normalized_body,
            '''approved''::public.counselor_approval_status'
          ) > 0
          and pg_catalog.strpos(
            helper.normalized_body, 'email_confirmed_at is not null'
          ) > 0
          and pg_catalog.strpos(helper.normalized_body, 'banned_until') > 0
        )
      from helper_functions as helper
      where helper.function_name = 'is_approved_active_verified_counselor'
    ), false)
  union all
  select
    'COMPATIBILITY_HELPER_METADATA_EXACT',
    coalesce((
      select
        pg_catalog.count(*) = 1
        and pg_catalog.bool_and(
          helper.identity_arguments = 'p_student_id uuid'
          and helper.result_type_oid = 'pg_catalog.bool'::pg_catalog.regtype
          and helper.returns_set is false
          and helper.language_name = 'sql'
          and helper.security_definer is true
          and helper.volatility = 's'
          and helper.owner_name = 'postgres'
          and helper.configuration in (
            array['search_path=']::text[],
            array['search_path=""']::text[]
          )
        )
      from helper_functions as helper
      where helper.function_name = 'is_active_primary_counselor_for_student'
    ), false)
  union all
  select
    'COMPATIBILITY_HELPER_EXECUTE_AUTHENTICATED_ONLY',
    coalesce((
      select
        pg_catalog.count(*) = 1
        and pg_catalog.bool_and(
          pg_catalog.has_function_privilege(
            'authenticated', helper.function_oid, 'EXECUTE'
          )
          and not pg_catalog.has_function_privilege(
            'anon', helper.function_oid, 'EXECUTE'
          )
          and not pg_catalog.has_function_privilege(
            'service_role', helper.function_oid, 'EXECUTE'
          )
          and not pg_catalog.has_function_privilege(
            'public', helper.function_oid, 'EXECUTE'
          )
        )
      from helper_functions as helper
      where helper.function_name = 'is_active_primary_counselor_for_student'
    ), false)
  union all
  select
    'COMPATIBILITY_HELPER_DELEGATES_AND_REQUIRES_STUDENT_TARGET',
    coalesce((
      select
        pg_catalog.count(*) = 1
        and pg_catalog.bool_and(
          pg_catalog.strpos(
            helper.normalized_body, 'p_student_id is not null'
          ) > 0
          and pg_catalog.strpos(
            helper.normalized_body,
            'public.is_approved_active_verified_counselor()'
          ) > 0
          and pg_catalog.strpos(
            helper.normalized_body, 'public.profiles'
          ) > 0
          and pg_catalog.strpos(
            helper.normalized_body, '.id = p_student_id'
          ) > 0
          and pg_catalog.strpos(
            helper.normalized_body, '''student''::public.user_role'
          ) > 0
        )
      from helper_functions as helper
      where helper.function_name = 'is_active_primary_counselor_for_student'
    ), false)
  union all
  select
    'ASSIGNMENT_HISTORY_IS_NOT_THE_HELPER_AUTHORIZATION_BOUNDARY',
    coalesce((
      select
        pg_catalog.count(*) = 2
        and pg_catalog.bool_and(
          pg_catalog.strpos(
            helper.normalized_body, 'student_counselor_assignments'
          ) = 0
        )
      from helper_functions as helper
    ), false)
  union all
  select
    'NO_RLS_POLICY_READS_ASSIGNMENT_HISTORY_DIRECTLY',
    not exists (
      select 1
      from pg_catalog.pg_policy as policy
      join pg_catalog.pg_class as relation
        on relation.oid = policy.polrelid
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname::text = any(array['public', 'storage']::text[])
        and (
          pg_catalog.strpos(
            coalesce(
              pg_catalog.pg_get_expr(policy.polqual, policy.polrelid),
              ''
            ),
            'student_counselor_assignments'
          ) > 0
          or pg_catalog.strpos(
            coalesce(
              pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid),
              ''
            ),
            'student_counselor_assignments'
          ) > 0
        )
    )
  union all
  select
    'ASSIGNMENT_HISTORY_TABLE_PRESERVED_AND_PROTECTED',
    coalesce((
      select
        relation.relrowsecurity
        and relation.relforcerowsecurity
        and exists (
          select 1
          from pg_catalog.pg_trigger as trigger_record
          where trigger_record.tgrelid = relation.oid
            and trigger_record.tgname::text =
              'protect_student_counselor_assignment_history'
            and trigger_record.tgenabled::text = 'O'
            and trigger_record.tgisinternal is false
        )
      from pg_catalog.pg_class as relation
      join pg_catalog.pg_namespace as namespace
        on namespace.oid = relation.relnamespace
      where namespace.nspname = 'public'
        and relation.relname = 'student_counselor_assignments'
        and relation.relkind::text = 'r'
    ), false)
  union all
  select
    'EXACTLY_ONE_OPERATIONAL_COUNSELOR',
    (
      select pg_catalog.count(*) = 1
      from operational_counselors
    )
  union all
  select
    'REVIEWED_INSTITUTIONAL_COUNSELOR_IS_OPERATIONAL',
    exists (
      select 1
      from operational_counselors as operational
      where operational.counselor_id =
        'eaaccd6a-9e05-46e4-bc59-60455f1da7f7'::uuid
    )
  union all
  select
    'NO_OTHER_COUNSELOR_SATISFIES_AUTHORIZATION',
    not exists (
      select 1
      from operational_counselors as operational
      where operational.counselor_id <>
        'eaaccd6a-9e05-46e4-bc59-60455f1da7f7'::uuid
    )
)
select check_name, passed
from checks
order by check_name;

rollback;
