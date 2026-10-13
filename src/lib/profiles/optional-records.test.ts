import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  STUDENT_OPTIONAL_RECORD_PAGE_SIZE,
  getStudentOptionalRecordRange,
  mapStudentAchievementPage,
  mapStudentTestScorePage,
  parseStudentOptionalRecordPage,
  studentAchievementRowSchema,
  studentTestScoreRowSchema,
} = require("./optional-records.ts") as typeof import("./optional-records");
const {
  formatOptionalProfileDate,
  getStudentAchievementTypeLabel,
  getStudentExamNameLabel,
  getStudentExamStatusLabel,
  getStudentProfileOptionalRecordUrl,
} = require("./options.ts") as typeof import("./options");

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_STUDENT_ID = "22222222-2222-4222-8222-222222222222";
const EXAM_ID = "33333333-3333-4333-8333-333333333333";
const ACHIEVEMENT_ID = "44444444-4444-4444-8444-444444444444";
const TIMESTAMP = "2026-07-24T10:00:00+05:30";

function exam(overrides: Record<string, unknown> = {}) {
  return {
    id: EXAM_ID,
    student_id: STUDENT_ID,
    exam_name: "ielts",
    custom_exam_name: null,
    exam_status: "completed",
    attempt_number: 1,
    planned_date: "2026-04-01",
    completed_date: "2026-04-12",
    score: "7.5",
    valid_until: "2028-04-12",
    remarks: "First attempt",
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

function achievement(overrides: Record<string, unknown> = {}) {
  return {
    id: ACHIEVEMENT_ID,
    student_id: STUDENT_ID,
    achievement_type: "certification",
    title: "Cloud certification",
    organization: "Example Institute",
    achievement_date: "2026-03-10",
    description: "Completed the professional certification.",
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    ...overrides,
  };
}

function examPageRows(count: number, offset = 0) {
  return Array.from({ length: count }, (_, index) =>
    exam({
      id: `33333333-3333-4333-8333-${(index + offset + 1)
        .toString(16)
        .padStart(12, "0")}`,
    }),
  );
}

test("optional record pagination accepts only one bounded positive integer", () => {
  assert.equal(parseStudentOptionalRecordPage("2"), 2);
  for (const value of [
    undefined,
    "",
    "0",
    "-1",
    "1.5",
    " 2",
    "100001",
    ["1", "2"],
  ]) {
    assert.equal(parseStudentOptionalRecordPage(value), 1);
  }
  assert.deepEqual(getStudentOptionalRecordRange(2), {
    from: STUDENT_OPTIONAL_RECORD_PAGE_SIZE,
    to: STUDENT_OPTIONAL_RECORD_PAGE_SIZE * 2 - 1,
  });
});

test("profile pagination URLs contain only safe numeric page state", () => {
  assert.equal(getStudentProfileOptionalRecordUrl(1, 1), "/student/profile");
  assert.equal(
    getStudentProfileOptionalRecordUrl(2, 3),
    "/student/profile?examPage=2&achievementPage=3",
  );
  assert.doesNotMatch(
    getStudentProfileOptionalRecordUrl(2, 3),
    /name|email|score|title|description|mobile|roll/i,
  );
});

test("maps empty and valid student-owned exam pages", () => {
  assert.deepEqual(
    mapStudentTestScorePage(
      { data: [], count: 0, error: null },
      STUDENT_ID,
      1,
    ),
    {
      kind: "ready",
      records: [],
      page: 1,
      pageCount: 1,
      totalCount: 0,
    },
  );

  const result = mapStudentTestScorePage(
    { data: examPageRows(20), count: 21, error: null },
    STUDENT_ID,
    1,
  );
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.records.length, 20);
    assert.equal(result.pageCount, 2);
    assert.equal(result.totalCount, 21);
  }

  const finalPage = mapStudentTestScorePage(
    { data: examPageRows(1, 20), count: 21, error: null },
    STUDENT_ID,
    2,
  );
  assert.equal(finalPage.kind, "ready");
  if (finalPage.kind === "ready") {
    assert.equal(finalPage.records.length, 1);
    assert.equal(finalPage.page, 2);
  }
});

test("maps empty and valid student-owned achievement pages", () => {
  const result = mapStudentAchievementPage(
    { data: [achievement()], count: 1, error: null },
    STUDENT_ID,
    1,
  );
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.records[0].title, "Cloud certification");
    assert.equal(result.pageCount, 1);
  }
});

