-- K-GEO single-counselor fixed-slot booking foundation.
-- Review this migration before applying it. Apply it only after
-- 202607180001_consultation_requests_v1.sql.
--
-- IMPORTANT DEPLOYMENT ORDER: once applied, new student inserts must include
-- consultation_date and slot_start. Deploy the reviewed booking UI and Server
-- Action with this database change so the existing Version 1 form does not
-- temporarily fail its inserts.

begin;

-- A single enum gives the later UI one unambiguous state per slot. In
-- particular, expired and booked cannot be reported as contradictory booleans.
create type public.consultation_slot_availability_status as enum (
  'available',
  'booked',
  'expired'
);

comment on type public.consultation_slot_availability_status is
  'Privacy-safe availability state for one fixed K-GEO consultation slot.';

revoke all privileges on type public.consultation_slot_availability_status
  from public, anon;

grant usage on type public.consultation_slot_availability_status
  to authenticated;

alter table public.consultation_requests
  add column consultation_date date,
  add column slot_start time without time zone,
  add column slot_end time without time zone;

comment on column public.consultation_requests.consultation_date is
  'K-GEO business date for a booked consultation; legacy unscheduled rows remain null.';

comment on column public.consultation_requests.slot_start is
  'Student-selected start from the six approved 30-minute slots between 14:00 and 17:00.';

comment on column public.consultation_requests.slot_end is
  'Trusted end time derived by the insert trigger; authenticated students cannot insert it.';

-- Legacy rows are compatible because all three booking columns may remain
-- null. Any booked row must carry the complete date/start/end tuple.
alter table public.consultation_requests
  add constraint consultation_requests_booking_fields_together_check
    check (
      (
        consultation_date is null
        and slot_start is null
        and slot_end is null
      )
      or (
        consultation_date is not null
        and slot_start is not null
        and slot_end is not null
      )
    ),
  add constraint consultation_requests_slot_start_check
    check (
      slot_start is null
      or slot_start in (
        time '14:00',
        time '14:30',
        time '15:00',
        time '15:30',
        time '16:00',
        time '16:30'
      )
    ),
  add constraint consultation_requests_slot_duration_check
    check (
      slot_start is null
      or slot_end = (slot_start + interval '30 minutes')::time
    ),
  add constraint consultation_requests_booking_weekday_check
    check (
      consultation_date is null
      or extract(isodow from consultation_date) between 1 and 5
    );

-- The single-counselor workflow does not require assignment for scheduled or
-- completed consultations. The separate assignment-pair constraint remains
-- in force whenever an assignment is used. This replacement is less
-- restrictive than the Version 1 constraint, so every previously valid row
-- remains valid.
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
        status = 'counselor_assigned'::public.consultation_status
        and assigned_counselor_id is not null
      )
      or status in (
        'scheduled'::public.consultation_status,
        'completed'::public.consultation_status,
        'cancelled'::public.consultation_status
      )
    );

comment on constraint consultation_requests_status_assignment_check
  on public.consultation_requests is
  'Direct scheduled/completed bookings need no counselor assignment; counselor_assigned still requires one.';

-- PostgreSQL enforces this unique partial index across concurrent
-- transactions. A competing booking for the same active date/start blocks
-- and then fails with a uniqueness error. Cancelled rows are excluded and
-- therefore release their slot.
create unique index consultation_requests_active_slot_key
  on public.consultation_requests (consultation_date, slot_start)
  where consultation_date is not null
    and slot_start is not null
    and status <> 'cancelled'::public.consultation_status;

comment on index public.consultation_requests_active_slot_key is
  'Allows at most one non-cancelled consultation per date and fixed start time.';

-- Replace the single-column student index with an index that also supports
-- the existing newest-first student history query. The replacement is created
-- before the old non-unique index is removed.
create index consultation_requests_student_history_idx
  on public.consultation_requests (student_id, submitted_at desc, id);

drop index public.consultation_requests_student_id_idx;

comment on index public.consultation_requests_student_history_idx is
  'Supports one student history ordered newest first with deterministic UUID tie-breaking.';

