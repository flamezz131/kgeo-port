begin transaction read only;

with prerequisite_state as (
  select
    (
      select pg_catalog.count(*)
      from public.get_kgeo_consultation_slot_catalog()
    ) as slot_count,
    exists (
      select 1
      from pg_catalog.pg_indexes as index_record
      where index_record.schemaname = 'public'
        and index_record.tablename = 'consultation_requests'
        and index_record.indexname =
          'consultation_requests_active_slot_key'
    ) as active_slot_index_exists,
    exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.consultation_requests'::pg_catalog.regclass
        and trigger_record.tgname =
          'consultation_requests_prepare_insert'
        and trigger_record.tgisinternal is false
    ) as prepare_trigger_exists,
    coalesce((
      select trigger_record.tgenabled::text
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.consultation_requests'::pg_catalog.regclass
        and trigger_record.tgname =
          'consultation_requests_prepare_insert'
        and trigger_record.tgisinternal is false
    ), 'MISSING') as prepare_trigger_state,
    exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.consultation_requests'::pg_catalog.regclass
        and trigger_record.tgname =
          'consultation_requests_prepare_insert'
        and trigger_record.tgenabled = 'O'
        and trigger_record.tgisinternal is false
    ) as prepare_trigger_normally_enabled,
    exists (
      select 1
      from pg_catalog.pg_attribute as attribute_record
      where attribute_record.attrelid =
          'public.student_counselor_assignments'::pg_catalog.regclass
        and attribute_record.attname = 'assigned_by'
        and attribute_record.attisdropped is false
    ) as assigned_by_exists,
    exists (
      select 1
      from public.student_counselor_assignments as existing_assignment
      where existing_assignment.assigned_by is null
    ) as assigned_by_null_row_exists
), evaluated_state as (
  select
    prerequisite_state.*,
    prerequisite_state.slot_count <> 16
      or not prerequisite_state.active_slot_index_exists
      or not prerequisite_state.prepare_trigger_normally_enabled
      or not prerequisite_state.assigned_by_exists
      or prerequisite_state.assigned_by_null_row_exists
      as automatic_allocation_prerequisite_would_reject
  from prerequisite_state
)
select
  evaluated_state.slot_count,
  evaluated_state.active_slot_index_exists,
  evaluated_state.prepare_trigger_exists,
  evaluated_state.prepare_trigger_state,
  evaluated_state.prepare_trigger_normally_enabled,
  evaluated_state.assigned_by_exists,
  evaluated_state.assigned_by_null_row_exists,
  evaluated_state.automatic_allocation_prerequisite_would_reject
from evaluated_state;

rollback;
