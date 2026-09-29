-- K-GEO final automatic consultation booking and counselor allocation cutover.
-- Student booking becomes one authoritative scheduled-and-assigned transaction.

begin;

set local search_path = '';

-- Fail closed unless the reviewed Step 4.5D scheduling foundation is present
-- and the legacy organization-wide capacity index still protects cutover.
do $prerequisite$
declare
  v_slot_count bigint;
begin
  if pg_catalog.to_regprocedure(
    'public.get_kgeo_consultation_slot_catalog()'
  ) is null then
    raise exception using
      errcode = '55000',
      message = 'Step 4.5D slot catalog is required before automatic allocation';
  end if;

  select pg_catalog.count(*)
  into v_slot_count
  from public.get_kgeo_consultation_slot_catalog();

  if v_slot_count <> 16
    or not exists (
      select 1
      from pg_catalog.pg_indexes as index_record
      where index_record.schemaname = 'public'
        and index_record.tablename = 'consultation_requests'
        and index_record.indexname =
          'consultation_requests_active_slot_key'
    )
    or not exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.consultation_requests'::pg_catalog.regclass
        and trigger_record.tgname =
          'consultation_requests_prepare_insert'
        and trigger_record.tgenabled = 'O'
        and trigger_record.tgisinternal is false
    )
    or not exists (
      select 1
      from pg_catalog.pg_attribute as attribute_record
      where attribute_record.attrelid =
          'public.student_counselor_assignments'::pg_catalog.regclass
        and attribute_record.attname = 'assigned_by'
        and attribute_record.attisdropped is false
    )
    or exists (
      select 1
      from public.student_counselor_assignments as existing_assignment
      where existing_assignment.assigned_by is null
    ) then
    raise exception using
      errcode = '55000',
      message = 'Automatic allocation prerequisites do not match the reviewed contract';
  end if;

  if exists (
    select 1
    from public.consultation_requests as request
    where request.assigned_counselor_id is not null
      and request.consultation_date is not null
      and request.slot_start is not null
      and request.status <> 'cancelled'::public.consultation_status
    group by
      request.assigned_counselor_id,
      request.consultation_date,
      request.slot_start
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '55000',
      message = 'Existing counselor slot capacity conflicts block automatic allocation';
  end if;

  if exists (
    select 1
    from public.consultation_requests as request
    where request.status in (
      'submitted'::public.consultation_status,
      'waiting_for_assignment'::public.consultation_status,
      'counselor_assigned'::public.consultation_status
    )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Retired pending consultations must be resolved before automatic allocation';
  end if;
end;
$prerequisite$;

-- NULL assigned_by is the smallest truthful representation for an assignment
-- created atomically by the system. Existing human audit rows are preserved.
alter table public.student_counselor_assignments
  alter column assigned_by drop not null;

comment on column public.student_counselor_assignments.assigned_by is
  'Trusted human actor for Counselor/Director assignments; NULL means the system created the assignment after the Student chose to continue with K-GEO.';

comment on column public.student_counselor_assignments.assignment_reason is
  'Normalized Director-supplied reassignment reason; NULL is required for historical Counselor-created and automatic system assignments.';

create or replace function public.protect_student_counselor_assignment_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_role public.user_role;
  v_counselor_role public.user_role;
  v_actor_role public.user_role;
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '42501',
      message = 'Primary counselor assignment history cannot be deleted';
  end if;

  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
      or new.student_id is distinct from old.student_id
      or new.counselor_id is distinct from old.counselor_id
      or new.assigned_at is distinct from old.assigned_at
      or new.assigned_by is distinct from old.assigned_by
      or new.assignment_reason is distinct from old.assignment_reason
      or new.created_at is distinct from old.created_at
      or old.ended_at is not null
      or new.ended_at is null then
      raise exception using
        errcode = '42501',
        message = 'Primary counselor assignment history is immutable';
    end if;
  end if;

  select profile.role
  into v_student_role
  from public.profiles as profile
  where profile.id = new.student_id;

  select profile.role
  into v_counselor_role
  from public.profiles as profile
  where profile.id = new.counselor_id;

  v_actor_role := null;
  if new.assigned_by is not null then
    select profile.role
    into v_actor_role
    from public.profiles as profile
    where profile.id = new.assigned_by;
  end if;

  if v_student_role is distinct from 'student'::public.user_role
    or v_counselor_role is distinct from 'counselor'::public.user_role
    or (
      new.assigned_by is not null
      and (
        v_actor_role is null
        or v_actor_role not in (
          'counselor'::public.user_role,
          'director'::public.user_role
        )
      )
    )
    or (
      new.assigned_by is null
      and new.assignment_reason is not null
    )
    or (
      tg_op = 'INSERT'
      and v_actor_role = 'director'::public.user_role
      and new.assignment_reason is null
    ) then
    raise exception using
      errcode = '23514',
      message = 'Primary counselor assignment participants are invalid';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

alter function public.protect_student_counselor_assignment_history()
  owner to postgres;

revoke all on function public.protect_student_counselor_assignment_history()
  from public, anon, authenticated, service_role;

-- Compare any partially installed block table with an independently built
-- copy of the reviewed local contract before reusing it. Foreign keys cannot
-- cross from a temporary relation to public.profiles, so their complete
-- structure is compared separately from trusted catalog metadata below.
create temporary table expected_counselor_consultation_slot_blocks (
  id uuid
    constraint counselor_consultation_slot_blocks_pkey primary key
    default pg_catalog.gen_random_uuid(),
  counselor_id uuid not null,
  consultation_date date not null,
  slot_start time without time zone not null,
  reason text,
  created_at timestamptz not null
    default pg_catalog.statement_timestamp(),
  released_at timestamptz,
  released_by uuid,
  constraint counselor_consultation_slot_blocks_weekday_check
    check (extract(isodow from consultation_date) between 1 and 5),
  constraint counselor_consultation_slot_blocks_start_check
    check (
      slot_start in (
        time '09:00', time '09:30', time '10:00', time '10:30',
        time '11:00', time '11:30', time '12:00', time '12:30',
        time '13:00', time '13:30', time '14:00', time '14:30',
        time '15:00', time '15:30', time '16:00', time '16:30'
      )
    ),
  constraint counselor_consultation_slot_blocks_reason_check
    check (
      reason is null
      or (
        reason = pg_catalog.regexp_replace(
          pg_catalog.btrim(reason),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(reason) between 1 and 200
        and reason !~ '[[:cntrl:]]'
      )
    ),
  constraint counselor_consultation_slot_blocks_release_check
    check (
      (released_at is null and released_by is null)
      or (
        released_at is not null
        and released_by = counselor_id
        and released_at >= created_at
      )
    )
) on commit drop;

do $existing_block_table$
declare
  v_actual_columns jsonb;
  v_expected_columns jsonb;
  v_actual_constraints jsonb;
  v_expected_constraints jsonb;
  v_actual_foreign_keys jsonb;
  v_expected_foreign_keys jsonb;
begin
  if pg_catalog.to_regclass(
    'public.counselor_consultation_slot_blocks'
  ) is not null then
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        attribute_record.attname,
        pg_catalog.format_type(
          attribute_record.atttypid,
          attribute_record.atttypmod
        ),
        attribute_record.attnotnull,
        coalesce(
          pg_catalog.pg_get_expr(
            default_record.adbin,
            default_record.adrelid,
            true
          ),
          ''
        )
      ) order by attribute_record.attnum
    )
    into v_actual_columns
    from pg_catalog.pg_attribute as attribute_record
    left join pg_catalog.pg_attrdef as default_record
      on default_record.adrelid = attribute_record.attrelid
      and default_record.adnum = attribute_record.attnum
    where attribute_record.attrelid =
        'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
      and attribute_record.attnum > 0
      and attribute_record.attisdropped is false;

    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        attribute_record.attname,
        pg_catalog.format_type(
          attribute_record.atttypid,
          attribute_record.atttypmod
        ),
        attribute_record.attnotnull,
        coalesce(
          pg_catalog.pg_get_expr(
            default_record.adbin,
            default_record.adrelid,
            true
          ),
          ''
        )
      ) order by attribute_record.attnum
    )
    into v_expected_columns
    from pg_catalog.pg_attribute as attribute_record
    left join pg_catalog.pg_attrdef as default_record
      on default_record.adrelid = attribute_record.attrelid
      and default_record.adnum = attribute_record.attnum
    where attribute_record.attrelid =
        'expected_counselor_consultation_slot_blocks'::pg_catalog.regclass
      and attribute_record.attnum > 0
      and attribute_record.attisdropped is false;

    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        constraint_record.conname,
        constraint_record.contype,
        constraint_record.convalidated,
        pg_catalog.pg_get_constraintdef(
          constraint_record.oid,
          true
        )
      ) order by constraint_record.conname
    )
    into v_actual_constraints
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid =
        'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
      and constraint_record.contype in ('p', 'c');

    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        constraint_record.conname,
        constraint_record.contype,
        constraint_record.convalidated,
        pg_catalog.pg_get_constraintdef(
          constraint_record.oid,
          true
        )
      ) order by constraint_record.conname
    )
    into v_expected_constraints
    from pg_catalog.pg_constraint as constraint_record
    where constraint_record.conrelid =
        'expected_counselor_consultation_slot_blocks'::pg_catalog.regclass
      and constraint_record.contype in ('p', 'c');

    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        constraint_record.conname,
        source_attribute.attname,
        target_namespace.nspname,
        target_relation.relname,
        target_attribute.attname,
        pg_catalog.cardinality(constraint_record.conkey),
        pg_catalog.cardinality(constraint_record.confkey),
        constraint_record.confmatchtype::text,
        constraint_record.confupdtype::text,
        constraint_record.confdeltype::text,
        constraint_record.condeferrable,
        constraint_record.condeferred,
        constraint_record.convalidated
      ) order by constraint_record.conname
    )
    into v_actual_foreign_keys
    from pg_catalog.pg_constraint as constraint_record
    join pg_catalog.pg_attribute as source_attribute
      on source_attribute.attrelid = constraint_record.conrelid
      and source_attribute.attnum = constraint_record.conkey[1]
      and source_attribute.attisdropped is false
    join pg_catalog.pg_class as target_relation
      on target_relation.oid = constraint_record.confrelid
    join pg_catalog.pg_namespace as target_namespace
      on target_namespace.oid = target_relation.relnamespace
    join pg_catalog.pg_attribute as target_attribute
      on target_attribute.attrelid = constraint_record.confrelid
      and target_attribute.attnum = constraint_record.confkey[1]
      and target_attribute.attisdropped is false
    where constraint_record.conrelid =
        'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
      and constraint_record.contype = 'f';

    with expected_foreign_key (
      constraint_name,
      source_column,
      target_schema,
      target_table,
      target_column,
      source_column_count,
      target_column_count,
      match_type,
      update_action,
      delete_action,
      is_deferrable,
      is_deferred,
      is_validated
    ) as (
      values
        (
          'counselor_consultation_slot_blocks_counselor_id_fkey',
          'counselor_id',
          'public',
          'profiles',
          'id',
          1,
          1,
          's',
          'a',
          'r',
          false,
          false,
          true
        ),
        (
          'counselor_consultation_slot_blocks_released_by_fkey',
          'released_by',
          'public',
          'profiles',
          'id',
          1,
          1,
          's',
          'a',
          'r',
          false,
          false,
          true
        )
    )
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_array(
        expected_foreign_key.constraint_name,
        expected_foreign_key.source_column,
        expected_foreign_key.target_schema,
        expected_foreign_key.target_table,
        expected_foreign_key.target_column,
        expected_foreign_key.source_column_count,
        expected_foreign_key.target_column_count,
        expected_foreign_key.match_type,
        expected_foreign_key.update_action,
        expected_foreign_key.delete_action,
        expected_foreign_key.is_deferrable,
        expected_foreign_key.is_deferred,
        expected_foreign_key.is_validated
      ) order by expected_foreign_key.constraint_name
    )
    into v_expected_foreign_keys
    from expected_foreign_key;

    if v_actual_columns is distinct from v_expected_columns
      or v_actual_constraints is distinct from v_expected_constraints
      or v_actual_foreign_keys is distinct from v_expected_foreign_keys then
      raise exception using
        errcode = '55000',
        message = 'Existing Counselor slot block table does not match the reviewed contract';
    end if;

    if exists (
      select 1
      from pg_catalog.pg_policy as policy_record
      where policy_record.polrelid =
        'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
    ) or exists (
      select 1
      from pg_catalog.pg_trigger as trigger_record
      where trigger_record.tgrelid =
          'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
        and trigger_record.tgisinternal is false
        and trigger_record.tgname <>
          'protect_counselor_consultation_slot_block_history'
    ) then
      raise exception using
        errcode = '55000',
        message = 'Existing Counselor slot block authorization objects are unexpected';
    end if;
  end if;
