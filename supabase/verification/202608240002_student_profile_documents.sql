-- Read-only post-install verification for K-GEO Student Profile Documents.

begin transaction read only;
set local search_path = '';

with checks as (
  select
    'PROFILE_DOCUMENT_TYPES'::text as check_name,
    coalesce((
      select pg_catalog.array_agg(
        enum_label.enumlabel::text order by enum_label.enumsortorder
      )
      from pg_catalog.pg_enum as enum_label
      where enum_label.enumtypid =
        'public.student_profile_document_type'::pg_catalog.regtype
    ), array[]::text[]) = array[
      'passport', 'academic_transcript', 'test_score', 'sop', 'lor',
      'financial_document', 'other_supporting_document'
    ]::text[] as passed
  union all
  select 'PROFILE_DOCUMENT_STATUSES', coalesce((
    select pg_catalog.array_agg(
      enum_label.enumlabel::text order by enum_label.enumsortorder
    )
    from pg_catalog.pg_enum as enum_label
    where enum_label.enumtypid =
      'public.student_profile_document_status'::pg_catalog.regtype
  ), array[]::text[]) = array['pending', 'available', 'removed']::text[]
  union all
  select 'SEALED_PROFILE_DOCUMENT_TABLE',
    relation.relrowsecurity
    and relation.relforcerowsecurity
    and owner_role.rolname = 'postgres'
    and not pg_catalog.has_table_privilege(
      'authenticated', relation.oid, 'SELECT,INSERT,UPDATE,DELETE'
    )
    and not pg_catalog.has_table_privilege(
      'anon', relation.oid, 'SELECT,INSERT,UPDATE,DELETE'
    )
  from pg_catalog.pg_class as relation
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  join pg_catalog.pg_roles as owner_role
    on owner_role.oid = relation.relowner
  where namespace.nspname = 'public'
    and relation.relname = 'student_profile_documents'
  union all
  select 'PRIVATE_BUCKET_EXACT', exists (
    select 1 from storage.buckets as bucket
    where bucket.id = 'student-profile-documents'
      and bucket.name = 'student-profile-documents'
      and bucket.public is false
      and bucket.file_size_limit = 10485760
      and bucket.allowed_mime_types =
        array['application/pdf', 'image/jpeg', 'image/png']::text[]
  )
  union all
  select 'RPC_METADATA_EXACT', pg_catalog.count(*) = 10
  from pg_catalog.pg_proc as procedure
  join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname::text = any(array[
      'prepare_student_profile_document_upload',
      'finalize_student_profile_document_upload',
      'list_my_student_profile_documents',
      'list_primary_counselor_student_profile_documents',
      'authorize_student_profile_document_view',
      'authorize_student_profile_document_delete',
      'finalize_student_profile_document_delete',
      'can_upload_student_profile_document_object',
      'can_view_student_profile_document_object',
      'can_delete_student_profile_document_object'
    ]::text[])
    and procedure.prosecdef
    and procedure.proconfig in (
      array['search_path=']::text[],
      array['search_path=""']::text[]
    )
    and owner_role.rolname = 'postgres'
    and pg_catalog.has_function_privilege(
      'authenticated', procedure.oid, 'EXECUTE'
    )
    and not pg_catalog.has_function_privilege('anon', procedure.oid, 'EXECUTE')
  union all
  select 'STORAGE_POLICY_INVENTORY_EXACT',
    pg_catalog.count(*) = 3
    and pg_catalog.bool_and(policy.polpermissive)
    and pg_catalog.bool_and(policy.polroles = array[
      (select role.oid from pg_catalog.pg_roles as role
       where role.rolname = 'authenticated')
    ]::oid[])
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'storage.objects'::pg_catalog.regclass
    and policy.polname::text = any(array[
      'student_profile_document_object_insert_student',
      'student_profile_document_object_select_authorized',
      'student_profile_document_object_delete_student'
    ]::text[])
  union all
  select 'STORAGE_COMMANDS_EXACT',
    pg_catalog.count(*) = 3
    and pg_catalog.count(*) filter (where policy.polcmd = 'a') = 1
    and pg_catalog.count(*) filter (where policy.polcmd = 'r') = 1
    and pg_catalog.count(*) filter (where policy.polcmd = 'd') = 1
  from pg_catalog.pg_policy as policy
  where policy.polrelid = 'storage.objects'::pg_catalog.regclass
    and policy.polname::text = any(array[
      'student_profile_document_object_insert_student',
      'student_profile_document_object_select_authorized',
      'student_profile_document_object_delete_student'
    ]::text[])
  union all
  select 'NO_DIRECTOR_PROFILE_DOCUMENT_POLICY', not exists (
    select 1 from pg_catalog.pg_policy as policy
    where policy.polrelid = 'public.student_profile_documents'::pg_catalog.regclass
  )
  union all
  select 'DOCUMENT_SYSTEMS_SEPARATE',
    pg_catalog.to_regclass('public.student_counseling_progression_evidence')
      is not null
    and pg_catalog.to_regclass('public.student_university_application_documents')
      is not null
    and exists (
      select 1 from storage.buckets as bucket
      where bucket.id = 'counseling-progression-evidence'
    )
    and exists (
      select 1 from storage.buckets as bucket
      where bucket.id = 'university-application-documents'
    )
)
select check_name, passed
from checks
order by check_name;

rollback;
