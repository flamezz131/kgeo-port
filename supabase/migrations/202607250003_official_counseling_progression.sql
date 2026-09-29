-- K-GEO Phase D3.1 official counseling progression database foundation.
-- Review this migration before applying it. Apply it only after
-- 202607250002_counselor_follow_up_workload.sql and all earlier migrations.
--
-- This migration is additive. It creates an institution-owned current
-- progression record, append-only audit history, and one trusted mutation
-- RPC. It does not add application UI or expose progression to students.

begin;

create type public.counseling_progression_stage as enum (
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
);

create type public.counseling_progression_state as enum (
  'active',
  'on_hold',
  'completed'
);

comment on type public.counseling_progression_stage is
  'Institution-controlled stage in the K-GEO counseling journey; application-specific statuses remain separate.';

comment on type public.counseling_progression_state is
  'Institution-controlled workflow state. Completed is final in the D3 MVP.';

create table public.student_counseling_progressions (
  student_id uuid
    constraint student_counseling_progressions_pkey primary key
    constraint student_counseling_progressions_student_id_fkey
      references public.profiles(id)
      on delete restrict,
  current_stage public.counseling_progression_stage
    constraint student_counseling_progressions_current_stage_not_null
      not null,
  workflow_state public.counseling_progression_state
    constraint student_counseling_progressions_workflow_state_not_null
      not null
    default 'active'::public.counseling_progression_state,
  stage_started_at timestamptz
    constraint student_counseling_progressions_stage_started_at_not_null
      not null
    default pg_catalog.now(),
  last_changed_at timestamptz
    constraint student_counseling_progressions_last_changed_at_not_null
      not null
    default pg_catalog.now(),
  last_changed_by uuid
    constraint student_counseling_progressions_last_changed_by_not_null
      not null
    constraint student_counseling_progressions_last_changed_by_fkey
      references public.profiles(id)
      on delete restrict,
  created_at timestamptz
    constraint student_counseling_progressions_created_at_not_null
      not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint student_counseling_progressions_updated_at_not_null
      not null
    default pg_catalog.now(),

  constraint student_counseling_progressions_distinct_people_check
    check (student_id <> last_changed_by),
  constraint student_counseling_progressions_timestamp_order_check
    check (
      stage_started_at >= created_at
      and last_changed_at >= stage_started_at
      and updated_at = last_changed_at
    )
);

