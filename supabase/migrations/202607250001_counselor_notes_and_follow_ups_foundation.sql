-- K-GEO Phase D1 counselor-private notes and follow-up foundation.
-- Review this migration before applying it. Apply it only after the existing
-- identity, student-profile, counselor-directory, consultation-outcome, and
-- counselor consultation-reference migrations.
--
-- This migration is additive. It creates counselor-owned internal records and
-- does not alter student-submitted data, consultation rows, or existing roles.

begin;

create type public.counselor_follow_up_priority as enum (
  'low',
  'normal',
  'high'
);

create type public.counselor_follow_up_status as enum (
  'pending',
  'completed',
  'cancelled'
);

comment on type public.counselor_follow_up_priority is
  'Counselor-controlled priority for one private student follow-up.';

comment on type public.counselor_follow_up_status is
  'Stored follow-up workflow state. Due-today and overdue are derived in Asia/Kolkata and are never stored.';

create table public.counselor_student_notes (
  id uuid
    constraint counselor_student_notes_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint counselor_student_notes_student_id_not_null not null
    constraint counselor_student_notes_student_id_fkey
      references public.profiles(id)
      on delete restrict,
  counselor_id uuid
    constraint counselor_student_notes_counselor_id_not_null not null
    constraint counselor_student_notes_counselor_id_fkey
      references public.profiles(id)
      on delete restrict,
  consultation_id uuid
    constraint counselor_student_notes_consultation_id_fkey
      references public.consultation_requests(id)
      on delete set null,
  note_text text
    constraint counselor_student_notes_note_text_not_null not null,
  is_pinned boolean
    constraint counselor_student_notes_is_pinned_not_null not null
    default false,
  created_at timestamptz
    constraint counselor_student_notes_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint counselor_student_notes_updated_at_not_null not null
    default pg_catalog.now(),

  constraint counselor_student_notes_distinct_people_check
    check (student_id <> counselor_id),
  constraint counselor_student_notes_note_text_check
    check (
      note_text = pg_catalog.regexp_replace(
        pg_catalog.btrim(note_text),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(note_text) between 1 and 5000
    ),
  constraint counselor_student_notes_updated_at_check
    check (updated_at >= created_at)
);

create table public.counselor_follow_ups (
  id uuid
    constraint counselor_follow_ups_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint counselor_follow_ups_student_id_not_null not null
    constraint counselor_follow_ups_student_id_fkey
      references public.profiles(id)
      on delete restrict,
  counselor_id uuid
    constraint counselor_follow_ups_counselor_id_not_null not null
    constraint counselor_follow_ups_counselor_id_fkey
      references public.profiles(id)
      on delete restrict,
  consultation_id uuid
    constraint counselor_follow_ups_consultation_id_fkey
      references public.consultation_requests(id)
      on delete set null,
  due_date date
    constraint counselor_follow_ups_due_date_not_null not null,
  priority public.counselor_follow_up_priority
    constraint counselor_follow_ups_priority_not_null not null
    default 'normal'::public.counselor_follow_up_priority,
  status public.counselor_follow_up_status
    constraint counselor_follow_ups_status_not_null not null
    default 'pending'::public.counselor_follow_up_status,
  next_action text
    constraint counselor_follow_ups_next_action_not_null not null,
  details text,
  completed_at timestamptz,
  completed_by uuid
    constraint counselor_follow_ups_completed_by_fkey
      references public.profiles(id)
      on delete restrict,
  created_at timestamptz
    constraint counselor_follow_ups_created_at_not_null not null
    default pg_catalog.now(),
  updated_at timestamptz
    constraint counselor_follow_ups_updated_at_not_null not null
    default pg_catalog.now(),

  constraint counselor_follow_ups_distinct_people_check
    check (student_id <> counselor_id),
  constraint counselor_follow_ups_due_date_check
    check (due_date >= date '2000-01-01'),
  constraint counselor_follow_ups_next_action_check
    check (
      next_action = pg_catalog.regexp_replace(
        pg_catalog.btrim(next_action),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(next_action) between 1 and 500
    ),
  constraint counselor_follow_ups_details_check
    check (
      details is null
      or (
        details = pg_catalog.regexp_replace(
          pg_catalog.btrim(details),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(details) between 1 and 2000
      )
    ),
  constraint counselor_follow_ups_completion_state_check
    check (
      (
        status = 'completed'::public.counselor_follow_up_status
        and completed_at is not null
        and completed_by is not null
        and completed_by = counselor_id
      )
      or (
        status in (
          'pending'::public.counselor_follow_up_status,
          'cancelled'::public.counselor_follow_up_status
        )
        and completed_at is null
        and completed_by is null
      )
    ),
  constraint counselor_follow_ups_completed_at_check
    check (
      completed_at is null
      or completed_at between created_at and updated_at
    ),
  constraint counselor_follow_ups_updated_at_check
    check (updated_at >= created_at)
);

comment on table public.counselor_student_notes is
  'Counselor-owned internal notes that are never visible to students, admins, directors, or anonymous callers.';

comment on table public.counselor_follow_ups is
  'Counselor-owned internal student follow-up actions with database-controlled final status audit.';

comment on column public.counselor_student_notes.counselor_id is
  'Trusted owner derived from auth.uid() by the database trigger.';

comment on column public.counselor_student_notes.consultation_id is
  'Optional internal link. The trigger requires the consultation to belong to the same student.';

comment on column public.counselor_follow_ups.counselor_id is
  'Trusted owner derived from auth.uid() by the database trigger.';

comment on column public.counselor_follow_ups.consultation_id is
  'Optional internal link. The trigger requires the consultation to belong to the same student.';

comment on column public.counselor_follow_ups.completed_at is
  'Trusted completion timestamp set only by record_counselor_follow_up_status.';

comment on column public.counselor_follow_ups.completed_by is
  'Trusted completing counselor derived from auth.uid() by record_counselor_follow_up_status.';

-- SECURITY: this shared trigger is the trusted ownership and target boundary
-- for both D1 tables. It derives counselor ownership, requires an active,
-- email-confirmed counselor, confirms that the target is a student profile,
-- and verifies every optional consultation link against that same student.
-- Protected ownership and audit values are never accepted from the browser.
create function public.prepare_counselor_private_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  change_time timestamptz;
begin
  caller_id := (select auth.uid());
  change_time := pg_catalog.statement_timestamp();

  if caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  if new.student_id is null or not exists (
    select 1
    from public.profiles as student_profile
    where student_profile.id = new.student_id
      and student_profile.role = 'student'::public.user_role
  ) then
    raise exception using
      errcode = '22023',
      message = 'A valid student target is required';
  end if;

  if new.consultation_id is not null and not exists (
    select 1
    from public.consultation_requests as consultation
    where consultation.id = new.consultation_id
      and consultation.student_id = new.student_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'The linked consultation is invalid';
  end if;

  if tg_op = 'INSERT' then
    new.counselor_id := caller_id;
    new.created_at := change_time;
    new.updated_at := change_time;

    if tg_table_name = 'counselor_follow_ups' then
      new.status := 'pending'::public.counselor_follow_up_status;
      new.completed_at := null;
      new.completed_by := null;
    end if;
  else
    if old.counselor_id <> caller_id
      or new.counselor_id is distinct from old.counselor_id
      or new.student_id is distinct from old.student_id
      or new.created_at is distinct from old.created_at then
      raise exception using
        errcode = '42501',
        message = 'The counselor record cannot be changed';
    end if;

    if tg_table_name = 'counselor_follow_ups' then
      if old.status <> 'pending'::public.counselor_follow_up_status then
        raise exception using
          errcode = '40001',
          message = 'The follow-up changed concurrently';
      end if;

      if new.status = 'pending'::public.counselor_follow_up_status then
        if new.completed_at is not null or new.completed_by is not null then
          raise exception using
            errcode = '22023',
            message = 'The follow-up audit is invalid';
        end if;
      elsif new.status = 'completed'::public.counselor_follow_up_status then
        if new.completed_at is null or new.completed_by <> caller_id then
          raise exception using
            errcode = '22023',
            message = 'The follow-up audit is invalid';
        end if;
      elsif new.status = 'cancelled'::public.counselor_follow_up_status then
        if new.completed_at is not null or new.completed_by is not null then
          raise exception using
            errcode = '22023',
            message = 'The follow-up audit is invalid';
        end if;
      else
        raise exception using
          errcode = '22023',
          message = 'The follow-up status is invalid';
      end if;
    end if;

    new.updated_at := change_time;
  end if;

  return new;
end;
$function$;

alter function public.prepare_counselor_private_record()
  owner to postgres;

comment on function public.prepare_counselor_private_record() is
  'Derives D1 counselor ownership and timestamps and validates student and consultation targets.';

create function public.normalize_counselor_student_note()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.note_text := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.note_text),
    '[[:space:]]+',
    ' ',
    'g'
  );
  return new;
end;
$function$;

comment on function public.normalize_counselor_student_note() is
  'Normalizes private-note whitespace before constraints run.';

create function public.normalize_counselor_follow_up()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.next_action := pg_catalog.regexp_replace(
    pg_catalog.btrim(new.next_action),
    '[[:space:]]+',
    ' ',
    'g'
  );
  new.details := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(new.details),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  return new;
end;
$function$;

comment on function public.normalize_counselor_follow_up() is
  'Normalizes follow-up action and optional detail text before constraints run.';

create trigger counselor_student_notes_10_prepare
before insert or update on public.counselor_student_notes
for each row
execute function public.prepare_counselor_private_record();

create trigger counselor_student_notes_20_normalize
before insert or update on public.counselor_student_notes
for each row
execute function public.normalize_counselor_student_note();

create trigger counselor_follow_ups_10_prepare
before insert or update on public.counselor_follow_ups
for each row
execute function public.prepare_counselor_private_record();

create trigger counselor_follow_ups_20_normalize
before insert or update on public.counselor_follow_ups
for each row
execute function public.normalize_counselor_follow_up();

create index counselor_student_notes_student_history_idx
  on public.counselor_student_notes (
    student_id,
    is_pinned desc,
    created_at desc,
    id
  );

create index counselor_student_notes_counselor_activity_idx
  on public.counselor_student_notes (
    counselor_id,
    updated_at desc,
    id
  );

create index counselor_follow_ups_student_status_due_idx
  on public.counselor_follow_ups (
    student_id,
    status,
    due_date,
    id
  );

create index counselor_follow_ups_counselor_status_due_idx
  on public.counselor_follow_ups (
    counselor_id,
    status,
    due_date,
    id
  );

comment on index public.counselor_student_notes_student_history_idx is
  'Supports bounded pinned-first private-note history for one student.';

comment on index public.counselor_student_notes_counselor_activity_idx is
  'Supports future bounded counselor-owned note activity queries.';

comment on index public.counselor_follow_ups_student_status_due_idx is
  'Supports one student follow-up history grouped by status and due date.';

comment on index public.counselor_follow_ups_counselor_status_due_idx is
  'Supports future counselor-owned pending and due-date work lists.';

-- SECURITY: final follow-up state is not directly updateable. This function
-- derives the caller, locks one owned row, permits only the first transition
-- from pending to completed/cancelled, and sets completion audit in the same
-- transaction. A second concurrent transition observes the final row and
-- fails without overwriting the first result.
create function public.record_counselor_follow_up_status(
  p_follow_up_id uuid,
  p_status text
)
returns public.counselor_follow_up_status
language plpgsql
security definer
set search_path = ''
as $function$
declare
  caller_id uuid;
  requested_status public.counselor_follow_up_status;
  target_counselor_id uuid;
  target_status public.counselor_follow_up_status;
  transition_time timestamptz;
begin
  caller_id := (select auth.uid());

  if caller_id is null or not exists (
    select 1
    from public.profiles as counselor_profile
    inner join auth.users as counselor_auth
      on counselor_auth.id = counselor_profile.id
    where counselor_profile.id = caller_id
      and counselor_profile.role = 'counselor'::public.user_role
      and counselor_profile.is_active is true
      and counselor_auth.email_confirmed_at is not null
  ) then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  end if;

  if p_follow_up_id is null
    or p_status is null
    or p_status not in ('completed', 'cancelled') then
    raise exception using
      errcode = '22023',
      message = 'A valid follow-up status is required';
  end if;

  select
    follow_up.counselor_id,
    follow_up.status
  into
    target_counselor_id,
    target_status
  from public.counselor_follow_ups as follow_up
  where follow_up.id = p_follow_up_id
  for update;

  if not found
    or target_counselor_id <> caller_id
    or target_status <> 'pending'::public.counselor_follow_up_status then
    raise exception using
      errcode = '22023',
      message = 'The follow-up status cannot be changed';
  end if;

  requested_status := p_status::public.counselor_follow_up_status;
  transition_time := pg_catalog.statement_timestamp();

  update public.counselor_follow_ups as follow_up
  set
    status = requested_status,
    completed_at = case
      when requested_status =
        'completed'::public.counselor_follow_up_status
      then transition_time
      else null
    end,
    completed_by = case
      when requested_status =
        'completed'::public.counselor_follow_up_status
      then caller_id
      else null
    end
  where follow_up.id = p_follow_up_id
    and follow_up.counselor_id = caller_id
    and follow_up.status =
      'pending'::public.counselor_follow_up_status
  returning follow_up.status into target_status;

  if not found then
    raise exception using
      errcode = '40001',
      message = 'The follow-up changed concurrently';
  end if;

  return target_status;
exception
  when insufficient_privilege then
    raise exception using
      errcode = '42501',
      message = 'An active verified counselor profile is required';
  when invalid_parameter_value or check_violation then
    raise exception using
      errcode = '22023',
      message = 'The follow-up status cannot be changed';
  when serialization_failure then
    raise exception using
      errcode = '40001',
      message = 'The follow-up changed concurrently';
  when others then
    raise exception using
      errcode = 'P0001',
      message = 'The follow-up status could not be recorded';
end;
$function$;

alter function public.record_counselor_follow_up_status(uuid, text)
  owner to postgres;

comment on function public.record_counselor_follow_up_status(uuid, text) is
  'Allows only an active verified owning counselor to finalize one pending follow-up as completed or cancelled.';

alter table public.counselor_student_notes enable row level security;
alter table public.counselor_follow_ups enable row level security;

revoke all privileges on table public.counselor_student_notes
  from public, anon, authenticated;
revoke all privileges on table public.counselor_follow_ups
  from public, anon, authenticated;

revoke all privileges on type public.counselor_follow_up_priority
  from public, anon;
revoke all privileges on type public.counselor_follow_up_status
  from public, anon;

revoke all on function public.prepare_counselor_private_record()
  from public, anon, authenticated;
revoke all on function public.normalize_counselor_student_note()
  from public, anon, authenticated;
revoke all on function public.normalize_counselor_follow_up()
  from public, anon, authenticated;
revoke all on function public.record_counselor_follow_up_status(uuid, text)
  from public, anon, authenticated;

grant usage on type public.counselor_follow_up_priority
  to authenticated;
grant usage on type public.counselor_follow_up_status
  to authenticated;

grant select on table public.counselor_student_notes
  to authenticated;
grant insert (
  student_id,
  consultation_id,
  note_text,
  is_pinned
) on table public.counselor_student_notes
  to authenticated;
grant update (
  consultation_id,
  note_text,
  is_pinned
) on table public.counselor_student_notes
  to authenticated;
grant delete on table public.counselor_student_notes
  to authenticated;

grant select on table public.counselor_follow_ups
  to authenticated;
grant insert (
  student_id,
  consultation_id,
  due_date,
  priority,
  next_action,
  details
) on table public.counselor_follow_ups
  to authenticated;
grant update (
  consultation_id,
  due_date,
  priority,
  next_action,
  details
) on table public.counselor_follow_ups
  to authenticated;

grant execute on function public.record_counselor_follow_up_status(uuid, text)
  to authenticated;

create policy counselor_student_notes_select_own
on public.counselor_student_notes
for select
to authenticated
using (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy counselor_student_notes_insert_own
on public.counselor_student_notes
for insert
to authenticated
with check (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy counselor_student_notes_update_own
on public.counselor_student_notes
for update
to authenticated
using (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
)
with check (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy counselor_student_notes_delete_own
on public.counselor_student_notes
for delete
to authenticated
using (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy counselor_follow_ups_select_own
on public.counselor_follow_ups
for select
to authenticated
using (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy counselor_follow_ups_insert_own
on public.counselor_follow_ups
for insert
to authenticated
with check (
  counselor_id = (select auth.uid())
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

create policy counselor_follow_ups_update_pending_own
on public.counselor_follow_ups
for update
to authenticated
using (
  counselor_id = (select auth.uid())
  and status = 'pending'::public.counselor_follow_up_status
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
)
with check (
  counselor_id = (select auth.uid())
  and status = 'pending'::public.counselor_follow_up_status
  and (select public.has_active_verified_kgeo_role(
    'counselor'::public.user_role
  ))
);

comment on policy counselor_student_notes_select_own
  on public.counselor_student_notes is
  'An active verified counselor can read only notes they own.';

comment on policy counselor_student_notes_insert_own
  on public.counselor_student_notes is
  'An active verified counselor can insert only a trigger-owned note.';

comment on policy counselor_student_notes_update_own
  on public.counselor_student_notes is
  'An active verified counselor can update only their own note; column grants protect ownership and timestamps.';

comment on policy counselor_student_notes_delete_own
  on public.counselor_student_notes is
  'An active verified counselor can explicitly delete only their own note.';

comment on policy counselor_follow_ups_select_own
  on public.counselor_follow_ups is
  'An active verified counselor can read only follow-ups they own.';

comment on policy counselor_follow_ups_insert_own
  on public.counselor_follow_ups is
  'An active verified counselor can insert only a trigger-owned pending follow-up.';

comment on policy counselor_follow_ups_update_pending_own
  on public.counselor_follow_ups is
  'An active verified counselor can directly edit only approved columns on their own pending follow-up.';

-- Students, anonymous users, admins, and directors have no D1 policies.
-- Follow-ups have no DELETE grant or policy. Final status and completion audit
-- are writable only through record_counselor_follow_up_status(uuid, text).
-- Although every signed-in application identity uses PostgreSQL role
-- authenticated, the own-counselor RLS predicates make student/admin/director
-- direct PostgREST reads return no D1 rows and reject every mutation.

commit;
