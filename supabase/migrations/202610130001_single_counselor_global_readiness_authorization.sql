-- K-GEO Single Counselor Portal Conversion - Global Master's Readiness
-- Migration: 202610130001_single_counselor_global_readiness_authorization.sql
--
-- Purpose:
-- 202610080001_single_counselor_authorization.sql moved Counselor access to
-- one approved, active, verified institutional Counselor. The Global Master's
-- Readiness read functions already follow that model through the
-- public.is_active_primary_counselor_for_student(uuid) compatibility bridge.
--
-- The write path did not. public.create_student_global_readiness_assessment
-- still looked up an active public.student_counselor_assignments row for the
-- caller and refused to create an assessment without one, and the table
-- required that row's id in primary_assignment_id.
--
-- This forward-only correction removes that legacy dependency:
--
--   1. public.student_global_readiness_assessments.primary_assignment_id
--      becomes nullable. Existing values and the foreign key are unchanged.
--
--   2. public.create_student_global_readiness_assessment keeps its exact
--      signature and return shape, authorizes the caller with
--      public.is_approved_active_verified_counselor(), requires a Student-role
--      target, and no longer reads public.student_counselor_assignments.
--      New revisions store NULL in primary_assignment_id.
--
-- - No historical assignment row is read, changed or deleted.
-- - No existing assessment row is changed. History stays append-only.
-- - Function names are kept because application callers depend on them.
-- - The read functions are not changed.

begin;


-- ============================================================
-- 0. PRE-FLIGHT
-- ============================================================
--
-- Fail closed unless the single institutional Counselor helper and the
-- reviewed readiness objects exist.

do $preflight$
declare
  v_count integer;
begin

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'is_approved_active_verified_counselor'
    and pg_catalog.pg_get_function_identity_arguments(procedure.oid) = ''
    and procedure.prosecdef is true;

  if v_count <> 1 then
    raise exception using
      errcode = '55000',
      message =
        'Global readiness authorization correction requires the institutional Counselor helper';
  end if;

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_attribute as attribute
  where attribute.attrelid =
      'public.student_global_readiness_assessments'::pg_catalog.regclass
    and attribute.attname = 'primary_assignment_id'
    and attribute.attnum > 0
    and attribute.attisdropped is false
    and attribute.atttypid = 'pg_catalog.uuid'::pg_catalog.regtype;

  if v_count <> 1 then
    raise exception using
      errcode = '55000',
      message =
        'public.student_global_readiness_assessments.primary_assignment_id is not the reviewed uuid column';
  end if;

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'create_student_global_readiness_assessment';

  if v_count <> 1 then
    raise exception using
      errcode = '55000',
      message =
        'public.create_student_global_readiness_assessment is missing or overloaded';
  end if;

end;
$preflight$;


-- ============================================================
-- 1. RELAX THE LEGACY ASSIGNMENT COLUMN
-- ============================================================
--
-- The column and its foreign key stay so every historical revision keeps its
-- recorded assignment. Only the NOT NULL requirement is removed.

alter table public.student_global_readiness_assessments
  alter column primary_assignment_id drop not null;

comment on column
  public.student_global_readiness_assessments.primary_assignment_id is
  'Legacy Primary Counselor assignment recorded for revisions created before the single institutional Counselor model. NULL for later revisions; never used for authorization.';


-- ============================================================
-- 2. REPLACE THE ASSESSMENT WRITE FUNCTION
-- ============================================================
--
-- Signature, return shape, locking order, normalization and the append-only
-- insert are unchanged. Only the authorization block changes.

