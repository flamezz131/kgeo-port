-- Consolidated PR Upgrades Migration

-- 1. Add new columns to recommendation.pr_intake
alter table recommendation.pr_intake
  add column if not exists last_generated_at timestamptz,
  add column if not exists same_as_ug boolean not null default true,
  add column if not exists internships_text text,
  add column if not exists research_text text,
  add column if not exists other_work_text text,
  add column if not exists resume_path text,
  add column if not exists competitive_exams jsonb not null default '[]'::jsonb;

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
create policy "counselors read all intake" on recommendation.pr_intake
  for select using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
      and profiles.role = 'counselor'::public.user_role
    )
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
