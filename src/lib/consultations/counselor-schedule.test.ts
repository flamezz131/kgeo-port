import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { ConsultationStatus } from "@/types";

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
      "@/lib/consultations/booking": "./booking.ts",
      "@/lib/consultations/lifecycle": "./lifecycle.ts",
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
  buildCounselorDaySchedule,
  getCancelledBookings,
  getLegacyUnscheduledBookings,
  resolveCounselorScheduleDate,
} = require("./counselor-schedule.ts") as typeof import("./counselor-schedule");

type TestBooking = {
  id: string;
  consultation_date: string | null;
  slot_start: string | null;
  slot_end: string | null;
  status: ConsultationStatus;
};

const now = new Date("2026-07-20T09:00:00.000Z"); // 14:30 Asia/Kolkata

test("maps all sixteen fixed weekday slots in chronological order", () => {
  const schedule = buildCounselorDaySchedule<TestBooking>(
    "2026-07-21",
    [],
    now,
  );
  assert.equal(schedule.kind, "weekday");
  if (schedule.kind !== "weekday") return;

  assert.deepEqual(
    schedule.slots.map((slot) => slot.slotStart),
    [
      "09:00",
      "09:30",
      "10:00",
      "10:30",
      "11:00",
      "11:30",
      "12:00",
      "12:30",
      "13:00",
      "13:30",
      "14:00",
      "14:30",
      "15:00",
      "15:30",
      "16:00",
      "16:30",
    ],
  );
  assert.ok(schedule.slots.every((slot) => slot.state === "available"));
});

test("maps a valid active booking without leaking it into other slots", () => {
  const booking: TestBooking = {
    id: "booking-1",
    consultation_date: "2026-07-21",
    slot_start: "15:00:00",
    slot_end: "15:30:00",
    status: "scheduled",
  };
  const schedule = buildCounselorDaySchedule(
    "2026-07-21",
    [booking],
    now,
  );
  assert.equal(schedule.kind, "weekday");
  if (schedule.kind !== "weekday") return;

  const booked = schedule.slots.find((slot) => slot.slotStart === "15:00");
  assert.equal(booked?.state, "upcoming");
  assert.equal(booked?.booking, booking);
  assert.equal(
    schedule.slots.filter((slot) => slot.state === "upcoming").length,
    1,
  );
});

test("uses Asia/Kolkata and expires a current-day slot at its start", () => {
  const schedule = buildCounselorDaySchedule<TestBooking>(
    "2026-07-20",
    [],
    now,
  );
  assert.equal(schedule.kind, "weekday");
  if (schedule.kind !== "weekday") return;

  assert.ok(schedule.slots.slice(0, 12).every((slot) => slot.state === "expired"));
  assert.equal(schedule.slots[12].state, "available");
});

test("keeps a cancelled record separate and releases its past slot", () => {
  const cancelled: TestBooking = {
    id: "cancelled-1",
    consultation_date: "2026-07-17",
    slot_start: "16:00",
    slot_end: "16:30",
    status: "cancelled",
  };
  const schedule = buildCounselorDaySchedule<TestBooking>(
    "2026-07-17",
    [cancelled],
    now,
  );
  assert.equal(schedule.kind, "weekday");
  if (schedule.kind !== "weekday") return;
  assert.ok(schedule.slots.every((slot) => slot.state === "expired"));
  assert.deepEqual(getCancelledBookings([cancelled]), [cancelled]);
});

test("a cancelled future booking releases the slot and remains in history", () => {
  const cancelled: TestBooking = {
    id: "cancelled-2",
    consultation_date: "2026-07-21",
    slot_start: "16:00",
    slot_end: "16:30",
    status: "cancelled",
  };
  const schedule = buildCounselorDaySchedule<TestBooking>(
    "2026-07-21",
    [cancelled],
    now,
  );
  assert.equal(schedule.kind, "weekday");
  if (schedule.kind !== "weekday") return;

  assert.equal(
    schedule.slots.find((slot) => slot.slotStart === "16:00")?.state,
    "available",
  );
  assert.deepEqual(getCancelledBookings([cancelled]), [cancelled]);
});

test("an active rebooking takes precedence over cancelled history", () => {
  const schedule = buildCounselorDaySchedule<TestBooking>(
    "2026-07-21",
    [
      {
        id: "cancelled-3",
        consultation_date: "2026-07-21",
        slot_start: "16:00",
        slot_end: "16:30",
        status: "cancelled",
      },
      {
        id: "replacement-1",
        consultation_date: "2026-07-21",
        slot_start: "16:00",
        slot_end: "16:30",
        status: "scheduled",
      },
    ],
    now,
  );
  assert.equal(schedule.kind, "weekday");
  if (schedule.kind !== "weekday") return;

  const slot = schedule.slots.find((entry) => entry.slotStart === "16:00");
  assert.equal(slot?.state, "upcoming");
  assert.equal(slot?.booking?.id, "replacement-1");
  assert.deepEqual(
    getCancelledBookings([
      {
        id: "cancelled-3",
        consultation_date: "2026-07-21",
        slot_start: "16:00",
        slot_end: "16:30",
        status: "cancelled",
      },
    ]).map((booking) => booking.id),
    ["cancelled-3"],
  );
});

test("returns a weekend state without misleading available slots", () => {
  assert.deepEqual(
    buildCounselorDaySchedule<TestBooking>("2026-07-19", [], now),
    { kind: "weekend", slots: [] },
  );
});

test("keeps legacy null schedules separate from dated slots", () => {
  const legacy: TestBooking = {
    id: "legacy-1",
    consultation_date: null,
    slot_start: null,
    slot_end: null,
    status: "waiting_for_assignment",
  };
  const nonLegacyNullSlot: TestBooking = {
    ...legacy,
    id: "not-legacy",
    status: "submitted",
  };
  const partialLegacy: TestBooking = {
    ...legacy,
    id: "partial-legacy",
    slot_start: "14:00",
  };
  const scheduled: TestBooking = {
    id: "scheduled-1",
    consultation_date: "2026-07-21",
    slot_start: "14:00",
    slot_end: "14:30",
    status: "scheduled",
  };
  assert.deepEqual(
    getLegacyUnscheduledBookings([
      legacy,
      nonLegacyNullSlot,
      partialLegacy,
      scheduled,
    ]),
    [legacy],
  );
});

test("accepts one date value and rejects duplicate or malformed input", () => {
  assert.equal(
    resolveCounselorScheduleDate("2026-07-21", "2026-07-20"),
    "2026-07-21",
  );
  assert.equal(
    resolveCounselorScheduleDate(["2026-07-21", "2026-07-22"], "2026-07-20"),
    "2026-07-20",
  );
  assert.equal(
    resolveCounselorScheduleDate("next-week", "2026-07-20"),
    "2026-07-20",
  );
});
