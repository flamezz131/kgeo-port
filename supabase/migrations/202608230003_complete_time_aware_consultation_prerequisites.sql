-- K-GEO forward-only repair for the partially installed Step 4.5D cutover.
-- Restores only the global active-slot index and trusted prepare-insert trigger.

begin;

set local search_path = '';

do $prerequisite$
declare
  v_slot_count bigint;
begin
  if pg_catalog.to_regclass('public.consultation_requests') is null
    or pg_catalog.to_regclass('public.profiles') is null
    or pg_catalog.to_regclass('public.student_counselor_assignments') is null
    or pg_catalog.to_regclass('public.consultation_request_number_seq') is null
    or pg_catalog.to_regprocedure(
      'public.get_kgeo_consultation_slot_catalog()'
    ) is null
    or pg_catalog.to_regprocedure('auth.uid()') is null then
    raise exception using
      errcode = '55000',
      message = 'Step 4.5D repair prerequisites are incomplete';
  end if;

  select pg_catalog.count(*)
  into v_slot_count
  from public.get_kgeo_consultation_slot_catalog();

  if v_slot_count <> 16 then
    raise exception using
      errcode = '55000',
      message = 'Step 4.5D slot catalog must contain exactly sixteen slots';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute as attribute_record
    where attribute_record.attrelid =
        'public.student_counselor_assignments'::pg_catalog.regclass
      and attribute_record.attname = 'assigned_by'
      and attribute_record.attisdropped is false
  ) then
    raise exception using
      errcode = '55000',
      message = 'Primary Counselor assignment actor column is required';
  end if;

  if exists (
    select 1
    from public.consultation_requests as request
    where request.consultation_date is not null
      and request.slot_start is not null
      and request.status <> 'cancelled'::public.consultation_status
    group by request.consultation_date, request.slot_start
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '55000',
      message = 'Existing active consultation slot conflicts block Step 4.5D repair';
  end if;

  if pg_catalog.to_regclass(
    'public.consultation_requests_active_slot_key'
  ) is not null then
    raise exception using
      errcode = '55000',
      message = 'Step 4.5D active-slot index already exists unexpectedly';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger as trigger_record
    where trigger_record.tgrelid =
        'public.consultation_requests'::pg_catalog.regclass
      and trigger_record.tgname =
        'consultation_requests_prepare_insert'
      and trigger_record.tgisinternal is false
  ) then
    raise exception using
      errcode = '55000',
      message = 'Step 4.5D prepare-insert trigger already exists unexpectedly';
  end if;
end;
$prerequisite$;

-- Exact current Step 4.5D trusted insert preparation function.
create or replace function public.prepare_consultation_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requester_id uuid;
  trusted_college_email text;
  request_time timestamptz;
  business_now timestamp without time zone;
  business_today date;
  business_time time without time zone;
  request_sequence bigint;
