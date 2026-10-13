-- K-GEO Student Achievement Evidence.
-- Achievement evidence is optional and remains isolated from every existing
-- K-GEO document system.

begin;

set local search_path = '';

create type public.student_achievement_document_status as enum (
  'pending',
  'available',
  'removal_pending',
  'removed'
);

create type public.student_achievement_document_removal_reason as enum (
  'student_delete',
  'pending_cancel',
  'invalid_file'
);

alter type public.student_achievement_document_status owner to postgres;
alter type public.student_achievement_document_removal_reason owner to postgres;

create table public.student_achievement_documents (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  achievement_id uuid
    references public.student_achievements(id) on delete set null,
  achievement_reference_id uuid not null,
  student_id uuid not null
    references public.profiles(id) on delete restrict,
  document_name text not null,
  bucket_id text not null default 'student-achievement-documents',
  storage_path text not null unique,
  mime_type text not null,
  file_size_bytes bigint not null,
  status public.student_achievement_document_status not null default 'pending',
  uploaded_by uuid not null
    references public.profiles(id) on delete restrict,
  prepared_at timestamptz not null default pg_catalog.statement_timestamp(),
  upload_expires_at timestamptz not null,
  detected_mime_type text,
  signature_validated_at timestamptz,
  available_at timestamptz,
  removal_requested_at timestamptz,
  removal_reason public.student_achievement_document_removal_reason,
  removed_at timestamptz,
  removed_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint student_achievement_documents_reference_check check (
    achievement_id is null
    or achievement_id = achievement_reference_id
  ),
  constraint student_achievement_documents_name_check check (
    pg_catalog.char_length(document_name) between 1 and 255
    and document_name = pg_catalog.regexp_replace(
      pg_catalog.btrim(document_name), '[[:space:]]+', ' ', 'g'
    )
    and document_name !~ '[/\\]'
    and document_name !~ '[[:cntrl:]]'
    and document_name !~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
  ),
  constraint student_achievement_documents_bucket_check check (
    bucket_id = 'student-achievement-documents'
  ),
  constraint student_achievement_documents_mime_check check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint student_achievement_documents_size_check check (
    file_size_bytes between 1 and 10485760
  ),
  constraint student_achievement_documents_actor_check check (
    uploaded_by = student_id
    and (removed_by is null or removed_by = student_id)
  ),
  constraint student_achievement_documents_expiry_check check (
    upload_expires_at = prepared_at + interval '2 hours'
  ),
  constraint student_achievement_documents_signature_check check (
    detected_mime_type is null
    or detected_mime_type in ('application/pdf', 'image/jpeg', 'image/png')
  ),
  constraint student_achievement_documents_lifecycle_check check (
    (
      status = 'pending'::public.student_achievement_document_status
      and (
        (
          detected_mime_type is null
          and signature_validated_at is null
        )
        or (
          detected_mime_type = mime_type
          and signature_validated_at is not null
          and signature_validated_at >= prepared_at
        )
      )
      and available_at is null
      and removal_requested_at is null
      and removal_reason is null
      and removed_at is null
      and removed_by is null
    )
    or (
      status = 'available'::public.student_achievement_document_status
      and detected_mime_type = mime_type
      and signature_validated_at is not null
      and signature_validated_at >= prepared_at
      and available_at is not null
      and available_at >= signature_validated_at
      and removal_requested_at is null
      and removal_reason is null
      and removed_at is null
      and removed_by is null
    )
    or (
      status = 'removal_pending'::public.student_achievement_document_status
      and removal_requested_at is not null
      and removal_reason is not null
      and (
        (
          removal_reason =
            'student_delete'::public.student_achievement_document_removal_reason
          and available_at is not null
          and detected_mime_type = mime_type
          and signature_validated_at is not null
        )
        or (
          removal_reason in (
            'pending_cancel'::public.student_achievement_document_removal_reason,
            'invalid_file'::public.student_achievement_document_removal_reason
          )
          and available_at is null
        )
      )
      and removed_at is null
      and removed_by is null
    )
    or (
      status = 'removed'::public.student_achievement_document_status
      and removal_requested_at is not null
      and removal_reason is not null
      and removed_at is not null
      and removed_at >= removal_requested_at
      and removed_by = student_id
      and (
        (
          removal_reason =
            'student_delete'::public.student_achievement_document_removal_reason
          and available_at is not null
          and detected_mime_type = mime_type
          and signature_validated_at is not null
        )
        or (
          removal_reason in (
            'pending_cancel'::public.student_achievement_document_removal_reason,
            'invalid_file'::public.student_achievement_document_removal_reason
          )
          and available_at is null
        )
      )
    )
  )
);