end;
$existing_block_table$;

create table if not exists public.counselor_consultation_slot_blocks (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  counselor_id uuid not null
    constraint counselor_consultation_slot_blocks_counselor_id_fkey
      references public.profiles(id) on delete restrict,
  consultation_date date not null,
  slot_start time without time zone not null,
  reason text,
  created_at timestamptz not null
    default pg_catalog.statement_timestamp(),
  released_at timestamptz,
  released_by uuid
    constraint counselor_consultation_slot_blocks_released_by_fkey
      references public.profiles(id) on delete restrict,
  constraint counselor_consultation_slot_blocks_weekday_check
    check (extract(isodow from consultation_date) between 1 and 5),
  constraint counselor_consultation_slot_blocks_start_check
    check (
      slot_start in (
        time '09:00', time '09:30', time '10:00', time '10:30',
        time '11:00', time '11:30', time '12:00', time '12:30',
        time '13:00', time '13:30', time '14:00', time '14:30',
        time '15:00', time '15:30', time '16:00', time '16:30'
      )
    ),
  constraint counselor_consultation_slot_blocks_reason_check
    check (
      reason is null
      or (
        reason = pg_catalog.regexp_replace(
          pg_catalog.btrim(reason),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(reason) between 1 and 200
        and reason !~ '[[:cntrl:]]'
      )
    ),
  constraint counselor_consultation_slot_blocks_release_check
    check (
      (released_at is null and released_by is null)
      or (
        released_at is not null
        and released_by = counselor_id
        and released_at >= created_at
      )
    )
);

alter table public.counselor_consultation_slot_blocks owner to postgres;

comment on table public.counselor_consultation_slot_blocks is
  'Append-oriented one-off Counselor slot blocks; active rows have released_at NULL and reasons are never Student-visible.';

do $existing_block_indexes$
declare
  v_one_active_index_oid oid;
  v_active_schedule_index_oid oid;
begin
  if exists (
    select 1
    from public.counselor_consultation_slot_blocks as block
    where block.released_at is null
    group by
      block.counselor_id,
      block.consultation_date,
      block.slot_start
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '55000',
      message = 'Existing active Counselor slot block conflicts prevent convergence';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_index as index_record
    inner join pg_catalog.pg_class as index_relation
      on index_relation.oid = index_record.indexrelid
    where index_record.indrelid =
        'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
      and index_relation.relname not in (
        'counselor_consultation_slot_blocks_pkey',
        'counselor_consultation_slot_blocks_one_active_key',
        'counselor_consultation_slot_blocks_active_schedule_idx'
      )
  ) then
    raise exception using
      errcode = '55000',
      message = 'Existing Counselor slot block index inventory is unexpected';
  end if;

  v_one_active_index_oid := pg_catalog.to_regclass(
    'public.counselor_consultation_slot_blocks_one_active_key'
  );

  if v_one_active_index_oid is not null then
    if not exists (
      select 1
      from pg_catalog.pg_index as index_record
      where index_record.indexrelid = v_one_active_index_oid
        and index_record.indrelid =
          'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
        and index_record.indisunique is true
        and index_record.indisvalid is true
        and index_record.indisready is true
        and index_record.indnkeyatts = 3
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          1,
          true
        ) = 'counselor_id'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          2,
          true
        ) = 'consultation_date'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          3,
          true
        ) = 'slot_start'
        and pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(
              index_record.indpred,
              index_record.indrelid,
              true
            )
          ),
          '[()[:space:]]+',
          '',
          'g'
        ) = 'released_atisnull'
    ) then
      raise exception using
        errcode = '55000',
        message = 'Existing active Counselor block index does not match the reviewed contract';
    end if;
  end if;

  v_active_schedule_index_oid := pg_catalog.to_regclass(
    'public.counselor_consultation_slot_blocks_active_schedule_idx'
  );

  if v_active_schedule_index_oid is not null then
    if not exists (
      select 1
      from pg_catalog.pg_index as index_record
      where index_record.indexrelid = v_active_schedule_index_oid
        and index_record.indrelid =
          'public.counselor_consultation_slot_blocks'::pg_catalog.regclass
        and index_record.indisunique is false
        and index_record.indisvalid is true
        and index_record.indisready is true
        and index_record.indnkeyatts = 3
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          1,
          true
        ) = 'consultation_date'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          2,
          true
        ) = 'slot_start'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          3,
          true
        ) = 'counselor_id'
        and pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(
              index_record.indpred,
              index_record.indrelid,
              true
            )
          ),
          '[()[:space:]]+',
          '',
          'g'
        ) = 'released_atisnull'
    ) then
      raise exception using
        errcode = '55000',
        message = 'Existing Counselor block schedule index does not match the reviewed contract';
    end if;
  end if;