test("runtime parsing rejects cross-student, duplicate, malformed, and failed rows", () => {
  for (const result of [
    mapStudentTestScorePage(
      {
        data: [exam({ student_id: OTHER_STUDENT_ID })],
        count: 1,
        error: null,
      },
      STUDENT_ID,
      1,
    ),
    mapStudentTestScorePage(
      { data: [exam(), exam()], count: 2, error: null },
      STUDENT_ID,
      1,
    ),
    mapStudentTestScorePage(
      { data: [exam({ attempt_number: 21 })], count: 1, error: null },
      STUDENT_ID,
      1,
    ),
    mapStudentTestScorePage(
      { data: [exam({ attempt_number: Number.NaN })], count: 1, error: null },
      STUDENT_ID,
      1,
    ),
    mapStudentTestScorePage(
      { data: [exam({ exam_status: "unknown" })], count: 1, error: null },
      STUDENT_ID,
      1,
    ),
    mapStudentTestScorePage(
      { data: [exam({ id: "not-a-uuid" })], count: 1, error: null },
      STUDENT_ID,
      1,
    ),
    mapStudentAchievementPage(
      {
        data: [achievement({ student_id: OTHER_STUDENT_ID })],
        count: 1,
        error: null,
      },
      STUDENT_ID,
      1,
    ),
    mapStudentAchievementPage(
      { data: [achievement({ title: "" })], count: 1, error: null },
      STUDENT_ID,
      1,
    ),
    mapStudentAchievementPage(
      { data: [], count: null, error: null },
      STUDENT_ID,
      1,
    ),
    mapStudentAchievementPage(
      { data: [], count: 1, error: null },
      STUDENT_ID,
      1,
    ),
    mapStudentAchievementPage(
      {
        data: [],
        count: STUDENT_OPTIONAL_RECORD_PAGE_SIZE * 100_000 + 1,
        error: null,
      },
      STUDENT_ID,
      1,
    ),
    mapStudentAchievementPage(
      { data: [], count: 0, error: null },
      STUDENT_ID,
      0,
    ),
    mapStudentAchievementPage(
      { data: [], count: 0, error: { code: "42501" } },
      STUDENT_ID,
      1,
    ),
  ]) {
    assert.deepEqual(result, { kind: "unavailable" });
  }
});

test("runtime parsing rejects impossible exam state combinations", () => {
  for (const record of [
    exam({ exam_name: "other", custom_exam_name: null }),
    exam({ exam_name: "ielts", custom_exam_name: "CUSTOM" }),
    exam({ exam_status: "completed", completed_date: null }),
    exam({
      exam_status: "booked",
      completed_date: null,
      planned_date: null,
      score: null,
      valid_until: null,
    }),
    exam({
      exam_status: "not_planned",
      completed_date: null,
      score: null,
    }),
    exam({ completed_date: "2026-03-01", planned_date: "2026-04-01" }),
    exam({ valid_until: "2026-03-01" }),
  ]) {
    assert.equal(studentTestScoreRowSchema.safeParse(record).success, false);
  }
});

test("runtime parsing enforces achievement constraints and strict dates", () => {
  assert.equal(studentAchievementRowSchema.safeParse(achievement()).success, true);
  assert.equal(
    studentAchievementRowSchema.safeParse(
      achievement({ achievement_date: "1949-12-31" }),
    ).success,
    false,
  );
  assert.equal(
    studentAchievementRowSchema.safeParse(
      achievement({ achievement_date: "2026-02-30" }),
    ).success,
    false,
  );
  assert.equal(
    studentAchievementRowSchema.safeParse(
      achievement({ created_at: "2026-02-30T10:00:00Z" }),
    ).success,
    false,
  );
  assert.equal(
    studentAchievementRowSchema.safeParse(
      achievement({ title: " Padded title " }),
    ).success,
    false,
  );
  assert.equal(
    studentAchievementRowSchema.safeParse(
      achievement({
        created_at: "2026-07-24T11:00:00Z",
        updated_at: "2026-07-24T10:00:00Z",
      }),
    ).success,
    false,
  );
});

test("out-of-range pages remain identifiable for a canonical redirect", () => {
  const result = mapStudentTestScorePage(
    { data: [], count: 21, error: null },
    STUDENT_ID,
    3,
  );
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.page, 3);
    assert.equal(result.pageCount, 2);
  }
});

test("central optional-record labels and date formatting match counselor wording", () => {
  assert.equal(getStudentExamNameLabel("ielts"), "IELTS");
  assert.equal(getStudentExamStatusLabel("not_required"), "Not required");
  assert.equal(
    getStudentAchievementTypeLabel("work_experience"),
    "Work experience",
  );
  assert.equal(formatOptionalProfileDate("2026-07-24"), "24 Jul 2026");
  assert.equal(formatOptionalProfileDate(null), "Date not added");
});
