-- K-GEO Phase A1.1.1 director identity bootstrap support.
-- Review this migration before applying it. Apply it only after
-- 202608060001_director_dashboard_read_foundation.sql.
--
-- Public signup remains student-only and exact-@kct.ac.in. A Director profile
-- can be created only when trusted Auth app metadata contains the exact
-- kgeo_bootstrap_role=director marker.

begin;

alter table public.profiles
  drop constraint profiles_college_email_check,
  add constraint profiles_college_email_check
    check (
      college_email = pg_catalog.lower(pg_catalog.btrim(college_email))
      and pg_catalog.char_length(college_email) between 3 and 254
      and pg_catalog.char_length(
        pg_catalog.split_part(college_email, '@', 1)
      ) between 1 and 64
      and college_email ~
        '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
      and (
        role = 'director'::public.user_role
        or (
          role <> 'director'::public.user_role
          and college_email ~ '^[^@[:space:]]+@kct[.]ac[.]in$'
        )
      )
    );

comment on constraint profiles_college_email_check on public.profiles is
  'Requires normalized valid email; students, counselors, and admins remain exact-@kct.ac.in while Directors may use any valid email domain.';

comment on column public.profiles.college_email is
  'Normalized lowercase Auth email; its accepted domain is constrained by the profile role.';

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_email text;
  normalized_full_name text;
  has_bootstrap_marker boolean;
  bootstrap_role text;
begin
  normalized_email := pg_catalog.lower(pg_catalog.btrim(new.email));
  has_bootstrap_marker := coalesce(
    new.raw_app_meta_data,
    '{}'::jsonb
  ) ? 'kgeo_bootstrap_role';
  bootstrap_role := coalesce(
    new.raw_app_meta_data,
    '{}'::jsonb
  ) ->> 'kgeo_bootstrap_role';

  if normalized_email is null
    or pg_catalog.char_length(normalized_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(normalized_email, '@', 1)
    ) not between 1 and 64
    or normalized_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid email address';
  end if;

  if has_bootstrap_marker then
    if pg_catalog.jsonb_typeof(
      new.raw_app_meta_data -> 'kgeo_bootstrap_role'
    ) <> 'string'
      or bootstrap_role <> 'director' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO trusted identity bootstrap is invalid';
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
      'director'::public.user_role,
      null,
      true
    );

    return new;
  end if;

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

alter function public.handle_new_user() owner to postgres;

comment on function public.handle_new_user() is
  'Creates an exact-@kct.ac.in student or a trusted app-metadata-marked Director profile; user metadata never assigns a role.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

commit;