end;
$existing_block_indexes$;

create unique index if not exists
  counselor_consultation_slot_blocks_one_active_key
  on public.counselor_consultation_slot_blocks (
    counselor_id,
    consultation_date,
    slot_start
  )
  where released_at is null;

create index if not exists
  counselor_consultation_slot_blocks_active_schedule_idx
  on public.counselor_consultation_slot_blocks (
    consultation_date,
    slot_start,
    counselor_id
  )
  where released_at is null;

create or replace function public.protect_counselor_consultation_slot_block_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception using
      errcode = '42501',
      message = 'Counselor slot block history cannot be deleted';
  end if;

  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.counselor_id is distinct from old.counselor_id
    or new.consultation_date is distinct from old.consultation_date
    or new.slot_start is distinct from old.slot_start
    or new.reason is distinct from old.reason
    or new.created_at is distinct from old.created_at
    or old.released_at is not null
    or old.released_by is not null
    or new.released_at is null
    or new.released_by is distinct from old.counselor_id
  ) then
    raise exception using
      errcode = '42501',
      message = 'Counselor slot block history is immutable';
  end if;

  if not exists (
    select 1
    from public.profiles as profile
    where profile.id = new.counselor_id
      and profile.role = 'counselor'::public.user_role
  ) then
    raise exception using
      errcode = '23514',
      message = 'Counselor slot block owner is invalid';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

alter function public.protect_counselor_consultation_slot_block_history()
  owner to postgres;

revoke all on function public.protect_counselor_consultation_slot_block_history()
  from public, anon, authenticated, service_role;

create or replace trigger protect_counselor_consultation_slot_block_history
before insert or update or delete
on public.counselor_consultation_slot_blocks
for each row execute function
  public.protect_counselor_consultation_slot_block_history();

alter table public.counselor_consultation_slot_blocks
  enable row level security;

alter table public.counselor_consultation_slot_blocks
  force row level security;

revoke all on table public.counselor_consultation_slot_blocks
  from public, anon, authenticated, service_role;

create or replace function public.kgeo_consultation_slot_lock_key(
  p_counselor_id uuid,
  p_consultation_date date,
  p_slot_start time without time zone
)
returns bigint
language sql
immutable
strict
parallel safe
set search_path = ''
as $function$
  select pg_catalog.hashtextextended(
    p_counselor_id::text
      || '|' || p_consultation_date::text
      || '|' || p_slot_start::text,
    0
  );
$function$;

alter function public.kgeo_consultation_slot_lock_key(uuid, date, time)
  owner to postgres;

revoke all on function
  public.kgeo_consultation_slot_lock_key(uuid, date, time)
  from public, anon, authenticated, service_role;

