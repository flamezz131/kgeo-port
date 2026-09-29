-- K-GEO Phase A1.4.2B primary counselor case ownership enforcement.
-- Long-term case mutations require the student's active Primary Counselor;
-- consultation-specific outcome ownership remains a separate contract.

begin;

set local search_path = '';

-- Hold the same write-conflicting relation lock needed by trigger DDL before
-- inspecting reservations. Every pre-existing writer must finish before these
-- locks are granted; every later writer waits until commit and therefore runs
-- through the installed Primary Counselor triggers.
lock table
  public.student_counseling_progression_evidence,
  public.student_university_application_documents
in share row exclusive mode;

-- FAIL CLOSED: existing static Storage policies and all live upload
-- reservations must be compatible before any case enforcement object below
-- is created. This block reads Storage catalogs and application data only.
do $reservation_gate_prerequisite$
declare
  v_authenticated_role_oid oid;
  v_assignment_relation_count integer;
  v_applicable_policy_count integer;
  v_applicable_policy_names name[];
  v_exact_policy_count integer;
  v_progression_expression text;
  v_progression_policy_oid oid;
  v_progression_relation_dependencies text[];
  v_progression_function_dependencies text[];
  v_document_expression text;
  v_document_policy_oid oid;
  v_document_relation_dependencies text[];
  v_document_function_dependencies text[];
  v_exact_select_policy_count integer;
  v_applicable_select_policy_count integer;
  v_applicable_select_policy_names name[];
  v_progression_select_expression text;
  v_progression_select_policy_oid oid;
  v_progression_select_relation_dependencies text[];
  v_progression_select_function_dependencies text[];
  v_document_select_expression text;
  v_document_select_policy_oid oid;
  v_document_select_relation_dependencies text[];
  v_document_select_function_dependencies text[];
  v_exact_helper_count integer;
  v_incompatible_progression_reservations bigint;
  v_incompatible_document_reservations bigint;
