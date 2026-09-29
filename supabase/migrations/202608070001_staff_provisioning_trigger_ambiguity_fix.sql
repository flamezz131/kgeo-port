-- Phase A1.1.2 hotfix: remove PL/pgSQL identifier ambiguity from the
-- one-time staff provisioning branch without changing its authorization model.

begin;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_normalized_email text;
  v_normalized_full_name text;
  v_provisioning_token text;
  v_token_hash text;
  v_approved_role public.user_role;
  v_request_time timestamptz := pg_catalog.statement_timestamp();
  v_affected_rows bigint;
begin
  v_normalized_email := pg_catalog.lower(pg_catalog.btrim(new.email));

  if v_normalized_email is null
    or pg_catalog.char_length(v_normalized_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(v_normalized_email, '@', 1)
    ) not between 1 and 64
    or v_normalized_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO requires a valid email address';
  end if;

  if coalesce(new.raw_user_meta_data, '{}'::jsonb)
    ? 'kgeo_staff_provisioning_token' then
    if pg_catalog.jsonb_typeof(
      new.raw_user_meta_data -> 'kgeo_staff_provisioning_token'
    ) <> 'string' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    v_provisioning_token :=
      new.raw_user_meta_data ->> 'kgeo_staff_provisioning_token';

    if v_provisioning_token !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    v_token_hash := pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(v_provisioning_token, 'UTF8')
      ),
      'hex'
    );

    select request.approved_role
    into v_approved_role
    from private.kgeo_staff_provisioning_requests as request
    where request.normalized_email = v_normalized_email
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time
    for update;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    if v_approved_role not in (
      'counselor'::public.user_role,
      'director'::public.user_role
    )
      or (
        v_approved_role = 'counselor'::public.user_role
        and v_normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$'
      ) then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    update private.kgeo_staff_provisioning_requests as request
    set consumed_at = v_request_time
    where request.normalized_email = v_normalized_email
      and request.approved_role = v_approved_role
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time;

    get diagnostics v_affected_rows = row_count;

    if v_affected_rows <> 1 then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
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
      v_normalized_email,
      v_approved_role,
      null,
      true
    );

    return new;
  end if;

  if v_normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
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

  v_normalized_full_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if pg_catalog.char_length(v_normalized_full_name) not between 1 and 150 then
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
    v_normalized_email,
    'student'::public.user_role,
    v_normalized_full_name,
    true
  );

  return new;
end;
$function$;

alter function public.handle_new_user() owner to postgres;

comment on function public.handle_new_user() is
  'Creates an exact-@kct.ac.in student or consumes a matching private request to create its approved counselor/Director role; metadata roles never authorize.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

commit;
