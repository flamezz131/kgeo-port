begin transaction read only;

set local search_path = '';

select 'ACHIEVEMENT_DOCUMENT_ENUMS_EXACT' as check_name,
  coalesce((
    select pg_catalog.array_agg(
      type_record.typname::text || ':' || enum_value.enumlabel::text
      order by type_record.typname::text, enum_value.enumsortorder
    ) = array[
      'student_achievement_document_removal_reason:student_delete',
      'student_achievement_document_removal_reason:pending_cancel',
      'student_achievement_document_removal_reason:invalid_file',
      'student_achievement_document_status:pending',
      'student_achievement_document_status:available',
      'student_achievement_document_status:removal_pending',
      'student_achievement_document_status:removed'
    ]::text[]
      and pg_catalog.bool_and(type_record.typowner = (
        select role.oid from pg_catalog.pg_roles as role
        where role.rolname = 'postgres'
      ))
      and pg_catalog.bool_and(not pg_catalog.has_type_privilege(
        'anon', type_record.oid, 'USAGE'
      ))
      and pg_catalog.bool_and(not pg_catalog.has_type_privilege(
        'service_role', type_record.oid, 'USAGE'
      ))
      and pg_catalog.bool_and(
        pg_catalog.has_type_privilege(
          'authenticated', type_record.oid, 'USAGE'
        ) = (type_record.typname = 'student_achievement_document_status')
      )
      and pg_catalog.bool_and(not exists (
        select 1
        from pg_catalog.aclexplode(coalesce(
          type_record.typacl,
          pg_catalog.acldefault('T', type_record.typowner)
        )) as acl
        where acl.grantee = 0
          and acl.privilege_type = 'USAGE'
      ))
    from pg_catalog.pg_type as type_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = type_record.typnamespace
    join pg_catalog.pg_enum as enum_value
      on enum_value.enumtypid = type_record.oid
    where namespace_record.nspname = 'public'
      and type_record.typname in (
        'student_achievement_document_status',
        'student_achievement_document_removal_reason'
      )
  ), false) as passed;

