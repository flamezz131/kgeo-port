import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  COUNSELING_PROGRESSION_STAGE_PERCENTAGES,
  COUNSELING_PROGRESSION_STAGES,
  OFFICIAL_PROGRESSION_PAGE_SIZE,
  buildOfficialProgressionUrl,
  fetchCounselorStudentProgression,
  getOfficialProgressionPercentage,
  isOfficialProgressionPageCanonical,
  parseOfficialProgressionCurrent,
  parseOfficialProgressionPage,
} = require("./progression.ts") as typeof import("./progression");

type OfficialProgressionDataSource =
  import("./progression").OfficialProgressionDataSource;
type OfficialProgressionEvent =
  import("./progression").OfficialProgressionEvent;

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_STUDENT_ID = "22222222-2222-4222-8222-222222222222";
const COUNSELOR_ID = "33333333-3333-4333-8333-333333333333";

function current(overrides: Record<string, unknown> = {}) {
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

function initialization(
  overrides: Partial<OfficialProgressionEvent> = {},
): OfficialProgressionEvent {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    student_id: STUDENT_ID,
    previous_stage: null,
    new_stage: "profile_review",
    previous_state: null,
    new_state: "active",
    changed_by: COUNSELOR_ID,
    change_reason: "Initial review",
    changed_at: "2026-07-25T05:00:00.000Z",
    ...overrides,
  };
}

function source(options?: {
  currentData?: unknown;
  currentError?: unknown;
  events?: unknown;
  historyError?: unknown;
  correctionContext?: unknown;
  correctionError?: unknown;
  count?: unknown;
  onRange?: (from: number, to: number) => void;
  onCorrectionLoad?: (eventIds: string[]) => void;
}): OfficialProgressionDataSource {
  let loadedEvents: unknown =
    options && "events" in options ? options.events : [initialization()];
  return {
    loadCurrent: async () => ({
      data:
        options && "currentData" in options
          ? options.currentData
          : current(),
      error: options?.currentError ?? null,
    }),
    loadHistory: async (from, to) => {
      options?.onRange?.(from, to);
      const events =
        options && "events" in options
          ? options.events
          : [initialization()];
      loadedEvents = events;
      return {
        data: events,
        error: options?.historyError ?? null,
        count:
          options && "count" in options
            ? options.count
            : Array.isArray(events)
              ? events.length
              : 0,
      };
    },
    loadCorrectionContext: async (eventIds) => {
      options?.onCorrectionLoad?.(eventIds);
      const events = Array.isArray(loadedEvents)
        ? loadedEvents.filter(
            (event): event is OfficialProgressionEvent =>
              typeof event === "object" &&
              event !== null &&
              "id" in event &&
              typeof event.id === "string",
          )
        : [];
      const latest = events[0] ?? null;
      return {
        data:
          options && "correctionContext" in options
            ? options.correctionContext
            : eventIds.map((eventId) => ({
                target_event_id: eventId,
                correction_id: null,
                correction_type: null,
                restored_stage: null,
                restored_state: null,
                restored_stage_started_at: null,
                correction_reason: null,
                corrected_at: null,
                effective_event_exists: latest !== null,
                latest_effective_event_id: latest?.id ?? null,
                latest_effective_stage: latest?.new_stage ?? null,
                latest_effective_state: latest?.new_state ?? null,
                latest_effective_changed_at: latest?.changed_at ?? null,
                latest_effective_changed_by: latest?.changed_by ?? null,
                total_correction_count: 0,
              })),
        error: options?.correctionError ?? null,
      };
    },
  };
}

test("no current progression and no history is a legitimate page-one state", async () => {
  const result = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({ currentData: null, events: [], count: 0 }),
  );
  assert.deepEqual(result, {
    kind: "ready",
    current: null,
    events: [],
    eventCount: 0,
    page: 1,
    pageCount: 1,
    corrections: {
      kind: "ready",
      correctionByEvent: {},
      latestEffectiveEventId: null,
    },
  });
});

