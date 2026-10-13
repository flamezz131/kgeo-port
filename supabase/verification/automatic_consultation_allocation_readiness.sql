-- Read-only post-application verification for the final automatic consultation
-- booking and Counselor allocation cutover. This script performs no mutations.

with checks(check_name, passed, details) as (
  values
    (
      'AUTOMATIC_BOOKING_RPC',
      pg_catalog.to_regprocedure(
        'public.book_student_consultation(text,text,text,integer,text,text,text,public.higher_studies_interest,date,time without time zone)'
      ) is not null,
      'exact Student booking/allocation signature is installed'
    ),
    (
      'AUTOMATIC_BOOKING_DOES_NOT_ACTIVATE_PRIMARY',
      pg_catalog.to_regprocedure(
        'public.book_student_consultation(text,text,text,integer,text,text,text,public.higher_studies_interest,date,time without time zone)'
      ) is not null
      and pg_catalog.strpos(
        pg_catalog.lower(
          pg_catalog.pg_get_functiondef(
            'public.book_student_consultation(text,text,text,integer,text,text,text,public.higher_studies_interest,date,time without time zone)'::pg_catalog.regprocedure
          )
        ),
        'insert into public.student_counselor_assignments'
      ) = 0,
      'booking schedules an assigned consultation without activating a Primary case'
    ),
    (
      'MULTIPLE_CONSULTATIONS_WITH_EXACT_STUDENT_SLOT_PROTECTION',
      exists (
        select 1
        from pg_catalog.pg_indexes as index_record
        where index_record.schemaname = 'public'
          and index_record.tablename = 'consultation_requests'
          and index_record.indexname =
            'consultation_requests_active_student_slot_key'
          and index_record.indexdef ilike 'create unique index%'
          and index_record.indexdef ilike
            '%(student_id, consultation_date, slot_start)%'
          and index_record.indexdef ilike '%status <>%cancelled%'
      )
      and pg_catalog.pg_get_functiondef(
        'public.book_student_consultation(text,text,text,integer,text,text,text,public.higher_studies_interest,date,time without time zone)'::pg_catalog.regprocedure
      ) not ilike '%active or upcoming consultation%'
      and pg_catalog.pg_get_functiondef(
        'public.prepare_consultation_request_insert()'::pg_catalog.regprocedure
      ) not ilike '%active or upcoming consultation%'
      and pg_catalog.pg_get_functiondef(
        'public.get_consultation_slot_availability(date)'::pg_catalog.regprocedure
      ) ilike '%student_booking.student_id = v_student_id%'
      and pg_catalog.pg_get_functiondef(
        'public.get_consultation_slot_availability(date)'::pg_catalog.regprocedure
      ) ilike '%student_booking.status <>%cancelled%',
      'Students may hold multiple consultations while exact non-cancelled Student date/start duplicates remain impossible'
    ),
    (
      'CONTINUE_WITH_KGEO_RPC',
      pg_catalog.to_regprocedure(
        'public.continue_with_kgeo()'
      ) is not null
      and pg_catalog.has_function_privilege(
        'authenticated',
        'public.continue_with_kgeo()',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'anon',
        'public.continue_with_kgeo()',
        'EXECUTE'
      )
      and pg_catalog.pg_get_functiondef(
        'public.continue_with_kgeo()'::pg_catalog.regprocedure
      ) ilike '%request.student_id = v_student_id%'
      and pg_catalog.pg_get_functiondef(
        'public.continue_with_kgeo()'::pg_catalog.regprocedure
      ) ilike '%request.status = ''completed''%'
      and pg_catalog.pg_get_functiondef(
        'public.continue_with_kgeo()'::pg_catalog.regprocedure
      ) ilike '%order by%request.consultation_date desc%request.slot_end desc%request.id desc%'
      and pg_catalog.pg_get_functiondef(
        'public.continue_with_kgeo()'::pg_catalog.regprocedure
      ) not ilike '%p_counselor_id%'
      and pg_catalog.pg_get_functiondef(
        'public.continue_with_kgeo()'::pg_catalog.regprocedure
      ) not ilike '%p_student_id%',
      'Student-only continuation derives the latest eligible completed consultation Counselor without caller-selected identities'
    ),
    (
      'STUDENT_AVAILABILITY_IS_NON_DIAGNOSTIC',
      pg_catalog.pg_get_function_result(
        'public.get_consultation_slot_availability(date)'::pg_catalog.regprocedure
      ) ilike '%availability_status text%'
      and pg_catalog.pg_get_functiondef(
        'public.get_consultation_slot_availability(date)'::pg_catalog.regprocedure
      ) ilike '%else ''unavailable''::text%'
      and pg_catalog.pg_get_functiondef(
        'public.get_consultation_slot_availability(date)'::pg_catalog.regprocedure
      ) not ilike '%''booked''%',
      'Student availability exposes only available, unavailable, and expired'
    ),
    (
      'COUNSELOR_BLOCK_RPCS',
      pg_catalog.to_regprocedure(
        'public.block_my_consultation_slot(date,time without time zone,text)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'public.release_my_consultation_slot_block(uuid)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'public.list_my_active_consultation_slot_blocks()'
      ) is not null,
      'own-slot block, release, and list RPCs are installed'
    ),
    (
      'COUNSELOR_SAFE_PROJECTIONS',
      pg_catalog.to_regprocedure(
        'public.list_my_assigned_consultations(date,date,integer)'
      ) is not null
      and pg_catalog.to_regprocedure(
        'public.get_my_consultation_dashboard_metrics()'
      ) is not null,
      'assigned-session and aggregate Counselor projections are installed'
    ),
    (
      'BLOCK_TABLE_SEALED',
      exists (
        select 1
        from pg_catalog.pg_class as relation
        inner join pg_catalog.pg_namespace as namespace
          on namespace.oid = relation.relnamespace
        where namespace.nspname = 'public'
          and relation.relname = 'counselor_consultation_slot_blocks'
          and relation.relkind = 'r'
          and relation.relrowsecurity is true
          and relation.relforcerowsecurity is true
          and pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'
      )
      and not pg_catalog.has_table_privilege(
        'anon',
        'public.counselor_consultation_slot_blocks',
        'SELECT,INSERT,UPDATE,DELETE'
      )
      and not pg_catalog.has_table_privilege(
        'authenticated',
        'public.counselor_consultation_slot_blocks',
        'SELECT,INSERT,UPDATE,DELETE'
      ),
      'block history is postgres-owned, forced-RLS, and inaccessible directly'
    ),
    (
      'BLOCK_HISTORY_AND_UNIQUENESS',
      exists (
        select 1
        from pg_catalog.pg_trigger as trigger_record
        where trigger_record.tgrelid =
            'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
          and trigger_record.tgname =
            'protect_counselor_consultation_slot_block_history'
          and trigger_record.tgenabled = 'O'
          and trigger_record.tgisinternal is false
      )
      and exists (
        select 1
        from pg_catalog.pg_indexes as index_record
        where index_record.schemaname = 'public'
          and index_record.tablename =
            'counselor_consultation_slot_blocks'
          and index_record.indexname =
            'counselor_consultation_slot_blocks_one_active_key'
          and index_record.indexdef ilike 'create unique index%'
          and index_record.indexdef ilike '%where (released_at is null)%'
      ),
      'block history trigger and one-active-block partial unique index exist'
    ),
    (
      'PER_COUNSELOR_CAPACITY',
      exists (
        select 1
        from pg_catalog.pg_indexes as index_record
        where index_record.schemaname = 'public'
          and index_record.tablename = 'consultation_requests'
          and index_record.indexname =
            'consultation_requests_active_counselor_slot_key'
          and index_record.indexdef ilike 'create unique index%'
          and index_record.indexdef ilike
            '%(assigned_counselor_id, consultation_date, slot_start)%'
          and index_record.indexdef ilike
            '%assigned_counselor_id is not null%'
          and index_record.indexdef ilike '%status <>%cancelled%'
      )
      and not exists (
        select 1
        from pg_catalog.pg_indexes as index_record
        where index_record.schemaname = 'public'
          and index_record.tablename = 'consultation_requests'
          and index_record.indexname =
            'consultation_requests_active_slot_key'
      ),
      'per-Counselor capacity exists and organization-wide slot uniqueness is retired'
    ),
    (
      'DIRECT_STUDENT_INSERT_RETIRED',
      not pg_catalog.has_table_privilege(
        'authenticated',
        'public.consultation_requests',
        'INSERT'
      )
      and not exists (
        select 1
        from pg_catalog.pg_policy as policy
        where policy.polrelid =
            'public.consultation_requests'::pg_catalog.regclass
          and policy.polname = 'consultation_requests_insert_own'
      )
      and not exists (
        select 1
        from pg_catalog.pg_trigger as trigger_record
        where trigger_record.tgrelid =
            'public.consultation_requests'::pg_catalog.regclass
          and trigger_record.tgname =
            'consultation_requests_prepare_insert'
          and trigger_record.tgisinternal is false
      ),
      'browser INSERT policy/grant and legacy preparation trigger are absent'
    ),
    (
      'CLAIM_NEXT_RETIRED',
      not pg_catalog.has_function_privilege(
        'anon',
        'public.claim_next_consultation()',
        'EXECUTE'
      )
      and not pg_catalog.has_function_privilege(
        'authenticated',
        'public.claim_next_consultation()',
        'EXECUTE'
      ),
      'normal application roles cannot execute Claim Next'
    ),
    (
      'COUNSELOR_TABLE_READ_NARROWED',
      not exists (
        select 1
        from pg_catalog.pg_policy as policy
        where policy.polrelid =
            'public.consultation_requests'::pg_catalog.regclass
          and policy.polname = 'consultation_requests_select_counselor_all'
      )
      and exists (
        select 1
        from pg_catalog.pg_policy as policy
        where policy.polrelid =
            'public.consultation_requests'::pg_catalog.regclass
          and policy.polname =
            'consultation_requests_select_primary_counselor'
          and policy.polcmd = 'r'
          and policy.polroles = array[
            'authenticated'::pg_catalog.regrole::oid
          ]
          and pg_catalog.pg_get_expr(
            policy.polqual,
            policy.polrelid,
            true
          ) ilike '%is_active_primary_counselor_for_student(student_id)%'
      ),
      'broad Counselor policy is absent and Primary-only policy is installed'
    ),
    (
      'AUTOMATIC_ASSIGNMENT_AUDIT_SHAPE',
      exists (
        select 1
        from pg_catalog.pg_attribute as attribute_record
        where attribute_record.attrelid =
            'public.student_counselor_assignments'::pg_catalog.regclass
          and attribute_record.attname = 'assigned_by'
          and attribute_record.attnotnull is false
          and attribute_record.attisdropped is false
      ),
      'assigned_by permits truthful NULL system allocation while history remains intact'
    ),
    (
      'NO_PARTIAL_AUTOMATIC_BOOKINGS',
      not exists (
        select 1
        from public.consultation_requests as request
        where request.status = 'scheduled'::public.consultation_status
          and (
            request.assigned_counselor_id is null
            or request.assigned_at is null
            or request.consultation_date is null
            or request.slot_start is null
            or request.slot_end is null
          )
      ),
      'every scheduled consultation is fully assigned and scheduled'
    ),
    (
      'NO_RETIRED_PENDING_ROWS',
      not exists (
        select 1
        from public.consultation_requests as request
        where request.status in (
          'submitted'::public.consultation_status,
          'waiting_for_assignment'::public.consultation_status,
          'counselor_assigned'::public.consultation_status
        )
      ),
      'controlled legacy cleanup left no retired pending-assignment rows'
    )
)
select check_name, passed, details
from checks
union all
select
  'FINAL_AUTOMATIC_ALLOCATION_READINESS',
  pg_catalog.bool_and(checks.passed),
  pg_catalog.count(*) filter (where not checks.passed)::text
    || ' mandatory checks failed'
from checks
order by check_name;