with expected(
  ordinal, column_name, data_type, not_null, default_expression,
  identity_kind, generated_kind
) as (
  values
    (1, 'id', 'uuid', true, 'gen_random_uuid()', '', ''),
    (2, 'achievement_id', 'uuid', false, null, '', ''),
    (3, 'achievement_reference_id', 'uuid', true, null, '', ''),
    (4, 'student_id', 'uuid', true, null, '', ''),
    (5, 'document_name', 'text', true, null, '', ''),
    (6, 'bucket_id', 'text', true,
      '''student-achievement-documents''::text', '', ''),
    (7, 'storage_path', 'text', true, null, '', ''),
    (8, 'mime_type', 'text', true, null, '', ''),
    (9, 'file_size_bytes', 'bigint', true, null, '', ''),
    (10, 'status', 'public.student_achievement_document_status', true,
      '''pending''::public.student_achievement_document_status', '', ''),
    (11, 'uploaded_by', 'uuid', true, null, '', ''),
    (12, 'prepared_at', 'timestamp with time zone', true,
      'statement_timestamp()', '', ''),
    (13, 'upload_expires_at', 'timestamp with time zone', true, null, '', ''),
    (14, 'detected_mime_type', 'text', false, null, '', ''),
    (15, 'signature_validated_at', 'timestamp with time zone', false, null, '', ''),
    (16, 'available_at', 'timestamp with time zone', false, null, '', ''),
    (17, 'removal_requested_at', 'timestamp with time zone', false, null, '', ''),
    (18, 'removal_reason',
      'public.student_achievement_document_removal_reason', false, null, '', ''),
    (19, 'removed_at', 'timestamp with time zone', false, null, '', ''),
    (20, 'removed_by', 'uuid', false, null, '', ''),
    (21, 'created_at', 'timestamp with time zone', true,
      'statement_timestamp()', '', ''),
    (22, 'updated_at', 'timestamp with time zone', true,
      'statement_timestamp()', '', '')
), actual as (
  select attribute.attnum::integer as ordinal,
    attribute.attname::text as column_name,
    pg_catalog.format_type(attribute.atttypid, attribute.atttypmod) as data_type,
    attribute.attnotnull as not_null,
    pg_catalog.pg_get_expr(default_record.adbin, default_record.adrelid) as default_expression,
    attribute.attidentity::text as identity_kind,
    attribute.attgenerated::text as generated_kind
  from pg_catalog.pg_attribute as attribute
  left join pg_catalog.pg_attrdef as default_record
    on default_record.adrelid = attribute.attrelid
   and default_record.adnum = attribute.attnum
  where attribute.attrelid = pg_catalog.to_regclass(
    'public.student_achievement_documents'
  )
    and attribute.attnum > 0
    and not attribute.attisdropped
)
select 'ACHIEVEMENT_DOCUMENT_COLUMNS_EXACT' as check_name,
  coalesce((select pg_catalog.count(*) = 22 from actual), false)
  and not exists (
    select 1
    from expected
    full join actual using (ordinal)
    where expected.ordinal is null
      or actual.ordinal is null
      or actual.column_name is distinct from expected.column_name
      or actual.data_type is distinct from expected.data_type
      or actual.not_null is distinct from expected.not_null
      or actual.default_expression is distinct from expected.default_expression
      or actual.identity_kind is distinct from expected.identity_kind
      or actual.generated_kind is distinct from expected.generated_kind
  ) as passed;

select 'SEALED_ACHIEVEMENT_DOCUMENT_TABLE' as check_name,
  coalesce((
    select relation.relkind = 'r'
      and relation.relrowsecurity
      and relation.relforcerowsecurity
      and relation.relowner = (
        select role.oid from pg_catalog.pg_roles as role
        where role.rolname = 'postgres'
      )
      and not pg_catalog.has_table_privilege(
        'anon', relation.oid, 'SELECT,INSERT,UPDATE,DELETE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated', relation.oid, 'SELECT,INSERT,UPDATE,DELETE'
      )
      and not pg_catalog.has_table_privilege(
        'service_role', relation.oid, 'SELECT,INSERT,UPDATE,DELETE'
      )
      and not exists (
        select 1 from pg_catalog.pg_policy as policy
        where policy.polrelid = relation.oid
      )
    from pg_catalog.pg_class as relation
    where relation.oid = pg_catalog.to_regclass(
      'public.student_achievement_documents'
    )
  ), false) as passed;

with expected(name, constraint_type, local_columns, referenced_relation,
  referenced_columns, delete_action) as (
  values
    ('student_achievement_documents_pkey', 'p', array['id']::text[],
      null, null::text[], null),
    ('student_achievement_documents_storage_path_key', 'u',
      array['storage_path']::text[], null, null::text[], null),
    ('student_achievement_documents_achievement_id_fkey', 'f',
      array['achievement_id']::text[], 'public.student_achievements',
      array['id']::text[], 'n'),
    ('student_achievement_documents_student_id_fkey', 'f',
      array['student_id']::text[], 'public.profiles', array['id']::text[], 'r'),
    ('student_achievement_documents_uploaded_by_fkey', 'f',
      array['uploaded_by']::text[], 'public.profiles', array['id']::text[], 'r'),
    ('student_achievement_documents_removed_by_fkey', 'f',
      array['removed_by']::text[], 'public.profiles', array['id']::text[], 'r'),
    ('student_achievement_documents_reference_check', 'c', null::text[],
      null, null::text[], null),
    ('student_achievement_documents_name_check', 'c', null::text[],
      null, null::text[], null),
    ('student_achievement_documents_bucket_check', 'c', null::text[],
      null, null::text[], null),
    ('student_achievement_documents_mime_check', 'c', null::text[],
      null, null::text[], null),
    ('student_achievement_documents_size_check', 'c', null::text[],
      null, null::text[], null),
    ('student_achievement_documents_actor_check', 'c', null::text[],
      null, null::text[], null),
    ('student_achievement_documents_expiry_check', 'c', null::text[],
      null, null::text[], null),
    ('student_achievement_documents_signature_check', 'c', null::text[],
      null, null::text[], null),
    ('student_achievement_documents_lifecycle_check', 'c', null::text[],
      null, null::text[], null)
), actual as (
  select constraint_record.conname::text as name,
    constraint_record.contype::text as constraint_type,
    case when constraint_record.contype in ('p', 'u', 'f') then
      coalesce((
        select pg_catalog.array_agg(
          attribute.attname::text order by key_column.ordinality
        )
        from pg_catalog.unnest(constraint_record.conkey)
          with ordinality as key_column(attnum, ordinality)
        join pg_catalog.pg_attribute as attribute
          on attribute.attrelid = constraint_record.conrelid
         and attribute.attnum = key_column.attnum
      ), array[]::text[])
    else array[]::text[]
    end as local_columns,
    case when constraint_record.confrelid = 0 then null
      else constraint_record.confrelid::pg_catalog.regclass::text
    end as referenced_relation,
    coalesce((
      select pg_catalog.array_agg(attribute.attname::text order by key_column.ordinality)
      from pg_catalog.unnest(constraint_record.confkey)
        with ordinality as key_column(attnum, ordinality)
      join pg_catalog.pg_attribute as attribute
        on attribute.attrelid = constraint_record.confrelid
       and attribute.attnum = key_column.attnum
    ), array[]::text[]) as referenced_columns,
    case when constraint_record.contype = 'f'
      then constraint_record.confdeltype::text
      else null
    end as delete_action,
    constraint_record.convalidated,
    constraint_record.condeferrable,
    constraint_record.condeferred,
    constraint_record.connoinherit,
    pg_catalog.obj_description(
      constraint_record.oid, 'pg_constraint'
    ) as installed_contract,
    'kgeo-exact-constraint-sha256:' || pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_constraintdef(constraint_record.oid, false), 'UTF8'
      )),
      'hex'
    ) as current_contract
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.conrelid = pg_catalog.to_regclass(
    'public.student_achievement_documents'
  )
)
select 'ACHIEVEMENT_DOCUMENT_CONSTRAINTS_EXACT' as check_name,
  coalesce((select pg_catalog.count(*) = 15 from actual), false)
  and not exists (
    select 1 from expected
    full join actual using (name)
    where expected.name is null
      or actual.name is null
      or actual.constraint_type is distinct from expected.constraint_type
      or actual.local_columns is distinct from
        coalesce(expected.local_columns, array[]::text[])
      or actual.referenced_relation is distinct from expected.referenced_relation
      or actual.referenced_columns is distinct from
        coalesce(expected.referenced_columns, array[]::text[])
      or actual.delete_action is distinct from expected.delete_action
      or actual.convalidated is not true
      or actual.condeferrable is not false
      or actual.condeferred is not false
      or actual.connoinherit is not false
      or actual.installed_contract is distinct from actual.current_contract
  ) as passed;