begin
  requester_id := (select auth.uid());
  request_time := pg_catalog.statement_timestamp();
  business_now := request_time at time zone 'Asia/Kolkata';
  business_today := business_now::date;
  business_time := business_now::time;

  if requester_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to create a consultation request';
  end if;

  select profile.college_email
  into trusted_college_email
  from public.profiles as profile
  inner join auth.users as auth_user
    on auth_user.id = profile.id
  where profile.id = requester_id
    and profile.role = 'student'::public.user_role
    and profile.is_active is true
    and auth_user.email_confirmed_at is not null
  for update of profile;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'An active verified student profile is required';
  end if;

  if new.consultation_date is null or new.slot_start is null then
    raise exception using
      errcode = '23514',
      message = 'A consultation date and start time are required';
  end if;

  if not exists (
    select 1
    from public.get_kgeo_consultation_slot_catalog() as catalog
    where catalog.slot_start = new.slot_start
      and catalog.slot_end =
        (new.slot_start + interval '30 minutes')::time
  ) then
    raise exception using
      errcode = '23514',
      message = 'The consultation start time is not an approved slot';
  end if;

  -- Until per-Counselor capacity and allocation are installed, keep direct
  -- Student booking on the same six afternoon slots exposed by availability.
  if new.slot_start not in (
    time '14:00',
    time '14:30',
    time '15:00',
    time '15:30',
    time '16:00',
    time '16:30'
  ) then
    raise exception using
      errcode = '23514',
      message = 'The selected consultation slot is not currently available for booking.';
  end if;

  if new.consultation_date < business_today
    or new.consultation_date > business_today + 6 then
    raise exception using
      errcode = '23514',
      message = 'Consultations may be booked only within the next seven calendar dates';
  end if;

  if extract(isodow from new.consultation_date)
      not between 1 and 5 then
    raise exception using
      errcode = '23514',
      message = 'Consultations are available Monday through Friday';
  end if;

  if new.consultation_date = business_today
    and new.slot_start <= business_time then
    raise exception using
      errcode = '23514',
      message = 'The selected consultation slot has expired';
  end if;

  if exists (
    select 1
    from public.consultation_requests as existing
    where existing.student_id = requester_id
      and existing.status in (
        'submitted'::public.consultation_status,
        'waiting_for_assignment'::public.consultation_status,
        'counselor_assigned'::public.consultation_status,
        'scheduled'::public.consultation_status
      )
      and (
        existing.consultation_date is null
        or existing.slot_start is null
        or existing.slot_end is null
        or existing.slot_end <= existing.slot_start
        or extract(isodow from existing.consultation_date)
          not between 1 and 5
        or not exists (
          select 1
          from public.get_kgeo_consultation_slot_catalog() as catalog
          where catalog.slot_start = existing.slot_start
            and catalog.slot_end = existing.slot_end
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'An existing consultation requires operational resolution';
  end if;

  request_sequence := pg_catalog.nextval(
    'public.consultation_request_number_seq'::pg_catalog.regclass
  );

  new.student_name := pg_catalog.btrim(new.student_name);
  new.roll_number := pg_catalog.upper(pg_catalog.btrim(new.roll_number));
  new.personal_email := pg_catalog.lower(pg_catalog.btrim(new.personal_email));
  new.department := pg_catalog.btrim(new.department);
  new.course := pg_catalog.btrim(new.course);
  new.mobile_number := pg_catalog.btrim(new.mobile_number);
  new.student_id := requester_id;
  new.college_email := trusted_college_email;
  new.request_number := pg_catalog.format(
    'KGEOC-%s-%s',
    pg_catalog.to_char(request_time, 'YYYY'),
    pg_catalog.lpad(request_sequence::text, 6, '0')
  );
  new.slot_end := (new.slot_start + interval '30 minutes')::time;
  new.status := 'waiting_for_assignment'::public.consultation_status;
  new.assigned_counselor_id := null;
  new.assigned_at := null;
  new.submitted_at := request_time;
  new.created_at := request_time;
  new.updated_at := request_time;

  return new;
end;
$function$;

alter function public.prepare_consultation_request_insert()
  owner to postgres;

comment on function public.prepare_consultation_request_insert() is
  'Creates a trusted seven-day fixed-slot booking after a serialized time-aware same-Student complete-nonterminal consultation check.';

revoke all on function public.prepare_consultation_request_insert()
  from public, anon, authenticated, service_role;

-- Exact global active-slot contract retained by Step 4.5D until automatic
-- allocation replaces it with per-Counselor capacity.
create unique index consultation_requests_active_slot_key
  on public.consultation_requests (consultation_date, slot_start)
  where consultation_date is not null
    and slot_start is not null
    and status <> 'cancelled'::public.consultation_status;

comment on index public.consultation_requests_active_slot_key is
  'Allows at most one non-cancelled consultation per date and fixed start time.';

create trigger consultation_requests_prepare_insert
before insert on public.consultation_requests
for each row
execute function public.prepare_consultation_request_insert();

alter table public.consultation_requests
  enable trigger consultation_requests_prepare_insert;

do $postcondition$
begin
  if not exists (
    select 1
    from pg_catalog.pg_indexes as index_record
    where index_record.schemaname = 'public'
      and index_record.tablename = 'consultation_requests'
      and index_record.indexname =
        'consultation_requests_active_slot_key'
  )
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.consultation_requests'::pg_catalog.regclass
        and trigger_record.tgname =
          'consultation_requests_prepare_insert'
        and trigger_record.tgenabled = 'O'
        and trigger_record.tgisinternal is false
    ) then
    raise exception using
      errcode = '55000',
      message = 'Step 4.5D prerequisite repair did not install exactly';
  end if;
end;
$postcondition$;

commit;