create or replace function public.block_my_consultation_slot(
  p_consultation_date date,
  p_slot_start time without time zone,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
  v_business_now timestamp without time zone;
  v_reason text;
  v_block_id uuid;
begin
  v_business_now :=
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata';

  if v_caller_id is null
    or p_consultation_date is null
    or p_slot_start is null
    or p_consultation_date < v_business_now::date
    or (
      p_consultation_date = v_business_now::date
      and p_slot_start <= v_business_now::time
    )
    or extract(isodow from p_consultation_date) not between 1 and 5
    or not exists (
      select 1
      from public.get_kgeo_consultation_slot_catalog() as catalog
      where catalog.slot_start = p_slot_start
    ) then
    raise exception using
      errcode = '22023',
      message = 'Choose a future canonical Counselor slot';
  end if;

  if p_reason is not null then
    if p_reason ~ '[[:cntrl:]]' then
      raise exception using
        errcode = '22023',
        message = 'The slot block reason is invalid';
    end if;
    v_reason := pg_catalog.regexp_replace(
      pg_catalog.btrim(p_reason),
      '[[:space:]]+',
      ' ',
      'g'
    );
    if pg_catalog.char_length(v_reason) not between 1 and 200 then
      raise exception using
        errcode = '22023',
        message = 'The slot block reason is invalid';
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.kgeo_consultation_slot_lock_key(
      v_caller_id,
      p_consultation_date,
      p_slot_start
    )
  );

  perform 1
  from public.profiles as counselor_profile
  inner join public.counselor_accounts as account
    on account.user_id = counselor_profile.id
  inner join auth.users as counselor_auth
    on counselor_auth.id = counselor_profile.id
  where counselor_profile.id = v_caller_id
    and counselor_profile.role = 'counselor'::public.user_role
    and counselor_profile.is_active is true
    and account.approval_status =
      'approved'::public.counselor_approval_status
    and counselor_auth.email_confirmed_at is not null
  for update of counselor_profile, account, counselor_auth;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'An approved active verified Counselor is required';
  end if;

  if exists (
    select 1
    from public.consultation_requests as request
    where request.assigned_counselor_id = v_caller_id
      and request.consultation_date = p_consultation_date
      and request.slot_start = p_slot_start
      and request.status <> 'cancelled'::public.consultation_status
  ) then
    raise exception using
      errcode = '23514',
      message = 'An assigned consultation already occupies this slot';
  end if;

  insert into public.counselor_consultation_slot_blocks as block (
    counselor_id,
    consultation_date,
    slot_start,
    reason,
    created_at
  ) values (
    v_caller_id,
    p_consultation_date,
    p_slot_start,
    v_reason,
    pg_catalog.statement_timestamp()
  )
  returning block.id into v_block_id;

  return v_block_id;
exception
  when unique_violation then
    raise exception using
      errcode = '23505',
      message = 'This Counselor slot is already blocked';
end;
$function$;

alter function public.block_my_consultation_slot(date, time, text)
  owner to postgres;

comment on function public.block_my_consultation_slot(date, time, text) is
  'Allows an approved active verified Counselor to block only their own future canonical unbooked slot.';

revoke all on function public.block_my_consultation_slot(date, time, text)
  from public, anon, authenticated, service_role;

grant execute on function public.block_my_consultation_slot(date, time, text)
  to authenticated;

create or replace function public.release_my_consultation_slot_block(
  p_block_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
  v_consultation_date date;
  v_slot_start time without time zone;
begin
  if v_caller_id is null or p_block_id is null then
    raise exception using
      errcode = '22023',
      message = 'The Counselor slot block is invalid';
  end if;

  select
    block.consultation_date,
    block.slot_start
  into
    v_consultation_date,
    v_slot_start
  from public.counselor_consultation_slot_blocks as block
  where block.id = p_block_id
    and block.counselor_id = v_caller_id
    and block.released_at is null;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'The active Counselor slot block was not found';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    public.kgeo_consultation_slot_lock_key(
      v_caller_id,
      v_consultation_date,
      v_slot_start
    )
  );

  perform 1
  from public.profiles as counselor_profile
  inner join public.counselor_accounts as account
    on account.user_id = counselor_profile.id
  inner join auth.users as counselor_auth
    on counselor_auth.id = counselor_profile.id
  where counselor_profile.id = v_caller_id
    and counselor_profile.role = 'counselor'::public.user_role
    and counselor_profile.is_active is true
    and account.approval_status =
      'approved'::public.counselor_approval_status
    and counselor_auth.email_confirmed_at is not null
  for update of counselor_profile, account, counselor_auth;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'An approved active verified Counselor is required';
  end if;

  update public.counselor_consultation_slot_blocks as block
  set
    released_at = pg_catalog.statement_timestamp(),
    released_by = v_caller_id
  where block.id = p_block_id
    and block.counselor_id = v_caller_id
    and block.consultation_date = v_consultation_date
    and block.slot_start = v_slot_start
    and block.released_at is null;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The Counselor slot block changed concurrently';
  end if;

  return true;
end;
$function$;

alter function public.release_my_consultation_slot_block(uuid)
  owner to postgres;

comment on function public.release_my_consultation_slot_block(uuid) is
  'Releases only the caller-owned active slot block while retaining immutable block history.';

revoke all on function public.release_my_consultation_slot_block(uuid)
  from public, anon, authenticated, service_role;

grant execute on function public.release_my_consultation_slot_block(uuid)
  to authenticated;