with required(trigger_name, relation_name, function_signature, trigger_type) as (
  values
    ('student_achievement_documents_enforce_owner',
      'public.student_achievement_documents',
      'private.enforce_student_achievement_document_owner()', 23::smallint),
    ('student_achievements_protect_active_evidence',
      'public.student_achievements',
      'private.protect_achievement_with_active_evidence()', 11::smallint)
), actual as (
  select trigger_record.tgname::text as trigger_name,
    trigger_record.tgrelid,
    trigger_record.tgfoid,
    trigger_record.tgtype,
    trigger_record.tgenabled,
    trigger_record.tgisinternal,
    trigger_record.tgconstraint,
    trigger_record.tgdeferrable,
    trigger_record.tginitdeferred,
    trigger_record.tgnargs,
    trigger_record.tgattr,
    trigger_record.tgoldtable,
    trigger_record.tgnewtable,
    trigger_record.tgqual,
    pg_catalog.obj_description(trigger_record.oid, 'pg_trigger') as installed_contract,
    'kgeo-exact-trigger-sha256:' || pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_triggerdef(trigger_record.oid, false), 'UTF8'
      )),
      'hex'
    ) as current_contract
  from pg_catalog.pg_trigger as trigger_record
  where not trigger_record.tgisinternal
    and (
      trigger_record.tgname in (
        'student_achievement_documents_enforce_owner',
        'student_achievements_protect_active_evidence'
      )
      or trigger_record.tgfoid in (
        pg_catalog.to_regprocedure(
          'private.enforce_student_achievement_document_owner()'
        ),
        pg_catalog.to_regprocedure(
          'private.protect_achievement_with_active_evidence()'
        )
      )
    )
)
select 'ACHIEVEMENT_EVIDENCE_TRIGGERS_EXACT' as check_name,
  coalesce((select pg_catalog.count(*) = 2 from actual), false)
  and not exists (
    select 1 from required
    full join actual using (trigger_name)
    where required.trigger_name is null
      or actual.trigger_name is null
      or actual.tgrelid is distinct from
        pg_catalog.to_regclass(required.relation_name)
      or actual.tgfoid is distinct from
        pg_catalog.to_regprocedure(required.function_signature)
      or actual.tgtype is distinct from required.trigger_type
      or actual.tgenabled is distinct from 'O'
      or actual.tgisinternal is not false
      or actual.tgconstraint <> 0
      or actual.tgdeferrable is not false
      or actual.tginitdeferred is not false
      or actual.tgnargs <> 0
      or actual.tgattr::text <> ''
      or actual.tgoldtable is not null
      or actual.tgnewtable is not null
      or actual.tgqual is not null
      or actual.installed_contract is distinct from actual.current_contract
  ) as passed;

