-- =================================================================
-- K-GEO — PUBLIC schema, all 50 migrations concatenated in order.
-- Generated from supabase/migrations/. Run on a FRESH project only,
-- or run just the files you are missing (see SETUP_GUIDE.md).
-- =================================================================

-- >>> supabase/migrations/202607170001_initial_kgeo_schema.sql
-- K-GEO initial identity foundation.
-- Review this migration before applying it to Supabase.

create type public.user_role as enum (
  'student',
  'counselor',
  'admin',
  'director'
);

create table public.profiles (
  id uuid
    constraint profiles_pkey primary key
    constraint profiles_user_id_fkey
      references auth.users(id)
      on delete cascade,
  college_email text
    constraint profiles_college_email_key unique
    constraint profiles_college_email_not_null not null,
  role public.user_role
    constraint profiles_role_not_null not null
    default 'student'::public.user_role,
  full_name text,
  is_active boolean
    constraint profiles_is_active_not_null not null
    default true,
  created_at timestamptz
    constraint profiles_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint profiles_updated_at_not_null not null
    default pg_catalog.now(),
  constraint profiles_college_email_check
    check (
      college_email = pg_catalog.lower(pg_catalog.btrim(college_email))
      and college_email ~ '^[^@[:space:]]+@kct[.]ac[.]in$'
    )
);

comment on type public.user_role is
  'K-GEO roles. Every public signup is assigned student.';

comment on table public.profiles is
  'One K-GEO application profile for each Supabase Auth user.';

comment on column public.profiles.college_email is
  'Normalized lowercase institutional email copied from auth.users.email.';

comment on column public.profiles.role is
  'Authorization role. Authenticated browser users cannot update it.';

comment on column public.profiles.is_active is
  'Trusted account-status flag. Authenticated browser users cannot update it.';

-- The primary key and unique college_email constraint create the indexes
-- required for the initial one-profile-per-user access pattern.

create function public.set_profiles_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.statement_timestamp();
  return new;
end;
$function$;

comment on function public.set_profiles_updated_at() is
  'Maintains profiles.updated_at whenever a profile row is updated.';

revoke all on function public.set_profiles_updated_at()
  from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

-- SECURITY: this function explicitly assigns student. It never reads a role
-- from form data, URL data, browser input, or raw_user_meta_data. Missing or
-- invalid institutional email fails closed and rolls back Auth user creation.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_email text;
begin
  normalized_email := pg_catalog.lower(pg_catalog.btrim(new.email));

  if normalized_email is null
    or normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid @kct.ac.in email address';
  end if;

  insert into public.profiles (
    id,
    college_email,
    role,
    full_name,
    is_active
  )
  values (
    new.id,
    normalized_email,
    'student'::public.user_role,
    null,
    true
  );

  return new;
end;
$function$;

comment on function public.handle_new_user() is
  'Creates one student profile from a valid Supabase Auth email.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- Remove broad defaults before granting the minimum browser permissions.
-- There is no authenticated INSERT or DELETE grant and no anonymous access.
revoke all privileges on table public.profiles
  from public, anon, authenticated;

revoke all privileges on type public.user_role
  from public, anon;

grant usage on type public.user_role
  to authenticated;

grant select on table public.profiles
  to authenticated;

grant update (full_name) on table public.profiles
  to authenticated;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

comment on policy profiles_select_own on public.profiles is
  'Authenticated users can read only the profile matching auth.uid().';

comment on policy profiles_update_own on public.profiles is
  'Authenticated users can update their own profile; grants limit updates to full_name.';

-- SIGNUP-TRIGGER RECOVERY
-- A failing Auth trigger can block signup. Inspect Supabase Auth and Postgres
-- logs first. To pause profile creation without deleting data, review and run:
--
--   alter table auth.users disable trigger on_auth_user_created;
--
-- After correcting public.handle_new_user(), review and run:
--
--   alter table auth.users enable trigger on_auth_user_created;
--
-- If the trigger must be removed, review and run:
--
--   drop trigger if exists on_auth_user_created on auth.users;
--
-- Users created while the trigger is unavailable need a separately reviewed,
-- trusted profile backfill. Disabling or removing the trigger does not delete
-- Auth users or existing profiles.

-- >>> supabase/migrations/202607180001_consultation_requests_v1.sql
-- K-GEO Version 1 consultation-request foundation.
-- Review this migration before applying it. Apply it only after the initial
-- identity migration that creates public.profiles and
-- public.set_profiles_updated_at().

create type public.higher_studies_interest as enum (
  'interested',
  'exploring',
  'not_interested'
);

create type public.consultation_status as enum (
  'submitted',
  'waiting_for_assignment',
  'counselor_assigned',
  'scheduled',
  'completed',
  'cancelled'
);

-- A sequence provides concurrency-safe request numbers. Gaps are expected
-- when transactions roll back; the UUID remains the true primary key.
create sequence public.consultation_request_number_seq
  as bigint
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

create table public.consultation_requests (
  id uuid
    constraint consultation_requests_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint consultation_requests_student_id_not_null not null
    constraint consultation_requests_student_id_fkey
      references public.profiles(id)
      on delete cascade,
  request_number text
    constraint consultation_requests_request_number_not_null not null
    constraint consultation_requests_request_number_key unique,
  student_name text
    constraint consultation_requests_student_name_not_null not null,
  roll_number text
    constraint consultation_requests_roll_number_not_null not null,
  college_email text
    constraint consultation_requests_college_email_not_null not null,
  personal_email text
    constraint consultation_requests_personal_email_not_null not null,
  college_end_year integer
    constraint consultation_requests_college_end_year_not_null not null,
  department text
    constraint consultation_requests_department_not_null not null,
  course text
    constraint consultation_requests_course_not_null not null,
  mobile_number text
    constraint consultation_requests_mobile_number_not_null not null,
  higher_studies_interest public.higher_studies_interest
    constraint consultation_requests_interest_not_null not null,
  status public.consultation_status
    constraint consultation_requests_status_not_null not null
    default 'waiting_for_assignment'::public.consultation_status,
  assigned_counselor_id uuid
    constraint consultation_requests_assigned_counselor_id_fkey
      references public.profiles(id)
      on delete restrict,
  submitted_at timestamptz
    constraint consultation_requests_submitted_at_not_null not null
    default pg_catalog.now(),
  assigned_at timestamptz,
  created_at timestamptz
    constraint consultation_requests_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint consultation_requests_updated_at_not_null not null
    default pg_catalog.now(),

  constraint consultation_requests_request_number_check
    check (request_number ~ '^KGEOC-[0-9]{4}-[0-9]{6,}$'),
  constraint consultation_requests_student_name_check
    check (
      student_name = pg_catalog.btrim(student_name)
      and pg_catalog.char_length(student_name) between 1 and 150
    ),
  constraint consultation_requests_roll_number_check
    check (
      roll_number = pg_catalog.upper(pg_catalog.btrim(roll_number))
      and pg_catalog.char_length(roll_number) between 1 and 50
    ),
  constraint consultation_requests_college_email_check
    check (
      college_email = pg_catalog.lower(pg_catalog.btrim(college_email))
      and pg_catalog.char_length(college_email) <= 320
      and college_email ~ '^[^@[:space:]]+@kct[.]ac[.]in$'
    ),
  constraint consultation_requests_personal_email_check
    check (
      personal_email = pg_catalog.lower(pg_catalog.btrim(personal_email))
      and pg_catalog.char_length(personal_email) <= 320
      and personal_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    ),
  -- This static MVP range is intentionally easy to revise in a later,
  -- reviewed migration without relying on time-dependent CHECK expressions.
  constraint consultation_requests_college_end_year_check
    check (college_end_year between 2024 and 2040),
  constraint consultation_requests_department_check
    check (
      department = pg_catalog.btrim(department)
      and pg_catalog.char_length(department) between 1 and 150
    ),
  constraint consultation_requests_course_check
    check (
      course = pg_catalog.btrim(course)
      and pg_catalog.char_length(course) between 1 and 150
    ),
  constraint consultation_requests_mobile_number_check
    check (mobile_number ~ '^[0-9]{10}$'),
  constraint consultation_requests_counselor_not_student_check
    check (
      assigned_counselor_id is null
      or assigned_counselor_id <> student_id
    ),
  constraint consultation_requests_assignment_pair_check
    check (
      (assigned_counselor_id is null and assigned_at is null)
      or (assigned_counselor_id is not null and assigned_at is not null)
    ),
  constraint consultation_requests_status_assignment_check
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
          'scheduled'::public.consultation_status,
          'completed'::public.consultation_status
        )
        and assigned_counselor_id is not null
      )
      or status = 'cancelled'::public.consultation_status
    ),
  constraint consultation_requests_assigned_at_check
    check (assigned_at is null or assigned_at >= submitted_at),
  constraint consultation_requests_updated_at_check
    check (updated_at >= created_at)
);

comment on type public.higher_studies_interest is
  'Version 1 student interest choices for a K-GEO consultation request.';

comment on type public.consultation_status is
  'Operational lifecycle states for K-GEO consultation assignment and delivery.';

comment on sequence public.consultation_request_number_seq is
  'Concurrency-safe source for readable request numbers; sequence gaps are valid.';

comment on table public.consultation_requests is
  'Version 1 higher-studies consultation requests owned by authenticated students.';

comment on column public.consultation_requests.student_id is
  'Trusted owner copied from auth.uid() by the insert trigger.';

comment on column public.consultation_requests.college_email is
  'Trusted normalized email copied from the authenticated student profile.';

comment on column public.consultation_requests.request_number is
  'Readable identifier generated from the insert year and a database sequence.';

comment on column public.consultation_requests.submitted_at is
  'Trusted queue timestamp used for First Come, First Served ordering.';

-- SECURITY: authenticated callers receive INSERT privilege only for the
-- student-provided fields. This trigger overwrites every trusted ownership,
-- queue, assignment, status, request-number, and timestamp field.
create function public.prepare_consultation_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requester_id uuid;
  trusted_college_email text;
  request_time timestamptz;
  request_sequence bigint;
begin
  requester_id := (select auth.uid());

  if requester_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authentication is required to create a consultation request';
  end if;

  select profile.college_email
  into trusted_college_email
  from public.profiles as profile
  where profile.id = requester_id
    and profile.role = 'student'::public.user_role
    and profile.is_active is true;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'An active student profile is required';
  end if;

  request_time := pg_catalog.statement_timestamp();
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
  new.status := 'waiting_for_assignment'::public.consultation_status;
  new.assigned_counselor_id := null;
  new.assigned_at := null;
  new.submitted_at := request_time;
  new.created_at := request_time;
  new.updated_at := request_time;

  return new;
end;
$function$;

comment on function public.prepare_consultation_request_insert() is
  'Sets trusted owner, email, queue, request-number, status, assignment, and timestamp fields.';

revoke all on function public.prepare_consultation_request_insert()
  from public, anon, authenticated;

create trigger consultation_requests_prepare_insert
before insert on public.consultation_requests
for each row
execute function public.prepare_consultation_request_insert();

-- Reuse the safe updated_at function created by the identity migration.
create trigger consultation_requests_set_updated_at
before update on public.consultation_requests
for each row
execute function public.set_profiles_updated_at();

create index consultation_requests_student_id_idx
  on public.consultation_requests (student_id);

create index consultation_requests_submitted_at_idx
  on public.consultation_requests (submitted_at);

create index consultation_requests_status_idx
  on public.consultation_requests (status);

create index consultation_requests_assigned_counselor_id_idx
  on public.consultation_requests (assigned_counselor_id)
  where assigned_counselor_id is not null;

-- Queue readers can filter by status and then process the oldest request.
-- The UUID provides deterministic ordering when timestamps are equal.
create index consultation_requests_fcfs_idx
  on public.consultation_requests (status, submitted_at, id);

alter table public.consultation_requests enable row level security;

-- Remove broad defaults before granting the minimum student permissions.
revoke all privileges on table public.consultation_requests
  from public, anon, authenticated;

revoke all privileges on sequence public.consultation_request_number_seq
  from public, anon, authenticated;

revoke all privileges on type public.higher_studies_interest
  from public, anon;

revoke all privileges on type public.consultation_status
  from public, anon;

grant usage on type public.higher_studies_interest
  to authenticated;

grant usage on type public.consultation_status
  to authenticated;

grant select on table public.consultation_requests
  to authenticated;

-- No protected column is insertable by an authenticated browser caller.
grant insert (
  student_name,
  roll_number,
  personal_email,
  college_end_year,
  department,
  course,
  mobile_number,
  higher_studies_interest
) on public.consultation_requests
  to authenticated;

create policy consultation_requests_select_own
on public.consultation_requests
for select
to authenticated
using (
  (select auth.uid()) = student_id
  and exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = 'student'::public.user_role
      and profile.is_active is true
  )
);

create policy consultation_requests_insert_own
on public.consultation_requests
for insert
to authenticated
with check (
  (select auth.uid()) = student_id
  and exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = 'student'::public.user_role
      and profile.is_active is true
  )
);

comment on policy consultation_requests_select_own
  on public.consultation_requests is
  'Active authenticated students can read only their own consultation requests.';

comment on policy consultation_requests_insert_own
  on public.consultation_requests is
  'Active authenticated students can insert only rows owned by auth.uid(); the trigger supplies trusted fields.';

-- There is intentionally no authenticated UPDATE or DELETE grant or policy.
-- Students therefore cannot change ownership, college email, request number,
-- status, counselor assignment, queue timestamps, or even their submitted
-- personal fields after creation. Later admin/counselor mutation paths must be
-- separately reviewed, role-aware, and narrowly granted.

-- >>> supabase/migrations/202607190001_single_counselor_slot_booking.sql
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

-- >>> supabase/migrations/202607190002_student_profile_foundation.sql
-- K-GEO detailed student-profile foundation (Phase A).
-- Review this migration before applying it. Apply it only after
-- 202607190001_single_counselor_slot_booking.sql.
--
-- This migration is additive. It does not alter public.profiles,
-- public.consultation_requests, existing Auth users, or existing bookings.

begin;

create type public.student_profile_status as enum (
  'draft',
  'submitted'
);

create type public.student_preferred_study_level as enum (
  'masters',
  'postgraduate_diploma',
  'mba',
  'phd',
  'other'
);

create type public.student_study_mode as enum (
  'full_time',
  'part_time',
  'either'
);

create type public.student_academic_preference as enum (
  'coursework',
  'research',
  'either',
  'undecided'
);

create type public.student_planning_stage as enum (
  'exploring',
  'preparing_exams',
  'shortlisting',
  'preparing_documents',
  'applications_started'
);

create type public.student_exam_name as enum (
  'ielts',
  'toefl',
  'pte',
  'gre',
  'gmat',
  'gate',
  'other'
);

create type public.student_exam_status as enum (
  'not_planned',
  'planning',
  'booked',
  'completed',
  'not_required'
);

create type public.student_achievement_type as enum (
  'internship',
  'project',
  'certification',
  'research',
  'publication',
  'award',
  'hackathon',
  'leadership',
  'volunteering',
  'work_experience',
  'other'
);

comment on type public.student_profile_status is
  'Protected draft/submitted workflow marker. Counseling readiness is derived separately and cannot become stale.';

comment on type public.student_planning_stage is
  'Student-reported planning stage, not an official counselor-controlled progression status.';

comment on type public.student_exam_name is
  'Supported entrance and language exams. The other value requires custom_exam_name.';

comment on type public.student_achievement_type is
  'Student-reported achievement and experience categories.';

-- CHECK constraints cannot contain subqueries directly. This immutable helper
-- validates bounded, trimmed, non-empty, case-insensitively unique arrays.
create function public.is_valid_student_profile_text_array(
  p_values text[],
  p_max_items integer,
  p_max_item_length integer
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $function$
  select
    p_max_items >= 0
    and p_max_item_length > 0
    and pg_catalog.cardinality(p_values) <= p_max_items
    and not exists (
      select 1
      from pg_catalog.unnest(p_values) as value(item)
      where value.item is null
        or value.item <> pg_catalog.btrim(value.item)
        or pg_catalog.char_length(value.item) < 1
        or pg_catalog.char_length(value.item) > p_max_item_length
    )
    and (
      select pg_catalog.count(*) =
        pg_catalog.count(distinct pg_catalog.lower(value.item))
      from pg_catalog.unnest(p_values) as value(item)
    );
$function$;

comment on function public.is_valid_student_profile_text_array(
  text[], integer, integer
) is
  'Validates bounded canonical text arrays without reading database rows.';

create table public.student_profiles (
  student_id uuid
    constraint student_profiles_pkey primary key
    constraint student_profiles_student_id_fkey
      references public.profiles(id)
      on delete cascade,
  roll_number text
    constraint student_profiles_roll_number_not_null not null,
  personal_email text
    constraint student_profiles_personal_email_not_null not null,
  mobile_number text
    constraint student_profiles_mobile_number_not_null not null,
  college text
    constraint student_profiles_college_not_null not null,
  course text
    constraint student_profiles_course_not_null not null,
  department text
    constraint student_profiles_department_not_null not null,
  current_year integer,
  current_semester integer,
  graduation_year integer
    constraint student_profiles_graduation_year_not_null not null,
  cgpa numeric(5, 2),
  cgpa_scale numeric(4, 2)
    constraint student_profiles_cgpa_scale_not_null not null
    default 10.00,
  cgpa_unavailable boolean
    constraint student_profiles_cgpa_unavailable_not_null not null
    default false,
  active_backlogs integer
    constraint student_profiles_active_backlogs_not_null not null
    default 0,
  cleared_backlogs integer
    constraint student_profiles_cleared_backlogs_not_null not null
    default 0,
  sslc_percentage numeric(5, 2),
  hsc_percentage numeric(5, 2),
  diploma_percentage numeric(5, 2),
  academic_remarks text,
  profile_status public.student_profile_status
    constraint student_profiles_profile_status_not_null not null
    default 'draft'::public.student_profile_status,
  profile_submitted_at timestamptz,
  created_at timestamptz
    constraint student_profiles_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint student_profiles_updated_at_not_null not null
    default pg_catalog.now(),

  constraint student_profiles_roll_number_check
    check (
      roll_number = pg_catalog.upper(pg_catalog.btrim(roll_number))
      and pg_catalog.char_length(roll_number) between 1 and 50
    ),
  constraint student_profiles_personal_email_check
    check (
      personal_email = pg_catalog.lower(pg_catalog.btrim(personal_email))
      and pg_catalog.char_length(personal_email) <= 320
      and personal_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    ),
  constraint student_profiles_mobile_number_check
    check (mobile_number ~ '^[0-9]{10}$'),
  constraint student_profiles_college_check
    check (
      college = pg_catalog.btrim(college)
      and pg_catalog.char_length(college) between 1 and 150
    ),
  constraint student_profiles_course_check
    check (
      course = pg_catalog.btrim(course)
      and pg_catalog.char_length(course) between 1 and 150
    ),
  constraint student_profiles_department_check
    check (
      department = pg_catalog.btrim(department)
      and pg_catalog.char_length(department) between 1 and 150
    ),
  constraint student_profiles_current_year_check
    check (current_year is null or current_year between 1 and 8),
  constraint student_profiles_current_semester_check
    check (current_semester is null or current_semester between 1 and 16),
  constraint student_profiles_year_semester_check
    check (
      current_year is null
      or current_semester is null
      or current_semester between
        ((current_year - 1) * 2 + 1)
        and (current_year * 2)
    ),
  -- This static range matches the current consultation model and can be
  -- expanded later through a reviewed migration.
  constraint student_profiles_graduation_year_check
    check (graduation_year between 2024 and 2040),
  constraint student_profiles_cgpa_scale_check
    check (cgpa_scale in (4.00, 10.00)),
  constraint student_profiles_cgpa_check
    check (cgpa is null or (cgpa >= 0 and cgpa <= cgpa_scale)),
  constraint student_profiles_cgpa_availability_check
    check (not (cgpa is not null and cgpa_unavailable is true)),
  constraint student_profiles_active_backlogs_check
    check (active_backlogs between 0 and 100),
  constraint student_profiles_cleared_backlogs_check
    check (cleared_backlogs between 0 and 100),
  constraint student_profiles_sslc_percentage_check
    check (
      sslc_percentage is null
      or sslc_percentage between 0 and 100
    ),
  constraint student_profiles_hsc_percentage_check
    check (
      hsc_percentage is null
      or hsc_percentage between 0 and 100
    ),
  constraint student_profiles_diploma_percentage_check
    check (
      diploma_percentage is null
      or diploma_percentage between 0 and 100
    ),
  constraint student_profiles_academic_remarks_check
    check (
      academic_remarks is null
      or (
        academic_remarks = pg_catalog.btrim(academic_remarks)
        and pg_catalog.char_length(academic_remarks) between 1 and 2000
      )
    ),
  constraint student_profiles_submission_state_check
    check (
      (
        profile_status = 'submitted'::public.student_profile_status
        and profile_submitted_at is not null
      )
      or (
        profile_status <> 'submitted'::public.student_profile_status
        and profile_submitted_at is null
      )
    ),
  constraint student_profiles_submitted_at_check
    check (
      profile_submitted_at is null
      or profile_submitted_at between created_at and updated_at
    ),
  constraint student_profiles_updated_at_check
    check (updated_at >= created_at)
);

create table public.student_preferences (
  student_id uuid
    constraint student_preferences_pkey primary key
    constraint student_preferences_student_id_fkey
      references public.profiles(id)
      on delete cascade,
  higher_studies_interest public.higher_studies_interest
    constraint student_preferences_interest_not_null not null,
  preferred_study_level public.student_preferred_study_level,
  preferred_countries text[]
    constraint student_preferences_countries_not_null not null
    default '{}'::text[],
  preferred_program_areas text[]
    constraint student_preferences_program_areas_not_null not null
    default '{}'::text[],
  target_intake text,
  budget_range text,
  scholarship_required boolean,
  funding_required boolean,
  study_mode public.student_study_mode,
  academic_preference public.student_academic_preference,
  student_planning_stage public.student_planning_stage,
  created_at timestamptz
    constraint student_preferences_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint student_preferences_updated_at_not_null not null
    default pg_catalog.now(),

  constraint student_preferences_countries_check
    check (
      public.is_valid_student_profile_text_array(
        preferred_countries,
        10,
        80
      )
    ),
  constraint student_preferences_program_areas_check
    check (
      public.is_valid_student_profile_text_array(
        preferred_program_areas,
        10,
        120
      )
    ),
  -- Canonical examples: fall-2027, spring-2028.
  constraint student_preferences_target_intake_check
    check (
      target_intake is null
      or (
        target_intake = pg_catalog.lower(pg_catalog.btrim(target_intake))
        and target_intake ~ '^(spring|summer|fall|winter)-20[2-9][0-9]$'
      )
    ),
  constraint student_preferences_budget_range_check
    check (
      budget_range is null
      or (
        budget_range = pg_catalog.btrim(budget_range)
        and pg_catalog.char_length(budget_range) between 1 and 100
      )
    ),
  constraint student_preferences_updated_at_check
    check (updated_at >= created_at)
);

create table public.student_test_scores (
  id uuid
    constraint student_test_scores_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint student_test_scores_student_id_not_null not null
    constraint student_test_scores_student_id_fkey
      references public.profiles(id)
      on delete cascade,
  exam_name public.student_exam_name
    constraint student_test_scores_exam_name_not_null not null,
  custom_exam_name text,
  exam_status public.student_exam_status
    constraint student_test_scores_exam_status_not_null not null,
  attempt_number integer
    constraint student_test_scores_attempt_number_not_null not null
    default 1,
  planned_date date,
  completed_date date,
  score text,
  valid_until date,
  remarks text,
  created_at timestamptz
    constraint student_test_scores_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint student_test_scores_updated_at_not_null not null
    default pg_catalog.now(),

  constraint student_test_scores_custom_exam_name_check
    check (
      (
        exam_name = 'other'::public.student_exam_name
        and custom_exam_name is not null
        and custom_exam_name = pg_catalog.btrim(custom_exam_name)
        and pg_catalog.char_length(custom_exam_name) between 1 and 100
      )
      or (
        exam_name <> 'other'::public.student_exam_name
        and custom_exam_name is null
      )
    ),
  constraint student_test_scores_attempt_number_check
    check (attempt_number between 1 and 20),
  constraint student_test_scores_completed_status_check
    check (
      (
        exam_status = 'completed'::public.student_exam_status
        and completed_date is not null
      )
      or (
        exam_status <> 'completed'::public.student_exam_status
        and completed_date is null
      )
    ),
  constraint student_test_scores_booked_status_check
    check (
      exam_status <> 'booked'::public.student_exam_status
      or planned_date is not null
    ),
  constraint student_test_scores_inactive_status_check
    check (
      exam_status not in (
        'not_planned'::public.student_exam_status,
        'not_required'::public.student_exam_status
      )
      or (
        planned_date is null
        and completed_date is null
        and score is null
        and valid_until is null
      )
    ),
  constraint student_test_scores_date_order_check
    check (
      planned_date is null
      or completed_date is null
      or completed_date >= planned_date
    ),
  constraint student_test_scores_valid_until_check
    check (
      valid_until is null
      or (
        completed_date is not null
        and valid_until >= completed_date
      )
    ),
  constraint student_test_scores_score_check
    check (
      score is null
      or (
        exam_status = 'completed'::public.student_exam_status
        and score = pg_catalog.btrim(score)
        and pg_catalog.char_length(score) between 1 and 100
      )
    ),
  constraint student_test_scores_remarks_check
    check (
      remarks is null
      or (
        remarks = pg_catalog.btrim(remarks)
        and pg_catalog.char_length(remarks) between 1 and 1000
      )
    ),
  constraint student_test_scores_updated_at_check
    check (updated_at >= created_at)
);

create table public.student_achievements (
  id uuid
    constraint student_achievements_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint student_achievements_student_id_not_null not null
    constraint student_achievements_student_id_fkey
      references public.profiles(id)
      on delete cascade,
  achievement_type public.student_achievement_type
    constraint student_achievements_type_not_null not null,
  title text
    constraint student_achievements_title_not_null not null,
  organization text,
  achievement_date date,
  description text,
  created_at timestamptz
    constraint student_achievements_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint student_achievements_updated_at_not_null not null
    default pg_catalog.now(),

  constraint student_achievements_title_check
    check (
      title = pg_catalog.btrim(title)
      and pg_catalog.char_length(title) between 1 and 200
    ),
  constraint student_achievements_organization_check
    check (
      organization is null
      or (
        organization = pg_catalog.btrim(organization)
        and pg_catalog.char_length(organization) between 1 and 200
      )
    ),
  constraint student_achievements_date_check
    check (
      achievement_date is null
      or achievement_date >= date '1950-01-01'
    ),
  constraint student_achievements_description_check
    check (
      description is null
      or (
        description = pg_catalog.btrim(description)
        and pg_catalog.char_length(description) between 1 and 2000
      )
    ),
  constraint student_achievements_updated_at_check
    check (updated_at >= created_at)
);

comment on table public.student_profiles is
  'One editable academic and contact profile per K-GEO student identity.';

comment on table public.student_preferences is
  'One student-controlled higher-studies preference record per K-GEO student.';

comment on table public.student_test_scores is
  'Student-reported exam plans and attempts; multiple rows per exam are permitted.';

comment on table public.student_achievements is
  'Student-reported achievements and experience; multiple rows per category are permitted.';

comment on column public.student_profiles.student_id is
  'Trusted owner overwritten from auth.uid() by the insert trigger.';

comment on column public.student_profiles.cgpa_unavailable is
  'Explicit student declaration used when CGPA is genuinely unavailable; it cannot be true when cgpa is present.';

comment on column public.student_profiles.profile_status is
  'Protected workflow marker. It is not directly insertable or updatable by authenticated browser users in Phase A.';

comment on column public.student_test_scores.attempt_number is
  'Student-reported attempt sequence, unique per student and normalized exam identity.';

-- SECURITY: this helper can answer only whether the current auth.uid() has one
-- specified active, email-confirmed K-GEO role. It exposes no profile or Auth
-- row data and is safe for repeated use by RLS policies.
create function public.has_active_verified_kgeo_role(
  p_role public.user_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles as profile
    inner join auth.users as auth_user
      on auth_user.id = profile.id
    where profile.id = (select auth.uid())
      and profile.role = p_role
      and profile.is_active is true
      and auth_user.email_confirmed_at is not null
  );
$function$;

comment on function public.has_active_verified_kgeo_role(public.user_role) is
  'Privacy-safe current-user role predicate for Phase A RLS policies.';

-- SECURITY: every new table has student_id, created_at, and updated_at. This
-- trigger rejects non-students and overwrites all three protected values.
create function public.prepare_student_owned_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  requester_id uuid;
  request_time timestamptz;
begin
  requester_id := (select auth.uid());

  if requester_id is null
    or not public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified student profile is required';
  end if;

  request_time := pg_catalog.statement_timestamp();
  new.student_id := requester_id;
  new.created_at := request_time;
  new.updated_at := request_time;

  return new;
end;
$function$;

comment on function public.prepare_student_owned_insert() is
  'Overwrites detailed-profile ownership and creation timestamps from trusted server state.';

create function public.normalize_student_profile_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.roll_number := pg_catalog.upper(pg_catalog.btrim(new.roll_number));
  new.personal_email := pg_catalog.lower(
    pg_catalog.btrim(new.personal_email)
  );
  new.mobile_number := pg_catalog.btrim(new.mobile_number);
  new.college := pg_catalog.btrim(new.college);
  new.course := pg_catalog.btrim(new.course);
  new.department := pg_catalog.btrim(new.department);
  new.academic_remarks := nullif(
    pg_catalog.btrim(new.academic_remarks),
    ''
  );
  return new;
end;
$function$;

create function public.normalize_student_preferences_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  normalized_countries text[];
  normalized_program_areas text[];
begin
  select coalesce(
    pg_catalog.array_agg(
      pg_catalog.btrim(value.item)
      order by value.position
    ),
    '{}'::text[]
  )
  into normalized_countries
  from pg_catalog.unnest(new.preferred_countries)
    with ordinality as value(item, position);

  select coalesce(
    pg_catalog.array_agg(
      pg_catalog.btrim(value.item)
      order by value.position
    ),
    '{}'::text[]
  )
  into normalized_program_areas
  from pg_catalog.unnest(new.preferred_program_areas)
    with ordinality as value(item, position);

  new.preferred_countries := normalized_countries;
  new.preferred_program_areas := normalized_program_areas;
  new.target_intake := nullif(
    pg_catalog.lower(pg_catalog.btrim(new.target_intake)),
    ''
  );
  new.budget_range := nullif(
    pg_catalog.btrim(new.budget_range),
    ''
  );
  return new;
end;
$function$;

create function public.normalize_student_test_score_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  business_today date;
begin
  business_today := (
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
  )::date;

  new.custom_exam_name := nullif(
    pg_catalog.upper(pg_catalog.btrim(new.custom_exam_name)),
    ''
  );
  new.score := nullif(pg_catalog.btrim(new.score), '');
  new.remarks := nullif(pg_catalog.btrim(new.remarks), '');

  if new.completed_date is not null
    and new.completed_date > business_today then
    raise exception using
      errcode = '23514',
      message = 'Completed exam date cannot be in the future';
  end if;

  return new;
end;
$function$;

create function public.normalize_student_achievement_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  business_today date;
begin
  business_today := (
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
  )::date;

  new.title := pg_catalog.btrim(new.title);
  new.organization := nullif(
    pg_catalog.btrim(new.organization),
    ''
  );
  new.description := nullif(
    pg_catalog.btrim(new.description),
    ''
  );

  if new.achievement_date is not null
    and new.achievement_date > business_today then
    raise exception using
      errcode = '23514',
      message = 'Achievement date cannot be in the future';
  end if;

  return new;
end;
$function$;

comment on function public.normalize_student_profile_record() is
  'Normalizes canonical student-profile text values before constraints run.';

comment on function public.normalize_student_preferences_record() is
  'Normalizes optional preference text and array values before constraints run.';

comment on function public.normalize_student_test_score_record() is
  'Normalizes test-score text and rejects future completed dates in Asia/Kolkata.';

comment on function public.normalize_student_achievement_record() is
  'Normalizes achievement text and rejects future achievement dates in Asia/Kolkata.';

create trigger student_profiles_10_prepare_insert
before insert on public.student_profiles
for each row
execute function public.prepare_student_owned_insert();

create trigger student_profiles_20_normalize
before insert or update on public.student_profiles
for each row
execute function public.normalize_student_profile_record();

create trigger student_profiles_30_set_updated_at
before update on public.student_profiles
for each row
execute function public.set_profiles_updated_at();

create trigger student_preferences_10_prepare_insert
before insert on public.student_preferences
for each row
execute function public.prepare_student_owned_insert();

create trigger student_preferences_20_normalize
before insert or update on public.student_preferences
for each row
execute function public.normalize_student_preferences_record();

create trigger student_preferences_30_set_updated_at
before update on public.student_preferences
for each row
execute function public.set_profiles_updated_at();

create trigger student_test_scores_10_prepare_insert
before insert on public.student_test_scores
for each row
execute function public.prepare_student_owned_insert();

create trigger student_test_scores_20_normalize
before insert or update on public.student_test_scores
for each row
execute function public.normalize_student_test_score_record();

create trigger student_test_scores_30_set_updated_at
before update on public.student_test_scores
for each row
execute function public.set_profiles_updated_at();

create trigger student_achievements_10_prepare_insert
before insert on public.student_achievements
for each row
execute function public.prepare_student_owned_insert();

create trigger student_achievements_20_normalize
before insert or update on public.student_achievements
for each row
execute function public.normalize_student_achievement_record();

create trigger student_achievements_30_set_updated_at
before update on public.student_achievements
for each row
execute function public.set_profiles_updated_at();

-- Directory indexes favor bounded server-side filtering and deterministic
-- pagination. Primary keys already cover exact student_id lookup for the two
-- one-to-one tables, so no redundant student_id indexes are added there.
-- College is compared case-insensitively while its original display casing is
-- retained. This avoids assuming roll numbers are globally unique across all
-- current or future Kumaraguru colleges.
create unique index student_profiles_college_roll_number_key
  on public.student_profiles (
    pg_catalog.lower(college),
    roll_number
  );

create index student_profiles_status_updated_idx
  on public.student_profiles (
    profile_status,
    updated_at desc,
    student_id
  );

create index student_profiles_academic_filter_idx
  on public.student_profiles (
    course,
    department,
    graduation_year,
    profile_status,
    student_id
  );

create index student_profiles_roll_number_pattern_idx
  on public.student_profiles (roll_number text_pattern_ops);

create index student_preferences_directory_filter_idx
  on public.student_preferences (
    higher_studies_interest,
    target_intake,
    student_id
  );

create index student_preferences_countries_idx
  on public.student_preferences
  using gin (preferred_countries);

create index student_preferences_program_areas_idx
  on public.student_preferences
  using gin (preferred_program_areas);

create index student_test_scores_student_history_idx
  on public.student_test_scores (student_id, created_at desc, id);

-- One numbered attempt per normalized exam identity. The custom name keeps
-- distinct OTHER exams independent while still preventing accidental duplicate
-- numbering for the same custom exam.
create unique index student_test_scores_attempt_key
  on public.student_test_scores (
    student_id,
    exam_name,
    (coalesce(custom_exam_name, '')),
    attempt_number
  );

create index student_test_scores_directory_filter_idx
  on public.student_test_scores (
    exam_name,
    exam_status,
    student_id
  );

create index student_achievements_student_history_idx
  on public.student_achievements (
    student_id,
    achievement_date desc nulls last,
    id
  );

-- Completion is derived rather than writable. The security-invoker and
-- security-barrier options preserve the underlying table RLS boundary.
create view public.student_profile_completion
with (security_invoker = true, security_barrier = true)
as
select
  student_profile.student_id,
  student_profile.profile_status,
  completion.academic_section_complete,
  completion.preferences_section_complete,
  exists (
    select 1
    from public.student_test_scores as test_score
    where test_score.student_id = student_profile.student_id
  ) as test_scores_section_started,
  exists (
    select 1
    from public.student_achievements as achievement
    where achievement.student_id = student_profile.student_id
  ) as achievements_section_started,
  completion.essential_fields_completed,
  11::integer as essential_fields_total,
  pg_catalog.round(
    completion.essential_fields_completed::numeric * 100.0 / 11.0
  )::integer as overall_completion_percentage,
  (
    completion.academic_section_complete
    and completion.preferences_section_complete
  ) as ready_for_counseling
from public.student_profiles as student_profile
left join public.student_preferences as preference
  on preference.student_id = student_profile.student_id
cross join lateral (
  select
    (
      student_profile.roll_number is not null
      and student_profile.personal_email is not null
      and student_profile.mobile_number is not null
      and student_profile.college is not null
      and student_profile.course is not null
      and student_profile.department is not null
      and student_profile.graduation_year is not null
      and (
        student_profile.cgpa is not null
        or student_profile.cgpa_unavailable is true
      )
    ) as academic_section_complete,
    (
      preference.student_id is not null
      and preference.higher_studies_interest is not null
      and preference.preferred_study_level is not null
      and preference.target_intake is not null
    ) as preferences_section_complete,
    (
      case when student_profile.roll_number is not null then 1 else 0 end
      + case when student_profile.personal_email is not null then 1 else 0 end
      + case when student_profile.mobile_number is not null then 1 else 0 end
      + case when student_profile.college is not null then 1 else 0 end
      + case when student_profile.course is not null then 1 else 0 end
      + case when student_profile.department is not null then 1 else 0 end
      + case when student_profile.graduation_year is not null then 1 else 0 end
      + case
          when student_profile.cgpa is not null
            or student_profile.cgpa_unavailable is true
          then 1
          else 0
        end
      + case
          when preference.higher_studies_interest is not null then 1 else 0
        end
      + case
          when preference.preferred_study_level is not null then 1 else 0
        end
      + case when preference.target_intake is not null then 1 else 0 end
    )::integer as essential_fields_completed
) as completion;

comment on view public.student_profile_completion is
  'RLS-preserving derived completion for eleven essential counseling fields; no browser-writable percentage is stored.';

alter table public.student_profiles enable row level security;
alter table public.student_preferences enable row level security;
alter table public.student_test_scores enable row level security;
alter table public.student_achievements enable row level security;

revoke all privileges on table public.student_profiles
  from public, anon, authenticated;
revoke all privileges on table public.student_preferences
  from public, anon, authenticated;
revoke all privileges on table public.student_test_scores
  from public, anon, authenticated;
revoke all privileges on table public.student_achievements
  from public, anon, authenticated;
revoke all privileges on table public.student_profile_completion
  from public, anon, authenticated;

revoke all privileges on type public.student_profile_status
  from public, anon;
revoke all privileges on type public.student_preferred_study_level
  from public, anon;
revoke all privileges on type public.student_study_mode
  from public, anon;
revoke all privileges on type public.student_academic_preference
  from public, anon;
revoke all privileges on type public.student_planning_stage
  from public, anon;
revoke all privileges on type public.student_exam_name
  from public, anon;
revoke all privileges on type public.student_exam_status
  from public, anon;
revoke all privileges on type public.student_achievement_type
  from public, anon;

revoke all on function public.is_valid_student_profile_text_array(
  text[], integer, integer
) from public, anon, authenticated;
revoke all on function public.has_active_verified_kgeo_role(
  public.user_role
) from public, anon, authenticated;
revoke all on function public.prepare_student_owned_insert()
  from public, anon, authenticated;
revoke all on function public.normalize_student_profile_record()
  from public, anon, authenticated;
revoke all on function public.normalize_student_preferences_record()
  from public, anon, authenticated;
revoke all on function public.normalize_student_test_score_record()
  from public, anon, authenticated;
revoke all on function public.normalize_student_achievement_record()
  from public, anon, authenticated;

grant usage on type public.student_profile_status to authenticated;
grant usage on type public.student_preferred_study_level to authenticated;
grant usage on type public.student_study_mode to authenticated;
grant usage on type public.student_academic_preference to authenticated;
grant usage on type public.student_planning_stage to authenticated;
grant usage on type public.student_exam_name to authenticated;
grant usage on type public.student_exam_status to authenticated;
grant usage on type public.student_achievement_type to authenticated;

-- Required by preference CHECK constraints during authenticated writes.
grant execute on function public.is_valid_student_profile_text_array(
  text[], integer, integer
) to authenticated;

-- Required by the RLS policies. The function reports only a boolean about the
-- current authenticated identity and cannot query another user.
grant execute on function public.has_active_verified_kgeo_role(
  public.user_role
) to authenticated;

grant select on table public.student_profiles to authenticated;
grant select on table public.student_preferences to authenticated;
grant select on table public.student_test_scores to authenticated;
grant select on table public.student_achievements to authenticated;
grant select on table public.student_profile_completion to authenticated;

grant insert (
  roll_number,
  personal_email,
  mobile_number,
  college,
  course,
  department,
  current_year,
  current_semester,
  graduation_year,
  cgpa,
  cgpa_scale,
  cgpa_unavailable,
  active_backlogs,
  cleared_backlogs,
  sslc_percentage,
  hsc_percentage,
  diploma_percentage,
  academic_remarks
) on public.student_profiles to authenticated;

grant update (
  roll_number,
  personal_email,
  mobile_number,
  college,
  course,
  department,
  current_year,
  current_semester,
  graduation_year,
  cgpa,
  cgpa_scale,
  cgpa_unavailable,
  active_backlogs,
  cleared_backlogs,
  sslc_percentage,
  hsc_percentage,
  diploma_percentage,
  academic_remarks
) on public.student_profiles to authenticated;

grant insert (
  higher_studies_interest,
  preferred_study_level,
  preferred_countries,
  preferred_program_areas,
  target_intake,
  budget_range,
  scholarship_required,
  funding_required,
  study_mode,
  academic_preference,
  student_planning_stage
) on public.student_preferences to authenticated;

grant update (
  higher_studies_interest,
  preferred_study_level,
  preferred_countries,
  preferred_program_areas,
  target_intake,
  budget_range,
  scholarship_required,
  funding_required,
  study_mode,
  academic_preference,
  student_planning_stage
) on public.student_preferences to authenticated;

grant insert (
  exam_name,
  custom_exam_name,
  exam_status,
  attempt_number,
  planned_date,
  completed_date,
  score,
  valid_until,
  remarks
) on public.student_test_scores to authenticated;

grant update (
  exam_name,
  custom_exam_name,
  exam_status,
  attempt_number,
  planned_date,
  completed_date,
  score,
  valid_until,
  remarks
) on public.student_test_scores to authenticated;

grant delete on table public.student_test_scores to authenticated;

grant insert (
  achievement_type,
  title,
  organization,
  achievement_date,
  description
) on public.student_achievements to authenticated;

grant update (
  achievement_type,
  title,
  organization,
  achievement_date,
  description
) on public.student_achievements to authenticated;

grant delete on table public.student_achievements to authenticated;

create policy student_profiles_select_own
on public.student_profiles
for select
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_profiles_insert_own
on public.student_profiles
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_profiles_update_own
on public.student_profiles
for update
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
)
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_profiles_select_counselor_all
on public.student_profiles
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy student_preferences_select_own
on public.student_preferences
for select
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_preferences_insert_own
on public.student_preferences
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_preferences_update_own
on public.student_preferences
for update
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
)
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_preferences_select_counselor_all
on public.student_preferences
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy student_test_scores_select_own
on public.student_test_scores
for select
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_test_scores_insert_own
on public.student_test_scores
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_test_scores_update_own
on public.student_test_scores
for update
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
)
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_test_scores_delete_own
on public.student_test_scores
for delete
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_test_scores_select_counselor_all
on public.student_test_scores
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy student_achievements_select_own
on public.student_achievements
for select
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_achievements_insert_own
on public.student_achievements
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_achievements_update_own
on public.student_achievements
for update
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
)
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_achievements_delete_own
on public.student_achievements
for delete
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_achievements_select_counselor_all
on public.student_achievements
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy student_profiles_select_counselor_all
  on public.student_profiles is
  'Active verified counselors can read detailed student profiles but cannot mutate them.';

comment on policy student_preferences_select_counselor_all
  on public.student_preferences is
  'Active verified counselors can read student preferences but cannot mutate them.';

comment on policy student_test_scores_select_counselor_all
  on public.student_test_scores is
  'Active verified counselors can read student-reported exam records but cannot mutate them.';

comment on policy student_achievements_select_counselor_all
  on public.student_achievements is
  'Active verified counselors can read student-reported achievements but cannot mutate them.';

-- There are deliberately no anonymous, admin, or director policies. There are
-- no counselor INSERT, UPDATE, or DELETE policies. Authenticated UPDATE grants
-- are column-limited, and RLS makes them effective only for the owning active,
-- verified student. Main profiles and preferences have no DELETE grant/policy.

commit;

-- >>> supabase/migrations/202607200001_require_core_profile_for_preferences.sql
-- K-GEO student-preferences core-profile dependency.
-- Review this migration and run the documented preflight query before applying.
-- Apply only after 202607190002_student_profile_foundation.sql.
--
-- Manual preflight (returns only non-sensitive owner UUIDs):
--
-- select
--   preference.student_id
-- from public.student_preferences as preference
-- left join public.student_profiles as profile
--   on profile.student_id = preference.student_id
-- where profile.student_id is null;
--
-- If this returns rows, inspect and explicitly resolve those student IDs before
-- applying this migration. This migration never repairs or deletes them.

begin;

-- Fail before changing either policy if legacy preferences-only rows exist.
-- The raised error deliberately reports no student IDs or private profile data.
do $preflight$
begin
  if exists (
    select 1
    from public.student_preferences as preference
    left join public.student_profiles as profile
      on profile.student_id = preference.student_id
    where profile.student_id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Unresolved student preferences without a core profile exist';
  end if;
end;
$preflight$;

-- The existing BEFORE INSERT trigger remains authoritative for deriving
-- student_id from auth.uid() and rejecting callers who are not active,
-- email-confirmed students. This policy additionally requires that the
-- trigger-derived owner already has a core student_profiles row.
alter policy student_preferences_insert_own
on public.student_preferences
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
  and exists (
    select 1
    from public.student_profiles as student_profile
    where student_profile.student_id = student_preferences.student_id
  )
);

-- Both USING and WITH CHECK retain own-row, active verified student access and
-- require the corresponding core profile to remain visible. Column grants
-- continue to prevent changes to ownership and protected timestamps.
alter policy student_preferences_update_own
on public.student_preferences
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
  and exists (
    select 1
    from public.student_profiles as student_profile
    where student_profile.student_id = student_preferences.student_id
  )
)
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
  and exists (
    select 1
    from public.student_profiles as student_profile
    where student_profile.student_id = student_preferences.student_id
  )
);

comment on policy student_preferences_insert_own
  on public.student_preferences is
  'Active verified students can insert only their own preferences after creating their core student profile.';

comment on policy student_preferences_update_own
  on public.student_preferences is
  'Active verified students can update only their own preferences while their core student profile exists.';

commit;

-- >>> supabase/migrations/202607200002_counselor_student_directory_foundation.sql
-- K-GEO counselor student-directory foundation (Phase C0).
-- Review this migration before applying it. Apply it only after
-- 202607190002_student_profile_foundation.sql.
--
-- This migration adds read-only RPC projections. It does not change existing
-- rows, table grants, RLS policies, consultations, or student-owned writes.

begin;

create type public.student_directory_profile_state as enum (
  'profile_not_started',
  'profile_in_progress',
  'ready_for_counseling',
  'submitted'
);

comment on type public.student_directory_profile_state is
  'Counselor-directory presentation state derived from profile existence, stored workflow status, and the authoritative completion view.';

revoke all privileges on type public.student_directory_profile_state
  from public, anon;

grant usage on type public.student_directory_profile_state
  to authenticated;

-- SECURITY: profiles RLS intentionally exposes only the caller's own identity.
-- This definer function is the narrower cross-user boundary: it checks the
-- caller against both profiles and Auth, returns student-role rows only, and
-- projects no authentication metadata or private Student 360 fields.
create function public.list_counselor_student_directory(
  p_search text default null,
  p_college text default null,
  p_course text default null,
  p_department text default null,
  p_graduation_year integer default null,
  p_is_active boolean default null,
  p_profile_state public.student_directory_profile_state default null,
  p_higher_studies_interest public.higher_studies_interest default null,
  p_preferred_study_level public.student_preferred_study_level default null,
  p_target_intake text default null,
  p_sort text default 'name_asc',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  student_id uuid,
  full_name text,
  college_email text,
  account_created_at timestamptz,
  is_active boolean,
  roll_number text,
  college text,
  course text,
  department text,
  graduation_year integer,
  profile_state public.student_directory_profile_state,
  completion_percentage integer,
  ready_for_counseling boolean,
  higher_studies_interest public.higher_studies_interest,
  preferred_study_level public.student_preferred_study_level,
  target_intake text,
  last_profile_update timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  requester_id uuid;
  normalized_search text;
  normalized_college text;
  normalized_course text;
  normalized_department text;
  normalized_target_intake text;
  normalized_sort text;
  page_offset bigint;
begin
  requester_id := (select auth.uid());

  -- Return no rows for every unauthorized role or identity state. This keeps
  -- caller failures closed without exposing which authorization check failed.
  if requester_id is null or not exists (
    select 1
    from public.profiles as caller_profile
    inner join auth.users as caller_auth
      on caller_auth.id = caller_profile.id
    where caller_profile.id = requester_id
      and caller_profile.role = 'counselor'::public.user_role
      and caller_profile.is_active is true
      and caller_auth.email_confirmed_at is not null
  ) then
    return;
  end if;

  normalized_search := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_search)),
    ''
  );
  normalized_college := nullif(pg_catalog.btrim(p_college), '');
  normalized_course := nullif(pg_catalog.btrim(p_course), '');
  normalized_department := nullif(pg_catalog.btrim(p_department), '');
  normalized_target_intake := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_target_intake)),
    ''
  );
  normalized_sort := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_sort)), ''),
    'name_asc'
  );

  if pg_catalog.char_length(normalized_search) > 100
    or pg_catalog.char_length(normalized_college) > 150
    or pg_catalog.char_length(normalized_course) > 150
    or pg_catalog.char_length(normalized_department) > 150 then
    raise exception using
      errcode = '22023',
      message = 'One or more directory filters are invalid';
  end if;

  if p_graduation_year is not null
    and p_graduation_year not between 2024 and 2040 then
    raise exception using
      errcode = '22023',
      message = 'The graduation-year filter is invalid';
  end if;

  if normalized_target_intake is not null
    and normalized_target_intake !~
      '^(spring|summer|fall|winter)-20[2-9][0-9]$' then
    raise exception using
      errcode = '22023',
      message = 'The target-intake filter is invalid';
  end if;

  if normalized_sort not in (
    'name_asc',
    'recently_registered',
    'recently_updated',
    'completion_low_to_high',
    'completion_high_to_low',
    'graduation_year'
  ) then
    raise exception using
      errcode = '22023',
      message = 'The directory sort is invalid';
  end if;

  if p_page is null or p_page not between 1 and 100000 then
    raise exception using
      errcode = '22023',
      message = 'The directory page is invalid';
  end if;

  if p_page_size is null or p_page_size not between 1 and 100 then
    raise exception using
      errcode = '22023',
      message = 'The directory page size is invalid';
  end if;

  page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  with directory_base as (
    select
      student_account.id as student_id,
      student_account.full_name,
      student_account.college_email,
      student_account.created_at as account_created_at,
      student_account.is_active,
      student_profile.roll_number,
      student_profile.college,
      student_profile.course,
      student_profile.department,
      student_profile.graduation_year,
      case
        when student_profile.student_id is null then
          'profile_not_started'::public.student_directory_profile_state
        when completion.profile_status =
          'submitted'::public.student_profile_status then
          'submitted'::public.student_directory_profile_state
        when completion.ready_for_counseling is true then
          'ready_for_counseling'::public.student_directory_profile_state
        else
          'profile_in_progress'::public.student_directory_profile_state
      end as profile_state,
      coalesce(
        completion.overall_completion_percentage,
        0
      ) as completion_percentage,
      coalesce(
        completion.ready_for_counseling,
        false
      ) as ready_for_counseling,
      preference.higher_studies_interest,
      preference.preferred_study_level,
      preference.target_intake,
      greatest(
        student_profile.updated_at,
        preference.updated_at,
        (
          select pg_catalog.max(test_score.updated_at)
          from public.student_test_scores as test_score
          where test_score.student_id = student_profile.student_id
        ),
        (
          select pg_catalog.max(achievement.updated_at)
          from public.student_achievements as achievement
          where achievement.student_id = student_profile.student_id
        )
      ) as last_profile_update
    from public.profiles as student_account
    left join public.student_profiles as student_profile
      on student_profile.student_id = student_account.id
    left join public.student_preferences as preference
      on preference.student_id = student_profile.student_id
    left join public.student_profile_completion as completion
      on completion.student_id = student_profile.student_id
    -- Retain inactive student identities for historical visibility. The
    -- optional active-state filter is applied by the outer query.
    where student_account.role = 'student'::public.user_role
  ),
  filtered_directory as (
    select directory_entry.*
    from directory_base as directory_entry
    where (
      normalized_search is null
      or pg_catalog.strpos(
        pg_catalog.lower(
          coalesce(directory_entry.full_name, '')
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(
          coalesce(directory_entry.roll_number, '')
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(directory_entry.college_email),
        normalized_search
      ) > 0
    )
      and (
        normalized_college is null
        or pg_catalog.lower(directory_entry.college) =
          pg_catalog.lower(normalized_college)
      )
      and (
        normalized_course is null
        or pg_catalog.lower(directory_entry.course) =
          pg_catalog.lower(normalized_course)
      )
      and (
        normalized_department is null
        or pg_catalog.lower(directory_entry.department) =
          pg_catalog.lower(normalized_department)
      )
      and (
        p_graduation_year is null
        or directory_entry.graduation_year = p_graduation_year
      )
      and (
        p_is_active is null
        or directory_entry.is_active = p_is_active
      )
      and (
        p_profile_state is null
        or directory_entry.profile_state = p_profile_state
      )
      and (
        p_higher_studies_interest is null
        or directory_entry.higher_studies_interest =
          p_higher_studies_interest
      )
      and (
        p_preferred_study_level is null
        or directory_entry.preferred_study_level =
          p_preferred_study_level
      )
      and (
        normalized_target_intake is null
        or directory_entry.target_intake = normalized_target_intake
      )
  )
  select
    directory_entry.student_id,
    directory_entry.full_name,
    directory_entry.college_email,
    directory_entry.account_created_at,
    directory_entry.is_active,
    directory_entry.roll_number,
    directory_entry.college,
    directory_entry.course,
    directory_entry.department,
    directory_entry.graduation_year,
    directory_entry.profile_state,
    directory_entry.completion_percentage,
    directory_entry.ready_for_counseling,
    directory_entry.higher_studies_interest,
    directory_entry.preferred_study_level,
    directory_entry.target_intake,
    directory_entry.last_profile_update,
    pg_catalog.count(*) over () as total_count
  from filtered_directory as directory_entry
  order by
    case when normalized_sort = 'name_asc' then
      pg_catalog.lower(
        coalesce(
          nullif(pg_catalog.btrim(directory_entry.full_name), ''),
          directory_entry.college_email
        )
      )
    end asc,
    case when normalized_sort = 'recently_registered' then
      directory_entry.account_created_at
    end desc,
    case when normalized_sort = 'recently_updated' then
      directory_entry.last_profile_update
    end desc nulls last,
    case when normalized_sort = 'completion_low_to_high' then
      directory_entry.completion_percentage
    end asc,
    case when normalized_sort = 'completion_high_to_low' then
      directory_entry.completion_percentage
    end desc,
    case when normalized_sort = 'graduation_year' then
      directory_entry.graduation_year
    end asc nulls last,
    directory_entry.student_id asc
  limit p_page_size
  offset page_offset;
exception
  when sqlstate '22023' then
    -- Parameter-validation messages above are intentionally generic and safe.
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The student directory is temporarily unavailable';
end;
$function$;

comment on function public.list_counselor_student_directory(
  text,
  text,
  text,
  text,
  integer,
  boolean,
  public.student_directory_profile_state,
  public.higher_studies_interest,
  public.student_preferred_study_level,
  text,
  text,
  integer,
  integer
) is
  'Returns one bounded, privacy-minimized student directory page to an active verified counselor.';

revoke all on function public.list_counselor_student_directory(
  text,
  text,
  text,
  text,
  integer,
  boolean,
  public.student_directory_profile_state,
  public.higher_studies_interest,
  public.student_preferred_study_level,
  text,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.list_counselor_student_directory(
  text,
  text,
  text,
  text,
  integer,
  boolean,
  public.student_directory_profile_state,
  public.higher_studies_interest,
  public.student_preferred_study_level,
  text,
  text,
  integer,
  integer
) to authenticated;

-- The future Student 360 route needs only a trusted UUID-to-identity bridge.
-- Unknown UUIDs and non-student UUIDs both return no row, preventing staff
-- identity discovery and avoiding account-existence distinctions.
create function public.get_counselor_student_identity(
  p_student_id uuid
)
returns table (
  student_id uuid,
  full_name text,
  college_email text,
  account_created_at timestamptz,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  requester_id uuid;
begin
  requester_id := (select auth.uid());

  if requester_id is null or p_student_id is null or not exists (
    select 1
    from public.profiles as caller_profile
    inner join auth.users as caller_auth
      on caller_auth.id = caller_profile.id
    where caller_profile.id = requester_id
      and caller_profile.role = 'counselor'::public.user_role
      and caller_profile.is_active is true
      and caller_auth.email_confirmed_at is not null
  ) then
    return;
  end if;

  return query
  select
    student_account.id,
    student_account.full_name,
    student_account.college_email,
    student_account.created_at,
    student_account.is_active
  from public.profiles as student_account
  where student_account.id = p_student_id
    and student_account.role = 'student'::public.user_role;
exception
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The student identity is temporarily unavailable';
end;
$function$;

comment on function public.get_counselor_student_identity(uuid) is
  'Returns minimal identity and account-active state for one student UUID to an active verified counselor; unknown and staff UUIDs return no row.';

revoke all on function public.get_counselor_student_identity(uuid)
  from public, anon, authenticated;

grant execute on function public.get_counselor_student_identity(uuid)
  to authenticated;

commit;

-- >>> supabase/migrations/202607230001_canonical_names_and_consultation_outcomes.sql
-- K-GEO canonical-name and consultation-outcome foundation.
-- Review this migration before applying it. It does not rewrite existing
-- profile names or historical consultation snapshots.

begin;

-- Existing null names remain valid so students can correct them through My
-- Profile. NOT VALID avoids scanning or rewriting legacy rows, while PostgreSQL
-- still enforces the 150-character boundary for new and changed rows.
alter table public.profiles
  add constraint profiles_full_name_check
    check (
      full_name is null
      or (
        pg_catalog.char_length(pg_catalog.btrim(full_name)) between 1 and 150
        and full_name = pg_catalog.regexp_replace(
          pg_catalog.btrim(full_name),
          '[[:space:]]+',
          ' ',
          'g'
        )
      )
    )
    not valid;

comment on constraint profiles_full_name_check on public.profiles is
  'Canonical names are null for legacy accounts or trimmed, whitespace-normalized non-empty text of at most 150 characters.';

-- SECURITY: public registration may provide only the non-privileged display
-- name through user metadata. Role remains hard-coded to student and no other
-- metadata key is trusted. New Auth identities must provide the validated
-- name; later trusted staff provisioning must provide it as well.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_email text;
  normalized_full_name text;
begin
  normalized_email := pg_catalog.lower(pg_catalog.btrim(new.email));

  if normalized_email is null
    or normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid @kct.ac.in email address';
  end if;

  if not (
    coalesce(new.raw_user_meta_data, '{}'::jsonb) ? 'full_name'
  )
    or pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'full_name')
      <> 'string' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  normalized_full_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(normalized_full_name) not between 1 and 150 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  insert into public.profiles (
    id,
    college_email,
    role,
    full_name,
    is_active
  )
  values (
    new.id,
    normalized_email,
    'student'::public.user_role,
    normalized_full_name,
    true
  );

  return new;
end;
$function$;

comment on function public.handle_new_user() is
  'Creates one student profile from a valid Auth email and required validated canonical name; role metadata is never trusted.';

-- PostgreSQL permits an enum value to be added transactionally. The remaining
-- statements compare status through text until this transaction commits, so
-- the new value is not used as an enum literal before it is safe to do so.
alter type public.consultation_status
  add value if not exists 'no_show' after 'completed';

alter table public.consultation_requests
  add column outcome_recorded_at timestamptz,
  add column outcome_recorded_by uuid,
  add constraint consultation_requests_outcome_pair_check
    check (
      (
        outcome_recorded_at is null
        and outcome_recorded_by is null
      )
      or (
        outcome_recorded_at is not null
        and outcome_recorded_by is not null
        and status::text in ('completed', 'no_show')
      )
    ),
  add constraint consultation_requests_no_show_audit_check
    check (
      status::text <> 'no_show'
      or (
        outcome_recorded_at is not null
        and outcome_recorded_by is not null
      )
    );

comment on column public.consultation_requests.outcome_recorded_at is
  'Trusted timestamp when a counselor finalized a completed or no-show outcome.';

comment on column public.consultation_requests.outcome_recorded_by is
  'Authenticated counselor UUID captured by the trusted outcome function; retained as historical audit identity.';

-- Extend the existing assignment invariant without changing any legacy row.
-- Text comparison avoids using the newly added enum value before commit.
alter table public.consultation_requests
  drop constraint consultation_requests_status_assignment_check,
  add constraint consultation_requests_status_assignment_check
    check (
      (
        status::text in ('submitted', 'waiting_for_assignment')
        and assigned_counselor_id is null
      )
      or (
        status::text = 'counselor_assigned'
        and assigned_counselor_id is not null
      )
      or status::text in (
        'scheduled',
        'completed',
        'no_show',
        'cancelled'
      )
    );

comment on constraint consultation_requests_status_assignment_check
  on public.consultation_requests is
  'Direct scheduled and final-outcome rows need no assignment; counselor_assigned rows still require one.';

create index consultation_requests_scheduled_end_idx
  on public.consultation_requests (consultation_date, slot_end, id)
  where status = 'scheduled'::public.consultation_status;

comment on index public.consultation_requests_scheduled_end_idx is
  'Supports Asia/Kolkata active-or-future and outcome-required slot-end filters for unresolved scheduled consultations.';

-- SECURITY: authenticated callers receive EXECUTE only. The function derives
-- the actor from auth.uid(), verifies an active email-confirmed counselor,
-- locks the selected row, accepts only final outcomes, and refuses to finalize
-- a consultation before its fixed slot has ended in Asia/Kolkata.
create function public.record_consultation_outcome(
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
    request.consultation_date,
    request.slot_end,
    request.status
  into
    target_date,
    target_end,
    target_status
  from public.consultation_requests as request
  where request.id = p_consultation_id
  for update;

  if not found
    or target_status::text <> 'scheduled'
    or target_date is null
    or target_end is null then
    raise exception using
      errcode = '22023',
      message = 'The consultation outcome cannot be recorded';
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
    and request.status::text = 'scheduled'
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

comment on function public.record_consultation_outcome(uuid, text) is
  'Allows only an active verified counselor to finalize an ended scheduled consultation as completed or no_show.';

revoke all on function public.record_consultation_outcome(uuid, text)
  from public, anon, authenticated;

grant execute on function public.record_consultation_outcome(uuid, text)
  to authenticated;

-- Close the older consultation-read policy's direct-API verification gap.
-- The shared helper checks auth.uid(), active role state, and auth.users email
-- confirmation through its reviewed SECURITY DEFINER boundary.
drop policy consultation_requests_select_counselor_all
  on public.consultation_requests;

create policy consultation_requests_select_counselor_all
on public.consultation_requests
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy consultation_requests_select_counselor_all
  on public.consultation_requests is
  'Active email-confirmed counselors can read all consultation requests; mutation still requires a separately reviewed trusted operation.';

-- Other table SELECT policies and all table grants remain unchanged. In
-- particular, students keep own-row SELECT, existing director/admin reads are
-- not broadened, and no authenticated role receives table UPDATE or DELETE
-- permission.

commit;

-- >>> supabase/migrations/202607230002_atomic_student_identity_save.sql
-- K-GEO atomic student identity save.
-- Review this migration after 202607230001 and before deploying the matching
-- application code. Do not use it as a substitute for server-side validation.

begin;

-- SECURITY: this is the only browser-callable operation that changes a
-- canonical profile name after this migration. It derives the owner from the
-- authenticated JWT, authorizes that owner against trusted Auth and profile
-- state, and writes both identity tables in the caller's transaction.
create function public.save_student_identity(
  p_full_name text,
  p_roll_number text,
  p_personal_email text,
  p_mobile_number text,
  p_college text,
  p_course text,
  p_department text,
  p_current_year integer,
  p_current_semester integer,
  p_graduation_year integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  requester_id uuid;
  normalized_full_name text;
  updated_profile_id uuid;
  failure_constraint text;
begin
  requester_id := (select auth.uid());

  if requester_id is null then
    raise exception using
      errcode = '42501',
      message = 'An active verified student profile is required';
  end if;

  if p_full_name is null then
    raise exception using
      errcode = '22023',
      message = 'A valid full name is required';
  end if;

  normalized_full_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_full_name),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(normalized_full_name) not between 1 and 150 then
    raise exception using
      errcode = '22023',
      message = 'A valid full name is required';
  end if;

  begin
    update public.profiles as profile
    set full_name = normalized_full_name
    where profile.id = requester_id
      and profile.role = 'student'::public.user_role
      and profile.is_active is true
      and exists (
        select 1
        from auth.users as auth_user
        where auth_user.id = requester_id
          and auth_user.email_confirmed_at is not null
      )
    returning profile.id
    into updated_profile_id;

    if updated_profile_id is null then
      raise exception using
        errcode = '42501',
        message = 'An active verified student profile is required';
    end if;

    insert into public.student_profiles (
      student_id,
      roll_number,
      personal_email,
      mobile_number,
      college,
      course,
      department,
      current_year,
      current_semester,
      graduation_year
    )
    values (
      requester_id,
      p_roll_number,
      p_personal_email,
      p_mobile_number,
      p_college,
      p_course,
      p_department,
      p_current_year,
      p_current_semester,
      p_graduation_year
    )
    on conflict (student_id) do update
    set roll_number = excluded.roll_number,
        personal_email = excluded.personal_email,
        mobile_number = excluded.mobile_number,
        college = excluded.college,
        course = excluded.course,
        department = excluded.department,
        current_year = excluded.current_year,
        current_semester = excluded.current_semester,
        graduation_year = excluded.graduation_year;
  exception
    when unique_violation then
      get stacked diagnostics
        failure_constraint = constraint_name;

      if failure_constraint =
        'student_profiles_college_roll_number_key' then
        raise exception using
          errcode = '23505',
          message = 'The college and roll-number combination is unavailable',
          constraint = 'student_profiles_college_roll_number_key';
      end if;

      raise exception using
        errcode = '40001',
        message = 'The student identity changed concurrently';
    when check_violation or not_null_violation then
      raise exception using
        errcode = '22023',
        message = 'The student identity values are invalid';
    when insufficient_privilege then
      raise exception using
        errcode = '42501',
        message = 'An active verified student profile is required';
    when others then
      raise exception using
        errcode = 'P0001',
        message = 'The student identity could not be saved';
  end;
end;
$function$;

comment on function public.save_student_identity(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
) is
  'Atomically saves the authenticated active verified student canonical name and approved detailed identity fields without returning student data.';

revoke all on function public.save_student_identity(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.save_student_identity(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  integer,
  integer,
  integer
) to authenticated;

-- Prevent browser clients from bypassing the atomic identity RPC with separate
-- table mutations. Existing own-row RLS policies remain defense in depth.
revoke update (full_name) on table public.profiles from authenticated;

revoke insert (
  roll_number,
  personal_email,
  mobile_number,
  college,
  course,
  department,
  current_year,
  current_semester,
  graduation_year
) on table public.student_profiles from authenticated;

revoke update (
  roll_number,
  personal_email,
  mobile_number,
  college,
  course,
  department,
  current_year,
  current_semester,
  graduation_year
) on table public.student_profiles from authenticated;

-- Academic-field UPDATE grants are intentionally unchanged because later
-- profile sections still save those approved columns independently.

commit;

-- >>> supabase/migrations/202607230003_counselor_consultation_reference_rpc.sql
-- K-GEO Phase C1.1, stage A: additive counselor consultation references.
-- Review and apply this migration before deploying the counselor application
-- update. This stage intentionally does not change consultation table grants.

begin;

create function public.get_counselor_consultation_references(
  p_consultation_ids uuid[]
)
returns table (
  consultation_id uuid,
  request_number text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  requested_count integer;
  distinct_count integer;
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

  requested_count := pg_catalog.cardinality(p_consultation_ids);

  if p_consultation_ids is null
    or requested_count is null
    or requested_count < 1
    or requested_count > 100
    or pg_catalog.array_position(p_consultation_ids, null) is not null then
    raise exception using
      errcode = '22023',
      message = 'Provide between 1 and 100 unique consultation identifiers';
  end if;

  select pg_catalog.count(*)::integer
  into distinct_count
  from (
    select distinct requested.consultation_id
    from pg_catalog.unnest(p_consultation_ids)
      as requested(consultation_id)
  ) as unique_requested;

  if distinct_count <> requested_count then
    raise exception using
      errcode = '22023',
      message = 'Provide between 1 and 100 unique consultation identifiers';
  end if;

  return query
  select
    request.id,
    request.request_number
  from public.consultation_requests as request
  where request.id = any (p_consultation_ids)
  order by request.id;
end;
$function$;

alter function public.get_counselor_consultation_references(uuid[])
  owner to postgres;

comment on function
  public.get_counselor_consultation_references(uuid[]) is
  'Returns only consultation UUID/reference pairs for up to 100 supplied IDs and only to an active email-confirmed counselor.';

revoke all on function
  public.get_counselor_consultation_references(uuid[])
  from public, anon, authenticated;

grant execute on function
  public.get_counselor_consultation_references(uuid[])
  to authenticated;

-- Stage A is additive. Existing table SELECT and all INSERT privileges remain
-- unchanged until the counselor application has deployed and been verified.

commit;

-- >>> supabase/migrations/202607230004_consultation_reference_column_hardening.sql
-- K-GEO Phase C1.1, stage B: make consultation request numbers internal.
-- Apply only after stage A is verified and the counselor application has been
-- deployed using get_counselor_consultation_references(uuid[]).

begin;

do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.get_counselor_consultation_references(uuid[])'
  ) is null then
    raise exception using
      errcode = '55000',
      message = 'Apply the counselor consultation reference RPC migration first';
  end if;
end;
$migration$;

-- Table-level SELECT exposes every column to every RLS-authorized session.
-- Students and counselors both connect as PostgreSQL role authenticated, so
-- request_number must be removed at the column-privilege boundary rather than
-- through an RLS expression.
revoke select on table public.consultation_requests
  from authenticated;

revoke select (request_number)
  on table public.consultation_requests
  from public, anon, authenticated;

-- These columns cover the current student history, booking receipt, counselor
-- dashboard and schedule, lifecycle/outcome controls, and the safe historical
-- fields needed by a future authorized Student 360 consultation history.
-- Deprecated assignment fields and counselor outcome-audit identity are not
-- required by these flows and remain ungranted.
grant select (
  id,
  student_id,
  student_name,
  roll_number,
  college_email,
  personal_email,
  college_end_year,
  department,
  course,
  mobile_number,
  higher_studies_interest,
  status,
  consultation_date,
  slot_start,
  slot_end,
  submitted_at,
  created_at,
  updated_at
) on table public.consultation_requests
  to authenticated;

comment on column public.consultation_requests.request_number is
  'Database-generated internal consultation reference; authenticated application users retrieve it only through an authorized trusted RPC.';

-- Existing RLS policies still decide which rows each authenticated role may
-- read. Existing column-level INSERT grants are unaffected. No UPDATE or
-- DELETE privilege is added, and no consultation row or reference is changed.

commit;

-- >>> supabase/migrations/202607250001_counselor_notes_and_follow_ups_foundation.sql
-- K-GEO Phase D1 counselor-private notes and follow-up foundation.
-- Review this migration before applying it. Apply it only after the existing
-- identity, student-profile, counselor-directory, consultation-outcome, and
-- counselor consultation-reference migrations.
--
-- This migration is additive. It creates counselor-owned internal records and
-- does not alter student-submitted data, consultation rows, or existing roles.

begin;

create type public.counselor_follow_up_priority as enum (
  'low',
  'normal',
  'high'
);

create type public.counselor_follow_up_status as enum (
  'pending',
  'completed',
  'cancelled'
);

comment on type public.counselor_follow_up_priority is
  'Counselor-controlled priority for one private student follow-up.';

comment on type public.counselor_follow_up_status is
  'Stored follow-up workflow state. Due-today and overdue are derived in Asia/Kolkata and are never stored.';

create table public.counselor_student_notes (
  id uuid
    constraint counselor_student_notes_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint counselor_student_notes_student_id_not_null not null
    constraint counselor_student_notes_student_id_fkey
      references public.profiles(id)
      on delete restrict,
  counselor_id uuid
    constraint counselor_student_notes_counselor_id_not_null not null
    constraint counselor_student_notes_counselor_id_fkey
      references public.profiles(id)
      on delete restrict,
  consultation_id uuid
    constraint counselor_student_notes_consultation_id_fkey
      references public.consultation_requests(id)
      on delete set null,
  note_text text
    constraint counselor_student_notes_note_text_not_null not null,
  is_pinned boolean
    constraint counselor_student_notes_is_pinned_not_null not null
    default false,
  created_at timestamptz
    constraint counselor_student_notes_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint counselor_student_notes_updated_at_not_null not null
    default pg_catalog.now(),

  constraint counselor_student_notes_distinct_people_check
    check (student_id <> counselor_id),
  constraint counselor_student_notes_note_text_check
    check (
      note_text = pg_catalog.regexp_replace(
        pg_catalog.btrim(note_text),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(note_text) between 1 and 5000
    ),
  constraint counselor_student_notes_updated_at_check
    check (updated_at >= created_at)
);

create table public.counselor_follow_ups (
  id uuid
    constraint counselor_follow_ups_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint counselor_follow_ups_student_id_not_null not null
    constraint counselor_follow_ups_student_id_fkey
      references public.profiles(id)
      on delete restrict,
  counselor_id uuid
    constraint counselor_follow_ups_counselor_id_not_null not null
    constraint counselor_follow_ups_counselor_id_fkey
      references public.profiles(id)
      on delete restrict,
  consultation_id uuid
    constraint counselor_follow_ups_consultation_id_fkey
      references public.consultation_requests(id)
      on delete set null,
  due_date date
    constraint counselor_follow_ups_due_date_not_null not null,
  priority public.counselor_follow_up_priority
    constraint counselor_follow_ups_priority_not_null not null
    default 'normal'::public.counselor_follow_up_priority,
  status public.counselor_follow_up_status
    constraint counselor_follow_ups_status_not_null not null
    default 'pending'::public.counselor_follow_up_status,
  next_action text
    constraint counselor_follow_ups_next_action_not_null not null,
  details text,
  completed_at timestamptz,
  completed_by uuid
    constraint counselor_follow_ups_completed_by_fkey
      references public.profiles(id)
      on delete restrict,
  created_at timestamptz
    constraint counselor_follow_ups_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint counselor_follow_ups_updated_at_not_null not null
    default pg_catalog.now(),

  constraint counselor_follow_ups_distinct_people_check
    check (student_id <> counselor_id),
  constraint counselor_follow_ups_due_date_check
    check (due_date >= date '2000-01-01'),
  constraint counselor_follow_ups_next_action_check
    check (
      next_action = pg_catalog.regexp_replace(
        pg_catalog.btrim(next_action),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(next_action) between 1 and 500
    ),
  constraint counselor_follow_ups_details_check
    check (
      details is null
      or (
        details = pg_catalog.regexp_replace(
          pg_catalog.btrim(details),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(details) between 1 and 2000
      )
    ),
  constraint counselor_follow_ups_completion_state_check
    check (
      (
        status = 'completed'::public.counselor_follow_up_status
        and completed_at is not null
        and completed_by is not null
        and completed_by = counselor_id
      )
      or (
        status in (
          'pending'::public.counselor_follow_up_status,
          'cancelled'::public.counselor_follow_up_status
        )
        and completed_at is null
        and completed_by is null
      )
    ),
  constraint counselor_follow_ups_completed_at_check
    check (
      completed_at is null
      or completed_at between created_at and updated_at
    ),
  constraint counselor_follow_ups_updated_at_check
    check (updated_at >= created_at)
);

comment on table public.counselor_student_notes is
  'Counselor-owned internal notes that are never visible to students, admins, directors, or anonymous callers.';

comment on table public.counselor_follow_ups is
  'Counselor-owned internal student follow-up actions with database-controlled final status audit.';

comment on column public.counselor_student_notes.counselor_id is
  'Trusted owner derived from auth.uid() by the database trigger.';

comment on column public.counselor_student_notes.consultation_id is
  'Optional internal link. The trigger requires the consultation to belong to the same student.';

comment on column public.counselor_follow_ups.counselor_id is
  'Trusted owner derived from auth.uid() by the database trigger.';

comment on column public.counselor_follow_ups.consultation_id is
  'Optional internal link. The trigger requires the consultation to belong to the same student.';

comment on column public.counselor_follow_ups.completed_at is
  'Trusted completion timestamp set only by record_counselor_follow_up_status.';

comment on column public.counselor_follow_ups.completed_by is
  'Trusted completing counselor derived from auth.uid() by record_counselor_follow_up_status.';

-- SECURITY: this shared trigger is the trusted ownership and target boundary
-- for both D1 tables. It derives counselor ownership, requires an active,
-- email-confirmed counselor, confirms that the target is a student profile,
-- and verifies every optional consultation link against that same student.
-- Protected ownership and audit values are never accepted from the browser.
create function public.prepare_counselor_private_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  change_time timestamptz;
begin
  caller_id := (select auth.uid());
  change_time := pg_catalog.statement_timestamp();

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

  if new.student_id is null or not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = new.student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'A valid student target is required';
  end if;

  if new.consultation_id is not null and not exists (
    select 1
    from public.consultation_requests as consultation
    where consultation.id = new.consultation_id
      and consultation.student_id = new.student_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'The linked consultation is invalid';
  end if;

  if tg_op = 'INSERT' then
    new.counselor_id := caller_id;
    new.created_at := change_time;
    new.updated_at := change_time;

    if tg_table_name = 'counselor_follow_ups' then
      new.status := 'pending'::public.counselor_follow_up_status;
      new.completed_at := null;
      new.completed_by := null;
    end if;
  else
    if old.counselor_id <> caller_id
      or new.counselor_id is distinct from old.counselor_id
      or new.student_id is distinct from old.student_id
      or new.created_at is distinct from old.created_at then
      raise exception using
        errcode = '42501',
        message = 'The counselor record cannot be changed';
    end if;

    if tg_table_name = 'counselor_follow_ups' then
      if old.status <> 'pending'::public.counselor_follow_up_status then
        raise exception using
          errcode = '40001',
          message = 'The follow-up changed concurrently';
      end if;

      if new.status = 'pending'::public.counselor_follow_up_status then
        if new.completed_at is not null or new.completed_by is not null then
          raise exception using
            errcode = '22023',
            message = 'The follow-up audit is invalid';
        end if;
      elsif new.status = 'completed'::public.counselor_follow_up_status then
        if new.completed_at is null or new.completed_by <> caller_id then
          raise exception using
            errcode = '22023',
            message = 'The follow-up audit is invalid';
        end if;
      elsif new.status = 'cancelled'::public.counselor_follow_up_status then
        if new.completed_at is not null or new.completed_by is not null then
          raise exception using
            errcode = '22023',
            message = 'The follow-up audit is invalid';
        end if;
      else
        raise exception using
          errcode = '22023',
          message = 'The follow-up status is invalid';
      end if;
    end if;

    new.updated_at := change_time;
  end if;

  return new;
end;
$function$;

alter function public.prepare_counselor_private_record()
  owner to postgres;

comment on function public.prepare_counselor_private_record() is
  'Derives D1 counselor ownership and timestamps and validates student and consultation targets.';

create function public.normalize_counselor_student_note()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.note_text := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.note_text),
    '[[:space:]]+',
    ' ',
    'g'
  );
  return new;
end;
$function$;

comment on function public.normalize_counselor_student_note() is
  'Normalizes private-note whitespace before constraints run.';

create function public.normalize_counselor_follow_up()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.next_action := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.next_action),
    '[[:space:]]+',
    ' ',
    'g'
  );
  new.details := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(new.details),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  return new;
end;
$function$;

comment on function public.normalize_counselor_follow_up() is
  'Normalizes follow-up action and optional detail text before constraints run.';

create trigger counselor_student_notes_10_prepare
before insert or update on public.counselor_student_notes
for each row
execute function public.prepare_counselor_private_record();

create trigger counselor_student_notes_20_normalize
before insert or update on public.counselor_student_notes
for each row
execute function public.normalize_counselor_student_note();

create trigger counselor_follow_ups_10_prepare
before insert or update on public.counselor_follow_ups
for each row
execute function public.prepare_counselor_private_record();

create trigger counselor_follow_ups_20_normalize
before insert or update on public.counselor_follow_ups
for each row
execute function public.normalize_counselor_follow_up();

create index counselor_student_notes_student_history_idx
  on public.counselor_student_notes (
    student_id,
    is_pinned desc,
    created_at desc,
    id
  );

create index counselor_student_notes_counselor_activity_idx
  on public.counselor_student_notes (
    counselor_id,
    updated_at desc,
    id
  );

create index counselor_follow_ups_student_status_due_idx
  on public.counselor_follow_ups (
    student_id,
    status,
    due_date,
    id
  );

create index counselor_follow_ups_counselor_status_due_idx
  on public.counselor_follow_ups (
    counselor_id,
    status,
    due_date,
    id
  );

comment on index public.counselor_student_notes_student_history_idx is
  'Supports bounded pinned-first private-note history for one student.';

comment on index public.counselor_student_notes_counselor_activity_idx is
  'Supports future bounded counselor-owned note activity queries.';

comment on index public.counselor_follow_ups_student_status_due_idx is
  'Supports one student follow-up history grouped by status and due date.';

comment on index public.counselor_follow_ups_counselor_status_due_idx is
  'Supports future counselor-owned pending and due-date work lists.';

-- SECURITY: final follow-up state is not directly updateable. This function
-- derives the caller, locks one owned row, permits only the first transition
-- from pending to completed/cancelled, and sets completion audit in the same
-- transaction. A second concurrent transition observes the final row and
-- fails without overwriting the first result.
create function public.record_counselor_follow_up_status(
  p_follow_up_id uuid,
  p_status text
)
returns public.counselor_follow_up_status
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  requested_status public.counselor_follow_up_status;
  target_counselor_id uuid;
  target_status public.counselor_follow_up_status;
  transition_time timestamptz;
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

  if p_follow_up_id is null
    or p_status is null
    or p_status not in ('completed', 'cancelled') then
    raise exception using
      errcode = '22023',
      message = 'A valid follow-up status is required';
  end if;

  select
    follow_up.counselor_id,
    follow_up.status
  into
    target_counselor_id,
    target_status
  from public.counselor_follow_ups as follow_up
  where follow_up.id = p_follow_up_id
  for update;

  if not found
    or target_counselor_id <> caller_id
    or target_status <> 'pending'::public.counselor_follow_up_status then
    raise exception using
      errcode = '22023',
      message = 'The follow-up status cannot be changed';
  end if;

  requested_status := p_status::public.counselor_follow_up_status;
  transition_time := pg_catalog.statement_timestamp();

  update public.counselor_follow_ups as follow_up
  set
    status = requested_status,
    completed_at = case
      when requested_status =
        'completed'::public.counselor_follow_up_status
      then transition_time
      else null
    end,
    completed_by = case
      when requested_status =
        'completed'::public.counselor_follow_up_status
      then caller_id
      else null
    end
  where follow_up.id = p_follow_up_id
    and follow_up.counselor_id = caller_id
    and follow_up.status =
      'pending'::public.counselor_follow_up_status
  returning follow_up.status into target_status;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The follow-up changed concurrently';
  end if;

  return target_status;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value or check_violation then
    raise exception using
      errcode = '22023',
      message = 'The follow-up status cannot be changed';
  when serialization_failure then
    raise exception using
      errcode = '40001',
      message = 'The follow-up changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The follow-up status could not be recorded';
end;
$function$;

alter function public.record_counselor_follow_up_status(uuid, text)
  owner to postgres;

comment on function public.record_counselor_follow_up_status(uuid, text) is
  'Allows only an active verified owning counselor to finalize one pending follow-up as completed or cancelled.';

alter table public.counselor_student_notes enable row level security;
alter table public.counselor_follow_ups enable row level security;

revoke all privileges on table public.counselor_student_notes
  from public, anon, authenticated;
revoke all privileges on table public.counselor_follow_ups
  from public, anon, authenticated;

revoke all privileges on type public.counselor_follow_up_priority
  from public, anon;
revoke all privileges on type public.counselor_follow_up_status
  from public, anon;

revoke all on function public.prepare_counselor_private_record()
  from public, anon, authenticated;
revoke all on function public.normalize_counselor_student_note()
  from public, anon, authenticated;
revoke all on function public.normalize_counselor_follow_up()
  from public, anon, authenticated;
revoke all on function public.record_counselor_follow_up_status(uuid, text)
  from public, anon, authenticated;

grant usage on type public.counselor_follow_up_priority
  to authenticated;
grant usage on type public.counselor_follow_up_status
  to authenticated;

grant select on table public.counselor_student_notes
  to authenticated;
grant insert (
  student_id,
  consultation_id,
  note_text,
  is_pinned
) on table public.counselor_student_notes
  to authenticated;
grant update (
  consultation_id,
  note_text,
  is_pinned
) on table public.counselor_student_notes
  to authenticated;
grant delete on table public.counselor_student_notes
  to authenticated;

grant select on table public.counselor_follow_ups
  to authenticated;
grant insert (
  student_id,
  consultation_id,
  due_date,
  priority,
  next_action,
  details
) on table public.counselor_follow_ups
  to authenticated;
grant update (
  consultation_id,
  due_date,
  priority,
  next_action,
  details
) on table public.counselor_follow_ups
  to authenticated;

grant execute on function public.record_counselor_follow_up_status(uuid, text)
  to authenticated;

create policy counselor_student_notes_select_own
on public.counselor_student_notes
for select
to authenticated
using (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy counselor_student_notes_insert_own
on public.counselor_student_notes
for insert
to authenticated
with check (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy counselor_student_notes_update_own
on public.counselor_student_notes
for update
to authenticated
using (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
)
with check (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy counselor_student_notes_delete_own
on public.counselor_student_notes
for delete
to authenticated
using (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy counselor_follow_ups_select_own
on public.counselor_follow_ups
for select
to authenticated
using (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy counselor_follow_ups_insert_own
on public.counselor_follow_ups
for insert
to authenticated
with check (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy counselor_follow_ups_update_pending_own
on public.counselor_follow_ups
for update
to authenticated
using (
  counselor_id = (select auth.uid())
  and status = 'pending'::public.counselor_follow_up_status
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
)
with check (
  counselor_id = (select auth.uid())
  and status = 'pending'::public.counselor_follow_up_status
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy counselor_student_notes_select_own
  on public.counselor_student_notes is
  'An active verified counselor can read only notes they own.';

comment on policy counselor_student_notes_insert_own
  on public.counselor_student_notes is
  'An active verified counselor can insert only a trigger-owned note.';

comment on policy counselor_student_notes_update_own
  on public.counselor_student_notes is
  'An active verified counselor can update only their own note; column grants protect ownership and timestamps.';

comment on policy counselor_student_notes_delete_own
  on public.counselor_student_notes is
  'An active verified counselor can explicitly delete only their own note.';

comment on policy counselor_follow_ups_select_own
  on public.counselor_follow_ups is
  'An active verified counselor can read only follow-ups they own.';

comment on policy counselor_follow_ups_insert_own
  on public.counselor_follow_ups is
  'An active verified counselor can insert only a trigger-owned pending follow-up.';

comment on policy counselor_follow_ups_update_pending_own
  on public.counselor_follow_ups is
  'An active verified counselor can directly edit only approved columns on their own pending follow-up.';

-- Students, anonymous users, admins, and directors have no D1 policies.
-- Follow-ups have no DELETE grant or policy. Final status and completion audit
-- are writable only through record_counselor_follow_up_status(uuid, text).
-- Although every signed-in application identity uses PostgreSQL role
-- authenticated, the own-counselor RLS predicates make student/admin/director
-- direct PostgREST reads return no D1 rows and reject every mutation.

commit;

-- >>> supabase/migrations/202607250002_counselor_follow_up_workload.sql
-- K-GEO Phase D2 counselor follow-up workload database foundation.
-- Review this migration before applying it. Apply it only after
-- 202607250001_counselor_notes_and_follow_ups_foundation.sql.
--
-- This migration is additive. It creates one read-only counselor workload
-- RPC and does not alter D1 tables, policies, grants, records, or indexes.

begin;

-- SECURITY: this is the only cross-user identity boundary required by the D2
-- workload page. It derives the counselor from auth.uid(), returns only that
-- counselor's follow-ups, joins student-role identities only, and projects
-- only the minimum identity fields required for the operational list.
create function public.list_counselor_follow_up_workload(
  p_lifecycle text default 'all',
  p_priority text default 'all',
  p_search text default null,
  p_due_from date default null,
  p_due_to date default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  follow_up_id uuid,
  student_id uuid,
  consultation_id uuid,
  due_date date,
  priority public.counselor_follow_up_priority,
  stored_status public.counselor_follow_up_status,
  next_action text,
  completed_at timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  full_name text,
  college_email text,
  roll_number text,
  total_count bigint,
  overdue_count bigint,
  due_today_count bigint,
  upcoming_count bigint,
  completed_count bigint,
  cancelled_count bigint,
  total_pending_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  normalized_lifecycle text;
  normalized_priority text;
  normalized_search text;
  business_date date;
  page_offset bigint;
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

  normalized_lifecycle := pg_catalog.lower(
    pg_catalog.btrim(p_lifecycle)
  );
  normalized_priority := pg_catalog.lower(
    pg_catalog.btrim(p_priority)
  );
  normalized_search := nullif(
    pg_catalog.lower(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(p_search),
        '[[:space:]]+',
        ' ',
        'g'
      )
    ),
    ''
  );

  if normalized_lifecycle is null
    or normalized_lifecycle not in (
      'all',
      'overdue',
      'due_today',
      'upcoming',
      'completed',
      'cancelled'
    ) then
    raise exception using
      errcode = '22023',
      message = 'The follow-up lifecycle filter is invalid';
  end if;

  if normalized_priority is null
    or normalized_priority not in ('all', 'low', 'normal', 'high') then
    raise exception using
      errcode = '22023',
      message = 'The follow-up priority filter is invalid';
  end if;

  if pg_catalog.char_length(normalized_search) > 100 then
    raise exception using
      errcode = '22023',
      message = 'The follow-up search filter is invalid';
  end if;

  if p_due_from is not null
    and p_due_to is not null
    and p_due_from > p_due_to then
    raise exception using
      errcode = '22023',
      message = 'The follow-up due-date range is invalid';
  end if;

  if p_page is null or p_page not between 1 and 100000 then
    raise exception using
      errcode = '22023',
      message = 'The follow-up workload page is invalid';
  end if;

  if p_page_size is null or p_page_size not between 1 and 25 then
    raise exception using
      errcode = '22023',
      message = 'The follow-up workload page size is invalid';
  end if;

  business_date := (
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
  )::date;
  page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  with owned_workload as (
    select
      follow_up.id as workload_follow_up_id,
      follow_up.student_id as workload_student_id,
      follow_up.consultation_id as workload_consultation_id,
      follow_up.due_date as workload_due_date,
      follow_up.priority as workload_priority,
      follow_up.status as workload_status,
      follow_up.next_action as workload_next_action,
      follow_up.completed_at as workload_completed_at,
      follow_up.created_at as workload_created_at,
      follow_up.updated_at as workload_updated_at,
      student_account.full_name as student_full_name,
      student_account.college_email as student_college_email,
      student_profile.roll_number as student_roll_number,
      case
        when follow_up.status =
          'pending'::public.counselor_follow_up_status
          and follow_up.due_date < business_date then 1
        when follow_up.status =
          'pending'::public.counselor_follow_up_status
          and follow_up.due_date = business_date then 2
        when follow_up.status =
          'pending'::public.counselor_follow_up_status
          and follow_up.due_date > business_date then 3
        when follow_up.status =
          'completed'::public.counselor_follow_up_status then 4
        else 5
      end as lifecycle_rank,
      case follow_up.priority
        when 'high'::public.counselor_follow_up_priority then 1
        when 'normal'::public.counselor_follow_up_priority then 2
        else 3
      end as priority_rank
    from public.counselor_follow_ups as follow_up
    inner join public.profiles as student_account
      on student_account.id = follow_up.student_id
      and student_account.role = 'student'::public.user_role
    left join public.student_profiles as student_profile
      on student_profile.student_id = student_account.id
    where follow_up.counselor_id = caller_id
  ),
  global_metrics as (
    select
      pg_catalog.count(*) filter (
        where workload.workload_status =
          'pending'::public.counselor_follow_up_status
          and workload.workload_due_date < business_date
      )::bigint as metric_overdue_count,
      pg_catalog.count(*) filter (
        where workload.workload_status =
          'pending'::public.counselor_follow_up_status
          and workload.workload_due_date = business_date
      )::bigint as metric_due_today_count,
      pg_catalog.count(*) filter (
        where workload.workload_status =
          'pending'::public.counselor_follow_up_status
          and workload.workload_due_date > business_date
      )::bigint as metric_upcoming_count,
      pg_catalog.count(*) filter (
        where workload.workload_status =
          'completed'::public.counselor_follow_up_status
      )::bigint as metric_completed_count,
      pg_catalog.count(*) filter (
        where workload.workload_status =
          'cancelled'::public.counselor_follow_up_status
      )::bigint as metric_cancelled_count,
      pg_catalog.count(*) filter (
        where workload.workload_status =
          'pending'::public.counselor_follow_up_status
      )::bigint as metric_total_pending_count
    from owned_workload as workload
  ),
  filtered_workload as (
    select workload.*
    from owned_workload as workload
    where (
      normalized_lifecycle = 'all'
      or (
        normalized_lifecycle = 'overdue'
        and workload.workload_status =
          'pending'::public.counselor_follow_up_status
        and workload.workload_due_date < business_date
      )
      or (
        normalized_lifecycle = 'due_today'
        and workload.workload_status =
          'pending'::public.counselor_follow_up_status
        and workload.workload_due_date = business_date
      )
      or (
        normalized_lifecycle = 'upcoming'
        and workload.workload_status =
          'pending'::public.counselor_follow_up_status
        and workload.workload_due_date > business_date
      )
      or (
        normalized_lifecycle = 'completed'
        and workload.workload_status =
          'completed'::public.counselor_follow_up_status
      )
      or (
        normalized_lifecycle = 'cancelled'
        and workload.workload_status =
          'cancelled'::public.counselor_follow_up_status
      )
    )
      and (
        normalized_priority = 'all'
        or workload.workload_priority::text = normalized_priority
      )
      and (
        normalized_search is null
        or pg_catalog.strpos(
          pg_catalog.lower(
            coalesce(workload.student_full_name, '')
          ),
          normalized_search
        ) > 0
        or pg_catalog.strpos(
          pg_catalog.lower(workload.student_college_email),
          normalized_search
        ) > 0
        or pg_catalog.strpos(
          pg_catalog.lower(
            coalesce(workload.student_roll_number, '')
          ),
          normalized_search
        ) > 0
      )
      and (
        p_due_from is null
        or workload.workload_due_date >= p_due_from
      )
      and (
        p_due_to is null
        or workload.workload_due_date <= p_due_to
      )
  ),
  filtered_total as (
    select pg_catalog.count(*)::bigint as filtered_count
    from filtered_workload
  ),
  page_rows as (
    select
      workload.*,
      pg_catalog.row_number() over (
        order by
          workload.lifecycle_rank asc,
          case
            when workload.workload_status =
              'pending'::public.counselor_follow_up_status
            then workload.priority_rank
          end asc nulls last,
          case
            when workload.workload_status =
              'pending'::public.counselor_follow_up_status
            then workload.workload_due_date
          end asc nulls last,
          case
            when workload.workload_status =
              'completed'::public.counselor_follow_up_status
            then workload.workload_completed_at
          end desc nulls last,
          case
            when workload.workload_status =
              'completed'::public.counselor_follow_up_status
            then workload.workload_updated_at
          end desc nulls last,
          case
            when workload.workload_status =
              'cancelled'::public.counselor_follow_up_status
            then workload.workload_updated_at
          end desc nulls last,
          workload.workload_follow_up_id asc
      ) as result_position
    from filtered_workload as workload
    order by
      workload.lifecycle_rank asc,
      case
        when workload.workload_status =
          'pending'::public.counselor_follow_up_status
        then workload.priority_rank
      end asc nulls last,
      case
        when workload.workload_status =
          'pending'::public.counselor_follow_up_status
        then workload.workload_due_date
      end asc nulls last,
      case
        when workload.workload_status =
          'completed'::public.counselor_follow_up_status
        then workload.workload_completed_at
      end desc nulls last,
      case
        when workload.workload_status =
          'completed'::public.counselor_follow_up_status
        then workload.workload_updated_at
      end desc nulls last,
      case
        when workload.workload_status =
          'cancelled'::public.counselor_follow_up_status
        then workload.workload_updated_at
      end desc nulls last,
      workload.workload_follow_up_id asc
    limit p_page_size
    offset page_offset
  )
  select
    page_row.workload_follow_up_id,
    page_row.workload_student_id,
    page_row.workload_consultation_id,
    page_row.workload_due_date,
    page_row.workload_priority,
    page_row.workload_status,
    page_row.workload_next_action,
    page_row.workload_completed_at,
    page_row.workload_created_at,
    page_row.workload_updated_at,
    page_row.student_full_name,
    page_row.student_college_email,
    page_row.student_roll_number,
    filtered_total.filtered_count,
    metrics.metric_overdue_count,
    metrics.metric_due_today_count,
    metrics.metric_upcoming_count,
    metrics.metric_completed_count,
    metrics.metric_cancelled_count,
    metrics.metric_total_pending_count
  from global_metrics as metrics
  cross join filtered_total
  left join page_rows as page_row
    on true
  order by page_row.result_position asc nulls last;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value then
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Follow-up workload is temporarily unavailable';
end;
$function$;

alter function public.list_counselor_follow_up_workload(
  text,
  text,
  text,
  date,
  date,
  integer,
  integer
) owner to postgres;

comment on function public.list_counselor_follow_up_workload(
  text,
  text,
  text,
  date,
  date,
  integer,
  integer
) is
  'Returns one bounded counselor-owned follow-up page with minimal student identity and global counselor workload metrics. When a filtered page has no records, one metrics-only row is returned with null record columns and the correct filtered total.';

revoke all on function public.list_counselor_follow_up_workload(
  text,
  text,
  text,
  date,
  date,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.list_counselor_follow_up_workload(
  text,
  text,
  text,
  date,
  date,
  integer,
  integer
) to authenticated;

-- The existing (counselor_id, status, due_date, id) index supports the
-- counselor-owned status/date workload scan. Identity search is expected to
-- remain small in D2. Revisit with EXPLAIN (ANALYZE, BUFFERS) if production
-- cardinality or measured latency grows; no extension or new index is added.

commit;

-- >>> supabase/migrations/202607250003_official_counseling_progression.sql
-- K-GEO Phase D3.1 official counseling progression database foundation.
-- Review this migration before applying it. Apply it only after
-- 202607250002_counselor_follow_up_workload.sql and all earlier migrations.
--
-- This migration is additive. It creates an institution-owned current
-- progression record, append-only audit history, and one trusted mutation
-- RPC. It does not add application UI or expose progression to students.

begin;

create type public.counseling_progression_stage as enum (
  'profile_review',
  'initial_counseling',
  'goals_confirmed',
  'country_exploration',
  'program_shortlisting',
  'university_shortlisting',
  'test_preparation',
  'document_preparation',
  'application_ready',
  'application_in_progress',
  'offer_evaluation',
  'visa_preparation',
  'pre_departure'
);

create type public.counseling_progression_state as enum (
  'active',
  'on_hold',
  'completed'
);

comment on type public.counseling_progression_stage is
  'Institution-controlled stage in the K-GEO counseling journey; application-specific statuses remain separate.';

comment on type public.counseling_progression_state is
  'Institution-controlled workflow state. Completed is final in the D3 MVP.';

create table public.student_counseling_progressions (
  student_id uuid
    constraint student_counseling_progressions_pkey primary key
    constraint student_counseling_progressions_student_id_fkey
      references public.profiles(id)
      on delete restrict,
  current_stage public.counseling_progression_stage
    constraint student_counseling_progressions_current_stage_not_null
      not null,
  workflow_state public.counseling_progression_state
    constraint student_counseling_progressions_workflow_state_not_null
      not null
    default 'active'::public.counseling_progression_state,
  stage_started_at timestamptz
    constraint student_counseling_progressions_stage_started_at_not_null
      not null
    default pg_catalog.now(),
  last_changed_at timestamptz
    constraint student_counseling_progressions_last_changed_at_not_null
      not null
    default pg_catalog.now(),
  last_changed_by uuid
    constraint student_counseling_progressions_last_changed_by_not_null
      not null
    constraint student_counseling_progressions_last_changed_by_fkey
      references public.profiles(id)
      on delete restrict,
  created_at timestamptz
    constraint student_counseling_progressions_created_at_not_null
      not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint student_counseling_progressions_updated_at_not_null
      not null
    default pg_catalog.now(),

  constraint student_counseling_progressions_distinct_people_check
    check (student_id <> last_changed_by),
  constraint student_counseling_progressions_timestamp_order_check
    check (
      stage_started_at >= created_at
      and last_changed_at >= stage_started_at
      and updated_at = last_changed_at
    )
);

create table public.student_counseling_progression_events (
  id uuid
    constraint student_counseling_progression_events_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint student_counseling_progression_events_student_id_not_null
      not null
    constraint student_counseling_progression_events_student_id_fkey
      references public.student_counseling_progressions(student_id)
      on delete restrict,
  previous_stage public.counseling_progression_stage,
  new_stage public.counseling_progression_stage
    constraint student_counseling_progression_events_new_stage_not_null
      not null,
  previous_state public.counseling_progression_state,
  new_state public.counseling_progression_state
    constraint student_counseling_progression_events_new_state_not_null
      not null,
  changed_by uuid
    constraint student_counseling_progression_events_changed_by_not_null
      not null
    constraint student_counseling_progression_events_changed_by_fkey
      references public.profiles(id)
      on delete restrict,
  change_reason text,
  changed_at timestamptz
    constraint student_counseling_progression_events_changed_at_not_null
      not null
    default pg_catalog.now(),

  constraint student_counseling_progression_events_distinct_people_check
    check (student_id <> changed_by),
  constraint student_counseling_progression_events_previous_pair_check
    check (
      (previous_stage is null and previous_state is null)
      or
      (previous_stage is not null and previous_state is not null)
    ),
  constraint student_counseling_progression_events_transition_check
    check (
      previous_stage is null
      or previous_stage is distinct from new_stage
      or previous_state is distinct from new_state
    ),
  constraint student_counseling_progression_events_reason_check
    check (
      change_reason is null
      or (
        change_reason = pg_catalog.regexp_replace(
          pg_catalog.btrim(change_reason),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(change_reason) between 1 and 500
      )
    )
);

comment on table public.student_counseling_progressions is
  'One institution-owned official counseling progression row per student. It is not counselor-private or student-authored.';

comment on table public.student_counseling_progression_events is
  'Append-only official progression history created exclusively by the trusted progression RPC.';

comment on column public.student_counseling_progressions.student_id is
  'Student target validated by record_student_counseling_progression; account deletion is restricted to retain institutional history.';

comment on column public.student_counseling_progressions.last_changed_by is
  'Active verified counselor derived from auth.uid() by the trusted RPC.';

comment on column public.student_counseling_progression_events.change_reason is
  'Optional normalized operational reason, limited to 500 characters; never a private counseling note.';

create index student_counseling_progressions_state_stage_updated_idx
  on public.student_counseling_progressions (
    workflow_state,
    current_stage,
    updated_at desc,
    student_id
  );

create index student_counseling_progression_events_student_history_idx
  on public.student_counseling_progression_events (
    student_id,
    changed_at desc,
    id desc
  );

create unique index student_counseling_progression_events_initial_key
  on public.student_counseling_progression_events (student_id)
  where previous_stage is null and previous_state is null;

comment on index
  public.student_counseling_progressions_state_stage_updated_idx is
  'Supports bounded institution-wide progression filtering and recent-change ordering.';

comment on index
  public.student_counseling_progression_events_student_history_idx is
  'Supports bounded newest-first audit history for one student.';

comment on index
  public.student_counseling_progression_events_initial_key is
  'Enforces at most one initialization event per student under every write path.';

-- SECURITY: this is the only authenticated mutation path for D3.1. It derives
-- the counselor from auth.uid(), validates a student-role target, accepts no
-- actor or timestamp fields, serializes calls per student, and writes the
-- current row and exactly one event in the same transaction.
--
-- The transaction-scoped nonblocking advisory lock makes the first concurrent
-- caller for a student win. Existing rows are also locked FOR UPDATE. A losing
-- concurrent caller receives a sanitized serialization error and can refresh.
create function public.record_student_counseling_progression(
  p_student_id uuid,
  p_stage text,
  p_state text,
  p_change_reason text default null
)
returns table (
  student_id uuid,
  current_stage public.counseling_progression_stage,
  workflow_state public.counseling_progression_state,
  stage_started_at timestamptz,
  last_changed_at timestamptz,
  last_changed_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  normalized_stage text;
  normalized_state text;
  normalized_reason text;
  requested_stage public.counseling_progression_stage;
  requested_state public.counseling_progression_state;
  previous_stage_value public.counseling_progression_stage;
  previous_state_value public.counseling_progression_state;
  existing_stage_started_at timestamptz;
  existing_last_changed_at timestamptz;
  change_time timestamptz;
  progression_exists boolean;
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

  normalized_stage := pg_catalog.lower(pg_catalog.btrim(p_stage));
  normalized_state := pg_catalog.lower(pg_catalog.btrim(p_state));

  if p_student_id is null
    or normalized_stage is null
    or normalized_stage not in (
      'profile_review',
      'initial_counseling',
      'goals_confirmed',
      'country_exploration',
      'program_shortlisting',
      'university_shortlisting',
      'test_preparation',
      'document_preparation',
      'application_ready',
      'application_in_progress',
      'offer_evaluation',
      'visa_preparation',
      'pre_departure'
    )
    or normalized_state is null
    or normalized_state not in ('active', 'on_hold', 'completed') then
    raise exception using
      errcode = '22023',
      message = 'The progression request is invalid';
  end if;

  normalized_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_change_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if pg_catalog.char_length(normalized_reason) > 500 then
    raise exception using
      errcode = '22023',
      message = 'The progression request is invalid';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = p_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The progression request is invalid';
  end if;

  requested_stage :=
    normalized_stage::public.counseling_progression_stage;
  requested_state :=
    normalized_state::public.counseling_progression_state;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(p_student_id::text, 202607250003)
  ) then
    raise exception using
      errcode = '40001',
      message = 'The progression changed concurrently';
  end if;

  select
    progression.current_stage,
    progression.workflow_state,
    progression.stage_started_at,
    progression.last_changed_at
  into
    previous_stage_value,
    previous_state_value,
    existing_stage_started_at,
    existing_last_changed_at
  from public.student_counseling_progressions as progression
  where progression.student_id = p_student_id
  for update;

  progression_exists := found;
  change_time := pg_catalog.statement_timestamp();

  if progression_exists
    and change_time <= existing_last_changed_at then
    change_time := existing_last_changed_at + interval '1 microsecond';
  end if;

  if not progression_exists then
    if requested_state <>
      'active'::public.counseling_progression_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    insert into public.student_counseling_progressions (
      student_id,
      current_stage,
      workflow_state,
      stage_started_at,
      last_changed_at,
      last_changed_by,
      created_at,
      updated_at
    )
    values (
      p_student_id,
      requested_stage,
      requested_state,
      change_time,
      change_time,
      caller_id,
      change_time,
      change_time
    );

    insert into public.student_counseling_progression_events (
      student_id,
      previous_stage,
      new_stage,
      previous_state,
      new_state,
      changed_by,
      change_reason,
      changed_at
    )
    values (
      p_student_id,
      null,
      requested_stage,
      null,
      requested_state,
      caller_id,
      normalized_reason,
      change_time
    );
  else
    if previous_state_value =
      'completed'::public.counseling_progression_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    if previous_stage_value = requested_stage
      and previous_state_value = requested_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    -- Stage and workflow-state changes are separate audit events. This keeps
    -- each successful transition unambiguous, including pause and completion.
    if previous_stage_value is distinct from requested_stage
      and previous_state_value is distinct from requested_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    -- A paused progression must be resumed before its stage can change.
    if previous_state_value =
        'on_hold'::public.counseling_progression_state
      and previous_stage_value is distinct from requested_stage then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    update public.student_counseling_progressions as progression
    set
      current_stage = requested_stage,
      workflow_state = requested_state,
      stage_started_at = case
        when progression.current_stage is distinct from requested_stage
          then change_time
        else existing_stage_started_at
      end,
      last_changed_at = change_time,
      last_changed_by = caller_id,
      updated_at = change_time
    where progression.student_id = p_student_id;

    insert into public.student_counseling_progression_events (
      student_id,
      previous_stage,
      new_stage,
      previous_state,
      new_state,
      changed_by,
      change_reason,
      changed_at
    )
    values (
      p_student_id,
      previous_stage_value,
      requested_stage,
      previous_state_value,
      requested_state,
      caller_id,
      normalized_reason,
      change_time
    );
  end if;

  return query
  select
    progression.student_id,
    progression.current_stage,
    progression.workflow_state,
    progression.stage_started_at,
    progression.last_changed_at,
    progression.last_changed_by,
    progression.created_at,
    progression.updated_at
  from public.student_counseling_progressions as progression
  where progression.student_id = p_student_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value or check_violation or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The progression request is invalid';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message = 'The progression changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Official progression could not be updated';
end;
$function$;

alter function public.record_student_counseling_progression(
  uuid,
  text,
  text,
  text
) owner to postgres;

comment on function public.record_student_counseling_progression(
  uuid,
  text,
  text,
  text
) is
  'Initializes or transitions one student official progression and appends exactly one atomic counselor-attributed event.';

alter table public.student_counseling_progressions
  enable row level security;
alter table public.student_counseling_progression_events
  enable row level security;

revoke all privileges on table
  public.student_counseling_progressions
  from public, anon, authenticated;
revoke all privileges on table
  public.student_counseling_progression_events
  from public, anon, authenticated;

revoke all privileges on type public.counseling_progression_stage
  from public, anon, authenticated;
revoke all privileges on type public.counseling_progression_state
  from public, anon, authenticated;

revoke all on function public.record_student_counseling_progression(
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;

grant usage on type public.counseling_progression_stage
  to authenticated;
grant usage on type public.counseling_progression_state
  to authenticated;

grant select (
  student_id,
  current_stage,
  workflow_state,
  stage_started_at,
  last_changed_at,
  last_changed_by,
  created_at,
  updated_at
) on table public.student_counseling_progressions
  to authenticated;

grant select (
  id,
  student_id,
  previous_stage,
  new_stage,
  previous_state,
  new_state,
  changed_by,
  change_reason,
  changed_at
) on table public.student_counseling_progression_events
  to authenticated;

grant execute on function public.record_student_counseling_progression(
  uuid,
  text,
  text,
  text
) to authenticated;

create policy student_counseling_progressions_select_counselor
on public.student_counseling_progressions
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy student_counseling_progression_events_select_counselor
on public.student_counseling_progression_events
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy student_counseling_progressions_select_counselor
  on public.student_counseling_progressions is
  'Any active verified counselor may read institution-owned current progression; students, admins, directors, and anonymous users have no policy.';

comment on policy
  student_counseling_progression_events_select_counselor
  on public.student_counseling_progression_events is
  'Any active verified counselor may read append-only institutional progression history; no authenticated role receives direct mutation access.';

-- No INSERT, UPDATE, or DELETE policy or grant exists on either D3.1 table.
-- The RPC is the sole authenticated writer and creates the current/event pair
-- atomically. Account deletion remains restricted; deactivate accounts until
-- a separately reviewed institutional retention process exists. Future role
-- changes must preserve the meaning of retained student and counselor history.

commit;

-- >>> supabase/migrations/202607260001_progression_evidence_foundation.sql
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

-- >>> supabase/migrations/202607260002_progression_correction_foundation.sql
-- K-GEO Phase D3.4.1 audited official progression correction foundation.
-- Review this migration and the correction-aware server read model together.
-- Apply it only after 202607260001_progression_evidence_foundation.sql.
--
-- This migration deliberately replaces the D3.1 event ownership foreign key
-- and lifetime initialization index. Original progression events remain
-- immutable; only the disposable current projection may be deleted during an
-- audited initialization reset. No evidence metadata or Storage object is
-- changed by this migration.

begin;

-- SAFETY: every existing event must already identify a student profile before
-- its foreign key can move from the current projection to durable profiles.
do $migration$
begin
  if exists (
    select 1
    from public.student_counseling_progression_events as event
    left join public.profiles as student_profile
      on student_profile.id = event.student_id
      and student_profile.role = 'student'::public.user_role
    where student_profile.id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Progression event student integrity preflight failed';
  end if;
end;
$migration$;

create type public.counseling_progression_correction_type as enum (
  'undo_transition',
  'reset_initialization'
);

comment on type public.counseling_progression_correction_type is
  'Audited reversal type for the latest effective official progression event.';

create table public.student_counseling_progression_event_corrections (
  id uuid
    constraint progression_event_corrections_pkey primary key
    default pg_catalog.gen_random_uuid(),
  target_event_id uuid
    constraint progression_event_corrections_target_event_id_not_null
      not null
    constraint progression_event_corrections_target_event_id_key
      unique
    constraint progression_event_corrections_target_event_id_fkey
      references public.student_counseling_progression_events(id)
      on delete restrict,
  correction_type public.counseling_progression_correction_type
    constraint progression_event_corrections_type_not_null
      not null,
  restored_stage public.counseling_progression_stage,
  restored_state public.counseling_progression_state,
  restored_stage_started_at timestamptz,
  corrected_by uuid
    constraint progression_event_corrections_corrected_by_not_null
      not null
    constraint progression_event_corrections_corrected_by_fkey
      references public.profiles(id)
      on delete restrict,
  correction_reason text
    constraint progression_event_corrections_reason_not_null
      not null,
  corrected_at timestamptz
    constraint progression_event_corrections_corrected_at_not_null
      not null
    default pg_catalog.now(),

  constraint progression_event_corrections_restoration_check
    check (
      (
        correction_type =
          'undo_transition'::public.counseling_progression_correction_type
        and restored_stage is not null
        and restored_state is not null
        and restored_stage_started_at is not null
      )
      or
      (
        correction_type =
          'reset_initialization'::public.counseling_progression_correction_type
        and restored_stage is null
        and restored_state is null
        and restored_stage_started_at is null
      )
    ),
  constraint progression_event_corrections_reason_check
    check (
      correction_reason = pg_catalog.regexp_replace(
        pg_catalog.btrim(correction_reason),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(correction_reason) between 1 and 500
      and correction_reason !~ '[[:cntrl:]]'
    )
);

comment on table
  public.student_counseling_progression_event_corrections is
  'Append-only institutional audit records for sequential reversal of the latest effective official progression event.';

comment on column
  public.student_counseling_progression_event_corrections.target_event_id is
  'The immutable progression event reversed by this correction; one event can be corrected only once.';

comment on column
  public.student_counseling_progression_event_corrections.corrected_by is
  'Active verified counselor derived from auth.uid() by the trusted correction RPC.';

comment on column
  public.student_counseling_progression_event_corrections.correction_reason is
  'Required normalized institutional correction reason; it is not a private counseling note.';

-- D3.1 tied immutable events to the disposable current projection. Repointing
-- the FK to profiles retains both student identity and all events when the
-- current projection is removed by an audited initialization reset.
alter table public.student_counseling_progression_events
  drop constraint
    student_counseling_progression_events_student_id_fkey;

alter table public.student_counseling_progression_events
  add constraint student_counseling_progression_events_student_id_fkey
  foreign key (student_id)
  references public.profiles(id)
  on delete restrict;

-- Lifetime uniqueness is incompatible with audited reset and later fresh
-- initialization. The replacement normal progression RPC enforces exactly one
-- effective initialization while holding the existing per-student lock.
drop index public.student_counseling_progression_events_initial_key;

-- SECURITY: replaces D3.1 without changing its public signature or return
-- contract. Existing transition behavior remains intact. Initialization now
-- permits historical initialization events only after each has an audited
-- reset_initialization correction.
create or replace function public.record_student_counseling_progression(
  p_student_id uuid,
  p_stage text,
  p_state text,
  p_change_reason text default null
)
returns table (
  student_id uuid,
  current_stage public.counseling_progression_stage,
  workflow_state public.counseling_progression_state,
  stage_started_at timestamptz,
  last_changed_at timestamptz,
  last_changed_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  normalized_stage text;
  normalized_state text;
  normalized_reason text;
  requested_stage public.counseling_progression_stage;
  requested_state public.counseling_progression_state;
  previous_stage_value public.counseling_progression_stage;
  previous_state_value public.counseling_progression_state;
  existing_stage_started_at timestamptz;
  existing_last_changed_at timestamptz;
  effective_stage public.counseling_progression_stage;
  effective_state public.counseling_progression_state;
  uncorrected_initialization_count bigint;
  change_time timestamptz;
  progression_exists boolean;
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

  normalized_stage := pg_catalog.lower(pg_catalog.btrim(p_stage));
  normalized_state := pg_catalog.lower(pg_catalog.btrim(p_state));

  if p_student_id is null
    or normalized_stage is null
    or normalized_stage not in (
      'profile_review',
      'initial_counseling',
      'goals_confirmed',
      'country_exploration',
      'program_shortlisting',
      'university_shortlisting',
      'test_preparation',
      'document_preparation',
      'application_ready',
      'application_in_progress',
      'offer_evaluation',
      'visa_preparation',
      'pre_departure'
    )
    or normalized_state is null
    or normalized_state not in ('active', 'on_hold', 'completed') then
    raise exception using
      errcode = '22023',
      message = 'The progression request is invalid';
  end if;

  normalized_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_change_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if pg_catalog.char_length(normalized_reason) > 500 then
    raise exception using
      errcode = '22023',
      message = 'The progression request is invalid';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = p_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The progression request is invalid';
  end if;

  requested_stage :=
    normalized_stage::public.counseling_progression_stage;
  requested_state :=
    normalized_state::public.counseling_progression_state;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(p_student_id::text, 202607250003)
  ) then
    raise exception using
      errcode = '40001',
      message = 'The progression changed concurrently';
  end if;

  select
    progression.current_stage,
    progression.workflow_state,
    progression.stage_started_at,
    progression.last_changed_at
  into
    previous_stage_value,
    previous_state_value,
    existing_stage_started_at,
    existing_last_changed_at
  from public.student_counseling_progressions as progression
  where progression.student_id = p_student_id
  for update;

  progression_exists := found;

  -- A correction type must always match the shape of its immutable target.
  if exists (
    select 1
    from public.student_counseling_progression_event_corrections
      as correction
    inner join public.student_counseling_progression_events as event
      on event.id = correction.target_event_id
    where event.student_id = p_student_id
      and (
        (
          correction.correction_type =
            'reset_initialization'::public.counseling_progression_correction_type
          and not (
            event.previous_stage is null
            and event.previous_state is null
            and event.new_state =
              'active'::public.counseling_progression_state
          )
        )
        or
        (
          correction.correction_type =
            'undo_transition'::public.counseling_progression_correction_type
          and (
            event.previous_stage is null
            or event.previous_state is null
          )
        )
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'The progression history is inconsistent';
  end if;

  select pg_catalog.count(*)
  into uncorrected_initialization_count
  from public.student_counseling_progression_events as event
  where event.student_id = p_student_id
    and event.previous_stage is null
    and event.previous_state is null
    and not exists (
      select 1
      from public.student_counseling_progression_event_corrections
        as correction
      where correction.target_event_id = event.id
    );

  if uncorrected_initialization_count > 1 then
    raise exception using
      errcode = '22023',
      message = 'The progression history is inconsistent';
  end if;

  if progression_exists then
    select
      event.new_stage,
      event.new_state
    into
      effective_stage,
      effective_state
    from public.student_counseling_progression_events as event
    where event.student_id = p_student_id
      and not exists (
        select 1
        from public.student_counseling_progression_event_corrections
          as correction
        where correction.target_event_id = event.id
      )
    order by event.changed_at desc, event.id desc
    limit 1;

    if not found
      or uncorrected_initialization_count <> 1
      or effective_stage is distinct from previous_stage_value
      or effective_state is distinct from previous_state_value then
      raise exception using
        errcode = '22023',
        message = 'The progression history is inconsistent';
    end if;
  else
    if requested_state <>
      'active'::public.counseling_progression_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    -- No current row is valid only before first initialization or after every
    -- historical event has been corrected, including a reset initialization.
    if exists (
      select 1
      from public.student_counseling_progression_events as event
      where event.student_id = p_student_id
        and not exists (
          select 1
          from public.student_counseling_progression_event_corrections
            as correction
          where correction.target_event_id = event.id
        )
    ) or uncorrected_initialization_count <> 0 then
      raise exception using
        errcode = '22023',
        message = 'The progression history is inconsistent';
    end if;

    -- Every historical initialization must have been reset, not merely
    -- corrected with an unrelated type.
    if exists (
      select 1
      from public.student_counseling_progression_events as event
      left join public.student_counseling_progression_event_corrections
        as correction
        on correction.target_event_id = event.id
      where event.student_id = p_student_id
        and event.previous_stage is null
        and event.previous_state is null
        and (
          correction.id is null
          or correction.correction_type <>
            'reset_initialization'::public.counseling_progression_correction_type
        )
    ) then
      raise exception using
        errcode = '22023',
        message = 'The progression history is inconsistent';
    end if;
  end if;

  change_time := pg_catalog.statement_timestamp();

  if progression_exists
    and change_time <= existing_last_changed_at then
    change_time := existing_last_changed_at + interval '1 microsecond';
  end if;

  if not progression_exists then
    insert into public.student_counseling_progressions (
      student_id,
      current_stage,
      workflow_state,
      stage_started_at,
      last_changed_at,
      last_changed_by,
      created_at,
      updated_at
    )
    values (
      p_student_id,
      requested_stage,
      requested_state,
      change_time,
      change_time,
      caller_id,
      change_time,
      change_time
    );

    insert into public.student_counseling_progression_events (
      student_id,
      previous_stage,
      new_stage,
      previous_state,
      new_state,
      changed_by,
      change_reason,
      changed_at
    )
    values (
      p_student_id,
      null,
      requested_stage,
      null,
      requested_state,
      caller_id,
      normalized_reason,
      change_time
    );
  else
    if previous_state_value =
      'completed'::public.counseling_progression_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    if previous_stage_value = requested_stage
      and previous_state_value = requested_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    if previous_stage_value is distinct from requested_stage
      and previous_state_value is distinct from requested_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    if previous_state_value =
        'on_hold'::public.counseling_progression_state
      and previous_stage_value is distinct from requested_stage then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    update public.student_counseling_progressions as progression
    set
      current_stage = requested_stage,
      workflow_state = requested_state,
      stage_started_at = case
        when progression.current_stage is distinct from requested_stage
          then change_time
        else existing_stage_started_at
      end,
      last_changed_at = change_time,
      last_changed_by = caller_id,
      updated_at = change_time
    where progression.student_id = p_student_id;

    insert into public.student_counseling_progression_events (
      student_id,
      previous_stage,
      new_stage,
      previous_state,
      new_state,
      changed_by,
      change_reason,
      changed_at
    )
    values (
      p_student_id,
      previous_stage_value,
      requested_stage,
      previous_state_value,
      requested_state,
      caller_id,
      normalized_reason,
      change_time
    );
  end if;

  return query
  select
    progression.student_id,
    progression.current_stage,
    progression.workflow_state,
    progression.stage_started_at,
    progression.last_changed_at,
    progression.last_changed_by,
    progression.created_at,
    progression.updated_at
  from public.student_counseling_progressions as progression
  where progression.student_id = p_student_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value
    or check_violation
    or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The progression request is invalid';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message = 'The progression changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Official progression could not be updated';
end;
$function$;

alter function public.record_student_counseling_progression(
  uuid,
  text,
  text,
  text
) owner to postgres;

comment on function public.record_student_counseling_progression(
  uuid,
  text,
  text,
  text
) is
  'Initializes or transitions official progression while enforcing one correction-aware effective initialization under the D3.1 student lock.';

-- SECURITY: audited correction is the only path that can reverse progression.
-- Lock order is fixed: the D3.1 student lock, the D3.3 event/evidence lock,
-- then the current row FOR UPDATE. Normal progression never takes the event
-- lock, and evidence preparation never takes the student lock, so no reverse
-- lock order exists.
create function public.undo_latest_student_counseling_progression_event(
  p_student_id uuid,
  p_event_id uuid,
  p_correction_reason text
)
returns table (
  correction_id uuid,
  target_event_id uuid,
  correction_type public.counseling_progression_correction_type,
  current_progression_exists boolean,
  restored_stage public.counseling_progression_stage,
  restored_state public.counseling_progression_state,
  restored_stage_started_at timestamptz,
  corrected_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  normalized_reason text;
  current_stage_value public.counseling_progression_stage;
  current_state_value public.counseling_progression_state;
  current_stage_started_at timestamptz;
  current_last_changed_at timestamptz;
  uncorrected_initialization_count bigint;
  target_event public.student_counseling_progression_events%rowtype;
  latest_effective_event_id uuid;
  result_correction_id uuid;
  result_correction_type public.counseling_progression_correction_type;
  result_restored_stage public.counseling_progression_stage;
  result_restored_state public.counseling_progression_state;
  result_restored_stage_started_at timestamptz;
  result_current_exists boolean;
  correction_time timestamptz;
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

  if p_student_id is null
    or p_event_id is null
    or not exists (
      select 1
      from public.profiles as student_profile
      where student_profile.id = p_student_id
        and student_profile.role = 'student'::public.user_role
    ) then
    raise exception using
      errcode = '22023',
      message = 'The progression correction target is invalid';
  end if;

  normalized_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_correction_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if normalized_reason is null
    or pg_catalog.char_length(normalized_reason) > 500
    or normalized_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'The progression correction reason is invalid';
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(p_student_id::text, 202607250003)
  ) then
    raise exception using
      errcode = '40001',
      message = 'Another progression correction is currently in progress';
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id::text, 202607260001)
  ) then
    raise exception using
      errcode = '40001',
      message = 'Another progression correction is currently in progress';
  end if;

  select
    progression.current_stage,
    progression.workflow_state,
    progression.stage_started_at,
    progression.last_changed_at
  into
    current_stage_value,
    current_state_value,
    current_stage_started_at,
    current_last_changed_at
  from public.student_counseling_progressions as progression
  where progression.student_id = p_student_id
  for update;

  if not found then
    raise exception using
      errcode = 'K3405',
      message = 'Official progression has changed';
  end if;

  if exists (
    select 1
    from public.student_counseling_progression_event_corrections
      as correction
    inner join public.student_counseling_progression_events as event
      on event.id = correction.target_event_id
    where event.student_id = p_student_id
      and (
        (
          correction.correction_type =
            'reset_initialization'::public.counseling_progression_correction_type
          and not (
            event.previous_stage is null
            and event.previous_state is null
            and event.new_state =
              'active'::public.counseling_progression_state
          )
        )
        or
        (
          correction.correction_type =
            'undo_transition'::public.counseling_progression_correction_type
          and (
            event.previous_stage is null
            or event.previous_state is null
          )
        )
      )
  ) then
    raise exception using
      errcode = 'K3406',
      message = 'The progression history is inconsistent';
  end if;

  select pg_catalog.count(*)
  into uncorrected_initialization_count
  from public.student_counseling_progression_events as event
  where event.student_id = p_student_id
    and event.previous_stage is null
    and event.previous_state is null
    and not exists (
      select 1
      from public.student_counseling_progression_event_corrections
        as correction
      where correction.target_event_id = event.id
    );

  if uncorrected_initialization_count <> 1 then
    raise exception using
      errcode = 'K3406',
      message = 'The progression history is inconsistent';
  end if;

  select event.*
  into target_event
  from public.student_counseling_progression_events as event
  where event.id = p_event_id
    and event.student_id = p_student_id;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'The progression correction target is invalid';
  end if;

  if exists (
    select 1
    from public.student_counseling_progression_event_corrections
      as correction
    where correction.target_event_id = p_event_id
  ) then
    raise exception using
      errcode = 'K3401',
      message = 'This progression update has already been reversed';
  end if;

  select event.id
  into latest_effective_event_id
  from public.student_counseling_progression_events as event
  where event.student_id = p_student_id
    and not exists (
      select 1
      from public.student_counseling_progression_event_corrections
        as correction
      where correction.target_event_id = event.id
    )
  order by event.changed_at desc, event.id desc
  limit 1;

  if latest_effective_event_id is distinct from p_event_id then
    raise exception using
      errcode = 'K3402',
      message =
        'This progression update is no longer the latest valid step';
  end if;

  if current_stage_value is distinct from target_event.new_stage
    or current_state_value is distinct from target_event.new_state then
    raise exception using
      errcode = 'K3405',
      message = 'Official progression has changed';
  end if;

  if exists (
    select 1
    from public.student_counseling_progression_evidence as evidence
    where evidence.progression_event_id = p_event_id
      and (
        evidence.status =
          'available'::public.counseling_progression_evidence_status
        or (
          evidence.status =
            'pending'::public.counseling_progression_evidence_status
          and evidence.upload_expires_at >
            pg_catalog.statement_timestamp()
        )
      )
  ) then
    raise exception using
      errcode = 'K3404',
      message =
        'Supporting evidence must be removed or allowed to expire before this progression update can be reversed';
  end if;

  correction_time := pg_catalog.statement_timestamp();
  if correction_time <= current_last_changed_at then
    correction_time := current_last_changed_at + interval '1 microsecond';
  end if;

  if target_event.previous_stage is null
    and target_event.previous_state is null then
    if target_event.new_state <>
      'active'::public.counseling_progression_state then
      raise exception using
        errcode = 'K3406',
        message = 'The progression history is inconsistent';
    end if;

    result_correction_type :=
      'reset_initialization'::public.counseling_progression_correction_type;
    result_restored_stage := null;
    result_restored_state := null;
    result_restored_stage_started_at := null;
    result_current_exists := false;
  else
    if target_event.previous_stage is null
      or target_event.previous_state is null then
      raise exception using
        errcode = 'K3406',
        message = 'The progression history is inconsistent';
    end if;

    result_correction_type :=
      'undo_transition'::public.counseling_progression_correction_type;
    result_restored_stage := target_event.previous_stage;
    result_restored_state := target_event.previous_state;
    result_current_exists := true;

    if target_event.previous_stage = target_event.new_stage then
      result_restored_stage_started_at := current_stage_started_at;
    else
      select origin.changed_at
      into result_restored_stage_started_at
      from public.student_counseling_progression_events as origin
      where origin.student_id = p_student_id
        and (
          origin.changed_at < target_event.changed_at
          or (
            origin.changed_at = target_event.changed_at
            and origin.id < target_event.id
          )
        )
        and origin.new_stage = target_event.previous_stage
        and (
          origin.previous_stage is null
          or origin.previous_stage is distinct from origin.new_stage
        )
        and not exists (
          select 1
          from public.student_counseling_progression_event_corrections
            as correction
          where correction.target_event_id = origin.id
        )
      order by origin.changed_at desc, origin.id desc
      limit 1;

      if not found then
        raise exception using
          errcode = 'K3406',
          message = 'The progression history is inconsistent';
      end if;
    end if;
  end if;

  result_correction_id := pg_catalog.gen_random_uuid();

  insert into public.student_counseling_progression_event_corrections (
    id,
    target_event_id,
    correction_type,
    restored_stage,
    restored_state,
    restored_stage_started_at,
    corrected_by,
    correction_reason,
    corrected_at
  )
  values (
    result_correction_id,
    p_event_id,
    result_correction_type,
    result_restored_stage,
    result_restored_state,
    result_restored_stage_started_at,
    caller_id,
    normalized_reason,
    correction_time
  );

  if result_correction_type =
    'reset_initialization'::public.counseling_progression_correction_type then
    delete from public.student_counseling_progressions as progression
    where progression.student_id = p_student_id;

    if not found then
      raise exception using
        errcode = 'K3405',
        message = 'Official progression has changed';
    end if;
  else
    update public.student_counseling_progressions as progression
    set
      current_stage = result_restored_stage,
      workflow_state = result_restored_state,
      stage_started_at = result_restored_stage_started_at,
      last_changed_at = correction_time,
      last_changed_by = caller_id,
      updated_at = correction_time
    where progression.student_id = p_student_id
      and progression.current_stage = target_event.new_stage
      and progression.workflow_state = target_event.new_state;

    if not found then
      raise exception using
        errcode = 'K3405',
        message = 'Official progression has changed';
    end if;
  end if;

  return query
  select
    result_correction_id,
    p_event_id,
    result_correction_type,
    result_current_exists,
    result_restored_stage,
    result_restored_state,
    result_restored_stage_started_at,
    correction_time;
exception
  when sqlstate 'K3401' then
    raise exception using
      errcode = 'K3401',
      message = 'This progression update has already been reversed';
  when sqlstate 'K3402' then
    raise exception using
      errcode = 'K3402',
      message =
        'This progression update is no longer the latest valid step';
  when sqlstate 'K3404' then
    raise exception using
      errcode = 'K3404',
      message =
        'Supporting evidence must be removed or allowed to expire before this progression update can be reversed';
  when sqlstate 'K3405' then
    raise exception using
      errcode = 'K3405',
      message = 'Official progression has changed';
  when sqlstate 'K3406' then
    raise exception using
      errcode = 'K3406',
      message = 'The progression history is inconsistent';
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value or check_violation or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The progression correction request is invalid';
  when unique_violation then
    raise exception using
      errcode = 'K3401',
      message = 'This progression update has already been reversed';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message =
        'Another progression correction is currently in progress';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Official progression could not be corrected';
end;
$function$;

alter function
  public.undo_latest_student_counseling_progression_event(
    uuid,
    uuid,
    text
  ) owner to postgres;

comment on function
  public.undo_latest_student_counseling_progression_event(
    uuid,
    uuid,
    text
  ) is
  'Sequentially reverses only the latest effective progression event, preserves immutable history, and writes one permanent counselor-attributed correction.';

-- One bounded read call supplies correction rows for the visible event page
-- and the independently calculated latest effective event. Repeated context
-- columns avoid an N+1 query and keep the result relational.
create function
  public.get_counselor_progression_correction_context(
    p_student_id uuid,
    p_event_ids uuid[]
  )
returns table (
  target_event_id uuid,
  correction_id uuid,
  correction_type public.counseling_progression_correction_type,
  restored_stage public.counseling_progression_stage,
  restored_state public.counseling_progression_state,
  restored_stage_started_at timestamptz,
  correction_reason text,
  corrected_at timestamptz,
  effective_event_exists boolean,
  latest_effective_event_id uuid,
  latest_effective_stage public.counseling_progression_stage,
  latest_effective_state public.counseling_progression_state,
  latest_effective_changed_at timestamptz,
  latest_effective_changed_by uuid,
  total_correction_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  requested_count integer;
  distinct_count integer;
  effective_event public.student_counseling_progression_events%rowtype;
  effective_exists boolean;
  correction_count bigint;
begin
  if (select auth.uid()) is null
    or not public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  requested_count := pg_catalog.cardinality(p_event_ids);

  if p_student_id is null
    or requested_count is null
    or requested_count < 1
    or requested_count > 20
    or pg_catalog.array_position(p_event_ids, null) is not null
    or not exists (
      select 1
      from public.profiles as student_profile
      where student_profile.id = p_student_id
        and student_profile.role = 'student'::public.user_role
    ) then
    raise exception using
      errcode = '22023',
      message = 'The progression correction read request is invalid';
  end if;

  select pg_catalog.count(distinct requested.event_id)::integer
  into distinct_count
  from pg_catalog.unnest(p_event_ids) as requested(event_id);

  if distinct_count <> requested_count
    or (
      select pg_catalog.count(*)::integer
      from public.student_counseling_progression_events as event
      where event.student_id = p_student_id
        and event.id = any(p_event_ids)
    ) <> requested_count then
    raise exception using
      errcode = '22023',
      message = 'The progression correction read request is invalid';
  end if;

  select event.*
  into effective_event
  from public.student_counseling_progression_events as event
  where event.student_id = p_student_id
    and not exists (
      select 1
      from public.student_counseling_progression_event_corrections
        as correction
      where correction.target_event_id = event.id
    )
  order by event.changed_at desc, event.id desc
  limit 1;

  effective_exists := found;

  select pg_catalog.count(*)
  into correction_count
  from public.student_counseling_progression_event_corrections
    as correction
  inner join public.student_counseling_progression_events as event
    on event.id = correction.target_event_id
  where event.student_id = p_student_id;

  return query
  select
    requested.event_id,
    correction.id,
    correction.correction_type,
    correction.restored_stage,
    correction.restored_state,
    correction.restored_stage_started_at,
    correction.correction_reason,
    correction.corrected_at,
    effective_exists,
    case when effective_exists then effective_event.id else null end,
    case
      when effective_exists then effective_event.new_stage
      else null
    end,
    case
      when effective_exists then effective_event.new_state
      else null
    end,
    case
      when effective_exists then effective_event.changed_at
      else null
    end,
    case
      when effective_exists then effective_event.changed_by
      else null
    end,
    correction_count
  from pg_catalog.unnest(p_event_ids) with ordinality
    as requested(event_id, position)
  left join public.student_counseling_progression_event_corrections
    as correction
    on correction.target_event_id = requested.event_id
  order by requested.position;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value then
    raise exception using
      errcode = '22023',
      message = 'The progression correction read request is invalid';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Official progression corrections could not be loaded';
end;
$function$;

alter function
  public.get_counselor_progression_correction_context(uuid, uuid[])
  owner to postgres;

comment on function
  public.get_counselor_progression_correction_context(uuid, uuid[]) is
  'Returns correction context for one counselor-validated student and at most twenty exact event IDs, plus the latest effective event used by the server read model.';

alter table
  public.student_counseling_progression_event_corrections
  enable row level security;

revoke all privileges on table
  public.student_counseling_progression_event_corrections
  from public, anon, authenticated;

revoke all privileges on type
  public.counseling_progression_correction_type
  from public, anon, authenticated;

revoke all on function
  public.undo_latest_student_counseling_progression_event(
    uuid,
    uuid,
    text
  ) from public, anon, authenticated;

revoke all on function
  public.get_counselor_progression_correction_context(uuid, uuid[])
  from public, anon, authenticated;

grant usage on type public.counseling_progression_correction_type
  to authenticated;

grant select (
  id,
  target_event_id,
  correction_type,
  restored_stage,
  restored_state,
  restored_stage_started_at,
  corrected_by,
  correction_reason,
  corrected_at
) on table public.student_counseling_progression_event_corrections
  to authenticated;

grant execute on function
  public.undo_latest_student_counseling_progression_event(
    uuid,
    uuid,
    text
  ) to authenticated;

grant execute on function
  public.get_counselor_progression_correction_context(uuid, uuid[])
  to authenticated;

create policy progression_event_corrections_select_counselor
on public.student_counseling_progression_event_corrections
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy progression_event_corrections_select_counselor
  on public.student_counseling_progression_event_corrections is
  'Any active verified counselor may read institutional correction audits; students, admins, directors, and anonymous users have no policy.';

-- No application role receives INSERT, UPDATE, DELETE, or TRUNCATE on the
-- correction table. No progression event, evidence row, or Storage object is
-- deleted or updated by this migration. The sole DELETE targets the disposable
-- current projection during an audited reset_initialization correction.

commit;

-- >>> supabase/migrations/202607270001_university_application_foundation.sql
-- K-GEO Phase E1.1 university application tracking database foundation.
-- Review this migration before applying it. Apply it only after
-- 202607260002_progression_correction_foundation.sql and all earlier
-- migrations.
--
-- This migration is additive. It creates institution-owned university
-- application projections, append-only typed snapshots, and five focused
-- counselor mutation RPCs. It does not add application UI, Storage objects,
-- offer or visa data, or official-progression automation.

begin;

create type public.university_application_status as enum (
  'planning',
  'documents_collecting',
  'application_preparing',
  'ready_to_submit',
  'submitted',
  'under_university_review',
  'additional_information_requested',
  'decision_received',
  'withdrawn',
  'closed'
);

create type public.university_application_degree_level as enum (
  'bachelors',
  'masters',
  'postgraduate_diploma',
  'doctorate',
  'other'
);

create type public.university_application_intake_term as enum (
  'spring',
  'summer',
  'fall',
  'winter',
  'rolling',
  'other'
);

create type public.university_application_event_type as enum (
  'created',
  'details_updated',
  'status_changed',
  'primary_changed',
  'archived'
);

comment on type public.university_application_status is
  'Institution-controlled university application lifecycle; offer and visa outcomes are separate future domains.';

comment on type public.university_application_degree_level is
  'Validated degree level for one university application.';

comment on type public.university_application_intake_term is
  'Validated intake term for one university application.';

comment on type public.university_application_event_type is
  'Append-only mutation categories for university application snapshots; no delete or purge event exists.';

create table public.student_university_applications (
  id uuid
    constraint student_university_applications_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint student_university_applications_student_id_not_null not null
    constraint student_university_applications_student_id_fkey
      references public.profiles(id)
      on delete restrict,
  country_code text
    constraint student_university_applications_country_code_not_null
      not null,
  university_name text
    constraint student_university_applications_university_name_not_null
      not null,
  programme_name text
    constraint student_university_applications_programme_name_not_null
      not null,
  degree_level public.university_application_degree_level
    constraint student_university_applications_degree_level_not_null
      not null,
  intake_term public.university_application_intake_term
    constraint student_university_applications_intake_term_not_null
      not null,
  intake_year smallint
    constraint student_university_applications_intake_year_not_null
      not null,
  current_status public.university_application_status
    constraint student_university_applications_current_status_not_null
      not null
    default 'planning'::public.university_application_status,
  application_reference text,
  portal_url text,
  submission_deadline date,
  submitted_at timestamptz,
  is_primary boolean
    constraint student_university_applications_is_primary_not_null
      not null
    default false,
  is_archived boolean
    constraint student_university_applications_is_archived_not_null
      not null
    default false,
  archived_at timestamptz,
  archived_by uuid
    constraint student_university_applications_archived_by_fkey
      references public.profiles(id)
      on delete restrict,
  archive_reason text,
  version_number integer
    constraint student_university_applications_version_number_not_null
      not null
    default 1,
  created_by uuid
    constraint student_university_applications_created_by_not_null
      not null
    constraint student_university_applications_created_by_fkey
      references public.profiles(id)
      on delete restrict,
  last_changed_by uuid
    constraint student_university_applications_last_changed_by_not_null
      not null
    constraint student_university_applications_last_changed_by_fkey
      references public.profiles(id)
      on delete restrict,
  created_at timestamptz
    constraint student_university_applications_created_at_not_null
      not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint student_university_applications_updated_at_not_null
      not null
    default pg_catalog.now(),
  last_changed_at timestamptz
    constraint student_university_applications_last_changed_at_not_null
      not null
    default pg_catalog.now(),

  constraint student_university_applications_country_code_check
    check (
      country_code = pg_catalog.upper(pg_catalog.btrim(country_code))
      and country_code ~ '^[A-Z]{2}$'
    ),
  constraint student_university_applications_university_name_check
    check (
      university_name = pg_catalog.regexp_replace(
        pg_catalog.btrim(university_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(university_name) between 2 and 200
      and university_name !~ '[[:cntrl:]]'
    ),
  constraint student_university_applications_programme_name_check
    check (
      programme_name = pg_catalog.regexp_replace(
        pg_catalog.btrim(programme_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(programme_name) between 2 and 200
      and programme_name !~ '[[:cntrl:]]'
    ),
  constraint student_university_applications_intake_year_check
    check (intake_year between 2020 and 2100),
  constraint student_university_applications_reference_check
    check (
      application_reference is null
      or (
        application_reference = pg_catalog.regexp_replace(
          pg_catalog.btrim(application_reference),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(application_reference) between 1 and 100
        and application_reference !~ '[[:cntrl:]]'
      )
    ),
  constraint student_university_applications_portal_url_check
    check (
      portal_url is null
      or (
        portal_url = pg_catalog.btrim(portal_url)
        and pg_catalog.char_length(portal_url) between 1 and 2048
        and portal_url ~
          '^https://[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?:[/?#][^[:space:][:cntrl:]]*)?$'
        and portal_url !~ '^https://[^/?#]*@'
      )
    ),
  constraint student_university_applications_submission_state_check
    check (
      (
        current_status in (
          'planning'::public.university_application_status,
          'documents_collecting'::public.university_application_status,
          'application_preparing'::public.university_application_status,
          'ready_to_submit'::public.university_application_status
        )
        and submitted_at is null
      )
      or (
        current_status in (
          'submitted'::public.university_application_status,
          'under_university_review'::public.university_application_status,
          'additional_information_requested'::public.university_application_status,
          'decision_received'::public.university_application_status
        )
        and submitted_at is not null
      )
      or current_status in (
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    ),
  constraint student_university_applications_primary_consistency_check
    check (
      not is_primary
      or (
        not is_archived
        and current_status not in (
          'withdrawn'::public.university_application_status,
          'closed'::public.university_application_status
        )
      )
    ),
  constraint student_university_applications_archive_state_check
    check (
      (
        not is_archived
        and archived_at is null
        and archived_by is null
        and archive_reason is null
      )
      or (
        is_archived
        and archived_at is not null
        and archived_by is not null
        and archive_reason is not null
        and archive_reason = pg_catalog.regexp_replace(
          pg_catalog.btrim(archive_reason),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(archive_reason) between 1 and 500
        and archive_reason !~ '[[:cntrl:]]'
      )
    ),
  constraint student_university_applications_version_check
    check (version_number >= 1),
  constraint student_university_applications_actor_check
    check (
      student_id <> created_by
      and student_id <> last_changed_by
      and (
        archived_by is null
        or student_id <> archived_by
      )
    ),
  constraint student_university_applications_timestamp_check
    check (
      updated_at = last_changed_at
      and last_changed_at >= created_at
      and (
        submitted_at is null
        or submitted_at >= created_at
      )
      and (
        archived_at is null
        or archived_at >= created_at
      )
    )
);

create table public.student_university_application_events (
  id uuid
    constraint student_university_application_events_pkey primary key
    default pg_catalog.gen_random_uuid(),
  application_id uuid
    constraint student_university_application_events_application_id_not_null
      not null
    constraint student_university_application_events_application_id_fkey
      references public.student_university_applications(id)
      on delete restrict,
  event_type public.university_application_event_type
    constraint student_university_application_events_event_type_not_null
      not null,
  version_number integer
    constraint student_university_application_events_version_number_not_null
      not null,
  country_code text
    constraint student_university_application_events_country_code_not_null
      not null,
  university_name text
    constraint student_university_application_events_university_name_not_null
      not null,
  programme_name text
    constraint student_university_application_events_programme_name_not_null
      not null,
  degree_level public.university_application_degree_level
    constraint student_university_application_events_degree_level_not_null
      not null,
  intake_term public.university_application_intake_term
    constraint student_university_application_events_intake_term_not_null
      not null,
  intake_year smallint
    constraint student_university_application_events_intake_year_not_null
      not null,
  application_status public.university_application_status
    constraint student_university_application_events_application_status_not_null
      not null,
  application_reference text,
  portal_url text,
  submission_deadline date,
  submitted_at timestamptz,
  is_primary boolean
    constraint student_university_application_events_is_primary_not_null
      not null,
  is_archived boolean
    constraint student_university_application_events_is_archived_not_null
      not null,
  change_reason text,
  changed_by uuid
    constraint student_university_application_events_changed_by_not_null
      not null
    constraint student_university_application_events_changed_by_fkey
      references public.profiles(id)
      on delete restrict,
  changed_at timestamptz
    constraint student_university_application_events_changed_at_not_null
      not null
    default pg_catalog.now(),

  constraint student_university_application_events_application_version_key
    unique (application_id, version_number),
  constraint student_university_application_events_country_code_check
    check (
      country_code = pg_catalog.upper(pg_catalog.btrim(country_code))
      and country_code ~ '^[A-Z]{2}$'
    ),
  constraint student_university_application_events_university_name_check
    check (
      university_name = pg_catalog.regexp_replace(
        pg_catalog.btrim(university_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(university_name) between 2 and 200
      and university_name !~ '[[:cntrl:]]'
    ),
  constraint student_university_application_events_programme_name_check
    check (
      programme_name = pg_catalog.regexp_replace(
        pg_catalog.btrim(programme_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(programme_name) between 2 and 200
      and programme_name !~ '[[:cntrl:]]'
    ),
  constraint student_university_application_events_intake_year_check
    check (intake_year between 2020 and 2100),
  constraint student_university_application_events_reference_check
    check (
      application_reference is null
      or (
        application_reference = pg_catalog.regexp_replace(
          pg_catalog.btrim(application_reference),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(application_reference) between 1 and 100
        and application_reference !~ '[[:cntrl:]]'
      )
    ),
  constraint student_university_application_events_portal_url_check
    check (
      portal_url is null
      or (
        portal_url = pg_catalog.btrim(portal_url)
        and pg_catalog.char_length(portal_url) between 1 and 2048
        and portal_url ~
          '^https://[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?:[/?#][^[:space:][:cntrl:]]*)?$'
        and portal_url !~ '^https://[^/?#]*@'
      )
    ),
  constraint student_university_application_events_submission_state_check
    check (
      (
        application_status in (
          'planning'::public.university_application_status,
          'documents_collecting'::public.university_application_status,
          'application_preparing'::public.university_application_status,
          'ready_to_submit'::public.university_application_status
        )
        and submitted_at is null
      )
      or (
        application_status in (
          'submitted'::public.university_application_status,
          'under_university_review'::public.university_application_status,
          'additional_information_requested'::public.university_application_status,
          'decision_received'::public.university_application_status
        )
        and submitted_at is not null
      )
      or application_status in (
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    ),
  constraint student_university_application_events_primary_consistency_check
    check (
      not is_primary
      or (
        not is_archived
        and application_status not in (
          'withdrawn'::public.university_application_status,
          'closed'::public.university_application_status
        )
      )
    ),
  constraint student_university_application_events_reason_check
    check (
      (
        event_type = 'created'::public.university_application_event_type
        and change_reason is null
      )
      or (
        event_type <> 'created'::public.university_application_event_type
        and change_reason is not null
        and change_reason = pg_catalog.regexp_replace(
          pg_catalog.btrim(change_reason),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(change_reason) between 1 and 500
        and change_reason !~ '[[:cntrl:]]'
      )
    ),
  constraint student_university_application_events_type_version_check
    check (
      (
        version_number = 1
        and event_type =
          'created'::public.university_application_event_type
      )
      or (
        version_number > 1
        and event_type <>
          'created'::public.university_application_event_type
      )
    ),
  constraint student_university_application_events_version_check
    check (version_number >= 1)
);

comment on table public.student_university_applications is
  'Current institution-owned projection for zero or more university applications per student.';

comment on table public.student_university_application_events is
  'Append-only complete typed post-mutation snapshots written only by trusted E1.1 RPCs.';

comment on column public.student_university_applications.student_id is
  'Durable student profile target. Account deletion is restricted while institutional application history exists.';

comment on column public.student_university_applications.submitted_at is
  'Database timestamp set on the first transition to submitted and never automatically cleared.';

comment on column public.student_university_applications.version_number is
  'Starts at one and increases exactly once for each audited mutation affecting this projection.';

comment on column public.student_university_application_events.change_reason is
  'Required normalized institutional reason for every event except creation.';

create index student_university_applications_student_active_idx
  on public.student_university_applications (
    student_id,
    is_archived,
    is_primary desc,
    updated_at desc,
    id desc
  );

create index student_university_applications_student_status_idx
  on public.student_university_applications (
    student_id,
    current_status,
    updated_at desc,
    id desc
  );

create unique index student_university_applications_one_primary_idx
  on public.student_university_applications (student_id)
  where is_primary is true;

create index student_university_application_events_history_idx
  on public.student_university_application_events (
    application_id,
    version_number desc,
    changed_at desc,
    id desc
  );

comment on index
  public.student_university_applications_student_active_idx is
  'Supports the future bounded Student 360 ordering: active before archived, primary first, then newest projection.';

comment on index
  public.student_university_applications_student_status_idx is
  'Supports bounded per-student status filtering without speculative institution-wide reporting indexes.';

comment on index
  public.student_university_applications_one_primary_idx is
  'Enforces at most one primary application for a student; the row check prevents terminal or archived primary rows.';

comment on index
  public.student_university_application_events_history_idx is
  'Supports bounded newest-version application history and future keyset pagination.';

-- SECURITY: creation derives the counselor and all audit values from trusted
-- database state. Initial status, primary/archive flags, version, submitted
-- timestamp, actor, event type, and timestamps are not RPC parameters.
create function public.create_student_university_application(
  p_student_id uuid,
  p_country_code text,
  p_university_name text,
  p_programme_name text,
  p_degree_level text,
  p_intake_term text,
  p_intake_year integer,
  p_application_reference text,
  p_portal_url text,
  p_submission_deadline date
)
returns table (
  application_id uuid,
  student_id uuid,
  current_status public.university_application_status,
  is_primary boolean,
  is_archived boolean,
  version_number integer,
  created_at timestamptz,
  updated_at timestamptz,
  last_changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  normalized_country_code text;
  normalized_university_name text;
  normalized_programme_name text;
  normalized_degree_level text;
  normalized_intake_term text;
  normalized_application_reference text;
  normalized_portal_url text;
  requested_degree_level public.university_application_degree_level;
  requested_intake_term public.university_application_intake_term;
  new_application_id uuid;
  change_time timestamptz;
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

  if p_university_name ~ '[[:cntrl:]]'
    or p_programme_name ~ '[[:cntrl:]]'
    or p_application_reference ~ '[[:cntrl:]]'
    or p_portal_url ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  normalized_country_code :=
    pg_catalog.upper(pg_catalog.btrim(p_country_code));
  normalized_university_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_university_name),
    '[[:space:]]+',
    ' ',
    'g'
  );
  normalized_programme_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_programme_name),
    '[[:space:]]+',
    ' ',
    'g'
  );
  normalized_degree_level :=
    pg_catalog.lower(pg_catalog.btrim(p_degree_level));
  normalized_intake_term :=
    pg_catalog.lower(pg_catalog.btrim(p_intake_term));
  normalized_application_reference := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_application_reference),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  normalized_portal_url :=
    nullif(pg_catalog.btrim(p_portal_url), '');

  if p_student_id is null
    or normalized_country_code is null
    or normalized_university_name is null
    or normalized_programme_name is null
    or normalized_degree_level is null
    or normalized_intake_term is null
    or p_intake_year is null
    or normalized_country_code !~ '^[A-Z]{2}$'
    or pg_catalog.char_length(normalized_university_name)
      not between 2 and 200
    or pg_catalog.char_length(normalized_programme_name)
      not between 2 and 200
    or normalized_degree_level not in (
      'bachelors',
      'masters',
      'postgraduate_diploma',
      'doctorate',
      'other'
    )
    or normalized_intake_term not in (
      'spring',
      'summer',
      'fall',
      'winter',
      'rolling',
      'other'
    )
    or p_intake_year not between 2020 and 2100
    or pg_catalog.char_length(normalized_application_reference) > 100
    or pg_catalog.char_length(normalized_portal_url) > 2048
    or (
      normalized_portal_url is not null
      and (
        normalized_portal_url !~
          '^https://[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?:[/?#][^[:space:][:cntrl:]]*)?$'
        or normalized_portal_url ~ '^https://[^/?#]*@'
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  requested_degree_level :=
    normalized_degree_level::public.university_application_degree_level;
  requested_intake_term :=
    normalized_intake_term::public.university_application_intake_term;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(p_student_id::text, 202607270001)
  ) then
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = p_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  new_application_id := pg_catalog.gen_random_uuid();
  change_time := pg_catalog.statement_timestamp();

  insert into public.student_university_applications (
    id,
    student_id,
    country_code,
    university_name,
    programme_name,
    degree_level,
    intake_term,
    intake_year,
    current_status,
    application_reference,
    portal_url,
    submission_deadline,
    submitted_at,
    is_primary,
    is_archived,
    archived_at,
    archived_by,
    archive_reason,
    version_number,
    created_by,
    last_changed_by,
    created_at,
    updated_at,
    last_changed_at
  )
  values (
    new_application_id,
    p_student_id,
    normalized_country_code,
    normalized_university_name,
    normalized_programme_name,
    requested_degree_level,
    requested_intake_term,
    p_intake_year::smallint,
    'planning'::public.university_application_status,
    normalized_application_reference,
    normalized_portal_url,
    p_submission_deadline,
    null,
    false,
    false,
    null,
    null,
    null,
    1,
    caller_id,
    caller_id,
    change_time,
    change_time,
    change_time
  );

  insert into public.student_university_application_events (
    application_id,
    event_type,
    version_number,
    country_code,
    university_name,
    programme_name,
    degree_level,
    intake_term,
    intake_year,
    application_status,
    application_reference,
    portal_url,
    submission_deadline,
    submitted_at,
    is_primary,
    is_archived,
    change_reason,
    changed_by,
    changed_at
  )
  select
    application.id,
    'created'::public.university_application_event_type,
    application.version_number,
    application.country_code,
    application.university_name,
    application.programme_name,
    application.degree_level,
    application.intake_term,
    application.intake_year,
    application.current_status,
    application.application_reference,
    application.portal_url,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.is_archived,
    null,
    caller_id,
    change_time
  from public.student_university_applications as application
  where application.id = new_application_id;

  return query
  select
    application.id,
    application.student_id,
    application.current_status,
    application.is_primary,
    application.is_archived,
    application.version_number,
    application.created_at,
    application.updated_at,
    application.last_changed_at
  from public.student_university_applications as application
  where application.id = new_application_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value
    or invalid_text_representation
    or check_violation
    or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The university application could not be created';
end;
$function$;

-- The immutable student_id lookup below resolves only the advisory-lock key.
-- Every mutable field is read again under the shared student lock and a target
-- row FOR UPDATE lock. Direct ownership transfer is impossible.
create function public.update_student_university_application_details(
  p_application_id uuid,
  p_country_code text,
  p_university_name text,
  p_programme_name text,
  p_degree_level text,
  p_intake_term text,
  p_intake_year integer,
  p_application_reference text,
  p_portal_url text,
  p_submission_deadline date,
  p_change_reason text
)
returns table (
  application_id uuid,
  student_id uuid,
  current_status public.university_application_status,
  is_primary boolean,
  is_archived boolean,
  version_number integer,
  created_at timestamptz,
  updated_at timestamptz,
  last_changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  target_student_id uuid;
  current_application public.student_university_applications%rowtype;
  normalized_country_code text;
  normalized_university_name text;
  normalized_programme_name text;
  normalized_degree_level text;
  normalized_intake_term text;
  normalized_application_reference text;
  normalized_portal_url text;
  normalized_reason text;
  requested_degree_level public.university_application_degree_level;
  requested_intake_term public.university_application_intake_term;
  change_time timestamptz;
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

  if p_university_name ~ '[[:cntrl:]]'
    or p_programme_name ~ '[[:cntrl:]]'
    or p_application_reference ~ '[[:cntrl:]]'
    or p_portal_url ~ '[[:cntrl:]]'
    or p_change_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  normalized_country_code :=
    pg_catalog.upper(pg_catalog.btrim(p_country_code));
  normalized_university_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_university_name),
    '[[:space:]]+',
    ' ',
    'g'
  );
  normalized_programme_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_programme_name),
    '[[:space:]]+',
    ' ',
    'g'
  );
  normalized_degree_level :=
    pg_catalog.lower(pg_catalog.btrim(p_degree_level));
  normalized_intake_term :=
    pg_catalog.lower(pg_catalog.btrim(p_intake_term));
  normalized_application_reference := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_application_reference),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  normalized_portal_url :=
    nullif(pg_catalog.btrim(p_portal_url), '');
  normalized_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_change_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if p_application_id is null
    or normalized_country_code is null
    or normalized_university_name is null
    or normalized_programme_name is null
    or normalized_degree_level is null
    or normalized_intake_term is null
    or p_intake_year is null
    or normalized_country_code !~ '^[A-Z]{2}$'
    or pg_catalog.char_length(normalized_university_name)
      not between 2 and 200
    or pg_catalog.char_length(normalized_programme_name)
      not between 2 and 200
    or normalized_degree_level not in (
      'bachelors',
      'masters',
      'postgraduate_diploma',
      'doctorate',
      'other'
    )
    or normalized_intake_term not in (
      'spring',
      'summer',
      'fall',
      'winter',
      'rolling',
      'other'
    )
    or p_intake_year not between 2020 and 2100
    or pg_catalog.char_length(normalized_application_reference) > 100
    or pg_catalog.char_length(normalized_portal_url) > 2048
    or normalized_reason is null
    or pg_catalog.char_length(normalized_reason) > 500
    or (
      normalized_portal_url is not null
      and (
        normalized_portal_url !~
          '^https://[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?:[/?#][^[:space:][:cntrl:]]*)?$'
        or normalized_portal_url ~ '^https://[^/?#]*@'
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  requested_degree_level :=
    normalized_degree_level::public.university_application_degree_level;
  requested_intake_term :=
    normalized_intake_term::public.university_application_intake_term;

  select application.student_id
  into target_student_id
  from public.student_university_applications as application
  where application.id = p_application_id;

  if not found or not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(target_student_id::text, 202607270001)
  ) then
    if not found then
      raise exception using
        errcode = '22023',
        message = 'The university application request is invalid';
    end if;
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = target_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  select application.*
  into current_application
  from public.student_university_applications as application
  where application.id = p_application_id
    and application.student_id = target_student_id
  for update;

  if not found or current_application.is_archived then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  if current_application.country_code = normalized_country_code
    and current_application.university_name = normalized_university_name
    and current_application.programme_name = normalized_programme_name
    and current_application.degree_level = requested_degree_level
    and current_application.intake_term = requested_intake_term
    and current_application.intake_year = p_intake_year
    and current_application.application_reference
      is not distinct from normalized_application_reference
    and current_application.portal_url
      is not distinct from normalized_portal_url
    and current_application.submission_deadline
      is not distinct from p_submission_deadline then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  change_time := pg_catalog.statement_timestamp();
  if change_time <= current_application.last_changed_at then
    change_time := current_application.last_changed_at
      + interval '1 microsecond';
  end if;

  update public.student_university_applications as application
  set
    country_code = normalized_country_code,
    university_name = normalized_university_name,
    programme_name = normalized_programme_name,
    degree_level = requested_degree_level,
    intake_term = requested_intake_term,
    intake_year = p_intake_year::smallint,
    application_reference = normalized_application_reference,
    portal_url = normalized_portal_url,
    submission_deadline = p_submission_deadline,
    version_number = application.version_number + 1,
    last_changed_by = caller_id,
    updated_at = change_time,
    last_changed_at = change_time
  where application.id = p_application_id;

  insert into public.student_university_application_events (
    application_id,
    event_type,
    version_number,
    country_code,
    university_name,
    programme_name,
    degree_level,
    intake_term,
    intake_year,
    application_status,
    application_reference,
    portal_url,
    submission_deadline,
    submitted_at,
    is_primary,
    is_archived,
    change_reason,
    changed_by,
    changed_at
  )
  select
    application.id,
    'details_updated'::public.university_application_event_type,
    application.version_number,
    application.country_code,
    application.university_name,
    application.programme_name,
    application.degree_level,
    application.intake_term,
    application.intake_year,
    application.current_status,
    application.application_reference,
    application.portal_url,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.is_archived,
    normalized_reason,
    caller_id,
    change_time
  from public.student_university_applications as application
  where application.id = p_application_id;

  return query
  select
    application.id,
    application.student_id,
    application.current_status,
    application.is_primary,
    application.is_archived,
    application.version_number,
    application.created_at,
    application.updated_at,
    application.last_changed_at
  from public.student_university_applications as application
  where application.id = p_application_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value
    or invalid_text_representation
    or check_violation
    or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The university application could not be updated';
end;
$function$;

create function public.record_student_university_application_status(
  p_application_id uuid,
  p_new_status text,
  p_change_reason text
)
returns table (
  application_id uuid,
  student_id uuid,
  current_status public.university_application_status,
  is_primary boolean,
  is_archived boolean,
  version_number integer,
  created_at timestamptz,
  updated_at timestamptz,
  last_changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  target_student_id uuid;
  current_application public.student_university_applications%rowtype;
  normalized_status text;
  normalized_reason text;
  requested_status public.university_application_status;
  next_submitted_at timestamptz;
  next_primary boolean;
  change_time timestamptz;
  transition_allowed boolean;
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

  if p_change_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  normalized_status :=
    pg_catalog.lower(pg_catalog.btrim(p_new_status));
  normalized_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_change_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if p_application_id is null
    or normalized_status is null
    or normalized_status not in (
      'planning',
      'documents_collecting',
      'application_preparing',
      'ready_to_submit',
      'submitted',
      'under_university_review',
      'additional_information_requested',
      'decision_received',
      'withdrawn',
      'closed'
    )
    or normalized_reason is null
    or pg_catalog.char_length(normalized_reason) > 500 then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  requested_status :=
    normalized_status::public.university_application_status;

  select application.student_id
  into target_student_id
  from public.student_university_applications as application
  where application.id = p_application_id;

  if not found or not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(target_student_id::text, 202607270001)
  ) then
    if not found then
      raise exception using
        errcode = '22023',
        message = 'The university application request is invalid';
    end if;
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = target_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  select application.*
  into current_application
  from public.student_university_applications as application
  where application.id = p_application_id
    and application.student_id = target_student_id
  for update;

  if not found
    or current_application.is_archived
    or current_application.current_status in (
      'withdrawn'::public.university_application_status,
      'closed'::public.university_application_status
    )
    or current_application.current_status = requested_status then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  transition_allowed := case current_application.current_status
    when 'planning'::public.university_application_status then
      requested_status in (
        'documents_collecting'::public.university_application_status,
        'application_preparing'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'documents_collecting'::public.university_application_status then
      requested_status in (
        'application_preparing'::public.university_application_status,
        'ready_to_submit'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'application_preparing'::public.university_application_status then
      requested_status in (
        'documents_collecting'::public.university_application_status,
        'ready_to_submit'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'ready_to_submit'::public.university_application_status then
      requested_status in (
        'submitted'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'submitted'::public.university_application_status then
      requested_status in (
        'under_university_review'::public.university_application_status,
        'additional_information_requested'::public.university_application_status,
        'decision_received'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'under_university_review'::public.university_application_status then
      requested_status in (
        'additional_information_requested'::public.university_application_status,
        'decision_received'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'additional_information_requested'::public.university_application_status then
      requested_status in (
        'under_university_review'::public.university_application_status,
        'decision_received'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'decision_received'::public.university_application_status then
      requested_status in (
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    else false
  end;

  if not transition_allowed then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  change_time := pg_catalog.statement_timestamp();
  if change_time <= current_application.last_changed_at then
    change_time := current_application.last_changed_at
      + interval '1 microsecond';
  end if;

  next_submitted_at := current_application.submitted_at;
  if requested_status =
      'submitted'::public.university_application_status
    and next_submitted_at is null then
    next_submitted_at := change_time;
  end if;

  next_primary := current_application.is_primary
    and requested_status not in (
      'withdrawn'::public.university_application_status,
      'closed'::public.university_application_status
    );

  update public.student_university_applications as application
  set
    current_status = requested_status,
    submitted_at = next_submitted_at,
    is_primary = next_primary,
    version_number = application.version_number + 1,
    last_changed_by = caller_id,
    updated_at = change_time,
    last_changed_at = change_time
  where application.id = p_application_id;

  insert into public.student_university_application_events (
    application_id,
    event_type,
    version_number,
    country_code,
    university_name,
    programme_name,
    degree_level,
    intake_term,
    intake_year,
    application_status,
    application_reference,
    portal_url,
    submission_deadline,
    submitted_at,
    is_primary,
    is_archived,
    change_reason,
    changed_by,
    changed_at
  )
  select
    application.id,
    'status_changed'::public.university_application_event_type,
    application.version_number,
    application.country_code,
    application.university_name,
    application.programme_name,
    application.degree_level,
    application.intake_term,
    application.intake_year,
    application.current_status,
    application.application_reference,
    application.portal_url,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.is_archived,
    normalized_reason,
    caller_id,
    change_time
  from public.student_university_applications as application
  where application.id = p_application_id;

  return query
  select
    application.id,
    application.student_id,
    application.current_status,
    application.is_primary,
    application.is_archived,
    application.version_number,
    application.created_at,
    application.updated_at,
    application.last_changed_at
  from public.student_university_applications as application
  where application.id = p_application_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value
    or invalid_text_representation
    or check_violation
    or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The university application status could not be updated';
end;
$function$;

create function public.set_primary_student_university_application(
  p_application_id uuid,
  p_change_reason text
)
returns table (
  application_id uuid,
  student_id uuid,
  current_status public.university_application_status,
  is_primary boolean,
  is_archived boolean,
  version_number integer,
  created_at timestamptz,
  updated_at timestamptz,
  last_changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  target_student_id uuid;
  target_application public.student_university_applications%rowtype;
  previous_primary public.student_university_applications%rowtype;
  previous_primary_exists boolean;
  normalized_reason text;
  change_time timestamptz;
  latest_prior_change timestamptz;
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

  if p_change_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  normalized_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_change_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if p_application_id is null
    or normalized_reason is null
    or pg_catalog.char_length(normalized_reason) > 500 then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  select application.student_id
  into target_student_id
  from public.student_university_applications as application
  where application.id = p_application_id;

  if not found or not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(target_student_id::text, 202607270001)
  ) then
    if not found then
      raise exception using
        errcode = '22023',
        message = 'The university application request is invalid';
    end if;
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = target_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  -- Lock the target and current primary in UUID order even though the shared
  -- per-student advisory lock already serializes application mutations.
  perform application.id
  from public.student_university_applications as application
  where application.student_id = target_student_id
    and (
      application.id = p_application_id
      or application.is_primary
    )
  order by application.id
  for update;

  select application.*
  into target_application
  from public.student_university_applications as application
  where application.id = p_application_id
    and application.student_id = target_student_id;

  if not found
    or target_application.is_archived
    or target_application.is_primary
    or target_application.current_status in (
      'withdrawn'::public.university_application_status,
      'closed'::public.university_application_status
    ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  select application.*
  into previous_primary
  from public.student_university_applications as application
  where application.student_id = target_student_id
    and application.is_primary
    and application.id <> p_application_id;
  previous_primary_exists := found;

  latest_prior_change := target_application.last_changed_at;
  if previous_primary_exists
    and previous_primary.last_changed_at > latest_prior_change then
    latest_prior_change := previous_primary.last_changed_at;
  end if;

  change_time := pg_catalog.statement_timestamp();
  if change_time <= latest_prior_change then
    change_time := latest_prior_change + interval '1 microsecond';
  end if;

  if previous_primary_exists then
    update public.student_university_applications as application
    set
      is_primary = false,
      version_number = application.version_number + 1,
      last_changed_by = caller_id,
      updated_at = change_time,
      last_changed_at = change_time
    where application.id = previous_primary.id;

    insert into public.student_university_application_events (
      application_id,
      event_type,
      version_number,
      country_code,
      university_name,
      programme_name,
      degree_level,
      intake_term,
      intake_year,
      application_status,
      application_reference,
      portal_url,
      submission_deadline,
      submitted_at,
      is_primary,
      is_archived,
      change_reason,
      changed_by,
      changed_at
    )
    select
      application.id,
      'primary_changed'::public.university_application_event_type,
      application.version_number,
      application.country_code,
      application.university_name,
      application.programme_name,
      application.degree_level,
      application.intake_term,
      application.intake_year,
      application.current_status,
      application.application_reference,
      application.portal_url,
      application.submission_deadline,
      application.submitted_at,
      application.is_primary,
      application.is_archived,
      normalized_reason,
      caller_id,
      change_time
    from public.student_university_applications as application
    where application.id = previous_primary.id;
  end if;

  update public.student_university_applications as application
  set
    is_primary = true,
    version_number = application.version_number + 1,
    last_changed_by = caller_id,
    updated_at = change_time,
    last_changed_at = change_time
  where application.id = p_application_id;

  insert into public.student_university_application_events (
    application_id,
    event_type,
    version_number,
    country_code,
    university_name,
    programme_name,
    degree_level,
    intake_term,
    intake_year,
    application_status,
    application_reference,
    portal_url,
    submission_deadline,
    submitted_at,
    is_primary,
    is_archived,
    change_reason,
    changed_by,
    changed_at
  )
  select
    application.id,
    'primary_changed'::public.university_application_event_type,
    application.version_number,
    application.country_code,
    application.university_name,
    application.programme_name,
    application.degree_level,
    application.intake_term,
    application.intake_year,
    application.current_status,
    application.application_reference,
    application.portal_url,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.is_archived,
    normalized_reason,
    caller_id,
    change_time
  from public.student_university_applications as application
  where application.id = p_application_id;

  return query
  select
    application.id,
    application.student_id,
    application.current_status,
    application.is_primary,
    application.is_archived,
    application.version_number,
    application.created_at,
    application.updated_at,
    application.last_changed_at
  from public.student_university_applications as application
  where application.id = p_application_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value
    or invalid_text_representation
    or check_violation
    or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  when serialization_failure
    or lock_not_available
    or unique_violation then
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The primary university application could not be updated';
end;
$function$;

create function public.archive_student_university_application(
  p_application_id uuid,
  p_archive_reason text
)
returns table (
  application_id uuid,
  student_id uuid,
  is_archived boolean,
  is_primary boolean,
  version_number integer,
  archived_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  target_student_id uuid;
  current_application public.student_university_applications%rowtype;
  normalized_reason text;
  change_time timestamptz;
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

  if p_archive_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  normalized_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_archive_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if p_application_id is null
    or normalized_reason is null
    or pg_catalog.char_length(normalized_reason) > 500 then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  select application.student_id
  into target_student_id
  from public.student_university_applications as application
  where application.id = p_application_id;

  if not found or not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(target_student_id::text, 202607270001)
  ) then
    if not found then
      raise exception using
        errcode = '22023',
        message = 'The university application request is invalid';
    end if;
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = target_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  select application.*
  into current_application
  from public.student_university_applications as application
  where application.id = p_application_id
    and application.student_id = target_student_id
  for update;

  if not found or current_application.is_archived then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  change_time := pg_catalog.statement_timestamp();
  if change_time <= current_application.last_changed_at then
    change_time := current_application.last_changed_at
      + interval '1 microsecond';
  end if;

  update public.student_university_applications as application
  set
    is_primary = false,
    is_archived = true,
    archived_at = change_time,
    archived_by = caller_id,
    archive_reason = normalized_reason,
    version_number = application.version_number + 1,
    last_changed_by = caller_id,
    updated_at = change_time,
    last_changed_at = change_time
  where application.id = p_application_id;

  insert into public.student_university_application_events (
    application_id,
    event_type,
    version_number,
    country_code,
    university_name,
    programme_name,
    degree_level,
    intake_term,
    intake_year,
    application_status,
    application_reference,
    portal_url,
    submission_deadline,
    submitted_at,
    is_primary,
    is_archived,
    change_reason,
    changed_by,
    changed_at
  )
  select
    application.id,
    'archived'::public.university_application_event_type,
    application.version_number,
    application.country_code,
    application.university_name,
    application.programme_name,
    application.degree_level,
    application.intake_term,
    application.intake_year,
    application.current_status,
    application.application_reference,
    application.portal_url,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.is_archived,
    normalized_reason,
    caller_id,
    change_time
  from public.student_university_applications as application
  where application.id = p_application_id;

  return query
  select
    application.id,
    application.student_id,
    application.is_archived,
    application.is_primary,
    application.version_number,
    application.archived_at,
    application.updated_at
  from public.student_university_applications as application
  where application.id = p_application_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value
    or invalid_text_representation
    or check_violation
    or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The university application could not be archived';
end;
$function$;

alter function public.create_student_university_application(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date
) owner to postgres;

alter function public.update_student_university_application_details(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date,
  text
) owner to postgres;

alter function public.record_student_university_application_status(
  uuid,
  text,
  text
) owner to postgres;

alter function public.set_primary_student_university_application(
  uuid,
  text
) owner to postgres;

alter function public.archive_student_university_application(
  uuid,
  text
) owner to postgres;

comment on function public.create_student_university_application(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date
) is
  'Creates one normalized planning application and its version-one snapshot for a trusted student target.';

comment on function public.update_student_university_application_details(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date,
  text
) is
  'Atomically updates approved application details and appends one complete details snapshot.';

comment on function public.record_student_university_application_status(
  uuid,
  text,
  text
) is
  'Applies one permitted application-status transition and appends one complete status snapshot.';

comment on function public.set_primary_student_university_application(
  uuid,
  text
) is
  'Atomically switches the one allowed primary application and audits every affected projection.';

comment on function public.archive_student_university_application(
  uuid,
  text
) is
  'Soft-archives one application, clears primary state, preserves status, and appends one complete snapshot.';

alter table public.student_university_applications
  enable row level security;
alter table public.student_university_application_events
  enable row level security;

revoke all privileges on table
  public.student_university_applications
  from public, anon, authenticated;
revoke all privileges on table
  public.student_university_application_events
  from public, anon, authenticated;

revoke all privileges on type
  public.university_application_status
  from public, anon, authenticated;
revoke all privileges on type
  public.university_application_degree_level
  from public, anon, authenticated;
revoke all privileges on type
  public.university_application_intake_term
  from public, anon, authenticated;
revoke all privileges on type
  public.university_application_event_type
  from public, anon, authenticated;

revoke all on function public.create_student_university_application(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date
) from public, anon, authenticated;
revoke all on function public.update_student_university_application_details(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date,
  text
) from public, anon, authenticated;
revoke all on function public.record_student_university_application_status(
  uuid,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.set_primary_student_university_application(
  uuid,
  text
) from public, anon, authenticated;
revoke all on function public.archive_student_university_application(
  uuid,
  text
) from public, anon, authenticated;

grant usage on type public.university_application_status
  to authenticated;
grant usage on type public.university_application_degree_level
  to authenticated;
grant usage on type public.university_application_intake_term
  to authenticated;
grant usage on type public.university_application_event_type
  to authenticated;

-- Actor UUID columns are intentionally omitted from direct authenticated
-- SELECT grants. The counselor policy still applies to every approved field.
grant select (
  id,
  student_id,
  country_code,
  university_name,
  programme_name,
  degree_level,
  intake_term,
  intake_year,
  current_status,
  application_reference,
  portal_url,
  submission_deadline,
  submitted_at,
  is_primary,
  is_archived,
  archived_at,
  archive_reason,
  version_number,
  created_at,
  updated_at,
  last_changed_at
) on table public.student_university_applications
  to authenticated;

grant select (
  id,
  application_id,
  event_type,
  version_number,
  country_code,
  university_name,
  programme_name,
  degree_level,
  intake_term,
  intake_year,
  application_status,
  application_reference,
  portal_url,
  submission_deadline,
  submitted_at,
  is_primary,
  is_archived,
  change_reason,
  changed_at
) on table public.student_university_application_events
  to authenticated;

grant execute on function public.create_student_university_application(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date
) to authenticated;
grant execute on function public.update_student_university_application_details(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date,
  text
) to authenticated;
grant execute on function public.record_student_university_application_status(
  uuid,
  text,
  text
) to authenticated;
grant execute on function public.set_primary_student_university_application(
  uuid,
  text
) to authenticated;
grant execute on function public.archive_student_university_application(
  uuid,
  text
) to authenticated;

create policy student_university_applications_select_counselor
on public.student_university_applications
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy student_university_application_events_select_counselor
on public.student_university_application_events
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy student_university_applications_select_counselor
  on public.student_university_applications is
  'Any active verified counselor may read approved institutional application fields; students, admins, directors, and anonymous callers have no policy.';

comment on policy student_university_application_events_select_counselor
  on public.student_university_application_events is
  'Any active verified counselor may read approved append-only snapshots; no application role receives direct mutation access.';

-- No INSERT, UPDATE, DELETE, or TRUNCATE policy or grant exists on either
-- E1.1 table. There is no restore RPC and no hard-delete workflow. Profile
-- deletion remains restricted while retained application or actor history
-- exists. University application status remains independent from official
-- counseling progression; none of these functions reads or mutates D3 data.
-- Future global reporting indexes require EXPLAIN evidence before addition.

commit;

-- >>> supabase/migrations/202607280001_student_university_application_read_foundation.sql
begin;

-- SECURITY: This is the only student read path for university applications.
-- It accepts no identity input, reauthorizes the current JWT identity, and
-- returns only the approved nonarchived projection fields.
create function public.get_my_university_applications()
returns table (
  application_id uuid,
  university_name text,
  programme_name text,
  country_code text,
  degree_level public.university_application_degree_level,
  intake_term public.university_application_intake_term,
  intake_year integer,
  current_status public.university_application_status,
  submission_deadline date,
  submitted_at timestamptz,
  is_primary boolean,
  last_changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  bounded_application_count integer;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'University applications are temporarily unavailable.';
  end if;

  -- Inspect at most 101 rows so an invalid oversized result fails closed
  -- without an unbounded count or disclosure of the actual row count.
  select pg_catalog.count(*)::integer
  into bounded_application_count
  from (
    select application.id
    from public.student_university_applications as application
    where application.student_id = caller_id
      and application.is_archived is false
    order by
      application.is_primary desc nulls last,
      application.last_changed_at desc nulls last,
      application.id desc
    limit 101
  ) as bounded_applications;

  if bounded_application_count > 100 then
    raise exception using
      errcode = 'P0001',
      message = 'University applications are temporarily unavailable.';
  end if;

  return query
  select
    application.id as application_id,
    application.university_name,
    application.programme_name,
    application.country_code,
    application.degree_level,
    application.intake_term,
    application.intake_year::integer,
    application.current_status,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.last_changed_at
  from public.student_university_applications as application
  where application.student_id = caller_id
    and application.is_archived is false
  order by
    application.is_primary desc nulls last,
    application.last_changed_at desc nulls last,
    application.id desc
  limit 100;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'University applications are temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'University applications are temporarily unavailable.';
end;
$function$;

alter function public.get_my_university_applications()
  owner to postgres;

comment on function public.get_my_university_applications() is
  'Returns at most 100 safe nonarchived university application summaries for the current active verified student; no identity argument, private counselor data, or event history is exposed.';

revoke all on function public.get_my_university_applications()
  from public, anon, authenticated;

grant execute on function public.get_my_university_applications()
  to authenticated;

-- E1.1 table RLS, table grants, counselor policies, mutation RPCs, enums, and
-- official counseling progression remain unchanged. Students receive no
-- direct table policy or table grant through this migration.

commit;

-- >>> supabase/migrations/202608010001_university_application_documents_foundation.sql
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

-- >>> supabase/migrations/202608020001_counselor_application_workspace_read_foundation.sql
-- K-GEO Phase E1.4.1 counselor applications workspace read foundation.
-- Review this migration before applying it. Apply it only after
-- 202608010001_university_application_documents_foundation.sql.
--
-- This migration is additive and read-only. It creates two bounded counselor
-- RPCs and changes no table, row, enum, index, trigger, policy, or application
-- mutation contract.

begin;

-- SECURITY: this is the only cross-student list boundary for the future
-- counselor applications workspace. It derives the caller from auth.uid(),
-- reauthorizes an active verified counselor, uses static allowlisted filters
-- and ordering, and returns only approved student/application identity plus an
-- aggregate available-document count.
create function public.list_counselor_university_application_workspace(
  p_search text default null,
  p_status text default null,
  p_country_code text default null,
  p_degree_level text default null,
  p_intake_term text default null,
  p_intake_year integer default null,
  p_primary_filter text default 'all',
  p_archive_filter text default 'active',
  p_deadline_filter text default 'all',
  p_sort text default 'last_changed_desc',
  p_page integer default 1,
  p_page_size integer default 20
)
returns table (
  application_id uuid,
  student_id uuid,
  student_full_name text,
  college_email text,
  roll_number text,
  university_name text,
  programme_name text,
  country_code text,
  degree_level public.university_application_degree_level,
  intake_term public.university_application_intake_term,
  intake_year integer,
  current_status public.university_application_status,
  application_reference text,
  submission_deadline date,
  submitted_at timestamptz,
  is_primary boolean,
  is_archived boolean,
  last_changed_at timestamptz,
  available_document_count bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  normalized_search text;
  normalized_status text;
  normalized_country_code text;
  normalized_degree_level text;
  normalized_intake_term text;
  normalized_primary_filter text;
  normalized_archive_filter text;
  normalized_deadline_filter text;
  normalized_sort text;
  business_date date;
  page_offset bigint;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Applications are temporarily unavailable.';
  end if;

  if p_search ~ '[[:cntrl:]]'
    or exists (
      select 1
      from pg_catalog.generate_series(128, 159) as codepoint(value)
      where pg_catalog.strpos(
        p_search,
        pg_catalog.chr(codepoint.value)
      ) > 0
    )
    or exists (
      select 1
      from pg_catalog.unnest(
        array[
          160, 173, 847, 1564, 5760, 6158,
          8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199,
          8200, 8201, 8202, 8203, 8204, 8205, 8206, 8207,
          8232, 8233, 8234, 8235, 8236, 8237, 8238, 8239,
          8287, 8288, 8289, 8290, 8291, 8292, 8293, 8294,
          8295, 8296, 8297, 8298, 8299, 8300, 8301, 8302,
          8303, 12288, 65279
        ]::integer[]
      ) as codepoint(value)
      where pg_catalog.strpos(
        p_search,
        pg_catalog.chr(codepoint.value)
      ) > 0
    ) then
    raise exception using
      errcode = '22023',
      message = 'Application filters are invalid.';
  end if;

  normalized_search := nullif(
    pg_catalog.translate(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(p_search),
        ' +',
        ' ',
        'g'
      ),
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      'abcdefghijklmnopqrstuvwxyz'
    ),
    ''
  );
  normalized_status := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_status)),
    ''
  );
  normalized_country_code := nullif(
    pg_catalog.upper(pg_catalog.btrim(p_country_code)),
    ''
  );
  normalized_degree_level := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_degree_level)),
    ''
  );
  normalized_intake_term := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_intake_term)),
    ''
  );
  normalized_primary_filter := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_primary_filter)), ''),
    'all'
  );
  normalized_archive_filter := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_archive_filter)), ''),
    'active'
  );
  normalized_deadline_filter := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_deadline_filter)), ''),
    'all'
  );
  normalized_sort := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_sort)), ''),
    'last_changed_desc'
  );

  if pg_catalog.char_length(normalized_search) > 100
    or (
      normalized_status is not null
      and normalized_status not in (
        'planning',
        'documents_collecting',
        'application_preparing',
        'ready_to_submit',
        'submitted',
        'under_university_review',
        'additional_information_requested',
        'decision_received',
        'withdrawn',
        'closed'
      )
    )
    or (
      normalized_country_code is not null
      and normalized_country_code !~ '^[A-Z]{2}$'
    )
    or (
      normalized_degree_level is not null
      and normalized_degree_level not in (
        'bachelors',
        'masters',
        'postgraduate_diploma',
        'doctorate',
        'other'
      )
    )
    or (
      normalized_intake_term is not null
      and normalized_intake_term not in (
        'spring',
        'summer',
        'fall',
        'winter',
        'rolling',
        'other'
      )
    )
    or (
      p_intake_year is not null
      and p_intake_year not between 2020 and 2100
    )
    or normalized_primary_filter not in (
      'all',
      'primary',
      'non_primary'
    )
    or normalized_archive_filter not in (
      'active',
      'archived',
      'all'
    )
    or normalized_deadline_filter not in (
      'all',
      'overdue',
      'due_30_days',
      'no_deadline'
    )
    or normalized_sort not in (
      'last_changed_desc',
      'deadline_asc',
      'deadline_desc',
      'student_name_asc',
      'university_name_asc',
      'intake_year_desc'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Application filters are invalid.';
  end if;

  if p_page is null
    or p_page not between 1 and 100000
    or p_page_size is null
    or p_page_size not between 1 and 25 then
    raise exception using
      errcode = '22023',
      message = 'The requested applications page is invalid.';
  end if;

  business_date := (
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
  )::date;
  page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  with available_document_counts as (
    select
      document.application_id,
      pg_catalog.count(*)::bigint as document_count
    from public.student_university_application_documents as document
    where document.status =
      'available'::public.university_application_document_status
    group by document.application_id
  ),
  workspace_base as (
    select
      application.id as workspace_application_id,
      application.student_id as workspace_student_id,
      student_account.full_name as workspace_student_full_name,
      student_account.college_email as workspace_college_email,
      student_profile.roll_number as workspace_roll_number,
      application.university_name as workspace_university_name,
      application.programme_name as workspace_programme_name,
      application.country_code as workspace_country_code,
      application.degree_level as workspace_degree_level,
      application.intake_term as workspace_intake_term,
      application.intake_year::integer as workspace_intake_year,
      application.current_status as workspace_current_status,
      application.application_reference as workspace_application_reference,
      application.submission_deadline as workspace_submission_deadline,
      application.submitted_at as workspace_submitted_at,
      application.is_primary as workspace_is_primary,
      application.is_archived as workspace_is_archived,
      application.last_changed_at as workspace_last_changed_at,
      coalesce(document_count.document_count, 0::bigint)
        as workspace_available_document_count,
      pg_catalog.translate(
        coalesce(
          nullif(pg_catalog.btrim(student_account.full_name), ''),
          student_account.college_email
        ),
        'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
        'abcdefghijklmnopqrstuvwxyz'
      ) collate pg_catalog."C" as workspace_student_sort_name
    from public.student_university_applications as application
    inner join public.profiles as student_account
      on student_account.id = application.student_id
      and student_account.role = 'student'::public.user_role
    left join public.student_profiles as student_profile
      on student_profile.student_id = student_account.id
    left join available_document_counts as document_count
      on document_count.application_id = application.id
  ),
  filtered_workspace as (
    select workspace.*
    from workspace_base as workspace
    where (
      normalized_search is null
      or pg_catalog.strpos(
        pg_catalog.translate(
          coalesce(workspace.workspace_student_full_name, ''),
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.translate(
          workspace.workspace_college_email,
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.translate(
          coalesce(workspace.workspace_roll_number, ''),
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.translate(
          workspace.workspace_university_name,
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.translate(
          workspace.workspace_programme_name,
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        ),
        normalized_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.translate(
          coalesce(workspace.workspace_application_reference, ''),
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        ),
        normalized_search
      ) > 0
    )
      and (
        normalized_status is null
        or workspace.workspace_current_status::text = normalized_status
      )
      and (
        normalized_country_code is null
        or workspace.workspace_country_code = normalized_country_code
      )
      and (
        normalized_degree_level is null
        or workspace.workspace_degree_level::text = normalized_degree_level
      )
      and (
        normalized_intake_term is null
        or workspace.workspace_intake_term::text = normalized_intake_term
      )
      and (
        p_intake_year is null
        or workspace.workspace_intake_year = p_intake_year
      )
      and (
        normalized_primary_filter = 'all'
        or (
          normalized_primary_filter = 'primary'
          and workspace.workspace_is_primary is true
        )
        or (
          normalized_primary_filter = 'non_primary'
          and workspace.workspace_is_primary is false
        )
      )
      and (
        normalized_archive_filter = 'all'
        or (
          normalized_archive_filter = 'active'
          and workspace.workspace_is_archived is false
        )
        or (
          normalized_archive_filter = 'archived'
          and workspace.workspace_is_archived is true
        )
      )
      and (
        normalized_deadline_filter = 'all'
        or (
          normalized_deadline_filter = 'overdue'
          and workspace.workspace_submission_deadline < business_date
        )
        or (
          normalized_deadline_filter = 'due_30_days'
          and workspace.workspace_submission_deadline between
            business_date and business_date + 30
        )
        or (
          normalized_deadline_filter = 'no_deadline'
          and workspace.workspace_submission_deadline is null
        )
      )
  ),
  filtered_total as (
    select pg_catalog.count(*)::bigint as filtered_count
    from filtered_workspace
  ),
  page_rows as (
    select
      workspace.*,
      pg_catalog.row_number() over (
        order by
          case when normalized_sort = 'last_changed_desc' then
            workspace.workspace_last_changed_at
          end desc,
          case
            when normalized_sort in ('deadline_asc', 'deadline_desc')
              and workspace.workspace_submission_deadline is null then 1
            when normalized_sort in ('deadline_asc', 'deadline_desc') then 0
          end asc,
          case when normalized_sort = 'deadline_asc' then
            workspace.workspace_submission_deadline
          end asc,
          case when normalized_sort = 'deadline_desc' then
            workspace.workspace_submission_deadline
          end desc,
          case when normalized_sort = 'student_name_asc' then
            workspace.workspace_student_sort_name collate pg_catalog."C"
          end asc,
          case when normalized_sort = 'university_name_asc' then
            pg_catalog.translate(
              workspace.workspace_university_name,
              'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
              'abcdefghijklmnopqrstuvwxyz'
            )
              collate pg_catalog."C"
          end asc,
          case when normalized_sort = 'intake_year_desc' then
            workspace.workspace_intake_year
          end desc,
          case when normalized_sort in (
            'last_changed_desc',
            'deadline_desc',
            'intake_year_desc'
          ) then workspace.workspace_application_id end desc,
          case when normalized_sort in (
            'deadline_asc',
            'student_name_asc',
            'university_name_asc'
          ) then workspace.workspace_application_id end asc
      ) as result_position
    from filtered_workspace as workspace
    order by
      case when normalized_sort = 'last_changed_desc' then
        workspace.workspace_last_changed_at
      end desc,
      case
        when normalized_sort in ('deadline_asc', 'deadline_desc')
          and workspace.workspace_submission_deadline is null then 1
        when normalized_sort in ('deadline_asc', 'deadline_desc') then 0
      end asc,
      case when normalized_sort = 'deadline_asc' then
        workspace.workspace_submission_deadline
      end asc,
      case when normalized_sort = 'deadline_desc' then
        workspace.workspace_submission_deadline
      end desc,
      case when normalized_sort = 'student_name_asc' then
        workspace.workspace_student_sort_name collate pg_catalog."C"
      end asc,
      case when normalized_sort = 'university_name_asc' then
        pg_catalog.translate(
          workspace.workspace_university_name,
          'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
          'abcdefghijklmnopqrstuvwxyz'
        )
          collate pg_catalog."C"
      end asc,
      case when normalized_sort = 'intake_year_desc' then
        workspace.workspace_intake_year
      end desc,
      case when normalized_sort in (
        'last_changed_desc',
        'deadline_desc',
        'intake_year_desc'
      ) then workspace.workspace_application_id end desc,
      case when normalized_sort in (
        'deadline_asc',
        'student_name_asc',
        'university_name_asc'
      ) then workspace.workspace_application_id end asc
    limit p_page_size
    offset page_offset
  )
  select
    page_row.workspace_application_id,
    page_row.workspace_student_id,
    page_row.workspace_student_full_name,
    page_row.workspace_college_email,
    page_row.workspace_roll_number,
    page_row.workspace_university_name,
    page_row.workspace_programme_name,
    page_row.workspace_country_code,
    page_row.workspace_degree_level,
    page_row.workspace_intake_term,
    page_row.workspace_intake_year,
    page_row.workspace_current_status,
    page_row.workspace_application_reference,
    page_row.workspace_submission_deadline,
    page_row.workspace_submitted_at,
    page_row.workspace_is_primary,
    page_row.workspace_is_archived,
    page_row.workspace_last_changed_at,
    page_row.workspace_available_document_count,
    filtered_total.filtered_count
  from filtered_total
  left join page_rows as page_row
    on true
  order by page_row.result_position asc nulls last;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Applications are temporarily unavailable.';
  when invalid_parameter_value then
    raise;
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Applications are temporarily unavailable.';
end;
$function$;

alter function public.list_counselor_university_application_workspace(
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  integer,
  integer
) owner to postgres;

comment on function public.list_counselor_university_application_workspace(
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text,
  integer,
  integer
) is
  'Returns one bounded privacy-minimized cross-student application page to an active verified counselor. An empty or out-of-range page returns one sentinel row with only total_count populated.';

revoke all on function
  public.list_counselor_university_application_workspace(
    text,
    text,
    text,
    text,
    text,
    integer,
    text,
    text,
    text,
    text,
    integer,
    integer
  ) from public, anon, authenticated;

grant execute on function
  public.list_counselor_university_application_workspace(
    text,
    text,
    text,
    text,
    text,
    integer,
    text,
    text,
    text,
    text,
    integer,
    integer
  ) to authenticated;

-- SECURITY: metrics use the same caller-derived counselor authorization as the
-- list contract and return one aggregate-only row. Operational status and
-- deadline metrics exclude archived applications; no identifier is returned.
create function public.get_counselor_university_application_workspace_metrics()
returns table (
  total_active_applications bigint,
  total_archived_applications bigint,
  students_with_applications bigint,
  primary_applications bigint,
  planning_count bigint,
  documents_collecting_count bigint,
  application_preparing_count bigint,
  ready_to_submit_count bigint,
  submitted_count bigint,
  under_university_review_count bigint,
  additional_information_requested_count bigint,
  decision_received_count bigint,
  withdrawn_count bigint,
  closed_count bigint,
  overdue_deadline_count bigint,
  due_next_30_days_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  business_date date;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Applications are temporarily unavailable.';
  end if;

  business_date := (
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
  )::date;

  return query
  with eligible_applications as (
    select application.*
    from public.student_university_applications as application
    inner join public.profiles as student_account
      on student_account.id = application.student_id
      and student_account.role = 'student'::public.user_role
  )
  select
    pg_catalog.count(*) filter (
      where application.is_archived is false
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is true
    )::bigint,
    pg_catalog.count(distinct application.student_id) filter (
      where application.is_archived is false
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.is_primary is true
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'planning'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'documents_collecting'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'application_preparing'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'ready_to_submit'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'submitted'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'under_university_review'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'additional_information_requested'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'decision_received'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'withdrawn'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.current_status =
          'closed'::public.university_application_status
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.submission_deadline < business_date
    )::bigint,
    pg_catalog.count(*) filter (
      where application.is_archived is false
        and application.submission_deadline between
          business_date and business_date + 30
    )::bigint
  from eligible_applications as application;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Applications are temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Applications are temporarily unavailable.';
end;
$function$;

alter function
  public.get_counselor_university_application_workspace_metrics()
  owner to postgres;

comment on function
  public.get_counselor_university_application_workspace_metrics() is
  'Returns one aggregate-only applications workspace metric row to an active verified counselor. Operational status and Asia/Kolkata deadline counts exclude archived applications.';

revoke all on function
  public.get_counselor_university_application_workspace_metrics()
  from public, anon, authenticated;

grant execute on function
  public.get_counselor_university_application_workspace_metrics()
  to authenticated;

commit;

-- >>> supabase/migrations/202608060001_director_dashboard_read_foundation.sql
-- K-GEO Phase A1.1 director dashboard read foundation.
-- Review this migration before applying it. Apply it only after
-- 202608020001_counselor_application_workspace_read_foundation.sql.
--
-- This migration is additive and read-only. It creates three director-only
-- RPCs and changes no table, row, enum, index, trigger, policy, or mutation.

begin;

create function public.get_director_dashboard_metrics()
returns table (
  total_students bigint,
  active_students bigint,
  active_counselors bigint,
  consultations_today bigint,
  upcoming_scheduled_consultations bigint,
  unresolved_past_consultations bigint,
  completed_consultations bigint,
  no_show_consultations bigint,
  pending_follow_ups bigint,
  overdue_follow_ups bigint,
  due_today_follow_ups bigint,
  active_progressions bigint,
  on_hold_progressions bigint,
  completed_progressions bigint,
  active_applications bigint,
  submitted_applications bigint,
  additional_information_requested_applications bigint,
  overdue_application_deadlines bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  business_date date;
  business_time time without time zone;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Director dashboard data is temporarily unavailable.';
  end if;

  business_date := (
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
  )::date;
  business_time := (
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
  )::time;

  return query
  select
    (select pg_catalog.count(*)::bigint
     from public.profiles as profile
     where profile.role = 'student'::public.user_role),
    (select pg_catalog.count(*)::bigint
     from public.profiles as profile
     where profile.role = 'student'::public.user_role
       and profile.is_active is true),
    (select pg_catalog.count(*)::bigint
     from public.profiles as profile
     inner join auth.users as auth_user on auth_user.id = profile.id
     where profile.role = 'counselor'::public.user_role
       and profile.is_active is true
       and auth_user.email_confirmed_at is not null),
    (select pg_catalog.count(*)::bigint
     from public.consultation_requests as request
     where request.consultation_date = business_date
       and request.status <> 'cancelled'::public.consultation_status),
    (select pg_catalog.count(*)::bigint
     from public.consultation_requests as request
     where request.status = 'scheduled'::public.consultation_status
       and request.consultation_date is not null
       and request.slot_start is not null
       and (
         request.consultation_date > business_date
         or (
           request.consultation_date = business_date
           and request.slot_start > business_time
         )
       )),
    (select pg_catalog.count(*)::bigint
     from public.consultation_requests as request
     where request.status = 'scheduled'::public.consultation_status
       and request.consultation_date is not null
       and request.slot_end is not null
       and (
         request.consultation_date < business_date
         or (
           request.consultation_date = business_date
           and request.slot_end <= business_time
         )
       )),
    (select pg_catalog.count(*)::bigint
     from public.consultation_requests as request
     where request.status = 'completed'::public.consultation_status),
    (select pg_catalog.count(*)::bigint
     from public.consultation_requests as request
     where request.status = 'no_show'::public.consultation_status),
    (select pg_catalog.count(*)::bigint
     from public.counselor_follow_ups as follow_up
     where follow_up.status = 'pending'::public.counselor_follow_up_status),
    (select pg_catalog.count(*)::bigint
     from public.counselor_follow_ups as follow_up
     where follow_up.status = 'pending'::public.counselor_follow_up_status
       and follow_up.due_date < business_date),
    (select pg_catalog.count(*)::bigint
     from public.counselor_follow_ups as follow_up
     where follow_up.status = 'pending'::public.counselor_follow_up_status
       and follow_up.due_date = business_date),
    (select pg_catalog.count(*)::bigint
     from public.student_counseling_progressions as progression
     where progression.workflow_state = 'active'::public.counseling_progression_state),
    (select pg_catalog.count(*)::bigint
     from public.student_counseling_progressions as progression
     where progression.workflow_state = 'on_hold'::public.counseling_progression_state),
    (select pg_catalog.count(*)::bigint
     from public.student_counseling_progressions as progression
     where progression.workflow_state = 'completed'::public.counseling_progression_state),
    (select pg_catalog.count(*)::bigint
     from public.student_university_applications as application
     where application.is_archived is false),
    (select pg_catalog.count(*)::bigint
     from public.student_university_applications as application
     where application.is_archived is false
       and application.current_status = 'submitted'::public.university_application_status),
    (select pg_catalog.count(*)::bigint
     from public.student_university_applications as application
     where application.is_archived is false
       and application.current_status =
         'additional_information_requested'::public.university_application_status),
    (select pg_catalog.count(*)::bigint
     from public.student_university_applications as application
     where application.is_archived is false
       and application.submission_deadline < business_date);
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Director dashboard data is temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Director dashboard data is temporarily unavailable.';
end;
$function$;

alter function public.get_director_dashboard_metrics() owner to postgres;

comment on function public.get_director_dashboard_metrics() is
  'Returns one aggregate-only current-state dashboard row to an active verified director.';

create function public.list_director_counselor_workload(
  p_limit integer default 20
)
returns table (
  counselor_id uuid,
  counselor_full_name text,
  college_email text,
  is_active boolean,
  overdue_follow_ups bigint,
  pending_follow_ups bigint,
  pending_outcomes bigint,
  consultations_today bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  business_date date;
  business_time time without time zone;
begin
  caller_id := (select auth.uid());
  if caller_id is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Director dashboard data is temporarily unavailable.';
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode = '22023',
      message = 'Director dashboard filters are invalid.';
  end if;
  business_date := (pg_catalog.statement_timestamp()
    at time zone 'Asia/Kolkata')::date;
  business_time := (pg_catalog.statement_timestamp()
    at time zone 'Asia/Kolkata')::time;

  return query
  with follow_up_counts as (
    select
      follow_up.counselor_id,
      pg_catalog.count(*) filter (
        where follow_up.status = 'pending'::public.counselor_follow_up_status
      )::bigint as pending_count,
      pg_catalog.count(*) filter (
        where follow_up.status = 'pending'::public.counselor_follow_up_status
          and follow_up.due_date < business_date
      )::bigint as overdue_count
    from public.counselor_follow_ups as follow_up
    group by follow_up.counselor_id
  ),
  consultation_counts as (
    select
      request.assigned_counselor_id as counselor_id,
      pg_catalog.count(*) filter (
        where request.status = 'scheduled'::public.consultation_status
          and request.consultation_date is not null
          and request.slot_end is not null
          and (
            request.consultation_date < business_date
            or (request.consultation_date = business_date
              and request.slot_end <= business_time)
          )
      )::bigint as pending_outcome_count,
      pg_catalog.count(*) filter (
        where request.consultation_date = business_date
          and request.status <> 'cancelled'::public.consultation_status
      )::bigint as today_count
    from public.consultation_requests as request
    where request.assigned_counselor_id is not null
    group by request.assigned_counselor_id
  )
  select
    counselor.id,
    counselor.full_name,
    counselor.college_email,
    counselor.is_active,
    coalesce(follow_up.overdue_count, 0::bigint),
    coalesce(follow_up.pending_count, 0::bigint),
    coalesce(consultation.pending_outcome_count, 0::bigint),
    coalesce(consultation.today_count, 0::bigint)
  from public.profiles as counselor
  left join follow_up_counts as follow_up
    on follow_up.counselor_id = counselor.id
  left join consultation_counts as consultation
    on consultation.counselor_id = counselor.id
  where counselor.role = 'counselor'::public.user_role
  order by coalesce(follow_up.overdue_count, 0::bigint) desc,
    coalesce(consultation.pending_outcome_count, 0::bigint) desc,
    coalesce(consultation.today_count, 0::bigint) desc,
    counselor.full_name collate pg_catalog."C" asc nulls last,
    counselor.id asc
  limit p_limit;
exception
  when insufficient_privilege then
    raise exception using errcode = '42501',
      message = 'Director dashboard data is temporarily unavailable.';
  when others then
    raise exception using errcode = 'P0001',
      message = 'Director dashboard data is temporarily unavailable.';
end;
$function$;

alter function public.list_director_counselor_workload(integer)
  owner to postgres;

comment on function public.list_director_counselor_workload(integer) is
  'Returns a bounded counselor workload summary, including inactive counselor profiles with retained work, to an active verified director.';

create function public.list_director_attention_items(
  p_limit integer default 25
)
returns table (
  attention_kind text,
  severity text,
  student_id uuid,
  student_full_name text,
  college_email text,
  application_id uuid,
  consultation_id uuid,
  application_status public.university_application_status,
  submission_deadline date,
  consultation_scheduled_at timestamp without time zone
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  business_date date;
  business_time time without time zone;
begin
  caller_id := (select auth.uid());
  if caller_id is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Director dashboard data is temporarily unavailable.';
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception using errcode = '22023',
      message = 'Director dashboard filters are invalid.';
  end if;
  business_date := (pg_catalog.statement_timestamp()
    at time zone 'Asia/Kolkata')::date;
  business_time := (pg_catalog.statement_timestamp()
    at time zone 'Asia/Kolkata')::time;

  return query
  with attention as (
    select
      'additional_information_requested'::text as item_kind,
      'high'::text as item_severity,
      student.id as item_student_id,
      student.full_name as item_student_full_name,
      student.college_email as item_college_email,
      application.id as item_application_id,
      null::uuid as item_consultation_id,
      application.current_status as item_application_status,
      application.submission_deadline as item_submission_deadline,
      null::timestamp without time zone as item_consultation_scheduled_at,
      application.last_changed_at as item_sort_time
    from public.student_university_applications as application
    inner join public.profiles as student
      on student.id = application.student_id
      and student.role = 'student'::public.user_role
    where application.is_archived is false
      and application.current_status =
        'additional_information_requested'::public.university_application_status

    union all

    select
      'overdue_application_deadline'::text,
      'high'::text,
      student.id,
      student.full_name,
      student.college_email,
      application.id,
      null::uuid,
      application.current_status,
      application.submission_deadline,
      null::timestamp without time zone,
      application.submission_deadline::timestamp
    from public.student_university_applications as application
    inner join public.profiles as student
      on student.id = application.student_id
      and student.role = 'student'::public.user_role
    where application.is_archived is false
      and application.submission_deadline < business_date

    union all

    select
      'due_soon_application_deadline'::text,
      'medium'::text,
      student.id,
      student.full_name,
      student.college_email,
      application.id,
      null::uuid,
      application.current_status,
      application.submission_deadline,
      null::timestamp without time zone,
      application.submission_deadline::timestamp
    from public.student_university_applications as application
    inner join public.profiles as student
      on student.id = application.student_id
      and student.role = 'student'::public.user_role
    where application.is_archived is false
      and application.submission_deadline between business_date
        and business_date + 30

    union all

    select
      'pending_consultation_outcome'::text,
      'medium'::text,
      student.id,
      student.full_name,
      student.college_email,
      null::uuid,
      request.id,
      null::public.university_application_status,
      null::date,
      request.consultation_date + request.slot_start,
      (request.consultation_date + request.slot_end)::timestamp
    from public.consultation_requests as request
    inner join public.profiles as student
      on student.id = request.student_id
      and student.role = 'student'::public.user_role
    where request.status = 'scheduled'::public.consultation_status
      and request.consultation_date is not null
      and request.slot_start is not null
      and request.slot_end is not null
      and (
        request.consultation_date < business_date
        or (request.consultation_date = business_date
          and request.slot_end <= business_time)
      )
  )
  select
    attention.item_kind,
    attention.item_severity,
    attention.item_student_id,
    attention.item_student_full_name,
    attention.item_college_email,
    attention.item_application_id,
    attention.item_consultation_id,
    attention.item_application_status,
    attention.item_submission_deadline,
    attention.item_consultation_scheduled_at
  from attention
  order by case attention.item_severity when 'high' then 1 else 2 end,
    attention.item_sort_time asc,
    attention.item_kind collate pg_catalog."C" asc,
    attention.item_application_id asc nulls last,
    attention.item_consultation_id asc nulls last
  limit p_limit;
exception
  when insufficient_privilege then
    raise exception using errcode = '42501',
      message = 'Director dashboard data is temporarily unavailable.';
  when others then
    raise exception using errcode = 'P0001',
      message = 'Director dashboard data is temporarily unavailable.';
end;
$function$;

alter function public.list_director_attention_items(integer)
  owner to postgres;

comment on function public.list_director_attention_items(integer) is
  'Returns a bounded current-state application and pending-consultation attention list to an active verified director; no follow-up row is exposed.';

revoke all on function public.get_director_dashboard_metrics()
  from public, anon, authenticated;
revoke all on function public.list_director_counselor_workload(integer)
  from public, anon, authenticated;
revoke all on function public.list_director_attention_items(integer)
  from public, anon, authenticated;

grant execute on function public.get_director_dashboard_metrics()
  to authenticated;
grant execute on function public.list_director_counselor_workload(integer)
  to authenticated;
grant execute on function public.list_director_attention_items(integer)
  to authenticated;

commit;

-- >>> supabase/migrations/202608060002_director_identity_bootstrap_support.sql
-- K-GEO Phase A1.1.1 director identity bootstrap support.
-- Review this migration before applying it. Apply it only after
-- 202608060001_director_dashboard_read_foundation.sql.
--
-- Public signup remains student-only and exact-@kct.ac.in. A Director profile
-- can be created only when trusted Auth app metadata contains the exact
-- kgeo_bootstrap_role=director marker.

begin;

alter table public.profiles
  drop constraint profiles_college_email_check,
  add constraint profiles_college_email_check
    check (
      college_email = pg_catalog.lower(pg_catalog.btrim(college_email))
      and pg_catalog.char_length(college_email) between 3 and 254
      and pg_catalog.char_length(
        pg_catalog.split_part(college_email, '@', 1)
      ) between 1 and 64
      and college_email ~
        '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
      and (
        role = 'director'::public.user_role
        or (
          role <> 'director'::public.user_role
          and college_email ~ '^[^@[:space:]]+@kct[.]ac[.]in$'
        )
      )
    );

comment on constraint profiles_college_email_check on public.profiles is
  'Requires normalized valid email; students, counselors, and admins remain exact-@kct.ac.in while Directors may use any valid email domain.';

comment on column public.profiles.college_email is
  'Normalized lowercase Auth email; its accepted domain is constrained by the profile role.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_email text;
  normalized_full_name text;
  has_bootstrap_marker boolean;
  bootstrap_role text;
begin
  normalized_email := pg_catalog.lower(pg_catalog.btrim(new.email));
  has_bootstrap_marker := coalesce(
    new.raw_app_meta_data,
    '{}'::jsonb
  ) ? 'kgeo_bootstrap_role';
  bootstrap_role := coalesce(
    new.raw_app_meta_data,
    '{}'::jsonb
  ) ->> 'kgeo_bootstrap_role';

  if normalized_email is null
    or pg_catalog.char_length(normalized_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(normalized_email, '@', 1)
    ) not between 1 and 64
    or normalized_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid email address';
  end if;

  if has_bootstrap_marker then
    if pg_catalog.jsonb_typeof(
      new.raw_app_meta_data -> 'kgeo_bootstrap_role'
    ) <> 'string'
      or bootstrap_role <> 'director' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO trusted identity bootstrap is invalid';
    end if;

    insert into public.profiles (
      id,
      college_email,
      role,
      full_name,
      is_active
    )
    values (
      new.id,
      normalized_email,
      'director'::public.user_role,
      null,
      true
    );

    return new;
  end if;

  if normalized_email is null
    or normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid @kct.ac.in email address';
  end if;

  if not (
    coalesce(new.raw_user_meta_data, '{}'::jsonb) ? 'full_name'
  )
    or pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'full_name')
      <> 'string' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  normalized_full_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(normalized_full_name) not between 1 and 150 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  insert into public.profiles (
    id,
    college_email,
    role,
    full_name,
    is_active
  )
  values (
    new.id,
    normalized_email,
    'student'::public.user_role,
    normalized_full_name,
    true
  );

  return new;
end;
$function$;

alter function public.handle_new_user() owner to postgres;

comment on function public.handle_new_user() is
  'Creates an exact-@kct.ac.in student or a trusted app-metadata-marked Director profile; user metadata never assigns a role.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

commit;

-- >>> supabase/migrations/202608060003_staff_identity_provisioning.sql
-- K-GEO Phase A1.1.2 secure one-time staff identity provisioning.
-- Review this migration before applying it. Apply it only after
-- 202608060002_director_identity_bootstrap_support.sql.
--
-- Public registration remains exact-@kct.ac.in and student-only. Counselor
-- and Director roles come only from a locked private server-prepared request;
-- raw Auth metadata transports only the high-entropy one-time token.

begin;

create schema if not exists private authorization postgres;

revoke all on schema private from public, anon, authenticated, service_role;

create table private.kgeo_staff_provisioning_requests (
  normalized_email text primary key,
  approved_role public.user_role not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint kgeo_staff_provisioning_requests_role_check
    check (
      approved_role in (
        'counselor'::public.user_role,
        'director'::public.user_role
      )
    ),
  constraint kgeo_staff_provisioning_requests_email_check
    check (
      normalized_email = pg_catalog.lower(
        pg_catalog.btrim(normalized_email)
      )
      and pg_catalog.char_length(normalized_email) between 3 and 254
      and pg_catalog.char_length(
        pg_catalog.split_part(normalized_email, '@', 1)
      ) between 1 and 64
      and normalized_email ~
        '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
      and (
        approved_role = 'director'::public.user_role
        or (
          approved_role = 'counselor'::public.user_role
          and normalized_email ~ '^[^@[:space:]]+@kct[.]ac[.]in$'
        )
      )
    ),
  constraint kgeo_staff_provisioning_requests_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint kgeo_staff_provisioning_requests_expiry_check
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '15 minutes'
    ),
  constraint kgeo_staff_provisioning_requests_consumed_check
    check (consumed_at is null or consumed_at >= created_at)
);

alter table private.kgeo_staff_provisioning_requests owner to postgres;
alter table private.kgeo_staff_provisioning_requests enable row level security;

revoke all on table private.kgeo_staff_provisioning_requests
  from public, anon, authenticated, service_role;

comment on table private.kgeo_staff_provisioning_requests is
  'Private short-lived one-time counselor/Director provisioning requests; stores only an approved role and SHA-256 token hash, never the raw token.';

comment on column private.kgeo_staff_provisioning_requests.approved_role is
  'Server-approved staff role; constrained to counselor or director.';

comment on column private.kgeo_staff_provisioning_requests.token_hash is
  'Unique lowercase hexadecimal SHA-256 hash of the temporary high-entropy token.';

create or replace function public.prepare_staff_identity_provisioning(
  p_email text,
  p_role public.user_role,
  p_token_hash text,
  p_expires_at timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  request_time timestamptz := pg_catalog.statement_timestamp();
  affected_rows bigint;
begin
  if p_email is null
    or p_email <> pg_catalog.lower(pg_catalog.btrim(p_email))
    or pg_catalog.char_length(p_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(p_email, '@', 1)
    ) not between 1 and 64
    or p_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO staff provisioning request is invalid';
  end if;

  if p_role is null
    or p_role not in (
      'counselor'::public.user_role,
      'director'::public.user_role
    ) then
    raise exception using
      errcode = '23514',
      message = 'K-GEO staff provisioning request is invalid';
  end if;

  if p_role = 'counselor'::public.user_role
    and p_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO staff provisioning request is invalid';
  end if;

  if p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO staff provisioning request is invalid';
  end if;

  if p_expires_at is null
    or p_expires_at <= request_time
    or p_expires_at > request_time + interval '15 minutes' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO staff provisioning request is invalid';
  end if;

  insert into private.kgeo_staff_provisioning_requests (
    normalized_email,
    approved_role,
    token_hash,
    expires_at,
    consumed_at,
    created_at
  )
  values (
    p_email,
    p_role,
    p_token_hash,
    p_expires_at,
    null,
    request_time
  )
  on conflict (normalized_email) do update
    set approved_role = excluded.approved_role,
        token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        consumed_at = null,
        created_at = excluded.created_at
    where private.kgeo_staff_provisioning_requests.consumed_at is not null
       or private.kgeo_staff_provisioning_requests.expires_at <= request_time;

  get diagnostics affected_rows = row_count;

  if affected_rows <> 1 then
    raise exception using
      errcode = '23505',
      message = 'K-GEO staff provisioning request is already active';
  end if;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'K-GEO staff provisioning request conflicts with an active request';
end;
$function$;

alter function public.prepare_staff_identity_provisioning(
  text,
  public.user_role,
  text,
  timestamptz
) owner to postgres;

comment on function public.prepare_staff_identity_provisioning(
  text,
  public.user_role,
  text,
  timestamptz
) is
  'Registers one private short-lived counselor/Director token hash; callable only by service_role and returns no secret.';

revoke all on function public.prepare_staff_identity_provisioning(
  text,
  public.user_role,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.prepare_staff_identity_provisioning(
  text,
  public.user_role,
  text,
  timestamptz
) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_email text;
  normalized_full_name text;
  provisioning_token text;
  provisioning_token_hash text;
  approved_staff_role public.user_role;
  request_time timestamptz := pg_catalog.statement_timestamp();
  affected_rows bigint;
begin
  normalized_email := pg_catalog.lower(pg_catalog.btrim(new.email));

  if normalized_email is null
    or pg_catalog.char_length(normalized_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(normalized_email, '@', 1)
    ) not between 1 and 64
    or normalized_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid email address';
  end if;

  if coalesce(new.raw_user_meta_data, '{}'::jsonb)
    ? 'kgeo_staff_provisioning_token' then
    if pg_catalog.jsonb_typeof(
      new.raw_user_meta_data -> 'kgeo_staff_provisioning_token'
    ) <> 'string' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    provisioning_token :=
      new.raw_user_meta_data ->> 'kgeo_staff_provisioning_token';

    if provisioning_token !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    provisioning_token_hash := pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(provisioning_token, 'UTF8')
      ),
      'hex'
    );

    select request.approved_role
    into approved_staff_role
    from private.kgeo_staff_provisioning_requests as request
    where request.normalized_email = normalized_email
      and request.token_hash = provisioning_token_hash
      and request.consumed_at is null
      and request.expires_at > request_time
    for update;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    if approved_staff_role not in (
      'counselor'::public.user_role,
      'director'::public.user_role
    )
      or (
        approved_staff_role = 'counselor'::public.user_role
        and normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$'
      ) then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    update private.kgeo_staff_provisioning_requests as request
    set consumed_at = request_time
    where request.normalized_email = normalized_email
      and request.approved_role = approved_staff_role
      and request.token_hash = provisioning_token_hash
      and request.consumed_at is null
      and request.expires_at > request_time;

    get diagnostics affected_rows = row_count;

    if affected_rows <> 1 then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    insert into public.profiles (
      id,
      college_email,
      role,
      full_name,
      is_active
    )
    values (
      new.id,
      normalized_email,
      approved_staff_role,
      null,
      true
    );

    return new;
  end if;

  if normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid @kct.ac.in email address';
  end if;

  if not (
    coalesce(new.raw_user_meta_data, '{}'::jsonb) ? 'full_name'
  )
    or pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'full_name')
      <> 'string' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  normalized_full_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(normalized_full_name) not between 1 and 150 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  insert into public.profiles (
    id,
    college_email,
    role,
    full_name,
    is_active
  )
  values (
    new.id,
    normalized_email,
    'student'::public.user_role,
    normalized_full_name,
    true
  );

  return new;
end;
$function$;

alter function public.handle_new_user() owner to postgres;

comment on function public.handle_new_user() is
  'Creates an exact-@kct.ac.in student or consumes a matching private request to create its approved counselor/Director role; metadata roles never authorize.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

commit;

-- >>> supabase/migrations/202608070001_staff_provisioning_trigger_ambiguity_fix.sql
-- Phase A1.1.2 hotfix: remove PL/pgSQL identifier ambiguity from the
-- one-time staff provisioning branch without changing its authorization model.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_normalized_email text;
  v_normalized_full_name text;
  v_provisioning_token text;
  v_token_hash text;
  v_approved_role public.user_role;
  v_request_time timestamptz := pg_catalog.statement_timestamp();
  v_affected_rows bigint;
begin
  v_normalized_email := pg_catalog.lower(pg_catalog.btrim(new.email));

  if v_normalized_email is null
    or pg_catalog.char_length(v_normalized_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(v_normalized_email, '@', 1)
    ) not between 1 and 64
    or v_normalized_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid email address';
  end if;

  if coalesce(new.raw_user_meta_data, '{}'::jsonb)
    ? 'kgeo_staff_provisioning_token' then
    if pg_catalog.jsonb_typeof(
      new.raw_user_meta_data -> 'kgeo_staff_provisioning_token'
    ) <> 'string' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    v_provisioning_token :=
      new.raw_user_meta_data ->> 'kgeo_staff_provisioning_token';

    if v_provisioning_token !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    v_token_hash := pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(v_provisioning_token, 'UTF8')
      ),
      'hex'
    );

    select request.approved_role
    into v_approved_role
    from private.kgeo_staff_provisioning_requests as request
    where request.normalized_email = v_normalized_email
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time
    for update;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    if v_approved_role not in (
      'counselor'::public.user_role,
      'director'::public.user_role
    )
      or (
        v_approved_role = 'counselor'::public.user_role
        and v_normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$'
      ) then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    update private.kgeo_staff_provisioning_requests as request
    set consumed_at = v_request_time
    where request.normalized_email = v_normalized_email
      and request.approved_role = v_approved_role
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    insert into public.profiles (
      id,
      college_email,
      role,
      full_name,
      is_active
    )
    values (
      new.id,
      v_normalized_email,
      v_approved_role,
      null,
      true
    );

    return new;
  end if;

  if v_normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid @kct.ac.in email address';
  end if;

  if not (
    coalesce(new.raw_user_meta_data, '{}'::jsonb) ? 'full_name'
  )
    or pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'full_name')
      <> 'string' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  v_normalized_full_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(v_normalized_full_name) not between 1 and 150 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  insert into public.profiles (
    id,
    college_email,
    role,
    full_name,
    is_active
  )
  values (
    new.id,
    v_normalized_email,
    'student'::public.user_role,
    v_normalized_full_name,
    true
  );

  return new;
end;
$function$;

alter function public.handle_new_user() owner to postgres;

comment on function public.handle_new_user() is
  'Creates an exact-@kct.ac.in student or consumes a matching private request to create its approved counselor/Director role; metadata roles never authorize.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

commit;

-- >>> supabase/migrations/202608090001_director_operational_oversight_foundation.sql
-- K-GEO Phase A1.3 Director operational oversight foundation.
-- This migration adds three bounded, read-only Director RPCs. It does not
-- change table grants, RLS policies, workflow mutations, or historical data.

begin;

create function public.list_director_student_oversight(
  p_search text default null,
  p_is_active boolean default null,
  p_progression_state text default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  student_id uuid,
  full_name text,
  college_email text,
  is_active boolean,
  account_created_at timestamptz,
  course text,
  department text,
  graduation_year integer,
  profile_state public.student_directory_profile_state,
  progression_stage public.counseling_progression_stage,
  progression_state public.counseling_progression_state,
  total_consultations bigint,
  open_consultations bigint,
  active_applications bigint,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_search text;
  v_progression_state text;
  v_page_offset bigint;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Director oversight data is temporarily unavailable.';
  end if;

  v_search := nullif(pg_catalog.lower(pg_catalog.btrim(p_search)), '');
  v_progression_state := nullif(
    pg_catalog.lower(pg_catalog.btrim(p_progression_state)),
    ''
  );

  if pg_catalog.char_length(v_search) > 100
    or v_search ~ '[[:cntrl:]]'
    or v_progression_state not in (
      'not_started',
      'active',
      'on_hold',
      'completed'
    )
    or p_page is null
    or p_page not between 1 and 100000
    or p_page_size is null
    or p_page_size not between 1 and 50 then
    raise exception using
      errcode = '22023',
      message = 'Director oversight filters are invalid.';
  end if;

  v_page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  with consultation_counts as (
    select
      request.student_id,
      pg_catalog.count(*)::bigint as total_consultations,
      pg_catalog.count(*) filter (
        where request.status not in (
          'completed'::public.consultation_status,
          'no_show'::public.consultation_status,
          'cancelled'::public.consultation_status
        )
      )::bigint as open_consultations
    from public.consultation_requests as request
    group by request.student_id
  ),
  application_counts as (
    select
      application.student_id,
      pg_catalog.count(*) filter (
        where application.is_archived is false
      )::bigint as active_applications
    from public.student_university_applications as application
    group by application.student_id
  ),
  student_rows as (
    select
      student.id as student_id,
      student.full_name,
      student.college_email,
      student.is_active,
      student.created_at as account_created_at,
      student_profile.course,
      student_profile.department,
      student_profile.graduation_year,
      case
        when student_profile.student_id is null then
          'profile_not_started'::public.student_directory_profile_state
        when completion.profile_status =
          'submitted'::public.student_profile_status then
          'submitted'::public.student_directory_profile_state
        when completion.ready_for_counseling is true then
          'ready_for_counseling'::public.student_directory_profile_state
        else
          'profile_in_progress'::public.student_directory_profile_state
      end as profile_state,
      progression.current_stage as progression_stage,
      progression.workflow_state as progression_state,
      coalesce(consultation.total_consultations, 0::bigint)
        as total_consultations,
      coalesce(consultation.open_consultations, 0::bigint)
        as open_consultations,
      coalesce(application.active_applications, 0::bigint)
        as active_applications
    from public.profiles as student
    left join public.student_profiles as student_profile
      on student_profile.student_id = student.id
    left join public.student_profile_completion as completion
      on completion.student_id = student.id
    left join public.student_counseling_progressions as progression
      on progression.student_id = student.id
    left join consultation_counts as consultation
      on consultation.student_id = student.id
    left join application_counts as application
      on application.student_id = student.id
    where student.role = 'student'::public.user_role
  ),
  filtered_rows as (
    select student.*
    from student_rows as student
    where (
      v_search is null
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(student.full_name, '')),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(student.college_email),
        v_search
      ) > 0
    )
      and (p_is_active is null or student.is_active = p_is_active)
      and (
        v_progression_state is null
        or (
          v_progression_state = 'not_started'
          and student.progression_state is null
        )
        or student.progression_state::text = v_progression_state
      )
  )
  select
    student.student_id,
    student.full_name,
    student.college_email,
    student.is_active,
    student.account_created_at,
    student.course,
    student.department,
    student.graduation_year,
    student.profile_state,
    student.progression_stage,
    student.progression_state,
    student.total_consultations,
    student.open_consultations,
    student.active_applications,
    pg_catalog.count(*) over () as total_count
  from filtered_rows as student
  order by
    pg_catalog.lower(
      coalesce(
        nullif(pg_catalog.btrim(student.full_name), ''),
        student.college_email
      )
    ) collate pg_catalog."C" asc,
    student.student_id asc
  limit p_page_size
  offset v_page_offset;
exception
  when sqlstate '22023' then
    raise exception using
      errcode = '22023',
      message = 'Director oversight filters are invalid.';
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Director oversight data is temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Director oversight data is temporarily unavailable.';
end;
$function$;

alter function public.list_director_student_oversight(
  text,
  boolean,
  text,
  integer,
  integer
) owner to postgres;

comment on function public.list_director_student_oversight(
  text,
  boolean,
  text,
  integer,
  integer
) is
  'Returns a bounded student operational summary to an active verified Director without personal contact, private note, or follow-up content.';

create function public.list_director_consultation_oversight(
  p_search text default null,
  p_status public.consultation_status default null,
  p_date_from date default null,
  p_date_to date default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  consultation_id uuid,
  request_number text,
  student_id uuid,
  student_full_name text,
  student_college_email text,
  counselor_id uuid,
  counselor_full_name text,
  counselor_college_email text,
  consultation_date date,
  slot_start time without time zone,
  slot_end time without time zone,
  consultation_status public.consultation_status,
  outcome_recorded_at timestamptz,
  submitted_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_search text;
  v_page_offset bigint;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Director oversight data is temporarily unavailable.';
  end if;

  v_search := nullif(pg_catalog.lower(pg_catalog.btrim(p_search)), '');

  if pg_catalog.char_length(v_search) > 100
    or v_search ~ '[[:cntrl:]]'
    or (
      p_date_from is not null
      and p_date_to is not null
      and (
        p_date_from > p_date_to
        or p_date_to - p_date_from > 3660
      )
    )
    or p_page is null
    or p_page not between 1 and 100000
    or p_page_size is null
    or p_page_size not between 1 and 50 then
    raise exception using
      errcode = '22023',
      message = 'Director oversight filters are invalid.';
  end if;

  v_page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  with consultation_rows as (
    select
      request.id as consultation_id,
      request.request_number,
      student.id as student_id,
      student.full_name as student_full_name,
      student.college_email as student_college_email,
      counselor.id as counselor_id,
      counselor.full_name as counselor_full_name,
      counselor.college_email as counselor_college_email,
      request.consultation_date,
      request.slot_start,
      request.slot_end,
      request.status as consultation_status,
      request.outcome_recorded_at,
      request.submitted_at
    from public.consultation_requests as request
    inner join public.profiles as student
      on student.id = request.student_id
      and student.role = 'student'::public.user_role
    left join public.profiles as counselor
      on counselor.id = request.assigned_counselor_id
      and counselor.role = 'counselor'::public.user_role
    where (
      v_search is null
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(student.full_name, '')),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(student.college_email),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(request.request_number),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(counselor.full_name, '')),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(counselor.college_email, '')),
        v_search
      ) > 0
    )
      and (p_status is null or request.status = p_status)
      and (
        p_date_from is null
        or request.consultation_date >= p_date_from
      )
      and (
        p_date_to is null
        or request.consultation_date <= p_date_to
      )
  )
  select
    consultation.consultation_id,
    consultation.request_number,
    consultation.student_id,
    consultation.student_full_name,
    consultation.student_college_email,
    consultation.counselor_id,
    consultation.counselor_full_name,
    consultation.counselor_college_email,
    consultation.consultation_date,
    consultation.slot_start,
    consultation.slot_end,
    consultation.consultation_status,
    consultation.outcome_recorded_at,
    consultation.submitted_at,
    pg_catalog.count(*) over () as total_count
  from consultation_rows as consultation
  order by
    consultation.submitted_at desc,
    consultation.consultation_id desc
  limit p_page_size
  offset v_page_offset;
exception
  when sqlstate '22023' then
    raise exception using
      errcode = '22023',
      message = 'Director oversight filters are invalid.';
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Director oversight data is temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Director oversight data is temporarily unavailable.';
end;
$function$;

alter function public.list_director_consultation_oversight(
  text,
  public.consultation_status,
  date,
  date,
  integer,
  integer
) owner to postgres;

comment on function public.list_director_consultation_oversight(
  text,
  public.consultation_status,
  date,
  date,
  integer,
  integer
) is
  'Returns a bounded consultation lifecycle summary to an active verified Director without personal contact, private narrative, or follow-up content.';

create function public.list_director_application_oversight(
  p_search text default null,
  p_status public.university_application_status default null,
  p_archive_state text default 'active',
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  application_id uuid,
  student_id uuid,
  student_full_name text,
  student_college_email text,
  counselor_id uuid,
  counselor_full_name text,
  counselor_college_email text,
  university_name text,
  programme_name text,
  country_code text,
  degree_level public.university_application_degree_level,
  intake_term public.university_application_intake_term,
  intake_year smallint,
  application_status public.university_application_status,
  submission_deadline date,
  submitted_at timestamptz,
  is_primary boolean,
  is_archived boolean,
  last_changed_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_search text;
  v_archive_state text;
  v_page_offset bigint;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Director oversight data is temporarily unavailable.';
  end if;

  v_search := nullif(pg_catalog.lower(pg_catalog.btrim(p_search)), '');
  v_archive_state := coalesce(
    nullif(pg_catalog.lower(pg_catalog.btrim(p_archive_state)), ''),
    'active'
  );

  if pg_catalog.char_length(v_search) > 100
    or v_search ~ '[[:cntrl:]]'
    or v_archive_state not in ('active', 'archived', 'all')
    or p_page is null
    or p_page not between 1 and 100000
    or p_page_size is null
    or p_page_size not between 1 and 50 then
    raise exception using
      errcode = '22023',
      message = 'Director oversight filters are invalid.';
  end if;

  v_page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  with application_rows as (
    select
      application.id as application_id,
      student.id as student_id,
      student.full_name as student_full_name,
      student.college_email as student_college_email,
      counselor.id as counselor_id,
      counselor.full_name as counselor_full_name,
      counselor.college_email as counselor_college_email,
      application.university_name,
      application.programme_name,
      application.country_code,
      application.degree_level,
      application.intake_term,
      application.intake_year,
      application.current_status as application_status,
      application.submission_deadline,
      application.submitted_at,
      application.is_primary,
      application.is_archived,
      application.last_changed_at
    from public.student_university_applications as application
    inner join public.profiles as student
      on student.id = application.student_id
      and student.role = 'student'::public.user_role
    left join public.profiles as counselor
      on counselor.id = application.last_changed_by
      and counselor.role = 'counselor'::public.user_role
    where (
      v_search is null
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(student.full_name, '')),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(student.college_email),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(application.university_name),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(application.programme_name),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(counselor.full_name, '')),
        v_search
      ) > 0
      or pg_catalog.strpos(
        pg_catalog.lower(coalesce(counselor.college_email, '')),
        v_search
      ) > 0
    )
      and (p_status is null or application.current_status = p_status)
      and (
        v_archive_state = 'all'
        or (
          v_archive_state = 'active'
          and application.is_archived is false
        )
        or (
          v_archive_state = 'archived'
          and application.is_archived is true
        )
      )
  )
  select
    application.application_id,
    application.student_id,
    application.student_full_name,
    application.student_college_email,
    application.counselor_id,
    application.counselor_full_name,
    application.counselor_college_email,
    application.university_name,
    application.programme_name,
    application.country_code,
    application.degree_level,
    application.intake_term,
    application.intake_year,
    application.application_status,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.is_archived,
    application.last_changed_at,
    pg_catalog.count(*) over () as total_count
  from application_rows as application
  order by
    application.last_changed_at desc,
    application.application_id desc
  limit p_page_size
  offset v_page_offset;
exception
  when sqlstate '22023' then
    raise exception using
      errcode = '22023',
      message = 'Director oversight filters are invalid.';
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Director oversight data is temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Director oversight data is temporarily unavailable.';
end;
$function$;

alter function public.list_director_application_oversight(
  text,
  public.university_application_status,
  text,
  integer,
  integer
) owner to postgres;

comment on function public.list_director_application_oversight(
  text,
  public.university_application_status,
  text,
  integer,
  integer
) is
  'Returns a bounded university-application operational summary to an active verified Director without references, URLs, documents, private narrative, or follow-up content.';

revoke all on function public.list_director_student_oversight(
  text,
  boolean,
  text,
  integer,
  integer
) from public, anon, authenticated;

revoke all on function public.list_director_consultation_oversight(
  text,
  public.consultation_status,
  date,
  date,
  integer,
  integer
) from public, anon, authenticated;

revoke all on function public.list_director_application_oversight(
  text,
  public.university_application_status,
  text,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.list_director_student_oversight(
  text,
  boolean,
  text,
  integer,
  integer
) to authenticated;

grant execute on function public.list_director_consultation_oversight(
  text,
  public.consultation_status,
  date,
  date,
  integer,
  integer
) to authenticated;

grant execute on function public.list_director_application_oversight(
  text,
  public.university_application_status,
  text,
  integer,
  integer
) to authenticated;

commit;

-- >>> supabase/migrations/202608110001_consultation_ownership_fcfs_assignment.sql
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

-- >>> supabase/migrations/202608120001_primary_counselor_assignment_foundation.sql
-- K-GEO Phase A1.4.2A primary counselor assignment foundation.
-- This migration distinguishes long-term student case ownership from
-- consultation-specific ownership without backfilling historical students.

begin;

create table public.student_counselor_assignments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  student_id uuid not null
    constraint student_counselor_assignments_student_id_fkey
    references public.profiles (id) on delete restrict,
  counselor_id uuid not null
    constraint student_counselor_assignments_counselor_id_fkey
    references public.profiles (id) on delete restrict,
  assigned_at timestamptz not null,
  assigned_by uuid not null
    constraint student_counselor_assignments_assigned_by_fkey
    references public.profiles (id) on delete restrict,
  ended_at timestamptz,
  created_at timestamptz not null,
  constraint student_counselor_assignments_distinct_participants_check
    check (student_id <> counselor_id),
  constraint student_counselor_assignments_timestamps_check
    check (
      created_at = assigned_at
      and (ended_at is null or ended_at >= assigned_at)
    )
);

comment on table public.student_counselor_assignments is
  'Append-oriented history of authoritative primary counselor responsibility for students; consultation ownership remains separate.';

comment on column public.student_counselor_assignments.assigned_by is
  'Trusted counselor who established the first assignment through FCFS claim, or a future authorized Director reassignment actor.';

comment on column public.student_counselor_assignments.ended_at is
  'One-way end timestamp reserved for a separately reviewed Director reassignment workflow.';

create unique index student_counselor_assignments_one_active_student_key
  on public.student_counselor_assignments (student_id)
  where ended_at is null;

create index student_counselor_assignments_active_counselor_idx
  on public.student_counselor_assignments (counselor_id, student_id)
  where ended_at is null;

create index student_counselor_assignments_student_history_idx
  on public.student_counselor_assignments (
    student_id,
    assigned_at desc,
    id desc
  );

-- SECURITY: assignment rows have no direct application access. This trigger
-- protects participant roles and makes history append-oriented even for future
-- trusted functions. Only a one-way ended_at transition is structurally valid.
create function public.protect_student_counselor_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_role public.user_role;
  v_counselor_role public.user_role;
  v_actor_role public.user_role;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '42501',
      message = 'Primary counselor assignment history cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.student_id is distinct from old.student_id
      or new.counselor_id is distinct from old.counselor_id
      or new.assigned_at is distinct from old.assigned_at
      or new.assigned_by is distinct from old.assigned_by
      or new.created_at is distinct from old.created_at
      or old.ended_at is not null
      or new.ended_at is null then
      raise exception using
        errcode = '42501',
        message = 'Primary counselor assignment history is immutable';
    end if;
  end if;

  select profile.role
  into v_student_role
  from public.profiles as profile
  where profile.id = new.student_id;

  select profile.role
  into v_counselor_role
  from public.profiles as profile
  where profile.id = new.counselor_id;

  select profile.role
  into v_actor_role
  from public.profiles as profile
  where profile.id = new.assigned_by;

  if v_student_role is distinct from 'student'::public.user_role
    or v_counselor_role is distinct from 'counselor'::public.user_role
    or v_actor_role is null
    or v_actor_role not in (
      'counselor'::public.user_role,
      'director'::public.user_role
    ) then
    raise exception using
      errcode = '23514',
      message = 'Primary counselor assignment participants are invalid';
  end if;

  return new;
end;
$function$;

alter function public.protect_student_counselor_assignment_history()
  owner to postgres;

revoke all on function public.protect_student_counselor_assignment_history()
  from public, anon, authenticated;

create trigger protect_student_counselor_assignment_history
before insert or update or delete
on public.student_counselor_assignments
for each row
execute function public.protect_student_counselor_assignment_history();

alter table public.student_counselor_assignments
  enable row level security;

alter table public.student_counselor_assignments
  force row level security;

revoke all on table public.student_counselor_assignments
  from public, anon, authenticated;

-- SECURITY: preserve A1.4.1's exact counselor-only FCFS contract and create a
-- primary assignment in the same transaction only when the student has none.
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
begin
  v_caller_id := (select auth.uid());

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

  v_assignment_time := pg_catalog.statement_timestamp();

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

alter function public.claim_next_consultation() owner to postgres;

comment on function public.claim_next_consultation() is
  'Atomically assigns the earliest booked consultation and establishes the caller as Primary Counselor only when the student has no active assignment.';

revoke all on function public.claim_next_consultation()
  from public, anon, authenticated;

grant execute on function public.claim_next_consultation()
  to authenticated;

-- Counselor-safe bounded projection of only the caller's active assignments.
create function public.list_my_primary_students(
  p_page integer default 1,
  p_page_size integer default 25
)
returns table (
  assignment_id uuid,
  student_id uuid,
  full_name text,
  college_email text,
  is_active boolean,
  course text,
  department text,
  assigned_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_page_offset bigint;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Assigned students are temporarily unavailable';
  end if;

  if p_page is null
    or p_page not between 1 and 100000
    or p_page_size is null
    or p_page_size not between 1 and 50 then
    raise exception using
      errcode = '22023',
      message = 'Assigned student filters are invalid';
  end if;

  v_page_offset := (p_page::bigint - 1) * p_page_size::bigint;

  return query
  select
    assignment.id,
    student.id,
    student.full_name,
    student.college_email,
    student.is_active,
    student_profile.course,
    student_profile.department,
    assignment.assigned_at,
    pg_catalog.count(*) over () as total_count
  from public.student_counselor_assignments as assignment
  inner join public.profiles as student
    on student.id = assignment.student_id
    and student.role = 'student'::public.user_role
  left join public.student_profiles as student_profile
    on student_profile.student_id = student.id
  where assignment.counselor_id = v_caller_id
    and assignment.ended_at is null
  order by
    pg_catalog.lower(
      coalesce(
        nullif(pg_catalog.btrim(student.full_name), ''),
        student.college_email
      )
    ) collate pg_catalog."C" asc,
    student.id asc
  limit p_page_size
  offset v_page_offset;
exception
  when sqlstate '22023' then
    raise;
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Assigned students are temporarily unavailable';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Assigned students are temporarily unavailable';
end;
$function$;

alter function public.list_my_primary_students(integer, integer)
  owner to postgres;

comment on function public.list_my_primary_students(integer, integer) is
  'Returns one bounded page of safe student identity and academic summary fields actively assigned to the counselor caller.';

revoke all on function public.list_my_primary_students(integer, integer)
  from public, anon, authenticated;

grant execute on function public.list_my_primary_students(integer, integer)
  to authenticated;

-- Director-safe enrichment for the already bounded student oversight page.
create function public.list_director_primary_counselor_assignments(
  p_student_ids uuid[]
)
returns table (
  student_id uuid,
  counselor_id uuid,
  counselor_full_name text,
  counselor_college_email text,
  assigned_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Director assignment data is temporarily unavailable';
  end if;

  if p_student_ids is null
    or pg_catalog.cardinality(p_student_ids) not between 1 and 50
    or pg_catalog.array_position(p_student_ids, null) is not null then
    raise exception using
      errcode = '22023',
      message = 'Director assignment filters are invalid';
  end if;

  return query
  select
    assignment.student_id,
    counselor.id,
    counselor.full_name,
    counselor.college_email,
    assignment.assigned_at
  from public.student_counselor_assignments as assignment
  inner join public.profiles as counselor
    on counselor.id = assignment.counselor_id
  where assignment.student_id = any (p_student_ids)
    and assignment.ended_at is null
  order by assignment.student_id asc;
exception
  when sqlstate '22023' then
    raise;
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Director assignment data is temporarily unavailable';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Director assignment data is temporarily unavailable';
end;
$function$;

alter function public.list_director_primary_counselor_assignments(uuid[])
  owner to postgres;

revoke all on function
  public.list_director_primary_counselor_assignments(uuid[])
  from public, anon, authenticated;

grant execute on function
  public.list_director_primary_counselor_assignments(uuid[])
  to authenticated;

-- Director-safe enrichment for the already bounded counselor workload list.
create function public.list_director_primary_counselor_counts(
  p_counselor_ids uuid[]
)
returns table (
  counselor_id uuid,
  assigned_student_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Director assignment data is temporarily unavailable';
  end if;

  if p_counselor_ids is null
    or pg_catalog.cardinality(p_counselor_ids) not between 1 and 50
    or pg_catalog.array_position(p_counselor_ids, null) is not null then
    raise exception using
      errcode = '22023',
      message = 'Director assignment filters are invalid';
  end if;

  return query
  select
    assignment.counselor_id,
    pg_catalog.count(*)::bigint
  from public.student_counselor_assignments as assignment
  where assignment.counselor_id = any (p_counselor_ids)
    and assignment.ended_at is null
  group by assignment.counselor_id
  order by assignment.counselor_id asc;
exception
  when sqlstate '22023' then
    raise;
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Director assignment data is temporarily unavailable';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Director assignment data is temporarily unavailable';
end;
$function$;

alter function public.list_director_primary_counselor_counts(uuid[])
  owner to postgres;

revoke all on function public.list_director_primary_counselor_counts(uuid[])
  from public, anon, authenticated;

grant execute on function public.list_director_primary_counselor_counts(uuid[])
  to authenticated;

commit;

-- >>> supabase/migrations/202608130001_primary_counselor_storage_authorization_helpers.sql
-- K-GEO Phase A1.4.2B Primary Counselor authorization helper.
-- The existing Storage policies remain unchanged. Progression-evidence and
-- application-document reservations are protected at their metadata tables.

begin;

create function public.is_active_primary_counselor_for_student(
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.student_counselor_assignments as assignment
      inner join public.profiles as student_profile
        on student_profile.id = assignment.student_id
        and student_profile.role = 'student'::public.user_role
      inner join public.profiles as counselor_profile
        on counselor_profile.id = assignment.counselor_id
        and counselor_profile.role = 'counselor'::public.user_role
        and counselor_profile.is_active is true
      inner join auth.users as counselor_auth
        on counselor_auth.id = counselor_profile.id
        and counselor_auth.email_confirmed_at is not null
      where assignment.student_id = p_student_id
        and assignment.counselor_id = (select auth.uid())
        and assignment.ended_at is null
    );
$function$;

alter function public.is_active_primary_counselor_for_student(uuid)
  owner to postgres;

revoke all on function public.is_active_primary_counselor_for_student(uuid)
  from public, anon, authenticated;

comment on function public.is_active_primary_counselor_for_student(uuid) is
  'Private auth.uid()-derived predicate for active verified Primary Counselor ownership of one student case.';

commit;

-- >>> supabase/migrations/202608130002_primary_counselor_case_ownership_enforcement.sql
-- K-GEO Phase A1.4.2B primary counselor case ownership enforcement.
-- Long-term case mutations require the student's active Primary Counselor;
-- consultation-specific outcome ownership remains a separate contract.

begin;

set local search_path = '';

-- Hold the same write-conflicting relation lock needed by trigger DDL before
-- inspecting reservations. Every pre-existing writer must finish before these
-- locks are granted; every later writer waits until commit and therefore runs
-- through the installed Primary Counselor triggers.
lock table
  public.student_counseling_progression_evidence,
  public.student_university_application_documents
in share row exclusive mode;

-- FAIL CLOSED: existing static Storage policies and all live upload
-- reservations must be compatible before any case enforcement object below
-- is created. This block reads Storage catalogs and application data only.
do $reservation_gate_prerequisite$
declare
  v_authenticated_role_oid oid;
  v_assignment_relation_count integer;
  v_applicable_policy_count integer;
  v_applicable_policy_names name[];
  v_exact_policy_count integer;
  v_progression_expression text;
  v_progression_policy_oid oid;
  v_progression_relation_dependencies text[];
  v_progression_function_dependencies text[];
  v_document_expression text;
  v_document_policy_oid oid;
  v_document_relation_dependencies text[];
  v_document_function_dependencies text[];
  v_exact_select_policy_count integer;
  v_applicable_select_policy_count integer;
  v_applicable_select_policy_names name[];
  v_progression_select_expression text;
  v_progression_select_policy_oid oid;
  v_progression_select_relation_dependencies text[];
  v_progression_select_function_dependencies text[];
  v_document_select_expression text;
  v_document_select_policy_oid oid;
  v_document_select_relation_dependencies text[];
  v_document_select_function_dependencies text[];
  v_exact_helper_count integer;
  v_incompatible_progression_reservations bigint;
  v_incompatible_document_reservations bigint;
begin
  select role_record.oid
  into v_authenticated_role_oid
  from pg_catalog.pg_roles as role_record
  where role_record.rolname = 'authenticated';

  if v_authenticated_role_oid is null then
    raise exception using
      errcode = '55000',
      message = 'Authenticated database role prerequisite failed';
  end if;

  select pg_catalog.count(*)::integer
  into v_assignment_relation_count
  from pg_catalog.pg_class as relation
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'public'
    and relation.relname = 'student_counselor_assignments'
    and relation.relkind = 'r';

  if v_assignment_relation_count <> 1 then
    raise exception using
      errcode = '55000',
      message = 'Primary Counselor assignment relation prerequisite failed';
  end if;

  with recursive applicable_roles(role_oid) as (
    select v_authenticated_role_oid
    union
    select membership.roleid
    from pg_catalog.pg_auth_members as membership
    inner join applicable_roles as inherited_role
      on inherited_role.role_oid = membership.member
  ), applicable_insert_policies as (
    select policy_record.polname
    from pg_catalog.pg_policy as policy_record
    inner join pg_catalog.pg_class as relation
      on relation.oid = policy_record.polrelid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'storage'
      and relation.relname = 'objects'
      and policy_record.polcmd in ('a', '*')
      and exists (
        select 1
        from pg_catalog.unnest(policy_record.polroles) as policy_role(role_oid)
        where policy_role.role_oid = 0
          or policy_role.role_oid in (
            select applicable_role.role_oid
            from applicable_roles as applicable_role
          )
      )
  )
  select
    pg_catalog.count(*)::integer,
    pg_catalog.array_agg(policy_name.polname order by policy_name.polname)
  into v_applicable_policy_count, v_applicable_policy_names
  from applicable_insert_policies as policy_name;

  if v_applicable_policy_count <> 2
    or v_applicable_policy_names is distinct from array[
      'progression_evidence_object_insert_counselor',
      'university_application_document_object_insert_counselor'
    ]::name[] then
    raise exception using
      errcode = '55000',
      message = 'Storage INSERT policy allowlist prerequisite failed';
  end if;

  with recursive applicable_roles(role_oid) as (
    select v_authenticated_role_oid
    union
    select membership.roleid
    from pg_catalog.pg_auth_members as membership
    inner join applicable_roles as inherited_role
      on inherited_role.role_oid = membership.member
  ), applicable_select_policies as (
    select policy_record.polname
    from pg_catalog.pg_policy as policy_record
    inner join pg_catalog.pg_class as relation
      on relation.oid = policy_record.polrelid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where namespace.nspname = 'storage'
      and relation.relname = 'objects'
      and policy_record.polcmd in ('r', '*')
      and exists (
        select 1
        from pg_catalog.unnest(policy_record.polroles) as policy_role(role_oid)
        where policy_role.role_oid = 0
          or policy_role.role_oid in (
            select applicable_role.role_oid
            from applicable_roles as applicable_role
          )
      )
  )
  select
    pg_catalog.count(*)::integer,
    pg_catalog.array_agg(policy_name.polname order by policy_name.polname)
  into v_applicable_select_policy_count, v_applicable_select_policy_names
  from applicable_select_policies as policy_name;

  if v_applicable_select_policy_count <> 2
    or v_applicable_select_policy_names is distinct from array[
      'progression_evidence_object_select_counselor',
      'university_application_document_object_select_counselor'
    ]::name[] then
    raise exception using
      errcode = '55000',
      message = 'Storage SELECT policy allowlist prerequisite failed';
  end if;

  select
    pg_catalog.count(*)::integer,
    pg_catalog.max(
      case when policy_record.polname =
        'progression_evidence_object_insert_counselor'
      then pg_catalog.pg_get_expr(
        policy_record.polwithcheck,
        policy_record.polrelid,
        false
      ) end
    ),
    pg_catalog.max(
      case when policy_record.polname =
        'progression_evidence_object_insert_counselor'
      then policy_record.oid::bigint end
    )::oid,
    pg_catalog.max(
      case when policy_record.polname =
        'university_application_document_object_insert_counselor'
      then pg_catalog.pg_get_expr(
        policy_record.polwithcheck,
        policy_record.polrelid,
        false
      ) end
    ),
    pg_catalog.max(
      case when policy_record.polname =
        'university_application_document_object_insert_counselor'
      then policy_record.oid::bigint end
    )::oid
  into
    v_exact_policy_count,
    v_progression_expression,
    v_progression_policy_oid,
    v_document_expression,
    v_document_policy_oid
  from pg_catalog.pg_policy as policy_record
  inner join pg_catalog.pg_class as relation
    on relation.oid = policy_record.polrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'storage'
    and relation.relname = 'objects'
    and policy_record.polname in (
      'progression_evidence_object_insert_counselor',
      'university_application_document_object_insert_counselor'
    )
    and policy_record.polcmd = 'a'
    and policy_record.polpermissive is true
    and policy_record.polroles = array[v_authenticated_role_oid]::oid[]
    and policy_record.polwithcheck is not null;

  if v_exact_policy_count <> 2
    or v_progression_expression is null
    or v_progression_policy_oid is null
    or v_document_expression is null
    or v_document_policy_oid is null then
    raise exception using
      errcode = '55000',
      message = 'Static Storage policy metadata prerequisite failed';
  end if;

  -- pg_get_expr runs under the transaction-local empty search path. Compare
  -- the complete rendered programs after collapsing whitespace only; no SQL
  -- token, parenthesis, literal, or schema qualification is removed.
  v_progression_expression := pg_catalog.regexp_replace(
    pg_catalog.btrim(
      pg_catalog.replace(
        pg_catalog.replace(
          v_progression_expression,
          pg_catalog.chr(13) || pg_catalog.chr(10),
          pg_catalog.chr(10)
        ),
        pg_catalog.chr(13),
        pg_catalog.chr(10)
      )
    ),
    '[[:space:]]+',
    ' ',
    'g'
  );
  v_document_expression := pg_catalog.regexp_replace(
    pg_catalog.btrim(
      pg_catalog.replace(
        pg_catalog.replace(
          v_document_expression,
          pg_catalog.chr(13) || pg_catalog.chr(10),
          pg_catalog.chr(10)
        ),
        pg_catalog.chr(13),
        pg_catalog.chr(10)
      )
    ),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if v_progression_expression <>
      '((bucket_id = ''counseling-progression-evidence''::text) AND ( SELECT public.has_active_verified_kgeo_role(''counselor''::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = ''pending''::public.counseling_progression_evidence_status) AND (evidence.uploaded_by = ( SELECT auth.uid() AS uid)) AND (evidence.upload_expires_at > statement_timestamp())))))'
    or v_document_expression <>
      '((bucket_id = ''university-application-documents''::text) AND ( SELECT public.can_upload_university_application_document_object(objects.bucket_id, objects.name) AS can_upload_university_application_document_object))' then
    raise exception using
      errcode = '55000',
      message = 'Static Storage policy expression prerequisite failed';
  end if;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_progression_relation_dependencies
  from (
    select distinct
      pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
        as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_class as relation
      on dependency_record.refclassid =
        'pg_catalog.pg_class'::pg_catalog.regclass
      and relation.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_progression_policy_oid
  ) as dependency;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_progression_function_dependencies
  from (
    select distinct
      pg_catalog.format(
        '%I.%I(%s)',
        namespace.nspname,
        procedure.proname,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      ) as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_proc as procedure
      on dependency_record.refclassid =
        'pg_catalog.pg_proc'::pg_catalog.regclass
      and procedure.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_progression_policy_oid
  ) as dependency;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_document_relation_dependencies
  from (
    select distinct
      pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
        as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_class as relation
      on dependency_record.refclassid =
        'pg_catalog.pg_class'::pg_catalog.regclass
      and relation.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_document_policy_oid
  ) as dependency;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_document_function_dependencies
  from (
    select distinct
      pg_catalog.format(
        '%I.%I(%s)',
        namespace.nspname,
        procedure.proname,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      ) as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_proc as procedure
      on dependency_record.refclassid =
        'pg_catalog.pg_proc'::pg_catalog.regclass
      and procedure.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_document_policy_oid
  ) as dependency;

  if v_progression_relation_dependencies is distinct from array[
      'public.student_counseling_progression_evidence',
      'storage.objects'
    ]::text[]
    or v_progression_function_dependencies is distinct from array[
      'auth.uid()',
      'public.has_active_verified_kgeo_role(p_role public.user_role)'
    ]::text[]
    or v_document_relation_dependencies is distinct from array[
      'storage.objects'
    ]::text[]
    or v_document_function_dependencies is distinct from array[
      'public.can_upload_university_application_document_object(p_bucket_id text, p_storage_path text)'
    ]::text[] then
    raise exception using
      errcode = '55000',
      message = 'Static Storage policy dependency prerequisite failed';
  end if;



  select
    pg_catalog.count(*)::integer,
    pg_catalog.max(
      case when policy_record.polname =
        'progression_evidence_object_select_counselor'
      then pg_catalog.pg_get_expr(
        policy_record.polqual,
        policy_record.polrelid,
        false
      ) end
    ),
    pg_catalog.max(
      case when policy_record.polname =
        'progression_evidence_object_select_counselor'
      then policy_record.oid::bigint end
    )::oid,
    pg_catalog.max(
      case when policy_record.polname =
        'university_application_document_object_select_counselor'
      then pg_catalog.pg_get_expr(
        policy_record.polqual,
        policy_record.polrelid,
        false
      ) end
    ),
    pg_catalog.max(
      case when policy_record.polname =
        'university_application_document_object_select_counselor'
      then policy_record.oid::bigint end
    )::oid
  into
    v_exact_select_policy_count,
    v_progression_select_expression,
    v_progression_select_policy_oid,
    v_document_select_expression,
    v_document_select_policy_oid
  from pg_catalog.pg_policy as policy_record
  inner join pg_catalog.pg_class as relation
    on relation.oid = policy_record.polrelid
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = relation.relnamespace
  where namespace.nspname = 'storage'
    and relation.relname = 'objects'
    and policy_record.polname in (
      'progression_evidence_object_select_counselor',
      'university_application_document_object_select_counselor'
    )
    and policy_record.polcmd = 'r'
    and policy_record.polpermissive is true
    and policy_record.polroles = array[v_authenticated_role_oid]::oid[]
    and policy_record.polqual is not null
    and policy_record.polwithcheck is null;

  if v_exact_select_policy_count <> 2
    or v_progression_select_expression is null
    or v_progression_select_policy_oid is null
    or v_document_select_expression is null
    or v_document_select_policy_oid is null then
    raise exception using
      errcode = '55000',
      message = 'Protected Storage SELECT policy metadata prerequisite failed';
  end if;

  v_progression_select_expression := pg_catalog.regexp_replace(
    pg_catalog.btrim(
      pg_catalog.replace(
        pg_catalog.replace(
          v_progression_select_expression,
          pg_catalog.chr(13) || pg_catalog.chr(10),
          pg_catalog.chr(10)
        ),
        pg_catalog.chr(13),
        pg_catalog.chr(10)
      )
    ),
    '[[:space:]]+',
    ' ',
    'g'
  );
  v_document_select_expression := pg_catalog.regexp_replace(
    pg_catalog.btrim(
      pg_catalog.replace(
        pg_catalog.replace(
          v_document_select_expression,
          pg_catalog.chr(13) || pg_catalog.chr(10),
          pg_catalog.chr(10)
        ),
        pg_catalog.chr(13),
        pg_catalog.chr(10)
      )
    ),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if v_progression_select_expression <>
      '((bucket_id = ''counseling-progression-evidence''::text) AND ( SELECT public.has_active_verified_kgeo_role(''counselor''::public.user_role) AS has_active_verified_kgeo_role) AND (EXISTS ( SELECT 1 FROM public.student_counseling_progression_evidence evidence WHERE ((evidence.bucket_id = objects.bucket_id) AND (evidence.storage_path = objects.name) AND (evidence.status = ''available''::public.counseling_progression_evidence_status)))))'
    or v_document_select_expression <>
      '((bucket_id = ''university-application-documents''::text) AND ( SELECT public.can_view_university_application_document_object(objects.bucket_id, objects.name) AS can_view_university_application_document_object))' then
    raise exception using
      errcode = '55000',
      message = 'Protected Storage SELECT policy expression prerequisite failed';
  end if;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_progression_select_relation_dependencies
  from (
    select distinct
      pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
        as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_class as relation
      on dependency_record.refclassid =
        'pg_catalog.pg_class'::pg_catalog.regclass
      and relation.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_progression_select_policy_oid
  ) as dependency;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_progression_select_function_dependencies
  from (
    select distinct
      pg_catalog.format(
        '%I.%I(%s)',
        namespace.nspname,
        procedure.proname,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      ) as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_proc as procedure
      on dependency_record.refclassid =
        'pg_catalog.pg_proc'::pg_catalog.regclass
      and procedure.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_progression_select_policy_oid
  ) as dependency;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_document_select_relation_dependencies
  from (
    select distinct
      pg_catalog.format('%I.%I', namespace.nspname, relation.relname)
        as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_class as relation
      on dependency_record.refclassid =
        'pg_catalog.pg_class'::pg_catalog.regclass
      and relation.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = relation.relnamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_document_select_policy_oid
  ) as dependency;

  select pg_catalog.array_agg(dependency.identity order by dependency.identity)
  into v_document_select_function_dependencies
  from (
    select distinct
      pg_catalog.format(
        '%I.%I(%s)',
        namespace.nspname,
        procedure.proname,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)
      ) as identity
    from pg_catalog.pg_depend as dependency_record
    inner join pg_catalog.pg_proc as procedure
      on dependency_record.refclassid =
        'pg_catalog.pg_proc'::pg_catalog.regclass
      and procedure.oid = dependency_record.refobjid
    inner join pg_catalog.pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where dependency_record.classid =
        'pg_catalog.pg_policy'::pg_catalog.regclass
      and dependency_record.objid = v_document_select_policy_oid
  ) as dependency;

  if v_progression_select_relation_dependencies is distinct from array[
      'public.student_counseling_progression_evidence',
      'storage.objects'
    ]::text[]
    or v_progression_select_function_dependencies is distinct from array[
      'public.has_active_verified_kgeo_role(p_role public.user_role)'
    ]::text[]
    or v_document_select_relation_dependencies is distinct from array[
      'storage.objects'
    ]::text[]
    or v_document_select_function_dependencies is distinct from array[
      'public.can_view_university_application_document_object(p_bucket_id text, p_storage_path text)'
    ]::text[] then
    raise exception using
      errcode = '55000',
      message = 'Protected Storage SELECT policy dependency prerequisite failed';
  end if;



  select pg_catalog.count(*)::integer
  into v_exact_helper_count
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  inner join pg_catalog.pg_language as language_record
    on language_record.oid = procedure.prolang
  where namespace.nspname = 'public'
    and procedure.proname =
      'is_active_primary_counselor_for_student'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) =
      'p_student_id uuid'
    and procedure.prokind = 'f'
    and procedure.prorettype = 'pg_catalog.bool'::pg_catalog.regtype
    and procedure.proretset is false
    and procedure.prosecdef is true
    and procedure.provolatile = 's'
    and procedure.proisstrict is false
    and procedure.proleakproof is false
    and procedure.proparallel = 'u'
    and procedure.proconfig in (array['search_path=']::text[], array['search_path=""']::text[])
    and owner_role.rolname = 'postgres'
    and language_record.lanname = 'sql'
    and pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(
          pg_catalog.replace(
            pg_catalog.replace(
              procedure.prosrc,
              pg_catalog.chr(13) || pg_catalog.chr(10),
              pg_catalog.chr(10)
            ),
            pg_catalog.chr(13),
            pg_catalog.chr(10)
          ),
          'UTF8'
        )
      ),
      'hex'
    ) = 'dbafccbd4bae61d5e20bce09ee3b66075664dc23f69943235344c3d123b9fb6b'
    and not exists (
      select 1
      from pg_catalog.aclexplode(
        coalesce(
          procedure.proacl,
          pg_catalog.acldefault('f', procedure.proowner)
        )
      ) as privilege
      where privilege.privilege_type = 'EXECUTE'
        and privilege.grantee <> procedure.proowner
    );

  if v_exact_helper_count <> 1 then
    raise exception using
      errcode = '55000',
      message = 'Primary Counselor helper prerequisite failed';
  end if;

  -- Inventory every non-internal trigger on every relation this migration
  -- protects. The pre-install allowlist contains only reviewed historical
  -- triggers; unrelated names, disabled triggers, and alternate functions all
  -- fail closed before any A1.4.2B enforcement object is created.
  if exists (
    with expected_pre_triggers(
      relation_schema,
      relation_name,
      relation_oid,
      trigger_name,
      function_oid,
      function_schema,
      function_name,
      function_identity_arguments,
      trigger_type,
      enabled_state,
      is_internal,
      argument_count,
      arguments_hex,
      when_expression,
      constraint_oid,
      is_deferrable,
      is_initially_deferred,
      old_transition_table,
      new_transition_table
    ) as (
      values
        ('public'::text, 'counselor_student_notes'::text, 'public.counselor_student_notes'::pg_catalog.regclass::oid, 'counselor_student_notes_10_prepare'::text, 'public.prepare_counselor_private_record()'::pg_catalog.regprocedure::oid, 'public'::text, 'prepare_counselor_private_record'::text, ''::text, 23::smallint, 'O'::"char", false, 0::smallint, ''::text, null::text, 0::oid, false, false, null::text, null::text),
        ('public', 'counselor_student_notes', 'public.counselor_student_notes'::pg_catalog.regclass::oid, 'counselor_student_notes_20_normalize', 'public.normalize_counselor_student_note()'::pg_catalog.regprocedure::oid, 'public', 'normalize_counselor_student_note', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'counselor_follow_ups_10_prepare', 'public.prepare_counselor_private_record()'::pg_catalog.regprocedure::oid, 'public', 'prepare_counselor_private_record', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'counselor_follow_ups_20_normalize', 'public.normalize_counselor_follow_up()'::pg_catalog.regprocedure::oid, 'public', 'normalize_counselor_follow_up', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null)
    ), actual_pre_triggers as (
      select
        relation_namespace.nspname::text,
        relation.relname::text,
        relation.oid,
        trigger_record.tgname::text,
        procedure.oid,
        function_namespace.nspname::text,
        procedure.proname::text,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)::text,
        trigger_record.tgtype,
        trigger_record.tgenabled,
        trigger_record.tgisinternal,
        trigger_record.tgnargs,
        pg_catalog.encode(trigger_record.tgargs, 'hex'),
        pg_catalog.pg_get_expr(
          trigger_record.tgqual,
          trigger_record.tgrelid,
          false
        )::text,
        trigger_record.tgconstraint,
        trigger_record.tgdeferrable,
        trigger_record.tginitdeferred,
        trigger_record.tgoldtable::text,
        trigger_record.tgnewtable::text
      from pg_catalog.pg_trigger as trigger_record
      inner join pg_catalog.pg_class as relation
        on relation.oid = trigger_record.tgrelid
      inner join pg_catalog.pg_namespace as relation_namespace
        on relation_namespace.oid = relation.relnamespace
      inner join pg_catalog.pg_proc as procedure
        on procedure.oid = trigger_record.tgfoid
      inner join pg_catalog.pg_namespace as function_namespace
        on function_namespace.oid = procedure.pronamespace
      where trigger_record.tgrelid in (
          'public.counselor_student_notes'::pg_catalog.regclass,
          'public.counselor_follow_ups'::pg_catalog.regclass,
          'public.student_counseling_progressions'::pg_catalog.regclass,
          'public.student_university_applications'::pg_catalog.regclass,
          'public.student_counseling_progression_evidence'::pg_catalog.regclass,
          'public.student_university_application_documents'::pg_catalog.regclass
        )
        and trigger_record.tgisinternal is false
    )
    (
      select * from expected_pre_triggers
      except
      select * from actual_pre_triggers
    )
    union all
    (
      select * from actual_pre_triggers
      except
      select * from expected_pre_triggers
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Protected relation pre-install trigger allowlist prerequisite failed';
  end if;

  select pg_catalog.count(*)
  into v_incompatible_progression_reservations
  from public.student_counseling_progression_evidence as evidence
  inner join public.student_counseling_progression_events as progression_event
    on progression_event.id = evidence.progression_event_id
  where evidence.status =
      'pending'::public.counseling_progression_evidence_status
    and evidence.upload_expires_at > pg_catalog.statement_timestamp()
    and not exists (
      select 1
      from public.student_counselor_assignments as assignment
      inner join public.profiles as student_profile
        on student_profile.id = assignment.student_id
        and student_profile.role = 'student'::public.user_role
      inner join public.profiles as counselor_profile
        on counselor_profile.id = assignment.counselor_id
        and counselor_profile.role = 'counselor'::public.user_role
        and counselor_profile.is_active is true
      inner join auth.users as counselor_auth
        on counselor_auth.id = counselor_profile.id
        and counselor_auth.email_confirmed_at is not null
      where assignment.student_id = progression_event.student_id
        and assignment.counselor_id = evidence.uploaded_by
        and assignment.ended_at is null
    );

  if v_incompatible_progression_reservations <> 0 then
    raise exception using
      errcode = '55000',
      message = 'Incompatible unexpired progression evidence reservations exist';
  end if;

  select pg_catalog.count(*)
  into v_incompatible_document_reservations
  from public.student_university_application_documents as document
  inner join public.student_university_applications as application
    on application.id = document.application_id
  where document.status =
      'pending'::public.university_application_document_status
    and document.upload_expires_at > pg_catalog.statement_timestamp()
    and (
      application.is_archived is true
      or not exists (
        select 1
        from public.student_counselor_assignments as assignment
        inner join public.profiles as student_profile
          on student_profile.id = assignment.student_id
          and student_profile.role = 'student'::public.user_role
        inner join public.profiles as counselor_profile
          on counselor_profile.id = assignment.counselor_id
          and counselor_profile.role = 'counselor'::public.user_role
          and counselor_profile.is_active is true
        inner join auth.users as counselor_auth
          on counselor_auth.id = counselor_profile.id
          and counselor_auth.email_confirmed_at is not null
        where assignment.student_id = application.student_id
          and assignment.counselor_id = document.uploaded_by
          and assignment.ended_at is null
      )
    );

  if v_incompatible_document_reservations <> 0 then
    raise exception using
      errcode = '55000',
      message = 'Incompatible unexpired application document reservations exist';
  end if;
end;
$reservation_gate_prerequisite$;

create function public.get_my_primary_counselor_case_access(
  p_student_id uuid
)
returns table (access_state text)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
begin
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

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = p_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = 'P0002',
      message = 'Student not found';
  end if;

  return query
  select case
    when public.is_active_primary_counselor_for_student(p_student_id)
      then 'primary'::text
    when exists (
      select 1
      from public.student_counselor_assignments as assignment
      where assignment.student_id = p_student_id
        and assignment.ended_at is null
    ) then 'managed_by_other'::text
    else 'unassigned'::text
  end;
end;
$function$;

alter function public.get_my_primary_counselor_case_access(uuid)
  owner to postgres;

revoke all on function public.get_my_primary_counselor_case_access(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_my_primary_counselor_case_access(uuid)
  to authenticated;

create function public.enforce_primary_counselor_student_case_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
begin
  v_student_id := case when tg_op = 'DELETE'
    then old.student_id
    else new.student_id
  end;

  if public.is_active_primary_counselor_for_student(v_student_id)
    is not true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor case ownership is required';
  end if;

  if tg_op = 'UPDATE'
    and old.student_id is distinct from new.student_id
    and public.is_active_primary_counselor_for_student(old.student_id)
      is not true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor case ownership is required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create function public.enforce_primary_counselor_progression_evidence()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_event_id uuid;
  v_student_id uuid;
begin
  v_event_id := case when tg_op = 'DELETE'
    then old.progression_event_id
    else new.progression_event_id
  end;

  select progression_event.student_id
  into v_student_id
  from public.student_counseling_progression_events as progression_event
  where progression_event.id = v_event_id;

  if v_student_id is null
    or public.is_active_primary_counselor_for_student(v_student_id)
      is not true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor case ownership is required';
  end if;

  if tg_op = 'UPDATE'
    and old.progression_event_id is distinct from new.progression_event_id
    and not exists (
      select 1
      from public.student_counseling_progression_events as progression_event
      where progression_event.id = old.progression_event_id
        and public.is_active_primary_counselor_for_student(
          progression_event.student_id
        ) is true
    ) then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor case ownership is required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create function public.enforce_primary_counselor_application_document()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_application_id uuid;
  v_student_id uuid;
begin
  v_application_id := case when tg_op = 'DELETE'
    then old.application_id
    else new.application_id
  end;

  select application.student_id
  into v_student_id
  from public.student_university_applications as application
  where application.id = v_application_id;

  if v_student_id is null
    or public.is_active_primary_counselor_for_student(v_student_id)
      is not true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor case ownership is required';
  end if;

  if tg_op = 'UPDATE'
    and old.application_id is distinct from new.application_id
    and not exists (
      select 1
      from public.student_university_applications as application
      where application.id = old.application_id
        and public.is_active_primary_counselor_for_student(
          application.student_id
        ) is true
    ) then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor case ownership is required';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

alter function public.enforce_primary_counselor_student_case_row()
  owner to postgres;
alter function public.enforce_primary_counselor_progression_evidence()
  owner to postgres;
alter function public.enforce_primary_counselor_application_document()
  owner to postgres;

revoke all on function public.enforce_primary_counselor_student_case_row()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_primary_counselor_progression_evidence()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_primary_counselor_application_document()
  from public, anon, authenticated, service_role;

create trigger enforce_primary_counselor_case_on_notes
before insert or update or delete on public.counselor_student_notes
for each row execute function
  public.enforce_primary_counselor_student_case_row();

create trigger enforce_primary_counselor_case_on_follow_ups
before insert or update or delete on public.counselor_follow_ups
for each row execute function
  public.enforce_primary_counselor_student_case_row();

create trigger enforce_primary_counselor_case_on_progressions
before insert or update or delete on public.student_counseling_progressions
for each row execute function
  public.enforce_primary_counselor_student_case_row();

create trigger enforce_primary_counselor_case_on_applications
before insert or update or delete on public.student_university_applications
for each row execute function
  public.enforce_primary_counselor_student_case_row();

create trigger enforce_primary_counselor_case_on_progression_evidence
before insert or update or delete
on public.student_counseling_progression_evidence
for each row execute function
  public.enforce_primary_counselor_progression_evidence();

create trigger enforce_primary_counselor_case_on_application_documents
before insert or update or delete
on public.student_university_application_documents
for each row execute function
  public.enforce_primary_counselor_application_document();

create or replace function public.can_upload_university_application_document_object(
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
        and public.is_active_primary_counselor_for_student(
          application.student_id
        ) is true
    )
  );
exception
  when others then
    return false;
end;
$function$;

alter function public.can_upload_university_application_document_object(
  text,
  text
) owner to postgres;

revoke all on function public.can_upload_university_application_document_object(
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.can_upload_university_application_document_object(
  text,
  text
) to authenticated;

-- FAIL CLOSED: independently re-inventory every user-defined trigger after
-- installation. This catches concurrent or pre-existing drift regardless of
-- trigger name, timing, event set, enabled state, arguments, or ordering.
do $final_trigger_contract$
begin
  if exists (
    with expected_post_triggers(
      relation_schema,
      relation_name,
      relation_oid,
      trigger_name,
      function_oid,
      function_schema,
      function_name,
      function_identity_arguments,
      trigger_type,
      enabled_state,
      is_internal,
      argument_count,
      arguments_hex,
      when_expression,
      constraint_oid,
      is_deferrable,
      is_initially_deferred,
      old_transition_table,
      new_transition_table
    ) as (
      values
        ('public'::text, 'counselor_student_notes'::text, 'public.counselor_student_notes'::pg_catalog.regclass::oid, 'counselor_student_notes_10_prepare'::text, 'public.prepare_counselor_private_record()'::pg_catalog.regprocedure::oid, 'public'::text, 'prepare_counselor_private_record'::text, ''::text, 23::smallint, 'O'::"char", false, 0::smallint, ''::text, null::text, 0::oid, false, false, null::text, null::text),
        ('public', 'counselor_student_notes', 'public.counselor_student_notes'::pg_catalog.regclass::oid, 'counselor_student_notes_20_normalize', 'public.normalize_counselor_student_note()'::pg_catalog.regprocedure::oid, 'public', 'normalize_counselor_student_note', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'counselor_follow_ups_10_prepare', 'public.prepare_counselor_private_record()'::pg_catalog.regprocedure::oid, 'public', 'prepare_counselor_private_record', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'counselor_follow_ups_20_normalize', 'public.normalize_counselor_follow_up()'::pg_catalog.regprocedure::oid, 'public', 'normalize_counselor_follow_up', '', 23::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'counselor_student_notes', 'public.counselor_student_notes'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_notes', 'public.enforce_primary_counselor_student_case_row()'::pg_catalog.regprocedure::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'counselor_follow_ups', 'public.counselor_follow_ups'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_follow_ups', 'public.enforce_primary_counselor_student_case_row()'::pg_catalog.regprocedure::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'student_counseling_progressions', 'public.student_counseling_progressions'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_progressions', 'public.enforce_primary_counselor_student_case_row()'::pg_catalog.regprocedure::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'student_university_applications', 'public.student_university_applications'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_applications', 'public.enforce_primary_counselor_student_case_row()'::pg_catalog.regprocedure::oid, 'public', 'enforce_primary_counselor_student_case_row', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'student_counseling_progression_evidence', 'public.student_counseling_progression_evidence'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_progression_evidence', 'public.enforce_primary_counselor_progression_evidence()'::pg_catalog.regprocedure::oid, 'public', 'enforce_primary_counselor_progression_evidence', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null),
        ('public', 'student_university_application_documents', 'public.student_university_application_documents'::pg_catalog.regclass::oid, 'enforce_primary_counselor_case_on_application_documents', 'public.enforce_primary_counselor_application_document()'::pg_catalog.regprocedure::oid, 'public', 'enforce_primary_counselor_application_document', '', 31::smallint, 'O'::"char", false, 0::smallint, '', null, 0::oid, false, false, null, null)
    ), actual_post_triggers as (
      select
        relation_namespace.nspname::text,
        relation.relname::text,
        relation.oid,
        trigger_record.tgname::text,
        procedure.oid,
        function_namespace.nspname::text,
        procedure.proname::text,
        pg_catalog.pg_get_function_identity_arguments(procedure.oid)::text,
        trigger_record.tgtype,
        trigger_record.tgenabled,
        trigger_record.tgisinternal,
        trigger_record.tgnargs,
        pg_catalog.encode(trigger_record.tgargs, 'hex'),
        pg_catalog.pg_get_expr(
          trigger_record.tgqual,
          trigger_record.tgrelid,
          false
        )::text,
        trigger_record.tgconstraint,
        trigger_record.tgdeferrable,
        trigger_record.tginitdeferred,
        trigger_record.tgoldtable::text,
        trigger_record.tgnewtable::text
      from pg_catalog.pg_trigger as trigger_record
      inner join pg_catalog.pg_class as relation
        on relation.oid = trigger_record.tgrelid
      inner join pg_catalog.pg_namespace as relation_namespace
        on relation_namespace.oid = relation.relnamespace
      inner join pg_catalog.pg_proc as procedure
        on procedure.oid = trigger_record.tgfoid
      inner join pg_catalog.pg_namespace as function_namespace
        on function_namespace.oid = procedure.pronamespace
      where trigger_record.tgrelid in (
          'public.counselor_student_notes'::pg_catalog.regclass,
          'public.counselor_follow_ups'::pg_catalog.regclass,
          'public.student_counseling_progressions'::pg_catalog.regclass,
          'public.student_university_applications'::pg_catalog.regclass,
          'public.student_counseling_progression_evidence'::pg_catalog.regclass,
          'public.student_university_application_documents'::pg_catalog.regclass
        )
        and trigger_record.tgisinternal is false
    )
    (
      select * from expected_post_triggers
      except
      select * from actual_post_triggers
    )
    union all
    (
      select * from actual_post_triggers
      except
      select * from expected_post_triggers
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Protected relation final trigger allowlist assertion failed';
  end if;
end;
$final_trigger_contract$;

commit;

-- >>> supabase/migrations/202608180001_record_consultation_outcome_acl_alignment.sql
-- MIGRATION 202608180001
-- Align record_consultation_outcome ACL by revoking service_role.

begin;
set local search_path = '';

do $$
declare
  v_proc_oid pg_catalog.oid;
  v_body_hash text;
  v_grants text[];
begin
  -- 1. Exact once verification
  select oid
  into strict v_proc_oid
  from pg_catalog.pg_proc
  where proname = 'record_consultation_outcome'
    and pronamespace = 'public'::pg_catalog.regnamespace;

  -- 2. Verify identity arguments
  if pg_catalog.pg_get_function_identity_arguments(v_proc_oid) <> 'p_consultation_id uuid, p_outcome text' then
    raise exception 'Unexpected identity arguments';
  end if;

  -- 3. Verify return type exact
  if (select prorettype from pg_catalog.pg_proc where oid = v_proc_oid) <> 'public.consultation_status'::pg_catalog.regtype::oid then
    raise exception 'Unexpected return type';
  end if;

  if (select proretset from pg_catalog.pg_proc where oid = v_proc_oid) is true then
    raise exception 'Unexpected set returning function';
  end if;

  -- 4. Verify postgres owner
  if (select pg_catalog.pg_get_userbyid(proowner) from pg_catalog.pg_proc where oid = v_proc_oid) <> 'postgres' then
    raise exception 'Unexpected owner';
  end if;

  -- 5. Verify language
  if (select prolang from pg_catalog.pg_proc where oid = v_proc_oid) <> (select oid from pg_catalog.pg_language where lanname = 'plpgsql') then
    raise exception 'Unexpected language';
  end if;

  -- 6. Verify volatility
  if (select provolatile from pg_catalog.pg_proc where oid = v_proc_oid) <> 'v' then
    raise exception 'Unexpected volatility';
  end if;

  -- 7. Verify SECURITY DEFINER
  if (select prosecdef from pg_catalog.pg_proc where oid = v_proc_oid) is false then
    raise exception 'Not SECURITY DEFINER';
  end if;

  -- 8. Verify safe empty search_path
  if not exists (
    select 1
    from pg_catalog.pg_proc
    where oid = v_proc_oid
      and proconfig in (array['search_path='], array['search_path=""'])
  ) then
    raise exception 'Unexpected search_path';
  end if;

  -- 9. Verify body SHA (Canonical Normalization)
  select pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(pg_catalog.regexp_replace(prosrc, '\r\n?', pg_catalog.chr(10), 'g'), 'UTF8')), 'hex')
  into v_body_hash
  from pg_catalog.pg_proc
  where oid = v_proc_oid;
  
  if v_body_hash <> '99033348ce71a1261fcd9f0f674824687758d175da8f0204f7240790a6e67c25' then
    raise exception 'Unexpected function body hash';
  end if;

  -- 10. Verify exact pre-grants (fail-closed against PUBLIC)
  select coalesce(array_agg(
    pg_catalog.format(
      '%s:%s',
      coalesce(role_record.rolname, 'PUBLIC'),
      privilege.is_grantable
    ) order by coalesce(role_record.rolname, 'PUBLIC'), privilege.is_grantable
  ), array[]::text[])
  into v_grants
  from pg_catalog.pg_proc as procedure
  left join pg_catalog.aclexplode(coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) as privilege on true
  left join pg_catalog.pg_roles as role_record on role_record.oid = privilege.grantee
  where procedure.oid = v_proc_oid
    and privilege.grantee <> procedure.proowner
    and privilege.privilege_type = 'EXECUTE';
    
  if v_grants is distinct from array['authenticated:f', 'service_role:f']::text[] then
    raise exception 'Unexpected pre-revoke grants: %', v_grants;
  end if;

  -- THE MUTATION
  revoke execute on function public.record_consultation_outcome(uuid, text) from service_role;

  -- 11. Verify exact post-grants (fail-closed against PUBLIC)
  select coalesce(array_agg(
    pg_catalog.format(
      '%s:%s',
      coalesce(role_record.rolname, 'PUBLIC'),
      privilege.is_grantable
    ) order by coalesce(role_record.rolname, 'PUBLIC'), privilege.is_grantable
  ), array[]::text[])
  into v_grants
  from pg_catalog.pg_proc as procedure
  left join pg_catalog.aclexplode(coalesce(procedure.proacl, pg_catalog.acldefault('f', procedure.proowner))) as privilege on true
  left join pg_catalog.pg_roles as role_record on role_record.oid = privilege.grantee
  where procedure.oid = v_proc_oid
    and privilege.grantee <> procedure.proowner
    and privilege.privilege_type = 'EXECUTE';

  if v_grants is distinct from array['authenticated:f']::text[] then
    raise exception 'Unexpected post-revoke grants: %', v_grants;
  end if;

end;
$$;

commit;

-- >>> supabase/migrations/202608180002_counselor_registration_approval.sql
-- Phase C1: trusted counselor self-registration and Director approval.
-- Passwords remain exclusively in Supabase Auth. The browser cannot set the
-- Auth app-metadata marker used by the counselor-registration trigger branch.

begin;

create type public.counselor_approval_status as enum (
  'pending',
  'approved',
  'rejected'
);

alter type public.counselor_approval_status owner to postgres;

create table public.counselor_accounts (
  user_id uuid primary key
    constraint counselor_accounts_user_id_fkey
      references auth.users(id)
      on delete cascade,
  username text not null
    constraint counselor_accounts_username_key unique,
  approval_status public.counselor_approval_status not null
    default 'pending'::public.counselor_approval_status,
  approved_by uuid
    constraint counselor_accounts_approved_by_fkey
      references auth.users(id),
  approved_at timestamptz,
  rejected_by uuid
    constraint counselor_accounts_rejected_by_fkey
      references auth.users(id),
  rejected_at timestamptz,
  created_at timestamptz not null
    default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null
    default pg_catalog.statement_timestamp(),
  constraint counselor_accounts_username_check
    check (
      username = pg_catalog.lower(pg_catalog.btrim(username))
      and username ~ '^[a-z0-9._-]{3,32}$'
      and username not in (
        'admin',
        'administrator',
        'director',
        'kgeo',
        'root',
        'student',
        'support',
        'system'
      )
    ),
  constraint counselor_accounts_approval_audit_check
    check (
      (
        approval_status = 'pending'::public.counselor_approval_status
        and approved_by is null
        and approved_at is null
        and rejected_by is null
        and rejected_at is null
      )
      or (
        approval_status = 'approved'::public.counselor_approval_status
        and approved_by is not null
        and approved_at is not null
        and rejected_by is null
        and rejected_at is null
      )
      or (
        approval_status = 'rejected'::public.counselor_approval_status
        and approved_by is null
        and approved_at is null
        and rejected_by is not null
        and rejected_at is not null
      )
    )
);

alter table public.counselor_accounts owner to postgres;
alter table public.counselor_accounts enable row level security;
alter table public.counselor_accounts force row level security;

revoke all on table public.counselor_accounts
  from public, anon, authenticated;
grant select on table public.counselor_accounts to authenticated;

create policy counselor_accounts_select_director
on public.counselor_accounts
for select
to authenticated
using (
  public.has_active_verified_kgeo_role(
    'director'::public.user_role
  )
);

create policy counselor_accounts_select_own
on public.counselor_accounts
for select
to authenticated
using ((select auth.uid()) = counselor_accounts.user_id);

comment on table public.counselor_accounts is
  'Server-created counselor username mapping and Director-controlled approval audit state; contains no password material.';

comment on column public.counselor_accounts.username is
  'Normalized lowercase counselor login name. The corresponding technical Auth email is derived only by trusted server code.';

alter table public.profiles
  drop constraint profiles_college_email_check,
  add constraint profiles_college_email_check
    check (
      college_email = pg_catalog.lower(pg_catalog.btrim(college_email))
      and pg_catalog.char_length(college_email) between 3 and 254
      and pg_catalog.char_length(
        pg_catalog.split_part(college_email, '@', 1)
      ) between 1 and 64
      and college_email ~
        '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
      and (
        role in (
          'counselor'::public.user_role,
          'director'::public.user_role
        )
        or (
          role not in (
            'counselor'::public.user_role,
            'director'::public.user_role
          )
          and college_email ~ '^[^@[:space:]]+@kct[.]ac[.]in$'
        )
      )
    );

comment on constraint profiles_college_email_check on public.profiles is
  'Requires normalized valid email; students and admins remain exact-@kct.ac.in, while trusted counselor and Director identity paths may use a valid server-managed email.';

comment on column public.profiles.college_email is
  'Normalized lowercase Auth identity email. Counselor technical identities are server-generated and never accepted from the counselor registration form.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_normalized_email text;
  v_normalized_full_name text;
  v_normalized_username text;
  v_provisioning_token text;
  v_token_hash text;
  v_approved_role public.user_role;
  v_request_time timestamptz := pg_catalog.statement_timestamp();
  v_affected_rows bigint;
begin
  v_normalized_email := pg_catalog.lower(pg_catalog.btrim(new.email));

  if v_normalized_email is null
    or pg_catalog.char_length(v_normalized_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(v_normalized_email, '@', 1)
    ) not between 1 and 64
    or v_normalized_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid email address';
  end if;

  if pg_catalog.jsonb_typeof(
    coalesce(new.raw_app_meta_data, '{}'::jsonb)
      -> 'kgeo_account_type'
  ) = 'string'
    and new.raw_app_meta_data ->> 'kgeo_account_type' =
      'counselor_registration' then
    if pg_catalog.jsonb_typeof(
      new.raw_app_meta_data -> 'kgeo_counselor_full_name'
    ) <> 'string'
      or pg_catalog.jsonb_typeof(
        new.raw_app_meta_data -> 'kgeo_counselor_username'
      ) <> 'string' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO counselor registration is invalid';
    end if;

    v_normalized_full_name := pg_catalog.regexp_replace(
      pg_catalog.btrim(
        new.raw_app_meta_data ->> 'kgeo_counselor_full_name'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    );
    v_normalized_username := pg_catalog.lower(
      pg_catalog.btrim(
        new.raw_app_meta_data ->> 'kgeo_counselor_username'
      )
    );

    if pg_catalog.char_length(v_normalized_full_name) not between 1 and 150
      or v_normalized_username <>
        new.raw_app_meta_data ->> 'kgeo_counselor_username'
      or v_normalized_username !~ '^[a-z0-9._-]{3,32}$'
      or v_normalized_username in (
        'admin',
        'administrator',
        'director',
        'kgeo',
        'root',
        'student',
        'support',
        'system'
      )
      or pg_catalog.split_part(v_normalized_email, '@', 1) <>
        v_normalized_username then
      raise exception using
        errcode = '23514',
        message = 'K-GEO counselor registration is invalid';
    end if;

    insert into public.profiles (
      id,
      college_email,
      role,
      full_name,
      is_active
    )
    values (
      new.id,
      v_normalized_email,
      'counselor'::public.user_role,
      v_normalized_full_name,
      false
    );

    insert into public.counselor_accounts (
      user_id,
      username,
      approval_status
    )
    values (
      new.id,
      v_normalized_username,
      'pending'::public.counselor_approval_status
    );

    return new;
  end if;

  if coalesce(new.raw_user_meta_data, '{}'::jsonb)
    ? 'kgeo_staff_provisioning_token' then
    if pg_catalog.jsonb_typeof(
      new.raw_user_meta_data -> 'kgeo_staff_provisioning_token'
    ) <> 'string' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    v_provisioning_token :=
      new.raw_user_meta_data ->> 'kgeo_staff_provisioning_token';

    if v_provisioning_token !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    v_token_hash := pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(v_provisioning_token, 'UTF8')
      ),
      'hex'
    );

    select request.approved_role
    into v_approved_role
    from private.kgeo_staff_provisioning_requests as request
    where request.normalized_email = v_normalized_email
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time
    for update;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    if v_approved_role not in (
      'counselor'::public.user_role,
      'director'::public.user_role
    )
      or (
        v_approved_role = 'counselor'::public.user_role
        and v_normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$'
      ) then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    update private.kgeo_staff_provisioning_requests as request
    set consumed_at = v_request_time
    where request.normalized_email = v_normalized_email
      and request.approved_role = v_approved_role
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    insert into public.profiles (
      id,
      college_email,
      role,
      full_name,
      is_active
    )
    values (
      new.id,
      v_normalized_email,
      v_approved_role,
      null,
      true
    );

    return new;
  end if;

  if v_normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid @kct.ac.in email address';
  end if;

  if not (
    coalesce(new.raw_user_meta_data, '{}'::jsonb) ? 'full_name'
  )
    or pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'full_name')
      <> 'string' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  v_normalized_full_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(v_normalized_full_name) not between 1 and 150 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  insert into public.profiles (
    id,
    college_email,
    role,
    full_name,
    is_active
  )
  values (
    new.id,
    v_normalized_email,
    'student'::public.user_role,
    v_normalized_full_name,
    true
  );

  return new;
end;
$function$;

alter function public.handle_new_user() owner to postgres;

comment on function public.handle_new_user() is
  'Creates a pending counselor only from trusted Auth app metadata, consumes a matching private staff request, or creates an exact-@kct.ac.in student; browser metadata never assigns a role.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

create or replace function public.list_director_counselor_accounts()
returns table (
  user_id uuid,
  full_name text,
  username text,
  approval_status public.counselor_approval_status,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or not public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  return query
  select
    account.user_id,
    profile.full_name,
    account.username,
    account.approval_status,
    profile.is_active,
    account.created_at
  from public.counselor_accounts as account
  join public.profiles as profile
    on profile.id = account.user_id
  where profile.role = 'counselor'::public.user_role
  order by account.created_at desc, account.user_id
  limit 500;
end;
$function$;

alter function public.list_director_counselor_accounts() owner to postgres;

comment on function public.list_director_counselor_accounts() is
  'Returns a bounded, technical-email-free counselor approval inventory only to an active verified Director.';

revoke all on function public.list_director_counselor_accounts()
  from public, anon, authenticated;
grant execute on function public.list_director_counselor_accounts()
  to authenticated;

create or replace function public.approve_counselor(p_user_id uuid)
returns public.counselor_approval_status
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_director_id uuid := (select auth.uid());
  v_approval_status public.counselor_approval_status;
  v_profile_role public.user_role;
  v_profile_is_active boolean;
  v_affected_rows bigint;
  v_changed_at timestamptz := pg_catalog.statement_timestamp();
begin
  if v_director_id is null
    or not public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  select
    account.approval_status,
    profile.role,
    profile.is_active
  into
    v_approval_status,
    v_profile_role,
    v_profile_is_active
  from public.counselor_accounts as account
  join public.profiles as profile
    on profile.id = account.user_id
  where account.user_id = p_user_id
  for update of account, profile;

  if not found
    or v_profile_role <> 'counselor'::public.user_role
    or v_approval_status <>
      'pending'::public.counselor_approval_status
    or v_profile_is_active then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor approval target is invalid';
  end if;

  update public.counselor_accounts as account
  set
    approval_status = 'approved'::public.counselor_approval_status,
    approved_by = v_director_id,
    approved_at = v_changed_at,
    rejected_by = null,
    rejected_at = null,
    updated_at = v_changed_at
  where account.user_id = p_user_id
    and account.approval_status =
      'pending'::public.counselor_approval_status;

  get diagnostics v_affected_rows = row_count;

  if v_affected_rows <> 1 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor approval transition failed';
  end if;

  update public.profiles as profile
  set
    is_active = true,
    updated_at = v_changed_at
  where profile.id = p_user_id
    and profile.role = 'counselor'::public.user_role
    and not profile.is_active;

  get diagnostics v_affected_rows = row_count;

  if v_affected_rows <> 1 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor activation failed';
  end if;

  return 'approved'::public.counselor_approval_status;
end;
$function$;

alter function public.approve_counselor(uuid) owner to postgres;

comment on function public.approve_counselor(uuid) is
  'Atomically locks and approves one pending inactive counselor; only an active verified Director may execute it.';

revoke all on function public.approve_counselor(uuid)
  from public, anon, authenticated;
grant execute on function public.approve_counselor(uuid)
  to authenticated;

create or replace function public.reject_counselor(p_user_id uuid)
returns public.counselor_approval_status
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_director_id uuid := (select auth.uid());
  v_approval_status public.counselor_approval_status;
  v_profile_role public.user_role;
  v_profile_is_active boolean;
  v_affected_rows bigint;
  v_changed_at timestamptz := pg_catalog.statement_timestamp();
begin
  if v_director_id is null
    or not public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  select
    account.approval_status,
    profile.role,
    profile.is_active
  into
    v_approval_status,
    v_profile_role,
    v_profile_is_active
  from public.counselor_accounts as account
  join public.profiles as profile
    on profile.id = account.user_id
  where account.user_id = p_user_id
  for update of account, profile;

  if not found
    or v_profile_role <> 'counselor'::public.user_role
    or v_approval_status <>
      'pending'::public.counselor_approval_status
    or v_profile_is_active then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor rejection target is invalid';
  end if;

  update public.counselor_accounts as account
  set
    approval_status = 'rejected'::public.counselor_approval_status,
    approved_by = null,
    approved_at = null,
    rejected_by = v_director_id,
    rejected_at = v_changed_at,
    updated_at = v_changed_at
  where account.user_id = p_user_id
    and account.approval_status =
      'pending'::public.counselor_approval_status;

  get diagnostics v_affected_rows = row_count;

  if v_affected_rows <> 1 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor rejection transition failed';
  end if;

  update public.profiles as profile
  set
    is_active = false,
    updated_at = v_changed_at
  where profile.id = p_user_id
    and profile.role = 'counselor'::public.user_role
    and not profile.is_active;

  get diagnostics v_affected_rows = row_count;

  if v_affected_rows <> 1 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor rejection state failed';
  end if;

  return 'rejected'::public.counselor_approval_status;
end;
$function$;

alter function public.reject_counselor(uuid) owner to postgres;

comment on function public.reject_counselor(uuid) is
  'Atomically locks and rejects one pending inactive counselor; only an active verified Director may execute it.';

revoke all on function public.reject_counselor(uuid)
  from public, anon, authenticated;
grant execute on function public.reject_counselor(uuid)
  to authenticated;

commit;

-- >>> supabase/migrations/202608200001_counselor_registration_insert_timing_fix.sql
-- K-GEO C1 corrective migration: authorize counselor self-registration with
-- a private, short-lived, one-time request visible during the Auth INSERT.

begin;

create table private.kgeo_counselor_registration_requests (
  normalized_email text primary key,
  normalized_full_name text not null,
  normalized_username text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null
    default pg_catalog.statement_timestamp(),
  constraint kgeo_counselor_registration_requests_email_check
    check (
      normalized_email = pg_catalog.lower(
        pg_catalog.btrim(normalized_email)
      )
      and pg_catalog.char_length(normalized_email) between 3 and 254
      and pg_catalog.char_length(
        pg_catalog.split_part(normalized_email, '@', 1)
      ) between 1 and 64
      and normalized_email ~
        '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
      and normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$'
      and normalized_email !~ '^[^@[:space:]]+@kclas[.]ac[.]in$'
      and pg_catalog.split_part(normalized_email, '@', 1) =
        normalized_username
    ),
  constraint kgeo_counselor_registration_requests_full_name_check
    check (
      normalized_full_name = pg_catalog.regexp_replace(
        pg_catalog.btrim(normalized_full_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(normalized_full_name) between 1 and 150
    ),
  constraint kgeo_counselor_registration_requests_username_check
    check (
      normalized_username = pg_catalog.lower(
        pg_catalog.btrim(normalized_username)
      )
      and normalized_username ~ '^[a-z0-9._-]{3,32}$'
      and normalized_username not in (
        'admin',
        'administrator',
        'director',
        'kgeo',
        'root',
        'student',
        'support',
        'system'
      )
    ),
  constraint kgeo_counselor_registration_requests_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint kgeo_counselor_registration_requests_expiry_check
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '15 minutes'
    ),
  constraint kgeo_counselor_registration_requests_consumed_check
    check (consumed_at is null or consumed_at >= created_at)
);

alter table private.kgeo_counselor_registration_requests owner to postgres;
alter table private.kgeo_counselor_registration_requests
  enable row level security;

revoke all on table private.kgeo_counselor_registration_requests
  from public, anon, authenticated, service_role;

comment on table private.kgeo_counselor_registration_requests is
  'Private short-lived counselor self-registration requests; stores trusted normalized identity fields and a SHA-256 token hash, never a password or raw token.';

comment on column private.kgeo_counselor_registration_requests.token_hash is
  'Unique lowercase hexadecimal SHA-256 hash of the temporary high-entropy token.';

create or replace function public.prepare_counselor_registration_provisioning(
  p_email text,
  p_full_name text,
  p_username text,
  p_token_hash text,
  p_expires_at timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_request_time timestamptz := pg_catalog.statement_timestamp();
  v_affected_rows bigint;
begin
  if p_email is null
    or p_email <> pg_catalog.lower(pg_catalog.btrim(p_email))
    or pg_catalog.char_length(p_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(p_email, '@', 1)
    ) not between 1 and 64
    or p_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    or p_email ~ '^[^@[:space:]]+@kct[.]ac[.]in$'
    or p_email ~ '^[^@[:space:]]+@kclas[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor registration request is invalid';
  end if;

  if p_full_name is null
    or p_full_name <> pg_catalog.regexp_replace(
      pg_catalog.btrim(p_full_name),
      '[[:space:]]+',
      ' ',
      'g'
    )
    or pg_catalog.char_length(p_full_name) not between 1 and 150 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor registration request is invalid';
  end if;

  if p_username is null
    or p_username <> pg_catalog.lower(pg_catalog.btrim(p_username))
    or p_username !~ '^[a-z0-9._-]{3,32}$'
    or p_username in (
      'admin',
      'administrator',
      'director',
      'kgeo',
      'root',
      'student',
      'support',
      'system'
    )
    or pg_catalog.split_part(p_email, '@', 1) <> p_username then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor registration request is invalid';
  end if;

  if p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor registration request is invalid';
  end if;

  if p_expires_at is null
    or p_expires_at <= v_request_time
    or p_expires_at > v_request_time + interval '15 minutes' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor registration request is invalid';
  end if;

  insert into private.kgeo_counselor_registration_requests (
    normalized_email,
    normalized_full_name,
    normalized_username,
    token_hash,
    expires_at,
    consumed_at,
    created_at
  )
  values (
    p_email,
    p_full_name,
    p_username,
    p_token_hash,
    p_expires_at,
    null,
    v_request_time
  )
  on conflict (normalized_email) do update
    set normalized_full_name = excluded.normalized_full_name,
        normalized_username = excluded.normalized_username,
        token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        consumed_at = null,
        created_at = excluded.created_at
    where private.kgeo_counselor_registration_requests.consumed_at
        is not null
       or private.kgeo_counselor_registration_requests.expires_at <=
        v_request_time;

  get diagnostics v_affected_rows = row_count;

  if v_affected_rows <> 1 then
    raise exception using
      errcode = '23505',
      message = 'K-GEO counselor registration request is already active';
  end if;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'K-GEO counselor registration request conflicts with an active request';
end;
$function$;

alter function public.prepare_counselor_registration_provisioning(
  text,
  text,
  text,
  text,
  timestamptz
) owner to postgres;

comment on function public.prepare_counselor_registration_provisioning(
  text,
  text,
  text,
  text,
  timestamptz
) is
  'Registers one private short-lived counselor self-registration token hash and normalized identity; callable only by service_role and returns no secret.';

revoke all on function public.prepare_counselor_registration_provisioning(
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.prepare_counselor_registration_provisioning(
  text,
  text,
  text,
  text,
  timestamptz
) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_normalized_email text;
  v_normalized_full_name text;
  v_normalized_username text;
  v_provisioning_token text;
  v_token_hash text;
  v_approved_role public.user_role;
  v_request_time timestamptz := pg_catalog.statement_timestamp();
  v_affected_rows bigint;
begin
  v_normalized_email := pg_catalog.lower(pg_catalog.btrim(new.email));

  if v_normalized_email is null
    or pg_catalog.char_length(v_normalized_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(v_normalized_email, '@', 1)
    ) not between 1 and 64
    or v_normalized_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid email address';
  end if;

  if coalesce(new.raw_user_meta_data, '{}'::jsonb)
    ? 'kgeo_staff_provisioning_token' then
    if pg_catalog.jsonb_typeof(
      new.raw_user_meta_data -> 'kgeo_staff_provisioning_token'
    ) <> 'string' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    v_provisioning_token :=
      new.raw_user_meta_data ->> 'kgeo_staff_provisioning_token';

    if v_provisioning_token !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    v_token_hash := pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(v_provisioning_token, 'UTF8')
      ),
      'hex'
    );

    select
      request.normalized_full_name,
      request.normalized_username
    into
      v_normalized_full_name,
      v_normalized_username
    from private.kgeo_counselor_registration_requests as request
    where request.normalized_email = v_normalized_email
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time
    for update;

    if found then
      if not (
        coalesce(new.raw_user_meta_data, '{}'::jsonb)
          ? 'kgeo_counselor_full_name'
      )
        or not (
          coalesce(new.raw_user_meta_data, '{}'::jsonb)
            ? 'kgeo_counselor_username'
        )
        or pg_catalog.jsonb_typeof(
          new.raw_user_meta_data -> 'kgeo_counselor_full_name'
        ) is distinct from 'string'
        or pg_catalog.jsonb_typeof(
          new.raw_user_meta_data -> 'kgeo_counselor_username'
        ) is distinct from 'string'
        or pg_catalog.regexp_replace(
          pg_catalog.btrim(
            new.raw_user_meta_data ->> 'kgeo_counselor_full_name'
          ),
          '[[:space:]]+',
          ' ',
          'g'
        ) <> v_normalized_full_name
        or pg_catalog.lower(
          pg_catalog.btrim(
            new.raw_user_meta_data ->> 'kgeo_counselor_username'
          )
        ) <> v_normalized_username
        or v_normalized_username !~ '^[a-z0-9._-]{3,32}$'
        or v_normalized_username in (
          'admin',
          'administrator',
          'director',
          'kgeo',
          'root',
          'student',
          'support',
          'system'
        )
        or pg_catalog.split_part(v_normalized_email, '@', 1) <>
          v_normalized_username then
        raise exception using
          errcode = '23514',
          message = 'K-GEO counselor registration is invalid';
      end if;

      update private.kgeo_counselor_registration_requests as request
      set consumed_at = v_request_time
      where request.normalized_email = v_normalized_email
        and request.normalized_full_name = v_normalized_full_name
        and request.normalized_username = v_normalized_username
        and request.token_hash = v_token_hash
        and request.consumed_at is null
        and request.expires_at > v_request_time;

      get diagnostics v_affected_rows = row_count;

      if v_affected_rows <> 1 then
        raise exception using
          errcode = '23514',
          message = 'K-GEO counselor registration is invalid';
      end if;

      insert into public.profiles (
        id,
        college_email,
        role,
        full_name,
        is_active
      )
      values (
        new.id,
        v_normalized_email,
        'counselor'::public.user_role,
        v_normalized_full_name,
        false
      );

      insert into public.counselor_accounts (
        user_id,
        username,
        approval_status
      )
      values (
        new.id,
        v_normalized_username,
        'pending'::public.counselor_approval_status
      );

      return new;
    end if;

    select request.approved_role
    into v_approved_role
    from private.kgeo_staff_provisioning_requests as request
    where request.normalized_email = v_normalized_email
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time
    for update;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    if v_approved_role not in (
      'counselor'::public.user_role,
      'director'::public.user_role
    )
      or (
        v_approved_role = 'counselor'::public.user_role
        and v_normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$'
      ) then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    update private.kgeo_staff_provisioning_requests as request
    set consumed_at = v_request_time
    where request.normalized_email = v_normalized_email
      and request.approved_role = v_approved_role
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    insert into public.profiles (
      id,
      college_email,
      role,
      full_name,
      is_active
    )
    values (
      new.id,
      v_normalized_email,
      v_approved_role,
      null,
      true
    );

    return new;
  end if;

  if v_normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid @kct.ac.in email address';
  end if;

  if not (
    coalesce(new.raw_user_meta_data, '{}'::jsonb) ? 'full_name'
  )
    or pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'full_name')
      <> 'string' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  v_normalized_full_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(v_normalized_full_name) not between 1 and 150 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  insert into public.profiles (
    id,
    college_email,
    role,
    full_name,
    is_active
  )
  values (
    new.id,
    v_normalized_email,
    'student'::public.user_role,
    v_normalized_full_name,
    true
  );

  return new;
end;
$function$;

alter function public.handle_new_user() owner to postgres;

comment on function public.handle_new_user() is
  'Creates an exact-@kct.ac.in student, consumes a dedicated private request for a pending counselor registration, or consumes the existing private staff request for an active counselor/Director; metadata roles never authorize.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

commit;

-- >>> supabase/migrations/202608210001_kgeo_public_progress_publishing.sql
-- K-GEO Phase D1.2 manually maintained public organisational statistics.
-- Review this migration before applying it. It does not read or modify
-- operational Student, Counselor, consultation, application, or progression data.

begin;

create table public.kgeo_public_progress (
  singleton boolean primary key default true,
  registered_for_advisory bigint not null,
  applications_initiated bigint not null,
  applications_submitted bigint not null,
  offers_received bigint not null,
  confirmed_acceptance bigint not null,
  visa_approved bigint not null,
  enrolled_overseas bigint not null,
  updated_by uuid not null
    references public.profiles (id) on update restrict on delete restrict,
  updated_at timestamp with time zone not null,
  constraint kgeo_public_progress_singleton_check check (singleton is true),
  constraint kgeo_public_progress_values_nonnegative check (
    registered_for_advisory >= 0
    and applications_initiated >= 0
    and applications_submitted >= 0
    and offers_received >= 0
    and confirmed_acceptance >= 0
    and visa_approved >= 0
    and enrolled_overseas >= 0
  )
);

alter table public.kgeo_public_progress owner to postgres;
alter table public.kgeo_public_progress enable row level security;
alter table public.kgeo_public_progress force row level security;

revoke all on table public.kgeo_public_progress
  from public, anon, authenticated, service_role;

comment on table public.kgeo_public_progress is
  'The single Director-maintained, non-PII public K-GEO organisational statistics record.';

create function public.publish_kgeo_public_progress(
  p_registered_for_advisory bigint,
  p_applications_initiated bigint,
  p_applications_submitted bigint,
  p_offers_received bigint,
  p_confirmed_acceptance bigint,
  p_visa_approved bigint,
  p_enrolled_overseas bigint
)
returns table (
  published_at timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_director_id uuid;
  v_published_at timestamp with time zone;
begin
  v_director_id := (select auth.uid());

  if v_director_id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'K-GEO public statistics publishing is unavailable.';
  end if;

  if p_registered_for_advisory is null
    or p_applications_initiated is null
    or p_applications_submitted is null
    or p_offers_received is null
    or p_confirmed_acceptance is null
    or p_visa_approved is null
    or p_enrolled_overseas is null then
    raise exception using
      errcode = '22004',
      message = 'All seven K-GEO public statistics are required.';
  end if;

  if p_registered_for_advisory < 0
    or p_applications_initiated < 0
    or p_applications_submitted < 0
    or p_offers_received < 0
    or p_confirmed_acceptance < 0
    or p_visa_approved < 0
    or p_enrolled_overseas < 0 then
    raise exception using
      errcode = '22023',
      message = 'K-GEO public statistics cannot be negative.';
  end if;

  v_published_at := pg_catalog.statement_timestamp();

  insert into public.kgeo_public_progress (
    singleton,
    registered_for_advisory,
    applications_initiated,
    applications_submitted,
    offers_received,
    confirmed_acceptance,
    visa_approved,
    enrolled_overseas,
    updated_by,
    updated_at
  ) values (
    true,
    p_registered_for_advisory,
    p_applications_initiated,
    p_applications_submitted,
    p_offers_received,
    p_confirmed_acceptance,
    p_visa_approved,
    p_enrolled_overseas,
    v_director_id,
    v_published_at
  )
  on conflict (singleton) do update
  set registered_for_advisory = excluded.registered_for_advisory,
      applications_initiated = excluded.applications_initiated,
      applications_submitted = excluded.applications_submitted,
      offers_received = excluded.offers_received,
      confirmed_acceptance = excluded.confirmed_acceptance,
      visa_approved = excluded.visa_approved,
      enrolled_overseas = excluded.enrolled_overseas,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  return query select v_published_at;
end;
$function$;

alter function public.publish_kgeo_public_progress(
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
) owner to postgres;
revoke all on function public.publish_kgeo_public_progress(
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
) from public, anon, authenticated;
grant execute on function public.publish_kgeo_public_progress(
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
) to authenticated;

comment on function public.publish_kgeo_public_progress(
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
) is
  'Atomically saves all seven public organisational statistics as the active verified Director.';

create function public.get_public_kgeo_progress()
returns table (
  registered_for_advisory bigint,
  applications_initiated bigint,
  applications_submitted bigint,
  offers_received bigint,
  confirmed_acceptance bigint,
  visa_approved bigint,
  enrolled_overseas bigint,
  published_at timestamp with time zone
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    progress.registered_for_advisory,
    progress.applications_initiated,
    progress.applications_submitted,
    progress.offers_received,
    progress.confirmed_acceptance,
    progress.visa_approved,
    progress.enrolled_overseas,
    progress.updated_at as published_at
  from public.kgeo_public_progress as progress
  where progress.singleton is true;
$function$;

alter function public.get_public_kgeo_progress() owner to postgres;
revoke all on function public.get_public_kgeo_progress()
  from public, anon, authenticated;
grant execute on function public.get_public_kgeo_progress()
  to anon, authenticated;

comment on function public.get_public_kgeo_progress() is
  'Returns only seven non-PII public organisational statistics and their publication timestamp.';

commit;

-- >>> supabase/migrations/202608210002_counselor_student_workspace_read_security.sql
-- K-GEO Final Client Review Step 2: Counselor Student Workspace read security.
-- Detailed student data is readable by a counselor only while that counselor
-- owns the student's current active Primary Counselor assignment.

begin;

-- This existing predicate derives the counselor identity from auth.uid() and
-- checks the one active assignment (ended_at is null). It returns only a
-- boolean and is therefore safe to expose to authenticated RLS evaluation.
revoke all on function public.is_active_primary_counselor_for_student(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.is_active_primary_counselor_for_student(uuid)
  to authenticated;

-- Remove the four historical Counselor-wide direct-read branches.
drop policy student_profiles_select_counselor_all
  on public.student_profiles;
drop policy student_preferences_select_counselor_all
  on public.student_preferences;
drop policy student_test_scores_select_counselor_all
  on public.student_test_scores;
drop policy student_achievements_select_counselor_all
  on public.student_achievements;

create policy student_profiles_select_primary_counselor
on public.student_profiles
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_profiles.student_id
  ))
);

create policy student_preferences_select_primary_counselor
on public.student_preferences
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_preferences.student_id
  ))
);

create policy student_test_scores_select_primary_counselor
on public.student_test_scores
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_test_scores.student_id
  ))
);

create policy student_achievements_select_primary_counselor
on public.student_achievements
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_achievements.student_id
  ))
);

-- Director organization-wide reads are a separate, role-derived branch.
-- Student-own policies from the historical foundation remain unchanged.
create policy student_profiles_select_director_all
on public.student_profiles
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ))
);

create policy student_preferences_select_director_all
on public.student_preferences
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ))
);

create policy student_test_scores_select_director_all
on public.student_test_scores
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ))
);

create policy student_achievements_select_director_all
on public.student_achievements
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ))
);

comment on policy student_profiles_select_primary_counselor
  on public.student_profiles is
  'Only the current active Primary Counselor may read a student detailed profile.';
comment on policy student_preferences_select_primary_counselor
  on public.student_preferences is
  'Only the current active Primary Counselor may read a student preferences.';
comment on policy student_test_scores_select_primary_counselor
  on public.student_test_scores is
  'Only the current active Primary Counselor may read student test records.';
comment on policy student_achievements_select_primary_counselor
  on public.student_achievements is
  'Only the current active Primary Counselor may read student achievements.';

-- Current Student 360 institutional reads must follow the same assignment
-- boundary. These policies do not change any mutation grant or trigger.
drop policy student_counseling_progressions_select_counselor
  on public.student_counseling_progressions;
drop policy student_counseling_progression_events_select_counselor
  on public.student_counseling_progression_events;
drop policy progression_event_corrections_select_counselor
  on public.student_counseling_progression_event_corrections;
drop policy progression_evidence_select_counselor
  on public.student_counseling_progression_evidence;
drop policy student_university_applications_select_counselor
  on public.student_university_applications;
drop policy student_university_application_events_select_counselor
  on public.student_university_application_events;
drop policy university_application_documents_select_counselor
  on public.student_university_application_documents;

create policy student_counseling_progressions_select_primary_counselor
on public.student_counseling_progressions
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_counseling_progressions.student_id
  ))
);

create policy student_counseling_progression_events_select_primary_counselor
on public.student_counseling_progression_events
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_counseling_progression_events.student_id
  ))
);

create policy progression_event_corrections_select_primary_counselor
on public.student_counseling_progression_event_corrections
for select
to authenticated
using (
  exists (
    select 1
    from public.student_counseling_progression_events as event
    where event.id =
      student_counseling_progression_event_corrections.target_event_id
      and public.is_active_primary_counselor_for_student(
        event.student_id
      ) is true
  )
);

create policy progression_evidence_select_primary_counselor
on public.student_counseling_progression_evidence
for select
to authenticated
using (
  exists (
    select 1
    from public.student_counseling_progression_events as event
    where event.id =
      student_counseling_progression_evidence.progression_event_id
      and public.is_active_primary_counselor_for_student(
        event.student_id
      ) is true
  )
);

create policy student_university_applications_select_primary_counselor
on public.student_university_applications
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_university_applications.student_id
  ))
);

create policy student_university_application_events_select_primary_counselor
on public.student_university_application_events
for select
to authenticated
using (
  exists (
    select 1
    from public.student_university_applications as application
    where application.id =
      student_university_application_events.application_id
      and public.is_active_primary_counselor_for_student(
        application.student_id
      ) is true
  )
);

create policy university_application_documents_select_primary_counselor
on public.student_university_application_documents
for select
to authenticated
using (
  status = 'available'::public.university_application_document_status
  and exists (
    select 1
    from public.student_university_applications as application
    where application.id =
      student_university_application_documents.application_id
      and public.is_active_primary_counselor_for_student(
        application.student_id
      ) is true
  )
);

-- Preserve the established UUID-to-identity signature while turning it into
-- the common fail-closed Student Workspace entry boundary.
create or replace function public.get_counselor_student_identity(
  p_student_id uuid
)
returns table (
  student_id uuid,
  full_name text,
  college_email text,
  account_created_at timestamptz,
  is_active boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_student_id is null
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    return;
  end if;

  return query
  select
    student_account.id,
    student_account.full_name,
    student_account.college_email,
    student_account.created_at,
    student_account.is_active
  from public.profiles as student_account
  where student_account.id = p_student_id
    and student_account.role = 'student'::public.user_role;
exception
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The student identity is temporarily unavailable';
end;
$function$;

alter function public.get_counselor_student_identity(uuid)
  owner to postgres;

revoke all on function public.get_counselor_student_identity(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.get_counselor_student_identity(uuid)
  to authenticated;

comment on function public.get_counselor_student_identity(uuid) is
  'Returns one student identity only to that student current active Primary Counselor.';

-- The historical correction-context RPC is security-definer and therefore
-- must enforce assignment ownership itself instead of relying on table RLS.
create or replace function
  public.get_counselor_progression_correction_context(
    p_student_id uuid,
    p_event_ids uuid[]
  )
returns table (
  target_event_id uuid,
  correction_id uuid,
  correction_type public.counseling_progression_correction_type,
  restored_stage public.counseling_progression_stage,
  restored_state public.counseling_progression_state,
  restored_stage_started_at timestamptz,
  correction_reason text,
  corrected_at timestamptz,
  effective_event_exists boolean,
  latest_effective_event_id uuid,
  latest_effective_stage public.counseling_progression_stage,
  latest_effective_state public.counseling_progression_state,
  latest_effective_changed_at timestamptz,
  latest_effective_changed_by uuid,
  total_correction_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  requested_count integer;
  distinct_count integer;
  effective_event public.student_counseling_progression_events%rowtype;
  effective_exists boolean;
  correction_count bigint;
begin
  if public.is_active_primary_counselor_for_student(p_student_id)
    is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor access is required';
  end if;

  requested_count := pg_catalog.cardinality(p_event_ids);

  if requested_count is null
    or requested_count < 1
    or requested_count > 20
    or pg_catalog.array_position(p_event_ids, null) is not null then
    raise exception using
      errcode = '22023',
      message = 'The progression correction read request is invalid';
  end if;

  select pg_catalog.count(distinct requested.event_id)::integer
  into distinct_count
  from pg_catalog.unnest(p_event_ids) as requested(event_id);

  if distinct_count <> requested_count
    or (
      select pg_catalog.count(*)::integer
      from public.student_counseling_progression_events as event
      where event.student_id = p_student_id
        and event.id = any(p_event_ids)
    ) <> requested_count then
    raise exception using
      errcode = '22023',
      message = 'The progression correction read request is invalid';
  end if;

  select event.*
  into effective_event
  from public.student_counseling_progression_events as event
  where event.student_id = p_student_id
    and not exists (
      select 1
      from public.student_counseling_progression_event_corrections
        as correction
      where correction.target_event_id = event.id
    )
  order by event.changed_at desc, event.id desc
  limit 1;

  effective_exists := found;

  select pg_catalog.count(*)
  into correction_count
  from public.student_counseling_progression_event_corrections
    as correction
  inner join public.student_counseling_progression_events as event
    on event.id = correction.target_event_id
  where event.student_id = p_student_id;

  return query
  select
    requested.event_id,
    correction.id,
    correction.correction_type,
    correction.restored_stage,
    correction.restored_state,
    correction.restored_stage_started_at,
    correction.correction_reason,
    correction.corrected_at,
    effective_exists,
    case when effective_exists then effective_event.id else null end,
    case
      when effective_exists then effective_event.new_stage
      else null
    end,
    case
      when effective_exists then effective_event.new_state
      else null
    end,
    case
      when effective_exists then effective_event.changed_at
      else null
    end,
    case
      when effective_exists then effective_event.changed_by
      else null
    end,
    correction_count
  from pg_catalog.unnest(p_event_ids) with ordinality
    as requested(event_id, position)
  left join public.student_counseling_progression_event_corrections
    as correction
    on correction.target_event_id = requested.event_id
  order by requested.position;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor access is required';
  when invalid_parameter_value then
    raise exception using
      errcode = '22023',
      message = 'The progression correction read request is invalid';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Official progression corrections could not be loaded';
end;
$function$;

alter function
  public.get_counselor_progression_correction_context(uuid, uuid[])
  owner to postgres;

revoke all on function
  public.get_counselor_progression_correction_context(uuid, uuid[])
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_counselor_progression_correction_context(uuid, uuid[])
  to authenticated;

-- Application-document metadata and private Storage paths remain available
-- only for applications owned by the caller's active Primary Counselor case.
create or replace function public.list_university_application_documents(
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
  v_student_id uuid;
begin
  select application.student_id
  into v_student_id
  from public.student_university_applications as application
  where application.id = p_application_id;

  if public.is_active_primary_counselor_for_student(v_student_id)
    is distinct from true then
    raise exception using
      errcode = '42501',
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
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Documents are temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Documents are temporarily unavailable.';
end;
$function$;

create or replace function public.authorize_university_application_document_view(
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
  v_student_id uuid;
begin
  select application.student_id
  into v_student_id
  from public.student_university_applications as application
  where application.id = p_application_id;

  if p_document_id is null
    or public.is_active_primary_counselor_for_student(v_student_id)
      is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Document could not be opened.';
  end if;

  return query
  select
    document.id,
    document.application_id,
    document.bucket_id,
    document.storage_path
  from public.student_university_application_documents as document
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

create or replace function public.can_view_university_application_document_object(
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
        and public.is_active_primary_counselor_for_student(
          application.student_id
        ) is true
    )
  );
exception
  when others then
    return false;
end;
$function$;

alter function public.list_university_application_documents(uuid)
  owner to postgres;
alter function public.authorize_university_application_document_view(uuid, uuid)
  owner to postgres;
alter function public.can_view_university_application_document_object(text, text)
  owner to postgres;

revoke all on function public.list_university_application_documents(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.authorize_university_application_document_view(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.can_view_university_application_document_object(text, text)
  from public, anon, authenticated, service_role;

grant execute on function public.list_university_application_documents(uuid)
  to authenticated;
grant execute on function public.authorize_university_application_document_view(uuid, uuid)
  to authenticated;
grant execute on function public.can_view_university_application_document_object(text, text)
  to authenticated;

commit;

-- >>> supabase/migrations/202608210003_director_primary_counselor_assignment.sql
-- K-GEO Step 2.5 Director-controlled Primary Counselor assignment.
-- Consultation ownership and the FCFS claim contract remain unchanged.

begin;

alter table public.student_counselor_assignments
  add column assignment_reason text;

alter table public.student_counselor_assignments
  add constraint student_counselor_assignments_reason_check
  check (
    assignment_reason is null
    or (
      pg_catalog.char_length(assignment_reason) between 1 and 300
      and assignment_reason = pg_catalog.regexp_replace(
        pg_catalog.btrim(assignment_reason),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and assignment_reason !~ '[[:cntrl:]]'
    )
  );

comment on column public.student_counselor_assignments.assignment_reason is
  'Normalized Director-supplied assignment reason; NULL is reserved for historical and FCFS-created assignments.';

-- Preserve the append-only history contract while sealing the newly added
-- reason field against later edits.
create or replace function public.protect_student_counselor_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_role public.user_role;
  v_counselor_role public.user_role;
  v_actor_role public.user_role;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '42501',
      message = 'Primary counselor assignment history cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.student_id is distinct from old.student_id
      or new.counselor_id is distinct from old.counselor_id
      or new.assigned_at is distinct from old.assigned_at
      or new.assigned_by is distinct from old.assigned_by
      or new.assignment_reason is distinct from old.assignment_reason
      or new.created_at is distinct from old.created_at
      or old.ended_at is not null
      or new.ended_at is null then
      raise exception using
        errcode = '42501',
        message = 'Primary counselor assignment history is immutable';
    end if;
  end if;

  select profile.role
  into v_student_role
  from public.profiles as profile
  where profile.id = new.student_id;

  select profile.role
  into v_counselor_role
  from public.profiles as profile
  where profile.id = new.counselor_id;

  select profile.role
  into v_actor_role
  from public.profiles as profile
  where profile.id = new.assigned_by;

  if v_student_role is distinct from 'student'::public.user_role
    or v_counselor_role is distinct from 'counselor'::public.user_role
    or v_actor_role is null
    or v_actor_role not in (
      'counselor'::public.user_role,
      'director'::public.user_role
    )
    or (
      tg_op = 'INSERT'
      and v_actor_role = 'director'::public.user_role
      and new.assignment_reason is null
    ) then
    raise exception using
      errcode = '23514',
      message = 'Primary counselor assignment participants are invalid';
  end if;

  return new;
end;
$function$;

alter function public.protect_student_counselor_assignment_history()
  owner to postgres;

revoke all on function public.protect_student_counselor_assignment_history()
  from public, anon, authenticated, service_role;

create function public.reassign_primary_counselor(
  p_student_id uuid,
  p_counselor_id uuid,
  p_reason text
)
returns table (
  assignment_id uuid,
  assigned_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_director_id uuid := (select auth.uid());
  v_assignment_id uuid;
  v_assignment_time timestamptz;
  v_current_counselor_id uuid;
  v_reason text;
begin
  if v_director_id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  if p_student_id is null
    or p_counselor_id is null
    or p_student_id = p_counselor_id then
    raise exception using
      errcode = '22023',
      message = 'Primary counselor assignment inputs are invalid';
  end if;

  if p_reason is null or p_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'Primary counselor assignment reason is invalid';
  end if;

  v_reason := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_reason),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if v_reason is null
    or pg_catalog.char_length(v_reason) not between 1 and 300 then
    raise exception using
      errcode = '22023',
      message = 'Primary counselor assignment reason is invalid';
  end if;

  -- Serializing on the Student profile makes two Director requests for the
  -- same Student deterministic before either can inspect the active row.
  perform 1
  from public.profiles as student_profile
  where student_profile.id = p_student_id
    and student_profile.role = 'student'::public.user_role
  for update;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Primary counselor assignment student is invalid';
  end if;

  -- Use the same lock order as consultation operations: unresolved
  -- consultation rows are locked before the active assignment row. Pending
  -- rows are included so a concurrent FCFS claim has a deterministic order;
  -- final consultation history is neither locked nor rewritten.
  perform 1
  from public.consultation_requests as request
  where request.student_id = p_student_id
    and request.status in (
      'submitted'::public.consultation_status,
      'waiting_for_assignment'::public.consultation_status,
      'counselor_assigned'::public.consultation_status,
      'scheduled'::public.consultation_status
    )
  order by request.id asc
  for update;

  select assignment.counselor_id
  into v_current_counselor_id
  from public.student_counselor_assignments as assignment
  where assignment.student_id = p_student_id
    and assignment.ended_at is null
  for update;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'The student is awaiting initial counselor assignment through the consultation queue';
  end if;

  if v_current_counselor_id = p_counselor_id then
    raise exception using
      errcode = '22023',
      message = 'The selected counselor is already assigned';
  end if;

  if exists (
    select 1
    from public.consultation_requests as request
    where request.student_id = p_student_id
      and request.assigned_counselor_id = v_current_counselor_id
      and request.status in (
        'counselor_assigned'::public.consultation_status,
        'scheduled'::public.consultation_status
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Resolve the student''s active consultation before reassigning the Primary Counselor';
  end if;

  -- Lock the approval and profile rows so the target cannot become inactive
  -- or lose approval between validation and insertion.
  perform 1
  from public.counselor_accounts as account
  inner join public.profiles as counselor_profile
    on counselor_profile.id = account.user_id
  inner join auth.users as counselor_auth
    on counselor_auth.id = account.user_id
  where account.user_id = p_counselor_id
    and account.approval_status =
      'approved'::public.counselor_approval_status
    and counselor_profile.role = 'counselor'::public.user_role
    and counselor_profile.is_active is true
    and counselor_auth.email_confirmed_at is not null
  for update of account, counselor_profile, counselor_auth;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Primary counselor assignment target is invalid';
  end if;

  v_assignment_time := pg_catalog.clock_timestamp();

  update public.student_counselor_assignments as assignment
  set ended_at = v_assignment_time
  where assignment.student_id = p_student_id
    and assignment.counselor_id = v_current_counselor_id
    and assignment.ended_at is null;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The Primary Counselor assignment changed concurrently';
  end if;

  insert into public.student_counselor_assignments as assignment (
    student_id,
    counselor_id,
    assigned_at,
    assigned_by,
    ended_at,
    created_at,
    assignment_reason
  )
  values (
    p_student_id,
    p_counselor_id,
    v_assignment_time,
    v_director_id,
    null,
    v_assignment_time,
    v_reason
  )
  returning assignment.id into v_assignment_id;

  return query
  select
    v_assignment_id,
    v_assignment_time;
exception
  when unique_violation then
    raise exception using
      errcode = '40001',
      message = 'The Primary Counselor assignment changed concurrently';
end;
$function$;

alter function public.reassign_primary_counselor(uuid, uuid, text)
  owner to postgres;

comment on function public.reassign_primary_counselor(uuid, uuid, text) is
  'Atomically reassigns one Student between approved active Counselors only when the current Counselor has no unresolved owned consultation; initial assignment remains FCFS-only.';

revoke all on function
  public.reassign_primary_counselor(uuid, uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.reassign_primary_counselor(uuid, uuid, text)
  to authenticated;

create function public.list_director_primary_counselor_assignment_history(
  p_student_ids uuid[]
)
returns table (
  student_id uuid,
  counselor_full_name text,
  assigned_at timestamptz,
  ended_at timestamptz,
  assignment_reason text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Director assignment history is temporarily unavailable';
  end if;

  if p_student_ids is null
    or pg_catalog.cardinality(p_student_ids) not between 1 and 50
    or pg_catalog.array_position(p_student_ids, null) is not null
    or (
      select pg_catalog.count(distinct input.student_id)
      from pg_catalog.unnest(p_student_ids) as input(student_id)
    ) <> pg_catalog.cardinality(p_student_ids) then
    raise exception using
      errcode = '22023',
      message = 'Director assignment history filters are invalid';
  end if;

  return query
  with ranked_history as (
    select
      assignment.student_id,
      counselor.full_name as counselor_full_name,
      assignment.assigned_at,
      assignment.ended_at,
      assignment.assignment_reason,
      pg_catalog.row_number() over (
        partition by assignment.student_id
        order by assignment.assigned_at desc, assignment.id desc
      ) as history_rank
    from public.student_counselor_assignments as assignment
    inner join public.profiles as counselor
      on counselor.id = assignment.counselor_id
      and counselor.role = 'counselor'::public.user_role
    where assignment.student_id = any (p_student_ids)
  )
  select
    history.student_id,
    history.counselor_full_name,
    history.assigned_at,
    history.ended_at,
    history.assignment_reason
  from ranked_history as history
  where history.history_rank <= 5
  order by
    history.student_id asc,
    history.assigned_at desc;
exception
  when sqlstate '22023' then
    raise;
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'Director assignment history is temporarily unavailable';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Director assignment history is temporarily unavailable';
end;
$function$;

alter function
  public.list_director_primary_counselor_assignment_history(uuid[])
  owner to postgres;

comment on function
  public.list_director_primary_counselor_assignment_history(uuid[]) is
  'Returns at most five technical-identity-free assignment history rows per requested Student to an active verified Director.';

revoke all on function
  public.list_director_primary_counselor_assignment_history(uuid[])
  from public, anon, authenticated, service_role;

grant execute on function
  public.list_director_primary_counselor_assignment_history(uuid[])
  to authenticated;

commit;

-- >>> supabase/migrations/202608220001_student_eligibility_assessment.sql
-- K-GEO Final Client Review Step 4: immutable Counselor Eligibility Assessment.
-- Student facts remain Student-owned; this migration stores only professional
-- Counselor assessments and their permanent revision history.

begin;

create type public.student_eligibility_status as enum (
  'needs_review',
  'eligible',
  'conditionally_eligible',
  'not_yet_eligible'
);

create type public.student_eligibility_academic_status as enum (
  'needs_review',
  'meets_requirement',
  'conditionally_meets',
  'does_not_meet'
);

create type public.student_eligibility_backlog_status as enum (
  'needs_review',
  'clear',
  'acceptable',
  'concern'
);

create type public.student_eligibility_english_readiness as enum (
  'needs_review',
  'ready',
  'in_progress',
  'required'
);

create type public.student_eligibility_aptitude_readiness as enum (
  'needs_review',
  'ready',
  'in_progress',
  'not_required',
  'required'
);

create type public.student_eligibility_profile_strength as enum (
  'needs_review',
  'strong',
  'good',
  'developing',
  'weak'
);

create type public.student_eligibility_application_readiness as enum (
  'needs_review',
  'ready',
  'partially_ready',
  'not_ready'
);

alter type public.student_eligibility_status owner to postgres;
alter type public.student_eligibility_academic_status owner to postgres;
alter type public.student_eligibility_backlog_status owner to postgres;
alter type public.student_eligibility_english_readiness owner to postgres;
alter type public.student_eligibility_aptitude_readiness owner to postgres;
alter type public.student_eligibility_profile_strength owner to postgres;
alter type public.student_eligibility_application_readiness owner to postgres;

revoke all on type public.student_eligibility_status
  from public, anon, authenticated, service_role;
revoke all on type public.student_eligibility_academic_status
  from public, anon, authenticated, service_role;
revoke all on type public.student_eligibility_backlog_status
  from public, anon, authenticated, service_role;
revoke all on type public.student_eligibility_english_readiness
  from public, anon, authenticated, service_role;
revoke all on type public.student_eligibility_aptitude_readiness
  from public, anon, authenticated, service_role;
revoke all on type public.student_eligibility_profile_strength
  from public, anon, authenticated, service_role;
revoke all on type public.student_eligibility_application_readiness
  from public, anon, authenticated, service_role;

grant usage on type public.student_eligibility_status to authenticated;
grant usage on type public.student_eligibility_academic_status to authenticated;
grant usage on type public.student_eligibility_backlog_status to authenticated;
grant usage on type public.student_eligibility_english_readiness to authenticated;
grant usage on type public.student_eligibility_aptitude_readiness to authenticated;
grant usage on type public.student_eligibility_profile_strength to authenticated;
grant usage on type public.student_eligibility_application_readiness
  to authenticated;

create function public.is_valid_eligibility_country_list(
  p_countries text[]
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select
    p_countries is not null
    and (
      pg_catalog.cardinality(p_countries) = 0
      or pg_catalog.array_ndims(p_countries) = 1
    )
    and pg_catalog.cardinality(p_countries) <= 10
    and not exists (
      select 1
      from pg_catalog.unnest(p_countries) as country(value)
      where country.value is null
        or pg_catalog.char_length(country.value) not between 1 and 80
        or country.value <> pg_catalog.regexp_replace(
          pg_catalog.btrim(country.value),
          '[[:space:]]+',
          ' ',
          'g'
        )
        or country.value ~ '[[:cntrl:]]'
    )
    and pg_catalog.cardinality(p_countries) = (
      select pg_catalog.count(distinct pg_catalog.lower(country.value))
      from pg_catalog.unnest(p_countries) as country(value)
    );
$function$;

alter function public.is_valid_eligibility_country_list(text[])
  owner to postgres;

revoke all on function public.is_valid_eligibility_country_list(text[])
  from public, anon, authenticated, service_role;

create table public.student_eligibility_assessments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null
    references public.profiles (id) on update restrict on delete restrict,
  overall_status public.student_eligibility_status not null,
  academic_status public.student_eligibility_academic_status not null,
  backlog_status public.student_eligibility_backlog_status not null,
  english_readiness public.student_eligibility_english_readiness not null,
  aptitude_readiness public.student_eligibility_aptitude_readiness not null,
  profile_strength public.student_eligibility_profile_strength not null,
  application_readiness
    public.student_eligibility_application_readiness not null,
  recommended_countries text[] not null default '{}'::text[],
  recommended_intake text,
  assessment_summary text not null,
  assessed_by uuid not null
    references public.profiles (id) on update restrict on delete restrict,
  assessed_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint student_eligibility_assessments_countries_check check (
    public.is_valid_eligibility_country_list(recommended_countries)
  ),
  constraint student_eligibility_assessments_intake_check check (
    recommended_intake is null
    or (
      pg_catalog.char_length(recommended_intake) between 1 and 40
      and recommended_intake = pg_catalog.regexp_replace(
        pg_catalog.btrim(recommended_intake),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and recommended_intake !~ '[[:cntrl:]]'
    )
  ),
  constraint student_eligibility_assessments_summary_check check (
    pg_catalog.char_length(assessment_summary) between 1 and 1500
    and assessment_summary = pg_catalog.regexp_replace(
      pg_catalog.btrim(assessment_summary),
      '[[:space:]]+',
      ' ',
      'g'
    )
    and assessment_summary !~ '[[:cntrl:]]'
  )
);

alter table public.student_eligibility_assessments owner to postgres;
alter table public.student_eligibility_assessments enable row level security;
alter table public.student_eligibility_assessments force row level security;

create index student_eligibility_assessments_latest_idx
  on public.student_eligibility_assessments (
    student_id,
    assessed_at desc,
    id desc
  );

revoke all on table public.student_eligibility_assessments
  from public, anon, authenticated, service_role;

comment on table public.student_eligibility_assessments is
  'Append-only Counselor Eligibility Assessment history. The deterministic newest row is the current assessment.';

create policy student_eligibility_assessments_select_primary_counselor
on public.student_eligibility_assessments
for select
to authenticated
using (
  (select public.is_active_primary_counselor_for_student(
    student_eligibility_assessments.student_id
  ))
);

create policy student_eligibility_assessments_select_director
on public.student_eligibility_assessments
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ))
);

create function public.protect_student_eligibility_assessment_history()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using
    errcode = '42501',
    message = 'Eligibility Assessment history is immutable';
end;
$function$;

alter function public.protect_student_eligibility_assessment_history()
  owner to postgres;

revoke all on function
  public.protect_student_eligibility_assessment_history()
  from public, anon, authenticated, service_role;

create trigger protect_student_eligibility_assessment_history
before update or delete on public.student_eligibility_assessments
for each row
execute function public.protect_student_eligibility_assessment_history();

create function public.save_student_eligibility_assessment(
  p_student_id uuid,
  p_overall_status public.student_eligibility_status,
  p_academic_status public.student_eligibility_academic_status,
  p_backlog_status public.student_eligibility_backlog_status,
  p_english_readiness public.student_eligibility_english_readiness,
  p_aptitude_readiness public.student_eligibility_aptitude_readiness,
  p_profile_strength public.student_eligibility_profile_strength,
  p_application_readiness
    public.student_eligibility_application_readiness,
  p_recommended_countries text[],
  p_recommended_intake text,
  p_assessment_summary text
)
returns table (
  assessment_id uuid,
  assessed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_counselor_id uuid := (select auth.uid());
  v_assessment_id uuid;
  v_assessed_at timestamptz;
  v_recommended_countries text[];
  v_recommended_intake text;
  v_assessment_summary text;
begin
  if v_counselor_id is null then
    raise exception using
      errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  -- Use the same Student-profile lock root as Director reassignment. A save
  -- linearizes before or after reassignment, then checks current ownership.
  perform 1
  from public.profiles as student_profile
  where student_profile.id = p_student_id
    and student_profile.role = 'student'::public.user_role
  for key share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'Eligibility Assessment student is invalid';
  end if;

  if public.is_active_primary_counselor_for_student(p_student_id)
    is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  if p_recommended_countries is null
    or exists (
      select 1
      from pg_catalog.unnest(p_recommended_countries) as country(value)
      where country.value is null
        or country.value ~ '[[:cntrl:]]'
    ) then
    raise exception using
      errcode = '22023',
      message = 'Recommended countries are invalid';
  end if;

  select pg_catalog.coalesce(
    pg_catalog.array_agg(
      pg_catalog.regexp_replace(
        pg_catalog.btrim(country.value),
        '[[:space:]]+',
        ' ',
        'g'
      )
      order by country.position
    ),
    '{}'::text[]
  )
  into v_recommended_countries
  from pg_catalog.unnest(p_recommended_countries) with ordinality
    as country(value, position);

  if public.is_valid_eligibility_country_list(v_recommended_countries)
    is distinct from true then
    raise exception using
      errcode = '22023',
      message = 'Recommended countries are invalid';
  end if;

  if p_recommended_intake is null
    or pg_catalog.btrim(p_recommended_intake) = '' then
    v_recommended_intake := null;
  else
    if p_recommended_intake ~ '[[:cntrl:]]' then
      raise exception using
        errcode = '22023',
        message = 'Recommended intake is invalid';
    end if;
    v_recommended_intake := pg_catalog.regexp_replace(
      pg_catalog.btrim(p_recommended_intake),
      '[[:space:]]+',
      ' ',
      'g'
    );
  end if;

  if v_recommended_intake is not null
    and pg_catalog.char_length(v_recommended_intake) not between 1 and 40 then
    raise exception using
      errcode = '22023',
      message = 'Recommended intake is invalid';
  end if;

  if p_assessment_summary is null
    or p_assessment_summary ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'Assessment summary is invalid';
  end if;

  v_assessment_summary := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_assessment_summary),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(v_assessment_summary) not between 1 and 1500 then
    raise exception using
      errcode = '22023',
      message = 'Assessment summary is invalid';
  end if;

  v_assessed_at := pg_catalog.clock_timestamp();

  insert into public.student_eligibility_assessments (
    student_id,
    overall_status,
    academic_status,
    backlog_status,
    english_readiness,
    aptitude_readiness,
    profile_strength,
    application_readiness,
    recommended_countries,
    recommended_intake,
    assessment_summary,
    assessed_by,
    assessed_at
  ) values (
    p_student_id,
    p_overall_status,
    p_academic_status,
    p_backlog_status,
    p_english_readiness,
    p_aptitude_readiness,
    p_profile_strength,
    p_application_readiness,
    v_recommended_countries,
    v_recommended_intake,
    v_assessment_summary,
    v_counselor_id,
    v_assessed_at
  )
  returning id into v_assessment_id;

  return query select v_assessment_id, v_assessed_at;
end;
$function$;

alter function public.save_student_eligibility_assessment(
  uuid,
  public.student_eligibility_status,
  public.student_eligibility_academic_status,
  public.student_eligibility_backlog_status,
  public.student_eligibility_english_readiness,
  public.student_eligibility_aptitude_readiness,
  public.student_eligibility_profile_strength,
  public.student_eligibility_application_readiness,
  text[],
  text,
  text
) owner to postgres;

revoke all on function public.save_student_eligibility_assessment(
  uuid,
  public.student_eligibility_status,
  public.student_eligibility_academic_status,
  public.student_eligibility_backlog_status,
  public.student_eligibility_english_readiness,
  public.student_eligibility_aptitude_readiness,
  public.student_eligibility_profile_strength,
  public.student_eligibility_application_readiness,
  text[],
  text,
  text
) from public, anon, authenticated, service_role;

grant execute on function public.save_student_eligibility_assessment(
  uuid,
  public.student_eligibility_status,
  public.student_eligibility_academic_status,
  public.student_eligibility_backlog_status,
  public.student_eligibility_english_readiness,
  public.student_eligibility_aptitude_readiness,
  public.student_eligibility_profile_strength,
  public.student_eligibility_application_readiness,
  text[],
  text,
  text
) to authenticated;

create function public.get_counselor_student_eligibility_assessments(
  p_student_id uuid,
  p_limit integer default 20
)
returns table (
  assessment_id uuid,
  overall_status public.student_eligibility_status,
  academic_status public.student_eligibility_academic_status,
  backlog_status public.student_eligibility_backlog_status,
  english_readiness public.student_eligibility_english_readiness,
  aptitude_readiness public.student_eligibility_aptitude_readiness,
  profile_strength public.student_eligibility_profile_strength,
  application_readiness
    public.student_eligibility_application_readiness,
  recommended_countries text[],
  recommended_intake text,
  assessment_summary text,
  assessor_full_name text,
  assessed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using
      errcode = '22023',
      message = 'Eligibility Assessment history request is invalid';
  end if;

  if public.is_active_primary_counselor_for_student(p_student_id)
    is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  return query
  select
    assessment.id,
    assessment.overall_status,
    assessment.academic_status,
    assessment.backlog_status,
    assessment.english_readiness,
    assessment.aptitude_readiness,
    assessment.profile_strength,
    assessment.application_readiness,
    assessment.recommended_countries,
    assessment.recommended_intake,
    assessment.assessment_summary,
    pg_catalog.coalesce(
      pg_catalog.nullif(pg_catalog.btrim(counselor.full_name), ''),
      'Counselor'
    ),
    assessment.assessed_at
  from public.student_eligibility_assessments as assessment
  inner join public.profiles as counselor
    on counselor.id = assessment.assessed_by
  where assessment.student_id = p_student_id
  order by assessment.assessed_at desc, assessment.id desc
  limit p_limit;
end;
$function$;

alter function
  public.get_counselor_student_eligibility_assessments(uuid, integer)
  owner to postgres;

revoke all on function
  public.get_counselor_student_eligibility_assessments(uuid, integer)
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_counselor_student_eligibility_assessments(uuid, integer)
  to authenticated;

create function public.get_counselor_latest_student_eligibility_assessment(
  p_student_id uuid
)
returns table (
  overall_status public.student_eligibility_status,
  assessed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if public.is_active_primary_counselor_for_student(p_student_id)
    is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  return query
  select assessment.overall_status, assessment.assessed_at
  from public.student_eligibility_assessments as assessment
  where assessment.student_id = p_student_id
  order by assessment.assessed_at desc, assessment.id desc
  limit 1;
end;
$function$;

alter function
  public.get_counselor_latest_student_eligibility_assessment(uuid)
  owner to postgres;

revoke all on function
  public.get_counselor_latest_student_eligibility_assessment(uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_counselor_latest_student_eligibility_assessment(uuid)
  to authenticated;

create function public.get_director_latest_student_eligibility_assessment(
  p_student_id uuid
)
returns table (
  student_id uuid,
  overall_status public.student_eligibility_status,
  academic_status public.student_eligibility_academic_status,
  backlog_status public.student_eligibility_backlog_status,
  english_readiness public.student_eligibility_english_readiness,
  aptitude_readiness public.student_eligibility_aptitude_readiness,
  profile_strength public.student_eligibility_profile_strength,
  application_readiness
    public.student_eligibility_application_readiness,
  recommended_countries text[],
  recommended_intake text,
  assessment_summary text,
  assessor_full_name text,
  assessed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  return query
  select
    assessment.student_id,
    assessment.overall_status,
    assessment.academic_status,
    assessment.backlog_status,
    assessment.english_readiness,
    assessment.aptitude_readiness,
    assessment.profile_strength,
    assessment.application_readiness,
    assessment.recommended_countries,
    assessment.recommended_intake,
    assessment.assessment_summary,
    pg_catalog.coalesce(
      pg_catalog.nullif(pg_catalog.btrim(counselor.full_name), ''),
      'Counselor'
    ),
    assessment.assessed_at
  from public.student_eligibility_assessments as assessment
  inner join public.profiles as counselor
    on counselor.id = assessment.assessed_by
  where assessment.student_id = p_student_id
  order by assessment.assessed_at desc, assessment.id desc
  limit 1;
end;
$function$;

alter function
  public.get_director_latest_student_eligibility_assessment(uuid)
  owner to postgres;

revoke all on function
  public.get_director_latest_student_eligibility_assessment(uuid)
  from public, anon, authenticated, service_role;

grant execute on function
  public.get_director_latest_student_eligibility_assessment(uuid)
  to authenticated;

comment on function public.save_student_eligibility_assessment(
  uuid,
  public.student_eligibility_status,
  public.student_eligibility_academic_status,
  public.student_eligibility_backlog_status,
  public.student_eligibility_english_readiness,
  public.student_eligibility_aptitude_readiness,
  public.student_eligibility_profile_strength,
  public.student_eligibility_application_readiness,
  text[],
  text,
  text
) is
  'Appends one immutable Eligibility Assessment as the current active Primary Counselor; identity and time are database-derived.';

comment on function
  public.get_counselor_student_eligibility_assessments(uuid, integer) is
  'Returns at most twenty newest immutable Eligibility Assessment revisions to the current active Primary Counselor.';

comment on function
  public.get_counselor_latest_student_eligibility_assessment(uuid) is
  'Returns only the deterministic latest Eligibility status for the current active Primary Counselor Workspace overview.';

comment on function
  public.get_director_latest_student_eligibility_assessment(uuid) is
  'Returns the deterministic latest Eligibility Assessment to an active verified Director for read-only oversight.';

commit;

-- >>> supabase/migrations/202608220002_controlled_legacy_consultation_closure.sql
-- K-GEO Step 4.5C controlled closure for historical null-slot requests.
-- This migration installs the audited mechanism only; it does not close data.

begin;

alter table public.consultation_requests
  add column cancelled_at timestamptz,
  add column cancelled_by uuid,
  add column cancellation_reason text,
  add constraint consultation_requests_cancellation_audit_check
    check (
      (
        cancelled_at is null
        and cancelled_by is null
        and cancellation_reason is null
      )
      or (
        cancelled_at is not null
        and cancelled_by is not null
        and cancellation_reason is not null
        and status = 'cancelled'::public.consultation_status
        and cancelled_at >= submitted_at
      )
    ),
  add constraint consultation_requests_cancellation_reason_check
    check (
      cancellation_reason is null
      or (
        pg_catalog.char_length(cancellation_reason) between 1 and 300
        and cancellation_reason = pg_catalog.regexp_replace(
          pg_catalog.btrim(cancellation_reason),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and cancellation_reason !~ '[[:cntrl:]]'
      )
    );

comment on column public.consultation_requests.cancelled_at is
  'Database-generated timestamp for an audited consultation cancellation.';

comment on column public.consultation_requests.cancelled_by is
  'Trusted auth.uid() actor retained for an audited consultation cancellation.';

comment on column public.consultation_requests.cancellation_reason is
  'Normalized bounded reason retained for an audited consultation cancellation.';

create function public.protect_legacy_consultation_cancellation_audit()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    if old.cancelled_at is not null then
      raise exception using
        errcode = '42501',
        message = 'Audited consultation cancellation history cannot be deleted';
    end if;

    return old;
  end if;

  if old.cancelled_at is not null
    and (
      new.status is distinct from old.status
      or new.cancelled_at is distinct from old.cancelled_at
      or new.cancelled_by is distinct from old.cancelled_by
      or new.cancellation_reason is distinct from old.cancellation_reason
    ) then
    raise exception using
      errcode = '42501',
      message = 'Audited consultation cancellation history is immutable';
  end if;

  return new;
end;
$function$;

alter function public.protect_legacy_consultation_cancellation_audit()
  owner to postgres;

revoke all on function public.protect_legacy_consultation_cancellation_audit()
  from public, anon, authenticated, service_role;

create trigger consultation_requests_protect_legacy_cancellation_audit
before update or delete on public.consultation_requests
for each row
execute function public.protect_legacy_consultation_cancellation_audit();

create function public.list_director_legacy_waiting_consultations()
returns table (
  consultation_id uuid,
  request_number text,
  student_full_name text,
  student_college_email text,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  return query
  select
    request.id,
    request.request_number,
    student.full_name,
    student.college_email,
    request.submitted_at
  from public.consultation_requests as request
  inner join public.profiles as student
    on student.id = request.student_id
    and student.role = 'student'::public.user_role
  where request.status =
      'waiting_for_assignment'::public.consultation_status
    and request.assigned_counselor_id is null
    and request.assigned_at is null
    and request.consultation_date is null
    and request.slot_start is null
    and request.slot_end is null
    and exists (
      select 1
      from public.student_counselor_assignments as assignment
      where assignment.student_id = request.student_id
        and assignment.ended_at is null
    )
  order by request.submitted_at asc, request.id asc
  limit 25;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Legacy consultation requests are temporarily unavailable';
end;
$function$;

alter function public.list_director_legacy_waiting_consultations()
  owner to postgres;

comment on function public.list_director_legacy_waiting_consultations() is
  'Returns at most 25 exact null-slot waiting requests with an active Primary Counselor to an active verified Director.';

revoke all on function public.list_director_legacy_waiting_consultations()
  from public, anon, authenticated, service_role;

grant execute on function public.list_director_legacy_waiting_consultations()
  to authenticated;

create function public.close_legacy_waiting_consultation(
  p_consultation_id uuid,
  p_reason text
)
returns table (
  request_number text,
  consultation_status public.consultation_status,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_director_id uuid := (select auth.uid());
  v_student_id uuid;
  v_target_status public.consultation_status;
  v_assigned_counselor_id uuid;
  v_assigned_at timestamptz;
  v_consultation_date date;
  v_slot_start time without time zone;
  v_slot_end time without time zone;
  v_reason text;
  v_cancelled_at timestamptz;
  v_request_number text;
begin
  if v_director_id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  if p_consultation_id is null
    or p_reason is null
    or p_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'A valid legacy closure reason is required';
  end if;

  v_reason := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_reason),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if v_reason is null
    or pg_catalog.char_length(v_reason) not between 1 and 300 then
    raise exception using
      errcode = '22023',
      message = 'A valid legacy closure reason is required';
  end if;

  select
    request.student_id,
    request.status,
    request.assigned_counselor_id,
    request.assigned_at,
    request.consultation_date,
    request.slot_start,
    request.slot_end
  into
    v_student_id,
    v_target_status,
    v_assigned_counselor_id,
    v_assigned_at,
    v_consultation_date,
    v_slot_start,
    v_slot_end
  from public.consultation_requests as request
  where request.id = p_consultation_id
  for update;

  if not found
    or v_target_status is distinct from
      'waiting_for_assignment'::public.consultation_status
    or v_assigned_counselor_id is not null
    or v_assigned_at is not null
    or v_consultation_date is not null
    or v_slot_start is not null
    or v_slot_end is not null then
    raise exception using
      errcode = '22023',
      message = 'The consultation is not an eligible legacy request';
  end if;

  perform 1
  from public.student_counselor_assignments as assignment
  where assignment.student_id = v_student_id
    and assignment.ended_at is null
  for share;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'The Student does not have an active Primary Counselor';
  end if;

  v_cancelled_at := pg_catalog.statement_timestamp();

  update public.consultation_requests as request
  set
    status = 'cancelled'::public.consultation_status,
    cancelled_at = v_cancelled_at,
    cancelled_by = v_director_id,
    cancellation_reason = v_reason
  where request.id = p_consultation_id
    and request.status =
      'waiting_for_assignment'::public.consultation_status
    and request.assigned_counselor_id is null
    and request.assigned_at is null
    and request.consultation_date is null
    and request.slot_start is null
    and request.slot_end is null
  returning
    request.request_number,
    request.status
  into
    v_request_number,
    v_target_status;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The legacy consultation request changed concurrently';
  end if;

  return query
  select
    v_request_number,
    v_target_status,
    v_cancelled_at;
end;
$function$;

alter function public.close_legacy_waiting_consultation(uuid, text)
  owner to postgres;

comment on function public.close_legacy_waiting_consultation(uuid, text) is
  'Allows only an active verified Director to cancel an exact unassigned null-slot legacy waiting request when the Student already has an active Primary Counselor.';

revoke all on function public.close_legacy_waiting_consultation(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function public.close_legacy_waiting_consultation(uuid, text)
  to authenticated;

commit;

-- >>> supabase/migrations/202608230001_duplicate_future_waiting_consultation_closure.sql
-- K-GEO Step 4.5C.2 transition-only duplicate-future waiting closure.
-- This installs a narrowly scoped audited operation and does not mutate data.

begin;

create function public.list_director_duplicate_future_waiting_consultations()
returns table (
  consultation_id uuid,
  request_number text,
  student_full_name text,
  requested_date date,
  requested_slot_start time without time zone,
  requested_slot_end time without time zone,
  scheduled_date date,
  scheduled_slot_start time without time zone,
  scheduled_slot_end time without time zone,
  scheduled_counselor_full_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_business_now timestamp without time zone :=
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata';
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  return query
  select
    request.id,
    request.request_number,
    student.full_name,
    request.consultation_date,
    request.slot_start,
    request.slot_end,
    confirmed.consultation_date,
    confirmed.slot_start,
    confirmed.slot_end,
    confirmed.counselor_full_name
  from public.consultation_requests as request
  inner join public.profiles as student
    on student.id = request.student_id
    and student.role = 'student'::public.user_role
  inner join lateral (
    select
      scheduled.consultation_date,
      scheduled.slot_start,
      scheduled.slot_end,
      counselor.full_name as counselor_full_name
    from public.consultation_requests as scheduled
    inner join public.profiles as counselor
      on counselor.id = scheduled.assigned_counselor_id
      and counselor.role = 'counselor'::public.user_role
    where scheduled.student_id = request.student_id
      and scheduled.id <> request.id
      and scheduled.status = 'scheduled'::public.consultation_status
      and scheduled.assigned_counselor_id is not null
      and scheduled.consultation_date is not null
      and scheduled.slot_start is not null
      and scheduled.slot_end is not null
      and (
        scheduled.consultation_date > v_business_now::date
        or (
          scheduled.consultation_date = v_business_now::date
          and scheduled.slot_start > v_business_now::time
        )
      )
    order by
      scheduled.consultation_date asc,
      scheduled.slot_start asc,
      scheduled.id asc
    limit 1
  ) as confirmed on true
  where request.status =
      'waiting_for_assignment'::public.consultation_status
    and request.assigned_counselor_id is null
    and request.assigned_at is null
    and request.consultation_date is not null
    and request.slot_start is not null
    and request.slot_end is not null
    and (
      request.consultation_date > v_business_now::date
      or (
        request.consultation_date = v_business_now::date
        and request.slot_start > v_business_now::time
      )
    )
  order by request.submitted_at asc, request.id asc
  limit 25;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Duplicate consultation requests are temporarily unavailable';
end;
$function$;

alter function public.list_director_duplicate_future_waiting_consultations()
  owner to postgres;

comment on function
  public.list_director_duplicate_future_waiting_consultations() is
  'Returns at most 25 future unassigned waiting requests whose Student already has a different future scheduled consultation, to an active verified Director.';

revoke all on function
  public.list_director_duplicate_future_waiting_consultations()
  from public, anon, authenticated, service_role;

grant execute on function
  public.list_director_duplicate_future_waiting_consultations()
  to authenticated;

create function public.close_duplicate_future_waiting_consultation(
  p_consultation_id uuid,
  p_reason text
)
returns table (
  request_number text,
  consultation_status public.consultation_status,
  cancelled_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_director_id uuid := (select auth.uid());
  v_business_now timestamp without time zone :=
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata';
  v_initial_student_id uuid;
  v_student_id uuid;
  v_target_status public.consultation_status;
  v_assigned_counselor_id uuid;
  v_assigned_at timestamptz;
  v_consultation_date date;
  v_slot_start time without time zone;
  v_slot_end time without time zone;
  v_reason text;
  v_cancelled_at timestamptz;
  v_request_number text;
begin
  if v_director_id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  if p_consultation_id is null
    or p_reason is null
    or p_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'A valid duplicate-request closure reason is required';
  end if;

  v_reason := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_reason),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if v_reason is null
    or pg_catalog.char_length(v_reason) not between 1 and 300 then
    raise exception using
      errcode = '22023',
      message = 'A valid duplicate-request closure reason is required';
  end if;

  select request.student_id
  into v_initial_student_id
  from public.consultation_requests as request
  where request.id = p_consultation_id;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'The consultation is not an eligible duplicate request';
  end if;

  -- Match the existing reassignment lock order before consultation row locks.
  perform 1
  from public.profiles as student
  where student.id = v_initial_student_id
    and student.role = 'student'::public.user_role
  for update;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'The consultation is not an eligible duplicate request';
  end if;

  select
    request.student_id,
    request.status,
    request.assigned_counselor_id,
    request.assigned_at,
    request.consultation_date,
    request.slot_start,
    request.slot_end
  into
    v_student_id,
    v_target_status,
    v_assigned_counselor_id,
    v_assigned_at,
    v_consultation_date,
    v_slot_start,
    v_slot_end
  from public.consultation_requests as request
  where request.id = p_consultation_id
  for update;

  if not found
    or v_student_id is distinct from v_initial_student_id
    or v_target_status is distinct from
      'waiting_for_assignment'::public.consultation_status
    or v_assigned_counselor_id is not null
    or v_assigned_at is not null
    or v_consultation_date is null
    or v_slot_start is null
    or v_slot_end is null
    or v_consultation_date < v_business_now::date
    or (
      v_consultation_date = v_business_now::date
      and v_slot_start <= v_business_now::time
    ) then
    raise exception using
      errcode = '22023',
      message = 'The consultation is not an eligible duplicate request';
  end if;

  -- Lock every qualifying scheduled row in deterministic order. A concurrent
  -- outcome transition is therefore rechecked before this operation proceeds.
  perform scheduled.id
  from public.consultation_requests as scheduled
  where scheduled.student_id = v_student_id
    and scheduled.id <> p_consultation_id
    and scheduled.status = 'scheduled'::public.consultation_status
    and scheduled.assigned_counselor_id is not null
    and scheduled.consultation_date is not null
    and scheduled.slot_start is not null
    and scheduled.slot_end is not null
    and (
      scheduled.consultation_date > v_business_now::date
      or (
        scheduled.consultation_date = v_business_now::date
        and scheduled.slot_start > v_business_now::time
      )
    )
  order by
    scheduled.consultation_date asc,
    scheduled.slot_start asc,
    scheduled.id asc
  for update;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'The Student does not have another future scheduled consultation';
  end if;

  v_cancelled_at := pg_catalog.statement_timestamp();

  update public.consultation_requests as request
  set
    status = 'cancelled'::public.consultation_status,
    cancelled_at = v_cancelled_at,
    cancelled_by = v_director_id,
    cancellation_reason = v_reason
  where request.id = p_consultation_id
    and request.student_id = v_student_id
    and request.status =
      'waiting_for_assignment'::public.consultation_status
    and request.assigned_counselor_id is null
    and request.assigned_at is null
    and request.consultation_date is not null
    and request.slot_start is not null
    and request.slot_end is not null
    and (
      request.consultation_date > v_business_now::date
      or (
        request.consultation_date = v_business_now::date
        and request.slot_start > v_business_now::time
      )
    )
    and exists (
      select 1
      from public.consultation_requests as scheduled
      where scheduled.student_id = request.student_id
        and scheduled.id <> request.id
        and scheduled.status = 'scheduled'::public.consultation_status
        and scheduled.assigned_counselor_id is not null
        and scheduled.consultation_date is not null
        and scheduled.slot_start is not null
        and scheduled.slot_end is not null
        and (
          scheduled.consultation_date > v_business_now::date
          or (
            scheduled.consultation_date = v_business_now::date
            and scheduled.slot_start > v_business_now::time
          )
        )
    )
  returning
    request.request_number,
    request.status
  into
    v_request_number,
    v_target_status;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The duplicate consultation request changed concurrently';
  end if;

  return query
  select
    v_request_number,
    v_target_status,
    v_cancelled_at;
end;
$function$;

alter function public.close_duplicate_future_waiting_consultation(uuid, text)
  owner to postgres;

comment on function
  public.close_duplicate_future_waiting_consultation(uuid, text) is
  'Allows only an active verified Director to cancel a future unassigned waiting request when the same Student already has a different future scheduled consultation.';

revoke all on function
  public.close_duplicate_future_waiting_consultation(uuid, text)
  from public, anon, authenticated, service_role;

grant execute on function
  public.close_duplicate_future_waiting_consultation(uuid, text)
  to authenticated;

commit;

-- >>> supabase/migrations/202608230002_time_aware_consultation_lifecycle.sql
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

-- >>> supabase/migrations/202608230003_complete_time_aware_consultation_prerequisites.sql
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

-- >>> supabase/migrations/202608240001_automatic_consultation_allocation.sql
-- K-GEO final automatic consultation booking and counselor allocation cutover.
-- Student booking becomes one authoritative scheduled-and-assigned transaction.

begin;

set local search_path = '';

-- Fail closed unless the reviewed Step 4.5D scheduling foundation is present
-- and the legacy organization-wide capacity index still protects cutover.
do $prerequisite$
declare
  v_slot_count bigint;
begin
  if pg_catalog.to_regprocedure(
    'public.get_kgeo_consultation_slot_catalog()'
  ) is null then
    raise exception using
      errcode = '55000',
      message = 'Step 4.5D slot catalog is required before automatic allocation';
  end if;

  select pg_catalog.count(*)
  into v_slot_count
  from public.get_kgeo_consultation_slot_catalog();

  if v_slot_count <> 16
    or not exists (
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
    )
    or not exists (
      select 1
      from pg_catalog.pg_attribute as attribute_record
      where attribute_record.attrelid =
          'public.student_counselor_assignments'::pg_catalog.regclass
        and attribute_record.attname = 'assigned_by'
        and attribute_record.attisdropped is false
    )
    or exists (
      select 1
      from public.student_counselor_assignments as existing_assignment
      where existing_assignment.assigned_by is null
    ) then
    raise exception using
      errcode = '55000',
      message = 'Automatic allocation prerequisites do not match the reviewed contract';
  end if;

  if exists (
    select 1
    from public.consultation_requests as request
    where request.assigned_counselor_id is not null
      and request.consultation_date is not null
      and request.slot_start is not null
      and request.status <> 'cancelled'::public.consultation_status
    group by
      request.assigned_counselor_id,
      request.consultation_date,
      request.slot_start
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '55000',
      message = 'Existing counselor slot capacity conflicts block automatic allocation';
  end if;

  if exists (
    select 1
    from public.consultation_requests as request
    where request.status in (
      'submitted'::public.consultation_status,
      'waiting_for_assignment'::public.consultation_status,
      'counselor_assigned'::public.consultation_status
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Retired pending consultations must be resolved before automatic allocation';
  end if;
end;
$prerequisite$;

-- NULL assigned_by is the smallest truthful representation for an assignment
-- created atomically by the system. Existing human audit rows are preserved.
alter table public.student_counselor_assignments
  alter column assigned_by drop not null;

comment on column public.student_counselor_assignments.assigned_by is
  'Trusted human actor for Counselor/Director assignments; NULL means the system created the assignment after the Student chose to continue with K-GEO.';

comment on column public.student_counselor_assignments.assignment_reason is
  'Normalized Director-supplied reassignment reason; NULL is required for historical Counselor-created and automatic system assignments.';

create or replace function public.protect_student_counselor_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_role public.user_role;
  v_counselor_role public.user_role;
  v_actor_role public.user_role;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '42501',
      message = 'Primary counselor assignment history cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.student_id is distinct from old.student_id
      or new.counselor_id is distinct from old.counselor_id
      or new.assigned_at is distinct from old.assigned_at
      or new.assigned_by is distinct from old.assigned_by
      or new.assignment_reason is distinct from old.assignment_reason
      or new.created_at is distinct from old.created_at
      or old.ended_at is not null
      or new.ended_at is null then
      raise exception using
        errcode = '42501',
        message = 'Primary counselor assignment history is immutable';
    end if;
  end if;

  select profile.role
  into v_student_role
  from public.profiles as profile
  where profile.id = new.student_id;

  select profile.role
  into v_counselor_role
  from public.profiles as profile
  where profile.id = new.counselor_id;

  v_actor_role := null;
  if new.assigned_by is not null then
    select profile.role
    into v_actor_role
    from public.profiles as profile
    where profile.id = new.assigned_by;
  end if;

  if v_student_role is distinct from 'student'::public.user_role
    or v_counselor_role is distinct from 'counselor'::public.user_role
    or (
      new.assigned_by is not null
      and (
        v_actor_role is null
        or v_actor_role not in (
          'counselor'::public.user_role,
          'director'::public.user_role
        )
      )
    )
    or (
      new.assigned_by is null
      and new.assignment_reason is not null
    )
    or (
      tg_op = 'INSERT'
      and v_actor_role = 'director'::public.user_role
      and new.assignment_reason is null
    ) then
    raise exception using
      errcode = '23514',
      message = 'Primary counselor assignment participants are invalid';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

alter function public.protect_student_counselor_assignment_history()
  owner to postgres;

revoke all on function public.protect_student_counselor_assignment_history()
  from public, anon, authenticated, service_role;

-- Compare any partially installed block table with an independently built
-- copy of the reviewed local contract before reusing it. Foreign keys cannot
-- cross from a temporary relation to public.profiles, so their complete
-- structure is compared separately from trusted catalog metadata below.
create temporary table expected_counselor_consultation_slot_blocks (
  id uuid
    constraint counselor_consultation_slot_blocks_pkey primary key
    default pg_catalog.gen_random_uuid(),
  counselor_id uuid not null,
  consultation_date date not null,
  slot_start time without time zone not null,
  reason text,
  created_at timestamptz not null
    default pg_catalog.statement_timestamp(),
  released_at timestamptz,
  released_by uuid,
  constraint counselor_consultation_slot_blocks_weekday_check
    check (extract(isodow from consultation_date) between 1 and 5),
  constraint counselor_consultation_slot_blocks_start_check
    check (
      slot_start in (
        time '09:00', time '09:30', time '10:00', time '10:30',
        time '11:00', time '11:30', time '12:00', time '12:30',
        time '13:00', time '13:30', time '14:00', time '14:30',
        time '15:00', time '15:30', time '16:00', time '16:30'
      )
    ),
  constraint counselor_consultation_slot_blocks_reason_check
    check (
      reason is null
      or (
        reason = pg_catalog.regexp_replace(
          pg_catalog.btrim(reason),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(reason) between 1 and 200
        and reason !~ '[[:cntrl:]]'
      )
    ),
  constraint counselor_consultation_slot_blocks_release_check
    check (
      (released_at is null and released_by is null)
      or (
        released_at is not null
        and released_by = counselor_id
        and released_at >= created_at
      )
    )
) on commit drop;

do $existing_block_table$
declare
  v_actual_columns jsonb;
  v_expected_columns jsonb;
  v_actual_constraints jsonb;
  v_expected_constraints jsonb;
  v_actual_foreign_keys jsonb;
  v_expected_foreign_keys jsonb;
begin
  if pg_catalog.to_regclass(
    'public.counselor_consultation_slot_blocks'
  ) is not null then
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        attribute_record.attname,
        pg_catalog.format_type(
          attribute_record.atttypid,
          attribute_record.atttypmod
        ),
        attribute_record.attnotnull,
        coalesce(
          pg_catalog.pg_get_expr(
            default_record.adbin,
            default_record.adrelid,
            true
          ),
          ''
        )
      ) order by attribute_record.attnum
    )
    into v_actual_columns
    from pg_catalog.pg_attribute as attribute_record
    left join pg_catalog.pg_attrdef as default_record
      on default_record.adrelid = attribute_record.attrelid
      and default_record.adnum = attribute_record.attnum
    where attribute_record.attrelid =
        'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
      and attribute_record.attnum > 0
      and attribute_record.attisdropped is false;

    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        attribute_record.attname,
        pg_catalog.format_type(
          attribute_record.atttypid,
          attribute_record.atttypmod
        ),
        attribute_record.attnotnull,
        coalesce(
          pg_catalog.pg_get_expr(
            default_record.adbin,
            default_record.adrelid,
            true
          ),
          ''
        )
      ) order by attribute_record.attnum
    )
    into v_expected_columns
    from pg_catalog.pg_attribute as attribute_record
    left join pg_catalog.pg_attrdef as default_record
      on default_record.adrelid = attribute_record.attrelid
      and default_record.adnum = attribute_record.attnum
    where attribute_record.attrelid =
        'expected_counselor_consultation_slot_blocks'::pg_catalog.regclass
      and attribute_record.attnum > 0
      and attribute_record.attisdropped is false;

    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        constraint_record.conname,
        constraint_record.contype,
        constraint_record.convalidated,
        pg_catalog.pg_get_constraintdef(
          constraint_record.oid,
          true
        )
      ) order by constraint_record.conname
    )
    into v_actual_constraints
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid =
        'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
      and constraint_record.contype in ('p', 'c');

    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        constraint_record.conname,
        constraint_record.contype,
        constraint_record.convalidated,
        pg_catalog.pg_get_constraintdef(
          constraint_record.oid,
          true
        )
      ) order by constraint_record.conname
    )
    into v_expected_constraints
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid =
        'expected_counselor_consultation_slot_blocks'::pg_catalog.regclass
      and constraint_record.contype in ('p', 'c');

    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        constraint_record.conname,
        source_attribute.attname,
        target_namespace.nspname,
        target_relation.relname,
        target_attribute.attname,
        pg_catalog.cardinality(constraint_record.conkey),
        pg_catalog.cardinality(constraint_record.confkey),
        constraint_record.confmatchtype::text,
        constraint_record.confupdtype::text,
        constraint_record.confdeltype::text,
        constraint_record.condeferrable,
        constraint_record.condeferred,
        constraint_record.convalidated
      ) order by constraint_record.conname
    )
    into v_actual_foreign_keys
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_attribute as source_attribute
      on source_attribute.attrelid = constraint_record.conrelid
      and source_attribute.attnum = constraint_record.conkey[1]
      and source_attribute.attisdropped is false
    join pg_catalog.pg_class as target_relation
      on target_relation.oid = constraint_record.confrelid
    join pg_catalog.pg_namespace as target_namespace
      on target_namespace.oid = target_relation.relnamespace
    join pg_catalog.pg_attribute as target_attribute
      on target_attribute.attrelid = constraint_record.confrelid
      and target_attribute.attnum = constraint_record.confkey[1]
      and target_attribute.attisdropped is false
    where constraint_record.conrelid =
        'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
      and constraint_record.contype = 'f';

    with expected_foreign_key (
      constraint_name,
      source_column,
      target_schema,
      target_table,
      target_column,
      source_column_count,
      target_column_count,
      match_type,
      update_action,
      delete_action,
      is_deferrable,
      is_deferred,
      is_validated
    ) as (
      values
        (
          'counselor_consultation_slot_blocks_counselor_id_fkey',
          'counselor_id',
          'public',
          'profiles',
          'id',
          1,
          1,
          's',
          'a',
          'r',
          false,
          false,
          true
        ),
        (
          'counselor_consultation_slot_blocks_released_by_fkey',
          'released_by',
          'public',
          'profiles',
          'id',
          1,
          1,
          's',
          'a',
          'r',
          false,
          false,
          true
        )
    )
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        expected_foreign_key.constraint_name,
        expected_foreign_key.source_column,
        expected_foreign_key.target_schema,
        expected_foreign_key.target_table,
        expected_foreign_key.target_column,
        expected_foreign_key.source_column_count,
        expected_foreign_key.target_column_count,
        expected_foreign_key.match_type,
        expected_foreign_key.update_action,
        expected_foreign_key.delete_action,
        expected_foreign_key.is_deferrable,
        expected_foreign_key.is_deferred,
        expected_foreign_key.is_validated
      ) order by expected_foreign_key.constraint_name
    )
    into v_expected_foreign_keys
    from expected_foreign_key;

    if v_actual_columns is distinct from v_expected_columns
      or v_actual_constraints is distinct from v_expected_constraints
      or v_actual_foreign_keys is distinct from v_expected_foreign_keys then
      raise exception using
        errcode = '55000',
        message = 'Existing Counselor slot block table does not match the reviewed contract';
    end if;

    if exists (
      select 1
      from pg_catalog.pg_policy as policy_record
      where policy_record.polrelid =
        'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
    ) or exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
        and trigger_record.tgisinternal is false
        and trigger_record.tgname <>
          'protect_counselor_consultation_slot_block_history'
    ) then
      raise exception using
        errcode = '55000',
        message = 'Existing Counselor slot block authorization objects are unexpected';
    end if;
  end if;
end;
$existing_block_table$;

create table if not exists public.counselor_consultation_slot_blocks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  counselor_id uuid not null
    constraint counselor_consultation_slot_blocks_counselor_id_fkey
      references public.profiles(id) on delete restrict,
  consultation_date date not null,
  slot_start time without time zone not null,
  reason text,
  created_at timestamptz not null
    default pg_catalog.statement_timestamp(),
  released_at timestamptz,
  released_by uuid
    constraint counselor_consultation_slot_blocks_released_by_fkey
      references public.profiles(id) on delete restrict,
  constraint counselor_consultation_slot_blocks_weekday_check
    check (extract(isodow from consultation_date) between 1 and 5),
  constraint counselor_consultation_slot_blocks_start_check
    check (
      slot_start in (
        time '09:00', time '09:30', time '10:00', time '10:30',
        time '11:00', time '11:30', time '12:00', time '12:30',
        time '13:00', time '13:30', time '14:00', time '14:30',
        time '15:00', time '15:30', time '16:00', time '16:30'
      )
    ),
  constraint counselor_consultation_slot_blocks_reason_check
    check (
      reason is null
      or (
        reason = pg_catalog.regexp_replace(
          pg_catalog.btrim(reason),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(reason) between 1 and 200
        and reason !~ '[[:cntrl:]]'
      )
    ),
  constraint counselor_consultation_slot_blocks_release_check
    check (
      (released_at is null and released_by is null)
      or (
        released_at is not null
        and released_by = counselor_id
        and released_at >= created_at
      )
    )
);

alter table public.counselor_consultation_slot_blocks owner to postgres;

comment on table public.counselor_consultation_slot_blocks is
  'Append-oriented one-off Counselor slot blocks; active rows have released_at NULL and reasons are never Student-visible.';

do $existing_block_indexes$
declare
  v_one_active_index_oid oid;
  v_active_schedule_index_oid oid;
begin
  if exists (
    select 1
    from public.counselor_consultation_slot_blocks as block
    where block.released_at is null
    group by
      block.counselor_id,
      block.consultation_date,
      block.slot_start
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '55000',
      message = 'Existing active Counselor slot block conflicts prevent convergence';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_index as index_record
    inner join pg_catalog.pg_class as index_relation
      on index_relation.oid = index_record.indexrelid
    where index_record.indrelid =
        'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
      and index_relation.relname not in (
        'counselor_consultation_slot_blocks_pkey',
        'counselor_consultation_slot_blocks_one_active_key',
        'counselor_consultation_slot_blocks_active_schedule_idx'
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Existing Counselor slot block index inventory is unexpected';
  end if;

  v_one_active_index_oid := pg_catalog.to_regclass(
    'public.counselor_consultation_slot_blocks_one_active_key'
  );

  if v_one_active_index_oid is not null then
    if not exists (
      select 1
      from pg_catalog.pg_index as index_record
      where index_record.indexrelid = v_one_active_index_oid
        and index_record.indrelid =
          'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
        and index_record.indisunique is true
        and index_record.indisvalid is true
        and index_record.indisready is true
        and index_record.indnkeyatts = 3
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          1,
          true
        ) = 'counselor_id'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          2,
          true
        ) = 'consultation_date'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          3,
          true
        ) = 'slot_start'
        and pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(
              index_record.indpred,
              index_record.indrelid,
              true
            )
          ),
          '[()[:space:]]+',
          '',
          'g'
        ) = 'released_atisnull'
    ) then
      raise exception using
        errcode = '55000',
        message = 'Existing active Counselor block index does not match the reviewed contract';
    end if;
  end if;

  v_active_schedule_index_oid := pg_catalog.to_regclass(
    'public.counselor_consultation_slot_blocks_active_schedule_idx'
  );

  if v_active_schedule_index_oid is not null then
    if not exists (
      select 1
      from pg_catalog.pg_index as index_record
      where index_record.indexrelid = v_active_schedule_index_oid
        and index_record.indrelid =
          'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
        and index_record.indisunique is false
        and index_record.indisvalid is true
        and index_record.indisready is true
        and index_record.indnkeyatts = 3
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          1,
          true
        ) = 'consultation_date'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          2,
          true
        ) = 'slot_start'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          3,
          true
        ) = 'counselor_id'
        and pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(
              index_record.indpred,
              index_record.indrelid,
              true
            )
          ),
          '[()[:space:]]+',
          '',
          'g'
        ) = 'released_atisnull'
    ) then
      raise exception using
        errcode = '55000',
        message = 'Existing Counselor block schedule index does not match the reviewed contract';
    end if;
  end if;
end;
$existing_block_indexes$;

create unique index if not exists
  counselor_consultation_slot_blocks_one_active_key
  on public.counselor_consultation_slot_blocks (
    counselor_id,
    consultation_date,
    slot_start
  )
  where released_at is null;

create index if not exists
  counselor_consultation_slot_blocks_active_schedule_idx
  on public.counselor_consultation_slot_blocks (
    consultation_date,
    slot_start,
    counselor_id
  )
  where released_at is null;

create or replace function public.protect_counselor_consultation_slot_block_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '42501',
      message = 'Counselor slot block history cannot be deleted';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.counselor_id is distinct from old.counselor_id
    or new.consultation_date is distinct from old.consultation_date
    or new.slot_start is distinct from old.slot_start
    or new.reason is distinct from old.reason
    or new.created_at is distinct from old.created_at
    or old.released_at is not null
    or old.released_by is not null
    or new.released_at is null
    or new.released_by is distinct from old.counselor_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Counselor slot block history is immutable';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = new.counselor_id
      and profile.role = 'counselor'::public.user_role
  ) then
    raise exception using
      errcode = '23514',
      message = 'Counselor slot block owner is invalid';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

alter function public.protect_counselor_consultation_slot_block_history()
  owner to postgres;

revoke all on function public.protect_counselor_consultation_slot_block_history()
  from public, anon, authenticated, service_role;

create or replace trigger protect_counselor_consultation_slot_block_history
before insert or update or delete
on public.counselor_consultation_slot_blocks
for each row execute function
  public.protect_counselor_consultation_slot_block_history();

alter table public.counselor_consultation_slot_blocks
  enable row level security;

alter table public.counselor_consultation_slot_blocks
  force row level security;

revoke all on table public.counselor_consultation_slot_blocks
  from public, anon, authenticated, service_role;

create or replace function public.kgeo_consultation_slot_lock_key(
  p_counselor_id uuid,
  p_consultation_date date,
  p_slot_start time without time zone
)
returns bigint
language sql
immutable
strict
parallel safe
set search_path = ''
as $function$
  select pg_catalog.hashtextextended(
    p_counselor_id::text
      || '|' || p_consultation_date::text
      || '|' || p_slot_start::text,
    0
  );
$function$;

alter function public.kgeo_consultation_slot_lock_key(uuid, date, time)
  owner to postgres;

revoke all on function
  public.kgeo_consultation_slot_lock_key(uuid, date, time)
  from public, anon, authenticated, service_role;

create or replace function public.block_my_consultation_slot(
  p_consultation_date date,
  p_slot_start time without time zone,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
  v_business_now timestamp without time zone;
  v_reason text;
  v_block_id uuid;
begin
  v_business_now :=
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata';

  if v_caller_id is null
    or p_consultation_date is null
    or p_slot_start is null
    or p_consultation_date < v_business_now::date
    or (
      p_consultation_date = v_business_now::date
      and p_slot_start <= v_business_now::time
    )
    or extract(isodow from p_consultation_date) not between 1 and 5
    or not exists (
      select 1
      from public.get_kgeo_consultation_slot_catalog() as catalog
      where catalog.slot_start = p_slot_start
    ) then
    raise exception using
      errcode = '22023',
      message = 'Choose a future canonical Counselor slot';
  end if;

  if p_reason is not null then
    if p_reason ~ '[[:cntrl:]]' then
      raise exception using
        errcode = '22023',
        message = 'The slot block reason is invalid';
    end if;
    v_reason := pg_catalog.regexp_replace(
      pg_catalog.btrim(p_reason),
      '[[:space:]]+',
      ' ',
      'g'
    );
    if pg_catalog.char_length(v_reason) not between 1 and 200 then
      raise exception using
        errcode = '22023',
        message = 'The slot block reason is invalid';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.kgeo_consultation_slot_lock_key(
      v_caller_id,
      p_consultation_date,
      p_slot_start
    )
  );

  perform 1
  from public.profiles as counselor_profile
  inner join public.counselor_accounts as account
    on account.user_id = counselor_profile.id
  inner join auth.users as counselor_auth
    on counselor_auth.id = counselor_profile.id
  where counselor_profile.id = v_caller_id
    and counselor_profile.role = 'counselor'::public.user_role
    and counselor_profile.is_active is true
    and account.approval_status =
      'approved'::public.counselor_approval_status
    and counselor_auth.email_confirmed_at is not null
  for update of counselor_profile, account, counselor_auth;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'An approved active verified Counselor is required';
  end if;

  if exists (
    select 1
    from public.consultation_requests as request
    where request.assigned_counselor_id = v_caller_id
      and request.consultation_date = p_consultation_date
      and request.slot_start = p_slot_start
      and request.status <> 'cancelled'::public.consultation_status
  ) then
    raise exception using
      errcode = '23514',
      message = 'An assigned consultation already occupies this slot';
  end if;

  insert into public.counselor_consultation_slot_blocks as block (
    counselor_id,
    consultation_date,
    slot_start,
    reason,
    created_at
  ) values (
    v_caller_id,
    p_consultation_date,
    p_slot_start,
    v_reason,
    pg_catalog.statement_timestamp()
  )
  returning block.id into v_block_id;

  return v_block_id;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'This Counselor slot is already blocked';
end;
$function$;

alter function public.block_my_consultation_slot(date, time, text)
  owner to postgres;

comment on function public.block_my_consultation_slot(date, time, text) is
  'Allows an approved active verified Counselor to block only their own future canonical unbooked slot.';

revoke all on function public.block_my_consultation_slot(date, time, text)
  from public, anon, authenticated, service_role;

grant execute on function public.block_my_consultation_slot(date, time, text)
  to authenticated;

create or replace function public.release_my_consultation_slot_block(
  p_block_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
  v_consultation_date date;
  v_slot_start time without time zone;
begin
  if v_caller_id is null or p_block_id is null then
    raise exception using
      errcode = '22023',
      message = 'The Counselor slot block is invalid';
  end if;

  select
    block.consultation_date,
    block.slot_start
  into
    v_consultation_date,
    v_slot_start
  from public.counselor_consultation_slot_blocks as block
  where block.id = p_block_id
    and block.counselor_id = v_caller_id
    and block.released_at is null;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'The active Counselor slot block was not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.kgeo_consultation_slot_lock_key(
      v_caller_id,
      v_consultation_date,
      v_slot_start
    )
  );

  perform 1
  from public.profiles as counselor_profile
  inner join public.counselor_accounts as account
    on account.user_id = counselor_profile.id
  inner join auth.users as counselor_auth
    on counselor_auth.id = counselor_profile.id
  where counselor_profile.id = v_caller_id
    and counselor_profile.role = 'counselor'::public.user_role
    and counselor_profile.is_active is true
    and account.approval_status =
      'approved'::public.counselor_approval_status
    and counselor_auth.email_confirmed_at is not null
  for update of counselor_profile, account, counselor_auth;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'An approved active verified Counselor is required';
  end if;

  update public.counselor_consultation_slot_blocks as block
  set
    released_at = pg_catalog.statement_timestamp(),
    released_by = v_caller_id
  where block.id = p_block_id
    and block.counselor_id = v_caller_id
    and block.consultation_date = v_consultation_date
    and block.slot_start = v_slot_start
    and block.released_at is null;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The Counselor slot block changed concurrently';
  end if;

  return true;
end;
$function$;

alter function public.release_my_consultation_slot_block(uuid)
  owner to postgres;

comment on function public.release_my_consultation_slot_block(uuid) is
  'Releases only the caller-owned active slot block while retaining immutable block history.';

revoke all on function public.release_my_consultation_slot_block(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.release_my_consultation_slot_block(uuid)
  to authenticated;

create or replace function public.list_my_active_consultation_slot_blocks()
returns table (
  block_id uuid,
  consultation_date date,
  slot_start time without time zone,
  slot_end time without time zone,
  reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
begin
  if v_caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as account
      on account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = v_caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An approved active verified Counselor is required';
  end if;

  return query
  select
    block.id,
    block.consultation_date,
    block.slot_start,
    (block.slot_start + interval '30 minutes')::time,
    block.reason,
    block.created_at
  from public.counselor_consultation_slot_blocks as block
  where block.counselor_id = v_caller_id
    and block.released_at is null
  order by block.consultation_date, block.slot_start, block.id
  limit 100;
end;
$function$;

alter function public.list_my_active_consultation_slot_blocks()
  owner to postgres;

revoke all on function public.list_my_active_consultation_slot_blocks()
  from public, anon, authenticated, service_role;

grant execute on function public.list_my_active_consultation_slot_blocks()
  to authenticated;

do $existing_consultation_indexes$
declare
  v_student_slot_index_oid oid;
  v_counselor_slot_index_oid oid;
begin
  if exists (
    select 1
    from public.consultation_requests as request
    where request.status <> 'cancelled'::public.consultation_status
      and request.student_id is not null
      and request.consultation_date is not null
      and request.slot_start is not null
    group by
      request.student_id,
      request.consultation_date,
      request.slot_start
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '55000',
      message = 'Existing Student consultation slot conflicts prevent convergence';
  end if;

  v_student_slot_index_oid := pg_catalog.to_regclass(
    'public.consultation_requests_active_student_slot_key'
  );

  if v_student_slot_index_oid is not null then
    if not exists (
      select 1
      from pg_catalog.pg_index as index_record
      where index_record.indexrelid = v_student_slot_index_oid
        and index_record.indrelid =
          'public.consultation_requests'::pg_catalog.regclass
        and index_record.indisunique is true
        and index_record.indisvalid is true
        and index_record.indisready is true
        and index_record.indnkeyatts = 3
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          1,
          true
        ) = 'student_id'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          2,
          true
        ) = 'consultation_date'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          3,
          true
        ) = 'slot_start'
        and pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(
              index_record.indpred,
              index_record.indrelid,
              true
            )
          ),
          '[()[:space:]]+',
          '',
          'g'
        ) = 'status<>''cancelled''::public.consultation_status'
    ) then
      raise exception using
        errcode = '55000',
        message = 'Existing Student consultation slot index does not match the reviewed contract';
    end if;
  end if;

  v_counselor_slot_index_oid := pg_catalog.to_regclass(
    'public.consultation_requests_active_counselor_slot_key'
  );

  if v_counselor_slot_index_oid is not null then
    if not exists (
      select 1
      from pg_catalog.pg_index as index_record
      where index_record.indexrelid = v_counselor_slot_index_oid
        and index_record.indrelid =
          'public.consultation_requests'::pg_catalog.regclass
        and index_record.indisunique is true
        and index_record.indisvalid is true
        and index_record.indisready is true
        and index_record.indnkeyatts = 3
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          1,
          true
        ) = 'assigned_counselor_id'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          2,
          true
        ) = 'consultation_date'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          3,
          true
        ) = 'slot_start'
        and pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(
              index_record.indpred,
              index_record.indrelid,
              true
            )
          ),
          '[()[:space:]]+',
          '',
          'g'
        ) = 'assigned_counselor_idisnotnullandstatus<>''cancelled''::public.consultation_status'
    ) then
      raise exception using
        errcode = '55000',
        message = 'Existing Counselor consultation slot index does not match the reviewed contract';
    end if;
  end if;
end;
$existing_consultation_indexes$;

-- A Student may hold multiple consultations, but never two non-cancelled
-- consultations at the exact same canonical date and start. Cancelled rows do
-- not prevent a valid rebooking.
create unique index if not exists
  consultation_requests_active_student_slot_key
  on public.consultation_requests (
    student_id,
    consultation_date,
    slot_start
  )
  where status <> 'cancelled'::public.consultation_status;

comment on index public.consultation_requests_active_student_slot_key is
  'Prevents one Student from holding duplicate non-cancelled consultations at the same business date and canonical start while allowing cancelled-slot rebooking.';

-- Install per-Counselor capacity before removing the global V1 index.
create unique index if not exists
  consultation_requests_active_counselor_slot_key
  on public.consultation_requests (
    assigned_counselor_id,
    consultation_date,
    slot_start
  )
  where assigned_counselor_id is not null
    and status <> 'cancelled'::public.consultation_status;

comment on index public.consultation_requests_active_counselor_slot_key is
  'Prevents one Counselor from owning two non-cancelled consultations at the same business date and start while preserving factual completed/no-show history.';

create or replace function public.book_student_consultation(
  p_student_name text,
  p_roll_number text,
  p_personal_email text,
  p_college_end_year integer,
  p_department text,
  p_course text,
  p_mobile_number text,
  p_higher_studies_interest public.higher_studies_interest,
  p_consultation_date date,
  p_slot_start time without time zone
)
returns table (
  request_number text,
  consultation_date date,
  slot_start time without time zone,
  slot_end time without time zone,
  status public.consultation_status
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid := (select auth.uid());
  v_college_email text;
  v_student_name text;
  v_roll_number text;
  v_personal_email text;
  v_department text;
  v_course text;
  v_mobile_number text;
  v_request_time timestamptz;
  v_business_now timestamp without time zone;
  v_business_today date;
  v_slot_end time without time zone;
  v_primary_counselor_id uuid;
  v_selected_counselor_id uuid;
  v_candidate record;
  v_request_number text;
  v_request_sequence bigint;
begin
  v_request_time := pg_catalog.statement_timestamp();
  v_business_now := v_request_time at time zone 'Asia/Kolkata';
  v_business_today := v_business_now::date;

  if v_student_id is null then
    raise exception using
      errcode = '42501',
      message = 'An active verified Student is required';
  end if;

  select student_profile.college_email
  into v_college_email
  from public.profiles as student_profile
  inner join auth.users as student_auth
    on student_auth.id = student_profile.id
  where student_profile.id = v_student_id
    and student_profile.role = 'student'::public.user_role
    and student_profile.is_active is true
    and student_auth.email_confirmed_at is not null
  for update of student_profile, student_auth;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'An active verified Student is required';
  end if;

  v_student_name := pg_catalog.btrim(p_student_name);
  v_roll_number := pg_catalog.upper(pg_catalog.btrim(p_roll_number));
  v_personal_email := pg_catalog.lower(pg_catalog.btrim(p_personal_email));
  v_department := pg_catalog.btrim(p_department);
  v_course := pg_catalog.btrim(p_course);
  v_mobile_number := pg_catalog.btrim(p_mobile_number);

  if v_student_name is null
    or pg_catalog.char_length(v_student_name) not between 1 and 150
    or v_roll_number is null
    or pg_catalog.char_length(v_roll_number) not between 1 and 50
    or v_personal_email is null
    or pg_catalog.char_length(v_personal_email) > 320
    or v_personal_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    or p_college_end_year is null
    or p_college_end_year not between 2024 and 2040
    or v_department is null
    or pg_catalog.char_length(v_department) not between 1 and 150
    or v_course is null
    or pg_catalog.char_length(v_course) not between 1 and 150
    or v_mobile_number is null
    or v_mobile_number !~ '^[0-9]{10}$'
    or p_higher_studies_interest is null then
    raise exception using
      errcode = '22023',
      message = 'The consultation booking details are invalid';
  end if;

  if p_consultation_date is null
    or p_slot_start is null
    or p_consultation_date < v_business_today
    or p_consultation_date > v_business_today + 6
    or extract(isodow from p_consultation_date) not between 1 and 5
    or (
      p_consultation_date = v_business_today
      and p_slot_start <= v_business_now::time
    ) then
    raise exception using
      errcode = '23514',
      message = 'The selected consultation date or slot is unavailable';
  end if;

  select catalog.slot_end
  into v_slot_end
  from public.get_kgeo_consultation_slot_catalog() as catalog
  where catalog.slot_start = p_slot_start;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'The selected consultation date or slot is unavailable';
  end if;

  -- Student profile -> nonterminal consultations -> Primary assignment is the
  -- shared Student-side lock order used by booking and reassignment workflows.
  perform 1
  from public.consultation_requests as existing
  where existing.student_id = v_student_id
    and existing.status in (
      'submitted'::public.consultation_status,
      'waiting_for_assignment'::public.consultation_status,
      'counselor_assigned'::public.consultation_status,
      'scheduled'::public.consultation_status
    )
  order by existing.id
  for update;

  if exists (
    select 1
    from public.consultation_requests as existing
    where existing.student_id = v_student_id
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

  select assignment.counselor_id
  into v_primary_counselor_id
  from public.student_counselor_assignments as assignment
  where assignment.student_id = v_student_id
    and assignment.ended_at is null
  for update;

  v_selected_counselor_id := null;

  for v_candidate in
    select
      counselor_profile.id as counselor_id,
      case
        when counselor_profile.id = v_primary_counselor_id then 0
        else 1
      end as primary_priority,
      (
        select pg_catalog.count(*)
        from public.consultation_requests as workload
        where workload.assigned_counselor_id = counselor_profile.id
          and workload.consultation_date = p_consultation_date
          and workload.status in (
            'counselor_assigned'::public.consultation_status,
            'scheduled'::public.consultation_status,
            'completed'::public.consultation_status,
            'no_show'::public.consultation_status
          )
      ) as daily_workload
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as account
      on account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
    order by
      primary_priority,
      daily_workload,
      counselor_profile.id
  loop
    if not pg_catalog.pg_try_advisory_xact_lock(
      public.kgeo_consultation_slot_lock_key(
        v_candidate.counselor_id,
        p_consultation_date,
        p_slot_start
      )
    ) then
      continue;
    end if;

    perform 1
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as account
      on account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = v_candidate.counselor_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
    for update of counselor_profile, account, counselor_auth;

    if not found then
      continue;
    end if;

    if exists (
      select 1
      from public.counselor_consultation_slot_blocks as block
      where block.counselor_id = v_candidate.counselor_id
        and block.consultation_date = p_consultation_date
        and block.slot_start = p_slot_start
        and block.released_at is null
    ) or exists (
      select 1
      from public.consultation_requests as occupied
      where occupied.assigned_counselor_id = v_candidate.counselor_id
        and occupied.consultation_date = p_consultation_date
        and occupied.slot_start = p_slot_start
        and occupied.status <> 'cancelled'::public.consultation_status
    ) then
      continue;
    end if;

    v_selected_counselor_id := v_candidate.counselor_id;
    exit;
  end loop;

  if v_selected_counselor_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'No Counselor is available for the selected consultation slot';
  end if;

  v_request_sequence := pg_catalog.nextval(
    'public.consultation_request_number_seq'::pg_catalog.regclass
  );
  v_request_number := pg_catalog.format(
    'KGEOC-%s-%s',
    pg_catalog.to_char(v_request_time, 'YYYY'),
    pg_catalog.lpad(v_request_sequence::text, 6, '0')
  );

  insert into public.consultation_requests (
    student_id,
    request_number,
    student_name,
    roll_number,
    college_email,
    personal_email,
    college_end_year,
    department,
    course,
    mobile_number,
    higher_studies_interest,
    status,
    assigned_counselor_id,
    consultation_date,
    slot_start,
    slot_end,
    submitted_at,
    assigned_at,
    created_at,
    updated_at
  ) values (
    v_student_id,
    v_request_number,
    v_student_name,
    v_roll_number,
    v_college_email,
    v_personal_email,
    p_college_end_year,
    v_department,
    v_course,
    v_mobile_number,
    p_higher_studies_interest,
    'scheduled'::public.consultation_status,
    v_selected_counselor_id,
    p_consultation_date,
    p_slot_start,
    v_slot_end,
    v_request_time,
    v_request_time,
    v_request_time,
    v_request_time
  );

  return query
  select
    v_request_number,
    p_consultation_date,
    p_slot_start,
    v_slot_end,
    'scheduled'::public.consultation_status;
end;
$function$;

alter function public.book_student_consultation(
  text, text, text, integer, text, text, text,
  public.higher_studies_interest, date, time
) owner to postgres;

comment on function public.book_student_consultation(
  text, text, text, integer, text, text, text,
  public.higher_studies_interest, date, time
) is
  'Atomically validates a Student booking, prefers an eligible existing Primary Counselor, falls back by daily workload and UUID, and schedules the consultation without activating a new Primary case.';

revoke all on function public.book_student_consultation(
  text, text, text, integer, text, text, text,
  public.higher_studies_interest, date, time
) from public, anon, authenticated, service_role;

grant execute on function public.book_student_consultation(
  text, text, text, integer, text, text, text,
  public.higher_studies_interest, date, time
) to authenticated;

-- A completed initial consultation becomes a managed K-GEO case only after
-- the Student explicitly continues. The consultation's assigned Counselor is
-- the sole trusted source for the initial Primary assignment.
create or replace function public.continue_with_kgeo()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid := (select auth.uid());
  v_consultation_counselor_id uuid;
  v_existing_primary_id uuid;
  v_assignment_time timestamptz := pg_catalog.statement_timestamp();
  v_business_now timestamp without time zone;
begin
  if v_student_id is null then
    raise exception using
      errcode = '42501',
      message = 'An active verified Student is required';
  end if;

  v_business_now := v_assignment_time at time zone 'Asia/Kolkata';

  perform 1
  from public.profiles as student_profile
  inner join auth.users as student_auth
    on student_auth.id = student_profile.id
  where student_profile.id = v_student_id
    and student_profile.role = 'student'::public.user_role
    and student_profile.is_active is true
    and student_auth.email_confirmed_at is not null
  for update of student_profile, student_auth;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'An active verified Student is required';
  end if;

  select request.assigned_counselor_id
  into v_consultation_counselor_id
  from public.consultation_requests as request
  where request.student_id = v_student_id
    and request.status = 'completed'::public.consultation_status
    and request.assigned_counselor_id is not null
    and request.consultation_date is not null
    and request.slot_start is not null
    and request.slot_end is not null
    and request.slot_end > request.slot_start
    and (
      request.consultation_date < v_business_now::date
      or (
        request.consultation_date = v_business_now::date
        and request.slot_end <= v_business_now::time
      )
    )
    and exists (
      select 1
      from public.get_kgeo_consultation_slot_catalog() as catalog
      where catalog.slot_start = request.slot_start
        and catalog.slot_end = request.slot_end
    )
  order by
    request.consultation_date desc,
    request.slot_end desc,
    request.id desc
  limit 1
  for update of request;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'A completed Student consultation is required to continue with K-GEO';
  end if;

  select assignment.id
  into v_existing_primary_id
  from public.student_counselor_assignments as assignment
  where assignment.student_id = v_student_id
    and assignment.ended_at is null
  for update;

  if found then
    return false;
  end if;

  perform 1
  from public.profiles as counselor_profile
  inner join public.counselor_accounts as account
    on account.user_id = counselor_profile.id
  inner join auth.users as counselor_auth
    on counselor_auth.id = counselor_profile.id
  where counselor_profile.id = v_consultation_counselor_id
    and counselor_profile.role = 'counselor'::public.user_role
    and counselor_profile.is_active is true
    and account.approval_status =
      'approved'::public.counselor_approval_status
    and counselor_auth.email_confirmed_at is not null
  for update of counselor_profile, account, counselor_auth;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'K-GEO staff review is required before this case can be activated';
  end if;

  insert into public.student_counselor_assignments (
    student_id,
    counselor_id,
    assigned_at,
    assigned_by,
    ended_at,
    created_at,
    assignment_reason
  ) values (
    v_student_id,
    v_consultation_counselor_id,
    v_assignment_time,
    null,
    null,
    v_assignment_time,
    null
  );

  return true;
end;
$function$;

alter function public.continue_with_kgeo() owner to postgres;

comment on function public.continue_with_kgeo() is
  'Activates one Student Primary Counselor case from that Student''s latest eligible completed assigned consultation; returns false when an active Primary assignment already exists.';

revoke all on function public.continue_with_kgeo()
  from public, anon, authenticated, service_role;

grant execute on function public.continue_with_kgeo()
  to authenticated;

-- The historical enum retains its old value for compatibility. The final
-- Student projection returns text so every unavailable cause collapses to one
-- non-diagnostic value.
revoke execute on function public.get_consultation_slot_availability(date)
  from public, anon, authenticated, service_role;

drop function if exists public.get_consultation_slot_availability(date);

create function public.get_consultation_slot_availability(
  p_date date
)
returns table (
  slot_start time without time zone,
  slot_end time without time zone,
  availability_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid := (select auth.uid());
  v_business_now timestamp without time zone;
begin
  v_business_now :=
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata';

  if v_student_id is null or not exists (
    select 1
    from public.profiles as student_profile
    inner join auth.users as student_auth
      on student_auth.id = student_profile.id
    where student_profile.id = v_student_id
      and student_profile.role = 'student'::public.user_role
      and student_profile.is_active is true
      and student_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified Student is required';
  end if;

  if p_date is null
    or p_date < v_business_now::date
    or p_date > v_business_now::date + 6
    or extract(isodow from p_date) not between 1 and 5 then
    raise exception using
      errcode = '22023',
      message = 'Choose a weekday inside the next seven calendar dates';
  end if;

  return query
  select
    catalog.slot_start,
    catalog.slot_end,
    case
      when p_date = v_business_now::date
        and catalog.slot_start <= v_business_now::time
        then 'expired'::text
      when exists (
        select 1
        from public.consultation_requests as student_booking
        where student_booking.student_id = v_student_id
          and student_booking.consultation_date = p_date
          and student_booking.slot_start = catalog.slot_start
          and student_booking.status <>
            'cancelled'::public.consultation_status
      ) then 'unavailable'::text
      when exists (
        select 1
        from public.profiles as counselor_profile
        inner join public.counselor_accounts as account
          on account.user_id = counselor_profile.id
        inner join auth.users as counselor_auth
          on counselor_auth.id = counselor_profile.id
        where counselor_profile.role = 'counselor'::public.user_role
          and counselor_profile.is_active is true
          and account.approval_status =
            'approved'::public.counselor_approval_status
          and counselor_auth.email_confirmed_at is not null
          and not exists (
            select 1
            from public.counselor_consultation_slot_blocks as block
            where block.counselor_id = counselor_profile.id
              and block.consultation_date = p_date
              and block.slot_start = catalog.slot_start
              and block.released_at is null
          )
          and not exists (
            select 1
            from public.consultation_requests as occupied
            where occupied.assigned_counselor_id = counselor_profile.id
              and occupied.consultation_date = p_date
              and occupied.slot_start = catalog.slot_start
              and occupied.status <>
                'cancelled'::public.consultation_status
          )
      ) then 'available'::text
      else 'unavailable'::text
    end
  from public.get_kgeo_consultation_slot_catalog() as catalog
  order by catalog.slot_ordinal;
end;
$function$;

alter function public.get_consultation_slot_availability(date)
  owner to postgres;

comment on function public.get_consultation_slot_availability(date) is
  'Returns all sixteen canonical slots with only minimal Student-safe availability after checking eligible Counselor capacity and active blocks.';

revoke all on function public.get_consultation_slot_availability(date)
  from public, anon, authenticated, service_role;

grant execute on function public.get_consultation_slot_availability(date)
  to authenticated;

create or replace function public.list_my_assigned_consultations(
  p_date_from date default null,
  p_date_to date default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  request_number text,
  student_id uuid,
  student_name text,
  course text,
  department text,
  college_end_year integer,
  cgpa numeric,
  cgpa_scale numeric,
  active_backlogs integer,
  higher_studies_interest public.higher_studies_interest,
  target_intake text,
  preferred_countries text[],
  ready_for_counseling boolean,
  consultation_date date,
  slot_start time without time zone,
  slot_end time without time zone,
  status public.consultation_status,
  submitted_at timestamptz,
  is_primary_counselor boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
begin
  if v_caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as account
      on account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = v_caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'Assigned consultations are temporarily unavailable';
  end if;

  if p_limit is null
    or p_limit not between 1 and 200
    or (p_date_from is not null and p_date_to is not null
      and p_date_to < p_date_from)
    or (p_date_from is not null and p_date_to is not null
      and p_date_to > p_date_from + 366) then
    raise exception using
      errcode = '22023',
      message = 'Assigned consultation filters are invalid';
  end if;

  return query
  select
    request.id,
    request.request_number,
    case when assignment.id is not null then request.student_id else null end,
    request.student_name,
    request.course,
    request.department,
    request.college_end_year,
    student_profile.cgpa,
    student_profile.cgpa_scale,
    student_profile.active_backlogs,
    request.higher_studies_interest,
    preference.target_intake,
    coalesce(preference.preferred_countries, array[]::text[]),
    completion.ready_for_counseling,
    request.consultation_date,
    request.slot_start,
    request.slot_end,
    request.status,
    request.submitted_at,
    assignment.id is not null
  from public.consultation_requests as request
  left join public.student_counselor_assignments as assignment
    on assignment.student_id = request.student_id
    and assignment.counselor_id = v_caller_id
    and assignment.ended_at is null
  left join public.student_profiles as student_profile
    on student_profile.student_id = request.student_id
  left join public.student_preferences as preference
    on preference.student_id = request.student_id
  left join public.student_profile_completion as completion
    on completion.student_id = request.student_id
  where request.assigned_counselor_id = v_caller_id
    and (p_date_from is null or request.consultation_date >= p_date_from)
    and (p_date_to is null or request.consultation_date <= p_date_to)
  order by
    request.consultation_date asc nulls last,
    request.slot_start asc nulls last,
    request.id asc
  limit p_limit;
end;
$function$;

alter function public.list_my_assigned_consultations(date, date, integer)
  owner to postgres;

comment on function public.list_my_assigned_consultations(date, date, integer) is
  'Returns a bounded consultation-safe projection only for sessions assigned to the Counselor caller; Student IDs are returned only for current Primary ownership.';

revoke all on function
  public.list_my_assigned_consultations(date, date, integer)
  from public, anon, authenticated, service_role;

grant execute on function
  public.list_my_assigned_consultations(date, date, integer)
  to authenticated;

create or replace function public.get_my_consultation_dashboard_metrics()
returns table (
  today_count bigint,
  upcoming_count bigint,
  outcome_required_count bigint,
  completed_count bigint,
  no_show_count bigint,
  cancelled_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
  v_business_now timestamp without time zone;
begin
  if v_caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as account
      on account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = v_caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'Consultation metrics are temporarily unavailable';
  end if;

  v_business_now :=
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata';

  return query
  select
    pg_catalog.count(*) filter (
      where request.consultation_date = v_business_now::date
        and request.status <> 'cancelled'::public.consultation_status
    ),
    pg_catalog.count(*) filter (
      where request.status = 'scheduled'::public.consultation_status
        and (
          request.consultation_date > v_business_now::date
          or (
            request.consultation_date = v_business_now::date
            and request.slot_end > v_business_now::time
          )
        )
    ),
    pg_catalog.count(*) filter (
      where request.status = 'scheduled'::public.consultation_status
        and (
          request.consultation_date < v_business_now::date
          or (
            request.consultation_date = v_business_now::date
            and request.slot_end <= v_business_now::time
          )
        )
    ),
    pg_catalog.count(*) filter (
      where request.status = 'completed'::public.consultation_status
    ),
    pg_catalog.count(*) filter (
      where request.status = 'no_show'::public.consultation_status
    ),
    pg_catalog.count(*) filter (
      where request.status = 'cancelled'::public.consultation_status
    )
  from public.consultation_requests as request
  where request.assigned_counselor_id = v_caller_id;
end;
$function$;

alter function public.get_my_consultation_dashboard_metrics()
  owner to postgres;

revoke all on function public.get_my_consultation_dashboard_metrics()
  from public, anon, authenticated, service_role;

grant execute on function public.get_my_consultation_dashboard_metrics()
  to authenticated;

-- Reference lookup is retained for Primary Workspace compatibility but now
-- authorizes each result as either current Primary ownership or assignment to
-- this exact consultation.
create or replace function public.get_counselor_consultation_references(
  p_consultation_ids uuid[]
)
returns table (
  consultation_id uuid,
  request_number text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
  v_requested_count integer;
begin
  if v_caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as account
      on account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = v_caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'Consultation references are temporarily unavailable';
  end if;

  v_requested_count := pg_catalog.cardinality(p_consultation_ids);
  if p_consultation_ids is null
    or v_requested_count not between 1 and 100
    or pg_catalog.array_position(p_consultation_ids, null) is not null
    or (
      select pg_catalog.count(distinct requested.consultation_id)
      from pg_catalog.unnest(p_consultation_ids)
        as requested(consultation_id)
    ) <> v_requested_count then
    raise exception using
      errcode = '22023',
      message = 'Provide between 1 and 100 unique consultation identifiers';
  end if;

  return query
  select request.id, request.request_number
  from public.consultation_requests as request
  where request.id = any (p_consultation_ids)
    and (
      request.assigned_counselor_id = v_caller_id
      or public.is_active_primary_counselor_for_student(request.student_id)
    )
  order by request.id;
end;
$function$;

alter function public.get_counselor_consultation_references(uuid[])
  owner to postgres;

revoke all on function public.get_counselor_consultation_references(uuid[])
  from public, anon, authenticated, service_role;

grant execute on function public.get_counselor_consultation_references(uuid[])
  to authenticated;

-- Retire broad Counselor table reads. Primary Counselors retain case-history
-- reads; covering Counselors use only the bounded assigned-session projection.
drop policy if exists consultation_requests_select_counselor_all
  on public.consultation_requests;

drop policy if exists consultation_requests_select_primary_counselor
  on public.consultation_requests;

create policy consultation_requests_select_primary_counselor
on public.consultation_requests
for select
to authenticated
using (
  public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  )
  and exists (
    select 1
    from public.counselor_accounts as account
    where account.user_id = (select auth.uid())
      and account.approval_status =
        'approved'::public.counselor_approval_status
  )
  and public.is_active_primary_counselor_for_student(student_id)
);

comment on policy consultation_requests_select_primary_counselor
  on public.consultation_requests is
  'Approved active verified Primary Counselors may read consultation history for their actively assigned Students; covering Counselors use the bounded projection.';

-- Student direct INSERT is no longer a supported path. The allocator owns all
-- trusted assignment/status/timestamp fields and the old trigger is retired.
drop policy if exists consultation_requests_insert_own
  on public.consultation_requests;

revoke insert on table public.consultation_requests
  from authenticated;

revoke insert (
  student_name,
  roll_number,
  personal_email,
  college_end_year,
  department,
  course,
  mobile_number,
  higher_studies_interest,
  consultation_date,
  slot_start
) on public.consultation_requests
  from authenticated;

drop trigger if exists consultation_requests_prepare_insert
  on public.consultation_requests;

comment on function public.prepare_consultation_request_insert() is
  'Retired defense from the direct-INSERT workflow; automatic booking now uses book_student_consultation exclusively.';

-- Claim Next remains present only for a short rollback window, with no normal
-- application execution privilege.
revoke execute on function public.claim_next_consultation()
  from public, anon, authenticated, service_role;

comment on function public.claim_next_consultation() is
  'RETIRED after automatic allocation cutover; no normal application role may execute this rollback-window function.';

-- The replacement allocator, availability, projection and per-Counselor
-- invariant are now installed. Remove organization-wide capacity last.
drop index if exists public.consultation_requests_active_slot_key;

commit;

-- >>> supabase/migrations/202608240002_student_profile_documents.sql
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

-- >>> supabase/migrations/202608250001_student_profile_v2_client_corrections.sql
-- K-GEO Student Profile V2 client-meeting corrections.
-- Profile Documents and the consultation workflow remain unchanged.

begin;

set local search_path = '';

alter type public.student_achievement_type add value if not exists 'sports' before 'other';
alter type public.student_exam_name add value if not exists 'dmat' before 'gate';
alter type public.student_study_mode add value if not exists 'on_campus';
alter type public.student_study_mode add value if not exists 'online';

do $block$
declare
  v_type_oid oid := pg_catalog.to_regtype(
    'public.student_preferred_study_area'
  )::oid;
  v_actual_labels text[];
begin
  if v_type_oid is null then
    execute $ddl$create type public.student_preferred_study_area as enum (
      'engineering',
      'business',
      'psychology'
    )$ddl$;
  else
    select pg_catalog.array_agg(
      enum_value.enumlabel::text order by enum_value.enumsortorder
    )
    into v_actual_labels
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid = v_type_oid;

    if v_actual_labels is distinct from
      array['engineering', 'business', 'psychology']::text[] then
      raise exception using
        errcode = '55000',
        message = 'Existing Student Preferred Study Area type does not match the reviewed contract';
    end if;
  end if;
end;
$block$;

do $block$
declare
  v_type_oid oid := pg_catalog.to_regtype(
    'public.student_preferred_domain'
  )::oid;
  v_actual_labels text[];
begin
  if v_type_oid is null then
    execute $ddl$create type public.student_preferred_domain as enum (
      'engineering_computing',
      'engineering_electrical',
      'engineering_mechanical',
      'business_management',
      'business_finance',
      'business_analytics',
      'psychology_clinical',
      'psychology_counseling',
      'psychology_organizational'
    )$ddl$;
  else
    select pg_catalog.array_agg(
      enum_value.enumlabel::text order by enum_value.enumsortorder
    )
    into v_actual_labels
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid = v_type_oid;

    if v_actual_labels is distinct from array[
      'engineering_computing', 'engineering_electrical',
      'engineering_mechanical', 'business_management', 'business_finance',
      'business_analytics', 'psychology_clinical',
      'psychology_counseling', 'psychology_organizational'
    ]::text[] then
      raise exception using
        errcode = '55000',
        message = 'Existing Student Preferred Domain type does not match the reviewed contract';
    end if;
  end if;
end;
$block$;

do $block$
declare
  v_type_oid oid := pg_catalog.to_regtype(
    'public.student_study_pathway'
  )::oid;
  v_actual_labels text[];
begin
  if v_type_oid is null then
    execute $ddl$create type public.student_study_pathway as enum (
      'masters_degree',
      'global_track'
    )$ddl$;
  else
    select pg_catalog.array_agg(
      enum_value.enumlabel::text order by enum_value.enumsortorder
    )
    into v_actual_labels
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid = v_type_oid;

    if v_actual_labels is distinct from
      array['masters_degree', 'global_track']::text[] then
      raise exception using
        errcode = '55000',
        message = 'Existing Student Study Pathway type does not match the reviewed contract';
    end if;
  end if;
end;
$block$;

do $block$
declare
  v_type_oid oid := pg_catalog.to_regtype(
    'public.student_global_track_program'
  )::oid;
  v_actual_labels text[];
begin
  if v_type_oid is null then
    execute $ddl$create type public.student_global_track_program as enum (
      'fifteen_day_program',
      'one_year_program',
      'two_year_program'
    )$ddl$;
  else
    select pg_catalog.array_agg(
      enum_value.enumlabel::text order by enum_value.enumsortorder
    )
    into v_actual_labels
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid = v_type_oid;

    if v_actual_labels is distinct from array[
      'fifteen_day_program', 'one_year_program', 'two_year_program'
    ]::text[] then
      raise exception using
        errcode = '55000',
        message = 'Existing Student Global Track Program type does not match the reviewed contract';
    end if;
  end if;
end;
$block$;

do $block$
declare
  v_type_oid oid := pg_catalog.to_regtype(
    'public.student_funding_method'
  )::oid;
  v_actual_labels text[];
begin
  if v_type_oid is null then
    execute $ddl$create type public.student_funding_method as enum (
      'self_funded'
    )$ddl$;
  else
    select pg_catalog.array_agg(
      enum_value.enumlabel::text order by enum_value.enumsortorder
    )
    into v_actual_labels
    from pg_catalog.pg_enum as enum_value
    where enum_value.enumtypid = v_type_oid;

    if v_actual_labels is distinct from array['self_funded']::text[] then
      raise exception using
        errcode = '55000',
        message = 'Existing Student Funding Method type does not match the reviewed contract';
    end if;
  end if;
end;
$block$;

alter table public.student_preferences
  add column preferred_study_area public.student_preferred_study_area,
  add column preferred_domain public.student_preferred_domain,
  add column study_pathway public.student_study_pathway,
  add column global_track_program public.student_global_track_program,
  add column funding_method public.student_funding_method;

alter table public.student_preferences
  add constraint student_preferences_study_area_domain_check
  check (
    (preferred_study_area is null and preferred_domain is null)
    or (
      preferred_study_area = 'engineering'::public.student_preferred_study_area
      and preferred_domain in (
        'engineering_computing'::public.student_preferred_domain,
        'engineering_electrical'::public.student_preferred_domain,
        'engineering_mechanical'::public.student_preferred_domain
      )
    )
    or (
      preferred_study_area = 'business'::public.student_preferred_study_area
      and preferred_domain in (
        'business_management'::public.student_preferred_domain,
        'business_finance'::public.student_preferred_domain,
        'business_analytics'::public.student_preferred_domain
      )
    )
    or (
      preferred_study_area = 'psychology'::public.student_preferred_study_area
      and preferred_domain in (
        'psychology_clinical'::public.student_preferred_domain,
        'psychology_counseling'::public.student_preferred_domain,
        'psychology_organizational'::public.student_preferred_domain
      )
    )
  );

alter table public.student_preferences
  add constraint student_preferences_study_pathway_check
  check (
    (study_pathway is null and global_track_program is null)
    or (
      study_pathway = 'masters_degree'::public.student_study_pathway
      and global_track_program is null
    )
    or (
      study_pathway = 'global_track'::public.student_study_pathway
      and global_track_program is not null
    )
  );

-- The current Study Pathway replaces the legacy Student-facing study-level
-- question while preserving historical rows in the existing completion view.
create or replace view public.student_profile_completion
with (security_invoker = true, security_barrier = true)
as
select
  student_profile.student_id,
  student_profile.profile_status,
  completion.academic_section_complete,
  completion.preferences_section_complete,
  exists (
    select 1
    from public.student_test_scores as test_score
    where test_score.student_id = student_profile.student_id
  ) as test_scores_section_started,
  exists (
    select 1
    from public.student_achievements as achievement
    where achievement.student_id = student_profile.student_id
  ) as achievements_section_started,
  completion.essential_fields_completed,
  11::integer as essential_fields_total,
  pg_catalog.round(
    completion.essential_fields_completed::numeric * 100.0 / 11.0
  )::integer as overall_completion_percentage,
  (
    completion.academic_section_complete
    and completion.preferences_section_complete
  ) as ready_for_counseling
from public.student_profiles as student_profile
left join public.student_preferences as preference
  on preference.student_id = student_profile.student_id
cross join lateral (
  select
    (
      student_profile.roll_number is not null
      and student_profile.personal_email is not null
      and student_profile.mobile_number is not null
      and student_profile.college is not null
      and student_profile.course is not null
      and student_profile.department is not null
      and student_profile.graduation_year is not null
      and (
        student_profile.cgpa is not null
        or student_profile.cgpa_unavailable is true
      )
    ) as academic_section_complete,
    (
      preference.student_id is not null
      and preference.higher_studies_interest is not null
      and (
        preference.study_pathway is not null
        or preference.preferred_study_level is not null
      )
      and preference.target_intake is not null
    ) as preferences_section_complete,
    (
      case when student_profile.roll_number is not null then 1 else 0 end
      + case when student_profile.personal_email is not null then 1 else 0 end
      + case when student_profile.mobile_number is not null then 1 else 0 end
      + case when student_profile.college is not null then 1 else 0 end
      + case when student_profile.course is not null then 1 else 0 end
      + case when student_profile.department is not null then 1 else 0 end
      + case when student_profile.graduation_year is not null then 1 else 0 end
      + case
          when student_profile.cgpa is not null
            or student_profile.cgpa_unavailable is true
          then 1
          else 0
        end
      + case
          when preference.higher_studies_interest is not null then 1 else 0
        end
      + case
          when preference.study_pathway is not null
            or preference.preferred_study_level is not null
          then 1
          else 0
        end
      + case when preference.target_intake is not null then 1 else 0 end
    )::integer as essential_fields_completed
) as completion;

comment on view public.student_profile_completion is
  'RLS-preserving derived completion for eleven essential counseling fields; current Study Pathway and historical Preferred Study Level share one compatibility field.';

create function public.enforce_student_profile_v2_input_contract()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' and new.cgpa_unavailable is true then
    raise exception using
      errcode = '23514',
      message = 'CGPA must be provided through the current Student Profile contract';
  end if;

  if tg_op = 'UPDATE'
    and new.cgpa_unavailable is true
    and old.cgpa_unavailable is distinct from true then
    raise exception using
      errcode = '23514',
      message = 'CGPA must be provided through the current Student Profile contract';
  end if;

  return new;
end;
$function$;

create function public.enforce_student_preference_v2_input_contract()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' and (
    new.preferred_study_area is null
    or new.preferred_domain is null
    or new.study_pathway is null
    or new.funding_method is null
    or new.study_mode not in (
      'on_campus'::public.student_study_mode,
      'online'::public.student_study_mode
    )
  ) then
    raise exception using
      errcode = '23514',
      message = 'Complete the current Student Profile preference fields';
  end if;

  if tg_op = 'UPDATE'
    and row(
      new.preferred_study_area,
      new.preferred_domain,
      new.study_pathway,
      new.global_track_program,
      new.funding_method,
      new.study_mode
    ) is distinct from row(
      old.preferred_study_area,
      old.preferred_domain,
      old.study_pathway,
      old.global_track_program,
      old.funding_method,
      old.study_mode
    )
    and (
      new.preferred_study_area is null
      or new.preferred_domain is null
      or new.study_pathway is null
      or new.funding_method is null
      or new.study_mode not in (
        'on_campus'::public.student_study_mode,
        'online'::public.student_study_mode
      )
    ) then
    raise exception using
      errcode = '23514',
      message = 'Complete the current Student Profile preference fields';
  end if;

  if tg_op = 'INSERT' and new.study_mode in (
    'full_time'::public.student_study_mode,
    'part_time'::public.student_study_mode,
    'either'::public.student_study_mode
  ) then
    raise exception using
      errcode = '23514',
      message = 'Choose On-campus or Online for the current Student Profile';
  end if;

  if tg_op = 'UPDATE'
    and new.study_mode in (
      'full_time'::public.student_study_mode,
      'part_time'::public.student_study_mode,
      'either'::public.student_study_mode
    )
    and old.study_mode is distinct from new.study_mode then
    raise exception using
      errcode = '23514',
      message = 'Choose On-campus or Online for the current Student Profile';
  end if;

  return new;
end;
$function$;

alter function public.enforce_student_profile_v2_input_contract()
  owner to postgres;
alter function public.enforce_student_preference_v2_input_contract()
  owner to postgres;

revoke all on function public.enforce_student_profile_v2_input_contract()
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_student_preference_v2_input_contract()
  from public, anon, authenticated, service_role;

create trigger student_profiles_25_enforce_v2_input
before insert or update on public.student_profiles
for each row
execute function public.enforce_student_profile_v2_input_contract();

create trigger student_preferences_25_enforce_v2_input
before insert or update on public.student_preferences
for each row
execute function public.enforce_student_preference_v2_input_contract();

revoke all privileges on type public.student_preferred_study_area
  from public, anon, authenticated;
revoke all privileges on type public.student_preferred_domain
  from public, anon, authenticated;
revoke all privileges on type public.student_study_pathway
  from public, anon, authenticated;
revoke all privileges on type public.student_global_track_program
  from public, anon, authenticated;
revoke all privileges on type public.student_funding_method
  from public, anon, authenticated;

grant usage on type public.student_preferred_study_area to authenticated;
grant usage on type public.student_preferred_domain to authenticated;
grant usage on type public.student_study_pathway to authenticated;
grant usage on type public.student_global_track_program to authenticated;
grant usage on type public.student_funding_method to authenticated;

grant insert (
  preferred_study_area,
  preferred_domain,
  study_pathway,
  global_track_program,
  funding_method
) on public.student_preferences to authenticated;

grant update (
  preferred_study_area,
  preferred_domain,
  study_pathway,
  global_track_program,
  funding_method
) on public.student_preferences to authenticated;

comment on type public.student_preferred_domain is
  'Conservative initial Profile V2 domain catalog; requires client confirmation before expansion.';
comment on column public.student_preferences.budget_range is
  'Student-reported tuition-fee budget; legacy column name retained for compatibility.';

commit;

-- >>> supabase/migrations/202608250002_counselor_journey_progress_semester_summaries.sql
-- K-GEO Counselor Journey Progress and parent-safe Semester Summaries.
-- Reuses official progression/follow-up records and closes former-counselor
-- direct-read access before adding a separate append-only summary history.

begin;

drop policy counselor_student_notes_select_own
  on public.counselor_student_notes;

create policy counselor_student_notes_select_current_primary_own
on public.counselor_student_notes
for select
to authenticated
using (
  counselor_id = (select auth.uid())
  and (select public.is_active_primary_counselor_for_student(
    counselor_student_notes.student_id
  ))
);

drop policy counselor_follow_ups_select_own
  on public.counselor_follow_ups;

create policy counselor_follow_ups_select_current_primary_own
on public.counselor_follow_ups
for select
to authenticated
using (
  counselor_id = (select auth.uid())
  and (select public.is_active_primary_counselor_for_student(
    counselor_follow_ups.student_id
  ))
);

comment on policy counselor_student_notes_select_current_primary_own
  on public.counselor_student_notes is
  'A note author may read their private note only while they remain the student current active Primary Counselor.';

comment on policy counselor_follow_ups_select_current_primary_own
  on public.counselor_follow_ups is
  'A follow-up author may read their private action only while they remain the student current active Primary Counselor.';

create table public.counselor_student_semester_summaries (
  id uuid
    constraint counselor_student_semester_summaries_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint counselor_student_semester_summaries_student_id_not_null
      not null
    constraint counselor_student_semester_summaries_student_id_fkey
      references public.profiles(id)
      on delete restrict,
  academic_period text
    constraint counselor_student_semester_summaries_academic_period_not_null
      not null,
  progress_summary text
    constraint counselor_student_semester_summaries_progress_summary_not_null
      not null,
  achievements_highlights text,
  areas_requiring_attention text,
  next_semester_actions text
    constraint counselor_student_semester_summaries_next_actions_not_null
      not null,
  created_by uuid
    constraint counselor_student_semester_summaries_created_by_not_null
      not null
    constraint counselor_student_semester_summaries_created_by_fkey
      references public.profiles(id)
      on delete restrict,
  created_at timestamptz
    constraint counselor_student_semester_summaries_created_at_not_null
      not null
    default pg_catalog.statement_timestamp(),

  constraint counselor_student_semester_summaries_distinct_people_check
    check (student_id <> created_by),
  constraint counselor_student_semester_summaries_academic_period_check
    check (
      academic_period = pg_catalog.regexp_replace(
        pg_catalog.btrim(academic_period),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(academic_period) between 1 and 80
    ),
  constraint counselor_student_semester_summaries_progress_summary_check
    check (
      progress_summary = pg_catalog.regexp_replace(
        pg_catalog.btrim(progress_summary),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(progress_summary) between 1 and 1500
    ),
  constraint counselor_student_semester_summaries_highlights_check
    check (
      achievements_highlights is null
      or (
        achievements_highlights = pg_catalog.regexp_replace(
          pg_catalog.btrim(achievements_highlights),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(achievements_highlights)
          between 1 and 1000
      )
    ),
  constraint counselor_student_semester_summaries_attention_check
    check (
      areas_requiring_attention is null
      or (
        areas_requiring_attention = pg_catalog.regexp_replace(
          pg_catalog.btrim(areas_requiring_attention),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(areas_requiring_attention)
          between 1 and 1000
      )
    ),
  constraint counselor_student_semester_summaries_next_actions_check
    check (
      next_semester_actions = pg_catalog.regexp_replace(
        pg_catalog.btrim(next_semester_actions),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(next_semester_actions) between 1 and 1000
    )
);

comment on table public.counselor_student_semester_summaries is
  'Append-only parent-safe Counselor Semester Summary revisions. Private Counselor Notes are never sourced or copied into this relation.';

create index counselor_student_semester_summaries_student_history_idx
  on public.counselor_student_semester_summaries (
    student_id,
    created_at desc,
    id desc
  );

alter table public.counselor_student_semester_summaries
  enable row level security;
alter table public.counselor_student_semester_summaries
  force row level security;

revoke all privileges on table
  public.counselor_student_semester_summaries
  from public, anon, authenticated, service_role;

create function public.record_counselor_student_semester_summary(
  p_student_id uuid,
  p_academic_period text,
  p_progress_summary text,
  p_achievements_highlights text,
  p_areas_requiring_attention text,
  p_next_semester_actions text
)
returns table (
  summary_id uuid,
  academic_period text,
  progress_summary text,
  achievements_highlights text,
  areas_requiring_attention text,
  next_semester_actions text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
  v_academic_period text;
  v_progress_summary text;
  v_achievements_highlights text;
  v_areas_requiring_attention text;
  v_next_semester_actions text;
begin
  if p_student_id is null
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor access is required';
  end if;

  v_academic_period := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_academic_period),
    '[[:space:]]+',
    ' ',
    'g'
  );
  v_progress_summary := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_progress_summary),
    '[[:space:]]+',
    ' ',
    'g'
  );
  v_achievements_highlights := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_achievements_highlights),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  v_areas_requiring_attention := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_areas_requiring_attention),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  v_next_semester_actions := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_next_semester_actions),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if v_caller_id is null
    or v_academic_period is null
    or v_progress_summary is null
    or v_next_semester_actions is null
    or pg_catalog.char_length(v_academic_period) not between 1 and 80
    or pg_catalog.char_length(v_progress_summary) not between 1 and 1500
    or (
      v_achievements_highlights is not null
      and pg_catalog.char_length(v_achievements_highlights) > 1000
    )
    or (
      v_areas_requiring_attention is not null
      and pg_catalog.char_length(v_areas_requiring_attention) > 1000
    )
    or pg_catalog.char_length(v_next_semester_actions) not between 1 and 1000
  then
    raise exception using
      errcode = '22023',
      message = 'The semester summary request is invalid';
  end if;

  return query
  insert into public.counselor_student_semester_summaries as summary (
    student_id,
    academic_period,
    progress_summary,
    achievements_highlights,
    areas_requiring_attention,
    next_semester_actions,
    created_by
  ) values (
    p_student_id,
    v_academic_period,
    v_progress_summary,
    v_achievements_highlights,
    v_areas_requiring_attention,
    v_next_semester_actions,
    v_caller_id
  )
  returning
    summary.id,
    summary.academic_period,
    summary.progress_summary,
    summary.achievements_highlights,
    summary.areas_requiring_attention,
    summary.next_semester_actions,
    summary.created_at;
end;
$function$;

create function public.get_counselor_student_semester_summaries(
  p_student_id uuid,
  p_limit integer default 20
)
returns table (
  summary_id uuid,
  academic_period text,
  progress_summary text,
  achievements_highlights text,
  areas_requiring_attention text,
  next_semester_actions text,
  counselor_full_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_student_id is null
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor access is required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using
      errcode = '22023',
      message = 'The semester summary request is invalid';
  end if;

  return query
  select
    summary.id,
    summary.academic_period,
    summary.progress_summary,
    summary.achievements_highlights,
    summary.areas_requiring_attention,
    summary.next_semester_actions,
    coalesce(counselor_profile.full_name, 'Counselor'),
    summary.created_at
  from public.counselor_student_semester_summaries as summary
  inner join public.profiles as counselor_profile
    on counselor_profile.id = summary.created_by
    and counselor_profile.role = 'counselor'::public.user_role
  where summary.student_id = p_student_id
  order by summary.created_at desc, summary.id desc
  limit p_limit;
end;
$function$;

alter function public.record_counselor_student_semester_summary(
  uuid,
  text,
  text,
  text,
  text,
  text
) owner to postgres;
alter function public.get_counselor_student_semester_summaries(uuid, integer)
  owner to postgres;

revoke all on function public.record_counselor_student_semester_summary(
  uuid,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
revoke all on function public.get_counselor_student_semester_summaries(
  uuid,
  integer
) from public, anon, authenticated, service_role;

grant execute on function public.record_counselor_student_semester_summary(
  uuid,
  text,
  text,
  text,
  text,
  text
) to authenticated;
grant execute on function public.get_counselor_student_semester_summaries(
  uuid,
  integer
) to authenticated;

comment on function public.record_counselor_student_semester_summary(
  uuid,
  text,
  text,
  text,
  text,
  text
) is
  'Appends one parent-safe Semester Summary revision for a student current active Primary Counselor.';
comment on function public.get_counselor_student_semester_summaries(
  uuid,
  integer
) is
  'Returns bounded parent-safe Semester Summary history only to the student current active Primary Counselor.';

commit;

-- >>> supabase/migrations/202608250003_university_application_journey_extension.sql
-- K-GEO University Application Journey extension.
-- Separates university decision, offer, Student decision, fee, visa, and
-- enrollment tracking from the existing application lifecycle.
-- Review before applying. This migration does not mutate Storage objects.

begin;

create type public.university_application_decision as enum (
  'pending',
  'waitlisted',
  'rejected',
  'offer_received'
);

create type public.university_application_offer_status as enum (
  'none',
  'conditional',
  'unconditional'
);

create type public.university_application_student_decision as enum (
  'pending',
  'accepted',
  'declined'
);

create type public.university_application_fee_status as enum (
  'not_started',
  'pending',
  'paid'
);

create type public.university_application_visa_status as enum (
  'not_started',
  'preparing',
  'submitted',
  'approved',
  'refused'
);

create type public.university_application_enrollment_status as enum (
  'not_enrolled',
  'enrolled'
);

comment on type public.university_application_decision is
  'University decision, kept separate from offer type and Student decision.';

comment on type public.university_application_offer_status is
  'Current university offer type. Conditional and unconditional offers remain distinguishable.';

comment on type public.university_application_student_decision is
  'Student response to an unconditional offer, recorded by the current Primary Counselor.';

comment on type public.university_application_fee_status is
  'Operational fee tracking only; K-GEO does not process financial transactions.';

comment on type public.university_application_visa_status is
  'Operational visa workflow tracking only; no immigration decision automation.';

comment on type public.university_application_enrollment_status is
  'Enrollment outcome kept separate from application, offer, fee, and visa status.';

create table public.student_university_application_journeys (
  application_id uuid
    constraint student_university_application_journeys_pkey primary key
    constraint student_university_application_journeys_application_id_fkey
      references public.student_university_applications(id)
      on delete restrict,
  university_decision public.university_application_decision
    constraint application_journeys_university_decision_not_null not null,
  university_decision_date date,
  offer_status public.university_application_offer_status
    constraint application_journeys_offer_status_not_null not null,
  offer_date date,
  conditional_offer_requirements text,
  condition_due_date date,
  conditions_satisfied_date date,
  student_decision public.university_application_student_decision
    constraint application_journeys_student_decision_not_null not null,
  student_decision_date date,
  fee_status public.university_application_fee_status
    constraint application_journeys_fee_status_not_null not null,
  fee_payment_date date,
  visa_status public.university_application_visa_status
    constraint application_journeys_visa_status_not_null not null,
  visa_submission_date date,
  visa_decision_date date,
  enrollment_status public.university_application_enrollment_status
    constraint application_journeys_enrollment_status_not_null not null,
  enrollment_date date,
  version_number integer
    constraint application_journeys_version_not_null not null,
  created_by uuid
    constraint application_journeys_created_by_not_null not null
    constraint application_journeys_created_by_fkey
      references public.profiles(id)
      on delete restrict,
  last_changed_by uuid
    constraint application_journeys_last_changed_by_not_null not null
    constraint application_journeys_last_changed_by_fkey
      references public.profiles(id)
      on delete restrict,
  created_at timestamptz
    constraint application_journeys_created_at_not_null not null,
  updated_at timestamptz
    constraint application_journeys_updated_at_not_null not null,

  constraint application_journeys_requirements_check
    check (
      conditional_offer_requirements is null
      or (
        conditional_offer_requirements = pg_catalog.regexp_replace(
          pg_catalog.btrim(conditional_offer_requirements),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(conditional_offer_requirements)
          between 1 and 2000
        and conditional_offer_requirements !~ '[[:cntrl:]]'
      )
    ),
  constraint application_journeys_university_decision_date_check
    check (
      university_decision <>
        'pending'::public.university_application_decision
      or university_decision_date is null
    ),
  constraint application_journeys_offer_consistency_check
    check (
      (
        offer_status = 'none'::public.university_application_offer_status
        and university_decision <>
          'offer_received'::public.university_application_decision
        and offer_date is null
        and conditional_offer_requirements is null
        and condition_due_date is null
        and conditions_satisfied_date is null
      )
      or (
        offer_status = 'conditional'::public.university_application_offer_status
        and university_decision =
          'offer_received'::public.university_application_decision
        and conditional_offer_requirements is not null
      )
      or (
        offer_status = 'unconditional'::public.university_application_offer_status
        and university_decision =
          'offer_received'::public.university_application_decision
        and (
          conditional_offer_requirements is null
          or conditions_satisfied_date is not null
        )
      )
    ),
  constraint application_journeys_condition_fields_check
    check (
      (
        conditional_offer_requirements is null
        and condition_due_date is null
        and conditions_satisfied_date is null
      )
      or conditional_offer_requirements is not null
    ),
  constraint application_journeys_student_decision_check
    check (
      student_decision =
        'pending'::public.university_application_student_decision
      or (
        university_decision =
          'offer_received'::public.university_application_decision
        and offer_status =
          'unconditional'::public.university_application_offer_status
      )
    ),
  constraint application_journeys_student_decision_date_check
    check (
      (
        student_decision =
          'pending'::public.university_application_student_decision
        and student_decision_date is null
      )
      or student_decision <>
        'pending'::public.university_application_student_decision
    ),
  constraint application_journeys_fee_check
    check (
      (
        fee_status = 'not_started'::public.university_application_fee_status
        and fee_payment_date is null
      )
      or (
        fee_status = 'pending'::public.university_application_fee_status
        and student_decision =
          'accepted'::public.university_application_student_decision
        and fee_payment_date is null
      )
      or (
        fee_status = 'paid'::public.university_application_fee_status
        and student_decision =
          'accepted'::public.university_application_student_decision
        and fee_payment_date is not null
      )
    ),
  constraint application_journeys_visa_check
    check (
      (
        visa_status = 'not_started'::public.university_application_visa_status
        and visa_submission_date is null
        and visa_decision_date is null
      )
      or (
        visa_status = 'preparing'::public.university_application_visa_status
        and student_decision =
          'accepted'::public.university_application_student_decision
        and fee_status = 'paid'::public.university_application_fee_status
        and visa_submission_date is null
        and visa_decision_date is null
      )
      or (
        visa_status = 'submitted'::public.university_application_visa_status
        and student_decision =
          'accepted'::public.university_application_student_decision
        and fee_status = 'paid'::public.university_application_fee_status
        and visa_submission_date is not null
        and visa_decision_date is null
      )
      or (
        visa_status in (
          'approved'::public.university_application_visa_status,
          'refused'::public.university_application_visa_status
        )
        and student_decision =
          'accepted'::public.university_application_student_decision
        and fee_status = 'paid'::public.university_application_fee_status
        and visa_submission_date is not null
        and visa_decision_date is not null
      )
    ),
  constraint application_journeys_enrollment_check
    check (
      (
        enrollment_status =
          'not_enrolled'::public.university_application_enrollment_status
        and enrollment_date is null
      )
      or (
        enrollment_status =
          'enrolled'::public.university_application_enrollment_status
        and visa_status = 'approved'::public.university_application_visa_status
        and enrollment_date is not null
      )
    ),
  constraint application_journeys_version_check
    check (version_number >= 1),
  constraint application_journeys_timestamp_check
    check (updated_at >= created_at)
);

create table public.student_university_application_journey_events (
  id uuid
    constraint student_university_application_journey_events_pkey primary key
    default pg_catalog.gen_random_uuid(),
  application_id uuid
    constraint application_journey_events_application_id_not_null not null
    constraint application_journey_events_application_id_fkey
      references public.student_university_application_journeys(application_id)
      on delete restrict,
  version_number integer
    constraint application_journey_events_version_not_null not null,
  university_decision public.university_application_decision
    constraint application_journey_events_university_decision_not_null not null,
  university_decision_date date,
  offer_status public.university_application_offer_status
    constraint application_journey_events_offer_status_not_null not null,
  offer_date date,
  conditional_offer_requirements text,
  condition_due_date date,
  conditions_satisfied_date date,
  student_decision public.university_application_student_decision
    constraint application_journey_events_student_decision_not_null not null,
  student_decision_date date,
  fee_status public.university_application_fee_status
    constraint application_journey_events_fee_status_not_null not null,
  fee_payment_date date,
  visa_status public.university_application_visa_status
    constraint application_journey_events_visa_status_not_null not null,
  visa_submission_date date,
  visa_decision_date date,
  enrollment_status public.university_application_enrollment_status
    constraint application_journey_events_enrollment_status_not_null not null,
  enrollment_date date,
  change_reason text
    constraint application_journey_events_change_reason_not_null not null,
  changed_by uuid
    constraint application_journey_events_changed_by_not_null not null
    constraint application_journey_events_changed_by_fkey
      references public.profiles(id)
      on delete restrict,
  changed_at timestamptz
    constraint application_journey_events_changed_at_not_null not null,

  constraint application_journey_events_application_version_key
    unique (application_id, version_number),
  constraint application_journey_events_version_check
    check (version_number >= 1),
  constraint application_journey_events_reason_check
    check (
      change_reason = pg_catalog.regexp_replace(
        pg_catalog.btrim(change_reason),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(change_reason) between 1 and 500
      and change_reason !~ '[[:cntrl:]]'
    )
);

comment on table public.student_university_application_journeys is
  'Current separated offer, Student decision, fee, visa, and enrollment projection for one university application.';

comment on table public.student_university_application_journey_events is
  'Append-only complete snapshots for every trusted Application Journey mutation.';

create index student_university_application_journey_events_history_idx
  on public.student_university_application_journey_events (
    application_id,
    version_number desc,
    changed_at desc,
    id desc
  );

alter table public.student_university_application_journeys
  owner to postgres;
alter table public.student_university_application_journey_events
  owner to postgres;

alter table public.student_university_application_journeys
  enable row level security;
alter table public.student_university_application_journeys
  force row level security;
alter table public.student_university_application_journey_events
  enable row level security;
alter table public.student_university_application_journey_events
  force row level security;

revoke all privileges on table
  public.student_university_application_journeys
  from public, anon, authenticated, service_role;
revoke all privileges on table
  public.student_university_application_journey_events
  from public, anon, authenticated, service_role;

create function public.get_counselor_university_application_journey(
  p_application_id uuid
)
returns table (
  application_id uuid,
  university_decision public.university_application_decision,
  university_decision_date date,
  offer_status public.university_application_offer_status,
  offer_date date,
  conditional_offer_requirements text,
  condition_due_date date,
  conditions_satisfied_date date,
  student_decision public.university_application_student_decision,
  student_decision_date date,
  fee_status public.university_application_fee_status,
  fee_payment_date date,
  visa_status public.university_application_visa_status,
  visa_submission_date date,
  visa_decision_date date,
  enrollment_status public.university_application_enrollment_status,
  enrollment_date date,
  version_number integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  select application.student_id
  into v_student_id
  from public.student_university_applications as application
  where application.id = p_application_id
    and application.is_archived is false;

  if v_student_id is null
    or public.is_active_primary_counselor_for_student(v_student_id)
      is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  return query
  select
    p_application_id,
    coalesce(
      journey.university_decision,
      'pending'::public.university_application_decision
    ),
    journey.university_decision_date,
    coalesce(
      journey.offer_status,
      'none'::public.university_application_offer_status
    ),
    journey.offer_date,
    journey.conditional_offer_requirements,
    journey.condition_due_date,
    journey.conditions_satisfied_date,
    coalesce(
      journey.student_decision,
      'pending'::public.university_application_student_decision
    ),
    journey.student_decision_date,
    coalesce(
      journey.fee_status,
      'not_started'::public.university_application_fee_status
    ),
    journey.fee_payment_date,
    coalesce(
      journey.visa_status,
      'not_started'::public.university_application_visa_status
    ),
    journey.visa_submission_date,
    journey.visa_decision_date,
    coalesce(
      journey.enrollment_status,
      'not_enrolled'::public.university_application_enrollment_status
    ),
    journey.enrollment_date,
    coalesce(journey.version_number, 0),
    journey.updated_at
  from (select 1) as one_row
  left join public.student_university_application_journeys as journey
    on journey.application_id = p_application_id;
end;
$function$;

create function public.get_counselor_university_application_journey_history(
  p_application_id uuid,
  p_limit integer default 20
)
returns table (
  event_id uuid,
  version_number integer,
  university_decision public.university_application_decision,
  university_decision_date date,
  offer_status public.university_application_offer_status,
  offer_date date,
  conditional_offer_requirements text,
  condition_due_date date,
  conditions_satisfied_date date,
  student_decision public.university_application_student_decision,
  student_decision_date date,
  fee_status public.university_application_fee_status,
  fee_payment_date date,
  visa_status public.university_application_visa_status,
  visa_submission_date date,
  visa_decision_date date,
  enrollment_status public.university_application_enrollment_status,
  enrollment_date date,
  change_reason text,
  changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using
      errcode = '22023',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  select application.student_id
  into v_student_id
  from public.student_university_applications as application
  where application.id = p_application_id
    and application.is_archived is false;

  if v_student_id is null
    or public.is_active_primary_counselor_for_student(v_student_id)
      is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  return query
  select
    event.id,
    event.version_number,
    event.university_decision,
    event.university_decision_date,
    event.offer_status,
    event.offer_date,
    event.conditional_offer_requirements,
    event.condition_due_date,
    event.conditions_satisfied_date,
    event.student_decision,
    event.student_decision_date,
    event.fee_status,
    event.fee_payment_date,
    event.visa_status,
    event.visa_submission_date,
    event.visa_decision_date,
    event.enrollment_status,
    event.enrollment_date,
    event.change_reason,
    event.changed_at
  from public.student_university_application_journey_events as event
  where event.application_id = p_application_id
  order by event.version_number desc, event.changed_at desc, event.id desc
  limit p_limit;
end;
$function$;

create function public.get_my_university_application_journeys()
returns table (
  application_id uuid,
  university_decision public.university_application_decision,
  university_decision_date date,
  offer_status public.university_application_offer_status,
  offer_date date,
  conditional_offer_requirements text,
  condition_due_date date,
  conditions_satisfied_date date,
  student_decision public.university_application_student_decision,
  student_decision_date date,
  fee_status public.university_application_fee_status,
  fee_payment_date date,
  visa_status public.university_application_visa_status,
  visa_submission_date date,
  visa_decision_date date,
  enrollment_status public.university_application_enrollment_status,
  enrollment_date date,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_bounded_application_count integer;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  select pg_catalog.count(*)::integer
  into v_bounded_application_count
  from (
    select application.id
    from public.student_university_applications as application
    where application.student_id = v_caller_id
      and application.is_archived is false
    limit 101
  ) as bounded_applications;

  if v_bounded_application_count > 100 then
    raise exception using
      errcode = 'P0001',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  return query
  select
    application.id,
    coalesce(
      journey.university_decision,
      'pending'::public.university_application_decision
    ),
    journey.university_decision_date,
    coalesce(
      journey.offer_status,
      'none'::public.university_application_offer_status
    ),
    journey.offer_date,
    journey.conditional_offer_requirements,
    journey.condition_due_date,
    journey.conditions_satisfied_date,
    coalesce(
      journey.student_decision,
      'pending'::public.university_application_student_decision
    ),
    journey.student_decision_date,
    coalesce(
      journey.fee_status,
      'not_started'::public.university_application_fee_status
    ),
    journey.fee_payment_date,
    coalesce(
      journey.visa_status,
      'not_started'::public.university_application_visa_status
    ),
    journey.visa_submission_date,
    journey.visa_decision_date,
    coalesce(
      journey.enrollment_status,
      'not_enrolled'::public.university_application_enrollment_status
    ),
    journey.enrollment_date,
    journey.updated_at
  from public.student_university_applications as application
  left join public.student_university_application_journeys as journey
    on journey.application_id = application.id
  where application.student_id = v_caller_id
    and application.is_archived is false
  order by
    application.is_primary desc,
    application.last_changed_at desc,
    application.id desc
  limit 100;
end;
$function$;

create function public.record_university_application_journey(
  p_application_id uuid,
  p_university_decision public.university_application_decision,
  p_university_decision_date date,
  p_offer_status public.university_application_offer_status,
  p_offer_date date,
  p_conditional_offer_requirements text,
  p_condition_due_date date,
  p_conditions_satisfied_date date,
  p_student_decision public.university_application_student_decision,
  p_student_decision_date date,
  p_fee_status public.university_application_fee_status,
  p_fee_payment_date date,
  p_visa_status public.university_application_visa_status,
  p_visa_submission_date date,
  p_visa_decision_date date,
  p_enrollment_status public.university_application_enrollment_status,
  p_enrollment_date date,
  p_change_reason text
)
returns table (
  application_id uuid,
  university_decision public.university_application_decision,
  university_decision_date date,
  offer_status public.university_application_offer_status,
  offer_date date,
  conditional_offer_requirements text,
  condition_due_date date,
  conditions_satisfied_date date,
  student_decision public.university_application_student_decision,
  student_decision_date date,
  fee_status public.university_application_fee_status,
  fee_payment_date date,
  visa_status public.university_application_visa_status,
  visa_submission_date date,
  visa_decision_date date,
  enrollment_status public.university_application_enrollment_status,
  enrollment_date date,
  version_number integer,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_student_id uuid;
  v_application_status public.university_application_status;
  v_is_archived boolean;
  v_existing public.student_university_application_journeys%rowtype;
  v_has_existing boolean := false;
  v_requirements text;
  v_reason text;
  v_version integer;
  v_changed_at timestamptz := pg_catalog.statement_timestamp();
  v_old_university_decision public.university_application_decision :=
    'pending'::public.university_application_decision;
  v_old_offer_status public.university_application_offer_status :=
    'none'::public.university_application_offer_status;
  v_old_student_decision public.university_application_student_decision :=
    'pending'::public.university_application_student_decision;
  v_old_fee_status public.university_application_fee_status :=
    'not_started'::public.university_application_fee_status;
  v_old_visa_status public.university_application_visa_status :=
    'not_started'::public.university_application_visa_status;
  v_old_enrollment_status public.university_application_enrollment_status :=
    'not_enrolled'::public.university_application_enrollment_status;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey update is not permitted.';
  end if;

  select
    application.student_id,
    application.current_status,
    application.is_archived
  into
    v_student_id,
    v_application_status,
    v_is_archived
  from public.student_university_applications as application
  where application.id = p_application_id
  for update;

  if v_student_id is null
    or v_is_archived
    or v_application_status in (
      'withdrawn'::public.university_application_status,
      'closed'::public.university_application_status
    )
    or public.is_active_primary_counselor_for_student(v_student_id)
      is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey update is not permitted.';
  end if;

  v_requirements := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(
        coalesce(p_conditional_offer_requirements, '')
      ),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  v_reason := pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_change_reason, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if v_reason = ''
    or pg_catalog.char_length(v_reason) > 500
    or v_reason ~ '[[:cntrl:]]'
    or (
      v_requirements is not null
      and (
        pg_catalog.char_length(v_requirements) > 2000
        or v_requirements ~ '[[:cntrl:]]'
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Application Journey fields are invalid.';
  end if;

  if p_university_decision <>
      'pending'::public.university_application_decision
    and v_application_status <>
      'decision_received'::public.university_application_status then
    raise exception using
      errcode = '22023',
      message = 'Record the application decision status first.';
  end if;

  if (
      p_university_decision =
        'pending'::public.university_application_decision
      and p_university_decision_date is not null
    )
    or (
      p_offer_status = 'none'::public.university_application_offer_status
      and (
        p_university_decision =
          'offer_received'::public.university_application_decision
        or p_offer_date is not null
        or v_requirements is not null
        or p_condition_due_date is not null
        or p_conditions_satisfied_date is not null
      )
    )
    or (
      p_offer_status =
        'conditional'::public.university_application_offer_status
      and (
        p_university_decision <>
          'offer_received'::public.university_application_decision
        or v_requirements is null
      )
    )
    or (
      p_offer_status =
        'unconditional'::public.university_application_offer_status
      and (
        p_university_decision <>
          'offer_received'::public.university_application_decision
        or (
          v_requirements is not null
          and p_conditions_satisfied_date is null
        )
      )
    )
    or (
      v_requirements is null
      and (
        p_condition_due_date is not null
        or p_conditions_satisfied_date is not null
      )
    )
    or (
      p_student_decision =
        'pending'::public.university_application_student_decision
      and p_student_decision_date is not null
    )
    or (
      p_student_decision <>
        'pending'::public.university_application_student_decision
      and (
        p_university_decision <>
          'offer_received'::public.university_application_decision
        or p_offer_status <>
          'unconditional'::public.university_application_offer_status
      )
    )
    or (
      p_fee_status = 'not_started'::public.university_application_fee_status
      and p_fee_payment_date is not null
    )
    or (
      p_fee_status = 'pending'::public.university_application_fee_status
      and (
        p_student_decision <>
          'accepted'::public.university_application_student_decision
        or p_fee_payment_date is not null
      )
    )
    or (
      p_fee_status = 'paid'::public.university_application_fee_status
      and (
        p_student_decision <>
          'accepted'::public.university_application_student_decision
        or p_fee_payment_date is null
      )
    )
    or (
      p_visa_status <>
        'not_started'::public.university_application_visa_status
      and (
        p_student_decision <>
          'accepted'::public.university_application_student_decision
        or p_fee_status <>
          'paid'::public.university_application_fee_status
      )
    )
    or (
      p_visa_status in (
        'not_started'::public.university_application_visa_status,
        'preparing'::public.university_application_visa_status
      )
      and (
        p_visa_submission_date is not null
        or p_visa_decision_date is not null
      )
    )
    or (
      p_visa_status = 'submitted'::public.university_application_visa_status
      and (
        p_visa_submission_date is null
        or p_visa_decision_date is not null
      )
    )
    or (
      p_visa_status in (
        'approved'::public.university_application_visa_status,
        'refused'::public.university_application_visa_status
      )
      and (
        p_visa_submission_date is null
        or p_visa_decision_date is null
      )
    )
    or (
      p_enrollment_status =
        'not_enrolled'::public.university_application_enrollment_status
      and p_enrollment_date is not null
    )
    or (
      p_enrollment_status =
        'enrolled'::public.university_application_enrollment_status
      and (
        p_visa_status <>
          'approved'::public.university_application_visa_status
        or p_enrollment_date is null
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Application Journey fields are inconsistent.';
  end if;

  select journey.*
  into v_existing
  from public.student_university_application_journeys as journey
  where journey.application_id = p_application_id
  for update;
  v_has_existing := found;

  if v_has_existing then
    v_old_university_decision := v_existing.university_decision;
    v_old_offer_status := v_existing.offer_status;
    v_old_student_decision := v_existing.student_decision;
    v_old_fee_status := v_existing.fee_status;
    v_old_visa_status := v_existing.visa_status;
    v_old_enrollment_status := v_existing.enrollment_status;
  end if;

  if v_old_university_decision <> p_university_decision
    and not (
      (
        v_old_university_decision =
          'pending'::public.university_application_decision
        and p_university_decision in (
          'waitlisted'::public.university_application_decision,
          'rejected'::public.university_application_decision,
          'offer_received'::public.university_application_decision
        )
      )
      or (
        v_old_university_decision =
          'waitlisted'::public.university_application_decision
        and p_university_decision in (
          'rejected'::public.university_application_decision,
          'offer_received'::public.university_application_decision
        )
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'University decision transition is not permitted.';
  end if;

  if v_old_offer_status <> p_offer_status
    and not (
      v_old_offer_status =
        'none'::public.university_application_offer_status
      or (
        v_old_offer_status =
          'conditional'::public.university_application_offer_status
        and p_offer_status =
          'unconditional'::public.university_application_offer_status
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Offer transition is not permitted.';
  end if;

  if v_old_student_decision <> p_student_decision
    and v_old_student_decision <>
      'pending'::public.university_application_student_decision then
    raise exception using
      errcode = '22023',
      message = 'Student decision transition is not permitted.';
  end if;

  if v_old_fee_status <> p_fee_status
    and not (
      v_old_fee_status = 'not_started'::public.university_application_fee_status
      or (
        v_old_fee_status = 'pending'::public.university_application_fee_status
        and p_fee_status = 'paid'::public.university_application_fee_status
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Fee transition is not permitted.';
  end if;

  if v_old_visa_status <> p_visa_status
    and not (
      v_old_visa_status =
        'not_started'::public.university_application_visa_status
      or (
        v_old_visa_status =
          'preparing'::public.university_application_visa_status
        and p_visa_status in (
          'submitted'::public.university_application_visa_status,
          'approved'::public.university_application_visa_status,
          'refused'::public.university_application_visa_status
        )
      )
      or (
        v_old_visa_status =
          'submitted'::public.university_application_visa_status
        and p_visa_status in (
          'approved'::public.university_application_visa_status,
          'refused'::public.university_application_visa_status
        )
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Visa transition is not permitted.';
  end if;

  if v_old_enrollment_status <> p_enrollment_status
    and v_old_enrollment_status <>
      'not_enrolled'::public.university_application_enrollment_status then
    raise exception using
      errcode = '22023',
      message = 'Enrollment transition is not permitted.';
  end if;

  if v_has_existing
    and v_existing.university_decision = p_university_decision
    and v_existing.university_decision_date is not distinct from
      p_university_decision_date
    and v_existing.offer_status = p_offer_status
    and v_existing.offer_date is not distinct from p_offer_date
    and v_existing.conditional_offer_requirements is not distinct from
      v_requirements
    and v_existing.condition_due_date is not distinct from p_condition_due_date
    and v_existing.conditions_satisfied_date is not distinct from
      p_conditions_satisfied_date
    and v_existing.student_decision = p_student_decision
    and v_existing.student_decision_date is not distinct from
      p_student_decision_date
    and v_existing.fee_status = p_fee_status
    and v_existing.fee_payment_date is not distinct from p_fee_payment_date
    and v_existing.visa_status = p_visa_status
    and v_existing.visa_submission_date is not distinct from
      p_visa_submission_date
    and v_existing.visa_decision_date is not distinct from p_visa_decision_date
    and v_existing.enrollment_status = p_enrollment_status
    and v_existing.enrollment_date is not distinct from p_enrollment_date then
    raise exception using
      errcode = '22023',
      message = 'Application Journey has not changed.';
  end if;

  if v_has_existing then
    v_version := v_existing.version_number + 1;

    update public.student_university_application_journeys as journey
    set
      university_decision = p_university_decision,
      university_decision_date = p_university_decision_date,
      offer_status = p_offer_status,
      offer_date = p_offer_date,
      conditional_offer_requirements = v_requirements,
      condition_due_date = p_condition_due_date,
      conditions_satisfied_date = p_conditions_satisfied_date,
      student_decision = p_student_decision,
      student_decision_date = p_student_decision_date,
      fee_status = p_fee_status,
      fee_payment_date = p_fee_payment_date,
      visa_status = p_visa_status,
      visa_submission_date = p_visa_submission_date,
      visa_decision_date = p_visa_decision_date,
      enrollment_status = p_enrollment_status,
      enrollment_date = p_enrollment_date,
      version_number = v_version,
      last_changed_by = v_caller_id,
      updated_at = v_changed_at
    where journey.application_id = p_application_id;
  else
    v_version := 1;

    insert into public.student_university_application_journeys (
      application_id,
      university_decision,
      university_decision_date,
      offer_status,
      offer_date,
      conditional_offer_requirements,
      condition_due_date,
      conditions_satisfied_date,
      student_decision,
      student_decision_date,
      fee_status,
      fee_payment_date,
      visa_status,
      visa_submission_date,
      visa_decision_date,
      enrollment_status,
      enrollment_date,
      version_number,
      created_by,
      last_changed_by,
      created_at,
      updated_at
    ) values (
      p_application_id,
      p_university_decision,
      p_university_decision_date,
      p_offer_status,
      p_offer_date,
      v_requirements,
      p_condition_due_date,
      p_conditions_satisfied_date,
      p_student_decision,
      p_student_decision_date,
      p_fee_status,
      p_fee_payment_date,
      p_visa_status,
      p_visa_submission_date,
      p_visa_decision_date,
      p_enrollment_status,
      p_enrollment_date,
      v_version,
      v_caller_id,
      v_caller_id,
      v_changed_at,
      v_changed_at
    );
  end if;

  insert into public.student_university_application_journey_events (
    application_id,
    version_number,
    university_decision,
    university_decision_date,
    offer_status,
    offer_date,
    conditional_offer_requirements,
    condition_due_date,
    conditions_satisfied_date,
    student_decision,
    student_decision_date,
    fee_status,
    fee_payment_date,
    visa_status,
    visa_submission_date,
    visa_decision_date,
    enrollment_status,
    enrollment_date,
    change_reason,
    changed_by,
    changed_at
  ) values (
    p_application_id,
    v_version,
    p_university_decision,
    p_university_decision_date,
    p_offer_status,
    p_offer_date,
    v_requirements,
    p_condition_due_date,
    p_conditions_satisfied_date,
    p_student_decision,
    p_student_decision_date,
    p_fee_status,
    p_fee_payment_date,
    p_visa_status,
    p_visa_submission_date,
    p_visa_decision_date,
    p_enrollment_status,
    p_enrollment_date,
    v_reason,
    v_caller_id,
    v_changed_at
  );

  return query
  select
    journey.application_id,
    journey.university_decision,
    journey.university_decision_date,
    journey.offer_status,
    journey.offer_date,
    journey.conditional_offer_requirements,
    journey.condition_due_date,
    journey.conditions_satisfied_date,
    journey.student_decision,
    journey.student_decision_date,
    journey.fee_status,
    journey.fee_payment_date,
    journey.visa_status,
    journey.visa_submission_date,
    journey.visa_decision_date,
    journey.enrollment_status,
    journey.enrollment_date,
    journey.version_number,
    journey.updated_at
  from public.student_university_application_journeys as journey
  where journey.application_id = p_application_id;
end;
$function$;

alter function public.get_counselor_university_application_journey(uuid)
  owner to postgres;
alter function public.get_counselor_university_application_journey_history(
  uuid,
  integer
) owner to postgres;
alter function public.get_my_university_application_journeys()
  owner to postgres;
alter function public.record_university_application_journey(
  uuid,
  public.university_application_decision,
  date,
  public.university_application_offer_status,
  date,
  text,
  date,
  date,
  public.university_application_student_decision,
  date,
  public.university_application_fee_status,
  date,
  public.university_application_visa_status,
  date,
  date,
  public.university_application_enrollment_status,
  date,
  text
) owner to postgres;

revoke all on function
  public.get_counselor_university_application_journey(uuid)
  from public, anon, authenticated;
revoke all on function
  public.get_counselor_university_application_journey_history(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.get_my_university_application_journeys()
  from public, anon, authenticated;
revoke all on function public.record_university_application_journey(
  uuid,
  public.university_application_decision,
  date,
  public.university_application_offer_status,
  date,
  text,
  date,
  date,
  public.university_application_student_decision,
  date,
  public.university_application_fee_status,
  date,
  public.university_application_visa_status,
  date,
  date,
  public.university_application_enrollment_status,
  date,
  text
) from public, anon, authenticated;

grant usage on type public.university_application_decision to authenticated;
grant usage on type public.university_application_offer_status to authenticated;
grant usage on type public.university_application_student_decision to authenticated;
grant usage on type public.university_application_fee_status to authenticated;
grant usage on type public.university_application_visa_status to authenticated;
grant usage on type public.university_application_enrollment_status to authenticated;

grant execute on function
  public.get_counselor_university_application_journey(uuid)
  to authenticated;
grant execute on function
  public.get_counselor_university_application_journey_history(uuid, integer)
  to authenticated;
grant execute on function public.get_my_university_application_journeys()
  to authenticated;
grant execute on function public.record_university_application_journey(
  uuid,
  public.university_application_decision,
  date,
  public.university_application_offer_status,
  date,
  text,
  date,
  date,
  public.university_application_student_decision,
  date,
  public.university_application_fee_status,
  date,
  public.university_application_visa_status,
  date,
  date,
  public.university_application_enrollment_status,
  date,
  text
) to authenticated;

comment on function public.get_counselor_university_application_journey(uuid)
  is 'Returns one current or legacy-default Application Journey only to the active Primary Counselor.';

comment on function public.get_counselor_university_application_journey_history(
  uuid,
  integer
) is 'Returns bounded Application Journey snapshots only to the active Primary Counselor without actor identifiers.';

comment on function public.get_my_university_application_journeys()
  is 'Returns safe own nonarchived Application Journey projections to the active verified Student; no private notes, reasons, or actor identifiers.';

comment on function public.record_university_application_journey(
  uuid,
  public.university_application_decision,
  date,
  public.university_application_offer_status,
  date,
  text,
  date,
  date,
  public.university_application_student_decision,
  date,
  public.university_application_fee_status,
  date,
  public.university_application_visa_status,
  date,
  date,
  public.university_application_enrollment_status,
  date,
  text
) is 'Records one audited separated Application Journey snapshot after locking the application and rechecking active Primary Counselor ownership.';

commit;

-- >>> supabase/migrations/202608250004_application_journey_rpc_acl_correction.sql
-- K-GEO Application Journey RPC ACL correction.
-- Removes the unintended service_role EXECUTE privilege only.

begin;

revoke all on function
  public.get_counselor_university_application_journey(uuid)
  from service_role;

revoke all on function
  public.get_counselor_university_application_journey_history(uuid, integer)
  from service_role;

revoke all on function public.get_my_university_application_journeys()
  from service_role;

revoke all on function public.record_university_application_journey(
  uuid,
  public.university_application_decision,
  date,
  public.university_application_offer_status,
  date,
  text,
  date,
  date,
  public.university_application_student_decision,
  date,
  public.university_application_fee_status,
  date,
  public.university_application_visa_status,
  date,
  date,
  public.university_application_enrollment_status,
  date,
  text
) from service_role;

commit;

-- >>> supabase/migrations/202608250005_parent_report_workflow.sql
-- K-GEO Parent Report Workflow V1.
-- Structured source facts are snapshotted independently from editable,
-- parent-safe narrative. Private Counselor Notes and follow-ups are not read.

begin;

set local search_path = '';

create type public.parent_report_status as enum (
  'draft',
  'director_review',
  'revision_requested',
  'approved',
  'finalized'
);

create type public.parent_report_event_type as enum (
  'created',
  'counselor_edited',
  'submitted',
  'director_edited',
  'revision_requested',
  'resubmitted',
  'approved',
  'finalized',
  'new_version_created',
  'attachment_added',
  'attachment_removed'
);

create type public.parent_report_attachment_source as enum (
  'report_upload',
  'profile_document',
  'application_document',
  'progression_evidence'
);

create type public.parent_report_attachment_status as enum (
  'pending',
  'available',
  'removed'
);

create table public.parent_reports (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  academic_period text not null,
  version_number integer not null,
  status public.parent_report_status not null,
  source_snapshot jsonb not null,
  semester_overview text,
  strengths_highlights text,
  areas_requiring_attention text,
  next_actions text,
  counselor_remarks text,
  director_remarks text,
  created_by uuid not null references public.profiles(id) on delete restrict,
  last_edited_by uuid not null references public.profiles(id) on delete restrict,
  submitted_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  finalized_by uuid references public.profiles(id) on delete restrict,
  finalized_at timestamptz,
  final_pdf_bucket_id text,
  final_pdf_storage_path text,
  final_pdf_size_bytes bigint,
  final_pdf_sha256 text,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint parent_reports_student_period_version_key
    unique (student_id, academic_period, version_number),
  constraint parent_reports_period_check check (
    academic_period = pg_catalog.regexp_replace(
      pg_catalog.btrim(academic_period), '[[:space:]]+', ' ', 'g'
    )
    and pg_catalog.char_length(academic_period) between 1 and 80
    and academic_period !~ '[[:cntrl:]]'
  ),
  constraint parent_reports_version_check check (version_number >= 1),
  constraint parent_reports_source_snapshot_check check (
    pg_catalog.jsonb_typeof(source_snapshot) = 'object'
    and source_snapshot ? 'schema_version'
    and source_snapshot ? 'student'
    and source_snapshot ? 'applications'
    and pg_catalog.octet_length(source_snapshot::text) <= 262144
    and not (source_snapshot ? 'private_notes')
    and not (source_snapshot ? 'private_follow_ups')
  ),
  constraint parent_reports_narrative_check check (
    (semester_overview is null or (
      semester_overview = pg_catalog.regexp_replace(
        pg_catalog.btrim(semester_overview), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(semester_overview) between 1 and 3000
      and semester_overview !~ '[[:cntrl:]]'
    ))
    and (strengths_highlights is null or (
      strengths_highlights = pg_catalog.regexp_replace(
        pg_catalog.btrim(strengths_highlights), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(strengths_highlights) between 1 and 3000
      and strengths_highlights !~ '[[:cntrl:]]'
    ))
    and (areas_requiring_attention is null or (
      areas_requiring_attention = pg_catalog.regexp_replace(
        pg_catalog.btrim(areas_requiring_attention), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(areas_requiring_attention) between 1 and 3000
      and areas_requiring_attention !~ '[[:cntrl:]]'
    ))
    and (next_actions is null or (
      next_actions = pg_catalog.regexp_replace(
        pg_catalog.btrim(next_actions), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(next_actions) between 1 and 3000
      and next_actions !~ '[[:cntrl:]]'
    ))
    and (counselor_remarks is null or (
      counselor_remarks = pg_catalog.regexp_replace(
        pg_catalog.btrim(counselor_remarks), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(counselor_remarks) between 1 and 2000
      and counselor_remarks !~ '[[:cntrl:]]'
    ))
    and (director_remarks is null or (
      director_remarks = pg_catalog.regexp_replace(
        pg_catalog.btrim(director_remarks), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(director_remarks) between 1 and 2000
      and director_remarks !~ '[[:cntrl:]]'
    ))
  ),
  constraint parent_reports_final_pdf_check check (
    (
      status <> 'finalized'::public.parent_report_status
      and finalized_by is null and finalized_at is null
      and final_pdf_bucket_id is null and final_pdf_storage_path is null
      and final_pdf_size_bytes is null and final_pdf_sha256 is null
    )
    or (
      status = 'finalized'::public.parent_report_status
      and finalized_by is not null and finalized_at is not null
      and approved_by is not null and approved_at is not null
      and final_pdf_bucket_id = 'parent-report-attachments'
      and final_pdf_storage_path is not null
      and final_pdf_size_bytes between 1 and 52428800
      and final_pdf_sha256 ~ '^[0-9a-f]{64}$'
    )
  ),
  constraint parent_reports_review_check check (
    (reviewed_by is null) = (reviewed_at is null)
    and (approved_by is null) = (approved_at is null)
  ),
  constraint parent_reports_timestamp_check check (updated_at >= created_at)
);

create unique index parent_reports_one_active_period_idx
  on public.parent_reports (student_id, academic_period)
  where status <> 'finalized'::public.parent_report_status;

create index parent_reports_director_queue_idx
  on public.parent_reports (status, updated_at desc, id desc);

create table public.parent_report_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  report_id uuid not null references public.parent_reports(id) on delete restrict,
  event_type public.parent_report_event_type not null,
  from_status public.parent_report_status,
  to_status public.parent_report_status not null,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  event_reason text,
  narrative_snapshot jsonb not null,
  attachment_manifest_snapshot jsonb not null,
  occurred_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint parent_report_events_reason_check check (
    event_reason is null or (
      event_reason = pg_catalog.regexp_replace(
        pg_catalog.btrim(event_reason), '[[:space:]]+', ' ', 'g'
      ) and pg_catalog.char_length(event_reason) between 1 and 1000
      and event_reason !~ '[[:cntrl:]]'
    )
  ),
  constraint parent_report_events_snapshots_check check (
    pg_catalog.jsonb_typeof(narrative_snapshot) = 'object'
    and pg_catalog.jsonb_typeof(attachment_manifest_snapshot) = 'array'
  )
);

create index parent_report_events_history_idx
  on public.parent_report_events (report_id, occurred_at desc, id desc);

create table public.parent_report_attachments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  report_id uuid not null references public.parent_reports(id) on delete restrict,
  source_type public.parent_report_attachment_source not null,
  source_document_id uuid,
  display_name text not null,
  bucket_id text not null,
  storage_path text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  sort_order integer not null,
  status public.parent_report_attachment_status not null,
  added_by uuid not null references public.profiles(id) on delete restrict,
  added_at timestamptz not null default pg_catalog.statement_timestamp(),
  upload_expires_at timestamptz,
  available_at timestamptz,
  removed_by uuid references public.profiles(id) on delete restrict,
  removed_at timestamptz,
  constraint parent_report_attachments_report_sort_key
    unique (report_id, sort_order),
  constraint parent_report_attachments_display_check check (
    display_name = pg_catalog.regexp_replace(
      pg_catalog.btrim(display_name), '[[:space:]]+', ' ', 'g'
    ) and pg_catalog.char_length(display_name) between 2 and 100
    and display_name !~ '[[:cntrl:]]'
  ),
  constraint parent_report_attachments_mime_check check (
    mime_type in ('application/pdf', 'image/jpeg', 'image/png')
    and file_size_bytes between 1 and 10485760
  ),
  constraint parent_report_attachments_source_check check (
    (
      source_type = 'report_upload'::public.parent_report_attachment_source
      and source_document_id is null
      and bucket_id = 'parent-report-attachments'
      and upload_expires_at is not null
    )
    or (
      source_type <> 'report_upload'::public.parent_report_attachment_source
      and source_document_id is not null
      and upload_expires_at is null
      and status <> 'pending'::public.parent_report_attachment_status
    )
  ),
  constraint parent_report_attachments_lifecycle_check check (
    (
      status = 'pending'::public.parent_report_attachment_status
      and available_at is null and removed_by is null and removed_at is null
    )
    or (
      status = 'available'::public.parent_report_attachment_status
      and available_at is not null and removed_by is null and removed_at is null
    )
    or (
      status = 'removed'::public.parent_report_attachment_status
      and available_at is not null and removed_by is not null
      and removed_at is not null and removed_at >= available_at
    )
  )
);

create index parent_report_attachments_available_idx
  on public.parent_report_attachments (report_id, sort_order, id)
  where status = 'available'::public.parent_report_attachment_status;

create unique index parent_report_attachments_active_source_idx
  on public.parent_report_attachments (
    report_id, source_type, source_document_id
  )
  where source_document_id is not null
    and status <> 'removed'::public.parent_report_attachment_status;

alter table public.parent_reports owner to postgres;
alter table public.parent_report_events owner to postgres;
alter table public.parent_report_attachments owner to postgres;

alter table public.parent_reports enable row level security;
alter table public.parent_reports force row level security;
alter table public.parent_report_events enable row level security;
alter table public.parent_report_events force row level security;
alter table public.parent_report_attachments enable row level security;
alter table public.parent_report_attachments force row level security;

revoke all on table public.parent_reports
  from public, anon, authenticated, service_role;
revoke all on table public.parent_report_events
  from public, anon, authenticated, service_role;
revoke all on table public.parent_report_attachments
  from public, anon, authenticated, service_role;

insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'parent-report-attachments',
  'parent-report-attachments',
  false,
  52428800,
  array['application/pdf', 'image/jpeg', 'image/png']::text[]
)
on conflict (id) do nothing;

do $bucket_contract$
begin
  if not exists (
    select 1 from storage.buckets as bucket
    where bucket.id = 'parent-report-attachments'
      and bucket.name = 'parent-report-attachments'
      and bucket.public is false
      and bucket.file_size_limit = 52428800
      and bucket.allowed_mime_types =
        array['application/pdf', 'image/jpeg', 'image/png']::text[]
  ) then
    raise exception using errcode = '55000',
      message = 'Parent Report bucket does not match the reviewed contract';
  end if;
end;
$bucket_contract$;

create function private.build_parent_report_source_snapshot(
  p_student_id uuid,
  p_academic_period text
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'schema_version', 1,
    'captured_at', pg_catalog.statement_timestamp(),
    'academic_period', p_academic_period,
    'student', coalesce((
      select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'full_name', profile.full_name,
        'roll_number', student_profile.roll_number,
        'course', student_profile.course,
        'department', student_profile.department,
        'current_year', student_profile.current_year,
        'current_semester', student_profile.current_semester,
        'graduation_year', student_profile.graduation_year,
        'cgpa', student_profile.cgpa,
        'cgpa_scale', student_profile.cgpa_scale,
        'active_backlogs', student_profile.active_backlogs,
        'cleared_backlogs', student_profile.cleared_backlogs,
        'academic_remarks', student_profile.academic_remarks
      ))
      from public.profiles as profile
      left join public.student_profiles as student_profile
        on student_profile.student_id = profile.id
      where profile.id = p_student_id
        and profile.role = 'student'::public.user_role
        and profile.is_active
    ), '{}'::jsonb),
    'preferences', coalesce((
      select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'preferred_study_area', preference.preferred_study_area,
        'preferred_domain', preference.preferred_domain,
        'study_pathway', preference.study_pathway,
        'global_track_program', preference.global_track_program,
        'preferred_countries', preference.preferred_countries,
        'preferred_program_areas', preference.preferred_program_areas,
        'target_intake', preference.target_intake,
        'budget_range', preference.budget_range,
        'study_mode', preference.study_mode,
        'funding_method', preference.funding_method
      ))
      from public.student_preferences as preference
      where preference.student_id = p_student_id
    ), '{}'::jsonb),
    'achievements', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'type', achievement.achievement_type,
          'title', achievement.title,
          'organization', achievement.organization,
          'date', achievement.achievement_date,
          'description', achievement.description
        )) order by achievement.achievement_date desc nulls last,
          achievement.created_at desc, achievement.id desc
      )
      from (
        select source.*
        from public.student_achievements as source
        where source.student_id = p_student_id
        order by source.achievement_date desc nulls last,
          source.created_at desc, source.id desc
        limit 50
      ) as achievement
    ), '[]'::jsonb),
    'study_abroad_exams', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'exam_name', exam.exam_name,
          'custom_exam_name', exam.custom_exam_name,
          'status', exam.exam_status,
          'attempt_number', exam.attempt_number,
          'planned_date', exam.planned_date,
          'completed_date', exam.completed_date,
          'score', exam.score,
          'valid_until', exam.valid_until
        )) order by exam.created_at desc, exam.id desc
      )
      from (
        select source.*
        from public.student_test_scores as source
        where source.student_id = p_student_id
        order by source.created_at desc, source.id desc
        limit 50
      ) as exam
    ), '[]'::jsonb),
    'journey_progress', coalesce((
      select pg_catalog.jsonb_build_object(
        'current_stage', progression.current_stage,
        'workflow_state', progression.workflow_state,
        'stage_started_at', progression.stage_started_at,
        'last_changed_at', progression.last_changed_at
      )
      from public.student_counseling_progressions as progression
      where progression.student_id = p_student_id
    ), '{}'::jsonb),
    'applications', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
          'university_name', application.university_name,
          'programme_name', application.programme_name,
          'country_code', application.country_code,
          'degree_level', application.degree_level,
          'intake_term', application.intake_term,
          'intake_year', application.intake_year,
          'application_status', application.current_status,
          'submitted_at', application.submitted_at,
          'university_decision', coalesce(
            journey.university_decision,
            'pending'::public.university_application_decision
          ),
          'offer_status', coalesce(
            journey.offer_status,
            'none'::public.university_application_offer_status
          ),
          'student_decision', coalesce(
            journey.student_decision,
            'pending'::public.university_application_student_decision
          ),
          'fee_status', coalesce(
            journey.fee_status,
            'not_started'::public.university_application_fee_status
          ),
          'visa_status', coalesce(
            journey.visa_status,
            'not_started'::public.university_application_visa_status
          ),
          'enrollment_status', coalesce(
            journey.enrollment_status,
            'not_enrolled'::public.university_application_enrollment_status
          )
        )) order by application.is_primary desc,
          application.last_changed_at desc, application.id desc
      )
      from (
        select source.*
        from public.student_university_applications as source
        where source.student_id = p_student_id
          and source.is_archived is false
        order by source.is_primary desc, source.last_changed_at desc,
          source.id desc
        limit 50
      ) as application
      left join public.student_university_application_journeys as journey
        on journey.application_id = application.id
    ), '[]'::jsonb),
    'semester_summary', coalesce((
      select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
        'academic_period', summary.academic_period,
        'progress_summary', summary.progress_summary,
        'achievements_highlights', summary.achievements_highlights,
        'areas_requiring_attention', summary.areas_requiring_attention,
        'next_semester_actions', summary.next_semester_actions,
        'recorded_at', summary.created_at
      ))
      from public.counselor_student_semester_summaries as summary
      where summary.student_id = p_student_id
        and summary.academic_period = p_academic_period
      order by summary.created_at desc, summary.id desc
      limit 1
    ), '{}'::jsonb)
  );
$function$;

create function private.parent_report_narrative_snapshot(p_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
    'semester_overview', report.semester_overview,
    'strengths_highlights', report.strengths_highlights,
    'areas_requiring_attention', report.areas_requiring_attention,
    'next_actions', report.next_actions,
    'counselor_remarks', report.counselor_remarks,
    'director_remarks', report.director_remarks
  ))
  from public.parent_reports as report
  where report.id = p_report_id;
$function$;

create function private.parent_report_attachment_manifest(p_report_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'attachment_id', attachment.id,
      'source_type', attachment.source_type,
      'display_name', attachment.display_name,
      'mime_type', attachment.mime_type,
      'file_size_bytes', attachment.file_size_bytes,
      'sort_order', attachment.sort_order
    ) order by attachment.sort_order, attachment.id
  ), '[]'::jsonb)
  from public.parent_report_attachments as attachment
  where attachment.report_id = p_report_id
    and attachment.status =
      'available'::public.parent_report_attachment_status;
$function$;

create function private.append_parent_report_event(
  p_report_id uuid,
  p_event_type public.parent_report_event_type,
  p_from_status public.parent_report_status,
  p_to_status public.parent_report_status,
  p_actor_id uuid,
  p_event_reason text default null
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_reason text;
begin
  v_reason := nullif(pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_event_reason, '')),
    '[[:space:]]+', ' ', 'g'
  ), '');
  if v_reason is not null and (
    pg_catalog.char_length(v_reason) > 1000
    or v_reason ~ '[[:cntrl:]]'
  ) then
    raise exception using errcode = '22023',
      message = 'Parent Report event is invalid.';
  end if;

  insert into public.parent_report_events (
    report_id, event_type, from_status, to_status, actor_id,
    event_reason, narrative_snapshot, attachment_manifest_snapshot,
    occurred_at
  ) values (
    p_report_id, p_event_type, p_from_status, p_to_status, p_actor_id,
    v_reason,
    private.parent_report_narrative_snapshot(p_report_id),
    private.parent_report_attachment_manifest(p_report_id),
    pg_catalog.statement_timestamp()
  );
end;
$function$;

create function private.can_edit_parent_report(p_report_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_report public.parent_reports%rowtype;
begin
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id;
  if v_report.id is null or (select auth.uid()) is null then return false; end if;

  return (
    v_report.status in (
      'draft'::public.parent_report_status,
      'revision_requested'::public.parent_report_status
    )
    and public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is true
    and public.is_active_primary_counselor_for_student(v_report.student_id)
      is true
  ) or (
    v_report.status = 'director_review'::public.parent_report_status
    and public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is true
  );
exception when others then return false;
end;
$function$;

alter function private.can_edit_parent_report(uuid) owner to postgres;
revoke all on function private.can_edit_parent_report(uuid)
  from public, anon, authenticated, service_role;

create function public.list_parent_report_attachment_candidates(
  p_report_id uuid
)
returns table (
  source_type public.parent_report_attachment_source,
  source_document_id uuid,
  display_name text,
  mime_type text,
  file_size_bytes bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_report public.parent_reports%rowtype;
  v_is_counselor boolean;
  v_is_director boolean;
begin
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id;
  if v_report.id is null or (select auth.uid()) is null then
    raise exception using errcode = '42501',
      message = 'Parent Report attachments are temporarily unavailable.';
  end if;
  v_is_counselor := public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ) is true and public.is_active_primary_counselor_for_student(
    v_report.student_id
  ) is true;
  v_is_director := public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is true;
  if v_is_counselor is not true and v_is_director is not true then
    raise exception using errcode = '42501',
      message = 'Parent Report attachments are temporarily unavailable.';
  end if;

  return query
  select 'profile_document'::public.parent_report_attachment_source,
    document.id, document.display_name, document.mime_type,
    document.file_size_bytes
  from public.student_profile_documents as document
  where document.student_id = v_report.student_id
    and document.document_type = 'test_score'::public.student_profile_document_type
    and document.status = 'available'::public.student_profile_document_status
    and document.mime_type in ('application/pdf', 'image/jpeg', 'image/png')
    and not exists (
      select 1 from public.parent_report_attachments as existing
      where existing.report_id = v_report.id
        and existing.source_type =
          'profile_document'::public.parent_report_attachment_source
        and existing.source_document_id = document.id
        and existing.status <>
          'removed'::public.parent_report_attachment_status
    )
  union all
  select 'application_document'::public.parent_report_attachment_source,
    document.id, document.document_title, document.mime_type,
    document.file_size_bytes
  from public.student_university_application_documents as document
  inner join public.student_university_applications as application
    on application.id = document.application_id
  where application.student_id = v_report.student_id
    and document.status =
      'available'::public.university_application_document_status
    and document.mime_type in ('application/pdf', 'image/jpeg', 'image/png')
    and not exists (
      select 1 from public.parent_report_attachments as existing
      where existing.report_id = v_report.id
        and existing.source_type =
          'application_document'::public.parent_report_attachment_source
        and existing.source_document_id = document.id
        and existing.status <>
          'removed'::public.parent_report_attachment_status
    )
  union all
  select 'progression_evidence'::public.parent_report_attachment_source,
    evidence.id, evidence.original_file_name, evidence.mime_type,
    evidence.file_size_bytes
  from public.student_counseling_progression_evidence as evidence
  inner join public.student_counseling_progression_events as progression_event
    on progression_event.id = evidence.progression_event_id
  where progression_event.student_id = v_report.student_id
    and evidence.status =
      'available'::public.counseling_progression_evidence_status
    and evidence.mime_type in ('application/pdf', 'image/jpeg', 'image/png')
    and not exists (
      select 1 from public.parent_report_attachments as existing
      where existing.report_id = v_report.id
        and existing.source_type =
          'progression_evidence'::public.parent_report_attachment_source
        and existing.source_document_id = evidence.id
        and existing.status <>
          'removed'::public.parent_report_attachment_status
    )
  order by 1, 3, 2
  limit 100;
end;
$function$;

create function public.add_parent_report_existing_attachment(
  p_report_id uuid,
  p_source_type public.parent_report_attachment_source,
  p_source_document_id uuid,
  p_display_name text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
  v_attachment_id uuid;
  v_name text;
  v_bucket text;
  v_path text;
  v_mime text;
  v_size bigint;
  v_sort integer;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;
  v_name := private.normalize_parent_report_text(p_display_name, 100);

  if v_caller_id is null or v_report.id is null or v_name is null
    or pg_catalog.char_length(v_name) < 2
    or private.can_edit_parent_report(v_report.id) is distinct from true
    or p_source_type not in (
      'profile_document'::public.parent_report_attachment_source,
      'application_document'::public.parent_report_attachment_source,
      'progression_evidence'::public.parent_report_attachment_source
    ) then
    raise exception using errcode = '42501',
      message = 'Parent Report attachment could not be added.';
  end if;

  if (
    select pg_catalog.count(*) from public.parent_report_attachments as item
    where item.report_id = v_report.id
      and (
        item.status = 'available'::public.parent_report_attachment_status
        or (
          item.status = 'pending'::public.parent_report_attachment_status
          and item.upload_expires_at > pg_catalog.statement_timestamp()
        )
      )
  ) >= 20 then
    raise exception using errcode = '22023',
      message = 'The Parent Report attachment limit has been reached.';
  end if;

  case p_source_type
    when 'profile_document'::public.parent_report_attachment_source then
      select document.bucket_id, document.storage_path,
        document.mime_type, document.file_size_bytes
      into v_bucket, v_path, v_mime, v_size
      from public.student_profile_documents as document
      where document.id = p_source_document_id
        and document.student_id = v_report.student_id
        and document.document_type =
          'test_score'::public.student_profile_document_type
        and document.status =
          'available'::public.student_profile_document_status;
    when 'application_document'::public.parent_report_attachment_source then
      select document.bucket_id, document.storage_path,
        document.mime_type, document.file_size_bytes
      into v_bucket, v_path, v_mime, v_size
      from public.student_university_application_documents as document
      inner join public.student_university_applications as application
        on application.id = document.application_id
      where document.id = p_source_document_id
        and application.student_id = v_report.student_id
        and document.status =
          'available'::public.university_application_document_status;
    when 'progression_evidence'::public.parent_report_attachment_source then
      select evidence.bucket_id, evidence.storage_path,
        evidence.mime_type, evidence.file_size_bytes
      into v_bucket, v_path, v_mime, v_size
      from public.student_counseling_progression_evidence as evidence
      inner join public.student_counseling_progression_events as progression_event
        on progression_event.id = evidence.progression_event_id
      where evidence.id = p_source_document_id
        and progression_event.student_id = v_report.student_id
        and evidence.status =
          'available'::public.counseling_progression_evidence_status;
    else null;
  end case;

  if v_path is null
    or v_mime not in ('application/pdf', 'image/jpeg', 'image/png')
    or v_size not between 1 and 10485760 then
    raise exception using errcode = '22023',
      message = 'Parent Report attachment could not be added.';
  end if;

  if (
    select coalesce(pg_catalog.sum(item.file_size_bytes), 0)
    from public.parent_report_attachments as item
    where item.report_id = v_report.id
      and item.status = 'available'::public.parent_report_attachment_status
  ) + v_size > 41943040 then
    raise exception using errcode = '22023',
      message = 'The Parent Report attachment size limit has been reached.';
  end if;

  select coalesce(pg_catalog.max(item.sort_order), 0) + 1 into v_sort
  from public.parent_report_attachments as item
  where item.report_id = v_report.id;
  v_attachment_id := pg_catalog.gen_random_uuid();

  insert into public.parent_report_attachments (
    id, report_id, source_type, source_document_id, display_name,
    bucket_id, storage_path, mime_type, file_size_bytes, sort_order,
    status, added_by, added_at, available_at
  ) values (
    v_attachment_id, v_report.id, p_source_type, p_source_document_id,
    v_name, v_bucket, v_path, v_mime, v_size, v_sort,
    'available'::public.parent_report_attachment_status,
    v_caller_id, pg_catalog.statement_timestamp(),
    pg_catalog.statement_timestamp()
  );

  perform private.append_parent_report_event(
    v_report.id, 'attachment_added'::public.parent_report_event_type,
    v_report.status, v_report.status, v_caller_id,
    'Existing safe document selected.'
  );
  return v_attachment_id;
end;
$function$;

create function public.prepare_parent_report_attachment_upload(
  p_report_id uuid,
  p_display_name text,
  p_original_file_name text,
  p_mime_type text,
  p_file_size_bytes bigint
)
returns table (
  attachment_id uuid,
  bucket_id text,
  storage_path text,
  mime_type text,
  upload_expires_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
  v_attachment_id uuid;
  v_name text;
  v_original_name text;
  v_extension text;
  v_path text;
  v_sort integer;
  v_expires timestamptz;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;
  v_name := private.normalize_parent_report_text(p_display_name, 100);
  v_original_name := nullif(pg_catalog.btrim(p_original_file_name), '');

  if v_caller_id is null or v_report.id is null or v_name is null
    or pg_catalog.char_length(v_name) < 2
    or private.can_edit_parent_report(v_report.id) is distinct from true
    or v_original_name is null
    or pg_catalog.char_length(v_original_name) > 255
    or v_original_name ~ '[/\\]'
    or v_original_name ~ '[[:cntrl:]]'
    or p_mime_type not in ('application/pdf', 'image/jpeg', 'image/png')
    or p_file_size_bytes not between 1 and 10485760 then
    raise exception using errcode = '42501',
      message = 'Parent Report attachment upload could not be prepared.';
  end if;

  v_extension := pg_catalog.lower(
    pg_catalog.regexp_replace(v_original_name, '^.*[.]', '')
  );
  if v_extension = v_original_name or not (
    (p_mime_type = 'application/pdf' and v_extension = 'pdf')
    or (p_mime_type = 'image/jpeg' and v_extension in ('jpg', 'jpeg'))
    or (p_mime_type = 'image/png' and v_extension = 'png')
  ) then
    raise exception using errcode = '22023',
      message = 'Parent Report attachment upload could not be prepared.';
  end if;

  if (
    select pg_catalog.count(*) from public.parent_report_attachments as item
    where item.report_id = v_report.id
      and (
        item.status = 'available'::public.parent_report_attachment_status
        or (
          item.status = 'pending'::public.parent_report_attachment_status
          and item.upload_expires_at > pg_catalog.statement_timestamp()
        )
      )
  ) >= 20 then
    raise exception using errcode = '22023',
      message = 'The Parent Report attachment limit has been reached.';
  end if;

  if (
    select coalesce(pg_catalog.sum(item.file_size_bytes), 0)
    from public.parent_report_attachments as item
    where item.report_id = v_report.id
      and (
        item.status = 'available'::public.parent_report_attachment_status
        or (
          item.status = 'pending'::public.parent_report_attachment_status
          and item.upload_expires_at > pg_catalog.statement_timestamp()
        )
      )
  ) + p_file_size_bytes > 41943040 then
    raise exception using errcode = '22023',
      message = 'The Parent Report attachment size limit has been reached.';
  end if;

  select coalesce(pg_catalog.max(item.sort_order), 0) + 1 into v_sort
  from public.parent_report_attachments as item
  where item.report_id = v_report.id;
  v_attachment_id := pg_catalog.gen_random_uuid();
  v_expires := pg_catalog.statement_timestamp() + interval '2 hours';
  v_path := pg_catalog.concat(
    'attachments/', v_report.id::text, '/', v_attachment_id::text,
    '/', v_attachment_id::text, '.', v_extension
  );

  insert into public.parent_report_attachments (
    id, report_id, source_type, source_document_id, display_name,
    bucket_id, storage_path, mime_type, file_size_bytes, sort_order,
    status, added_by, added_at, upload_expires_at
  ) values (
    v_attachment_id, v_report.id,
    'report_upload'::public.parent_report_attachment_source,
    null, v_name, 'parent-report-attachments', v_path,
    p_mime_type, p_file_size_bytes, v_sort,
    'pending'::public.parent_report_attachment_status,
    v_caller_id, pg_catalog.statement_timestamp(), v_expires
  );

  return query select v_attachment_id, 'parent-report-attachments'::text,
    v_path, p_mime_type, v_expires;
end;
$function$;

create function public.finalize_parent_report_attachment_upload(
  p_attachment_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_attachment public.parent_report_attachments%rowtype;
  v_report public.parent_reports%rowtype;
  v_actual_size bigint;
  v_actual_mime_type text;
begin
  v_caller_id := (select auth.uid());
  select attachment.* into v_attachment
  from public.parent_report_attachments as attachment
  where attachment.id = p_attachment_id
  for update;
  select report.* into v_report
  from public.parent_reports as report
  where report.id = v_attachment.report_id
  for update;

  select
    case
      when coalesce(storage_object.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (storage_object.metadata ->> 'size')::bigint
      else null
    end,
    nullif(pg_catalog.lower(storage_object.metadata ->> 'mimetype'), '')
  into v_actual_size, v_actual_mime_type
  from storage.objects as storage_object
  where storage_object.bucket_id = v_attachment.bucket_id
    and storage_object.name = v_attachment.storage_path;

  if v_caller_id is null or v_attachment.id is null or v_report.id is null
    or private.can_edit_parent_report(v_report.id) is distinct from true
    or v_attachment.source_type <>
      'report_upload'::public.parent_report_attachment_source
    or v_attachment.status <>
      'pending'::public.parent_report_attachment_status
    or v_attachment.upload_expires_at <= pg_catalog.statement_timestamp()
    or v_actual_size is null
    or v_actual_size <> v_attachment.file_size_bytes
    or v_actual_size not between 1 and 10485760
    or v_actual_mime_type is null
    or v_actual_mime_type <> v_attachment.mime_type
    or v_actual_mime_type not in (
      'application/pdf', 'image/jpeg', 'image/png'
    ) then
    raise exception using errcode = '42501',
      message = 'Parent Report attachment upload could not be finalized.';
  end if;

  update public.parent_report_attachments as attachment set
    status = 'available'::public.parent_report_attachment_status,
    available_at = pg_catalog.statement_timestamp()
  where attachment.id = v_attachment.id;

  perform private.append_parent_report_event(
    v_report.id, 'attachment_added'::public.parent_report_event_type,
    v_report.status, v_report.status, v_caller_id,
    'Report-specific attachment uploaded.'
  );
  return v_attachment.id;
end;
$function$;

create function public.remove_parent_report_attachment(p_attachment_id uuid)
returns table (
  attachment_id uuid,
  delete_storage_object boolean,
  bucket_id text,
  storage_path text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_attachment public.parent_report_attachments%rowtype;
  v_report public.parent_reports%rowtype;
begin
  v_caller_id := (select auth.uid());
  select attachment.* into v_attachment
  from public.parent_report_attachments as attachment
  where attachment.id = p_attachment_id
  for update;
  select report.* into v_report
  from public.parent_reports as report
  where report.id = v_attachment.report_id
  for update;

  if v_caller_id is null or v_attachment.id is null or v_report.id is null
    or private.can_edit_parent_report(v_report.id) is distinct from true
    or v_attachment.status <>
      'available'::public.parent_report_attachment_status then
    raise exception using errcode = '42501',
      message = 'Parent Report attachment could not be removed.';
  end if;

  update public.parent_report_attachments as attachment set
    status = 'removed'::public.parent_report_attachment_status,
    removed_by = v_caller_id,
    removed_at = pg_catalog.statement_timestamp()
  where attachment.id = v_attachment.id;

  perform private.append_parent_report_event(
    v_report.id, 'attachment_removed'::public.parent_report_event_type,
    v_report.status, v_report.status, v_caller_id,
    'Attachment removed from report.'
  );

  return query select v_attachment.id,
    v_attachment.source_type =
      'report_upload'::public.parent_report_attachment_source,
    v_attachment.bucket_id, v_attachment.storage_path;
end;
$function$;

create function private.normalize_parent_report_text(
  p_value text,
  p_maximum integer
)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_value text;
begin
  v_value := nullif(pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_value, '')),
    '[[:space:]]+', ' ', 'g'
  ), '');
  if v_value is not null and (
    pg_catalog.char_length(v_value) > p_maximum
    or v_value ~ '[[:cntrl:]]'
  ) then
    raise exception using errcode = '22023',
      message = 'Parent Report narrative is invalid.';
  end if;
  return v_value;
end;
$function$;

alter function private.normalize_parent_report_text(text, integer)
  owner to postgres;
revoke all on function private.normalize_parent_report_text(text, integer)
  from public, anon, authenticated, service_role;

create function public.save_counselor_parent_report_narrative(
  p_report_id uuid,
  p_semester_overview text,
  p_strengths_highlights text,
  p_areas_requiring_attention text,
  p_next_actions text,
  p_counselor_remarks text
)
returns public.parent_report_status
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;

  if v_caller_id is null or v_report.id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true
    or public.is_active_primary_counselor_for_student(v_report.student_id)
      is distinct from true
    or v_report.status not in (
      'draft'::public.parent_report_status,
      'revision_requested'::public.parent_report_status
    ) then
    raise exception using errcode = '42501',
      message = 'Parent Report cannot be edited.';
  end if;

  update public.parent_reports as report set
    semester_overview = private.normalize_parent_report_text(
      p_semester_overview, 3000
    ),
    strengths_highlights = private.normalize_parent_report_text(
      p_strengths_highlights, 3000
    ),
    areas_requiring_attention = private.normalize_parent_report_text(
      p_areas_requiring_attention, 3000
    ),
    next_actions = private.normalize_parent_report_text(p_next_actions, 3000),
    counselor_remarks = private.normalize_parent_report_text(
      p_counselor_remarks, 2000
    ),
    last_edited_by = v_caller_id,
    updated_at = pg_catalog.statement_timestamp()
  where report.id = v_report.id;

  perform private.append_parent_report_event(
    v_report.id, 'counselor_edited'::public.parent_report_event_type,
    v_report.status, v_report.status, v_caller_id, null
  );
  return v_report.status;
end;
$function$;

create function public.save_director_parent_report_narrative(
  p_report_id uuid,
  p_semester_overview text,
  p_strengths_highlights text,
  p_areas_requiring_attention text,
  p_next_actions text,
  p_counselor_remarks text,
  p_director_remarks text
)
returns public.parent_report_status
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;

  if v_caller_id is null or v_report.id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true
    or v_report.status <> 'director_review'::public.parent_report_status then
    raise exception using errcode = '42501',
      message = 'Parent Report cannot be edited.';
  end if;

  update public.parent_reports as report set
    semester_overview = private.normalize_parent_report_text(
      p_semester_overview, 3000
    ),
    strengths_highlights = private.normalize_parent_report_text(
      p_strengths_highlights, 3000
    ),
    areas_requiring_attention = private.normalize_parent_report_text(
      p_areas_requiring_attention, 3000
    ),
    next_actions = private.normalize_parent_report_text(p_next_actions, 3000),
    counselor_remarks = private.normalize_parent_report_text(
      p_counselor_remarks, 2000
    ),
    director_remarks = private.normalize_parent_report_text(
      p_director_remarks, 2000
    ),
    reviewed_by = v_caller_id,
    reviewed_at = pg_catalog.statement_timestamp(),
    last_edited_by = v_caller_id,
    updated_at = pg_catalog.statement_timestamp()
  where report.id = v_report.id;

  perform private.append_parent_report_event(
    v_report.id, 'director_edited'::public.parent_report_event_type,
    v_report.status, v_report.status, v_caller_id, null
  );
  return v_report.status;
end;
$function$;

create function public.submit_parent_report(p_report_id uuid)
returns public.parent_report_status
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
  v_event public.parent_report_event_type;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;

  if v_caller_id is null or v_report.id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true
    or public.is_active_primary_counselor_for_student(v_report.student_id)
      is distinct from true
    or v_report.status not in (
      'draft'::public.parent_report_status,
      'revision_requested'::public.parent_report_status
    ) then
    raise exception using errcode = '42501',
      message = 'Parent Report could not be submitted.';
  end if;

  v_event := case when v_report.status =
      'revision_requested'::public.parent_report_status
    then 'resubmitted'::public.parent_report_event_type
    else 'submitted'::public.parent_report_event_type end;

  update public.parent_reports as report set
    status = 'director_review'::public.parent_report_status,
    submitted_at = pg_catalog.statement_timestamp(),
    reviewed_by = null, reviewed_at = null,
    approved_by = null, approved_at = null,
    last_edited_by = v_caller_id,
    updated_at = pg_catalog.statement_timestamp()
  where report.id = v_report.id;

  perform private.append_parent_report_event(
    v_report.id, v_event, v_report.status,
    'director_review'::public.parent_report_status, v_caller_id, null
  );
  return 'director_review'::public.parent_report_status;
end;
$function$;

create function public.request_parent_report_revision(
  p_report_id uuid,
  p_reason text
)
returns public.parent_report_status
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
  v_reason text;
begin
  v_caller_id := (select auth.uid());
  v_reason := private.normalize_parent_report_text(p_reason, 1000);
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;

  if v_caller_id is null or v_report.id is null or v_reason is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true
    or v_report.status <> 'director_review'::public.parent_report_status then
    raise exception using errcode = '42501',
      message = 'Parent Report revision could not be requested.';
  end if;

  update public.parent_reports as report set
    status = 'revision_requested'::public.parent_report_status,
    director_remarks = coalesce(report.director_remarks, v_reason),
    reviewed_by = v_caller_id,
    reviewed_at = pg_catalog.statement_timestamp(),
    last_edited_by = v_caller_id,
    updated_at = pg_catalog.statement_timestamp()
  where report.id = v_report.id;

  perform private.append_parent_report_event(
    v_report.id,
    'revision_requested'::public.parent_report_event_type,
    v_report.status, 'revision_requested'::public.parent_report_status,
    v_caller_id, v_reason
  );
  return 'revision_requested'::public.parent_report_status;
end;
$function$;

create function public.approve_parent_report(p_report_id uuid)
returns public.parent_report_status
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;

  if v_caller_id is null or v_report.id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true
    or v_report.status <> 'director_review'::public.parent_report_status then
    raise exception using errcode = '42501',
      message = 'Parent Report could not be approved.';
  end if;

  update public.parent_reports as report set
    status = 'approved'::public.parent_report_status,
    reviewed_by = coalesce(report.reviewed_by, v_caller_id),
    reviewed_at = coalesce(report.reviewed_at, pg_catalog.statement_timestamp()),
    approved_by = v_caller_id,
    approved_at = pg_catalog.statement_timestamp(),
    last_edited_by = v_caller_id,
    updated_at = pg_catalog.statement_timestamp()
  where report.id = v_report.id;

  perform private.append_parent_report_event(
    v_report.id, 'approved'::public.parent_report_event_type,
    v_report.status, 'approved'::public.parent_report_status,
    v_caller_id, null
  );
  return 'approved'::public.parent_report_status;
end;
$function$;

alter function private.build_parent_report_source_snapshot(uuid, text)
  owner to postgres;
alter function private.parent_report_narrative_snapshot(uuid)
  owner to postgres;
alter function private.parent_report_attachment_manifest(uuid)
  owner to postgres;
alter function private.append_parent_report_event(
  uuid, public.parent_report_event_type, public.parent_report_status,
  public.parent_report_status, uuid, text
) owner to postgres;

revoke all on function private.build_parent_report_source_snapshot(uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function private.parent_report_narrative_snapshot(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.parent_report_attachment_manifest(uuid)
  from public, anon, authenticated, service_role;
revoke all on function private.append_parent_report_event(
  uuid, public.parent_report_event_type, public.parent_report_status,
  public.parent_report_status, uuid, text
) from public, anon, authenticated, service_role;

create function public.create_parent_report_draft(
  p_student_id uuid,
  p_academic_period text
)
returns table (
  report_id uuid,
  version_number integer,
  status public.parent_report_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_period text;
  v_version integer;
  v_report_id uuid;
  v_snapshot jsonb;
  v_summary public.counselor_student_semester_summaries%rowtype;
begin
  v_caller_id := (select auth.uid());
  v_period := nullif(pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_academic_period, '')),
    '[[:space:]]+', ' ', 'g'
  ), '');

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true
    or v_period is null
    or pg_catalog.char_length(v_period) > 80
    or v_period ~ '[[:cntrl:]]' then
    raise exception using errcode = '42501',
      message = 'Parent Report draft could not be created.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      pg_catalog.concat(p_student_id::text, ':', v_period), 0
    )
  );

  if exists (
    select 1 from public.parent_reports as report
    where report.student_id = p_student_id
      and report.academic_period = v_period
      and report.status <> 'finalized'::public.parent_report_status
  ) then
    raise exception using errcode = '23505',
      message = 'An editable Parent Report already exists.';
  end if;

  select coalesce(pg_catalog.max(report.version_number), 0) + 1
  into v_version
  from public.parent_reports as report
  where report.student_id = p_student_id
    and report.academic_period = v_period;

  v_snapshot := private.build_parent_report_source_snapshot(
    p_student_id, v_period
  );
  if v_snapshot -> 'student' = '{}'::jsonb then
    raise exception using errcode = '22023',
      message = 'Parent Report source facts are unavailable.';
  end if;

  select summary.* into v_summary
  from public.counselor_student_semester_summaries as summary
  where summary.student_id = p_student_id
    and summary.academic_period = v_period
  order by summary.created_at desc, summary.id desc
  limit 1;

  v_report_id := pg_catalog.gen_random_uuid();
  insert into public.parent_reports (
    id, student_id, academic_period, version_number, status,
    source_snapshot, semester_overview, strengths_highlights,
    areas_requiring_attention, next_actions, counselor_remarks,
    director_remarks, created_by, last_edited_by, created_at, updated_at
  ) values (
    v_report_id, p_student_id, v_period, v_version,
    'draft'::public.parent_report_status, v_snapshot,
    v_summary.progress_summary,
    v_summary.achievements_highlights,
    v_summary.areas_requiring_attention,
    v_summary.next_semester_actions,
    null, null, v_caller_id, v_caller_id,
    pg_catalog.statement_timestamp(), pg_catalog.statement_timestamp()
  );

  perform private.append_parent_report_event(
    v_report_id,
    case when v_version = 1
      then 'created'::public.parent_report_event_type
      else 'new_version_created'::public.parent_report_event_type
    end,
    null,
    'draft'::public.parent_report_status,
    v_caller_id,
    case when v_version = 1 then null else 'Correction version created.' end
  );

  return query select v_report_id, v_version,
    'draft'::public.parent_report_status;
end;
$function$;

create function public.list_counselor_parent_reports(
  p_student_id uuid,
  p_limit integer default 20
)
returns table (
  report_id uuid,
  academic_period text,
  version_number integer,
  status public.parent_report_status,
  updated_at timestamptz,
  finalized_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 20
    or (select auth.uid()) is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Parent Reports are temporarily unavailable.';
  end if;

  return query
  select report.id, report.academic_period, report.version_number,
    report.status, report.updated_at, report.finalized_at
  from public.parent_reports as report
  where report.student_id = p_student_id
  order by report.academic_period desc, report.version_number desc,
    report.id desc
  limit p_limit;
end;
$function$;

create function public.list_director_parent_reports(p_limit integer default 100)
returns table (
  report_id uuid,
  student_id uuid,
  student_name text,
  academic_period text,
  version_number integer,
  status public.parent_report_status,
  counselor_name text,
  updated_at timestamptz,
  finalized_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 100
    or (select auth.uid()) is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using errcode = '42501',
      message = 'Parent Reports are temporarily unavailable.';
  end if;

  return query
  select report.id, report.student_id,
    coalesce(student.full_name, 'Name not provided'),
    report.academic_period, report.version_number, report.status,
    coalesce(counselor.full_name, creator.full_name, 'Counselor'),
    report.updated_at, report.finalized_at
  from public.parent_reports as report
  inner join public.profiles as student on student.id = report.student_id
  left join public.student_counselor_assignments as assignment
    on assignment.student_id = report.student_id
    and assignment.ended_at is null
  left join public.profiles as counselor
    on counselor.id = assignment.counselor_id
  inner join public.profiles as creator
    on creator.id = report.created_by
  order by
    case report.status
      when 'director_review'::public.parent_report_status then 1
      when 'approved'::public.parent_report_status then 2
      when 'revision_requested'::public.parent_report_status then 3
      when 'draft'::public.parent_report_status then 4
      else 5
    end,
    report.updated_at desc, report.id desc
  limit p_limit;
end;
$function$;

create function public.get_parent_report_workspace(p_report_id uuid)
returns table (payload jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_report public.parent_reports%rowtype;
  v_is_counselor boolean;
  v_is_director boolean;
begin
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id;

  if v_report.id is null or (select auth.uid()) is null then
    raise exception using errcode = '42501',
      message = 'Parent Report is temporarily unavailable.';
  end if;

  v_is_counselor := public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ) is true and public.is_active_primary_counselor_for_student(
    v_report.student_id
  ) is true;
  v_is_director := public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is true;

  if v_is_counselor is not true and v_is_director is not true then
    raise exception using errcode = '42501',
      message = 'Parent Report is temporarily unavailable.';
  end if;

  return query
  select pg_catalog.jsonb_build_object(
    'report', pg_catalog.jsonb_build_object(
      'report_id', v_report.id,
      'student_id', v_report.student_id,
      'academic_period', v_report.academic_period,
      'version_number', v_report.version_number,
      'status', v_report.status,
      'source_snapshot', v_report.source_snapshot,
      'semester_overview', v_report.semester_overview,
      'strengths_highlights', v_report.strengths_highlights,
      'areas_requiring_attention', v_report.areas_requiring_attention,
      'next_actions', v_report.next_actions,
      'counselor_remarks', v_report.counselor_remarks,
      'director_remarks', v_report.director_remarks,
      'created_at', v_report.created_at,
      'updated_at', v_report.updated_at,
      'submitted_at', v_report.submitted_at,
      'reviewed_at', v_report.reviewed_at,
      'approved_at', v_report.approved_at,
      'finalized_at', v_report.finalized_at,
      'final_pdf_available', v_report.final_pdf_storage_path is not null,
      'viewer_role', case when v_is_director then 'director' else 'counselor' end
    ),
    'attachments', private.parent_report_attachment_manifest(v_report.id),
    'events', coalesce((
      select pg_catalog.jsonb_agg(event_row.payload order by event_row.occurred_at desc)
      from (
        select event.occurred_at,
          pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object(
            'event_id', event.id,
            'event_type', event.event_type,
            'from_status', event.from_status,
            'to_status', event.to_status,
            'actor_name', coalesce(actor.full_name, 'K-GEO staff'),
            'event_reason', event.event_reason,
            'occurred_at', event.occurred_at
          )) as payload
        from public.parent_report_events as event
        inner join public.profiles as actor on actor.id = event.actor_id
        where event.report_id = v_report.id
        order by event.occurred_at desc, event.id desc
        limit 50
      ) as event_row
    ), '[]'::jsonb)
  );
end;
$function$;

create function public.get_parent_report_render_payload(p_report_id uuid)
returns table (payload jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_report public.parent_reports%rowtype;
  v_is_counselor boolean;
  v_is_director boolean;
begin
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id;

  if v_report.id is null or (select auth.uid()) is null then
    raise exception using errcode = '42501',
      message = 'Parent Report is temporarily unavailable.';
  end if;

  v_is_counselor := public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ) is true and public.is_active_primary_counselor_for_student(
    v_report.student_id
  ) is true;
  v_is_director := public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is true;

  if v_is_counselor is not true and v_is_director is not true then
    raise exception using errcode = '42501',
      message = 'Parent Report is temporarily unavailable.';
  end if;

  return query
  select pg_catalog.jsonb_build_object(
    'report_id', v_report.id,
    'student_id', v_report.student_id,
    'academic_period', v_report.academic_period,
    'version_number', v_report.version_number,
    'status', v_report.status,
    'source_snapshot', v_report.source_snapshot,
    'semester_overview', v_report.semester_overview,
    'strengths_highlights', v_report.strengths_highlights,
    'areas_requiring_attention', v_report.areas_requiring_attention,
    'next_actions', v_report.next_actions,
    'counselor_remarks', v_report.counselor_remarks,
    'director_remarks', v_report.director_remarks,
    'counselor_name', coalesce((
      select actor.full_name
      from public.parent_report_events as event
      inner join public.profiles as actor on actor.id = event.actor_id
      where event.report_id = v_report.id
        and event.event_type in (
          'submitted'::public.parent_report_event_type,
          'resubmitted'::public.parent_report_event_type
        )
      order by event.occurred_at desc, event.id desc
      limit 1
    ), (
      select creator.full_name from public.profiles as creator
      where creator.id = v_report.created_by
    )),
    'director_name', coalesce((
      select approver.full_name from public.profiles as approver
      where approver.id = v_report.approved_by
    ), (
      select reviewer.full_name from public.profiles as reviewer
      where reviewer.id = v_report.reviewed_by
    )),
    'approved_at', v_report.approved_at,
    'finalized_at', v_report.finalized_at,
    'final_pdf_bucket_id', v_report.final_pdf_bucket_id,
    'final_pdf_storage_path', v_report.final_pdf_storage_path,
    'attachments', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'attachment_id', attachment.id,
          'display_name', attachment.display_name,
          'bucket_id', attachment.bucket_id,
          'storage_path', attachment.storage_path,
          'mime_type', attachment.mime_type,
          'file_size_bytes', attachment.file_size_bytes,
          'sort_order', attachment.sort_order
        ) order by attachment.sort_order, attachment.id
      )
      from public.parent_report_attachments as attachment
      where attachment.report_id = v_report.id
        and attachment.status =
          'available'::public.parent_report_attachment_status
    ), '[]'::jsonb)
  );
end;
$function$;

create function public.finalize_parent_report(
  p_report_id uuid,
  p_file_size_bytes bigint,
  p_sha256 text
)
returns table (
  report_id uuid,
  bucket_id text,
  storage_path text,
  status public.parent_report_status
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_report public.parent_reports%rowtype;
  v_path text;
  v_actual_size bigint;
  v_actual_mime_type text;
begin
  v_caller_id := (select auth.uid());
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id
  for update;
  v_path := pg_catalog.concat(
    'final/', v_report.student_id::text, '/', v_report.id::text,
    '/v', v_report.version_number::text, '.pdf'
  );

  select
    case
      when coalesce(storage_object.metadata ->> 'size', '') ~ '^[0-9]+$'
        then (storage_object.metadata ->> 'size')::bigint
      else null
    end,
    nullif(pg_catalog.lower(storage_object.metadata ->> 'mimetype'), '')
  into v_actual_size, v_actual_mime_type
  from storage.objects as storage_object
  where storage_object.bucket_id = 'parent-report-attachments'
    and storage_object.name = v_path;

  if v_caller_id is null or v_report.id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true
    or v_report.status <> 'approved'::public.parent_report_status
    or p_file_size_bytes not between 1 and 52428800
    or p_sha256 !~ '^[0-9a-f]{64}$'
    or v_actual_size is null
    or v_actual_size <> p_file_size_bytes
    or v_actual_size not between 1 and 52428800
    or v_actual_mime_type is null
    or v_actual_mime_type <> 'application/pdf' then
    raise exception using errcode = '42501',
      message = 'Parent Report could not be finalized.';
  end if;

  update public.parent_reports as report set
    status = 'finalized'::public.parent_report_status,
    finalized_by = v_caller_id,
    finalized_at = pg_catalog.statement_timestamp(),
    final_pdf_bucket_id = 'parent-report-attachments',
    final_pdf_storage_path = v_path,
    final_pdf_size_bytes = v_actual_size,
    final_pdf_sha256 = p_sha256,
    last_edited_by = v_caller_id,
    updated_at = pg_catalog.statement_timestamp()
  where report.id = v_report.id;

  perform private.append_parent_report_event(
    v_report.id, 'finalized'::public.parent_report_event_type,
    v_report.status, 'finalized'::public.parent_report_status,
    v_caller_id, null
  );

  return query select v_report.id, 'parent-report-attachments'::text,
    v_path, 'finalized'::public.parent_report_status;
end;
$function$;

create function public.authorize_parent_report_download(p_report_id uuid)
returns table (
  bucket_id text,
  storage_path text,
  download_name text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_report public.parent_reports%rowtype;
  v_allowed boolean;
begin
  select report.* into v_report
  from public.parent_reports as report
  where report.id = p_report_id;
  if v_report.id is null or (select auth.uid()) is null then
    raise exception using errcode = '42501',
      message = 'Parent Report download is unavailable.';
  end if;
  v_allowed := public.has_active_verified_kgeo_role(
    'director'::public.user_role
  ) is true or (
    public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is true
    and public.is_active_primary_counselor_for_student(v_report.student_id)
      is true
  );

  if v_allowed is not true
    or v_report.status <> 'finalized'::public.parent_report_status
    or v_report.final_pdf_bucket_id is null
    or v_report.final_pdf_storage_path is null then
    raise exception using errcode = '42501',
      message = 'Parent Report download is unavailable.';
  end if;

  return query select v_report.final_pdf_bucket_id,
    v_report.final_pdf_storage_path,
    pg_catalog.concat(
      'K-GEO-Parent-Report-', v_report.academic_period, '-v',
      v_report.version_number::text, '.pdf'
    );
end;
$function$;

create function public.can_upload_parent_report_object(
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
  if (select auth.uid()) is null
    or p_bucket_id <> 'parent-report-attachments' then return false; end if;
  return exists (
    select 1
    from public.parent_report_attachments as attachment
    where attachment.bucket_id = p_bucket_id
      and attachment.storage_path = p_storage_path
      and attachment.source_type =
        'report_upload'::public.parent_report_attachment_source
      and attachment.status =
        'pending'::public.parent_report_attachment_status
      and attachment.added_by = (select auth.uid())
      and attachment.upload_expires_at > pg_catalog.statement_timestamp()
      and private.can_edit_parent_report(attachment.report_id) is true
  );
exception when others then return false;
end;
$function$;

create function public.can_view_parent_report_object(
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
  if (select auth.uid()) is null
    or p_bucket_id <> 'parent-report-attachments' then return false; end if;

  select report.student_id into v_student_id
  from public.parent_reports as report
  where (
    report.final_pdf_bucket_id = p_bucket_id
    and report.final_pdf_storage_path = p_storage_path
    and report.status = 'finalized'::public.parent_report_status
  ) or exists (
    select 1 from public.parent_report_attachments as attachment
    where attachment.report_id = report.id
      and attachment.bucket_id = p_bucket_id
      and attachment.storage_path = p_storage_path
      and attachment.status =
        'available'::public.parent_report_attachment_status
  )
  limit 1;

  return v_student_id is not null and (
    public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is true or (
      public.has_active_verified_kgeo_role(
        'counselor'::public.user_role
      ) is true
      and public.is_active_primary_counselor_for_student(v_student_id) is true
    )
  );
exception when others then return false;
end;
$function$;

create function public.can_delete_parent_report_object(
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
  if (select auth.uid()) is null
    or p_bucket_id <> 'parent-report-attachments' then return false; end if;
  return exists (
    select 1 from public.parent_report_attachments as attachment
    where attachment.bucket_id = p_bucket_id
      and attachment.storage_path = p_storage_path
      and attachment.source_type =
        'report_upload'::public.parent_report_attachment_source
      and private.can_edit_parent_report(attachment.report_id) is true
      and (
        (
          attachment.status =
            'removed'::public.parent_report_attachment_status
          and attachment.removed_by = (select auth.uid())
          and attachment.removed_at >
            pg_catalog.statement_timestamp() - interval '5 minutes'
        )
        or (
          attachment.status =
            'pending'::public.parent_report_attachment_status
          and attachment.added_by = (select auth.uid())
          and attachment.upload_expires_at is not null
        )
      )
  );
exception when others then return false;
end;
$function$;

do $function_contract$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'create_parent_report_draft(uuid,text)',
    'list_counselor_parent_reports(uuid,integer)',
    'list_director_parent_reports(integer)',
    'get_parent_report_workspace(uuid)',
    'get_parent_report_render_payload(uuid)',
    'save_counselor_parent_report_narrative(uuid,text,text,text,text,text)',
    'save_director_parent_report_narrative(uuid,text,text,text,text,text,text)',
    'submit_parent_report(uuid)',
    'request_parent_report_revision(uuid,text)',
    'approve_parent_report(uuid)',
    'finalize_parent_report(uuid,bigint,text)',
    'authorize_parent_report_download(uuid)',
    'list_parent_report_attachment_candidates(uuid)',
    'add_parent_report_existing_attachment(uuid,public.parent_report_attachment_source,uuid,text)',
    'prepare_parent_report_attachment_upload(uuid,text,text,text,bigint)',
    'finalize_parent_report_attachment_upload(uuid)',
    'remove_parent_report_attachment(uuid)',
    'can_upload_parent_report_object(text,text)',
    'can_view_parent_report_object(text,text)',
    'can_delete_parent_report_object(text,text)'
  ]::text[] loop
    execute pg_catalog.format(
      'alter function public.%s owner to postgres', v_signature
    );
    execute pg_catalog.format(
      'revoke all on function public.%s from public, anon, authenticated, service_role',
      v_signature
    );
  end loop;
end;
$function_contract$;

grant execute on function public.create_parent_report_draft(uuid, text)
  to authenticated;
grant execute on function public.list_counselor_parent_reports(uuid, integer)
  to authenticated;
grant execute on function public.list_director_parent_reports(integer)
  to authenticated;
grant execute on function public.get_parent_report_workspace(uuid)
  to authenticated;
grant execute on function public.get_parent_report_render_payload(uuid)
  to authenticated;
grant execute on function public.save_counselor_parent_report_narrative(
  uuid, text, text, text, text, text
) to authenticated;
grant execute on function public.save_director_parent_report_narrative(
  uuid, text, text, text, text, text, text
) to authenticated;
grant execute on function public.submit_parent_report(uuid) to authenticated;
grant execute on function public.request_parent_report_revision(uuid, text)
  to authenticated;
grant execute on function public.approve_parent_report(uuid) to authenticated;
grant execute on function public.finalize_parent_report(uuid, bigint, text)
  to authenticated;
grant execute on function public.authorize_parent_report_download(uuid)
  to authenticated;
grant execute on function public.list_parent_report_attachment_candidates(uuid)
  to authenticated;
grant execute on function public.add_parent_report_existing_attachment(
  uuid, public.parent_report_attachment_source, uuid, text
) to authenticated;
grant execute on function public.prepare_parent_report_attachment_upload(
  uuid, text, text, text, bigint
) to authenticated;
grant execute on function public.finalize_parent_report_attachment_upload(uuid)
  to authenticated;
grant execute on function public.remove_parent_report_attachment(uuid)
  to authenticated;
grant execute on function public.can_upload_parent_report_object(text, text)
  to authenticated;
grant execute on function public.can_view_parent_report_object(text, text)
  to authenticated;
grant execute on function public.can_delete_parent_report_object(text, text)
  to authenticated;

grant usage on type public.parent_report_status to authenticated;
grant usage on type public.parent_report_event_type to authenticated;
grant usage on type public.parent_report_attachment_source to authenticated;
grant usage on type public.parent_report_attachment_status to authenticated;

commit;

-- >>> supabase/migrations/202609020001_global_masters_readiness_index.sql
-- K-GEO Global Master's Readiness Index Phase 1.
-- Counselor-awarded, evidence-informed, immutable assessment revisions.

begin;

create type public.global_readiness_band as enum (
  'early_readiness',
  'developing_readiness',
  'competitive_readiness',
  'advanced_readiness',
  'global_distinction'
);

alter type public.global_readiness_band owner to postgres;
revoke all on type public.global_readiness_band
  from public, anon, authenticated, service_role;
grant usage on type public.global_readiness_band to authenticated;

create function private.normalize_global_readiness_text(
  p_value text,
  p_max_length integer,
  p_required boolean
)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_value text;
begin
  if p_value is null or pg_catalog.btrim(p_value) = '' then
    if p_required then
      raise exception using errcode = '22023',
        message = 'Readiness assessment text is required';
    end if;
    return null;
  end if;

  if p_value ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023',
      message = 'Readiness assessment text is invalid';
  end if;

  v_value := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_value), '[[:space:]]+', ' ', 'g'
  );
  if pg_catalog.char_length(v_value) not between 1 and p_max_length then
    raise exception using errcode = '22023',
      message = 'Readiness assessment text is invalid';
  end if;
  return v_value;
end;
$function$;

alter function private.normalize_global_readiness_text(text, integer, boolean)
  owner to postgres;
revoke all on function
  private.normalize_global_readiness_text(text, integer, boolean)
  from public, anon, authenticated, service_role;

create function private.is_valid_global_readiness_rationale(
  p_score integer,
  p_snapshot jsonb,
  p_criterion text,
  p_rationale text
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select
    (
      p_rationale is null
      or (
        pg_catalog.char_length(p_rationale) between 1 and 1000
        and p_rationale = pg_catalog.regexp_replace(
          pg_catalog.btrim(p_rationale), '[[:space:]]+', ' ', 'g'
        )
        and p_rationale !~ '[[:cntrl:]]'
      )
    )
    and (
      p_score = 0
      or coalesce(
        (p_snapshot #>> array['criteria', p_criterion, 'recorded'])::boolean,
        false
      )
      or p_rationale is not null
    );
$function$;

alter function private.is_valid_global_readiness_rationale(
  integer, jsonb, text, text
) owner to postgres;
revoke all on function private.is_valid_global_readiness_rationale(
  integer, jsonb, text, text
) from public, anon, authenticated, service_role;

create function private.global_readiness_count_evidence(
  p_count integer,
  p_label text
)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'recorded', p_count > 0,
    'facts', case when p_count = 0
      then pg_catalog.jsonb_build_array('Not recorded')
      else pg_catalog.jsonb_build_array(
        pg_catalog.format('%s: %s', p_label, p_count)
      )
    end
  );
$function$;

alter function private.global_readiness_count_evidence(integer, text)
  owner to postgres;
revoke all on function private.global_readiness_count_evidence(integer, text)
  from public, anon, authenticated, service_role;

create function private.build_global_readiness_evidence_snapshot(
  p_student_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with facts as (
    select
      (select pg_catalog.count(*)::integer from public.student_achievements a
        where a.student_id = p_student_id and a.achievement_type in ('project', 'research')) as projects,
      (select pg_catalog.count(*)::integer from public.student_achievements a
        where a.student_id = p_student_id and a.achievement_type in ('publication', 'hackathon')) as distinctions,
      (select pg_catalog.count(*)::integer from public.student_achievements a
        where a.student_id = p_student_id and a.achievement_type in ('internship', 'work_experience')) as experience,
      (select pg_catalog.count(*)::integer from public.student_achievements a
        where a.student_id = p_student_id and a.achievement_type = 'certification') as certifications,
      (select pg_catalog.count(*)::integer from public.student_achievements a
        where a.student_id = p_student_id and a.achievement_type = 'leadership') as leadership,
      (select pg_catalog.count(*)::integer from public.student_achievements a
        where a.student_id = p_student_id and a.achievement_type in ('award', 'volunteering', 'sports', 'other')) as service,
      (select pg_catalog.count(*)::integer from public.consultation_requests c
        where c.student_id = p_student_id) as consultations,
      exists (select 1 from public.student_counseling_progressions p
        where p.student_id = p_student_id) as progression,
      (select pg_catalog.count(*)::integer from public.student_profile_documents d
        where d.student_id = p_student_id
          and d.status = 'available'::public.student_profile_document_status
          and d.document_type = 'sop') as sop,
      (select pg_catalog.count(*)::integer from public.student_profile_documents d
        where d.student_id = p_student_id
          and d.status = 'available'::public.student_profile_document_status
          and d.document_type = 'lor') as lor,
      (select pg_catalog.count(*)::integer from public.student_university_applications u
        where u.student_id = p_student_id and u.is_archived is false) as shortlisted,
      (select pg_catalog.count(*)::integer from public.student_university_applications u
        where u.student_id = p_student_id and u.submitted_at is not null) as submitted
  ), profile as (
    select p.cgpa, p.cgpa_scale, p.active_backlogs, p.cleared_backlogs
    from public.student_profiles p where p.student_id = p_student_id
  )
  select pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'criteria', pg_catalog.jsonb_build_object(
      'academicReadiness', pg_catalog.jsonb_build_object(
        'recorded', profile.cgpa is not null,
        'facts', case when profile.cgpa is null
          then pg_catalog.jsonb_build_array('Not recorded')
          else pg_catalog.jsonb_build_array(
            pg_catalog.format('Current CGPA: %s / %s', profile.cgpa, profile.cgpa_scale),
            pg_catalog.format('Active backlogs: %s', profile.active_backlogs),
            pg_catalog.format('Cleared backlogs: %s', profile.cleared_backlogs),
            'Term-by-term academic consistency: Not recorded'
          ) end
      ),
      'intellectualProjects', private.global_readiness_count_evidence(facts.projects, 'Project / research records'),
      'intellectualDistinction', private.global_readiness_count_evidence(facts.distinctions, 'Publication / competition records'),
      'professionalExperience', private.global_readiness_count_evidence(facts.experience, 'Internship / work-experience records'),
      'professionalIndustry', pg_catalog.jsonb_build_object(
        'recorded', facts.certifications > 0,
        'facts', pg_catalog.jsonb_build_array(
          case when facts.certifications = 0 then 'Certifications: Not recorded'
            else pg_catalog.format('Certification records: %s', facts.certifications) end,
          'Industry-project classification: Not recorded'
        )
      ),
      'globalLeadership', private.global_readiness_count_evidence(facts.leadership, 'Leadership records'),
      'globalExposure', pg_catalog.jsonb_build_object('recorded', false, 'facts', pg_catalog.jsonb_build_array('Not recorded / no canonical record')),
      'globalDistinction', private.global_readiness_count_evidence(facts.service, 'Award, service or extracurricular records'),
      'applicationGmap', pg_catalog.jsonb_build_object('recorded', false, 'facts', pg_catalog.jsonb_build_array('Not recorded / no canonical G-MAP record')),
      'applicationAdvisory', pg_catalog.jsonb_build_object(
        'recorded', facts.consultations > 0 or facts.progression,
        'facts', case when facts.consultations = 0 and facts.progression is false
          then pg_catalog.jsonb_build_array('Not recorded')
          else pg_catalog.jsonb_build_array(
            pg_catalog.format('Consultation records: %s', facts.consultations),
            pg_catalog.format('Counseling progression recorded: %s', facts.progression)
          ) end
      ),
      'applicationDocuments', pg_catalog.jsonb_build_object(
        'recorded', facts.sop > 0 or facts.lor > 0,
        'facts', case when facts.sop = 0 and facts.lor = 0
          then pg_catalog.jsonb_build_array('Not recorded')
          else pg_catalog.jsonb_build_array(
            pg_catalog.format('Available SOP documents: %s', facts.sop),
            pg_catalog.format('Available LoR documents: %s', facts.lor)
          ) end
      ),
      'applicationShortlist', private.global_readiness_count_evidence(facts.shortlisted, 'Active university records'),
      'applicationSubmitted', private.global_readiness_count_evidence(facts.submitted, 'Submitted applications')
    )
  )
  from facts left join profile on true;
$function$;

alter function private.build_global_readiness_evidence_snapshot(uuid)
  owner to postgres;
revoke all on function private.build_global_readiness_evidence_snapshot(uuid)
  from public, anon, authenticated, service_role;

create table public.student_global_readiness_assessments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  revision_number integer not null check (revision_number >= 1),
  primary_assignment_id uuid not null
    references public.student_counselor_assignments(id) on delete restrict,
  assessed_by uuid not null references public.profiles(id) on delete restrict,
  rubric_version text not null default 'K-GEO-GMRI-1'
    check (rubric_version = 'K-GEO-GMRI-1'),

  academic_readiness_score integer not null check (academic_readiness_score between 0 and 15),
  intellectual_projects_score integer not null check (intellectual_projects_score between 0 and 10),
  intellectual_distinction_score integer not null check (intellectual_distinction_score between 0 and 10),
  professional_experience_score integer not null check (professional_experience_score between 0 and 10),
  professional_industry_score integer not null check (professional_industry_score between 0 and 5),
  global_leadership_score integer not null check (global_leadership_score between 0 and 5),
  global_exposure_score integer not null check (global_exposure_score between 0 and 5),
  global_distinction_score integer not null check (global_distinction_score between 0 and 5),
  application_gmap_score integer not null check (application_gmap_score between 0 and 5),
  application_advisory_score integer not null check (application_advisory_score between 0 and 5),
  application_documents_score integer not null check (application_documents_score between 0 and 10),
  application_shortlist_score integer not null check (application_shortlist_score between 0 and 10),
  application_submitted_score integer not null check (application_submitted_score between 0 and 5),

  academic_readiness_rationale text,
  intellectual_projects_rationale text,
  intellectual_distinction_rationale text,
  professional_experience_rationale text,
  professional_industry_rationale text,
  global_leadership_rationale text,
  global_exposure_rationale text,
  global_distinction_rationale text,
  application_gmap_rationale text,
  application_advisory_rationale text,
  application_documents_rationale text,
  application_shortlist_rationale text,
  application_submitted_rationale text,

  academic_readiness_total integer generated always as (academic_readiness_score) stored,
  intellectual_depth_total integer generated always as (
    intellectual_projects_score + intellectual_distinction_score
  ) stored,
  professional_readiness_total integer generated always as (
    professional_experience_score + professional_industry_score
  ) stored,
  global_leadership_total integer generated always as (
    global_leadership_score + global_exposure_score + global_distinction_score
  ) stored,
  application_strength_total integer generated always as (
    application_gmap_score + application_advisory_score
    + application_documents_score + application_shortlist_score
    + application_submitted_score
  ) stored,
  total_score integer generated always as (
    academic_readiness_score + intellectual_projects_score
    + intellectual_distinction_score + professional_experience_score
    + professional_industry_score + global_leadership_score
    + global_exposure_score + global_distinction_score
    + application_gmap_score + application_advisory_score
    + application_documents_score + application_shortlist_score
    + application_submitted_score
  ) stored,
  readiness_band public.global_readiness_band generated always as (
    case
      when academic_readiness_score + intellectual_projects_score
        + intellectual_distinction_score + professional_experience_score
        + professional_industry_score + global_leadership_score
        + global_exposure_score + global_distinction_score
        + application_gmap_score + application_advisory_score
        + application_documents_score + application_shortlist_score
        + application_submitted_score >= 85
        then 'global_distinction'::public.global_readiness_band
      when academic_readiness_score + intellectual_projects_score
        + intellectual_distinction_score + professional_experience_score
        + professional_industry_score + global_leadership_score
        + global_exposure_score + global_distinction_score
        + application_gmap_score + application_advisory_score
        + application_documents_score + application_shortlist_score
        + application_submitted_score >= 75
        then 'advanced_readiness'::public.global_readiness_band
      when academic_readiness_score + intellectual_projects_score
        + intellectual_distinction_score + professional_experience_score
        + professional_industry_score + global_leadership_score
        + global_exposure_score + global_distinction_score
        + application_gmap_score + application_advisory_score
        + application_documents_score + application_shortlist_score
        + application_submitted_score >= 65
        then 'competitive_readiness'::public.global_readiness_band
      when academic_readiness_score + intellectual_projects_score
        + intellectual_distinction_score + professional_experience_score
        + professional_industry_score + global_leadership_score
        + global_exposure_score + global_distinction_score
        + application_gmap_score + application_advisory_score
        + application_documents_score + application_shortlist_score
        + application_submitted_score >= 50
        then 'developing_readiness'::public.global_readiness_band
      else 'early_readiness'::public.global_readiness_band
    end
  ) stored,

  assessment_rationale text not null,
  parent_safe_summary text,
  evidence_schema_version integer not null default 1 check (evidence_schema_version = 1),
  evidence_snapshot jsonb not null,
  evidence_captured_at timestamptz not null,
  assessed_at timestamptz not null,
  created_at timestamptz not null,

  constraint student_global_readiness_student_revision_key
    unique (student_id, revision_number),
  constraint student_global_readiness_actor_check check (student_id <> assessed_by),
  constraint student_global_readiness_timestamp_check check (
    evidence_captured_at = assessed_at and created_at = assessed_at
  ),
  constraint student_global_readiness_snapshot_check check (
    pg_catalog.jsonb_typeof(evidence_snapshot) = 'object'
    and evidence_snapshot ->> 'schemaVersion' = '1'
    and pg_catalog.jsonb_typeof(evidence_snapshot -> 'criteria') = 'object'
  ),
  constraint student_global_readiness_overall_rationale_check check (
    pg_catalog.char_length(assessment_rationale) between 1 and 2000
    and assessment_rationale !~ '[[:cntrl:]]'
  ),
  constraint student_global_readiness_parent_summary_check check (
    parent_safe_summary is null or (
      pg_catalog.char_length(parent_safe_summary) between 1 and 1500
      and parent_safe_summary !~ '[[:cntrl:]]'
    )
  ),
  constraint student_global_readiness_academic_rationale_check check (
    private.is_valid_global_readiness_rationale(academic_readiness_score, evidence_snapshot, 'academicReadiness', academic_readiness_rationale)
  ),
  constraint student_global_readiness_projects_rationale_check check (
    private.is_valid_global_readiness_rationale(intellectual_projects_score, evidence_snapshot, 'intellectualProjects', intellectual_projects_rationale)
  ),
  constraint student_global_readiness_intellectual_distinction_rationale_check check (
    private.is_valid_global_readiness_rationale(intellectual_distinction_score, evidence_snapshot, 'intellectualDistinction', intellectual_distinction_rationale)
  ),
  constraint student_global_readiness_experience_rationale_check check (
    private.is_valid_global_readiness_rationale(professional_experience_score, evidence_snapshot, 'professionalExperience', professional_experience_rationale)
  ),
  constraint student_global_readiness_industry_rationale_check check (
    private.is_valid_global_readiness_rationale(professional_industry_score, evidence_snapshot, 'professionalIndustry', professional_industry_rationale)
  ),
  constraint student_global_readiness_leadership_rationale_check check (
    private.is_valid_global_readiness_rationale(global_leadership_score, evidence_snapshot, 'globalLeadership', global_leadership_rationale)
  ),
  constraint student_global_readiness_exposure_rationale_check check (
    private.is_valid_global_readiness_rationale(global_exposure_score, evidence_snapshot, 'globalExposure', global_exposure_rationale)
  ),
  constraint student_global_readiness_global_distinction_rationale_check check (
    private.is_valid_global_readiness_rationale(global_distinction_score, evidence_snapshot, 'globalDistinction', global_distinction_rationale)
  ),
  constraint student_global_readiness_gmap_rationale_check check (
    private.is_valid_global_readiness_rationale(application_gmap_score, evidence_snapshot, 'applicationGmap', application_gmap_rationale)
  ),
  constraint student_global_readiness_advisory_rationale_check check (
    private.is_valid_global_readiness_rationale(application_advisory_score, evidence_snapshot, 'applicationAdvisory', application_advisory_rationale)
  ),
  constraint student_global_readiness_documents_rationale_check check (
    private.is_valid_global_readiness_rationale(application_documents_score, evidence_snapshot, 'applicationDocuments', application_documents_rationale)
  ),
  constraint student_global_readiness_shortlist_rationale_check check (
    private.is_valid_global_readiness_rationale(application_shortlist_score, evidence_snapshot, 'applicationShortlist', application_shortlist_rationale)
  ),
  constraint student_global_readiness_submitted_rationale_check check (
    private.is_valid_global_readiness_rationale(application_submitted_score, evidence_snapshot, 'applicationSubmitted', application_submitted_rationale)
  )
);

alter table public.student_global_readiness_assessments owner to postgres;
alter table public.student_global_readiness_assessments enable row level security;
alter table public.student_global_readiness_assessments force row level security;
revoke all on table public.student_global_readiness_assessments
  from public, anon, authenticated, service_role;

create index student_global_readiness_latest_idx
  on public.student_global_readiness_assessments (
    student_id, revision_number desc, assessed_at desc, id desc
  );

create policy student_global_readiness_select_current_primary
on public.student_global_readiness_assessments
for select
to authenticated
using ((select public.is_active_primary_counselor_for_student(
  student_global_readiness_assessments.student_id
)));

create function public.protect_student_global_readiness_assessment_history()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using errcode = '42501',
    message = 'Global readiness assessment history is immutable';
end;
$function$;

alter function public.protect_student_global_readiness_assessment_history()
  owner to postgres;
revoke all on function public.protect_student_global_readiness_assessment_history()
  from public, anon, authenticated, service_role;

create trigger protect_student_global_readiness_assessment_history
before update or delete on public.student_global_readiness_assessments
for each row execute function public.protect_student_global_readiness_assessment_history();

create function public.get_primary_counselor_global_readiness_evidence(
  p_student_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;
  return private.build_global_readiness_evidence_snapshot(p_student_id);
end;
$function$;

alter function public.get_primary_counselor_global_readiness_evidence(uuid)
  owner to postgres;
revoke all on function public.get_primary_counselor_global_readiness_evidence(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_primary_counselor_global_readiness_evidence(uuid)
  to authenticated;

create function public.create_student_global_readiness_assessment(
  p_student_id uuid,
  p_academic_readiness_score integer,
  p_intellectual_projects_score integer,
  p_intellectual_distinction_score integer,
  p_professional_experience_score integer,
  p_professional_industry_score integer,
  p_global_leadership_score integer,
  p_global_exposure_score integer,
  p_global_distinction_score integer,
  p_application_gmap_score integer,
  p_application_advisory_score integer,
  p_application_documents_score integer,
  p_application_shortlist_score integer,
  p_application_submitted_score integer,
  p_academic_readiness_rationale text,
  p_intellectual_projects_rationale text,
  p_intellectual_distinction_rationale text,
  p_professional_experience_rationale text,
  p_professional_industry_rationale text,
  p_global_leadership_rationale text,
  p_global_exposure_rationale text,
  p_global_distinction_rationale text,
  p_application_gmap_rationale text,
  p_application_advisory_rationale text,
  p_application_documents_rationale text,
  p_application_shortlist_rationale text,
  p_application_submitted_rationale text,
  p_assessment_rationale text,
  p_parent_safe_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_counselor_id uuid := (select auth.uid());
  v_assignment_id uuid;
  v_revision integer;
  v_snapshot jsonb;
  v_assessment_id uuid;
  v_total integer;
  v_band public.global_readiness_band;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_counselor_id is null then
    raise exception using errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  -- The Student profile is the shared reassignment lock root. This also
  -- serializes concurrent readiness revisions for one Student.
  perform 1
  from public.profiles as student_profile
  where student_profile.id = p_student_id
    and student_profile.role = 'student'::public.user_role
  for update;
  if not found then
    raise exception using errcode = '23514',
      message = 'Global readiness Student is invalid';
  end if;

  if public.is_active_primary_counselor_for_student(p_student_id)
    is distinct from true then
    raise exception using errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  select assignment.id
  into v_assignment_id
  from public.student_counselor_assignments as assignment
  where assignment.student_id = p_student_id
    and assignment.counselor_id = v_counselor_id
    and assignment.ended_at is null;
  if v_assignment_id is null then
    raise exception using errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  select coalesce(pg_catalog.max(assessment.revision_number), 0) + 1
  into v_revision
  from public.student_global_readiness_assessments as assessment
  where assessment.student_id = p_student_id;

  v_snapshot := private.build_global_readiness_evidence_snapshot(p_student_id);

  insert into public.student_global_readiness_assessments (
    student_id, revision_number, primary_assignment_id, assessed_by,
    academic_readiness_score, intellectual_projects_score,
    intellectual_distinction_score, professional_experience_score,
    professional_industry_score, global_leadership_score,
    global_exposure_score, global_distinction_score,
    application_gmap_score, application_advisory_score,
    application_documents_score, application_shortlist_score,
    application_submitted_score, academic_readiness_rationale,
    intellectual_projects_rationale, intellectual_distinction_rationale,
    professional_experience_rationale, professional_industry_rationale,
    global_leadership_rationale, global_exposure_rationale,
    global_distinction_rationale, application_gmap_rationale,
    application_advisory_rationale, application_documents_rationale,
    application_shortlist_rationale, application_submitted_rationale,
    assessment_rationale, parent_safe_summary, evidence_snapshot,
    evidence_captured_at, assessed_at, created_at
  ) values (
    p_student_id, v_revision, v_assignment_id, v_counselor_id,
    p_academic_readiness_score, p_intellectual_projects_score,
    p_intellectual_distinction_score, p_professional_experience_score,
    p_professional_industry_score, p_global_leadership_score,
    p_global_exposure_score, p_global_distinction_score,
    p_application_gmap_score, p_application_advisory_score,
    p_application_documents_score, p_application_shortlist_score,
    p_application_submitted_score,
    private.normalize_global_readiness_text(p_academic_readiness_rationale, 1000, false),
    private.normalize_global_readiness_text(p_intellectual_projects_rationale, 1000, false),
    private.normalize_global_readiness_text(p_intellectual_distinction_rationale, 1000, false),
    private.normalize_global_readiness_text(p_professional_experience_rationale, 1000, false),
    private.normalize_global_readiness_text(p_professional_industry_rationale, 1000, false),
    private.normalize_global_readiness_text(p_global_leadership_rationale, 1000, false),
    private.normalize_global_readiness_text(p_global_exposure_rationale, 1000, false),
    private.normalize_global_readiness_text(p_global_distinction_rationale, 1000, false),
    private.normalize_global_readiness_text(p_application_gmap_rationale, 1000, false),
    private.normalize_global_readiness_text(p_application_advisory_rationale, 1000, false),
    private.normalize_global_readiness_text(p_application_documents_rationale, 1000, false),
    private.normalize_global_readiness_text(p_application_shortlist_rationale, 1000, false),
    private.normalize_global_readiness_text(p_application_submitted_rationale, 1000, false),
    private.normalize_global_readiness_text(p_assessment_rationale, 2000, true),
    private.normalize_global_readiness_text(p_parent_safe_summary, 1500, false),
    v_snapshot, v_now, v_now, v_now
  ) returning id, total_score, readiness_band
  into v_assessment_id, v_total, v_band;

  return pg_catalog.jsonb_build_object(
    'assessmentId', v_assessment_id,
    'revisionNumber', v_revision,
    'totalScore', v_total,
    'readinessBand', v_band,
    'assessedAt', v_now
  );
end;
$function$;

alter function public.create_student_global_readiness_assessment(
  uuid,
  integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, integer,
  text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) owner to postgres;
revoke all on function public.create_student_global_readiness_assessment(
  uuid,
  integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, integer,
  text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_student_global_readiness_assessment(
  uuid,
  integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, integer,
  text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) to authenticated;

create function public.list_primary_counselor_global_readiness_assessments(
  p_student_id uuid,
  p_limit integer default 20
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using errcode = '22023',
      message = 'Global readiness history request is invalid';
  end if;
  if (select auth.uid()) is null
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  return query
  select pg_catalog.jsonb_build_object(
    'assessmentId', assessment.id,
    'revisionNumber', assessment.revision_number,
    'rubricVersion', assessment.rubric_version,
    'scores', pg_catalog.jsonb_build_object(
      'academicReadiness', assessment.academic_readiness_score,
      'intellectualProjects', assessment.intellectual_projects_score,
      'intellectualDistinction', assessment.intellectual_distinction_score,
      'professionalExperience', assessment.professional_experience_score,
      'professionalIndustry', assessment.professional_industry_score,
      'globalLeadership', assessment.global_leadership_score,
      'globalExposure', assessment.global_exposure_score,
      'globalDistinction', assessment.global_distinction_score,
      'applicationGmap', assessment.application_gmap_score,
      'applicationAdvisory', assessment.application_advisory_score,
      'applicationDocuments', assessment.application_documents_score,
      'applicationShortlist', assessment.application_shortlist_score,
      'applicationSubmitted', assessment.application_submitted_score
    ),
    'rationales', pg_catalog.jsonb_build_object(
      'academicReadiness', assessment.academic_readiness_rationale,
      'intellectualProjects', assessment.intellectual_projects_rationale,
      'intellectualDistinction', assessment.intellectual_distinction_rationale,
      'professionalExperience', assessment.professional_experience_rationale,
      'professionalIndustry', assessment.professional_industry_rationale,
      'globalLeadership', assessment.global_leadership_rationale,
      'globalExposure', assessment.global_exposure_rationale,
      'globalDistinction', assessment.global_distinction_rationale,
      'applicationGmap', assessment.application_gmap_rationale,
      'applicationAdvisory', assessment.application_advisory_rationale,
      'applicationDocuments', assessment.application_documents_rationale,
      'applicationShortlist', assessment.application_shortlist_rationale,
      'applicationSubmitted', assessment.application_submitted_rationale
    ),
    'dimensionTotals', pg_catalog.jsonb_build_object(
      'academicReadiness', assessment.academic_readiness_total,
      'intellectualDepth', assessment.intellectual_depth_total,
      'professionalReadiness', assessment.professional_readiness_total,
      'globalLeadershipProfile', assessment.global_leadership_total,
      'applicationStrength', assessment.application_strength_total
    ),
    'totalScore', assessment.total_score,
    'readinessBand', assessment.readiness_band,
    'assessmentRationale', assessment.assessment_rationale,
    'parentSafeSummary', assessment.parent_safe_summary,
    'evidenceSchemaVersion', assessment.evidence_schema_version,
    'evidenceSnapshot', assessment.evidence_snapshot,
    'evidenceCapturedAt', assessment.evidence_captured_at,
    'assessorFullName', coalesce(
      nullif(pg_catalog.btrim(counselor.full_name), ''),
      'Counselor'
    ),
    'assessedAt', assessment.assessed_at
  )
  from public.student_global_readiness_assessments as assessment
  inner join public.profiles as counselor on counselor.id = assessment.assessed_by
  where assessment.student_id = p_student_id
  order by assessment.revision_number desc, assessment.assessed_at desc, assessment.id desc
  limit p_limit;
end;
$function$;

alter function public.list_primary_counselor_global_readiness_assessments(uuid, integer)
  owner to postgres;
revoke all on function public.list_primary_counselor_global_readiness_assessments(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_primary_counselor_global_readiness_assessments(uuid, integer)
  to authenticated;

create function public.get_primary_counselor_latest_global_readiness_assessment(
  p_student_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_latest jsonb;
begin
  if (select auth.uid()) is null
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  select history.value into v_latest
  from public.list_primary_counselor_global_readiness_assessments(
    p_student_id,
    1
  ) as history(value);
  return v_latest;
end;
$function$;

alter function public.get_primary_counselor_latest_global_readiness_assessment(uuid)
  owner to postgres;
revoke all on function public.get_primary_counselor_latest_global_readiness_assessment(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_primary_counselor_latest_global_readiness_assessment(uuid)
  to authenticated;

comment on table public.student_global_readiness_assessments is
  'Sealed immutable K-GEO Global Master''s Readiness Index revisions authored only by the Student''s current Primary Counselor.';
comment on function private.build_global_readiness_evidence_snapshot(uuid) is
  'Builds bounded evidence without private notes, follow-ups, Storage paths, signed URLs, document contents, or G-MAP inference.';

commit;

-- >>> supabase/migrations/202609020002_student_achievement_evidence.sql
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

-- >>> supabase/migrations/202609180001_director_student_profile_detail.sql
-- Complete read-only Director Student 360 projections.
-- No function below grants mutation privileges or returns private Counselor data.

begin;

create function public.get_director_student_identity(p_student_id uuid)
returns table (
  student_id uuid,
  full_name text,
  college_email text,
  account_created_at timestamptz,
  is_active boolean
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Director student profile is temporarily unavailable.';
  end if;
  return query
  select profile.id, profile.full_name, profile.college_email,
    profile.created_at, profile.is_active
  from public.profiles as profile
  where profile.id = p_student_id
    and profile.role = 'student'::public.user_role;
end;
$function$;

create function public.list_director_student_achievement_documents(
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
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Achievement evidence is temporarily unavailable.';
  end if;
  return query
  select document.id, document.achievement_id, document.document_name,
    document.mime_type, document.file_size_bytes, document.status,
    document.prepared_at, document.upload_expires_at, document.available_at
  from public.student_achievement_documents as document
  where document.student_id = p_student_id
    and document.status = 'available'::public.student_achievement_document_status
  order by document.available_at desc, document.id desc
  limit 500;
end;
$function$;

create function public.authorize_director_student_achievement_document_view(
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
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Achievement evidence could not be opened.';
  end if;
  return query
  select document.id, document.bucket_id, document.storage_path,
    document.mime_type
  from public.student_achievement_documents as document
  where document.id = p_document_id
    and document.achievement_id = p_achievement_id
    and document.student_id = p_student_id
    and document.status = 'available'::public.student_achievement_document_status
  limit 1;
end;
$function$;

create function public.list_director_student_profile_documents(
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
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
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
  limit 500;
end;
$function$;

create function public.authorize_director_student_profile_document_view(
  p_student_id uuid,
  p_document_id uuid
)
returns table (
  document_id uuid,
  bucket_id text,
  storage_path text,
  mime_type text
)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
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
end;
$function$;

create function public.get_director_student_case_detail(p_student_id uuid)
returns table (payload jsonb)
language plpgsql stable security definer set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role('director'::public.user_role)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Director Student 360 is temporarily unavailable.';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = p_student_id
      and profile.role = 'student'::public.user_role
  ) then
    return;
  end if;

  return query select pg_catalog.jsonb_build_object(
    'progress', pg_catalog.jsonb_build_object(
      'current', (
        select pg_catalog.jsonb_build_object(
          'currentStage', progression.current_stage,
          'workflowState', progression.workflow_state,
          'stageStartedAt', progression.stage_started_at,
          'lastChangedAt', progression.last_changed_at
        )
        from public.student_counseling_progressions as progression
        where progression.student_id = p_student_id
      ),
      'history', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'eventId', event.id,
          'previousStage', event.previous_stage,
          'newStage', event.new_stage,
          'previousState', event.previous_state,
          'newState', event.new_state,
          'changedAt', event.changed_at
        ) order by event.changed_at desc, event.id desc)
        from (
          select history.*
          from public.student_counseling_progression_events as history
          where history.student_id = p_student_id
          order by history.changed_at desc, history.id desc limit 50
        ) as event
      ), '[]'::jsonb),
      'semesterSummaries', coalesce((
        select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'summaryId', summary.id,
          'academicPeriod', summary.academic_period,
          'progressSummary', summary.progress_summary,
          'achievementsHighlights', summary.achievements_highlights,
          'areasRequiringAttention', summary.areas_requiring_attention,
          'nextSemesterActions', summary.next_semester_actions,
          'counselorFullName', coalesce(counselor.full_name, 'Counselor'),
          'createdAt', summary.created_at
        ) order by summary.created_at desc, summary.id desc)
        from (
          select semester.*
          from public.counselor_student_semester_summaries as semester
          where semester.student_id = p_student_id
          order by semester.created_at desc, semester.id desc limit 20
        ) as summary
        inner join public.profiles as counselor on counselor.id = summary.created_by
      ), '[]'::jsonb)
    ),
    'applications', coalesce((
      select pg_catalog.jsonb_agg(application_payload.payload
        order by application_payload.last_changed_at desc,
          application_payload.application_id desc)
      from (
        select application.id as application_id, application.last_changed_at,
          pg_catalog.jsonb_build_object(
            'applicationId', application.id,
            'universityName', application.university_name,
            'programmeName', application.programme_name,
            'countryCode', application.country_code,
            'degreeLevel', application.degree_level,
            'intakeTerm', application.intake_term,
            'intakeYear', application.intake_year,
            'applicationStatus', application.current_status,
            'submissionDeadline', application.submission_deadline,
            'submittedAt', application.submitted_at,
            'isPrimary', application.is_primary,
            'isArchived', application.is_archived,
            'lastChangedAt', application.last_changed_at,
            'journey', pg_catalog.jsonb_build_object(
              'universityDecision', coalesce(journey.university_decision,
                'pending'::public.university_application_decision),
              'universityDecisionDate', journey.university_decision_date,
              'offerStatus', coalesce(journey.offer_status,
                'none'::public.university_application_offer_status),
              'offerDate', journey.offer_date,
              'conditionalOfferRequirements', journey.conditional_offer_requirements,
              'conditionDueDate', journey.condition_due_date,
              'conditionsSatisfiedDate', journey.conditions_satisfied_date,
              'studentDecision', coalesce(journey.student_decision,
                'pending'::public.university_application_student_decision),
              'studentDecisionDate', journey.student_decision_date,
              'feeStatus', coalesce(journey.fee_status,
                'not_started'::public.university_application_fee_status),
              'feePaymentDate', journey.fee_payment_date,
              'visaStatus', coalesce(journey.visa_status,
                'not_started'::public.university_application_visa_status),
              'visaSubmissionDate', journey.visa_submission_date,
              'visaDecisionDate', journey.visa_decision_date,
              'enrollmentStatus', coalesce(journey.enrollment_status,
                'not_enrolled'::public.university_application_enrollment_status),
              'enrollmentDate', journey.enrollment_date,
              'versionNumber', coalesce(journey.version_number, 0),
              'updatedAt', journey.updated_at
            ),
            'history', coalesce((
              select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
                'eventId', event.id,
                'versionNumber', event.version_number,
                'universityDecision', event.university_decision,
                'offerStatus', event.offer_status,
                'studentDecision', event.student_decision,
                'feeStatus', event.fee_status,
                'visaStatus', event.visa_status,
                'enrollmentStatus', event.enrollment_status,
                'changedAt', event.changed_at
              ) order by event.version_number desc, event.id desc)
              from (
                select journey_event.*
                from public.student_university_application_journey_events
                  as journey_event
                where journey_event.application_id = application.id
                order by journey_event.version_number desc,
                  journey_event.changed_at desc, journey_event.id desc limit 20
              ) as event
            ), '[]'::jsonb)
          ) as payload
        from public.student_university_applications as application
        left join public.student_university_application_journeys as journey
          on journey.application_id = application.id
        where application.student_id = p_student_id
        order by application.last_changed_at desc, application.id desc limit 100
      ) as application_payload
    ), '[]'::jsonb),
    'readinessAssessments', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'assessmentId', assessment.id,
        'revisionNumber', assessment.revision_number,
        'rubricVersion', assessment.rubric_version,
        'scores', pg_catalog.jsonb_build_object(
          'academicReadiness', assessment.academic_readiness_score,
          'intellectualProjects', assessment.intellectual_projects_score,
          'intellectualDistinction', assessment.intellectual_distinction_score,
          'professionalExperience', assessment.professional_experience_score,
          'professionalIndustry', assessment.professional_industry_score,
          'globalLeadership', assessment.global_leadership_score,
          'globalExposure', assessment.global_exposure_score,
          'globalDistinction', assessment.global_distinction_score,
          'applicationGmap', assessment.application_gmap_score,
          'applicationAdvisory', assessment.application_advisory_score,
          'applicationDocuments', assessment.application_documents_score,
          'applicationShortlist', assessment.application_shortlist_score,
          'applicationSubmitted', assessment.application_submitted_score
        ),
        'rationales', pg_catalog.jsonb_build_object(
          'academicReadiness', assessment.academic_readiness_rationale,
          'intellectualProjects', assessment.intellectual_projects_rationale,
          'intellectualDistinction', assessment.intellectual_distinction_rationale,
          'professionalExperience', assessment.professional_experience_rationale,
          'professionalIndustry', assessment.professional_industry_rationale,
          'globalLeadership', assessment.global_leadership_rationale,
          'globalExposure', assessment.global_exposure_rationale,
          'globalDistinction', assessment.global_distinction_rationale,
          'applicationGmap', assessment.application_gmap_rationale,
          'applicationAdvisory', assessment.application_advisory_rationale,
          'applicationDocuments', assessment.application_documents_rationale,
          'applicationShortlist', assessment.application_shortlist_rationale,
          'applicationSubmitted', assessment.application_submitted_rationale
        ),
        'dimensionTotals', pg_catalog.jsonb_build_object(
          'academicReadiness', assessment.academic_readiness_total,
          'intellectualDepth', assessment.intellectual_depth_total,
          'professionalReadiness', assessment.professional_readiness_total,
          'globalLeadershipProfile', assessment.global_leadership_total,
          'applicationStrength', assessment.application_strength_total
        ),
        'totalScore', assessment.total_score,
        'readinessBand', assessment.readiness_band,
        'assessmentRationale', assessment.assessment_rationale,
        'parentSafeSummary', assessment.parent_safe_summary,
        'evidenceSchemaVersion', assessment.evidence_schema_version,
        'evidenceSnapshot', assessment.evidence_snapshot,
        'evidenceCapturedAt', assessment.evidence_captured_at,
        'assessorFullName', coalesce(counselor.full_name, 'Counselor'),
        'assessedAt', assessment.assessed_at
      ) order by assessment.revision_number desc, assessment.id desc)
      from (
        select readiness.*
        from public.student_global_readiness_assessments as readiness
        where readiness.student_id = p_student_id
        order by readiness.revision_number desc, readiness.id desc limit 20
      ) as assessment
      inner join public.profiles as counselor on counselor.id = assessment.assessed_by
    ), '[]'::jsonb),
    'consultations', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'consultationId', consultation.id,
        'requestNumber', consultation.request_number,
        'consultationDate', consultation.consultation_date,
        'slotStart', consultation.slot_start,
        'slotEnd', consultation.slot_end,
        'status', consultation.status,
        'counselorFullName', counselor.full_name,
        'outcomeRecordedAt', consultation.outcome_recorded_at,
        'submittedAt', consultation.submitted_at
      ) order by consultation.submitted_at desc, consultation.id desc)
      from (
        select request.*
        from public.consultation_requests as request
        where request.student_id = p_student_id
        order by request.submitted_at desc, request.id desc limit 100
      ) as consultation
      left join public.profiles as counselor
        on counselor.id = consultation.assigned_counselor_id
        and counselor.role = 'counselor'::public.user_role
    ), '[]'::jsonb),
    'primaryCounselor', (
      select pg_catalog.jsonb_build_object(
        'assignmentId', assignment.id,
        'counselorId', counselor.id,
        'fullName', counselor.full_name,
        'collegeEmail', counselor.college_email,
        'assignedAt', assignment.assigned_at,
        'status', 'active'
      )
      from public.student_counselor_assignments as assignment
      inner join public.profiles as counselor
        on counselor.id = assignment.counselor_id
        and counselor.role = 'counselor'::public.user_role
      where assignment.student_id = p_student_id
        and assignment.ended_at is null
      limit 1
    ),
    'parentReports', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'reportId', report.id,
        'academicPeriod', report.academic_period,
        'versionNumber', report.version_number,
        'status', report.status,
        'updatedAt', report.updated_at,
        'finalizedAt', report.finalized_at,
        'finalPdfAvailable', report.final_pdf_storage_path is not null
      ) order by report.updated_at desc, report.id desc)
      from (
        select parent_report.*
        from public.parent_reports as parent_report
        where parent_report.student_id = p_student_id
        order by parent_report.updated_at desc, parent_report.id desc limit 50
      ) as report
    ), '[]'::jsonb)
  );
end;
$function$;

do $function_contract$
declare
  v_signature text;
begin
  foreach v_signature in array array[
    'get_director_student_identity(uuid)',
    'list_director_student_achievement_documents(uuid)',
    'authorize_director_student_achievement_document_view(uuid,uuid,uuid)',
    'list_director_student_profile_documents(uuid)',
    'authorize_director_student_profile_document_view(uuid,uuid)',
    'get_director_student_case_detail(uuid)'
  ]::text[] loop
    execute pg_catalog.format(
      'alter function public.%s owner to postgres', v_signature
    );
    execute pg_catalog.format(
      'revoke all on function public.%s from public, anon, authenticated, service_role',
      v_signature
    );
    execute pg_catalog.format(
      'grant execute on function public.%s to authenticated', v_signature
    );
  end loop;
end;
$function_contract$;

comment on function public.get_director_student_case_detail(uuid) is
  'Bounded read-only Director Student 360 projection. Excludes private notes, follow-ups, actor identifiers, Storage paths, and signed URLs.';

commit;

-- >>> supabase/migrations/202609210001_student_preference_courses_and_field.sql
-- K-GEO student preferences: Preferred Courses and Field of Study Preference.
--
-- Adds the two preferences the Personal Recommendation intake already asks for,
-- so a student can record them once on My Profile and the PR intake can be
-- pre-filled from here instead of re-asking.
--
--   preferred_courses  degree programmes the student is considering. Bounded
--                      and canonicalised by the same validator as
--                      preferred_countries / preferred_program_areas.
--   same_as_ug         true  = continue in the undergraduate field of study
--                      false = explore a different field
--                      null  = not answered yet
--
-- Safe to run on a database built from these migrations AND on one where
-- `same_as_ug` was already added by hand (it exists on the live K-GEO project
-- without a migration). Every step is conditional, so the file can also be
-- re-run without error.
--
-- No row data is modified. Nothing is granted to anon or PUBLIC.

begin;

alter table public.student_preferences
  add column if not exists preferred_courses text[]
    constraint student_preferences_courses_not_null not null
    default '{}'::text[],
  add column if not exists same_as_ug boolean;

-- Align a hand-added same_as_ug with this contract: an unanswered question is
-- null, so the column must be nullable and must not default to an answer.
-- Existing values are left exactly as they are.
alter table public.student_preferences
  alter column same_as_ug drop not null,
  alter column same_as_ug drop default;

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint as existing
    where existing.conname = 'student_preferences_courses_check'
      and existing.conrelid = 'public.student_preferences'::pg_catalog.regclass
  ) then
    alter table public.student_preferences
      add constraint student_preferences_courses_check
        check (
          public.is_valid_student_profile_text_array(
            preferred_courses,
            10,
            120
          )
        );
  end if;
end;
$migration$;

comment on column public.student_preferences.preferred_courses is
  'Student-selected degree programmes, max 10, each 1-120 trimmed characters, case-insensitively unique.';

comment on column public.student_preferences.same_as_ug is
  'Field of Study Preference: true continues the undergraduate field, false explores a different field, null is unanswered.';

-- Column grants are idempotent. They are required for same_as_ug as well:
-- a hand-added column is not covered by the original column-level grants.
grant insert (preferred_courses, same_as_ug)
  on public.student_preferences to authenticated;

grant update (preferred_courses, same_as_ug)
  on public.student_preferences to authenticated;

commit;

