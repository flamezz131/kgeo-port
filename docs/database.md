# K-GEO identity database

This document describes the K-GEO identity foundation, the separately reviewed
Version 1 consultation-request schema, the single-counselor slot-booking
extension, the applied Phase A detailed-student-profile foundation, the
prepared Phase D1 counselor-private record foundation, and the applied Phase
D2 counselor follow-up workload foundation, plus the applied Phase D3.1
official-progression foundation. These migrations do not change Supabase-owned
infrastructure or store authentication secrets.

## `auth.users` and `public.profiles`

`auth.users` is owned and managed by Supabase Auth. It contains the identity
record used to sign in, including the Auth user ID and verified email state.
Application code should use Supabase Auth APIs instead of directly modifying
this table.

`public.profiles` is the K-GEO application record for that identity. It stores
the normalized college email, K-GEO role, display name, account status, and
timestamps. It deliberately does not store passwords or authentication tokens.

The `public.profiles.id` column is both its primary key and a foreign key to
`auth.users.id`. This creates a one-to-one mapping: one Supabase Auth user can
have at most one K-GEO profile. Deleting an Auth user also deletes that user's
profile through `on delete cascade`.

## Profile creation and roles

After Supabase inserts an Auth user, the `on_auth_user_created` trigger calls
`public.handle_new_user()`. Public signup normalizes `auth.users.email`,
requires the exact `@kct.ac.in` domain, copies the Auth user ID and email, and
explicitly inserts the role `student`.

Public input cannot select a role. The function does not read a role from form
data, URL parameters, browser state, or `raw_user_meta_data`. This is why every
successful public signup becomes a student even if a malicious caller submits
privileged metadata.

The available roles are:

- `student`
- `counselor`
- `admin`
- `director`

Counselor, Director, and admin provisioning remain outside public
registration. A counselor or Director may be provisioned only through the
private, service-role-prepared one-time staff flow described below. Admin is
not supported by that flow. Auth metadata does not independently authorize a
role, and no public role-changing function or browser capability exists.

If an Auth record has no email, profile creation fails closed and the Auth
insert is rolled back. The profile constrains `college_email` to a normalized
address and applies its domain rule by role: students, counselors, and admins
remain exact-`@kct.ac.in`; Directors may use any syntactically valid normalized
email. A Before User Created Auth Hook is intentionally not part of this
foundation and can be added later as an earlier enforcement layer.

## Initial Row Level Security

Row Level Security is enabled on `public.profiles`. There is no anonymous table
access and there are no counselor, admin, or director cross-user policies yet.

An authenticated user may:

- read the profile whose `id` equals their authenticated Supabase user ID;
- before the atomic identity follow-up is applied, update only the `full_name`
  column on that same profile;
- after that follow-up is applied, change their canonical name and detailed
  identity only through `public.save_student_identity(...)`.

An authenticated browser user may not:

- read another user's profile;
- insert or delete profiles;
- change `id` or `college_email`;
- change `role`;
- change `is_active`;
- write `created_at` or `updated_at`.

The update policy enforces row ownership. Before the atomic identity follow-up
is applied, PostgreSQL column privileges provide the second layer that permits
updates only to `full_name`. The `profiles_set_updated_at` trigger maintains
`updated_at` automatically.

### Canonical student names

`public.profiles.full_name` is the student's current canonical K-GEO name.
`public.consultation_requests.student_name` is the name snapshot submitted for
that historical appointment. Updating a profile name never rewrites an earlier
consultation request, and later Student 360 consultation history must continue
to read the retained appointment records as historical facts.

The prepared, unapplied
`202607230001_canonical_names_and_consultation_outcomes.sql` migration enforces
a 150-character maximum for new or changed canonical names without rewriting
legacy rows. The database constraint also requires new or changed non-null names
to be trimmed and internally whitespace-normalized, so direct API calls cannot
bypass the canonical format enforced by the application.

The separately prepared, unapplied
`202607230002_atomic_student_identity_save.sql` migration adds
`public.save_student_identity(...)`. The function derives the student from
`auth.uid()`, requires a matching active student profile and confirmed Auth
email, and atomically updates only `public.profiles.full_name` while inserting
or updating only the approved identity columns in `public.student_profiles`.
It returns no student information. A failure in either table write rolls back
the entire call, and the RPC remaps constraint, authorization, concurrency, and
unexpected failures to non-sensitive categories before the Server Action maps
them to public UI messages. The migration also revokes the earlier direct
authenticated
`full_name` grant and the direct identity-column INSERT/UPDATE grants on
`student_profiles` so a browser cannot split the atomic operation. Existing
academic-field UPDATE grants remain unchanged for later profile sections.
College email, role, active state, profile workflow state, ownership, and
timestamps are not RPC inputs and remain protected.

For future application registrations, the registration action sends only the
validated non-privileged `full_name` metadata value. The prepared trigger
revision requires, validates, and copies that one metadata field while
continuing to assign `student` explicitly and ignoring every metadata role
value. Later trusted staff provisioning must also supply a valid canonical name.
Existing null names remain null until the student corrects them in My Profile;
K-GEO does not infer or backfill canonical names from consultation snapshots.
The same Personal and Academic Identity form saves the canonical name and
detailed identity fields through one Save and Continue action. Full name is not
added to the eleven-field detailed-profile completion calculation.

## Signup-trigger recovery

A failure in an `auth.users` trigger can block new signups. If that happens,
review the Supabase Auth and Postgres logs before changing the database.

To pause K-GEO profile creation without deleting data, a database administrator
can disable only this trigger:

```sql
alter table auth.users disable trigger on_auth_user_created;
```

After correcting `public.handle_new_user()`, re-enable it:

```sql
alter table auth.users enable trigger on_auth_user_created;
```

If the trigger must be removed, review and manually run:

```sql
drop trigger if exists on_auth_user_created on auth.users;
```

Disabling or removing the trigger does not delete Auth users or existing
profiles. Any Auth users created while it is inactive will not have profiles;
they require a separately reviewed and trusted backfill before using K-GEO.

## Version 1 consultation requests

`public.consultation_requests` belongs to the application schema. Each request
has a `student_id` foreign key to `public.profiles.id`, giving this ownership
chain:

```text
auth.users.id -> public.profiles.id -> public.consultation_requests.student_id
```

Supabase Auth establishes the authenticated user ID. The profile maps that
identity to K-GEO's normalized institutional email, role, and active state.
The consultation request then belongs to that exact profile. Deleting an Auth
user cascades through the profile to that student's consultation requests.

### Student-provided and trusted fields

Authenticated students provide only:

- name;
- roll number;
- personal email;
- college end year;
- department;
- course;
- ten-digit mobile number;
- higher-studies interest.

The original Version 1 insert trigger supplied or overwrote:

- `student_id` from `auth.uid()`;
- `college_email` from the active student profile;
- the readable request number;
- the historical `waiting_for_assignment` status;
- null values in the now-deprecated counselor-assignment columns;
- submission, creation, and update timestamps.

After the slot-booking migration, the replacement trigger additionally requires
`consultation_date` and `slot_start`, derives `slot_end`, and always overwrites
the status to `scheduled`. New application bookings never enter
`waiting_for_assignment`. The browser cannot insert trusted ownership, status,
assignment, slot-end, request-number, or timestamp fields because authenticated
users receive only narrow column-level INSERT privileges. The trigger verifies
that the authenticated identity maps to an active, email-confirmed student.

Students have no UPDATE or DELETE privilege or policy in Version 1. They can
insert their own request and select only their own requests. Anonymous users
have no access.

### Readable request numbers

The UUID `id` remains the primary key. A database sequence and trusted insert
trigger generate readable numbers such as `KGEOC-2026-000001`. A sequence is
atomic under concurrent inserts, unlike `count(*) + 1`. Rolled-back or failed
transactions can leave gaps; gaps are expected and must not be treated as
missing requests.

Request numbers are internal operational identifiers. Student history queries
and post-booking action receipts deliberately omit `request_number`, so it is
not passed to student Client Components or rendered in student cards,
accessibility text, or URLs. Authorized counselor schedule and dashboard pages
retrieve it through the counselor-only reference RPC for operational tracking.
The database column, uniqueness constraint, historical values, and trusted
generation logic remain unchanged.

### Phase C1.1 database-enforced internal references

The original consultation migration grants table-level SELECT to PostgreSQL
role `authenticated`. RLS limits rows, but it cannot hide `request_number` from
students while exposing that column to counselors because both sessions use the
same database role. Before Phase C1.1 stage B is applied, a student can
therefore request the reference for their own RLS-visible row directly through
PostgREST even though the K-GEO student UI never selects it.

The prepared, unapplied
`202607230003_counselor_consultation_reference_rpc.sql` migration is additive.
It creates
`public.get_counselor_consultation_references(p_consultation_ids uuid[])`,
which:

- derives the caller from `auth.uid()`;
- requires a matching active counselor profile and confirmed Auth email;
- accepts between 1 and 100 unique, non-null consultation UUIDs;
- returns only matching `consultation_id` and `request_number` pairs;
- uses an empty search path, schema-qualified objects, no dynamic SQL, and a
  trusted `postgres` owner;
- revokes execution from `public` and `anon` and grants it only to
  `authenticated`, while independently rejecting students, admins, directors,
  inactive counselors, and unverified counselors.

Stage A changes no table grants. Counselor dashboard and schedule queries first
load consultation rows without `request_number`, collect and deduplicate their
bounded UUIDs, call the RPC once per page request, validate every returned pair,
and merge the references only inside the Server Component. Missing, duplicate,
unrelated, or malformed reference rows fail the page to its generic unavailable
state.

The separately prepared, unapplied
`202607230004_consultation_reference_column_hardening.sql` migration revokes
table-level consultation SELECT from `authenticated`, explicitly revokes
column SELECT on `request_number`, and grants authenticated SELECT only on:

- `id`, `student_id`;
- `student_name`, `roll_number`, `college_email`, `personal_email`;
- `college_end_year`, `department`, `course`, `mobile_number`;
- `higher_studies_interest`, `status`;
- `consultation_date`, `slot_start`, `slot_end`;
- `submitted_at`, `created_at`, `updated_at`.

Existing RLS policies continue deciding which rows those columns expose.
Existing student booking INSERT grants remain unchanged. No UPDATE or DELETE
grant is added. Deprecated assignment columns and counselor outcome-audit
columns are not granted to the shared authenticated role. The request-number
column, values, uniqueness constraint, and trusted generation logic are not
changed.

The required rollout order is:

1. Apply additive Migration A.
2. Verify the function owner, definition, and EXECUTE privileges.
3. Deploy or restart the application code that uses the reference RPC.
4. Confirm counselor dashboard, schedule, cancelled history, and legacy cards
   still display references.
5. Apply hardening Migration B.
6. Confirm an authenticated student PostgREST
   `select=request_number` request fails with a column-permission error and no
   reference value.
7. Confirm the counselor UI still obtains references only through the RPC.

Applying stage B before the counselor application update would remove the
column used by the old direct counselor projections and temporarily break the
counselor portal.

### Historical request ordering

`submitted_at` is set by the database rather than accepted from the browser.
Legacy unscheduled requests can still be ordered by:

```sql
order by submitted_at asc, id asc
```

The `(status, submitted_at, id)` index supports that bounded historical query.
The UUID provides deterministic tie-breaking when requests share a statement
timestamp.

### Direct single-counselor time-slot booking

The reviewed `202607190001_single_counselor_slot_booking.sql` migration replaces
the historical unscheduled-request flow with direct student booking. Once the
migration is applied, new student inserts must include a consultation date and
slot start, so the matching reviewed application release must be deployed at
the same time.

K-GEO initially uses one counselor and six fixed 30-minute slots each supported
Monday through Friday:

- 14:00-14:30
- 14:30-15:00
- 15:00-15:30
- 15:30-16:00
- 16:00-16:30
- 16:30-17:00

Students choose only `consultation_date` and `slot_start`. The trusted insert
trigger derives `slot_end`, rechecks that the Auth email is confirmed, verifies
the active student profile, sets the row owner and college email, generates the
request number and timestamps, keeps the deprecated assignment columns null,
and creates the row with `scheduled` status. Browser input cannot choose
ownership, status, counselor identity, slot end, request number, or timestamps.

Past business dates and weekends are rejected. For the current Asia/Kolkata
date, a slot is expired once its start time is less than or equal to the current
Asia/Kolkata time. Both the trusted insert trigger and the availability function
derive date and time from one database statement timestamp, so the UI is not the
security boundary. The MVP currently treats every Monday through Friday as an
eligible booking day; configurable holidays, counselor leave, and other
unavailable dates require a later reviewed calendar migration.

### Double-booking protection

A unique partial index covers `(consultation_date, slot_start)` for every row
whose status is not `cancelled`. PostgreSQL enforces that index during
concurrent transactions, so two students cannot successfully reserve the same
active slot even if both saw it as available. The second transaction fails its
insert after the competing transaction commits. Changing a row to `cancelled`
removes it from the partial index and releases the slot for a future booking.

Availability is not enforced only by application checks and does not use
`count(*)`. The index is the final concurrency-safe database boundary.

### Private slot availability

`public.get_consultation_slot_availability(p_date)` returns exactly six rows
containing only:

- `slot_start`;
- `slot_end`;
- `availability_status`.

`availability_status` uses the database enum values `available`, `booked`, and
`expired`. All six fixed slots remain in the result. On the current business
date, a started or past slot is `expired`; a future active reservation is
`booked`; and only an unexpired, unbooked slot is `available`. Expiry takes
precedence over booking state so students cannot infer whether another student
occupied an already expired slot.

The security-definer function is restricted to authenticated callers and also
requires an active, email-confirmed student profile. It uses an empty search
path and schema-qualified tables. It can inspect all active bookings to produce
availability without granting students cross-student table access or exposing
student IDs, names, emails, mobile numbers, request numbers, or other request
data. Anonymous and public execution is revoked.

### Read-only staff schedule access

The slot-booking migration adds SELECT-only RLS policies so:

- before the outcome migration, an active counselor can read all consultation
  requests directly;
- an active director can read all consultation requests as a read-only viewer;
- an active admin can read all consultation requests as a read-only viewer.

These policies do not grant UPDATE or DELETE access. Counselors see
student-booked slots automatically; there is no approval, allocation,
assignment, or queue-movement step. The prepared outcome migration replaces the
counselor SELECT policy with the shared active, email-confirmed counselor
predicate. It grants only the narrow outcome-recording operation described
below and does not broaden director or admin access.

### Consultation lifecycle and final outcomes

The prepared, unapplied
`202607230001_canonical_names_and_consultation_outcomes.sql` migration adds the
stored final status `no_show` beside the existing `completed` and `cancelled`
states. It also adds `outcome_recorded_at` and `outcome_recorded_by` for trusted
counselor outcome audit. Existing rows and statuses are not rewritten.

For a row whose stored status is `scheduled`, the application derives one
operational state using Asia/Kolkata:

- start is in the future: `upcoming`;
- current time is at or after start but before end: `in_progress`;
- current time is at or after end: `outcome_required`.

Those derived states are not persisted. At the exact slot end, the row becomes
outcome-required. The application never guesses attendance. A counselor must
record either `completed` or `no_show`; a cancelled row remains cancelled.

Counselors still receive no table UPDATE or DELETE grant. The narrowly scoped
`public.record_consultation_outcome(uuid, text)` security-definer function:

- derives the actor from `auth.uid()`;
- requires an active, email-confirmed counselor profile;
- locks the target row;
- accepts only `completed` or `no_show`;
- requires the target to remain `scheduled`;
- requires the fixed slot to have ended in Asia/Kolkata;
- records the status, timestamp, and counselor UUID atomically.

Public and anonymous execution is revoked. Authenticated users receive EXECUTE,
but student, admin, and director calls fail the function's independent
counselor check. Expected transition failures and unexpected PostgreSQL
failures are remapped to non-sensitive SQLSTATE/message categories before the
Server Action maps them to public UI copy. The existing partial unique index
still excludes only `cancelled`, so cancellation releases a slot while
completed and no-show rows remain retained history.

PostgreSQL date values remain ISO `YYYY-MM-DD` end to end. The application
validates date-only values as calendar parts and displays them with `en-IN`;
it does not reinterpret the stored day as a browser-local timestamp.