with expected(name, is_unique, is_primary) as (
  values
    ('student_achievement_documents_achievement_available_idx', false, false),
    ('student_achievement_documents_pending_expiry_idx', false, false),
    ('student_achievement_documents_pkey', true, true),
    ('student_achievement_documents_storage_path_key', true, false),
    ('student_achievement_documents_student_available_idx', false, false)
), actual as (
  select index_class.relname::text as name,
    index_record.indisunique as is_unique,
    index_record.indisprimary as is_primary,
    index_record.indisvalid,
    index_record.indisready,
    index_record.indislive,
    index_record.indisexclusion,
    index_record.indimmediate,
    index_record.indisclustered,
    index_record.indisreplident,
    pg_catalog.obj_description(index_record.indexrelid, 'pg_class') as installed_contract,
    'kgeo-exact-index-sha256:' || pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_indexdef(index_record.indexrelid), 'UTF8'
      )),
      'hex'
    ) as current_contract
  from pg_catalog.pg_index as index_record
  join pg_catalog.pg_class as index_class
    on index_class.oid = index_record.indexrelid
  where index_record.indrelid = pg_catalog.to_regclass(
    'public.student_achievement_documents'
  )
)
select 'ACHIEVEMENT_DOCUMENT_INDEXES_EXACT' as check_name,
  coalesce((select pg_catalog.count(*) = 5 from actual), false)
  and not exists (
    select 1 from expected
    full join actual using (name)
    where expected.name is null
      or actual.name is null
      or actual.is_unique is distinct from expected.is_unique
      or actual.is_primary is distinct from expected.is_primary
      or actual.indisvalid is not true
      or actual.indisready is not true
      or actual.indislive is not true
      or actual.indisexclusion is not false
      or actual.indimmediate is not true
      or actual.indisclustered is not false
      or actual.indisreplident is not false
      or actual.installed_contract is distinct from actual.current_contract
  ) as passed;

select 'PRIVATE_ACHIEVEMENT_BUCKET_EXACT' as check_name,
  coalesce((
    select pg_catalog.count(*) = 1
      and pg_catalog.bool_and(bucket.public is false)
      and pg_catalog.bool_and(bucket.file_size_limit = 10485760)
      and pg_catalog.bool_and(
        bucket.allowed_mime_types =
          array['application/pdf', 'image/jpeg', 'image/png']::text[]
      )
    from storage.buckets as bucket
    where bucket.id = 'student-achievement-documents'
      and bucket.name = 'student-achievement-documents'
  ), false) as passed;