create table public.student_counseling_progression_events (
  id uuid
    constraint student_counseling_progression_events_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint student_counseling_progression_events_student_id_not_null
      not null
    constraint student_counseling_progression_events_student_id_fkey
      references public.student_counseling_progressions(student_id)
      on delete restrict,
  previous_stage public.counseling_progression_stage,
  new_stage public.counseling_progression_stage
    constraint student_counseling_progression_events_new_stage_not_null
      not null,
  previous_state public.counseling_progression_state,
  new_state public.counseling_progression_state
    constraint student_counseling_progression_events_new_state_not_null
      not null,
  changed_by uuid
    constraint student_counseling_progression_events_changed_by_not_null
      not null
    constraint student_counseling_progression_events_changed_by_fkey
      references public.profiles(id)
      on delete restrict,
  change_reason text,
  changed_at timestamptz
    constraint student_counseling_progression_events_changed_at_not_null
      not null
    default pg_catalog.now(),

  constraint student_counseling_progression_events_distinct_people_check
    check (student_id <> changed_by),
  constraint student_counseling_progression_events_previous_pair_check
    check (
      (previous_stage is null and previous_state is null)
      or
      (previous_stage is not null and previous_state is not null)
    ),
  constraint student_counseling_progression_events_transition_check
    check (
      previous_stage is null
      or previous_stage is distinct from new_stage
      or previous_state is distinct from new_state
    ),
  constraint student_counseling_progression_events_reason_check
    check (
      change_reason is null
      or (
        change_reason = pg_catalog.regexp_replace(
          pg_catalog.btrim(change_reason),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(change_reason) between 1 and 500
      )
    )
);

comment on table public.student_counseling_progressions is
  'One institution-owned official counseling progression row per student. It is not counselor-private or student-authored.';

comment on table public.student_counseling_progression_events is
  'Append-only official progression history created exclusively by the trusted progression RPC.';

comment on column public.student_counseling_progressions.student_id is
  'Student target validated by record_student_counseling_progression; account deletion is restricted to retain institutional history.';

comment on column public.student_counseling_progressions.last_changed_by is
  'Active verified counselor derived from auth.uid() by the trusted RPC.';

comment on column public.student_counseling_progression_events.change_reason is
  'Optional normalized operational reason, limited to 500 characters; never a private counseling note.';

create index student_counseling_progressions_state_stage_updated_idx
  on public.student_counseling_progressions (
    workflow_state,
    current_stage,
    updated_at desc,
    student_id
  );

create index student_counseling_progression_events_student_history_idx
  on public.student_counseling_progression_events (
    student_id,
    changed_at desc,
    id desc
  );

create unique index student_counseling_progression_events_initial_key
  on public.student_counseling_progression_events (student_id)
  where previous_stage is null and previous_state is null;

comment on index
  public.student_counseling_progressions_state_stage_updated_idx is
  'Supports bounded institution-wide progression filtering and recent-change ordering.';

comment on index
  public.student_counseling_progression_events_student_history_idx is
  'Supports bounded newest-first audit history for one student.';

comment on index
  public.student_counseling_progression_events_initial_key is
  'Enforces at most one initialization event per student under every write path.';

-- SECURITY: this is the only authenticated mutation path for D3.1. It derives
-- the counselor from auth.uid(), validates a student-role target, accepts no
-- actor or timestamp fields, serializes calls per student, and writes the
-- current row and exactly one event in the same transaction.
--
-- The transaction-scoped nonblocking advisory lock makes the first concurrent
-- caller for a student win. Existing rows are also locked FOR UPDATE. A losing
-- concurrent caller receives a sanitized serialization error and can refresh.
create function public.record_student_counseling_progression(
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
  change_time := pg_catalog.statement_timestamp();

  if progression_exists
    and change_time <= existing_last_changed_at then
    change_time := existing_last_changed_at + interval '1 microsecond';
  end if;

  if not progression_exists then
    if requested_state <>
      'active'::public.counseling_progression_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

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

    -- Stage and workflow-state changes are separate audit events. This keeps
    -- each successful transition unambiguous, including pause and completion.
    if previous_stage_value is distinct from requested_stage
      and previous_state_value is distinct from requested_state then
      raise exception using
        errcode = '22023',
        message = 'The progression request is invalid';
    end if;

    -- A paused progression must be resumed before its stage can change.
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
  when invalid_parameter_value or check_violation or foreign_key_violation then
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
  'Initializes or transitions one student official progression and appends exactly one atomic counselor-attributed event.';

alter table public.student_counseling_progressions
  enable row level security;
alter table public.student_counseling_progression_events
  enable row level security;

revoke all privileges on table
  public.student_counseling_progressions
  from public, anon, authenticated;
revoke all privileges on table
  public.student_counseling_progression_events
  from public, anon, authenticated;

revoke all privileges on type public.counseling_progression_stage
  from public, anon, authenticated;
revoke all privileges on type public.counseling_progression_state
  from public, anon, authenticated;

revoke all on function public.record_student_counseling_progression(
  uuid,
  text,
  text,
  text
) from public, anon, authenticated;

grant usage on type public.counseling_progression_stage
  to authenticated;
grant usage on type public.counseling_progression_state
  to authenticated;

grant select (
  student_id,
  current_stage,
  workflow_state,
  stage_started_at,
  last_changed_at,
  last_changed_by,
  created_at,
  updated_at
) on table public.student_counseling_progressions
  to authenticated;

grant select (
  id,
  student_id,
  previous_stage,
  new_stage,
  previous_state,
  new_state,
  changed_by,
  change_reason,
  changed_at
) on table public.student_counseling_progression_events
  to authenticated;

grant execute on function public.record_student_counseling_progression(
  uuid,
  text,
  text,
  text
) to authenticated;

create policy student_counseling_progressions_select_counselor
on public.student_counseling_progressions
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy student_counseling_progression_events_select_counselor
on public.student_counseling_progression_events
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy student_counseling_progressions_select_counselor
  on public.student_counseling_progressions is
  'Any active verified counselor may read institution-owned current progression; students, admins, directors, and anonymous users have no policy.';

comment on policy
  student_counseling_progression_events_select_counselor
  on public.student_counseling_progression_events is
  'Any active verified counselor may read append-only institutional progression history; no authenticated role receives direct mutation access.';

-- No INSERT, UPDATE, or DELETE policy or grant exists on either D3.1 table.
-- The RPC is the sole authenticated writer and creates the current/event pair
-- atomically. Account deletion remains restricted; deactivate accounts until
-- a separately reviewed institutional retention process exists. Future role
-- changes must preserve the meaning of retained student and counselor history.

commit;
