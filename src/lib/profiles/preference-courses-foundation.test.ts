import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const migration = read(
  "../../../supabase/migrations/202609210001_student_preference_courses_and_field.sql",
);
const onboarding = read("../../components/forms/student-profile-onboarding.tsx");
const profilePage = read("../../app/student/profile/page.tsx");
const submission = read("./submission.ts");
const prIntakePage = read("../../app/student/pr/intake/page.tsx");
const prIntakeWizard = read("../../app/student/pr/intake/PrIntakeWizard.tsx");
const executable = migration.replace(/--.*$/gm, "");

test("migration adds both preference columns with the shared array guard", () => {
  assert.match(
    executable,
    /add column if not exists preferred_courses text\[\][\s\S]*?not null[\s\S]*?default '\{\}'::text\[\]/,
  );
  assert.match(executable, /add column if not exists same_as_ug boolean;/);
  assert.match(
    executable,
    /student_preferences_courses_check[\s\S]*?is_valid_student_profile_text_array\(\s*preferred_courses,\s*10,\s*120\s*\)/,
  );
});

test("migration applies over a hand-added same_as_ug and can be re-run", () => {
  // same_as_ug exists on the live project without a migration, so every step
  // must be conditional: columns, the check constraint, and the grants.
  assert.equal(executable.match(/add column if not exists/g)?.length, 2);
  assert.match(
    executable,
    /if not exists \(\s*select 1\s*from pg_catalog\.pg_constraint[\s\S]*?student_preferences_courses_check/,
  );
  // An unanswered question must stay null, so a hand-added column is aligned.
  assert.match(executable, /alter column same_as_ug drop not null/);
  assert.match(executable, /alter column same_as_ug drop default/);
});

test("students may write the new columns and nobody else gains access", () => {
  assert.match(
    executable,
    /grant insert \(preferred_courses, same_as_ug\)\s+on public\.student_preferences to authenticated;/,
  );
  assert.match(
    executable,
    /grant update \(preferred_courses, same_as_ug\)\s+on public\.student_preferences to authenticated;/,
  );
  assert.doesNotMatch(executable, /\bto\s+(?:anon|public)\b/i);
});

test("migration never removes data, objects, or access", () => {
  assert.doesNotMatch(
    executable,
    /\b(?:drop (?:table|column|constraint|policy|trigger|function|index|type)|rename|revoke|delete|update public\.|truncate|create or replace|alter policy|create policy|create trigger)\b/i,
  );
  // The only alterations to an existing column relax it.
  assert.deepEqual(
    [...executable.matchAll(/alter column (\w+) (drop \w+(?: \w+)?)/g)].map((m) => `${m[1]} ${m[2]}`),
    ["same_as_ug drop not null", "same_as_ug drop default"],
  );
  assert.match(executable, /^\s*begin;/m);
  assert.match(executable, /^\s*commit;/m);
});

test("My Profile reads and posts both preferences", () => {
  assert.match(profilePage, /preferred_program_areas[\s\S]*?same_as_ug, domain_specializations/);
  assert.match(onboarding, /<CourseCombobox/);
  assert.match(onboarding, /name="preferredProgramAreas"/);
  assert.equal(onboarding.match(/name="sameAsUg"/g)?.length, 2);
  assert.match(onboarding, /value="true"/);
  assert.match(onboarding, /value="false"/);
  assert.match(onboarding, /Field of Study Preference/);
  assert.match(onboarding, /allCourses=\{sortedCourses\}/);
  // The tab posts courses as program areas; the save mirrors them into
  // preferred_courses so the PR intake pre-fill keeps working.
  assert.match(submission, /preferred_courses: validation\.data\.preferredProgramAreas/);
});

test("PR intake reviews the saved profile instead of re-asking it", () => {
  assert.match(prIntakePage, /loadStudentContextForPR\(user\.id, supabase\)/);
  assert.match(prIntakeWizard, /\/api\/recommendations\/pr-generate/);
  assert.match(prIntakeWizard, /ctx\.preferences\?\.preferredCourses/);
});