test("valid active, on-hold, completed, stage-change, and state-change histories pass", async () => {
  const stageChange: OfficialProgressionEvent = {
    id: "55555555-5555-4555-8555-555555555555",
    student_id: STUDENT_ID,
    previous_stage: "profile_review",
    new_stage: "goals_confirmed",
    previous_state: "active",
    new_state: "active",
    changed_by: COUNSELOR_ID,
    change_reason: null,
    changed_at: "2026-07-25T06:00:00.000Z",
  };
  const pause: OfficialProgressionEvent = {
    ...stageChange,
    id: "66666666-6666-4666-8666-666666666666",
    previous_stage: "goals_confirmed",
    new_stage: "goals_confirmed",
    previous_state: "active",
    new_state: "on_hold",
    changed_at: "2026-07-25T07:00:00.000Z",
  };
  const completion: OfficialProgressionEvent = {
    ...pause,
    id: "77777777-7777-4777-8777-777777777777",
    previous_state: "on_hold",
    new_state: "completed",
    changed_at: "2026-07-25T08:00:00.000Z",
  };
  const resume: OfficialProgressionEvent = {
    ...pause,
    id: "88888888-8888-4888-8888-888888888888",
    previous_state: "on_hold",
    new_state: "active",
    changed_at: "2026-07-25T08:00:00.000Z",
  };
  const cases = [
    {
      currentData: current(),
      events: [initialization()],
    },
    {
      currentData: current({
        current_stage: "goals_confirmed",
        stage_started_at: stageChange.changed_at,
        last_changed_at: stageChange.changed_at,
        updated_at: stageChange.changed_at,
      }),
      events: [stageChange, initialization()],
    },
    {
      currentData: current({
        current_stage: "goals_confirmed",
        workflow_state: "on_hold",
        stage_started_at: stageChange.changed_at,
        last_changed_at: pause.changed_at,
        updated_at: pause.changed_at,
      }),
      events: [pause, stageChange, initialization()],
    },
    {
      currentData: current({
        current_stage: "goals_confirmed",
        workflow_state: "active",
        stage_started_at: stageChange.changed_at,
        last_changed_at: resume.changed_at,
        updated_at: resume.changed_at,
      }),
      events: [resume, pause, stageChange, initialization()],
    },
    {
      currentData: current({
        current_stage: "goals_confirmed",
        workflow_state: "completed",
        stage_started_at: stageChange.changed_at,
        last_changed_at: completion.changed_at,
        updated_at: completion.changed_at,
      }),
      events: [completion, pause, stageChange, initialization()],
    },
  ];

  for (const testCase of cases) {
    const result = await fetchCounselorStudentProgression(
      STUDENT_ID,
      1,
      source({
        currentData: testCase.currentData,
        events: testCase.events,
        count: testCase.events.length,
      }),
    );
    assert.equal(result.kind, "ready");
  }
});

test("microsecond event ordering and current-history equality preserve PostgreSQL precision", async () => {
  const initialEvent = initialization({
    id: "ffffffff-ffff-4fff-bfff-ffffffffffff",
    changed_at: "2026-07-25T05:00:00.000001Z",
  });
  const stageChange: OfficialProgressionEvent = {
    id: "00000000-0000-4000-8000-000000000000",
    student_id: STUDENT_ID,
    previous_stage: "profile_review",
    new_stage: "goals_confirmed",
    previous_state: "active",
    new_state: "active",
    changed_by: COUNSELOR_ID,
    change_reason: null,
    changed_at: "2026-07-25T05:00:00.000002Z",
  };
  const validCurrent = current({
    current_stage: "goals_confirmed",
    created_at: initialEvent.changed_at,
    stage_started_at: stageChange.changed_at,
    last_changed_at: stageChange.changed_at,
    updated_at: stageChange.changed_at,
  });

  const valid = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({
      currentData: validCurrent,
      events: [stageChange, initialEvent],
      count: 2,
    }),
  );
  assert.equal(valid.kind, "ready");

  const mismatched = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({
      currentData: {
        ...validCurrent,
        last_changed_at: "2026-07-25T05:00:00.000003Z",
        updated_at: "2026-07-25T05:00:00.000003Z",
      },
      events: [stageChange, initialEvent],
      count: 2,
    }),
  );
  assert.deepEqual(mismatched, { kind: "unavailable" });
});