with required(signature, volatility, acl_kind) as (
  values
    ('public.prepare_student_achievement_document_upload(uuid,uuid,text,text,bigint)', 'v', 'service_role'),
    ('public.authorize_student_achievement_document_validation(uuid)', 's', 'authenticated'),
    ('public.record_student_achievement_document_signature_validation(uuid,uuid,text,bigint)', 'v', 'service_role'),
    ('public.reject_student_achievement_document_signature(uuid,uuid)', 'v', 'service_role'),
    ('public.finalize_student_achievement_document_upload(uuid)', 'v', 'authenticated'),
    ('public.list_my_student_achievement_documents()', 's', 'authenticated'),
    ('public.list_primary_counselor_student_achievement_documents(uuid)', 's', 'authenticated'),
    ('public.authorize_student_achievement_document_view(uuid,uuid,uuid)', 's', 'authenticated'),
    ('public.authorize_student_achievement_document_delete(uuid,public.student_achievement_document_status)', 'v', 'authenticated'),
    ('public.finalize_student_achievement_document_delete(uuid)', 'v', 'authenticated'),
    ('public.can_upload_student_achievement_document_object(text,text)', 'v', 'authenticated'),
    ('public.can_view_student_achievement_document_object(text,text)', 's', 'authenticated'),
    ('public.can_delete_student_achievement_document_object(text,text)', 's', 'authenticated'),
    ('private.enforce_student_achievement_document_owner()', 'v', 'private'),
    ('private.protect_achievement_with_active_evidence()', 'v', 'private')
), metadata as (
  select required.*,
    pg_catalog.to_regprocedure(required.signature) as procedure_oid,
    procedure_record.prosecdef,
    procedure_record.provolatile,
    procedure_record.proowner,
    procedure_record.proconfig,
    procedure_record.proacl
  from required
  left join pg_catalog.pg_proc as procedure_record
    on procedure_record.oid = pg_catalog.to_regprocedure(required.signature)
)
select 'ACHIEVEMENT_EVIDENCE_FUNCTION_METADATA_AND_ACLS_EXACT' as check_name,
  coalesce((
    select pg_catalog.count(*) = 15
      and pg_catalog.bool_and(procedure_oid is not null)
      and pg_catalog.bool_and(prosecdef)
      and pg_catalog.bool_and(provolatile = volatility)
      and pg_catalog.bool_and(proowner = (
        select role.oid from pg_catalog.pg_roles as role
        where role.rolname = 'postgres'
      ))
      and pg_catalog.bool_and(proconfig in (
        array['search_path=']::text[], array['search_path=""']::text[]
      ))
      and pg_catalog.bool_and(
        pg_catalog.has_function_privilege(
          'authenticated', procedure_oid, 'EXECUTE'
        ) = (acl_kind = 'authenticated')
      )
      and pg_catalog.bool_and(
        pg_catalog.has_function_privilege(
          'service_role', procedure_oid, 'EXECUTE'
        ) = (acl_kind = 'service_role')
      )
      and pg_catalog.bool_and(not pg_catalog.has_function_privilege(
        'anon', procedure_oid, 'EXECUTE'
      ))
      and pg_catalog.bool_and(not exists (
        select 1
        from pg_catalog.aclexplode(
          coalesce(proacl, pg_catalog.acldefault('f', proowner))
        ) as acl
        where acl.privilege_type = 'EXECUTE'
          and acl.grantee <> proowner
          and not (
            acl_kind = 'authenticated'
            and acl.grantee = (
              select role.oid from pg_catalog.pg_roles as role
              where role.rolname = 'authenticated'
            )
          )
          and not (
            acl_kind = 'service_role'
            and acl.grantee = (
              select role.oid from pg_catalog.pg_roles as role
              where role.rolname = 'service_role'
            )
          )
      ))
    from metadata
  ), false)
  and coalesce((
    select pg_catalog.count(*) = 15
    from pg_catalog.pg_proc as procedure_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where (namespace_record.nspname, procedure_record.proname) in (
      ('public', 'prepare_student_achievement_document_upload'),
      ('public', 'authorize_student_achievement_document_validation'),
      ('public', 'record_student_achievement_document_signature_validation'),
      ('public', 'reject_student_achievement_document_signature'),
      ('public', 'finalize_student_achievement_document_upload'),
      ('public', 'list_my_student_achievement_documents'),
      ('public', 'list_primary_counselor_student_achievement_documents'),
      ('public', 'authorize_student_achievement_document_view'),
      ('public', 'authorize_student_achievement_document_delete'),
      ('public', 'finalize_student_achievement_document_delete'),
      ('public', 'can_upload_student_achievement_document_object'),
      ('public', 'can_view_student_achievement_document_object'),
      ('public', 'can_delete_student_achievement_document_object'),
      ('private', 'enforce_student_achievement_document_owner'),
      ('private', 'protect_achievement_with_active_evidence')
    )
  ), false)
  and not exists (
    select 1
    from pg_catalog.pg_proc as procedure_record
    join pg_catalog.pg_namespace as namespace_record
      on namespace_record.oid = procedure_record.pronamespace
    where namespace_record.nspname in ('public', 'private')
      and procedure_record.prokind = 'f'
      and (
        procedure_record.proname::text like '%student_achievement_document%'
        or pg_catalog.lower(pg_catalog.pg_get_functiondef(
          procedure_record.oid
        )) like '%student_achievement_documents%'
      )
      and (namespace_record.nspname, procedure_record.proname) not in (
        ('public', 'prepare_student_achievement_document_upload'),
        ('public', 'authorize_student_achievement_document_validation'),
        ('public', 'record_student_achievement_document_signature_validation'),
        ('public', 'reject_student_achievement_document_signature'),
        ('public', 'finalize_student_achievement_document_upload'),
        ('public', 'list_my_student_achievement_documents'),
        ('public', 'list_primary_counselor_student_achievement_documents'),
        ('public', 'authorize_student_achievement_document_view'),
        ('public', 'authorize_student_achievement_document_delete'),
        ('public', 'finalize_student_achievement_document_delete'),
        ('public', 'can_upload_student_achievement_document_object'),
        ('public', 'can_view_student_achievement_document_object'),
        ('public', 'can_delete_student_achievement_document_object'),
        ('private', 'enforce_student_achievement_document_owner'),
        ('private', 'protect_achievement_with_active_evidence')
      )
  ) as passed;

