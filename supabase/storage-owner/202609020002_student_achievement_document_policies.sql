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
