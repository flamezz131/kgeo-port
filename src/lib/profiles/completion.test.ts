import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { StudentProfileCompletionRow } from "./types";

const require = createRequire(import.meta.url);
const { buildProfileRequirementChecklist, mapProfileCompletion } = require(
  "./completion.ts"
) as typeof import("./completion");

const savedIdentity = {
  roll_number: "21BCS001",
  personal_email: "student@example.com",
  mobile_number: "9876543210",
  college: "Kumaraguru College of Technology",
  course: "B.E.",
  department: "Computer Science and Engineering",
  graduation_year: 2027,
  cgpa: null,
  cgpa_unavailable: false,
};

function completionRow(
  overrides: Partial<StudentProfileCompletionRow> = {},
): StudentProfileCompletionRow {
  return {
    student_id: "student-id",
    profile_status: "draft",
    academic_section_complete: false,
    preferences_section_complete: false,
    test_scores_section_started: false,
    achievements_section_started: false,
    essential_fields_completed: 4,
    essential_fields_total: 11,
    overall_completion_percentage: 36,
    ready_for_counseling: false,
    ...overrides,
  };
}

test("maps no profile to a not-started dashboard state", () => {
  const presentation = mapProfileCompletion(null, false);
  assert.equal(presentation.state, "not_started");
  assert.equal(presentation.percentage, 0);
  assert.equal(presentation.ctaLabel, "Start Profile");
  assert.equal(presentation.hints.length, 3);
});

test("maps an incomplete view row without recalculating its percentage", () => {
  const presentation = mapProfileCompletion(completionRow(), true);
  assert.equal(presentation.state, "in_progress");
  assert.equal(presentation.percentage, 36);
  assert.equal(presentation.completedFields, 4);
  assert.equal(presentation.totalFields, 11);
  assert.equal(presentation.ctaLabel, "Continue Profile");
  assert.deepEqual(presentation.hints, [
    "Complete your Academic Portfolio",
    "Complete your higher-studies preferences",
  ]);
});

test("maps database-derived readiness to review profile", () => {
  const presentation = mapProfileCompletion(
    completionRow({
      academic_section_complete: true,
      preferences_section_complete: true,
      essential_fields_completed: 11,
      overall_completion_percentage: 100,
      ready_for_counseling: true,
    }),
    true,
  );

  assert.equal(presentation.state, "ready");
  assert.equal(presentation.readyForCounseling, true);
  assert.equal(presentation.ctaLabel, "Review Profile");
  assert.deepEqual(presentation.hints, []);
});

test("stored submitted state takes precedence in presentation", () => {
  const presentation = mapProfileCompletion(
    completionRow({
      profile_status: "submitted",
      academic_section_complete: true,
      preferences_section_complete: true,
      overall_completion_percentage: 100,
      ready_for_counseling: true,
    }),
    true,
  );

  assert.equal(presentation.state, "submitted");
  assert.equal(presentation.title, "Profile submitted");
  assert.equal(presentation.ctaLabel, "View Profile");
});

test("existing profile remains in progress when its completion view row is absent", () => {
  const presentation = mapProfileCompletion(null, true);
  assert.equal(presentation.state, "in_progress");
  assert.equal(presentation.ctaLabel, "Continue Profile");
  assert.equal(presentation.readyForCounseling, false);
});

test("malformed completion rows fail closed instead of claiming readiness", () => {
  const malformed = {
    ...completionRow({
      profile_status: "submitted",
      academic_section_complete: true,
      preferences_section_complete: true,
      ready_for_counseling: true,
    }),
    overall_completion_percentage: 500,
  };
  const presentation = mapProfileCompletion(malformed, true);

  assert.equal(presentation.state, "in_progress");
  assert.equal(presentation.percentage, 0);
  assert.equal(presentation.readyForCounseling, false);
  assert.equal(presentation.ctaLabel, "Continue Profile");
});

test("requirement checklist marks every essential field missing before a profile exists", () => {
  const [academic, preferences, readiness] = buildProfileRequirementChecklist(
    { academicComplete: false, preferencesComplete: false, readyForCounseling: false },
    null,
    null,
  );

  assert.equal(academic.label, "Academic section");
  assert.equal(academic.complete, false);
  assert.equal(academic.items.length, 8);
  assert.ok(academic.items.every((item) => !item.complete));
  assert.equal(preferences.label, "Preferences");
  assert.equal(preferences.items.length, 3);
  assert.ok(preferences.items.every((item) => !item.complete));
  assert.equal(readiness.label, "Ready for counseling");
  assert.equal(readiness.complete, false);
  assert.deepEqual(readiness.items, []);
});

test("requirement checklist isolates the fields still required", () => {
  const [academic, preferences] = buildProfileRequirementChecklist(
    { academicComplete: false, preferencesComplete: false, readyForCounseling: false },
    savedIdentity,
    {
      higher_studies_interest: "interested",
      preferred_study_level: null,
      target_intake: null,
    },
  );

  assert.deepEqual(
    academic.items.filter((item) => !item.complete).map((item) => item.label),
    ["CGPA"],
  );
  assert.deepEqual(
    preferences.items
      .filter((item) => !item.complete)
      .map((item) => item.label),
    ["Study level", "Target intake"],
  );
  assert.deepEqual(
    academic.items.filter((item) => !item.complete).map((item) => item.step),
    ["academics"],
  );
});

test("requirement checklist accepts an unavailable CGPA", () => {
  const [academic] = buildProfileRequirementChecklist(
    { academicComplete: false, preferencesComplete: false, readyForCounseling: false },
    { ...savedIdentity, cgpa_unavailable: true },
    null,
  );

  assert.ok(academic.items.every((item) => item.complete));
});

test("requirement checklist defers to database-derived section status", () => {
  const [academic, preferences, readiness] = buildProfileRequirementChecklist(
    { academicComplete: true, preferencesComplete: true, readyForCounseling: true },
    savedIdentity,
    null,
  );

  assert.equal(academic.complete, true);
  assert.ok(academic.items.every((item) => item.complete));
  assert.equal(preferences.complete, true);
  assert.ok(preferences.items.every((item) => item.complete));
  assert.equal(readiness.complete, true);
});
