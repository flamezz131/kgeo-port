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
