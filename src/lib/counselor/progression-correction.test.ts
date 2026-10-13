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
    const localModules: Record<string, string> = {
      "@/lib/counselor/progression": "./progression.ts",
      "@/lib/counselor/progression-evidence": "./progression-evidence.ts",
    };
    const local = localModules[specifier];
    if (local) {
      return {
        shortCircuit: true,
        url: new URL(local, import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  PROGRESSION_CORRECTION_EVIDENCE_BLOCK_MESSAGE,
  buildOfficialProgressionHistoryPresentation,
} = require("./progression-correction.ts") as typeof import("./progression-correction");
type OfficialProgressionReadyResult =
  import("./progression").OfficialProgressionReadyResult;

const studentId = "11111111-1111-4111-8111-111111111111";
const counselorId = "22222222-2222-4222-8222-222222222222";
const initializationId = "33333333-3333-4333-8333-333333333333";
const latestId = "44444444-4444-4444-8444-444444444444";

function progression(
  overrides: Partial<OfficialProgressionReadyResult> = {},
): OfficialProgressionReadyResult {
  return {
    kind: "ready",
    current: {
      student_id: studentId,
      current_stage: "goals_confirmed",
      workflow_state: "active",
      stage_started_at: "2026-07-26T06:00:00.000Z",
      last_changed_at: "2026-07-26T06:00:00.000Z",
      last_changed_by: counselorId,
      created_at: "2026-07-26T05:00:00.000Z",
      updated_at: "2026-07-26T06:00:00.000Z",
    },
    events: [
      {
        id: latestId,
        student_id: studentId,
        previous_stage: "profile_review",
        new_stage: "goals_confirmed",
        previous_state: "active",
        new_state: "active",
        changed_by: counselorId,
        change_reason: null,
        changed_at: "2026-07-26T06:00:00.000Z",
      },
      {
        id: initializationId,
        student_id: studentId,
        previous_stage: null,
        new_stage: "profile_review",
        previous_state: null,
        new_state: "active",
        changed_by: counselorId,
        change_reason: "Initial review",
        changed_at: "2026-07-26T05:00:00.000Z",
      },
    ],
    eventCount: 2,
    page: 1,
    pageCount: 1,
    corrections: {
      kind: "ready",
      correctionByEvent: {},
      latestEffectiveEventId: latestId,
    },
    ...overrides,
  };
}

function evidence(
  block: "available" | "pending" | null = null,
) {
  return {
    kind: "ready" as const,
    evidenceByEvent: {
      [latestId]: [],
      [initializationId]: [],
    },
    correctionBlockByEvent: {
      [latestId]: block,
      [initializationId]: null,
    },
  };
}

test("only the latest effective non-initialization event offers undo", () => {
  const presentation = buildOfficialProgressionHistoryPresentation(
    progression(),
    evidence(),
  );
  assert.equal(presentation.events[0].correctionAction, "undo");
  assert.equal(presentation.events[1].correctionAction, null);
});

test("the sole effective initialization offers reset", () => {
  const initial = progression().events[1];
  const presentation = buildOfficialProgressionHistoryPresentation(
    progression({
      current: {
        ...progression().current!,
        current_stage: "profile_review",
        stage_started_at: initial.changed_at,
        last_changed_at: initial.changed_at,
        updated_at: initial.changed_at,
      },
      events: [initial],
      eventCount: 1,
      corrections: {
        kind: "ready",
        correctionByEvent: {},
        latestEffectiveEventId: initializationId,
      },
    }),
    {
      kind: "ready",
      evidenceByEvent: { [initializationId]: [] },
      correctionBlockByEvent: { [initializationId]: null },
    },
  );
  assert.equal(presentation.events[0].correctionAction, "reset");
});

test("available or unexpired pending evidence proactively blocks correction", () => {
  for (const block of ["available", "pending"] as const) {
    const presentation = buildOfficialProgressionHistoryPresentation(
      progression(),
      evidence(block),
    );
    assert.equal(presentation.events[0].correctionAction, null);
    assert.equal(presentation.events[0].evidenceBlock, block);
  }
  assert.match(
    PROGRESSION_CORRECTION_EVIDENCE_BLOCK_MESSAGE,
    /removed or allowed to expire/,
  );
});

test("a latest completion remains undoable only through audited correction", () => {
  const completedProgression = progression();
  const latest = completedProgression.events[0];
  const presentation = buildOfficialProgressionHistoryPresentation(
    progression({
      current: {
        ...completedProgression.current!,
        workflow_state: "completed",
      },
      events: [
        {
          ...latest,
          previous_state: "active",
          new_state: "completed",
        },
        completedProgression.events[1],
      ],
    }),
    evidence(),
  );
  assert.equal(presentation.events[0].correctionAction, "undo");
});

test("current-row absence after reset cannot expose a stale correction action", () => {
  const presentation = buildOfficialProgressionHistoryPresentation(
    progression({
      current: null,
      corrections: {
        kind: "ready",
        correctionByEvent: {},
        latestEffectiveEventId: initializationId,
      },
    }),
    evidence(),
  );
  assert.equal(
    presentation.events.every(
      (event) => event.correctionAction === null,
    ),
    true,
  );
});

test("unavailable correction or evidence metadata hides all correction controls", () => {
  const correctionUnavailable =
    buildOfficialProgressionHistoryPresentation(
      progression({ corrections: { kind: "unavailable" } }),
      evidence(),
    );
  assert.equal(
    correctionUnavailable.events.every(
      (event) => event.correctionAction === null,
    ),
    true,
  );

  const evidenceUnavailable =
    buildOfficialProgressionHistoryPresentation(progression(), {
      kind: "unavailable",
    });
  assert.equal(
    evidenceUnavailable.events.every(
      (event) => event.correctionAction === null,
    ),
    true,
  );
});

test("corrected history remains visible and only the next effective event becomes eligible", () => {
  const presentation = buildOfficialProgressionHistoryPresentation(
    progression({
      corrections: {
        kind: "ready",
        correctionByEvent: {
          [latestId]: {
            correctionType: "undo_transition",
            correctionReason: "The selected stage was incorrect",
            correctedAt: "2026-07-26T07:00:00.000Z",
          },
        },
        latestEffectiveEventId: initializationId,
      },
    }),
    evidence(),
  );
  assert.equal(presentation.events[0].correctionAction, null);
  assert.equal(
    presentation.events[0].correction?.correctionReason,
    "The selected stage was incorrect",
  );
  assert.equal(presentation.events[1].correctionAction, "reset");
});