alter table public.student_achievement_documents owner to postgres;
alter table public.student_achievement_documents enable row level security;
alter table public.student_achievement_documents force row level security;

create function private.enforce_student_achievement_document_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.achievement_id is null then
    if tg_op = 'UPDATE'
      and old.achievement_id is not null
      and new.achievement_reference_id = old.achievement_reference_id
      and new.student_id = old.student_id
      and new.status = 'removed'::public.student_achievement_document_status then
      return new;
    end if;
    raise exception using errcode = '23514',
      message = 'Achievement evidence ownership is invalid.';
  end if;

  if new.achievement_reference_id <> new.achievement_id
    or not exists (
      select 1
      from public.student_achievements as achievement
      where achievement.id = new.achievement_id
        and achievement.student_id = new.student_id
    ) then
    raise exception using errcode = '23514',
      message = 'Achievement evidence ownership is invalid.';
  end if;
  return new;
end;
$function$;

create trigger student_achievement_documents_enforce_owner
before insert or update on public.student_achievement_documents
for each row execute function private.enforce_student_achievement_document_owner();

create function private.protect_achievement_with_active_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.student_achievement_documents as document
    where document.achievement_id = old.id
      and document.status in (
        'pending'::public.student_achievement_document_status,
        'available'::public.student_achievement_document_status,
        'removal_pending'::public.student_achievement_document_status
      )
  ) then
    raise exception using errcode = '23503',
      message = 'Remove achievement evidence before deleting the achievement.';
  end if;
  return old;
end;
$function$;

create trigger student_achievements_protect_active_evidence
before delete on public.student_achievements
for each row execute function private.protect_achievement_with_active_evidence();

create index student_achievement_documents_achievement_available_idx
  on public.student_achievement_documents (
    achievement_id,
    available_at desc,
    id desc
  )
  where status = 'available'::public.student_achievement_document_status;

create index student_achievement_documents_student_available_idx
  on public.student_achievement_documents (
    student_id,
    available_at desc,
    id desc
  )
  where status = 'available'::public.student_achievement_document_status;

create index student_achievement_documents_pending_expiry_idx
  on public.student_achievement_documents (upload_expires_at, id)
  where status = 'pending'::public.student_achievement_document_status;

-- Capture the exact PostgreSQL-rendered installation contract immediately
-- after creation. The read-only verifier recomputes every digest, so a same-
-- named weakened constraint, index, or trigger cannot pass.
do $catalog_contract$
declare
  v_record record;
  v_digest text;
begin
  for v_record in
    select constraint_record.oid, constraint_record.conname::text as object_name
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid =
      'public.student_achievement_documents'::pg_catalog.regclass
    order by constraint_record.conname
  loop
    v_digest := pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_constraintdef(v_record.oid, false), 'UTF8'
      )),
      'hex'
    );
    execute pg_catalog.format(
      'comment on constraint %I on public.student_achievement_documents is %L',
      v_record.object_name,
      'kgeo-exact-constraint-sha256:' || v_digest
    );
  end loop;

  for v_record in
    select index_record.indexrelid as oid,
      index_class.relname::text as object_name
    from pg_catalog.pg_index as index_record
    join pg_catalog.pg_class as index_class
      on index_class.oid = index_record.indexrelid
    where index_record.indrelid =
      'public.student_achievement_documents'::pg_catalog.regclass
    order by index_class.relname
  loop
    v_digest := pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_indexdef(v_record.oid), 'UTF8'
      )),
      'hex'
    );
    execute pg_catalog.format(
      'comment on index public.%I is %L',
      v_record.object_name,
      'kgeo-exact-index-sha256:' || v_digest
    );
  end loop;

  for v_record in
    select trigger_record.oid, trigger_record.tgname::text as object_name,
      relation_record.relname::text as relation_name
    from pg_catalog.pg_trigger as trigger_record
    join pg_catalog.pg_class as relation_record
      on relation_record.oid = trigger_record.tgrelid
    where not trigger_record.tgisinternal
      and trigger_record.tgname in (
        'student_achievement_documents_enforce_owner',
        'student_achievements_protect_active_evidence'
      )
    order by trigger_record.tgname
  loop
    v_digest := pg_catalog.encode(
      pg_catalog.sha256(pg_catalog.convert_to(
        pg_catalog.pg_get_triggerdef(v_record.oid, false), 'UTF8'
      )),
      'hex'
    );
    execute pg_catalog.format(
      'comment on trigger %I on public.%I is %L',
      v_record.object_name,
      v_record.relation_name,
      'kgeo-exact-trigger-sha256:' || v_digest
    );
  end loop;
