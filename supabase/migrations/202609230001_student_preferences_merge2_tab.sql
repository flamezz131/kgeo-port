-- K-GEO student preferences: adopt the K-GEO-merge2 Preferences tab contract.
--
-- The student My Profile > Preferences tab now saves the merge2 field set:
--
--   preferred_study_level   gains 'global_track' (Global Track Programme)
--   global_track_duration   '1_year_abroad' | '2_years_abroad', only asked
--                           when the study level is Global Track
--   domain_specializations  free-text specializations, max 10 x 120 chars
--   funding_method          gains education_loan, scholarship_fully_funded,
--                           scholarship_partially_funded and other
--   study_mode              full_time / part_time / either are current again
--
-- The Profile V2 input-contract trigger required preferred_study_area,
-- preferred_domain, study_pathway and funding_method on every save and only
-- allowed on_campus / online study modes. The merge2 tab does not collect
-- those fields, so the trigger is removed. The V2 columns, their check
-- constraints and all existing row data are left untouched.
--
-- Safe on the live project, where domain_specializations was added by hand
-- without a migration: every step is conditional and the file can be re-run.
--
-- New enum labels are only added here, never used, so ALTER TYPE ... ADD
-- VALUE is valid inside this transaction. Nothing is granted to anon or PUBLIC.

begin;

drop trigger if exists student_preferences_25_enforce_v2_input
  on public.student_preferences;
drop function if exists public.enforce_student_preference_v2_input_contract();

alter type public.student_preferred_study_level
  add value if not exists 'global_track' before 'other';

alter type public.student_funding_method
  add value if not exists 'education_loan';
alter type public.student_funding_method
  add value if not exists 'scholarship_fully_funded';
alter type public.student_funding_method
  add value if not exists 'scholarship_partially_funded';
alter type public.student_funding_method
  add value if not exists 'other';

alter table public.student_preferences
  add column if not exists domain_specializations text[]
    default '{}'::text[],
  add column if not exists global_track_duration text;

do $migration$
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint as existing
    where existing.conname = 'student_preferences_domain_specializations_check'
      and existing.conrelid = 'public.student_preferences'::pg_catalog.regclass
  ) then
    -- NOT VALID: rows written before this migration (the column was
    -- hand-added on the live project) are not re-checked; new writes are.
    alter table public.student_preferences
      add constraint student_preferences_domain_specializations_check
        check (
          domain_specializations is null
          or public.is_valid_student_profile_text_array(
            domain_specializations,
            10,
            120
          )
        ) not valid;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as existing
    where existing.conname = 'student_preferences_global_track_duration_check'
      and existing.conrelid = 'public.student_preferences'::pg_catalog.regclass
  ) then
    alter table public.student_preferences
      add constraint student_preferences_global_track_duration_check
        check (
          global_track_duration is null
          or global_track_duration in ('1_year_abroad', '2_years_abroad')
        ) not valid;
  end if;
end;
$migration$;

comment on column public.student_preferences.domain_specializations is
  'Student-selected domain specializations, max 10, each 1-120 characters.';

comment on column public.student_preferences.global_track_duration is
  'Global Track Programme duration (1_year_abroad or 2_years_abroad); set only when preferred_study_level is global_track.';

-- Column grants are idempotent and also cover the hand-added column.
grant insert (domain_specializations, global_track_duration)
  on public.student_preferences to authenticated;

grant update (domain_specializations, global_track_duration)
  on public.student_preferences to authenticated;

commit;
