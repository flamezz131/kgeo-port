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
