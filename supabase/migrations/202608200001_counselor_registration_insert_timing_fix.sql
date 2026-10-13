-- K-GEO C1 corrective migration: authorize counselor self-registration with
-- a private, short-lived, one-time request visible during the Auth INSERT.

begin;

create table private.kgeo_counselor_registration_requests (
  normalized_email text primary key,
  normalized_full_name text not null,
  normalized_username text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null
    default pg_catalog.statement_timestamp(),
  constraint kgeo_counselor_registration_requests_email_check
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
      and normalized_email !~ '^[^@[:space:]]+@kct[.]ac[.]in$'
      and normalized_email !~ '^[^@[:space:]]+@kclas[.]ac[.]in$'
      and pg_catalog.split_part(normalized_email, '@', 1) =
        normalized_username
    ),
  constraint kgeo_counselor_registration_requests_full_name_check
    check (
      normalized_full_name = pg_catalog.regexp_replace(
        pg_catalog.btrim(normalized_full_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(normalized_full_name) between 1 and 150
    ),
  constraint kgeo_counselor_registration_requests_username_check
    check (
      normalized_username = pg_catalog.lower(
        pg_catalog.btrim(normalized_username)
      )
      and normalized_username ~ '^[a-z0-9._-]{3,32}$'
      and normalized_username not in (
        'admin',
        'administrator',
        'director',
        'kgeo',
        'root',
        'student',
        'support',
        'system'
      )
    ),
  constraint kgeo_counselor_registration_requests_token_hash_check
    check (token_hash ~ '^[0-9a-f]{64}$'),
  constraint kgeo_counselor_registration_requests_expiry_check
    check (
      expires_at > created_at
      and expires_at <= created_at + interval '15 minutes'
    ),
  constraint kgeo_counselor_registration_requests_consumed_check
    check (consumed_at is null or consumed_at >= created_at)
);

alter table private.kgeo_counselor_registration_requests owner to postgres;
alter table private.kgeo_counselor_registration_requests
  enable row level security;

revoke all on table private.kgeo_counselor_registration_requests
  from public, anon, authenticated, service_role;

comment on table private.kgeo_counselor_registration_requests is
  'Private short-lived counselor self-registration requests; stores trusted normalized identity fields and a SHA-256 token hash, never a password or raw token.';

comment on column private.kgeo_counselor_registration_requests.token_hash is
  'Unique lowercase hexadecimal SHA-256 hash of the temporary high-entropy token.';

create or replace function public.prepare_counselor_registration_provisioning(
  p_email text,
  p_full_name text,
  p_username text,
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
  v_request_time timestamptz := pg_catalog.statement_timestamp();
  v_affected_rows bigint;
begin
  if p_email is null
    or p_email <> pg_catalog.lower(pg_catalog.btrim(p_email))
    or pg_catalog.char_length(p_email) not between 3 and 254
    or pg_catalog.char_length(
      pg_catalog.split_part(p_email, '@', 1)
    ) not between 1 and 64
    or p_email !~
      '^[^@[:space:].]+([.][^@[:space:].]+)*@[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?([.][a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    or p_email ~ '^[^@[:space:]]+@kct[.]ac[.]in$'
    or p_email ~ '^[^@[:space:]]+@kclas[.]ac[.]in$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor registration request is invalid';
  end if;

  if p_full_name is null
    or p_full_name <> pg_catalog.regexp_replace(
      pg_catalog.btrim(p_full_name),
      '[[:space:]]+',
      ' ',
      'g'
    )
    or pg_catalog.char_length(p_full_name) not between 1 and 150 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor registration request is invalid';
  end if;

  if p_username is null
    or p_username <> pg_catalog.lower(pg_catalog.btrim(p_username))
    or p_username !~ '^[a-z0-9._-]{3,32}$'
    or p_username in (
      'admin',
      'administrator',
      'director',
      'kgeo',
      'root',
      'student',
      'support',
      'system'
    )
    or pg_catalog.split_part(p_email, '@', 1) <> p_username then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor registration request is invalid';
  end if;

  if p_token_hash is null
    or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor registration request is invalid';
  end if;

  if p_expires_at is null
    or p_expires_at <= v_request_time
    or p_expires_at > v_request_time + interval '15 minutes' then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor registration request is invalid';
  end if;

  insert into private.kgeo_counselor_registration_requests (
    normalized_email,
    normalized_full_name,
    normalized_username,
    token_hash,
    expires_at,
    consumed_at,
    created_at
  )
  values (
    p_email,
    p_full_name,
    p_username,
    p_token_hash,
    p_expires_at,
    null,
    v_request_time
  )
  on conflict (normalized_email) do update
    set normalized_full_name = excluded.normalized_full_name,
        normalized_username = excluded.normalized_username,
        token_hash = excluded.token_hash,
        expires_at = excluded.expires_at,
        consumed_at = null,
        created_at = excluded.created_at
    where private.kgeo_counselor_registration_requests.consumed_at
        is not null
       or private.kgeo_counselor_registration_requests.expires_at <=
        v_request_time;

  get diagnostics v_affected_rows = row_count;

  if v_affected_rows <> 1 then
    raise exception using
      errcode = '23505',
      message = 'K-GEO counselor registration request is already active';
  end if;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'K-GEO counselor registration request conflicts with an active request';
end;
$function$;

alter function public.prepare_counselor_registration_provisioning(
  text,
  text,
  text,
  text,
  timestamptz
) owner to postgres;

comment on function public.prepare_counselor_registration_provisioning(
  text,
  text,
  text,
  text,
  timestamptz
) is
  'Registers one private short-lived counselor self-registration token hash and normalized identity; callable only by service_role and returns no secret.';

revoke all on function public.prepare_counselor_registration_provisioning(
  text,
  text,
  text,
  text,
  timestamptz
) from public, anon, authenticated, service_role;

grant execute on function public.prepare_counselor_registration_provisioning(
  text,
  text,
  text,
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
  v_normalized_email text;
  v_normalized_full_name text;
  v_normalized_username text;
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

    select
      request.normalized_full_name,
      request.normalized_username
    into
      v_normalized_full_name,
      v_normalized_username
    from private.kgeo_counselor_registration_requests as request
    where request.normalized_email = v_normalized_email
      and request.token_hash = v_token_hash
      and request.consumed_at is null
      and request.expires_at > v_request_time
    for update;

    if found then
      if not (
        coalesce(new.raw_user_meta_data, '{}'::jsonb)
          ? 'kgeo_counselor_full_name'
      )
        or not (
          coalesce(new.raw_user_meta_data, '{}'::jsonb)
            ? 'kgeo_counselor_username'
        )
        or pg_catalog.jsonb_typeof(
          new.raw_user_meta_data -> 'kgeo_counselor_full_name'
        ) is distinct from 'string'
        or pg_catalog.jsonb_typeof(
          new.raw_user_meta_data -> 'kgeo_counselor_username'
        ) is distinct from 'string'
        or pg_catalog.regexp_replace(
          pg_catalog.btrim(
            new.raw_user_meta_data ->> 'kgeo_counselor_full_name'
          ),
          '[[:space:]]+',
          ' ',
          'g'
        ) <> v_normalized_full_name
        or pg_catalog.lower(
          pg_catalog.btrim(
            new.raw_user_meta_data ->> 'kgeo_counselor_username'
          )
        ) <> v_normalized_username
        or v_normalized_username !~ '^[a-z0-9._-]{3,32}$'
        or v_normalized_username in (
          'admin',
          'administrator',
          'director',
          'kgeo',
          'root',
          'student',
          'support',
          'system'
        )
        or pg_catalog.split_part(v_normalized_email, '@', 1) <>
          v_normalized_username then
        raise exception using
          errcode = '23514',
          message = 'K-GEO counselor registration is invalid';
      end if;

      update private.kgeo_counselor_registration_requests as request
      set consumed_at = v_request_time
      where request.normalized_email = v_normalized_email
        and request.normalized_full_name = v_normalized_full_name
        and request.normalized_username = v_normalized_username
        and request.token_hash = v_token_hash
        and request.consumed_at is null
        and request.expires_at > v_request_time;

      get diagnostics v_affected_rows = row_count;

      if v_affected_rows <> 1 then
        raise exception using
          errcode = '23514',
          message = 'K-GEO counselor registration is invalid';
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
        'counselor'::public.user_role,
        v_normalized_full_name,
        false
      );

      insert into public.counselor_accounts (
        user_id,
        username,
        approval_status
      )
      values (
        new.id,
        v_normalized_username,
        'pending'::public.counselor_approval_status
      );

      return new;
    end if;

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
  'Creates an exact-@kct.ac.in student, consumes a dedicated private request for a pending counselor registration, or consumes the existing private staff request for an active counselor/Director; metadata roles never authorize.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

commit;
