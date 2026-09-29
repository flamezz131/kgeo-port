-- READ ONLY: K-GEO University Application Journey extension verification.

with expected_enums(type_name, labels) as (
  values
    ('university_application_decision', array['pending', 'waitlisted', 'rejected', 'offer_received']::text[]),
    ('university_application_offer_status', array['none', 'conditional', 'unconditional']::text[]),
    ('university_application_student_decision', array['pending', 'accepted', 'declined']::text[]),
    ('university_application_fee_status', array['not_started', 'pending', 'paid']::text[]),
    ('university_application_visa_status', array['not_started', 'preparing', 'submitted', 'approved', 'refused']::text[]),
    ('university_application_enrollment_status', array['not_enrolled', 'enrolled']::text[])
),
installed_enums as (
  select
    type_row.typname::text as type_name,
    array_agg(enum_row.enumlabel::text order by enum_row.enumsortorder) as labels
  from pg_catalog.pg_type as type_row
  inner join pg_catalog.pg_namespace as namespace_row
    on namespace_row.oid = type_row.typnamespace
  inner join pg_catalog.pg_enum as enum_row
    on enum_row.enumtypid = type_row.oid
  where namespace_row.nspname = 'public'
    and type_row.typname in (select expected.type_name from expected_enums as expected)
  group by type_row.typname
),
required_functions(function_name, function_signature, volatility) as (
  values
    (
      'get_counselor_university_application_journey',
      'public.get_counselor_university_application_journey(uuid)',
      's'
    ),
    (
      'get_counselor_university_application_journey_history',
      'public.get_counselor_university_application_journey_history(uuid,integer)',
      's'
    ),
    (
      'get_my_university_application_journeys',
      'public.get_my_university_application_journeys()',
      's'
    ),
    (
      'record_university_application_journey',
      'public.record_university_application_journey(uuid,public.university_application_decision,date,public.university_application_offer_status,date,text,date,date,public.university_application_student_decision,date,public.university_application_fee_status,date,public.university_application_visa_status,date,date,public.university_application_enrollment_status,date,text)',
      'v'
    )
),
function_contracts as (
  select
    required.function_name,
    procedure_row.oid as function_oid,
    procedure_row.provolatile::text as volatility,
    procedure_row.prosecdef,
    owner_row.rolname::text as owner_name,
    coalesce(
      pg_catalog.cardinality(procedure_row.proconfig) = 1
      and pg_catalog.split_part(procedure_row.proconfig[1], '=', 1) =
        'search_path'
      and pg_catalog.btrim(
        pg_catalog.split_part(procedure_row.proconfig[1], '=', 2),
        '"'
      ) = '',
      false
    ) as empty_search_path,
    pg_catalog.has_function_privilege(
      'authenticated',
      procedure_row.oid,
      'EXECUTE'
    ) as authenticated_execute,
    pg_catalog.has_function_privilege('anon', procedure_row.oid, 'EXECUTE') as anon_execute,
    pg_catalog.has_function_privilege(
      'service_role',
      procedure_row.oid,
      'EXECUTE'
    ) as service_role_execute,
    exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )
      ) as acl
      where acl.grantee = 0
        and acl.privilege_type = 'EXECUTE'
    ) as public_execute,
    exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          procedure_row.proacl,
          pg_catalog.acldefault('f', procedure_row.proowner)
        )
      ) as acl
      left join pg_catalog.pg_roles as grantee_row
        on grantee_row.oid = acl.grantee
      where acl.privilege_type = 'EXECUTE'
        and acl.grantee <> procedure_row.proowner
        and grantee_row.rolname is distinct from 'authenticated'
    ) as unexpected_execute_grantee
  from required_functions as required
  left join pg_catalog.pg_proc as procedure_row
    on procedure_row.oid = pg_catalog.to_regprocedure(
      required.function_signature
    )
  left join pg_catalog.pg_roles as owner_row
    on owner_row.oid = procedure_row.proowner
),
checks(check_name, passed) as (
  select
    'ENUMS_EXACT',
    coalesce(
      (
        select count(*) = 6
          and bool_and(installed.labels = expected.labels)
        from expected_enums as expected
        left join installed_enums as installed
          on installed.type_name = expected.type_name
      ),
      false
    )
  union all
  select
    'SEALED_RELATIONS_EXACT',
    coalesce(
      (
        select count(*) = 2
          and bool_and(class_row.relrowsecurity)
          and bool_and(class_row.relforcerowsecurity)
          and bool_and(owner_row.rolname = 'postgres')
        from pg_catalog.pg_class as class_row
        inner join pg_catalog.pg_namespace as namespace_row
          on namespace_row.oid = class_row.relnamespace
        inner join pg_catalog.pg_roles as owner_row
          on owner_row.oid = class_row.relowner
        where namespace_row.nspname = 'public'
          and class_row.relname in (
            'student_university_application_journeys',
            'student_university_application_journey_events'
          )
          and class_row.relkind = 'r'
      ),
      false
    )
  union all
  select
    'NO_BROWSER_TABLE_ACCESS_OR_POLICIES',
    not exists (
      select 1
      from pg_catalog.pg_policies as policy
      where policy.schemaname = 'public'
        and policy.tablename in (
          'student_university_application_journeys',
          'student_university_application_journey_events'
        )
    )
    and not pg_catalog.has_table_privilege(
      'authenticated',
      'public.student_university_application_journeys',
      'SELECT, INSERT, UPDATE, DELETE'
    )
    and not pg_catalog.has_table_privilege(
      'authenticated',
      'public.student_university_application_journey_events',
      'SELECT, INSERT, UPDATE, DELETE'
    )
  union all
  select
    'FUNCTION_METADATA_AND_ACLS_EXACT',
    coalesce(
      (
        select count(*) = 4
          and bool_and(contract.function_oid is not null)
          and bool_and(contract.volatility = required.volatility)
          and bool_and(contract.prosecdef)
          and bool_and(contract.owner_name = 'postgres')
          and bool_and(contract.empty_search_path)
          and bool_and(contract.authenticated_execute)
          and bool_and(not contract.anon_execute)
          and bool_and(not contract.public_execute)
          and bool_and(not contract.service_role_execute)
          and bool_and(not contract.unexpected_execute_grantee)
          and (
            select count(*) = 4
            from pg_catalog.pg_proc as procedure_row
            inner join pg_catalog.pg_namespace as namespace_row
              on namespace_row.oid = procedure_row.pronamespace
            where namespace_row.nspname = 'public'
              and procedure_row.proname in (
                select expected.function_name
                from required_functions as expected
              )
          )
        from required_functions as required
        inner join function_contracts as contract
          on contract.function_name = required.function_name
      ),
      false
    )
  union all
  select
    'HISTORY_UNIQUENESS_INSTALLED',
    exists (
      select 1
      from pg_catalog.pg_constraint as constraint_row
      where constraint_row.conrelid =
        pg_catalog.to_regclass(
          'public.student_university_application_journey_events'
        )
        and constraint_row.contype = 'u'
        and constraint_row.convalidated
        and pg_catalog.pg_get_constraintdef(constraint_row.oid, true) =
          'UNIQUE (application_id, version_number)'
    )
  union all
  select
    'EXISTING_APPLICATION_AND_DOCUMENT_OBJECTS_UNCHANGED',
    pg_catalog.to_regclass('public.student_university_applications') is not null
    and pg_catalog.to_regclass('public.student_university_application_events') is not null
    and pg_catalog.to_regclass('public.student_university_application_documents') is not null
)
select check_name, passed
from checks
order by check_name;