### Legacy unscheduled rows

The new `consultation_date`, `slot_start`, and `slot_end` columns remain nullable
as a group for historical compatibility. A row with
`status = waiting_for_assignment` and all three booking values null is a legacy
request, not a live queue item. The application labels it:

> Legacy consultation request — no appointment slot was booked.

Legacy requests are displayed separately when relevant and are excluded from
Today's Sessions, Upcoming Scheduled, Awaiting Outcome, and Next Consultation.
They are never assigned, deleted, rewritten, or silently scheduled. A student
with a legacy request should create a new slot-based booking.

The deprecated `assigned_counselor_id` and `assigned_at` columns and historical
enum values remain only for compatibility with existing rows and constraints.
Current MVP application code neither reads them to decide visibility nor
provides a mutation control for them. New scheduled bookings, final outcomes,
and cancelled rows do not require a counselor assignment.

The Version 1 table deliberately excludes destination, intake, study level,
field of study, achievements, examinations, and detailed student-profile data.
Those details belong to a later, separate student-profile module.

## Detailed student profile foundation (Phase A)

The applied `202607190002_student_profile_foundation.sql` migration is
additive. It deliberately keeps
student development data separate from appointment data:

```text
auth.users.id -> public.profiles.id -> public.student_profiles.student_id
                                  |-> public.student_preferences.student_id
                                  |-> public.student_test_scores.student_id
                                  |-> public.student_achievements.student_id
                                  `-> public.consultation_requests.student_id
```

`public.profiles` remains the identity and authorization record. Academic data
is not duplicated into it. Consultation requests remain appointment snapshots;
they are not treated as the canonical student profile and are not synchronized
or backfilled by this migration.

After the detailed-profile UI exists, the detailed profile will be the current
canonical source for student-entered academic and contact information. A future
consultation form may prefill a new appointment from that profile, but editing a
profile must never rewrite an earlier consultation snapshot in either
direction.

### Tables and student-controlled data

`public.student_profiles` is one-to-one with `public.profiles`. It contains the
student's normalized roll number, personal contact details, college/course/
department, current academic position, graduation year, CGPA or an explicit
unavailable declaration, backlog counts, prior-study percentages, remarks, and
protected profile workflow timestamps. Main profile rows cannot be deleted by
browser users, avoiding accidental removal of the canonical counseling record.
Roll numbers are unique within a case-insensitively compared college name, not
globally. This permits future Kumaraguru colleges to have overlapping numbering
systems while preserving the student's chosen college display casing. The
future form should use controlled college options so aliases do not weaken this
business key.

`public.student_preferences` is also one-to-one. It reuses the existing
`public.higher_studies_interest` enum and records study level, bounded country
and program-area arrays, target intake, funding preferences, study mode,
academic preference, and the student's planning stage. Planning stage is a
student self-report; it is not an official counselor-controlled progression
state. Preference rows likewise cannot be deleted by browser users.

`public.student_test_scores` is one-to-many. It supports IELTS, TOEFL, PTE,
GRE, GMAT, GATE, and a custom `other` exam. Multiple attempts are intentionally
allowed through separate rows and an `attempt_number`. A uniqueness index
prevents reusing an attempt number for the same normalized exam identity while
allowing attempts two, three, and later. Distinct custom `other` exam names are
kept independent. Status/date checks require a completion date for completed
attempts, a planned date for booked attempts, consistent planned, completed,
and validity dates, and prohibit future completed dates in Asia/Kolkata.

`public.student_achievements` is one-to-many and supports internships,
projects, certifications, research, publications, awards, hackathons,
leadership, volunteering, work experience, and other student-reported items.
Future-dated achievements are rejected using the Asia/Kolkata business date.
Students may delete their own score and achievement rows because these are
repeatable child records.

Controlled text uses database enums where the option set has stable business
meaning. `preferred_countries` and `preferred_program_areas` remain arrays for
the MVP, but each is limited to ten trimmed, non-empty, case-insensitively
unique values while retaining the student's display casing. Stored arrays are
never null: omitted or null input is canonicalized to an empty array, meaning
that the student has not selected any values. Target intake uses the canonical
form `season-yyyy`, for example `fall-2027`, with seasons `spring`, `summer`,
`fall`, and `winter`.

### Core-profile dependency for preferences

`public.student_preferences` depends operationally on a matching
`public.student_profiles` row for the same student. Phase B1 checks this
dependency in its authenticated Server Action before inserting or updating
preferences. The follow-up migration
`202607200001_require_core_profile_for_preferences.sql` makes the database RLS
policy authoritative against direct PostgREST and other authenticated API
calls once that migration has been reviewed and applied.

Before applying the follow-up migration, run this read-only preflight query:

```sql
select
  preference.student_id
from public.student_preferences as preference
left join public.student_profiles as profile
  on profile.student_id = preference.student_id
