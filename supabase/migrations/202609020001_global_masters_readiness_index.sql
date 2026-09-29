-- K-GEO Global Master's Readiness Index Phase 1.
-- Counselor-awarded, evidence-informed, immutable assessment revisions.

begin;

create type public.global_readiness_band as enum (
  'early_readiness',
  'developing_readiness',
  'competitive_readiness',
  'advanced_readiness',
  'global_distinction'
);

alter type public.global_readiness_band owner to postgres;
revoke all on type public.global_readiness_band
  from public, anon, authenticated, service_role;
grant usage on type public.global_readiness_band to authenticated;

create function private.normalize_global_readiness_text(
  p_value text,
  p_max_length integer,
  p_required boolean
)
returns text
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_value text;
begin
  if p_value is null or pg_catalog.btrim(p_value) = '' then
    if p_required then
      raise exception using errcode = '22023',
        message = 'Readiness assessment text is required';
    end if;
    return null;
  end if;

  if p_value ~ '[[:cntrl:]]' then
    raise exception using errcode = '22023',
      message = 'Readiness assessment text is invalid';
  end if;

  v_value := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_value), '[[:space:]]+', ' ', 'g'
  );
  if pg_catalog.char_length(v_value) not between 1 and p_max_length then
    raise exception using errcode = '22023',
      message = 'Readiness assessment text is invalid';
  end if;
  return v_value;
end;
$function$;

alter function private.normalize_global_readiness_text(text, integer, boolean)
  owner to postgres;
revoke all on function
  private.normalize_global_readiness_text(text, integer, boolean)
  from public, anon, authenticated, service_role;

create function private.is_valid_global_readiness_rationale(
  p_score integer,
  p_snapshot jsonb,
  p_criterion text,
  p_rationale text
)
returns boolean
language sql
immutable
set search_path = ''
as $function$
  select
    (
      p_rationale is null
      or (
        pg_catalog.char_length(p_rationale) between 1 and 1000
        and p_rationale = pg_catalog.regexp_replace(
          pg_catalog.btrim(p_rationale), '[[:space:]]+', ' ', 'g'
        )
        and p_rationale !~ '[[:cntrl:]]'
      )
    )
    and (
      p_score = 0
      or coalesce(
        (p_snapshot #>> array['criteria', p_criterion, 'recorded'])::boolean,
        false
      )
      or p_rationale is not null
    );
$function$;

alter function private.is_valid_global_readiness_rationale(
  integer, jsonb, text, text
) owner to postgres;
revoke all on function private.is_valid_global_readiness_rationale(
  integer, jsonb, text, text
) from public, anon, authenticated, service_role;

create function private.global_readiness_count_evidence(
  p_count integer,
  p_label text
)
returns jsonb
language sql
immutable
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'recorded', p_count > 0,
    'facts', case when p_count = 0
      then pg_catalog.jsonb_build_array('Not recorded')
      else pg_catalog.jsonb_build_array(
        pg_catalog.format('%s: %s', p_label, p_count)
      )
    end
  );
$function$;

alter function private.global_readiness_count_evidence(integer, text)
  owner to postgres;
revoke all on function private.global_readiness_count_evidence(integer, text)
  from public, anon, authenticated, service_role;

