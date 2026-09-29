-- Temporary READ-ONLY staging diagnostic file
-- A1.4 POST-002 FINAL GATE

begin transaction isolation level repeatable read read only;

set local statement_timeout = '30s';

-- Required for exact Storage WITH CHECK expression evaluation
set local search_path = '';

with
a141_results as (
-- Phase A1.4.1 consultation ownership and FCFS assignment foundation.
with consultation_functions as (
  select
    procedure.oid,
    procedure.proname,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      as identity_arguments,
    pg_catalog.pg_get_function_result(procedure.oid) as result_type,
    procedure.prorettype,
    procedure.proretset,
    pg_catalog.regexp_replace(pg_catalog.btrim(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))), '\s+', ' ', 'g') as definition,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig,
    owner.rolname as owner_name
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname in (
      'prepare_consultation_request_insert',
      'claim_next_consultation',
      'record_consultation_outcome'
    )
),
checks as (
  select *
  from (
    values
      (
        'A1.4.1 consultation function signatures have no overloads',
        (select pg_catalog.count(*) = 3 from consultation_functions)
        and coalesce((select
          identity_arguments = ''
            and prorettype = 'trigger'::pg_catalog.regtype
            and proretset is false
          from consultation_functions
          where proname = 'prepare_consultation_request_insert'
        ), false)
        and coalesce((select
          identity_arguments = ''
            and prorettype = 'uuid'::pg_catalog.regtype
            and proretset is false
          from consultation_functions
          where proname = 'claim_next_consultation'
        ), false)
        and coalesce((select
          identity_arguments = 'p_consultation_id uuid, p_outcome text'
            and prorettype = 'public.consultation_status'::pg_catalog.regtype
            and proretset is false
          from consultation_functions
          where proname = 'record_consultation_outcome'
        ), false)
      ),
      (
        'A1.4.1 consultation functions retain trusted ownership and search path',
        coalesce((select pg_catalog.bool_and(
          prosecdef
          and provolatile = 'v'
          and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_name = 'postgres'
        ) and pg_catalog.count(*) = 3
        from consultation_functions), false)
      ),
      (
        'A1.4.1 claim execution is authenticated only',
        coalesce((select
          not pg_catalog.has_function_privilege('public', oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
          and pg_catalog.has_function_privilege(
            'authenticated',
            oid,
            'EXECUTE'
          )
          from consultation_functions
          where proname = 'claim_next_consultation'
        ), false)
      ),
      (
        'A1.4.1 student booking is fixed-slot assignment pending',
        coalesce((select
          definition like
            '%profile.role = ''student''::public.user_role%'
          and definition like
            '%profile.is_active is true%'
          and definition like
            '%auth_user.email_confirmed_at is not null%'
          and definition like
            '%new.slot_end := (new.slot_start + interval ''30 minutes'')::time%'
          and definition like
            '%new.status := ''waiting_for_assignment''::public.consultation_status%'
          and definition like
            '%new.assigned_counselor_id := null%'
          and definition like
            '%new.assigned_at := null%'
          from consultation_functions
          where proname = 'prepare_consultation_request_insert'
        ), false)
      ),
      (
        'A1.4.1 claim derives exact active verified counselor authorization',
        coalesce((select
          definition like
            '%v_caller_id := (select auth.uid())%'
          and definition like
            '%counselor_profile.role = ''counselor''::public.user_role%'
          and definition like
            '%counselor_profile.is_active is true%'
          and definition like
            '%counselor_auth.email_confirmed_at is not null%'
          and definition not like
            '%''director''::public.user_role%'
          and definition not like
            '%''admin''::public.user_role%'
          from consultation_functions
          where proname = 'claim_next_consultation'
        ), false)
      ),
      (
        'A1.4.1 claim locks the exact earliest eligible booked request',
        coalesce((select
          definition like
            '%request.status = ''waiting_for_assignment''::public.consultation_status%'
          and definition like
            '%request.assigned_counselor_id is null%'
          and definition like
            '%request.consultation_date is not null%'
          and definition like
            '%request.slot_start is not null%'
          and definition like
            '%request.slot_end is not null%'
          and definition like
            '%order by request.submitted_at asc, request.id asc limit 1 for update%'
          from consultation_functions
          where proname = 'claim_next_consultation'
        ), false)
      ),
      (
        'A1.4.1 claim assigns atomically and repeats ownership eligibility',
        coalesce((select
          definition like
            '%update public.consultation_requests as request%assigned_counselor_id = v_caller_id%'
          and definition like
            '%assigned_at = v_assignment_time%'
          and definition like
            '%status = ''scheduled''::public.consultation_status%'
          and (
            pg_catalog.length(definition)
            - pg_catalog.length(pg_catalog.replace(
                definition,
                'request.assigned_counselor_id is null',
                ''
              ))
          ) / pg_catalog.length('request.assigned_counselor_id is null') = 2
          from consultation_functions
          where proname = 'claim_next_consultation'
        ), false)
      ),
      (
        'A1.4.1 unresolved ownership states have the exact constraint',
        coalesce((select
          pg_catalog.pg_get_constraintdef(constraint_record.oid, true) ~
            'status = ANY \(ARRAY\[''submitted''::(public\.)?consultation_status, ''waiting_for_assignment''::(public\.)?consultation_status\]\).*assigned_counselor_id IS NULL'
          and pg_catalog.pg_get_constraintdef(constraint_record.oid, true) ~
            'status = ANY \(ARRAY\[''counselor_assigned''::(public\.)?consultation_status, ''scheduled''::(public\.)?consultation_status\]\).*assigned_counselor_id IS NOT NULL'
          and constraint_record.convalidated
          from pg_catalog.pg_constraint as constraint_record
          where constraint_record.conrelid =
              'public.consultation_requests'::pg_catalog.regclass
            and constraint_record.conname =
              'consultation_requests_status_assignment_check'
        ), false)
      ),
      (
        'A1.4.1 outcomes require the assigned counselor in lock and update paths',
        coalesce((select
          definition like
            '%request.assigned_counselor_id%for update%'
          and definition like
            '%target_assigned_counselor_id is distinct from caller_id%'
          and definition like
            '%request.assigned_counselor_id = caller_id%'
          and definition like
            '%target_status <> ''scheduled''::public.consultation_status%'
          from consultation_functions
          where proname = 'record_consultation_outcome'
        ), false)
      ),
      (
        'A1.4.1 ownership functions exclude private content dynamic SQL and unrelated mutations',
        coalesce((select pg_catalog.bool_and(
          definition not like '%counselor_student_notes%'
          and definition not like '%counselor_follow_ups%'
          and definition not like
            '%student_university_applications%'
          and definition not like
            '%student_university_application_documents%'
          and definition not like
            '%kgeo_staff_provisioning_requests%'
          and definition not like '%raw_user_meta_data%'
          and definition not like '%raw_app_meta_data%'
          and definition not like '%execute %'
          and definition !~ 'insert into (?!public\.student_counselor_assignments)'
          and definition !~ 'update (?!public\.consultation_requests)'
          and definition not like '%delete from %'
        ) and pg_catalog.count(*) = 3
        from consultation_functions), false)
      )
  ) as result(check_name, passed)
)
select
  'A1.4.1_check'::text as category,
  check_name as object_name,
  passed
from checks
),
a142a_results as (
-- Phase A1.4.2A Primary Counselor assignment foundation.
with assignment_relation as (
  select
    relation.oid,
    relation.relrowsecurity,
    relation.relforcerowsecurity,
    owner.rolname as owner_name
  from pg_catalog.pg_class as relation
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = relation.relowner
  where namespace.nspname = 'public'
    and relation.relname = 'student_counselor_assignments'
    and relation.relkind = 'r'
),
assignment_functions as (
  select
    procedure.oid,
    procedure.proname,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      as identity_arguments,
    pg_catalog.pg_get_function_result(procedure.oid) as result_type,
    pg_catalog.regexp_replace(pg_catalog.btrim(pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))), '\s+', ' ', 'g') as definition,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig,
    owner.rolname as owner_name
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname in (
      'protect_student_counselor_assignment_history',
      'claim_next_consultation',
      'list_my_primary_students',
      'list_director_primary_counselor_assignments',
      'list_director_primary_counselor_counts'
    )
),
checks as (
  select *
  from (
    values
      (
        'A1.4.2A assignment table is exact sealed forced-RLS history',
        coalesce((select
          relrowsecurity
          and relforcerowsecurity
          and owner_name = 'postgres'
          and not pg_catalog.has_table_privilege(
            'public', oid, 'SELECT,INSERT,UPDATE,DELETE'
          )
          and not pg_catalog.has_table_privilege(
            'anon', oid, 'SELECT,INSERT,UPDATE,DELETE'
          )
          and not pg_catalog.has_table_privilege(
            'authenticated', oid, 'SELECT,INSERT,UPDATE,DELETE'
          )
          and not exists (
            select 1 from pg_catalog.pg_policy as policy
            where policy.polrelid = oid
          )
          from assignment_relation
        ), false)
        and coalesce((select pg_catalog.count(*) = 7
          from pg_catalog.pg_attribute as attribute
          where attribute.attrelid =
              'public.student_counselor_assignments'::pg_catalog.regclass
            and attribute.attnum > 0
            and not attribute.attisdropped
            and attribute.attname in (
              'id', 'student_id', 'counselor_id', 'assigned_at',
              'assigned_by', 'ended_at', 'created_at'
            )
        ), false)
      ),
      (
        'A1.4.2A one active assignment and history indexes exist',
        coalesce((select
          pg_catalog.count(*) filter (
            where index_record.indexname =
              'student_counselor_assignments_one_active_student_key'
              and pg_catalog.lower(index_record.indexdef) like
                '%unique index%student_id%where (ended_at is null)%'
          ) = 1
          and pg_catalog.count(*) filter (
            where index_record.indexname =
              'student_counselor_assignments_active_counselor_idx'
          ) = 1
          and pg_catalog.count(*) filter (
            where index_record.indexname =
              'student_counselor_assignments_student_history_idx'
          ) = 1
          from pg_catalog.pg_indexes as index_record
          where index_record.schemaname = 'public'
            and index_record.tablename = 'student_counselor_assignments'
        ), false)
      ),
      (
        'A1.4.2A participant roles and history immutability are trusted',
        coalesce((select
          prosecdef
          and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_name = 'postgres'
          and definition like
            '%v_student_role is distinct from ''student''::public.user_role%'
          and definition like
            '%v_counselor_role is distinct from ''counselor''::public.user_role%'
          and definition like '%tg_op = ''delete''%'
          and definition like
            '%old.ended_at is not null%new.ended_at is null%'
          from assignment_functions
          where proname =
            'protect_student_counselor_assignment_history'
        ), false)
        and coalesce((select pg_catalog.count(*) = 1
          from pg_catalog.pg_trigger as trigger_record
          where trigger_record.tgrelid =
              'public.student_counselor_assignments'::pg_catalog.regclass
            and trigger_record.tgname =
              'protect_student_counselor_assignment_history'
            and not trigger_record.tgisinternal
            and trigger_record.tgenabled = 'O'
        ), false)
      ),
      (
        'A1.4.2A first claim inserts only absent assignment atomically',
        coalesce((select
          identity_arguments = ''
          and result_type = 'uuid'
          and prosecdef
          and provolatile = 'v'
          and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_name = 'postgres'
          and definition like
            '%order by request.submitted_at asc, request.id asc limit 1 for update%'
          and definition like
            '%insert into public.student_counselor_assignments%'
          and definition like
            '%on conflict (student_id) where ended_at is null do nothing%'
          and definition not like
            '%update public.student_counselor_assignments%'
          from assignment_functions
          where proname = 'claim_next_consultation'
        ), false)
      ),
      (
        'A1.4.2A My Students is exact-counselor bounded and active-only',
        coalesce((select
          identity_arguments = 'p_page integer, p_page_size integer'
          and prosecdef
          and provolatile = 's'
          and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_name = 'postgres'
          and definition like
            '%has_active_verified_kgeo_role%''counselor''::public.user_role%'
          and definition like
            '%assignment.counselor_id = v_caller_id%'
          and definition like
            '%assignment.ended_at is null%'
          and definition like
            '%p_page_size not between 1 and 50%'
          from assignment_functions
          where proname = 'list_my_primary_students'
        ), false)
      ),
      (
        'A1.4.2A Director projections are bounded and Director-only',
        coalesce((select
          pg_catalog.bool_and(
            prosecdef
            and provolatile = 's'
            and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
            and owner_name = 'postgres'
            and definition like
              '%has_active_verified_kgeo_role%''director''::public.user_role%'
            and definition like
              '%cardinality(%not between 1 and 50%'
          ) and pg_catalog.count(*) = 2
          from assignment_functions
          where proname in (
            'list_director_primary_counselor_assignments',
            'list_director_primary_counselor_counts'
          )
        ), false)
      ),
      (
        'A1.4.2A assignment RPCs are authenticated-only and private-safe',
        coalesce((select pg_catalog.bool_and(
          not pg_catalog.has_function_privilege('public', oid, 'EXECUTE')
          and not pg_catalog.has_function_privilege('anon', oid, 'EXECUTE')
          and pg_catalog.has_function_privilege(
            'authenticated', oid, 'EXECUTE'
          )
          and definition not like '%counselor_student_notes%'
          and definition not like '%counselor_follow_ups%'
          and definition not like '%raw_user_meta_data%'
          and definition not like '%raw_app_meta_data%'
          and definition not like '%execute %'
        ) and pg_catalog.count(*) = 4
        from assignment_functions
        where proname in (
          'claim_next_consultation',
          'list_my_primary_students',
          'list_director_primary_counselor_assignments',
          'list_director_primary_counselor_counts'
        )), false)
      )
  ) as result(check_name, passed)
)
select
  'A1.4.2A_check'::text as category,
  check_name as object_name,
  passed
