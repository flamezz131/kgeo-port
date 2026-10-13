-- K-GEO revised Step 4.5D time-aware consultation scheduling foundation.
-- This migration changes permanent contracts only and performs no data cleanup.

begin;

alter table public.consultation_requests
  drop constraint consultation_requests_slot_start_check,
  add constraint consultation_requests_slot_start_check
    check (
      slot_start is null
      or slot_start in (
        time '09:00',
        time '09:30',
        time '10:00',
        time '10:30',
        time '11:00',
        time '11:30',
        time '12:00',
        time '12:30',
        time '13:00',
        time '13:30',
        time '14:00',
        time '14:30',
        time '15:00',
        time '15:30',
        time '16:00',
        time '16:30'
      )
    );

comment on constraint consultation_requests_slot_start_check
  on public.consultation_requests is
  'Allows the sixteen canonical Monday-to-Friday 30-minute starts from 09:00 through 16:30; legacy all-null schedule tuples remain compatible.';

comment on column public.consultation_requests.slot_start is
  'Canonical K-GEO consultation start from 09:00 through 16:30 in 30-minute increments.';

create function public.get_kgeo_consultation_slot_catalog()
returns table (
  slot_ordinal smallint,
  slot_start time without time zone,
  slot_end time without time zone
)
language sql
immutable
parallel safe
set search_path = ''
as $function$
  values
    (1::smallint, time '09:00', time '09:30'),
    (2::smallint, time '09:30', time '10:00'),
    (3::smallint, time '10:00', time '10:30'),
    (4::smallint, time '10:30', time '11:00'),
    (5::smallint, time '11:00', time '11:30'),
    (6::smallint, time '11:30', time '12:00'),
    (7::smallint, time '12:00', time '12:30'),
    (8::smallint, time '12:30', time '13:00'),
    (9::smallint, time '13:00', time '13:30'),
    (10::smallint, time '13:30', time '14:00'),
    (11::smallint, time '14:00', time '14:30'),
    (12::smallint, time '14:30', time '15:00'),
    (13::smallint, time '15:00', time '15:30'),
    (14::smallint, time '15:30', time '16:00'),
    (15::smallint, time '16:00', time '16:30'),
    (16::smallint, time '16:30', time '17:00');
$function$;

alter function public.get_kgeo_consultation_slot_catalog()
  owner to postgres;

comment on function public.get_kgeo_consultation_slot_catalog() is
  'Returns the exact sixteen identity-free K-GEO consultation slots for future counselor-capacity scheduling phases.';

revoke all on function public.get_kgeo_consultation_slot_catalog()
  from public, anon, authenticated, service_role;