where profile.student_id is null;
```

The query returns only owner UUIDs and no student profile details. If it returns
no rows, the dependency migration can be applied. If it returns rows, inspect
those student IDs and resolve them explicitly before proceeding. Do not delete,
rewrite, or automatically manufacture core-profile rows merely to satisfy the
preflight. The migration contains the same existence check and fails before
altering either policy when unresolved preferences-only rows remain.

After the follow-up migration is applied, student preference INSERT and UPDATE
remain limited to active, email-confirmed students operating on their own row,
and also require the corresponding core profile. Existing students still
receive no empty `student_profiles` or `student_preferences` rows merely by
visiting the profile page.

### Trusted ownership and access

Every new table references `public.profiles(id)` directly. A shared trusted
`BEFORE INSERT` trigger ignores any proposed owner and overwrites `student_id`
with `auth.uid()`. It also supplies protected creation/update timestamps and
fails closed unless the current identity is an active, email-confirmed student.
The supporting security-definer role helper uses an empty search path,
schema-qualified objects, and narrowly granted execution. Only that helper
needs security-definer authority to inspect the current caller across Auth and
profile RLS. The ownership and normalization triggers are security-invoker
functions. Browser grants omit `student_id`, workflow status, submission
timestamps, and audit timestamps.

RLS is enabled on all four tables. An active, verified student can read and
update only their own rows and can insert only rows that the trusted trigger
binds to them. Only repeatable score and achievement records have student
DELETE policies. An active, verified counselor has SELECT-only access to the
four counseling-data tables. Counselors have no INSERT, UPDATE, or DELETE
policy or grant. There is no anonymous, admin, or director policy in Phase A.

This read boundary exposes only application profile information needed for
counseling. It does not expose Auth password material, tokens, Auth metadata,
future private documents, director-only information, or counselor-private
notes. The existing `public.profiles` RLS is unchanged; therefore a future
Students directory that needs display names or institutional emails must add a
separately reviewed, minimal identity projection or policy rather than broadly
opening the identity table.

### Profile workflow and derived completion

The stored profile-status enum contains only `draft` and `submitted`.
`ready_for_counseling` is deliberately derived by the completion view instead
of being duplicated as a stored state that could disagree or become stale. In
Phase A, authenticated browser users cannot write `profile_status` or
`profile_submitted_at`; newly inserted rows remain `draft`. A future trusted
workflow must define the audited transition to `submitted`. The
student-controlled planning stage is separate from both readiness and formal
submission.

`public.student_profile_completion` is a security-invoker, security-barrier
view. It derives completion on every read, so no browser-supplied percentage can
be manipulated or become stale. Its eleven essential fields are:

- roll number;
- personal email;
- mobile number;
- college;
- course;
- department;
- graduation year;
- CGPA or the explicit CGPA-unavailable declaration;
- higher-studies interest;
- preferred study level;
- target intake.

The view returns academic and preference section flags, whether score and
achievement sections have been started, completed and total essential-field
counts, a whole-number completion percentage, and a derived
`ready_for_counseling` flag. Test scores and achievements are useful context but
are not mandatory for initial readiness. Profile completion does not restrict
consultation booking in this phase.

### Existing students and future onboarding

The migration does not alter, delete, or populate existing identities,
profiles, consultations, or bookings. An existing student with no
`student_profiles` row is in the `Profile not started` state. The student UI
begins onboarding by collecting the canonical full name and required
main-profile section in one validated, atomic RPC call, then allows preferences,
exams, and achievements to be completed progressively. No empty rows are
automatically manufactured and no Excel data is imported in Phase A.

The completion view intentionally has no row when `student_profiles` does not
exist. A student dashboard should use a zero-or-one-row query and interpret no
row as `Profile not started`. When a profile exists, it is `Submitted` when the
protected stored status is submitted, otherwise `Ready for counseling` when
derived readiness is true, and otherwise `Profile in progress`. A future
counselor directory must start from a separately reviewed counselor-safe
student identity projection and left join completion so students with no
detailed profile are not omitted.

All four detailed tables currently use `on delete cascade` from
`public.profiles`, matching the existing Auth-to-profile and consultation
ownership chain. Consequently, deleting an Auth identity can ultimately remove
its detailed profile and appointment history. Operational retention should use
account deactivation rather than Auth deletion until K-GEO has an approved
institutional retention, export, anonymization, and deletion policy. Changing
these foreign keys to `restrict` now would alter the established account-
deletion behavior and is deferred to that policy review.

The prepared indexes support deterministic, server-side filtering and
pagination for 100 or more students: academic/status filters, normalized roll
number prefix search, preference filters, GIN membership queries for country
and program arrays, and per-student score/achievement histories. The future
directory must use bounded server queries and pagination rather than loading
all student rows into the browser. Case-insensitive free-text search beyond the
normalized roll-number strategy should be justified by real query patterns
before adding an extension or more indexes.

The current Excel tracker should be treated later as an import source, not as
the schema authority. Identity columns should map through a reviewed student
identifier, academic and preference columns into the corresponding one-to-one
records, and repeated exams/achievements into child rows. Any import needs
validation, duplicate handling, an audit report, and explicit approval.

Phase A intentionally excludes date of birth, gender, religion, addresses,
Aadhaar, passport numbers, health information, authentication data, documents,
counselor notes, and internal director data. Separately reviewed future modules
may add follow-up logs, official progression, applications, consultancy
referrals and updates, secure documents, and director reporting without
overloading the student-controlled profile tables.

## Counselor student-directory foundation (Phase C0)

The prepared, unapplied
`202607200002_counselor_student_directory_foundation.sql` migration adds the
read-only database boundary needed by future counselor Students routes. It does
not create `/counselor/students`, change `/student/profile`, alter existing
tables or rows, broaden table grants, or change any existing RLS policy.

### Why an RPC boundary is required

`public.profiles` deliberately grants authenticated users table-level SELECT
but permits each caller to see only the row matching `auth.uid()` through RLS.
That is correct for the shared role guard, but it means an authorized counselor
cannot start a directory from every student identity. Starting from
`student_profiles` would also be incorrect because registered students who have
not begun onboarding have no row there.

Phase C0 therefore keeps `profiles` RLS unchanged and adds two narrowly scoped
security-definer functions. Both use an empty search path, schema-qualified
objects, and an explicit caller check against `auth.uid()`, `auth.users`, and
`public.profiles`. The caller must have a confirmed Auth email and a matching
active counselor role. Anonymous callers cannot execute the functions, while
authenticated students and other staff roles receive no rows. Neither function
accepts a role parameter.

This is narrower than a counselor-wide `profiles` SELECT policy because direct
PostgREST table reads still cannot reveal full profile rows or future columns.
A security-invoker view plus column grants was not selected because it would
still require a new cross-user profiles policy and would make every granted
column directly queryable outside the directory contract.

The completion view is marked `security_invoker`. When it is selected inside
the security-definer directory function, its underlying permission and RLS
checks use the function owner's effective database identity, not the original
browser role. The trusted migration owner therefore has sufficient access to
derive completion across student rows. This bypass is intentional and occurs
only after the function has checked `auth.uid()`, the caller's matching active
counselor profile, and the caller's confirmed Auth email. The query then starts
from `profiles` rows whose role is `student`. Directory confidentiality does
not depend on caller-side RLS, and no completion or student row is queried
before authorization succeeds. Function ownership must remain with the trusted
migration/database owner; transferring it to an untrusted role would invalidate
this reviewed boundary.

### Directory RPC contract

`public.list_counselor_student_directory(...)` starts with
`public.profiles` rows whose role is `student`, then left-joins the optional
detailed-profile, preference, and authoritative completion records. A student
with no `student_profiles` row is therefore retained and reported as profile
not started. Preference data is joined through the core profile so an
unexpected orphan preference row cannot make a not-started profile look
started.

Each returned row contains only:

- `student_id`;
- `full_name`;
- `college_email`;
- `account_created_at`;
- `is_active`;
- `roll_number`;
- `college`;
- `course`;
- `department`;
- `graduation_year`;
- `profile_state`;
- `completion_percentage`;
- `ready_for_counseling`;
- `higher_studies_interest`;
- `preferred_study_level`;
- `target_intake`;
- `last_profile_update`;
- `total_count` pagination metadata.

Inactive student identities remain in the directory for historical and
institutional continuity. `is_active` lets the future UI show an Inactive badge,
and the optional `p_is_active` filter can select active or inactive records.
Omitting the filter returns both. Account status is exposed by both counselor
RPCs, but no other additional `profiles` column is projected.

`last_profile_update` uses PostgreSQL `greatest` across the core profile,
preferences, latest test-score update, and latest achievement update.
PostgreSQL ignores null arguments to `greatest`, so a profile-only record uses
the profile timestamp; any present child can advance it; and all available
sections produce their true latest timestamp. With no core profile, the child
joins and aggregates are all null and the result remains null. Therefore
`recently_updated` does not become null merely because one optional section is
absent. Null values sort last and every ordering ends with `student_id`, making
the result deterministic.

`total_count` is calculated before the bounded page limit and repeated on each
returned row. A page beyond the final result contains no row, so the future
server component should reset to page 1 and repeat the query rather than relying
on count metadata from an empty result. Returning a separate metadata object is
unnecessary complexity for Phase C0. The handwritten type uses JavaScript
`number` for PostgreSQL `bigint`, consistent with the project database types;
the K-GEO student population is operationally far below JavaScript's safe
integer limit.

Search is normalized to trimmed lowercase text, limited to 100 characters, and
matches full name, roll number, or college email without dynamic SQL. College,
course, and department filters use trimmed, case-insensitive exact matching and
are limited to 150 characters. Graduation year retains the existing 2024-2040
constraint. Target intake must use the existing canonical `season-yyyy` form.
Active state is an optional boolean filter. Profile state, higher-studies
interest, and preferred study level use database enum parameters.

The RPC retains strongly typed enum, boolean, integer, and UUID parameters.
PostgREST may reject a malformed enum, boolean, integer, or UUID while casting
the request before the PL/pgSQL body and its exception handler run. Such an
error reveals only the public RPC type contract, not account existence or
student data. The future server component must validate these values before
calling the RPC. Accepting every value as text would weaken the static contract
and add internal casts solely to standardize developer-facing input errors, so
that additional complexity is not justified for Phase C0.

Supported sort values are:

- `name_asc`;
- `recently_registered`;
- `recently_updated`;
- `completion_low_to_high`;
- `completion_high_to_low`;
- `graduation_year`.

Every sort ends with `student_id` ascending as a deterministic tie-breaker.
The default page size is 25, the maximum page size is 100, and page numbers are
bounded from 1 through 100000. Invalid filter, sort, or pagination values fail
with a generic parameter error. The query never constructs dynamic SQL or
loads all matching students into the browser.

At the expected initial scale of roughly 100 students, the normalized
`strpos(lower(...))` search and existing relational filter indexes are
appropriate. No new search extension or index is added. A measured increase in
directory latency or a substantially larger population should trigger
`EXPLAIN (ANALYZE, BUFFERS)` review; only then should a separately reviewed
`pg_trgm` index or another search strategy be considered.

The directory presentation state is a dedicated enum derived as follows:

- no `student_profiles` row: `profile_not_started`;
- a profile row that is neither submitted nor ready:
  `profile_in_progress`;
- completion-view readiness with stored draft status:
  `ready_for_counseling`;
- stored submitted status: `submitted`.

The existing `public.student_profile_completion` view remains authoritative
for completion percentage and readiness; Phase C0 does not copy its eleven-
field formula.

### Student 360 identity and consultation linking

`public.get_counselor_student_identity(p_student_id)` accepts one UUID and
returns only `student_id`, `full_name`, `college_email`, and
`account_created_at`, plus `is_active` for the same account-status badge. It
returns no row for a null or unknown UUID or any non-student profile, making
those cases indistinguishable to the caller. After obtaining a safe student
UUID, the future counselor detail page can read that student's
`student_profiles`, `student_preferences`, `student_test_scores`,
`student_achievements`, and completion view through their existing counselor
SELECT policies. Those policies remain read-only.

All four detailed-table counselor SELECT policies already call
`public.has_active_verified_kgeo_role('counselor')`. That helper requires the
caller to have a counselor profile, `is_active = true`, and a non-null
`auth.users.email_confirmed_at`, so no follow-up Student 360 policy migration is
needed. The prepared canonical-name and consultation-outcome migration also
replaces the older consultation counselor SELECT policy with this helper,
closing the direct-API email-verification gap while preserving read-only
access.

`consultation_requests` already stores the trusted `student_id`, although the
current counselor schedule query does not select it. A later UI phase can link
an authorized booking to
`/counselor/students/<consultation.student_id>`. Consultation names, contact
details, course information, and interest remain historical appointment
snapshots; they are not synchronized into or from the current detailed
profile.

### Directory privacy and future profile evolution

Directory results exclude personal email, mobile number, CGPA, prior-study
percentages, backlogs, academic remarks, country/program arrays, test details,
achievement details, counselor notes, applications, and documents. The RPCs
return no Auth metadata, provider data, password material, confirmation data,
or staff identities. Detailed student fields remain available only through the
existing authorized read policies for a future Student 360 server route.

Stable searchable and reportable profile data remains relational. Display
labels, option presentation, and section ordering remain configurable in
application code. A genuinely new reportable field requires a reviewed
migration. Future optional K-GEO questions may use versioned question-
definition and response tables, but the relational profile must not be
replaced by an untyped JSON blob. Counselor notes and official progression
remain separate from student-submitted information. Phase C0 creates none of
those future tables.

## Counselor private notes and follow-ups (Phase D1)

The prepared, unapplied
`202607250001_counselor_notes_and_follow_ups_foundation.sql` migration keeps
internal counselor work in two dedicated relational tables:

- `public.counselor_student_notes` stores one counselor-owned private note,
  optional consultation link, pinned state, and trusted timestamps;
- `public.counselor_follow_ups` stores one counselor-owned due date, priority,
  next action, optional details and consultation link, final status audit, and
  trusted timestamps.

These tables are deliberately separate from student-submitted profiles,
preferences, exams, achievements, consultation bookings, and any future
official application or consultancy progression. No D1 record is
student-visible, and neither table contains a student-facing message or
notification state.

### Ownership, targets, and retention

The browser supplies the protected Student 360 student UUID, but the application
first resolves it through `public.get_counselor_student_identity(uuid)`. The
database independently confirms that every inserted `student_id` belongs to a
student profile. A shared security-definer trigger derives `counselor_id` from
`auth.uid()`, requires the caller to be an active email-confirmed counselor,
and overwrites creation/update timestamps. No D1 form accepts a counselor UUID,
role, completion audit value, or timestamp.

An optional `consultation_id` is stored as a UUID and must identify a
consultation whose trusted `student_id` matches the D1 record. The application
rechecks this relationship before mutation, and the database trigger is the
authoritative defense against direct PostgREST calls. Counselor-visible
request numbers are loaded in one deduplicated bounded call to
`public.get_counselor_consultation_references(uuid[])`; D1 queries never select
`request_number` directly.

The student and counselor profile foreign keys use `on delete restrict`, so an
Auth/profile deletion cannot silently remove counselor-private institutional
history. Operational account removal should remain deactivation. Optional
consultation links use `on delete set null`, preserving the note or follow-up
if a separately authorized process ever removes a consultation. This differs
intentionally from the older profile-owned cascade model and should be
considered in the eventual institution-wide retention policy.

### RLS and grants

RLS is enabled on both D1 tables. The only table policies are for the active,
verified counselor whose `auth.uid()` equals the row's trusted
`counselor_id`. Students, anonymous callers, admins, directors, inactive
counselors, unverified counselors, and other counselors receive no rows and
cannot mutate records.

Authenticated table privileges remain column-limited:

- notes allow SELECT, INSERT of student/link/text/pinned values, UPDATE of only
  link/text/pinned values, and DELETE subject to own-counselor RLS;
- follow-ups allow SELECT, INSERT of student/link/due/priority/action/details,
  and UPDATE of only link/due/priority/action/details while the owned row is
  pending;
- follow-ups have no DELETE grant or policy;
- ownership, status, completion audit, and all timestamps are not directly
  writable.

Both students and counselors connect as PostgreSQL role `authenticated`, so
column grants are not sufficient on their own. The own-counselor RLS policies
are the row boundary, and the trigger/RPC repeat authorization as trusted
mutation boundaries.

### Follow-up lifecycle and finalization

Stored priority values are `low`, `normal`, and `high`. Stored status values
are only `pending`, `completed`, and `cancelled`. Due today and overdue are
presentation states derived from the Asia/Kolkata business date:

- pending with `due_date` before today: Overdue;
- pending with `due_date` equal to today: Due today;
- pending with a later due date: Upcoming;
- completed and cancelled use their stored final labels.

Nothing automatically completes a follow-up. The narrowly scoped
`public.record_counselor_follow_up_status(uuid, text)` function accepts only
`completed` or `cancelled`, derives the counselor from `auth.uid()`, repeats
active/verified counselor authorization, locks the owned row, and permits only
the first transition from `pending`. Completion atomically records
`completed_at` and `completed_by`; cancellation leaves both null. Completed and
cancelled rows cannot transition again. Public and anonymous execution is
revoked, and authenticated execution still fails for every non-counselor role.

Notes are bounded to 5,000 normalized characters. Follow-up next actions are
bounded to 500 normalized characters and optional details to 2,000. The two
Student 360 sections load 20 rows per page. The query pattern is one trusted
identity RPC, the existing parallel profile queries, one bounded notes query,
one bounded follow-up query, one bounded consultation-choice query, and one
deduplicated reference RPC for at most 100 visible consultation UUIDs. This is
appropriate for the current one-counselor population. Material growth or
measured latency should trigger `EXPLAIN (ANALYZE, BUFFERS)` review before
adding more indexes.

The safe rollout order is:

1. Review the D1 migration.
2. Apply it manually after all earlier migrations.
3. Run the read-only structural verification and require every check to pass.
4. Deploy or restart the D1 application.
5. Test counselor ownership, inactive/unverified denial, and cross-counselor
   denial.
6. Test direct student PostgREST reads and mutations return no D1 data.
7. Test note CRUD, note pinning, follow-up editing, and locked final
   transitions.
8. Commit and push only after the live checks pass.

The application preserves the existing six Student 360 sections and reports
each missing/unavailable D1 table separately, but production should still
apply and verify the migration before deploying D1 controls.

## Counselor follow-up workload database foundation (Phase D2)

The applied and live-verified
`202607250002_counselor_follow_up_workload.sql` migration adds one read-only
`public.list_counselor_follow_up_workload(text, text, text, date, date,
integer, integer)` function. It does not change D1 tables, records, RLS,
grants, ownership triggers, status transitions, or indexes.

The function derives the caller from `auth.uid()`, requires the matching
active and email-confirmed counselor profile, and filters every workload row
with `counselor_id = auth.uid()`. Student, admin, director, inactive,
unverified, and anonymous identities cannot use the projection. It is a
security-definer function with an empty search path, a trusted `postgres`
owner, no dynamic SQL, and authenticated-only execution.

The result contains the follow-up UUID, student UUID, optional consultation
UUID, due date, priority, stored status, next action, completion timestamp,
creation/update timestamps, canonical full name, college email, optional roll
number, filtered total, and six global counselor workload metrics. It omits
follow-up details, private notes, request numbers, personal contact details,
academic data, preferences, Auth metadata, and staff identity data.
Consultation references remain resolvable later through the existing bounded
counselor-only reference RPC.

One RPC remains sufficient because it always returns at least one relational
row. When the requested filtered page has no records, it returns a metrics-only
row: all record and identity columns are null while `total_count` and the six
metrics remain populated.
This also supports out-of-range application canonicalization without losing
metric availability. No JSON payload or second metrics RPC is needed.

The six metric counts always describe the counselor's complete owned workload
and intentionally ignore lifecycle, priority, search, due-date, and page
filters. `total_count` describes the filtered list. Overdue, due today, and
upcoming are derived from the Asia/Kolkata business date; completed,
cancelled, and total pending use their stored states.

Search is normalized and evaluated in PostgreSQL against only canonical full
name, college email, and roll number before pagination. Students without a
detailed profile remain present with a null roll number. A missing canonical
name remains null so the application can render its standard safe fallback;
the row remains searchable by college email and roll number.

Operational ordering and pagination are also performed in PostgreSQL. The
order is overdue, due today, upcoming, completed, then cancelled. Pending
groups sort high, normal, low, then earliest due date and UUID. Completed rows
sort by completion/update timestamps descending; cancelled rows sort by
update timestamp descending. UUID is always the stable final key. The RPC
limits page size to 25 and page number to 100,000 before applying deterministic
`LIMIT` and `OFFSET`.

The counselor application route `/counselor/follow-ups` consumes this RPC
through a server-only, independently authorized loader. It validates the
complete relational response before rendering any record, resolves linked
consultation references through at most one existing bounded RPC call, and
does not cache counselor-private workload data across sessions. Offset
pagination is acceptable at the current scale because the RPC limits each
page to 25 rows and uses deterministic ordering. Reassess pagination strategy
only if measured production volume or latency warrants it.

The existing `(counselor_id, status, due_date, id)` follow-up index supports
the primary owner/status/date scan. No extension or new index is justified at
the current one-counselor scale. Run `EXPLAIN (ANALYZE, BUFFERS)` against
representative lifecycle, identity-search, and final-state queries if row
counts or measured latency grow before adding an index.

The safe rollout order is:

1. Review the new migration and its SHA-256.
2. Apply it manually after the D1 migration.
3. Run the read-only readiness verification and require every D2 check to
   report `passed = true`.
4. Test authenticated counselor execution and student/admin/director,
   inactive/unverified counselor, and anonymous denial.
5. Test empty, filtered-empty, out-of-range, and populated pages.
6. Deploy the reviewed D2 application route and complete the authenticated
   browser checklist.

## Official counseling progression (Phase D3.1)

The applied
`202607250003_official_counseling_progression.sql` migration introduces the
institution-controlled record of where a student stands in the K-GEO
counseling journey. It is intentionally separate from the student's
self-reported `student_preferences.student_planning_stage`, counselor-private
notes and follow-ups, consultation status, exams, achievements, and future
application or consultancy tracking. Private counselor text is never copied
into official progression history.

The stage enum is `public.counseling_progression_stage`:

- `profile_review`;
- `initial_counseling`;
- `goals_confirmed`;
- `country_exploration`;
- `program_shortlisting`;
- `university_shortlisting`;
- `test_preparation`;
- `document_preparation`;
- `application_ready`;
- `application_in_progress`;
- `offer_evaluation`;
- `visa_preparation`;
- `pre_departure`.

The independent `public.counseling_progression_state` enum contains `active`,
`on_hold`, and `completed`. Completed is a final workflow state rather than a
journey stage, so the last meaningful stage remains available for reporting.
Application- and university-specific statuses remain a future, separately
reviewed module.

### Current row, history, and institutional ownership

`public.student_counseling_progressions` has the student UUID as its primary
key, guaranteeing one current row per student. It records the current stage
and state, when that stage started, the last change time and counselor, and
trusted creation/update timestamps. It is institution-owned rather than
counselor-owned: any active, verified counselor can manage it, which permits
counselor handover without transferring or rewriting history.

`public.student_counseling_progression_events` is append-only for application
roles: authenticated callers receive no direct mutation privilege or policy,
and the trusted RPC only inserts events. Its first event has null previous
stage/state; each later event records previous and new stage/state, the
counselor derived from `auth.uid()`, the shared database change timestamp, and
an optional normalized operational reason of at most 500 characters. That
reason is not a private counseling note. D3.4.1 replaces the original lifetime
initialization index with correction-aware enforcement inside the trusted
per-student mutation boundary. A student may have multiple retained
initialization events only when every earlier initialization has an audited
`reset_initialization` correction.

The event `student_id` foreign key points directly to `public.profiles(id)`
with `ON DELETE RESTRICT`; D3.4.1 moved it away from the disposable current
projection so an audited reset can remove only that projection while retaining
history. Both student and counselor profile foreign keys use
`ON DELETE RESTRICT`.
Institutional history therefore cannot disappear through account deletion.
Operational removal remains account deactivation until K-GEO approves a
formal retention and deletion process. A future privileged role-change process
must account for retained target and actor references: changing a profile role
does not rewrite the role the person held when an event was recorded.

### Trusted transition contract

`public.record_student_counseling_progression(uuid, text, text, text)` is the
only authenticated mutation path. It derives the caller from `auth.uid()`,
requires an active email-confirmed counselor, validates that the target profile
has role `student`, validates text before enum casts, and accepts no counselor
UUID or audit timestamp. Its named arguments are `p_student_id`, `p_stage`,
`p_state`, and optional `p_change_reason`; it returns only the eight current-row
fields and no history reason or cross-student data.

Initialization must start in state `active`, at any valid stage. K-GEO does not
enforce a rigid adjacent-stage graph because legitimate counseling can skip or
revisit stages. After initialization, one successful RPC call changes either
the stage or the workflow state, never both. Active progression may change
stage while remaining active, pause without changing stage, or complete
without changing stage. On-hold progression may resume or complete without
changing stage; it must resume in one successful operation before a later
stage-change operation. Completed progression is final in D3.

No-op changes are rejected. Stage-only changes reset `stage_started_at`;
state-only changes preserve it. One transaction-scoped, nonblocking advisory
lock per student makes the first concurrent writer win, and an existing row is
also locked `FOR UPDATE`. The advisory key is a stable 64-bit hash of the
student UUID plus a D3.1 namespace seed; a hash collision could cause a safe
false concurrency rejection but cannot mix or corrupt student rows. The same
function call changes or creates the current row and inserts exactly one event
using one `statement_timestamp()`. A failure rolls back both writes, so current
and history cannot be partially saved and their actor and timestamp values
remain identical. If the database clock yields a timestamp no later than that
student's prior change, the RPC advances it by one microsecond so per-student
event ordering remains unambiguous.

### RLS, grants, and read boundary

RLS is enabled on both progression tables. Their only policies are
institution-wide SELECT policies for an active, verified counselor through
`public.has_active_verified_kgeo_role('counselor')`. Students cannot read
official progression in D3. Anonymous callers, admins, directors, inactive
counselors, unverified counselors, and missing counselor profiles also receive
no rows.

Authenticated users have SELECT only on the approved progression columns.
Neither table grants direct INSERT, UPDATE, or DELETE, and neither has a
mutation policy. Public and anonymous RPC execution is revoked; authenticated
execution still passes through the RPC's independent counselor authorization.
This makes the database authoritative against direct PostgREST calls.

The current-state/stage/recent-change index and per-student newest-first event
index cover the planned D3 access patterns at approximately 100 students.
Actor-centric indexes are intentionally deferred. Run
`EXPLAIN (ANALYZE, BUFFERS)` on representative production queries before
adding more.

The safe rollout order is:

1. Review the D3.1 migration and verify its SHA-256.
2. Confirm all earlier migrations through D2 are applied.
3. Apply only the new D3.1 migration.
4. Run `supabase/verification/pre_phase_c2_readiness.sql` and require every
   structural check to report `passed = true`.
5. Test authenticated counselor initialization and transition calls.
6. Test anonymous, student, admin, director, inactive counselor, unverified
   counselor, missing-profile, unknown-student, and staff-target denial.
7. Verify the current row and exactly one matching history event after each
   successful call, including concurrent-call behavior.
8. Begin D3.2 application UI only after those checks pass.

### Counselor Student 360 application behavior (Phase D3.2)

The existing counselor-only route
`/counselor/students/[student-id]#official-progression` now presents the
institution-managed current row and append-only event history. The page,
focused server loader, and mutation Server Action independently require an
active, verified counselor. The existing trusted counselor student-identity
projection confirms the target before loading or changing progression.
Students, admins, directors, and anonymous callers have no progression UI or
query path.

