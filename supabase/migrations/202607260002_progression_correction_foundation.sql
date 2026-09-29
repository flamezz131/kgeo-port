-- K-GEO Phase D3.4.1 audited official progression correction foundation.
-- Review this migration and the correction-aware server read model together.
-- Apply it only after 202607260001_progression_evidence_foundation.sql.
--
-- This migration deliberately replaces the D3.1 event ownership foreign key
-- and lifetime initialization index. Original progression events remain
-- immutable; only the disposable current projection may be deleted during an
-- audited initialization reset. No evidence metadata or Storage object is
-- changed by this migration.

begin;

-- SAFETY: every existing event must already identify a student profile before
-- its foreign key can move from the current projection to durable profiles.
do $migration$
begin
  if exists (
    select 1
    from public.student_counseling_progression_events as event
    left join public.profiles as student_profile
      on student_profile.id = event.student_id
      and student_profile.role = 'student'::public.user_role
    where student_profile.id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Progression event student integrity preflight failed';
  end if;
end;
$migration$;

create type public.counseling_progression_correction_type as enum (
  'undo_transition',
  'reset_initialization'
);

comment on type public.counseling_progression_correction_type is
  'Audited reversal type for the latest effective official progression event.';

create table public.student_counseling_progression_event_corrections (
  id uuid
    constraint progression_event_corrections_pkey primary key
    default pg_catalog.gen_random_uuid(),
  target_event_id uuid
    constraint progression_event_corrections_target_event_id_not_null
      not null
    constraint progression_event_corrections_target_event_id_key
      unique
    constraint progression_event_corrections_target_event_id_fkey
      references public.student_counseling_progression_events(id)
      on delete restrict,
  correction_type public.counseling_progression_correction_type
    constraint progression_event_corrections_type_not_null
      not null,
  restored_stage public.counseling_progression_stage,
  restored_state public.counseling_progression_state,
  restored_stage_started_at timestamptz,
  corrected_by uuid
    constraint progression_event_corrections_corrected_by_not_null
      not null
    constraint progression_event_corrections_corrected_by_fkey
      references public.profiles(id)
      on delete restrict,
  correction_reason text
    constraint progression_event_corrections_reason_not_null
      not null,
  corrected_at timestamptz
    constraint progression_event_corrections_corrected_at_not_null
      not null
    default pg_catalog.now(),

  constraint progression_event_corrections_restoration_check
    check (
      (
        correction_type =
          'undo_transition'::public.counseling_progression_correction_type
        and restored_stage is not null
        and restored_state is not null
        and restored_stage_started_at is not null
      )
      or
      (
        correction_type =
          'reset_initialization'::public.counseling_progression_correction_type
        and restored_stage is null
        and restored_state is null
        and restored_stage_started_at is null
      )
    ),
  constraint progression_event_corrections_reason_check
    check (
      correction_reason = pg_catalog.regexp_replace(
        pg_catalog.btrim(correction_reason),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(correction_reason) between 1 and 500
      and correction_reason !~ '[[:cntrl:]]'
    )
);

comment on table
  public.student_counseling_progression_event_corrections is
  'Append-only institutional audit records for sequential reversal of the latest effective official progression event.';

comment on column
  public.student_counseling_progression_event_corrections.target_event_id is
  'The immutable progression event reversed by this correction; one event can be corrected only once.';

comment on column
  public.student_counseling_progression_event_corrections.corrected_by is
  'Active verified counselor derived from auth.uid() by the trusted correction RPC.';

comment on column
  public.student_counseling_progression_event_corrections.correction_reason is
  'Required normalized institutional correction reason; it is not a private counseling note.';

-- D3.1 tied immutable events to the disposable current projection. Repointing
-- the FK to profiles retains both student identity and all events when the
-- current projection is removed by an audited initialization reset.
alter table public.student_counseling_progression_events
  drop constraint
    student_counseling_progression_events_student_id_fkey;

alter table public.student_counseling_progression_events
  add constraint student_counseling_progression_events_student_id_fkey
  foreign key (student_id)
  references public.profiles(id)
  on delete restrict;

-- Lifetime uniqueness is incompatible with audited reset and later fresh
-- initialization. The replacement normal progression RPC enforces exactly one
-- effective initialization while holding the existing per-student lock.
drop index public.student_counseling_progression_events_initial_key;

-- SECURITY: replaces D3.1 without changing its public signature or return
-- contract. Existing transition behavior remains intact. Initialization now
-- permits historical initialization events only after each has an audited
-- reset_initialization correction.
create or replace function public.record_student_counseling_progression(
  p_student_id uuid,
  p_stage text,
  p_state text,
  p_change_reason text default null
)
returns table (
  student_id uuid,
  current_stage public.counseling_progression_stage,
  workflow_state public.counseling_progression_state,
  stage_started_at timestamptz,
  last_changed_at timestamptz,
  last_changed_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  normalized_stage text;
  normalized_state text;
  normalized_reason text;
  requested_stage public.counseling_progression_stage;
  requested_state public.counseling_progression_state;
  previous_stage_value public.counseling_progression_stage;
  previous_state_value public.counseling_progression_state;
  existing_stage_started_at timestamptz;
  existing_last_changed_at timestamptz;
  effective_stage public.counseling_progression_stage;
  effective_state public.counseling_progression_state;
  uncorrected_initialization_count bigint;
  change_time timestamptz;
  progression_exists boolean;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or not public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  normalized_stage := pg_catalog.lower(pg_catalog.btrim(p_stage));
  normalized_state := pg_catalog.lower(pg_catalog.btrim(p_state));

  if p_student_id is null
    or normalized_stage is null
    or normalized_stage not in (
      'profile_review',
      'initial_counseling',
      'goals_confirmed',
      'country_exploration',
      'program_shortlisting',
      'university_shortlisting',
      'test_preparation',
      'document_preparation',
      'application_ready',
      'application_in_progress',
      'offer_evaluation',
      'visa_preparation',
      'pre_departure'
    )
    or normalized_state is null
    or normalized_state not in ('active', 'on_hold', 'completed') then
    raise exception using
      errcode = '22023',
      message = 'The progression request is invalid';
  end if;

  normalized_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_change_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if pg_catalog.char_length(normalized_reason) > 500 then
    raise exception using
      errcode = '22023',
      message = 'The progression request is invalid';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = p_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The progression request is invalid';
  end if;

  requested_stage :=
    normalized_stage::public.counseling_progression_stage;
  requested_state :=
    normalized_state::public.counseling_progression_state;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(p_student_id::text, 202607250003)
  ) then
    raise exception using
      errcode = '40001',
      message = 'The progression changed concurrently';
  end if;

  select
    progression.current_stage,
    progression.workflow_state,
    progression.stage_started_at,
    progression.last_changed_at
  into
    previous_stage_value,
    previous_state_value,
    existing_stage_started_at,
    existing_last_changed_at
  from public.student_counseling_progressions as progression
  where progression.student_id = p_student_id
  for update;

  progression_exists := found;

  -- A correction type must always match the shape of its immutable target.
  if exists (
    select 1
    from public.student_counseling_progression_event_corrections
      as correction
    inner join public.student_counseling_progression_events as event
      on event.id = correction.target_event_id
    where event.student_id = p_student_id
      and (
        (
          correction.correction_type =
            'reset_initialization'::public.counseling_progression_correction_type
          and not (
            event.previous_stage is null
            and event.previous_state is null
            and event.new_state =
              'active'::public.counseling_progression_state
          )
        )
        or
        (
          correction.correction_type =
            'undo_transition'::public.counseling_progression_correction_type
          and (
            event.previous_stage is null
            or event.previous_state is null
          )
        )
      )
  ) then
    raise exception using
      errcode = '22023',
      message = 'The progression history is inconsistent';
  end if;

  select pg_catalog.count(*)
  into uncorrected_initialization_count
  from public.student_counseling_progression_events as event
  where event.student_id = p_student_id
    and event.previous_stage is null
    and event.previous_state is null
    and not exists (
      select 1
      from public.student_counseling_progression_event_corrections
        as correction
      where correction.target_event_id = event.id
    );

  if uncorrected_initialization_count > 1 then
    raise exception using
      errcode = '22023',
      message = 'The progression history is inconsistent';
  end if;

  if progression_exists then
    select
      event.new_stage,
      event.new_state
    into
      effective_stage,
      effective_state
    from public.student_counseling_progression_events as event
    where event.student_id = p_student_id
      and not exists (
        select 1
        from public.student_counseling_progression_event_corrections
          as correction
        where correction.target_event_id = event.id
      )
    order by event.changed_at desc, event.id desc
    limit 1;

    if not found
      or uncorrected_initialization_count <> 1
      or effective_stage is distinct from previous_stage_value
      or effective_state is distinct from previous_state_value then
      raise exception using
        errcode = '22023',
        message = 'The progression history is inconsistent';
    end if;
  else
    if requested_state <>
      'active'::public.counseling_progression_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    -- No current row is valid only before first initialization or after every
    -- historical event has been corrected, including a reset initialization.
    if exists (
      select 1
      from public.student_counseling_progression_events as event
      where event.student_id = p_student_id
        and not exists (
          select 1
          from public.student_counseling_progression_event_corrections
            as correction
          where correction.target_event_id = event.id
        )
    ) or uncorrected_initialization_count <> 0 then
      raise exception using
        errcode = '22023',
        message = 'The progression history is inconsistent';
    end if;

    -- Every historical initialization must have been reset, not merely
    -- corrected with an unrelated type.
    if exists (
      select 1
      from public.student_counseling_progression_events as event
      left join public.student_counseling_progression_event_corrections
        as correction
        on correction.target_event_id = event.id
      where event.student_id = p_student_id
        and event.previous_stage is null
        and event.previous_state is null
        and (
          correction.id is null
          or correction.correction_type <>
            'reset_initialization'::public.counseling_progression_correction_type
        )
    ) then
      raise exception using
        errcode = '22023',
        message = 'The progression history is inconsistent';
    end if;
  end if;

  change_time := pg_catalog.statement_timestamp();

  if progression_exists
    and change_time <= existing_last_changed_at then
    change_time := existing_last_changed_at + interval '1 microsecond';
  end if;

  if not progression_exists then
    insert into public.student_counseling_progressions (
      student_id,
      current_stage,
      workflow_state,
      stage_started_at,
      last_changed_at,
      last_changed_by,
      created_at,
      updated_at
    )
    values (
      p_student_id,
      requested_stage,
      requested_state,
      change_time,
      change_time,
      caller_id,
      change_time,
      change_time
    );

    insert into public.student_counseling_progression_events (
      student_id,
      previous_stage,
      new_stage,
      previous_state,
      new_state,
      changed_by,
      change_reason,
      changed_at
    )
    values (
      p_student_id,
      null,
      requested_stage,
      null,
      requested_state,
      caller_id,
      normalized_reason,
      change_time
    );
  else
    if previous_state_value =
      'completed'::public.counseling_progression_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    if previous_stage_value = requested_stage
      and previous_state_value = requested_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    if previous_stage_value is distinct from requested_stage
      and previous_state_value is distinct from requested_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    if previous_state_value =
        'on_hold'::public.counseling_progression_state
      and previous_stage_value is distinct from requested_stage then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    update public.student_counseling_progressions as progression
    set
      current_stage = requested_stage,
      workflow_state = requested_state,
      stage_started_at = case
        when progression.current_stage is distinct from requested_stage
          then change_time
        else existing_stage_started_at
      end,
      last_changed_at = change_time,
      last_changed_by = caller_id,
      updated_at = change_time
    where progression.student_id = p_student_id;

    insert into public.student_counseling_progression_events (
      student_id,
      previous_stage,
      new_stage,
      previous_state,
      new_state,
      changed_by,
      change_reason,
      changed_at
    )
    values (
      p_student_id,
      previous_stage_value,
      requested_stage,
      previous_state_value,
      requested_state,
      caller_id,
      normalized_reason,
      change_time
    );
  end if;

  return query
  select
    progression.student_id,
    progression.current_stage,
    progression.workflow_state,
    progression.stage_started_at,
    progression.last_changed_at,
    progression.last_changed_by,
    progression.created_at,
    progression.updated_at
  from public.student_counseling_progressions as progression
  where progression.student_id = p_student_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value
    or check_violation
    or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The progression request is invalid';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message = 'The progression changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Official progression could not be updated';
end;
$function$;

alter function public.record_student_counseling_progression(
  uuid,
  text,
  text,
  text
) owner to postgres;

comment on function public.record_student_counseling_progression(
  uuid,
  text,
  text,
  text
) is
  'Initializes or transitions official progression while enforcing one correction-aware effective initialization under the D3.1 student lock.';

-- SECURITY: audited correction is the only path that can reverse progression.
-- Lock order is fixed: the D3.1 student lock, the D3.3 event/evidence lock,
-- then the current row FOR UPDATE. Normal progression never takes the event
-- lock, and evidence preparation never takes the student lock, so no reverse
-- lock order exists.
create function public.undo_latest_student_counseling_progression_event(
  p_student_id uuid,
  p_event_id uuid,
  p_correction_reason text
)
returns table (
  correction_id uuid,
  target_event_id uuid,
  correction_type public.counseling_progression_correction_type,
  current_progression_exists boolean,
  restored_stage public.counseling_progression_stage,
  restored_state public.counseling_progression_state,
  restored_stage_started_at timestamptz,
  corrected_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  normalized_reason text;
  current_stage_value public.counseling_progression_stage;
  current_state_value public.counseling_progression_state;
  current_stage_started_at timestamptz;
  current_last_changed_at timestamptz;
  uncorrected_initialization_count bigint;
  target_event public.student_counseling_progression_events%rowtype;
  latest_effective_event_id uuid;
  result_correction_id uuid;
  result_correction_type public.counseling_progression_correction_type;
  result_restored_stage public.counseling_progression_stage;
  result_restored_state public.counseling_progression_state;
  result_restored_stage_started_at timestamptz;
  result_current_exists boolean;
  correction_time timestamptz;
begin
  caller_id := (select auth.uid());

  if caller_id is null
    or not public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  if p_student_id is null
    or p_event_id is null
    or not exists (
      select 1
      from public.profiles as student_profile
      where student_profile.id = p_student_id
        and student_profile.role = 'student'::public.user_role
    ) then
    raise exception using
      errcode = '22023',
      message = 'The progression correction target is invalid';
  end if;

  normalized_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_correction_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if normalized_reason is null
    or pg_catalog.char_length(normalized_reason) > 500
    or normalized_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'The progression correction reason is invalid';
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(p_student_id::text, 202607250003)
  ) then
    raise exception using
      errcode = '40001',
      message = 'Another progression correction is currently in progress';
  end if;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(p_event_id::text, 202607260001)
  ) then
    raise exception using
      errcode = '40001',
      message = 'Another progression correction is currently in progress';
  end if;

  select
    progression.current_stage,
    progression.workflow_state,
    progression.stage_started_at,
    progression.last_changed_at
  into
    current_stage_value,
    current_state_value,
    current_stage_started_at,
    current_last_changed_at
  from public.student_counseling_progressions as progression
  where progression.student_id = p_student_id
  for update;

  if not found then
    raise exception using
      errcode = 'K3405',
      message = 'Official progression has changed';
  end if;

  if exists (
    select 1
    from public.student_counseling_progression_event_corrections
      as correction
    inner join public.student_counseling_progression_events as event
      on event.id = correction.target_event_id
    where event.student_id = p_student_id
      and (
        (
          correction.correction_type =
            'reset_initialization'::public.counseling_progression_correction_type
          and not (
            event.previous_stage is null
            and event.previous_state is null
            and event.new_state =
              'active'::public.counseling_progression_state
          )
        )
        or
        (
          correction.correction_type =
            'undo_transition'::public.counseling_progression_correction_type
          and (
            event.previous_stage is null
            or event.previous_state is null
          )
        )
      )
  ) then
    raise exception using
      errcode = 'K3406',
      message = 'The progression history is inconsistent';
  end if;

  select pg_catalog.count(*)
  into uncorrected_initialization_count
  from public.student_counseling_progression_events as event
  where event.student_id = p_student_id
    and event.previous_stage is null
    and event.previous_state is null
    and not exists (
      select 1
      from public.student_counseling_progression_event_corrections
        as correction
      where correction.target_event_id = event.id
    );

  if uncorrected_initialization_count <> 1 then
    raise exception using
      errcode = 'K3406',
      message = 'The progression history is inconsistent';
  end if;

  select event.*
  into target_event
  from public.student_counseling_progression_events as event
  where event.id = p_event_id
    and event.student_id = p_student_id;

  if not found then
    raise exception using
      errcode = '22023',
      message = 'The progression correction target is invalid';
  end if;

  if exists (
    select 1
    from public.student_counseling_progression_event_corrections
      as correction
    where correction.target_event_id = p_event_id
  ) then
    raise exception using
      errcode = 'K3401',
      message = 'This progression update has already been reversed';
  end if;

  select event.id
  into latest_effective_event_id
  from public.student_counseling_progression_events as event
  where event.student_id = p_student_id
    and not exists (
      select 1
      from public.student_counseling_progression_event_corrections
        as correction
      where correction.target_event_id = event.id
    )
  order by event.changed_at desc, event.id desc
  limit 1;

  if latest_effective_event_id is distinct from p_event_id then
    raise exception using
      errcode = 'K3402',
      message =
        'This progression update is no longer the latest valid step';
  end if;

  if current_stage_value is distinct from target_event.new_stage
    or current_state_value is distinct from target_event.new_state then
    raise exception using
      errcode = 'K3405',
      message = 'Official progression has changed';
  end if;

  if exists (
    select 1
    from public.student_counseling_progression_evidence as evidence
    where evidence.progression_event_id = p_event_id
      and (
        evidence.status =
          'available'::public.counseling_progression_evidence_status
        or (
          evidence.status =
            'pending'::public.counseling_progression_evidence_status
          and evidence.upload_expires_at >
            pg_catalog.statement_timestamp()
        )
      )
  ) then
    raise exception using
      errcode = 'K3404',
      message =
        'Supporting evidence must be removed or allowed to expire before this progression update can be reversed';
  end if;

  correction_time := pg_catalog.statement_timestamp();
  if correction_time <= current_last_changed_at then
    correction_time := current_last_changed_at + interval '1 microsecond';
  end if;

  if target_event.previous_stage is null
    and target_event.previous_state is null then
    if target_event.new_state <>
      'active'::public.counseling_progression_state then
      raise exception using
        errcode = 'K3406',
        message = 'The progression history is inconsistent';
    end if;

    result_correction_type :=
      'reset_initialization'::public.counseling_progression_correction_type;
    result_restored_stage := null;
    result_restored_state := null;
    result_restored_stage_started_at := null;
    result_current_exists := false;
  else
    if target_event.previous_stage is null
      or target_event.previous_state is null then
      raise exception using
        errcode = 'K3406',
        message = 'The progression history is inconsistent';
    end if;

    result_correction_type :=
      'undo_transition'::public.counseling_progression_correction_type;
    result_restored_stage := target_event.previous_stage;
    result_restored_state := target_event.previous_state;
    result_current_exists := true;

    if target_event.previous_stage = target_event.new_stage then
      result_restored_stage_started_at := current_stage_started_at;
    else
      select origin.changed_at
      into result_restored_stage_started_at
      from public.student_counseling_progression_events as origin
      where origin.student_id = p_student_id
        and (
          origin.changed_at < target_event.changed_at
          or (
            origin.changed_at = target_event.changed_at
            and origin.id < target_event.id
          )
        )
        and origin.new_stage = target_event.previous_stage
        and (
          origin.previous_stage is null
          or origin.previous_stage is distinct from origin.new_stage
        )
        and not exists (
          select 1
          from public.student_counseling_progression_event_corrections
            as correction
          where correction.target_event_id = origin.id
        )
      order by origin.changed_at desc, origin.id desc
      limit 1;

      if not found then
        raise exception using
          errcode = 'K3406',
          message = 'The progression history is inconsistent';
      end if;
    end if;
  end if;

  result_correction_id := pg_catalog.gen_random_uuid();

  insert into public.student_counseling_progression_event_corrections (
    id,
    target_event_id,
    correction_type,
    restored_stage,
    restored_state,
    restored_stage_started_at,
    corrected_by,
    correction_reason,
    corrected_at
  )
  values (
    result_correction_id,
    p_event_id,
    result_correction_type,
    result_restored_stage,
    result_restored_state,
    result_restored_stage_started_at,
    caller_id,
    normalized_reason,
    correction_time
  );

  if result_correction_type =
    'reset_initialization'::public.counseling_progression_correction_type then
    delete from public.student_counseling_progressions as progression
    where progression.student_id = p_student_id;

    if not found then
      raise exception using
        errcode = 'K3405',
        message = 'Official progression has changed';
    end if;
  else
    update public.student_counseling_progressions as progression
    set
      current_stage = result_restored_stage,
      workflow_state = result_restored_state,
      stage_started_at = result_restored_stage_started_at,
      last_changed_at = correction_time,
      last_changed_by = caller_id,
      updated_at = correction_time
    where progression.student_id = p_student_id
      and progression.current_stage = target_event.new_stage
      and progression.workflow_state = target_event.new_state;

    if not found then
      raise exception using
        errcode = 'K3405',
        message = 'Official progression has changed';
    end if;
  end if;

  return query
  select
    result_correction_id,
    p_event_id,
    result_correction_type,
    result_current_exists,
    result_restored_stage,
    result_restored_state,
    result_restored_stage_started_at,
    correction_time;
exception
  when sqlstate 'K3401' then
    raise exception using
      errcode = 'K3401',
      message = 'This progression update has already been reversed';
  when sqlstate 'K3402' then
    raise exception using
      errcode = 'K3402',
      message =
        'This progression update is no longer the latest valid step';
  when sqlstate 'K3404' then
    raise exception using
      errcode = 'K3404',
      message =
        'Supporting evidence must be removed or allowed to expire before this progression update can be reversed';
  when sqlstate 'K3405' then
    raise exception using
      errcode = 'K3405',
      message = 'Official progression has changed';
  when sqlstate 'K3406' then
    raise exception using
      errcode = 'K3406',
      message = 'The progression history is inconsistent';
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value or check_violation or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The progression correction request is invalid';
  when unique_violation then
    raise exception using
      errcode = 'K3401',
      message = 'This progression update has already been reversed';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message =
        'Another progression correction is currently in progress';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Official progression could not be corrected';
end;
$function$;

alter function
  public.undo_latest_student_counseling_progression_event(
    uuid,
    uuid,
    text
  ) owner to postgres;

comment on function
  public.undo_latest_student_counseling_progression_event(
    uuid,
    uuid,
    text
  ) is
  'Sequentially reverses only the latest effective progression event, preserves immutable history, and writes one permanent counselor-attributed correction.';

-- One bounded read call supplies correction rows for the visible event page
-- and the independently calculated latest effective event. Repeated context
-- columns avoid an N+1 query and keep the result relational.
create function
  public.get_counselor_progression_correction_context(
    p_student_id uuid,
    p_event_ids uuid[]
  )
returns table (
  target_event_id uuid,
  correction_id uuid,
  correction_type public.counseling_progression_correction_type,
  restored_stage public.counseling_progression_stage,
  restored_state public.counseling_progression_state,
  restored_stage_started_at timestamptz,
  correction_reason text,
  corrected_at timestamptz,
  effective_event_exists boolean,
  latest_effective_event_id uuid,
  latest_effective_stage public.counseling_progression_stage,
  latest_effective_state public.counseling_progression_state,
  latest_effective_changed_at timestamptz,
  latest_effective_changed_by uuid,
  total_correction_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  requested_count integer;
  distinct_count integer;
  effective_event public.student_counseling_progression_events%rowtype;
  effective_exists boolean;
  correction_count bigint;
begin
  if (select auth.uid()) is null
    or not public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  requested_count := pg_catalog.cardinality(p_event_ids);

  if p_student_id is null
    or requested_count is null
    or requested_count < 1
    or requested_count > 20
    or pg_catalog.array_position(p_event_ids, null) is not null
    or not exists (
      select 1
      from public.profiles as student_profile
      where student_profile.id = p_student_id
        and student_profile.role = 'student'::public.user_role
    ) then
    raise exception using
      errcode = '22023',
      message = 'The progression correction read request is invalid';
  end if;

  select pg_catalog.count(distinct requested.event_id)::integer
  into distinct_count
  from pg_catalog.unnest(p_event_ids) as requested(event_id);

  if distinct_count <> requested_count
    or (
      select pg_catalog.count(*)::integer
      from public.student_counseling_progression_events as event
      where event.student_id = p_student_id
        and event.id = any(p_event_ids)
    ) <> requested_count then
    raise exception using
      errcode = '22023',
      message = 'The progression correction read request is invalid';
  end if;

  select event.*
  into effective_event
  from public.student_counseling_progression_events as event
  where event.student_id = p_student_id
    and not exists (
      select 1
      from public.student_counseling_progression_event_corrections
        as correction
      where correction.target_event_id = event.id
    )
  order by event.changed_at desc, event.id desc
  limit 1;

  effective_exists := found;

  select pg_catalog.count(*)
  into correction_count
  from public.student_counseling_progression_event_corrections
    as correction
  inner join public.student_counseling_progression_events as event
    on event.id = correction.target_event_id
  where event.student_id = p_student_id;

  return query
  select
    requested.event_id,
    correction.id,
    correction.correction_type,
    correction.restored_stage,
    correction.restored_state,
    correction.restored_stage_started_at,
    correction.correction_reason,
    correction.corrected_at,
    effective_exists,
    case when effective_exists then effective_event.id else null end,
    case
      when effective_exists then effective_event.new_stage
      else null
    end,
    case
      when effective_exists then effective_event.new_state
      else null
    end,
    case
      when effective_exists then effective_event.changed_at
      else null
    end,
    case
      when effective_exists then effective_event.changed_by
      else null
    end,
    correction_count
  from pg_catalog.unnest(p_event_ids) with ordinality
    as requested(event_id, position)
  left join public.student_counseling_progression_event_corrections
    as correction
    on correction.target_event_id = requested.event_id
  order by requested.position;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value then
    raise exception using
      errcode = '22023',
      message = 'The progression correction read request is invalid';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'Official progression corrections could not be loaded';
end;
$function$;

alter function
  public.get_counselor_progression_correction_context(uuid, uuid[])
  owner to postgres;

comment on function
  public.get_counselor_progression_correction_context(uuid, uuid[]) is
  'Returns correction context for one counselor-validated student and at most twenty exact event IDs, plus the latest effective event used by the server read model.';

alter table
  public.student_counseling_progression_event_corrections
  enable row level security;

revoke all privileges on table
  public.student_counseling_progression_event_corrections
  from public, anon, authenticated;

revoke all privileges on type
  public.counseling_progression_correction_type
  from public, anon, authenticated;

revoke all on function
  public.undo_latest_student_counseling_progression_event(
    uuid,
    uuid,
    text
  ) from public, anon, authenticated;

revoke all on function
  public.get_counselor_progression_correction_context(uuid, uuid[])
  from public, anon, authenticated;

grant usage on type public.counseling_progression_correction_type
  to authenticated;

grant select (
  id,
  target_event_id,
  correction_type,
  restored_stage,
  restored_state,
  restored_stage_started_at,
  corrected_by,
  correction_reason,
  corrected_at
) on table public.student_counseling_progression_event_corrections
  to authenticated;

grant execute on function
  public.undo_latest_student_counseling_progression_event(
    uuid,
    uuid,
    text
  ) to authenticated;

grant execute on function
  public.get_counselor_progression_correction_context(uuid, uuid[])
  to authenticated;

create policy progression_event_corrections_select_counselor
on public.student_counseling_progression_event_corrections
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy progression_event_corrections_select_counselor
  on public.student_counseling_progression_event_corrections is
  'Any active verified counselor may read institutional correction audits; students, admins, directors, and anonymous users have no policy.';

-- No application role receives INSERT, UPDATE, DELETE, or TRUNCATE on the
-- correction table. No progression event, evidence row, or Storage object is
-- deleted or updated by this migration. The sole DELETE targets the disposable
-- current projection during an audited reset_initialization correction.

commit;
