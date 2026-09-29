-- K-GEO Phase D1.2 manually maintained public organisational statistics.
-- Review this migration before applying it. It does not read or modify
-- operational Student, Counselor, consultation, application, or progression data.

begin;

create table public.kgeo_public_progress (
  singleton boolean primary key default true,
  registered_for_advisory bigint not null,
  applications_initiated bigint not null,
  applications_submitted bigint not null,
  offers_received bigint not null,
  confirmed_acceptance bigint not null,
  visa_approved bigint not null,
  enrolled_overseas bigint not null,
  updated_by uuid not null
    references public.profiles (id) on update restrict on delete restrict,
  updated_at timestamp with time zone not null,
  constraint kgeo_public_progress_singleton_check check (singleton is true),
  constraint kgeo_public_progress_values_nonnegative check (
    registered_for_advisory >= 0
    and applications_initiated >= 0
    and applications_submitted >= 0
    and offers_received >= 0
    and confirmed_acceptance >= 0
    and visa_approved >= 0
    and enrolled_overseas >= 0
  )
);

alter table public.kgeo_public_progress owner to postgres;
alter table public.kgeo_public_progress enable row level security;
alter table public.kgeo_public_progress force row level security;

revoke all on table public.kgeo_public_progress
  from public, anon, authenticated, service_role;

comment on table public.kgeo_public_progress is
  'The single Director-maintained, non-PII public K-GEO organisational statistics record.';

create function public.publish_kgeo_public_progress(
  p_registered_for_advisory bigint,
  p_applications_initiated bigint,
  p_applications_submitted bigint,
  p_offers_received bigint,
  p_confirmed_acceptance bigint,
  p_visa_approved bigint,
  p_enrolled_overseas bigint
)
returns table (
  published_at timestamp with time zone
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_director_id uuid;
  v_published_at timestamp with time zone;
begin
  v_director_id := (select auth.uid());

  if v_director_id is null
    or public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'K-GEO public statistics publishing is unavailable.';
  end if;

  if p_registered_for_advisory is null
    or p_applications_initiated is null
    or p_applications_submitted is null
    or p_offers_received is null
    or p_confirmed_acceptance is null
    or p_visa_approved is null
    or p_enrolled_overseas is null then
    raise exception using
      errcode = '22004',
      message = 'All seven K-GEO public statistics are required.';
  end if;

  if p_registered_for_advisory < 0
    or p_applications_initiated < 0
    or p_applications_submitted < 0
    or p_offers_received < 0
    or p_confirmed_acceptance < 0
    or p_visa_approved < 0
    or p_enrolled_overseas < 0 then
    raise exception using
      errcode = '22023',
      message = 'K-GEO public statistics cannot be negative.';
  end if;

  v_published_at := pg_catalog.statement_timestamp();

  insert into public.kgeo_public_progress (
    singleton,
    registered_for_advisory,
    applications_initiated,
    applications_submitted,
    offers_received,
    confirmed_acceptance,
    visa_approved,
    enrolled_overseas,
    updated_by,
    updated_at
  ) values (
    true,
    p_registered_for_advisory,
    p_applications_initiated,
    p_applications_submitted,
    p_offers_received,
    p_confirmed_acceptance,
    p_visa_approved,
    p_enrolled_overseas,
    v_director_id,
    v_published_at
  )
  on conflict (singleton) do update
  set registered_for_advisory = excluded.registered_for_advisory,
      applications_initiated = excluded.applications_initiated,
      applications_submitted = excluded.applications_submitted,
      offers_received = excluded.offers_received,
      confirmed_acceptance = excluded.confirmed_acceptance,
      visa_approved = excluded.visa_approved,
      enrolled_overseas = excluded.enrolled_overseas,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  return query select v_published_at;
end;
$function$;

alter function public.publish_kgeo_public_progress(
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
) owner to postgres;
revoke all on function public.publish_kgeo_public_progress(
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
) from public, anon, authenticated;
grant execute on function public.publish_kgeo_public_progress(
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
) to authenticated;

comment on function public.publish_kgeo_public_progress(
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint,
  bigint
) is
  'Atomically saves all seven public organisational statistics as the active verified Director.';

create function public.get_public_kgeo_progress()
returns table (
  registered_for_advisory bigint,
  applications_initiated bigint,
  applications_submitted bigint,
  offers_received bigint,
  confirmed_acceptance bigint,
  visa_approved bigint,
  enrolled_overseas bigint,
  published_at timestamp with time zone
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    progress.registered_for_advisory,
    progress.applications_initiated,
    progress.applications_submitted,
    progress.offers_received,
    progress.confirmed_acceptance,
    progress.visa_approved,
    progress.enrolled_overseas,
    progress.updated_at as published_at
  from public.kgeo_public_progress as progress
  where progress.singleton is true;
$function$;

alter function public.get_public_kgeo_progress() owner to postgres;
revoke all on function public.get_public_kgeo_progress()
  from public, anon, authenticated;
grant execute on function public.get_public_kgeo_progress()
  to anon, authenticated;

comment on function public.get_public_kgeo_progress() is
  'Returns only seven non-PII public organisational statistics and their publication timestamp.';

commit;
