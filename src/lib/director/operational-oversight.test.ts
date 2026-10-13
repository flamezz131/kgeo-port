import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

type ResolveHook = (specifier: string, context: object, nextResolve: (specifier: string, context: object) => unknown) => unknown;
const require = createRequire(import.meta.url);
const { registerHooks } = require("node:module") as { registerHooks: (hooks: { resolve: ResolveHook }) => void };
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/types") return { shortCircuit: true, url: new URL("../../types/index.ts", import.meta.url).href };
    return nextResolve(specifier, context);
  },
});

const oversight = require("./operational-oversight.ts") as typeof import("./operational-oversight");

test("student filters accept useful values and reject duplicates or controls", () => {
  assert.deepEqual(oversight.parseStudentOversightFilters({ q: "  Student  ", active: "active", progression: "on_hold", page: "2" }), {
    search: "Student", active: true, progression: "on_hold", page: 2,
  });
  assert.equal(oversight.parseStudentOversightFilters({ q: ["a", "b"] }), null);
  assert.equal(oversight.parseStudentOversightFilters({ q: "bad\nquery" }), null);
  assert.equal(oversight.parseStudentOversightFilters({ active: "enabled" }), null);
});

test("consultation filters validate status dates range and page bounds", () => {
  assert.deepEqual(oversight.parseConsultationOversightFilters({ status: "scheduled", dateFrom: "2026-08-01", dateTo: "2026-08-10" }), {
    search: null, status: "scheduled", dateFrom: "2026-08-01", dateTo: "2026-08-10", page: 1,
  });
  assert.equal(oversight.parseConsultationOversightFilters({ status: "private" }), null);
  assert.equal(oversight.parseConsultationOversightFilters({ dateFrom: "2026-08-10", dateTo: "2026-08-01" }), null);
  assert.equal(oversight.parseConsultationOversightFilters({ page: "100001" }), null);
});

test("application filters default to active and reject unknown archive states", () => {
  assert.deepEqual(oversight.parseApplicationOversightFilters({}), { search: null, status: null, archive: "active", page: 1 });
  assert.equal(oversight.parseApplicationOversightFilters({ archive: "deleted" }), null);
  assert.equal(oversight.parseApplicationOversightFilters({ status: ["planning", "submitted"] }), null);
});

test("student response parsing preserves zero counts and rejects private extras", () => {
  const row = {
    student_id: "11111111-1111-4111-8111-111111111111", full_name: null,
    college_email: "student@kct.ac.in", is_active: true,
    account_created_at: "2026-08-01T00:00:00+00:00", course: null,
    department: null, graduation_year: null, profile_state: "profile_not_started",
    progression_stage: null, progression_state: null, total_consultations: 0,
    open_consultations: 0, active_applications: 0, total_count: 1,
  };
  const parsed = oversight.parseDirectorStudentOversight([row]);
  assert.equal(parsed.totalCount, 1);
  assert.equal(parsed.items[0].openConsultations, 0);
  assert.throws(() => oversight.parseDirectorStudentOversight([{ ...row, private_note: "hidden" }]));
});

test("consultation response parsing enforces nullable counselor and safe shape", () => {
  const parsed = oversight.parseDirectorConsultationOversight([{
    consultation_id: "22222222-2222-4222-8222-222222222222", request_number: "KCT-1",
    student_id: "11111111-1111-4111-8111-111111111111", student_full_name: "Student",
    student_college_email: "student@kct.ac.in", counselor_id: null,
    counselor_full_name: null, counselor_college_email: null,
    consultation_date: "2026-08-10", slot_start: "10:00:00", slot_end: "10:30:00",
    consultation_status: "waiting_for_assignment", outcome_recorded_at: null,
    submitted_at: "2026-08-01T00:00:00+00:00", total_count: 1,
  }]);
  assert.equal(parsed.items[0].counselorId, null);
  assert.equal(parsed.items[0].consultationStatus, "waiting_for_assignment");
});

test("application response parsing maps canonical status and ownership context", () => {
  const parsed = oversight.parseDirectorApplicationOversight([{
    application_id: "33333333-3333-4333-8333-333333333333",
    student_id: "11111111-1111-4111-8111-111111111111", student_full_name: "Student",
    student_college_email: "student@kct.ac.in", counselor_id: null,
    counselor_full_name: null, counselor_college_email: null,
    university_name: "University", programme_name: "Program", country_code: "IN",
    degree_level: "masters", intake_term: "fall", intake_year: 2027,
    application_status: "additional_information_requested", submission_deadline: null,
    submitted_at: null, is_primary: true, is_archived: false,
    last_changed_at: "2026-08-01T00:00:00+00:00", total_count: 1,
  }]);
  assert.equal(parsed.items[0].applicationStatus, "additional_information_requested");
  assert.equal(parsed.items[0].isPrimary, true);
});

test("inconsistent window counts fail closed", () => {
  const base = {
    student_id: "11111111-1111-4111-8111-111111111111", full_name: null,
    college_email: "student@kct.ac.in", is_active: true,
    account_created_at: "2026-08-01T00:00:00+00:00", course: null,
    department: null, graduation_year: null, profile_state: "profile_not_started",
    progression_stage: null, progression_state: null, total_consultations: 0,
    open_consultations: 0, active_applications: 0, total_count: 2,
  };
  assert.throws(() => oversight.parseDirectorStudentOversight([base, { ...base, student_id: "44444444-4444-4444-8444-444444444444", total_count: 3 }]));
});

test("display labels and pagination counts remain deterministic", () => {
  assert.equal(oversight.formatOversightLabel("on_hold"), "On Hold");
  assert.equal(oversight.oversightTotalPages(0), 1);
  assert.equal(oversight.oversightTotalPages(26), 2);
});
