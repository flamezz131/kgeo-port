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
  submitOfficialProgressionMutation,
  validateOfficialProgressionFormData,
} = require("./progression-submission.ts") as typeof import("./progression-submission");

type OfficialProgressionCurrent =
  import("./progression").OfficialProgressionCurrent;
type OfficialProgressionQueryResult =
  import("./progression").OfficialProgressionQueryResult;
type CounselingProgressionStage =
  import("@/types").CounselingProgressionStage;
type CounselingProgressionState =
  import("@/types").CounselingProgressionState;

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_STUDENT_ID = "22222222-2222-4222-8222-222222222222";
const COUNSELOR_ID = "33333333-3333-4333-8333-333333333333";

function current(
  overrides: Partial<OfficialProgressionCurrent> = {},
): OfficialProgressionCurrent {
  return {
    student_id: STUDENT_ID,
    current_stage: "profile_review",
    workflow_state: "active",
    stage_started_at: "2026-07-25T05:00:00.000Z",
    last_changed_at: "2026-07-25T05:00:00.000Z",
    last_changed_by: COUNSELOR_ID,
    created_at: "2026-07-25T05:00:00.000Z",
    updated_at: "2026-07-25T05:00:00.000Z",
    ...overrides,
  };
}

function form(
  operation:
    | "initialize"
    | "change_stage"
    | "pause"
    | "resume"
    | "complete",
  options?: {
    reason?: string;
    stage?: string;
  },
) {
  const data = new FormData();
  data.set("studentId", STUDENT_ID);
  data.set("operation", operation);
  data.set("changeReason", options?.reason ?? "");
  if (operation === "initialize" || operation === "change_stage") {
    data.set("requestedStage", options?.stage ?? "goals_confirmed");
  }
  return data;
}

function store(options?: {
  currentData?: unknown;
  currentError?: unknown;
  mutationData?: unknown;
  mutationError?: unknown;
  targetValid?: boolean;
  targetError?: unknown;
  onRecord?: (
    studentId: string,
    stage: CounselingProgressionStage,
    state: CounselingProgressionState,
    reason: string | null,
  ) => void;
}) {
  return {
    verifyTarget: async () => ({
      valid: options?.targetValid ?? true,
      error: options?.targetError ?? null,
    }),
    loadCurrent: async (): Promise<OfficialProgressionQueryResult> => ({
      data:
        options && "currentData" in options
          ? options.currentData
          : current(),
      error: options?.currentError ?? null,
    }),
    record: async (
      studentId: string,
      stage: CounselingProgressionStage,
      state: CounselingProgressionState,
      reason: string | null,
    ): Promise<OfficialProgressionQueryResult> => {
      options?.onRecord?.(studentId, stage, state, reason);
      return {
        data:
          options && "mutationData" in options
            ? options.mutationData
            : current({
                current_stage: stage,
                workflow_state: state,
                stage_started_at: "2026-07-25T06:00:00.000Z",
                last_changed_at: "2026-07-25T06:00:00.000Z",
                updated_at: "2026-07-25T06:00:00.000Z",
              }),
        error: options?.mutationError ?? null,
      };
    },
  };
}

test("initialization derives active, normalizes reason, and permits a blank reason", async () => {
  const calls: unknown[][] = [];
  const normalized = await submitOfficialProgressionMutation(
    form("initialize", {
      stage: "pre_departure",
      reason: "  Initial   review  ",
    }),
    store({
      currentData: null,
      onRecord: (...args) => calls.push(args),
    }),
  );
  assert.equal(normalized.status, "success");
  assert.deepEqual(calls[0], [
    STUDENT_ID,
    "pre_departure",
    "active",
    "Initial review",
  ]);

  const blankCalls: unknown[][] = [];
  const blank = await submitOfficialProgressionMutation(
    form("initialize", { stage: "profile_review", reason: "   " }),
    store({
      currentData: null,
      onRecord: (...args) => blankCalls.push(args),
    }),
  );
  assert.equal(blank.status, "success");
  assert.equal(blankCalls[0][3], null);
});

test("reason length matches PostgreSQL characters rather than UTF-16 code units", async () => {
  const valid = await submitOfficialProgressionMutation(
    form("initialize", {
      stage: "profile_review",
      reason: "🙂".repeat(500),
    }),
    store({ currentData: null }),
  );
  assert.equal(valid.status, "success");

  const invalid = validateOfficialProgressionFormData(
    form("initialize", {
      stage: "profile_review",
      reason: "🙂".repeat(501),
    }),
  );
  assert.equal(invalid.success, false);
});

test("stage changes require active state, differ from current, and allow skipped or backward movement", async () => {
  const calls: unknown[][] = [];
  const skipped = await submitOfficialProgressionMutation(
    form("change_stage", { stage: "pre_departure" }),
    store({ onRecord: (...args) => calls.push(args) }),
  );
  assert.equal(skipped.status, "success");
  assert.deepEqual(calls[0].slice(1, 3), ["pre_departure", "active"]);

  const backward = await submitOfficialProgressionMutation(
    form("change_stage", { stage: "profile_review" }),
    store({
      currentData: current({
        current_stage: "pre_departure",
        stage_started_at: "2026-07-25T05:00:00.000Z",
      }),
    }),
  );
  assert.equal(backward.status, "success");

  for (const currentData of [
    current({ workflow_state: "on_hold" }),
    current({ workflow_state: "completed" }),
  ]) {
    const result = await submitOfficialProgressionMutation(
      form("change_stage"),
      store({ currentData }),
    );
    assert.equal(result.status, "error");
  }

  const unchanged = await submitOfficialProgressionMutation(
    form("change_stage", { stage: "profile_review" }),
    store(),
  );
  assert.match(unchanged.message ?? "", /different progression stage/i);
});