create or replace function public.create_student_global_readiness_assessment(
  p_student_id uuid,
  p_academic_readiness_score integer,
  p_intellectual_projects_score integer,
  p_intellectual_distinction_score integer,
  p_professional_experience_score integer,
  p_professional_industry_score integer,
  p_global_leadership_score integer,
  p_global_exposure_score integer,
  p_global_distinction_score integer,
  p_application_gmap_score integer,
  p_application_advisory_score integer,
  p_application_documents_score integer,
  p_application_shortlist_score integer,
  p_application_submitted_score integer,
  p_academic_readiness_rationale text,
  p_intellectual_projects_rationale text,
  p_intellectual_distinction_rationale text,
  p_professional_experience_rationale text,
  p_professional_industry_rationale text,
  p_global_leadership_rationale text,
  p_global_exposure_rationale text,
  p_global_distinction_rationale text,
  p_application_gmap_rationale text,
  p_application_advisory_rationale text,
  p_application_documents_rationale text,
  p_application_shortlist_rationale text,
  p_application_submitted_rationale text,
  p_assessment_rationale text,
  p_parent_safe_summary text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_counselor_id uuid := (select auth.uid());
  v_revision integer;
  v_snapshot jsonb;
  v_assessment_id uuid;
  v_total integer;
  v_band public.global_readiness_band;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  -- The caller must be the approved, active, verified, unbanned institutional
  -- Counselor. No Primary Counselor assignment is consulted.
  if v_counselor_id is null
    or public.is_approved_active_verified_counselor() is distinct from true
  then
    raise exception using errcode = '42501',
      message = 'Institutional Counselor authorization is required';
  end if;

  -- The Student profile is the shared lock root. This serializes concurrent
  -- readiness revisions for one Student.
  perform 1
  from public.profiles as student_profile
  where student_profile.id = p_student_id
    and student_profile.role = 'student'::public.user_role
  for update;
  if not found then
    raise exception using errcode = '23514',
      message = 'Global readiness Student is invalid';
  end if;

  select coalesce(pg_catalog.max(assessment.revision_number), 0) + 1
  into v_revision
  from public.student_global_readiness_assessments as assessment
  where assessment.student_id = p_student_id;

  v_snapshot := private.build_global_readiness_evidence_snapshot(p_student_id);

  insert into public.student_global_readiness_assessments (
    student_id, revision_number, primary_assignment_id, assessed_by,
    academic_readiness_score, intellectual_projects_score,
    intellectual_distinction_score, professional_experience_score,
    professional_industry_score, global_leadership_score,
    global_exposure_score, global_distinction_score,
    application_gmap_score, application_advisory_score,
    application_documents_score, application_shortlist_score,
    application_submitted_score, academic_readiness_rationale,
    intellectual_projects_rationale, intellectual_distinction_rationale,
    professional_experience_rationale, professional_industry_rationale,
    global_leadership_rationale, global_exposure_rationale,
    global_distinction_rationale, application_gmap_rationale,
    application_advisory_rationale, application_documents_rationale,
    application_shortlist_rationale, application_submitted_rationale,
    assessment_rationale, parent_safe_summary, evidence_snapshot,
    evidence_captured_at, assessed_at, created_at
  ) values (
    p_student_id, v_revision, null, v_counselor_id,
    p_academic_readiness_score, p_intellectual_projects_score,
    p_intellectual_distinction_score, p_professional_experience_score,
    p_professional_industry_score, p_global_leadership_score,
    p_global_exposure_score, p_global_distinction_score,
    p_application_gmap_score, p_application_advisory_score,
    p_application_documents_score, p_application_shortlist_score,
    p_application_submitted_score,
    private.normalize_global_readiness_text(p_academic_readiness_rationale, 1000, false),
    private.normalize_global_readiness_text(p_intellectual_projects_rationale, 1000, false),
    private.normalize_global_readiness_text(p_intellectual_distinction_rationale, 1000, false),
    private.normalize_global_readiness_text(p_professional_experience_rationale, 1000, false),
    private.normalize_global_readiness_text(p_professional_industry_rationale, 1000, false),
    private.normalize_global_readiness_text(p_global_leadership_rationale, 1000, false),
    private.normalize_global_readiness_text(p_global_exposure_rationale, 1000, false),
    private.normalize_global_readiness_text(p_global_distinction_rationale, 1000, false),
    private.normalize_global_readiness_text(p_application_gmap_rationale, 1000, false),
    private.normalize_global_readiness_text(p_application_advisory_rationale, 1000, false),
    private.normalize_global_readiness_text(p_application_documents_rationale, 1000, false),
    private.normalize_global_readiness_text(p_application_shortlist_rationale, 1000, false),
    private.normalize_global_readiness_text(p_application_submitted_rationale, 1000, false),
    private.normalize_global_readiness_text(p_assessment_rationale, 2000, true),
    private.normalize_global_readiness_text(p_parent_safe_summary, 1500, false),
    v_snapshot, v_now, v_now, v_now
  ) returning id, total_score, readiness_band
  into v_assessment_id, v_total, v_band;

  return pg_catalog.jsonb_build_object(
    'assessmentId', v_assessment_id,
    'revisionNumber', v_revision,
    'totalScore', v_total,
    'readinessBand', v_band,
    'assessedAt', v_now
  );
end;
$function$;

alter function public.create_student_global_readiness_assessment(
  uuid,
  integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, integer,
  text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) owner to postgres;

comment on function public.create_student_global_readiness_assessment(
  uuid,
  integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, integer,
  text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) is
  'Appends one Global Master''s Readiness revision for a Student. Only the approved active verified institutional Counselor may call it; no Primary Counselor assignment is required.';

revoke all on function public.create_student_global_readiness_assessment(
  uuid,
  integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, integer,
  text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.create_student_global_readiness_assessment(
  uuid,
  integer, integer, integer, integer, integer, integer, integer,
  integer, integer, integer, integer, integer, integer,
  text, text, text, text, text, text, text, text,
  text, text, text, text, text, text, text
) to authenticated;


-- ============================================================
-- 3. POST-REPLACEMENT CATALOG VERIFICATION
-- ============================================================

do $verification$
declare
  v_count integer;
  v_definition text;
begin

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_attribute as attribute
  where attribute.attrelid =
      'public.student_global_readiness_assessments'::pg_catalog.regclass
    and attribute.attname = 'primary_assignment_id'
    and attribute.attnum > 0
    and attribute.attisdropped is false
    and attribute.attnotnull is false;

  if v_count <> 1 then
    raise exception using
      errcode = '55000',
      message =
        'primary_assignment_id is still required after the correction';
  end if;

  select pg_catalog.count(*)
  into v_count
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  inner join pg_catalog.pg_roles as owner_role
    on owner_role.oid = procedure.proowner
  where namespace.nspname = 'public'
    and procedure.proname = 'create_student_global_readiness_assessment'
    and procedure.prosecdef is true
    and owner_role.rolname = 'postgres'
    and exists (
      select 1
      from pg_catalog.unnest(procedure.proconfig) as setting
      where setting in (
        'search_path=',
        'search_path=""'
      )
    );

  if v_count <> 1 then
    raise exception using
      errcode = '55000',
      message =
        'Global readiness write function catalog verification failed';
  end if;

  select pg_catalog.pg_get_functiondef(procedure.oid)
  into v_definition
  from pg_catalog.pg_proc as procedure
  inner join pg_catalog.pg_namespace as namespace
    on namespace.oid = procedure.pronamespace
  where namespace.nspname = 'public'
    and procedure.proname = 'create_student_global_readiness_assessment';

  if pg_catalog.strpos(
      v_definition,
      'public.is_approved_active_verified_counselor()'
    ) = 0
    or pg_catalog.strpos(
      v_definition,
      'student_counselor_assignments'
    ) <> 0
  then
    raise exception using
      errcode = '55000',
      message =
        'Global readiness write function still depends on a Primary Counselor assignment';
  end if;

end;
$verification$;


commit;
