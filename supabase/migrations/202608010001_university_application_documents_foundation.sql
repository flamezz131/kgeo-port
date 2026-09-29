-- K-GEO Phase E1.3.3 university application documents foundation.
-- Review this migration before applying it. Apply it only after
-- 202607280001_student_university_application_read_foundation.sql.
--
-- The private university-application-documents bucket and its two exact
-- storage.objects policies are created manually through the Supabase
-- Dashboard-managed Storage path. This migration never mutates or changes
-- ownership of Supabase-managed Storage relations.

begin;

create type public.university_application_document_status as enum (
  'pending',
  'available',
  'removed'
);

comment on type public.university_application_document_status is
  'Lifecycle for private counselor-managed documents attached to one university application. Removed is final in E1.3.3.';

create table public.student_university_application_documents (
  id uuid
    constraint student_university_application_documents_pkey primary key
    default pg_catalog.gen_random_uuid(),
  application_id uuid
    constraint university_application_documents_application_id_not_null
      not null
    constraint university_application_documents_application_id_fkey
      references public.student_university_applications(id)
      on delete restrict,
  status public.university_application_document_status
    constraint university_application_documents_status_not_null not null
    default 'pending'::public.university_application_document_status,
  document_title text
    constraint university_application_documents_title_not_null not null,
  original_file_name text
    constraint university_application_documents_original_name_not_null
      not null,
  bucket_id text
    constraint university_application_documents_bucket_id_not_null not null
    default 'university-application-documents',
  storage_path text
    constraint university_application_documents_storage_path_not_null
      not null,
  mime_type text
    constraint university_application_documents_mime_type_not_null not null,
  file_size_bytes bigint
    constraint university_application_documents_file_size_not_null not null,
  uploaded_by uuid
    constraint university_application_documents_uploaded_by_not_null not null
    constraint university_application_documents_uploaded_by_fkey
      references public.profiles(id)
      on delete restrict,
  prepared_at timestamptz
    constraint university_application_documents_prepared_at_not_null not null
    default pg_catalog.statement_timestamp(),
  upload_expires_at timestamptz
    constraint university_application_documents_upload_expires_at_not_null
      not null
    default (pg_catalog.statement_timestamp() + interval '2 hours'),
  available_at timestamptz,
  removed_at timestamptz,
  removed_by uuid
    constraint university_application_documents_removed_by_fkey
      references public.profiles(id)
      on delete restrict,
  removal_reason text,
  created_at timestamptz
    constraint university_application_documents_created_at_not_null not null
    default pg_catalog.statement_timestamp(),
  updated_at timestamptz
    constraint university_application_documents_updated_at_not_null not null
    default pg_catalog.statement_timestamp(),

  constraint university_application_documents_bucket_check
    check (bucket_id = 'university-application-documents'),
  constraint university_application_documents_storage_path_key
    unique (storage_path),
  constraint university_application_documents_storage_path_check
    check (
      storage_path = pg_catalog.lower(storage_path)
      and storage_path ~ (
        '^applications/'
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        '[0-9a-f]{4}-[0-9a-f]{12}/'
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        '[0-9a-f]{4}-[0-9a-f]{12}/'
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        '[0-9a-f]{4}-[0-9a-f]{12}/'
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        '[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|jpg|jpeg|png|webp)$'
      )
      and pg_catalog.split_part(storage_path, '/', 1) = 'applications'
      and pg_catalog.split_part(storage_path, '/', 3) = application_id::text
      and pg_catalog.split_part(storage_path, '/', 4) = id::text
      and pg_catalog.split_part(
        pg_catalog.split_part(storage_path, '/', 5),
        '.',
        1
      ) = id::text
    ),
  constraint university_application_documents_title_check
    check (
      pg_catalog.char_length(document_title) between 2 and 100
      and document_title = pg_catalog.regexp_replace(
        pg_catalog.btrim(document_title),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and document_title !~ '[[:cntrl:]]'
      and document_title !~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
    ),
  constraint university_application_documents_original_name_check
    check (
      pg_catalog.char_length(original_file_name) between 1 and 255
      and original_file_name = pg_catalog.regexp_replace(
        original_file_name,
        '^[[:space:]]+|[[:space:]]+$',
        '',
        'g'
      )
      and original_file_name !~ '[[:cntrl:]]'
      and original_file_name !~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
      and pg_catalog.strpos(original_file_name, '/') = 0
      and pg_catalog.strpos(
        original_file_name,
        pg_catalog.chr(92)
      ) = 0
      and pg_catalog.strpos(original_file_name, '..') = 0
      and original_file_name ~ '^[^.]+\.[^.]+$'
      and pg_catalog.lower(
        pg_catalog.substring(original_file_name, '\.([^.]+)$')
      ) in ('pdf', 'jpg', 'jpeg', 'png', 'webp')
    ),
  constraint university_application_documents_mime_type_check
    check (
      mime_type in (
        'application/pdf',
        'image/jpeg',
        'image/png',
        'image/webp'
      )
    ),
  constraint university_application_documents_mime_extension_check
    check (
      (
        mime_type = 'application/pdf'
        and pg_catalog.lower(
          pg_catalog.substring(original_file_name, '\.([^.]+)$')
        ) = 'pdf'
        and pg_catalog.lower(
          pg_catalog.substring(storage_path, '\.([^.]+)$')
        ) = 'pdf'
      )
      or (
        mime_type = 'image/jpeg'
        and pg_catalog.lower(
          pg_catalog.substring(original_file_name, '\.([^.]+)$')
        ) in ('jpg', 'jpeg')
        and pg_catalog.lower(
          pg_catalog.substring(storage_path, '\.([^.]+)$')
        ) in ('jpg', 'jpeg')
      )
      or (
        mime_type = 'image/png'
        and pg_catalog.lower(
          pg_catalog.substring(original_file_name, '\.([^.]+)$')
        ) = 'png'
        and pg_catalog.lower(
          pg_catalog.substring(storage_path, '\.([^.]+)$')
        ) = 'png'
      )
      or (
        mime_type = 'image/webp'
        and pg_catalog.lower(
          pg_catalog.substring(original_file_name, '\.([^.]+)$')
        ) = 'webp'
        and pg_catalog.lower(
          pg_catalog.substring(storage_path, '\.([^.]+)$')
        ) = 'webp'
      )
    ),
  constraint university_application_documents_file_size_check
    check (file_size_bytes between 1 and 10485760),
  constraint university_application_documents_upload_window_check
    check (upload_expires_at = prepared_at + interval '2 hours'),
  constraint university_application_documents_status_consistency_check
    check (
      (
        status = 'pending'::public.university_application_document_status
        and available_at is null
        and removed_at is null
        and removed_by is null
        and removal_reason is null
        and created_at = prepared_at
        and updated_at = prepared_at
      )
      or (
        status = 'available'::public.university_application_document_status
        and available_at is not null
        and available_at >= prepared_at
        and available_at <= upload_expires_at
        and removed_at is null
        and removed_by is null
        and removal_reason is null
        and created_at = prepared_at
        and updated_at = available_at
      )
      or (
        status = 'removed'::public.university_application_document_status
        and available_at is not null
        and available_at >= prepared_at
        and available_at <= upload_expires_at
        and removed_at is not null
        and removed_at >= available_at
        and removed_by is not null
        and removal_reason is not null
        and pg_catalog.char_length(removal_reason) between 1 and 500
        and removal_reason = pg_catalog.regexp_replace(
          pg_catalog.btrim(removal_reason),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and removal_reason !~ '[[:cntrl:]]'
        and removal_reason !~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
        and created_at = prepared_at
        and updated_at = removed_at
      )
    )
);

comment on table public.student_university_application_documents is
  'Private counselor-managed document metadata attached to exactly one university application; bytes remain in a manually configured private Storage bucket.';

comment on column
  public.student_university_application_documents.application_id is
  'Trusted parent application. The student identity is derived through this immutable relationship and never accepted as document input.';

comment on column
  public.student_university_application_documents.document_title is
  'Normalized counselor-visible title; never included in the Storage path.';

comment on column
  public.student_university_application_documents.storage_path is
  'Database-generated UUID-only private object path; never accepted from a browser.';

comment on column
  public.student_university_application_documents.original_file_name is
  'Normalized counselor-visible display metadata only; never included in the Storage path.';

comment on column
  public.student_university_application_documents.file_size_bytes is
  'Declared upload size constrained to 10 MiB; the private bucket limit is an independent boundary.';

comment on column
  public.student_university_application_documents.removal_reason is
  'Required normalized audit reason for final soft removal; it is not a private counselor note.';

create index university_application_documents_application_available_idx
  on public.student_university_application_documents (
    application_id,
    status,
    available_at desc,
    id desc
  );

create index university_application_documents_status_expiry_idx
  on public.student_university_application_documents (
    status,
    upload_expires_at,
    id
  );

comment on index
  public.university_application_documents_application_available_idx is
  'Supports the bounded available-document list and the per-application active reservation count.';

comment on index
  public.university_application_documents_status_expiry_idx is
  'Supports aggregate expired-pending diagnostics and a future separately reviewed retention process.';

-- SECURITY: this is the sole preparation path. It derives the counselor and
-- student, rejects archived applications, validates display metadata, locks a
-- dedicated per-application domain before counting, and generates a UUID-only
-- object path.
create function public.prepare_university_application_document_upload(
  p_application_id uuid,
  p_document_title text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns table (
  document_id uuid,
  application_id uuid,
  bucket_id text,
  storage_path text,
  document_title text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  upload_expires_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  application_record public.student_university_applications%rowtype;
  normalized_title text;
  normalized_file_name text;
  normalized_mime_type text;
  normalized_extension text;
  prepared_time timestamptz;
  new_document_id uuid;
  generated_storage_path text;
  active_document_count integer;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Document could not be uploaded.';
  end if;

  if p_application_id is null then
    raise exception using
      errcode = '22023',
      message = 'Document could not be uploaded.';
  end if;

  select application.*
  into application_record
  from public.student_university_applications as application
  inner join public.profiles as student_profile
    on student_profile.id = application.student_id
    and student_profile.role = 'student'::public.user_role
  where application.id = p_application_id
  for key share of application;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'Document could not be uploaded.';
  end if;

  if application_record.is_archived then
    raise exception using
      errcode = '22023',
      message = 'This application is archived and cannot be changed.';
  end if;

  normalized_title := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_document_title),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if p_document_title is null
    or p_document_title ~ '[[:cntrl:]]'
    or p_document_title ~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
    or normalized_title is null
    or pg_catalog.char_length(normalized_title) not between 2 and 100
    or normalized_title ~ '[[:cntrl:]]'
    or normalized_title ~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]' then
    raise exception using
      errcode = '22023',
      message = 'Document could not be uploaded.';
  end if;

  normalized_file_name := pg_catalog.regexp_replace(
    p_original_file_name,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );

  if p_original_file_name is null
    or p_original_file_name <> normalized_file_name
    or p_original_file_name ~ '[[:cntrl:]]'
    or p_original_file_name ~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
    or normalized_file_name is null
    or normalized_file_name = ''
    or pg_catalog.char_length(normalized_file_name) > 255
    or normalized_file_name ~ '[[:cntrl:]]'
    or normalized_file_name ~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
    or pg_catalog.strpos(normalized_file_name, '/') > 0
    or pg_catalog.strpos(
      normalized_file_name,
      pg_catalog.chr(92)
    ) > 0
    or pg_catalog.strpos(normalized_file_name, '..') > 0
    or normalized_file_name !~ '^[^.]+\.[^.]+$' then
    raise exception using
      errcode = '22023',
      message = 'Document could not be uploaded.';
  end if;

  normalized_extension := pg_catalog.lower(
    pg_catalog.substring(normalized_file_name, '\.([^.]+)$')
  );
  normalized_mime_type := pg_catalog.lower(
    pg_catalog.btrim(p_mime_type)
  );

  if normalized_extension is null
    or normalized_extension not in ('pdf', 'jpg', 'jpeg', 'png', 'webp')
    or normalized_mime_type is null
    or normalized_mime_type not in (
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp'
    )
    or not (
      (normalized_mime_type = 'application/pdf'
        and normalized_extension = 'pdf')
      or (normalized_mime_type = 'image/jpeg'
        and normalized_extension in ('jpg', 'jpeg'))
      or (normalized_mime_type = 'image/png'
        and normalized_extension = 'png')
      or (normalized_mime_type = 'image/webp'
        and normalized_extension = 'webp')
    ) then
    raise exception using
      errcode = '22023',
      message = 'Document could not be uploaded.';
  end if;

  if p_file_size_bytes is null
    or p_file_size_bytes < 1
    or p_file_size_bytes > 10485760 then
    raise exception using
      errcode = '22023',
      message = 'Document could not be uploaded.';
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_application_id::text,
      202608010001
    )
  ) then
    raise exception using
      errcode = '40001',
      message = 'Document could not be uploaded.';
  end if;

  prepared_time := pg_catalog.statement_timestamp();

  select pg_catalog.count(*)::integer
  into active_document_count
  from (
    select document.id
    from public.student_university_application_documents as document
    where document.application_id = p_application_id
      and (
        document.status =
          'available'::public.university_application_document_status
        or (
          document.status =
            'pending'::public.university_application_document_status
          and document.upload_expires_at > prepared_time
        )
      )
    order by document.id
    limit 21
  ) as bounded_active_documents;

  if active_document_count >= 20 then
    raise exception using
      errcode = '22023',
      message = 'The document limit has been reached.';
  end if;

  new_document_id := pg_catalog.gen_random_uuid();
  generated_storage_path :=
    'applications/' || application_record.student_id::text || '/' ||
    p_application_id::text || '/' || new_document_id::text || '/' ||
    new_document_id::text || '.' || normalized_extension;

  insert into public.student_university_application_documents (
    id,
    application_id,
    status,
    document_title,
    original_file_name,
    bucket_id,
    storage_path,
    mime_type,
    file_size_bytes,
    uploaded_by,
    prepared_at,
    upload_expires_at,
    available_at,
    removed_at,
    removed_by,
    removal_reason,
    created_at,
    updated_at
  )
  values (
    new_document_id,
    p_application_id,
    'pending'::public.university_application_document_status,
    normalized_title,
    normalized_file_name,
    'university-application-documents',
    generated_storage_path,
    normalized_mime_type,
    p_file_size_bytes,
    caller_id,
    prepared_time,
    prepared_time + interval '2 hours',
    null,
    null,
    null,
    null,
    prepared_time,
    prepared_time
  );

  return query
  select
    document.id,
    document.application_id,
    document.bucket_id,
    document.storage_path,
    document.document_title,
    document.original_file_name,
    document.mime_type,
    document.file_size_bytes,
    document.upload_expires_at
  from public.student_university_application_documents as document
  where document.id = new_document_id;
