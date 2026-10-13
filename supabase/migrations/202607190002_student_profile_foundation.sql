-- K-GEO detailed student-profile foundation (Phase A).
-- Review this migration before applying it. Apply it only after
-- 202607190001_single_counselor_slot_booking.sql.
--
-- This migration is additive. It does not alter public.profiles,
-- public.consultation_requests, existing Auth users, or existing bookings.

begin;

create type public.student_profile_status as enum (
  'draft',
  'submitted'
);

create type public.student_preferred_study_level as enum (
  'masters',
  'postgraduate_diploma',
  'mba',
  'phd',
  'other'
);

create type public.student_study_mode as enum (
  'full_time',
  'part_time',
  'either'
);

create type public.student_academic_preference as enum (
  'coursework',
  'research',
  'either',
  'undecided'
);

create type public.student_planning_stage as enum (
  'exploring',
  'preparing_exams',
  'shortlisting',
  'preparing_documents',
  'applications_started'
);

create type public.student_exam_name as enum (
  'ielts',
  'toefl',
  'pte',
  'gre',
  'gmat',
  'gate',
  'other'
);

create type public.student_exam_status as enum (
  'not_planned',
  'planning',
  'booked',
  'completed',
  'not_required'
);

create type public.student_achievement_type as enum (
  'internship',
  'project',
  'certification',
  'research',
  'publication',
  'award',
  'hackathon',
  'leadership',
  'volunteering',
  'work_experience',
  'other'
);

comment on type public.student_profile_status is
  'Protected draft/submitted workflow marker. Counseling readiness is derived separately and cannot become stale.';

comment on type public.student_planning_stage is
  'Student-reported planning stage, not an official counselor-controlled progression status.';

comment on type public.student_exam_name is
  'Supported entrance and language exams. The other value requires custom_exam_name.';

comment on type public.student_achievement_type is
  'Student-reported achievement and experience categories.';

-- CHECK constraints cannot contain subqueries directly. This immutable helper
-- validates bounded, trimmed, non-empty, case-insensitively unique arrays.
create function public.is_valid_student_profile_text_array(
  p_values text[],
  p_max_items integer,
  p_max_item_length integer
)
returns boolean
language sql
immutable
strict
security invoker
set search_path = ''
as $function$
  select
    p_max_items >= 0
    and p_max_item_length > 0
    and pg_catalog.cardinality(p_values) <= p_max_items
    and not exists (
      select 1
      from pg_catalog.unnest(p_values) as value(item)
      where value.item is null
        or value.item <> pg_catalog.btrim(value.item)
        or pg_catalog.char_length(value.item) < 1
        or pg_catalog.char_length(value.item) > p_max_item_length
    )
    and (
      select pg_catalog.count(*) =
        pg_catalog.count(distinct pg_catalog.lower(value.item))
      from pg_catalog.unnest(p_values) as value(item)
    );
$function$;

comment on function public.is_valid_student_profile_text_array(
  text[], integer, integer
) is
  'Validates bounded canonical text arrays without reading database rows.';

