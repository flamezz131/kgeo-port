import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { StudentProfileCompletionRow } from "./types";

const require = createRequire(import.meta.url);
const { mapProfileCompletion } = require(
  "./completion.ts"
) as typeof import("./completion");

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