The UI keeps Official Counseling Progression visibly separate from the
student-reported planning stage. Stage describes the current institutional
journey step; workflow state describes whether that journey is active, on
hold, or completed. A counselor can initialize at any stage, change stage
while active, pause, resume, or complete. Each submission performs exactly
one transition. A paused journey must be resumed before its stage can change,
and a completed journey is final with no reopen control.

The displayed percentage is derived in application code and is not stored or
accepted by the RPC. No progression displays 0%; completed displays 100%;
active and on-hold rows use the current-stage mapping: profile review 3%,
initial counseling 5%, goals confirmed 7%, country exploration 8%, program
shortlisting 9%, university shortlisting 10%, test preparation 15%, document
preparation 20%, application ready 30%, application in progress 40%, offer
evaluation 50%, visa preparation 75%, and pre-departure 85%. On hold therefore
retains its stage percentage. This is an approximate operational indicator,
not an academic score or a guarantee of admission or visa approval.

History remains counselor-visible and append-only. The application selects
only the approved event fields, validates the transition chain, and renders
optional reasons without exposing actor UUIDs. It loads 20 newest-first
events per page with an exact count and one bounded database query. Offset
pagination is appropriate at the current scale; revisit the index and
pagination strategy only after measured production growth.

University applications, offers, scholarships, deposits, and visa tracking
remain separate future modules. The spreadsheet phrase “Study Abroad Plan
Dropped” is not implemented because D3.1 has no `withdrawn` state.

### Official progression evidence database and Storage foundation (Phase D3.3.1)

Migration
`supabase/migrations/202607260001_progression_evidence_foundation.sql`
prepares private institutional evidence for exact official progression events.
One `student_counseling_progression_events` row may have up to five active
evidence records. The evidence table deliberately does not duplicate
`student_id`; the trusted relationship is:

`student_counseling_progression_evidence.progression_event_id`
-> `student_counseling_progression_events.id`
-> `student_counseling_progression_events.student_id`.

Evidence has three database-controlled lifecycle states: `pending`,
`available`, and `removed`. A pending record is a two-hour upload reservation.
An available record has been finalized only after the exact bucket and
generated object path were found in `storage.objects`. Removed is final for
this MVP and retains the original event link, filename, MIME type, byte size,
uploader, preparation time, availability time, removal actor, removal time,
and normalized removal reason.

Only active, email-confirmed counselors can use this foundation. Any such
counselor may read the institutional evidence metadata and remove available
evidence. Only the counselor who prepared an unexpired pending row may upload
to that exact path and finalize it. Students, admins, directors, anonymous
users, and public callers receive no evidence table or Storage access. There
are no direct authenticated table mutations and no Storage UPDATE/upsert
policy.

The bucket is not created by SQL. Before applying the migration, manually
create a Supabase Storage bucket with this exact contract:

- ID: `counseling-progression-evidence`
- public: `false`
- file size limit: `10485760` bytes (10 MiB)
- allowed MIME types: `application/pdf`,
  `application/vnd.openxmlformats-officedocument.wordprocessingml.document`,
  `image/jpeg`, `image/png`, and `image/webp`

Accepted extensions are `.pdf`, `.docx`, `.jpg`, `.jpeg`, `.png`, and
`.webp`, paired with the corresponding MIME type. The database rejects blank
or unsafe display filenames, path separators, control characters, traversal
names, unsupported or mismatched extensions, zero-byte declarations, and
sizes over 10 MiB. Original filenames are display metadata only. PostgreSQL
generates the object path as:

`<trusted-student-uuid>/<trusted-event-uuid>/<evidence-uuid>.<extension>`

No name, email, roll number, counselor name, stage, reason, timestamp, or
original filename enters the object path. The bucket must remain private and
must never be served with a permanent public URL.

The D3.3.1 lifecycle has four steps and uses three trusted RPCs:

1. `prepare_student_counseling_progression_evidence_upload` derives the
   counselor, validates the event and student-role target, validates file
   metadata, locks the event, enforces five active reservations, creates one
   pending metadata row, and returns only the generated upload intent.
2. A later D3.3.2 Server Action may use the authenticated counselor Storage
   client to call `createSignedUploadUrl`; the browser may then call
   `uploadToSignedUrl` with upsert disabled. Signed upload credentials must
   never be logged, persisted, placed in analytics, or stored in PostgreSQL.
3. `finalize_student_counseling_progression_evidence_upload` locks the
   pending row, requires its original counselor and unexpired intent, verifies
   the exact Storage object exists, and changes metadata to `available`.
4. `remove_student_counseling_progression_evidence` locks an available row,
   records a required reason and server-derived audit fields, and changes it
   permanently to `removed`.

The maximum-five calculation includes available rows and unexpired pending
rows. Removed rows and expired pending rows do not consume a slot. A
transaction-scoped advisory lock is acquired before counting, so concurrent
preparations for one event cannot both pass the limit.

`storage.objects` is a Supabase-managed relation. The SQL Editor role used for
the public-schema migration does not necessarily own it and therefore cannot
reliably create policies on it. The migration contains no policy, ownership,
grant, revoke, alter, or mutation statement against `storage.objects`.
Do not change its ownership and do not use `SET ROLE`. After the migration
succeeds, create the following two policies through the Supabase Dashboard
Storage policy editor.

For the upload policy, configure:

- policy name: `progression_evidence_object_insert_counselor`
- operation: `INSERT`
- target role: `authenticated`
- `WITH CHECK` predicate:

```sql
storage.objects.bucket_id = 'counseling-progression-evidence'
and (
  select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  )
)
and exists (
  select 1
  from public.student_counseling_progression_evidence as evidence
  where evidence.bucket_id = storage.objects.bucket_id
    and evidence.storage_path = storage.objects.name
    and evidence.status =
      'pending'::public.counseling_progression_evidence_status
    and evidence.uploaded_by = (select auth.uid())
    and evidence.upload_expires_at > pg_catalog.statement_timestamp()
)
```

This authorizes only the exact generated object name for the current
counselor's unexpired pending metadata row. Do not enable overwrite or upsert.

Phase A1.4.2B deliberately leaves that historical `WITH CHECK` unchanged. Its
Primary Counselor boundary is enforced at the trusted reservation layer: the
evidence table has no authenticated mutation grant, and its sole preparation
RPC inserts through a trusted row trigger that resolves the Student from the
progression event and requires the caller to be that Student's active, verified
Primary Counselor. A direct Storage upload by another Counselor cannot satisfy
the policy because that caller cannot manufacture the required matching,
unexpired pending row with themselves as `uploaded_by`.

For the viewing policy, configure:

- policy name: `progression_evidence_object_select_counselor`
- operation: `SELECT`
- target role: `authenticated`
- `USING` predicate:

```sql
storage.objects.bucket_id = 'counseling-progression-evidence'
and (
  select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  )
)
and exists (
  select 1
  from public.student_counseling_progression_evidence as evidence
  where evidence.bucket_id = storage.objects.bucket_id
    and evidence.storage_path = storage.objects.name
    and evidence.status =
      'available'::public.counseling_progression_evidence_status
)
```

Pending and removed evidence therefore has no Storage SELECT path. Do not
create an UPDATE, DELETE, public, anonymous, student, admin, or director
policy.

There is deliberately no Storage DELETE policy in D3.3.1. With the installed
Supabase Storage client, `remove()` requires both `SELECT` and `DELETE` on
`storage.objects`. Giving removed objects SELECT access would conflict with
the requirement that soft-removed evidence immediately becomes unavailable.
Physical object purge is therefore a later, separately reviewed privileged
retention operation. SQL never inserts, updates, or deletes
`storage.objects`, and it never creates or changes `storage.buckets`.

Database metadata and Storage bytes cannot be committed atomically across one
transaction. A failed upload can leave an expired pending metadata row; an
uploaded object can exist before finalization; and a soft-removed record can
retain its physical object until the retention process purges it. The
readiness script reports aggregate counts for these conditions without
returning filenames, paths, people, event IDs, or reasons. Do not
automatically delete or rewrite them. Review and implement cleanup only as a
separate retention procedure.

D3.3.1 makes no malware-scanning or document-content-safety claim. The
extension, MIME declaration, size boundary, and private bucket are necessary
controls but do not verify file contents. Future content scanning must be a
separate, explicit design before broader sharing. Student-visible evidence,
applications, offers, scholarships, deposits, and visa records remain out of
scope.

The later viewing contract is server-controlled: require an active verified
counselor, resolve an available evidence UUID to its trusted metadata, and
create a five-minute signed view URL for the exact private path. Never store
that URL or expose a public URL. D3.3.1 contains no evidence UI, Server Action,
upload, signed-view generation, or file transfer.

The corrected controlled rollout order is:

1. Confirm the private bucket exists, is private, has the exact 10 MiB limit,
   and has the exact approved MIME list.
2. Apply only the corrected public-schema D3.3.1 migration.
3. Create `progression_evidence_object_insert_counselor` through the Supabase
   Dashboard Storage policy editor using the exact INSERT configuration above.
4. Create `progression_evidence_object_select_counselor` through the Supabase
   Dashboard Storage policy editor using the exact SELECT configuration above.
5. Run `supabase/verification/pre_phase_c2_readiness.sql`.
6. Require all database, bucket, and Storage-policy checks to report
   `passed = true`.
7. Begin live prepare, signed-upload, finalize, counselor-view, denial,
   soft-removal, five-file-limit, and concurrency testing.

The public-schema foundation checks can pass immediately after step 2. The
two Storage-policy checks must remain failed until steps 3 and 4 are complete.
Full D3.3.1 readiness requires both stages; do not weaken or skip those
checks. Begin D3.3.2 only after the complete readiness and live tests pass.

### Progression evidence counselor workflow (Phase D3.3.2)

The Counselor Student 360 route now presents event-level evidence inside each
visible official progression history event. Evidence remains counselor-only:
students, anonymous users, admins, and directors receive no D3.3.2 evidence
query, route, or UI. Every loader, Server Action, and signed-view request
independently requires an active verified counselor and revalidates the trusted
student/event relationship before operating.

One progression history page contains at most twenty events. After those
events are validated, the server performs zero or one bounded metadata query
for `available` evidence and groups at most five files per event (one hundred
rows per page). Pending and removed metadata is not included in the normal UI.
An evidence-query or validation failure is isolated to the affected evidence
subsection as “Supporting evidence is temporarily unavailable”; valid official
progression history remains visible.

Supported uploads are PDF, DOCX, JPG/JPEG, PNG, and WebP, from 1 byte through
10 MiB. Each progression event may have at most five available or unexpired
pending reservations. Browser validation provides immediate feedback, but the
trusted preparation RPC and private bucket remain authoritative. K-GEO does
not claim malware scanning or file-content inspection.

File bytes use a direct signed upload and never pass through a Next.js Server
Action. The server validates metadata and the trusted event, calls the
preparation RPC, and creates a non-upsert signed upload for the database-
generated UUID-only path. The browser keeps the temporary path and token only
in component memory, uploads the unchanged selected file with
`uploadToSignedUrl`, clears the temporary upload data, and finalizes by evidence
UUID. An unsuccessful pending reservation expires under the existing two-hour
upload-intent design; no cancellation RPC is claimed.

Only finalized `available` evidence appears. View requests use an application
route containing only the evidence UUID. After counselor, status, event, and
student verification, the route creates a five-minute signed URL and returns a
non-cacheable temporary redirect. Signed URLs are neither pre-rendered nor
persisted. Soft removal prevents future signed URLs but does not instantly
revoke a URL already issued; that URL can remain usable until its five-minute
expiry.

Removal requires a normalized audit reason of at most 500 characters and calls
only the trusted soft-removal RPC. It hides the item from the available list
and retains its metadata audit. The workflow does not physically delete the
Storage object, expose a restore control, or introduce a Storage DELETE policy.
Physical retention cleanup remains a future privileged process.

There is no student access to evidence and no relationship to applications,
offers, scholarships, deposits, visa tracking, or future consultancy
allocation in D3.3.2.

### Audited official progression corrections (Phase D3.4.1)

Migration
`supabase/migrations/202607260002_progression_correction_foundation.sql`
adds the database foundation for correcting an erroneous latest official
progression event. It does not add an Undo button, reset form, Client
Component, or browser mutation path. D3.4.2 remains a separately reviewed
future UI phase.

A normal progression transition and an audited correction are different
operations. `record_student_counseling_progression` appends a new effective
event representing an intentional forward transition. The correction RPC
reverses only the newest event that has no correction row, preserves that
original event, and appends a permanent record to
`student_counseling_progression_event_corrections`. It cannot delete or edit a
middle-history event while a later effective event remains.

The correction enum has exactly `undo_transition` and
`reset_initialization`. Every correction records the immutable target event,
server-derived counselor, normalized required reason of at most 500
characters, database correction time, and the trusted restored stage, state,
and stage-start time where applicable. One event can be corrected only once.
Application roles have no INSERT, UPDATE, DELETE, or TRUNCATE privilege on the
correction table.

For a non-initial event, the trusted RPC restores the target event's previous
stage and state. A state-only correction preserves the current
`stage_started_at`. A stage-change correction derives the previous stage start
from the newest earlier effective initialization or stage-changing event that
introduced that stage. Corrected events are excluded from this derivation, and
an unprovable stage start fails closed.

An initialization correction is a `reset_initialization`. It inserts the
audit row and deletes only the current
`student_counseling_progressions` projection, returning the student to Yet to
begin. The initialization event, all other events, all correction rows, and
all evidence audit metadata remain. D3.4.1 repoints event ownership to the
durable student profile so this projection deletion cannot remove or orphan
history. The replacement normal progression RPC permits a fresh
initialization only after every historical initialization has a matching reset
correction and no other effective event remains.

Completed remains final in the normal progression RPC. D3.4.1 introduces no
general reopen operation. It permits only a reasoned, audited correction when
the completion event is the latest effective event, restoring that event's
previous `active` or `on_hold` state.

Correction is blocked while the target event has available evidence or an
unexpired pending upload reservation. Removed evidence and expired pending
reservations do not block. The RPC acquires the existing D3.1 student lock,
then the existing D3.3 event/evidence lock, then locks the current projection
`FOR UPDATE`. This fixed ordering serializes normal transitions, evidence
preparation, and correction without introducing a reverse lock order.
Correction never changes evidence rows and never deletes Storage objects.

Institutional ownership applies: any active, email-confirmed counselor may
read correction audits and invoke the trusted correction RPC. Identity comes
from `auth.uid()`; the browser cannot supply counselor identity, restored
values, or timestamps. Students, anonymous users, admins, and directors have
no correction policy or runtime path. Correction reasons remain
counselor-only.

The effective current state is derived from uncorrected events rather than the
physically newest event. Corrected events remain in physical history but do not
determine current stage/state. The current row can be absent while retained
history exists after an initialization reset. A later fresh initialization
creates a new effective segment without rewriting the corrected segment.

The correction-aware server read model preserves D3.2 behavior for existing
students. For each visible page of at most twenty events, it makes zero
correction calls when the page is empty or one bounded counselor-only RPC
otherwise. The RPC validates every event ID against the trusted student,
returns correction rows for those exact events, and independently reports the
latest effective event. Server validation rejects malformed, duplicate,
cross-event, or restoration-inconsistent rows. No correction control or
corrected-event presentation is introduced before D3.4.2.

During the application-first rollout window, a correction-context read failure
may preserve only history that passes the strict pre-D3.4.1 uncorrected-history
validator. The progression remains visible, but correction controls are
unavailable. Corrected or reset histories cannot pass that fallback, so the
compatibility path must not be used as a substitute for applying D3.4.1.

The controlled rollout order is:

1. Review the D3.4.1 migration and correction-aware server changes together.
2. Confirm every earlier migration hash.
3. Recalculate and record the D3.4.1 migration SHA-256.
4. Deploy the correction-aware server read model first or in the same release.
5. Apply only D3.4.1.
6. Run the complete read-only readiness verification and require every
   structural row to pass.
