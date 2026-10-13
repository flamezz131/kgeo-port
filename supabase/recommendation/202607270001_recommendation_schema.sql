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
