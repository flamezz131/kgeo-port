-- K-GEO Phase A1.4.2B Primary Counselor authorization helper.
-- The existing Storage policies remain unchanged. Progression-evidence and
-- application-document reservations are protected at their metadata tables.

begin;

create function public.is_active_primary_counselor_for_student(
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    (select auth.uid()) is not null
    and exists (
      select 1
      from public.student_counselor_assignments as assignment
      inner join public.profiles as student_profile
        on student_profile.id = assignment.student_id
        and student_profile.role = 'student'::public.user_role
      inner join public.profiles as counselor_profile
        on counselor_profile.id = assignment.counselor_id
        and counselor_profile.role = 'counselor'::public.user_role
        and counselor_profile.is_active is true
      inner join auth.users as counselor_auth
        on counselor_auth.id = counselor_profile.id
        and counselor_auth.email_confirmed_at is not null
      where assignment.student_id = p_student_id
        and assignment.counselor_id = (select auth.uid())
        and assignment.ended_at is null
    );
$function$;

alter function public.is_active_primary_counselor_for_student(uuid)
  owner to postgres;

revoke all on function public.is_active_primary_counselor_for_student(uuid)
  from public, anon, authenticated;

comment on function public.is_active_primary_counselor_for_student(uuid) is
  'Private auth.uid()-derived predicate for active verified Primary Counselor ownership of one student case.';

commit;
