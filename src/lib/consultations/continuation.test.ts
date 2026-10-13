import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { submitContinueWithKgeo } = require("./continuation.ts") as typeof import("./continuation");

test("Continue treats newly-created and existing active cases as safe success", async () => {
  for (const created of [true, false]) {
    const state = await submitContinueWithKgeo({
      activate: async () => ({ data: created, error: null }),
    });
    assert.deepEqual(state, {
      status: "success",
      message: "Your K-GEO counseling case is active.",
    });
  }
});

test("scheduled, no-show, or another Student consultation fails safely", async () => {
  const state = await submitContinueWithKgeo({
    activate: async () => ({
      data: null,
      error: {
        code: "22023",
        message: "A completed Student consultation is required to continue with K-GEO",
      },
    }),
  });

  assert.deepEqual(state, {
    status: "error",
    message: "Only your completed consultation can be used to continue with K-GEO.",
  });
});

test("ineligible consultation Counselor requires staff review without details", async () => {
  const state = await submitContinueWithKgeo({
    activate: async () => ({
      data: null,
      error: {
        code: "55000",
        message: "K-GEO staff review is required before this case can be activated",
      },
    }),
  });

  assert.deepEqual(state, {
    status: "error",
    message:
      "K-GEO staff review is required before your counseling case can be activated.",
  });
});
