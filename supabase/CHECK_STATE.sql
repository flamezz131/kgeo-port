-- ============================================================================
--  K-GEO — database state check
--  Run this in the Supabase SQL Editor (Dashboard > SQL Editor > New query).
--  Paste the whole result back so the correct migrations can be selected.
--  This is READ-ONLY. It changes nothing.
-- ============================================================================

with expected_public_tables(name) as (
  values
    ('profiles'), ('consultation_requests'), ('student_profiles'),
    ('student_preferences'), ('student_test_scores'), ('student_achievements'),
    ('counselor_notes'), ('follow_ups'), ('counselor_progression'),
    ('progression_evidence'), ('university_applications'),
    ('university_application_documents'), ('counselor_accounts'),
    ('director_identities'), ('staff_identity_provisioning_log'),
    ('primary_counselor_assignments'), ('student_eligibility_assessments'),
    ('student_profile_documents'), ('counselor_semester_summaries'),
    ('parent_reports'), ('kgeo_public_progress'),
    ('student_global_readiness_assessments'), ('student_achievement_documents')
),
expected_rpcs(name) as (
  values
    ('get_my_consultation_dashboard_metrics'), ('list_my_assigned_consultations'),
    ('claim_next_consultation'), ('record_consultation_outcome'),
    ('get_director_dashboard'), ('list_my_student_profile_documents'),
    ('get_public_kgeo_progress'), ('publish_kgeo_public_progress'),
    ('save_student_eligibility_assessment'), ('list_student_eligibility_assessments'),
    ('create_student_global_readiness_assessment'),
    ('list_primary_counselor_global_readiness_assessments'),
    ('get_primary_counselor_global_readiness_evidence'),
    ('list_my_student_achievement_documents'),
    ('prepare_student_achievement_document_upload'),
    ('get_director_student_case_detail'), ('get_director_student_identity')
)
select
  'public table' as kind,
  t.name,
  case when c.relname is not null then 'present' else 'MISSING' end as status
from expected_public_tables t
left join pg_class c
  on c.relname = t.name
 and c.relnamespace = 'public'::regnamespace
 and c.relkind = 'r'

union all
select
  'rpc/function',
  r.name,
  case when p.proname is not null then 'present' else 'MISSING' end
from expected_rpcs r
left join pg_proc p
  on p.proname = r.name
 and p.pronamespace = 'public'::regnamespace

union all
select
  'schema',
  s.nspname,
  'present'
from pg_namespace s
where s.nspname in ('public', 'recommendation', 'storage')

union all
select
  'recommendation table',
  t.name,
  case when c.relname is not null then 'present' else 'MISSING' end
from (values ('universities'), ('programs'), ('pr_intake'),
             ('recommendations'), ('recommendation_items'),
             ('development_plans')) as t(name)
left join pg_class c
  on c.relname = t.name
 and c.relnamespace = 'recommendation'::regnamespace

union all
select
  'storage bucket',
  b.name,
  'present'
from storage.buckets b

union all
select
  'migration history rows',
  coalesce(count(*)::text, '0'),
  'info'
from supabase_migrations.schema_migrations

order by 1, 2;

-- 202609210001: My Profile → Preferred courses / Field of study preference
select
  'column' as kind,
  'student_preferences.' || c.name as name,
  case when a.attname is not null then 'present' else 'MISSING' end as status
from (values ('preferred_courses'), ('same_as_ug')) as c(name)
left join pg_catalog.pg_attribute as a
  on a.attrelid = 'public.student_preferences'::regclass
 and a.attname = c.name
 and not a.attisdropped;