test("loader uses one bounded page range and exact count for canonical pagination", async () => {
  let selectedRange: [number, number] | null = null;
  const result = await fetchCounselorStudentProgression(
    STUDENT_ID,
    2,
    source({
      events: [initialization()],
      count: 21,
      onRange: (from, to) => {
        selectedRange = [from, to];
      },
    }),
  );

  assert.equal(OFFICIAL_PROGRESSION_PAGE_SIZE, 20);
  assert.deepEqual(selectedRange, [20, 39]);
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.page, 2);
  assert.equal(result.pageCount, 2);
});

test("out-of-range pages redirect deterministically while malformed pages canonicalize to one", async () => {
  const outOfRange = await fetchCounselorStudentProgression(
    STUDENT_ID,
    3,
    source({ events: [initialization()], count: 21 }),
  );
  assert.deepEqual(outOfRange, { kind: "out_of_range", finalPage: 2 });

  for (const value of [
    undefined,
    "",
    "0",
    "-1",
    "1.5",
    "1e2",
    "100001",
    ["1", "2"],
  ]) {
    assert.equal(parseOfficialProgressionPage(value), 1);
  }
  assert.equal(parseOfficialProgressionPage("20"), 20);
  assert.equal(isOfficialProgressionPageCanonical(undefined, 1), true);
  assert.equal(isOfficialProgressionPageCanonical("1", 1), true);
  assert.equal(isOfficialProgressionPageCanonical("20", 20), true);
  assert.equal(
    isOfficialProgressionPageCanonical(["1", "2"], 1),
    false,
  );
  assert.equal(isOfficialProgressionPageCanonical("01", 1), false);
  assert.equal(isOfficialProgressionPageCanonical("100001", 1), false);
});

test("approved progression URLs preserve only bounded Student 360 page parameters", () => {
  const url = buildOfficialProgressionUrl(STUDENT_ID, {
    historyPage: 2,
    notesPage: 3,
    followUpsPage: 4,
    progressionPage: 5,
  });
  assert.equal(
    url,
    `/counselor/students/${STUDENT_ID}/advisory?historyPage=2&notesPage=3&followUpsPage=4&progressionPage=5#official-progression`,
  );
  assert.doesNotMatch(
    url,
    /stage|state|reason|email|name|actor|redirect/i,
  );
});

test("every stage percentage, no-row, active, on-hold, and completed rule is exact", () => {
  const expected = {
    profile_review: 3,
    initial_counseling: 5,
    goals_confirmed: 7,
    country_exploration: 8,
    program_shortlisting: 9,
    university_shortlisting: 10,
    test_preparation: 15,
    document_preparation: 20,
    application_ready: 30,
    application_in_progress: 40,
    offer_evaluation: 50,
    visa_preparation: 75,
    pre_departure: 85,
  } as const;
  assert.deepEqual(COUNSELING_PROGRESSION_STAGE_PERCENTAGES, expected);
  assert.equal(getOfficialProgressionPercentage(null, null), 0);
  for (const stage of COUNSELING_PROGRESSION_STAGES) {
    assert.equal(
      getOfficialProgressionPercentage(stage, "active"),
      expected[stage],
    );
    assert.equal(
      getOfficialProgressionPercentage(stage, "on_hold"),
      expected[stage],
    );
    assert.equal(
      getOfficialProgressionPercentage(stage, "completed"),
      100,
    );
  }
});

test("current validation rejects malformed ownership and timestamp contracts", () => {
  assert.equal(
    parseOfficialProgressionCurrent(current(), STUDENT_ID)?.student_id,
    STUDENT_ID,
  );
  for (const value of [
    current({ student_id: OTHER_STUDENT_ID }),
    current({ student_id: "not-a-uuid" }),
    current({ current_stage: "withdrawn" }),
    current({ workflow_state: "paused" }),
    current({ stage_started_at: "invalid" }),
    current({ stage_started_at: "2026-02-30T05:00:00.000Z" }),
    current({ stage_started_at: "2026-07-25T05:00:00.0000001Z" }),
    current({
      created_at: "2026-07-25T06:00:00.000Z",
      stage_started_at: "2026-07-25T05:00:00.000Z",
    }),
    current({
      last_changed_at: "2026-07-25T05:00:00.000001Z",
      updated_at: "2026-07-25T05:00:00.000002Z",
    }),
    current({ updated_at: "2026-07-25T05:00:01.000Z" }),
  ]) {
    assert.equal(parseOfficialProgressionCurrent(value, STUDENT_ID), null);
  }
});

