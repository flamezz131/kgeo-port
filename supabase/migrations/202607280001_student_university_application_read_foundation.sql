begin;

-- SECURITY: This is the only student read path for university applications.
-- It accepts no identity input, reauthorizes the current JWT identity, and
-- returns only the approved nonarchived projection fields.
create function public.get_my_university_applications()
returns table (
  application_id uuid,
  university_name text,
  programme_name text,
  country_code text,
  degree_level public.university_application_degree_level,
  intake_term public.university_application_intake_term,
  intake_year integer,
  current_status public.university_application_status,
  submission_deadline date,
  submitted_at timestamptz,
  is_primary boolean,
  last_changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  bounded_application_count integer;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'University applications are temporarily unavailable.';
  end if;

  -- Inspect at most 101 rows so an invalid oversized result fails closed
  -- without an unbounded count or disclosure of the actual row count.
  select pg_catalog.count(*)::integer
  into bounded_application_count
  from (
    select application.id
    from public.student_university_applications as application
    where application.student_id = caller_id
      and application.is_archived is false
    order by
      application.is_primary desc nulls last,
      application.last_changed_at desc nulls last,
      application.id desc
    limit 101
  ) as bounded_applications;

  if bounded_application_count > 100 then
    raise exception using
      errcode = 'P0001',
      message = 'University applications are temporarily unavailable.';
  end if;

  return query
  select
    application.id as application_id,
    application.university_name,
    application.programme_name,
    application.country_code,
    application.degree_level,
    application.intake_term,
    application.intake_year::integer,
    application.current_status,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.last_changed_at
  from public.student_university_applications as application
  where application.student_id = caller_id
    and application.is_archived is false
  order by
    application.is_primary desc nulls last,
    application.last_changed_at desc nulls last,
    application.id desc
  limit 100;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'University applications are temporarily unavailable.';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'University applications are temporarily unavailable.';
end;
$function$;

alter function public.get_my_university_applications()
  owner to postgres;

comment on function public.get_my_university_applications() is
  'Returns at most 100 safe nonarchived university application summaries for the current active verified student; no identity argument, private counselor data, or event history is exposed.';

revoke all on function public.get_my_university_applications()
  from public, anon, authenticated;

grant execute on function public.get_my_university_applications()
  to authenticated;

-- E1.1 table RLS, table grants, counselor policies, mutation RPCs, enums, and
-- official counseling progression remain unchanged. Students receive no
-- direct table policy or table grant through this migration.

commit;
