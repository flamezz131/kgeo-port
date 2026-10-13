-- K-GEO Phase D3.3.1 official progression evidence foundation.
-- Review this migration before applying it. Apply it only after
-- 202607250003_official_counseling_progression.sql and all earlier migrations.
--
-- The private counseling-progression-evidence bucket is intentionally not
-- created here. Create and configure it manually before applying this
-- migration. This migration stores metadata only and never mutates
-- storage.objects or storage.buckets. The two storage.objects policies must
-- be created afterward through the Supabase Dashboard-managed policy path
-- because this migration role does not own that managed relation.

begin;

create type public.counseling_progression_evidence_status as enum (
  'pending',
  'available',
  'removed'
);

comment on type public.counseling_progression_evidence_status is
  'Lifecycle for private evidence attached to one official progression event. Removed is final in the D3.3 MVP.';

create table public.student_counseling_progression_evidence (
  id uuid
    constraint student_counseling_progression_evidence_pkey primary key
    default pg_catalog.gen_random_uuid(),
  progression_event_id uuid
    constraint progression_evidence_event_id_not_null not null
    constraint progression_evidence_event_id_fkey
      references public.student_counseling_progression_events(id)
      on delete restrict,
  bucket_id text
    constraint progression_evidence_bucket_id_not_null not null
    default 'counseling-progression-evidence',
  storage_path text
    constraint progression_evidence_storage_path_not_null not null,
  original_file_name text
    constraint progression_evidence_original_name_not_null not null,
  mime_type text
    constraint progression_evidence_mime_type_not_null not null,
  file_size_bytes bigint
    constraint progression_evidence_file_size_not_null not null,
  status public.counseling_progression_evidence_status
    constraint progression_evidence_status_not_null not null
    default 'pending'::public.counseling_progression_evidence_status,
  uploaded_by uuid
    constraint progression_evidence_uploaded_by_not_null not null
    constraint progression_evidence_uploaded_by_fkey
      references public.profiles(id)
      on delete restrict,
  prepared_at timestamptz
    constraint progression_evidence_prepared_at_not_null not null,
  upload_expires_at timestamptz
    constraint progression_evidence_upload_expires_at_not_null not null,
  available_at timestamptz,
  removed_at timestamptz,
  removed_by uuid
    constraint progression_evidence_removed_by_fkey
      references public.profiles(id)
      on delete restrict,
  removal_reason text,
  created_at timestamptz
    constraint progression_evidence_created_at_not_null not null,
  updated_at timestamptz
    constraint progression_evidence_updated_at_not_null not null,

  constraint progression_evidence_bucket_check
    check (bucket_id = 'counseling-progression-evidence'),
  constraint progression_evidence_storage_path_key
    unique (storage_path),
  constraint progression_evidence_storage_path_check
    check (
      storage_path = pg_catalog.lower(storage_path)
      and storage_path ~ (
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        '[0-9a-f]{4}-[0-9a-f]{12}/'
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        '[0-9a-f]{4}-[0-9a-f]{12}/'
        '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-'
        '[0-9a-f]{4}-[0-9a-f]{12}\.'
        '(pdf|docx|jpg|jpeg|png|webp)$'
      )
      and pg_catalog.split_part(storage_path, '/', 2) =
        progression_event_id::text
      and pg_catalog.split_part(
        pg_catalog.split_part(storage_path, '/', 3),
        '.',
        1
      ) = id::text
    ),
  constraint progression_evidence_original_name_check
    check (
      pg_catalog.char_length(original_file_name) between 1 and 200
      and original_file_name = pg_catalog.regexp_replace(
        original_file_name,
        '^[[:space:]]+|[[:space:]]+$',
        '',
        'g'
      )
      and original_file_name !~ '[[:cntrl:]]'
      and pg_catalog.strpos(original_file_name, '/') = 0
      and pg_catalog.strpos(
        original_file_name,
        pg_catalog.chr(92)
      ) = 0
      and original_file_name not in ('.', '..')
      and pg_catalog.lower(
        pg_catalog.substring(original_file_name, '\.([^.]+)$')
      ) in ('pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp')
    ),
  constraint progression_evidence_mime_type_check
    check (
      mime_type in (
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg',
        'image/png',
        'image/webp'
      )
    ),
  constraint progression_evidence_mime_extension_check
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
        mime_type =
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        and pg_catalog.lower(
          pg_catalog.substring(original_file_name, '\.([^.]+)$')
        ) = 'docx'
        and pg_catalog.lower(
          pg_catalog.substring(storage_path, '\.([^.]+)$')
        ) = 'docx'
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
  constraint progression_evidence_file_size_check
    check (file_size_bytes between 1 and 10485760),
  constraint progression_evidence_upload_window_check
    check (upload_expires_at > prepared_at),
  constraint progression_evidence_status_consistency_check
    check (
      (
        status = 'pending'::public.counseling_progression_evidence_status
        and available_at is null
        and removed_at is null
        and removed_by is null
        and removal_reason is null
        and created_at = prepared_at
        and updated_at = prepared_at
      )
      or (
        status = 'available'::public.counseling_progression_evidence_status
        and available_at is not null
        and available_at >= prepared_at
        and removed_at is null
        and removed_by is null
        and removal_reason is null
        and created_at = prepared_at
        and updated_at = available_at
      )
      or (
        status = 'removed'::public.counseling_progression_evidence_status
        and available_at is not null
        and available_at >= prepared_at
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
        and created_at = prepared_at
        and updated_at = removed_at
      )
    )
);

