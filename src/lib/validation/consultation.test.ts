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
      "@/lib/consultations/booking": "../consultations/booking.ts",
      "@/lib/consultations/options": "../consultations/options.ts",
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

const { createConsultationRequestSchema, validateConsultationRequest } =
  require("./consultation.ts") as typeof import("./consultation");

const FIXED_NOW = new Date("2026-07-20T08:00:00.000Z");

function createValidFormData() {
  const formData = new FormData();
  formData.set("studentName", "Kumar Student");
  formData.set("rollNumber", "22bcs001");
  formData.set("personalEmail", "student@example.com");
  formData.set("collegeEndYear", "2027");
  formData.set("course", "B.E");
  formData.set("department", "Computer Science and Engineering");
  formData.set("mobileNumber", "9876543210");
  formData.set("higherStudiesInterest", "interested");
  formData.set("consultationDate", "2026-07-21");
  formData.set("slotStart", "14:00");
  return formData;
}

function validate(formData: FormData, now = FIXED_NOW) {
  return validateConsultationRequest(formData, now);
}

test("accepts a valid future weekday and fixed consultation slot", () => {
  assert.equal(validate(createValidFormData()).success, true);
});

test("preserves ISO consultation dates without transposition", () => {
  for (const consultationDate of ["2026-07-22", "2026-07-24"]) {
    const formData = createValidFormData();
    formData.set("consultationDate", consultationDate);
    const result = validate(formData);
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.consultationDate, consultationDate);
    }
  }
});

test("rejects dates outside the rolling seven-calendar-date horizon", () => {
  const formData = createValidFormData();
  formData.set("consultationDate", "2026-07-27");
  const result = validate(formData);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.errors.consultationDate?.[0] ?? "", /seven/i);
  }
});

test("trims the student name and normalizes roll number and email", () => {
  const formData = createValidFormData();
  formData.set("studentName", "  Kumar Student  ");
  formData.set("rollNumber", "  22bcs001  ");
  formData.set("personalEmail", "  STUDENT@EXAMPLE.COM  ");

  const result = validate(formData);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.studentName, "Kumar Student");
    assert.equal(result.data.rollNumber, "22BCS001");
    assert.equal(result.data.personalEmail, "student@example.com");
  }
});

for (const [name, field, value] of [
  ["invalid personal email", "personalEmail", "not-an-email"],
  ["unknown course", "course", "Unknown Course"],
  ["college end year outside the database range", "collegeEndYear", "2041"],
  ["non-ten-digit mobile number", "mobileNumber", "98765-43210"],
  ["invalid higher-studies interest", "higherStudiesInterest", "very_interested"],
  ["non-strict date format", "consultationDate", "2026-7-21"],
  ["impossible calendar date", "consultationDate", "2026-02-30"],
  ["past consultation date", "consultationDate", "2026-07-17"],
  ["weekend consultation date", "consultationDate", "2026-07-25"],
  ["unknown consultation slot", "slotStart", "13:15"],
] as const) {
  test(`rejects ${name}`, () => {
    const formData = createValidFormData();
    formData.set(field, value);
    assert.equal(validate(formData).success, false);
  });
}

test("rejects a department outside the selected course", () => {
  const formData = createValidFormData();
  formData.set("course", "MBA");
  formData.set("department", "Computer Science and Engineering");
  assert.equal(validate(formData).success, false);
});

test("rejects a current-day slot that has started in Asia/Kolkata", () => {
  const formData = createValidFormData();
  formData.set("consultationDate", "2026-07-20");
  formData.set("slotStart", "14:30");
  const now = new Date("2026-07-20T09:00:00.000Z");
  const result = validate(formData, now);

  assert.equal(result.success, false);
  if (!result.success) {
    assert.match(result.errors.slotStart?.[0] ?? "", /expired/i);
  }
});

test("accepts a current-day slot one minute before it starts", () => {
  const formData = createValidFormData();
  formData.set("consultationDate", "2026-07-20");
  formData.set("slotStart", "14:00");

  assert.equal(
    validate(formData, new Date("2026-07-20T08:29:00.000Z")).success,
    true,
  );
});

test("rejects malformed FormData file values", () => {
  const formData = createValidFormData();
  formData.set("studentName", new File(["Kumar"], "student.txt"));
  assert.equal(validate(formData).success, false);
});

test("strips injected slot_end and all trusted fields", () => {
  const result = createConsultationRequestSchema(FIXED_NOW).safeParse({
    studentName: "Kumar Student",
    rollNumber: "22BCS001",
    personalEmail: "student@example.com",
    collegeEndYear: "2027",
    course: "B.E",
    department: "Computer Science and Engineering",
    mobileNumber: "9876543210",
    higherStudiesInterest: "exploring",
    consultationDate: "2026-07-21",
    slotStart: "14:00",
    slot_end: "17:00",
    student_id: "attacker-id",
    college_email: "attacker@example.com",
    request_number: "FAKE-1",
    status: "completed",
    assigned_counselor_id: "attacker-counselor",
    assigned_at: "2000-01-01",
    submitted_at: "2000-01-01",
    created_at: "2000-01-01",
    updated_at: "2000-01-01",
    metadata: { role: "admin" },
  });

  assert.equal(result.success, true);
  if (result.success) {
    for (const protectedField of [
      "slot_end",
      "student_id",
      "college_email",
      "request_number",
      "status",
      "assigned_counselor_id",
      "assigned_at",
      "submitted_at",
      "created_at",
      "updated_at",
      "metadata",
    ]) {
      assert.equal(Object.hasOwn(result.data, protectedField), false);
    }
  }
});