test("reason validation follows PostgreSQL character length for Unicode text", async () => {
  const validReason = "🙂".repeat(500);
  const valid = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({
      events: [initialization({ change_reason: validReason })],
    }),
  );
  assert.equal(valid.kind, "ready");

  const invalid = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({
      events: [
        initialization({ change_reason: `${validReason}🙂` }),
      ],
    }),
  );
  assert.deepEqual(invalid, { kind: "unavailable" });
});

test("all malformed current/history/count/error cases fail closed", async () => {
  const validCurrent = current();
  const validInitialization = initialization();
  const invalidCases = [
    source({ currentData: { ...validCurrent, current_stage: "invalid" } }),
    source({
      currentData: { ...validCurrent, student_id: OTHER_STUDENT_ID },
    }),
    source({
      events: [
        { ...validInitialization, student_id: OTHER_STUDENT_ID },
      ],
    }),
    source({
      events: [
        { ...validInitialization, change_reason: "  not normalized  " },
      ],
    }),
    source({
      events: [
        {
          ...validInitialization,
          change_reason: "x".repeat(501),
        },
      ],
    }),
    source({ events: [validInitialization, validInitialization], count: 2 }),
    source({
      events: [
        {
          ...validInitialization,
          previous_stage: "profile_review",
          previous_state: null,
        },
      ],
    }),
    source({
      events: [
        {
          ...validInitialization,
          previous_stage: "profile_review",
          new_stage: "goals_confirmed",
          previous_state: "active",
          new_state: "on_hold",
        },
      ],
    }),
    source({
      events: [
        {
          ...validInitialization,
          previous_stage: "profile_review",
          previous_state: "active",
        },
      ],
    }),
    source({ events: [], count: 0 }),
    source({ currentData: null, events: [validInitialization], count: 1 }),
    source({
      currentData: current({
        current_stage: "goals_confirmed",
      }),
    }),
    source({ events: [{ ...validInitialization, changed_at: "invalid" }] }),
    source({ count: null }),
    source({ currentError: { code: "P0001" } }),
    source({ historyError: { code: "P0001" } }),
  ];

  for (const invalidSource of invalidCases) {
    const result = await fetchCounselorStudentProgression(
      STUDENT_ID,
      1,
      invalidSource,
    );
    assert.deepEqual(result, { kind: "unavailable" });
  }
});

test("incorrect event order and a transition after completion fail closed", async () => {
  const stageChange: OfficialProgressionEvent = {
    id: "55555555-5555-4555-8555-555555555555",
    student_id: STUDENT_ID,
    previous_stage: "profile_review",
    new_stage: "goals_confirmed",
    previous_state: "active",
    new_state: "active",
    changed_by: COUNSELOR_ID,
    change_reason: null,
    changed_at: "2026-07-25T06:00:00.000Z",
  };
  const completed: OfficialProgressionEvent = {
    ...stageChange,
    id: "66666666-6666-4666-8666-666666666666",
    previous_stage: "goals_confirmed",
    new_stage: "goals_confirmed",
    previous_state: "active",
    new_state: "completed",
    changed_at: "2026-07-25T07:00:00.000Z",
  };
  const illegalLaterEvent: OfficialProgressionEvent = {
    ...completed,
    id: "77777777-7777-4777-8777-777777777777",
    previous_state: "completed",
    new_state: "active",
    changed_at: "2026-07-25T08:00:00.000Z",
  };
  const cases = [
    {
      currentData: current({
        current_stage: "goals_confirmed",
        stage_started_at: stageChange.changed_at,
        last_changed_at: stageChange.changed_at,
        updated_at: stageChange.changed_at,
      }),
      events: [initialization(), stageChange],
    },
    {
      currentData: current({
        current_stage: "goals_confirmed",
        stage_started_at: stageChange.changed_at,
        last_changed_at: illegalLaterEvent.changed_at,
        updated_at: illegalLaterEvent.changed_at,
      }),
      events: [
        illegalLaterEvent,
        completed,
        stageChange,
        initialization(),
      ],
    },
  ];

  for (const testCase of cases) {
    const result = await fetchCounselorStudentProgression(
      STUDENT_ID,
      1,
      source({
        currentData: testCase.currentData,
        events: testCase.events,
        count: testCase.events.length,
      }),
    );
    assert.deepEqual(result, { kind: "unavailable" });
  }
});

