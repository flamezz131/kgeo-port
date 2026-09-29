-- K-GEO Counselor Journey Progress and parent-safe Semester Summaries.
-- Reuses official progression/follow-up records and closes former-counselor
-- direct-read access before adding a separate append-only summary history.

begin;

drop policy counselor_student_notes_select_own
  on public.counselor_student_notes;

create policy counselor_student_notes_select_current_primary_own
on public.counselor_student_notes
for select
to authenticated
using (
  counselor_id = (select auth.uid())
  and (select public.is_active_primary_counselor_for_student(
    counselor_student_notes.student_id
  ))
);

drop policy counselor_follow_ups_select_own
  on public.counselor_follow_ups;

create policy counselor_follow_ups_select_current_primary_own
on public.counselor_follow_ups
for select
to authenticated
using (
  counselor_id = (select auth.uid())
  and (select public.is_active_primary_counselor_for_student(
    counselor_follow_ups.student_id
  ))
);

comment on policy counselor_student_notes_select_current_primary_own
  on public.counselor_student_notes is
  'A note author may read their private note only while they remain the student current active Primary Counselor.';

comment on policy counselor_follow_ups_select_current_primary_own
  on public.counselor_follow_ups is
  'A follow-up author may read their private action only while they remain the student current active Primary Counselor.';

create table public.counselor_student_semester_summaries (
  id uuid
    constraint counselor_student_semester_summaries_pkey primary key
    default pg_catalog.gen_random_uuid(),
  student_id uuid
    constraint counselor_student_semester_summaries_student_id_not_null
      not null
    constraint counselor_student_semester_summaries_student_id_fkey
      references public.profiles(id)
      on delete restrict,
  academic_period text
    constraint counselor_student_semester_summaries_academic_period_not_null
      not null,
  progress_summary text
    constraint counselor_student_semester_summaries_progress_summary_not_null
      not null,
  achievements_highlights text,
  areas_requiring_attention text,
  next_semester_actions text
    constraint counselor_student_semester_summaries_next_actions_not_null
      not null,
  created_by uuid
    constraint counselor_student_semester_summaries_created_by_not_null
      not null
    constraint counselor_student_semester_summaries_created_by_fkey
      references public.profiles(id)
      on delete restrict,
  created_at timestamptz
    constraint counselor_student_semester_summaries_created_at_not_null
      not null
    default pg_catalog.statement_timestamp(),

  constraint counselor_student_semester_summaries_distinct_people_check
    check (student_id <> created_by),
  constraint counselor_student_semester_summaries_academic_period_check
    check (
      academic_period = pg_catalog.regexp_replace(
        pg_catalog.btrim(academic_period),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(academic_period) between 1 and 80
    ),
  constraint counselor_student_semester_summaries_progress_summary_check
    check (
      progress_summary = pg_catalog.regexp_replace(
        pg_catalog.btrim(progress_summary),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(progress_summary) between 1 and 1500
    ),
  constraint counselor_student_semester_summaries_highlights_check
    check (
      achievements_highlights is null
      or (
        achievements_highlights = pg_catalog.regexp_replace(
          pg_catalog.btrim(achievements_highlights),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(achievements_highlights)
          between 1 and 1000
      )
    ),
  constraint counselor_student_semester_summaries_attention_check
    check (
      areas_requiring_attention is null
      or (
        areas_requiring_attention = pg_catalog.regexp_replace(
          pg_catalog.btrim(areas_requiring_attention),
          '[[:space:]]+',
          ' ',
          'g'
        )
        and pg_catalog.char_length(areas_requiring_attention)
          between 1 and 1000
      )
    ),
  constraint counselor_student_semester_summaries_next_actions_check
    check (
      next_semester_actions = pg_catalog.regexp_replace(
        pg_catalog.btrim(next_semester_actions),
        '[[:space:]]+',
        ' ',
        'g'
      )
      and pg_catalog.char_length(next_semester_actions) between 1 and 1000
    )
);

comment on table public.counselor_student_semester_summaries is
  'Append-only parent-safe Counselor Semester Summary revisions. Private Counselor Notes are never sourced or copied into this relation.';

create index counselor_student_semester_summaries_student_history_idx
  on public.counselor_student_semester_summaries (
    student_id,
    created_at desc,
    id desc
  );

alter table public.counselor_student_semester_summaries
  enable row level security;
alter table public.counselor_student_semester_summaries
  force row level security;

revoke all privileges on table
  public.counselor_student_semester_summaries
  from public, anon, authenticated, service_role;

create function public.record_counselor_student_semester_summary(
  p_student_id uuid,
  p_academic_period text,
  p_progress_summary text,
  p_achievements_highlights text,
  p_areas_requiring_attention text,
  p_next_semester_actions text
)
returns table (
  summary_id uuid,
  academic_period text,
  progress_summary text,
  achievements_highlights text,
  areas_requiring_attention text,
  next_semester_actions text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_caller_id uuid := (select auth.uid());
  v_academic_period text;
  v_progress_summary text;
  v_achievements_highlights text;
  v_areas_requiring_attention text;
  v_next_semester_actions text;
begin
  if p_student_id is null
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor access is required';
  end if;

  v_academic_period := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_academic_period),
    '[[:space:]]+',
    ' ',
    'g'
  );
  v_progress_summary := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_progress_summary),
    '[[:space:]]+',
    ' ',
    'g'
  );
  v_achievements_highlights := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_achievements_highlights),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  v_areas_requiring_attention := nullif(
    pg_catalog.regexp_replace(
      pg_catalog.btrim(p_areas_requiring_attention),
      '[[:space:]]+',
      ' ',
      'g'
    ),
    ''
  );
  v_next_semester_actions := pg_catalog.regexp_replace(
    pg_catalog.btrim(p_next_semester_actions),
    '[[:space:]]+',
    ' ',
    'g'
  );

  if v_caller_id is null
    or v_academic_period is null
    or v_progress_summary is null
    or v_next_semester_actions is null
    or pg_catalog.char_length(v_academic_period) not between 1 and 80
    or pg_catalog.char_length(v_progress_summary) not between 1 and 1500
    or (
      v_achievements_highlights is not null
      and pg_catalog.char_length(v_achievements_highlights) > 1000
    )
    or (
      v_areas_requiring_attention is not null
      and pg_catalog.char_length(v_areas_requiring_attention) > 1000
    )
    or pg_catalog.char_length(v_next_semester_actions) not between 1 and 1000
  then
    raise exception using
      errcode = '22023',
      message = 'The semester summary request is invalid';
  end if;

  return query
  insert into public.counselor_student_semester_summaries as summary (
    student_id,
    academic_period,
    progress_summary,
    achievements_highlights,
    areas_requiring_attention,
    next_semester_actions,
    created_by
  ) values (
    p_student_id,
    v_academic_period,
    v_progress_summary,
    v_achievements_highlights,
    v_areas_requiring_attention,
    v_next_semester_actions,
    v_caller_id
  )
  returning
    summary.id,
    summary.academic_period,
    summary.progress_summary,
    summary.achievements_highlights,
    summary.areas_requiring_attention,
    summary.next_semester_actions,
    summary.created_at;