create table public.student_profiles (
  student_id uuid
    constraint student_profiles_pkey primary key
    constraint student_profiles_student_id_fkey
      references public.profiles(id)
      on delete cascade,
  roll_number text
    constraint student_profiles_roll_number_not_null not null,
  personal_email text
    constraint student_profiles_personal_email_not_null not null,
  mobile_number text
    constraint student_profiles_mobile_number_not_null not null,
  college text
    constraint student_profiles_college_not_null not null,
  course text
    constraint student_profiles_course_not_null not null,
  department text
    constraint student_profiles_department_not_null not null,
  current_year integer,
  current_semester integer,
  graduation_year integer
    constraint student_profiles_graduation_year_not_null not null,
  cgpa numeric(5, 2),
  cgpa_scale numeric(4, 2)
    constraint student_profiles_cgpa_scale_not_null not null
    default 10.00,
  cgpa_unavailable boolean
    constraint student_profiles_cgpa_unavailable_not_null not null
    default false,
  active_backlogs integer
    constraint student_profiles_active_backlogs_not_null not null
    default 0,
  cleared_backlogs integer
    constraint student_profiles_cleared_backlogs_not_null not null
    default 0,
  sslc_percentage numeric(5, 2),
  hsc_percentage numeric(5, 2),
  diploma_percentage numeric(5, 2),
  academic_remarks text,
  profile_status public.student_profile_status
    constraint student_profiles_profile_status_not_null not null
    default 'draft'::public.student_profile_status,
  profile_submitted_at timestamptz,
  created_at timestamptz
    constraint student_profiles_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint student_profiles_updated_at_not_null not null
    default pg_catalog.now(),

  constraint student_profiles_roll_number_check
    check (
      roll_number = pg_catalog.upper(pg_catalog.btrim(roll_number))
      and pg_catalog.char_length(roll_number) between 1 and 50
    ),
  constraint student_profiles_personal_email_check
    check (
      personal_email = pg_catalog.lower(pg_catalog.btrim(personal_email))
      and pg_catalog.char_length(personal_email) <= 320
      and personal_email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    ),
  constraint student_profiles_mobile_number_check
    check (mobile_number ~ '^[0-9]{10}$'),
  constraint student_profiles_college_check
    check (
      college = pg_catalog.btrim(college)
      and pg_catalog.char_length(college) between 1 and 150
    ),
  constraint student_profiles_course_check
    check (
      course = pg_catalog.btrim(course)
      and pg_catalog.char_length(course) between 1 and 150
    ),
  constraint student_profiles_department_check
    check (
      department = pg_catalog.btrim(department)
      and pg_catalog.char_length(department) between 1 and 150
    ),
  constraint student_profiles_current_year_check
    check (current_year is null or current_year between 1 and 8),
  constraint student_profiles_current_semester_check
    check (current_semester is null or current_semester between 1 and 16),
  constraint student_profiles_year_semester_check
    check (
      current_year is null
      or current_semester is null
      or current_semester between
        ((current_year - 1) * 2 + 1)
        and (current_year * 2)
    ),
  -- This static range matches the current consultation model and can be
  -- expanded later through a reviewed migration.
  constraint student_profiles_graduation_year_check
    check (graduation_year between 2024 and 2040),
  constraint student_profiles_cgpa_scale_check
    check (cgpa_scale in (4.00, 10.00)),
  constraint student_profiles_cgpa_check
    check (cgpa is null or (cgpa >= 0 and cgpa <= cgpa_scale)),
  constraint student_profiles_cgpa_availability_check
    check (not (cgpa is not null and cgpa_unavailable is true)),
  constraint student_profiles_active_backlogs_check
    check (active_backlogs between 0 and 100),
  constraint student_profiles_cleared_backlogs_check
    check (cleared_backlogs between 0 and 100),
  constraint student_profiles_sslc_percentage_check
    check (
      sslc_percentage is null
      or sslc_percentage between 0 and 100
    ),
  constraint student_profiles_hsc_percentage_check
    check (
      hsc_percentage is null
      or hsc_percentage between 0 and 100
    ),
  constraint student_profiles_diploma_percentage_check
    check (
      diploma_percentage is null
      or diploma_percentage between 0 and 100
    ),
  constraint student_profiles_academic_remarks_check
    check (
      academic_remarks is null
      or (
        academic_remarks = pg_catalog.btrim(academic_remarks)
        and pg_catalog.char_length(academic_remarks) between 1 and 2000
      )
    ),
  constraint student_profiles_submission_state_check
    check (
      (
        profile_status = 'submitted'::public.student_profile_status
        and profile_submitted_at is not null
      )
      or (
        profile_status <> 'submitted'::public.student_profile_status
        and profile_submitted_at is null
      )
    ),
  constraint student_profiles_submitted_at_check
    check (
      profile_submitted_at is null
      or profile_submitted_at between created_at and updated_at
    ),
  constraint student_profiles_updated_at_check
    check (updated_at >= created_at)
);