test("correction loading is skipped for empty history and bounded to one visible-page call", async () => {
  let emptyCalls = 0;
  const emptyResult = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({
      currentData: null,
      events: [],
      count: 0,
      onCorrectionLoad: () => {
        emptyCalls += 1;
      },
    }),
  );
  assert.equal(emptyResult.kind, "ready");
  assert.equal(emptyCalls, 0);

  let loadedIds: string[] = [];
  const events = [initialization()];
  const populatedResult = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({
      events,
      onCorrectionLoad: (eventIds) => {
        loadedIds = eventIds;
      },
    }),
  );
  assert.equal(populatedResult.kind, "ready");
  assert.deepEqual(loadedIds, events.map((event) => event.id));
});

test("pre-migration RPC absence preserves only strict uncorrected history", async () => {
  const missingRpc = { code: "PGRST202" };
  const valid = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({ correctionError: missingRpc }),
  );
  assert.equal(valid.kind, "ready");
  if (valid.kind === "ready") {
    assert.deepEqual(valid.corrections, { kind: "unavailable" });
  }

  const inconsistent = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({
      correctionError: missingRpc,
      currentData: current({ current_stage: "goals_confirmed" }),
    }),
  );
  assert.deepEqual(inconsistent, { kind: "unavailable" });

  const retainedResetHistory = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({
      correctionError: missingRpc,
      currentData: null,
    }),
  );
  assert.deepEqual(retainedResetHistory, { kind: "unavailable" });
});

test("a corrected newest transition resolves current against the latest effective event", async () => {
  const initialEvent = initialization();
  const stageChange: OfficialProgressionEvent = {
    id: "55555555-5555-4555-8555-555555555555",
    student_id: STUDENT_ID,
    previous_stage: "profile_review",
    new_stage: "goals_confirmed",
    previous_state: "active",
    new_state: "active",
    changed_by: COUNSELOR_ID,
    change_reason: null,
    changed_at: "2026-07-25T06:00:00.000Z",
  };
  const correctionTime = "2026-07-25T07:00:00.000Z";
  const sharedEffective = {
    effective_event_exists: true,
    latest_effective_event_id: initialEvent.id,
    latest_effective_stage: initialEvent.new_stage,
    latest_effective_state: initialEvent.new_state,
    latest_effective_changed_at: initialEvent.changed_at,
    latest_effective_changed_by: initialEvent.changed_by,
    total_correction_count: 1,
  };
  const correctionContext = [
    {
      target_event_id: stageChange.id,
      correction_id: "99999999-9999-4999-8999-999999999999",
      correction_type: "undo_transition",
      restored_stage: "profile_review",
      restored_state: "active",
      restored_stage_started_at: initialEvent.changed_at,
      correction_reason: "Incorrect stage selected",
      corrected_at: correctionTime,
      ...sharedEffective,
    },
    {
      target_event_id: initialEvent.id,
      correction_id: null,
      correction_type: null,
      restored_stage: null,
      restored_state: null,
      restored_stage_started_at: null,
      correction_reason: null,
      corrected_at: null,
      ...sharedEffective,
    },
  ];

  const result = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({
      currentData: current({
        last_changed_at: correctionTime,
        updated_at: correctionTime,
      }),
      events: [stageChange, initialEvent],
      count: 2,
      correctionContext,
    }),
  );
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.deepEqual(result.corrections, {
    kind: "ready",
    correctionByEvent: {
      [stageChange.id]: {
        correctionType: "undo_transition",
        correctionReason: "Incorrect stage selected",
        correctedAt: correctionTime,
      },
    },
    latestEffectiveEventId: initialEvent.id,
  });
});

