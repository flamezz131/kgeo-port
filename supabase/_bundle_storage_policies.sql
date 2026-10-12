-- K-GEO — storage-owner RLS policies (run AFTER _bundle_public.sql).

-- >>> supabase/storage-owner/202608210002_progression_evidence_primary_counselor_select.sql
-- K-GEO Final Client Review Step 2 owner-run Storage SELECT hardening.
-- Execute only as the existing owner of storage.objects, after the matching
-- public-schema migration. Preserve all existing relation ownership.

begin;

alter policy progression_evidence_object_select_counselor
on storage.objects
to authenticated
using (
  storage.objects.bucket_id = 'counseling-progression-evidence'
  and (
    select public.has_active_verified_kgeo_role(
      'counselor'::public.user_role
    )
  )
  and exists (
    select 1
    from public.student_counseling_progression_evidence as evidence
    inner join public.student_counseling_progression_events as event
      on event.id = evidence.progression_event_id
    where evidence.bucket_id = storage.objects.bucket_id
      and evidence.storage_path = storage.objects.name
      and evidence.status =
        'available'::public.counseling_progression_evidence_status
      and public.is_active_primary_counselor_for_student(
        event.student_id
      ) is true
  )
);

commit;

-- >>> supabase/storage-owner/202608240002_student_profile_document_policies.sql
-- Execute only as the existing owner of storage.objects after
-- 202608240002_student_profile_documents.sql. Do not change ownership and do
-- not use SET ROLE.

begin;

create policy student_profile_document_object_insert_student
on storage.objects
as permissive
for insert
to authenticated
with check (
  storage.objects.bucket_id = 'student-profile-documents'
  and (
    select public.can_upload_student_profile_document_object(
      storage.objects.bucket_id,
      storage.objects.name
    )
  )
);

create policy student_profile_document_object_select_authorized
on storage.objects
as permissive
for select
to authenticated
using (
  storage.objects.bucket_id = 'student-profile-documents'
  and (
    select public.can_view_student_profile_document_object(
      storage.objects.bucket_id,
      storage.objects.name
    )
  )
);

create policy student_profile_document_object_delete_student
on storage.objects
as permissive
for delete
to authenticated
using (
  storage.objects.bucket_id = 'student-profile-documents'
  and (
    select public.can_delete_student_profile_document_object(
      storage.objects.bucket_id,
      storage.objects.name
    )
  )
);

commit;

-- >>> supabase/storage-owner/202608250005_parent_report_attachment_policies.sql
-- K-GEO Parent Report private Storage policies.
-- Run manually as the owner of storage.objects after Migration 202608250005.
-- This artifact intentionally performs no role switching or ownership changes.

begin;

drop policy if exists parent_report_attachment_object_insert_staff
  on storage.objects;
create policy parent_report_attachment_object_insert_staff
on storage.objects
as permissive
for insert
to authenticated
with check (
  storage.objects.bucket_id = 'parent-report-attachments'
  and public.can_upload_parent_report_object(
    storage.objects.bucket_id,
    storage.objects.name
  )
);

drop policy if exists parent_report_attachment_object_select_staff
  on storage.objects;
create policy parent_report_attachment_object_select_staff
on storage.objects
as permissive
for select
to authenticated
using (
  storage.objects.bucket_id = 'parent-report-attachments'
  and public.can_view_parent_report_object(
    storage.objects.bucket_id,
    storage.objects.name
  )
);

drop policy if exists parent_report_attachment_object_delete_staff
  on storage.objects;
create policy parent_report_attachment_object_delete_staff
on storage.objects
as permissive
for delete
to authenticated
using (
  storage.objects.bucket_id = 'parent-report-attachments'
  and public.can_delete_parent_report_object(
    storage.objects.bucket_id,
    storage.objects.name
  )
);

commit;

-- >>> supabase/storage-owner/202609020002_student_achievement_document_policies.sql
-- Execute only as the existing owner of storage.objects after
-- 202609020002_student_achievement_evidence.sql. Do not change ownership and
-- do not use SET ROLE.
-- INSERT uses the authenticated Storage endpoint, not a signed-upload token.
-- Its helper locks the matching reservation row through Storage commit so
-- upload, cancellation, and finalization are serialized fail closed.

begin;

create policy student_achievement_document_object_insert_student
on storage.objects
as permissive
for insert
to authenticated
with check (
  storage.objects.bucket_id = 'student-achievement-documents'
  and (
    select public.can_upload_student_achievement_document_object(
      storage.objects.bucket_id,
      storage.objects.name
    )
  )
);

create policy student_achievement_document_object_select_authorized
on storage.objects
as permissive
for select
to authenticated
using (
  storage.objects.bucket_id = 'student-achievement-documents'
  and (
    select public.can_view_student_achievement_document_object(
      storage.objects.bucket_id,
      storage.objects.name
    )
  )
);

create policy student_achievement_document_object_delete_student
on storage.objects
as permissive
for delete
to authenticated
using (
  storage.objects.bucket_id = 'student-achievement-documents'
  and (
    select public.can_delete_student_achievement_document_object(
      storage.objects.bucket_id,
      storage.objects.name
    )
  )
);

commit;

-- >>> supabase/storage-owner/202610120001_student_resume_policies.sql
begin;

insert into storage.buckets (id, name, public)
values ('student-resumes', 'student-resumes', false)
on conflict (id) do nothing;

drop policy if exists "students upload own resumes" on storage.objects;
drop policy if exists "students read own resumes" on storage.objects;
drop policy if exists "students update own resumes" on storage.objects;
drop policy if exists "students delete own resumes" on storage.objects;

create policy "students upload own resumes"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "students read own resumes"
on storage.objects for select
to authenticated
using (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

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

create policy "students delete own resumes"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'student-resumes'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;


