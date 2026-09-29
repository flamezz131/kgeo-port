-- K-GEO Phase C1.1, stage A: additive counselor consultation references.
-- Review and apply this migration before deploying the counselor application
-- update. This stage intentionally does not change consultation table grants.

begin;

create function public.get_counselor_consultation_references(
  p_consultation_ids uuid[]
)
returns table (
  consultation_id uuid,
  request_number text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  requested_count integer;
  distinct_count integer;
begin
  caller_id := (select auth.uid());

  if caller_id is null or not exists (
    select 1
    from public.profiles as profile
    inner join auth.users as auth_user
      on auth_user.id = profile.id
    where profile.id = caller_id
      and profile.role = 'counselor'::public.user_role
      and profile.is_active is true
      and auth_user.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  requested_count := pg_catalog.cardinality(p_consultation_ids);

  if p_consultation_ids is null
    or requested_count is null
    or requested_count < 1
    or requested_count > 100
    or pg_catalog.array_position(p_consultation_ids, null) is not null then
    raise exception using
      errcode = '22023',
      message = 'Provide between 1 and 100 unique consultation identifiers';
  end if;

  select pg_catalog.count(*)::integer
  into distinct_count
  from (
    select distinct requested.consultation_id
    from pg_catalog.unnest(p_consultation_ids)
      as requested(consultation_id)
  ) as unique_requested;

  if distinct_count <> requested_count then
    raise exception using
      errcode = '22023',
      message = 'Provide between 1 and 100 unique consultation identifiers';
  end if;

  return query
  select
    request.id,
    request.request_number
  from public.consultation_requests as request
  where request.id = any (p_consultation_ids)
  order by request.id;
end;
$function$;

alter function public.get_counselor_consultation_references(uuid[])
  owner to postgres;

comment on function
  public.get_counselor_consultation_references(uuid[]) is
  'Returns only consultation UUID/reference pairs for up to 100 supplied IDs and only to an active email-confirmed counselor.';

revoke all on function
  public.get_counselor_consultation_references(uuid[])
  from public, anon, authenticated;

grant execute on function
  public.get_counselor_consultation_references(uuid[])
  to authenticated;

-- Stage A is additive. Existing table SELECT and all INSERT privileges remain
-- unchanged until the counselor application has deployed and been verified.

commit;
