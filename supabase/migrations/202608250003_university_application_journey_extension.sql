-- K-GEO University Application Journey extension.
-- Separates university decision, offer, Student decision, fee, visa, and
-- enrollment tracking from the existing application lifecycle.
-- Review before applying. This migration does not mutate Storage objects.

begin;

create type public.university_application_decision as enum (
  'pending',
  'waitlisted',
  'rejected',
  'offer_received'
);

create type public.university_application_offer_status as enum (
  'none',
  'conditional',
  'unconditional'
);

create type public.university_application_student_decision as enum (
  'pending',
  'accepted',
  'declined'
);

create type public.university_application_fee_status as enum (
  'not_started',
  'pending',
  'paid'
);

create type public.university_application_visa_status as enum (
  'not_started',
  'preparing',
  'submitted',
  'approved',
  'refused'
);

create type public.university_application_enrollment_status as enum (
  'not_enrolled',
  'enrolled'
);

comment on type public.university_application_decision is
  'University decision, kept separate from offer type and Student decision.';

comment on type public.university_application_offer_status is
  'Current university offer type. Conditional and unconditional offers remain distinguishable.';

comment on type public.university_application_student_decision is
  'Student response to an unconditional offer, recorded by the current Primary Counselor.';

comment on type public.university_application_fee_status is
  'Operational fee tracking only; K-GEO does not process financial transactions.';

comment on type public.university_application_visa_status is
  'Operational visa workflow tracking only; no immigration decision automation.';

comment on type public.university_application_enrollment_status is
  'Enrollment outcome kept separate from application, offer, fee, and visa status.';

