-- K-GEO Student Profile Documents.
-- General reusable Student documents remain separate from progression evidence
-- and university-application documents.

begin;

set local search_path = '';

create type public.student_profile_document_type as enum (
  'passport',
  'academic_transcript',
  'test_score',
  'sop',
  'lor',
  'financial_document',
  'other_supporting_document'
);

create type public.student_profile_document_status as enum (
  'pending',
  'available',
  'removed'
);

create table public.student_profile_documents (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  student_id uuid not null
    references public.profiles(id) on delete restrict,
  document_type public.student_profile_document_type not null,
  display_name text not null,
  original_file_name text not null,
  bucket_id text not null default 'student-profile-documents',
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint not null,
  status public.student_profile_document_status not null default 'pending',
  uploaded_by uuid not null
    references public.profiles(id) on delete restrict,
  prepared_at timestamptz not null default pg_catalog.statement_timestamp(),
  upload_expires_at timestamptz not null,
  available_at timestamptz,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint student_profile_documents_display_name_check check (
    pg_catalog.char_length(display_name) between 2 and 100
    and display_name = pg_catalog.regexp_replace(
      pg_catalog.btrim(display_name), '[[:space:]]+', ' ', 'g'
    )
    and display_name !~ '[[:cntrl:]]'
    and display_name !~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
  ),
  constraint student_profile_documents_original_file_name_check check (
    pg_catalog.char_length(original_file_name) between 1 and 255
    and original_file_name = pg_catalog.btrim(original_file_name)
    and original_file_name !~ '[/\\]'
    and original_file_name !~ '[[:cntrl:]]'
    and original_file_name !~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
  ),
  constraint student_profile_documents_bucket_check check (
    bucket_id = 'student-profile-documents'
  ),
  constraint student_profile_documents_mime_check check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint student_profile_documents_size_check check (
    file_size_bytes between 1 and 10485760
  ),
  constraint student_profile_documents_actor_check check (
    uploaded_by = student_id
    and (removed_by is null or removed_by = student_id)
  ),
  constraint student_profile_documents_expiry_check check (
    upload_expires_at > prepared_at
  ),
  constraint student_profile_documents_lifecycle_check check (
    (
      status = 'pending'::public.student_profile_document_status
      and available_at is null
      and removed_at is null
      and removed_by is null
    )
    or (
      status = 'available'::public.student_profile_document_status
      and available_at is not null
      and available_at >= prepared_at
      and removed_at is null
      and removed_by is null
    )
    or (
      status = 'removed'::public.student_profile_document_status
      and available_at is not null
      and removed_at is not null
      and removed_at >= available_at
      and removed_by = student_id
    )
  )
);

alter table public.student_profile_documents owner to postgres;
alter table public.student_profile_documents enable row level security;
alter table public.student_profile_documents force row level security;

create index student_profile_documents_student_available_idx
  on public.student_profile_documents (
    student_id,
    available_at desc,
    id desc
  )
  where status = 'available'::public.student_profile_document_status;

create index student_profile_documents_pending_expiry_idx
  on public.student_profile_documents (upload_expires_at, id)
  where status = 'pending'::public.student_profile_document_status;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'student-profile-documents',
  'student-profile-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do nothing;

do $bucket_contract$
begin
  if not exists (
    select 1
    from storage.buckets as bucket
    where bucket.id = 'student-profile-documents'
      and bucket.name = 'student-profile-documents'
      and bucket.public is false
      and bucket.file_size_limit = 10485760
      and bucket.allowed_mime_types =
        array['application/pdf', 'image/jpeg', 'image/png']::text[]
  ) then
    raise exception using
      errcode = '55000',
      message = 'Student Profile Document bucket does not match the reviewed contract';
  end if;
end;
$bucket_contract$;

