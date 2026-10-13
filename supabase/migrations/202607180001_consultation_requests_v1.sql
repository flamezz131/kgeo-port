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