end;
$function$;

create function public.get_counselor_student_semester_summaries(
  p_student_id uuid,
  p_limit integer default 20
)
returns table (
  summary_id uuid,
  academic_period text,
  progress_summary text,
  achievements_highlights text,
  areas_requiring_attention text,
  next_semester_actions text,
  counselor_full_name text,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_student_id is null
    or public.is_active_primary_counselor_for_student(p_student_id)
      is distinct from true then
    raise exception using
      errcode = '42501',
      message = 'Primary Counselor access is required';
  end if;

  if p_limit is null or p_limit < 1 or p_limit > 20 then
    raise exception using
      errcode = '22023',
      message = 'The semester summary request is invalid';
  end if;

  return query
  select
    summary.id,
    summary.academic_period,
    summary.progress_summary,
    summary.achievements_highlights,
    summary.areas_requiring_attention,
    summary.next_semester_actions,
    coalesce(counselor_profile.full_name, 'Counselor'),
    summary.created_at
  from public.counselor_student_semester_summaries as summary
  inner join public.profiles as counselor_profile
    on counselor_profile.id = summary.created_by
    and counselor_profile.role = 'counselor'::public.user_role
  where summary.student_id = p_student_id
  order by summary.created_at desc, summary.id desc
  limit p_limit;
end;
$function$;

alter function public.record_counselor_student_semester_summary(
  uuid,
  text,
  text,
  text,
  text,
  text
) owner to postgres;
alter function public.get_counselor_student_semester_summaries(uuid, integer)
  owner to postgres;

revoke all on function public.record_counselor_student_semester_summary(
  uuid,
  text,
  text,
  text,
  text,
  text
) from public, anon, authenticated, service_role;
revoke all on function public.get_counselor_student_semester_summaries(
  uuid,
  integer
) from public, anon, authenticated, service_role;

grant execute on function public.record_counselor_student_semester_summary(
  uuid,
  text,
  text,
  text,
  text,
  text
) to authenticated;
grant execute on function public.get_counselor_student_semester_summaries(
  uuid,
  integer
) to authenticated;

comment on function public.record_counselor_student_semester_summary(
  uuid,
  text,
  text,
  text,
  text,
  text
) is
  'Appends one parent-safe Semester Summary revision for a student current active Primary Counselor.';
comment on function public.get_counselor_student_semester_summaries(
  uuid,
  integer
) is
  'Returns bounded parent-safe Semester Summary history only to the student current active Primary Counselor.';

commit;
