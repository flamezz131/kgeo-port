import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function sha256(relativePath: string): string {
  return createHash("sha256").update(read(relativePath)).digest("hex");
}

function functionBody(source: string, name: string): string {
  const match = source.match(
    new RegExp(
      `create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\$function\\$;`,
    ),
  );
  assert.ok(match, `missing function ${name}`);
  return match[0];
}

const migrationPath =
  "../../../supabase/migrations/202608240001_automatic_consultation_allocation.sql";
const inventoryPath =
  "../../../supabase/operations/202608240000_inventory_legacy_pending_consultations.sql";
const cleanupPath =
  "../../../supabase/operations/202608240001_delete_legacy_pending_consultations.sql";
const readinessPath =
  "../../../supabase/verification/automatic_consultation_allocation_readiness.sql";
const prerequisiteRepairPath =
  "../../../supabase/migrations/202608230003_complete_time_aware_consultation_prerequisites.sql";
const prerequisiteRepairVerificationPath =
  "../../../supabase/verification/202608230003_complete_time_aware_consultation_prerequisites.sql";
const step45dPath =
  "../../../supabase/migrations/202608230002_time_aware_consultation_lifecycle.sql";
const historicalSlotIndexPath =
  "../../../supabase/migrations/202607190001_single_counselor_slot_booking.sql";
const historicalTriggerPath =
  "../../../supabase/migrations/202607180001_consultation_requests_v1.sql";

const migration = read(migrationPath);
const inventory = read(inventoryPath);
const cleanup = read(cleanupPath);
const readiness = read(readinessPath);
const prerequisiteRepair = read(prerequisiteRepairPath);
const prerequisiteRepairVerification = read(
  prerequisiteRepairVerificationPath,
);
const step45d = read(step45dPath);
const historicalSlotIndex = read(historicalSlotIndexPath);
const historicalTrigger = read(historicalTriggerPath);
const booking = functionBody(migration, "book_student_consultation");
const continuation = functionBody(migration, "continue_with_kgeo");
const availability = functionBody(
  migration,
  "get_consultation_slot_availability",
);
const assignedProjection = functionBody(
  migration,
  "list_my_assigned_consultations",
);
const block = functionBody(migration, "block_my_consultation_slot");
const release = functionBody(migration, "release_my_consultation_slot_block");

test("partial Step 4.5D repair restores only the exact prerequisite contracts", () => {
  assert.match(prerequisiteRepair, /^begin;$/m);
  assert.match(prerequisiteRepair, /^commit;$/m);
  assert.equal(
    functionBody(prerequisiteRepair, "prepare_consultation_request_insert"),
    functionBody(step45d, "prepare_consultation_request_insert"),
  );

  const repairIndex = prerequisiteRepair.match(
    /create unique index consultation_requests_active_slot_key[\s\S]*?public\.consultation_status;/,
  );
  const historicalIndex = historicalSlotIndex.match(
    /create unique index consultation_requests_active_slot_key[\s\S]*?public\.consultation_status;/,
  );
  assert.ok(repairIndex);
  assert.ok(historicalIndex);
  assert.equal(
    repairIndex[0].replace(/\r\n/g, "\n"),
    historicalIndex[0].replace(/\r\n/g, "\n"),
  );

  const repairTrigger = prerequisiteRepair.match(
    /create trigger consultation_requests_prepare_insert[\s\S]*?prepare_consultation_request_insert\(\);/,
  );
  const originalTrigger = historicalTrigger.match(
    /create trigger consultation_requests_prepare_insert[\s\S]*?prepare_consultation_request_insert\(\);/,
  );
  assert.ok(repairTrigger);
  assert.ok(originalTrigger);
  assert.equal(
    repairTrigger[0].replace(/\r\n/g, "\n"),
    originalTrigger[0].replace(/\r\n/g, "\n"),
  );
  assert.match(
    prerequisiteRepair,
    /enable trigger consultation_requests_prepare_insert/,
  );
  assert.match(
    prerequisiteRepair,
    /group by request\.consultation_date, request\.slot_start[\s\S]*?having pg_catalog\.count\(\*\) > 1/,
  );
  assert.doesNotMatch(
    prerequisiteRepair,
    /delete from|update public\.consultation_requests|insert into public\.consultation_requests/i,
  );
});