7. Confirm existing uncorrected Student 360 pages still render identically.
8. Test one controlled latest-event correction with an active counselor.
9. Confirm corrected history does not make Student 360 unavailable.
10. Test sequential correction, completed correction, evidence blocking,
    initialization reset, fresh initialization, and concurrent first-writer
    behavior.
11. Verify events, correction audits, and evidence records remain retained.
12. Begin D3.4.2 only after all live checks pass.

Do not invoke the correction RPC in production before the correction-aware
server read model is deployed. There is no hard-delete correction workflow and
no physical evidence deletion in D3.4.1. Additional correction indexes should
be justified with `EXPLAIN (ANALYZE, BUFFERS)` rather than added speculatively.

## Counselor progression correction UI (Phase D3.4.2)

The Counselor Student 360 progression history offers a correction control only
on the latest effective, uncorrected event. A normal transition is presented as
**Undo latest update**; the sole effective initialization is presented as
**Reset official progression**. The counselor must confirm the action in a
modal and enter a normalized reason of 1–500 characters. The browser supplies
only the trusted student projection identifier, target event identifier, and
reason. The Server Action authorizes the counselor independently, revalidates
the student/event relationship, and invokes the D3.4.1 correction RPC. The RPC
remains the final authority for latest-event, concurrency, role, and evidence
rules.

Corrections proceed one effective event at a time; counselors cannot select or
remove an arbitrary middle event. This includes a latest completion event,
which can be reversed only through the audited correction RPC to its trusted
previous state. The normal progression action still has no generic reopen
operation.

Available evidence and unexpired pending upload reservations proactively hide
the correction action and explain that evidence must be removed or allowed to
expire. Removed evidence and expired pending reservations do not block the UI.
The page uses one bounded available-evidence read and one bounded pending-
reservation read for the visible progression page; it does not query evidence
per event.

Corrected events remain visible with their centralized correction label,
reason, and corrected timestamp. Counselor identifiers, correction UUIDs, and
database errors are not rendered. If correction metadata cannot be validated,
strict uncorrected history may remain visible with a localized unavailable
message while all correction controls fail closed. A reset removes only the
current projection through the reviewed RPC: the page returns to **Yet to
begin** at 0%, retains the audited history, and permits the normal initialization
flow. No D3.4.2 application path hard-deletes events, corrections, or evidence.
It also never deletes Storage objects. Students have no correction UI or access
to counselor-only correction reasons.

## University application tracking foundation (Phase E1.1)

Migration
`supabase/migrations/202607270001_university_application_foundation.sql`
creates the database-only foundation for institutionally tracking zero or many
university applications for one durable student profile. E1.1 contains no
application page, Client Component, Server Action, file upload, notification,
admin report, or director report.

University application status and overall official counseling progression are
independent domains. Creating or changing an application never calls
`record_student_counseling_progression` and never writes a progression current
row, event, correction, or evidence record. Future automation between the two
domains requires a separate reviewed migration and application phase.

The exact application statuses are:

- `planning`: the application is being considered but active preparation has
  not started;
- `documents_collecting`: academic and supporting documents are being
  collected;
- `application_preparing`: the form and submission materials are being
  prepared;
- `ready_to_submit`: institutional review is complete and the application is
  ready for final submission;
- `submitted`: the application has been submitted;
- `under_university_review`: the university is reviewing it;
- `additional_information_requested`: the university requested more
  information or documents;
- `decision_received`: the university issued a decision, without representing
  an offer outcome;
- `withdrawn`: the application was withdrawn;
- `closed`: the institutional record is closed.

`withdrawn` and `closed` are terminal. The trusted transition graph is:

```text
planning
  -> documents_collecting | application_preparing | withdrawn | closed
documents_collecting
  -> application_preparing | ready_to_submit | withdrawn | closed
application_preparing
  -> documents_collecting | ready_to_submit | withdrawn | closed
ready_to_submit
  -> submitted | withdrawn | closed
submitted
  -> under_university_review
   | additional_information_requested
   | decision_received
   | withdrawn
   | closed
under_university_review
  -> additional_information_requested | decision_received | withdrawn | closed
additional_information_requested
  -> under_university_review | decision_received | withdrawn | closed
decision_received
  -> withdrawn | closed
```

There is no generic reopen operation. Status changes require a normalized
institutional reason of 1–500 characters. `submitted_at` is null at creation
and is set from database time on the first transition to `submitted`.
Post-submission transitions preserve it. A pre-submission withdrawal or
closure may retain null, while a post-submission withdrawal or closure retains
the original submission timestamp; no mutation automatically clears it.

Degree level is one of `bachelors`, `masters`, `postgraduate_diploma`,
`doctorate`, or `other`. Intake term is one of `spring`, `summer`, `fall`,
`winter`, `rolling`, or `other`; intake year is restricted to 2020–2100.
Country codes are normalized uppercase two-letter codes. University and
programme names are normalized, control-free, and 2–200 characters. Optional
application references are at most 100 normalized characters. Optional portal
URLs are at most 2048 characters, HTTPS-only, contain no embedded credentials,
and are never converted to public links. The conservative hostname validator
rejects empty or consecutive labels and labels that begin or end with a
hyphen. E1.1 intentionally excludes nonstandard ports, IPv6 literals, Unicode
hostnames, and trailing-dot fully qualified hostnames; broadening that contract
requires a separately reviewed requirement.

`student_university_applications` is the current projection. It references the
durable `profiles` student identity rather than the disposable official
progression projection. Student, creation actor, last-change actor, and archive
actor foreign keys all use `ON DELETE RESTRICT` to preserve institutional
history. Creation always produces `planning`, non-primary, non-archived version
one with a null submission timestamp.

`student_university_application_events` is append-only typed history. Every row
contains the complete post-mutation country, university, programme, degree,
intake, status, reference, portal, deadline, submission, primary, and archive
snapshot. `(application_id, version_number)` is unique. Creation appends
`created`; subsequent changes append `details_updated`, `status_changed`,
`primary_changed`, or `archived`. No JSON audit payload, delete event, direct
event mutation, or physical purge exists. A table constraint independently
requires version one to be the `created` event and prevents `created` from
appearing at any later version.

Every successful mutation increments the affected projection exactly once and
inserts exactly one matching snapshot. Switching the primary application can
affect two projections, so it increments and snapshots both. Projection and
event writes share one PostgreSQL transaction; either all affected rows and
events commit or none do.

A student can have at most one primary application, enforced by a partial
unique index. A primary application cannot be archived, withdrawn, or closed.
The trusted primary RPC acquires the per-student application lock, locks the
target and existing primary in deterministic UUID order, clears the old
primary, and sets the requested one. Creation never chooses a primary
implicitly. A transition to a terminal status clears primary state within the
same audited status event.

Archiving is separate from status. It preserves the current status and all
history, sets database-controlled archive actor/time/reason, clears primary
state, increments version, and appends one `archived` snapshot. E1.1 has no
restore RPC and no DELETE or TRUNCATE path.

The five focused mutation RPCs are:

- `create_student_university_application`;
- `update_student_university_application_details`;
- `record_student_university_application_status`;
- `set_primary_student_university_application`;
- `archive_student_university_application`.

Each is owned by `postgres`, uses `SECURITY DEFINER` with an empty
`search_path`, schema-qualifies all database objects, derives the actor from
`auth.uid()`, requires
`has_active_verified_kgeo_role('counselor')`, and validates a student-role
target. No counselor identity, role, timestamp, version, initial status,
submission timestamp, event type, or prior snapshot is accepted from a caller.
Every function uses the distinct per-student advisory-lock domain
`202607270001`; existing targets are re-read under `FOR UPDATE`. Expected,
concurrent, and unexpected failures are mapped to sanitized categories.

Institutional ownership applies: any active, email-confirmed counselor may
read and manage E1.1 application records. Records are not permanently assigned
to their creator. RLS is enabled on both tables with exactly one counselor
SELECT policy each. Authenticated access is column-level SELECT only and omits
actor UUID columns; there is no student, admin, director, anonymous, INSERT,
UPDATE, DELETE, or TRUNCATE policy or grant. RPC execution is revoked from
PUBLIC and `anon`, granted to `authenticated`, and still independently
authorized inside every function.

The future E1.2 Student 360 read model may load at most 100 projections for one
trusted student, ordering active before archived, primary first, then
`updated_at desc, id desc`. One application detail may load event history in
pages of at most 25 using version or `changed_at`/`id` keyset pagination. The
foundation requires no per-application or per-event N+1 query.

E1.1 intentionally contains no offer type/date, acceptance, scholarship,
tuition, deposit, CAS, I-20, visa, travel, accommodation, or pre-departure
field. `decision_received` means only that a decision exists. Those data
belong in later independently reviewed tables. Future global reporting indexes
also require `EXPLAIN (ANALYZE, BUFFERS)` evidence.

The manual rollout order is:

1. Review the complete E1.1 migration and exact schema.
2. Confirm all fifteen earlier migration hashes.
3. Recalculate and record the E1.1 SHA-256.
4. Apply only E1.1 in staging.
5. Run the complete read-only readiness verification.
6. Require every structural assertion to pass and every E1.1 drift count to be
   zero.
7. Test authorized counselor creation and every unauthorized-role denial.
8. Test detail updates, valid/invalid transitions, and submission timestamps.
9. Test first-primary selection, primary switching, archive, and concurrency.
10. Confirm application/event atomicity, no hard deletion, and no official
    progression change.
11. Repeat in production only after staging approval.
12. Begin E1.2 only after live verification.

## K-GEO live-schema verification

After all seventeen reviewed migrations have been manually applied in timestamp
order, run
`supabase/verification/pre_phase_c2_readiness.sql` in the Supabase SQL Editor.
The script starts a repeatable-read, read-only transaction and inspects the
live PostgreSQL catalogs rather than
`supabase_migrations.schema_migrations`, so it also works when migrations were
applied manually.

Every schema, policy, privilege, and definition row should report
`passed = true`. One aggregate-only D1 inventory reports the total number of
private notes and follow-ups without returning text, ownership, or student
values. The D3 inventory reports only students without official progression,
counts by workflow state, current rows without history, and
latest-event/current-row mismatch counts. It never returns student, counselor,
stage, or reason values. The E1.1 inventory reports only total, active,
archived, and primary application counts. Its separate drift result reports
only aggregate integrity counts for primary uniqueness, created events,
projection/version agreement, orphan snapshots, and submitted timestamp
consistency. Terminal rows are checked against aggregate event-history
evidence so a pre-submission withdrawal or closure with a null timestamp stays
valid, while a terminal row that previously reached a submitted lifecycle is
flagged if its submission timestamp is missing. It never returns a student,
application, counselor, university,
programme, reference, URL, timestamp, or reason. The final legacy-diagnostic
result set contains
aggregate counts only for:

- missing canonical names;
- unresolved past scheduled consultations;
- completed consultations without outcome audit;
- invalid outcome audit pairs;
- students whose detailed profile has not started.

No diagnostic query returns a student UUID, name, email, contact field,
consultation identifier, or other private row data. Non-zero legacy counts are
review inputs, not instructions to delete, backfill, or rewrite history.

## Phase E1.2 counselor university application management

The counselor Student 360 route contains a counselor-only **University
applications** section backed by the applied E1.1 foundation. The section does
not exist in student, admin, director, or public routes.

The application list independently authorizes through the active,
email-confirmed counselor guard, resolves the requested student through
`get_counselor_student_identity`, and makes one bounded projection query for
that student. It requests at most 101 rows so more than 100 applications fail
closed. Active records are ordered before archived records, the active primary
record appears first, and ties use `updated_at DESC, id DESC`. Event history is
not preloaded. A selected application loads at most 26 events and displays 25
per page in `version_number DESC` order.

Counselors can:

- create an application, which always starts in `Planning`;
- edit approved university, programme, degree, intake, reference, portal, and
  submission-deadline fields with a required audit reason;
- choose only an explicitly permitted next status;
- select one eligible active application as primary;
- archive an application while retaining its current status and complete
  history; and
- inspect validated post-mutation event snapshots without actor UUIDs.

The application reference, HTTPS portal URL, and submission deadline are
optional. Blank optional fields are sent to PostgreSQL as `NULL`. The portal
must match the conservative E1.1 HTTPS contract and is rendered only after
server validation. `submitted_at` is database controlled and becomes visible
after the trusted status RPC records submission; counselors cannot enter or
override it.

All five mutations call only the reviewed E1.1 RPCs. Server Actions strictly
reject duplicate, unknown, file, framework-action, and protected fields,
reauthorize the counselor, re-resolve the trusted student, verify application
ownership where applicable, validate the RPC result, and revalidate Student
360 only after success. No browser actor ID, version, timestamp, initial
status, submitted timestamp, primary state, or archive state is trusted.
Timestamp validation rejects impossible calendar values and preserves
PostgreSQL microsecond precision when checking ordering and mutation-response
relationships. A final history page must contain the required version-one
`created` event or the history fails closed.

Archived applications are shown separately, are read-only except for history,
and have no restore or hard-delete control. E1.2 does not automatically mutate
official counseling progression and does not add offer, scholarship, fee,
deposit, document, visa, notification, reporting, student, admin, or director
application features.

Application and event data remain institutional counselor records. The client
presentation omits creator, changer, and archive-actor UUIDs as well as raw
database errors and advisory-lock details. Dialogs use visible labels,
descriptions, field-level errors, modal focus handling, focus restoration,
keyboard cancellation when safe, synchronous duplicate-submission locks,
semantic status/error feedback, responsive single-column layouts, and
reduced-motion behavior.

## Phase E1.3.1 student-safe university application read foundation

Migration
`supabase/migrations/202607280001_student_university_application_read_foundation.sql`
adds the zero-argument `get_my_university_applications` RPC for a future
student read-only application experience. E1.3.1 itself adds no student page,
Client Component, Server Action, form, or mutation.

The `SECURITY DEFINER` RPC derives identity only from `auth.uid()` and requires
the authoritative active, email-confirmed student-role predicate. A caller
cannot provide a student UUID or choose another student. Counselor, admin,
director, anonymous, inactive, unverified, and missing-profile callers fail
closed. The function is owned by `postgres`, has an empty `search_path`, is
executable only by `authenticated`, and reauthorizes every invocation.

Students receive only their own nonarchived application summaries:
application ID, university, programme, country, degree, intake, current
status, optional submission deadline, optional database-controlled submission
timestamp, primary flag, and last-change timestamp. Withdrawn and closed
records remain visible while nonarchived. Archived records and archive counts
are not exposed.

Application references, portal URLs, counselor change and archive reasons,
actor UUIDs, versions, raw audit timestamps outside the approved summary, and
all event history remain private. History stays counselor-only. The RPC never
reads the event table, does not call any counselor mutation RPC, and cannot
create, edit, archive, restore, or delete an application.

The RPC inspects at most 101 matching rows and fails with one sanitized message
when more than 100 nonarchived applications exist; it never silently truncates
that invalid set or reveals its size. Valid results are ordered with the
primary application first, then `last_changed_at DESC`, then application ID
`DESC`; explicit null handling places unexpected null sort values last.

`STABLE` is the correct volatility classification because the RPC performs
only reads and its result may change between calling statements. PostgreSQL
executes both internal queries against the snapshot established for the
calling query, so the 101-row overflow check and the returned rows observe the
same database view. A concurrent counselor insertion after that snapshot is
not visible halfway through the call; a later call sees it and fails closed if
it creates an over-100 set. `IMMUTABLE` would be incorrect because the result
depends on authenticated session identity and database state.

E1.1 RLS, counselor policies, existing column-level counselor read grants, and
all mutation RPCs remain unchanged. No direct student table policy or new
table grant exists, and no service-role credential is used. University
application lifecycle state remains independent from official counseling
progression.

The readiness verification checks the exact RPC signature, relational return,
owner, security mode, empty search path, execution ACL, authorization,
ownership filter, archive filter, bounds, ordering, privacy exclusions, and
absence of mutation or progression access. Its E1.3.1 drift diagnostic returns
only the aggregate number of students with more than 100 nonarchived
applications; it never returns student or application values.

## Phase E1.3.2 student read-only university applications UI

The existing student dashboard now renders a read-only **My university
applications** section. Its focused server-only loader reauthorizes the active,
email-confirmed student and calls only the zero-argument
`get_my_university_applications()` RPC through the authenticated SSR client.
It accepts no student or application identity and performs no direct
application-table or event-table query. No service-role credential is used.

