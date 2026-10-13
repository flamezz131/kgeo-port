-- K-GEO student preferences: Preferred Courses and Field of Study Preference.
--
-- Adds the two preferences the Personal Recommendation intake already asks for,
-- so a student can record them once on My Profile and the PR intake can be
-- pre-filled from here instead of re-asking.
--
--   preferred_courses  degree programmes the student is considering. Bounded
--                      and canonicalised by the same validator as
--                      preferred_countries / preferred_program_areas.
--   same_as_ug         true  = continue in the undergraduate field of study
--                      false = explore a different field
--                      null  = not answered yet
--
-- Safe to run on a database built from these migrations AND on one where
-- `same_as_ug` was already added by hand (it exists on the live K-GEO project
-- without a migration). Every step is conditional, so the file can also be
-- re-run without error.
--
-- No row data is modified. Nothing is granted to anon or PUBLIC.

begin;

alter table public.student_preferences
  add column if not exists preferred_courses text[]
    constraint student_preferences_courses_not_null not null
    default '{}'::text[],
  add column if not exists same_as_ug boolean;

-- Align a hand-added same_as_ug with this contract: an unanswered question is
-- null, so the column must be nullable and must not default to an answer.
-- Existing values are left exactly as they are.
alter table public.student_preferences
  alter column same_as_ug drop not null,
  alter column same_as_ug drop default;

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint as existing
    where existing.conname = 'student_preferences_courses_check'
      and existing.conrelid = 'public.student_preferences'::pg_catalog.regclass
  ) then
    alter table public.student_preferences
      add constraint student_preferences_courses_check
        check (
          public.is_valid_student_profile_text_array(
            preferred_courses,
            10,
            120
          )
        );
  end if;
end;
$migration$;

comment on column public.student_preferences.preferred_courses is
  'Student-selected degree programmes, max 10, each 1-120 trimmed characters, case-insensitively unique.';

comment on column public.student_preferences.same_as_ug is
  'Field of Study Preference: true continues the undergraduate field, false explores a different field, null is unanswered.';

-- Column grants are idempotent. They are required for same_as_ug as well:
-- a hand-added column is not covered by the original column-level grants.
grant insert (preferred_courses, same_as_ug)
  on public.student_preferences to authenticated;

grant update (preferred_courses, same_as_ug)
  on public.student_preferences to authenticated;

commit;