test("a transition after an undone transition starts from the restored state", async () => {
  const initialEvent = initialization();
  const undoneStageChange: OfficialProgressionEvent = {
    id: "55555555-5555-4555-8555-555555555555",
    student_id: STUDENT_ID,
    previous_stage: "profile_review",
    new_stage: "goals_confirmed",
    previous_state: "active",
    new_state: "active",
    changed_by: COUNSELOR_ID,
    change_reason: null,
    changed_at: "2026-07-25T06:00:00.000Z",
  };
  // Recorded after the undo, so it starts from the restored state rather than
  // from the undone event's new state.
  const holdAfterUndo: OfficialProgressionEvent = {
    id: "66666666-6666-4666-8666-666666666666",
    student_id: STUDENT_ID,
    previous_stage: "profile_review",
    new_stage: "profile_review",
    previous_state: "active",
    new_state: "on_hold",
    changed_by: COUNSELOR_ID,
    change_reason: null,
    changed_at: "2026-07-25T08:00:00.000Z",
  };
  const sharedEffective = {
    effective_event_exists: true,
    latest_effective_event_id: holdAfterUndo.id,
    latest_effective_stage: holdAfterUndo.new_stage,
    latest_effective_state: holdAfterUndo.new_state,
    latest_effective_changed_at: holdAfterUndo.changed_at,
    latest_effective_changed_by: holdAfterUndo.changed_by,
    total_correction_count: 1,
  };
  const uncorrected = {
    correction_id: null,
    correction_type: null,
    restored_stage: null,
    restored_state: null,
    restored_stage_started_at: null,
    correction_reason: null,
    corrected_at: null,
  };
  const undo = {
    correction_id: "99999999-9999-4999-8999-999999999999",
    correction_type: "undo_transition",
    restored_stage: "profile_review",
    restored_state: "active",
    restored_stage_started_at: initialEvent.changed_at,
    correction_reason: "Incorrect stage selected",
    corrected_at: "2026-07-25T07:00:00.000Z",
  };
  const load = (stageChangeCorrection: typeof uncorrected | typeof undo) =>
    fetchCounselorStudentProgression(
      STUDENT_ID,
      1,
      source({
        currentData: current({
          workflow_state: "on_hold",
          last_changed_at: holdAfterUndo.changed_at,
          updated_at: holdAfterUndo.changed_at,
        }),
        events: [holdAfterUndo, undoneStageChange, initialEvent],
        count: 3,
        correctionContext: [
          { target_event_id: holdAfterUndo.id, ...uncorrected, ...sharedEffective },
          {
            target_event_id: undoneStageChange.id,
            ...stageChangeCorrection,
            ...sharedEffective,
          },
          { target_event_id: initialEvent.id, ...uncorrected, ...sharedEffective },
        ],
      }),
    );

  const corrected = await load(undo);
  assert.equal(corrected.kind, "ready");

  // Without the undo the same chain is broken and must still fail closed.
  const broken = await load(uncorrected);
  assert.equal(broken.kind, "unavailable");
});

test("an audited initialization reset permits retained history without a current row", async () => {
  const initialEvent = initialization();
  const correctionContext = [
    {
      target_event_id: initialEvent.id,
      correction_id: "99999999-9999-4999-8999-999999999999",
      correction_type: "reset_initialization",
      restored_stage: null,
      restored_state: null,
      restored_stage_started_at: null,
      correction_reason: "Started against the wrong student record",
      corrected_at: "2026-07-25T06:00:00.000Z",
      effective_event_exists: false,
      latest_effective_event_id: null,
      latest_effective_stage: null,
      latest_effective_state: null,
      latest_effective_changed_at: null,
      latest_effective_changed_by: null,
      total_correction_count: 1,
    },
  ];

  const result = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({
      currentData: null,
      events: [initialEvent],
      count: 1,
      correctionContext,
    }),
  );
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.current, null);
  assert.equal(result.events.length, 1);
  assert.deepEqual(result.corrections, {
    kind: "ready",
    correctionByEvent: {
      [initialEvent.id]: {
        correctionType: "reset_initialization",
        correctionReason: "Started against the wrong student record",
        correctedAt: "2026-07-25T06:00:00.000Z",
      },
    },
    latestEffectiveEventId: null,
  });
});

