-- K-GEO automatic-allocation cutover: one-time retired queue cleanup.
-- OWNER-RUN OPERATION ONLY. Exact reviewed targets; no product delete API.

begin;

lock table public.consultation_requests in share row exclusive mode;
lock table public.counselor_student_notes in share row exclusive mode;
lock table public.counselor_follow_ups in share row exclusive mode;

create temporary table kgeo_legacy_pending_targets (
  consultation_id uuid primary key,
  request_number text unique not null
) on commit drop;

do $cleanup$
declare
  v_fk_count bigint;
  v_target_count bigint;
  v_note_count bigint;
  v_follow_up_count bigint;
  v_deleted_count bigint;
begin
  select pg_catalog.count(*)
  into v_fk_count
  from pg_catalog.pg_constraint as constraint_record
  where constraint_record.contype = 'f'
    and constraint_record.confrelid =
      'public.consultation_requests'::pg_catalog.regclass;

  if v_fk_count <> 2
    or not exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conname =
          'counselor_student_notes_consultation_id_fkey'
        and constraint_record.conrelid =
          'public.counselor_student_notes'::pg_catalog.regclass
        and constraint_record.confrelid =
          'public.consultation_requests'::pg_catalog.regclass
        and constraint_record.contype = 'f'
        and constraint_record.confdeltype = 'n'
    )
    or not exists (
      select 1
      from pg_catalog.pg_constraint as constraint_record
      where constraint_record.conname =
          'counselor_follow_ups_consultation_id_fkey'
        and constraint_record.conrelid =
          'public.counselor_follow_ups'::pg_catalog.regclass
        and constraint_record.confrelid =
          'public.consultation_requests'::pg_catalog.regclass
        and constraint_record.contype = 'f'
        and constraint_record.confdeltype = 'n'
    ) then
    raise exception using
      errcode = '55000',
      message = 'Consultation dependency catalog does not match the reviewed legacy cleanup contract';
  end if;

  insert into pg_temp.kgeo_legacy_pending_targets (
    consultation_id,
    request_number
  )
  select request.id, request.request_number
  from public.consultation_requests as request
  where request.request_number in (
      'KGEOC-2026-000001',
      'KGEOC-2026-000002'
    )
    and request.status =
      'waiting_for_assignment'::public.consultation_status
    and request.consultation_date is null
    and request.slot_start is null
    and request.slot_end is null
    and request.assigned_counselor_id is null
    and request.assigned_at is null
    and request.outcome_recorded_at is null
    and request.outcome_recorded_by is null
    and request.cancelled_at is null
    and request.cancelled_by is null
    and request.cancellation_reason is null
  order by request.request_number
  for update of request;

  get diagnostics v_target_count = row_count;
  if v_target_count <> 2 then
    raise exception using
      errcode = '55000',
      message = 'Expected exactly two reviewed legacy pending consultations';
  end if;

  perform 1
  from public.consultation_requests as protected_future
  where protected_future.request_number = 'KGEOC-2026-000005'
    and protected_future.consultation_date = date '2027-02-22'
    and protected_future.slot_start = time '15:30'
    and protected_future.slot_end = time '16:00'
    and protected_future.status =
      'scheduled'::public.consultation_status
    and protected_future.assigned_counselor_id is not null
    and protected_future.assigned_at is not null
  for key share;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'Protected consultation KGEOC-2026-000005 does not match the reviewed state';
  end if;

  select pg_catalog.count(*)
  into v_note_count
  from public.counselor_student_notes as note
  inner join pg_temp.kgeo_legacy_pending_targets as target
    on target.consultation_id = note.consultation_id;

  select pg_catalog.count(*)
  into v_follow_up_count
  from public.counselor_follow_ups as follow_up
  inner join pg_temp.kgeo_legacy_pending_targets as target
    on target.consultation_id = follow_up.consultation_id;

  if v_note_count <> 0 or v_follow_up_count <> 0 then
    raise exception using
      errcode = '55000',
      message = 'Unexpected private-record dependencies block legacy cleanup';
  end if;

  delete from public.consultation_requests as request
  using pg_temp.kgeo_legacy_pending_targets as target
  where request.id = target.consultation_id
    and request.request_number = target.request_number
    and request.status =
      'waiting_for_assignment'::public.consultation_status
    and request.consultation_date is null
    and request.slot_start is null
    and request.slot_end is null
    and request.assigned_counselor_id is null
    and request.assigned_at is null;

  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 2 then
    raise exception using
      errcode = '55000',
      message = 'Expected exactly two reviewed legacy pending consultations to be deleted';
  end if;

  if exists (
    select 1
    from public.consultation_requests as request
    where request.request_number in (
      'KGEOC-2026-000001',
      'KGEOC-2026-000002'
    )
  ) or not exists (
    select 1
    from public.consultation_requests as protected_future
    where protected_future.request_number = 'KGEOC-2026-000005'
      and protected_future.consultation_date = date '2027-02-22'
      and protected_future.slot_start = time '15:30'
      and protected_future.slot_end = time '16:00'
      and protected_future.status =
        'scheduled'::public.consultation_status
      and protected_future.assigned_counselor_id is not null
      and protected_future.assigned_at is not null
  ) then
    raise exception using
      errcode = '55000',
      message = 'Post-cleanup legacy consultation verification failed';
  end if;
end;
$cleanup$;

commit;
