-- K-GEO public statistics: reject figures that break the funnel order.
-- Each published stage must be less than or equal to the stage before it:
--   initiated >= submitted >= offers >= acceptance >= visa >= enrolled
--
-- Only the publish function changes. The currently stored figures are not
-- touched and remain visible until the Director saves corrected figures.
-- CREATE OR REPLACE keeps the existing owner, grants and comment.

begin;

create or replace function public.publish_kgeo_public_progress(
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

  if p_applications_submitted > p_applications_initiated
    or p_offers_received > p_applications_submitted
    or p_confirmed_acceptance > p_offers_received
    or p_visa_approved > p_confirmed_acceptance
    or p_enrolled_overseas > p_visa_approved then
    raise exception using
      errcode = '22023',
      message = 'Each K-GEO public statistic must not exceed the stage before it.';
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

commit;
