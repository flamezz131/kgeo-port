-- K-GEO student-preferences core-profile dependency.
-- Review this migration and run the documented preflight query before applying.
-- Apply only after 202607190002_student_profile_foundation.sql.
--
-- Manual preflight (returns only non-sensitive owner UUIDs):
--
-- select
--   preference.student_id
-- from public.student_preferences as preference
-- left join public.student_profiles as profile
--   on profile.student_id = preference.student_id
-- where profile.student_id is null;
--
-- If this returns rows, inspect and explicitly resolve those student IDs before
-- applying this migration. This migration never repairs or deletes them.

begin;

-- Fail before changing either policy if legacy preferences-only rows exist.
-- The raised error deliberately reports no student IDs or private profile data.
do $preflight$
begin
  if exists (
    select 1
    from public.student_preferences as preference
    left join public.student_profiles as profile
      on profile.student_id = preference.student_id
    where profile.student_id is null
  ) then
    raise exception using
      errcode = '23514',
      message = 'Unresolved student preferences without a core profile exist';
  end if;
end;
$preflight$;

-- The existing BEFORE INSERT trigger remains authoritative for deriving
-- student_id from auth.uid() and rejecting callers who are not active,
-- email-confirmed students. This policy additionally requires that the
-- trigger-derived owner already has a core student_profiles row.
alter policy student_preferences_insert_own
on public.student_preferences
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
  and exists (
    select 1
    from public.student_profiles as student_profile
    where student_profile.student_id = student_preferences.student_id
  )
);

-- Both USING and WITH CHECK retain own-row, active verified student access and
-- require the corresponding core profile to remain visible. Column grants
-- continue to prevent changes to ownership and protected timestamps.
alter policy student_preferences_update_own
on public.student_preferences
using (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
  and exists (
    select 1
    from public.student_profiles as student_profile
    where student_profile.student_id = student_preferences.student_id
  )
)
with check (
  student_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'student'::public.user_role
  ))
  and exists (
    select 1
    from public.student_profiles as student_profile
    where student_profile.student_id = student_preferences.student_id
  )
);

comment on policy student_preferences_insert_own
  on public.student_preferences is
  'Active verified students can insert only their own preferences after creating their core student profile.';

comment on policy student_preferences_update_own
  on public.student_preferences is
  'Active verified students can update only their own preferences while their core student profile exists.';

commit;
