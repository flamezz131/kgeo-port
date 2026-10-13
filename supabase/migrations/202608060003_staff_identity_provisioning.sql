-- K-GEO Phase A1.1.2 secure one-time staff identity provisioning.
-- Review this migration before applying it. Apply it only after
-- 202608060002_director_identity_bootstrap_support.sql.
--
-- Public registration remains exact-@kct.ac.in and student-only. Counselor
-- and Director roles come only from a locked private server-prepared request;
-- raw Auth metadata transports only the high-entropy one-time token.

begin;

create schema if not exists private authorization postgres;

revoke all on schema private from public, anon, authenticated, service_role;

create table private.kgeo_staff_provisioning_requests (
  normalized_email text primary key,
  approved_role public.user_role not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint kgeo_staff_provisioning_requests_role_check
    check (
      approved_role in (
        'counselor'::public.user_role,
        'director'::public.user_role
      )
    ),
  constraint kgeo_staff_provisioning_requests_email_check
    check (
      normalized_email = pg_catalog.lower(
        pg_catalog.btrim(normalized_email)
      )
      and pg_catalog.char_length(normalized_email) between 3 and 254
      and pg_catalog.char_length(
        pg_catalog.split_part(normalized_email, '@', 1)
      ) between 1 and 64
      and normalized_email ~
        '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
      and (
        approved_role = 'director'::public.user_role
        or (
          approved_role = 'counselor'::public.user_role
          and normalized_email ~ '^[^@[:space:]]+@kct[.]ac[.]in$'
        )
      )
    ),
  constraint kgeo_staff_provisioning_requests_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint kgeo_staff_provisioning_requests_expiry_check
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '15 minutes'
    ),
  constraint kgeo_staff_provisioning_requests_consumed_check
    check (consumed_at is null or consumed_at >= created_at)
);

alter table private.kgeo_staff_provisioning_requests owner to postgres;
alter table private.kgeo_staff_provisioning_requests enable row level security;

revoke all on table private.kgeo_staff_provisioning_requests
  from public, anon, authenticated, service_role;

comment on table private.kgeo_staff_provisioning_requests is
  'Private short-lived one-time counselor/Director provisioning requests; stores only an approved role and SHA-256 token hash, never the raw token.';

comment on column private.kgeo_staff_provisioning_requests.approved_role is
  'Server-approved staff role; constrained to counselor or director.';

comment on column private.kgeo_staff_provisioning_requests.token_hash is
  'Unique lowercase hexadecimal SHA-256 hash of the temporary high-entropy token.';

create or replace function public.prepare_staff_identity_provisioning(
  p_email text,
  p_role public.user_role,
  p_token_hash text,
  p_expires_at timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  request_time timestamptz := pg_catalog.statement_timestamp();
  affected_rows bigint;
begin
  if p_email is null
    or p_email <> pg_catalog.lower(pg_catalog.btrim(p_email))
    or pg_catalog.char_length(p_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(p_email, '@', 1)
    ) not between 1 and 64
    or p_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO staff provisioning request is invalid';
  end if;

  if p_role is null
    or p_role not in (
      'counselor'::public.user_role,
      'director'::public.user_role
    ) then
    raise exception using
      errcode = '23514',
      message = 'K-GEO staff provisioning request is invalid';
  end if;

  if p_role = 'counselor'::public.user_role
    and p_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO staff provisioning request is invalid';
  end if;

  if p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO staff provisioning request is invalid';
  end if;

  if p_expires_at is null
    or p_expires_at <= request_time
    or p_expires_at > request_time + interval '15 minutes' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO staff provisioning request is invalid';
  end if;

  insert into private.kgeo_staff_provisioning_requests (
    normalized_email,
    approved_role,
    token_hash,
    expires_at,
    consumed_at,
    created_at
  )
  values (
    p_email,
    p_role,
    p_token_hash,
    p_expires_at,
    null,
    request_time
  )
  on conflict (normalized_email) do update
    set approved_role = excluded.approved_role,
        token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        consumed_at = null,
        created_at = excluded.created_at
    where private.kgeo_staff_provisioning_requests.consumed_at is not null
       or private.kgeo_staff_provisioning_requests.expires_at <= request_time;

  get diagnostics affected_rows = row_count;

  if affected_rows <> 1 then
    raise exception using
      errcode = '23505',
      message = 'K-GEO staff provisioning request is already active';
  end if;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'K-GEO staff provisioning request conflicts with an active request';
end;
$function$;

alter function public.prepare_staff_identity_provisioning(
  text,
  public.user_role,
  text,
  timestamptz
) owner to postgres;

comment on function public.prepare_staff_identity_provisioning(
  text,
  public.user_role,
  text,
  timestamptz
) is
  'Registers one private short-lived counselor/Director token hash; callable only by service_role and returns no secret.';

revoke all on function public.prepare_staff_identity_provisioning(
  text,
  public.user_role,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.prepare_staff_identity_provisioning(
  text,
  public.user_role,
  text,
  timestamptz
) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_email text;
  normalized_full_name text;
  provisioning_token text;
  provisioning_token_hash text;
  approved_staff_role public.user_role;
  request_time timestamptz := pg_catalog.statement_timestamp();
  affected_rows bigint;
begin
  normalized_email := pg_catalog.lower(pg_catalog.btrim(new.email));

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

  if coalesce(new.raw_user_meta_data, '{}'::jsonb)
    ? 'kgeo_staff_provisioning_token' then
    if pg_catalog.jsonb_typeof(
      new.raw_user_meta_data -> 'kgeo_staff_provisioning_token'
    ) <> 'string' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    provisioning_token :=
      new.raw_user_meta_data ->> 'kgeo_staff_provisioning_token';

    if provisioning_token !~ '^[A-Za-z0-9_-]{43}$' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    provisioning_token_hash := pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(provisioning_token, 'UTF8')
      ),
      'hex'
    );

    select request.approved_role
    into approved_staff_role
    from private.kgeo_staff_provisioning_requests as request
    where request.normalized_email = normalized_email
      and request.token_hash = provisioning_token_hash
      and request.consumed_at is null
      and request.expires_at > request_time
    for update;

    if not found then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    if approved_staff_role not in (
      'counselor'::public.user_role,
      'director'::public.user_role
    )
      or (
        approved_staff_role = 'counselor'::public.user_role
        and normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$'
      ) then
      raise exception using
        errcode = '23514',
        message = 'K-GEO staff provisioning is invalid';
    end if;

    update private.kgeo_staff_provisioning_requests as request
    set consumed_at = request_time
    where request.normalized_email = normalized_email
      and request.approved_role = approved_staff_role
      and request.token_hash = provisioning_token_hash
      and request.consumed_at is null
      and request.expires_at > request_time;

    get diagnostics affected_rows = row_count;

    if affected_rows <> 1 then
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
      normalized_email,
      approved_staff_role,
      null,
      true
    );

    return new;
  end if;

  if normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$' then
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
  'Creates an exact-@kct.ac.in student or consumes a matching private request to create its approved counselor/Director role; metadata roles never authorize.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

commit;
