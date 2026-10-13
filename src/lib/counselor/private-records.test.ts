import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  COUNSELOR_PRIVATE_RECORD_PAGE_SIZE,
  attachCounselorPrivateReferences,
  getCounselorFollowUpLifecycle,
  getCounselorFollowUpLifecycleLabel,
  getCounselorPrivateConsultationIds,
  parseCounselorPrivatePage,
  parseCounselorPrivateRecords,
} = require("./private-records.ts") as typeof import("./private-records");

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const COUNSELOR_ID = "22222222-2222-4222-8222-222222222222";
const OTHER_COUNSELOR_ID = "33333333-3333-4333-8333-333333333333";
const NOTE_ID = "44444444-4444-4444-8444-444444444444";
const FOLLOW_UP_ID = "55555555-5555-4555-8555-555555555555";
const CONSULTATION_ID = "66666666-6666-4666-8666-666666666666";
const TIMESTAMP = "2026-07-25T10:00:00+05:30";

function note(overrides: Record<string, unknown> = {}) {
  return {
    id: NOTE_ID,
    student_id: STUDENT_ID,
    counselor_id: COUNSELOR_ID,
    consultation_id: CONSULTATION_ID,
    note_text: "Discussed the student's documented study preferences.",
    is_pinned: false,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

function followUp(overrides: Record<string, unknown> = {}) {
  return {
    id: FOLLOW_UP_ID,
    student_id: STUDENT_ID,
    counselor_id: COUNSELOR_ID,
    consultation_id: CONSULTATION_ID,
    due_date: "2026-07-25",
    priority: "normal",
    status: "pending",
    next_action: "Review the student's updated exam plan.",
    details: null,
    completed_at: null,
    completed_by: null,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

function consultation(overrides: Record<string, unknown> = {}) {
  return {
    id: CONSULTATION_ID,
    student_id: STUDENT_ID,
    status: "scheduled",
    consultation_date: "2026-07-28",
    slot_start: "10:00:00",
    slot_end: "10:30:00",
    submitted_at: TIMESTAMP,
    ...overrides,
  };
}

function results(overrides: {
  notes?: unknown;
  noteError?: unknown;
  noteCount?: number | null;
  followUps?: unknown;
  followUpError?: unknown;
  followUpCount?: number | null;
  choices?: unknown;
  choiceError?: unknown;
} = {}) {
  return {
    notes: {
      data: overrides.notes ?? [note()],
      error: overrides.noteError ?? null,
      count: overrides.noteCount ?? 1,
    },
    followUps: {
      data: overrides.followUps ?? [followUp()],
      error: overrides.followUpError ?? null,
      count: overrides.followUpCount ?? 1,
    },
    consultationChoices: {
      data: overrides.choices ?? [consultation()],
      error: overrides.choiceError ?? null,
    },
  };
}

test("private record page parsing is bounded and rejects duplicate query values", () => {
  assert.equal(parseCounselorPrivatePage(undefined), 1);
  assert.equal(parseCounselorPrivatePage("2"), 2);
  assert.equal(parseCounselorPrivatePage(["2", "3"]), 1);
  assert.equal(parseCounselorPrivatePage("0"), 1);
  assert.equal(parseCounselorPrivatePage("100001"), 1);
  assert.equal(COUNSELOR_PRIVATE_RECORD_PAGE_SIZE, 20);
});

test("valid owned note, follow-up, and consultation rows are accepted", () => {
  const parsed = parseCounselorPrivateRecords(
    results(),
    STUDENT_ID,
    COUNSELOR_ID,
    1,
    1,
  );

  assert.equal(parsed.notes.kind, "ready");
  assert.equal(parsed.followUps.kind, "ready");
  assert.equal(parsed.consultationChoices?.length, 1);
  assert.deepEqual(getCounselorPrivateConsultationIds(parsed), [
    CONSULTATION_ID,
    CONSULTATION_ID,
    CONSULTATION_ID,
  ]);
});

test("cross-student, cross-counselor, duplicate, malformed, and oversized note pages fail closed", () => {
  for (const badNotes of [
    [note({ student_id: "77777777-7777-4777-8777-777777777777" })],
    [note({ counselor_id: OTHER_COUNSELOR_ID })],
    [note(), note()],
    [note({ note_text: "  not normalized" })],
    [note({ note_text: "not  normalized" })],
    [note({ updated_at: "2026-07-24T10:00:00+05:30" })],
    Array.from({ length: 21 }, (_, index) =>
      note({
        id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      }),
    ),
  ]) {
    const parsed = parseCounselorPrivateRecords(
      results({
        notes: badNotes,
        noteCount: badNotes.length,
      }),
      STUDENT_ID,
      COUNSELOR_ID,
      1,
      1,
    );
    assert.equal(parsed.notes.kind, "unavailable");
  }
});

test("follow-up runtime validation enforces ownership and completion audit consistency", () => {
  const completed = followUp({
    status: "completed",
    completed_at: TIMESTAMP,
    completed_by: COUNSELOR_ID,
  });
  const valid = parseCounselorPrivateRecords(
    results({ followUps: [completed] }),
    STUDENT_ID,
    COUNSELOR_ID,
    1,
    1,
  );
  assert.equal(valid.followUps.kind, "ready");

  for (const malformed of [
    followUp({ counselor_id: OTHER_COUNSELOR_ID }),
    followUp({ next_action: "not  normalized" }),
    followUp({ status: "completed" }),
    followUp({ status: "pending", completed_at: TIMESTAMP }),
    followUp({
      status: "completed",
      completed_at: TIMESTAMP,
      completed_by: OTHER_COUNSELOR_ID,
    }),
    followUp({ due_date: "2026-02-30" }),
  ]) {
    const parsed = parseCounselorPrivateRecords(
      results({ followUps: [malformed] }),
      STUDENT_ID,
      COUNSELOR_ID,
      1,
      1,
    );
    assert.equal(parsed.followUps.kind, "unavailable");
  }
});

test("D1 query failures stay isolated by section and never become empty states", () => {
  const parsed = parseCounselorPrivateRecords(
    results({
      noteError: new Error("private"),
      followUps: [],
      followUpCount: 0,
    }),
    STUDENT_ID,
    COUNSELOR_ID,
    1,
    1,
  );

  assert.equal(parsed.notes.kind, "unavailable");
  assert.deepEqual(parsed.followUps, {
    kind: "ready",
    records: [],
    count: 0,
    page: 1,
    pageCount: 1,
  });
});

test("out-of-range pages and malformed counts fail safely", () => {
  const outOfRange = parseCounselorPrivateRecords(
    results({ notes: [], noteCount: 20 }),
    STUDENT_ID,
    COUNSELOR_ID,
    2,
    1,
  );
  assert.equal(outOfRange.notes.kind, "out_of_range");

  const invalidCount = parseCounselorPrivateRecords(
    results({ noteCount: 0 }),
    STUDENT_ID,
    COUNSELOR_ID,
    1,
    1,
  );
  assert.equal(invalidCount.notes.kind, "unavailable");
});

test("consultation choices reject cross-student rows, duplicates, and partial schedules", () => {
  for (const choices of [
    [consultation({ student_id: OTHER_COUNSELOR_ID })],
    [consultation(), consultation()],
    [consultation({ slot_end: null })],
  ]) {
    const parsed = parseCounselorPrivateRecords(
      results({ choices }),
      STUDENT_ID,
      COUNSELOR_ID,
      1,
      1,
    );
    assert.equal(parsed.consultationChoices, null);
  }
});

test("one deduplicated reference map is attached without exposing missing links", () => {
  const parsed = parseCounselorPrivateRecords(
    results(),
    STUDENT_ID,
    COUNSELOR_ID,
    1,
    1,
  );
  const linked = attachCounselorPrivateReferences(
    parsed,
    new Map([[CONSULTATION_ID, "KGEOC-2026-000001"]]),
    "2026-07-25",
  );
  assert.equal(
    linked.notes.kind === "ready"
      ? linked.notes.records[0]?.consultation_reference
      : null,
    "KGEOC-2026-000001",
  );
  assert.equal(linked.consultationChoices?.[0]?.request_number, "KGEOC-2026-000001");

  const missing = attachCounselorPrivateReferences(
    parsed,
    new Map(),
    "2026-07-25",
  );
  assert.equal(missing.notes.kind, "unavailable");
  assert.equal(missing.followUps.kind, "unavailable");
  assert.equal(missing.consultationChoices, null);
});

test("follow-up lifecycle is derived from the Asia/Kolkata business date", () => {
  const cases: Array<
    [
      {
        status: "pending" | "completed" | "cancelled";
        due_date: string;
      },
      string,
      "overdue" | "due_today" | "upcoming" | "completed" | "cancelled",
    ]
  > = [
    [{ status: "pending", due_date: "2026-07-24" }, "2026-07-25", "overdue"],
    [
      { status: "pending", due_date: "2026-07-25" },
      "2026-07-25",
      "due_today",
    ],
    [{ status: "pending", due_date: "2026-07-26" }, "2026-07-25", "upcoming"],
    [
      { status: "completed", due_date: "2026-07-25" },
      "2026-07-25",
      "completed",
    ],
    [
      { status: "cancelled", due_date: "2026-07-25" },
      "2026-07-25",
      "cancelled",
    ],
  ];

  for (const [record, today, expected] of cases) {
    const lifecycle = getCounselorFollowUpLifecycle(record, today);
    assert.equal(lifecycle, expected);
    assert.ok(getCounselorFollowUpLifecycleLabel(lifecycle).length > 0);
  }
});
