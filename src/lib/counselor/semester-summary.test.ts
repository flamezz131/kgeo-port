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
    if (specifier === "@/lib/counselor/semester-summary") {
      return {
        shortCircuit: true,
        url: new URL("./semester-summary.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { parseCounselorSemesterSummaries } = require(
  "./semester-summary.ts",
) as typeof import("./semester-summary");
const {
  submitCounselorSemesterSummary,
  validateCounselorSemesterSummaryFormData,
} = require("./semester-summary-submission.ts") as typeof import("./semester-summary-submission");

const studentId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function validForm(): FormData {
  const formData = new FormData();
  formData.set("studentId", studentId);
  formData.set("academicPeriod", "  Semester 5   2026–27 ");
  formData.set("progressSummary", " Shortlisting   is progressing. ");
  formData.set("achievementsHighlights", " IELTS booked ");
  formData.set("areasRequiringAttention", "   ");
  formData.set("nextSemesterActions", " Finalize   the shortlist ");
  return formData;
}

test("Semester Summary input normalizes structured parent-safe fields", () => {
  const result = validateCounselorSemesterSummaryFormData(validForm());
  assert.equal(result.success, true);
  if (!result.success) return;
  assert.deepEqual(result.data, {
    studentId,
    academicPeriod: "Semester 5 2026–27",
    progressSummary: "Shortlisting is progressing.",
    achievementsHighlights: "IELTS booked",
    areasRequiringAttention: null,
    nextSemesterActions: "Finalize the shortlist",
  });
});

test("Semester Summary input fails closed on missing, duplicate, extra, and oversized fields", () => {
  const missing = validForm();
  missing.delete("progressSummary");
  assert.equal(validateCounselorSemesterSummaryFormData(missing).success, false);

  const duplicate = validForm();
  duplicate.append("academicPeriod", "Second value");
  assert.equal(validateCounselorSemesterSummaryFormData(duplicate).success, false);

  const extra = validForm();
  extra.set("privateNote", "must never be transported");
  assert.equal(validateCounselorSemesterSummaryFormData(extra).success, false);

  const oversized = validForm();
  oversized.set("nextSemesterActions", "x".repeat(1001));
  assert.equal(validateCounselorSemesterSummaryFormData(oversized).success, false);
});

test("Semester Summary submission verifies current ownership before the RPC save", async () => {
  const stages: string[] = [];
  const result = await submitCounselorSemesterSummary(validForm(), {
    verifyTarget: async (receivedStudentId) => {
      stages.push(`verify:${receivedStudentId}`);
      return { valid: true, error: null };
    },
    save: async (input) => {
      stages.push(`save:${input.studentId}`);
      return { data: [{ summary_id: "saved" }], error: null };
    },
  });
  assert.equal(result.status, "success");
  assert.deepEqual(stages, [`verify:${studentId}`, `save:${studentId}`]);
});

test("Semester Summary submission does not save after ownership denial", async () => {
  let saves = 0;
  const result = await submitCounselorSemesterSummary(validForm(), {
    verifyTarget: async () => ({ valid: false, error: null }),
    save: async () => {
      saves += 1;
      return { data: [], error: null };
    },
  });
  assert.equal(result.status, "error");
  assert.equal(saves, 0);
});

test("Semester Summary response parser accepts strict newest-first history only", () => {
  const newer = {
    summary_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    academic_period: "Semester 5",
    progress_summary: "Applications are being prepared.",
    achievements_highlights: null,
    areas_requiring_attention: "Complete SOP review.",
    next_semester_actions: "Submit two applications.",
    counselor_full_name: "Counselor A",
    created_at: "2026-08-24T10:00:00+05:30",
  };
  const older = {
    ...newer,
    summary_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    academic_period: "Semester 4",
    created_at: "2026-08-23T10:00:00+05:30",
  };
  assert.deepEqual(parseCounselorSemesterSummaries([newer, older]), [newer, older]);
  assert.equal(parseCounselorSemesterSummaries([older, newer]), null);
  assert.equal(
    parseCounselorSemesterSummaries([{ ...newer, private_note: "leak" }]),
    null,
  );
});