create table public.student_preferences (
  student_id uuid
    constraint student_preferences_pkey primary key
    constraint student_preferences_student_id_fkey
      references public.profiles(id)
      on delete cascade,
  higher_studies_interest public.higher_studies_interest
    constraint student_preferences_interest_not_null not null,
  preferred_study_level public.student_preferred_study_level,
  preferred_countries text[]
    constraint student_preferences_countries_not_null not null
    default '{}'::text[],
  preferred_program_areas text[]
    constraint student_preferences_program_areas_not_null not null
    default '{}'::text[],
  target_intake text,
  budget_range text,
  scholarship_required boolean,
  funding_required boolean,
  study_mode public.student_study_mode,
  academic_preference public.student_academic_preference,
  student_planning_stage public.student_planning_stage,
  created_at timestamptz
    constraint student_preferences_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint student_preferences_updated_at_not_null not null
    default pg_catalog.now(),

  constraint student_preferences_countries_check
    check (
      public.is_valid_student_profile_text_array(
        preferred_countries,
        10,
        80
      )
    ),
  constraint student_preferences_program_areas_check
    check (
      public.is_valid_student_profile_text_array(
        preferred_program_areas,
        10,
        120
      )
    ),
  -- Canonical examples: fall-2027, spring-2028.
  constraint student_preferences_target_intake_check
    check (
      target_intake is null
      or (
        target_intake = pg_catalog.lower(pg_catalog.btrim(target_intake))
        and target_intake ~ '^(spring|summer|fall|winter)-20[2-9][0-9]$'
      )
    ),
  constraint student_preferences_budget_range_check
    check (
      budget_range is null
      or (
        budget_range = pg_catalog.btrim(budget_range)
        and pg_catalog.char_length(budget_range) between 1 and 100
      )
    ),
  constraint student_preferences_updated_at_check
    check (updated_at >= created_at)
);

create table public.student_test_scores (
  id uuid
    constraint student_test_scores_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint student_test_scores_student_id_not_null not null
    constraint student_test_scores_student_id_fkey
      references public.profiles(id)
      on delete cascade,
  exam_name public.student_exam_name
    constraint student_test_scores_exam_name_not_null not null,
  custom_exam_name text,
  exam_status public.student_exam_status
    constraint student_test_scores_exam_status_not_null not null,
  attempt_number integer
    constraint student_test_scores_attempt_number_not_null not null
    default 1,
  planned_date date,
  completed_date date,
  score text,
  valid_until date,
  remarks text,
  created_at timestamptz
    constraint student_test_scores_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint student_test_scores_updated_at_not_null not null
    default pg_catalog.now(),

  constraint student_test_scores_custom_exam_name_check
    check (
      (
        exam_name = 'other'::public.student_exam_name
        and custom_exam_name is not null
        and custom_exam_name = pg_catalog.btrim(custom_exam_name)
        and pg_catalog.char_length(custom_exam_name) between 1 and 100
      )
      or (
        exam_name <> 'other'::public.student_exam_name
        and custom_exam_name is null
      )
    ),
  constraint student_test_scores_attempt_number_check
    check (attempt_number between 1 and 20),
  constraint student_test_scores_completed_status_check
    check (
      (
        exam_status = 'completed'::public.student_exam_status
        and completed_date is not null
      )
      or (
        exam_status <> 'completed'::public.student_exam_status
        and completed_date is null
      )
    ),
  constraint student_test_scores_booked_status_check
    check (
      exam_status <> 'booked'::public.student_exam_status
      or planned_date is not null
    ),
  constraint student_test_scores_inactive_status_check
    check (
      exam_status not in (
        'not_planned'::public.student_exam_status,
        'not_required'::public.student_exam_status
      )
      or (
        planned_date is null
        and completed_date is null
        and score is null
        and valid_until is null
      )
    ),
  constraint student_test_scores_date_order_check
    check (
      planned_date is null
      or completed_date is null
      or completed_date >= planned_date
    ),
  constraint student_test_scores_valid_until_check
    check (
      valid_until is null
      or (
        completed_date is not null
        and valid_until >= completed_date
      )
    ),
  constraint student_test_scores_score_check
    check (
      score is null
      or (
        exam_status = 'completed'::public.student_exam_status
        and score = pg_catalog.btrim(score)
        and pg_catalog.char_length(score) between 1 and 100
      )
    ),
  constraint student_test_scores_remarks_check
    check (
      remarks is null
      or (
        remarks = pg_catalog.btrim(remarks)
        and pg_catalog.char_length(remarks) between 1 and 1000
      )
    ),
  constraint student_test_scores_updated_at_check
    check (updated_at >= created_at)
);

