import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  CONSULTATION_SLOTS,
  formatConsultationTimeRange,
  getAsiaKolkataBusinessDateTime,
  getAvailabilityStatusLabel,
  getBookingDateIssue,
  formatConsultationDate,
  getConsultationScheduleDisplay,
  isSlotExpired,
  isSlotSelectable,
  normalizeAvailabilityRows,
} = require("./booking.ts") as typeof import("./booking");

test("keeps ISO date-only values exact without day/month transposition", () => {
  assert.equal(formatConsultationDate("2026-07-22"), "22 July 2026");
  assert.equal(formatConsultationDate("2027-02-22"), "22 February 2027");
  assert.equal(formatConsultationDate("22/07/2026"), "22/07/2026");
});

test("derives business date and time in Asia/Kolkata deterministically", () => {
  assert.deepEqual(
    getAsiaKolkataBusinessDateTime(new Date("2026-07-19T20:00:00.000Z")),
    { date: "2026-07-20", time: "01:30" },
  );
});

test("strictly classifies malformed, impossible, past, and weekend dates", () => {
  const today = "2026-07-20";
  assert.equal(getBookingDateIssue("2026-7-21", today), "format");
  assert.equal(getBookingDateIssue("2026-02-30", today), "invalid_date");
  assert.equal(getBookingDateIssue("2026-07-19", today), "past");
  assert.equal(getBookingDateIssue("2026-07-25", today), "weekend");
  assert.equal(getBookingDateIssue("2026-07-21", today), null);
  assert.equal(getBookingDateIssue("2026-07-27", today), "outside_horizon");
});

test("uses seven calendar dates without extending for weekends", () => {
  const wednesday = "2026-07-22";
  assert.equal(getBookingDateIssue("2026-07-22", wednesday), null);
  assert.equal(getBookingDateIssue("2026-07-28", wednesday), null);
  assert.equal(
    getBookingDateIssue("2026-07-29", wednesday),
    "outside_horizon",
  );
  assert.equal(getBookingDateIssue("2026-07-25", wednesday), "weekend");
  assert.equal(getBookingDateIssue("2026-07-26", wednesday), "weekend");
});

test("marks a slot expired when it has started in Asia/Kolkata", () => {
  const now = new Date("2026-07-20T09:00:00.000Z");
  assert.equal(isSlotExpired("2026-07-20", "14:30", now), true);
  assert.equal(isSlotExpired("2026-07-20", "15:00", now), false);
  assert.equal(isSlotExpired("2026-07-21", "14:00", now), false);
});

test("matches the database boundary at the exact start and one minute before", () => {
  const consultationDate = "2026-07-20";
  assert.equal(
    isSlotExpired(
      consultationDate,
      "14:00",
      new Date("2026-07-20T08:30:00.000Z"),
    ),
    true,
  );
  assert.equal(
    isSlotExpired(
      consultationDate,
      "14:00",
      new Date("2026-07-20T08:29:00.000Z"),
    ),
    false,
  );
});

test("normalizes all sixteen typed RPC rows without student information", () => {
  const rows = CONSULTATION_SLOTS.map((slot, index) => ({
    slot_start: `${slot.start}:00`,
    slot_end: `${slot.end}:00`,
    availability_status:
      index === 1
        ? ("unavailable" as const)
        : index === 2
          ? ("expired" as const)
          : ("available" as const),
  }));

  const normalized = normalizeAvailabilityRows(rows);
  assert.equal(normalized?.length, 16);
  assert.deepEqual(normalized?.slice(0, 3), [
    { slotStart: "09:00", slotEnd: "09:30", availabilityStatus: "available" },
    {
      slotStart: "09:30",
      slotEnd: "10:00",
      availabilityStatus: "unavailable",
    },
    { slotStart: "10:00", slotEnd: "10:30", availabilityStatus: "expired" },
  ]);
});

test("fails closed for malformed RPC rows and unknown availability values", () => {
  const validRows = CONSULTATION_SLOTS.map((slot) => ({
    slot_start: `${slot.start}:00`,
    slot_end: `${slot.end}:00`,
    availability_status: "available",
  }));
  const malformedRows: unknown[] = [...validRows];
  malformedRows[2] = null;
  const unknownStatusRows = validRows.map((row) => ({ ...row }));
  unknownStatusRows[4].availability_status = "reserved";

  assert.equal(normalizeAvailabilityRows(malformedRows), null);
  assert.equal(normalizeAvailabilityRows(unknownStatusRows), null);
  assert.equal(normalizeAvailabilityRows({ rows: validRows }), null);
});

test("exposes explicit labels and selection rules for every status", () => {
  assert.equal(getAvailabilityStatusLabel("available"), "Available");
  assert.equal(getAvailabilityStatusLabel("unavailable"), "Unavailable");
  assert.equal(getAvailabilityStatusLabel("expired"), "Expired");
  assert.equal(isSlotSelectable("available"), true);
  assert.equal(isSlotSelectable("unavailable"), false);
  assert.equal(isSlotSelectable("expired"), false);
});

test("formats scheduled and legacy dashboard rows safely", () => {
  assert.equal(formatConsultationTimeRange("14:00:00", "14:30:00"), "2:00 PM \u2013 2:30 PM");
  assert.deepEqual(
    getConsultationScheduleDisplay({
      consultationDate: null,
      slotStart: null,
      slotEnd: null,
    }),
    {
      kind: "legacy",
      label:
        "Legacy consultation request \u2014 no appointment slot was booked.",
    },
  );

  const scheduled = getConsultationScheduleDisplay({
    consultationDate: "2026-07-21",
    slotStart: "14:00:00",
    slotEnd: "14:30:00",
  });
  assert.equal(scheduled.kind, "scheduled");
  if (scheduled.kind === "scheduled") {
    assert.equal(scheduled.dateLabel, "21 July 2026");
    assert.equal(scheduled.timeLabel, "2:00 PM \u2013 2:30 PM");
  }
});