create function public.prepare_student_profile_document_upload(
  p_document_type public.student_profile_document_type,
  p_display_name text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns table (
  document_id uuid,
  document_type public.student_profile_document_type,
  display_name text,
  original_file_name text,
  bucket_id text,
  storage_path text,
  mime_type text,
  file_size_bytes bigint,
  upload_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_document_id uuid;
  v_display_name text;
  v_original_file_name text;
  v_extension text;
  v_prepared_at timestamptz;
  v_upload_expires_at timestamptz;
  v_storage_path text;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Profile document upload could not be prepared.';
  end if;

  v_display_name := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_display_name), '[[:space:]]+', ' ', 'g'
    ),
    ''
  );
  v_original_file_name := nullif(pg_catalog.btrim(p_original_file_name), '');

  if p_document_type is null
    or v_display_name is null
    or pg_catalog.char_length(v_display_name) not between 2 and 100
    or v_display_name ~ '[[:cntrl:]]'
    or v_display_name ~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
    or v_original_file_name is null
    or pg_catalog.char_length(v_original_file_name) > 255
    or v_original_file_name ~ '[/\\]'
    or v_original_file_name ~ '[[:cntrl:]]'
    or v_original_file_name ~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
    or p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png')
    or p_file_size_bytes not between 1 and 10485760 then
    raise exception using
      errcode = '22023',
      message = 'Profile document upload could not be prepared.';
  end if;

  v_extension := pg_catalog.lower(
    pg_catalog.regexp_replace(v_original_file_name, '^.*[.]', '')
  );
  if v_extension = v_original_file_name
    or not (
      (p_mime_type = 'application/pdf' and v_extension = 'pdf')
      or (p_mime_type = 'image/jpeg' and v_extension in ('jpg', 'jpeg'))
      or (p_mime_type = 'image/png' and v_extension = 'png')
    ) then
    raise exception using
      errcode = '22023',
      message = 'Profile document upload could not be prepared.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_caller_id::text, 0)
  );
  if (
    select pg_catalog.count(*)
    from public.student_profile_documents as document
    where document.student_id = v_caller_id
      and (
        document.status = 'available'::public.student_profile_document_status
        or (
          document.status = 'pending'::public.student_profile_document_status
          and document.upload_expires_at > pg_catalog.statement_timestamp()
        )
      )
  ) >= 50 then
    raise exception using
      errcode = '22023',
      message = 'The Profile Document limit has been reached.';
  end if;

  v_document_id := pg_catalog.gen_random_uuid();
  v_prepared_at := pg_catalog.statement_timestamp();
  v_upload_expires_at := v_prepared_at + interval '2 hours';
  v_storage_path := pg_catalog.concat(
    v_caller_id::text,
    '/',
    v_document_id::text,
    '/',
    v_document_id::text,
    '.',
    v_extension
  );

  insert into public.student_profile_documents (
    id,
    student_id,
    document_type,
    display_name,
    original_file_name,
    bucket_id,
    storage_path,
    mime_type,
    file_size_bytes,
    status,
    uploaded_by,
    prepared_at,
    upload_expires_at,
    created_at,
    updated_at
  ) values (
    v_document_id,
    v_caller_id,
    p_document_type,
    v_display_name,
    v_original_file_name,
    'student-profile-documents',
    v_storage_path,
    p_mime_type,
    p_file_size_bytes,
    'pending'::public.student_profile_document_status,
    v_caller_id,
    v_prepared_at,
    v_upload_expires_at,
    v_prepared_at,
    v_prepared_at
  );

  return query
  select
    document.id,
    document.document_type,
    document.display_name,
    document.original_file_name,
    document.bucket_id,
    document.storage_path,
    document.mime_type,
    document.file_size_bytes,
    document.upload_expires_at
  from public.student_profile_documents as document
  where document.id = v_document_id;
exception
  when insufficient_privilege or invalid_parameter_value then
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Profile document upload could not be prepared.';
end;
$function$;