The loader validates every relational row, permits a maximum of 100 summaries,
rejects duplicate application IDs or multiple primary rows, and verifies the
database ordering with full PostgreSQL timestamp precision. The presentation
contains only university, programme, validated country code, degree and intake
labels, current status, optional submission deadline and submitted date,
primary state, and last-change date. A primary application is identified by a
visible badge only.

Archived applications remain undisclosed. Withdrawn and closed applications
remain visible while nonarchived, including valid terminal records that closed
before submission. Application references, portal URLs, counselor reasons,
actor identities, archive information, versions, and event history remain
hidden.

Students cannot create, edit, change status, set primary, archive, restore, or
delete an application. Application status remains separate from official
counseling progression. RPC, schema, ordering, and result-validation failures
produce a localized section error while the rest of the dashboard remains
available. Authentication, verification, role, profile, and account-state
failures continue to fail closed through the authoritative `requireStudent()`
server redirect and do not reveal whether applications exist.
E1.4 has not started.
## Phase R1 readiness SQL reconstruction

The previously reviewed readiness SQL could not be recovered byte-for-byte.
The historical SHA-256
`e6133252a6992a236bb9217209f93f2473a679f66554926b9c41977da27ec0d2`
is retired and must not be used as an active readiness expectation.

The database migrations remained unchanged. This was a reconstruction, not a
restoration. The canonical readiness SQL was rebuilt from all seventeen
authoritative migrations through E1.3.1,
with migration TypeScript contracts and tests used only as corroborating
evidence. The reconstructed SQL has SHA-256
`04ce9cc7446271de95b7224235f4785d3cd4dd6aa01a6e021a6d3502e61d0e3e`.
The migration-by-migration evidence and coverage classification are recorded in
`docs/readiness-reconstruction-inventory.md`.
After byte identity and the replacement gate were verified, the temporary
reconstruction candidate was removed. The canonical readiness SQL is the sole
authoritative executable copy.

This recovery contains no production schema change. Its assertions and drift
diagnostics are read-only and aggregate-only. On 2026-08-01, the complete
canonical file at the recorded SHA-256 was executed successfully in the
staging Supabase project: every structural assertion returned `true`, every
required-zero diagnostic returned zero, informational counts were reviewed,
and the progression-evidence bucket and policies were manually verified. No
repair SQL or migration reapplication was needed. This staging result does not
apply any later migration to production.

## Phase E1.3.3 university application documents foundation

The reviewed migration
`supabase/migrations/202608010001_university_application_documents_foundation.sql`
adds private document metadata for exactly one
`student_university_applications` row. The trusted relationship is:

`student_university_application_documents.application_id`
-> `student_university_applications.id`
-> `student_university_applications.student_id`.

Only an active, email-confirmed counselor may prepare, finalize, list, resolve
for viewing, or soft-remove an application document. Students, admins,
directors, inactive or unverified counselors, users without profiles,
anonymous users, and public callers receive no document access. The metadata
table has RLS enabled but no direct authenticated table grant; focused
`SECURITY DEFINER` RPCs reauthorize every request and return only the minimum
contract needed for that operation.

The document lifecycle has exactly three database-controlled states:

- `pending`: a counselor-bound upload intent exists for at most two hours;
- `available`: the exact generated object was found in private Storage and the
  document may be listed or viewed;
- `removed`: the document is permanently absent from active lists while its
  metadata and Storage object remain retained.

Only `pending -> available -> removed` is implemented. There is no direct
table mutation, hard delete, Storage delete, restore, repeated finalization,
or repeated removal. Archived applications are read-only: preparation,
finalization, and removal fail, while authorized counselors may continue to
list and view existing available documents. Nonarchived withdrawn and closed
applications remain eligible for document management. Document operations do
not update application status, primary state, application details, versions,
events, or official counseling progression.

The application, uploader, and removal-actor foreign keys use `ON DELETE
RESTRICT`. An application or staff profile referenced by retained document
history cannot be deleted until a future, explicitly reviewed retention and
account-deletion process resolves that history. E1.3.3 provides no such delete
or purge process.

### Private bucket and file contract

The bucket is not created by migration SQL because `storage.buckets` and
`storage.objects` are Supabase-managed. Before applying the migration, create
one bucket through the Supabase Dashboard with this exact configuration:

- ID: `university-application-documents`
- public: `false`
- file size limit: `10485760` bytes (10 MiB)
- allowed MIME types: `application/pdf`, `image/jpeg`, `image/png`, and
  `image/webp`

DOC, DOCX, ZIP, SVG, HTML, executable, audio, video, and unknown binary files
are not allowed. Accepted extensions are `.pdf`, `.jpg`, `.jpeg`, `.png`, and
`.webp`, paired exactly with their MIME type. PostgreSQL rejects blank or
unsafe filenames, leading or trailing whitespace, trailing dots,
double-extension names, path separators, traversal or `..`, ASCII and
high-risk Unicode control characters, an empty basename, unsupported or
mismatched extensions, zero-byte declarations, and sizes over 10 MiB.

PostgreSQL derives the counselor from `auth.uid()`, the student from the
trusted application, the application from the selected row, and the document
UUID from `gen_random_uuid()`. It creates this UUID-only path:

`applications/<student-uuid>/<application-uuid>/<document-uuid>/<document-uuid>.<extension>`

The browser cannot supply the student, counselor, document UUID, bucket,
path, status, actor, timestamp, expiry, or archive state. Document titles and
original filenames are display metadata and never enter the path.

### RPC contracts

`prepare_university_application_document_upload` accepts only application ID,
document title, original filename, MIME type, and declared byte size. It
normalizes the title, validates the file metadata, locks a dedicated
per-application advisory domain, and creates a two-hour pending row. Available
rows and unexpired pending rows count toward the maximum of 20. Removed and
expired pending rows do not. The bounded count inspects at most 21 rows, so the
twenty-first concurrent reservation fails safely.

`finalize_university_application_document_upload` accepts only the document
UUID, requires the original preparing counselor, locks the pending row,
revalidates the nonarchived application and student role, rejects expired or
repeated finalization, and confirms that the exact bucket/path exists in
`storage.objects` before making the metadata available. It never inserts,
updates, or deletes a Storage row.

`list_university_application_documents` accepts one application UUID and
returns at most 20 available documents ordered by `available_at DESC, id DESC`.
It returns only document and application IDs, title, display filename, MIME,
size, and availability time. It excludes student identity, actors, removal
audit, raw bucket/path, signed URLs, pending rows, and removed rows.

`authorize_university_application_document_view` reauthorizes the counselor
and exact application/document relationship, requires available status, and
returns the trusted bucket/path to server-only code. E1.3.4 may use that result
to create a signed view/download URL lasting no more than 300 seconds. Signed
URLs must be created on demand, never stored or logged, and never included in
initial page source. Permanent and public URLs are prohibited.

`soft_remove_university_application_document` accepts only document UUID and a
required normalized reason of at most 500 characters. It locks an available
row, rejects archived applications, sets database-derived removal audit
fields, and retains both metadata and bytes. Removal is final.

Two additional boolean `SECURITY DEFINER` predicates provide the minimum
metadata bridge for Storage policies. They return no metadata: one checks the
original counselor's exact unexpired pending path on a nonarchived
application, and the other checks an exact available path for an authorized
counselor, including archived read-only applications. Unexpected authorization
lookup failures return `false`, so policy evaluation fails closed without
exposing database details.

### Required manually managed Storage policies

After applying the reviewed public-schema migration, create exactly these two
policies through the Supabase Dashboard Storage policy editor. Do not change
`storage.objects` ownership and do not use `SET ROLE`.

Upload policy:

- name: `university_application_document_object_insert_counselor`
- operation: `INSERT`
- role: `authenticated`
- `WITH CHECK`:

```sql
storage.objects.bucket_id = 'university-application-documents'
and (
  select public.can_upload_university_application_document_object(
    storage.objects.bucket_id,
    storage.objects.name
  )
)
```

View policy:

- name: `university_application_document_object_select_counselor`
- operation: `SELECT`
- role: `authenticated`
- `USING`:

```sql
storage.objects.bucket_id = 'university-application-documents'
and (
  select public.can_view_university_application_document_object(
    storage.objects.bucket_id,
    storage.objects.name
  )
)
```

Do not create Storage UPDATE, DELETE, ALL, public, anonymous, student, admin,
or director policies. Upload must use a signed-upload flow with overwrite and
upsert disabled. Soft removal intentionally retains the object; physical purge
is a future separately reviewed retention operation.

Policy names are intentionally stable. Before repeating the manual policy
step, inspect `storage.objects` policies and stop if either named policy already
exists. PostgreSQL `CREATE POLICY` rejects an existing policy name; do not work
around that error by creating a second policy under another name. Review and
correct the existing policy explicitly instead.

### A1.4.2B Primary Counselor case ownership

`202608130001_primary_counselor_storage_authorization_helpers.sql` installs
only the private public-schema ownership predicate. The
`is_active_primary_counselor_for_student(uuid)` helper derives the caller from
`auth.uid()` and requires an active, email-verified, exact Counselor profile.
It is not executable by browser roles.

`202608130002_primary_counselor_case_ownership_enforcement.sql` begins with a
fail-closed prerequisite inside one explicit transaction. Before reading any
prerequisite state it locks both reservation metadata tables in `SHARE ROW
EXCLUSIVE` mode. Pre-existing writers complete before the scan; later writers
wait for commit and then execute through the installed enforcement triggers.
The prerequisite reads the complete live Storage INSERT/ALL and SELECT/ALL
policy catalogs applicable to an authenticated session, including PUBLIC and
recursively inherited-role applicability. It requires exactly three reviewed
permissive INSERT policies. The protected progression-evidence and
application-document policies must be `authenticated` and match their complete
expressions. The unrelated PUBLIC marksheet policy is accepted only when its
normalized complete-expression SHA-256 is
`8341117815b25e65a2b904aeb6b00b4b4f1934e0e5a7ba3b171fbff371f53d35`.
That reviewed expression binds `academic-documents`, while exact dependencies
bind `storage.objects`, `auth.uid()`, and `storage.foldername(name text)`. The
complete applicable SELECT/ALL inventory must contain exactly three reviewed
policies: the two protected `authenticated` SELECT policies and the unrelated
PUBLIC `students read own marksheets` policy. The marksheet SELECT must match
the same reviewed `academic-documents`-only normalized expression SHA-256 and
exact dependencies as its INSERT counterpart. Each protected SELECT must match
its complete expression and dependencies. Under an empty transaction-local
search path, complete `pg_get_expr` output is compared without removing SQL
tokens or schema qualification. Exact `pg_depend` relation and function
identities independently reject same-named objects in another schema. The
prerequisite also rejects every unexpired pending
reservation whose uploader is not the Student's current active, verified
Primary Counselor before creating any enforcement object.

Canonical readiness repeats these live contracts. It validates complete
line-ending-normalized `prosrc` SHA-256 values together with exact function
schema, signature, result, language, volatility, owner, security mode, search
path, and execute ACLs. Every non-internal trigger on all six protected
relations is compared bidirectionally against the reviewed ten-trigger
post-install allowlist: four historical preparation/normalization triggers and
six Primary Counselor enforcement triggers. Relation and function OIDs,
function signatures, timing/events, row scope, enabled state, arguments,
`WHEN`, constraint/deferral state, and transition tables must match exactly.
Names and substring matches alone are not authorization proof.

Narrow trusted triggers protect notes, follow-ups, official progression,
progression evidence, applications, and application documents. Existing note
author and follow-up owner policies remain additional requirements; assignment
changes never rewrite historical authors, owners, actors, timestamps, or audit
events. Students without an active assignment remain readable through prior
safe read contracts but all long-term Counselor mutations fail closed.

Consultation ownership remains independent. The assigned Counselor may record
an eligible consultation outcome under A1.4.1 without receiving permission to
change the Student's long-term case. Director and Admin receive no override.

Resume upload is deferred from the current V1. The existing private bucket and
historical data must be retained, but current readiness does not require an
INSERT policy and no current application runtime offers a resume upload path.
Resume upload will be available in a later release. Marksheets remain supported.

Application-document uploads continue using the existing stable Storage policy
name because its delegated helper is replaced in the enforcement migration.
Progression evidence continues using its historical reservation-gated Storage
policy. A trusted trigger now prevents non-primary or unassigned Counselors from
creating or changing reservation metadata. No A1.4.2B migration alters
`storage.objects`, any Storage policy, or Storage ownership. Do not add a second
upload policy and do not change either SELECT policy in an A1.4.2B migration.
The current staging progression INSERT and SELECT role drift must first be
restored from PUBLIC to `authenticated` through the separately approved
Storage-policy management workflow; migration 002 and canonical readiness then
verify that repair but never perform it.

The controlled A1.4.2B deployment sequence is mandatory:

1. Before applying SQL, inspect every live `storage.objects` policy applicable
   to authenticated INSERT, SELECT, or ALL, including PUBLIC and recursively
   inherited roles. Stop unless the exact approved three-policy INSERT
   inventory matches: the two protected `authenticated` policies with their
   canonical expressions and the reviewed PUBLIC marksheet policy with its
   exact expression hash and dependencies. The complete applicable SELECT/ALL
   inventory must contain the two reviewed protected `authenticated` policies
   plus the reviewed PUBLIC `students read own marksheets` policy, each with its
   exact expression and dependencies. Any unknown policy is blocking even when
   its name or rendered predicate does not mention a protected bucket. A PUBLIC
   protected policy is drift and must not be accepted by weakening the
   prerequisite or readiness.
2. Inspect all unexpired pending progression-evidence and application-document
   reservations. Stop if any uploader is not the Student's current active,
   verified Primary Counselor. The approved resolution is to let the existing
   two-hour reservation expire through the historical lifecycle; do not rewrite
   or delete it ad hoc.
3. Apply
   `202608130001_primary_counselor_storage_authorization_helpers.sql` through
   the normal migration path.
4. Apply
   `202608130002_primary_counselor_case_ownership_enforcement.sql` through the
   normal migration path. Its transaction-held reservation locks must remain in
   place through trigger installation and commit. Its complete pre-install
   trigger allowlist must pass, and its complete post-install trigger assertion
   must pass before commit. Stop on either exception; never bypass or weaken
   the check.
5. Do not modify any Storage policy. Run canonical readiness in full and then
   execute the reviewed live
   Counselor A, Counselor B, unassigned, Director, Admin, RPC, and direct
   Storage allow/deny matrix.

Database metadata and Storage bytes cannot be committed atomically. An upload
may leave an expired pending row, an uploaded object may await finalization,
and removed metadata normally retains its object. Readiness reports these only
as aggregate informational counts. Available metadata without an object,
invalid lifecycle rows, duplicate paths, orphan applications, or more than 20
active rows are required-zero drift.

E1.3.3 validates only declared MIME, matching extension, size, filename,
trusted path, and object existence. It performs no malware or virus scanning,
OCR, authenticity or approval review, PDF-content validation, image-content
analysis, or archival-compliance certification. There are no public URLs.

Controlled staging rollout order:

1. Review the complete E1.3.3 migration and record its SHA-256.
2. Confirm all 17 earlier migrations remain byte-identical.
3. Create the exact private bucket through the Dashboard.
4. Apply only the E1.3.3 migration in staging.
5. Create the exact authenticated INSERT and SELECT Storage policies above.
6. Run the updated canonical readiness SQL in full.
7. Require every E1.3.3 structural check to return `true` and every
   required-zero drift count to return zero; review informational counts.
8. Live-test counselor allow/deny cases, all MIME/size boundaries, archive
   behavior, the 20-document concurrency boundary, object finalization,
   view authorization, and final soft removal. Five-minute signed URL creation
   is an E1.3.4 contract and cannot be live-tested during E1.3.3.

### Controlled staging verification

On 2026-08-02, the E1.3.3 controlled deployment and complete readiness
verification passed in the staging environment. The reviewed migration was
applied with SHA-256
`9cff3f5849fffa9d610b3d7a8bbab2ac0f04dc3e7729ca95bc46d0c0a6d548a1`,
and the complete canonical readiness SQL was executed with SHA-256
`4fd3d2c5f928381b3a176d4bdff9048ee9182b202677b705b65e47ec45584525`.