create table public.student_university_application_journeys (
  application_id uuid
    constraint student_university_application_journeys_pkey primary key
    constraint student_university_application_journeys_application_id_fkey
      references public.student_university_applications(id)
      on delete restrict,
  university_decision public.university_application_decision
    constraint application_journeys_university_decision_not_null not null,
  university_decision_date date,
  offer_status public.university_application_offer_status
    constraint application_journeys_offer_status_not_null not null,
  offer_date date,
  conditional_offer_requirements text,
  condition_due_date date,
  conditions_satisfied_date date,
  student_decision public.university_application_student_decision
    constraint application_journeys_student_decision_not_null not null,
  student_decision_date date,
  fee_status public.university_application_fee_status
    constraint application_journeys_fee_status_not_null not null,
  fee_payment_date date,
  visa_status public.university_application_visa_status
    constraint application_journeys_visa_status_not_null not null,
  visa_submission_date date,
  visa_decision_date date,
  enrollment_status public.university_application_enrollment_status
    constraint application_journeys_enrollment_status_not_null not null,
  enrollment_date date,
  version_number integer
    constraint application_journeys_version_not_null not null,
  created_by uuid
    constraint application_journeys_created_by_not_null not null
    constraint application_journeys_created_by_fkey
      references public.profiles(id)
      on delete restrict,
  last_changed_by uuid
    constraint application_journeys_last_changed_by_not_null not null
    constraint application_journeys_last_changed_by_fkey
      references public.profiles(id)
      on delete restrict,
  created_at timestamptz
    constraint application_journeys_created_at_not_null not null,
  updated_at timestamptz
    constraint application_journeys_updated_at_not_null not null,

  constraint application_journeys_requirements_check
    check (
      conditional_offer_requirements is null
      or (
        conditional_offer_requirements = pg_catalog.regexp_replace(
          pg_catalog.btrim(conditional_offer_requirements),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(conditional_offer_requirements)
          between 1 and 2000
        and conditional_offer_requirements !~ '[[:cntrl:]]'
      )
    ),
  constraint application_journeys_university_decision_date_check
    check (
      university_decision <>
        'pending'::public.university_application_decision
      or university_decision_date is null
    ),
  constraint application_journeys_offer_consistency_check
    check (
      (
        offer_status = 'none'::public.university_application_offer_status
        and university_decision <>
          'offer_received'::public.university_application_decision
        and offer_date is null
        and conditional_offer_requirements is null
        and condition_due_date is null
        and conditions_satisfied_date is null
      )
      or (
        offer_status = 'conditional'::public.university_application_offer_status
        and university_decision =
          'offer_received'::public.university_application_decision
        and conditional_offer_requirements is not null
      )
      or (
        offer_status = 'unconditional'::public.university_application_offer_status
        and university_decision =
          'offer_received'::public.university_application_decision
        and (
          conditional_offer_requirements is null
          or conditions_satisfied_date is not null
        )
      )
    ),
  constraint application_journeys_condition_fields_check
    check (
      (
        conditional_offer_requirements is null
        and condition_due_date is null
        and conditions_satisfied_date is null
      )
      or conditional_offer_requirements is not null
    ),
  constraint application_journeys_student_decision_check
    check (
      student_decision =
        'pending'::public.university_application_student_decision
      or (
        university_decision =
          'offer_received'::public.university_application_decision
        and offer_status =
          'unconditional'::public.university_application_offer_status
      )
    ),
  constraint application_journeys_student_decision_date_check
    check (
      (
        student_decision =
          'pending'::public.university_application_student_decision
        and student_decision_date is null
      )
      or student_decision <>
        'pending'::public.university_application_student_decision
    ),
  constraint application_journeys_fee_check
    check (
      (
        fee_status = 'not_started'::public.university_application_fee_status
        and fee_payment_date is null
      )
      or (
        fee_status = 'pending'::public.university_application_fee_status
        and student_decision =
          'accepted'::public.university_application_student_decision
        and fee_payment_date is null
      )
      or (
        fee_status = 'paid'::public.university_application_fee_status
        and student_decision =
          'accepted'::public.university_application_student_decision
        and fee_payment_date is not null
      )
    ),
  constraint application_journeys_visa_check
    check (
      (
        visa_status = 'not_started'::public.university_application_visa_status
        and visa_submission_date is null
        and visa_decision_date is null
      )
      or (
        visa_status = 'preparing'::public.university_application_visa_status
        and student_decision =
          'accepted'::public.university_application_student_decision
        and fee_status = 'paid'::public.university_application_fee_status
        and visa_submission_date is null
        and visa_decision_date is null
      )
      or (
        visa_status = 'submitted'::public.university_application_visa_status
        and student_decision =
          'accepted'::public.university_application_student_decision
        and fee_status = 'paid'::public.university_application_fee_status
        and visa_submission_date is not null
        and visa_decision_date is null
      )
      or (
        visa_status in (
          'approved'::public.university_application_visa_status,
          'refused'::public.university_application_visa_status
        )
        and student_decision =
          'accepted'::public.university_application_student_decision
        and fee_status = 'paid'::public.university_application_fee_status
        and visa_submission_date is not null
        and visa_decision_date is not null
      )
    ),
  constraint application_journeys_enrollment_check
    check (
      (
        enrollment_status =
          'not_enrolled'::public.university_application_enrollment_status
        and enrollment_date is null
      )
      or (
        enrollment_status =
          'enrolled'::public.university_application_enrollment_status
        and visa_status = 'approved'::public.university_application_visa_status
        and enrollment_date is not null
      )
    ),
  constraint application_journeys_version_check
    check (version_number >= 1),
  constraint application_journeys_timestamp_check
    check (updated_at >= created_at)
);

create table public.student_university_application_journey_events (
  id uuid
    constraint student_university_application_journey_events_pkey primary key
    default pg_catalog.gen_random_uuid(),
  application_id uuid
    constraint application_journey_events_application_id_not_null not null
    constraint application_journey_events_application_id_fkey
      references public.student_university_application_journeys(application_id)
      on delete restrict,
  version_number integer
    constraint application_journey_events_version_not_null not null,
  university_decision public.university_application_decision
    constraint application_journey_events_university_decision_not_null not null,
  university_decision_date date,
  offer_status public.university_application_offer_status
    constraint application_journey_events_offer_status_not_null not null,
  offer_date date,
  conditional_offer_requirements text,
  condition_due_date date,
  conditions_satisfied_date date,
  student_decision public.university_application_student_decision
    constraint application_journey_events_student_decision_not_null not null,
  student_decision_date date,
  fee_status public.university_application_fee_status
    constraint application_journey_events_fee_status_not_null not null,
  fee_payment_date date,
  visa_status public.university_application_visa_status
    constraint application_journey_events_visa_status_not_null not null,
  visa_submission_date date,
  visa_decision_date date,
  enrollment_status public.university_application_enrollment_status
    constraint application_journey_events_enrollment_status_not_null not null,
  enrollment_date date,
  change_reason text
    constraint application_journey_events_change_reason_not_null not null,
  changed_by uuid
    constraint application_journey_events_changed_by_not_null not null
    constraint application_journey_events_changed_by_fkey
      references public.profiles(id)
      on delete restrict,
  changed_at timestamptz
    constraint application_journey_events_changed_at_not_null not null,

  constraint application_journey_events_application_version_key
    unique (application_id, version_number),
  constraint application_journey_events_version_check
    check (version_number >= 1),
  constraint application_journey_events_reason_check
    check (
      change_reason = pg_catalog.regexp_replace(
        pg_catalog.btrim(change_reason),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(change_reason) between 1 and 500
      and change_reason !~ '[[:cntrl:]]'
    )
);

comment on table public.student_university_application_journeys is
  'Current separated offer, Student decision, fee, visa, and enrollment projection for one university application.';

comment on table public.student_university_application_journey_events is
  'Append-only complete snapshots for every trusted Application Journey mutation.';

create index student_university_application_journey_events_history_idx
  on public.student_university_application_journey_events (
    application_id,
    version_number desc,
    changed_at desc,
    id desc
  );

alter table public.student_university_application_journeys
  owner to postgres;
alter table public.student_university_application_journey_events
  owner to postgres;

alter table public.student_university_application_journeys
  enable row level security;
alter table public.student_university_application_journeys
  force row level security;
alter table public.student_university_application_journey_events
  enable row level security;
alter table public.student_university_application_journey_events
  force row level security;

revoke all privileges on table
  public.student_university_application_journeys
  from public, anon, authenticated, service_role;
revoke all privileges on table
  public.student_university_application_journey_events
  from public, anon, authenticated, service_role;

create function public.get_counselor_university_application_journey(
  p_application_id uuid
)
returns table (
  application_id uuid,
  university_decision public.university_application_decision,
  university_decision_date date,
  offer_status public.university_application_offer_status,
  offer_date date,
  conditional_offer_requirements text,
  condition_due_date date,
  conditions_satisfied_date date,
  student_decision public.university_application_student_decision,
  student_decision_date date,
  fee_status public.university_application_fee_status,
  fee_payment_date date,
  visa_status public.university_application_visa_status,
  visa_submission_date date,
  visa_decision_date date,
  enrollment_status public.university_application_enrollment_status,
  enrollment_date date,
  version_number integer,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
begin
  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  select application.student_id
  into v_student_id
  from public.student_university_applications as application
  where application.id = p_application_id
    and application.is_archived is false;

  if v_student_id is null
    or public.is_active_primary_counselor_for_student(v_student_id)
      is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  return query
  select
    p_application_id,
    coalesce(
      journey.university_decision,
      'pending'::public.university_application_decision
    ),
    journey.university_decision_date,
    coalesce(
      journey.offer_status,
      'none'::public.university_application_offer_status
    ),
    journey.offer_date,
    journey.conditional_offer_requirements,
    journey.condition_due_date,
    journey.conditions_satisfied_date,
    coalesce(
      journey.student_decision,
      'pending'::public.university_application_student_decision
    ),
    journey.student_decision_date,
    coalesce(
      journey.fee_status,
      'not_started'::public.university_application_fee_status
    ),
    journey.fee_payment_date,
    coalesce(
      journey.visa_status,
      'not_started'::public.university_application_visa_status
    ),
    journey.visa_submission_date,
    journey.visa_decision_date,
    coalesce(
      journey.enrollment_status,
      'not_enrolled'::public.university_application_enrollment_status
    ),
    journey.enrollment_date,
    coalesce(journey.version_number, 0),
    journey.updated_at
  from (select 1) as one_row
  left join public.student_university_application_journeys as journey
    on journey.application_id = p_application_id;
end;
$function$;

create function public.get_counselor_university_application_journey_history(
  p_application_id uuid,
  p_limit integer default 20
)
returns table (
  event_id uuid,
  version_number integer,
  university_decision public.university_application_decision,
  university_decision_date date,
  offer_status public.university_application_offer_status,
  offer_date date,
  conditional_offer_requirements text,
  condition_due_date date,
  conditions_satisfied_date date,
  student_decision public.university_application_student_decision,
  student_decision_date date,
  fee_status public.university_application_fee_status,
  fee_payment_date date,
  visa_status public.university_application_visa_status,
  visa_submission_date date,
  visa_decision_date date,
  enrollment_status public.university_application_enrollment_status,
  enrollment_date date,
  change_reason text,
  changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_student_id uuid;
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using
      errcode = '22023',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  if (select auth.uid()) is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  select application.student_id
  into v_student_id
  from public.student_university_applications as application
  where application.id = p_application_id
    and application.is_archived is false;

  if v_student_id is null
    or public.is_active_primary_counselor_for_student(v_student_id)
      is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  return query
  select
    event.id,
    event.version_number,
    event.university_decision,
    event.university_decision_date,
    event.offer_status,
    event.offer_date,
    event.conditional_offer_requirements,
    event.condition_due_date,
    event.conditions_satisfied_date,
    event.student_decision,
    event.student_decision_date,
    event.fee_status,
    event.fee_payment_date,
    event.visa_status,
    event.visa_submission_date,
    event.visa_decision_date,
    event.enrollment_status,
    event.enrollment_date,
    event.change_reason,
    event.changed_at
  from public.student_university_application_journey_events as event
  where event.application_id = p_application_id
  order by event.version_number desc, event.changed_at desc, event.id desc
  limit p_limit;
end;
$function$;

create function public.get_my_university_application_journeys()
returns table (
  application_id uuid,
  university_decision public.university_application_decision,
  university_decision_date date,
  offer_status public.university_application_offer_status,
  offer_date date,
  conditional_offer_requirements text,
  condition_due_date date,
  conditions_satisfied_date date,
  student_decision public.university_application_student_decision,
  student_decision_date date,
  fee_status public.university_application_fee_status,
  fee_payment_date date,
  visa_status public.university_application_visa_status,
  visa_submission_date date,
  visa_decision_date date,
  enrollment_status public.university_application_enrollment_status,
  enrollment_date date,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_bounded_application_count integer;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  select pg_catalog.count(*)::integer
  into v_bounded_application_count
  from (
    select application.id
    from public.student_university_applications as application
    where application.student_id = v_caller_id
      and application.is_archived is false
    limit 101
  ) as bounded_applications;

  if v_bounded_application_count > 100 then
    raise exception using
      errcode = 'P0001',
      message = 'Application Journey is temporarily unavailable.';
  end if;

  return query
  select
    application.id,
    coalesce(
      journey.university_decision,
      'pending'::public.university_application_decision
    ),
    journey.university_decision_date,
    coalesce(
      journey.offer_status,
      'none'::public.university_application_offer_status
    ),
    journey.offer_date,
    journey.conditional_offer_requirements,
    journey.condition_due_date,
    journey.conditions_satisfied_date,
    coalesce(
      journey.student_decision,
      'pending'::public.university_application_student_decision
    ),
    journey.student_decision_date,
    coalesce(
      journey.fee_status,
      'not_started'::public.university_application_fee_status
    ),
    journey.fee_payment_date,
    coalesce(
      journey.visa_status,
      'not_started'::public.university_application_visa_status
    ),
    journey.visa_submission_date,
    journey.visa_decision_date,
    coalesce(
      journey.enrollment_status,
      'not_enrolled'::public.university_application_enrollment_status
    ),
    journey.enrollment_date,
    journey.updated_at
  from public.student_university_applications as application
  left join public.student_university_application_journeys as journey
    on journey.application_id = application.id
  where application.student_id = v_caller_id
    and application.is_archived is false
  order by
    application.is_primary desc,
    application.last_changed_at desc,
    application.id desc
  limit 100;
end;
$function$;

create function public.record_university_application_journey(
  p_application_id uuid,
  p_university_decision public.university_application_decision,
  p_university_decision_date date,
  p_offer_status public.university_application_offer_status,
  p_offer_date date,
  p_conditional_offer_requirements text,
  p_condition_due_date date,
  p_conditions_satisfied_date date,
  p_student_decision public.university_application_student_decision,
  p_student_decision_date date,
  p_fee_status public.university_application_fee_status,
  p_fee_payment_date date,
  p_visa_status public.university_application_visa_status,
  p_visa_submission_date date,
  p_visa_decision_date date,
  p_enrollment_status public.university_application_enrollment_status,
  p_enrollment_date date,
  p_change_reason text
)
returns table (
  application_id uuid,
  university_decision public.university_application_decision,
  university_decision_date date,
  offer_status public.university_application_offer_status,
  offer_date date,
  conditional_offer_requirements text,
  condition_due_date date,
  conditions_satisfied_date date,
  student_decision public.university_application_student_decision,
  student_decision_date date,
  fee_status public.university_application_fee_status,
  fee_payment_date date,
  visa_status public.university_application_visa_status,
  visa_submission_date date,
  visa_decision_date date,
  enrollment_status public.university_application_enrollment_status,
  enrollment_date date,
  version_number integer,
  updated_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid;
  v_student_id uuid;
  v_application_status public.university_application_status;
  v_is_archived boolean;
  v_existing public.student_university_application_journeys%rowtype;
  v_has_existing boolean := false;
  v_requirements text;
  v_reason text;
  v_version integer;
  v_changed_at timestamptz := pg_catalog.statement_timestamp();
  v_old_university_decision public.university_application_decision :=
    'pending'::public.university_application_decision;
  v_old_offer_status public.university_application_offer_status :=
    'none'::public.university_application_offer_status;
  v_old_student_decision public.university_application_student_decision :=
    'pending'::public.university_application_student_decision;
  v_old_fee_status public.university_application_fee_status :=
    'not_started'::public.university_application_fee_status;
  v_old_visa_status public.university_application_visa_status :=
    'not_started'::public.university_application_visa_status;
  v_old_enrollment_status public.university_application_enrollment_status :=
    'not_enrolled'::public.university_application_enrollment_status;
begin
  v_caller_id := (select auth.uid());

  if v_caller_id is null
    or public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    ) is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey update is not permitted.';
  end if;

  select
    application.student_id,
    application.current_status,
    application.is_archived
  into
    v_student_id,
    v_application_status,
    v_is_archived
  from public.student_university_applications as application
  where application.id = p_application_id
  for update;

  if v_student_id is null
    or v_is_archived
    or v_application_status in (
      'withdrawn'::public.university_application_status,
      'closed'::public.university_application_status
    )
    or public.is_active_primary_counselor_for_student(v_student_id)
      is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Application Journey update is not permitted.';
  end if;

  v_requirements := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(
        coalesce(p_conditional_offer_requirements, '')
      ),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  v_reason := pg_catalog.regexp_replace(
    pg_catalog.btrim(coalesce(p_change_reason, '')),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if v_reason = ''
    or pg_catalog.char_length(v_reason) > 500
    or v_reason ~ '[[:cntrl:]]'
    or (
      v_requirements is not null
      and (
        pg_catalog.char_length(v_requirements) > 2000
        or v_requirements ~ '[[:cntrl:]]'
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Application Journey fields are invalid.';
  end if;

  if p_university_decision <>
      'pending'::public.university_application_decision
    and v_application_status <>
      'decision_received'::public.university_application_status then
    raise exception using
      errcode = '22023',
      message = 'Record the application decision status first.';
  end if;

  if (
      p_university_decision =
        'pending'::public.university_application_decision
      and p_university_decision_date is not null
    )
    or (
      p_offer_status = 'none'::public.university_application_offer_status
      and (
        p_university_decision =
          'offer_received'::public.university_application_decision
        or p_offer_date is not null
        or v_requirements is not null
        or p_condition_due_date is not null
        or p_conditions_satisfied_date is not null
      )
    )
    or (
      p_offer_status =
        'conditional'::public.university_application_offer_status
      and (
        p_university_decision <>
          'offer_received'::public.university_application_decision
        or v_requirements is null
      )
    )
    or (
      p_offer_status =
        'unconditional'::public.university_application_offer_status
      and (
        p_university_decision <>
          'offer_received'::public.university_application_decision
        or (
          v_requirements is not null
          and p_conditions_satisfied_date is null
        )
      )
    )
    or (
      v_requirements is null
      and (
        p_condition_due_date is not null
        or p_conditions_satisfied_date is not null
      )
    )
    or (
      p_student_decision =
        'pending'::public.university_application_student_decision
      and p_student_decision_date is not null
    )
    or (
      p_student_decision <>
        'pending'::public.university_application_student_decision
      and (
        p_university_decision <>
          'offer_received'::public.university_application_decision
        or p_offer_status <>
          'unconditional'::public.university_application_offer_status
      )
    )
    or (
      p_fee_status = 'not_started'::public.university_application_fee_status
      and p_fee_payment_date is not null
    )
    or (
      p_fee_status = 'pending'::public.university_application_fee_status
      and (
        p_student_decision <>
          'accepted'::public.university_application_student_decision
        or p_fee_payment_date is not null
      )
    )
    or (
      p_fee_status = 'paid'::public.university_application_fee_status
      and (
        p_student_decision <>
          'accepted'::public.university_application_student_decision
        or p_fee_payment_date is null
      )
    )
    or (
      p_visa_status <>
        'not_started'::public.university_application_visa_status
      and (
        p_student_decision <>
          'accepted'::public.university_application_student_decision
        or p_fee_status <>
          'paid'::public.university_application_fee_status
      )
    )
    or (
      p_visa_status in (
        'not_started'::public.university_application_visa_status,
        'preparing'::public.university_application_visa_status
      )
      and (
        p_visa_submission_date is not null
        or p_visa_decision_date is not null
      )
    )
    or (
      p_visa_status = 'submitted'::public.university_application_visa_status
      and (
        p_visa_submission_date is null
        or p_visa_decision_date is not null
      )
    )
    or (
      p_visa_status in (
        'approved'::public.university_application_visa_status,
        'refused'::public.university_application_visa_status
      )
      and (
        p_visa_submission_date is null
        or p_visa_decision_date is null
      )
    )
    or (
      p_enrollment_status =
        'not_enrolled'::public.university_application_enrollment_status
      and p_enrollment_date is not null
    )
    or (
      p_enrollment_status =
        'enrolled'::public.university_application_enrollment_status
      and (
        p_visa_status <>
          'approved'::public.university_application_visa_status
        or p_enrollment_date is null
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Application Journey fields are inconsistent.';
  end if;

  select journey.*
  into v_existing
  from public.student_university_application_journeys as journey
  where journey.application_id = p_application_id
  for update;
  v_has_existing := found;

  if v_has_existing then
    v_old_university_decision := v_existing.university_decision;
    v_old_offer_status := v_existing.offer_status;
    v_old_student_decision := v_existing.student_decision;
    v_old_fee_status := v_existing.fee_status;
    v_old_visa_status := v_existing.visa_status;
    v_old_enrollment_status := v_existing.enrollment_status;
  end if;

  if v_old_university_decision <> p_university_decision
    and not (
      (
        v_old_university_decision =
          'pending'::public.university_application_decision
        and p_university_decision in (
          'waitlisted'::public.university_application_decision,
          'rejected'::public.university_application_decision,
          'offer_received'::public.university_application_decision
        )
      )
      or (
        v_old_university_decision =
          'waitlisted'::public.university_application_decision
        and p_university_decision in (
          'rejected'::public.university_application_decision,
          'offer_received'::public.university_application_decision
        )
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'University decision transition is not permitted.';
  end if;

  if v_old_offer_status <> p_offer_status
    and not (
      v_old_offer_status =
        'none'::public.university_application_offer_status
      or (
        v_old_offer_status =
          'conditional'::public.university_application_offer_status
        and p_offer_status =
          'unconditional'::public.university_application_offer_status
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Offer transition is not permitted.';
  end if;

  if v_old_student_decision <> p_student_decision
    and v_old_student_decision <>
      'pending'::public.university_application_student_decision then
    raise exception using
      errcode = '22023',
      message = 'Student decision transition is not permitted.';
  end if;

  if v_old_fee_status <> p_fee_status
    and not (
      v_old_fee_status = 'not_started'::public.university_application_fee_status
      or (
        v_old_fee_status = 'pending'::public.university_application_fee_status
        and p_fee_status = 'paid'::public.university_application_fee_status
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Fee transition is not permitted.';
  end if;

  if v_old_visa_status <> p_visa_status
    and not (
      v_old_visa_status =
        'not_started'::public.university_application_visa_status
      or (
        v_old_visa_status =
          'preparing'::public.university_application_visa_status
        and p_visa_status in (
          'submitted'::public.university_application_visa_status,
          'approved'::public.university_application_visa_status,
          'refused'::public.university_application_visa_status
        )
      )
      or (
        v_old_visa_status =
          'submitted'::public.university_application_visa_status
        and p_visa_status in (
          'approved'::public.university_application_visa_status,
          'refused'::public.university_application_visa_status
        )
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'Visa transition is not permitted.';
  end if;

  if v_old_enrollment_status <> p_enrollment_status
    and v_old_enrollment_status <>
      'not_enrolled'::public.university_application_enrollment_status then
    raise exception using
      errcode = '22023',
      message = 'Enrollment transition is not permitted.';
  end if;

  if v_has_existing
    and v_existing.university_decision = p_university_decision
    and v_existing.university_decision_date is not distinct from
      p_university_decision_date
    and v_existing.offer_status = p_offer_status
    and v_existing.offer_date is not distinct from p_offer_date
    and v_existing.conditional_offer_requirements is not distinct from
      v_requirements
    and v_existing.condition_due_date is not distinct from p_condition_due_date
    and v_existing.conditions_satisfied_date is not distinct from
      p_conditions_satisfied_date
    and v_existing.student_decision = p_student_decision
    and v_existing.student_decision_date is not distinct from
      p_student_decision_date
    and v_existing.fee_status = p_fee_status
    and v_existing.fee_payment_date is not distinct from p_fee_payment_date
    and v_existing.visa_status = p_visa_status
    and v_existing.visa_submission_date is not distinct from
      p_visa_submission_date
    and v_existing.visa_decision_date is not distinct from p_visa_decision_date
    and v_existing.enrollment_status = p_enrollment_status
    and v_existing.enrollment_date is not distinct from p_enrollment_date then
    raise exception using
      errcode = '22023',
      message = 'Application Journey has not changed.';
  end if;

  if v_has_existing then
    v_version := v_existing.version_number + 1;

    update public.student_university_application_journeys as journey
    set
      university_decision = p_university_decision,
      university_decision_date = p_university_decision_date,
      offer_status = p_offer_status,
      offer_date = p_offer_date,
      conditional_offer_requirements = v_requirements,
      condition_due_date = p_condition_due_date,
      conditions_satisfied_date = p_conditions_satisfied_date,
      student_decision = p_student_decision,
      student_decision_date = p_student_decision_date,
      fee_status = p_fee_status,
      fee_payment_date = p_fee_payment_date,
      visa_status = p_visa_status,
      visa_submission_date = p_visa_submission_date,
      visa_decision_date = p_visa_decision_date,
      enrollment_status = p_enrollment_status,
      enrollment_date = p_enrollment_date,
      version_number = v_version,
      last_changed_by = v_caller_id,
      updated_at = v_changed_at
    where journey.application_id = p_application_id;
  else
    v_version := 1;

    insert into public.student_university_application_journeys (
      application_id,
      university_decision,
      university_decision_date,
      offer_status,
      offer_date,
      conditional_offer_requirements,
      condition_due_date,
      conditions_satisfied_date,
      student_decision,
      student_decision_date,
      fee_status,
      fee_payment_date,
      visa_status,
      visa_submission_date,
      visa_decision_date,
      enrollment_status,
      enrollment_date,
      version_number,
      created_by,
      last_changed_by,
      created_at,
      updated_at
    ) values (
      p_application_id,
      p_university_decision,
      p_university_decision_date,
      p_offer_status,
      p_offer_date,
      v_requirements,
      p_condition_due_date,
      p_conditions_satisfied_date,
      p_student_decision,
      p_student_decision_date,
      p_fee_status,
      p_fee_payment_date,
      p_visa_status,
      p_visa_submission_date,
      p_visa_decision_date,
      p_enrollment_status,
      p_enrollment_date,
      v_version,
      v_caller_id,
      v_caller_id,
      v_changed_at,
      v_changed_at
    );
  end if;

  insert into public.student_university_application_journey_events (
    application_id,
    version_number,
    university_decision,
    university_decision_date,
    offer_status,
    offer_date,
    conditional_offer_requirements,
    condition_due_date,
    conditions_satisfied_date,
    student_decision,
    student_decision_date,
    fee_status,
    fee_payment_date,
    visa_status,
    visa_submission_date,
    visa_decision_date,
    enrollment_status,
    enrollment_date,
    change_reason,
    changed_by,
    changed_at
  ) values (
    p_application_id,
    v_version,
    p_university_decision,
    p_university_decision_date,
    p_offer_status,
    p_offer_date,
    v_requirements,
    p_condition_due_date,
    p_conditions_satisfied_date,
    p_student_decision,
    p_student_decision_date,
    p_fee_status,
    p_fee_payment_date,
    p_visa_status,
    p_visa_submission_date,
    p_visa_decision_date,
    p_enrollment_status,
    p_enrollment_date,
    v_reason,
    v_caller_id,
    v_changed_at
  );

  return query
  select
    journey.application_id,
    journey.university_decision,
    journey.university_decision_date,
    journey.offer_status,
    journey.offer_date,
    journey.conditional_offer_requirements,
    journey.condition_due_date,
    journey.conditions_satisfied_date,
    journey.student_decision,
    journey.student_decision_date,
    journey.fee_status,
    journey.fee_payment_date,
    journey.visa_status,
    journey.visa_submission_date,
    journey.visa_decision_date,
    journey.enrollment_status,
    journey.enrollment_date,
    journey.version_number,
    journey.updated_at
  from public.student_university_application_journeys as journey
  where journey.application_id = p_application_id;
end;
$function$;

alter function public.get_counselor_university_application_journey(uuid)
  owner to postgres;
alter function public.get_counselor_university_application_journey_history(
  uuid,
  integer
) owner to postgres;
alter function public.get_my_university_application_journeys()
  owner to postgres;
alter function public.record_university_application_journey(
  uuid,
  public.university_application_decision,
  date,
  public.university_application_offer_status,
  date,
  text,
  date,
  date,
  public.university_application_student_decision,
  date,
  public.university_application_fee_status,
  date,
  public.university_application_visa_status,
  date,
  date,
  public.university_application_enrollment_status,
  date,
  text
) owner to postgres;

revoke all on function
  public.get_counselor_university_application_journey(uuid)
  from public, anon, authenticated;
revoke all on function
  public.get_counselor_university_application_journey_history(uuid, integer)
  from public, anon, authenticated;
revoke all on function public.get_my_university_application_journeys()
  from public, anon, authenticated;
revoke all on function public.record_university_application_journey(
  uuid,
  public.university_application_decision,
  date,
  public.university_application_offer_status,
  date,
  text,
  date,
  date,
  public.university_application_student_decision,
  date,
  public.university_application_fee_status,
  date,
  public.university_application_visa_status,
  date,
  date,
  public.university_application_enrollment_status,
  date,
  text
) from public, anon, authenticated;

grant usage on type public.university_application_decision to authenticated;
grant usage on type public.university_application_offer_status to authenticated;
grant usage on type public.university_application_student_decision to authenticated;
grant usage on type public.university_application_fee_status to authenticated;
grant usage on type public.university_application_visa_status to authenticated;
grant usage on type public.university_application_enrollment_status to authenticated;

grant execute on function
  public.get_counselor_university_application_journey(uuid)
  to authenticated;
grant execute on function
  public.get_counselor_university_application_journey_history(uuid, integer)
  to authenticated;
grant execute on function public.get_my_university_application_journeys()
  to authenticated;
grant execute on function public.record_university_application_journey(
  uuid,
  public.university_application_decision,
  date,
  public.university_application_offer_status,
  date,
  text,
  date,
  date,
  public.university_application_student_decision,
  date,
  public.university_application_fee_status,
  date,
  public.university_application_visa_status,
  date,
  date,
  public.university_application_enrollment_status,
  date,
  text
) to authenticated;

comment on function public.get_counselor_university_application_journey(uuid)
  is 'Returns one current or legacy-default Application Journey only to the active Primary Counselor.';

comment on function public.get_counselor_university_application_journey_history(
  uuid,
  integer
) is 'Returns bounded Application Journey snapshots only to the active Primary Counselor without actor identifiers.';

comment on function public.get_my_university_application_journeys()
  is 'Returns safe own nonarchived Application Journey projections to the active verified Student; no private notes, reasons, or actor identifiers.';

comment on function public.record_university_application_journey(
  uuid,
  public.university_application_decision,
  date,
  public.university_application_offer_status,
  date,
  text,
  date,
  date,
  public.university_application_student_decision,
  date,
  public.university_application_fee_status,
  date,
  public.university_application_visa_status,
  date,
  date,
  public.university_application_enrollment_status,
  date,
  text
) is 'Records one audited separated Application Journey snapshot after locking the application and rechecking active Primary Counselor ownership.';

commit;
