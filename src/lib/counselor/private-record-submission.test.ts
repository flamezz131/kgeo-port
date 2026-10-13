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
    const aliases: Record<string, string> = {
      "@/lib/counselor/private-records": "./private-records.ts",
      "@/lib/validation/counselor-private-records":
        "../validation/counselor-private-records.ts",
    };
    const target = aliases[specifier];
    if (target) {
      return {
        shortCircuit: true,
        url: new URL(target, import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  submitCreateCounselorFollowUp,
  submitCreateCounselorNote,
  submitDeleteCounselorNote,
  submitRecordCounselorFollowUpStatus,
  submitSetCounselorNotePinned,
  submitUpdateCounselorFollowUp,
  submitUpdateCounselorNote,
} = require("./private-record-submission.ts") as typeof import("./private-record-submission");

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const RECORD_ID = "22222222-2222-4222-8222-222222222222";
const CONSULTATION_ID = "33333333-3333-4333-8333-333333333333";

function noteForm(operation: "create" | "update" = "create") {
  const formData = new FormData();
  formData.set("studentId", STUDENT_ID);
  if (operation === "update") formData.set("recordId", RECORD_ID);
  formData.set("noteText", "  Discussed   exam\nplanning.  ");
  formData.set("consultationId", CONSULTATION_ID);
  return formData;
}

function followUpForm(operation: "create" | "update" = "create") {
  const formData = new FormData();
  formData.set("studentId", STUDENT_ID);
  if (operation === "update") formData.set("recordId", RECORD_ID);
  formData.set("dueDate", "2026-07-28");
  formData.set("priority", "normal");
  formData.set("nextAction", "  Review   updated\nexam plan. ");
  formData.set("details", "  Student   will share updates. ");
  formData.set("consultationId", CONSULTATION_ID);
  return formData;
}

const validTarget = async () => ({ valid: true, error: null });

test("valid note creation normalizes text and uses only the approved payload", async () => {
  let captured: unknown;
  const state = await submitCreateCounselorNote(noteForm(), {
    verifyTarget: validTarget,
    create: async (payload) => {
      captured = payload;
      return { affected: true, error: null };
    },
  });

  assert.equal(state.status, "success");
  assert.deepEqual(captured, {
    student_id: STUDENT_ID,
    consultation_id: CONSULTATION_ID,
    note_text: "Discussed exam planning.",
  });
  assert.doesNotMatch(JSON.stringify(captured), /counselor_id|created_at|role/);
});

test("unlinked notes are valid and optional consultation links are trusted separately", async () => {
  const formData = noteForm();
  formData.set("consultationId", "");
  let verifiedConsultation: string | null | undefined;
  const state = await submitCreateCounselorNote(formData, {
    verifyTarget: async (_studentId, consultationId) => {
      verifiedConsultation = consultationId;
      return { valid: true, error: null };
    },
    create: async () => ({ affected: true, error: null }),
  });

  assert.equal(state.status, "success");
  assert.equal(verifiedConsultation, null);
});

test("blank, overlength, duplicate, malformed, and protected note input is rejected before mutation", async () => {
  const forms = [
    (() => {
      const value = noteForm();
      value.set("noteText", " \n ");
      return value;
    })(),
    (() => {
      const value = noteForm();
      value.set("noteText", "x".repeat(5001));
      return value;
    })(),
    (() => {
      const value = noteForm();
      value.append("noteText", "duplicate");
      return value;
    })(),
    (() => {
      const value = noteForm();
      value.set("studentId", "not-a-uuid");
      return value;
    })(),
    (() => {
      const value = noteForm();
      value.set("counselor_id", RECORD_ID);
      return value;
    })(),
  ];

  for (const formData of forms) {
    let mutated = false;
    const state = await submitCreateCounselorNote(formData, {
      verifyTarget: validTarget,
      create: async () => {
        mutated = true;
        return { affected: true, error: null };
      },
    });
    assert.equal(state.status, "error");
    assert.equal(mutated, false);
  }
});

test("cross-student consultations, staff targets, and unknown targets fail with one safe message", async () => {
  for (const error of [null, { code: "42501", message: "private details" }]) {
    const state = await submitCreateCounselorNote(noteForm(), {
      verifyTarget: async () => ({ valid: false, error }),
      create: async () => ({ affected: true, error: null }),
    });
    assert.equal(state.status, "error");
    assert.equal(
      state.message?.includes("private details") ?? false,
      false,
    );
  }
});

test("note update, pin, and unpin use ownership-scoped stores", async () => {
  let updated: unknown;
  const updateState = await submitUpdateCounselorNote(noteForm("update"), {
    verifyTarget: validTarget,
    update: async (studentId, recordId, payload) => {
      updated = { studentId, recordId, payload };
      return { affected: true, error: null };
    },
  });
  assert.equal(updateState.status, "success");
  assert.deepEqual(updated, {
    studentId: STUDENT_ID,
    recordId: RECORD_ID,
    payload: {
      consultation_id: CONSULTATION_ID,
      note_text: "Discussed exam planning.",
    },
  });

  for (const [value, expected] of [
    ["true", true],
    ["false", false],
  ] as const) {
    const formData = new FormData();
    formData.set("studentId", STUDENT_ID);
    formData.set("recordId", RECORD_ID);
    formData.set("isPinned", value);
    let pinned: boolean | null = null;
    const state = await submitSetCounselorNotePinned(formData, {
      verifyTarget: validTarget,
      pin: async (_studentId, _recordId, isPinned) => {
        pinned = isPinned;
        return { affected: true, error: null };
      },
    });
    assert.equal(state.status, "success");
    assert.equal(pinned, expected);
  }
});

test("note deletion requires explicit confirmation and missing/cross-owner rows are indistinguishable", async () => {
  const formData = new FormData();
  formData.set("studentId", STUDENT_ID);
  formData.set("recordId", RECORD_ID);
  formData.set("confirmDelete", "keep");
  let deleted = false;
  const unconfirmed = await submitDeleteCounselorNote(formData, {
    verifyTarget: validTarget,
    delete: async () => {
      deleted = true;
      return { affected: true, error: null };
    },
  });
  assert.equal(unconfirmed.status, "error");
  assert.equal(deleted, false);

  formData.set("confirmDelete", "delete");
  const missing = await submitDeleteCounselorNote(formData, {
    verifyTarget: validTarget,
    delete: async () => ({ affected: false, error: null }),
  });
  assert.equal(missing.status, "error");
  assert.match(missing.message ?? "", /could not be changed/i);
});

test("follow-up creation supports every priority and emits pending-compatible payloads only", async () => {
  for (const priority of ["low", "normal", "high"] as const) {
    const formData = followUpForm();
    formData.set("priority", priority);
    let captured: unknown;
    const state = await submitCreateCounselorFollowUp(formData, {
      verifyTarget: validTarget,
      create: async (payload) => {
        captured = payload;
        return { affected: true, error: null };
      },
    });
    assert.equal(state.status, "success");
    assert.deepEqual(captured, {
      student_id: STUDENT_ID,
      consultation_id: CONSULTATION_ID,
      due_date: "2026-07-28",
      priority,
      next_action: "Review updated exam plan.",
      details: "Student will share updates.",
    });
    assert.doesNotMatch(
      JSON.stringify(captured),
      /status|completed_at|completed_by|counselor_id/,
    );
  }
});

test("follow-up validation rejects invalid dates, text limits, duplicates, and protected audit injection", async () => {
  const forms = [
    (() => {
      const value = followUpForm();
      value.set("dueDate", "2026-02-30");
      return value;
    })(),
    (() => {
      const value = followUpForm();
      value.set("nextAction", " ");
      return value;
    })(),
    (() => {
      const value = followUpForm();
      value.set("nextAction", "x".repeat(501));
      return value;
    })(),
    (() => {
      const value = followUpForm();
      value.set("details", "x".repeat(2001));
      return value;
    })(),
    (() => {
      const value = followUpForm();
      value.append("priority", "high");
      return value;
    })(),
    (() => {
      const value = followUpForm();
      value.set("completed_at", "2026-07-25T10:00:00Z");
      return value;
    })(),
  ];

  for (const formData of forms) {
    let mutated = false;
    const state = await submitCreateCounselorFollowUp(formData, {
      verifyTarget: validTarget,
      create: async () => {
        mutated = true;
        return { affected: true, error: null };
      },
    });
    assert.equal(state.status, "error");
    assert.equal(mutated, false);
  }
});

test("only pending owned follow-ups can be edited", async () => {
  let captured: unknown;
  const success = await submitUpdateCounselorFollowUp(
    followUpForm("update"),
    {
      verifyTarget: validTarget,
      update: async (studentId, recordId, payload) => {
        captured = { studentId, recordId, payload };
        return { affected: true, error: null };
      },
    },
  );
  assert.equal(success.status, "success");
  assert.deepEqual(captured, {
    studentId: STUDENT_ID,
    recordId: RECORD_ID,
    payload: {
      consultation_id: CONSULTATION_ID,
      due_date: "2026-07-28",
      priority: "normal",
      next_action: "Review updated exam plan.",
      details: "Student will share updates.",
    },
  });

  const finalOrOtherOwner = await submitUpdateCounselorFollowUp(
    followUpForm("update"),
    {
      verifyTarget: validTarget,
      update: async () => ({ affected: false, error: null }),
    },
  );
  assert.equal(finalOrOtherOwner.status, "error");
  assert.match(finalOrOtherOwner.message ?? "", /could not be changed/i);
});

test("follow-up finalization accepts only server-chosen completed or cancelled states", async () => {
  for (const status of ["completed", "cancelled"] as const) {
    const formData = new FormData();
    formData.set("studentId", STUDENT_ID);
    formData.set("recordId", RECORD_ID);
    formData.set("status", "attacker-controlled");
    const injected = await submitRecordCounselorFollowUpStatus(
      formData,
      status,
      {
        verifyTarget: validTarget,
        record: async () => ({ affected: true, data: status, error: null }),
      },
    );
    assert.equal(injected.status, "error");

    formData.delete("status");
    let recorded: unknown;
    const state = await submitRecordCounselorFollowUpStatus(
      formData,
      status,
      {
        verifyTarget: validTarget,
        record: async (studentId, recordId, trustedStatus) => {
          recorded = { studentId, recordId, trustedStatus };
          return { affected: true, data: trustedStatus, error: null };
        },
      },
    );
    assert.equal(state.status, "success");
    assert.deepEqual(recorded, {
      studentId: STUDENT_ID,
      recordId: RECORD_ID,
      trustedStatus: status,
    });
  }
});

test("final, reused, concurrent, and unexpected follow-up failures are sanitized", async () => {
  const formData = new FormData();
  formData.set("studentId", STUDENT_ID);
  formData.set("recordId", RECORD_ID);

  for (const [error, messagePattern] of [
    [{ code: "40001", message: "row lock details" }, /changed/i],
    [{ code: "22023", message: "final state details" }, /check|could not/i],
    [new Error("database connection secret"), /could not change/i],
  ] as const) {
    const state = await submitRecordCounselorFollowUpStatus(
      formData,
      "completed",
      {
        verifyTarget: validTarget,
        record: async () => ({
          affected: false,
          data: undefined,
          error,
        }),
      },
    );
    assert.equal(state.status, "error");
    assert.match(state.message ?? "", messagePattern);
    assert.equal(state.message?.includes("details") ?? false, false);
    assert.equal(state.message?.includes("secret") ?? false, false);
  }
});
