-- K-GEO — RECOMMENDATION schema (Personal Recommendation / PR feature).
-- Apply the later recommendation_schema file, then the rest in order.

-- >>> supabase/recommendation/202607270001_recommendation_schema.sql
create schema if not exists recommendation;

create table recommendation.universities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  country text not null,
  world_rank int,
  logo_url text,
  website text,
  created_at timestamptz not null default now()
);

create table recommendation.programs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  degree_type text not null check (degree_type in ('Bachelors','Masters','PhD','Diploma')),
  duration_months int,
  created_at timestamptz not null default now()
);

create table recommendation.university_programs (
  id uuid primary key default gen_random_uuid(),
  university_id uuid not null references recommendation.universities(id) on delete cascade,
  program_id uuid not null references recommendation.programs(id) on delete cascade,
  min_cgpa numeric,
  min_ielts numeric,
  min_toefl numeric,
  min_gre numeric,
  intake text[],
  deadline date,
  tuition_estimate_inr numeric,
  created_at timestamptz not null default now()
);

create table recommendation.pr_intake (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references auth.users(id),
  department text not null,
  stream text not null check (stream in ('engineering','arts')),
  year_stage text not null check (year_stage in ('pre_final','final')),
  cgpa numeric not null,
  cgpa_scale numeric not null default 10,
  backlogs int not null default 0,
  internships jsonb not null default '[]',
  research_papers jsonb not null default '[]',
  preferred_countries text[] not null default '{}',
  preferred_courses text[] not null default '{}',
  preferred_universities text[] not null default '{}',
  specialization text[] not null default '{}',
  portfolio_or_project_note text,
  exam_type text check (exam_type in ('IELTS','TOEFL','GRE','GMAT','none')),
  exam_status text not null check (exam_status in ('not_taken','target','actual')),
  exam_score numeric,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table recommendation.recommendations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id),
  type text not null check (type in ('BR','PR')),
  status text not null default 'completed' check (status in ('queued','completed','failed')),
  generated_at timestamptz not null default now(),
  model text,
  version int not null default 1
);

create table recommendation.recommendation_items (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references recommendation.recommendations(id) on delete cascade,
  university_program_id uuid references recommendation.university_programs(id),
  score numeric,
  rank int,
  bucket text check (bucket in ('Safe','Match','Reach')),
  reason_summary text[],
  created_at timestamptz not null default now()
);

create table recommendation.pr_insights (
  id uuid primary key default gen_random_uuid(),
  recommendation_item_id uuid not null references recommendation.recommendation_items(id) on delete cascade,
  fit_score numeric,
  admission_probability numeric,
  key_reasons text[],
  research_opportunities text[],
  faculty_match text[],
  missing_requirements text[],
  strengths text[],
  suggestions text[],
  roadmap text[],
  raw_ai_output jsonb,
  created_at timestamptz not null default now()
);

create table recommendation.llm_call_log (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid references recommendation.recommendations(id),
  prompt_summary jsonb,
  raw_output text,
  succeeded boolean not null,
  created_at timestamptz not null default now()
);

alter table recommendation.pr_intake enable row level security;
alter table recommendation.recommendations enable row level security;
alter table recommendation.recommendation_items enable row level security;
alter table recommendation.pr_insights enable row level security;
alter table recommendation.universities enable row level security;
alter table recommendation.programs enable row level security;
alter table recommendation.university_programs enable row level security;
alter table recommendation.llm_call_log enable row level security;

create policy "admin only log access" on recommendation.llm_call_log for all using (false);

create policy "students manage own intake" on recommendation.pr_intake
  for all using (student_id = auth.uid());
create policy "students read own recommendations" on recommendation.recommendations
  for select using (student_id = auth.uid());
create policy "students read own recommendation items" on recommendation.recommendation_items
  for select using (exists (
    select 1 from recommendation.recommendations r
    where r.id = recommendation_items.recommendation_id and r.student_id = auth.uid()
  ));