comment on table public.student_counseling_progression_evidence is
  'Private institutional evidence metadata attached to one exact official progression event; file bytes remain in a manually configured private Storage bucket.';

comment on column
  public.student_counseling_progression_evidence.progression_event_id is
  'The exact append-only progression event supported by this evidence. Student ownership is derived through the event.';

comment on column
  public.student_counseling_progression_evidence.storage_path is
  'Database-generated private object path. It contains UUIDs only and is never accepted from the browser.';

comment on column
  public.student_counseling_progression_evidence.original_file_name is
  'Normalized counselor-visible display metadata only; never used in the object path.';

comment on column
  public.student_counseling_progression_evidence.file_size_bytes is
  'Prepared upload metadata limited to 10 MiB; the private bucket limit remains an independent authoritative boundary.';

comment on column
  public.student_counseling_progression_evidence.removal_reason is
  'Required normalized audit reason for final soft removal; it is not a private counselor note.';

create index progression_evidence_event_status_available_idx
  on public.student_counseling_progression_evidence (
    progression_event_id,
    status,
    available_at,
    id
  );

create index progression_evidence_status_expiry_idx
  on public.student_counseling_progression_evidence (
    status,
    upload_expires_at,
    id
  );

comment on index public.progression_evidence_event_status_available_idx is
  'Supports one bounded evidence query for up to twenty validated progression events and the per-event active reservation count.';

comment on index public.progression_evidence_status_expiry_idx is
  'Supports aggregate expired-pending diagnostics and a future reviewed cleanup process.';

