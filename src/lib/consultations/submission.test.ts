import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import type { ConsultationBookingPayload } from "./submission";

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
      "@/lib/consultations/options": "./options.ts",
      "@/lib/validation/consultation": "../validation/consultation.ts",
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

const { submitConsultationRequest } = require(
  "./submission.ts",
) as typeof import("./submission");
const { isConsultationSubmissionLocked } = require(
  "./submission-state.ts",
) as typeof import("./submission-state");

const FIXED_NOW = new Date("2026-07-20T08:00:00.000Z");
const expectedReceipt = {
  request_number: "KGEOC-2026-000009",
  status: "scheduled" as const,
  consultation_date: "2026-07-21",
  slot_start: "14:00:00",
  slot_end: "14:30:00",
};

function createValidFormData() {
  const formData = new FormData();
  formData.set("studentName", "Kumar Student");
  formData.set("rollNumber", "22bcs001");
  formData.set("personalEmail", "STUDENT@EXAMPLE.COM");
  formData.set("collegeEndYear", "2027");
  formData.set("course", "B.E");
  formData.set("department", "Computer Science and Engineering");
  formData.set("mobileNumber", "9876543210");
  formData.set("higherStudiesInterest", "exploring");
  formData.set("consultationDate", "2026-07-21");
  formData.set("slotStart", "14:00");
  formData.set("slot_end", "17:00");
  formData.set("student_id", "attacker-id");
  formData.set("college_email", "attacker@example.com");
  formData.set("status", "completed");
  return formData;
}

test("passes exactly the ten validated booking arguments to the trusted RPC adapter", async () => {
  let capturedPayload: ConsultationBookingPayload | null = null;
  const state = await submitConsultationRequest(
    createValidFormData(),
    async (payload) => {
      capturedPayload = payload;
      return { data: expectedReceipt, error: null };
    },
    FIXED_NOW,
  );

  assert.equal(state.status, "success");
  assert.deepEqual(capturedPayload, {
    studentName: "Kumar Student",
    rollNumber: "22BCS001",
    personalEmail: "student@example.com",
    collegeEndYear: 2027,
    department: "Computer Science and Engineering",
    course: "B.E",
    mobileNumber: "9876543210",
    higherStudiesInterest: "exploring",
    consultationDate: "2026-07-21",
    slotStart: "14:00",
  });
  assert.deepEqual(state.receipt, expectedReceipt);
  assert.equal(
    state.message,
    "Consultation Confirmed",
  );
});

test("maps exact-slot unique conflicts to a safe refreshable error", async () => {
  const internalMessage = "duplicate booking details that must stay private";
  const state = await submitConsultationRequest(
    createValidFormData(),
    async () => ({
      data: null,
      error: {
        code: "23505",
        constraint: "consultation_requests_active_student_slot_key",
        message: internalMessage,
      },
    }),
    FIXED_NOW,
  );

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /time slot is no longer available/i);
  assert.equal(
    state.message?.includes("consultation_requests_active_student_slot_key"),
    false,
  );
  assert.equal(state.message?.includes(internalMessage), false);
  assert.equal(state.refreshAvailability, true);
  assert.deepEqual(state.errors?.slotStart, ["Choose another available time slot."]);
});

test("rejects an unexpected non-scheduled receipt", async () => {
  const state = await submitConsultationRequest(
    createValidFormData(),
    async () => ({
      data: { ...expectedReceipt, status: "waiting_for_assignment" },
      error: null,
    }),
    FIXED_NOW,
  );

  assert.equal(state.status, "error");
  assert.equal(state.receipt, undefined);
  assert.equal(
    state.message,
    "We could not book your consultation. Please try again.",
  );
});

test("trusted booking path calls only the automatic-allocation RPC", () => {
  const migrationSource = readFileSync(
    new URL(
      "../../../supabase/migrations/202608240001_automatic_consultation_allocation.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const actionSource = readFileSync(
    new URL("../../app/actions/consultation-actions.ts", import.meta.url),
    "utf8",
  );

  assert.match(
    migrationSource,
    /create or replace function public\.book_student_consultation\(/,
  );
  assert.match(actionSource, /\.rpc\("book_student_consultation"/);
  assert.doesNotMatch(actionSource, /\.from\("consultation_requests"\)[\s\S]*?\.insert\(/);
  assert.match(actionSource, /!data\?\.consultation_date/);
  assert.match(actionSource, /!data\.slot_start/);
  assert.match(actionSource, /!data\.slot_end/);
});

test("maps the expired-slot database error without exposing internals", async () => {
  const internalMessage = "The selected consultation slot has expired";
  const state = await submitConsultationRequest(
    createValidFormData(),
    async () => ({ data: null, error: { code: "23514", message: internalMessage } }),
    FIXED_NOW,
  );

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /slot has expired/i);
  assert.equal(state.message?.includes(internalMessage), false);
  assert.equal(state.refreshAvailability, true);
});

test("maps database date and authorization rejections to safe messages", async () => {
  const dateState = await submitConsultationRequest(
    createValidFormData(),
    async () => ({
      data: null,
      error: { code: "23514", message: "The consultation date cannot be in the past" },
    }),
    FIXED_NOW,
  );
  const authorizationState = await submitConsultationRequest(
    createValidFormData(),
    async () => ({
      data: null,
      error: { code: "42501", message: "private authorization details" },
    }),
    FIXED_NOW,
  );

  assert.match(dateState.message ?? "", /date is no longer available/i);
  assert.equal(dateState.refreshAvailability, true);
  assert.equal(
    authorizationState.message,
    "You are not authorized to book this consultation.",
  );
  assert.equal(authorizationState.message.includes("private"), false);
});

test("does not preserve the retired one-active-consultation message", async () => {
  const state = await submitConsultationRequest(
    createValidFormData(),
    async () => ({
      data: null,
      error: {
        code: "23514",
        message: "You already have an active or upcoming consultation",
        details: "private consultation identity",
      },
    }),
    FIXED_NOW,
  );

  assert.equal(
    state.message,
    "We could not book your consultation. Please try again.",
  );
  assert.equal(state.message.includes("private"), false);
});

test("returns a generic error without exposing database details", async () => {
  const internalMessage = "connection pool failed with private details";
  const state = await submitConsultationRequest(
    createValidFormData(),
    async () => ({ data: null, error: new Error(internalMessage) }),
    FIXED_NOW,
  );

  assert.equal(state.status, "error");
  assert.equal(
    state.message,
    "We could not book your consultation. Please try again.",
  );
  assert.equal(state.message?.includes(internalMessage), false);
});

test("locks the UI while pending and after a successful response", () => {
  assert.equal(isConsultationSubmissionLocked(true, { status: "idle" }), true);
  assert.equal(
    isConsultationSubmissionLocked(false, { status: "success" }),
    true,
  );
  assert.equal(isConsultationSubmissionLocked(false, { status: "error" }), false);
});
