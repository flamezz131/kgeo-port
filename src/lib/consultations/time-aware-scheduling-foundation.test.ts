import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
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
    if (specifier === "@/lib/consultations/booking") {
      return {
        shortCircuit: true,
        url: new URL("./booking.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const booking = require("./booking.ts") as typeof import("./booking");
const lifecycle = require("./lifecycle.ts") as typeof import("./lifecycle");

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function sha256(path: string): string {
  return createHash("sha256").update(read(path)).digest("hex");
}

const migration = read(
  "../../../supabase/migrations/202608230002_time_aware_consultation_lifecycle.sql",
);
const cleanup = read(
  "../../../supabase/operations/202608230001_delete_confirmed_demo_consultations.sql",
);
const studentPage = read("../../app/student/dashboard/page.tsx");
const bookingPage = read("../../app/student/consultation/page.tsx");
const slotPicker = read("../../components/forms/consultation-slot-picker.tsx");
const counselorPage = read("../../app/counselor/schedule/page.tsx");
const counselorDashboard = read("../../app/counselor/dashboard/page.tsx");
const directorView = read(
  "../../components/director/director-operational-oversight.tsx",
);
const packageSource = read("../../../package.json");

test("cleanup is a separate operator artifact with an exact four-request allowlist", () => {
  assert.match(cleanup, /^begin;$/m);
  assert.match(cleanup, /^commit;$/m);
  assert.equal(
    (cleanup.match(/^\s*delete from public\.consultation_requests/gm) ?? []).length,
    1,
  );
  for (const requestNumber of [
    "KGEOC-2026-000003",
    "KGEOC-2026-000006",
    "KGEOC-2026-000007",
    "KGEOC-2026-000008",
  ]) {
    assert.match(cleanup, new RegExp(requestNumber));
  }
  assert.doesNotMatch(cleanup, /student_name\s*=/i);
  assert.doesNotMatch(
    cleanup,
    /delete from public\.consultation_requests[\s\S]*?status\s*=\s*'scheduled'[\s\S]*?current_date/i,
  );
});

test("cleanup locks and rechecks exact target state before deleting exactly four", () => {
  assert.match(cleanup, /for update of request/);
  assert.match(cleanup, /v_target_count <> 4/);
  assert.match(cleanup, /v_deleted_count <> 4/);
  assert.match(cleanup, /request\.status = 'scheduled'/);
  assert.match(cleanup, /request\.assigned_counselor_id is not null/);
  assert.match(cleanup, /request\.assigned_at is not null/);
  assert.match(cleanup, /request\.outcome_recorded_at is null/);
  assert.match(cleanup, /request\.outcome_recorded_by is null/);
  assert.match(cleanup, /at time zone 'Asia\/Kolkata'/);
});

test("cleanup preserves the protected future booking", () => {
  assert.match(
    cleanup,
    /request_number = 'KGEOC-2026-000005'[\s\S]*?date '2027-02-22'[\s\S]*?time '15:30'[\s\S]*?time '16:00'/,
  );
  assert.match(cleanup, /for key share/);
  assert.match(cleanup, /request\.request_number <> 'KGEOC-2026-000005'/);
});

test("cleanup fails closed on dependency drift and preserves private records", () => {
  assert.match(cleanup, /v_fk_count <> 2/);
  assert.match(cleanup, /confdeltype = 'n'/);
  assert.match(cleanup, /v_note_count <> 0/);
  assert.match(cleanup, /v_follow_up_count <> 2/);
  assert.match(cleanup, /'cancelled'::public\.counselor_follow_up_status/);
  assert.match(cleanup, /'completed'::public\.counselor_follow_up_status/);
  assert.match(cleanup, /protected_row jsonb/);
  assert.match(cleanup, /is distinct from snapshot\.protected_row/);
  assert.doesNotMatch(cleanup, /delete from public\.counselor_/i);
});

test("terminal follow-up link clearing is exact-trigger-bounded and transactional", () => {
  for (const trigger of [
    "counselor_follow_ups_10_prepare",
    "counselor_follow_ups_20_normalize",
    "enforce_primary_counselor_case_on_follow_ups",
  ]) {
    assert.match(cleanup, new RegExp(`disable trigger ${trigger}`));
    assert.match(cleanup, new RegExp(`enable trigger ${trigger}`));
    assert.match(cleanup, new RegExp(`tgname =\\s*'${trigger}'`));
  }
  assert.equal((cleanup.match(/disable trigger /g) ?? []).length, 3);
  assert.equal((cleanup.match(/enable trigger /g) ?? []).length, 3);
  assert.match(cleanup, /v_follow_up_trigger_count <> 3/);
  assert.match(
    cleanup,
    /'public\.prepare_counselor_private_record\(\)'::pg_catalog\.regprocedure/,
  );
  assert.match(
    cleanup,
    /'public\.normalize_counselor_follow_up\(\)'::pg_catalog\.regprocedure/,
  );
  assert.match(
    cleanup,
    /'public\.enforce_primary_counselor_student_case_row\(\)'::pg_catalog\.regprocedure/,
  );
  assert.equal(
    (cleanup.match(/trigger_record\.tgenabled = 'O'/g) ?? []).length,
    6,
  );
  assert.match(cleanup, /Follow-up triggers were not restored to the reviewed enabled state/);
  assert.match(
    cleanup,
    /update public\.counselor_follow_ups as follow_up[\s\S]*?set consultation_id = null[\s\S]*?where follow_up\.id = snapshot\.follow_up_id/,
  );
  const updatePosition = cleanup.indexOf(
    "update public.counselor_follow_ups as follow_up",
  );
  const deletePosition = cleanup.indexOf(
    "delete from public.consultation_requests as request",
  );
  for (const trigger of [
    "counselor_follow_ups_10_prepare",
    "counselor_follow_ups_20_normalize",
    "enforce_primary_counselor_case_on_follow_ups",
  ]) {
    assert.ok(cleanup.indexOf(`disable trigger ${trigger}`) < updatePosition);
    assert.ok(cleanup.indexOf(`enable trigger ${trigger}`) > updatePosition);
    assert.ok(cleanup.indexOf(`enable trigger ${trigger}`) < deletePosition);
  }
  assert.doesNotMatch(cleanup, /disable trigger all/i);
  assert.doesNotMatch(cleanup, /session_replication_role/i);
  assert.doesNotMatch(cleanup, /disable row level security|drop policy|alter policy/i);
  assert.doesNotMatch(cleanup, /\bgrant\b/i);
  assert.equal(
    sha256("../../../supabase/migrations/202608230002_time_aware_consultation_lifecycle.sql"),
    "61e989e2f678826a90aa4613126674203dc279429e73a68cf10734a333ca46b0",
  );
});

test("permanent migration is one forward transaction with no cleanup DML", () => {
  assert.match(migration, /^begin;$/m);
  assert.match(migration, /^commit;$/m);
  assert.doesNotMatch(migration, /pg_catalog\.extract\s*\(/i);
  assert.doesNotMatch(migration, /^delete from|^update public\.|^insert into/im);
  assert.doesNotMatch(
    migration,
    /KGEOC-2026-000003|KGEOC-2026-000005|2027-02-22/,
  );
});

test("canonical slot catalog is identity-free and contains exactly sixteen slots", () => {
  const catalog = migration.match(
    /create function public\.get_kgeo_consultation_slot_catalog\(\)[\s\S]*?\$function\$;/,
  )?.[0];
  assert.ok(catalog);
  assert.equal((catalog.match(/\(\d+::smallint,/g) ?? []).length, 16);
  assert.match(catalog, /time '09:00', time '09:30'/);
  assert.match(catalog, /time '16:30', time '17:00'/);
  assert.doesNotMatch(catalog, /student|counselor|booking|auth\.uid/i);
  assert.match(migration, /revoke all on function public\.get_kgeo_consultation_slot_catalog\(\)[\s\S]*?authenticated, service_role/);
});

test("schema slot constraint accepts only canonical half-hour starts", () => {
  const constraint = migration.match(
    /add constraint consultation_requests_slot_start_check[\s\S]*?comment on constraint/,
  )?.[0];
  assert.ok(constraint);
  assert.equal((constraint.match(/time '\d{2}:\d{2}'/g) ?? []).length, 16);
  assert.match(constraint, /time '09:00'/);
  assert.match(constraint, /time '16:30'/);
  assert.doesNotMatch(constraint, /time '08:30'|time '09:15'|time '17:00'/);
});

test("availability enforces the horizon but keeps the global six-slot subset", () => {
  const availability = migration.match(
    /create or replace function public\.get_consultation_slot_availability\([\s\S]*?\$function\$;/,
  )?.[0];
  assert.ok(availability);
  assert.match(availability, /p_date > business_today \+ 6/);
  assert.match(availability, /extract\(isodow from p_date\) not between 1 and 5/);
  assert.match(availability, /catalog\.slot_start <= business_time/);
  assert.match(availability, /from public\.get_kgeo_consultation_slot_catalog\(\) as catalog/);
  assert.match(availability, /where catalog\.slot_start >= time '14:00'/);
});

test("booking guard serializes same-Student attempts on the trusted profile", () => {
  const guard = migration.match(
    /create or replace function public\.prepare_consultation_request_insert\(\)[\s\S]*?\$function\$;/,
  )?.[0];
  assert.ok(guard);
  assert.match(guard, /requester_id := \(select auth\.uid\(\)\)/);
  assert.match(guard, /for update of profile/);
  assert.match(guard, /existing\.student_id = requester_id/);
});

test("booking guard rejects malformed nonterminal state without a broad booking blocker", () => {
  const guard = migration.match(
    /create or replace function public\.prepare_consultation_request_insert\(\)[\s\S]*?\$function\$;/,
  )?.[0] ?? "";
  for (const status of [
    "submitted",
    "waiting_for_assignment",
    "counselor_assigned",
    "scheduled",
  ]) {
    assert.match(guard, new RegExp(`'${status}'::public\\.consultation_status`));
  }
  assert.doesNotMatch(guard, /active or upcoming consultation/i);
  assert.doesNotMatch(guard, /existing\.consultation_date > business_today/);
});

test("malformed nonterminal history fails closed", () => {
  assert.match(
    migration,
    /existing\.status in \([\s\S]*?'submitted'[\s\S]*?'waiting_for_assignment'[\s\S]*?'counselor_assigned'[\s\S]*?'scheduled'[\s\S]*?existing\.consultation_date is null[\s\S]*?existing\.slot_start is null[\s\S]*?existing\.slot_end is null[\s\S]*?existing\.slot_end <= existing\.slot_start/,
  );
  assert.match(
    migration,
    /extract\(isodow from existing\.consultation_date\)[\s\S]*?not between 1 and 5/,
  );
  assert.match(
    migration,
    /not exists \([\s\S]*?get_kgeo_consultation_slot_catalog\(\)[\s\S]*?catalog\.slot_start = existing\.slot_start[\s\S]*?catalog\.slot_end = existing\.slot_end/,
  );
  assert.match(migration, /requires operational resolution/);
});

test("trusted mutation independently enforces horizon weekday slot and same-day expiry", () => {
  const guard = migration.match(
    /create or replace function public\.prepare_consultation_request_insert\(\)[\s\S]*?\$function\$;/,
  )?.[0] ?? "";
  assert.match(guard, /new\.consultation_date > business_today \+ 6/);
  assert.match(guard, /extract\(isodow from new\.consultation_date\)[\s\S]*?not between 1 and 5/);
  assert.match(guard, /new\.slot_start <= business_time/);
  assert.match(guard, /public\.get_kgeo_consultation_slot_catalog\(\)/);
  assert.match(guard, /new\.slot_end := \(new\.slot_start \+ interval '30 minutes'\)::time/);
});

test("trusted booking boundary rejects dark morning slots and keeps the six-slot cutover", () => {
  const guard = migration.match(
    /create or replace function public\.prepare_consultation_request_insert\(\)[\s\S]*?\$function\$;/,
  )?.[0] ?? "";
  const cutover = guard.match(
    /if new\.slot_start not in \([\s\S]*?not currently available for booking\.';[\s\S]*?end if;/,
  )?.[0] ?? "";

  assert.ok(cutover);
  assert.deepEqual(cutover.match(/time '\d{2}:\d{2}'/g), [
    "time '14:00'",
    "time '14:30'",
    "time '15:00'",
    "time '15:30'",
    "time '16:00'",
    "time '16:30'",
  ]);
  for (const rejectedStart of ["09:00", "09:30", "13:30"]) {
    assert.doesNotMatch(cutover, new RegExp(`time '${rejectedStart}'`));
  }
  assert.match(
    cutover,
    /message = 'The selected consultation slot is not currently available for booking\.'/,
  );
  assert.match(guard, /from public\.get_kgeo_consultation_slot_catalog\(\) as catalog/);
});

test("Claim Next uses the canonical non-elapsed contract in selection and update", () => {
  const claim = migration.match(
    /create or replace function public\.claim_next_consultation\(\)[\s\S]*?\$function\$;/,
  )?.[0] ?? "";
  const temporalPredicate =
    /request\.consultation_date > v_business_today[\s\S]*?request\.consultation_date = v_business_today[\s\S]*?request\.slot_end > v_business_time/g;

  assert.match(claim, /statement_timestamp\(\)/);
  assert.match(claim, /at time zone 'Asia\/Kolkata'/);
  assert.equal((claim.match(temporalPredicate) ?? []).length, 2);
  assert.equal(
    (claim.match(/extract\(isodow from request\.consultation_date\)[\s\S]*?between 1 and 5/g) ?? [])
      .length,
    2,
  );
  assert.equal(
    (claim.match(/get_kgeo_consultation_slot_catalog\(\) as catalog/g) ?? []).length,
    2,
  );
  assert.equal(
    (claim.match(/catalog\.slot_start = request\.slot_start/g) ?? []).length,
    2,
  );
  assert.equal(
    (claim.match(/catalog\.slot_end = request\.slot_end/g) ?? []).length,
    2,
  );
  for (const field of ["consultation_date", "slot_start", "slot_end"]) {
    assert.equal(
      (claim.match(new RegExp(`request\\.${field} is not null`, "g")) ?? []).length,
      2,
    );
  }
});

test("Claim Next preserves FCFS locking authorization and first Primary assignment", () => {
  const claim = migration.match(
    /create or replace function public\.claim_next_consultation\(\)[\s\S]*?\$function\$;/,
  )?.[0] ?? "";

  assert.match(claim, /order by request\.submitted_at asc, request\.id asc/);
  assert.match(claim, /limit 1\s+for update/);
  assert.match(claim, /v_caller_id := \(select auth\.uid\(\)\)/);
  assert.match(claim, /counselor_profile\.role = 'counselor'::public\.user_role/);
  assert.match(claim, /counselor_profile\.is_active is true/);
  assert.match(claim, /counselor_auth\.email_confirmed_at is not null/);
  assert.match(claim, /student_profile\.role = 'student'::public\.user_role/);
  assert.match(claim, /insert into public\.student_counselor_assignments/);
  assert.match(claim, /on conflict \(student_id\) where ended_at is null\s+do nothing/);
  assert.doesNotMatch(claim, /update public\.student_counselor_assignments/);
  assert.match(
    migration,
    /revoke all on function public\.claim_next_consultation\(\)[\s\S]*?from public, anon, authenticated;[\s\S]*?grant execute on function public\.claim_next_consultation\(\)[\s\S]*?to authenticated;/,
  );
});

test("legacy waiting states remain classifiable while Claim Next UI is retired", () => {
  assert.doesNotMatch(counselorDashboard, /assignmentQueue|Claim next|FCFS queue/i);
  assert.match(counselorDashboard, /list_my_assigned_consultations/);

  const currentWaiting = {
    status: "waiting_for_assignment" as const,
    consultationDate: "2026-07-22",
    slotStart: "14:00",
    slotEnd: "14:30",
  };
  assert.equal(
    lifecycle.getConsultationLifecycleState(
      currentWaiting,
      new Date("2026-07-22T08:59:00Z"),
    ),
    "assignment_pending",
  );
  assert.equal(
    lifecycle.getConsultationLifecycleState(
      currentWaiting,
      new Date("2026-07-22T09:00:00Z"),
    ),
    "expired_request",
  );
  assert.equal(
    lifecycle.getConsultationLifecycleState(
      { ...currentWaiting, consultationDate: "2026-07-23" },
      new Date("2026-07-22T09:00:00Z"),
    ),
    "assignment_pending",
  );
  assert.equal(
    lifecycle.getConsultationLifecycleState(
      { ...currentWaiting, consultationDate: "2026-07-21" },
      new Date("2026-07-22T08:00:00Z"),
    ),
    "expired_request",
  );
  for (const malformed of [
    { ...currentWaiting, consultationDate: null },
    { ...currentWaiting, slotStart: null },
    { ...currentWaiting, slotEnd: null },
    { ...currentWaiting, slotStart: "09:15", slotEnd: "09:45" },
    { ...currentWaiting, consultationDate: "2026-07-25" },
  ]) {
    assert.equal(
      lifecycle.getConsultationLifecycleState(
        malformed,
        new Date("2026-07-22T08:00:00Z"),
      ),
      "pending",
    );
  }
});

test("runtime seven-day rules use calendar dates and do not extend weekends", () => {
  const today = "2026-07-22";
  assert.equal(booking.getBookingDateIssue(today, today), null);
  assert.equal(booking.getBookingDateIssue("2026-07-28", today), null);
  assert.equal(
    booking.getBookingDateIssue("2026-07-29", today),
    "outside_horizon",
  );
  assert.equal(booking.getBookingDateIssue("2026-07-25", today), "weekend");
  assert.equal(booking.getBookingDateIssue("2026-07-26", today), "weekend");
});

test("runtime temporal classification uses appointment end as the history boundary", () => {
  const row = {
    status: "scheduled" as const,
    consultationDate: "2026-07-22",
    slotStart: "14:00",
    slotEnd: "14:30",
  };
  const inProgress = lifecycle.getConsultationLifecycleState(
    row,
    new Date("2026-07-22T08:45:00Z"),
  );
  const elapsed = lifecycle.getConsultationLifecycleState(
    row,
    new Date("2026-07-22T09:00:00Z"),
  );
  assert.equal(inProgress, "in_progress");
  assert.equal(lifecycle.getConsultationPresentationGroup(inProgress), "upcoming");
  assert.equal(elapsed, "outcome_required");
  assert.equal(lifecycle.getConsultationPresentationGroup(elapsed), "history");
  assert.equal(lifecycle.getStudentConsultationLifecycleLabel(elapsed), "Outcome Pending");
});

test("elapsed complete waiting and submitted requests are expired history", () => {
  for (const status of ["submitted", "waiting_for_assignment"] as const) {
    const row = {
      status,
      consultationDate: "2026-07-22",
      slotStart: "14:00",
      slotEnd: "14:30",
    };
    const future = lifecycle.getConsultationLifecycleState(
      row,
      new Date("2026-07-22T08:59:00Z"),
    );
    const elapsed = lifecycle.getConsultationLifecycleState(
      row,
      new Date("2026-07-22T09:00:00Z"),
    );
    assert.equal(future, "assignment_pending");
    assert.equal(lifecycle.getConsultationPresentationGroup(future), "upcoming");
    assert.equal(elapsed, "expired_request");
    assert.equal(lifecycle.getConsultationPresentationGroup(elapsed), "history");
    assert.equal(
      lifecycle.getStudentConsultationLifecycleLabel(elapsed),
      "Expired Request",
    );
  }
});

test("elapsed counselor-assigned requests are outcome-pending history", () => {
  const row = {
    status: "counselor_assigned" as const,
    consultationDate: "2026-07-22",
    slotStart: "14:00",
    slotEnd: "14:30",
  };
  assert.equal(
    lifecycle.getConsultationLifecycleState(
      row,
      new Date("2026-07-22T08:59:00Z"),
    ),
    "counselor_assigned",
  );
  const elapsed = lifecycle.getConsultationLifecycleState(
    row,
    new Date("2026-07-22T09:00:00Z"),
  );
  assert.equal(elapsed, "outcome_required");
  assert.equal(lifecycle.getConsultationPresentationGroup(elapsed), "history");
  assert.equal(
    lifecycle.getStudentConsultationLifecycleLabel(elapsed),
    "Outcome Pending",
  );
});

test("Student date picker and server validation share the exact horizon", () => {
  assert.match(bookingPage, /CONSULTATION_BOOKING_HORIZON_DAYS - 1/);
  assert.match(bookingPage, /maximumConsultationDate=/);
  assert.match(slotPicker, /max=\{maximumDate\}/);
  assert.match(slotPicker, /today through the next six[\s\S]*?calendar days/);
});

test("Student presentation separates upcoming from retained history", () => {
  assert.match(studentPage, /getConsultationPresentationGroup/);
  assert.match(studentPage, />\s*Upcoming Consultations\s*</);
  assert.match(studentPage, />\s*Consultation History\s*</);
  assert.match(studentPage, /Outcome Pending|StudentConsultationLifecycleLabel/);
  assert.match(
    studentPage,
    /upcomingConsultations[\s\S]*?\.sort\([\s\S]*?consultation_date[\s\S]*?slot_start/,
  );
});

test("Counselor presentation identifies past outcome-required dates", () => {
  assert.match(counselorPage, /selectedDate < businessToday/);
  assert.match(counselorPage, /Past \/ Outcome Required/);
  assert.match(
    counselorPage,
    /slot\.state === "outcome_required"[\s\S]*?slot\.booking\.status === "scheduled"[\s\S]*?ConsultationOutcomeControls/,
  );
  assert.match(counselorDashboard, /list_my_assigned_consultations/);
  assert.doesNotMatch(counselorDashboard, /assignmentQueue|Claim next/i);
  assert.match(counselorDashboard, /My current\/upcoming consultations/);
});

test("Director presentation derives temporal state without changing stored status", () => {
  assert.match(directorView, /getConsultationLifecycleState/);
  assert.match(directorView, /getConsultationPresentationGroup/);
  assert.match(directorView, /Outcome Pending/);
  assert.match(directorView, /Temporal state/);
  assert.doesNotMatch(directorView, /update\(|\.update\(/);
});

test("global slot uniqueness and capacity boundaries remain unchanged", () => {
  assert.doesNotMatch(
    migration,
    /drop\s+(?:index|constraint)[\s\S]*?consultation_requests_active_slot_key/i,
  );
  assert.doesNotMatch(
    migration,
    /counselor_slot_block|automatic.*counselor|per_counselor_capacity/i,
  );
  assert.doesNotMatch(migration, /assigned_counselor_id\s*=\s*primary/i);
  assert.doesNotMatch(
    migration,
    /grant\s+(?:select|insert|update|delete)\s+on\s+(?:table\s+)?public\.consultation_requests/i,
  );
});

test("historical Claim Next outcome reassignment and transition migrations remain byte-identical", () => {
  assert.equal(
    sha256("../../../supabase/migrations/202608110001_consultation_ownership_fcfs_assignment.sql"),
    "9f0e2d2250168cb6d84ce570a73a16014fc2f92cff2666868b43c5691356f1cc",
  );
  assert.equal(
    sha256("../../../supabase/migrations/202608180001_record_consultation_outcome_acl_alignment.sql"),
    "1245ba55bf5cf3357f355e1bf997b12dfa86a1ac86f4469be0760e558f12e5fb",
  );
  assert.equal(
    sha256("../../../supabase/migrations/202608210003_director_primary_counselor_assignment.sql"),
    "5d8a80ba10857214daf1e6bce36eb77b99c4dbb06d7f205857593261285614f4",
  );
  assert.equal(
    sha256("../../../supabase/migrations/202608220002_controlled_legacy_consultation_closure.sql"),
    "19e1a56fc8df6c4de899cc80ea76233f7eb53ee71af38ad38603ee4674679dd3",
  );
  assert.equal(
    sha256("../../../supabase/migrations/202608230001_duplicate_future_waiting_consultation_closure.sql"),
    "f3041686ace391deea0f7bba005df93972995b7d54beaffab58f1eed39c1fc7c",
  );
  assert.match(
    migration,
    /create or replace function public\.claim_next_consultation\(\)/,
  );
  assert.doesNotMatch(
    migration,
    /create or replace function public\.(?:record_consultation_outcome|reassign_primary_counselor|close_legacy_waiting_consultation|close_duplicate_future_waiting_consultation)/,
  );
});

test("no general consultation delete surface is introduced", () => {
  assert.doesNotMatch(migration, /delete from|grant delete|delete_consultation/i);
  assert.doesNotMatch(
    `${studentPage}\n${counselorPage}\n${counselorDashboard}\n${directorView}`,
    /Delete Consultation|deleteConsultation|general cancellation/i,
  );
});

test("focused revised Step 4.5D test is registered in the standard suite", () => {
  assert.match(
    packageSource,
    /src\/lib\/consultations\/time-aware-scheduling-foundation\.test\.ts/,
  );
});
