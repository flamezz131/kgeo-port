-- K-GEO Phase A1.4.1 consultation ownership and FCFS assignment foundation.
-- This additive migration preserves fixed-slot capacity while making an
-- active verified counselor claim authoritative for consultation ownership.

begin;

-- Existing unresolved slot bookings were created as scheduled without an
-- owner. Move only those rows back to the assignment-pending state so they
-- enter the reviewed FCFS claim path. Final and cancelled history is untouched.
update public.consultation_requests as request
set status = 'waiting_for_assignment'::public.consultation_status
where request.status = 'scheduled'::public.consultation_status
  and request.assigned_counselor_id is null;

-- New unresolved workflow rows require the matching ownership state. Historical
-- final rows may remain unassigned because they predate A1.4.1 and are immutable.
alter table public.consultation_requests
  drop constraint consultation_requests_status_assignment_check,
  add constraint consultation_requests_status_assignment_check
    check (
      (
        status in (
          'submitted'::public.consultation_status,
          'waiting_for_assignment'::public.consultation_status
        )
        and assigned_counselor_id is null
      )
      or (
        status in (
          'counselor_assigned'::public.consultation_status,
          'scheduled'::public.consultation_status
        )
        and assigned_counselor_id is not null
      )
      or status in (
        'completed'::public.consultation_status,
        'no_show'::public.consultation_status,
        'cancelled'::public.consultation_status
      )
    );

comment on constraint consultation_requests_status_assignment_check
  on public.consultation_requests is
  'Unresolved assignment-pending rows are unowned; counselor_assigned and scheduled rows require ownership; historical final rows remain compatible.';

-- SECURITY: retain the reviewed student authorization and fixed-slot checks,
-- but create the reservation in the explicit assignment-pending lifecycle.
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
    and auth_user.email_confirmed_at is not null;

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
      message = 'The consultation start time is not an approved slot';
  end if;

  if new.consultation_date < business_today then
    raise exception using
      errcode = '23514',
      message = 'The consultation date cannot be in the past';
  end if;

  if extract(isodow from new.consultation_date) not between 1 and 5 then
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

alter function public.prepare_consultation_request_insert() owner to postgres;

comment on function public.prepare_consultation_request_insert() is
  'Creates a trusted fixed-slot booking awaiting FCFS counselor assignment for an active verified student.';

revoke all on function public.prepare_consultation_request_insert()
  from public, anon, authenticated;

-- The assignment identifier is now an approved operational read field. RLS
-- still limits students to their own rows and staff to their existing scopes;
-- no caller receives direct UPDATE authority.
grant select (assigned_counselor_id)
  on table public.consultation_requests
  to authenticated;

-- SECURITY: claim exactly the earliest eligible booked row. Row locking makes
-- ownership atomic; the UPDATE repeats all eligibility predicates as defense
-- in depth. Legacy unscheduled requests retain their existing explicit
-- rebooking path and are not converted into meaningless scheduled records.
create function public.claim_next_consultation()
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  target_consultation_id uuid;
  claimed_consultation_id uuid;
  assignment_time timestamptz;
begin
  caller_id := (select auth.uid());

  if caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  select request.id
  into target_consultation_id
  from public.consultation_requests as request
  where request.status =
      'waiting_for_assignment'::public.consultation_status
    and request.assigned_counselor_id is null
    and request.consultation_date is not null
    and request.slot_start is not null
    and request.slot_end is not null
  order by request.submitted_at asc, request.id asc
  limit 1
  for update;

  if not found then
    return null;
  end if;

  assignment_time := pg_catalog.statement_timestamp();

  update public.consultation_requests as request
  set
    assigned_counselor_id = caller_id,
    assigned_at = assignment_time,
    status = 'scheduled'::public.consultation_status
  where request.id = target_consultation_id
    and request.status =
      'waiting_for_assignment'::public.consultation_status
    and request.assigned_counselor_id is null
    and request.consultation_date is not null
    and request.slot_start is not null
    and request.slot_end is not null
  returning request.id into claimed_consultation_id;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The consultation assignment changed concurrently';
  end if;

  return claimed_consultation_id;
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

alter function public.claim_next_consultation() owner to postgres;

comment on function public.claim_next_consultation() is
  'Atomically assigns the earliest booked unassigned consultation by submitted_at and UUID to the active verified counselor caller.';

revoke all on function public.claim_next_consultation()
  from public, anon, authenticated;

grant execute on function public.claim_next_consultation()
  to authenticated;

-- SECURITY: preserve the approved outcome and time checks while requiring the
-- caller to be the consultation's authoritative assigned counselor.
create or replace function public.record_consultation_outcome(
  p_consultation_id uuid,
  p_outcome text
)
returns public.consultation_status
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  business_now timestamp without time zone;
  business_today date;
  business_time time without time zone;
  requested_status public.consultation_status;
  target_assigned_counselor_id uuid;
  target_date date;
  target_end time without time zone;
  target_status public.consultation_status;
begin
  caller_id := (select auth.uid());

  if caller_id is null or not exists (
    select 1
    from public.profiles as profile
    inner join auth.users as auth_user
      on auth_user.id = profile.id
    where profile.id = caller_id
      and profile.role = 'counselor'::public.user_role
      and profile.is_active is true
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  if p_consultation_id is null
    or p_outcome is null
    or p_outcome not in ('completed', 'no_show') then
    raise exception using
      errcode = '22023',
      message = 'A valid consultation outcome is required';
  end if;

  select
    request.assigned_counselor_id,
    request.consultation_date,
    request.slot_end,
    request.status
  into
    target_assigned_counselor_id,
    target_date,
    target_end,
    target_status
  from public.consultation_requests as request
  where request.id = p_consultation_id
  for update;

  if not found
    or target_status <> 'scheduled'::public.consultation_status
    or target_date is null
    or target_end is null then
    raise exception using
      errcode = '22023',
      message = 'The consultation outcome cannot be recorded';
  end if;

  if target_assigned_counselor_id is distinct from caller_id then
    raise exception using
      errcode = '42501',
      message = 'Only the assigned counselor may record this outcome';
  end if;

  business_now :=
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata';
  business_today := business_now::date;
  business_time := business_now::time;

  if target_date > business_today
    or (
      target_date = business_today
      and target_end > business_time
    ) then
    raise exception using
      errcode = '22023',
      message = 'The consultation outcome cannot be recorded yet';
  end if;

  requested_status := p_outcome::public.consultation_status;

  update public.consultation_requests as request
  set
    status = requested_status,
    outcome_recorded_at = pg_catalog.statement_timestamp(),
    outcome_recorded_by = caller_id
  where request.id = p_consultation_id
    and request.status = 'scheduled'::public.consultation_status
    and request.assigned_counselor_id = caller_id
  returning request.status into target_status;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The consultation outcome changed concurrently';
  end if;

  return target_status;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value then
    raise exception using
      errcode = '22023',
      message = 'The consultation outcome cannot be recorded';
  when serialization_failure then
    raise exception using
      errcode = '40001',
      message = 'The consultation outcome changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The consultation outcome could not be recorded';
end;
$function$;

alter function public.record_consultation_outcome(uuid, text)
  owner to postgres;

comment on function public.record_consultation_outcome(uuid, text) is
  'Allows only the assigned active verified counselor to finalize an ended scheduled consultation as completed or no_show.';

revoke all on function public.record_consultation_outcome(uuid, text)
  from public, anon, authenticated;

grant execute on function public.record_consultation_outcome(uuid, text)
  to authenticated;

commit;