with bodies(signature, body) as (
  select expected.signature,
    case
      when pg_catalog.to_regprocedure(expected.signature) is null then null
      else pg_catalog.lower(pg_catalog.pg_get_functiondef(
        pg_catalog.to_regprocedure(expected.signature)
      ))
    end as body
  from (values
    ('public.prepare_student_achievement_document_upload(uuid,uuid,text,text,bigint)'),
    ('public.authorize_student_achievement_document_validation(uuid)'),
    ('public.record_student_achievement_document_signature_validation(uuid,uuid,text,bigint)'),
    ('public.reject_student_achievement_document_signature(uuid,uuid)'),
    ('public.finalize_student_achievement_document_upload(uuid)'),
    ('public.authorize_student_achievement_document_delete(uuid,public.student_achievement_document_status)'),
    ('public.finalize_student_achievement_document_delete(uuid)'),
    ('public.can_upload_student_achievement_document_object(text,text)'),
    ('public.can_view_student_achievement_document_object(text,text)'),
    ('public.can_delete_student_achievement_document_object(text,text)'),
    ('private.protect_achievement_with_active_evidence()')
  ) as expected(signature)
)
select 'ACHIEVEMENT_EVIDENCE_FUNCTION_BODIES_FAIL_CLOSED' as check_name,
  coalesce((select body like '%achievement.student_id = p_student_id%'
    and body like '%auth.users%'
    and body like '%profile.role = ''student''%'
    and body like '%auth_user.email_confirmed_at is not null%'
    and body like '%v_storage_path := pg_catalog.concat%'
    from bodies where signature like 'public.prepare%'), false)
  and coalesce((select body like '%document.student_id = v_caller_id%'
    and body like '%document.status = ''pending''%'
    and body like '%upload_expires_at > pg_catalog.statement_timestamp()%'
    from bodies where signature like 'public.authorize_student%validation%'), false)
  and coalesce((select body like '%p_detected_mime_type <> v_document.mime_type%'
    and body like '%storage_object.owner_id%'
    and body like '%signature_validated_at%'
    from bodies where signature like 'public.record_student%'), false)
  and coalesce((select body like '%''invalid_file''%'
    and body like '%set status = ''removal_pending''%'
    and body not like '%set status =%''removed''%'
    from bodies where signature like 'public.reject_student%'), false)
  and coalesce((select body like '%detected_mime_type is distinct from v_document.mime_type%'
    and body like '%signature_validated_at is null%'
    and body like '%storage_object.owner_id%'
    from bodies where signature like 'public.finalize_student%upload%'), false)
  and coalesce((select body like '%document.student_id = v_caller_id%'
    and body like '%v_object_exists := exists%'
    and body like '%''pending_cancel''%'
    and body like '%document.status = p_expected_status%'
    and body like '%set status = ''removal_pending''%'
    and body not like '%set status =%''removed''%'
    from bodies where signature like 'public.authorize_student%delete%'), false)
  and coalesce((select body like '%storage.objects%'
    and body like '%status = ''removed''%'
    from bodies where signature like 'public.finalize_student%delete%'), false)
  and coalesce((select pg_catalog.bool_and(
      (
        body like '%p_bucket_id = ''student-achievement-documents''%'
        or body like '%p_bucket_id <> ''student-achievement-documents''%'
      )
      and body like '%auth.uid()%'
      and body like '%student_achievement_documents%'
    ) from bodies where signature like 'public.can_%'), false)
  and coalesce((select body like '%is_active_primary_counselor_for_student%'
    from bodies where signature like 'public.can_view%'), false)
  and coalesce((select body like '%for update of document%'
    and body like '%document.status = ''pending''%'
    from bodies where signature like 'public.can_upload%'), false)
  and coalesce((select body like '%document.status =%removal_pending%'
    and body like '%document.removal_requested_at >%interval ''5 minutes''%'
    from bodies where signature like 'public.can_delete%'), false)
  and coalesce((select body like '%''pending''%'
    and body like '%''available''%'
    and body like '%''removal_pending''%'
    from bodies where signature like 'private.protect%'), false) as passed;