-- Keep the Student-facing global-capacity view on the existing six afternoon
-- slots until per-Counselor capacity is implemented. It consumes the one
-- canonical catalog but deliberately exposes only the already-approved subset.
create or replace function public.get_consultation_slot_availability(
  p_date date
)
returns table (
  slot_start time without time zone,
  slot_end time without time zone,
  availability_status public.consultation_slot_availability_status
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  requester_id uuid;
  business_now timestamp without time zone;
  business_today date;
  business_time time without time zone;
begin
  requester_id := (select auth.uid());
  business_now :=
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata';
  business_today := business_now::date;
  business_time := business_now::time;

  if requester_id is null or not exists (
    select 1
    from public.profiles as profile
    inner join auth.users as auth_user
      on auth_user.id = profile.id
    where profile.id = requester_id
      and profile.role = 'student'::public.user_role
      and profile.is_active is true
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified student profile is required';
  end if;

  if p_date is null then
    raise exception using
      errcode = '22023',
      message = 'A consultation date is required';
  end if;

  if p_date < business_today
    or p_date > business_today + 6 then
    raise exception using
      errcode = '22023',
      message = 'Consultations may be booked only within the next seven calendar dates';
  end if;

  if extract(isodow from p_date) not between 1 and 5 then
    raise exception using
      errcode = '22023',
      message = 'Consultations are available Monday through Friday';
  end if;

  return query
  select
    catalog.slot_start,
    catalog.slot_end,
    case
      when p_date = business_today
        and catalog.slot_start <= business_time
        then 'expired'::public.consultation_slot_availability_status
      when exists (
        select 1
        from public.consultation_requests as request
        where request.consultation_date = p_date
          and request.slot_start = catalog.slot_start
          and request.status <>
            'cancelled'::public.consultation_status
      )
        then 'booked'::public.consultation_slot_availability_status
      else 'available'::public.consultation_slot_availability_status
    end
  from public.get_kgeo_consultation_slot_catalog() as catalog
  where catalog.slot_start >= time '14:00'
  order by catalog.slot_ordinal;
end;
$function$;

alter function public.get_consultation_slot_availability(date)
  owner to postgres;

comment on function public.get_consultation_slot_availability(date) is
  'Returns the existing six global-capacity afternoon slots only for a weekday within the rolling seven-calendar-date booking horizon.';

revoke all on function public.get_consultation_slot_availability(date)
  from public, anon, authenticated, service_role;

grant execute on function public.get_consultation_slot_availability(date)
  to authenticated;

-- Serialize booking attempts per Student, fail closed on malformed nonterminal
-- history, ignore elapsed complete nonterminal history, and enforce the final
-- date/slot boundary immediately before the trusted insert completes.
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

-- Keep the reviewed FCFS and first-Primary-assignment transaction intact, but
-- exclude elapsed or malformed waiting rows from both the locked candidate
-- selection and the repeated mutation predicate.
create or replace function public.claim_next_consultation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_target_consultation_id uuid;
  v_target_student_id uuid;
  v_claimed_consultation_id uuid;
  v_assignment_time timestamptz;
  v_business_now timestamp without time zone;
  v_business_today date;
  v_business_time time without time zone;
begin
  v_caller_id := (select auth.uid());
  v_assignment_time := pg_catalog.statement_timestamp();
  v_business_now := v_assignment_time at time zone 'Asia/Kolkata';
  v_business_today := v_business_now::date;
  v_business_time := v_business_now::time;

  if v_caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = v_caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  select
    request.id,
    request.student_id
  into
    v_target_consultation_id,
    v_target_student_id
  from public.consultation_requests as request
  where request.status =
      'waiting_for_assignment'::public.consultation_status
    and request.assigned_counselor_id is null
    and request.consultation_date is not null
    and request.slot_start is not null
    and request.slot_end is not null
    and extract(isodow from request.consultation_date)
      between 1 and 5
    and exists (
      select 1
      from public.get_kgeo_consultation_slot_catalog() as catalog
      where catalog.slot_start = request.slot_start
        and catalog.slot_end = request.slot_end
    )
    and (
      request.consultation_date > v_business_today
      or (
        request.consultation_date = v_business_today
        and request.slot_end > v_business_time
      )
    )
  order by request.submitted_at asc, request.id asc
  limit 1
  for update;

  if not found then
    return null;
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = v_target_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '23514',
      message = 'The consultation student identity is invalid';
  end if;

  update public.consultation_requests as request
  set
    assigned_counselor_id = v_caller_id,
    assigned_at = v_assignment_time,
    status = 'scheduled'::public.consultation_status
  where request.id = v_target_consultation_id
    and request.status =
      'waiting_for_assignment'::public.consultation_status
    and request.assigned_counselor_id is null
    and request.student_id = v_target_student_id
    and request.consultation_date is not null
    and request.slot_start is not null
    and request.slot_end is not null
    and extract(isodow from request.consultation_date)
      between 1 and 5
    and exists (
      select 1
      from public.get_kgeo_consultation_slot_catalog() as catalog
      where catalog.slot_start = request.slot_start
        and catalog.slot_end = request.slot_end
    )
    and (
      request.consultation_date > v_business_today
      or (
        request.consultation_date = v_business_today
        and request.slot_end > v_business_time
      )
    )
  returning request.id into v_claimed_consultation_id;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The consultation assignment changed concurrently';
  end if;

  insert into public.student_counselor_assignments (
    student_id,
    counselor_id,
    assigned_at,
    assigned_by,
    created_at
  )
  values (
    v_target_student_id,
    v_caller_id,
    v_assignment_time,
    v_caller_id,
    v_assignment_time
  )
  on conflict (student_id) where ended_at is null
  do nothing;

  return v_claimed_consultation_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when serialization_failure then
    raise exception using
      errcode = '40001',
      message = 'The consultation assignment changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The next consultation could not be claimed';
end;
$function$;

alter function public.claim_next_consultation()
  owner to postgres;

comment on function public.claim_next_consultation() is
  'Atomically assigns the earliest valid non-elapsed waiting consultation and establishes the caller as Primary Counselor only when the student has no active assignment.';

revoke all on function public.claim_next_consultation()
  from public, anon, authenticated;

grant execute on function public.claim_next_consultation()
  to authenticated;

commit;
