import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { ConsultationOutcome } from "./outcome";

const require = createRequire(import.meta.url);
const { submitConsultationOutcome } = require(
  "./outcome.ts",
) as typeof import("./outcome");

const CONSULTATION_ID = "cbb5b648-62de-4e2f-82c6-cbd2a4a31b7f";

test("records only the server-selected completed outcome", async () => {
  const formData = new FormData();
  formData.set("consultationId", CONSULTATION_ID);
  formData.set("outcome", "no_show");
  formData.set("role", "admin");
  formData.set("outcome_recorded_by", "attacker-id");

  let received:
    | { consultationId: string; outcome: ConsultationOutcome }
    | undefined;
  const state = await submitConsultationOutcome(
    formData,
    "completed",
    {
      record: async (consultationId, outcome) => {
        received = { consultationId, outcome };
        return { data: "completed", error: null };
      },
    },
  );

  assert.equal(state.status, "success");
  assert.deepEqual(received, {
    consultationId: CONSULTATION_ID,
    outcome: "completed",
  });
});

test("records the fixed no-show outcome", async () => {
  const formData = new FormData();
  formData.set("consultationId", CONSULTATION_ID);

  const state = await submitConsultationOutcome(formData, "no_show", {
    record: async (_consultationId, outcome) => ({
      data: outcome,
      error: null,
    }),
  });

  assert.equal(state.status, "success");
});

test("rejects missing, malformed, and duplicate consultation identifiers", async () => {
  let calls = 0;
  const store = {
    record: async () => {
      calls += 1;
      return { data: "completed", error: null };
    },
  };

  assert.equal(
    (await submitConsultationOutcome(new FormData(), "completed", store))
      .status,
    "error",
  );

  const malformed = new FormData();
  malformed.set("consultationId", "not-a-uuid");
  assert.equal(
    (await submitConsultationOutcome(malformed, "completed", store)).status,
    "error",
  );

  const duplicate = new FormData();
  duplicate.append("consultationId", CONSULTATION_ID);
  duplicate.append("consultationId", CONSULTATION_ID);
  assert.equal(
    (await submitConsultationOutcome(duplicate, "completed", store)).status,
    "error",
  );
  assert.equal(calls, 0);
});

test("returns sanitized errors for rejected transitions", async () => {
  const formData = new FormData();
  formData.set("consultationId", CONSULTATION_ID);

  const state = await submitConsultationOutcome(formData, "completed", {
    record: async () => ({
      data: null,
      error: {
        code: "22023",
        message:
          "sensitive database detail about consultation and student identity",
      },
    }),
  });

  assert.equal(state.status, "error");
  assert.equal(
    state.message,
    "This consultation is not ready for an outcome. Refresh the schedule and try again.",
  );
  assert.doesNotMatch(state.message ?? "", /sensitive|student identity/i);
});