with approved(
  name, command, role_kind, using_expression, check_expression,
  using_sha256_override, check_sha256_override
) as (
  values
    ('progression_evidence_object_insert_counselor', 'a', 'authenticated',
      null,
      '((bucket_id = ''counseling-progression-evidence''::text) AND ( SELECT public.has_active_verified_kgeo_role(''counselor''::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = ''pending''::public.counseling_progression_evidence_status) AND (evidence.uploaded_by = ( SELECT auth.uid() AS uid)) AND (evidence.upload_expires_at > statement_timestamp())))))',
      null, null),
    ('progression_evidence_object_select_counselor', 'r', 'authenticated',
      '((bucket_id = ''counseling-progression-evidence''::text) AND ( SELECT public.has_active_verified_kgeo_role(''counselor''::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM (public.student_counseling_progression_evidence evidence JOIN public.student_counseling_progression_events event ON ((event.id = evidence.progression_event_id))) WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = ''available''::public.counseling_progression_evidence_status) AND (public.is_active_primary_counselor_for_student(event.student_id) IS TRUE)))))',
      null, null, null),
    ('students upload own marksheets', 'a', 'public', null, null, null,
      '8341117815b25e65a2b904aeb6b00b4b4f1934e0e5a7ba3b171fbff371f53d35'),
    ('students read own marksheets', 'r', 'public', null, null,
      '8341117815b25e65a2b904aeb6b00b4b4f1934e0e5a7ba3b171fbff371f53d35', null),
    ('university_application_document_object_insert_counselor', 'a', 'authenticated',
      null,
      '((bucket_id = ''university-application-documents''::text) AND ( SELECT public.can_upload_university_application_document_object(objects.bucket_id, objects.name) AS can_upload_university_application_document_object))',
      null, null),
    ('university_application_document_object_select_counselor', 'r', 'authenticated',
      '((bucket_id = ''university-application-documents''::text) AND ( SELECT public.can_view_university_application_document_object(objects.bucket_id, objects.name) AS can_view_university_application_document_object))',
      null, null, null),
    ('student_profile_document_object_insert_student', 'a', 'authenticated',
      null,
      '((bucket_id = ''student-profile-documents''::text) AND ( SELECT public.can_upload_student_profile_document_object(objects.bucket_id, objects.name) AS can_upload_student_profile_document_object))',
      null, null),
    ('student_profile_document_object_select_authorized', 'r', 'authenticated',
      '((bucket_id = ''student-profile-documents''::text) AND ( SELECT public.can_view_student_profile_document_object(objects.bucket_id, objects.name) AS can_view_student_profile_document_object))',
      null, null, null),
    ('student_profile_document_object_delete_student', 'd', 'authenticated',
      '((bucket_id = ''student-profile-documents''::text) AND ( SELECT public.can_delete_student_profile_document_object(objects.bucket_id, objects.name) AS can_delete_student_profile_document_object))',
      null, null, null),
    ('parent_report_attachment_object_insert_staff', 'a', 'authenticated',
      null,
      '((bucket_id = ''parent-report-attachments''::text) AND public.can_upload_parent_report_object(objects.bucket_id, objects.name))',
      null, null),
    ('parent_report_attachment_object_select_staff', 'r', 'authenticated',
      '((bucket_id = ''parent-report-attachments''::text) AND public.can_view_parent_report_object(objects.bucket_id, objects.name))',
      null, null, null),
    ('parent_report_attachment_object_delete_staff', 'd', 'authenticated',
      '((bucket_id = ''parent-report-attachments''::text) AND public.can_delete_parent_report_object(objects.bucket_id, objects.name))',
      null, null, null),
    ('student_achievement_document_object_insert_student', 'a', 'authenticated',
      null,
      '((bucket_id = ''student-achievement-documents''::text) AND ( SELECT public.can_upload_student_achievement_document_object(objects.bucket_id, objects.name) AS can_upload_student_achievement_document_object))',
      null, null),
    ('student_achievement_document_object_select_authorized', 'r', 'authenticated',
      '((bucket_id = ''student-achievement-documents''::text) AND ( SELECT public.can_view_student_achievement_document_object(objects.bucket_id, objects.name) AS can_view_student_achievement_document_object))',
      null, null, null),
    ('student_achievement_document_object_delete_student', 'd', 'authenticated',
      '((bucket_id = ''student-achievement-documents''::text) AND ( SELECT public.can_delete_student_achievement_document_object(objects.bucket_id, objects.name) AS can_delete_student_achievement_document_object))',
      null, null, null)
), expected as (
  select approved.*,
    case approved.role_kind
      when 'public' then array[0::oid]
      else array[(select role.oid from pg_catalog.pg_roles as role
        where role.rolname = 'authenticated')]::oid[]
    end as roles,
    coalesce(approved.using_sha256_override,
      case when approved.using_expression is null then null else
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          approved.using_expression, 'UTF8')), 'hex') end
    ) as using_sha256,
    coalesce(approved.check_sha256_override,
      case when approved.check_expression is null then null else
        pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(
          approved.check_expression, 'UTF8')), 'hex') end
    ) as check_sha256
  from approved
), actual as (
  select policy.polname::text as name,
    policy.polcmd::text as command,
    policy.polpermissive,
    policy.polroles as roles,
    case when policy.polqual is null then null else pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.regexp_replace(pg_catalog.btrim(
          pg_catalog.pg_get_expr(policy.polqual, policy.polrelid, false)
        ), '[[:space:]]+', ' ', 'g'),
        'UTF8'
      )), 'hex'
    ) end as using_sha256,
    case when policy.polwithcheck is null then null else pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.regexp_replace(pg_catalog.btrim(
          pg_catalog.pg_get_expr(policy.polwithcheck, policy.polrelid, false)
        ), '[[:space:]]+', ' ', 'g'),
        'UTF8'
      )), 'hex'
    ) end as check_sha256
  from pg_catalog.pg_policy as policy
  where policy.polrelid = pg_catalog.to_regclass('storage.objects')
)
select 'COMPLETE_STORAGE_OBJECTS_POLICY_INVENTORY_EXACT' as check_name,
  coalesce((select pg_catalog.count(*) = 15 from actual), false)
  and not exists (
    select 1 from expected
    full join actual using (name)
    where expected.name is null
      or actual.name is null
      or actual.command is distinct from expected.command
      or actual.polpermissive is not true
      or actual.roles is distinct from expected.roles
      or actual.using_sha256 is distinct from expected.using_sha256
      or actual.check_sha256 is distinct from expected.check_sha256
  ) as passed;

