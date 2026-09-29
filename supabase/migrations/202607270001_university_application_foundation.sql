-- K-GEO Phase E1.1 university application tracking database foundation.
-- Review this migration before applying it. Apply it only after
-- 202607260002_progression_correction_foundation.sql and all earlier
-- migrations.
--
-- This migration is additive. It creates institution-owned university
-- application projections, append-only typed snapshots, and five focused
-- counselor mutation RPCs. It does not add application UI, Storage objects,
-- offer or visa data, or official-progression automation.

begin;

create type public.university_application_status as enum (
  'planning',
  'documents_collecting',
  'application_preparing',
  'ready_to_submit',
  'submitted',
  'under_university_review',
  'additional_information_requested',
  'decision_received',
  'withdrawn',
  'closed'
);

create type public.university_application_degree_level as enum (
  'bachelors',
  'masters',
  'postgraduate_diploma',
  'doctorate',
  'other'
);

create type public.university_application_intake_term as enum (
  'spring',
  'summer',
  'fall',
  'winter',
  'rolling',
  'other'
);

create type public.university_application_event_type as enum (
  'created',
  'details_updated',
  'status_changed',
  'primary_changed',
  'archived'
);

comment on type public.university_application_status is
  'Institution-controlled university application lifecycle; offer and visa outcomes are separate future domains.';

comment on type public.university_application_degree_level is
  'Validated degree level for one university application.';

comment on type public.university_application_intake_term is
  'Validated intake term for one university application.';

comment on type public.university_application_event_type is
  'Append-only mutation categories for university application snapshots; no delete or purge event exists.';

