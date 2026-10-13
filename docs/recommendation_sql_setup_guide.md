# Recommendation Engine: SQL Setup & Architecture Guide

This document provides the complete SQL script for setting up the **Recommendation Engine** schema in your Supabase database, step-by-step instructions on where to execute it, and architectural guidelines addressing core database requirements.

---

## 1. Where to Enter and Execute the SQL Script

You can run this migration script using either the **Supabase Dashboard (SQL Editor)** or the **Supabase CLI**.

### Method A: Manually via the Supabase SQL Editor (Recommended for Quick Review)
Whenever you need to apply or re-verify this schema in your remote Supabase environment, follow these exact steps:
1. Go to your Supabase project dashboard: [supabase.com/dashboard](https://supabase.com/dashboard).
2. On the left sidebar, click on **SQL Editor** (the icon with terminal/command symbol).
3. Click on the **+ New query** button at the top left of the editor pane.
4. Copy the entire SQL script from Section 3 below and paste it into the blank query editor.
5. Click the **Run** button (or press `Ctrl + Enter` / `Cmd + Enter`).
6. You should see a success message: `Success. No rows returned.`

### Method B: Using the Supabase CLI (For Local Development & Version Control)
The recommendation-engine SQL scripts live in [`supabase/recommendation/`](../supabase/recommendation),
kept separate from `supabase/migrations/` because this feature uses an isolated
`recommendation` schema and is applied on its own (the core `public` schema
migrations in `supabase/migrations/` are a self-contained, immutability-checked
lineage). Apply them in filename order via the SQL editor (Method A), or copy
them into `supabase/migrations/` temporarily if you specifically want
`npx supabase db push` to include them.

---

## 2. Core Architectural Requirements & Guidelines

### Requirement 1: Isolated Schema with Same Authentication (No DB Collapse)
To ensure your existing core tables (`public.student_profiles`, `public.consultation_requests`, etc.) never get corrupted or collapsed:
* **Dedicated Namespace:** We create a separate PostgreSQL schema using `create schema if not exists recommendation;`. All tables for this feature reside inside `recommendation.*` rather than `public.*`.
* **Reusing Supabase Auth:** We do **not** create a new user or authentication system. The tables link directly to existing Supabase auth accounts via:
  * Foreign key constraints: `student_id uuid references auth.users(id)`
  * Row Level Security (RLS) policies: `using (student_id = auth.uid())` and `auth.role() = 'authenticated'`
* **Important API Configuration:** By default, Supabase PostgREST API only exposes the `public` schema. To query `recommendation` tables from your frontend JS/TS client:
  1. Go to **Project Settings > API > Exposed schemas** in the Supabase Dashboard.
  2. Add `recommendation` to the list of exposed schemas.
  3. In your frontend code, chain `.schema('recommendation')`:
     ```javascript
     const { data, error } = await supabase
       .schema('recommendation')
       .from('universities')
       .select('*');
     ```

### Requirement 2: Auto-Fetching Core Profile Data (No Duplicate Data Entry)
Students have already provided academic and personal data in your main database. **We must never ask them to manually re-enter identical data.**
* **Frontend Pre-Population Flow:** When a student opens the Recommendation Intake form in the UI, your frontend must automatically query and merge their existing data from the `public` schema:
  * **Academic Stats:** Fetch `department`, `cgpa`, `cgpa_scale`, and `active_backlogs` from `public.student_profiles`.
  * **Preferences:** Fetch `preferred_countries` and `preferred_program_areas` from `public.student_preferences`.
  * **Exam Scores:** Fetch `exam_name`, `exam_status`, and `score` from `public.student_test_scores`.
  * **Achievements:** Fetch internships, projects, and research papers from `public.student_achievements`.
* **Why store a snapshot in `recommendation.pr_intake`?** 
  While data is auto-fetched, saving the submitted payload into `recommendation.pr_intake` allows:
  1. **Scenario / What-If Testing:** A student can modify auto-fetched values (e.g., testing a higher target IELTS score or a different country) for a specific recommendation run *without* overriding their official core profile in `public.student_profiles`.
  2. **Audit & AI Reproducibility:** It freezes the exact inputs used at the moment of LLM recommendation generation (`submitted_at`), ensuring historical auditability even if their core profile changes later.

---

## 3. Complete SQL Migration Script

Below is the exact SQL script to create the recommendation schema, tables, and security policies:

```sql
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

grant usage on schema recommendation to anon, authenticated, service_role;
grant all on all tables in schema recommendation to anon, authenticated, service_role;
grant all on all sequences in schema recommendation to anon, authenticated, service_role;
grant all on all routines in schema recommendation to anon, authenticated, service_role;

alter default privileges in schema recommendation grant all on tables to anon, authenticated, service_role;
alter default privileges in schema recommendation grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema recommendation grant all on routines to anon, authenticated, service_role;
```


---

## 4. Academic Marksheets & Storage Bucket Setup (Migration 2)

If you have already applied the core schema above, you must execute the following supplemental migration in your **Supabase SQL Editor** to enable 10th & 12th grade percentage tracking and secure document uploads in the private `academic-documents` storage bucket.

### Execution Instructions:
1. Open your **Supabase Dashboard** and go to **SQL Editor**.
2. Click **+ New query**.
3. Copy and paste the SQL script below:

```sql
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
```
4. Click **Run**. Verify `Success. No rows returned.`

