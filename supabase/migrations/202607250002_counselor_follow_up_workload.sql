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