-- SECURITY: this remains the only trusted student insert path. It validates
-- an active, email-confirmed student identity, requires an approved booking
-- date/start, derives slot_end, and overwrites every trusted operational field.
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
  new.status := 'scheduled'::public.consultation_status;
  new.assigned_counselor_id := null;
  new.assigned_at := null;
  new.submitted_at := request_time;
  new.created_at := request_time;
  new.updated_at := request_time;

  return new;
end;
$function$;

comment on function public.prepare_consultation_request_insert() is
  'Creates a trusted scheduled booking for an active verified student and derives all protected fields.';

revoke all on function public.prepare_consultation_request_insert()
  from public, anon, authenticated;

-- The Version 1 trigger already invokes the replaced function and therefore
-- does not need to be dropped or recreated.

-- Extend the existing eight-column student grant with only the two values a
-- student may choose. slot_end and all operational columns remain ungranted.
grant insert (consultation_date, slot_start)
  on table public.consultation_requests
  to authenticated;

-- SECURITY: students cannot select other students' rows under RLS, so slot
-- availability must aggregate across rows through a tightly scoped definer
-- function. It returns fixed slot facts only and exposes no row identity or
-- personal information.
create function public.get_consultation_slot_availability(p_date date)
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

  if p_date < business_today then
    raise exception using
      errcode = '22023',
      message = 'The consultation date cannot be in the past';
  end if;

  if extract(isodow from p_date) not between 1 and 5 then
    raise exception using
      errcode = '22023',
      message = 'Consultations are available Monday through Friday';
  end if;

  return query
  with fixed_slots(fixed_start) as (
    values
      (time '14:00'),
      (time '14:30'),
      (time '15:00'),
      (time '15:30'),
      (time '16:00'),
      (time '16:30')
  )
  select
    fixed_slot.fixed_start,
    (fixed_slot.fixed_start + interval '30 minutes')::time,
    case
      -- Expiry takes precedence over booking state. This tells the student why
      -- the slot is unavailable without revealing whether an expired slot had
      -- another student's booking.
      when p_date = business_today
        and fixed_slot.fixed_start <= business_time
        then 'expired'::public.consultation_slot_availability_status
      when exists (
        select 1
        from public.consultation_requests as request
        where request.consultation_date = p_date
          and request.slot_start = fixed_slot.fixed_start
          and request.status <> 'cancelled'::public.consultation_status
      )
        then 'booked'::public.consultation_slot_availability_status
      else 'available'::public.consultation_slot_availability_status
    end
  from fixed_slots as fixed_slot
  order by fixed_slot.fixed_start;
end;
$function$;

comment on function public.get_consultation_slot_availability(date) is
  'Returns six fixed slot times and available/booked/expired status without exposing consultation or student data.';

revoke all on function public.get_consultation_slot_availability(date)
  from public, anon, authenticated;

grant execute on function public.get_consultation_slot_availability(date)
  to authenticated;

-- Read policies are additive OR branches beside the existing student-own
-- policy. They expose the schedule to active staff roles without granting any
-- UPDATE or DELETE authority.
create policy consultation_requests_select_counselor_all
on public.consultation_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = 'counselor'::public.user_role
      and profile.is_active is true
  )
);

comment on policy consultation_requests_select_counselor_all
  on public.consultation_requests is
  'Active counselors can read all consultation requests for the single-counselor schedule.';

create policy consultation_requests_select_director_admin_all
on public.consultation_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role in (
        'director'::public.user_role,
        'admin'::public.user_role
      )
      and profile.is_active is true
  )
);

comment on policy consultation_requests_select_director_admin_all
  on public.consultation_requests is
  'Active director and admin profiles can read the consultation schedule but receive no mutation policy.';

-- No UPDATE or DELETE grants or policies are added. No assignment mutation is
-- introduced. The existing status index remains suitable for status filters;
-- the active-slot unique index enforces exclusivity and supports active daily
-- schedule ordering; and the student-history index serves owner history.

commit;
