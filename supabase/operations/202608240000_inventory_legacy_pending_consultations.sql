-- READ-ONLY inventory for the automatic-allocation cutover.
-- Returns no Student/Auth identity and performs no mutation.

with legacy_rows as (
  select
    request.id,
    request.request_number,
    request.status,
    request.consultation_date,
    request.slot_start,
    request.slot_end,
    request.assigned_counselor_id,
    request.assigned_at,
    request.outcome_recorded_at,
    request.outcome_recorded_by,
    request.cancelled_at,
    request.cancelled_by,
    request.cancellation_reason
  from public.consultation_requests as request
  where request.status in (
    'submitted'::public.consultation_status,
    'waiting_for_assignment'::public.consultation_status,
    'counselor_assigned'::public.consultation_status
  )
)
select
  legacy.request_number,
  legacy.status::text as status,
  legacy.consultation_date,
  legacy.slot_start,
  legacy.slot_end,
  legacy.assigned_counselor_id is not null as has_assigned_counselor,
  legacy.assigned_at is not null as has_assigned_at,
  legacy.outcome_recorded_at is not null
    or legacy.outcome_recorded_by is not null as has_recorded_outcome,
  legacy.cancelled_at is not null
    or legacy.cancelled_by is not null
    or legacy.cancellation_reason is not null as has_cancellation_audit,
  (
    select pg_catalog.count(*)
    from public.counselor_student_notes as note
    where note.consultation_id = legacy.id
  ) as private_note_dependencies,
  (
    select pg_catalog.count(*)
    from public.counselor_follow_ups as follow_up
    where follow_up.consultation_id = legacy.id
  ) as follow_up_dependencies
from legacy_rows as legacy
order by legacy.request_number;

select
  request.request_number,
  request.status::text as status,
  request.consultation_date,
  request.slot_start,
  request.slot_end
from public.consultation_requests as request
where request.request_number = 'KGEOC-2026-000005';
