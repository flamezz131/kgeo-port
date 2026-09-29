-- Phase C1: trusted counselor self-registration and Director approval.
-- Passwords remain exclusively in Supabase Auth. The browser cannot set the
-- Auth app-metadata marker used by the counselor-registration trigger branch.

begin;

create type public.counselor_approval_status as enum (
  'pending',
  'approved',
  'rejected'
);

alter type public.counselor_approval_status owner to postgres;

create table public.counselor_accounts (
  user_id uuid primary key
    constraint counselor_accounts_user_id_fkey
      references auth.users(id)
      on delete cascade,
  username text not null
    constraint counselor_accounts_username_key unique,
  approval_status public.counselor_approval_status not null
    default 'pending'::public.counselor_approval_status,
  approved_by uuid
    constraint counselor_accounts_approved_by_fkey
      references auth.users(id),
  approved_at timestamptz,
  rejected_by uuid
    constraint counselor_accounts_rejected_by_fkey
      references auth.users(id),
  rejected_at timestamptz,
  created_at timestamptz not null
    default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null
    default pg_catalog.statement_timestamp(),
  constraint counselor_accounts_username_check
    check (
      username = pg_catalog.lower(pg_catalog.btrim(username))
      and username ~ '^[a-z0-9._-]{3,32}$'
      and username not in (
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
  constraint counselor_accounts_approval_audit_check
    check (
      (
        approval_status = 'pending'::public.counselor_approval_status
        and approved_by is null
        and approved_at is null
        and rejected_by is null
        and rejected_at is null
      )
      or (
        approval_status = 'approved'::public.counselor_approval_status
        and approved_by is not null
        and approved_at is not null
        and rejected_by is null
        and rejected_at is null
      )
      or (
        approval_status = 'rejected'::public.counselor_approval_status
        and approved_by is null
        and approved_at is null
        and rejected_by is not null
        and rejected_at is not null
      )
    )
);

alter table public.counselor_accounts owner to postgres;
alter table public.counselor_accounts enable row level security;
alter table public.counselor_accounts force row level security;

revoke all on table public.counselor_accounts
  from public, anon, authenticated;
grant select on table public.counselor_accounts to authenticated;

create policy counselor_accounts_select_director
on public.counselor_accounts
for select
to authenticated
using (
  public.has_active_verified_kgeo_role(
    'director'::public.user_role
  )
);

create policy counselor_accounts_select_own
on public.counselor_accounts
for select
to authenticated
using ((select auth.uid()) = counselor_accounts.user_id);

comment on table public.counselor_accounts is
  'Server-created counselor username mapping and Director-controlled approval audit state; contains no password material.';

comment on column public.counselor_accounts.username is
  'Normalized lowercase counselor login name. The corresponding technical Auth email is derived only by trusted server code.';

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
        role in (
          'counselor'::public.user_role,
          'director'::public.user_role
        )
        or (
          role not in (
            'counselor'::public.user_role,
            'director'::public.user_role
          )
          and college_email ~ '^[^@[:space:]]+@kct[.]ac[.]in$'
        )
      )
    );

comment on constraint profiles_college_email_check on public.profiles is
  'Requires normalized valid email; students and admins remain exact-@kct.ac.in, while trusted counselor and Director identity paths may use a valid server-managed email.';

comment on column public.profiles.college_email is
  'Normalized lowercase Auth identity email. Counselor technical identities are server-generated and never accepted from the counselor registration form.';

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

  if pg_catalog.jsonb_typeof(
    coalesce(new.raw_app_meta_data, '{}'::jsonb)
      -> 'kgeo_account_type'
  ) = 'string'
    and new.raw_app_meta_data ->> 'kgeo_account_type' =
      'counselor_registration' then
    if pg_catalog.jsonb_typeof(
      new.raw_app_meta_data -> 'kgeo_counselor_full_name'
    ) <> 'string'
      or pg_catalog.jsonb_typeof(
        new.raw_app_meta_data -> 'kgeo_counselor_username'
      ) <> 'string' then
      raise exception using
        errcode = '23514',
        message = 'K-GEO counselor registration is invalid';
    end if;

    v_normalized_full_name := pg_catalog.regexp_replace(
      pg_catalog.btrim(
        new.raw_app_meta_data ->> 'kgeo_counselor_full_name'
      ),
      '[[:space:]]+',
      ' ',
      'g'
    );
    v_normalized_username := pg_catalog.lower(
      pg_catalog.btrim(
        new.raw_app_meta_data ->> 'kgeo_counselor_username'
      )
    );

    if pg_catalog.char_length(v_normalized_full_name) not between 1 and 150
      or v_normalized_username <>
        new.raw_app_meta_data ->> 'kgeo_counselor_username'
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
  'Creates a pending counselor only from trusted Auth app metadata, consumes a matching private staff request, or creates an exact-@kct.ac.in student; browser metadata never assigns a role.';

revoke all on function public.handle_new_user()
  from public, anon, authenticated;

