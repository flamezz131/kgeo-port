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