The private bucket verification passed: the bucket remained private, retained
the 10 MiB file-size limit, and allowed only PDF, JPEG, PNG, and WebP MIME
types. The authenticated INSERT Storage policy verification passed, the
authenticated SELECT Storage policy verification passed, and the check for
forbidden UPDATE, DELETE, ALL, anonymous, and PUBLIC policies passed. All seven
E1.3.3 document functions existed. Every E1.3.3 structural readiness assertion
returned `true`, every E1.3.3 required-zero diagnostic returned zero, and the
informational diagnostics were reviewed. No repair SQL was run and no earlier
migration was reapplied.

E1.3.3 is approved as the stable staging foundation for E1.3.4 development.
This does not constitute production rollout approval.

The E1.3.3 foundation itself contains no upload UI, Client Component, Server
Action, route, or signed URL generation. Phase E1.3.4 now provides that
counselor-only application layer without changing this migration, its Storage
configuration, or the canonical readiness SQL. E1.4 has not started.
The pre-E1.3.3 readiness SHA-256 was
`04ce9cc7446271de95b7224235f4785d3cd4dd6aa01a6e021a6d3502e61d0e3e`.
The superseded prepared E1.3.3 readiness SHA-256
`3235d1f6862d08efb7c685133cf2b81da7dc39d51098f12e2e74d57545bb8fe8`
is retired because its E1.3.3 catalog checks incorrectly schema-qualified the
SQL `COALESCE` expression. The corrected active E1.3.3 readiness SHA-256 is
`4fd3d2c5f928381b3a176d4bdff9048ee9182b202677b705b65e47ec45584525`.

## Phase E1.3.4 counselor university application document interface

E1.3.4 adds a private document subsection inside each existing counselor
Student 360 university-application card. Every subsection is collapsed by
default. The initial Student 360 request does not list documents and therefore
does not create an application-level N+1 query. An explicit expansion, retry,
or post-mutation refresh makes exactly one bounded call to
`list_university_application_documents`; loading, unavailable, empty, and ready
states remain local to that application card.

Only the safe list contract reaches rendered document rows: title, display
filename, neutral MIME label, byte size, availability time, application UUID,
and document UUID. Bucket IDs, Storage paths, signed capabilities, actor IDs,
removal audit, pending rows, removed rows, and raw database errors are never
rendered. Students, admins, directors, anonymous users, and public pages receive
no E1.3.4 interface or runtime query.

Upload uses the reviewed direct signed upload sequence:

1. The browser validates one normalized 2–100 character title and exactly one
   PDF, JPEG, PNG, or WebP file no larger than 10 MiB.
2. A counselor-only Server Action sends only the application UUID and scalar
   file metadata to `prepare_university_application_document_upload`.
3. The authenticated SSR client calls `createSignedUploadUrl` for the trusted
   RPC-generated path with overwrite disabled.
4. Only the minimum bucket, path, token, document UUID, MIME, filename, and size
   capability is returned to the Client Component and held in memory during the
   upload. It is not persisted, logged, placed in a URL, or rendered.
5. The browser sends bytes directly to private Storage with
   `uploadToSignedUrl`; no file bytes pass through a Server Action.
6. Finalization sends only the document UUID to
   `finalize_university_application_document_upload`, then refreshes only that
   application's lazy document list.

The client distinguishes preparation, upload, and finalization failures. A
preparation or upload retry creates a new intent; a finalization retry retains
only the document UUID and never retains the signed capability. Pending intents
still expire under the two-hour database contract.

Viewing is always an explicit counselor action through a server Route Handler.
The handler validates both UUIDs, reauthorizes the exact relationship with
`authorize_university_application_document_view`, creates a five-minute signed
private URL, validates its Supabase origin and trusted object path, and returns
a `307` redirect with private no-store and no-referrer headers. No public or
list-time URL is created.

Removal accepts only the document UUID and a normalized 1–500 character reason.
It calls `soft_remove_university_application_document`, performs no optimistic
deletion, and refreshes the local list only after the trusted result succeeds.
Soft removal retains both the audit metadata and Storage object; the UI provides
no restore or physical-delete operation.

Archived applications remain document-readable: counselors may lazily list and
view existing available files. Upload, finalization, and removal controls are
absent and the interface presents a neutral read-only message. Withdrawn and
closed applications remain manageable unless the application itself is
archived, matching the E1.3.3 database contract.

Every E1.3.4 Server Action and the view handler independently call
`requireCounselor()`. FormData parsers require exact scalar key sets and reject
duplicates, files, empty values, `null`/`undefined` strings, and injected
ownership, role, actor, status, timestamp, bucket, path, or redirect fields.
The database RPCs remain authoritative for counselor authorization,
application state, document state, relationships, capacity, and audit fields.
Failures shown to counselors are generic and do not expose raw Supabase,
PostgreSQL, Storage, token, path, account, or object details.

E1.3.4 changes no migration, readiness assertion, bucket setting, Storage
policy, authentication flow, student page, admin/director portal, or E1.3.3
database object. At the verified E1.3.4 checkpoint, E1.4.1 and E1.4.2 had not
started.

### Controlled staging UI verification

On 2026-08-02, the E1.3.4 counselor document UI completed controlled browser
verification successfully in the staging environment. The verified stable code
checkpoint is `kgeo-stable-after-e1-3-4`. Verification used the immutable
E1.3.3 migration SHA-256
`9cff3f5849fffa9d610b3d7a8bbab2ac0f04dc3e7729ca95bc46d0c0a6d548a1`
and canonical readiness SHA-256
`4fd3d2c5f928381b3a176d4bdff9048ee9182b202677b705b65e47ec45584525`.

The following document-loading and upload checks passed:

- Lazy loading passed. No document request occurred before explicit expansion
  of an application card, and expanding one application loaded only that
  application's documents.
- Supported PDF, JPEG/JPG, PNG, and WebP uploads passed.
- Unsupported MIME, MIME/extension mismatch, empty file, file over 10 MiB, and
  unsafe filename rejection passed.
- Direct browser-to-private-Supabase-Storage upload passed. No file bytes
  passed through a Server Action.
- Duplicate upload submission protection passed.
- Finalization retry passed without a second object upload.

The following viewing, removal, and archive checks passed:

- Five-minute private signed document viewing passed. A signed URL was created
  only after an explicit View action, and no public URL was created.
- Soft removal passed. The removed document disappeared from the active list
  while its metadata and physical Storage object remained retained.
- Archived applications allowed document listing and viewing only; upload and
  removal were denied.

The following authorization, privacy, and usability checks passed:

- Student, admin, director, and anonymous access denial passed. Where inactive
  or unverified counselor test accounts were available, their denial also
  passed.
- Token leakage, private Storage-path leakage, and initial-page signed URL
  leakage reviews passed.
- Browser console, page-source, and localStorage/sessionStorage reviews passed.
- Keyboard accessibility and mobile responsive reviews passed.

Application status, application event history, and official counseling
progression remained unchanged throughout verification. E1.4.1 was not part
of that browser verification, E1.4.2 has not started, and production rollout
is not yet approved.

E1.3.4 is approved as the verified staging UI foundation for E1.4.1
development. This does not constitute production rollout approval.

## Phase E1.4.1 counselor applications workspace read foundation

E1.4.1 prepares two counselor-only, read-only PostgreSQL contracts for a future
cross-student applications workspace. It does not create a workspace route,
page, Client Component, Server Action, or active Applications sidebar entry.
All application creation, editing, lifecycle changes, primary selection,
archival, restoration, and document management remain inside Counselor Student
360.

`public.list_counselor_university_application_workspace(...)` derives the
caller from `auth.uid()`, independently requires an active verified counselor,
and returns one deterministic page from the current
`public.student_university_applications` projection. The default archive scope
is active applications; callers may explicitly request archived applications
or both scopes. Page numbers are bounded to 1 through 100000, page size is
bounded to 1 through 25, and an empty or out-of-range page returns the proven
sentinel shape so `total_count` remains available. Real rows repeat one
consistent filtered `total_count`; the sentinel contains only that count and
appears only for zero matches or a page whose offset is at or beyond the count.

As in the counselor directory, student-role identities remain workspace-visible
when their account is inactive so historical application records retain their
institutional context. Inactivity does not grant portal access and is not a
counselor authorization signal.

Search is limited to canonical student full name, college email, roll number,
university name, programme name, and application reference. It does not inspect
or return personal email, mobile number, counselor records, document filename,
Storage path, portal URL, raw metadata, event history, progression data, or
actor and archive-audit fields. Search uses normalized literal substring
matching, so percent and underscore characters do not become SQL wildcards.
The 100-character limit is evaluated after ASCII-space normalization in both
PostgreSQL and TypeScript using Unicode code points. Deterministic ASCII case
folding is applied without rewriting non-ASCII characters. ASCII/C1 controls and the
reviewed high-risk invisible, bidirectional, and Unicode-space characters are
rejected. Text sorts use the explicit PostgreSQL `C` collation and the matching
UTF-8 byte order in the strict TypeScript response validator.

The list returns only the approved student/application summary and a grouped
`available_document_count`. That count includes only document rows whose state
is `available`; pending, expired-pending, and removed rows are excluded, and no
document metadata is returned. Application state comes from the current
projection and is never reconstructed from application event history.

`public.get_counselor_university_application_workspace_metrics()` uses the
same caller-derived authorization boundary and returns one aggregate-only row.
Operational status, primary, overdue, and due-next-30-days metrics exclude
archived applications. `students_with_applications` also counts distinct
students only across active, nonarchived applications; archived-only students
do not enter that operational metric. Deadline filters and metrics use the Asia/Kolkata
business date; overdue ends before today and due-next-30-days begins today, so
the ranges do not overlap.

Both functions are `STABLE SECURITY DEFINER` with an empty `search_path`, are
owned by `postgres`, revoke execution from `PUBLIC` and `anon`, and grant only
`EXECUTE` to `authenticated` before reauthorizing internally. The migration
adds no table, enum, index, trigger, policy, table grant, mutation, or UI.

The staging-applied, senior-reviewed migration SHA-256 is
`d08643961a2bba54946cfd595fbc86f02b99b56696e705cf5b502fd5f467865d`.
The pre-E1.4.1 canonical readiness SHA-256 remains the staging-verified
`4fd3d2c5f928381b3a176d4bdff9048ee9182b202677b705b65e47ec45584525`;
the staging-verified E1.4.1 canonical readiness SHA-256 is
`ad75db6174bf206619a8a71978f2fcb5b3c9a91913f165c03296287b1d18566b`.
Earlier E1.4.1 draft hashes are retired by these corrected review contracts.

### Controlled staging verification

On 2026-08-02, the E1.4.1 migration application and complete canonical
readiness verification passed in the staging environment. The stable staging
checkpoint is `kgeo-stable-after-e1-4-1`.

The list and metrics RPC structural checks passed, including exact signatures
and overload counts, `SECURITY DEFINER`, `STABLE`, trusted ownership, empty
`search_path`, authenticated-only `EXECUTE`, and denial of `PUBLIC` and `anon`
execution. Live authorization passed for an active verified counselor and
failed closed for students, admins, directors, anonymous users, inactive or
unverified counselors, and authenticated users without a matching profile.

The default active archive scope and the explicit archived and all scopes
passed. Search normalization and literal percent, underscore, backslash, and
apostrophe behavior passed. Status, country, degree-level, intake-term,
intake-year, primary-state, archive-state, and deadline-state filters passed.
All six static sorts, page and page-size boundaries, and the maximum page size
of 25 passed.

Empty-result and out-of-range-page sentinel behavior passed. Sentinels were not
treated as applications, while the total filtered count remained available.
Available-document counts included only available documents and excluded
pending and removed documents.

Metrics used active, nonarchived applications except for the separately
reported archived total. Distinct students, primary applications, and all ten
lifecycle counts used active applications only. Asia/Kolkata deadline
boundaries passed, and overdue and due-next-30-days ranges did not overlap.
Every E1.4.1 structural readiness assertion returned `true`, and all four
required-zero diagnostics returned zero. Representative query-plan and latency
review was completed.

Application rows, application events, primary and archive state, document
metadata, Storage, official counseling progression, and consultations remained
unchanged. E1.4.1 remained read-only. E1.4.2 was not part of that database
verification, and production rollout is not approved.

E1.4.1 is approved as the verified staging read foundation for E1.4.2
development. This does not constitute production rollout approval.

## Phase E1.4.2 counselor applications workspace UI

E1.4.2 adds the read-only counselor Applications workspace at
`/counselor/applications`. The route is protected by `requireCounselor()`, is
rendered dynamically on the server, and uses the authenticated Supabase SSR
client. It calls the E1.4.1 list and metrics RPCs once each for a valid page
request. It does not read application, event, document, profile, or Storage
tables directly.

The workspace provides bounded search, status, country, degree, intake,
primary, archive, deadline, sort, page, and page-size controls through URL
query parameters. Duplicate, unknown, malformed, oversized, or out-of-contract
values fail closed before application data is loaded. Canonical pagination URLs
preserve approved filters and use the total count returned by the list RPC; no
additional count query is performed. The default archive scope is active, the
default page size is 20, and the maximum page size is 25. The empty-page
sentinel is parsed only at the server boundary and is never rendered as an
application.

The page displays aggregate operational metrics, lifecycle counts, approved
student and application summary fields, Asia/Kolkata deadline states, and the
bounded available-document count. It does not display personal email, mobile
number, portal URL, Storage paths, document metadata, event actors, archive
reasons, notes, follow-ups, or progression evidence. The only row action opens
the existing authorized Student 360 route. Desktop and mobile presentations use
the same strictly parsed server data, and the Applications counselor navigation
entry is now active.

No mutation, application-detail route, Server Action, upload, signed-view,
archive, lifecycle, primary-selection, or document-management control is added
by this phase. Existing application and document management remain inside
Student 360. Students, admins, directors, and anonymous callers receive no
workspace access; the existing counselor guard and the independently
authorizing E1.4.1 RPCs remain authoritative.
Unavailable metrics and list results are handled independently with generic
messages; raw Supabase or PostgreSQL errors are not rendered or logged.

E1.4.2 does not modify SQL, migrations, canonical readiness, database types,
RLS, grants, Storage configuration, authentication, or student/admin/director
portals. E1.4.1 remains the authoritative read contract. E1.4.2 has not received
controlled staging browser verification, and production rollout remains
unapproved.

The unchanged E1.4.1 migration SHA-256 is
`d08643961a2bba54946cfd595fbc86f02b99b56696e705cf5b502fd5f467865d`,
and the unchanged canonical readiness SHA-256 is
`ad75db6174bf206619a8a71978f2fcb5b3c9a91913f165c03296287b1d18566b`.

## Phase A1.1 director dashboard read foundation

Migration `supabase/migrations/202608060001_director_dashboard_read_foundation.sql`
adds three read-only RPCs for a future director dashboard. It creates no route,
page, Client Component, Server Action, mutation, policy, table grant, role
change, assignment workflow, report, export, or recent-activity feed.

Every RPC is `STABLE`, `SECURITY DEFINER`, owned by `postgres`, and uses an
empty `search_path`. Identity is derived from `auth.uid()` and independently
reauthorized through `has_active_verified_kgeo_role('director')`. Execution is
revoked from `PUBLIC`, `anon`, and `authenticated`, then granted only to
`authenticated`; the internal exact-role check denies admins, counselors,
students, inactive or unverified directors, anonymous callers, and identities
without the matching profile. Errors are bounded and generic.

`get_director_dashboard_metrics()` returns one aggregate-only row covering
student and counselor accounts, current consultation states, counselor-owned
follow-up counts, official current progression states, and current nonarchived
application/deadline counts. Asia/Kolkata determines today, upcoming slots,
unresolved past consultations, and overdue dates.

`list_director_counselor_workload(p_limit integer default 20)` returns at most
50 counselor profiles, including inactive profiles so retained work is not
hidden. Grouped aggregates report pending and overdue owned follow-ups plus
pending outcomes and today's consultations only where the current consultation
row has that counselor's trusted assignment. It returns no student identity,
application ownership, progression ownership, private content, total count, or
sentinel. Ordering is overdue follow-ups, pending outcomes, consultations today,
C-collated counselor name, and counselor UUID.

