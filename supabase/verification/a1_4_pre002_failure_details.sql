
-- Temporary READ-ONLY staging diagnostic file
-- A1.4 PRE-002 FAILURE DETAILS

begin transaction isolation level repeatable read read only;

set local statement_timeout = '30s';

set local search_path = '';

with ownership_funcs as (
  select
    procedure.proname as fn_name,
    pg_catalog.regexp_replace(
      pg_catalog.btrim(
        pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ),
      '\s+',
      ' ',
      'g'
    ) as ldef,
    pg_catalog.pg_get_functiondef(procedure.oid) as def,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) as id_args,
    pg_catalog.pg_get_function_result(procedure.oid) as ret_type,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig,
    owner.rolname as owner_name
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = procedure.proowner
  where procedure.oid in (
    pg_catalog.to_regprocedure('public.prepare_consultation_request_insert()'),
    pg_catalog.to_regprocedure('public.claim_next_consultation()'),
    pg_catalog.to_regprocedure('public.record_consultation_outcome(uuid,text)')
  )
),
a142a_funcs as (
  select
    procedure.proname as fn_name,
    pg_catalog.pg_get_function_identity_arguments(procedure.oid) as id_args,
    pg_catalog.pg_get_function_result(procedure.oid) as ret_type,
    procedure.prosecdef,
    procedure.provolatile,
    procedure.proconfig,
    owner.rolname as owner_name,
    pg_catalog.regexp_replace(
      pg_catalog.btrim(
        pg_catalog.lower(pg_catalog.pg_get_functiondef(procedure.oid))
      ),
      '\s+',
      ' ',
      'g'
    ) as ldef
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner
    on owner.oid = procedure.proowner
  where procedure.oid in (
    pg_catalog.to_regprocedure('public.claim_next_consultation()'),
    pg_catalog.to_regprocedure('public.list_my_primary_students(integer,integer)'),
    pg_catalog.to_regprocedure('public.list_director_primary_counselor_assignments(uuid[])'),
    pg_catalog.to_regprocedure('public.list_director_primary_counselor_counts(uuid[])')
  )
),
storage_policies as (
  select
    policy_record.polname,
    policy_record.polcmd,
    policy_record.polpermissive,
    array(
      select role_record.rolname
      from pg_catalog.unnest(policy_record.polroles) as policy_role(role_oid)
      left join pg_catalog.pg_roles as role_record
        on role_record.oid = policy_role.role_oid
      order by role_record.rolname
    ) as roles,
    pg_catalog.regexp_replace(
      pg_catalog.btrim(
        pg_catalog.replace(
          pg_catalog.replace(
            pg_catalog.pg_get_expr(
              coalesce(policy_record.polwithcheck, policy_record.polqual),
              policy_record.polrelid
            ),
            pg_catalog.chr(13) || pg_catalog.chr(10),
            pg_catalog.chr(10)
          ),
          pg_catalog.chr(13),
          pg_catalog.chr(10)
        )
      ),
      '\s+', ' ', 'g'
    ) as exact_expression,
    array(
      select distinct
        pg_catalog.format(
          '%s.%s',
          dependency_namespace.nspname,
          dependency_relation.relname
        )
      from pg_catalog.pg_depend as dependency_record
      inner join pg_catalog.pg_class as dependency_relation
        on dependency_relation.oid = dependency_record.refobjid
        and dependency_record.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
      inner join pg_catalog.pg_namespace as dependency_namespace
        on dependency_namespace.oid = dependency_relation.relnamespace
      where dependency_record.classid = 'pg_catalog.pg_policy'::pg_catalog.regclass
        and dependency_record.objid = policy_record.oid
      order by 1
    ) as relation_dependencies,
    array(
      select distinct
        pg_catalog.format(
          '%s.%s(%s)',
          dependency_namespace.nspname,
          dependency_procedure.proname,
          pg_catalog.pg_get_function_identity_arguments(dependency_procedure.oid)
        )
      from pg_catalog.pg_depend as dependency_record
      inner join pg_catalog.pg_proc as dependency_procedure
        on dependency_procedure.oid = dependency_record.refobjid
        and dependency_record.refclassid = 'pg_catalog.pg_proc'::pg_catalog.regclass
      inner join pg_catalog.pg_namespace as dependency_namespace
        on dependency_namespace.oid = dependency_procedure.pronamespace
      where dependency_record.classid = 'pg_catalog.pg_policy'::pg_catalog.regclass
        and dependency_record.objid = policy_record.oid
      order by 1
    ) as function_dependencies
  from pg_catalog.pg_policy as policy_record
  inner join pg_catalog.pg_class as relation
    on relation.oid = policy_record.polrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname::text = 'storage'
    and relation.relname::text = 'objects'
    and policy_record.polname::text in (
      'progression_evidence_object_insert_counselor',
      'progression_evidence_object_select_counselor',
      'university_application_document_object_insert_counselor',
      'university_application_document_object_select_counselor'
    )
),
all_details as (
  -- A1.4.1 public.claim_next_consultation()
  select 'A1.4.1' as area, 'claim_next_consultation' as object_name, 'caller_id derived from auth.uid()' as subcheck,
    coalesce(ldef like '%v_caller_id := (select auth.uid())%', false) as passed,
    coalesce((ldef like '%v_caller_id := (select auth.uid())%')::text, 'MISSING FUNC') as actual_value
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'counselor role validation',
    coalesce(ldef like '%counselor_profile.role = ''counselor''::public.user_role%', false),
    coalesce((ldef like '%counselor_profile.role = ''counselor''::public.user_role%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'counselor is_active = true',
    coalesce(ldef like '%counselor_profile.is_active is true%', false),
    coalesce((ldef like '%counselor_profile.is_active is true%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'email_confirmed_at is not null',
    coalesce(ldef like '%counselor_auth.email_confirmed_at is not null%', false),
    coalesce((ldef like '%counselor_auth.email_confirmed_at is not null%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'no Director authorization',
    coalesce(ldef not like '%director%', false),
    coalesce((ldef not like '%director%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'no Admin authorization',
    coalesce(ldef not like '%admin%', false),
    coalesce((ldef not like '%admin%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'no Student authorization',
    coalesce(ldef not like '%student_profile.id = v_caller_id%', false),
    coalesce((ldef not like '%student_profile.id = v_caller_id%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'

  -- FCFS selection
  union all
  select 'A1.4.1', 'claim_next_consultation', 'FCFS: status = waiting_for_assignment',
    coalesce(ldef like '%request.status = ''waiting_for_assignment''::public.consultation_status%', false),
    coalesce((ldef like '%request.status = ''waiting_for_assignment''::public.consultation_status%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'FCFS: assigned_counselor_id is null',
    coalesce(ldef like '%request.assigned_counselor_id is null%', false),
    coalesce((ldef like '%request.assigned_counselor_id is null%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'FCFS: consultation_date is not null',
    coalesce(ldef like '%request.consultation_date is not null%', false),
    coalesce((ldef like '%request.consultation_date is not null%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'FCFS: slot_start is not null',
    coalesce(ldef like '%request.slot_start is not null%', false),
    coalesce((ldef like '%request.slot_start is not null%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'FCFS: slot_end is not null',
    coalesce(ldef like '%request.slot_end is not null%', false),
    coalesce((ldef like '%request.slot_end is not null%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'FCFS: ORDER BY submitted_at ASC, id ASC',
    coalesce(ldef like '%order by request.submitted_at asc, request.id asc%', false),
    coalesce((ldef like '%order by request.submitted_at asc, request.id asc%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'FCFS: LIMIT 1',
    coalesce(ldef like '%limit 1%', false),
    coalesce((ldef like '%limit 1%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'FCFS: FOR UPDATE',
    coalesce(ldef like '%for update%', false),
    coalesce((ldef like '%for update%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'

  -- Atomic assignment
  union all
  select 'A1.4.1', 'claim_next_consultation', 'Atomic: update consultation_requests',
    coalesce(ldef like '%update public.consultation_requests as request%', false),
    coalesce((ldef like '%update public.consultation_requests as request%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'Atomic: assigned_counselor_id = caller_id',
    coalesce(ldef like '%assigned_counselor_id = v_caller_id%', false),
    coalesce((ldef like '%assigned_counselor_id = v_caller_id%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'Atomic: assigned_at = assignment_time',
    coalesce(ldef like '%assigned_at = v_assignment_time%', false),
    coalesce((ldef like '%assigned_at = v_assignment_time%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'Atomic: status becomes scheduled',
    coalesce(ldef like '%status = ''scheduled''::public.consultation_status%', false),
    coalesce((ldef like '%status = ''scheduled''::public.consultation_status%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.1', 'claim_next_consultation', 'Atomic: required assigned_counselor_id-is-null occurrence count',
    coalesce((char_length(ldef) - char_length(replace(ldef, 'assigned_counselor_id is null', ''))) / 29 = 2, false),
    coalesce(((char_length(ldef) - char_length(replace(ldef, 'assigned_counselor_id is null', ''))) / 29)::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'

  -- Decompose private content / unrelated mutation checks
  union all
  select 'A1.4.1', fn_name, 'prohibited pattern: ' || pattern,
    coalesce(ldef not like '%' || pattern || '%', false),
    coalesce((ldef not like '%' || pattern || '%')::text, 'MISSING FUNC')
  from ownership_funcs, unnest(array[
    'counselor_student_notes',
    'counselor_follow_ups',
    'student_university_applications',
    'student_university_application_documents',
    'student_counseling_progressions',
    'student_counseling_progression_evidence',
    'raw_user_meta_data',
    'raw_app_meta_data',
    'execute '
  ]) as pattern

  -- A1.4.2A FCFS order fragment
  union all
  select 'A1.4.2A', 'claim_next_consultation', 'claim assignment: FCFS order fragment',
    coalesce(ldef like '%order by request.submitted_at asc, request.id asc%', false),
    coalesce((ldef like '%order by request.submitted_at asc, request.id asc%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.2A', 'claim_next_consultation', 'claim assignment: INSERT INTO student_counselor_assignments',
    coalesce(ldef like '%insert into public.student_counselor_assignments%', false),
    coalesce((ldef like '%insert into public.student_counselor_assignments%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.2A', 'claim_next_consultation', 'claim assignment: ON CONFLICT active student condition',
    coalesce(ldef like '%on conflict (student_id) where ended_at is null do nothing%', false),
    coalesce((ldef like '%on conflict (student_id) where ended_at is null do nothing%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.2A', 'claim_next_consultation', 'claim assignment: DO NOTHING',
    coalesce(ldef like '%do nothing%', false),
    coalesce((ldef like '%do nothing%')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'
  union all
  select 'A1.4.2A', 'claim_next_consultation', 'claim assignment: no UPDATE of assignment history',
    coalesce(ldef !~ '\mupdate\M[[:space:]]+public\.student_counselor_assignments', false),
    coalesce((ldef !~ '\mupdate\M[[:space:]]+public\.student_counselor_assignments')::text, 'MISSING FUNC')
  from ownership_funcs where fn_name::text = 'claim_next_consultation'

  -- A1.4.2A My Students
  union all
  select 'A1.4.2A', 'list_my_primary_students', 'counselor role helper',
    coalesce(ldef like '%has_active_verified_kgeo_role(%''counselor''::public.user_role%', false),
    coalesce((ldef like '%has_active_verified_kgeo_role(%''counselor''::public.user_role%')::text, 'MISSING FUNC')
  from a142a_funcs where fn_name::text = 'list_my_primary_students'
  union all
  select 'A1.4.2A', 'list_my_primary_students', 'assignment.counselor_id = caller',
    coalesce(ldef like '%assignment.counselor_id = v_caller_id%', false),
    coalesce((ldef like '%assignment.counselor_id = v_caller_id%')::text, 'MISSING FUNC')
  from a142a_funcs where fn_name::text = 'list_my_primary_students'
  union all
  select 'A1.4.2A', 'list_my_primary_students', 'ended_at IS NULL',
    coalesce(ldef like '%assignment.ended_at is null%', false),
    coalesce((ldef like '%assignment.ended_at is null%')::text, 'MISSING FUNC')
  from a142a_funcs where fn_name::text = 'list_my_primary_students'
  union all
  select 'A1.4.2A', 'list_my_primary_students', 'page-size bound',
    coalesce(ldef like '%limit p_page_size%', false),
    coalesce((ldef like '%limit p_page_size%')::text, 'MISSING FUNC')
  from a142a_funcs where fn_name::text = 'list_my_primary_students'

  -- A1.4.2A Director RPCs
  union all
  select 'A1.4.2A', 'director_rpcs', 'Director role helper',
    (select count(*) from a142a_funcs where fn_name::text like 'list_director_%' and ldef like '%has_active_verified_kgeo_role(%''director''::public.user_role%') = 2,
    coalesce((select count(*) from a142a_funcs where fn_name::text like 'list_director_%' and ldef like '%has_active_verified_kgeo_role(%''director''::public.user_role%')::text, 'NULL')
  union all
  select 'A1.4.2A', 'director_rpcs', 'cardinality bound',
    (
      select count(*)
      from a142a_funcs
      where (
        fn_name::text = 'list_director_primary_counselor_assignments'
        and ldef like '%cardinality(p_student_ids) not between 1 and 50%'
      ) or (
        fn_name::text = 'list_director_primary_counselor_counts'
        and ldef like '%cardinality(p_counselor_ids) not between 1 and 50%'
      )
    ) = 2,
    coalesce((
      select count(*)
      from a142a_funcs
      where (
        fn_name::text = 'list_director_primary_counselor_assignments'
        and ldef like '%cardinality(p_student_ids) not between 1 and 50%'
      ) or (
        fn_name::text = 'list_director_primary_counselor_counts'
        and ldef like '%cardinality(p_counselor_ids) not between 1 and 50%'
      )
    )::text, 'NULL')
  union all
  select 'A1.4.2A', 'director_rpcs', 'both expected Director RPCs discovered',
    (select count(*) from a142a_funcs where fn_name::text like 'list_director_%') = 2,
    coalesce((select count(*) from a142a_funcs where fn_name::text like 'list_director_%')::text, 'NULL')

  -- A1.4.2A subconditions for ALL 4 functions
  union all
  select 'A1.4.2A', fn_name, 'identity arguments',
    case
      when fn_name::text = 'claim_next_consultation' then id_args = ''
      when fn_name::text = 'list_my_primary_students' then id_args = 'p_page integer, p_page_size integer'
      when fn_name::text = 'list_director_primary_counselor_assignments' then id_args = 'p_student_ids uuid[]'
      when fn_name::text = 'list_director_primary_counselor_counts' then id_args = 'p_counselor_ids uuid[]'
    end,
    coalesce(id_args::text, 'NULL')
  from (
    select fn_name, id_args from ownership_funcs where fn_name::text = 'claim_next_consultation'
    union all select fn_name, id_args from a142a_funcs
  ) combined
  union all
  select 'A1.4.2A', fn_name, 'return type where relevant',
    case
      when fn_name::text = 'claim_next_consultation' then ret_type = 'uuid'
      else true 
    end,
    coalesce(ret_type::text, 'NULL')
  from (
    select fn_name, ret_type from ownership_funcs where fn_name::text = 'claim_next_consultation'
    union all select fn_name, ret_type from a142a_funcs
  ) combined
  union all
  select 'A1.4.2A', fn_name, 'SECURITY DEFINER', prosecdef, coalesce(prosecdef::text, 'NULL')
  from (
    select fn_name, prosecdef from ownership_funcs where fn_name::text = 'claim_next_consultation'
    union all select fn_name, prosecdef from a142a_funcs
  ) combined
  union all
  select 'A1.4.2A', fn_name, 'volatility',
    case
      when fn_name::text = 'claim_next_consultation' then provolatile = 'v'
      else provolatile = 's'
    end,
    coalesce(provolatile::text, 'NULL')
  from (
    select fn_name, provolatile from ownership_funcs where fn_name::text = 'claim_next_consultation'
    union all select fn_name, provolatile from a142a_funcs
  ) combined
  union all
  select 'A1.4.2A', fn_name, 'exact safe empty search_path representation',
    proconfig in (array['search_path='], array['search_path=""']),
    coalesce(array_to_string(proconfig, ',')::text, 'NULL')
  from (
    select fn_name, proconfig from ownership_funcs where fn_name::text = 'claim_next_consultation'
    union all select fn_name, proconfig from a142a_funcs
  ) combined
  union all
  select 'A1.4.2A', fn_name, 'postgres owner', owner_name::text = 'postgres', coalesce(owner_name::text, 'NULL')
  from (
    select fn_name, owner_name from ownership_funcs where fn_name::text = 'claim_next_consultation'
    union all select fn_name, owner_name from a142a_funcs
  ) combined

  -- A1.4.2B STORAGE DIAGNOSTICS
  union all
  select 'A1.4.2B', p.polname, 'policy exists',
    s.polname is not null,
    coalesce((s.polname is not null)::text, 'NULL')
  from (values 
    ('progression_evidence_object_insert_counselor'),
    ('progression_evidence_object_select_counselor'),
    ('university_application_document_object_insert_counselor'),
    ('university_application_document_object_select_counselor')
  ) p(polname)
  left join storage_policies s on p.polname = s.polname::text

  union all
  select 'A1.4.2B', s.polname, 'command',
    case 
      when s.polname::text like '%_insert_%' then s.polcmd = 'a'
      when s.polname::text like '%_select_%' then s.polcmd = 'r'
    end,
    coalesce(s.polcmd::text, 'NULL')
  from storage_policies s

  union all
  select 'A1.4.2B', s.polname, 'permissive',
    s.polpermissive = true,
    coalesce(s.polpermissive::text, 'NULL')
  from storage_policies s

  union all
  select 'A1.4.2B', s.polname, 'role names',
    s.roles::text[] = array['authenticated']::text[],
    coalesce(array_to_string(s.roles, ',')::text, 'NULL')
  from storage_policies s

  union all
  select 'A1.4.2B', s.polname, 'normalized expression',
    case
      when s.polname::text = 'progression_evidence_object_insert_counselor' then
        s.exact_expression = '((bucket_id = ''counseling-progression-evidence''::text) AND ( SELECT public.has_active_verified_kgeo_role(''counselor''::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = ''pending''::public.counseling_progression_evidence_status) AND (evidence.uploaded_by = ( SELECT auth.uid() AS uid)) AND (evidence.upload_expires_at > statement_timestamp())))))'
      when s.polname::text = 'progression_evidence_object_select_counselor' then
        s.exact_expression = '((bucket_id = ''counseling-progression-evidence''::text) AND ( SELECT public.has_active_verified_kgeo_role(''counselor''::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = ''available''::public.counseling_progression_evidence_status)))))'
      when s.polname::text = 'university_application_document_object_insert_counselor' then
        s.exact_expression = '((bucket_id = ''university-application-documents''::text) AND ( SELECT public.can_upload_university_application_document_object(objects.bucket_id, objects.name) AS can_upload_university_application_document_object))'
      when s.polname::text = 'university_application_document_object_select_counselor' then
        s.exact_expression = '((bucket_id = ''university-application-documents''::text) AND ( SELECT public.can_view_university_application_document_object(objects.bucket_id, objects.name) AS can_view_university_application_document_object))'
    end,
    coalesce(s.exact_expression::text, 'NULL')
  from storage_policies s

  union all
  select 'A1.4.2B', s.polname, 'relation dependency array',
    case
      when s.polname::text = 'progression_evidence_object_insert_counselor' then
        s.relation_dependencies = array['public.student_counseling_progression_evidence', 'storage.objects']
      when s.polname::text = 'progression_evidence_object_select_counselor' then
        s.relation_dependencies = array['public.student_counseling_progression_evidence', 'storage.objects']
      when s.polname::text = 'university_application_document_object_insert_counselor' then
        s.relation_dependencies = array['storage.objects']
      when s.polname::text = 'university_application_document_object_select_counselor' then
        s.relation_dependencies = array['storage.objects']
    end,
    coalesce(array_to_string(s.relation_dependencies, ',')::text, 'NULL')
  from storage_policies s

  union all
  select 'A1.4.2B', s.polname, 'function dependency array',
    case
      when s.polname::text = 'progression_evidence_object_insert_counselor' then
        s.function_dependencies = array['auth.uid()', 'public.has_active_verified_kgeo_role(p_role public.user_role)']
      when s.polname::text = 'progression_evidence_object_select_counselor' then
        s.function_dependencies = array['public.has_active_verified_kgeo_role(p_role public.user_role)']
      when s.polname::text = 'university_application_document_object_insert_counselor' then
        s.function_dependencies = array['public.can_upload_university_application_document_object(p_bucket_id text, p_storage_path text)']
      when s.polname::text = 'university_application_document_object_select_counselor' then
        s.function_dependencies = array['public.can_view_university_application_document_object(p_bucket_id text, p_storage_path text)']
    end,
    coalesce(array_to_string(s.function_dependencies, ',')::text, 'NULL')
  from storage_policies s
)
select area, object_name, subcheck, passed, actual_value
from all_details
order by area, object_name, subcheck;

rollback;
