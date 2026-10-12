-- K-GEO — student-resumes private Storage policies.
-- Execute as the owner of storage.objects.
-- Grants full lifecycle control (INSERT, SELECT, UPDATE, DELETE) to the owning student.

begin;

-- 1. Ensure bucket exists
insert into storage.buckets (id, name, public)
values ('student-resumes', 'student-resumes', false)
on conflict (id) do nothing;

-- 2. Drop existing partial policies if any
drop policy if exists "students upload own resumes" on storage.objects;
drop policy if exists "students read own resumes" on storage.objects;
drop policy if exists "students update own resumes" on storage.objects;
drop policy if exists "students delete own resumes" on storage.objects;

-- 3. INSERT: student can upload to {auth.uid()}/...
create policy "students upload own resumes"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 4. SELECT: student can download their own resume
create policy "students read own resumes"
on storage.objects for select
to authenticated
using (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 5. UPDATE: student can overwrite existing resume (upsert: true)
create policy "students update own resumes"
on storage.objects for update
to authenticated
using (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

-- 6. DELETE: student can delete their own resume
create policy "students delete own resumes"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