`list_director_attention_items(p_limit integer default 25)` returns at most 50
rows using exactly `overdue_application_deadline`,
`due_soon_application_deadline`, `additional_information_requested`, and
`pending_consultation_outcome`. Overdue deadlines and additional-information
requests are high severity; due-soon deadlines and pending outcomes are medium.
Due soon means today through 30 Asia/Kolkata calendar days. A scheduled
consultation becomes pending-outcome attention immediately when its trusted
slot end is reached in Asia/Kolkata. No arbitrary grace threshold is added.
The function exposes no individual follow-up row, ID, student, date, or content.

The director reads never query progression events, application events,
corrections, evidence, application documents, Storage, or counselor notes.
They do not expose note or follow-up action text, personal email, mobile number,
document fields, paths, URLs, raw events, evidence, private reasons, or Auth
metadata. The canonical readiness SQL verifies exact signatures and returns,
trusted security attributes, authenticated-only ACLs, exact director
authorization, bounded one-page limits, exact attention allowlists and
relationships, grouped workload aggregates, current-state sources,
privacy exclusions, absence of dynamic SQL/mutations, and aggregate-only drift
diagnostics. A1.1 diagnostics are expected-zero ownership/role invariants;
normal overdue or due-soon operational counts are not readiness failures. The
migration is prepared for review and has not been applied.
The prepared A1.1 migration SHA-256 is
`1179d59e46ba49904efe5bf610705aff6338dc52e92dd0b00ed57ad6630a0303`.
The protected pre-A1.1 canonical readiness SHA-256 is
`ad75db6174bf206619a8a71978f2fcb5b3c9a91913f165c03296287b1d18566b`;
the prepared A1.1 canonical readiness SHA-256 is
`8e02dd21356a057cafcf0c8654fbbda36ae501da35237daf931a9d12f89f986a`.

## Phase A1.1.1 Director identity bootstrap support

Migration `supabase/migrations/202608060002_director_identity_bootstrap_support.sql`
adds the trusted identity path needed to provision a Director whose email is
not in the student `@kct.ac.in` domain. Public registration is unchanged:
students alone may register, the exact `@kct.ac.in` domain is required, and
subdomains, lookalikes, `@kclas.ac.in`, and arbitrary external domains are
rejected. Public input and `raw_user_meta_data` cannot assign any role.

At the A1.1.1 migration boundary, the Auth insert trigger had two explicit
paths. Without a bootstrap marker,
it follows the existing student path and requires the validated canonical name.
With a marker, it reads only trusted `raw_app_meta_data` and requires the exact
string `kgeo_bootstrap_role = director`. Malformed values and student,
counselor, or admin markers fail closed. A successful trusted bootstrap copies
the Auth UUID and normalized email into one active Director profile. No email
domain is hard-coded for Directors: `@kclas.ac.in` and another syntactically
valid normalized domain are both accepted.

Bootstrap alone does not authorize dashboard access. The unchanged A1.1 RPCs
still derive `auth.uid()` and require the matching profile, exact Director role,
active status, and a verified Auth email through
`has_active_verified_kgeo_role('director')`. Admin remains a separate role and
has no Director authorization path.

A1.1.1 contains no Director UI, browser Auth-table access, service-role key,
credentials, runtime provisioning command, or role-mutation endpoint. The
future one-time institutional creation command must remain outside application
runtime and repository history. The migration and readiness changes are
prepared for controlled staging verification and have not been applied.

The prepared A1.1.1 migration SHA-256 is
`944e1fc3d71c93d983f41efc244e8814f2c489c47627a89c85f5339d56d83b8c`.
The prepared A1.1.1 canonical readiness SHA-256 is
`793e5fd9ce4dd81cfd42add1c639b67364b54bcdb4a0bc01c66cd37e388e2762`.

## Phase A1.1.2 secure one-time staff identity provisioning

Migration `supabase/migrations/202608060003_staff_identity_provisioning.sql`
supersedes the unapplied Director-only token draft and the A1.1.1 insert-time
app-metadata assumption. Public registration remains student-only and requires
the exact `@kct.ac.in` domain. It cannot create a counselor, Director, or
admin.

Protected provisioning supports exactly `counselor` and `director`. A
counselor must use an exact normalized `@kct.ac.in` address; a Director may use
any address satisfying the shared normalized email contract. Admin is not an
approved provisioning role.

The private `private.kgeo_staff_provisioning_requests` table stores the
normalized email, server-approved role, unique lowercase SHA-256 token hash,
short expiry, creation time, and optional consumption time. It never stores the
raw token. The table has RLS enabled with no policy and no direct grant to
PUBLIC, `anon`, `authenticated`, or `service_role`.

Only `service_role` may execute
`public.prepare_staff_identity_provisioning(text, public.user_role, text,
timestamptz)`. The volatile `SECURITY DEFINER` function validates the exact
staff allowlist, role-specific email policy, hash format, and maximum 15-minute
lifetime. It rejects an active request and permits replacement only after the
same-email request is expired or consumed. It returns no token, hash, or other
secret and does not create an Auth user or profile.

The Auth request transports only a 32-byte base64url token in the exact
`raw_user_meta_data.kgeo_staff_provisioning_token` field. The trigger hashes
that token, locks the matching email/hash row with `FOR UPDATE`, requires it to
be unexpired and unconsumed, and reads the approved role exclusively from that
private row. It rechecks the counselor/Director allowlist and email policy,
marks the request consumed, and inserts the matching active profile in the
same Auth transaction. A failed downstream insert rolls back consumption;
concurrent or replayed use fails closed.

User metadata and app metadata never select the profile role. The temporary
operational helper may retain `kgeo_provisioned_role` as audit-only app
metadata, but application authorization continues to use `profiles.role`, the
matching Auth UUID, active state, and verified email. Existing counselor and
Director authorization remains unchanged, and admin remains denied.

No staff-provisioning UI, route, Server Action, browser RPC caller, credential,
real staff email, token, or password is included. A1.2 has not started.
Migration 003 is applied to staging. Its live Auth insertion exposed a
PL/pgSQL `normalized_email` variable/table-column ambiguity; additive migration
`202608070001_staff_provisioning_trigger_ambiguity_fix.sql` replaces only
`public.handle_new_user()` with conflict-safe `v_` variables and qualified
private-request columns. The hotfix has not been applied by this repository
work.

The applied A1.1.2 foundation migration SHA-256 is
`2f3a4780c9056cb619e58e9c50ad4d0dd96063550faec68585ee1585b69573b0`.
The prepared A1.1.2 trigger hotfix migration SHA-256 is
`ef5ac6f499b680245565a287bc7115901895d559297b3f96106c66a8789f972a`.
The prepared A1.1.2 canonical readiness SHA-256 is
`77cbee1a6ceecd0c493a501d1405a9531055a3877942c98d4d22538ae14ff01f`.

## Phase A1.3 Director operational oversight foundation

Migration `supabase/migrations/202608090001_director_operational_oversight_foundation.sql`
adds three read-only, paginated Director RPCs. Each is `STABLE SECURITY
DEFINER`, owned by `postgres`, uses an empty search path, derives the caller
from `auth.uid()`, and requires
`has_active_verified_kgeo_role('director')`. PUBLIC and `anon` cannot execute
them; `authenticated` may invoke them only to reach the internal role check.
Admin, counselor, student, inactive, and unverified callers are not Director
callers.

`list_director_student_oversight(text, boolean, text, integer, integer)`
returns safe profile identity, account status and creation time, course,
department, graduation year, derived profile/progression state, and aggregate
consultation/application counts. It does not infer an assigned counselor
because the existing schema has no canonical student-to-counselor assignment
relationship.

`list_director_consultation_oversight(text, consultation_status, date, date,
integer, integer)` returns the request number, safe student and assigned-
counselor identity, schedule, lifecycle status, outcome-recorded timestamp,
and submission time. It excludes personal contact fields and outcome or
counselor narrative.

`list_director_application_oversight(text,
university_application_status, text, integer, integer)` returns safe student
identity, the counselor recorded as the last changer when that actor is a
counselor, university/program/intake/status/deadline fields, primary/archive
state, and operational timestamps. It excludes application references,
portal URLs, events, document metadata or contents, and change/archive
reasons.

All list RPCs accept pages 1 through 100,000 and page sizes 1 through 50; the
application UI uses 25. Search is trimmed, limited to 100 characters, rejects
control characters, and is applied only to safe display fields. Ordering is
stable with UUID tie-breakers. Consultation date ranges are ordered and
limited to 3,660 days. Application archive filtering is restricted to
`active`, `archived`, or `all`.

Counselor oversight reuses the bounded A1.1
`list_director_counselor_workload(integer)` RPC with a limit of 50. Follow-up
information remains aggregate-only. No A1.3 RPC selects counselor notes,
individual follow-up content, Auth metadata, provisioning data, application
documents, secrets, or service-role information. No table grants, RLS,
Student/Counselor workflow, scheduling behavior, or mutation contract changes.

The prepared A1.3 migration SHA-256 is
`74de642bf267dc9ae2798ec3c9a9bc158f2717275883d84efb1f106f563bb2ed`.
The prepared canonical readiness SHA-256 is
`18e29b82f421344e28f06630461ebde1cf2b347981e303a21f6abb5b9138ce7e`.

## Phase A1.4.1 consultation ownership and FCFS assignment

Migration `supabase/migrations/202608110001_consultation_ownership_fcfs_assignment.sql`
keeps the existing organization-wide fixed-slot capacity while making one
active, verified counselor the authoritative owner of each unresolved booked
consultation. New student bookings retain the selected date and 30-minute slot
but begin as `waiting_for_assignment` with no counselor. Student-controlled
input still cannot select a counselor or status.

`public.claim_next_consultation()` has no arguments and returns the claimed
consultation UUID, or null when there is no eligible work. The volatile
`SECURITY DEFINER` function is owned by `postgres`, uses an empty search path,
derives `auth.uid()`, and accepts only an exact active, verified counselor
profile. PUBLIC and `anon` cannot execute it. Authenticated callers reach the
internal role check; student, Director, admin, inactive, and unverified callers
are rejected.

FCFS order uses the existing trusted `submitted_at` timestamp, then the UUID as
a deterministic tie-breaker. The function locks the earliest eligible booked
row with `FOR UPDATE`, repeats the unowned assignment-pending and complete-slot
predicates during update, sets `assigned_counselor_id` and `assigned_at`, and
moves the booking to `scheduled`. No direct table-update privilege is added.

The replacement `record_consultation_outcome(uuid,text)` preserves existing
role, verification, time, outcome, locking, and audit behavior, and additionally
requires the caller to match `assigned_counselor_id` in both its locked read and
conditional update. There is no administrative override. Existing unresolved
`scheduled` rows without an owner enter the FCFS queue. Existing completed,
no-show, and cancelled history is not updated. Older unscheduled legacy requests
remain in the explicit student rebooking path and are not claimable.

Counselor dashboard metrics, today schedule, and next consultation are scoped
to the signed-in counselor. The separate FCFS queue offers one non-optimistic
`Claim next` action. The retained shared schedule is explicitly labeled
organization-wide and shows ownership without allowing another counselor to
record an outcome. Director workload already groups by non-null
`assigned_counselor_id`; unassigned work is therefore not falsely attributed,
and consultation oversight labels it as requiring an FCFS claim. Student copy
uses assignment-pending and awaiting-counselor-update language. Completed and
no-show records link to existing progression and follow-up sections without
automatically mutating either workflow.

The migration and updated readiness verification are prepared for controlled
staging review. No SQL has been applied by this implementation. The prepared
A1.4.1 migration SHA-256 is
`9f0e2d2250168cb6d84ce570a73a16014fc2f92cff2666868b43c5691356f1cc`.
The prepared normalized canonical readiness SHA-256 is
`c4845c8c55c941b8ad023db17ac199deb9e2df102449973bb90ff2ce169d5c2c`.

## Phase A1.4.2A Primary Counselor assignment foundation

Migration `supabase/migrations/202608120001_primary_counselor_assignment_foundation.sql`
introduces `public.student_counselor_assignments` as the canonical distinction
between long-term Student case responsibility and consultation-specific
ownership. The sealed, forced-RLS table contains only UUID relationships and
trusted audit timestamps. A partial unique index permits at most one active
assignment per Student while ended rows retain assignment history. The history
trigger validates exact Student and Counselor roles, rejects deletion and
identity rewriting, and permits only a one-way future `ended_at` transition.

The A1.4.1 `claim_next_consultation()` FCFS, authorization, row locking,
complete-slot eligibility, and consultation ownership behavior remain intact.
After a successful conditional consultation update, the same transaction
attempts to insert the Student's first Primary Counselor assignment. The active
unique index and partial-index `ON CONFLICT DO NOTHING` preserve any existing
Primary Counselor, including when a different Counselor later owns another
consultation for the Student. Any unexpected assignment failure rolls back the
entire claim transaction. No existing Student is backfilled and no historical
consultation or private case record is updated by the migration.

`list_my_primary_students(integer,integer)` returns a bounded safe projection
only for the active, verified Counselor caller's active assignments. The
existing organization-wide directory remains distinct. Two bounded Director-
only enrichment RPCs provide the Primary Counselor for already-bounded student
oversight rows and active-assignment counts for already-bounded Counselor
workload rows. They expose no notes, follow-up content, narrative, Auth
metadata, provisioning data, application event history, or documents.

A future separately reviewed Director operation may use the contract
`reassign_student_primary_counselor(p_student_id uuid,
p_new_counselor_id uuid, p_reason text) returns uuid`. It must authorize an
active verified Director, lock the Student and current active assignment, end
the old row once, insert a new row with the Director as `assigned_by`, and
preserve every historical consultation, note, follow-up, progression event,
application event, and document record. This RPC and all reassignment UI are
intentionally not implemented in A1.4.2A.

### A1.4.2B mutation review inventory

A1.4.2A deliberately does not change existing case-mutation authorization.
A1.4.2B must independently review:

- private-note and follow-up direct mutations plus
  `record_counselor_follow_up_status`;
- `record_student_counseling_progression`,
  `undo_latest_student_counseling_progression_event`, and progression evidence
  prepare/finalize/remove RPCs;
- `create_student_university_application`,
  `update_student_university_application_details`,
  `record_student_university_application_status`,
  `set_primary_student_university_application`, and
  `archive_student_university_application`;
- university-application document prepare/finalize/remove operations and their
  associated Storage mutation predicates.

The A1.4.2A migration SHA-256 is
`4ce059cde852c11e8a9f160e5b62a0c972481ffbca431f6b37c0e56e50cd6051`.
The prepared normalized readiness SHA-256 is
`e64e5e61072fa9e7a6270472b15541dfc56f1548e290501e940745abf44492ec`.

1. `202608180001_record_consultation_outcome_acl_alignment.sql`

## Parent Report Workflow V1 (202608250005)

`public.parent_reports`, `public.parent_report_events`, and
`public.parent_report_attachments` are sealed, forced-RLS relations. Browser
roles receive no direct table privileges or policies; all access is through
authenticated, `SECURITY DEFINER` workflow RPCs that re-derive either the
current active Primary Counselor or active Director role.

Creating a draft snapshots parent-safe facts from the verified Student
profile, preferences, achievements, test scores, official journey,
applications, and the matching semester summary. Counselor private notes and
individual follow-ups are deliberately not queried. The structured snapshot
does not change when editable report narrative changes.

The workflow is `draft` → `director_review` → `approved` → `finalized`, with
`revision_requested` returning control to the current Primary Counselor.
Finalized versions, their source snapshots, narrative, attachment manifests,
and PDFs are immutable. A correction is a new version for the same Student and
academic period.

The private `parent-report-attachments` bucket accepts PDF, JPEG, and PNG.
Report-specific uploads and explicitly selected existing safe documents are
manifested separately. A report-specific upload becomes available only when
the exact `storage.objects` row has the prepared path, size, and MIME type.
Available objects can be deleted only after the removal RPC records the
removal actor, timestamp, and audit event; pending cleanup remains uploader-
and workflow-bound. Final PDFs are uploaded through the server-only Admin
client and their live object size and PDF MIME metadata must match before the
report becomes finalized. Storage policies are installed by the Storage-owner
artifact `202608250005_parent_report_attachment_policies.sql`; the normal
migration does not alter `storage.objects` policies or ownership.