end;
$catalog_contract$;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'student-achievement-documents',
  'student-achievement-documents',
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
    where bucket.id = 'student-achievement-documents'
      and bucket.name = 'student-achievement-documents'
      and bucket.public is false
      and bucket.file_size_limit = 10485760
      and bucket.allowed_mime_types =
        array['application/pdf', 'image/jpeg', 'image/png']::text[]
  ) then
    raise exception using
      errcode = '55000',
      message = 'Student Achievement Document bucket does not match the reviewed contract';
  end if;
end;
$bucket_contract$;

create function public.prepare_student_achievement_document_upload(
  p_student_id uuid,
  p_achievement_id uuid,
  p_document_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns table (
  document_id uuid,
  achievement_id uuid,
  document_name text,
  bucket_id text,
  storage_path text,
  mime_type text,
  file_size_bytes bigint,
  upload_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_document_id uuid;
  v_document_name text;
  v_extension text;
  v_path_nonce uuid;
  v_prepared_at timestamptz;
  v_upload_expires_at timestamptz;
  v_storage_path text;
begin
  if p_student_id is null
    or not exists (
      select 1
      from public.profiles as profile
      join auth.users as auth_user on auth_user.id = profile.id
      where profile.id = p_student_id
        and profile.role = 'student'::public.user_role
        and profile.is_active is true
        and auth_user.email_confirmed_at is not null
    ) then
    raise exception using errcode = '42501',
      message = 'Achievement evidence upload could not be prepared.';
  end if;

  v_document_name := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_document_name), '[[:space:]]+', ' ', 'g'
    ),
    ''
  );
  if p_achievement_id is null
    or not exists (
      select 1
      from public.student_achievements as achievement
      where achievement.id = p_achievement_id
        and achievement.student_id = p_student_id
    )
    or v_document_name is null
    or pg_catalog.char_length(v_document_name) > 255
    or v_document_name ~ '[/\\]'
    or v_document_name ~ '[[:cntrl:]]'
    or v_document_name ~ U&'[\0080-\009F\00AD\061C\180E\200B-\200F\202A-\202E\2060-\206F\FEFF]'
    or p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png')
    or p_file_size_bytes not between 1 and 10485760 then
    raise exception using errcode = '22023',
      message = 'Achievement evidence upload could not be prepared.';
  end if;

  v_extension := pg_catalog.lower(
    pg_catalog.regexp_replace(v_document_name, '^.*[.]', '')
  );
  if v_extension = v_document_name
    or not (
      (p_mime_type = 'application/pdf' and v_extension = 'pdf')
      or (p_mime_type = 'image/jpeg' and v_extension in ('jpg', 'jpeg'))
      or (p_mime_type = 'image/png' and v_extension = 'png')
    ) then
    raise exception using errcode = '22023',
      message = 'Achievement evidence upload could not be prepared.';
  end if;

  v_document_id := pg_catalog.gen_random_uuid();
  v_path_nonce := pg_catalog.gen_random_uuid();
  v_prepared_at := pg_catalog.statement_timestamp();
  v_upload_expires_at := v_prepared_at + interval '2 hours';
  v_storage_path := pg_catalog.concat(
    p_student_id::text,
    '/',
    p_achievement_id::text,
    '/',
    v_document_id::text,
    '/',
    v_path_nonce::text,
    '/',
    v_document_id::text,
    '.',
    v_extension
  );

  insert into public.student_achievement_documents (
    id,
    achievement_id,
    achievement_reference_id,
    student_id,
    document_name,
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
    p_achievement_id,
    p_achievement_id,
    p_student_id,
    v_document_name,
    'student-achievement-documents',
    v_storage_path,
    p_mime_type,
    p_file_size_bytes,
    'pending'::public.student_achievement_document_status,
    p_student_id,
    v_prepared_at,
    v_upload_expires_at,
    v_prepared_at,
    v_prepared_at
  );

  return query
  select document.id, document.achievement_id, document.document_name,
    document.bucket_id, document.storage_path, document.mime_type,
    document.file_size_bytes, document.upload_expires_at
  from public.student_achievement_documents as document
  where document.id = v_document_id;