create policy "students read own pr insights" on recommendation.pr_insights
  for select using (exists (
    select 1 from recommendation.recommendation_items ri
    join recommendation.recommendations r on r.id = ri.recommendation_id
    where ri.id = pr_insights.recommendation_item_id and r.student_id = auth.uid()
  ));
create policy "authenticated read universities" on recommendation.universities
  for select using (auth.role() = 'authenticated');
create policy "authenticated read programs" on recommendation.programs
  for select using (auth.role() = 'authenticated');
create policy "authenticated read university_programs" on recommendation.university_programs
  for select using (auth.role() = 'authenticated');


-- >>> supabase/recommendation/202607270002_pr_intake_academic_marksheets.sql
-- New academic score columns on the existing pr_intake table
alter table recommendation.pr_intake
  add column tenth_percentage numeric check (tenth_percentage between 0 and 100),
  add column tenth_marksheet_path text,
  add column twelfth_percentage numeric check (twelfth_percentage between 0 and 100),
  add column twelfth_marksheet_path text;

-- A private Storage bucket for the actual files
insert into storage.buckets (id, name, public)
values ('academic-documents', 'academic-documents', false)
on conflict (id) do nothing;

-- Students can only upload into a folder named after their own user id
create policy "students upload own marksheets"
on storage.objects for insert
with check (
  bucket_id = 'academic-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- Students can only read their own files back
create policy "students read own marksheets"
on storage.objects for select
using (
  bucket_id = 'academic-documents'
  and (storage.foldername(name))[1] = auth.uid()::text
);


-- >>> supabase/recommendation/20240801000000_add_development_plans.sql
create table if not exists recommendation.development_plans (
    id uuid primary key default gen_random_uuid(),
    recommendation_id uuid references recommendation.recommendations(id) on delete cascade not null,
    priority_exams jsonb not null default '[]'::jsonb,
    language_requirements jsonb not null default '[]'::jsonb,
    suggested_internships jsonb not null default '[]'::jsonb,
    suggested_certifications jsonb not null default '[]'::jsonb,
    created_at timestamptz not null default now()
);

-- Enable RLS (Assuming standard setup)
alter table recommendation.development_plans enable row level security;

create policy "Users can view their own development plans"
    on recommendation.development_plans
    for select
    using (
        recommendation_id in (
            select id from recommendation.recommendations where student_id = auth.uid()
        )
    );


-- >>> supabase/recommendation/20260813000000_consolidated_pr_upgrades.sql
-- Consolidated PR Upgrades Migration

-- 1. Add new columns to recommendation.pr_intake
alter table recommendation.pr_intake
  add column if not exists last_generated_at timestamptz,
  add column if not exists same_as_ug boolean not null default true,
  add column if not exists internships_text text,
  add column if not exists research_text text,
  add column if not exists other_work_text text,
  add column if not exists resume_path text,
  add column if not exists competitive_exams jsonb not null default '[]'::jsonb,
  add column if not exists ai_consent boolean not null default false;

-- 2. Add CHECK constraints for array lengths
alter table recommendation.pr_intake
  add constraint pr_intake_preferred_countries_length_check check (array_length(preferred_countries, 1) <= 10),
  add constraint pr_intake_preferred_courses_length_check check (array_length(preferred_courses, 1) <= 10),
  add constraint pr_intake_specialization_length_check check (array_length(specialization, 1) <= 10);

-- 3. Replace the current "for all" RLS policy with explicit select/insert/update
drop policy if exists "students manage own intake" on recommendation.pr_intake;

create policy "students select own intake" on recommendation.pr_intake
  for select using (student_id = auth.uid());

create policy "students insert own intake" on recommendation.pr_intake
  for insert with check (student_id = auth.uid());

create policy "students update own intake" on recommendation.pr_intake
  for update using (student_id = auth.uid()) with check (student_id = auth.uid());

-- 4. Add counselor read access
create policy "counselors read assigned intake" on recommendation.pr_intake
  for select using (
    public.is_active_primary_counselor_for_student(student_id)
  );

-- 5. Bucket renaming for recommendation_items
alter table recommendation.recommendation_items
  drop constraint if exists recommendation_items_bucket_check;

alter table recommendation.recommendation_items
  add constraint recommendation_items_bucket_check check (bucket in ('Ambitious', 'Target', 'Achievable'));

-- 6. A private Storage bucket for student resumes
insert into storage.buckets (id, name, public)
values ('student-resumes', 'student-resumes', false)
on conflict (id) do nothing;

-- 7. Students can only upload into a folder named after their own user id
create policy "students upload own resumes"
on storage.objects for insert
with check (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 8. Students can only read their own files back
create policy "students read own resumes"
on storage.objects for select
using (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 9. Storage update and delete policies for resumes
create policy "students update own resumes"
on storage.objects for update
using (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "students delete own resumes"
on storage.objects for delete
using (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);


-- >>> supabase/recommendation/202610120001_ai_recommendation_contract.sql
alter table recommendation.recommendations
  add column if not exists profile_snapshot jsonb,
  add column if not exists error_message text;

create index if not exists idx_recommendations_student_generated
  on recommendation.recommendations (student_id, generated_at desc);

create unique index if not exists idx_recommendations_one_queued_per_student
  on recommendation.recommendations (student_id)
  where (status = 'queued');

alter table recommendation.development_plans
  add column if not exists readiness_score numeric,
  add column if not exists strengths jsonb not null default '[]'::jsonb,
  add column if not exists priority_gaps jsonb not null default '[]'::jsonb,
  add column if not exists quick_wins jsonb not null default '[]'::jsonb,
  add column if not exists long_term_actions jsonb not null default '[]'::jsonb;

alter table recommendation.pr_insights
  add column if not exists why_recommended jsonb not null default '[]'::jsonb,
  add column if not exists top_actions jsonb not null default '[]'::jsonb,
  add column if not exists current_profile jsonb not null default '{}'::jsonb,
  add column if not exists target_profile jsonb not null default '{}'::jsonb,
  add column if not exists gaps jsonb not null default '[]'::jsonb,
  add column if not exists detailed_roadmap jsonb not null default '[]'::jsonb,
  add column if not exists risks jsonb not null default '[]'::jsonb,
  add column if not exists application_readiness jsonb not null default '{}'::jsonb;

create index if not exists idx_recommendation_items_rec_id
  on recommendation.recommendation_items (recommendation_id);

create index if not exists idx_pr_insights_item_id
  on recommendation.pr_insights (recommendation_item_id);

create table if not exists recommendation.student_roadmap_tasks (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  recommendation_id uuid not null references recommendation.recommendations(id) on delete cascade,
  university_program_id uuid references recommendation.university_programs(id) on delete set null,
  task_key text not null,
  category text,
  title text not null,
  description text,
  priority text not null default 'MEDIUM' check (priority in ('HIGH', 'MEDIUM', 'LOW')),
  status text not null default 'not_started' check (status in ('not_started', 'in_progress', 'completed', 'archived')),
  target_outcome text,
  estimated_duration text,
  phase int not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_roadmap_tasks_rec_id
  on recommendation.student_roadmap_tasks (recommendation_id);

create index if not exists idx_roadmap_tasks_student_id
  on recommendation.student_roadmap_tasks (student_id);

alter table recommendation.student_roadmap_tasks enable row level security;

create policy "students read own roadmap tasks"
  on recommendation.student_roadmap_tasks
  for select
  using (student_id = auth.uid());

grant usage on schema recommendation to authenticated, service_role;
revoke all on schema recommendation from anon;

grant select on
  recommendation.recommendations,
  recommendation.recommendation_items,
  recommendation.pr_insights,
  recommendation.development_plans,
  recommendation.student_roadmap_tasks,
  recommendation.universities,
  recommendation.programs,
  recommendation.university_programs
to authenticated;

grant all on all tables in schema recommendation to service_role;
grant all on all sequences in schema recommendation to service_role;
grant all on all routines in schema recommendation to service_role;

revoke all on all tables in schema recommendation from anon;
revoke all on all sequences in schema recommendation from anon;
revoke all on all routines in schema recommendation from anon;



