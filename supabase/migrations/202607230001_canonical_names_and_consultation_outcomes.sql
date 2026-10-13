-- K-GEO canonical-name and consultation-outcome foundation.
-- Review this migration before applying it. It does not rewrite existing
-- profile names or historical consultation snapshots.

begin;

-- Existing null names remain valid so students can correct them through My
-- Profile. NOT VALID avoids scanning or rewriting legacy rows, while PostgreSQL
-- still enforces the 150-character boundary for new and changed rows.
alter table public.profiles
  add constraint profiles_full_name_check
    check (
      full_name is null
      or (
        pg_catalog.char_length(pg_catalog.btrim(full_name)) between 1 and 150
        and full_name = pg_catalog.regexp_replace(
          pg_catalog.btrim(full_name),
          '[[:space:]]+',
          ' ',
          'g'
        )
      )
    )
    not valid;

comment on constraint profiles_full_name_check on public.profiles is
  'Canonical names are null for legacy accounts or trimmed, whitespace-normalized non-empty text of at most 150 characters.';

-- SECURITY: public registration may provide only the non-privileged display
-- name through user metadata. Role remains hard-coded to student and no other
-- metadata key is trusted. New Auth identities must provide the validated
-- name; later trusted staff provisioning must provide it as well.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_email text;
  normalized_full_name text;
begin
  normalized_email := pg_catalog.lower(pg_catalog.btrim(new.email));

  if normalized_email is null
    or normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid @kct.ac.in email address';
  end if;

  if not (
    coalesce(new.raw_user_meta_data, '{}'::jsonb) ? 'full_name'
  )
    or pg_catalog.jsonb_typeof(new.raw_user_meta_data -> 'full_name')
      <> 'string' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  normalized_full_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(normalized_full_name) not between 1 and 150 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid full name';
  end if;

  insert into public.profiles (
    id,
    college_email,
    role,
    full_name,
    is_active
  )
  values (
    new.id,
    normalized_email,
    'student'::public.user_role,
    normalized_full_name,
    true
  );

  return new;
end;
$function$;

comment on function public.handle_new_user() is
  'Creates one student profile from a valid Auth email and required validated canonical name; role metadata is never trusted.';

-- PostgreSQL permits an enum value to be added transactionally. The remaining
-- statements compare status through text until this transaction commits, so
-- the new value is not used as an enum literal before it is safe to do so.
alter type public.consultation_status
  add value if not exists 'no_show' after 'completed';

alter table public.consultation_requests
  add column outcome_recorded_at timestamptz,
  add column outcome_recorded_by uuid,
  add constraint consultation_requests_outcome_pair_check
    check (
      (
        outcome_recorded_at is null
        and outcome_recorded_by is null
      )
      or (
        outcome_recorded_at is not null
        and outcome_recorded_by is not null
        and status::text in ('completed', 'no_show')
      )
    ),
  add constraint consultation_requests_no_show_audit_check
    check (
      status::text <> 'no_show'
      or (
        outcome_recorded_at is not null
        and outcome_recorded_by is not null
      )
    );

comment on column public.consultation_requests.outcome_recorded_at is
  'Trusted timestamp when a counselor finalized a completed or no-show outcome.';

comment on column public.consultation_requests.outcome_recorded_by is
  'Authenticated counselor UUID captured by the trusted outcome function; retained as historical audit identity.';

-- Extend the existing assignment invariant without changing any legacy row.
-- Text comparison avoids using the newly added enum value before commit.
alter table public.consultation_requests
  drop constraint consultation_requests_status_assignment_check,
  add constraint consultation_requests_status_assignment_check
    check (
      (
        status::text in ('submitted', 'waiting_for_assignment')
        and assigned_counselor_id is null
      )
      or (
        status::text = 'counselor_assigned'
        and assigned_counselor_id is not null
      )
      or status::text in (
        'scheduled',
        'completed',
        'no_show',
        'cancelled'
      )
    );

comment on constraint consultation_requests_status_assignment_check
  on public.consultation_requests is
  'Direct scheduled and final-outcome rows need no assignment; counselor_assigned rows still require one.';

create index consultation_requests_scheduled_end_idx
  on public.consultation_requests (consultation_date, slot_end, id)
  where status = 'scheduled'::public.consultation_status;

comment on index public.consultation_requests_scheduled_end_idx is
  'Supports Asia/Kolkata active-or-future and outcome-required slot-end filters for unresolved scheduled consultations.';

-- SECURITY: authenticated callers receive EXECUTE only. The function derives
-- the actor from auth.uid(), verifies an active email-confirmed counselor,
-- locks the selected row, accepts only final outcomes, and refuses to finalize
-- a consultation before its fixed slot has ended in Asia/Kolkata.
create function public.record_consultation_outcome(
  p_consultation_id uuid,
  p_outcome text
)
returns public.consultation_status
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  business_now timestamp without time zone;
  business_today date;
  business_time time without time zone;
  requested_status public.consultation_status;
  target_date date;
  target_end time without time zone;
  target_status public.consultation_status;
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

  if p_consultation_id is null
    or p_outcome is null
    or p_outcome not in ('completed', 'no_show') then
    raise exception using
      errcode = '22023',
      message = 'A valid consultation outcome is required';
  end if;

  select
    request.consultation_date,
    request.slot_end,
    request.status
  into
    target_date,
    target_end,
    target_status
  from public.consultation_requests as request
  where request.id = p_consultation_id
  for update;

  if not found
    or target_status::text <> 'scheduled'
    or target_date is null
    or target_end is null then
    raise exception using
      errcode = '22023',
      message = 'The consultation outcome cannot be recorded';
  end if;

  business_now :=
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata';
  business_today := business_now::date;
  business_time := business_now::time;

  if target_date > business_today
    or (
      target_date = business_today
      and target_end > business_time
    ) then
    raise exception using
      errcode = '22023',
      message = 'The consultation outcome cannot be recorded yet';
  end if;

  requested_status := p_outcome::public.consultation_status;

  update public.consultation_requests as request
  set
    status = requested_status,
    outcome_recorded_at = pg_catalog.statement_timestamp(),
    outcome_recorded_by = caller_id
  where request.id = p_consultation_id
    and request.status::text = 'scheduled'
  returning request.status into target_status;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The consultation outcome changed concurrently';
  end if;

  return target_status;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value then
    raise exception using
      errcode = '22023',
      message = 'The consultation outcome cannot be recorded';
  when serialization_failure then
    raise exception using
      errcode = '40001',
      message = 'The consultation outcome changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The consultation outcome could not be recorded';
end;
$function$;

comment on function public.record_consultation_outcome(uuid, text) is
  'Allows only an active verified counselor to finalize an ended scheduled consultation as completed or no_show.';

revoke all on function public.record_consultation_outcome(uuid, text)
  from public, anon, authenticated;

grant execute on function public.record_consultation_outcome(uuid, text)
  to authenticated;

-- Close the older consultation-read policy's direct-API verification gap.
-- The shared helper checks auth.uid(), active role state, and auth.users email
-- confirmation through its reviewed SECURITY DEFINER boundary.
drop policy consultation_requests_select_counselor_all
  on public.consultation_requests;

create policy consultation_requests_select_counselor_all
on public.consultation_requests
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy consultation_requests_select_counselor_all
  on public.consultation_requests is
  'Active email-confirmed counselors can read all consultation requests; mutation still requires a separately reviewed trusted operation.';

-- Other table SELECT policies and all table grants remain unchanged. In
-- particular, students keep own-row SELECT, existing director/admin reads are
-- not broadened, and no authenticated role receives table UPDATE or DELETE
-- permission.

commit;
