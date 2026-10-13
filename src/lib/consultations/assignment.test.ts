import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { submitClaimNextConsultation } = require(
  "./assignment.ts",
) as typeof import("./assignment");

const CONSULTATION_ID = "11111111-1111-4111-8111-111111111111";

test("a valid claimed UUID produces a safe success state", async () => {
  const state = await submitClaimNextConsultation(async () => ({
    data: CONSULTATION_ID,
    error: null,
  }));

  assert.deepEqual(state, {
    status: "success",
    message: "The next FCFS consultation is now assigned to you.",
  });
});

test("an empty FCFS queue produces deterministic no-work feedback", async () => {
  const state = await submitClaimNextConsultation(async () => ({
    data: null,
    error: null,
  }));

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /no booked consultation/i);
});

test("authorization and concurrent changes map to bounded messages", async () => {
  const denied = await submitClaimNextConsultation(async () => ({
    data: null,
    error: { code: "42501", message: "private role detail" },
  }));
  const concurrent = await submitClaimNextConsultation(async () => ({
    data: null,
    error: { code: "40001", message: "private row detail" },
  }));

  assert.equal(denied.message, "This account cannot claim consultations.");
  assert.match(concurrent.message ?? "", /queue changed/i);
  assert.doesNotMatch(`${denied.message} ${concurrent.message}`, /private/i);
});

test("malformed results, unknown errors, and thrown failures are safe", async () => {
  const malformed = await submitClaimNextConsultation(async () => ({
    data: "not-a-uuid",
    error: null,
  }));
  const unknown = await submitClaimNextConsultation(async () => ({
    data: null,
    error: { code: "P0001", message: "sensitive database detail" },
  }));
  const thrown = await submitClaimNextConsultation(async () => {
    throw new Error("sensitive network detail");
  });

  for (const state of [malformed, unknown, thrown]) {
    assert.equal(state.status, "error");
    assert.equal(
      state.message,
      "The next consultation could not be claimed. Please try again.",
    );
  }
});