create or replace function public.list_director_counselor_accounts()
returns table (
  user_id uuid,
  full_name text,
  username text,
  approval_status public.counselor_approval_status,
  is_active boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or not public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  return query
  select
    account.user_id,
    profile.full_name,
    account.username,
    account.approval_status,
    profile.is_active,
    account.created_at
  from public.counselor_accounts as account
  join public.profiles as profile
    on profile.id = account.user_id
  where profile.role = 'counselor'::public.user_role
  order by account.created_at desc, account.user_id
  limit 500;
end;
$function$;

alter function public.list_director_counselor_accounts() owner to postgres;

comment on function public.list_director_counselor_accounts() is
  'Returns a bounded, technical-email-free counselor approval inventory only to an active verified Director.';

revoke all on function public.list_director_counselor_accounts()
  from public, anon, authenticated;
grant execute on function public.list_director_counselor_accounts()
  to authenticated;

create or replace function public.approve_counselor(p_user_id uuid)
returns public.counselor_approval_status
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_director_id uuid := (select auth.uid());
  v_approval_status public.counselor_approval_status;
  v_profile_role public.user_role;
  v_profile_is_active boolean;
  v_affected_rows bigint;
  v_changed_at timestamptz := pg_catalog.statement_timestamp();
begin
  if v_director_id is null
    or not public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  select
    account.approval_status,
    profile.role,
    profile.is_active
  into
    v_approval_status,
    v_profile_role,
    v_profile_is_active
  from public.counselor_accounts as account
  join public.profiles as profile
    on profile.id = account.user_id
  where account.user_id = p_user_id
  for update of account, profile;

  if not found
    or v_profile_role <> 'counselor'::public.user_role
    or v_approval_status <>
      'pending'::public.counselor_approval_status
    or v_profile_is_active then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor approval target is invalid';
  end if;

  update public.counselor_accounts as account
  set
    approval_status = 'approved'::public.counselor_approval_status,
    approved_by = v_director_id,
    approved_at = v_changed_at,
    rejected_by = null,
    rejected_at = null,
    updated_at = v_changed_at
  where account.user_id = p_user_id
    and account.approval_status =
      'pending'::public.counselor_approval_status;

  get diagnostics v_affected_rows = row_count;

  if v_affected_rows <> 1 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor approval transition failed';
  end if;

  update public.profiles as profile
  set
    is_active = true,
    updated_at = v_changed_at
  where profile.id = p_user_id
    and profile.role = 'counselor'::public.user_role
    and not profile.is_active;

  get diagnostics v_affected_rows = row_count;

  if v_affected_rows <> 1 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor activation failed';
  end if;

  return 'approved'::public.counselor_approval_status;
end;
$function$;

alter function public.approve_counselor(uuid) owner to postgres;

comment on function public.approve_counselor(uuid) is
  'Atomically locks and approves one pending inactive counselor; only an active verified Director may execute it.';

revoke all on function public.approve_counselor(uuid)
  from public, anon, authenticated;
grant execute on function public.approve_counselor(uuid)
  to authenticated;

create or replace function public.reject_counselor(p_user_id uuid)
returns public.counselor_approval_status
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_director_id uuid := (select auth.uid());
  v_approval_status public.counselor_approval_status;
  v_profile_role public.user_role;
  v_profile_is_active boolean;
  v_affected_rows bigint;
  v_changed_at timestamptz := pg_catalog.statement_timestamp();
begin
  if v_director_id is null
    or not public.has_active_verified_kgeo_role(
      'director'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'K-GEO Director authorization is required';
  end if;

  select
    account.approval_status,
    profile.role,
    profile.is_active
  into
    v_approval_status,
    v_profile_role,
    v_profile_is_active
  from public.counselor_accounts as account
  join public.profiles as profile
    on profile.id = account.user_id
  where account.user_id = p_user_id
  for update of account, profile;

  if not found
    or v_profile_role <> 'counselor'::public.user_role
    or v_approval_status <>
      'pending'::public.counselor_approval_status
    or v_profile_is_active then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor rejection target is invalid';
  end if;

  update public.counselor_accounts as account
  set
    approval_status = 'rejected'::public.counselor_approval_status,
    approved_by = null,
    approved_at = null,
    rejected_by = v_director_id,
    rejected_at = v_changed_at,
    updated_at = v_changed_at
  where account.user_id = p_user_id
    and account.approval_status =
      'pending'::public.counselor_approval_status;

  get diagnostics v_affected_rows = row_count;

  if v_affected_rows <> 1 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor rejection transition failed';
  end if;

  update public.profiles as profile
  set
    is_active = false,
    updated_at = v_changed_at
  where profile.id = p_user_id
    and profile.role = 'counselor'::public.user_role
    and not profile.is_active;

  get diagnostics v_affected_rows = row_count;

  if v_affected_rows <> 1 then
    raise exception using
      errcode = '23514',
      message = 'K-GEO counselor rejection state failed';
  end if;

  return 'rejected'::public.counselor_approval_status;
end;
$function$;

alter function public.reject_counselor(uuid) owner to postgres;

comment on function public.reject_counselor(uuid) is
  'Atomically locks and rejects one pending inactive counselor; only an active verified Director may execute it.';

revoke all on function public.reject_counselor(uuid)
  from public, anon, authenticated;
grant execute on function public.reject_counselor(uuid)
  to authenticated;

commit;