from checks
),
a142b_storage_results as (
-- Phase A1.4.2B exact installed function and trigger contracts. Complete
-- normalized prosrc hashes are paired with exact catalog metadata and ACLs;
-- retaining expected text in an unreachable branch cannot satisfy a hash.
with expected_case_functions(
  function_name,
  identity_arguments,
  result_type_oid,
  returns_set,
  language_name,
  security_definer,
  volatility,
  body_sha256,
  execute_grantees
) as (
  values
    (
      'is_active_primary_counselor_for_student',
      'p_student_id uuid',
      'pg_catalog.bool'::pg_catalog.regtype::oid,
      false,
      'sql',
      true,
      's'::"char",
      'dbafccbd4bae61d5e20bce09ee3b66075664dc23f69943235344c3d123b9fb6b',
      array[]::text[]
    ),
    (
      'get_my_primary_counselor_case_access',
      'p_student_id uuid',
      'pg_catalog.text'::pg_catalog.regtype::oid,
      true,
      'plpgsql',
      true,
      's'::"char",
      '44c1222d300246040e1bc3b8b20018e0fea0b1d00f693b331903e36de95a6ccd',
      array['authenticated:f']::text[]
    ),
    (
      'enforce_primary_counselor_student_case_row',
      '',
      'pg_catalog.trigger'::pg_catalog.regtype::oid,
      false,
      'plpgsql',
      true,
      'v'::"char",
      '7ee591ff22d8ff5678603d7871bae9e8b74eca5821e096c853b31cf31992e69f',
      array[]::text[]
    ),
    (
      'enforce_primary_counselor_progression_evidence',
      '',
      'pg_catalog.trigger'::pg_catalog.regtype::oid,
      false,
      'plpgsql',
      true,
      'v'::"char",
      '79d4e3dfe83aabff3533a227e6ef1f04712f52a5a4125f75d4d9caadb0dd47ce',
      array[]::text[]
    ),
    (
      'enforce_primary_counselor_application_document',
      '',
      'pg_catalog.trigger'::pg_catalog.regtype::oid,
      false,
      'plpgsql',
      true,
      'v'::"char",
      '59026a5b1da6f6b4288a5ce8f8d586783ae9f270e745edeaf341e09bf976ab3a',
      array[]::text[]
    ),
    (
      'can_upload_university_application_document_object',
      'p_bucket_id text, p_storage_path text',
      'pg_catalog.bool'::pg_catalog.regtype::oid,
      false,
      'plpgsql',
      true,
      's'::"char",
      '0d4229e62145df6905dc51ec545c1c25122ee08280b99e1b2ae94e5d82c9427f',
      array['authenticated:f']::text[]
    ),
    (
      'record_consultation_outcome',
      'p_consultation_id uuid, p_outcome text',
      'public.consultation_status'::pg_catalog.regtype::oid,
      false,
      'plpgsql',
      true,
      'v'::"char",
      '99033348ce71a1261fcd9f0f674824687758d175da8f0204f7240790a6e67c25',
      array['authenticated:f']::text[]
    )
),
actual_case_functions as (
  select
    procedure.proname::text as function_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      as identity_arguments,
    procedure.prorettype as result_type_oid,
    procedure.proretset as returns_set,
    language_record.lanname::text as language_name,
    procedure.prosecdef as security_definer,
    procedure.provolatile as volatility,
    pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.replace(
            pg_catalog.replace(
              procedure.prosrc,
              pg_catalog.chr(13) || pg_catalog.chr(10),
              pg_catalog.chr(10)
            ),
            pg_catalog.chr(13),
            pg_catalog.chr(10)
          ),
          'UTF8'
        )
      ),
      'hex'
    ) as body_sha256,
    coalesce((
      select pg_catalog.array_agg(
        pg_catalog.format(
          '%s:%s',
          coalesce(grantee_role.rolname, 'PUBLIC'),
          privilege.is_grantable
        ) order by
          coalesce(grantee_role.rolname, 'PUBLIC'),
          privilege.is_grantable
      )
      from pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as privilege
      left join pg_catalog.pg_roles as grantee_role
        on grantee_role.oid = privilege.grantee
      where privilege.privilege_type = 'EXECUTE'
        and privilege.grantee <> procedure.proowner
    ), array[]::text[]) as execute_grantees,
    procedure.prokind,
    procedure.proconfig,
    procedure.proisstrict,
    procedure.proleakproof,
    procedure.proparallel,
    owner_role.rolname::text as owner_name,
    procedure.proallargtypes,
    procedure.proargmodes,
    procedure.proargnames
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  inner join pg_catalog.pg_language as language_record
    on language_record.oid = procedure.prolang
  where namespace.nspname = 'public'
    and procedure.proname in (
      select expected.function_name
      from expected_case_functions as expected
    )
),
expected_case_triggers(
  relation_schema,
  relation_name,
  relation_oid,
  trigger_name,
  function_oid,
  function_schema,
  function_name,
  function_identity_arguments,
  trigger_type,
  enabled_state,
  is_internal,
  argument_count,
  arguments_hex,
  when_expression,
  constraint_oid,
  is_deferrable,
  is_initially_deferred,
  old_transition_table,
  new_transition_table
) as (
  values
    ('public'::text, 'counselor_student_notes'::text, 'public.counselor_student_notes'::pg_catalog.regclass::oid, 'counselor_student_notes_10_prepare'::text, 'public.prepare_counselor_private_record()'::pg_catalog.regprocedure::oid, 'public'::text, 'prepare_counselor_private_record'::text, ''::text, 23::smallint, 'O'::"char", false, 0::smallint, ''::text, null::text, 0::oid, false, false, null::text, null::text),
    ('public', 'counselor_student_notes', 'public.counselor_student_notes'::pg_catalog.regclass::oid, 'counselor_student_notes_20_normalize', 'public.normalize_counselor_student_note()'::pg_catalog.regprocedure::oid, 'public', 'normalize_counselor_student_note', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'counselor_follow_ups_10_prepare', 'public.prepare_counselor_private_record()'::pg_catalog.regprocedure::oid, 'public', 'prepare_counselor_private_record', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'counselor_follow_ups_20_normalize', 'public.normalize_counselor_follow_up()'::pg_catalog.regprocedure::oid, 'public', 'normalize_counselor_follow_up', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'counselor_student_notes', 'public.counselor_student_notes'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_notes', pg_catalog.to_regprocedure('public.enforce_primary_counselor_student_case_row()')::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_follow_ups', pg_catalog.to_regprocedure('public.enforce_primary_counselor_student_case_row()')::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'student_counseling_progressions', 'public.student_counseling_progressions'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_progressions', pg_catalog.to_regprocedure('public.enforce_primary_counselor_student_case_row()')::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'student_university_applications', 'public.student_university_applications'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_applications', pg_catalog.to_regprocedure('public.enforce_primary_counselor_student_case_row()')::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'student_counseling_progression_evidence', 'public.student_counseling_progression_evidence'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_progression_evidence', pg_catalog.to_regprocedure('public.enforce_primary_counselor_progression_evidence()')::oid, 'public', 'enforce_primary_counselor_progression_evidence', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
    ('public', 'student_university_application_documents', 'public.student_university_application_documents'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_application_documents', pg_catalog.to_regprocedure('public.enforce_primary_counselor_application_document()')::oid, 'public', 'enforce_primary_counselor_application_document', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null)
),
actual_case_triggers as (
  select
    relation_namespace.nspname::text as relation_schema,
    relation.relname::text as relation_name,
    relation.oid as relation_oid,
    trigger_record.tgname::text as trigger_name,
    procedure.oid as function_oid,
    function_namespace.nspname::text as function_schema,
    procedure.proname::text as function_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      as function_identity_arguments,
    trigger_record.tgtype as trigger_type,
    trigger_record.tgenabled as enabled_state,
    trigger_record.tgisinternal as is_internal,
    trigger_record.tgnargs as argument_count,
    pg_catalog.encode(trigger_record.tgargs, 'hex') as arguments_hex,
    pg_catalog.pg_get_expr(
      trigger_record.tgqual,
      trigger_record.tgrelid,
      false
    )::text as when_expression,
    trigger_record.tgconstraint as constraint_oid,
    trigger_record.tgdeferrable as is_deferrable,
    trigger_record.tginitdeferred as is_initially_deferred,
    trigger_record.tgoldtable::text as old_transition_table,
    trigger_record.tgnewtable::text as new_transition_table
  from pg_catalog.pg_trigger as trigger_record
  inner join pg_catalog.pg_class as relation
    on relation.oid = trigger_record.tgrelid
  inner join pg_catalog.pg_namespace as relation_namespace
    on relation_namespace.oid = relation.relnamespace
  inner join pg_catalog.pg_proc as procedure
    on procedure.oid = trigger_record.tgfoid
  inner join pg_catalog.pg_namespace as function_namespace
    on function_namespace.oid = procedure.pronamespace
  where trigger_record.tgrelid in (
      'public.counselor_student_notes'::pg_catalog.regclass,
      'public.counselor_follow_ups'::pg_catalog.regclass,
      'public.student_counseling_progressions'::pg_catalog.regclass,
      'public.student_university_applications'::pg_catalog.regclass,
      'public.student_counseling_progression_evidence'::pg_catalog.regclass,
      'public.student_university_application_documents'::pg_catalog.regclass
    )
    and trigger_record.tgisinternal is false
),
checks(check_name, passed) as (
  values
    (
      'A1.4.2B complete installed function contracts match reviewed hashes',
      (select pg_catalog.count(*) from actual_case_functions) = 7
      and not exists (
        select * from expected_case_functions
        except
        select
          function_name,
          identity_arguments,
          result_type_oid,
          returns_set,
          language_name,
          security_definer,
          volatility,
          body_sha256,
          execute_grantees
        from actual_case_functions
        where prokind = 'f'
          and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_name = 'postgres'
          and proisstrict is false
          and proleakproof is false
          and proparallel = 'u'
          and (
            function_name <> 'get_my_primary_counselor_case_access'
            or (
              proallargtypes = array[
                'pg_catalog.uuid'::pg_catalog.regtype::oid,
                'pg_catalog.text'::pg_catalog.regtype::oid
              ]::oid[]
              and proargmodes = array['i', 't']::"char"[]
              and proargnames = array[
                'p_student_id',
                'access_state'
              ]::text[]
            )
          )
      )
      and not exists (
        select
          function_name,
          identity_arguments,
          result_type_oid,
          returns_set,
          language_name,
          security_definer,
          volatility,
          body_sha256,
          execute_grantees
        from actual_case_functions
        where prokind = 'f'
          and proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
          and owner_name = 'postgres'
          and proisstrict is false
          and proleakproof is false
          and proparallel = 'u'
          and (
            function_name <> 'get_my_primary_counselor_case_access'
            or (
              proallargtypes = array[
                'pg_catalog.uuid'::pg_catalog.regtype::oid,
                'pg_catalog.text'::pg_catalog.regtype::oid
              ]::oid[]
              and proargmodes = array['i', 't']::"char"[]
              and proargnames = array[
                'p_student_id',
                'access_state'
              ]::text[]
            )
          )
        except
        select * from expected_case_functions
      )
    ),
    (
      'A1.4.2B complete protected relation user-trigger inventory is exact',
      not exists (
        select * from expected_case_triggers
        except
        select * from actual_case_triggers
      )
      and not exists (
        select * from actual_case_triggers
        except
        select * from expected_case_triggers
      )
    )
)
select
  'A1.4.2B_check'::text as category,
  check_name as object_name,
  passed
from checks
),
all_checks as (
  select 'A1.4.1' as category, check_name, passed, null::text as details from a141_results
  union all
  select 'A1.4.2A' as category, check_name, passed, null::text as details from a142a_results
  union all
  select 'A1.4.2B' as category, check_name, passed, null::text as details from a142b_storage_results
),
final_results as (
  select
    check_name,
    passed,
    details
  from all_checks
  
  union all
  
  select
    'MIGRATION_001_HELPER_STATE' as check_name,
    bool_and(passed) as passed,
    null::text as details
  from a142b_storage_results
  
  union all
  
  select
    'POST_002_FINAL_GATE' as check_name,
    bool_and(passed) as passed,
    null::text as details
  from all_checks
)
select check_name, passed, details
from (
  select 1 as ord, check_name, passed, details from final_results where check_name not in ('MIGRATION_001_HELPER_STATE', 'POST_002_FINAL_GATE')
  union all
  select 2 as ord, check_name, passed, details from final_results where check_name = 'MIGRATION_001_HELPER_STATE'
  union all
  select 3 as ord, check_name, passed, details from final_results where check_name = 'POST_002_FINAL_GATE'
) as ordered_results
order by
  ord asc,
  check_name asc;

rollback;
