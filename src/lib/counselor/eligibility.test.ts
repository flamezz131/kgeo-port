import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown,
) => unknown;
const { registerHooks } = require("node:module") as {
  registerHooks: (hooks: { resolve: ResolveHook }) => void;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/counselor/eligibility") {
      return {
        shortCircuit: true,
        url: new URL("./eligibility.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  normalizeEligibilityCountries,
  parseCounselorEligibilityAssessments,
  parseCounselorEligibilityLatest,
} = require("./eligibility.ts") as typeof import("./eligibility");
const {
  submitEligibilityAssessment,
  validateEligibilityAssessmentFormData,
} = require("./eligibility-submission.ts") as typeof import("./eligibility-submission");

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const ASSESSMENT_ID = "22222222-2222-4222-8222-222222222222";

function validForm(): FormData {
  const form = new FormData();
  form.set("studentId", STUDENT_ID);
  form.set("overallStatus", "conditionally_eligible");
  form.set("academicStatus", "meets_requirement");
  form.set("backlogStatus", "clear");
  form.set("englishReadiness", "in_progress");
  form.set("aptitudeReadiness", "not_required");
  form.set("profileStrength", "good");
  form.set("applicationReadiness", "partially_ready");
  form.set("recommendedCountries", " Germany,  United Kingdom ");
  form.set("recommendedIntake", " Fall   2027 ");
  form.set("assessmentSummary", " Strong academic profile.  Complete IELTS preparation. ");
  return form;
}

function assessment(
  id = ASSESSMENT_ID,
  assessedAt = "2026-08-22T10:00:00.000001+00:00",
) {
  return {
    assessment_id: id,
    overall_status: "conditionally_eligible",
    academic_status: "meets_requirement",
    backlog_status: "clear",
    english_readiness: "in_progress",
    aptitude_readiness: "not_required",
    profile_strength: "good",
    application_readiness: "partially_ready",
    recommended_countries: ["Germany", "United Kingdom"],
    recommended_intake: "Fall 2027",
    assessment_summary: "Strong academic profile. Complete IELTS preparation.",
    assessor_full_name: "Counselor Durga K",
    assessed_at: assessedAt,
  };
}

test("country input normalizes whitespace without duplicating Student preferences", () => {
  assert.deepEqual(normalizeEligibilityCountries(" Germany,  UK ,Ireland "), [
    "Germany",
    "UK",
    "Ireland",
  ]);
});

test("valid assessment input is typed normalized and contains no audit identity", () => {
  const result = validateEligibilityAssessmentFormData(validForm());
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data.recommendedCountries, ["Germany", "United Kingdom"]);
  assert.equal(result.data.recommendedIntake, "Fall 2027");
  assert.equal(result.data.assessmentSummary, "Strong academic profile. Complete IELTS preparation.");
  assert.equal("assessedBy" in result.data, false);
  assert.equal("assessedAt" in result.data, false);
});

test("duplicate excessive blank and oversized country values fail safely", () => {
  for (const countries of [
    "Germany, germany",
    Array.from({ length: 11 }, (_, index) => `Country ${index}`).join(","),
    `Country ${"x".repeat(81)}`,
    "Germany\nIreland",
  ]) {
    const form = validForm();
    form.set("recommendedCountries", countries);
    const result = validateEligibilityAssessmentFormData(form);
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.errors.recommendedCountries);
  }
});

test("empty recommended countries remain a valid bounded professional choice", () => {
  const form = validForm();
  form.set("recommendedCountries", "");
  const result = validateEligibilityAssessmentFormData(form);
  assert.equal(result.success, true);
  if (result.success) assert.deepEqual(result.data.recommendedCountries, []);
});

test("invalid enum values unknown fields and duplicate fields fail closed", () => {
  const invalidEnum = validForm();
  invalidEnum.set("overallStatus", "automatically_eligible");
  assert.equal(validateEligibilityAssessmentFormData(invalidEnum).success, false);

  const protectedField = validForm();
  protectedField.set("assessedBy", "attacker");
  assert.equal(validateEligibilityAssessmentFormData(protectedField).success, false);

  const duplicate = validForm();
  duplicate.append("academicStatus", "needs_review");
  assert.equal(validateEligibilityAssessmentFormData(duplicate).success, false);
});

test("empty oversized and control-character summaries fail safely", () => {
  for (const summary of ["", "x".repeat(1501), "Unsafe\nsummary"]) {
    const form = validForm();
    form.set("assessmentSummary", summary);
    const result = validateEligibilityAssessmentFormData(form);
    assert.equal(result.success, false);
    if (!result.success) assert.ok(result.errors.assessmentSummary);
  }
});

test("history parsing accepts deterministic newest-first immutable revisions", () => {
  const older = assessment(
    "33333333-3333-4333-8333-333333333333",
    "2026-08-12T10:00:00+00:00",
  );
  const parsed = parseCounselorEligibilityAssessments([assessment(), older]);
  assert.equal(parsed?.length, 2);
  assert.equal(parsed?.[0].assessment_id, ASSESSMENT_ID);
});

test("history parsing rejects duplicate unordered malformed and excessive rows", () => {
  const older = assessment(
    "33333333-3333-4333-8333-333333333333",
    "2026-08-12T10:00:00+00:00",
  );
  assert.equal(parseCounselorEligibilityAssessments([older, assessment()]), null);
  assert.equal(parseCounselorEligibilityAssessments([assessment(), assessment()]), null);
  assert.equal(parseCounselorEligibilityAssessments([{ ...assessment(), assessed_by: STUDENT_ID }]), null);
  assert.equal(parseCounselorEligibilityAssessments(Array.from({ length: 21 }, () => assessment())), null);
});

test("latest parser distinguishes no assessment from malformed or one valid latest row", () => {
  assert.equal(parseCounselorEligibilityLatest([]), null);
  assert.deepEqual(
    parseCounselorEligibilityLatest([
      {
        overall_status: "eligible",
        assessed_at: "2026-08-22T10:00:00+00:00",
      },
    ]),
    {
      overall_status: "eligible",
      assessed_at: "2026-08-22T10:00:00+00:00",
    },
  );
  assert.equal(parseCounselorEligibilityLatest([{}, {}]), undefined);
});

test("current Primary Counselor save appends through the trusted store", async () => {
  let saveCount = 0;
  const state = await submitEligibilityAssessment(validForm(), {
    verifyTarget: async () => ({ valid: true, error: null }),
    save: async (input) => {
      saveCount += 1;
      assert.equal(input.studentId, STUDENT_ID);
      return {
        data: [
          {
            assessment_id: ASSESSMENT_ID,
            assessed_at: "2026-08-22T10:00:00+00:00",
          },
        ],
        error: null,
      };
    },
  });
  assert.equal(state.status, "success");
  assert.equal(saveCount, 1);
});

test("unassigned or former Counselor denial never reaches the save operation", async () => {
  let saved = false;
  const state = await submitEligibilityAssessment(validForm(), {
    verifyTarget: async () => ({ valid: false, error: null }),
    save: async () => {
      saved = true;
      return { data: null, error: null };
    },
  });
  assert.equal(state.status, "error");
  assert.equal(saved, false);
});

test("database authorization and validation failures return bounded safe errors", async () => {
  for (const code of ["42501", "22023", "23514", "P0001"]) {
    const state = await submitEligibilityAssessment(validForm(), {
      verifyTarget: async () => ({ valid: true, error: null }),
      save: async () => ({ data: null, error: { code, message: "private database detail" } }),
    });
    assert.equal(state.status, "error");
    assert.doesNotMatch(state.message ?? "", /private database detail|sql|policy/i);
  }
});
