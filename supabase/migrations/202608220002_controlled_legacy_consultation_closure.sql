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