-- SECURITY: this is the sole preparation path. It derives the counselor and
-- student, validates display metadata, acquires a per-event lock before
-- counting active reservations, and generates a UUID-only object path.
create function public.prepare_student_counseling_progression_evidence_upload(
  p_progression_event_id uuid,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns table (
  evidence_id uuid,
  progression_event_id uuid,
  bucket_id text,
  storage_path text,
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
  target_student_id uuid;
  normalized_file_name text;
  normalized_mime_type text;
  normalized_extension text;
  prepared_time timestamptz;
  new_evidence_id uuid;
  generated_storage_path text;
  active_evidence_count bigint;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or not public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  if p_progression_event_id is null then
    raise exception using
      errcode = '22023',
      message = 'The progression event is invalid';
  end if;

  select event.student_id
  into target_student_id
  from public.student_counseling_progression_events as event
  inner join public.profiles as student_profile
    on student_profile.id = event.student_id
    and student_profile.role = 'student'::public.user_role
  where event.id = p_progression_event_id;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'The progression event is invalid';
  end if;

  normalized_file_name := pg_catalog.regexp_replace(
    p_original_file_name,
    '^[[:space:]]+|[[:space:]]+$',
    '',
    'g'
  );

  if normalized_file_name is null
    or normalized_file_name = ''
    or pg_catalog.char_length(normalized_file_name) > 200
    or normalized_file_name ~ '[[:cntrl:]]'
    or pg_catalog.strpos(normalized_file_name, '/') > 0
    or pg_catalog.strpos(
      normalized_file_name,
      pg_catalog.chr(92)
    ) > 0
    or normalized_file_name in ('.', '..') then
    raise exception using
      errcode = '22023',
      message = 'The evidence filename is invalid';
  end if;

  normalized_extension := pg_catalog.lower(
    pg_catalog.substring(normalized_file_name, '\.([^.]+)$')
  );
  normalized_mime_type := pg_catalog.lower(
    pg_catalog.btrim(p_mime_type)
  );

  if normalized_extension is null
    or normalized_extension not in (
      'pdf',
      'docx',
      'jpg',
      'jpeg',
      'png',
      'webp'
    )
    or normalized_mime_type is null
    or normalized_mime_type not in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/webp'
    ) then
    raise exception using
      errcode = '22023',
      message = 'The evidence file type is unsupported';
  end if;

  if not (
    (normalized_mime_type = 'application/pdf'
      and normalized_extension = 'pdf')
    or (
      normalized_mime_type =
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      and normalized_extension = 'docx'
    )
    or (
      normalized_mime_type = 'image/jpeg'
      and normalized_extension in ('jpg', 'jpeg')
    )
    or (normalized_mime_type = 'image/png'
      and normalized_extension = 'png')
    or (normalized_mime_type = 'image/webp'
      and normalized_extension = 'webp')
  ) then
    raise exception using
      errcode = '22023',
      message = 'The filename extension does not match its MIME type';
  end if;

  if p_file_size_bytes is null
    or p_file_size_bytes < 1
    or p_file_size_bytes > 10485760 then
    raise exception using
      errcode = '22023',
      message = 'The evidence file size is invalid';
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(
      p_progression_event_id::text,
      202607260001
    )
  ) then
    raise exception using
      errcode = '40001',
      message = 'Another evidence upload is being prepared';
  end if;

  prepared_time := pg_catalog.statement_timestamp();

  select pg_catalog.count(*)
  into active_evidence_count
  from public.student_counseling_progression_evidence as evidence
  where evidence.progression_event_id = p_progression_event_id
    and (
      evidence.status =
        'available'::public.counseling_progression_evidence_status
      or (
        evidence.status =
          'pending'::public.counseling_progression_evidence_status
        and evidence.upload_expires_at > prepared_time
      )
    );

  if active_evidence_count >= 5 then
    raise exception using
      errcode = '22023',
      message = 'This progression event already has five active evidence files';
  end if;

  new_evidence_id := pg_catalog.gen_random_uuid();
  generated_storage_path :=
    target_student_id::text || '/' ||
    p_progression_event_id::text || '/' ||
    new_evidence_id::text || '.' ||
    normalized_extension;

  insert into public.student_counseling_progression_evidence (
    id,
    progression_event_id,
    bucket_id,
    storage_path,
    original_file_name,
    mime_type,
    file_size_bytes,
    status,
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
    new_evidence_id,
    p_progression_event_id,
    'counseling-progression-evidence',
    generated_storage_path,
    normalized_file_name,
    normalized_mime_type,
    p_file_size_bytes,
    'pending'::public.counseling_progression_evidence_status,
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
    evidence.id,
    evidence.progression_event_id,
    evidence.bucket_id,
    evidence.storage_path,
    evidence.original_file_name,
    evidence.mime_type,
    evidence.file_size_bytes,
    evidence.upload_expires_at
  from public.student_counseling_progression_evidence as evidence
  where evidence.id = new_evidence_id;
exception
  when insufficient_privilege or invalid_parameter_value
    or serialization_failure then
    raise;
  when unique_violation then
    raise exception using
      errcode = '40001',
      message = 'Another evidence upload is being prepared';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Evidence upload could not be prepared';
end;
$function$;

-- SECURITY: finalization accepts only the metadata UUID, locks the pending
-- row, requires the original uploader, and treats storage.objects as
-- read-only evidence that the exact generated object now exists.
create function public.finalize_student_counseling_progression_evidence_upload(
  p_evidence_id uuid
)
returns table (
  id uuid,
  progression_event_id uuid,
  bucket_id text,
  storage_path text,
  original_file_name text,
  mime_type text,
  file_size_bytes bigint,
  status public.counseling_progression_evidence_status,
  uploaded_by uuid,
  prepared_at timestamptz,
  upload_expires_at timestamptz,
  available_at timestamptz,
  removed_at timestamptz,
  removed_by uuid,
  removal_reason text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  evidence_record public.student_counseling_progression_evidence%rowtype;
  finalized_time timestamptz;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or not public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  if p_evidence_id is null then
    raise exception using
      errcode = '22023',
      message = 'The evidence upload is invalid';
  end if;

  select evidence.*
  into evidence_record
  from public.student_counseling_progression_evidence as evidence
  where evidence.id = p_evidence_id
  for update;

  if not found
    or evidence_record.uploaded_by <> caller_id
    or evidence_record.status <>
      'pending'::public.counseling_progression_evidence_status then
    raise exception using
      errcode = '22023',
      message = 'The evidence upload cannot be finalized';
  end if;

  finalized_time := pg_catalog.statement_timestamp();

  if evidence_record.upload_expires_at <= finalized_time then
    raise exception using
      errcode = '22023',
      message = 'The evidence upload intent has expired';
  end if;

  if not exists (
    select 1
    from storage.objects as storage_object
    where storage_object.bucket_id = evidence_record.bucket_id
      and storage_object.name = evidence_record.storage_path
  ) then
    raise exception using
      errcode = '22023',
      message = 'The uploaded evidence object was not found';
  end if;

  update public.student_counseling_progression_evidence as evidence
  set
    status = 'available'::public.counseling_progression_evidence_status,
    available_at = finalized_time,
    updated_at = finalized_time
  where evidence.id = evidence_record.id;

  return query
  select
    evidence.id,
    evidence.progression_event_id,
    evidence.bucket_id,
    evidence.storage_path,
    evidence.original_file_name,
    evidence.mime_type,
    evidence.file_size_bytes,
    evidence.status,
    evidence.uploaded_by,
    evidence.prepared_at,
    evidence.upload_expires_at,
    evidence.available_at,
    evidence.removed_at,
    evidence.removed_by,
    evidence.removal_reason,
    evidence.created_at,
    evidence.updated_at
  from public.student_counseling_progression_evidence as evidence
  where evidence.id = evidence_record.id;
exception
  when insufficient_privilege or invalid_parameter_value then
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Evidence upload could not be finalized';
end;
$function$;

-- SECURITY: removal is final and audit-preserving. This function never
-- deletes metadata or a Storage object. Physical deletion remains a later
-- Storage API retention operation because the installed remove contract also
-- requires SELECT, which would conflict with denying removed-object viewing.
create function public.remove_student_counseling_progression_evidence(
  p_evidence_id uuid,
  p_removal_reason text
)
returns table (
  evidence_id uuid,
  bucket_id text,
  storage_path text,
  status public.counseling_progression_evidence_status,
  removed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  evidence_record public.student_counseling_progression_evidence%rowtype;
  normalized_removal_reason text;
  removal_time timestamptz;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or not public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  if p_evidence_id is null then
    raise exception using
      errcode = '22023',
      message = 'The evidence is invalid';
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

  if normalized_removal_reason is null
    or pg_catalog.char_length(normalized_removal_reason) > 500 then
    raise exception using
      errcode = '22023',
      message = 'The evidence removal reason is invalid';
  end if;

  select evidence.*
  into evidence_record
  from public.student_counseling_progression_evidence as evidence
  where evidence.id = p_evidence_id
  for update;

  if not found
    or evidence_record.status <>
      'available'::public.counseling_progression_evidence_status then
    raise exception using
      errcode = '22023',
      message = 'The evidence cannot be removed';
  end if;

  removal_time := pg_catalog.statement_timestamp();

  update public.student_counseling_progression_evidence as evidence
  set
    status = 'removed'::public.counseling_progression_evidence_status,
    removed_at = removal_time,
    removed_by = caller_id,
    removal_reason = normalized_removal_reason,
    updated_at = removal_time
  where evidence.id = evidence_record.id;

  return query
  select
    evidence.id,
    evidence.bucket_id,
    evidence.storage_path,
    evidence.status,
    evidence.removed_at
  from public.student_counseling_progression_evidence as evidence
  where evidence.id = evidence_record.id;
exception
  when insufficient_privilege or invalid_parameter_value then
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Evidence could not be removed';
end;
$function$;

alter function
  public.prepare_student_counseling_progression_evidence_upload(
    uuid,
    text,
    text,
    bigint
  ) owner to postgres;

alter function
  public.finalize_student_counseling_progression_evidence_upload(uuid)
  owner to postgres;

alter function
  public.remove_student_counseling_progression_evidence(uuid, text)
  owner to postgres;

comment on function
  public.prepare_student_counseling_progression_evidence_upload(
    uuid,
    text,
    text,
    bigint
  ) is
  'Creates a two-hour pending upload intent for one validated progression event and returns its generated private object path.';

comment on function
  public.finalize_student_counseling_progression_evidence_upload(uuid) is
  'Finalizes the original counselor upload intent only after the exact generated private Storage object exists.';

comment on function
  public.remove_student_counseling_progression_evidence(uuid, text) is
  'Soft-removes available institutional evidence while retaining its event, upload, and removal audit metadata.';

alter table public.student_counseling_progression_evidence
  enable row level security;

revoke all privileges on table
  public.student_counseling_progression_evidence
  from public, anon, authenticated;

revoke all privileges on type
  public.counseling_progression_evidence_status
  from public, anon, authenticated;

revoke all on function
  public.prepare_student_counseling_progression_evidence_upload(
    uuid,
    text,
    text,
    bigint
  ) from public, anon, authenticated;

revoke all on function
  public.finalize_student_counseling_progression_evidence_upload(uuid)
  from public, anon, authenticated;

revoke all on function
  public.remove_student_counseling_progression_evidence(uuid, text)
  from public, anon, authenticated;

grant usage on type public.counseling_progression_evidence_status
  to authenticated;

grant select (
  id,
  progression_event_id,
  bucket_id,
  storage_path,
  original_file_name,
  mime_type,
  file_size_bytes,
  status,
  uploaded_by,
  prepared_at,
  upload_expires_at,
  available_at,
  removed_at,
  removed_by,
  removal_reason,
  created_at,
  updated_at
) on table public.student_counseling_progression_evidence
  to authenticated;

grant execute on function
  public.prepare_student_counseling_progression_evidence_upload(
    uuid,
    text,
    text,
    bigint
  ) to authenticated;

grant execute on function
  public.finalize_student_counseling_progression_evidence_upload(uuid)
  to authenticated;

grant execute on function
  public.remove_student_counseling_progression_evidence(uuid, text)
  to authenticated;

create policy progression_evidence_select_counselor
on public.student_counseling_progression_evidence
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy progression_evidence_select_counselor
  on public.student_counseling_progression_evidence is
  'Any active verified counselor may read institutional evidence metadata; students, admins, directors, and anonymous users have no policy.';

-- There is deliberately no DDL against Supabase-managed storage.objects in
-- this migration. After it succeeds, create only the reviewed authenticated
-- INSERT and SELECT policies through the Dashboard policy editor using the
-- exact predicates in docs/database.md. Do not create Storage UPDATE, DELETE,
-- anonymous, public, student, admin, or director policies. Physical purge
-- remains a separately reviewed retention operation.

commit;
