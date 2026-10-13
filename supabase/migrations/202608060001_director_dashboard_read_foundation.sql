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