begin
  select role_record.oid
  into v_authenticated_role_oid
  from pg_catalog.pg_roles as role_record
  where role_record.rolname = 'authenticated';

  if v_authenticated_role_oid is null then
    raise exception using
      errcode = '55000',
      message = 'Authenticated database role prerequisite failed';
  end if;

  select pg_catalog.count(*)::integer
  into v_assignment_relation_count
  from pg_catalog.pg_class as relation
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'student_counselor_assignments'
    and relation.relkind = 'r';

  if v_assignment_relation_count <> 1 then
    raise exception using
      errcode = '55000',
      message = 'Primary Counselor assignment relation prerequisite failed';
  end if;

  with recursive applicable_roles(role_oid) as (
    select v_authenticated_role_oid
    union
    select membership.roleid
    from pg_catalog.pg_auth_members as membership
    inner join applicable_roles as inherited_role
      on inherited_role.role_oid = membership.member
  ), applicable_insert_policies as (
    select policy_record.polname
    from pg_catalog.pg_policy as policy_record
    inner join pg_catalog.pg_class as relation
      on relation.oid = policy_record.polrelid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'storage'
      and relation.relname = 'objects'
      and policy_record.polcmd in ('a', '*')
      and exists (
        select 1
        from pg_catalog.unnest(policy_record.polroles) as policy_role(role_oid)
        where policy_role.role_oid = 0
          or policy_role.role_oid in (
            select applicable_role.role_oid
            from applicable_roles as applicable_role
          )
      )
  )
  select
    pg_catalog.count(*)::integer,
    pg_catalog.array_agg(policy_name.polname order by policy_name.polname)
  into v_applicable_policy_count, v_applicable_policy_names
  from applicable_insert_policies as policy_name;

  if v_applicable_policy_count <> 2
    or v_applicable_policy_names is distinct from array[
      'progression_evidence_object_insert_counselor',
      'university_application_document_object_insert_counselor'
    ]::name[] then
    raise exception using
      errcode = '55000',
      message = 'Storage INSERT policy allowlist prerequisite failed';
  end if;

  with recursive applicable_roles(role_oid) as (
    select v_authenticated_role_oid
    union
    select membership.roleid
    from pg_catalog.pg_auth_members as membership
    inner join applicable_roles as inherited_role
      on inherited_role.role_oid = membership.member
  ), applicable_select_policies as (
    select policy_record.polname
    from pg_catalog.pg_policy as policy_record
    inner join pg_catalog.pg_class as relation
      on relation.oid = policy_record.polrelid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'storage'
      and relation.relname = 'objects'
      and policy_record.polcmd in ('r', '*')
      and exists (
        select 1
        from pg_catalog.unnest(policy_record.polroles) as policy_role(role_oid)
        where policy_role.role_oid = 0
          or policy_role.role_oid in (
            select applicable_role.role_oid
            from applicable_roles as applicable_role
          )
      )
  )
  select
    pg_catalog.count(*)::integer,
    pg_catalog.array_agg(policy_name.polname order by policy_name.polname)
  into v_applicable_select_policy_count, v_applicable_select_policy_names
  from applicable_select_policies as policy_name;

  if v_applicable_select_policy_count <> 2
    or v_applicable_select_policy_names is distinct from array[
      'progression_evidence_object_select_counselor',
      'university_application_document_object_select_counselor'
    ]::name[] then
    raise exception using
      errcode = '55000',
      message = 'Storage SELECT policy allowlist prerequisite failed';
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.max(
      case when policy_record.polname =
        'progression_evidence_object_insert_counselor'
      then pg_catalog.pg_get_expr(
        policy_record.polwithcheck,
        policy_record.polrelid,
        false
      ) end
    ),
    pg_catalog.max(
      case when policy_record.polname =
        'progression_evidence_object_insert_counselor'
      then policy_record.oid::bigint end
    )::oid,
    pg_catalog.max(
      case when policy_record.polname =
        'university_application_document_object_insert_counselor'
      then pg_catalog.pg_get_expr(
        policy_record.polwithcheck,
        policy_record.polrelid,
        false
      ) end
    ),
    pg_catalog.max(
      case when policy_record.polname =
        'university_application_document_object_insert_counselor'
      then policy_record.oid::bigint end
    )::oid
  into
    v_exact_policy_count,
    v_progression_expression,
    v_progression_policy_oid,
    v_document_expression,
    v_document_policy_oid
  from pg_catalog.pg_policy as policy_record
  inner join pg_catalog.pg_class as relation
    on relation.oid = policy_record.polrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'storage'
    and relation.relname = 'objects'
    and policy_record.polname in (
      'progression_evidence_object_insert_counselor',
      'university_application_document_object_insert_counselor'
    )
    and policy_record.polcmd = 'a'
    and policy_record.polpermissive is true
    and policy_record.polroles = array[v_authenticated_role_oid]::oid[]
    and policy_record.polwithcheck is not null;

  if v_exact_policy_count <> 2
    or v_progression_expression is null
    or v_progression_policy_oid is null
    or v_document_expression is null
    or v_document_policy_oid is null then
    raise exception using
      errcode = '55000',
      message = 'Static Storage policy metadata prerequisite failed';
  end if;

  -- pg_get_expr runs under the transaction-local empty search path. Compare
  -- the complete rendered programs after collapsing whitespace only; no SQL
  -- token, parenthesis, literal, or schema qualification is removed.
  v_progression_expression := pg_catalog.regexp_replace(
    pg_catalog.btrim(
      pg_catalog.replace(
        pg_catalog.replace(
          v_progression_expression,
          pg_catalog.chr(13) || pg_catalog.chr(10),
          pg_catalog.chr(10)
        ),
        pg_catalog.chr(13),
        pg_catalog.chr(10)
      )
    ),
    '[[:space:]]+',
    ' ',
    'g'
  );
  v_document_expression := pg_catalog.regexp_replace(
    pg_catalog.btrim(
      pg_catalog.replace(
        pg_catalog.replace(
          v_document_expression,
          pg_catalog.chr(13) || pg_catalog.chr(10),
          pg_catalog.chr(10)
        ),
        pg_catalog.chr(13),
        pg_catalog.chr(10)
      )
    ),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if v_progression_expression <>
      '((bucket_id = ''counseling-progression-evidence''::text) AND ( SELECT public.has_active_verified_kgeo_role(''counselor''::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = ''pending''::public.counseling_progression_evidence_status) AND (evidence.uploaded_by = ( SELECT auth.uid() AS uid)) AND (evidence.upload_expires_at > statement_timestamp())))))'
    or v_document_expression <>
      '((bucket_id = ''university-application-documents''::text) AND ( SELECT public.can_upload_university_application_document_object(objects.bucket_id, objects.name) AS can_upload_university_application_document_object))' then
    raise exception using
      errcode = '55000',
      message = 'Static Storage policy expression prerequisite failed';
  end if;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_progression_relation_dependencies
  from (
    select distinct
      pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
        as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_class as relation
      on dependency_record.refclassid =
        'pg_catalog.pg_class'::pg_catalog.regclass
      and relation.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_progression_policy_oid
  ) as dependency;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_progression_function_dependencies
  from (
    select distinct
      pg_catalog.format(
        '%I.%I(%s)',
        namespace.nspname,
        procedure.proname,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      ) as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_proc as procedure
      on dependency_record.refclassid =
        'pg_catalog.pg_proc'::pg_catalog.regclass
      and procedure.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_progression_policy_oid
  ) as dependency;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_document_relation_dependencies
  from (
    select distinct
      pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
        as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_class as relation
      on dependency_record.refclassid =
        'pg_catalog.pg_class'::pg_catalog.regclass
      and relation.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_document_policy_oid
  ) as dependency;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_document_function_dependencies
  from (
    select distinct
      pg_catalog.format(
        '%I.%I(%s)',
        namespace.nspname,
        procedure.proname,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      ) as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_proc as procedure
      on dependency_record.refclassid =
        'pg_catalog.pg_proc'::pg_catalog.regclass
      and procedure.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_document_policy_oid
  ) as dependency;

  if v_progression_relation_dependencies is distinct from array[
      'public.student_counseling_progression_evidence',
      'storage.objects'
    ]::text[]
    or v_progression_function_dependencies is distinct from array[
      'auth.uid()',
      'public.has_active_verified_kgeo_role(p_role public.user_role)'
    ]::text[]
    or v_document_relation_dependencies is distinct from array[
      'storage.objects'
    ]::text[]
    or v_document_function_dependencies is distinct from array[
      'public.can_upload_university_application_document_object(p_bucket_id text, p_storage_path text)'
    ]::text[] then
    raise exception using
      errcode = '55000',
      message = 'Static Storage policy dependency prerequisite failed';
  end if;



  select
    pg_catalog.count(*)::integer,
    pg_catalog.max(
      case when policy_record.polname =
        'progression_evidence_object_select_counselor'
      then pg_catalog.pg_get_expr(
        policy_record.polqual,
        policy_record.polrelid,
        false
      ) end
    ),
    pg_catalog.max(
      case when policy_record.polname =
        'progression_evidence_object_select_counselor'
      then policy_record.oid::bigint end
    )::oid,
    pg_catalog.max(
      case when policy_record.polname =
        'university_application_document_object_select_counselor'
      then pg_catalog.pg_get_expr(
        policy_record.polqual,
        policy_record.polrelid,
        false
      ) end
    ),
    pg_catalog.max(
      case when policy_record.polname =
        'university_application_document_object_select_counselor'
      then policy_record.oid::bigint end
    )::oid
  into
    v_exact_select_policy_count,
    v_progression_select_expression,
    v_progression_select_policy_oid,
    v_document_select_expression,
    v_document_select_policy_oid
  from pg_catalog.pg_policy as policy_record
  inner join pg_catalog.pg_class as relation
    on relation.oid = policy_record.polrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'storage'
    and relation.relname = 'objects'
    and policy_record.polname in (
      'progression_evidence_object_select_counselor',
      'university_application_document_object_select_counselor'
    )
    and policy_record.polcmd = 'r'
    and policy_record.polpermissive is true
    and policy_record.polroles = array[v_authenticated_role_oid]::oid[]
    and policy_record.polqual is not null
    and policy_record.polwithcheck is null;

  if v_exact_select_policy_count <> 2
    or v_progression_select_expression is null
    or v_progression_select_policy_oid is null
    or v_document_select_expression is null
    or v_document_select_policy_oid is null then
    raise exception using
      errcode = '55000',
      message = 'Protected Storage SELECT policy metadata prerequisite failed';
  end if;

  v_progression_select_expression := pg_catalog.regexp_replace(
    pg_catalog.btrim(
      pg_catalog.replace(
        pg_catalog.replace(
          v_progression_select_expression,
          pg_catalog.chr(13) || pg_catalog.chr(10),
          pg_catalog.chr(10)
        ),
        pg_catalog.chr(13),
        pg_catalog.chr(10)
      )
    ),
    '[[:space:]]+',
    ' ',
    'g'
  );
  v_document_select_expression := pg_catalog.regexp_replace(
    pg_catalog.btrim(
      pg_catalog.replace(
        pg_catalog.replace(
          v_document_select_expression,
          pg_catalog.chr(13) || pg_catalog.chr(10),
          pg_catalog.chr(10)
        ),
        pg_catalog.chr(13),
        pg_catalog.chr(10)
      )
    ),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if v_progression_select_expression <>
      '((bucket_id = ''counseling-progression-evidence''::text) AND ( SELECT public.has_active_verified_kgeo_role(''counselor''::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = ''available''::public.counseling_progression_evidence_status)))))'
    or v_document_select_expression <>
      '((bucket_id = ''university-application-documents''::text) AND ( SELECT public.can_view_university_application_document_object(objects.bucket_id, objects.name) AS can_view_university_application_document_object))' then
    raise exception using
      errcode = '55000',
      message = 'Protected Storage SELECT policy expression prerequisite failed';
  end if;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_progression_select_relation_dependencies
  from (
    select distinct
      pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
        as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_class as relation
      on dependency_record.refclassid =
        'pg_catalog.pg_class'::pg_catalog.regclass
      and relation.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_progression_select_policy_oid
  ) as dependency;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_progression_select_function_dependencies
  from (
    select distinct
      pg_catalog.format(
        '%I.%I(%s)',
        namespace.nspname,
        procedure.proname,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      ) as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_proc as procedure
      on dependency_record.refclassid =
        'pg_catalog.pg_proc'::pg_catalog.regclass
      and procedure.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_progression_select_policy_oid
  ) as dependency;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_document_select_relation_dependencies
  from (
    select distinct
      pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
        as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_class as relation
      on dependency_record.refclassid =
        'pg_catalog.pg_class'::pg_catalog.regclass
      and relation.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_document_select_policy_oid
  ) as dependency;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_document_select_function_dependencies
  from (
    select distinct
      pg_catalog.format(
        '%I.%I(%s)',
        namespace.nspname,
        procedure.proname,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      ) as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_proc as procedure
      on dependency_record.refclassid =
        'pg_catalog.pg_proc'::pg_catalog.regclass
      and procedure.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_document_select_policy_oid
  ) as dependency;

  if v_progression_select_relation_dependencies is distinct from array[
      'public.student_counseling_progression_evidence',
      'storage.objects'
    ]::text[]
    or v_progression_select_function_dependencies is distinct from array[
      'public.has_active_verified_kgeo_role(p_role public.user_role)'
    ]::text[]
    or v_document_select_relation_dependencies is distinct from array[
      'storage.objects'
    ]::text[]
    or v_document_select_function_dependencies is distinct from array[
      'public.can_view_university_application_document_object(p_bucket_id text, p_storage_path text)'
    ]::text[] then
    raise exception using
      errcode = '55000',
      message = 'Protected Storage SELECT policy dependency prerequisite failed';
  end if;



  select pg_catalog.count(*)::integer
  into v_exact_helper_count
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  inner join pg_catalog.pg_language as language_record
    on language_record.oid = procedure.prolang
  where namespace.nspname = 'public'
    and procedure.proname =
      'is_active_primary_counselor_for_student'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
      'p_student_id uuid'
    and procedure.prokind = 'f'
    and procedure.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
    and procedure.proretset is false
    and procedure.prosecdef is true
    and procedure.provolatile = 's'
    and procedure.proisstrict is false
    and procedure.proleakproof is false
    and procedure.proparallel = 'u'
    and procedure.proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
    and owner_role.rolname = 'postgres'
    and language_record.lanname = 'sql'
    and pg_catalog.encode(
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
    ) = 'dbafccbd4bae61d5e20bce09ee3b66075664dc23f69943235344c3d123b9fb6b'
    and not exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as privilege
      where privilege.privilege_type = 'EXECUTE'
        and privilege.grantee <> procedure.proowner
    );

  if v_exact_helper_count <> 1 then
    raise exception using
      errcode = '55000',
      message = 'Primary Counselor helper prerequisite failed';
  end if;

  -- Inventory every non-internal trigger on every relation this migration
  -- protects. The pre-install allowlist contains only reviewed historical
  -- triggers; unrelated names, disabled triggers, and alternate functions all
  -- fail closed before any A1.4.2B enforcement object is created.
  if exists (
    with expected_pre_triggers(
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
        ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'counselor_follow_ups_20_normalize', 'public.normalize_counselor_follow_up()'::pg_catalog.regprocedure::oid, 'public', 'normalize_counselor_follow_up', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null)
    ), actual_pre_triggers as (
      select
        relation_namespace.nspname::text,
        relation.relname::text,
        relation.oid,
        trigger_record.tgname::text,
        procedure.oid,
        function_namespace.nspname::text,
        procedure.proname::text,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)::text,
        trigger_record.tgtype,
        trigger_record.tgenabled,
        trigger_record.tgisinternal,
        trigger_record.tgnargs,
        pg_catalog.encode(trigger_record.tgargs, 'hex'),
        pg_catalog.pg_get_expr(
          trigger_record.tgqual,
          trigger_record.tgrelid,
          false
        )::text,
        trigger_record.tgconstraint,
        trigger_record.tgdeferrable,
        trigger_record.tginitdeferred,
        trigger_record.tgoldtable::text,
        trigger_record.tgnewtable::text
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
    )
    (
      select * from expected_pre_triggers
      except
      select * from actual_pre_triggers
    )
    union all
    (
      select * from actual_pre_triggers
      except
      select * from expected_pre_triggers
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Protected relation pre-install trigger allowlist prerequisite failed';
  end if;

  select pg_catalog.count(*)
  into v_incompatible_progression_reservations
  from public.student_counseling_progression_evidence as evidence
  inner join public.student_counseling_progression_events as progression_event
    on progression_event.id = evidence.progression_event_id
  where evidence.status =
      'pending'::public.counseling_progression_evidence_status
    and evidence.upload_expires_at > pg_catalog.statement_timestamp()
    and not exists (
      select 1
      from public.student_counselor_assignments as assignment
      inner join public.profiles as student_profile
        on student_profile.id = assignment.student_id
        and student_profile.role = 'student'::public.user_role
      inner join public.profiles as counselor_profile
        on counselor_profile.id = assignment.counselor_id
        and counselor_profile.role = 'counselor'::public.user_role
        and counselor_profile.is_active is true
      inner join auth.users as counselor_auth
        on counselor_auth.id = counselor_profile.id
        and counselor_auth.email_confirmed_at is not null
      where assignment.student_id = progression_event.student_id
        and assignment.counselor_id = evidence.uploaded_by
        and assignment.ended_at is null
    );

  if v_incompatible_progression_reservations <> 0 then
    raise exception using
      errcode = '55000',
      message = 'Incompatible unexpired progression evidence reservations exist';
  end if;

  select pg_catalog.count(*)
  into v_incompatible_document_reservations
  from public.student_university_application_documents as document
  inner join public.student_university_applications as application
    on application.id = document.application_id
  where document.status =
      'pending'::public.university_application_document_status
    and document.upload_expires_at > pg_catalog.statement_timestamp()
    and (
      application.is_archived is true
      or not exists (
        select 1
        from public.student_counselor_assignments as assignment
        inner join public.profiles as student_profile
          on student_profile.id = assignment.student_id
          and student_profile.role = 'student'::public.user_role
        inner join public.profiles as counselor_profile
          on counselor_profile.id = assignment.counselor_id
          and counselor_profile.role = 'counselor'::public.user_role
          and counselor_profile.is_active is true
        inner join auth.users as counselor_auth
          on counselor_auth.id = counselor_profile.id
          and counselor_auth.email_confirmed_at is not null
        where assignment.student_id = application.student_id
          and assignment.counselor_id = document.uploaded_by
          and assignment.ended_at is null
      )
    );

  if v_incompatible_document_reservations <> 0 then
    raise exception using
      errcode = '55000',
      message = 'Incompatible unexpired application document reservations exist';
  end if;
end;
$reservation_gate_prerequisite$;

create function public.get_my_primary_counselor_case_access(
  p_student_id uuid
)
returns table (access_state text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
begin
  if v_caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = v_caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = p_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'Student not found';
  end if;

  return query
  select case
    when public.is_active_primary_counselor_for_student(p_student_id)
      then 'primary'::text
    when exists (
      select 1
      from public.student_counselor_assignments as assignment
      where assignment.student_id = p_student_id
        and assignment.ended_at is null
    ) then 'managed_by_other'::text
    else 'unassigned'::text
  end;
end;
$function$;

alter function public.get_my_primary_counselor_case_access(uuid)
  owner to postgres;

revoke all on function public.get_my_primary_counselor_case_access(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_my_primary_counselor_case_access(uuid)
  to authenticated;

create function public.enforce_primary_counselor_student_case_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
begin
  v_student_id := case when tg_op = 'DELETE'
    then old.student_id
    else new.student_id
  end;

  if public.is_active_primary_counselor_for_student(v_student_id)
    is not true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor case ownership is required';
  end if;

  if tg_op = 'UPDATE'
    and old.student_id is distinct from new.student_id
    and public.is_active_primary_counselor_for_student(old.student_id)
      is not true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor case ownership is required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create function public.enforce_primary_counselor_progression_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_id uuid;
  v_student_id uuid;
begin
  v_event_id := case when tg_op = 'DELETE'
    then old.progression_event_id
    else new.progression_event_id
  end;

  select progression_event.student_id
  into v_student_id
  from public.student_counseling_progression_events as progression_event
  where progression_event.id = v_event_id;

  if v_student_id is null
    or public.is_active_primary_counselor_for_student(v_student_id)
      is not true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor case ownership is required';
  end if;

  if tg_op = 'UPDATE'
    and old.progression_event_id is distinct from new.progression_event_id
    and not exists (
      select 1
      from public.student_counseling_progression_events as progression_event
      where progression_event.id = old.progression_event_id
        and public.is_active_primary_counselor_for_student(
          progression_event.student_id
        ) is true
    ) then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor case ownership is required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create function public.enforce_primary_counselor_application_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_application_id uuid;
  v_student_id uuid;
begin
  v_application_id := case when tg_op = 'DELETE'
    then old.application_id
    else new.application_id
  end;

  select application.student_id
  into v_student_id
  from public.student_university_applications as application
  where application.id = v_application_id;

  if v_student_id is null
    or public.is_active_primary_counselor_for_student(v_student_id)
      is not true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor case ownership is required';
  end if;

  if tg_op = 'UPDATE'
    and old.application_id is distinct from new.application_id
    and not exists (
      select 1
      from public.student_university_applications as application
      where application.id = old.application_id
        and public.is_active_primary_counselor_for_student(
          application.student_id
        ) is true
    ) then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor case ownership is required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

alter function public.enforce_primary_counselor_student_case_row()
  owner to postgres;
alter function public.enforce_primary_counselor_progression_evidence()
  owner to postgres;
alter function public.enforce_primary_counselor_application_document()
  owner to postgres;

revoke all on function public.enforce_primary_counselor_student_case_row()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_primary_counselor_progression_evidence()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_primary_counselor_application_document()
  from public, anon, authenticated, service_role;

create trigger enforce_primary_counselor_case_on_notes
before insert or update or delete on public.counselor_student_notes
for each row execute function
  public.enforce_primary_counselor_student_case_row();

create trigger enforce_primary_counselor_case_on_follow_ups
before insert or update or delete on public.counselor_follow_ups
for each row execute function
  public.enforce_primary_counselor_student_case_row();

create trigger enforce_primary_counselor_case_on_progressions
before insert or update or delete on public.student_counseling_progressions
for each row execute function
  public.enforce_primary_counselor_student_case_row();

create trigger enforce_primary_counselor_case_on_applications
before insert or update or delete on public.student_university_applications
for each row execute function
  public.enforce_primary_counselor_student_case_row();

create trigger enforce_primary_counselor_case_on_progression_evidence
before insert or update or delete
on public.student_counseling_progression_evidence
for each row execute function
  public.enforce_primary_counselor_progression_evidence();

create trigger enforce_primary_counselor_case_on_application_documents
before insert or update or delete
on public.student_university_application_documents
for each row execute function
  public.enforce_primary_counselor_application_document();

create or replace function public.can_upload_university_application_document_object(
  p_bucket_id text,
  p_storage_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  return (
    p_bucket_id = 'university-application-documents'
    and exists (
      select 1
      from public.student_university_application_documents as document
      inner join public.student_university_applications as application
        on application.id = document.application_id
        and application.is_archived is false
      inner join public.profiles as student_profile
        on student_profile.id = application.student_id
        and student_profile.role = 'student'::public.user_role
      where document.bucket_id = p_bucket_id
        and document.storage_path = p_storage_path
        and document.status =
          'pending'::public.university_application_document_status
        and document.uploaded_by = (select auth.uid())
        and document.upload_expires_at > pg_catalog.statement_timestamp()
        and public.is_active_primary_counselor_for_student(
          application.student_id
        ) is true
    )
  );
exception
  when others then
    return false;
end;
$function$;

alter function public.can_upload_university_application_document_object(
  text,
  text
) owner to postgres;

revoke all on function public.can_upload_university_application_document_object(
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.can_upload_university_application_document_object(
  text,
  text
) to authenticated;

-- FAIL CLOSED: independently re-inventory every user-defined trigger after
-- installation. This catches concurrent or pre-existing drift regardless of
-- trigger name, timing, event set, enabled state, arguments, or ordering.
do $final_trigger_contract$
begin
  if exists (
    with expected_post_triggers(
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
        ('public', 'counselor_student_notes', 'public.counselor_student_notes'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_notes', 'public.enforce_primary_counselor_student_case_row()'::pg_catalog.regprocedure::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_follow_ups', 'public.enforce_primary_counselor_student_case_row()'::pg_catalog.regprocedure::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'student_counseling_progressions', 'public.student_counseling_progressions'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_progressions', 'public.enforce_primary_counselor_student_case_row()'::pg_catalog.regprocedure::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'student_university_applications', 'public.student_university_applications'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_applications', 'public.enforce_primary_counselor_student_case_row()'::pg_catalog.regprocedure::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'student_counseling_progression_evidence', 'public.student_counseling_progression_evidence'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_progression_evidence', 'public.enforce_primary_counselor_progression_evidence()'::pg_catalog.regprocedure::oid, 'public', 'enforce_primary_counselor_progression_evidence', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'student_university_application_documents', 'public.student_university_application_documents'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_application_documents', 'public.enforce_primary_counselor_application_document()'::pg_catalog.regprocedure::oid, 'public', 'enforce_primary_counselor_application_document', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null)
    ), actual_post_triggers as (
      select
        relation_namespace.nspname::text,
        relation.relname::text,
        relation.oid,
        trigger_record.tgname::text,
        procedure.oid,
        function_namespace.nspname::text,
        procedure.proname::text,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)::text,
        trigger_record.tgtype,
        trigger_record.tgenabled,
        trigger_record.tgisinternal,
        trigger_record.tgnargs,
        pg_catalog.encode(trigger_record.tgargs, 'hex'),
        pg_catalog.pg_get_expr(
          trigger_record.tgqual,
          trigger_record.tgrelid,
          false
        )::text,
        trigger_record.tgconstraint,
        trigger_record.tgdeferrable,
        trigger_record.tginitdeferred,
        trigger_record.tgoldtable::text,
        trigger_record.tgnewtable::text
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
    )
    (
      select * from expected_post_triggers
      except
      select * from actual_post_triggers
    )
    union all
    (
      select * from actual_post_triggers
      except
      select * from expected_post_triggers
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Protected relation final trigger allowlist assertion failed';
  end if;
end;
$final_trigger_contract$;

commit;