create function private.build_global_readiness_evidence_snapshot(
  p_student_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with facts as (
    select
      (select pg_catalog.count(*)::integer from public.student_achievements a
        where a.student_id = p_student_id and a.achievement_type in ('project', 'research')) as projects,
      (select pg_catalog.count(*)::integer from public.student_achievements a
        where a.student_id = p_student_id and a.achievement_type in ('publication', 'hackathon')) as distinctions,
      (select pg_catalog.count(*)::integer from public.student_achievements a
        where a.student_id = p_student_id and a.achievement_type in ('internship', 'work_experience')) as experience,
      (select pg_catalog.count(*)::integer from public.student_achievements a
        where a.student_id = p_student_id and a.achievement_type = 'certification') as certifications,
      (select pg_catalog.count(*)::integer from public.student_achievements a
        where a.student_id = p_student_id and a.achievement_type = 'leadership') as leadership,
      (select pg_catalog.count(*)::integer from public.student_achievements a
        where a.student_id = p_student_id and a.achievement_type in ('award', 'volunteering', 'sports', 'other')) as service,
      (select pg_catalog.count(*)::integer from public.consultation_requests c
        where c.student_id = p_student_id) as consultations,
      exists (select 1 from public.student_counseling_progressions p
        where p.student_id = p_student_id) as progression,
      (select pg_catalog.count(*)::integer from public.student_profile_documents d
        where d.student_id = p_student_id
          and d.status = 'available'::public.student_profile_document_status
          and d.document_type = 'sop') as sop,
      (select pg_catalog.count(*)::integer from public.student_profile_documents d
        where d.student_id = p_student_id
          and d.status = 'available'::public.student_profile_document_status
          and d.document_type = 'lor') as lor,
      (select pg_catalog.count(*)::integer from public.student_university_applications u
        where u.student_id = p_student_id and u.is_archived is false) as shortlisted,
      (select pg_catalog.count(*)::integer from public.student_university_applications u
        where u.student_id = p_student_id and u.submitted_at is not null) as submitted
  ), profile as (
    select p.cgpa, p.cgpa_scale, p.active_backlogs, p.cleared_backlogs
    from public.student_profiles p where p.student_id = p_student_id
  )
  select pg_catalog.jsonb_build_object(
    'schemaVersion', 1,
    'criteria', pg_catalog.jsonb_build_object(
      'academicReadiness', pg_catalog.jsonb_build_object(
        'recorded', profile.cgpa is not null,
        'facts', case when profile.cgpa is null
          then pg_catalog.jsonb_build_array('Not recorded')
          else pg_catalog.jsonb_build_array(
            pg_catalog.format('Current CGPA: %s / %s', profile.cgpa, profile.cgpa_scale),
            pg_catalog.format('Active backlogs: %s', profile.active_backlogs),
            pg_catalog.format('Cleared backlogs: %s', profile.cleared_backlogs),
            'Term-by-term academic consistency: Not recorded'
          ) end
      ),
      'intellectualProjects', private.global_readiness_count_evidence(facts.projects, 'Project / research records'),
      'intellectualDistinction', private.global_readiness_count_evidence(facts.distinctions, 'Publication / competition records'),
      'professionalExperience', private.global_readiness_count_evidence(facts.experience, 'Internship / work-experience records'),
      'professionalIndustry', pg_catalog.jsonb_build_object(
        'recorded', facts.certifications > 0,
        'facts', pg_catalog.jsonb_build_array(
          case when facts.certifications = 0 then 'Certifications: Not recorded'
            else pg_catalog.format('Certification records: %s', facts.certifications) end,
          'Industry-project classification: Not recorded'
        )
      ),
      'globalLeadership', private.global_readiness_count_evidence(facts.leadership, 'Leadership records'),
      'globalExposure', pg_catalog.jsonb_build_object('recorded', false, 'facts', pg_catalog.jsonb_build_array('Not recorded / no canonical record')),
      'globalDistinction', private.global_readiness_count_evidence(facts.service, 'Award, service or extracurricular records'),
      'applicationGmap', pg_catalog.jsonb_build_object('recorded', false, 'facts', pg_catalog.jsonb_build_array('Not recorded / no canonical G-MAP record')),
      'applicationAdvisory', pg_catalog.jsonb_build_object(
        'recorded', facts.consultations > 0 or facts.progression,
        'facts', case when facts.consultations = 0 and facts.progression is false
          then pg_catalog.jsonb_build_array('Not recorded')
          else pg_catalog.jsonb_build_array(
            pg_catalog.format('Consultation records: %s', facts.consultations),
            pg_catalog.format('Counseling progression recorded: %s', facts.progression)
          ) end
      ),
      'applicationDocuments', pg_catalog.jsonb_build_object(
        'recorded', facts.sop > 0 or facts.lor > 0,
        'facts', case when facts.sop = 0 and facts.lor = 0
          then pg_catalog.jsonb_build_array('Not recorded')
          else pg_catalog.jsonb_build_array(
            pg_catalog.format('Available SOP documents: %s', facts.sop),
            pg_catalog.format('Available LoR documents: %s', facts.lor)
          ) end
      ),
      'applicationShortlist', private.global_readiness_count_evidence(facts.shortlisted, 'Active university records'),
      'applicationSubmitted', private.global_readiness_count_evidence(facts.submitted, 'Submitted applications')
    )
  )
  from facts left join profile on true;
$function$;

alter function private.build_global_readiness_evidence_snapshot(uuid)
  owner to postgres;
revoke all on function private.build_global_readiness_evidence_snapshot(uuid)
  from public, anon, authenticated, service_role;

create table public.student_global_readiness_assessments (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  revision_number integer not null check (revision_number >= 1),
  primary_assignment_id uuid not null
    references public.student_counselor_assignments(id) on delete restrict,
  assessed_by uuid not null references public.profiles(id) on delete restrict,
  rubric_version text not null default 'K-GEO-GMRI-1'
    check (rubric_version = 'K-GEO-GMRI-1'),

  academic_readiness_score integer not null check (academic_readiness_score between 0 and 15),
  intellectual_projects_score integer not null check (intellectual_projects_score between 0 and 10),
  intellectual_distinction_score integer not null check (intellectual_distinction_score between 0 and 10),
  professional_experience_score integer not null check (professional_experience_score between 0 and 10),
  professional_industry_score integer not null check (professional_industry_score between 0 and 5),
  global_leadership_score integer not null check (global_leadership_score between 0 and 5),
  global_exposure_score integer not null check (global_exposure_score between 0 and 5),
  global_distinction_score integer not null check (global_distinction_score between 0 and 5),
  application_gmap_score integer not null check (application_gmap_score between 0 and 5),
  application_advisory_score integer not null check (application_advisory_score between 0 and 5),
  application_documents_score integer not null check (application_documents_score between 0 and 10),
  application_shortlist_score integer not null check (application_shortlist_score between 0 and 10),
  application_submitted_score integer not null check (application_submitted_score between 0 and 5),

  academic_readiness_rationale text,
  intellectual_projects_rationale text,
  intellectual_distinction_rationale text,
  professional_experience_rationale text,
  professional_industry_rationale text,
  global_leadership_rationale text,
  global_exposure_rationale text,
  global_distinction_rationale text,
  application_gmap_rationale text,
  application_advisory_rationale text,
  application_documents_rationale text,
  application_shortlist_rationale text,
  application_submitted_rationale text,

  academic_readiness_total integer generated always as (academic_readiness_score) stored,
  intellectual_depth_total integer generated always as (
    intellectual_projects_score + intellectual_distinction_score
  ) stored,
  professional_readiness_total integer generated always as (
    professional_experience_score + professional_industry_score
  ) stored,
  global_leadership_total integer generated always as (
    global_leadership_score + global_exposure_score + global_distinction_score
  ) stored,
  application_strength_total integer generated always as (
    application_gmap_score + application_advisory_score
    + application_documents_score + application_shortlist_score
    + application_submitted_score
  ) stored,
  total_score integer generated always as (
    academic_readiness_score + intellectual_projects_score
    + intellectual_distinction_score + professional_experience_score
    + professional_industry_score + global_leadership_score
    + global_exposure_score + global_distinction_score
    + application_gmap_score + application_advisory_score
    + application_documents_score + application_shortlist_score
    + application_submitted_score
  ) stored,
  readiness_band public.global_readiness_band generated always as (
    case
      when academic_readiness_score + intellectual_projects_score
        + intellectual_distinction_score + professional_experience_score
        + professional_industry_score + global_leadership_score
        + global_exposure_score + global_distinction_score
        + application_gmap_score + application_advisory_score
        + application_documents_score + application_shortlist_score
        + application_submitted_score >= 85
        then 'global_distinction'::public.global_readiness_band
      when academic_readiness_score + intellectual_projects_score
        + intellectual_distinction_score + professional_experience_score
        + professional_industry_score + global_leadership_score
        + global_exposure_score + global_distinction_score
        + application_gmap_score + application_advisory_score
        + application_documents_score + application_shortlist_score
        + application_submitted_score >= 75
        then 'advanced_readiness'::public.global_readiness_band
      when academic_readiness_score + intellectual_projects_score
        + intellectual_distinction_score + professional_experience_score
        + professional_industry_score + global_leadership_score
        + global_exposure_score + global_distinction_score
        + application_gmap_score + application_advisory_score
        + application_documents_score + application_shortlist_score
        + application_submitted_score >= 65
        then 'competitive_readiness'::public.global_readiness_band
      when academic_readiness_score + intellectual_projects_score
        + intellectual_distinction_score + professional_experience_score
        + professional_industry_score + global_leadership_score
        + global_exposure_score + global_distinction_score
        + application_gmap_score + application_advisory_score
        + application_documents_score + application_shortlist_score
        + application_submitted_score >= 50
        then 'developing_readiness'::public.global_readiness_band
      else 'early_readiness'::public.global_readiness_band
    end
  ) stored,

  assessment_rationale text not null,
  parent_safe_summary text,
  evidence_schema_version integer not null default 1 check (evidence_schema_version = 1),
  evidence_snapshot jsonb not null,
  evidence_captured_at timestamptz not null,
  assessed_at timestamptz not null,
  created_at timestamptz not null,

  constraint student_global_readiness_student_revision_key
    unique (student_id, revision_number),
  constraint student_global_readiness_actor_check check (student_id <> assessed_by),
  constraint student_global_readiness_timestamp_check check (
    evidence_captured_at = assessed_at and created_at = assessed_at
  ),
  constraint student_global_readiness_snapshot_check check (
    pg_catalog.jsonb_typeof(evidence_snapshot) = 'object'
    and evidence_snapshot ->> 'schemaVersion' = '1'
    and pg_catalog.jsonb_typeof(evidence_snapshot -> 'criteria') = 'object'
  ),
  constraint student_global_readiness_overall_rationale_check check (
    pg_catalog.char_length(assessment_rationale) between 1 and 2000
    and assessment_rationale !~ '[[:cntrl:]]'
  ),
  constraint student_global_readiness_parent_summary_check check (
    parent_safe_summary is null or (
      pg_catalog.char_length(parent_safe_summary) between 1 and 1500
      and parent_safe_summary !~ '[[:cntrl:]]'
    )
  ),
  constraint student_global_readiness_academic_rationale_check check (
    private.is_valid_global_readiness_rationale(academic_readiness_score, evidence_snapshot, 'academicReadiness', academic_readiness_rationale)
  ),
  constraint student_global_readiness_projects_rationale_check check (
    private.is_valid_global_readiness_rationale(intellectual_projects_score, evidence_snapshot, 'intellectualProjects', intellectual_projects_rationale)
  ),
  constraint student_global_readiness_intellectual_distinction_rationale_check check (
    private.is_valid_global_readiness_rationale(intellectual_distinction_score, evidence_snapshot, 'intellectualDistinction', intellectual_distinction_rationale)
  ),
  constraint student_global_readiness_experience_rationale_check check (
    private.is_valid_global_readiness_rationale(professional_experience_score, evidence_snapshot, 'professionalExperience', professional_experience_rationale)
  ),
  constraint student_global_readiness_industry_rationale_check check (
    private.is_valid_global_readiness_rationale(professional_industry_score, evidence_snapshot, 'professionalIndustry', professional_industry_rationale)
  ),
  constraint student_global_readiness_leadership_rationale_check check (
    private.is_valid_global_readiness_rationale(global_leadership_score, evidence_snapshot, 'globalLeadership', global_leadership_rationale)
  ),
  constraint student_global_readiness_exposure_rationale_check check (
    private.is_valid_global_readiness_rationale(global_exposure_score, evidence_snapshot, 'globalExposure', global_exposure_rationale)
  ),
  constraint student_global_readiness_global_distinction_rationale_check check (
    private.is_valid_global_readiness_rationale(global_distinction_score, evidence_snapshot, 'globalDistinction', global_distinction_rationale)
  ),
  constraint student_global_readiness_gmap_rationale_check check (
    private.is_valid_global_readiness_rationale(application_gmap_score, evidence_snapshot, 'applicationGmap', application_gmap_rationale)
  ),
  constraint student_global_readiness_advisory_rationale_check check (
    private.is_valid_global_readiness_rationale(application_advisory_score, evidence_snapshot, 'applicationAdvisory', application_advisory_rationale)
  ),
  constraint student_global_readiness_documents_rationale_check check (
    private.is_valid_global_readiness_rationale(application_documents_score, evidence_snapshot, 'applicationDocuments', application_documents_rationale)
  ),
  constraint student_global_readiness_shortlist_rationale_check check (
    private.is_valid_global_readiness_rationale(application_shortlist_score, evidence_snapshot, 'applicationShortlist', application_shortlist_rationale)
  ),
  constraint student_global_readiness_submitted_rationale_check check (
    private.is_valid_global_readiness_rationale(application_submitted_score, evidence_snapshot, 'applicationSubmitted', application_submitted_rationale)
  )
);

alter table public.student_global_readiness_assessments owner to postgres;
alter table public.student_global_readiness_assessments enable row level security;
alter table public.student_global_readiness_assessments force row level security;
revoke all on table public.student_global_readiness_assessments
  from public, anon, authenticated, service_role;

create index student_global_readiness_latest_idx
  on public.student_global_readiness_assessments (
    student_id, revision_number desc, assessed_at desc, id desc
  );

create policy student_global_readiness_select_current_primary
on public.student_global_readiness_assessments
for select
to authenticated
using ((select public.is_active_primary_counselor_for_student(
  student_global_readiness_assessments.student_id
)));

create function public.protect_student_global_readiness_assessment_history()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  raise exception using errcode = '42501',
    message = 'Global readiness assessment history is immutable';
end;
$function$;

alter function public.protect_student_global_readiness_assessment_history()
  owner to postgres;
revoke all on function public.protect_student_global_readiness_assessment_history()
  from public, anon, authenticated, service_role;

create trigger protect_student_global_readiness_assessment_history
before update or delete on public.student_global_readiness_assessments
for each row execute function public.protect_student_global_readiness_assessment_history();

create function public.get_primary_counselor_global_readiness_evidence(
  p_student_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if (select auth.uid()) is null
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;
  return private.build_global_readiness_evidence_snapshot(p_student_id);
end;
$function$;

alter function public.get_primary_counselor_global_readiness_evidence(uuid)
  owner to postgres;
revoke all on function public.get_primary_counselor_global_readiness_evidence(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_primary_counselor_global_readiness_evidence(uuid)
  to authenticated;

create function public.create_student_global_readiness_assessment(
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
  v_assignment_id uuid;
  v_revision integer;
  v_snapshot jsonb;
  v_assessment_id uuid;
  v_total integer;
  v_band public.global_readiness_band;
  v_now timestamptz := pg_catalog.clock_timestamp();
begin
  if v_counselor_id is null then
    raise exception using errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  -- The Student profile is the shared reassignment lock root. This also
  -- serializes concurrent readiness revisions for one Student.
  perform 1
  from public.profiles as student_profile
  where student_profile.id = p_student_id
    and student_profile.role = 'student'::public.user_role
  for update;
  if not found then
    raise exception using errcode = '23514',
      message = 'Global readiness Student is invalid';
  end if;

  if public.is_active_primary_counselor_for_student(p_student_id)
    is distinct from true then
    raise exception using errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  select assignment.id
  into v_assignment_id
  from public.student_counselor_assignments as assignment
  where assignment.student_id = p_student_id
    and assignment.counselor_id = v_counselor_id
    and assignment.ended_at is null;
  if v_assignment_id is null then
    raise exception using errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
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
    p_student_id, v_revision, v_assignment_id, v_counselor_id,
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

create function public.list_primary_counselor_global_readiness_assessments(
  p_student_id uuid,
  p_limit integer default 20
)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using errcode = '22023',
      message = 'Global readiness history request is invalid';
  end if;
  if (select auth.uid()) is null
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  return query
  select pg_catalog.jsonb_build_object(
    'assessmentId', assessment.id,
    'revisionNumber', assessment.revision_number,
    'rubricVersion', assessment.rubric_version,
    'scores', pg_catalog.jsonb_build_object(
      'academicReadiness', assessment.academic_readiness_score,
      'intellectualProjects', assessment.intellectual_projects_score,
      'intellectualDistinction', assessment.intellectual_distinction_score,
      'professionalExperience', assessment.professional_experience_score,
      'professionalIndustry', assessment.professional_industry_score,
      'globalLeadership', assessment.global_leadership_score,
      'globalExposure', assessment.global_exposure_score,
      'globalDistinction', assessment.global_distinction_score,
      'applicationGmap', assessment.application_gmap_score,
      'applicationAdvisory', assessment.application_advisory_score,
      'applicationDocuments', assessment.application_documents_score,
      'applicationShortlist', assessment.application_shortlist_score,
      'applicationSubmitted', assessment.application_submitted_score
    ),
    'rationales', pg_catalog.jsonb_build_object(
      'academicReadiness', assessment.academic_readiness_rationale,
      'intellectualProjects', assessment.intellectual_projects_rationale,
      'intellectualDistinction', assessment.intellectual_distinction_rationale,
      'professionalExperience', assessment.professional_experience_rationale,
      'professionalIndustry', assessment.professional_industry_rationale,
      'globalLeadership', assessment.global_leadership_rationale,
      'globalExposure', assessment.global_exposure_rationale,
      'globalDistinction', assessment.global_distinction_rationale,
      'applicationGmap', assessment.application_gmap_rationale,
      'applicationAdvisory', assessment.application_advisory_rationale,
      'applicationDocuments', assessment.application_documents_rationale,
      'applicationShortlist', assessment.application_shortlist_rationale,
      'applicationSubmitted', assessment.application_submitted_rationale
    ),
    'dimensionTotals', pg_catalog.jsonb_build_object(
      'academicReadiness', assessment.academic_readiness_total,
      'intellectualDepth', assessment.intellectual_depth_total,
      'professionalReadiness', assessment.professional_readiness_total,
      'globalLeadershipProfile', assessment.global_leadership_total,
      'applicationStrength', assessment.application_strength_total
    ),
    'totalScore', assessment.total_score,
    'readinessBand', assessment.readiness_band,
    'assessmentRationale', assessment.assessment_rationale,
    'parentSafeSummary', assessment.parent_safe_summary,
    'evidenceSchemaVersion', assessment.evidence_schema_version,
    'evidenceSnapshot', assessment.evidence_snapshot,
    'evidenceCapturedAt', assessment.evidence_captured_at,
    'assessorFullName', coalesce(
      nullif(pg_catalog.btrim(counselor.full_name), ''),
      'Counselor'
    ),
    'assessedAt', assessment.assessed_at
  )
  from public.student_global_readiness_assessments as assessment
  inner join public.profiles as counselor on counselor.id = assessment.assessed_by
  where assessment.student_id = p_student_id
  order by assessment.revision_number desc, assessment.assessed_at desc, assessment.id desc
  limit p_limit;
end;
$function$;

alter function public.list_primary_counselor_global_readiness_assessments(uuid, integer)
  owner to postgres;
revoke all on function public.list_primary_counselor_global_readiness_assessments(uuid, integer)
  from public, anon, authenticated, service_role;
grant execute on function public.list_primary_counselor_global_readiness_assessments(uuid, integer)
  to authenticated;

create function public.get_primary_counselor_latest_global_readiness_assessment(
  p_student_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_latest jsonb;
begin
  if (select auth.uid()) is null
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    raise exception using errcode = '42501',
      message = 'Current Primary Counselor authorization is required';
  end if;

  select history.value into v_latest
  from public.list_primary_counselor_global_readiness_assessments(
    p_student_id,
    1
  ) as history(value);
  return v_latest;
end;
$function$;

alter function public.get_primary_counselor_latest_global_readiness_assessment(uuid)
  owner to postgres;
revoke all on function public.get_primary_counselor_latest_global_readiness_assessment(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.get_primary_counselor_latest_global_readiness_assessment(uuid)
  to authenticated;

comment on table public.student_global_readiness_assessments is
  'Sealed immutable K-GEO Global Master''s Readiness Index revisions authored only by the Student''s current Primary Counselor.';
comment on function private.build_global_readiness_evidence_snapshot(uuid) is
  'Builds bounded evidence without private notes, follow-ups, Storage paths, signed URLs, document contents, or G-MAP inference.';

commit;
