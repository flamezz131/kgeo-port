-- K-GEO initial identity foundation.
-- Review this migration before applying it to Supabase.

create type public.user_role as enum (
  'student',
  'counselor',
  'admin',
  'director'
);

create table public.profiles (
  id uuid
    constraint profiles_pkey primary key
    constraint profiles_user_id_fkey
      references auth.users(id)
      on delete cascade,
  college_email text
    constraint profiles_college_email_key unique
    constraint profiles_college_email_not_null not null,
  role public.user_role
    constraint profiles_role_not_null not null
    default 'student'::public.user_role,
  full_name text,
  is_active boolean
    constraint profiles_is_active_not_null not null
    default true,
  created_at timestamptz
    constraint profiles_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint profiles_updated_at_not_null not null
    default pg_catalog.now(),
  constraint profiles_college_email_check
    check (
      college_email = pg_catalog.lower(pg_catalog.btrim(college_email))
      and college_email ~ '^[^@[:space:]]+@kct[.]ac[.]in$'
    )
);

comment on type public.user_role is
  'K-GEO roles. Every public signup is assigned student.';

comment on table public.profiles is
  'One K-GEO application profile for each Supabase Auth user.';

comment on column public.profiles.college_email is
  'Normalized lowercase institutional email copied from auth.users.email.';

comment on column public.profiles.role is
  'Authorization role. Authenticated browser users cannot update it.';

comment on column public.profiles.is_active is
  'Trusted account-status flag. Authenticated browser users cannot update it.';

-- The primary key and unique college_email constraint create the indexes
-- required for the initial one-profile-per-user access pattern.

create function public.set_profiles_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.statement_timestamp();
  return new;
end;
$function$;

comment on function public.set_profiles_updated_at() is
  'Maintains profiles.updated_at whenever a profile row is updated.';

revoke all on function public.set_profiles_updated_at()
  from public, anon, authenticated;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_profiles_updated_at();

-- SECURITY: this function explicitly assigns student. It never reads a role
-- from form data, URL data, browser input, or raw_user_meta_data. Missing or
-- invalid institutional email fails closed and rolls back Auth user creation.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_email text;
begin
  normalized_email := pg_catalog.lower(pg_catalog.btrim(new.email));

  if normalized_email is null
    or normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid @kct.ac.in email address';
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
    null,
    true
  );

  return new;
end;
$function$;

comment on function public.handle_new_user() is
  'Creates one student profile from a valid Supabase Auth email.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

alter table public.profiles enable row level security;

-- Remove broad defaults before granting the minimum browser permissions.
-- There is no authenticated INSERT or DELETE grant and no anonymous access.
revoke all privileges on table public.profiles
  from public, anon, authenticated;

revoke all privileges on type public.user_role
  from public, anon;

grant usage on type public.user_role
  to authenticated;

grant select on table public.profiles
  to authenticated;

grant update (full_name) on table public.profiles
  to authenticated;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using ((select auth.uid()) = id);

create policy profiles_update_own
on public.profiles
for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

comment on policy profiles_select_own on public.profiles is
  'Authenticated users can read only the profile matching auth.uid().';

comment on policy profiles_update_own on public.profiles is
  'Authenticated users can update their own profile; grants limit updates to full_name.';

-- SIGNUP-TRIGGER RECOVERY
-- A failing Auth trigger can block signup. Inspect Supabase Auth and Postgres
-- logs first. To pause profile creation without deleting data, review and run:
--
--   alter table auth.users disable trigger on_auth_user_created;
--
-- After correcting public.handle_new_user(), review and run:
--
--   alter table auth.users enable trigger on_auth_user_created;
--
-- If the trigger must be removed, review and run:
--
--   drop trigger if exists on_auth_user_created on auth.users;
--
-- Users created while the trigger is unavailable need a separately reviewed,
-- trusted profile backfill. Disabling or removing the trigger does not delete
-- Auth users or existing profiles.
