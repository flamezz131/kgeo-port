import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { SlotAvailability } from "./booking";

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
    if (specifier === "@/lib/consultations/booking") {
      return {
        shortCircuit: true,
        url: new URL("./booking.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { availabilityReducer, initialAvailabilityState } = require(
  "./availability-state.ts",
) as typeof import("./availability-state");

const slots: SlotAvailability[] = [
  { slotStart: "14:00", slotEnd: "14:30", availabilityStatus: "available" },
  {
    slotStart: "14:30",
    slotEnd: "15:00",
    availabilityStatus: "unavailable",
  },
  { slotStart: "15:00", slotEnd: "15:30", availabilityStatus: "expired" },
  { slotStart: "15:30", slotEnd: "16:00", availabilityStatus: "available" },
  { slotStart: "16:00", slotEnd: "16:30", availabilityStatus: "available" },
  { slotStart: "16:30", slotEnd: "17:00", availabilityStatus: "available" },
];

function readyState() {
  const loading = availabilityReducer(initialAvailabilityState, {
    type: "date_changed",
    date: "2026-07-21",
    businessToday: "2026-07-20",
  });
  return availabilityReducer(loading, {
    type: "request_succeeded",
    requestId: loading.requestId,
    slots,
  });
}

test("only an available slot can become selected", () => {
  const state = readyState();
  const booked = availabilityReducer(state, {
    type: "slot_selected",
    slotStart: "14:30",
  });
  const expired = availabilityReducer(state, {
    type: "slot_selected",
    slotStart: "15:00",
  });
  const available = availabilityReducer(state, {
    type: "slot_selected",
    slotStart: "14:00",
  });

  assert.equal(booked.selectedSlot, "");
  assert.equal(expired.selectedSlot, "");
  assert.equal(available.selectedSlot, "14:00");
});

test("changing the date immediately clears the selected slot and old rows", () => {
  const selected = availabilityReducer(readyState(), {
    type: "slot_selected",
    slotStart: "14:00",
  });
  const changed = availabilityReducer(selected, {
    type: "date_changed",
    date: "2026-07-22",
    businessToday: "2026-07-20",
  });

  assert.equal(changed.selectedSlot, "");
  assert.deepEqual(changed.slots, []);
  assert.equal(changed.phase, "loading");
});

test("a stale response cannot overwrite the newer date request", () => {
  const first = availabilityReducer(initialAvailabilityState, {
    type: "date_changed",
    date: "2026-07-21",
    businessToday: "2026-07-20",
  });
  const second = availabilityReducer(first, {
    type: "date_changed",
    date: "2026-07-22",
    businessToday: "2026-07-20",
  });
  const afterStaleResponse = availabilityReducer(second, {
    type: "request_succeeded",
    requestId: first.requestId,
    slots,
  });

  assert.equal(afterStaleResponse, second);
  assert.equal(afterStaleResponse.phase, "loading");
  assert.deepEqual(afterStaleResponse.slots, []);
});

test("retry clears selection, increments the request ID, and reloads", () => {
  const failed = availabilityReducer(readyState(), {
    type: "request_failed",
    requestId: readyState().requestId,
  });
  const retried = availabilityReducer(failed, { type: "retry" });

  assert.equal(retried.phase, "loading");
  assert.equal(retried.requestId, failed.requestId + 1);
  assert.equal(retried.selectedDate, "2026-07-21");
  assert.equal(retried.selectedSlot, "");
  assert.deepEqual(retried.slots, []);
});

test("a conflict refresh clears the now-stale selected slot", () => {
  const selected = availabilityReducer(readyState(), {
    type: "slot_selected",
    slotStart: "14:00",
  });
  const signal = {};
  const refreshed = availabilityReducer(selected, {
    type: "refresh_requested",
    signal,
  });

  assert.equal(selected.selectedSlot, "14:00");
  assert.equal(refreshed.selectedSlot, "");
  assert.equal(refreshed.selectedDate, selected.selectedDate);
  assert.equal(refreshed.phase, "loading");
  assert.equal(refreshed.handledRefreshSignal, signal);
});