create table public.student_achievements (
  id uuid
    constraint student_achievements_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint student_achievements_student_id_not_null not null
    constraint student_achievements_student_id_fkey
      references public.profiles(id)
      on delete cascade,
  achievement_type public.student_achievement_type
    constraint student_achievements_type_not_null not null,
  title text
    constraint student_achievements_title_not_null not null,
  organization text,
  achievement_date date,
  description text,
  created_at timestamptz
    constraint student_achievements_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint student_achievements_updated_at_not_null not null
    default pg_catalog.now(),

  constraint student_achievements_title_check
    check (
      title = pg_catalog.btrim(title)
      and pg_catalog.char_length(title) between 1 and 200
    ),
  constraint student_achievements_organization_check
    check (
      organization is null
      or (
        organization = pg_catalog.btrim(organization)
        and pg_catalog.char_length(organization) between 1 and 200
      )
    ),
  constraint student_achievements_date_check
    check (
      achievement_date is null
      or achievement_date >= date '1950-01-01'
    ),
  constraint student_achievements_description_check
    check (
      description is null
      or (
        description = pg_catalog.btrim(description)
        and pg_catalog.char_length(description) between 1 and 2000
      )
    ),
  constraint student_achievements_updated_at_check
    check (updated_at >= created_at)
);

comment on table public.student_profiles is
  'One editable academic and contact profile per K-GEO student identity.';

comment on table public.student_preferences is
  'One student-controlled higher-studies preference record per K-GEO student.';

comment on table public.student_test_scores is
  'Student-reported exam plans and attempts; multiple rows per exam are permitted.';

comment on table public.student_achievements is
  'Student-reported achievements and experience; multiple rows per category are permitted.';

comment on column public.student_profiles.student_id is
  'Trusted owner overwritten from auth.uid() by the insert trigger.';

comment on column public.student_profiles.cgpa_unavailable is
  'Explicit student declaration used when CGPA is genuinely unavailable; it cannot be true when cgpa is present.';

comment on column public.student_profiles.profile_status is
  'Protected workflow marker. It is not directly insertable or updatable by authenticated browser users in Phase A.';

comment on column public.student_test_scores.attempt_number is
  'Student-reported attempt sequence, unique per student and normalized exam identity.';

-- SECURITY: this helper can answer only whether the current auth.uid() has one
-- specified active, email-confirmed K-GEO role. It exposes no profile or Auth
-- row data and is safe for repeated use by RLS policies.
create function public.has_active_verified_kgeo_role(
  p_role public.user_role
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from public.profiles as profile
    inner join auth.users as auth_user
      on auth_user.id = profile.id
    where profile.id = (select auth.uid())
      and profile.role = p_role
      and profile.is_active is true
      and auth_user.email_confirmed_at is not null
  );
$function$;

comment on function public.has_active_verified_kgeo_role(public.user_role) is
  'Privacy-safe current-user role predicate for Phase A RLS policies.';

-- SECURITY: every new table has student_id, created_at, and updated_at. This
-- trigger rejects non-students and overwrites all three protected values.
create function public.prepare_student_owned_insert()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  requester_id uuid;
  request_time timestamptz;