create function public.finalize_student_profile_document_upload(
  p_document_id uuid
)
returns table (
  document_id uuid,
  document_type public.student_profile_document_type,
  display_name text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  available_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_document public.student_profile_documents%rowtype;
  v_available_at timestamptz;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    raise exception using errcode = '42501',
      message = 'Profile document upload could not be finalized.';
  end if;

  select document.* into v_document
  from public.student_profile_documents as document
  where document.id = p_document_id
  for update;

  if not found
    or v_document.student_id <> v_caller_id
    or v_document.uploaded_by <> v_caller_id
    or v_document.status <>
      'pending'::public.student_profile_document_status
    or v_document.upload_expires_at <= pg_catalog.statement_timestamp()
    or not exists (
      select 1 from storage.objects as storage_object
      where storage_object.bucket_id = v_document.bucket_id
        and storage_object.name = v_document.storage_path
    ) then
    raise exception using errcode = '22023',
      message = 'Profile document upload could not be finalized.';
  end if;

  v_available_at := pg_catalog.statement_timestamp();
  update public.student_profile_documents as document
  set status = 'available'::public.student_profile_document_status,
      available_at = v_available_at,
      updated_at = v_available_at
  where document.id = v_document.id;

  return query
  select document.id, document.document_type, document.display_name,
    document.original_file_name, document.mime_type,
    document.file_size_bytes, document.available_at
  from public.student_profile_documents as document
  where document.id = v_document.id;
exception
  when insufficient_privilege or invalid_parameter_value then raise;
  when others then
    raise exception using errcode = 'P0001',
      message = 'Profile document upload could not be finalized.';
end;
$function$;

create function public.list_my_student_profile_documents()
returns table (
  document_id uuid,
  document_type public.student_profile_document_type,
  display_name text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  available_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    raise exception using errcode = '42501',
      message = 'Profile documents are temporarily unavailable.';
  end if;

  return query
  select document.id, document.document_type, document.display_name,
    document.original_file_name, document.mime_type,
    document.file_size_bytes, document.available_at
  from public.student_profile_documents as document
  where document.student_id = v_caller_id
    and document.status = 'available'::public.student_profile_document_status
  order by document.available_at desc, document.id desc
  limit 50;
end;
$function$;

create function public.list_primary_counselor_student_profile_documents(
  p_student_id uuid
)
returns table (
  document_id uuid,
  document_type public.student_profile_document_type,
  display_name text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  available_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true
    or public.is_active_primary_counselor_for_student(
      p_student_id
    ) is distinct from true then
    raise exception using errcode = '42501',
      message = 'Profile documents are temporarily unavailable.';
  end if;

  return query
  select document.id, document.document_type, document.display_name,
    document.original_file_name, document.mime_type,
    document.file_size_bytes, document.available_at
  from public.student_profile_documents as document
  where document.student_id = p_student_id
    and document.status = 'available'::public.student_profile_document_status
  order by document.available_at desc, document.id desc
  limit 50;
end;
$function$;

create function public.authorize_student_profile_document_view(
  p_student_id uuid,
  p_document_id uuid
)
returns table (
  document_id uuid,
  bucket_id text,
  storage_path text,
  mime_type text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_student_allowed boolean;
  v_counselor_allowed boolean;
begin
  v_caller_id := (select auth.uid());
  v_student_allowed :=
    v_caller_id = p_student_id
    and public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is true;
  v_counselor_allowed :=
    public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is true
    and public.is_active_primary_counselor_for_student(
      p_student_id
    ) is true;

  if v_caller_id is null
    or (v_student_allowed is not true and v_counselor_allowed is not true) then
    raise exception using errcode = '42501',
      message = 'Profile document could not be opened.';
  end if;

  return query
  select document.id, document.bucket_id, document.storage_path,
    document.mime_type
  from public.student_profile_documents as document
  where document.id = p_document_id
    and document.student_id = p_student_id
    and document.status = 'available'::public.student_profile_document_status
  limit 1;

  if not found then
    raise exception using errcode = '22023',
      message = 'Profile document could not be opened.';
  end if;
end;
$function$;

create function public.authorize_student_profile_document_delete(
  p_document_id uuid
)
returns table (
  document_id uuid,
  bucket_id text,
  storage_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    raise exception using errcode = '42501',
      message = 'Profile document could not be deleted.';
  end if;

  return query
  select document.id, document.bucket_id, document.storage_path
  from public.student_profile_documents as document
  where document.id = p_document_id
    and document.student_id = v_caller_id
    and document.status = 'available'::public.student_profile_document_status
  limit 1;

  if not found then
    raise exception using errcode = '22023',
      message = 'Profile document could not be deleted.';
  end if;
end;
$function$;

create function public.finalize_student_profile_document_delete(
  p_document_id uuid
)
returns table (document_id uuid, removed_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_document public.student_profile_documents%rowtype;
  v_removed_at timestamptz;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    raise exception using errcode = '42501',
      message = 'Profile document could not be deleted.';
  end if;

  select document.* into v_document
  from public.student_profile_documents as document
  where document.id = p_document_id
  for update;

  if not found
    or v_document.student_id <> v_caller_id
    or v_document.status <>
      'available'::public.student_profile_document_status
    or exists (
      select 1 from storage.objects as storage_object
      where storage_object.bucket_id = v_document.bucket_id
        and storage_object.name = v_document.storage_path
    ) then
    raise exception using errcode = '22023',
      message = 'Profile document could not be deleted.';
  end if;

  v_removed_at := pg_catalog.statement_timestamp();
  update public.student_profile_documents as document
  set status = 'removed'::public.student_profile_document_status,
      removed_at = v_removed_at,
      removed_by = v_caller_id,
      updated_at = v_removed_at
  where document.id = v_document.id;

  return query select v_document.id, v_removed_at;
exception
  when insufficient_privilege or invalid_parameter_value then raise;
  when others then
    raise exception using errcode = 'P0001',
      message = 'Profile document could not be deleted.';
end;
$function$;

create function public.can_upload_student_profile_document_object(
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
  return p_bucket_id = 'student-profile-documents'
    and public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is true
    and exists (
      select 1 from public.student_profile_documents as document
      where document.bucket_id = p_bucket_id
        and document.storage_path = p_storage_path
        and document.student_id = (select auth.uid())
        and document.uploaded_by = (select auth.uid())
        and document.status = 'pending'::public.student_profile_document_status
        and document.upload_expires_at > pg_catalog.statement_timestamp()
    );
exception when others then return false;
end;
$function$;

create function public.can_view_student_profile_document_object(
  p_bucket_id text,
  p_storage_path text
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
begin
  if p_bucket_id <> 'student-profile-documents' then return false; end if;
  select document.student_id into v_student_id
  from public.student_profile_documents as document
  where document.bucket_id = p_bucket_id
    and document.storage_path = p_storage_path
    and document.status = 'available'::public.student_profile_document_status;
  if not found then return false; end if;
  return (
    (v_student_id = (select auth.uid())
      and public.has_active_verified_kgeo_role(
        'student'::public.user_role
      ) is true)
    or (
      public.has_active_verified_kgeo_role(
        'counselor'::public.user_role
      ) is true
      and public.is_active_primary_counselor_for_student(
        v_student_id
      ) is true
    )
  );
exception when others then return false;
end;
$function$;

create function public.can_delete_student_profile_document_object(
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
  return p_bucket_id = 'student-profile-documents'
    and public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is true
    and exists (
      select 1 from public.student_profile_documents as document
      where document.bucket_id = p_bucket_id
        and document.storage_path = p_storage_path
        and document.student_id = (select auth.uid())
        and document.status = 'available'::public.student_profile_document_status
    );
exception when others then return false;
end;
$function$;

alter function public.prepare_student_profile_document_upload(
  public.student_profile_document_type, text, text, text, bigint
) owner to postgres;
alter function public.finalize_student_profile_document_upload(uuid)
  owner to postgres;
alter function public.list_my_student_profile_documents() owner to postgres;
alter function public.list_primary_counselor_student_profile_documents(uuid)
  owner to postgres;
alter function public.authorize_student_profile_document_view(uuid, uuid)
  owner to postgres;
alter function public.authorize_student_profile_document_delete(uuid)
  owner to postgres;
alter function public.finalize_student_profile_document_delete(uuid)
  owner to postgres;
alter function public.can_upload_student_profile_document_object(text, text)
  owner to postgres;
alter function public.can_view_student_profile_document_object(text, text)
  owner to postgres;
alter function public.can_delete_student_profile_document_object(text, text)
  owner to postgres;

revoke all privileges on table public.student_profile_documents
  from public, anon, authenticated, service_role;
revoke all privileges on type public.student_profile_document_type
  from public, anon, authenticated;
revoke all privileges on type public.student_profile_document_status
  from public, anon, authenticated;

revoke all on function public.prepare_student_profile_document_upload(
  public.student_profile_document_type, text, text, text, bigint
) from public, anon, authenticated, service_role;
revoke all on function public.finalize_student_profile_document_upload(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.list_my_student_profile_documents()
  from public, anon, authenticated, service_role;
revoke all on function public.list_primary_counselor_student_profile_documents(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_student_profile_document_view(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_student_profile_document_delete(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_student_profile_document_delete(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_upload_student_profile_document_object(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.can_view_student_profile_document_object(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.can_delete_student_profile_document_object(text, text)
  from public, anon, authenticated, service_role;

grant usage on type public.student_profile_document_type to authenticated;
grant usage on type public.student_profile_document_status to authenticated;
grant execute on function public.prepare_student_profile_document_upload(
  public.student_profile_document_type, text, text, text, bigint
) to authenticated;
grant execute on function public.finalize_student_profile_document_upload(uuid)
  to authenticated;
grant execute on function public.list_my_student_profile_documents()
  to authenticated;
grant execute on function public.list_primary_counselor_student_profile_documents(uuid)
  to authenticated;
grant execute on function public.authorize_student_profile_document_view(uuid, uuid)
  to authenticated;
grant execute on function public.authorize_student_profile_document_delete(uuid)
  to authenticated;
grant execute on function public.finalize_student_profile_document_delete(uuid)
  to authenticated;
grant execute on function public.can_upload_student_profile_document_object(text, text)
  to authenticated;
grant execute on function public.can_view_student_profile_document_object(text, text)
  to authenticated;
grant execute on function public.can_delete_student_profile_document_object(text, text)
  to authenticated;

comment on table public.student_profile_documents is
  'Private reusable Student Profile Documents; separate from progression evidence and application documents.';

commit;