test("partial Step 4.5D repair verifier evaluates the complete automatic prerequisite", () => {
  assert.match(prerequisiteRepairVerification, /^begin transaction read only;$/m);
  assert.match(prerequisiteRepairVerification, /^rollback;$/m);
  for (const contract of [
    "slot_count",
    "active_slot_index_exists",
    "prepare_trigger_exists",
    "prepare_trigger_state",
    "prepare_trigger_normally_enabled",
    "assigned_by_exists",
    "assigned_by_null_row_exists",
    "automatic_allocation_prerequisite_would_reject",
  ]) {
    assert.match(prerequisiteRepairVerification, new RegExp(contract));
  }
  assert.match(
    prerequisiteRepairVerification,
    /trigger_record\.tgenabled = 'O'/,
  );
  assert.match(
    prerequisiteRepairVerification,
    /prerequisite_state\.slot_count <> 16[\s\S]*?or not prerequisite_state\.active_slot_index_exists[\s\S]*?or not prerequisite_state\.prepare_trigger_normally_enabled[\s\S]*?or not prerequisite_state\.assigned_by_exists[\s\S]*?or prerequisite_state\.assigned_by_null_row_exists/,
  );
});

test("automatic cutover converges fresh and exact partial block-table states", () => {
  const expectedTable = migration.match(
    /create temporary table expected_counselor_consultation_slot_blocks[\s\S]*?on commit drop;/,
  )?.[0];

  assert.ok(expectedTable);
  assert.doesNotMatch(expectedTable, /references\s+public\./i);
  assert.match(
    migration,
    /if pg_catalog\.to_regclass\(\s*'public\.counselor_consultation_slot_blocks'[\s\S]*?constraint_record\.contype in \('p', 'c'\)[\s\S]*?with expected_foreign_key[\s\S]*?v_actual_columns is distinct from v_expected_columns[\s\S]*?v_actual_constraints is distinct from v_expected_constraints[\s\S]*?v_actual_foreign_keys is distinct from v_expected_foreign_keys[\s\S]*?Existing Counselor slot block table does not match the reviewed contract/,
  );
  for (const [constraintName, sourceColumn] of [
    [
      "counselor_consultation_slot_blocks_counselor_id_fkey",
      "counselor_id",
    ],
    [
      "counselor_consultation_slot_blocks_released_by_fkey",
      "released_by",
    ],
  ] as const) {
    assert.match(
      migration,
      new RegExp(
        `'${constraintName}'[\\s\\S]*?'${sourceColumn}'[\\s\\S]*?'public'[\\s\\S]*?'profiles'[\\s\\S]*?'id'[\\s\\S]*?'s'[\\s\\S]*?'a'[\\s\\S]*?'r'`,
      ),
    );
  }
  for (const catalogField of [
    "conkey",
    "confkey",
    "confrelid",
    "confmatchtype",
    "confupdtype",
    "confdeltype",
    "condeferrable",
    "condeferred",
    "convalidated",
  ]) {
    assert.match(migration, new RegExp(`constraint_record\\.${catalogField}`));
  }
  assert.match(
    migration,
    /create table if not exists public\.counselor_consultation_slot_blocks/,
  );
  assert.doesNotMatch(
    migration,
    /drop table|truncate(?: table)? public\.counselor_consultation_slot_blocks|delete from public\.counselor_consultation_slot_blocks/i,
  );
});

test("automatic cutover validates or safely replaces every duplicate-prone object", () => {
  for (const indexName of [
    "counselor_consultation_slot_blocks_one_active_key",
    "counselor_consultation_slot_blocks_active_schedule_idx",
    "consultation_requests_active_student_slot_key",
    "consultation_requests_active_counselor_slot_key",
  ]) {
    assert.match(migration, new RegExp(`to_regclass\\([\\s\\S]*?${indexName}`));
    assert.match(migration, new RegExp(`index if not exists[\\s\\S]*?${indexName}`));
  }

  for (const functionName of [
    "protect_counselor_consultation_slot_block_history",
    "kgeo_consultation_slot_lock_key",
    "block_my_consultation_slot",
    "release_my_consultation_slot_block",
    "list_my_active_consultation_slot_blocks",
    "book_student_consultation",
    "continue_with_kgeo",
    "list_my_assigned_consultations",
    "get_my_consultation_dashboard_metrics",
  ]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${functionName}\\(`),
    );
  }

  assert.match(
    migration,
    /create or replace trigger protect_counselor_consultation_slot_block_history/,
  );
  assert.match(
    migration,
    /drop policy if exists consultation_requests_select_primary_counselor[\s\S]*?create policy consultation_requests_select_primary_counselor/,
  );
  assert.match(migration, /drop trigger if exists consultation_requests_prepare_insert/);
  assert.match(migration, /drop index if exists public\.consultation_requests_active_slot_key/);
});

test("optional index validators resolve safe OIDs before exact catalog checks", () => {
  for (const [indexName, variableName, mismatchMessage] of [
    [
      "counselor_consultation_slot_blocks_one_active_key",
      "v_one_active_index_oid",
      "Existing active Counselor block index does not match the reviewed contract",
    ],
    [
      "counselor_consultation_slot_blocks_active_schedule_idx",
      "v_active_schedule_index_oid",
      "Existing Counselor block schedule index does not match the reviewed contract",
    ],
    [
      "consultation_requests_active_student_slot_key",
      "v_student_slot_index_oid",
      "Existing Student consultation slot index does not match the reviewed contract",
    ],
    [
      "consultation_requests_active_counselor_slot_key",
      "v_counselor_slot_index_oid",
      "Existing Counselor consultation slot index does not match the reviewed contract",
    ],
  ] as const) {
    assert.doesNotMatch(
      migration,
      new RegExp(`'public\\.${indexName}'::(?:pg_catalog\\.)?regclass`),
    );
    assert.match(
      migration,
      new RegExp(
        `${variableName} := pg_catalog\\.to_regclass\\(\\s*'public\\.${indexName}'\\s*\\);[\\s\\S]*?if ${variableName} is not null then[\\s\\S]*?index_record\\.indexrelid = ${variableName}[\\s\\S]*?${mismatchMessage}`,
      ),
    );
  }
});

test("cutover is one forward transaction and contains no legacy cleanup DML", () => {
  assert.match(migration, /^begin;$/m);
  assert.match(migration, /^commit;$/m);
  assert.doesNotMatch(migration, /delete from public\.consultation_requests/i);
  assert.doesNotMatch(migration, /set role|alter .* owner to supabase/i);
  assert.doesNotMatch(migration, /pg_catalog\.extract\s*\(/i);
  assert.match(
    migration,
    /Retired pending consultations must be resolved before automatic allocation/,
  );
});

test("cutover prerequisite accepts nullable assigned_by only with complete pre-cutover history", () => {
  const prerequisite = migration.match(
    /do \$prerequisite\$[\s\S]*?\$prerequisite\$;/,
  )?.[0];

  assert.ok(prerequisite);
  assert.match(
    prerequisite,
    /or not exists \([\s\S]*?attribute_record\.attname = 'assigned_by'[\s\S]*?attribute_record\.attisdropped is false[\s\S]*?\)\s+or exists \(/,
  );
  assert.doesNotMatch(prerequisite, /attribute_record\.attnotnull is true/);
  assert.match(
    prerequisite,
    /from public\.student_counselor_assignments as existing_assignment[\s\S]*?existing_assignment\.assigned_by is null/,
  );

  const prerequisiteWouldRaise = ({
    slotCount = 16,
    activeSlotIndexExists = true,
    prepareTriggerEnabledNormally = true,
    assignedByColumnExists = true,
    preCutoverNullAssignedByRows = 0,
  }: {
    slotCount?: number;
    activeSlotIndexExists?: boolean;
    prepareTriggerEnabledNormally?: boolean;
    assignedByColumnExists?: boolean;
    preCutoverNullAssignedByRows?: number;
  }): boolean =>
    slotCount !== 16 ||
    !activeSlotIndexExists ||
    !prepareTriggerEnabledNormally ||
    !assignedByColumnExists ||
    preCutoverNullAssignedByRows > 0;

  assert.equal(prerequisiteWouldRaise({}), false);
  assert.equal(
    prerequisiteWouldRaise({ assignedByColumnExists: false }),
    true,
  );
  assert.equal(
    prerequisiteWouldRaise({ preCutoverNullAssignedByRows: 1 }),
    true,
  );
});

test("automatic booking is Student-derived and validates the complete payload", () => {
  assert.match(booking, /v_student_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(booking, /student_profile\.role = 'student'/);
  assert.match(booking, /student_profile\.is_active is true/);
  assert.match(booking, /student_auth\.email_confirmed_at is not null/);
  for (const validation of [
    /p_college_end_year is null/,
    /v_mobile_number is null/,
    /p_higher_studies_interest is null/,
    /v_personal_email !~/,
  ]) {
    assert.match(booking, validation);
  }
  assert.doesNotMatch(
    booking,
    /student_profile_completion|from public\.student_profiles/,
  );
});

test("booking enforces Asia/Kolkata, seven calendar dates, weekdays, and all canonical slots", () => {
  assert.match(booking, /at time zone 'Asia\/Kolkata'/);
  assert.match(booking, /p_consultation_date > v_business_today \+ 6/);
  assert.match(booking, /extract\(isodow from p_consultation_date\) not between 1 and 5/);
  assert.match(booking, /p_slot_start <= v_business_now::time/);
  assert.match(booking, /get_kgeo_consultation_slot_catalog/);
});

test("same-Student bookings serialize while malformed nonterminal history fails closed", () => {
  assert.match(booking, /for update of student_profile, student_auth/);
  assert.match(
    booking,
    /from public\.consultation_requests as existing[\s\S]*?order by existing\.id[\s\S]*?for update/,
  );
  assert.match(booking, /An existing consultation requires operational resolution/);
  assert.doesNotMatch(booking, /active or upcoming consultation/i);
  assert.doesNotMatch(
    booking,
    /existing\.consultation_date > v_business_today/,
  );
});

test("multiple consultations are allowed with exact Student-slot uniqueness", () => {
  assert.match(
    migration,
    /create unique index if not exists\s+consultation_requests_active_student_slot_key[\s\S]*?student_id,\s+consultation_date,\s+slot_start[\s\S]*?where status <> 'cancelled'/,
  );
  assert.doesNotMatch(migration, /one active consultation per Student/i);
  assert.doesNotMatch(migration, /You already have an active or upcoming consultation/);
});

test("the protected 2027 booking cannot broadly block another valid booking", () => {
  assert.doesNotMatch(booking, /existing\.consultation_date > v_business_today/);
  assert.doesNotMatch(booking, /active or upcoming consultation/i);
  assert.match(cleanup, /KGEOC-2026-000005/);
  assert.doesNotMatch(migration, /KGEOC-2026-000005|2027-02-22/);
});

test("Primary Counselor is locked and receives strict first preference", () => {
  assert.match(
    booking,
    /from public\.student_counselor_assignments as assignment[\s\S]*?assignment\.ended_at is null[\s\S]*?for update/,
  );
  assert.match(
    booking,
    /when counselor_profile\.id = v_primary_counselor_id then 0[\s\S]*?order by\s+primary_priority,\s+daily_workload,\s+counselor_profile\.id/,
  );
});

test("fallback fairness counts selected-date factual non-cancelled capacity deterministically", () => {
  assert.match(booking, /workload\.consultation_date = p_consultation_date/);
  for (const status of ["counselor_assigned", "scheduled", "completed", "no_show"]) {
    assert.match(booking, new RegExp(`'${status}'::public\\.consultation_status`));
  }
  assert.doesNotMatch(
    booking.match(/\) as daily_workload[\s\S]*?from public\.profiles/)?.[0] ?? "",
    /cancelled/,
  );
  assert.match(booking, /daily_workload,\s+counselor_profile\.id/);
});

test("candidate eligibility uses approved active verified Counselor contracts", () => {
  assert.match(booking, /counselor_profile\.role = 'counselor'/);
  assert.match(booking, /counselor_profile\.is_active is true/);
  assert.match(booking, /account\.approval_status =\s+'approved'/);
  assert.match(booking, /counselor_auth\.email_confirmed_at is not null/);
  assert.ok((booking.match(/for update of counselor_profile, account, counselor_auth/g) ?? []).length >= 1);
});

test("booking, blocking, and releasing share one advisory-lock convention", () => {
  assert.match(booking, /pg_try_advisory_xact_lock/);
  for (const source of [block, release]) {
    assert.match(source, /pg_advisory_xact_lock/);
    assert.match(source, /kgeo_consultation_slot_lock_key/);
  }
  assert.match(booking, /kgeo_consultation_slot_lock_key/);
  assert.match(
    migration,
    /hashtextextended\([\s\S]*?p_counselor_id::text[\s\S]*?p_consultation_date::text[\s\S]*?p_slot_start::text/,
  );
});

test("candidate availability is rechecked under lock and safely advances", () => {
  assert.match(booking, /block\.released_at is null/);
  assert.match(booking, /occupied\.status <> 'cancelled'/);
  assert.match(booking, /then\s+continue;[\s\S]*?v_selected_counselor_id/);
  assert.match(booking, /No Counselor is available for the selected consultation slot/);
});

test("successful booking is directly scheduled and fully assigned", () => {
  assert.match(booking, /insert into public\.consultation_requests/);
  assert.match(booking, /'scheduled'::public\.consultation_status/);
  assert.match(booking, /v_selected_counselor_id/);
  assert.match(booking, /v_request_time,[\s\S]*?v_request_time/);
  assert.doesNotMatch(
    booking.match(/insert into public\.consultation_requests[\s\S]*?\);/)?.[0] ?? "",
    /'waiting_for_assignment'|'submitted'|'counselor_assigned'/,
  );
});

test("new-Student booking schedules a Counselor but never activates a Primary case", () => {
  assert.match(booking, /insert into public\.consultation_requests/);
  assert.doesNotMatch(booking, /insert into public\.student_counselor_assignments/);
  assert.doesNotMatch(booking, /update public\.student_counselor_assignments/);
});

test("Continue with K-GEO is Student-derived from an own completed consultation", () => {
  assert.match(continuation, /v_student_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(continuation, /public\.continue_with_kgeo\(\)/);
  assert.doesNotMatch(
    continuation,
    /p_consultation_id|p_student_id|p_counselor_id/,
  );
  assert.match(continuation, /request\.student_id = v_student_id/);
  assert.match(continuation, /request\.status = 'completed'/);
  assert.match(continuation, /request\.assigned_counselor_id is not null/);
  assert.match(continuation, /request\.consultation_date is not null/);
  assert.match(continuation, /request\.slot_start is not null/);
  assert.match(continuation, /request\.slot_end is not null/);
  assert.match(
    continuation,
    /order by\s+request\.consultation_date desc,\s+request\.slot_end desc,\s+request\.id desc\s+limit 1/,
  );
  assert.match(continuation, /for update/);
});

test("Continue with K-GEO is idempotent and creates one truthful active Primary", () => {
  assert.match(
    continuation,
    /from public\.student_counselor_assignments as assignment[\s\S]*?assignment\.student_id = v_student_id[\s\S]*?assignment\.ended_at is null[\s\S]*?for update/,
  );
  assert.match(continuation, /if found then\s+return false/);
  assert.match(continuation, /insert into public\.student_counselor_assignments/);
  assert.match(
    continuation,
    /v_student_id,\s+v_consultation_counselor_id,\s+v_assignment_time,\s+null,\s+null/,
  );
  assert.match(migration, /alter column assigned_by drop not null/);
});

test("My Students excludes consultation-only Students and includes active continued cases", () => {
  const assignmentFoundation = read(
    "../../../supabase/migrations/202608120001_primary_counselor_assignment_foundation.sql",
  );
  const myStudents = functionBody(
    assignmentFoundation,
    "list_my_primary_students",
  );
  assert.match(myStudents, /assignment\.counselor_id = v_caller_id/);
  assert.match(myStudents, /assignment\.ended_at is null/);
  assert.doesNotMatch(myStudents, /consultation_requests|assigned_counselor_id/);
  assert.doesNotMatch(booking, /insert into public\.student_counselor_assignments/);
  assert.match(continuation, /insert into public\.student_counselor_assignments/);
});

test("Continue revalidates the consultation Counselor and fails closed", () => {
  assert.match(continuation, /counselor_profile\.role = 'counselor'/);
  assert.match(continuation, /counselor_profile\.is_active is true/);
  assert.match(continuation, /account\.approval_status =\s+'approved'/);
  assert.match(continuation, /counselor_auth\.email_confirmed_at is not null/);
  assert.match(continuation, /for update of counselor_profile, account, counselor_auth/);
  assert.match(continuation, /K-GEO staff review is required/);
});

test("covering assignment never rewrites the active Primary assignment", () => {
  assert.doesNotMatch(booking, /update public\.student_counselor_assignments/);
  assert.doesNotMatch(booking, /delete from public\.student_counselor_assignments/);
  assert.doesNotMatch(booking, /insert into public\.student_counselor_assignments/);
});

test("block history is sealed, canonical, self-owned, and append-oriented", () => {
  assert.match(
    migration,
    /create table if not exists public\.counselor_consultation_slot_blocks/,
  );
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.counselor_consultation_slot_blocks/);
  assert.match(migration, /where released_at is null/);
  assert.match(block, /v_caller_id uuid := \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(block, /p_counselor_id/);
  assert.match(release, /released_by = v_caller_id/);
  assert.doesNotMatch(release, /delete from/);
});

test("Student and per-Counselor capacity precede removal of global capacity", () => {
  const perStudent = migration.search(
    /create unique index if not exists\s+consultation_requests_active_student_slot_key/,
  );
  const perCounselor = migration.search(
    /create unique index if not exists\s+consultation_requests_active_counselor_slot_key/,
  );
  const globalDrop = migration.indexOf(
    "drop index if exists public.consultation_requests_active_slot_key",
  );
  assert.ok(
    perStudent > 0 &&
      perCounselor > perStudent &&
      globalDrop > perCounselor,
  );
  assert.match(
    migration,
    /assigned_counselor_id is not null\s+and status <> 'cancelled'/,
  );
});

test("availability exposes sixteen minimal statuses with no Counselor details", () => {
  assert.match(availability, /get_kgeo_consultation_slot_catalog/);
  assert.match(availability, /then 'available'/);
  assert.match(availability, /else 'unavailable'/);
  assert.match(availability, /then 'expired'/);
  assert.doesNotMatch(availability, /then 'booked'|else 'booked'/);
  assert.match(
    availability,
    /student_booking\.student_id = v_student_id[\s\S]*?student_booking\.consultation_date = p_date[\s\S]*?student_booking\.slot_start = catalog\.slot_start[\s\S]*?student_booking\.status <>[\s\S]*?'cancelled'/,
  );
  assert.doesNotMatch(
    availability.match(/returns table \([\s\S]*?\)/)?.[0] ?? "",
    /counselor|workload|reason|count/i,
  );
});

test("direct Student INSERT and Claim Next execution are retired", () => {
  assert.match(migration, /drop policy if exists consultation_requests_insert_own/);
  assert.match(migration, /revoke insert on table public\.consultation_requests/);
  assert.match(migration, /drop trigger if exists consultation_requests_prepare_insert/);
  assert.match(
    migration,
    /revoke execute on function public\.claim_next_consultation\(\)[\s\S]*?from public, anon, authenticated, service_role/,
  );
});

test("broad Counselor SELECT is replaced by Primary-only table access", () => {
  assert.match(
    migration,
    /drop policy if exists consultation_requests_select_counselor_all/,
  );
  assert.match(migration, /create policy consultation_requests_select_primary_counselor/);
  assert.match(migration, /is_active_primary_counselor_for_student\(student_id\)/);
});

test("covering projection is assigned-only, bounded, and excludes private records", () => {
  assert.match(assignedProjection, /request\.assigned_counselor_id = v_caller_id/);
  assert.match(assignedProjection, /p_limit not between 1 and 200/);
  assert.match(
    assignedProjection,
    /case when assignment\.id is not null then request\.student_id else null end/,
  );
  assert.doesNotMatch(
    assignedProjection,
    /counselor_student_notes|follow_up|application_document|progression_evidence|mobile_number|personal_email|college_email|assignment_reason/i,
  );
});

test("application booking uses only the allocator and exposes a safe receipt", () => {
  const action = read("../../app/actions/consultation-actions.ts");
  const form = read("../../components/forms/consultation-form.tsx");
  assert.match(action, /\.rpc\("book_student_consultation"/);
  assert.doesNotMatch(action, /\.insert\(/);
  assert.doesNotMatch(action, /assigned_counselor_id|assigned_at|p_counselor/);
  assert.match(form, /Consultation Confirmed/);
  assert.match(form, /request_number/);
  assert.doesNotMatch(form, /Waiting for Counselor|Pending Assignment|Awaiting Claim/);
});

test("completed history exposes only the trusted Continue with K-GEO action", () => {
  const dashboard = read("../../app/student/dashboard/page.tsx");
  const component = read(
    "../../components/student/continue-with-kgeo-form.tsx",
  );
  const action = read(
    "../../app/actions/consultation-continuation-actions.ts",
  );
  assert.match(dashboard, /consultation\.status === "completed"/);
  assert.match(dashboard, /hasCompletedConsultation/);
  assert.match(component, /Continue with K-GEO/);
  assert.match(action, /\.rpc\("continue_with_kgeo"/);
  assert.doesNotMatch(
    `${component}\n${action}`,
    /consultationId|p_consultation_id|counselorId|p_counselor_id/,
  );
});

test("Student sees only actually available slots", () => {
  const picker = read("../../components/forms/consultation-slot-picker.tsx");
  assert.match(
    picker,
    /state\.slots\.filter\(\(slot\) =>\s+isSlotSelectable\(slot\.availabilityStatus\)/,
  );
  assert.doesNotMatch(picker, /Counselor workload|block reason|Primary unavailable/i);
});

test("Counselor UI is assigned-only and includes personal block controls", () => {
  const dashboard = read("../../app/counselor/dashboard/page.tsx");
  const schedule = read("../../app/counselor/schedule/page.tsx");
  assert.match(dashboard, /list_my_assigned_consultations/);
  assert.match(schedule, /list_my_assigned_consultations/);
  assert.match(schedule, /CounselorSlotBlocks/);
  assert.doesNotMatch(`${dashboard}\n${schedule}`, /Claim Next|FCFS queue|Awaiting Claim/i);
});

test("legacy inventory is read-only and identifies exactly the reviewed pending rows", () => {
  assert.doesNotMatch(inventory, /\b(?:insert|update|delete|alter|drop|create)\b/i);
  assert.match(inventory, /'submitted'::public\.consultation_status/);
  assert.match(inventory, /'waiting_for_assignment'::public\.consultation_status/);
  assert.match(inventory, /'counselor_assigned'::public\.consultation_status/);
  assert.match(inventory, /KGEOC-2026-000005/);
});

test("owner cleanup is exact, transactional, dependency-safe, and protects 000005", () => {
  assert.match(cleanup, /^begin;$/m);
  assert.match(cleanup, /^commit;$/m);
  assert.match(cleanup, /KGEOC-2026-000001/);
  assert.match(cleanup, /KGEOC-2026-000002/);
  assert.match(cleanup, /expected exactly two/i);
  assert.match(cleanup, /KGEOC-2026-000005/);
  assert.match(cleanup, /counselor_follow_ups/);
  assert.match(cleanup, /counselor_student_notes/);
});

test("readiness checks the installed cutover rather than source text alone", () => {
  assert.match(readiness, /pg_catalog\.pg_policy/);
  assert.match(readiness, /pg_catalog\.pg_trigger/);
  assert.match(readiness, /pg_catalog\.pg_indexes/);
  assert.match(readiness, /has_table_privilege/);
  assert.match(readiness, /has_function_privilege/);
  assert.match(readiness, /NO_PARTIAL_AUTOMATIC_BOOKINGS/);
  assert.match(readiness, /CONTINUE_WITH_KGEO_RPC/);
  assert.match(readiness, /FINAL_AUTOMATIC_ALLOCATION_READINESS/);
  assert.doesNotMatch(
    readiness,
    /^\s*(?:insert|update|delete|alter|drop|create)\b/gim,
  );
});

test("corrected Step 4.5D migration retains its reviewed integrity hash", () => {
  assert.equal(
    sha256(
      "../../../supabase/migrations/202608230002_time_aware_consultation_lifecycle.sql",
    ),
    "61e989e2f678826a90aa4613126674203dc279429e73a68cf10734a333ca46b0",
  );
});

test("obsolete Claim Next application files remain absent", () => {
  assert.equal(
    existsSync(
      new URL("../../app/actions/consultation-assignment-actions.ts", import.meta.url),
    ),
    false,
  );
  assert.equal(
    existsSync(
      new URL(
        "../../components/counselor/consultation-assignment-queue.tsx",
        import.meta.url,
      ),
    ),
    false,
  );
});
