import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { Database } from "@/types/database";

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
    if (specifier === "@/lib/validation/student-optional-records") {
      return {
        shortCircuit: true,
        url: new URL(
          "../validation/student-optional-records.ts",
          import.meta.url,
        ).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  submitCreateStudentAchievement,
  submitCreateStudentTestScore,
  submitDeleteStudentAchievement,
  submitDeleteStudentTestScore,
  submitUpdateStudentAchievement,
  submitUpdateStudentTestScore,
} = require("./optional-record-submission.ts") as typeof import("./optional-record-submission");

type TestScoreInsert =
  Database["public"]["Tables"]["student_test_scores"]["Insert"];
type TestScoreUpdate =
  Database["public"]["Tables"]["student_test_scores"]["Update"];
type AchievementInsert =
  Database["public"]["Tables"]["student_achievements"]["Insert"];
type AchievementUpdate =
  Database["public"]["Tables"]["student_achievements"]["Update"];

const BUSINESS_TODAY = "2026-07-24";
const RECORD_ID = "11111111-1111-4111-8111-111111111111";

function validExamForm() {
  const formData = new FormData();
  formData.set("examName", "ielts");
  formData.set("customExamName", "");
  formData.set("examStatus", "completed");
  formData.set("attemptNumber", "1");
  formData.set("plannedDate", "2026-04-01");
  formData.set("completedDate", "2026-04-12");
  formData.set("score", "  Overall   7.5 ");
  formData.set("validUntil", "2028-04-12");
  formData.set("remarks", "  First   reported attempt ");
  return formData;
}

function validAchievementForm() {
  const formData = new FormData();
  formData.set("achievementType", "certification");
  formData.set("title", "  Cloud   certification ");
  formData.set("organization", "  Example   Institute ");
  formData.set("achievementDate", "2026-03-10");
  formData.set(
    "description",
    "  Completed   the professional certification. ",
  );
  return formData;
}

function validExamFormForStatus(status: string) {
  const formData = validExamForm();
  formData.set("examStatus", status);
  formData.set("completedDate", "");
  formData.set("score", "");
  formData.set("validUntil", "");

  if (status === "not_planned" || status === "not_required") {
    formData.set("plannedDate", "");
  }
  if (status === "completed") {
    formData.set("completedDate", "2026-04-12");
    formData.set("score", "Overall 7.5");
    formData.set("validUntil", "2028-04-12");
  }
  return formData;
}

test("creates only the normalized supported exam payload", async () => {
  let received: TestScoreInsert | null = null;
  const state = await submitCreateStudentTestScore(
    validExamForm(),
    BUSINESS_TODAY,
    {
      create: async (payload) => {
        received = payload;
        return { affected: true, error: null };
      },
    },
  );

  assert.equal(state.status, "success");
  assert.deepEqual(received, {
    exam_name: "ielts",
    custom_exam_name: null,
    exam_status: "completed",
    attempt_number: 1,
    planned_date: "2026-04-01",
    completed_date: "2026-04-12",
    score: "Overall 7.5",
    valid_until: "2028-04-12",
    remarks: "First reported attempt",
  });
  for (const protectedField of [
    "student_id",
    "created_at",
    "updated_at",
    "role",
  ]) {
    assert.equal(Object.hasOwn(received ?? {}, protectedField), false);
  }
});

test("accepts every database exam name and valid status shape", async () => {
  for (const examName of [
    "ielts",
    "toefl",
    "pte",
    "gre",
    "gmat",
    "gate",
    "other",
  ]) {
    const formData = validExamFormForStatus("planning");
    formData.set("examName", examName);
    formData.set(
      "customExamName",
      examName === "other" ? "Duolingo English Test" : "",
    );
    const state = await submitCreateStudentTestScore(
      formData,
      BUSINESS_TODAY,
      {
        create: async () => ({ affected: true, error: null }),
      },
    );
    assert.equal(state.status, "success", examName);
  }

  for (const status of [
    "not_planned",
    "planning",
    "booked",
    "completed",
    "not_required",
  ]) {
    const state = await submitCreateStudentTestScore(
      validExamFormForStatus(status),
      BUSINESS_TODAY,
      {
        create: async () => ({ affected: true, error: null }),
      },
    );
    assert.equal(state.status, "success", status);
  }
});

test("supports multiple numbered attempts and Other exam names", async () => {
  const attempts: TestScoreInsert[] = [];
  for (const attemptNumber of ["1", "2"]) {
    const formData = validExamForm();
    formData.set("examName", "other");
    formData.set("customExamName", " Duolingo   English Test ");
    formData.set("attemptNumber", attemptNumber);
    const state = await submitCreateStudentTestScore(
      formData,
      BUSINESS_TODAY,
      {
        create: async (payload) => {
          attempts.push(payload);
          return { affected: true, error: null };
        },
      },
    );
    assert.equal(state.status, "success");
  }

  assert.deepEqual(
    attempts.map((attempt) => [
      attempt.custom_exam_name,
      attempt.attempt_number,
    ]),
    [
      ["DUOLINGO ENGLISH TEST", 1],
      ["DUOLINGO ENGLISH TEST", 2],
    ],
  );
});

test("rejects invalid exam states, dates, scores, and overlength values", async () => {
  const invalidForms = [
    ["examStatus", "booked", "plannedDate", ""],
    ["completedDate", "2026-07-25"],
    ["completedDate", "2026-03-01", "plannedDate", "2026-04-01"],
    ["score", "NaN"],
    ["attemptNumber", "21"],
    ["remarks", "x".repeat(1001)],
  ] as const;

  for (const changes of invalidForms) {
    const formData = validExamForm();
    for (let index = 0; index < changes.length; index += 2) {
      formData.set(changes[index], changes[index + 1]);
    }
    let called = false;
    const state = await submitCreateStudentTestScore(
      formData,
      BUSINESS_TODAY,
      {
        create: async () => {
          called = true;
          return { affected: true, error: null };
        },
      },
    );
    assert.equal(state.status, "error");
    assert.equal(called, false);
  }
});

test("rejects malformed attempt numbers and exact invalid status combinations", async () => {
  for (const attemptNumber of [
    "",
    "0",
    "-1",
    "1.5",
    "1e1",
    "NaN",
    "Infinity",
    "21",
  ]) {
    const formData = validExamForm();
    formData.set("attemptNumber", attemptNumber);
    const state = await submitCreateStudentTestScore(
      formData,
      BUSINESS_TODAY,
      {
        create: async () => ({ affected: true, error: null }),
      },
    );
    assert.equal(state.status, "error", attemptNumber);
  }

  const invalidForms = [
    validExamFormForStatus("booked"),
    validExamFormForStatus("completed"),
    validExamFormForStatus("not_planned"),
    validExamFormForStatus("planning"),
    validExamFormForStatus("planning"),
  ];
  invalidForms[0].set("plannedDate", "");
  invalidForms[1].set("completedDate", "");
  invalidForms[2].set("score", "7.5");
  invalidForms[3].set("validUntil", "2028-04-12");
  invalidForms[4].set("customExamName", "Not allowed");

  const otherWithoutName = validExamFormForStatus("planning");
  otherWithoutName.set("examName", "other");
  invalidForms.push(otherWithoutName);

  for (const formData of invalidForms) {
    const state = await submitCreateStudentTestScore(
      formData,
      BUSINESS_TODAY,
      {
        create: async () => ({ affected: true, error: null }),
      },
    );
    assert.equal(state.status, "error");
  }
});

test("rejects duplicate scalar fields and protected-field injection", async () => {
  const duplicate = validExamForm();
  duplicate.append("examName", "gre");
  const injectedForms = [
    "student_id",
    "id",
    "role",
    "profile_status",
    "created_at",
    "updated_at",
    "redirect",
  ].map((field) => {
    const formData = validExamForm();
    formData.set(field, "attacker-controlled");
    return formData;
  });
  for (const formData of [duplicate, ...injectedForms]) {
    let called = false;
    const state = await submitCreateStudentTestScore(
      formData,
      BUSINESS_TODAY,
      {
        create: async () => {
          called = true;
          return { affected: true, error: null };
        },
      },
    );
    assert.equal(state.status, "error");
    assert.equal(called, false);
  }
});

test("updates an exam using only its UUID and approved payload", async () => {
  const formData = validExamForm();
  formData.set("recordId", RECORD_ID);
  let receivedId = "";
  let receivedPayload: TestScoreUpdate | null = null;
  const state = await submitUpdateStudentTestScore(
    formData,
    BUSINESS_TODAY,
    {
      update: async (recordId, payload) => {
        receivedId = recordId;
        receivedPayload = payload;
        return { affected: true, error: null };
      },
    },
  );

  assert.equal(state.status, "success");
  assert.equal(receivedId, RECORD_ID);
  assert.deepEqual(receivedPayload, {
    exam_name: "ielts",
    custom_exam_name: null,
    exam_status: "completed",
    attempt_number: 1,
    planned_date: "2026-04-01",
    completed_date: "2026-04-12",
    score: "Overall 7.5",
    valid_until: "2028-04-12",
    remarks: "First reported attempt",
  });
  assert.equal(Object.hasOwn(receivedPayload ?? {}, "student_id"), false);
});

test("missing and cross-student-like update/delete results fail identically", async () => {
  const updateForm = validExamForm();
  updateForm.set("recordId", RECORD_ID);
  const deleteForm = new FormData();
  deleteForm.set("recordId", RECORD_ID);
  const updateState = await submitUpdateStudentTestScore(
    updateForm,
    BUSINESS_TODAY,
    {
      update: async () => ({ affected: false, error: null }),
    },
  );
  const deleteState = await submitDeleteStudentTestScore(deleteForm, {
    delete: async () => ({ affected: false, error: null }),
  });

  assert.equal(updateState.status, "error");
  assert.equal(deleteState.status, "error");
  assert.equal(updateState.message, deleteState.message);
  assert.doesNotMatch(updateState.message ?? "", /owner|student|rls|policy/i);
});

test("sanitizes unique, RLS, network, and raw database failures", async () => {
  const internal = "private row and SQLSTATE details";
  const unique = await submitCreateStudentTestScore(
    validExamForm(),
    BUSINESS_TODAY,
    {
      create: async () => ({
        affected: false,
        error: {
          code: "23505",
          details: internal,
          hint: "",
          message: internal,
        },
      }),
    },
  );
  const rls = await submitCreateStudentTestScore(
    validExamForm(),
    BUSINESS_TODAY,
    {
      create: async () => ({
        affected: false,
        error: { code: "42501", message: internal },
      }),
    },
  );
  const network = await submitCreateStudentTestScore(
    validExamForm(),
    BUSINESS_TODAY,
    {
      create: async () => {
        throw new Error(internal);
      },
    },
  );

  assert.match(unique.message ?? "", /attempt number/i);
  for (const state of [unique, rls, network]) {
    assert.equal(state.status, "error");
    assert.equal(state.message?.includes(internal), false);
    assert.doesNotMatch(state.message ?? "", /23505|42501|sqlstate/i);
  }
});

test("accepts every database achievement category", async () => {
  for (const achievementType of [
    "internship",
    "project",
    "certification",
    "research",
    "publication",
    "award",
    "hackathon",
    "leadership",
    "volunteering",
    "work_experience",
    "other",
  ]) {
    const formData = validAchievementForm();
    formData.set("achievementType", achievementType);
    const state = await submitCreateStudentAchievement(
      formData,
      BUSINESS_TODAY,
      {
        create: async () => ({ affected: true, error: null }),
      },
    );
    assert.equal(state.status, "success", achievementType);
  }
});

test("creates and normalizes only supported achievement fields", async () => {
  let received: AchievementInsert | null = null;
  const state = await submitCreateStudentAchievement(
    validAchievementForm(),
    BUSINESS_TODAY,
    {
      create: async (payload) => {
        received = payload;
        return { affected: true, error: null };
      },
    },
  );

  assert.equal(state.status, "success");
  assert.deepEqual(received, {
    achievement_type: "certification",
    title: "Cloud certification",
    organization: "Example Institute",
    achievement_date: "2026-03-10",
    description: "Completed the professional certification.",
  });
  for (const unsupported of [
    "student_id",
    "evidence_url",
    "level",
    "created_at",
    "updated_at",
  ]) {
    assert.equal(Object.hasOwn(received ?? {}, unsupported), false);
  }
});

test("rejects blank, invalid-date, future, overlength, duplicate, and injected achievements", async () => {
  const invalidForms = [
    ["title", ""],
    ["achievementDate", "2026-02-30"],
    ["achievementDate", "2026-07-25"],
    ["achievementDate", "1949-12-31"],
    ["title", "x".repeat(201)],
    ["description", "x".repeat(2001)],
  ] as const;

  for (const [field, value] of invalidForms) {
    const formData = validAchievementForm();
    formData.set(field, value);
    let called = false;
    const state = await submitCreateStudentAchievement(
      formData,
      BUSINESS_TODAY,
      {
        create: async () => {
          called = true;
          return { affected: true, error: null };
        },
      },
    );
    assert.equal(state.status, "error");
    assert.equal(called, false);
  }

  const duplicate = validAchievementForm();
  duplicate.append("title", "Second title");
  const injected = validAchievementForm();
  injected.set("evidence_url", "https://attacker.example");
  for (const formData of [duplicate, injected]) {
    const state = await submitCreateStudentAchievement(
      formData,
      BUSINESS_TODAY,
      {
        create: async () => ({ affected: true, error: null }),
      },
    );
    assert.equal(state.status, "error");
  }
});

test("updates and deletes achievements by UUID with safe missing-row behavior", async () => {
  const updateForm = validAchievementForm();
  updateForm.set("recordId", RECORD_ID);
  let updated: AchievementUpdate | null = null;
  const updateState = await submitUpdateStudentAchievement(
    updateForm,
    BUSINESS_TODAY,
    {
      update: async (recordId, payload) => {
        assert.equal(recordId, RECORD_ID);
        updated = payload;
        return { affected: true, error: null };
      },
    },
  );
  const deleteForm = new FormData();
  deleteForm.set("recordId", RECORD_ID);
  const deleteState = await submitDeleteStudentAchievement(deleteForm, {
    delete: async () => ({ affected: true, error: null }),
  });

  assert.equal(updateState.status, "success");
  assert.equal(deleteState.status, "success");
  assert.deepEqual(updated, {
    achievement_type: "certification",
    title: "Cloud certification",
    organization: "Example Institute",
    achievement_date: "2026-03-10",
    description: "Completed the professional certification.",
  });
});

test("stale achievement updates and deletes fail without revealing ownership", async () => {
  const updateForm = validAchievementForm();
  updateForm.set("recordId", RECORD_ID);
  const deleteForm = new FormData();
  deleteForm.set("recordId", RECORD_ID);

  const updateState = await submitUpdateStudentAchievement(
    updateForm,
    BUSINESS_TODAY,
    {
      update: async () => ({ affected: false, error: null }),
    },
  );
  const deleteState = await submitDeleteStudentAchievement(deleteForm, {
    delete: async () => ({ affected: false, error: null }),
  });

  assert.equal(updateState.status, "error");
  assert.equal(deleteState.status, "error");
  assert.equal(updateState.message, deleteState.message);
  assert.doesNotMatch(updateState.message ?? "", /owner|student|rls|policy/i);
});
