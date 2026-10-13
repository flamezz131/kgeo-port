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
    if (specifier === "@/lib/counselor/global-readiness") {
      return { shortCircuit: true, url: new URL("./global-readiness.ts", import.meta.url).href };
    }
    return nextResolve(specifier, context);
  },
});

const {
  GLOBAL_READINESS_CRITERIA,
  getGlobalReadinessBand,
  parseGlobalReadinessEvidence,
} = require("./global-readiness.ts") as typeof import("./global-readiness");
const {
  submitGlobalReadinessAssessment,
  validateGlobalReadinessFormData,
} = require("./global-readiness-submission.ts") as typeof import("./global-readiness-submission");

function validFormData() {
  const formData = new FormData();
  for (const criterion of GLOBAL_READINESS_CRITERIA) {
    formData.set(`${criterion.key}Score`, "1");
    formData.set(`${criterion.key}Rationale`, "Reviewed by the Primary Counselor.");
  }
  formData.set("assessmentRationale", "Overall professional assessment.");
  formData.set("parentSafeSummary", "Safe future summary.");
  return formData;
}

test("rubric constants contain exactly thirteen criteria totaling 100", () => {
  assert.equal(GLOBAL_READINESS_CRITERIA.length, 13);
  assert.equal(GLOBAL_READINESS_CRITERIA.reduce((sum, criterion) => sum + criterion.maximum, 0), 100);
});

test("band boundaries are exact", () => {
  const cases = [[49, "early_readiness"], [50, "developing_readiness"], [64, "developing_readiness"], [65, "competitive_readiness"], [74, "competitive_readiness"], [75, "advanced_readiness"], [84, "advanced_readiness"], [85, "global_distinction"], [100, "global_distinction"]] as const;
  for (const [score, band] of cases) assert.equal(getGlobalReadinessBand(score), band);
});

test("all scores must be one bounded integer value", () => {
  for (const invalid of ["", "1.5", "-1", "16", "one"]) {
    const formData = validFormData();
    formData.set("academicReadinessScore", invalid);
    assert.equal(validateGlobalReadinessFormData(formData).success, false);
  }
  const duplicate = validFormData();
  duplicate.append("applicationGmapScore", "2");
  assert.equal(validateGlobalReadinessFormData(duplicate).success, false);
});

test("browser ownership totals band snapshots and timestamps are rejected", () => {
  for (const injected of ["studentId", "counselorId", "assessedBy", "revisionNumber", "totalScore", "readinessBand", "evidenceSnapshot", "primaryAssignmentId", "assessedAt"]) {
    const formData = validFormData();
    formData.set(injected, "attacker-controlled");
    const result = validateGlobalReadinessFormData(formData);
    assert.equal(result.success, false, injected);
  }
});

test("submission authorizes before save and returns generic ownership failure", async () => {
  let saved = false;
  const state = await submitGlobalReadinessAssessment(validFormData(), {
    verifyTarget: async () => ({ valid: false, error: null }),
    save: async () => {
      saved = true;
      return { data: null, error: null };
    },
  });
  assert.equal(saved, false);
  assert.equal(state.status, "error");
  assert.equal(state.message, "Readiness assessment could not be created.");
});

test("valid assessment is passed to trusted storage without derived fields", async () => {
  let savedInput: unknown;
  const state = await submitGlobalReadinessAssessment(validFormData(), {
    verifyTarget: async () => ({ valid: true, error: null }),
    save: async (input) => {
      savedInput = input;
      return {
        data: {
          assessmentId: "30000000-0000-4000-8000-000000000001",
          revisionNumber: 1,
          totalScore: 13,
          readinessBand: "early_readiness",
          assessedAt: "2026-09-02T10:00:00+05:30",
        },
        error: null,
      };
    },
  });
  assert.equal(state.status, "success");
  assert.deepEqual(Object.keys(savedInput as object).sort(), ["assessmentRationale", "parentSafeSummary", "rationales", "scores"]);
});

test("evidence parser requires all criteria and preserves Not recorded", () => {
  const criteria = Object.fromEntries(GLOBAL_READINESS_CRITERIA.map((criterion) => [criterion.key, { recorded: false, facts: ["Not recorded"] }]));
  const parsed = parseGlobalReadinessEvidence({ schemaVersion: 1, criteria });
  assert.ok(parsed);
  assert.equal(parsed.criteria.applicationGmap.recorded, false);
  assert.deepEqual(parsed.criteria.applicationGmap.facts, ["Not recorded"]);
  assert.equal(parseGlobalReadinessEvidence({ schemaVersion: 1, criteria: {} }), null);
});