select 'ACHIEVEMENT_EVIDENCE_STORAGE_POLICY_SHAPE_EXACT' as check_name,
  coalesce((
    select pg_catalog.count(*) = 3
      and pg_catalog.array_agg(policy.polcmd::text order by policy.polcmd::text)
        = array['a', 'd', 'r']::text[]
      and pg_catalog.bool_and(policy.polpermissive)
      and pg_catalog.bool_and(policy.polroles = array[(
        select role.oid from pg_catalog.pg_roles as role
        where role.rolname = 'authenticated'
      )]::oid[])
    from pg_catalog.pg_policy as policy
    where policy.polrelid = pg_catalog.to_regclass('storage.objects')
      and policy.polname::text like 'student_achievement_document_object_%'
  ), false) as passed;

select 'NO_OTHER_DOCUMENT_SYSTEM_LINKAGE' as check_name,
  coalesce((
    select pg_catalog.count(*) = 0
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid = pg_catalog.to_regclass(
      'public.student_achievement_documents'
    )
      and constraint_record.confrelid = any(array[
        pg_catalog.to_regclass('public.student_profile_documents'),
        pg_catalog.to_regclass('public.student_university_application_documents'),
        pg_catalog.to_regclass('public.student_counseling_progression_evidence'),
        pg_catalog.to_regclass('public.parent_report_attachments')
      ]::oid[])
  ), false) as passed;

rollback;
