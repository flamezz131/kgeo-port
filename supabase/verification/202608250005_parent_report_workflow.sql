-- K-GEO Parent Report Workflow V1 live verification.
-- Strictly read-only: returns one boolean row per reviewed contract.

begin transaction read only;

select 'SEALED_RELATIONS_EXACT' as check_name,
  coalesce((
    select pg_catalog.bool_and(
      relation.relrowsecurity
      and relation.relforcerowsecurity
      and relation.relowner = (
        select role.oid from pg_catalog.pg_roles as role
        where role.rolname = 'postgres'
      )
      and not pg_catalog.has_table_privilege('authenticated', relation.oid, 'SELECT,INSERT,UPDATE,DELETE')
      and not pg_catalog.has_table_privilege('service_role', relation.oid, 'SELECT,INSERT,UPDATE,DELETE')
    ) and pg_catalog.count(*) = 3
    from pg_catalog.pg_class as relation
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'parent_reports', 'parent_report_events', 'parent_report_attachments'
      )
  ), false) as passed
union all
select 'NO_BROWSER_TABLE_POLICIES', coalesce((
  select pg_catalog.count(*) = 0
  from pg_catalog.pg_policies as policy
  where policy.schemaname = 'public'
    and policy.tablename in (
      'parent_reports', 'parent_report_events', 'parent_report_attachments'
    )
), false)
union all
select 'PRIVATE_BUCKET_EXACT', coalesce((
  select pg_catalog.count(*) = 1
    and pg_catalog.bool_and(
      bucket.public is false
      and bucket.file_size_limit = 52428800
      and bucket.allowed_mime_types =
        array['application/pdf', 'image/jpeg', 'image/png']::text[]
    )
  from storage.buckets as bucket
  where bucket.id = 'parent-report-attachments'
), false)
union all
select 'WORKFLOW_FUNCTIONS_INSTALLED', coalesce((
  with expected(function_name, signature, expected_volatility) as (
    values
      ('create_parent_report_draft',
        'public.create_parent_report_draft(uuid,text)', 'v'),
      ('list_counselor_parent_reports',
        'public.list_counselor_parent_reports(uuid,integer)', 's'),
      ('list_director_parent_reports',
        'public.list_director_parent_reports(integer)', 's'),
      ('get_parent_report_workspace',
        'public.get_parent_report_workspace(uuid)', 's'),
      ('get_parent_report_render_payload',
        'public.get_parent_report_render_payload(uuid)', 's'),
      ('save_counselor_parent_report_narrative',
        'public.save_counselor_parent_report_narrative(uuid,text,text,text,text,text)', 'v'),
      ('save_director_parent_report_narrative',
        'public.save_director_parent_report_narrative(uuid,text,text,text,text,text,text)', 'v'),
      ('submit_parent_report',
        'public.submit_parent_report(uuid)', 'v'),
      ('request_parent_report_revision',
        'public.request_parent_report_revision(uuid,text)', 'v'),
      ('approve_parent_report',
        'public.approve_parent_report(uuid)', 'v'),
      ('finalize_parent_report',
        'public.finalize_parent_report(uuid,bigint,text)', 'v'),
      ('authorize_parent_report_download',
        'public.authorize_parent_report_download(uuid)', 's'),
      ('list_parent_report_attachment_candidates',
        'public.list_parent_report_attachment_candidates(uuid)', 's'),
      ('add_parent_report_existing_attachment',
        'public.add_parent_report_existing_attachment(uuid,public.parent_report_attachment_source,uuid,text)', 'v'),
      ('prepare_parent_report_attachment_upload',
        'public.prepare_parent_report_attachment_upload(uuid,text,text,text,bigint)', 'v'),
      ('finalize_parent_report_attachment_upload',
        'public.finalize_parent_report_attachment_upload(uuid)', 'v'),
      ('remove_parent_report_attachment',
        'public.remove_parent_report_attachment(uuid)', 'v'),
      ('can_upload_parent_report_object',
        'public.can_upload_parent_report_object(text,text)', 's'),
      ('can_view_parent_report_object',
        'public.can_view_parent_report_object(text,text)', 's'),
      ('can_delete_parent_report_object',
        'public.can_delete_parent_report_object(text,text)', 's')
  ),
  resolved as (
    select expected.*,
      pg_catalog.to_regprocedure(expected.signature)::oid as function_oid
    from expected
  ),
  role_oids as (
    select
      (select role.oid from pg_catalog.pg_roles as role
        where role.rolname = 'postgres') as postgres_oid,
      (select role.oid from pg_catalog.pg_roles as role
        where role.rolname = 'authenticated') as authenticated_oid,
      (select role.oid from pg_catalog.pg_roles as role
        where role.rolname = 'anon') as anon_oid,
      (select role.oid from pg_catalog.pg_roles as role
        where role.rolname = 'service_role') as service_role_oid
  )
  select pg_catalog.count(*) = 20
    and pg_catalog.count(resolved.function_oid) = 20
    and pg_catalog.count(distinct resolved.function_oid) = 20
    and pg_catalog.bool_and(
      function.oid is not null
      and namespace.nspname = 'public'
      and function.proname = resolved.function_name
      and function.prosecdef
      and role_oids.postgres_oid is not null
      and role_oids.authenticated_oid is not null
      and role_oids.anon_oid is not null
      and role_oids.service_role_oid is not null
      and function.proowner = role_oids.postgres_oid
      and function.provolatile::text = resolved.expected_volatility
      and (
        select pg_catalog.count(*) = 1
          and pg_catalog.bool_and(
            option.option_name = 'search_path'
            and option.option_value in ('', '""')
          )
        from pg_catalog.pg_options_to_table(function.proconfig) as option
      ) is true
      and pg_catalog.has_function_privilege(
        role_oids.postgres_oid, function.oid, 'EXECUTE'
      )
      and pg_catalog.has_function_privilege(
        role_oids.authenticated_oid, function.oid, 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        role_oids.anon_oid, function.oid, 'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        role_oids.service_role_oid, function.oid, 'EXECUTE'
      )
      and exists (
        select 1
        from pg_catalog.aclexplode(coalesce(
          function.proacl,
          pg_catalog.acldefault('f', function.proowner)
        )) as privilege
        where privilege.grantee = role_oids.authenticated_oid
          and privilege.privilege_type = 'EXECUTE'
      )
      and not exists (
        select 1
        from pg_catalog.aclexplode(coalesce(
          function.proacl,
          pg_catalog.acldefault('f', function.proowner)
        )) as privilege
        where privilege.grantee = 0
          and privilege.privilege_type = 'EXECUTE'
      )
      and not exists (
        select 1
        from pg_catalog.aclexplode(coalesce(
          function.proacl,
          pg_catalog.acldefault('f', function.proowner)
        )) as privilege
        where privilege.privilege_type = 'EXECUTE'
          and coalesce(
            privilege.grantee = function.proowner
            or privilege.grantee = role_oids.authenticated_oid,
            false
          ) is false
      )
    )
    and not exists (
      select 1
      from pg_catalog.pg_proc as unexpected
      inner join pg_catalog.pg_namespace as unexpected_namespace
        on unexpected_namespace.oid = unexpected.pronamespace
      where unexpected_namespace.nspname = 'public'
        and unexpected.proname in (
          select expected.function_name from expected
        )
        and not exists (
          select 1 from resolved as approved
          where approved.function_oid = unexpected.oid
        )
    )
  from resolved
  left join pg_catalog.pg_proc as function
    on function.oid = resolved.function_oid
  left join pg_catalog.pg_namespace as namespace
    on namespace.oid = function.pronamespace
  cross join role_oids
), false)
union all
select 'STORAGE_POLICIES_EXACT', coalesce((
  select pg_catalog.count(*) = 3
    and pg_catalog.bool_and(
      policy.permissive = 'PERMISSIVE'
      and policy.roles = array['authenticated']::name[]
      and (
        (policy.policyname = 'parent_report_attachment_object_insert_staff'
          and policy.cmd = 'INSERT'
          and policy.qual is null
          and policy.with_check like '%can_upload_parent_report_object%')
        or
        (policy.policyname = 'parent_report_attachment_object_select_staff'
          and policy.cmd = 'SELECT'
          and policy.qual like '%can_view_parent_report_object%'
          and policy.with_check is null)
        or
        (policy.policyname = 'parent_report_attachment_object_delete_staff'
          and policy.cmd = 'DELETE'
          and policy.qual like '%can_delete_parent_report_object%'
          and policy.with_check is null)
      )
    )
  from pg_catalog.pg_policies as policy
  where policy.schemaname = 'storage'
    and policy.tablename = 'objects'
    and policy.policyname like 'parent_report_attachment_object_%_staff'
), false)
union all
select 'SOURCE_BUILDER_EXCLUDES_PRIVATE_RECORDS', coalesce((
  select pg_catalog.count(*) = 1
    and pg_catalog.bool_and(
      pg_catalog.lower(pg_catalog.pg_get_functiondef(function.oid))
        not like '%counselor_student_notes%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(function.oid))
        not like '%counselor_follow_ups%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(function.oid))
        like '%student_profiles%'
      and pg_catalog.lower(pg_catalog.pg_get_functiondef(function.oid))
        like '%student_university_applications%'
    )
  from pg_catalog.pg_proc as function
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = function.pronamespace
  where namespace.nspname = 'private'
    and function.proname = 'build_parent_report_source_snapshot'
), false)
union all
select 'AVAILABLE_REPORT_UPLOADS_HAVE_EXACT_STORAGE_METADATA', not exists (
  select 1
  from public.parent_report_attachments as attachment
  where attachment.source_type =
      'report_upload'::public.parent_report_attachment_source
    and attachment.status =
      'available'::public.parent_report_attachment_status
    and not exists (
      select 1
      from storage.objects as storage_object
      where storage_object.bucket_id = attachment.bucket_id
        and storage_object.name = attachment.storage_path
        and case
          when coalesce(storage_object.metadata ->> 'size', '') ~ '^[0-9]+$'
            then (storage_object.metadata ->> 'size')::bigint
          else null
        end = attachment.file_size_bytes
        and case
          when coalesce(storage_object.metadata ->> 'size', '') ~ '^[0-9]+$'
            then (storage_object.metadata ->> 'size')::bigint
          else null
        end between 1 and 10485760
        and pg_catalog.lower(storage_object.metadata ->> 'mimetype') =
          attachment.mime_type
        and pg_catalog.lower(storage_object.metadata ->> 'mimetype') in (
          'application/pdf', 'image/jpeg', 'image/png'
        )
    )
)
union all
select 'FINALIZED_REPORTS_ARE_COMPLETE', not exists (
  select 1 from public.parent_reports as report
  where report.status = 'finalized'::public.parent_report_status
    and (
      report.final_pdf_bucket_id <> 'parent-report-attachments'
      or report.final_pdf_storage_path is null
      or report.final_pdf_size_bytes not between 1 and 52428800
      or report.final_pdf_sha256 !~ '^[0-9a-f]{64}$'
      or not exists (
        select 1 from storage.objects as storage_object
        where storage_object.bucket_id = report.final_pdf_bucket_id
          and storage_object.name = report.final_pdf_storage_path
          and case
            when coalesce(storage_object.metadata ->> 'size', '') ~ '^[0-9]+$'
              then (storage_object.metadata ->> 'size')::bigint
            else null
          end = report.final_pdf_size_bytes
          and pg_catalog.lower(storage_object.metadata ->> 'mimetype') =
            'application/pdf'
      )
    )
)
order by check_name;

rollback;
