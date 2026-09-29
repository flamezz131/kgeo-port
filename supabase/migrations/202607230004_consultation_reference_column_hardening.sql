-- K-GEO Phase C1.1, stage B: make consultation request numbers internal.
-- Apply only after stage A is verified and the counselor application has been
-- deployed using get_counselor_consultation_references(uuid[]).

begin;

do $migration$
begin
  if pg_catalog.to_regprocedure(
    'public.get_counselor_consultation_references(uuid[])'
  ) is null then
    raise exception using
      errcode = '55000',
      message = 'Apply the counselor consultation reference RPC migration first';
  end if;
end;
$migration$;

-- Table-level SELECT exposes every column to every RLS-authorized session.
-- Students and counselors both connect as PostgreSQL role authenticated, so
-- request_number must be removed at the column-privilege boundary rather than
-- through an RLS expression.
revoke select on table public.consultation_requests
  from authenticated;

revoke select (request_number)
  on table public.consultation_requests
  from public, anon, authenticated;

-- These columns cover the current student history, booking receipt, counselor
-- dashboard and schedule, lifecycle/outcome controls, and the safe historical
-- fields needed by a future authorized Student 360 consultation history.
-- Deprecated assignment fields and counselor outcome-audit identity are not
-- required by these flows and remain ungranted.
grant select (
  id,
  student_id,
  student_name,
  roll_number,
  college_email,
  personal_email,
  college_end_year,
  department,
  course,
  mobile_number,
  higher_studies_interest,
  status,
  consultation_date,
  slot_start,
  slot_end,
  submitted_at,
  created_at,
  updated_at
) on table public.consultation_requests
  to authenticated;

comment on column public.consultation_requests.request_number is
  'Database-generated internal consultation reference; authenticated application users retrieve it only through an authorized trusted RPC.';

-- Existing RLS policies still decide which rows each authenticated role may
-- read. Existing column-level INSERT grants are unaffected. No UPDATE or
-- DELETE privilege is added, and no consultation row or reference is changed.

commit;