exception
  when insufficient_privilege or invalid_parameter_value
    or serialization_failure then
    raise;
  when unique_violation then
    raise exception using
      errcode = '40001',
      message = 'Document could not be uploaded.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Document could not be uploaded.';
end;
$function$;

-- SECURITY: finalization accepts only the document UUID, is bound to the
-- preparing counselor, revalidates the trusted nonarchived application, and
-- treats storage.objects as read-only existence evidence.
create function public.finalize_university_application_document_upload(
  p_document_id uuid
)
returns table (
  document_id uuid,
  application_id uuid,
  document_title text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  status public.university_application_document_status,
  available_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  document_record public.student_university_application_documents%rowtype;
  application_record public.student_university_applications%rowtype;
  finalized_time timestamptz;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Document could not be finalized.';
  end if;

  if p_document_id is null then
    raise exception using
      errcode = '22023',
      message = 'Document could not be finalized.';
  end if;

  select document.*
  into document_record
  from public.student_university_application_documents as document
  where document.id = p_document_id
  for update;

  if not found
    or document_record.uploaded_by <> caller_id
    or document_record.status <>
      'pending'::public.university_application_document_status then
    raise exception using
      errcode = '22023',
      message = 'Document could not be finalized.';
  end if;

  select application.*
  into application_record
  from public.student_university_applications as application
  inner join public.profiles as student_profile
    on student_profile.id = application.student_id
    and student_profile.role = 'student'::public.user_role
  where application.id = document_record.application_id
  for key share of application;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'Document could not be finalized.';
  end if;

  if application_record.is_archived then
    raise exception using
      errcode = '22023',
      message = 'This application is archived and cannot be changed.';
  end if;

  finalized_time := pg_catalog.statement_timestamp();

  if document_record.upload_expires_at <= finalized_time then
    raise exception using
      errcode = '22023',
      message = 'The upload has expired. Start a new upload.';
  end if;

  if not exists (
    select 1
    from storage.objects as storage_object
    where storage_object.bucket_id = document_record.bucket_id
      and storage_object.name = document_record.storage_path
  ) then
    raise exception using
      errcode = '22023',
      message = 'Document could not be finalized.';
  end if;

  update public.student_university_application_documents as document
  set
    status = 'available'::public.university_application_document_status,
    available_at = finalized_time,
    updated_at = finalized_time
  where document.id = document_record.id;

  return query
  select
    document.id,
    document.application_id,
    document.document_title,
    document.original_file_name,
    document.mime_type,
    document.file_size_bytes,
    document.status,
    document.available_at
  from public.student_university_application_documents as document
  where document.id = document_record.id;
exception
  when insufficient_privilege or invalid_parameter_value then
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Document could not be finalized.';
end;
$function$;

-- SECURITY: the list is application-bound, available-only, deterministic,
-- capped at twenty rows, and excludes actors, removal audit, bucket, path,
-- pending rows, and removed rows.
create function public.list_university_application_documents(
  p_application_id uuid
)
returns table (
  document_id uuid,
  application_id uuid,
  document_title text,
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
  caller_id uuid;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Documents are temporarily unavailable.';
  end if;

  if p_application_id is null
    or not exists (
      select 1
      from public.student_university_applications as application
      inner join public.profiles as student_profile
        on student_profile.id = application.student_id
        and student_profile.role = 'student'::public.user_role
      where application.id = p_application_id
    ) then
    raise exception using
      errcode = '22023',
      message = 'Documents are temporarily unavailable.';
  end if;

  return query
  select
    document.id,
    document.application_id,
    document.document_title,
    document.original_file_name,
    document.mime_type,
    document.file_size_bytes,
    document.available_at
  from public.student_university_application_documents as document
  where document.application_id = p_application_id
    and document.status =
      'available'::public.university_application_document_status
  order by document.available_at desc, document.id desc
  limit 20;
exception
  when insufficient_privilege or invalid_parameter_value then
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Documents are temporarily unavailable.';
end;
$function$;

-- SECURITY: this server-only authorization contract resolves an available
-- document to its trusted private path only after reauthorizing the counselor
-- and exact application/document relationship. It does not create a URL.
create function public.authorize_university_application_document_view(
  p_application_id uuid,
  p_document_id uuid
)
returns table (
  document_id uuid,
  application_id uuid,
  bucket_id text,
  storage_path text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Document could not be opened.';
  end if;

  if p_application_id is null or p_document_id is null then
    raise exception using
      errcode = '22023',
      message = 'Document could not be opened.';
  end if;

  return query
  select
    document.id,
    document.application_id,
    document.bucket_id,
    document.storage_path
  from public.student_university_application_documents as document
  inner join public.student_university_applications as application
    on application.id = document.application_id
  inner join public.profiles as student_profile
    on student_profile.id = application.student_id
    and student_profile.role = 'student'::public.user_role
  where document.id = p_document_id
    and document.application_id = p_application_id
    and document.status =
      'available'::public.university_application_document_status
  limit 1;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'The document is no longer available.';
  end if;
exception
  when insufficient_privilege or invalid_parameter_value then
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Document could not be opened.';
end;
$function$;

-- SECURITY: removal is final and audit-preserving. It revalidates the
-- nonarchived application and never deletes metadata or Storage bytes.
create function public.soft_remove_university_application_document(
  p_document_id uuid,
  p_removal_reason text
)
returns table (
  document_id uuid,
  application_id uuid,
  status public.university_application_document_status,
  removed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  document_record public.student_university_application_documents%rowtype;
  application_record public.student_university_applications%rowtype;
  normalized_removal_reason text;
  removal_time timestamptz;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Document could not be removed.';
  end if;

  if p_document_id is null then
    raise exception using
      errcode = '22023',
      message = 'Document could not be removed.';
  end if;

  normalized_removal_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_removal_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if p_removal_reason is null
    or p_removal_reason ~ '[[:cntrl:]]'
    or p_removal_reason ~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
    or normalized_removal_reason is null
    or pg_catalog.char_length(normalized_removal_reason) > 500
    or normalized_removal_reason ~ '[[:cntrl:]]'
    or normalized_removal_reason ~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]' then
    raise exception using
      errcode = '22023',
      message = 'Document could not be removed.';
  end if;

  select document.*
  into document_record
  from public.student_university_application_documents as document
  where document.id = p_document_id
  for update;

  if not found
    or document_record.status <>
      'available'::public.university_application_document_status then
    raise exception using
      errcode = '22023',
      message = 'The document is no longer available.';
  end if;

  select application.*
  into application_record
  from public.student_university_applications as application
  inner join public.profiles as student_profile
    on student_profile.id = application.student_id
    and student_profile.role = 'student'::public.user_role
  where application.id = document_record.application_id
  for key share of application;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'Document could not be removed.';
  end if;

  if application_record.is_archived then
    raise exception using
      errcode = '22023',
      message = 'This application is archived and cannot be changed.';
  end if;

  removal_time := pg_catalog.statement_timestamp();

  update public.student_university_application_documents as document
  set
    status = 'removed'::public.university_application_document_status,
    removed_at = removal_time,
    removed_by = caller_id,
    removal_reason = normalized_removal_reason,
    updated_at = removal_time
  where document.id = document_record.id;

  return query
  select
    document.id,
    document.application_id,
    document.status,
    document.removed_at
  from public.student_university_application_documents as document
  where document.id = document_record.id;
exception
  when insufficient_privilege or invalid_parameter_value then
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Document could not be removed.';
end;
$function$;

-- These boolean helpers are the only metadata bridge used by the manually
-- installed Storage policies. They reveal no metadata and reauthorize every
-- call instead of relying on a browser-supplied role. Unexpected lookup errors
-- return false so the Storage policy fails closed without exposing internals.
create function public.can_upload_university_application_document_object(
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
    and (select auth.uid()) is not null
    and public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is true
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
    )
  );
exception
  when others then
    return false;
end;
$function$;

create function public.can_view_university_application_document_object(
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
    and (select auth.uid()) is not null
    and public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is true
    and exists (
      select 1
      from public.student_university_application_documents as document
      inner join public.student_university_applications as application
        on application.id = document.application_id
      inner join public.profiles as student_profile
        on student_profile.id = application.student_id
        and student_profile.role = 'student'::public.user_role
      where document.bucket_id = p_bucket_id
        and document.storage_path = p_storage_path
        and document.status =
          'available'::public.university_application_document_status
    )
  );
exception
  when others then
    return false;
end;
$function$;

alter function public.prepare_university_application_document_upload(
  uuid,
  text,
  text,
  text,
  bigint
) owner to postgres;

alter function public.finalize_university_application_document_upload(uuid)
  owner to postgres;

alter function public.list_university_application_documents(uuid)
  owner to postgres;

alter function public.authorize_university_application_document_view(
  uuid,
  uuid
) owner to postgres;

alter function public.soft_remove_university_application_document(uuid, text)
  owner to postgres;

alter function public.can_upload_university_application_document_object(
  text,
  text
) owner to postgres;

alter function public.can_view_university_application_document_object(
  text,
  text
) owner to postgres;

comment on function public.prepare_university_application_document_upload(
  uuid,
  text,
  text,
  text,
  bigint
) is
  'Creates a counselor-bound two-hour pending upload intent for one validated nonarchived university application and returns its generated private object path.';

comment on function
  public.finalize_university_application_document_upload(uuid) is
  'Finalizes the original counselor upload intent only after the exact generated private Storage object exists and its application remains nonarchived.';

comment on function public.list_university_application_documents(uuid) is
  'Returns at most twenty safe available-document summaries for one validated application, including archived read-only applications.';

comment on function public.authorize_university_application_document_view(
  uuid,
  uuid
) is
  'Authorizes an active verified counselor to resolve one available application document to its trusted private path for a server-created five-minute signed URL.';

comment on function
  public.soft_remove_university_application_document(uuid, text) is
  'Soft-removes one available document on a nonarchived application while retaining metadata, Storage bytes, and removal audit.';

comment on function
  public.can_upload_university_application_document_object(text, text) is
  'Storage-policy predicate allowing only the preparing counselor to upload to one exact unexpired pending path on a nonarchived application.';

comment on function
  public.can_view_university_application_document_object(text, text) is
  'Storage-policy predicate allowing an active verified counselor to read one exact available private object, including on archived applications.';

alter table public.student_university_application_documents
  enable row level security;

revoke all privileges on table
  public.student_university_application_documents
  from public, anon, authenticated;

revoke all privileges on type
  public.university_application_document_status
  from public, anon, authenticated;

revoke all on function public.prepare_university_application_document_upload(
  uuid,
  text,
  text,
  text,
  bigint
) from public, anon, authenticated;

revoke all on function
  public.finalize_university_application_document_upload(uuid)
  from public, anon, authenticated;

revoke all on function public.list_university_application_documents(uuid)
  from public, anon, authenticated;

revoke all on function public.authorize_university_application_document_view(
  uuid,
  uuid
) from public, anon, authenticated;

revoke all on function
  public.soft_remove_university_application_document(uuid, text)
  from public, anon, authenticated;

revoke all on function
  public.can_upload_university_application_document_object(text, text)
  from public, anon, authenticated;

revoke all on function
  public.can_view_university_application_document_object(text, text)
  from public, anon, authenticated;

grant usage on type public.university_application_document_status
  to authenticated;

grant execute on function public.prepare_university_application_document_upload(
  uuid,
  text,
  text,
  text,
  bigint
) to authenticated;

grant execute on function
  public.finalize_university_application_document_upload(uuid)
  to authenticated;

grant execute on function public.list_university_application_documents(uuid)
  to authenticated;

grant execute on function public.authorize_university_application_document_view(
  uuid,
  uuid
) to authenticated;

grant execute on function
  public.soft_remove_university_application_document(uuid, text)
  to authenticated;

grant execute on function
  public.can_upload_university_application_document_object(text, text)
  to authenticated;

grant execute on function
  public.can_view_university_application_document_object(text, text)
  to authenticated;

-- Defense in depth: this policy defines the only row class a counselor could
-- read if a later reviewed migration grants safe columns. E1.3.3 grants no
-- direct table SELECT or mutation privilege; all reads use focused RPCs.
create policy university_application_documents_select_counselor
on public.student_university_application_documents
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
  and status = 'available'::public.university_application_document_status
);

comment on policy university_application_documents_select_counselor
  on public.student_university_application_documents is
  'Available-only counselor defense-in-depth policy. E1.3.3 grants no direct table SELECT; students, admins, directors, and anonymous users have no policy.';

-- After this migration succeeds, create only the reviewed authenticated
-- INSERT and SELECT policies through the Dashboard Storage policy editor using
-- the exact predicates in docs/database.md. Do not create Storage UPDATE,
-- DELETE, anonymous, public, student, admin, or director policies. Physical
-- purge remains a separately reviewed retention operation.

commit;