test("pause, resume, and complete preserve stage and derive only the allowed target state", async () => {
  const transitions: unknown[][] = [];
  const cases = [
    {
      operation: "pause" as const,
      currentData: current(),
      expectedState: "on_hold",
    },
    {
      operation: "resume" as const,
      currentData: current({ workflow_state: "on_hold" }),
      expectedState: "active",
    },
    {
      operation: "complete" as const,
      currentData: current(),
      expectedState: "completed",
    },
    {
      operation: "complete" as const,
      currentData: current({ workflow_state: "on_hold" }),
      expectedState: "completed",
    },
  ];

  for (const testCase of cases) {
    const result = await submitOfficialProgressionMutation(
      form(testCase.operation),
      store({
        currentData: testCase.currentData,
        onRecord: (...args) => transitions.push(args),
      }),
    );
    assert.equal(result.status, "success");
    assert.deepEqual(transitions.at(-1)?.slice(1, 3), [
      "profile_review",
      testCase.expectedState,
    ]);
  }

  const invalidPause = await submitOfficialProgressionMutation(
    form("pause"),
    store({ currentData: current({ workflow_state: "on_hold" }) }),
  );
  assert.match(invalidPause.message ?? "", /Only active progression/i);

  const invalidResume = await submitOfficialProgressionMutation(
    form("resume"),
    store(),
  );
  assert.match(invalidResume.message ?? "", /Only on-hold progression/i);
});

test("completed progression, missing current, and duplicate initialization fail safely", async () => {
  const completed = await submitOfficialProgressionMutation(
    form("complete"),
    store({ currentData: current({ workflow_state: "completed" }) }),
  );
  assert.match(completed.message ?? "", /cannot be changed/i);

  const missing = await submitOfficialProgressionMutation(
    form("pause"),
    store({ currentData: null }),
  );
  assert.match(missing.message ?? "", /has changed/i);

  const duplicate = await submitOfficialProgressionMutation(
    form("initialize"),
    store(),
  );
  assert.match(duplicate.message ?? "", /already been started/i);
});

test("strict FormData rejects duplicates, unknown/protected fields, invalid stages, and overlength reasons", () => {
  const invalidForms: FormData[] = [];
  for (const field of [
    "studentId",
    "operation",
    "changeReason",
    "requestedStage",
  ]) {
    const duplicate = form("initialize");
    duplicate.append(field, duplicate.get(field) ?? "");
    invalidForms.push(duplicate);
  }
  for (const field of [
    "counselorId",
    "actorId",
    "previousStage",
    "previousState",
    "targetState",
    "currentStage",
    "changedAt",
    "eventId",
    "progressPercentage",
    "redirect",
  ]) {
    const protectedField = form("initialize");
    protectedField.set(field, "injected");
    invalidForms.push(protectedField);
  }
  const invalidStage = form("initialize", { stage: "withdrawn" });
  invalidForms.push(invalidStage);
  const longReason = form("initialize", { reason: "x".repeat(501) });
  invalidForms.push(longReason);
  const injectedStage = form("pause");
  injectedStage.set("requestedStage", "pre_departure");
  invalidForms.push(injectedStage);

  for (const invalid of invalidForms) {
    assert.equal(
      validateOfficialProgressionFormData(invalid).success,
      false,
    );
  }
});

test("unknown or staff targets fail before reads and writes", async () => {
  let reads = 0;
  let writes = 0;
  const result = await submitOfficialProgressionMutation(form("pause"), {
    verifyTarget: async () => ({ valid: false, error: null }),
    loadCurrent: async () => {
      reads += 1;
      return { data: current(), error: null };
    },
    record: async () => {
      writes += 1;
      return { data: current(), error: null };
    },
  });
  assert.equal(result.status, "error");
  assert.equal(reads, 0);
  assert.equal(writes, 0);
});

test("RPC response ownership, target state, shape, and raw failures are validated", async () => {
  const invalidResults = [
    store({ mutationData: { ...current(), student_id: OTHER_STUDENT_ID } }),
    store({ mutationData: { ...current(), current_stage: "invalid" } }),
    store({ mutationData: current({ workflow_state: "active" }) }),
    store({ mutationData: null }),
  ];
  for (const invalidStore of invalidResults) {
    const result = await submitOfficialProgressionMutation(
      form("pause"),
      invalidStore,
    );
    assert.equal(result.status, "error");
    assert.equal(
      result.message,
      "Official progression could not be updated.",
    );
  }

  const concurrency = await submitOfficialProgressionMutation(
    form("pause"),
    store({ mutationError: { code: "40001", message: "private" } }),
  );
  assert.match(concurrency.message ?? "", /currently in progress/i);
  assert.doesNotMatch(concurrency.message ?? "", /private|40001/i);

  const changed = await submitOfficialProgressionMutation(
    form("pause"),
    store({ mutationError: { code: "22023", message: "private" } }),
  );
  assert.match(changed.message ?? "", /has changed/i);
  assert.doesNotMatch(changed.message ?? "", /private|22023/i);
});
