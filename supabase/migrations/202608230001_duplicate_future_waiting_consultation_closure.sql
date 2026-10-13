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
