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
