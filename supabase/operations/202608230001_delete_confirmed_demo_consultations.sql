-- K-GEO Step 4.5D one-time staging demo consultation cleanup.
-- OWNER-RUN OPERATION ONLY. This is not a migration or product delete API.
-- Review immediately before execution. Any catalog or data drift fails closed.

begin;

lock table public.consultation_requests in share row exclusive mode;
lock table public.counselor_student_notes in share row exclusive mode;
lock table public.counselor_follow_ups in access exclusive mode;

create temporary table kgeo_demo_consultation_targets (
  consultation_id uuid primary key,
  request_number text unique not null
) on commit drop;

create temporary table kgeo_demo_follow_up_snapshot (
  follow_up_id uuid primary key,
  request_number text not null,
  protected_row jsonb not null
) on commit drop;

do $cleanup$
declare
  v_target_count bigint;
  v_deleted_count bigint;
  v_fk_count bigint;
  v_note_count bigint;
  v_follow_up_count bigint;
  v_follow_up_trigger_count bigint;
  v_preserved_follow_up_count bigint;
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
      message = 'Consultation dependency catalog does not match the reviewed cleanup contract';
  end if;

  select pg_catalog.count(*)
  into v_follow_up_trigger_count
  from pg_catalog.pg_trigger as trigger_record
  where trigger_record.tgrelid =
      'public.counselor_follow_ups'::pg_catalog.regclass
    and trigger_record.tgisinternal is false;

  if v_follow_up_trigger_count <> 3
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.counselor_follow_ups'::pg_catalog.regclass
        and trigger_record.tgname = 'counselor_follow_ups_10_prepare'
        and trigger_record.tgfoid =
          'public.prepare_counselor_private_record()'::pg_catalog.regprocedure
        and trigger_record.tgtype = 23
        and trigger_record.tgenabled = 'O'
        and trigger_record.tgisinternal is false
    )
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.counselor_follow_ups'::pg_catalog.regclass
        and trigger_record.tgname = 'counselor_follow_ups_20_normalize'
        and trigger_record.tgfoid =
          'public.normalize_counselor_follow_up()'::pg_catalog.regprocedure
        and trigger_record.tgtype = 23
        and trigger_record.tgenabled = 'O'
        and trigger_record.tgisinternal is false
    )
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.counselor_follow_ups'::pg_catalog.regclass
        and trigger_record.tgname =
          'enforce_primary_counselor_case_on_follow_ups'
        and trigger_record.tgfoid =
          'public.enforce_primary_counselor_student_case_row()'::pg_catalog.regprocedure
        and trigger_record.tgtype = 31
        and trigger_record.tgenabled = 'O'
        and trigger_record.tgisinternal is false
    ) then
    raise exception using
      errcode = '55000',
      message = 'Follow-up trigger catalog does not match the reviewed cleanup contract';
  end if;

  insert into pg_temp.kgeo_demo_consultation_targets (
    consultation_id,
    request_number
  )
  select
    request.id,
    request.request_number
  from public.consultation_requests as request
  inner join (
    values
      ('KGEOC-2026-000003'::text, date '2026-07-20', time '14:30', time '15:00'),
      ('KGEOC-2026-000006'::text, date '2026-08-05', time '15:00', time '15:30'),
      ('KGEOC-2026-000007'::text, date '2026-08-13', time '14:00', time '14:30'),
      ('KGEOC-2026-000008'::text, date '2026-08-20', time '15:30', time '16:00')
  ) as expected(request_number, consultation_date, slot_start, slot_end)
    on expected.request_number = request.request_number
    and expected.consultation_date = request.consultation_date
    and expected.slot_start = request.slot_start
    and expected.slot_end = request.slot_end
  where request.status = 'scheduled'::public.consultation_status
    and request.assigned_counselor_id is not null
    and request.assigned_at is not null
    and request.consultation_date is not null
    and request.slot_start is not null
    and request.slot_end is not null
    and request.outcome_recorded_at is null
    and request.outcome_recorded_by is null
    and request.request_number <> 'KGEOC-2026-000005'
    and (
      request.consultation_date < (
        pg_catalog.statement_timestamp()
          at time zone 'Asia/Kolkata'
      )::date
      or (
        request.consultation_date = (
          pg_catalog.statement_timestamp()
            at time zone 'Asia/Kolkata'
        )::date
        and request.slot_end <= (
          pg_catalog.statement_timestamp()
            at time zone 'Asia/Kolkata'
        )::time
      )
    )
  order by request.request_number
  for update of request;

  get diagnostics v_target_count = row_count;
  if v_target_count <> 4 then
    raise exception using
      errcode = '55000',
      message = 'Expected exactly four reviewed demo consultations';
  end if;

  perform 1
  from public.consultation_requests as protected_future
  where protected_future.request_number = 'KGEOC-2026-000005'
    and protected_future.consultation_date = date '2027-02-22'
    and protected_future.slot_start = time '15:30'
    and protected_future.slot_end = time '16:00'
    and protected_future.status = 'scheduled'::public.consultation_status
  for key share;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'The protected future consultation does not match the reviewed state';
  end if;

  select pg_catalog.count(*)
  into v_note_count
  from public.counselor_student_notes as note
  inner join pg_temp.kgeo_demo_consultation_targets as target
    on target.consultation_id = note.consultation_id;

  if v_note_count <> 0 then
    raise exception using
      errcode = '55000',
      message = 'Unexpected private-note dependencies block demo cleanup';
  end if;

  insert into pg_temp.kgeo_demo_follow_up_snapshot (
    follow_up_id,
    request_number,
    protected_row
  )
  select
    follow_up.id,
    target.request_number,
    pg_catalog.to_jsonb(follow_up) - 'consultation_id'
  from public.counselor_follow_ups as follow_up
  inner join pg_temp.kgeo_demo_consultation_targets as target
    on target.consultation_id = follow_up.consultation_id
  order by target.request_number, follow_up.id
  for update of follow_up;

  get diagnostics v_follow_up_count = row_count;
  if v_follow_up_count <> 2
    or not exists (
      select 1
      from pg_temp.kgeo_demo_follow_up_snapshot as snapshot
      inner join public.counselor_follow_ups as follow_up
        on follow_up.id = snapshot.follow_up_id
      where snapshot.request_number = 'KGEOC-2026-000003'
        and follow_up.status =
          'cancelled'::public.counselor_follow_up_status
    )
    or not exists (
      select 1
      from pg_temp.kgeo_demo_follow_up_snapshot as snapshot
      inner join public.counselor_follow_ups as follow_up
        on follow_up.id = snapshot.follow_up_id
      where snapshot.request_number = 'KGEOC-2026-000007'
        and follow_up.status =
          'completed'::public.counselor_follow_up_status
    ) then
    raise exception using
      errcode = '55000',
      message = 'Follow-up dependencies do not match the reviewed cleanup contract';
  end if;

  alter table public.counselor_follow_ups
    disable trigger counselor_follow_ups_10_prepare;
  alter table public.counselor_follow_ups
    disable trigger counselor_follow_ups_20_normalize;
  alter table public.counselor_follow_ups
    disable trigger enforce_primary_counselor_case_on_follow_ups;

  update public.counselor_follow_ups as follow_up
  set consultation_id = null
  from pg_temp.kgeo_demo_follow_up_snapshot as snapshot
  where follow_up.id = snapshot.follow_up_id;

  get diagnostics v_preserved_follow_up_count = row_count;
  if v_preserved_follow_up_count <> 2 then
    raise exception using
      errcode = '55000',
      message = 'Expected exactly two preserved follow-up links to be cleared';
  end if;

  alter table public.counselor_follow_ups
    enable trigger counselor_follow_ups_10_prepare;
  alter table public.counselor_follow_ups
    enable trigger counselor_follow_ups_20_normalize;
  alter table public.counselor_follow_ups
    enable trigger enforce_primary_counselor_case_on_follow_ups;

  select pg_catalog.count(*)
  into v_follow_up_trigger_count
  from pg_catalog.pg_trigger as trigger_record
  where trigger_record.tgrelid =
      'public.counselor_follow_ups'::pg_catalog.regclass
    and trigger_record.tgisinternal is false;

  if v_follow_up_trigger_count <> 3
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.counselor_follow_ups'::pg_catalog.regclass
        and trigger_record.tgname = 'counselor_follow_ups_10_prepare'
        and trigger_record.tgfoid =
          'public.prepare_counselor_private_record()'::pg_catalog.regprocedure
        and trigger_record.tgtype = 23
        and trigger_record.tgenabled = 'O'
        and trigger_record.tgisinternal is false
    )
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.counselor_follow_ups'::pg_catalog.regclass
        and trigger_record.tgname = 'counselor_follow_ups_20_normalize'
        and trigger_record.tgfoid =
          'public.normalize_counselor_follow_up()'::pg_catalog.regprocedure
        and trigger_record.tgtype = 23
        and trigger_record.tgenabled = 'O'
        and trigger_record.tgisinternal is false
    )
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.counselor_follow_ups'::pg_catalog.regclass
        and trigger_record.tgname =
          'enforce_primary_counselor_case_on_follow_ups'
        and trigger_record.tgfoid =
          'public.enforce_primary_counselor_student_case_row()'::pg_catalog.regprocedure
        and trigger_record.tgtype = 31
        and trigger_record.tgenabled = 'O'
        and trigger_record.tgisinternal is false
    ) then
    raise exception using
      errcode = '55000',
      message = 'Follow-up triggers were not restored to the reviewed enabled state';
  end if;

  if exists (
    select 1
    from pg_temp.kgeo_demo_follow_up_snapshot as snapshot
    left join public.counselor_follow_ups as follow_up
      on follow_up.id = snapshot.follow_up_id
    where follow_up.id is null
      or follow_up.consultation_id is not null
      or (pg_catalog.to_jsonb(follow_up) - 'consultation_id')
        is distinct from snapshot.protected_row
  ) then
    raise exception using
      errcode = '55000',
      message = 'Preserved follow-up data changed outside the reviewed optional link';
  end if;

  delete from public.consultation_requests as request
  using pg_temp.kgeo_demo_consultation_targets as target
  where request.id = target.consultation_id
    and request.request_number = target.request_number;

  get diagnostics v_deleted_count = row_count;
  if v_deleted_count <> 4 then
    raise exception using
      errcode = '55000',
      message = 'Expected exactly four reviewed demo consultations to be deleted';
  end if;

  if exists (
    select 1
    from public.consultation_requests as request
    where request.request_number in (
      'KGEOC-2026-000003',
      'KGEOC-2026-000006',
      'KGEOC-2026-000007',
      'KGEOC-2026-000008'
    )
  )
    or not exists (
      select 1
      from public.consultation_requests as protected_future
      where protected_future.request_number = 'KGEOC-2026-000005'
        and protected_future.consultation_date = date '2027-02-22'
        and protected_future.slot_start = time '15:30'
        and protected_future.slot_end = time '16:00'
        and protected_future.status = 'scheduled'::public.consultation_status
    ) then
    raise exception using
      errcode = '55000',
      message = 'Post-cleanup consultation verification failed';
  end if;
end;
$cleanup$;

commit;