create or replace function public.list_my_active_consultation_slot_blocks()
returns table (
  block_id uuid,
  consultation_date date,
  slot_start time without time zone,
  slot_end time without time zone,
  reason text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
begin
  if v_caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as account
      on account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = v_caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An approved active verified Counselor is required';
  end if;

  return query
  select
    block.id,
    block.consultation_date,
    block.slot_start,
    (block.slot_start + interval '30 minutes')::time,
    block.reason,
    block.created_at
  from public.counselor_consultation_slot_blocks as block
  where block.counselor_id = v_caller_id
    and block.released_at is null
  order by block.consultation_date, block.slot_start, block.id
  limit 100;
end;
$function$;

alter function public.list_my_active_consultation_slot_blocks()
  owner to postgres;

revoke all on function public.list_my_active_consultation_slot_blocks()
  from public, anon, authenticated, service_role;

grant execute on function public.list_my_active_consultation_slot_blocks()
  to authenticated;

do $existing_consultation_indexes$
declare
  v_student_slot_index_oid oid;
  v_counselor_slot_index_oid oid;
begin
  if exists (
    select 1
    from public.consultation_requests as request
    where request.status <> 'cancelled'::public.consultation_status
      and request.student_id is not null
      and request.consultation_date is not null
      and request.slot_start is not null
    group by
      request.student_id,
      request.consultation_date,
      request.slot_start
    having pg_catalog.count(*) > 1
  ) then
    raise exception using
      errcode = '55000',
      message = 'Existing Student consultation slot conflicts prevent convergence';
  end if;

  v_student_slot_index_oid := pg_catalog.to_regclass(
    'public.consultation_requests_active_student_slot_key'
  );

  if v_student_slot_index_oid is not null then
    if not exists (
      select 1
      from pg_catalog.pg_index as index_record
      where index_record.indexrelid = v_student_slot_index_oid
        and index_record.indrelid =
          'public.consultation_requests'::pg_catalog.regclass
        and index_record.indisunique is true
        and index_record.indisvalid is true
        and index_record.indisready is true
        and index_record.indnkeyatts = 3
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          1,
          true
        ) = 'student_id'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          2,
          true
        ) = 'consultation_date'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          3,
          true
        ) = 'slot_start'
        and pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(
              index_record.indpred,
              index_record.indrelid,
              true
            )
          ),
          '[()[:space:]]+',
          '',
          'g'
        ) = 'status<>''cancelled''::public.consultation_status'
    ) then
      raise exception using
        errcode = '55000',
        message = 'Existing Student consultation slot index does not match the reviewed contract';
    end if;
  end if;

  v_counselor_slot_index_oid := pg_catalog.to_regclass(
    'public.consultation_requests_active_counselor_slot_key'
  );

  if v_counselor_slot_index_oid is not null then
    if not exists (
      select 1
      from pg_catalog.pg_index as index_record
      where index_record.indexrelid = v_counselor_slot_index_oid
        and index_record.indrelid =
          'public.consultation_requests'::pg_catalog.regclass
        and index_record.indisunique is true
        and index_record.indisvalid is true
        and index_record.indisready is true
        and index_record.indnkeyatts = 3
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          1,
          true
        ) = 'assigned_counselor_id'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          2,
          true
        ) = 'consultation_date'
        and pg_catalog.pg_get_indexdef(
          index_record.indexrelid,
          3,
          true
        ) = 'slot_start'
        and pg_catalog.regexp_replace(
          pg_catalog.lower(
            pg_catalog.pg_get_expr(
              index_record.indpred,
              index_record.indrelid,
              true
            )
          ),
          '[()[:space:]]+',
          '',
          'g'
        ) = 'assigned_counselor_idisnotnullandstatus<>''cancelled''::public.consultation_status'
    ) then
      raise exception using
        errcode = '55000',
        message = 'Existing Counselor consultation slot index does not match the reviewed contract';
    end if;
  end if;
end;
$existing_consultation_indexes$;

-- A Student may hold multiple consultations, but never two non-cancelled
-- consultations at the exact same canonical date and start. Cancelled rows do
-- not prevent a valid rebooking.
create unique index if not exists
  consultation_requests_active_student_slot_key
  on public.consultation_requests (
    student_id,
    consultation_date,
    slot_start
  )
  where status <> 'cancelled'::public.consultation_status;

comment on index public.consultation_requests_active_student_slot_key is
  'Prevents one Student from holding duplicate non-cancelled consultations at the same business date and canonical start while allowing cancelled-slot rebooking.';

-- Install per-Counselor capacity before removing the global V1 index.
create unique index if not exists
  consultation_requests_active_counselor_slot_key
  on public.consultation_requests (
    assigned_counselor_id,
    consultation_date,
    slot_start
  )
  where assigned_counselor_id is not null
    and status <> 'cancelled'::public.consultation_status;

comment on index public.consultation_requests_active_counselor_slot_key is
  'Prevents one Counselor from owning two non-cancelled consultations at the same business date and start while preserving factual completed/no-show history.';