create table public.student_university_applications (
  id uuid
    constraint student_university_applications_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint student_university_applications_student_id_not_null not null
    constraint student_university_applications_student_id_fkey
      references public.profiles(id)
      on delete restrict,
  country_code text
    constraint student_university_applications_country_code_not_null
      not null,
  university_name text
    constraint student_university_applications_university_name_not_null
      not null,
  programme_name text
    constraint student_university_applications_programme_name_not_null
      not null,
  degree_level public.university_application_degree_level
    constraint student_university_applications_degree_level_not_null
      not null,
  intake_term public.university_application_intake_term
    constraint student_university_applications_intake_term_not_null
      not null,
  intake_year smallint
    constraint student_university_applications_intake_year_not_null
      not null,
  current_status public.university_application_status
    constraint student_university_applications_current_status_not_null
      not null
    default 'planning'::public.university_application_status,
  application_reference text,
  portal_url text,
  submission_deadline date,
  submitted_at timestamptz,
  is_primary boolean
    constraint student_university_applications_is_primary_not_null
      not null
    default false,
  is_archived boolean
    constraint student_university_applications_is_archived_not_null
      not null
    default false,
  archived_at timestamptz,
  archived_by uuid
    constraint student_university_applications_archived_by_fkey
      references public.profiles(id)
      on delete restrict,
  archive_reason text,
  version_number integer
    constraint student_university_applications_version_number_not_null
      not null
    default 1,
  created_by uuid
    constraint student_university_applications_created_by_not_null
      not null
    constraint student_university_applications_created_by_fkey
      references public.profiles(id)
      on delete restrict,
  last_changed_by uuid
    constraint student_university_applications_last_changed_by_not_null
      not null
    constraint student_university_applications_last_changed_by_fkey
      references public.profiles(id)
      on delete restrict,
  created_at timestamptz
    constraint student_university_applications_created_at_not_null
      not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint student_university_applications_updated_at_not_null
      not null
    default pg_catalog.now(),
  last_changed_at timestamptz
    constraint student_university_applications_last_changed_at_not_null
      not null
    default pg_catalog.now(),

  constraint student_university_applications_country_code_check
    check (
      country_code = pg_catalog.upper(pg_catalog.btrim(country_code))
      and country_code ~ '^[A-Z]{2}$'
    ),
  constraint student_university_applications_university_name_check
    check (
      university_name = pg_catalog.regexp_replace(
        pg_catalog.btrim(university_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(university_name) between 2 and 200
      and university_name !~ '[[:cntrl:]]'
    ),
  constraint student_university_applications_programme_name_check
    check (
      programme_name = pg_catalog.regexp_replace(
        pg_catalog.btrim(programme_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(programme_name) between 2 and 200
      and programme_name !~ '[[:cntrl:]]'
    ),
  constraint student_university_applications_intake_year_check
    check (intake_year between 2020 and 2100),
  constraint student_university_applications_reference_check
    check (
      application_reference is null
      or (
        application_reference = pg_catalog.regexp_replace(
          pg_catalog.btrim(application_reference),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(application_reference) between 1 and 100
        and application_reference !~ '[[:cntrl:]]'
      )
    ),
  constraint student_university_applications_portal_url_check
    check (
      portal_url is null
      or (
        portal_url = pg_catalog.btrim(portal_url)
        and pg_catalog.char_length(portal_url) between 1 and 2048
        and portal_url ~
          '^https://[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?:[/?#][^[:space:][:cntrl:]]*)?$'
        and portal_url !~ '^https://[^/?#]*@'
      )
    ),
  constraint student_university_applications_submission_state_check
    check (
      (
        current_status in (
          'planning'::public.university_application_status,
          'documents_collecting'::public.university_application_status,
          'application_preparing'::public.university_application_status,
          'ready_to_submit'::public.university_application_status
        )
        and submitted_at is null
      )
      or (
        current_status in (
          'submitted'::public.university_application_status,
          'under_university_review'::public.university_application_status,
          'additional_information_requested'::public.university_application_status,
          'decision_received'::public.university_application_status
        )
        and submitted_at is not null
      )
      or current_status in (
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    ),
  constraint student_university_applications_primary_consistency_check
    check (
      not is_primary
      or (
        not is_archived
        and current_status not in (
          'withdrawn'::public.university_application_status,
          'closed'::public.university_application_status
        )
      )
    ),
  constraint student_university_applications_archive_state_check
    check (
      (
        not is_archived
        and archived_at is null
        and archived_by is null
        and archive_reason is null
      )
      or (
        is_archived
        and archived_at is not null
        and archived_by is not null
        and archive_reason is not null
        and archive_reason = pg_catalog.regexp_replace(
          pg_catalog.btrim(archive_reason),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(archive_reason) between 1 and 500
        and archive_reason !~ '[[:cntrl:]]'
      )
    ),
  constraint student_university_applications_version_check
    check (version_number >= 1),
  constraint student_university_applications_actor_check
    check (
      student_id <> created_by
      and student_id <> last_changed_by
      and (
        archived_by is null
        or student_id <> archived_by
      )
    ),
  constraint student_university_applications_timestamp_check
    check (
      updated_at = last_changed_at
      and last_changed_at >= created_at
      and (
        submitted_at is null
        or submitted_at >= created_at
      )
      and (
        archived_at is null
        or archived_at >= created_at
      )
    )
);

create table public.student_university_application_events (
  id uuid
    constraint student_university_application_events_pkey primary key
    default pg_catalog.gen_random_uuid(),
  application_id uuid
    constraint student_university_application_events_application_id_not_null
      not null
    constraint student_university_application_events_application_id_fkey
      references public.student_university_applications(id)
      on delete restrict,
  event_type public.university_application_event_type
    constraint student_university_application_events_event_type_not_null
      not null,
  version_number integer
    constraint student_university_application_events_version_number_not_null
      not null,
  country_code text
    constraint student_university_application_events_country_code_not_null
      not null,
  university_name text
    constraint student_university_application_events_university_name_not_null
      not null,
  programme_name text
    constraint student_university_application_events_programme_name_not_null
      not null,
  degree_level public.university_application_degree_level
    constraint student_university_application_events_degree_level_not_null
      not null,
  intake_term public.university_application_intake_term
    constraint student_university_application_events_intake_term_not_null
      not null,
  intake_year smallint
    constraint student_university_application_events_intake_year_not_null
      not null,
  application_status public.university_application_status
    constraint student_university_application_events_application_status_not_null
      not null,
  application_reference text,
  portal_url text,
  submission_deadline date,
  submitted_at timestamptz,
  is_primary boolean
    constraint student_university_application_events_is_primary_not_null
      not null,
  is_archived boolean
    constraint student_university_application_events_is_archived_not_null
      not null,
  change_reason text,
  changed_by uuid
    constraint student_university_application_events_changed_by_not_null
      not null
    constraint student_university_application_events_changed_by_fkey
      references public.profiles(id)
      on delete restrict,
  changed_at timestamptz
    constraint student_university_application_events_changed_at_not_null
      not null
    default pg_catalog.now(),

  constraint student_university_application_events_application_version_key
    unique (application_id, version_number),
  constraint student_university_application_events_country_code_check
    check (
      country_code = pg_catalog.upper(pg_catalog.btrim(country_code))
      and country_code ~ '^[A-Z]{2}$'
    ),
  constraint student_university_application_events_university_name_check
    check (
      university_name = pg_catalog.regexp_replace(
        pg_catalog.btrim(university_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(university_name) between 2 and 200
      and university_name !~ '[[:cntrl:]]'
    ),
  constraint student_university_application_events_programme_name_check
    check (
      programme_name = pg_catalog.regexp_replace(
        pg_catalog.btrim(programme_name),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(programme_name) between 2 and 200
      and programme_name !~ '[[:cntrl:]]'
    ),
  constraint student_university_application_events_intake_year_check
    check (intake_year between 2020 and 2100),
  constraint student_university_application_events_reference_check
    check (
      application_reference is null
      or (
        application_reference = pg_catalog.regexp_replace(
          pg_catalog.btrim(application_reference),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(application_reference) between 1 and 100
        and application_reference !~ '[[:cntrl:]]'
      )
    ),
  constraint student_university_application_events_portal_url_check
    check (
      portal_url is null
      or (
        portal_url = pg_catalog.btrim(portal_url)
        and pg_catalog.char_length(portal_url) between 1 and 2048
        and portal_url ~
          '^https://[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?:[/?#][^[:space:][:cntrl:]]*)?$'
        and portal_url !~ '^https://[^/?#]*@'
      )
    ),
  constraint student_university_application_events_submission_state_check
    check (
      (
        application_status in (
          'planning'::public.university_application_status,
          'documents_collecting'::public.university_application_status,
          'application_preparing'::public.university_application_status,
          'ready_to_submit'::public.university_application_status
        )
        and submitted_at is null
      )
      or (
        application_status in (
          'submitted'::public.university_application_status,
          'under_university_review'::public.university_application_status,
          'additional_information_requested'::public.university_application_status,
          'decision_received'::public.university_application_status
        )
        and submitted_at is not null
      )
      or application_status in (
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    ),
  constraint student_university_application_events_primary_consistency_check
    check (
      not is_primary
      or (
        not is_archived
        and application_status not in (
          'withdrawn'::public.university_application_status,
          'closed'::public.university_application_status
        )
      )
    ),
  constraint student_university_application_events_reason_check
    check (
      (
        event_type = 'created'::public.university_application_event_type
        and change_reason is null
      )
      or (
        event_type <> 'created'::public.university_application_event_type
        and change_reason is not null
        and change_reason = pg_catalog.regexp_replace(
          pg_catalog.btrim(change_reason),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(change_reason) between 1 and 500
        and change_reason !~ '[[:cntrl:]]'
      )
    ),
  constraint student_university_application_events_type_version_check
    check (
      (
        version_number = 1
        and event_type =
          'created'::public.university_application_event_type
      )
      or (
        version_number > 1
        and event_type <>
          'created'::public.university_application_event_type
      )
    ),
  constraint student_university_application_events_version_check
    check (version_number >= 1)
);

comment on table public.student_university_applications is
  'Current institution-owned projection for zero or more university applications per student.';

comment on table public.student_university_application_events is
  'Append-only complete typed post-mutation snapshots written only by trusted E1.1 RPCs.';

comment on column public.student_university_applications.student_id is
  'Durable student profile target. Account deletion is restricted while institutional application history exists.';

comment on column public.student_university_applications.submitted_at is
  'Database timestamp set on the first transition to submitted and never automatically cleared.';

comment on column public.student_university_applications.version_number is
  'Starts at one and increases exactly once for each audited mutation affecting this projection.';

comment on column public.student_university_application_events.change_reason is
  'Required normalized institutional reason for every event except creation.';

create index student_university_applications_student_active_idx
  on public.student_university_applications (
    student_id,
    is_archived,
    is_primary desc,
    updated_at desc,
    id desc
  );

create index student_university_applications_student_status_idx
  on public.student_university_applications (
    student_id,
    current_status,
    updated_at desc,
    id desc
  );

create unique index student_university_applications_one_primary_idx
  on public.student_university_applications (student_id)
  where is_primary is true;

create index student_university_application_events_history_idx
  on public.student_university_application_events (
    application_id,
    version_number desc,
    changed_at desc,
    id desc
  );

comment on index
  public.student_university_applications_student_active_idx is
  'Supports the future bounded Student 360 ordering: active before archived, primary first, then newest projection.';

comment on index
  public.student_university_applications_student_status_idx is
  'Supports bounded per-student status filtering without speculative institution-wide reporting indexes.';

comment on index
  public.student_university_applications_one_primary_idx is
  'Enforces at most one primary application for a student; the row check prevents terminal or archived primary rows.';

comment on index
  public.student_university_application_events_history_idx is
  'Supports bounded newest-version application history and future keyset pagination.';

-- SECURITY: creation derives the counselor and all audit values from trusted
-- database state. Initial status, primary/archive flags, version, submitted
-- timestamp, actor, event type, and timestamps are not RPC parameters.
create function public.create_student_university_application(
  p_student_id uuid,
  p_country_code text,
  p_university_name text,
  p_programme_name text,
  p_degree_level text,
  p_intake_term text,
  p_intake_year integer,
  p_application_reference text,
  p_portal_url text,
  p_submission_deadline date
)
returns table (
  application_id uuid,
  student_id uuid,
  current_status public.university_application_status,
  is_primary boolean,
  is_archived boolean,
  version_number integer,
  created_at timestamptz,
  updated_at timestamptz,
  last_changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  normalized_country_code text;
  normalized_university_name text;
  normalized_programme_name text;
  normalized_degree_level text;
  normalized_intake_term text;
  normalized_application_reference text;
  normalized_portal_url text;
  requested_degree_level public.university_application_degree_level;
  requested_intake_term public.university_application_intake_term;
  new_application_id uuid;
  change_time timestamptz;
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

  if p_university_name ~ '[[:cntrl:]]'
    or p_programme_name ~ '[[:cntrl:]]'
    or p_application_reference ~ '[[:cntrl:]]'
    or p_portal_url ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  normalized_country_code :=
    pg_catalog.upper(pg_catalog.btrim(p_country_code));
  normalized_university_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_university_name),
    '[[:space:]]+',
    ' ',
    'g'
  );
  normalized_programme_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_programme_name),
    '[[:space:]]+',
    ' ',
    'g'
  );
  normalized_degree_level :=
    pg_catalog.lower(pg_catalog.btrim(p_degree_level));
  normalized_intake_term :=
    pg_catalog.lower(pg_catalog.btrim(p_intake_term));
  normalized_application_reference := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_application_reference),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  normalized_portal_url :=
    nullif(pg_catalog.btrim(p_portal_url), '');

  if p_student_id is null
    or normalized_country_code is null
    or normalized_university_name is null
    or normalized_programme_name is null
    or normalized_degree_level is null
    or normalized_intake_term is null
    or p_intake_year is null
    or normalized_country_code !~ '^[A-Z]{2}$'
    or pg_catalog.char_length(normalized_university_name)
      not between 2 and 200
    or pg_catalog.char_length(normalized_programme_name)
      not between 2 and 200
    or normalized_degree_level not in (
      'bachelors',
      'masters',
      'postgraduate_diploma',
      'doctorate',
      'other'
    )
    or normalized_intake_term not in (
      'spring',
      'summer',
      'fall',
      'winter',
      'rolling',
      'other'
    )
    or p_intake_year not between 2020 and 2100
    or pg_catalog.char_length(normalized_application_reference) > 100
    or pg_catalog.char_length(normalized_portal_url) > 2048
    or (
      normalized_portal_url is not null
      and (
        normalized_portal_url !~
          '^https://[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?:[/?#][^[:space:][:cntrl:]]*)?$'
        or normalized_portal_url ~ '^https://[^/?#]*@'
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  requested_degree_level :=
    normalized_degree_level::public.university_application_degree_level;
  requested_intake_term :=
    normalized_intake_term::public.university_application_intake_term;

  if not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(p_student_id::text, 202607270001)
  ) then
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = p_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  new_application_id := pg_catalog.gen_random_uuid();
  change_time := pg_catalog.statement_timestamp();

  insert into public.student_university_applications (
    id,
    student_id,
    country_code,
    university_name,
    programme_name,
    degree_level,
    intake_term,
    intake_year,
    current_status,
    application_reference,
    portal_url,
    submission_deadline,
    submitted_at,
    is_primary,
    is_archived,
    archived_at,
    archived_by,
    archive_reason,
    version_number,
    created_by,
    last_changed_by,
    created_at,
    updated_at,
    last_changed_at
  )
  values (
    new_application_id,
    p_student_id,
    normalized_country_code,
    normalized_university_name,
    normalized_programme_name,
    requested_degree_level,
    requested_intake_term,
    p_intake_year::smallint,
    'planning'::public.university_application_status,
    normalized_application_reference,
    normalized_portal_url,
    p_submission_deadline,
    null,
    false,
    false,
    null,
    null,
    null,
    1,
    caller_id,
    caller_id,
    change_time,
    change_time,
    change_time
  );

  insert into public.student_university_application_events (
    application_id,
    event_type,
    version_number,
    country_code,
    university_name,
    programme_name,
    degree_level,
    intake_term,
    intake_year,
    application_status,
    application_reference,
    portal_url,
    submission_deadline,
    submitted_at,
    is_primary,
    is_archived,
    change_reason,
    changed_by,
    changed_at
  )
  select
    application.id,
    'created'::public.university_application_event_type,
    application.version_number,
    application.country_code,
    application.university_name,
    application.programme_name,
    application.degree_level,
    application.intake_term,
    application.intake_year,
    application.current_status,
    application.application_reference,
    application.portal_url,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.is_archived,
    null,
    caller_id,
    change_time
  from public.student_university_applications as application
  where application.id = new_application_id;

  return query
  select
    application.id,
    application.student_id,
    application.current_status,
    application.is_primary,
    application.is_archived,
    application.version_number,
    application.created_at,
    application.updated_at,
    application.last_changed_at
  from public.student_university_applications as application
  where application.id = new_application_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value
    or invalid_text_representation
    or check_violation
    or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The university application could not be created';
end;
$function$;

-- The immutable student_id lookup below resolves only the advisory-lock key.
-- Every mutable field is read again under the shared student lock and a target
-- row FOR UPDATE lock. Direct ownership transfer is impossible.
create function public.update_student_university_application_details(
  p_application_id uuid,
  p_country_code text,
  p_university_name text,
  p_programme_name text,
  p_degree_level text,
  p_intake_term text,
  p_intake_year integer,
  p_application_reference text,
  p_portal_url text,
  p_submission_deadline date,
  p_change_reason text
)
returns table (
  application_id uuid,
  student_id uuid,
  current_status public.university_application_status,
  is_primary boolean,
  is_archived boolean,
  version_number integer,
  created_at timestamptz,
  updated_at timestamptz,
  last_changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  target_student_id uuid;
  current_application public.student_university_applications%rowtype;
  normalized_country_code text;
  normalized_university_name text;
  normalized_programme_name text;
  normalized_degree_level text;
  normalized_intake_term text;
  normalized_application_reference text;
  normalized_portal_url text;
  normalized_reason text;
  requested_degree_level public.university_application_degree_level;
  requested_intake_term public.university_application_intake_term;
  change_time timestamptz;
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

  if p_university_name ~ '[[:cntrl:]]'
    or p_programme_name ~ '[[:cntrl:]]'
    or p_application_reference ~ '[[:cntrl:]]'
    or p_portal_url ~ '[[:cntrl:]]'
    or p_change_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  normalized_country_code :=
    pg_catalog.upper(pg_catalog.btrim(p_country_code));
  normalized_university_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_university_name),
    '[[:space:]]+',
    ' ',
    'g'
  );
  normalized_programme_name := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_programme_name),
    '[[:space:]]+',
    ' ',
    'g'
  );
  normalized_degree_level :=
    pg_catalog.lower(pg_catalog.btrim(p_degree_level));
  normalized_intake_term :=
    pg_catalog.lower(pg_catalog.btrim(p_intake_term));
  normalized_application_reference := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_application_reference),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  normalized_portal_url :=
    nullif(pg_catalog.btrim(p_portal_url), '');
  normalized_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_change_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if p_application_id is null
    or normalized_country_code is null
    or normalized_university_name is null
    or normalized_programme_name is null
    or normalized_degree_level is null
    or normalized_intake_term is null
    or p_intake_year is null
    or normalized_country_code !~ '^[A-Z]{2}$'
    or pg_catalog.char_length(normalized_university_name)
      not between 2 and 200
    or pg_catalog.char_length(normalized_programme_name)
      not between 2 and 200
    or normalized_degree_level not in (
      'bachelors',
      'masters',
      'postgraduate_diploma',
      'doctorate',
      'other'
    )
    or normalized_intake_term not in (
      'spring',
      'summer',
      'fall',
      'winter',
      'rolling',
      'other'
    )
    or p_intake_year not between 2020 and 2100
    or pg_catalog.char_length(normalized_application_reference) > 100
    or pg_catalog.char_length(normalized_portal_url) > 2048
    or normalized_reason is null
    or pg_catalog.char_length(normalized_reason) > 500
    or (
      normalized_portal_url is not null
      and (
        normalized_portal_url !~
          '^https://[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?:[/?#][^[:space:][:cntrl:]]*)?$'
        or normalized_portal_url ~ '^https://[^/?#]*@'
      )
    ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  requested_degree_level :=
    normalized_degree_level::public.university_application_degree_level;
  requested_intake_term :=
    normalized_intake_term::public.university_application_intake_term;

  select application.student_id
  into target_student_id
  from public.student_university_applications as application
  where application.id = p_application_id;

  if not found or not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(target_student_id::text, 202607270001)
  ) then
    if not found then
      raise exception using
        errcode = '22023',
        message = 'The university application request is invalid';
    end if;
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = target_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  select application.*
  into current_application
  from public.student_university_applications as application
  where application.id = p_application_id
    and application.student_id = target_student_id
  for update;

  if not found or current_application.is_archived then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  if current_application.country_code = normalized_country_code
    and current_application.university_name = normalized_university_name
    and current_application.programme_name = normalized_programme_name
    and current_application.degree_level = requested_degree_level
    and current_application.intake_term = requested_intake_term
    and current_application.intake_year = p_intake_year
    and current_application.application_reference
      is not distinct from normalized_application_reference
    and current_application.portal_url
      is not distinct from normalized_portal_url
    and current_application.submission_deadline
      is not distinct from p_submission_deadline then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  change_time := pg_catalog.statement_timestamp();
  if change_time <= current_application.last_changed_at then
    change_time := current_application.last_changed_at
      + interval '1 microsecond';
  end if;

  update public.student_university_applications as application
  set
    country_code = normalized_country_code,
    university_name = normalized_university_name,
    programme_name = normalized_programme_name,
    degree_level = requested_degree_level,
    intake_term = requested_intake_term,
    intake_year = p_intake_year::smallint,
    application_reference = normalized_application_reference,
    portal_url = normalized_portal_url,
    submission_deadline = p_submission_deadline,
    version_number = application.version_number + 1,
    last_changed_by = caller_id,
    updated_at = change_time,
    last_changed_at = change_time
  where application.id = p_application_id;

  insert into public.student_university_application_events (
    application_id,
    event_type,
    version_number,
    country_code,
    university_name,
    programme_name,
    degree_level,
    intake_term,
    intake_year,
    application_status,
    application_reference,
    portal_url,
    submission_deadline,
    submitted_at,
    is_primary,
    is_archived,
    change_reason,
    changed_by,
    changed_at
  )
  select
    application.id,
    'details_updated'::public.university_application_event_type,
    application.version_number,
    application.country_code,
    application.university_name,
    application.programme_name,
    application.degree_level,
    application.intake_term,
    application.intake_year,
    application.current_status,
    application.application_reference,
    application.portal_url,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.is_archived,
    normalized_reason,
    caller_id,
    change_time
  from public.student_university_applications as application
  where application.id = p_application_id;

  return query
  select
    application.id,
    application.student_id,
    application.current_status,
    application.is_primary,
    application.is_archived,
    application.version_number,
    application.created_at,
    application.updated_at,
    application.last_changed_at
  from public.student_university_applications as application
  where application.id = p_application_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value
    or invalid_text_representation
    or check_violation
    or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The university application could not be updated';
end;
$function$;

create function public.record_student_university_application_status(
  p_application_id uuid,
  p_new_status text,
  p_change_reason text
)
returns table (
  application_id uuid,
  student_id uuid,
  current_status public.university_application_status,
  is_primary boolean,
  is_archived boolean,
  version_number integer,
  created_at timestamptz,
  updated_at timestamptz,
  last_changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  target_student_id uuid;
  current_application public.student_university_applications%rowtype;
  normalized_status text;
  normalized_reason text;
  requested_status public.university_application_status;
  next_submitted_at timestamptz;
  next_primary boolean;
  change_time timestamptz;
  transition_allowed boolean;
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

  if p_change_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  normalized_status :=
    pg_catalog.lower(pg_catalog.btrim(p_new_status));
  normalized_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_change_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if p_application_id is null
    or normalized_status is null
    or normalized_status not in (
      'planning',
      'documents_collecting',
      'application_preparing',
      'ready_to_submit',
      'submitted',
      'under_university_review',
      'additional_information_requested',
      'decision_received',
      'withdrawn',
      'closed'
    )
    or normalized_reason is null
    or pg_catalog.char_length(normalized_reason) > 500 then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  requested_status :=
    normalized_status::public.university_application_status;

  select application.student_id
  into target_student_id
  from public.student_university_applications as application
  where application.id = p_application_id;

  if not found or not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(target_student_id::text, 202607270001)
  ) then
    if not found then
      raise exception using
        errcode = '22023',
        message = 'The university application request is invalid';
    end if;
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = target_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  select application.*
  into current_application
  from public.student_university_applications as application
  where application.id = p_application_id
    and application.student_id = target_student_id
  for update;

  if not found
    or current_application.is_archived
    or current_application.current_status in (
      'withdrawn'::public.university_application_status,
      'closed'::public.university_application_status
    )
    or current_application.current_status = requested_status then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  transition_allowed := case current_application.current_status
    when 'planning'::public.university_application_status then
      requested_status in (
        'documents_collecting'::public.university_application_status,
        'application_preparing'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'documents_collecting'::public.university_application_status then
      requested_status in (
        'application_preparing'::public.university_application_status,
        'ready_to_submit'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'application_preparing'::public.university_application_status then
      requested_status in (
        'documents_collecting'::public.university_application_status,
        'ready_to_submit'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'ready_to_submit'::public.university_application_status then
      requested_status in (
        'submitted'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'submitted'::public.university_application_status then
      requested_status in (
        'under_university_review'::public.university_application_status,
        'additional_information_requested'::public.university_application_status,
        'decision_received'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'under_university_review'::public.university_application_status then
      requested_status in (
        'additional_information_requested'::public.university_application_status,
        'decision_received'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'additional_information_requested'::public.university_application_status then
      requested_status in (
        'under_university_review'::public.university_application_status,
        'decision_received'::public.university_application_status,
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    when 'decision_received'::public.university_application_status then
      requested_status in (
        'withdrawn'::public.university_application_status,
        'closed'::public.university_application_status
      )
    else false
  end;

  if not transition_allowed then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  change_time := pg_catalog.statement_timestamp();
  if change_time <= current_application.last_changed_at then
    change_time := current_application.last_changed_at
      + interval '1 microsecond';
  end if;

  next_submitted_at := current_application.submitted_at;
  if requested_status =
      'submitted'::public.university_application_status
    and next_submitted_at is null then
    next_submitted_at := change_time;
  end if;

  next_primary := current_application.is_primary
    and requested_status not in (
      'withdrawn'::public.university_application_status,
      'closed'::public.university_application_status
    );

  update public.student_university_applications as application
  set
    current_status = requested_status,
    submitted_at = next_submitted_at,
    is_primary = next_primary,
    version_number = application.version_number + 1,
    last_changed_by = caller_id,
    updated_at = change_time,
    last_changed_at = change_time
  where application.id = p_application_id;

  insert into public.student_university_application_events (
    application_id,
    event_type,
    version_number,
    country_code,
    university_name,
    programme_name,
    degree_level,
    intake_term,
    intake_year,
    application_status,
    application_reference,
    portal_url,
    submission_deadline,
    submitted_at,
    is_primary,
    is_archived,
    change_reason,
    changed_by,
    changed_at
  )
  select
    application.id,
    'status_changed'::public.university_application_event_type,
    application.version_number,
    application.country_code,
    application.university_name,
    application.programme_name,
    application.degree_level,
    application.intake_term,
    application.intake_year,
    application.current_status,
    application.application_reference,
    application.portal_url,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.is_archived,
    normalized_reason,
    caller_id,
    change_time
  from public.student_university_applications as application
  where application.id = p_application_id;

  return query
  select
    application.id,
    application.student_id,
    application.current_status,
    application.is_primary,
    application.is_archived,
    application.version_number,
    application.created_at,
    application.updated_at,
    application.last_changed_at
  from public.student_university_applications as application
  where application.id = p_application_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value
    or invalid_text_representation
    or check_violation
    or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The university application status could not be updated';
end;
$function$;

create function public.set_primary_student_university_application(
  p_application_id uuid,
  p_change_reason text
)
returns table (
  application_id uuid,
  student_id uuid,
  current_status public.university_application_status,
  is_primary boolean,
  is_archived boolean,
  version_number integer,
  created_at timestamptz,
  updated_at timestamptz,
  last_changed_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  target_student_id uuid;
  target_application public.student_university_applications%rowtype;
  previous_primary public.student_university_applications%rowtype;
  previous_primary_exists boolean;
  normalized_reason text;
  change_time timestamptz;
  latest_prior_change timestamptz;
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

  if p_change_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
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

  if p_application_id is null
    or normalized_reason is null
    or pg_catalog.char_length(normalized_reason) > 500 then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  select application.student_id
  into target_student_id
  from public.student_university_applications as application
  where application.id = p_application_id;

  if not found or not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(target_student_id::text, 202607270001)
  ) then
    if not found then
      raise exception using
        errcode = '22023',
        message = 'The university application request is invalid';
    end if;
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = target_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  -- Lock the target and current primary in UUID order even though the shared
  -- per-student advisory lock already serializes application mutations.
  perform application.id
  from public.student_university_applications as application
  where application.student_id = target_student_id
    and (
      application.id = p_application_id
      or application.is_primary
    )
  order by application.id
  for update;

  select application.*
  into target_application
  from public.student_university_applications as application
  where application.id = p_application_id
    and application.student_id = target_student_id;

  if not found
    or target_application.is_archived
    or target_application.is_primary
    or target_application.current_status in (
      'withdrawn'::public.university_application_status,
      'closed'::public.university_application_status
    ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  select application.*
  into previous_primary
  from public.student_university_applications as application
  where application.student_id = target_student_id
    and application.is_primary
    and application.id <> p_application_id;
  previous_primary_exists := found;

  latest_prior_change := target_application.last_changed_at;
  if previous_primary_exists
    and previous_primary.last_changed_at > latest_prior_change then
    latest_prior_change := previous_primary.last_changed_at;
  end if;

  change_time := pg_catalog.statement_timestamp();
  if change_time <= latest_prior_change then
    change_time := latest_prior_change + interval '1 microsecond';
  end if;

  if previous_primary_exists then
    update public.student_university_applications as application
    set
      is_primary = false,
      version_number = application.version_number + 1,
      last_changed_by = caller_id,
      updated_at = change_time,
      last_changed_at = change_time
    where application.id = previous_primary.id;

    insert into public.student_university_application_events (
      application_id,
      event_type,
      version_number,
      country_code,
      university_name,
      programme_name,
      degree_level,
      intake_term,
      intake_year,
      application_status,
      application_reference,
      portal_url,
      submission_deadline,
      submitted_at,
      is_primary,
      is_archived,
      change_reason,
      changed_by,
      changed_at
    )
    select
      application.id,
      'primary_changed'::public.university_application_event_type,
      application.version_number,
      application.country_code,
      application.university_name,
      application.programme_name,
      application.degree_level,
      application.intake_term,
      application.intake_year,
      application.current_status,
      application.application_reference,
      application.portal_url,
      application.submission_deadline,
      application.submitted_at,
      application.is_primary,
      application.is_archived,
      normalized_reason,
      caller_id,
      change_time
    from public.student_university_applications as application
    where application.id = previous_primary.id;
  end if;

  update public.student_university_applications as application
  set
    is_primary = true,
    version_number = application.version_number + 1,
    last_changed_by = caller_id,
    updated_at = change_time,
    last_changed_at = change_time
  where application.id = p_application_id;

  insert into public.student_university_application_events (
    application_id,
    event_type,
    version_number,
    country_code,
    university_name,
    programme_name,
    degree_level,
    intake_term,
    intake_year,
    application_status,
    application_reference,
    portal_url,
    submission_deadline,
    submitted_at,
    is_primary,
    is_archived,
    change_reason,
    changed_by,
    changed_at
  )
  select
    application.id,
    'primary_changed'::public.university_application_event_type,
    application.version_number,
    application.country_code,
    application.university_name,
    application.programme_name,
    application.degree_level,
    application.intake_term,
    application.intake_year,
    application.current_status,
    application.application_reference,
    application.portal_url,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.is_archived,
    normalized_reason,
    caller_id,
    change_time
  from public.student_university_applications as application
  where application.id = p_application_id;

  return query
  select
    application.id,
    application.student_id,
    application.current_status,
    application.is_primary,
    application.is_archived,
    application.version_number,
    application.created_at,
    application.updated_at,
    application.last_changed_at
  from public.student_university_applications as application
  where application.id = p_application_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value
    or invalid_text_representation
    or check_violation
    or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  when serialization_failure
    or lock_not_available
    or unique_violation then
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The primary university application could not be updated';
end;
$function$;

create function public.archive_student_university_application(
  p_application_id uuid,
  p_archive_reason text
)
returns table (
  application_id uuid,
  student_id uuid,
  is_archived boolean,
  is_primary boolean,
  version_number integer,
  archived_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  target_student_id uuid;
  current_application public.student_university_applications%rowtype;
  normalized_reason text;
  change_time timestamptz;
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

  if p_archive_reason ~ '[[:cntrl:]]' then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  normalized_reason := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_archive_reason),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );

  if p_application_id is null
    or normalized_reason is null
    or pg_catalog.char_length(normalized_reason) > 500 then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  select application.student_id
  into target_student_id
  from public.student_university_applications as application
  where application.id = p_application_id;

  if not found or not pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtextextended(target_student_id::text, 202607270001)
  ) then
    if not found then
      raise exception using
        errcode = '22023',
        message = 'The university application request is invalid';
    end if;
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  end if;

  if not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = target_student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  select application.*
  into current_application
  from public.student_university_applications as application
  where application.id = p_application_id
    and application.student_id = target_student_id
  for update;

  if not found or current_application.is_archived then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  end if;

  change_time := pg_catalog.statement_timestamp();
  if change_time <= current_application.last_changed_at then
    change_time := current_application.last_changed_at
      + interval '1 microsecond';
  end if;

  update public.student_university_applications as application
  set
    is_primary = false,
    is_archived = true,
    archived_at = change_time,
    archived_by = caller_id,
    archive_reason = normalized_reason,
    version_number = application.version_number + 1,
    last_changed_by = caller_id,
    updated_at = change_time,
    last_changed_at = change_time
  where application.id = p_application_id;

  insert into public.student_university_application_events (
    application_id,
    event_type,
    version_number,
    country_code,
    university_name,
    programme_name,
    degree_level,
    intake_term,
    intake_year,
    application_status,
    application_reference,
    portal_url,
    submission_deadline,
    submitted_at,
    is_primary,
    is_archived,
    change_reason,
    changed_by,
    changed_at
  )
  select
    application.id,
    'archived'::public.university_application_event_type,
    application.version_number,
    application.country_code,
    application.university_name,
    application.programme_name,
    application.degree_level,
    application.intake_term,
    application.intake_year,
    application.current_status,
    application.application_reference,
    application.portal_url,
    application.submission_deadline,
    application.submitted_at,
    application.is_primary,
    application.is_archived,
    normalized_reason,
    caller_id,
    change_time
  from public.student_university_applications as application
  where application.id = p_application_id;

  return query
  select
    application.id,
    application.student_id,
    application.is_archived,
    application.is_primary,
    application.version_number,
    application.archived_at,
    application.updated_at
  from public.student_university_applications as application
  where application.id = p_application_id;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value
    or invalid_text_representation
    or check_violation
    or foreign_key_violation then
    raise exception using
      errcode = '22023',
      message = 'The university application request is invalid';
  when serialization_failure or lock_not_available then
    raise exception using
      errcode = '40001',
      message = 'The university applications changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The university application could not be archived';
end;
$function$;

alter function public.create_student_university_application(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date
) owner to postgres;

alter function public.update_student_university_application_details(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date,
  text
) owner to postgres;

alter function public.record_student_university_application_status(
  uuid,
  text,
  text
) owner to postgres;

alter function public.set_primary_student_university_application(
  uuid,
  text
) owner to postgres;

alter function public.archive_student_university_application(
  uuid,
  text
) owner to postgres;

comment on function public.create_student_university_application(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date
) is
  'Creates one normalized planning application and its version-one snapshot for a trusted student target.';

comment on function public.update_student_university_application_details(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date,
  text
) is
  'Atomically updates approved application details and appends one complete details snapshot.';

comment on function public.record_student_university_application_status(
  uuid,
  text,
  text
) is
  'Applies one permitted application-status transition and appends one complete status snapshot.';

comment on function public.set_primary_student_university_application(
  uuid,
  text
) is
  'Atomically switches the one allowed primary application and audits every affected projection.';

comment on function public.archive_student_university_application(
  uuid,
  text
) is
  'Soft-archives one application, clears primary state, preserves status, and appends one complete snapshot.';

alter table public.student_university_applications
  enable row level security;
alter table public.student_university_application_events
  enable row level security;

revoke all privileges on table
  public.student_university_applications
  from public, anon, authenticated;
revoke all privileges on table
  public.student_university_application_events
  from public, anon, authenticated;

revoke all privileges on type
  public.university_application_status
  from public, anon, authenticated;
revoke all privileges on type
  public.university_application_degree_level
  from public, anon, authenticated;
revoke all privileges on type
  public.university_application_intake_term
  from public, anon, authenticated;
revoke all privileges on type
  public.university_application_event_type
  from public, anon, authenticated;

revoke all on function public.create_student_university_application(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date
) from public, anon, authenticated;
revoke all on function public.update_student_university_application_details(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date,
  text
) from public, anon, authenticated;
revoke all on function public.record_student_university_application_status(
  uuid,
  text,
  text
) from public, anon, authenticated;
revoke all on function public.set_primary_student_university_application(
  uuid,
  text
) from public, anon, authenticated;
revoke all on function public.archive_student_university_application(
  uuid,
  text
) from public, anon, authenticated;

grant usage on type public.university_application_status
  to authenticated;
grant usage on type public.university_application_degree_level
  to authenticated;
grant usage on type public.university_application_intake_term
  to authenticated;
grant usage on type public.university_application_event_type
  to authenticated;

-- Actor UUID columns are intentionally omitted from direct authenticated
-- SELECT grants. The counselor policy still applies to every approved field.
grant select (
  id,
  student_id,
  country_code,
  university_name,
  programme_name,
  degree_level,
  intake_term,
  intake_year,
  current_status,
  application_reference,
  portal_url,
  submission_deadline,
  submitted_at,
  is_primary,
  is_archived,
  archived_at,
  archive_reason,
  version_number,
  created_at,
  updated_at,
  last_changed_at
) on table public.student_university_applications
  to authenticated;

grant select (
  id,
  application_id,
  event_type,
  version_number,
  country_code,
  university_name,
  programme_name,
  degree_level,
  intake_term,
  intake_year,
  application_status,
  application_reference,
  portal_url,
  submission_deadline,
  submitted_at,
  is_primary,
  is_archived,
  change_reason,
  changed_at
) on table public.student_university_application_events
  to authenticated;

grant execute on function public.create_student_university_application(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date
) to authenticated;
grant execute on function public.update_student_university_application_details(
  uuid,
  text,
  text,
  text,
  text,
  text,
  integer,
  text,
  text,
  date,
  text
) to authenticated;
grant execute on function public.record_student_university_application_status(
  uuid,
  text,
  text
) to authenticated;
grant execute on function public.set_primary_student_university_application(
  uuid,
  text
) to authenticated;
grant execute on function public.archive_student_university_application(
  uuid,
  text
) to authenticated;

create policy student_university_applications_select_counselor
on public.student_university_applications
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy student_university_application_events_select_counselor
on public.student_university_application_events
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy student_university_applications_select_counselor
  on public.student_university_applications is
  'Any active verified counselor may read approved institutional application fields; students, admins, directors, and anonymous callers have no policy.';

comment on policy student_university_application_events_select_counselor
  on public.student_university_application_events is
  'Any active verified counselor may read approved append-only snapshots; no application role receives direct mutation access.';

-- No INSERT, UPDATE, DELETE, or TRUNCATE policy or grant exists on either
-- E1.1 table. There is no restore RPC and no hard-delete workflow. Profile
-- deletion remains restricted while retained application or actor history
-- exists. University application status remains independent from official
-- counseling progression; none of these functions reads or mutates D3 data.
-- Future global reporting indexes require EXPLAIN evidence before addition.

commit;