begin
  requester_id := (select auth.uid());

  if requester_id is null
    or not public.has_active_verified_kgeo_role(
      'student'::public.user_role
    ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified student profile is required';
  end if;

  request_time := pg_catalog.statement_timestamp();
  new.student_id := requester_id;
  new.created_at := request_time;
  new.updated_at := request_time;

  return new;
end;
$function$;

comment on function public.prepare_student_owned_insert() is
  'Overwrites detailed-profile ownership and creation timestamps from trusted server state.';

create function public.normalize_student_profile_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.roll_number := pg_catalog.upper(pg_catalog.btrim(new.roll_number));
  new.personal_email := pg_catalog.lower(
    pg_catalog.btrim(new.personal_email)
  );
  new.mobile_number := pg_catalog.btrim(new.mobile_number);
  new.college := pg_catalog.btrim(new.college);
  new.course := pg_catalog.btrim(new.course);
  new.department := pg_catalog.btrim(new.department);
  new.academic_remarks := nullif(
    pg_catalog.btrim(new.academic_remarks),
    ''
  );
  return new;
end;
$function$;

create function public.normalize_student_preferences_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  normalized_countries text[];
  normalized_program_areas text[];
begin
  select coalesce(
    pg_catalog.array_agg(
      pg_catalog.btrim(value.item)
      order by value.position
    ),
    '{}'::text[]
  )
  into normalized_countries
  from pg_catalog.unnest(new.preferred_countries)
    with ordinality as value(item, position);

  select coalesce(
    pg_catalog.array_agg(
      pg_catalog.btrim(value.item)
      order by value.position
    ),
    '{}'::text[]
  )
  into normalized_program_areas
  from pg_catalog.unnest(new.preferred_program_areas)
    with ordinality as value(item, position);

  new.preferred_countries := normalized_countries;
  new.preferred_program_areas := normalized_program_areas;
  new.target_intake := nullif(
    pg_catalog.lower(pg_catalog.btrim(new.target_intake)),
    ''
  );
  new.budget_range := nullif(
    pg_catalog.btrim(new.budget_range),
    ''
  );
  return new;
end;
$function$;

create function public.normalize_student_test_score_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  business_today date;
begin
  business_today := (
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
  )::date;

  new.custom_exam_name := nullif(
    pg_catalog.upper(pg_catalog.btrim(new.custom_exam_name)),
    ''
  );
  new.score := nullif(pg_catalog.btrim(new.score), '');
  new.remarks := nullif(pg_catalog.btrim(new.remarks), '');

  if new.completed_date is not null
    and new.completed_date > business_today then
    raise exception using
      errcode = '23514',
      message = 'Completed exam date cannot be in the future';
  end if;

  return new;
end;
$function$;

create function public.normalize_student_achievement_record()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  business_today date;
begin
  business_today := (
    pg_catalog.statement_timestamp() at time zone 'Asia/Kolkata'
  )::date;

  new.title := pg_catalog.btrim(new.title);
  new.organization := nullif(
    pg_catalog.btrim(new.organization),
    ''
  );
  new.description := nullif(
    pg_catalog.btrim(new.description),
    ''
  );

  if new.achievement_date is not null
    and new.achievement_date > business_today then
    raise exception using
      errcode = '23514',
      message = 'Achievement date cannot be in the future';
  end if;

  return new;
end;
$function$;

comment on function public.normalize_student_profile_record() is
  'Normalizes canonical student-profile text values before constraints run.';

comment on function public.normalize_student_preferences_record() is
  'Normalizes optional preference text and array values before constraints run.';

comment on function public.normalize_student_test_score_record() is
  'Normalizes test-score text and rejects future completed dates in Asia/Kolkata.';

comment on function public.normalize_student_achievement_record() is
  'Normalizes achievement text and rejects future achievement dates in Asia/Kolkata.';

create trigger student_profiles_10_prepare_insert
before insert on public.student_profiles
for each row
execute function public.prepare_student_owned_insert();

create trigger student_profiles_20_normalize
before insert or update on public.student_profiles
for each row
execute function public.normalize_student_profile_record();

create trigger student_profiles_30_set_updated_at
before update on public.student_profiles
for each row
execute function public.set_profiles_updated_at();

create trigger student_preferences_10_prepare_insert
before insert on public.student_preferences
for each row
execute function public.prepare_student_owned_insert();

create trigger student_preferences_20_normalize
before insert or update on public.student_preferences
for each row
execute function public.normalize_student_preferences_record();

create trigger student_preferences_30_set_updated_at
before update on public.student_preferences
for each row
execute function public.set_profiles_updated_at();

create trigger student_test_scores_10_prepare_insert
before insert on public.student_test_scores
for each row
execute function public.prepare_student_owned_insert();

create trigger student_test_scores_20_normalize
before insert or update on public.student_test_scores
for each row
execute function public.normalize_student_test_score_record();

create trigger student_test_scores_30_set_updated_at
before update on public.student_test_scores
for each row
execute function public.set_profiles_updated_at();

create trigger student_achievements_10_prepare_insert
before insert on public.student_achievements
for each row
execute function public.prepare_student_owned_insert();

create trigger student_achievements_20_normalize
before insert or update on public.student_achievements
for each row
execute function public.normalize_student_achievement_record();

create trigger student_achievements_30_set_updated_at
before update on public.student_achievements
for each row
execute function public.set_profiles_updated_at();

-- Directory indexes favor bounded server-side filtering and deterministic
-- pagination. Primary keys already cover exact student_id lookup for the two
-- one-to-one tables, so no redundant student_id indexes are added there.
-- College is compared case-insensitively while its original display casing is
-- retained. This avoids assuming roll numbers are globally unique across all
-- current or future Kumaraguru colleges.
create unique index student_profiles_college_roll_number_key
  on public.student_profiles (
    pg_catalog.lower(college),
    roll_number
  );

create index student_profiles_status_updated_idx
  on public.student_profiles (
    profile_status,
    updated_at desc,
    student_id
  );

create index student_profiles_academic_filter_idx
  on public.student_profiles (
    course,
    department,
    graduation_year,
    profile_status,
    student_id
  );

create index student_profiles_roll_number_pattern_idx
  on public.student_profiles (roll_number text_pattern_ops);

create index student_preferences_directory_filter_idx
  on public.student_preferences (
    higher_studies_interest,
    target_intake,
    student_id
  );

create index student_preferences_countries_idx
  on public.student_preferences
  using gin (preferred_countries);

create index student_preferences_program_areas_idx
  on public.student_preferences
  using gin (preferred_program_areas);

create index student_test_scores_student_history_idx
  on public.student_test_scores (student_id, created_at desc, id);

-- One numbered attempt per normalized exam identity. The custom name keeps
-- distinct OTHER exams independent while still preventing accidental duplicate
-- numbering for the same custom exam.
create unique index student_test_scores_attempt_key
  on public.student_test_scores (
    student_id,
    exam_name,
    (coalesce(custom_exam_name, '')),
    attempt_number
  );

create index student_test_scores_directory_filter_idx
  on public.student_test_scores (
    exam_name,
    exam_status,
    student_id
  );

create index student_achievements_student_history_idx
  on public.student_achievements (
    student_id,
    achievement_date desc nulls last,
    id
  );

-- Completion is derived rather than writable. The security-invoker and
-- security-barrier options preserve the underlying table RLS boundary.
create view public.student_profile_completion
with (security_invoker = true, security_barrier = true)
as
select
  student_profile.student_id,
  student_profile.profile_status,
  completion.academic_section_complete,
  completion.preferences_section_complete,
  exists (
    select 1
    from public.student_test_scores as test_score
    where test_score.student_id = student_profile.student_id
  ) as test_scores_section_started,
  exists (
    select 1
    from public.student_achievements as achievement
    where achievement.student_id = student_profile.student_id
  ) as achievements_section_started,
  completion.essential_fields_completed,
  11::integer as essential_fields_total,
  pg_catalog.round(
    completion.essential_fields_completed::numeric * 100.0 / 11.0
  )::integer as overall_completion_percentage,
  (
    completion.academic_section_complete
    and completion.preferences_section_complete
  ) as ready_for_counseling
from public.student_profiles as student_profile
left join public.student_preferences as preference
  on preference.student_id = student_profile.student_id
cross join lateral (
  select
    (
      student_profile.roll_number is not null
      and student_profile.personal_email is not null
      and student_profile.mobile_number is not null
      and student_profile.college is not null
      and student_profile.course is not null
      and student_profile.department is not null
      and student_profile.graduation_year is not null
      and (
        student_profile.cgpa is not null
        or student_profile.cgpa_unavailable is true
      )
    ) as academic_section_complete,
    (
      preference.student_id is not null
      and preference.higher_studies_interest is not null
      and preference.preferred_study_level is not null
      and preference.target_intake is not null
    ) as preferences_section_complete,
    (
      case when student_profile.roll_number is not null then 1 else 0 end
      + case when student_profile.personal_email is not null then 1 else 0 end
      + case when student_profile.mobile_number is not null then 1 else 0 end
      + case when student_profile.college is not null then 1 else 0 end
      + case when student_profile.course is not null then 1 else 0 end
      + case when student_profile.department is not null then 1 else 0 end
      + case when student_profile.graduation_year is not null then 1 else 0 end
      + case
          when student_profile.cgpa is not null
            or student_profile.cgpa_unavailable is true
          then 1
          else 0
        end
      + case
          when preference.higher_studies_interest is not null then 1 else 0
        end
      + case
          when preference.preferred_study_level is not null then 1 else 0
        end
      + case when preference.target_intake is not null then 1 else 0 end
    )::integer as essential_fields_completed
) as completion;

comment on view public.student_profile_completion is
  'RLS-preserving derived completion for eleven essential counseling fields; no browser-writable percentage is stored.';

alter table public.student_profiles enable row level security;
alter table public.student_preferences enable row level security;
alter table public.student_test_scores enable row level security;
alter table public.student_achievements enable row level security;

revoke all privileges on table public.student_profiles
  from public, anon, authenticated;
revoke all privileges on table public.student_preferences
  from public, anon, authenticated;
revoke all privileges on table public.student_test_scores
  from public, anon, authenticated;
revoke all privileges on table public.student_achievements
  from public, anon, authenticated;
revoke all privileges on table public.student_profile_completion
  from public, anon, authenticated;

revoke all privileges on type public.student_profile_status
  from public, anon;
revoke all privileges on type public.student_preferred_study_level
  from public, anon;
revoke all privileges on type public.student_study_mode
  from public, anon;
revoke all privileges on type public.student_academic_preference
  from public, anon;
revoke all privileges on type public.student_planning_stage
  from public, anon;
revoke all privileges on type public.student_exam_name
  from public, anon;
revoke all privileges on type public.student_exam_status
  from public, anon;
revoke all privileges on type public.student_achievement_type
  from public, anon;

revoke all on function public.is_valid_student_profile_text_array(
  text[], integer, integer
) from public, anon, authenticated;
revoke all on function public.has_active_verified_kgeo_role(
  public.user_role
) from public, anon, authenticated;
revoke all on function public.prepare_student_owned_insert()
  from public, anon, authenticated;
revoke all on function public.normalize_student_profile_record()
  from public, anon, authenticated;
revoke all on function public.normalize_student_preferences_record()
  from public, anon, authenticated;
revoke all on function public.normalize_student_test_score_record()
  from public, anon, authenticated;
revoke all on function public.normalize_student_achievement_record()
  from public, anon, authenticated;

grant usage on type public.student_profile_status to authenticated;
grant usage on type public.student_preferred_study_level to authenticated;
grant usage on type public.student_study_mode to authenticated;
grant usage on type public.student_academic_preference to authenticated;
grant usage on type public.student_planning_stage to authenticated;
grant usage on type public.student_exam_name to authenticated;
grant usage on type public.student_exam_status to authenticated;
grant usage on type public.student_achievement_type to authenticated;

-- Required by preference CHECK constraints during authenticated writes.
grant execute on function public.is_valid_student_profile_text_array(
  text[], integer, integer
) to authenticated;

-- Required by the RLS policies. The function reports only a boolean about the
-- current authenticated identity and cannot query another user.
grant execute on function public.has_active_verified_kgeo_role(
  public.user_role
) to authenticated;

grant select on table public.student_profiles to authenticated;
grant select on table public.student_preferences to authenticated;
grant select on table public.student_test_scores to authenticated;
grant select on table public.student_achievements to authenticated;
grant select on table public.student_profile_completion to authenticated;

grant insert (
  roll_number,
  personal_email,
  mobile_number,
  college,
  course,
  department,
  current_year,
  current_semester,
  graduation_year,
  cgpa,
  cgpa_scale,
  cgpa_unavailable,
  active_backlogs,
  cleared_backlogs,
  sslc_percentage,
  hsc_percentage,
  diploma_percentage,
  academic_remarks
) on public.student_profiles to authenticated;

grant update (
  roll_number,
  personal_email,
  mobile_number,
  college,
  course,
  department,
  current_year,
  current_semester,
  graduation_year,
  cgpa,
  cgpa_scale,
  cgpa_unavailable,
  active_backlogs,
  cleared_backlogs,
  sslc_percentage,
  hsc_percentage,
  diploma_percentage,
  academic_remarks
) on public.student_profiles to authenticated;

grant insert (
  higher_studies_interest,
  preferred_study_level,
  preferred_countries,
  preferred_program_areas,
  target_intake,
  budget_range,
  scholarship_required,
  funding_required,
  study_mode,
  academic_preference,
  student_planning_stage
) on public.student_preferences to authenticated;

grant update (
  higher_studies_interest,
  preferred_study_level,
  preferred_countries,
  preferred_program_areas,
  target_intake,
  budget_range,
  scholarship_required,
  funding_required,
  study_mode,
  academic_preference,
  student_planning_stage
) on public.student_preferences to authenticated;

grant insert (
  exam_name,
  custom_exam_name,
  exam_status,
  attempt_number,
  planned_date,
  completed_date,
  score,
  valid_until,
  remarks
) on public.student_test_scores to authenticated;

grant update (
  exam_name,
  custom_exam_name,
  exam_status,
  attempt_number,
  planned_date,
  completed_date,
  score,
  valid_until,
  remarks
) on public.student_test_scores to authenticated;

grant delete on table public.student_test_scores to authenticated;

grant insert (
  achievement_type,
  title,
  organization,
  achievement_date,
  description
) on public.student_achievements to authenticated;

grant update (
  achievement_type,
  title,
  organization,
  achievement_date,
  description
) on public.student_achievements to authenticated;

grant delete on table public.student_achievements to authenticated;

create policy student_profiles_select_own
on public.student_profiles
for select
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_profiles_insert_own
on public.student_profiles
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_profiles_update_own
on public.student_profiles
for update
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
)
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_profiles_select_counselor_all
on public.student_profiles
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy student_preferences_select_own
on public.student_preferences
for select
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_preferences_insert_own
on public.student_preferences
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_preferences_update_own
on public.student_preferences
for update
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
)
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_preferences_select_counselor_all
on public.student_preferences
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy student_test_scores_select_own
on public.student_test_scores
for select
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_test_scores_insert_own
on public.student_test_scores
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_test_scores_update_own
on public.student_test_scores
for update
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
)
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_test_scores_delete_own
on public.student_test_scores
for delete
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_test_scores_select_counselor_all
on public.student_test_scores
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy student_achievements_select_own
on public.student_achievements
for select
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_achievements_insert_own
on public.student_achievements
for insert
to authenticated
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_achievements_update_own
on public.student_achievements
for update
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
)
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_achievements_delete_own
on public.student_achievements
for delete
to authenticated
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
);

create policy student_achievements_select_counselor_all
on public.student_achievements
for select
to authenticated
using (
  (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy student_profiles_select_counselor_all
  on public.student_profiles is
  'Active verified counselors can read detailed student profiles but cannot mutate them.';

comment on policy student_preferences_select_counselor_all
  on public.student_preferences is
  'Active verified counselors can read student preferences but cannot mutate them.';

comment on policy student_test_scores_select_counselor_all
  on public.student_test_scores is
  'Active verified counselors can read student-reported exam records but cannot mutate them.';

comment on policy student_achievements_select_counselor_all
  on public.student_achievements is
  'Active verified counselors can read student-reported achievements but cannot mutate them.';

-- There are deliberately no anonymous, admin, or director policies. There are
-- no counselor INSERT, UPDATE, or DELETE policies. Authenticated UPDATE grants
-- are column-limited, and RLS makes them effective only for the owning active,
-- verified student. Main profiles and preferences have no DELETE grant/policy.

commit;