test("fresh initialization after reset remains compatible with retained history", async () => {
  const originalInitialization = initialization();
  const freshInitialization = initialization({
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    new_stage: "initial_counseling",
    changed_at: "2026-07-25T07:00:00.000Z",
  });
  const sharedEffective = {
    effective_event_exists: true,
    latest_effective_event_id: freshInitialization.id,
    latest_effective_stage: freshInitialization.new_stage,
    latest_effective_state: freshInitialization.new_state,
    latest_effective_changed_at: freshInitialization.changed_at,
    latest_effective_changed_by: freshInitialization.changed_by,
    total_correction_count: 1,
  };
  const correctionContext = [
    {
      target_event_id: freshInitialization.id,
      correction_id: null,
      correction_type: null,
      restored_stage: null,
      restored_state: null,
      restored_stage_started_at: null,
      correction_reason: null,
      corrected_at: null,
      ...sharedEffective,
    },
    {
      target_event_id: originalInitialization.id,
      correction_id: "99999999-9999-4999-8999-999999999999",
      correction_type: "reset_initialization",
      restored_stage: null,
      restored_state: null,
      restored_stage_started_at: null,
      correction_reason: "Reset before a fresh review",
      corrected_at: "2026-07-25T06:00:00.000Z",
      ...sharedEffective,
    },
  ];

  const result = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({
      currentData: current({
        current_stage: "initial_counseling",
        created_at: freshInitialization.changed_at,
        stage_started_at: freshInitialization.changed_at,
        last_changed_at: freshInitialization.changed_at,
        updated_at: freshInitialization.changed_at,
      }),
      events: [freshInitialization, originalInitialization],
      count: 2,
      correctionContext,
    }),
  );
  assert.equal(result.kind, "ready");
});

test("malformed, duplicate, cross-event, and inconsistent correction context fails closed", async () => {
  const initialEvent = initialization();
  const base = {
    target_event_id: initialEvent.id,
    correction_id: null,
    correction_type: null,
    restored_stage: null,
    restored_state: null,
    restored_stage_started_at: null,
    correction_reason: null,
    corrected_at: null,
    effective_event_exists: true,
    latest_effective_event_id: initialEvent.id,
    latest_effective_stage: initialEvent.new_stage,
    latest_effective_state: initialEvent.new_state,
    latest_effective_changed_at: initialEvent.changed_at,
    latest_effective_changed_by: initialEvent.changed_by,
    total_correction_count: 0,
  };
  const invalidContexts = [
    [],
    [{ ...base, target_event_id: OTHER_STUDENT_ID }],
    [{ ...base, correction_id: "not-a-uuid" }],
    [{ ...base, correction_type: "delete" }],
    [{ ...base, correction_id: COUNSELOR_ID }],
    [{ ...base, total_correction_count: -1 }],
    [{ ...base, latest_effective_stage: "invalid" }],
    [{ ...base, correction_reason: "unexpected without correction" }],
    [{ ...base, effective_event_exists: false }],
  ];

  for (const correctionContext of invalidContexts) {
    const result = await fetchCounselorStudentProgression(
      STUDENT_ID,
      1,
      source({ correctionContext }),
    );
    assert.deepEqual(result, { kind: "unavailable" });
  }

  const errorResult = await fetchCounselorStudentProgression(
    STUDENT_ID,
    1,
    source({ correctionError: { code: "P0001" } }),
  );
  assert.equal(errorResult.kind, "ready");
  if (errorResult.kind === "ready") {
    assert.deepEqual(errorResult.corrections, { kind: "unavailable" });
  }
});