exception
  when insufficient_privilege or invalid_parameter_value then raise;
  when others then
    raise exception using errcode = 'P0001',
      message = 'Achievement evidence upload could not be prepared.';
end;
$function$;

create function public.authorize_student_achievement_document_validation(
  p_document_id uuid
)
returns table (
  document_id uuid,
  bucket_id text,
  storage_path text,
  mime_type text,
  file_size_bytes bigint
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
      message = 'Achievement evidence upload could not be validated.';
  end if;

  return query
  select document.id, document.bucket_id, document.storage_path,
    document.mime_type, document.file_size_bytes
  from public.student_achievement_documents as document
  join public.student_achievements as achievement
    on achievement.id = document.achievement_id
   and achievement.student_id = document.student_id
  where document.id = p_document_id
    and document.student_id = v_caller_id
    and document.uploaded_by = v_caller_id
    and document.status = 'pending'::public.student_achievement_document_status
    and document.upload_expires_at > pg_catalog.statement_timestamp()
  limit 1;

  if not found then
    raise exception using errcode = '22023',
      message = 'Achievement evidence upload could not be validated.';
  end if;
end;
$function$;

create function public.record_student_achievement_document_signature_validation(
  p_document_id uuid,
  p_student_id uuid,
  p_detected_mime_type text,
  p_detected_size_bytes bigint
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_document public.student_achievement_documents%rowtype;
  v_actual_size bigint;
  v_actual_mime_type text;
  v_actual_owner_id text;
begin
  select document.* into v_document
  from public.student_achievement_documents as document
  where document.id = p_document_id
    and document.student_id = p_student_id
    and document.uploaded_by = p_student_id
    and document.status = 'pending'::public.student_achievement_document_status
  for update;

  select
    case
      when coalesce(storage_object.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (storage_object.metadata ->> 'size')::bigint
      else null
    end,
    nullif(pg_catalog.lower(storage_object.metadata ->> 'mimetype'), ''),
    nullif(storage_object.owner_id, '')
  into v_actual_size, v_actual_mime_type, v_actual_owner_id
  from storage.objects as storage_object
  where storage_object.bucket_id = v_document.bucket_id
    and storage_object.name = v_document.storage_path;

  if not found
    or v_document.upload_expires_at <= pg_catalog.statement_timestamp()
    or p_detected_mime_type not in (
      'application/pdf', 'image/jpeg', 'image/png'
    )
    or p_detected_mime_type <> v_document.mime_type
    or p_detected_size_bytes <> v_document.file_size_bytes
    or v_actual_size <> v_document.file_size_bytes
    or v_actual_mime_type <> v_document.mime_type
    or v_actual_owner_id <> p_student_id::text then
    raise exception using errcode = '22023',
      message = 'Achievement evidence signature validation could not be recorded.';
  end if;

  update public.student_achievement_documents as document
  set detected_mime_type = p_detected_mime_type,
      signature_validated_at = pg_catalog.statement_timestamp(),
      updated_at = pg_catalog.statement_timestamp()
  where document.id = v_document.id;
end;
$function$;

create function public.reject_student_achievement_document_signature(
  p_document_id uuid,
  p_student_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_document public.student_achievement_documents%rowtype;
  v_now timestamptz;
begin
  select document.* into v_document
  from public.student_achievement_documents as document
  where document.id = p_document_id
    and document.student_id = p_student_id
    and document.uploaded_by = p_student_id
    and document.status = 'pending'::public.student_achievement_document_status
  for update;

  if not found then
    raise exception using errcode = '22023',
      message = 'Invalid achievement evidence could not be rejected.';
  end if;

  v_now := pg_catalog.statement_timestamp();

  update public.student_achievement_documents as document
  set status = 'removal_pending'::public.student_achievement_document_status,
      removal_requested_at = v_now,
      removal_reason =
        'invalid_file'::public.student_achievement_document_removal_reason,
      removed_at = null,
      removed_by = null,
      updated_at = v_now
  where document.id = v_document.id;
end;
$function$;

create function public.finalize_student_achievement_document_upload(
  p_document_id uuid
)
returns table (
  document_id uuid,
  achievement_id uuid,
  document_name text,
  mime_type text,
  file_size_bytes bigint,
  status public.student_achievement_document_status,
  prepared_at timestamptz,
  upload_expires_at timestamptz,
  available_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_document public.student_achievement_documents%rowtype;
  v_actual_size bigint;
  v_actual_mime_type text;
  v_actual_owner_id text;
  v_available_at timestamptz;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    raise exception using errcode = '42501',
      message = 'Achievement evidence upload could not be finalized.';
  end if;

  select document.* into v_document
  from public.student_achievement_documents as document
  where document.id = p_document_id
  for update;

  select
    case
      when coalesce(storage_object.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (storage_object.metadata ->> 'size')::bigint
      else null
    end,
    nullif(pg_catalog.lower(storage_object.metadata ->> 'mimetype'), ''),
    nullif(storage_object.owner_id, '')
  into v_actual_size, v_actual_mime_type, v_actual_owner_id
  from storage.objects as storage_object
  where storage_object.bucket_id = v_document.bucket_id
    and storage_object.name = v_document.storage_path;

  if not found
    or v_document.student_id <> v_caller_id
    or v_document.uploaded_by <> v_caller_id
    or v_document.status <>
      'pending'::public.student_achievement_document_status
    or v_document.upload_expires_at <= pg_catalog.statement_timestamp()
    or not exists (
      select 1
      from public.student_achievements as achievement
      where achievement.id = v_document.achievement_id
        and achievement.student_id = v_caller_id
    )
    or v_actual_size is null
    or v_actual_size <> v_document.file_size_bytes
    or v_actual_size not between 1 and 10485760
    or v_actual_mime_type is null
    or v_actual_mime_type <> v_document.mime_type
    or v_actual_mime_type not in (
      'application/pdf', 'image/jpeg', 'image/png'
    )
    or v_document.detected_mime_type is distinct from v_document.mime_type
    or v_document.signature_validated_at is null
    or v_document.signature_validated_at < v_document.prepared_at
    or v_document.signature_validated_at > pg_catalog.statement_timestamp()
    or v_actual_owner_id is null
    or v_actual_owner_id <> v_caller_id::text then
    raise exception using errcode = '22023',
      message = 'Achievement evidence upload could not be finalized.';
  end if;

  v_available_at := pg_catalog.statement_timestamp();
  update public.student_achievement_documents as document
  set status = 'available'::public.student_achievement_document_status,
      available_at = v_available_at,
      updated_at = v_available_at
  where document.id = v_document.id;

  return query
  select document.id, document.achievement_id, document.document_name,
    document.mime_type, document.file_size_bytes, document.status,
    document.prepared_at, document.upload_expires_at,
    document.available_at
  from public.student_achievement_documents as document
  where document.id = v_document.id;
exception
  when insufficient_privilege or invalid_parameter_value then raise;
  when others then
    raise exception using errcode = 'P0001',
      message = 'Achievement evidence upload could not be finalized.';
end;
$function$;

create function public.list_my_student_achievement_documents()
returns table (
  document_id uuid,
  achievement_id uuid,
  document_name text,
  mime_type text,
  file_size_bytes bigint,
  status public.student_achievement_document_status,
  prepared_at timestamptz,
  upload_expires_at timestamptz,
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
      message = 'Achievement evidence is temporarily unavailable.';
  end if;

  return query
  select document.id, document.achievement_id, document.document_name,
    document.mime_type, document.file_size_bytes, document.status,
    document.prepared_at, document.upload_expires_at,
    document.available_at
  from public.student_achievement_documents as document
  where document.student_id = v_caller_id
    and document.status in (
      'pending'::public.student_achievement_document_status,
      'available'::public.student_achievement_document_status,
      'removal_pending'::public.student_achievement_document_status
    )
  order by coalesce(document.available_at, document.prepared_at) desc,
    document.id desc
  limit 500;
end;
$function$;

create function public.list_primary_counselor_student_achievement_documents(
  p_student_id uuid
)
returns table (
  document_id uuid,
  achievement_id uuid,
  document_name text,
  mime_type text,
  file_size_bytes bigint,
  status public.student_achievement_document_status,
  prepared_at timestamptz,
  upload_expires_at timestamptz,
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
      message = 'Achievement evidence is temporarily unavailable.';
  end if;

  return query
  select document.id, document.achievement_id, document.document_name,
    document.mime_type, document.file_size_bytes, document.status,
    document.prepared_at, document.upload_expires_at,
    document.available_at
  from public.student_achievement_documents as document
  where document.student_id = p_student_id
    and document.status = 'available'::public.student_achievement_document_status
  order by document.available_at desc, document.id desc
  limit 500;
end;
$function$;

create function public.authorize_student_achievement_document_view(
  p_student_id uuid,
  p_achievement_id uuid,
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
  v_student_id uuid;
  v_student_allowed boolean;
  v_counselor_allowed boolean;
begin
  v_caller_id := (select auth.uid());
  select document.student_id into v_student_id
  from public.student_achievement_documents as document
  where document.id = p_document_id
    and document.student_id = p_student_id
    and document.achievement_id = p_achievement_id
    and document.status = 'available'::public.student_achievement_document_status;

  v_student_allowed :=
    v_caller_id = v_student_id
    and public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is true;
  v_counselor_allowed :=
    public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is true
    and public.is_active_primary_counselor_for_student(
      v_student_id
    ) is true;

  if v_caller_id is null
    or v_student_id is null
    or (v_student_allowed is not true and v_counselor_allowed is not true) then
    raise exception using errcode = '42501',
      message = 'Achievement evidence could not be opened.';
  end if;

  return query
  select document.id, document.bucket_id, document.storage_path,
    document.mime_type
  from public.student_achievement_documents as document
  where document.id = p_document_id
    and document.achievement_id = p_achievement_id
    and document.student_id = v_student_id
    and document.status = 'available'::public.student_achievement_document_status
  limit 1;
end;
$function$;

create function public.authorize_student_achievement_document_delete(
  p_document_id uuid,
  p_expected_status public.student_achievement_document_status
)
returns table (
  document_id uuid,
  bucket_id text,
  storage_path text,
  storage_object_exists boolean,
  removed_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_document public.student_achievement_documents%rowtype;
  v_now timestamptz;
  v_object_exists boolean;
  v_removal_reason public.student_achievement_document_removal_reason;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    raise exception using errcode = '42501',
      message = 'Achievement evidence could not be deleted.';
  end if;

  select document.* into v_document
  from public.student_achievement_documents as document
  where document.id = p_document_id
    and document.student_id = v_caller_id
    and document.status = p_expected_status
    and document.status in (
      'pending'::public.student_achievement_document_status,
      'available'::public.student_achievement_document_status,
      'removal_pending'::public.student_achievement_document_status
    )
  for update;

  if not found then
    raise exception using errcode = '22023',
      message = 'Achievement evidence could not be deleted.';
  end if;

  v_object_exists := exists (
    select 1
    from storage.objects as storage_object
    where storage_object.bucket_id = v_document.bucket_id
      and storage_object.name = v_document.storage_path
  );
  v_now := pg_catalog.statement_timestamp();
  v_removal_reason := case
    when v_document.status =
      'available'::public.student_achievement_document_status
      then 'student_delete'::public.student_achievement_document_removal_reason
    when v_document.status =
      'pending'::public.student_achievement_document_status
      then 'pending_cancel'::public.student_achievement_document_removal_reason
    else v_document.removal_reason
  end;

  update public.student_achievement_documents as document
  set status = 'removal_pending'::public.student_achievement_document_status,
      removal_requested_at = v_now,
      removal_reason = v_removal_reason,
      removed_at = null,
      removed_by = null,
      updated_at = v_now
  where document.id = v_document.id;

  return query
  select v_document.id, v_document.bucket_id, v_document.storage_path,
    v_object_exists, null::timestamptz;
end;
$function$;

create function public.finalize_student_achievement_document_delete(
  p_document_id uuid
)
returns table (document_id uuid, removed_at timestamptz)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_document public.student_achievement_documents%rowtype;
  v_removed_at timestamptz;
begin
  v_caller_id := (select auth.uid());
  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    raise exception using errcode = '42501',
      message = 'Achievement evidence could not be deleted.';
  end if;

  select document.* into v_document
  from public.student_achievement_documents as document
  where document.id = p_document_id
  for update;

  if not found
    or v_document.student_id <> v_caller_id
    or v_document.status <>
      'removal_pending'::public.student_achievement_document_status
    or exists (
      select 1
      from storage.objects as storage_object
      where storage_object.bucket_id = v_document.bucket_id
        and storage_object.name = v_document.storage_path
    ) then
    raise exception using errcode = '22023',
      message = 'Achievement evidence could not be deleted.';
  end if;

  v_removed_at := pg_catalog.statement_timestamp();
  update public.student_achievement_documents as document
  set status = 'removed'::public.student_achievement_document_status,
      removed_at = v_removed_at,
      removed_by = v_caller_id,
      updated_at = v_removed_at
  where document.id = v_document.id;

  return query select v_document.id, v_removed_at;
exception
  when insufficient_privilege or invalid_parameter_value then raise;
  when others then
    raise exception using errcode = 'P0001',
      message = 'Achievement evidence could not be deleted.';
end;
$function$;

create function public.can_upload_student_achievement_document_object(
  p_bucket_id text,
  p_storage_path text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_document_id uuid;
begin
  v_caller_id := (select auth.uid());
  if p_bucket_id <> 'student-achievement-documents'
    or v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    return false;
  end if;

  -- Held through the Storage INSERT commit. Cancellation and finalization lock
  -- the same row, so whichever transition wins is authoritative.
  select document.id into v_document_id
  from public.student_achievement_documents as document
  join public.student_achievements as achievement
    on achievement.id = document.achievement_id
   and achievement.student_id = document.student_id
  where document.bucket_id = p_bucket_id
    and document.storage_path = p_storage_path
    and document.student_id = v_caller_id
    and document.uploaded_by = v_caller_id
    and document.status = 'pending'::public.student_achievement_document_status
    and document.upload_expires_at > pg_catalog.statement_timestamp()
  for update of document;

  return found and v_document_id is not null;
exception when others then return false;
end;
$function$;

create function public.can_view_student_achievement_document_object(
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
  if p_bucket_id <> 'student-achievement-documents' then return false; end if;
  select document.student_id into v_student_id
  from public.student_achievement_documents as document
  where document.bucket_id = p_bucket_id
    and document.storage_path = p_storage_path
    and document.status = 'available'::public.student_achievement_document_status;
  if not found then return false; end if;
  return (
    (
      v_student_id = (select auth.uid())
      and public.has_active_verified_kgeo_role(
        'student'::public.user_role
      ) is true
    )
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

create function public.can_delete_student_achievement_document_object(
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
  return p_bucket_id = 'student-achievement-documents'
    and public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is true
    and exists (
      select 1
      from public.student_achievement_documents as document
      where document.bucket_id = p_bucket_id
        and document.storage_path = p_storage_path
        and document.student_id = (select auth.uid())
        and document.status =
          'removal_pending'::public.student_achievement_document_status
        and document.removal_requested_at >
          pg_catalog.statement_timestamp() - interval '5 minutes'
    );
exception when others then return false;
end;
$function$;

alter function public.prepare_student_achievement_document_upload(
  uuid, uuid, text, text, bigint
) owner to postgres;
alter function public.authorize_student_achievement_document_validation(uuid)
  owner to postgres;
alter function public.record_student_achievement_document_signature_validation(
  uuid, uuid, text, bigint
) owner to postgres;
alter function public.reject_student_achievement_document_signature(uuid, uuid)
  owner to postgres;
alter function public.finalize_student_achievement_document_upload(uuid)
  owner to postgres;
alter function public.list_my_student_achievement_documents()
  owner to postgres;
alter function public.list_primary_counselor_student_achievement_documents(uuid)
  owner to postgres;
alter function public.authorize_student_achievement_document_view(uuid, uuid, uuid)
  owner to postgres;
alter function public.authorize_student_achievement_document_delete(
  uuid, public.student_achievement_document_status
)
  owner to postgres;
alter function public.finalize_student_achievement_document_delete(uuid)
  owner to postgres;
alter function public.can_upload_student_achievement_document_object(text, text)
  owner to postgres;
alter function public.can_view_student_achievement_document_object(text, text)
  owner to postgres;
alter function public.can_delete_student_achievement_document_object(text, text)
  owner to postgres;
alter function private.enforce_student_achievement_document_owner()
  owner to postgres;
alter function private.protect_achievement_with_active_evidence()
  owner to postgres;

revoke all privileges on table public.student_achievement_documents
  from public, anon, authenticated, service_role;
revoke all privileges on type public.student_achievement_document_status
  from public, anon, authenticated, service_role;
revoke all privileges on type public.student_achievement_document_removal_reason
  from public, anon, authenticated, service_role;

revoke all on function public.prepare_student_achievement_document_upload(
  uuid, uuid, text, text, bigint
) from public, anon, authenticated, service_role;
revoke all on function public.authorize_student_achievement_document_validation(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.record_student_achievement_document_signature_validation(
  uuid, uuid, text, bigint
) from public, anon, authenticated, service_role;
revoke all on function public.reject_student_achievement_document_signature(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_student_achievement_document_upload(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.list_my_student_achievement_documents()
  from public, anon, authenticated, service_role;
revoke all on function public.list_primary_counselor_student_achievement_documents(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_student_achievement_document_view(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_student_achievement_document_delete(
  uuid, public.student_achievement_document_status
)
  from public, anon, authenticated, service_role;
revoke all on function public.finalize_student_achievement_document_delete(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_upload_student_achievement_document_object(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.can_view_student_achievement_document_object(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.can_delete_student_achievement_document_object(text, text)
  from public, anon, authenticated, service_role;
revoke all on function private.enforce_student_achievement_document_owner()
  from public, anon, authenticated, service_role;
revoke all on function private.protect_achievement_with_active_evidence()
  from public, anon, authenticated, service_role;

grant usage on type public.student_achievement_document_status
  to authenticated;
grant execute on function public.prepare_student_achievement_document_upload(
  uuid, uuid, text, text, bigint
) to service_role;
grant execute on function public.authorize_student_achievement_document_validation(uuid)
  to authenticated;
grant execute on function public.record_student_achievement_document_signature_validation(
  uuid, uuid, text, bigint
) to service_role;
grant execute on function public.reject_student_achievement_document_signature(uuid, uuid)
  to service_role;
grant execute on function public.finalize_student_achievement_document_upload(uuid)
  to authenticated;
grant execute on function public.list_my_student_achievement_documents()
  to authenticated;
grant execute on function public.list_primary_counselor_student_achievement_documents(uuid)
  to authenticated;
grant execute on function public.authorize_student_achievement_document_view(uuid, uuid, uuid)
  to authenticated;
grant execute on function public.authorize_student_achievement_document_delete(
  uuid, public.student_achievement_document_status
)
  to authenticated;
grant execute on function public.finalize_student_achievement_document_delete(uuid)
  to authenticated;
grant execute on function public.can_upload_student_achievement_document_object(text, text)
  to authenticated;
grant execute on function public.can_view_student_achievement_document_object(text, text)
  to authenticated;
grant execute on function public.can_delete_student_achievement_document_object(text, text)
  to authenticated;

comment on table public.student_achievement_documents is
  'Private optional evidence linked to Student achievements; detected MIME records server-side file-family signature validation, not antivirus or malware scanning; isolated from all other K-GEO document systems.';

commit;
