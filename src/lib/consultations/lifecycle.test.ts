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
    if (specifier === "@/lib/consultations/booking") {
      return {
        shortCircuit: true,
        url: new URL("./booking.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  getActiveOrFutureScheduledFilter,
  getConsultationLifecycleState,
  getConsultationPresentationGroup,
  getOutcomeRequiredScheduledFilter,
  getStudentConsultationLifecycleLabel,
  getUpcomingScheduledFilter,
} = require("./lifecycle.ts") as typeof import("./lifecycle");

function scheduled(status: ConsultationStatus = "scheduled") {
  return {
    status,
    consultationDate: "2026-07-22",
    slotStart: "14:00:00",
    slotEnd: "14:30:00",
  };
}

test("derives Asia/Kolkata scheduled lifecycle boundaries", () => {
  assert.equal(
    getConsultationLifecycleState(
      scheduled(),
      new Date("2026-07-22T08:29:00.000Z"),
    ),
    "upcoming",
  );
  assert.equal(
    getConsultationLifecycleState(
      scheduled(),
      new Date("2026-07-22T08:30:00.000Z"),
    ),
    "in_progress",
  );
  assert.equal(
    getConsultationLifecycleState(
      scheduled(),
      new Date("2026-07-22T08:59:00.000Z"),
    ),
    "in_progress",
  );
  assert.equal(
    getConsultationLifecycleState(
      scheduled(),
      new Date("2026-07-22T09:00:00.000Z"),
    ),
    "outcome_required",
  );
});

test("past scheduled consultations require an outcome", () => {
  assert.equal(
    getConsultationLifecycleState(
      {
        ...scheduled(),
        consultationDate: "2026-07-21",
      },
      new Date("2026-07-22T00:00:00.000Z"),
    ),
    "outcome_required",
  );
});

test("stored final statuses remain final regardless of the clock", () => {
  const now = new Date("2026-07-22T08:00:00.000Z");
  assert.equal(
    getConsultationLifecycleState(scheduled("completed"), now),
    "completed",
  );
  assert.equal(
    getConsultationLifecycleState(scheduled("no_show"), now),
    "no_show",
  );
  assert.equal(
    getConsultationLifecycleState(scheduled("cancelled"), now),
    "cancelled",
  );
});

test("student lifecycle wording never exposes retired assignment-queue language", () => {
  assert.equal(
    getStudentConsultationLifecycleLabel("outcome_required"),
    "Outcome Pending",
  );
  assert.equal(
    getStudentConsultationLifecycleLabel("pending"),
    "Booking needs review",
  );
  assert.equal(
    getStudentConsultationLifecycleLabel("expired_request"),
    "Expired Request",
  );
  assert.equal(getStudentConsultationLifecycleLabel("completed"), "Completed");
});

test("complete assignment-pending requests become expired history at slot end", () => {
  const beforeEnd = new Date("2026-07-22T08:59:00.000Z");
  const atEnd = new Date("2026-07-22T09:00:00.000Z");

  for (const status of ["submitted", "waiting_for_assignment"] as const) {
    assert.equal(
      getConsultationLifecycleState(scheduled(status), beforeEnd),
      "assignment_pending",
    );
    assert.equal(
      getConsultationPresentationGroup("assignment_pending"),
      "upcoming",
    );
    assert.equal(
      getConsultationLifecycleState(scheduled(status), atEnd),
      "expired_request",
    );
    assert.equal(getConsultationPresentationGroup("expired_request"), "history");
    assert.equal(
      getStudentConsultationLifecycleLabel("expired_request"),
      "Expired Request",
    );
  }
});

test("complete counselor-assigned requests become outcome-pending history", () => {
  assert.equal(
    getConsultationLifecycleState(
      scheduled("counselor_assigned"),
      new Date("2026-07-22T08:59:00.000Z"),
    ),
    "counselor_assigned",
  );
  assert.equal(
    getConsultationPresentationGroup("counselor_assigned"),
    "upcoming",
  );
  assert.equal(
    getConsultationLifecycleState(
      scheduled("counselor_assigned"),
      new Date("2026-07-22T09:00:00.000Z"),
    ),
    "outcome_required",
  );
});

test("malformed nonterminal requests remain pending in presentation", () => {
  for (const status of [
    "submitted",
    "waiting_for_assignment",
    "counselor_assigned",
    "scheduled",
  ] as const) {
    assert.equal(
      getConsultationLifecycleState(
        { ...scheduled(status), slotEnd: null },
        new Date("2026-07-23T09:00:00.000Z"),
      ),
      "pending",
    );
  }

  for (const malformed of [
    {
      ...scheduled("waiting_for_assignment"),
      slotStart: "09:15",
      slotEnd: "09:45",
    },
    { ...scheduled("scheduled"), slotStart: "14:00", slotEnd: "15:00" },
    {
      ...scheduled("counselor_assigned"),
      consultationDate: "2026-07-25",
    },
  ]) {
    assert.equal(
      getConsultationLifecycleState(
        malformed,
        new Date("2026-07-26T09:00:00.000Z"),
      ),
      "pending",
    );
  }
});

test("presentation groups keep elapsed scheduled history out of upcoming", () => {
  assert.equal(getConsultationPresentationGroup("upcoming"), "upcoming");
  assert.equal(getConsultationPresentationGroup("in_progress"), "upcoming");
  assert.equal(
    getConsultationPresentationGroup("assignment_pending"),
    "upcoming",
  );
  assert.equal(
    getConsultationPresentationGroup("counselor_assigned"),
    "upcoming",
  );
  assert.equal(getConsultationPresentationGroup("pending"), "pending");
  assert.equal(getConsultationPresentationGroup("expired_request"), "history");
  assert.equal(getConsultationPresentationGroup("outcome_required"), "history");
  assert.equal(getConsultationPresentationGroup("completed"), "history");
  assert.equal(getConsultationPresentationGroup("no_show"), "history");
  assert.equal(getConsultationPresentationGroup("cancelled"), "history");
});

test("dashboard filters separate upcoming, active, and outcome-required rows", () => {
  assert.equal(
    getUpcomingScheduledFilter("2026-07-22", "14:00"),
    "consultation_date.gt.2026-07-22,and(consultation_date.eq.2026-07-22,slot_start.gt.14:00)",
  );
  assert.equal(
    getActiveOrFutureScheduledFilter("2026-07-22", "14:00"),
    "consultation_date.gt.2026-07-22,and(consultation_date.eq.2026-07-22,slot_end.gt.14:00)",
  );
  assert.equal(
    getOutcomeRequiredScheduledFilter("2026-07-22", "14:00"),
    "consultation_date.lt.2026-07-22,and(consultation_date.eq.2026-07-22,slot_end.lte.14:00)",
  );
});