create or replace function public.book_student_consultation(
  p_student_name text,
  p_roll_number text,
  p_personal_email text,
  p_college_end_year integer,
  p_department text,
  p_course text,
  p_mobile_number text,
  p_higher_studies_interest public.higher_studies_interest,
  p_consultation_date date,
  p_slot_start time without time zone
)
returns table (
  request_number text,
  consultation_date date,
  slot_start time without time zone,
  slot_end time without time zone,
  status public.consultation_status
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid := (select auth.uid());
  v_college_email text;
  v_student_name text;
  v_roll_number text;
  v_personal_email text;
  v_department text;
  v_course text;
  v_mobile_number text;
  v_request_time timestamptz;
  v_business_now timestamp without time zone;
  v_business_today date;
  v_slot_end time without time zone;
  v_primary_counselor_id uuid;
  v_selected_counselor_id uuid;
  v_candidate record;
  v_request_number text;
  v_request_sequence bigint;
begin
  v_request_time := pg_catalog.statement_timestamp();
  v_business_now := v_request_time at time zone 'Asia/Kolkata';
  v_business_today := v_business_now::date;

  if v_student_id is null then
    raise exception using
      errcode = '42501',
      message = 'An active verified Student is required';
  end if;

  select student_profile.college_email
  into v_college_email
  from public.profiles as student_profile
  inner join auth.users as student_auth
    on student_auth.id = student_profile.id
  where student_profile.id = v_student_id
    and student_profile.role = 'student'::public.user_role
    and student_profile.is_active is true
    and student_auth.email_confirmed_at is not null
  for update of student_profile, student_auth;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'An active verified Student is required';
  end if;

  v_student_name := pg_catalog.btrim(p_student_name);
  v_roll_number := pg_catalog.upper(pg_catalog.btrim(p_roll_number));
  v_personal_email := pg_catalog.lower(pg_catalog.btrim(p_personal_email));
  v_department := pg_catalog.btrim(p_department);
  v_course := pg_catalog.btrim(p_course);
  v_mobile_number := pg_catalog.btrim(p_mobile_number);

  if v_student_name is null
    or pg_catalog.char_length(v_student_name) not between 1 and 150
    or v_roll_number is null
    or pg_catalog.char_length(v_roll_number) not between 1 and 50
    or v_personal_email is null
    or pg_catalog.char_length(v_personal_email) > 320
    or v_personal_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    or p_college_end_year is null
    or p_college_end_year not between 2024 and 2040
    or v_department is null
    or pg_catalog.char_length(v_department) not between 1 and 150
    or v_course is null
    or pg_catalog.char_length(v_course) not between 1 and 150
    or v_mobile_number is null
    or v_mobile_number !~ '^[0-9]{10}$'
    or p_higher_studies_interest is null then
    raise exception using
      errcode = '22023',
      message = 'The consultation booking details are invalid';
  end if;

  if p_consultation_date is null
    or p_slot_start is null
    or p_consultation_date < v_business_today
    or p_consultation_date > v_business_today + 6
    or extract(isodow from p_consultation_date) not between 1 and 5
    or (
      p_consultation_date = v_business_today
      and p_slot_start <= v_business_now::time
    ) then
    raise exception using
      errcode = '23514',
      message = 'The selected consultation date or slot is unavailable';
  end if;

  select catalog.slot_end
  into v_slot_end
  from public.get_kgeo_consultation_slot_catalog() as catalog
  where catalog.slot_start = p_slot_start;

  if not found then
    raise exception using
      errcode = '23514',
      message = 'The selected consultation date or slot is unavailable';
  end if;

  -- Student profile -> nonterminal consultations -> Primary assignment is the
  -- shared Student-side lock order used by booking and reassignment workflows.
  perform 1
  from public.consultation_requests as existing
  where existing.student_id = v_student_id
    and existing.status in (
      'submitted'::public.consultation_status,
      'waiting_for_assignment'::public.consultation_status,
      'counselor_assigned'::public.consultation_status,
      'scheduled'::public.consultation_status
    )
  order by existing.id
  for update;

  if exists (
    select 1
    from public.consultation_requests as existing
    where existing.student_id = v_student_id
      and existing.status in (
        'submitted'::public.consultation_status,
        'waiting_for_assignment'::public.consultation_status,
        'counselor_assigned'::public.consultation_status,
        'scheduled'::public.consultation_status
      )
      and (
        existing.consultation_date is null
        or existing.slot_start is null
        or existing.slot_end is null
        or existing.slot_end <= existing.slot_start
        or extract(isodow from existing.consultation_date)
          not between 1 and 5
        or not exists (
          select 1
          from public.get_kgeo_consultation_slot_catalog() as catalog
          where catalog.slot_start = existing.slot_start
            and catalog.slot_end = existing.slot_end
        )
      )
  ) then
    raise exception using
      errcode = '23514',
      message = 'An existing consultation requires operational resolution';
  end if;

  select assignment.counselor_id
  into v_primary_counselor_id
  from public.student_counselor_assignments as assignment
  where assignment.student_id = v_student_id
    and assignment.ended_at is null
  for update;

  v_selected_counselor_id := null;

  for v_candidate in
    select
      counselor_profile.id as counselor_id,
      case
        when counselor_profile.id = v_primary_counselor_id then 0
        else 1
      end as primary_priority,
      (
        select pg_catalog.count(*)
        from public.consultation_requests as workload
        where workload.assigned_counselor_id = counselor_profile.id
          and workload.consultation_date = p_consultation_date
          and workload.status in (
            'counselor_assigned'::public.consultation_status,
            'scheduled'::public.consultation_status,
            'completed'::public.consultation_status,
            'no_show'::public.consultation_status
          )
      ) as daily_workload
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as account
      on account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
    order by
      primary_priority,
      daily_workload,
      counselor_profile.id
  loop
    if not pg_catalog.pg_try_advisory_xact_lock(
      public.kgeo_consultation_slot_lock_key(
        v_candidate.counselor_id,
        p_consultation_date,
        p_slot_start
      )
    ) then
      continue;
    end if;

    perform 1
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as account
      on account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = v_candidate.counselor_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
    for update of counselor_profile, account, counselor_auth;

    if not found then
      continue;
    end if;

    if exists (
      select 1
      from public.counselor_consultation_slot_blocks as block
      where block.counselor_id = v_candidate.counselor_id
        and block.consultation_date = p_consultation_date
        and block.slot_start = p_slot_start
        and block.released_at is null
    ) or exists (
      select 1
      from public.consultation_requests as occupied
      where occupied.assigned_counselor_id = v_candidate.counselor_id
        and occupied.consultation_date = p_consultation_date
        and occupied.slot_start = p_slot_start
        and occupied.status <> 'cancelled'::public.consultation_status
    ) then
      continue;
    end if;

    v_selected_counselor_id := v_candidate.counselor_id;
    exit;
  end loop;

  if v_selected_counselor_id is null then
    raise exception using
      errcode = 'P0001',
      message = 'No Counselor is available for the selected consultation slot';
  end if;

  v_request_sequence := pg_catalog.nextval(
    'public.consultation_request_number_seq'::pg_catalog.regclass
  );
  v_request_number := pg_catalog.format(
    'KGEOC-%s-%s',
    pg_catalog.to_char(v_request_time, 'YYYY'),
    pg_catalog.lpad(v_request_sequence::text, 6, '0')
  );

  insert into public.consultation_requests (
    student_id,
    request_number,
    student_name,
    roll_number,
    college_email,
    personal_email,
    college_end_year,
    department,
    course,
    mobile_number,
    higher_studies_interest,
    status,
    assigned_counselor_id,
    consultation_date,
    slot_start,
    slot_end,
    submitted_at,
    assigned_at,
    created_at,
    updated_at
  ) values (
    v_student_id,
    v_request_number,
    v_student_name,
    v_roll_number,
    v_college_email,
    v_personal_email,
    p_college_end_year,
    v_department,
    v_course,
    v_mobile_number,
    p_higher_studies_interest,
    'scheduled'::public.consultation_status,
    v_selected_counselor_id,
    p_consultation_date,
    p_slot_start,
    v_slot_end,
    v_request_time,
    v_request_time,
    v_request_time,
    v_request_time
  );

  return query
  select
    v_request_number,
    p_consultation_date,
    p_slot_start,
    v_slot_end,
    'scheduled'::public.consultation_status;
end;
$function$;

alter function public.book_student_consultation(
  text, text, text, integer, text, text, text,
  public.higher_studies_interest, date, time
) owner to postgres;

comment on function public.book_student_consultation(
  text, text, text, integer, text, text, text,
  public.higher_studies_interest, date, time
) is
  'Atomically validates a Student booking, prefers an eligible existing Primary Counselor, falls back by daily workload and UUID, and schedules the consultation without activating a new Primary case.';

revoke all on function public.book_student_consultation(
  text, text, text, integer, text, text, text,
  public.higher_studies_interest, date, time
) from public, anon, authenticated, service_role;

grant execute on function public.book_student_consultation(
  text, text, text, integer, text, text, text,
  public.higher_studies_interest, date, time
) to authenticated;

-- A completed initial consultation becomes a managed K-GEO case only after
-- the Student explicitly continues. The consultation's assigned Counselor is
-- the sole trusted source for the initial Primary assignment.
create or replace function public.continue_with_kgeo()
returns boolean
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid := (select auth.uid());
  v_consultation_counselor_id uuid;
  v_existing_primary_id uuid;
  v_assignment_time timestamptz := pg_catalog.statement_timestamp();
  v_business_now timestamp without time zone;
begin
  if v_student_id is null then
    raise exception using
      errcode = '42501',
      message = 'An active verified Student is required';
  end if;

  v_business_now := v_assignment_time at time zone 'Asia/Kolkata';

  perform 1
  from public.profiles as student_profile
  inner join auth.users as student_auth
    on student_auth.id = student_profile.id
  where student_profile.id = v_student_id
    and student_profile.role = 'student'::public.user_role
    and student_profile.is_active is true
    and student_auth.email_confirmed_at is not null
  for update of student_profile, student_auth;

  if not found then
    raise exception using
      errcode = '42501',
      message = 'An active verified Student is required';
  end if;

  select request.assigned_counselor_id
  into v_consultation_counselor_id
  from public.consultation_requests as request
  where request.student_id = v_student_id
    and request.status = 'completed'::public.consultation_status
    and request.assigned_counselor_id is not null
    and request.consultation_date is not null
    and request.slot_start is not null
    and request.slot_end is not null
    and request.slot_end > request.slot_start
    and (
      request.consultation_date < v_business_now::date
      or (
        request.consultation_date = v_business_now::date
        and request.slot_end <= v_business_now::time
      )
    )
    and exists (
      select 1
      from public.get_kgeo_consultation_slot_catalog() as catalog
      where catalog.slot_start = request.slot_start
        and catalog.slot_end = request.slot_end
    )
  order by
    request.consultation_date desc,
    request.slot_end desc,
    request.id desc
  limit 1
  for update of request;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'A completed Student consultation is required to continue with K-GEO';
  end if;

  select assignment.id
  into v_existing_primary_id
  from public.student_counselor_assignments as assignment
  where assignment.student_id = v_student_id
    and assignment.ended_at is null
  for update;

  if found then
    return false;
  end if;

  perform 1
  from public.profiles as counselor_profile
  inner join public.counselor_accounts as account
    on account.user_id = counselor_profile.id
  inner join auth.users as counselor_auth
    on counselor_auth.id = counselor_profile.id
  where counselor_profile.id = v_consultation_counselor_id
    and counselor_profile.role = 'counselor'::public.user_role
    and counselor_profile.is_active is true
    and account.approval_status =
      'approved'::public.counselor_approval_status
    and counselor_auth.email_confirmed_at is not null
  for update of counselor_profile, account, counselor_auth;

  if not found then
    raise exception using
      errcode = '55000',
      message = 'K-GEO staff review is required before this case can be activated';
  end if;

  insert into public.student_counselor_assignments (
    student_id,
    counselor_id,
    assigned_at,
    assigned_by,
    ended_at,
    created_at,
    assignment_reason
  ) values (
    v_student_id,
    v_consultation_counselor_id,
    v_assignment_time,
    null,
    null,
    v_assignment_time,
    null
  );

  return true;
end;
$function$;

alter function public.continue_with_kgeo() owner to postgres;

comment on function public.continue_with_kgeo() is
  'Activates one Student Primary Counselor case from that Student''s latest eligible completed assigned consultation; returns false when an active Primary assignment already exists.';

revoke all on function public.continue_with_kgeo()
  from public, anon, authenticated, service_role;

grant execute on function public.continue_with_kgeo()
  to authenticated;

-- The historical enum retains its old value for compatibility. The final
-- Student projection returns text so every unavailable cause collapses to one
-- non-diagnostic value.
revoke execute on function public.get_consultation_slot_availability(date)
  from public, anon, authenticated, service_role;

drop function if exists public.get_consultation_slot_availability(date);

create function public.get_consultation_slot_availability(
  p_date date
)
returns table (
  slot_start time without time zone,
  slot_end time without time zone,
  availability_status text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid := (select auth.uid());
  v_business_now timestamp without time zone;
begin
  v_business_now :=
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata';

  if v_student_id is null or not exists (
    select 1
    from public.profiles as student_profile
    inner join auth.users as student_auth
      on student_auth.id = student_profile.id
    where student_profile.id = v_student_id
      and student_profile.role = 'student'::public.user_role
      and student_profile.is_active is true
      and student_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified Student is required';
  end if;

  if p_date is null
    or p_date < v_business_now::date
    or p_date > v_business_now::date + 6
    or extract(isodow from p_date) not between 1 and 5 then
    raise exception using
      errcode = '22023',
      message = 'Choose a weekday inside the next seven calendar dates';
  end if;

  return query
  select
    catalog.slot_start,
    catalog.slot_end,
    case
      when p_date = v_business_now::date
        and catalog.slot_start <= v_business_now::time
        then 'expired'::text
      when exists (
        select 1
        from public.consultation_requests as student_booking
        where student_booking.student_id = v_student_id
          and student_booking.consultation_date = p_date
          and student_booking.slot_start = catalog.slot_start
          and student_booking.status <>
            'cancelled'::public.consultation_status
      ) then 'unavailable'::text
      when exists (
        select 1
        from public.profiles as counselor_profile
        inner join public.counselor_accounts as account
          on account.user_id = counselor_profile.id
        inner join auth.users as counselor_auth
          on counselor_auth.id = counselor_profile.id
        where counselor_profile.role = 'counselor'::public.user_role
          and counselor_profile.is_active is true
          and account.approval_status =
            'approved'::public.counselor_approval_status
          and counselor_auth.email_confirmed_at is not null
          and not exists (
            select 1
            from public.counselor_consultation_slot_blocks as block
            where block.counselor_id = counselor_profile.id
              and block.consultation_date = p_date
              and block.slot_start = catalog.slot_start
              and block.released_at is null
          )
          and not exists (
            select 1
            from public.consultation_requests as occupied
            where occupied.assigned_counselor_id = counselor_profile.id
              and occupied.consultation_date = p_date
              and occupied.slot_start = catalog.slot_start
              and occupied.status <>
                'cancelled'::public.consultation_status
          )
      ) then 'available'::text
      else 'unavailable'::text
    end
  from public.get_kgeo_consultation_slot_catalog() as catalog
  order by catalog.slot_ordinal;
end;
$function$;

alter function public.get_consultation_slot_availability(date)
  owner to postgres;

comment on function public.get_consultation_slot_availability(date) is
  'Returns all sixteen canonical slots with only minimal Student-safe availability after checking eligible Counselor capacity and active blocks.';

revoke all on function public.get_consultation_slot_availability(date)
  from public, anon, authenticated, service_role;

grant execute on function public.get_consultation_slot_availability(date)
  to authenticated;

create or replace function public.list_my_assigned_consultations(
  p_date_from date default null,
  p_date_to date default null,
  p_limit integer default 100
)
returns table (
  id uuid,
  request_number text,
  student_id uuid,
  student_name text,
  course text,
  department text,
  college_end_year integer,
  cgpa numeric,
  cgpa_scale numeric,
  active_backlogs integer,
  higher_studies_interest public.higher_studies_interest,
  target_intake text,
  preferred_countries text[],
  ready_for_counseling boolean,
  consultation_date date,
  slot_start time without time zone,
  slot_end time without time zone,
  status public.consultation_status,
  submitted_at timestamptz,
  is_primary_counselor boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
begin
  if v_caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as account
      on account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = v_caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'Assigned consultations are temporarily unavailable';
  end if;

  if p_limit is null
    or p_limit not between 1 and 200
    or (p_date_from is not null and p_date_to is not null
      and p_date_to < p_date_from)
    or (p_date_from is not null and p_date_to is not null
      and p_date_to > p_date_from + 366) then
    raise exception using
      errcode = '22023',
      message = 'Assigned consultation filters are invalid';
  end if;

  return query
  select
    request.id,
    request.request_number,
    case when assignment.id is not null then request.student_id else null end,
    request.student_name,
    request.course,
    request.department,
    request.college_end_year,
    student_profile.cgpa,
    student_profile.cgpa_scale,
    student_profile.active_backlogs,
    request.higher_studies_interest,
    preference.target_intake,
    coalesce(preference.preferred_countries, array[]::text[]),
    completion.ready_for_counseling,
    request.consultation_date,
    request.slot_start,
    request.slot_end,
    request.status,
    request.submitted_at,
    assignment.id is not null
  from public.consultation_requests as request
  left join public.student_counselor_assignments as assignment
    on assignment.student_id = request.student_id
    and assignment.counselor_id = v_caller_id
    and assignment.ended_at is null
  left join public.student_profiles as student_profile
    on student_profile.student_id = request.student_id
  left join public.student_preferences as preference
    on preference.student_id = request.student_id
  left join public.student_profile_completion as completion
    on completion.student_id = request.student_id
  where request.assigned_counselor_id = v_caller_id
    and (p_date_from is null or request.consultation_date >= p_date_from)
    and (p_date_to is null or request.consultation_date <= p_date_to)
  order by
    request.consultation_date asc nulls last,
    request.slot_start asc nulls last,
    request.id asc
  limit p_limit;
end;
$function$;

alter function public.list_my_assigned_consultations(date, date, integer)
  owner to postgres;

comment on function public.list_my_assigned_consultations(date, date, integer) is
  'Returns a bounded consultation-safe projection only for sessions assigned to the Counselor caller; Student IDs are returned only for current Primary ownership.';

revoke all on function
  public.list_my_assigned_consultations(date, date, integer)
  from public, anon, authenticated, service_role;

grant execute on function
  public.list_my_assigned_consultations(date, date, integer)
  to authenticated;

create or replace function public.get_my_consultation_dashboard_metrics()
returns table (
  today_count bigint,
  upcoming_count bigint,
  outcome_required_count bigint,
  completed_count bigint,
  no_show_count bigint,
  cancelled_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
  v_business_now timestamp without time zone;
begin
  if v_caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as account
      on account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = v_caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'Consultation metrics are temporarily unavailable';
  end if;

  v_business_now :=
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata';

  return query
  select
    pg_catalog.count(*) filter (
      where request.consultation_date = v_business_now::date
        and request.status <> 'cancelled'::public.consultation_status
    ),
    pg_catalog.count(*) filter (
      where request.status = 'scheduled'::public.consultation_status
        and (
          request.consultation_date > v_business_now::date
          or (
            request.consultation_date = v_business_now::date
            and request.slot_end > v_business_now::time
          )
        )
    ),
    pg_catalog.count(*) filter (
      where request.status = 'scheduled'::public.consultation_status
        and (
          request.consultation_date < v_business_now::date
          or (
            request.consultation_date = v_business_now::date
            and request.slot_end <= v_business_now::time
          )
        )
    ),
    pg_catalog.count(*) filter (
      where request.status = 'completed'::public.consultation_status
    ),
    pg_catalog.count(*) filter (
      where request.status = 'no_show'::public.consultation_status
    ),
    pg_catalog.count(*) filter (
      where request.status = 'cancelled'::public.consultation_status
    )
  from public.consultation_requests as request
  where request.assigned_counselor_id = v_caller_id;
end;
$function$;

alter function public.get_my_consultation_dashboard_metrics()
  owner to postgres;

revoke all on function public.get_my_consultation_dashboard_metrics()
  from public, anon, authenticated, service_role;

grant execute on function public.get_my_consultation_dashboard_metrics()
  to authenticated;

-- Reference lookup is retained for Primary Workspace compatibility but now
-- authorizes each result as either current Primary ownership or assignment to
-- this exact consultation.
create or replace function public.get_counselor_consultation_references(
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
  v_caller_id uuid := (select auth.uid());
  v_requested_count integer;
begin
  if v_caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join public.counselor_accounts as account
      on account.user_id = counselor_profile.id
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = v_caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and account.approval_status =
        'approved'::public.counselor_approval_status
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'Consultation references are temporarily unavailable';
  end if;

  v_requested_count := pg_catalog.cardinality(p_consultation_ids);
  if p_consultation_ids is null
    or v_requested_count not between 1 and 100
    or pg_catalog.array_position(p_consultation_ids, null) is not null
    or (
      select pg_catalog.count(distinct requested.consultation_id)
      from pg_catalog.unnest(p_consultation_ids)
        as requested(consultation_id)
    ) <> v_requested_count then
    raise exception using
      errcode = '22023',
      message = 'Provide between 1 and 100 unique consultation identifiers';
  end if;

  return query
  select request.id, request.request_number
  from public.consultation_requests as request
  where request.id = any (p_consultation_ids)
    and (
      request.assigned_counselor_id = v_caller_id
      or public.is_active_primary_counselor_for_student(request.student_id)
    )
  order by request.id;
end;
$function$;

alter function public.get_counselor_consultation_references(uuid[])
  owner to postgres;

revoke all on function public.get_counselor_consultation_references(uuid[])
  from public, anon, authenticated, service_role;

grant execute on function public.get_counselor_consultation_references(uuid[])
  to authenticated;

-- Retire broad Counselor table reads. Primary Counselors retain case-history
-- reads; covering Counselors use only the bounded assigned-session projection.
drop policy if exists consultation_requests_select_counselor_all
  on public.consultation_requests;

drop policy if exists consultation_requests_select_primary_counselor
  on public.consultation_requests;

create policy consultation_requests_select_primary_counselor
on public.consultation_requests
for select
to authenticated
using (
  public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  )
  and exists (
    select 1
    from public.counselor_accounts as account
    where account.user_id = (select auth.uid())
      and account.approval_status =
        'approved'::public.counselor_approval_status
  )
  and public.is_active_primary_counselor_for_student(student_id)
);

comment on policy consultation_requests_select_primary_counselor
  on public.consultation_requests is
  'Approved active verified Primary Counselors may read consultation history for their actively assigned Students; covering Counselors use the bounded projection.';

-- Student direct INSERT is no longer a supported path. The allocator owns all
-- trusted assignment/status/timestamp fields and the old trigger is retired.
drop policy if exists consultation_requests_insert_own
  on public.consultation_requests;

revoke insert on table public.consultation_requests
  from authenticated;

revoke insert (
  student_name,
  roll_number,
  personal_email,
  college_end_year,
  department,
  course,
  mobile_number,
  higher_studies_interest,
  consultation_date,
  slot_start
) on public.consultation_requests
  from authenticated;

drop trigger if exists consultation_requests_prepare_insert
  on public.consultation_requests;

comment on function public.prepare_consultation_request_insert() is
  'Retired defense from the direct-INSERT workflow; automatic booking now uses book_student_consultation exclusively.';

-- Claim Next remains present only for a short rollback window, with no normal
-- application execution privilege.
revoke execute on function public.claim_next_consultation()
  from public, anon, authenticated, service_role;

comment on function public.claim_next_consultation() is
  'RETIRED after automatic allocation cutover; no normal application role may execute this rollback-window function.';

-- The replacement allocator, availability, projection and per-Counselor
-- invariant are now installed. Remove organization-wide capacity last.
drop index if exists public.consultation_requests_active_slot_key;

commit;
