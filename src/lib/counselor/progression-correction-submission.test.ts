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
    if (specifier === "@/lib/counselor/progression") {
      return {
        shortCircuit: true,
        url: new URL("./progression.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  submitProgressionCorrection,
  validateProgressionCorrectionFormData,
} = require("./progression-correction-submission.ts") as typeof import("./progression-correction-submission");

const studentId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const correctionId = "33333333-3333-4333-8333-333333333333";

function form(reason = "Incorrect stage selected") {
  const data = new FormData();
  data.set("studentId", studentId);
  data.set("eventId", eventId);
  data.set("correctionReason", reason);
  return data;
}

function successfulRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    correction_id: correctionId,
    target_event_id: eventId,
    correction_type: "undo_transition",
    current_progression_exists: true,
    restored_stage: "profile_review",
    restored_state: "active",
    restored_stage_started_at: "2026-07-26T05:00:00.000Z",
    corrected_at: "2026-07-26T07:00:00.000Z",
    ...overrides,
  };
}

test("strict form validation normalizes reason and rejects duplicates or protected fields", () => {
  const valid = validateProgressionCorrectionFormData(
    form("  Incorrect   stage\nselected  "),
  );
  assert.deepEqual(valid, {
    success: true,
    data: {
      studentId,
      eventId,
      correctionReason: "Incorrect stage selected",
    },
  });

  for (const field of [
    "$ACTION_attacker",
    "counselorId",
    "correctionType",
    "correctionId",
    "restoredStage",
    "restoredState",
    "restoredStageStartedAt",
    "correctedAt",
    "currentProgressionExists",
    "studentName",
    "studentEmail",
    "evidenceState",
    "role",
    "redirect",
  ]) {
    const injected = form();
    injected.set(field, "attacker-controlled");
    assert.equal(
      validateProgressionCorrectionFormData(injected).success,
      false,
      field,
    );
  }

  for (const duplicated of ["studentId", "eventId", "correctionReason"]) {
    const data = form();
    data.append(duplicated, data.get(duplicated)!);
    assert.equal(
      validateProgressionCorrectionFormData(data).success,
      false,
      duplicated,
    );
  }
});

test("blank control-character and over-500-codepoint reasons fail before storage", () => {
  for (const reason of ["   ", "bad\u0000reason", "🙂".repeat(501)]) {
    assert.equal(
      validateProgressionCorrectionFormData(form(reason)).success,
      false,
    );
  }
  assert.equal(
    validateProgressionCorrectionFormData(form("🙂".repeat(500))).success,
    true,
  );
});

test("trusted target verification runs before the exact correction call", async () => {
  const calls: string[] = [];
  const result = await submitProgressionCorrection(form(), {
    verifyTarget: async (receivedStudentId, receivedEventId) => {
      calls.push(`verify:${receivedStudentId}:${receivedEventId}`);
      return { valid: true, error: null };
    },
    correct: async (receivedStudentId, receivedEventId, reason) => {
      calls.push(`correct:${receivedStudentId}:${receivedEventId}:${reason}`);
      return { data: successfulRow(), error: null };
    },
  });
  assert.equal(result.status, "success");
  assert.equal(result.correctionType, "undo_transition");
  assert.equal(calls.length, 2);
  assert.match(calls[0], /^verify:/);
  assert.match(calls[1], /^correct:/);
});

test("reset and undo response contracts are validated exactly", async () => {
  const reset = await submitProgressionCorrection(form(), {
    verifyTarget: async () => ({ valid: true, error: null }),
    correct: async () => ({
      data: successfulRow({
        correction_type: "reset_initialization",
        current_progression_exists: false,
        restored_stage: null,
        restored_state: null,
        restored_stage_started_at: null,
      }),
      error: null,
    }),
  });
  assert.deepEqual(reset, {
    status: "success",
    correctionType: "reset_initialization",
    message: "Official progression reset successfully.",
  });

  for (const malformed of [
    successfulRow({ target_event_id: correctionId }),
    successfulRow({ unexpected: true }),
    successfulRow({ current_progression_exists: false }),
    successfulRow({ corrected_at: "2026-02-30T07:00:00.000Z" }),
    successfulRow({
      restored_stage_started_at: "2026-07-26T25:00:00.000Z",
    }),
    successfulRow({
      correction_type: "reset_initialization",
      current_progression_exists: true,
      restored_stage: null,
      restored_state: null,
      restored_stage_started_at: null,
    }),
  ]) {
    const result = await submitProgressionCorrection(form(), {
      verifyTarget: async () => ({ valid: true, error: null }),
      correct: async () => ({ data: malformed, error: null }),
    });
    assert.equal(result.status, "error");
  }
});

test("authorization, concurrency, staleness, duplicate, and evidence failures are sanitized", async () => {
  const messages = new Set<string>();
  for (const code of [
    "42501",
    "40001",
    "K3401",
    "K3402",
    "K3404",
    "K3405",
    "K3406",
    "P0001",
  ]) {
    const result = await submitProgressionCorrection(form(), {
      verifyTarget: async () => ({ valid: true, error: null }),
      correct: async () => ({
        data: null,
        error: {
          code,
          message: "private database details",
          details: "secret constraint",
        },
      }),
    });
    assert.equal(result.status, "error");
    assert.doesNotMatch(result.message ?? "", /private|secret|constraint/i);
    messages.add(result.message ?? "");
  }
  assert.ok(messages.size >= 5);
});

test("an invalid target never invokes the correction RPC", async () => {
  let mutationCalls = 0;
  const result = await submitProgressionCorrection(form(), {
    verifyTarget: async () => ({ valid: false, error: null }),
    correct: async () => {
      mutationCalls += 1;
      return { data: successfulRow(), error: null };
    },
  });
  assert.equal(result.status, "error");
  assert.equal(mutationCalls, 0);
});
