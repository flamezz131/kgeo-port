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
