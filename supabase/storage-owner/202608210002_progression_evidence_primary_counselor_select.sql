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
