import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  DEFAULT_DUPLICATE_FUTURE_REASON,
  parseDirectorDuplicateFutureWaitingConsultations,
  submitDuplicateFutureConsultationClosure,
} = require("./duplicate-future-consultation.ts") as typeof import(
  "./duplicate-future-consultation"
);

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const migration = read(
  "../../../supabase/migrations/202608230001_duplicate_future_waiting_consultation_closure.sql",
);
const action = read(
  "../../app/actions/director-duplicate-future-consultation-actions.ts",
);
const component = read(
  "../../components/director/director-duplicate-future-consultation-resolution.tsx",
);
const page = read("../../app/director/consultations/page.tsx");
const packageSource = read("../../../package.json");

function functionBody(name: string): string {
  const body = migration.match(
    new RegExp(`create function public\\.${name}\\([\\s\\S]*?\\$function\\$;`),
  )?.[0];
  assert.ok(body, `${name} function is missing`);
  return body;
}

const listRpc = functionBody(
  "list_director_duplicate_future_waiting_consultations",
);
const closeRpc = functionBody(
  "close_duplicate_future_waiting_consultation",
);

test("Step 4.5C.2 is one forward transaction with no automatic data mutation", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.equal((migration.match(/^create function public\./gm) ?? []).length, 2);
  assert.doesNotMatch(migration, /^update public\.consultation_requests/im);
  assert.doesNotMatch(migration, /^delete from|^insert into/im);
  assert.doesNotMatch(
    migration,
    /2026-08-24|2027-02-22|Mukesh|Durga|Counselor B/i,
  );
});

test("both new RPCs require only the exact active verified Director role", () => {
  for (const rpc of [listRpc, closeRpc]) {
    const authorizationBlock = rpc.slice(0, rpc.indexOf("end if;") + 7);

    assert.match(rpc, /\(select auth\.uid\(\)\)/);
    assert.match(
      authorizationBlock,
      /has_active_verified_kgeo_role\([\s\S]*?'director'::public\.user_role[\s\S]*?is distinct from true/,
    );
    assert.doesNotMatch(
      authorizationBlock,
      /'student'::public\.user_role|'counselor'::public\.user_role|'admin'::public\.user_role/,
    );
    assert.doesNotMatch(rpc, /p_director_id|p_actor_id/);
  }
});

test("RPC ownership search paths and execution ACLs are minimal", () => {
  for (const signature of [
    "list_director_duplicate_future_waiting_consultations\\(\\)",
    "close_duplicate_future_waiting_consultation\\(uuid, text\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter function public\\.${signature}[\\s\\S]*?owner to postgres`),
    );
    assert.match(
      migration,
      new RegExp(`revoke all on function[\\s\\S]*?public\\.${signature}[\\s\\S]*?from public, anon, authenticated, service_role`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function[\\s\\S]*?public\\.${signature}[\\s\\S]*?to authenticated`),
    );
  }
  assert.match(listRpc, /stable[\s\S]*?security definer[\s\S]*?set search_path = ''/);
  assert.match(closeRpc, /security definer[\s\S]*?set search_path = ''/);
});

test("Director list projection is bounded deterministic and identity-safe", () => {
  assert.match(listRpc, /inner join lateral \(/);
  assert.match(
    listRpc,
    /order by[\s\S]*?scheduled\.consultation_date asc,[\s\S]*?scheduled\.slot_start asc,[\s\S]*?scheduled\.id asc[\s\S]*?limit 1/,
  );
  assert.match(
    listRpc,
    /order by request\.submitted_at asc, request\.id asc[\s\S]*?limit 25/,
  );
  assert.doesNotMatch(
    listRpc,
    /student_id uuid|counselor_id uuid|college_email|technical|auth\.users|personal_email|mobile_number|roll_number/,
  );
});

test("target lookup serializes on the Student before locking and rechecking the target", () => {
  const initialLookup = closeRpc.indexOf("select request.student_id");
  const studentLock = closeRpc.indexOf("from public.profiles as student");
  const targetLock = closeRpc.indexOf("from public.consultation_requests as request\n  where request.id = p_consultation_id\n  for update");
  assert.ok(initialLookup >= 0);
  assert.ok(studentLock > initialLookup);
  assert.ok(targetLock > studentLock);
  assert.match(closeRpc, /v_student_id is distinct from v_initial_student_id/);
  assert.match(
    closeRpc,
    /from public\.profiles as student[\s\S]*?student\.id = v_initial_student_id[\s\S]*?for update/,
  );
});

test("target must be exact future populated unassigned waiting state", () => {
  for (const predicate of [
    "v_target_status is distinct from",
    "v_assigned_counselor_id is not null",
    "v_assigned_at is not null",
    "v_consultation_date is null",
    "v_slot_start is null",
    "v_slot_end is null",
    "v_consultation_date < v_business_now::date",
    "v_slot_start <= v_business_now::time",
  ]) {
    assert.match(closeRpc, new RegExp(predicate));
  }
  assert.match(
    closeRpc,
    /statement_timestamp\(\) at time zone 'Asia\/Kolkata'/,
  );
});

test("duplicate evidence is a different assigned future scheduled row for the same Student", () => {
  for (const predicate of [
    "scheduled.student_id = v_student_id",
    "scheduled.id <> p_consultation_id",
    "scheduled.status = 'scheduled'::public.consultation_status",
    "scheduled.assigned_counselor_id is not null",
    "scheduled.consultation_date is not null",
    "scheduled.slot_start is not null",
    "scheduled.slot_end is not null",
    "scheduled.consultation_date > v_business_now::date",
    "scheduled.slot_start > v_business_now::time",
  ]) {
    assert.match(closeRpc, new RegExp(predicate));
  }
  assert.match(
    closeRpc,
    /Student does not have another future scheduled consultation/,
  );
});

test("qualifying scheduled rows are locked in deterministic order", () => {
  assert.match(
    closeRpc,
    /perform scheduled\.id[\s\S]*?order by[\s\S]*?scheduled\.consultation_date asc,[\s\S]*?scheduled\.slot_start asc,[\s\S]*?scheduled\.id asc[\s\S]*?for update/,
  );
  assert.ok(
    closeRpc.indexOf("from public.consultation_requests as request\n  where request.id = p_consultation_id\n  for update") <
      closeRpc.indexOf("perform scheduled.id"),
  );
});

test("final update repeats target and duplicate predicates and changes only audit state", () => {
  const update = closeRpc.match(
    /update public\.consultation_requests as request[\s\S]*?returning[\s\S]*?into[\s\S]*?;/,
  )?.[0];
  assert.ok(update);
  for (const predicate of [
    "request.status =",
    "request.assigned_counselor_id is null",
    "request.assigned_at is null",
    "request.consultation_date is not null",
    "request.slot_start is not null",
    "request.slot_end is not null",
    "and exists (",
    "scheduled.id <> request.id",
  ]) {
    assert.match(update, new RegExp(predicate.replace("(", "\\(")));
  }
  const setClause = update.match(/\n  set\n([\s\S]*?)\n  where/)?.[1];
  assert.ok(setClause);
  assert.match(setClause, /status = 'cancelled'::public\.consultation_status/);
  assert.match(setClause, /cancelled_at = v_cancelled_at/);
  assert.match(setClause, /cancelled_by = v_director_id/);
  assert.match(setClause, /cancellation_reason = v_reason/);
  assert.doesNotMatch(
    setClause,
    /student_id|request_number|submitted_at|consultation_date|slot_start|slot_end|assigned_counselor_id|assigned_at/,
  );
});

test("scheduled and terminal rows cannot be target-cancelled", () => {
  assert.equal(
    closeRpc.match(/'waiting_for_assignment'::public\.consultation_status/g)
      ?.length,
    2,
  );
  assert.doesNotMatch(
    closeRpc.match(/update public\.consultation_requests[\s\S]*?returning/)?.[0] ?? "",
    /request\.status\s+in|completed|no_show|counselor_assigned/,
  );
  assert.doesNotMatch(closeRpc, /update public\.consultation_requests as scheduled/);
});

test("legacy null-slot waiting and past waiting rows fail this separate contract", () => {
  type Candidate = {
    status: string;
    assigned: boolean;
    date: string | null;
    start: string | null;
    end: string | null;
    future: boolean;
    hasOtherFutureScheduled: boolean;
  };
  const eligible = (row: Candidate) =>
    row.status === "waiting_for_assignment" &&
    !row.assigned &&
    row.date !== null &&
    row.start !== null &&
    row.end !== null &&
    row.future &&
    row.hasOtherFutureScheduled;
  const exact: Candidate = {
    status: "waiting_for_assignment",
    assigned: false,
    date: "2026-08-24",
    start: "14:30",
    end: "15:00",
    future: true,
    hasOtherFutureScheduled: true,
  };
  assert.equal(eligible(exact), true);
  assert.equal(eligible({ ...exact, date: null, start: null, end: null }), false);
  assert.equal(eligible({ ...exact, future: false }), false);
  assert.equal(eligible({ ...exact, hasOtherFutureScheduled: false }), false);
  assert.equal(eligible({ ...exact, assigned: true }), false);
  for (const status of ["scheduled", "counselor_assigned", "completed", "no_show", "cancelled"]) {
    assert.equal(eligible({ ...exact, status }), false);
  }
});

test("reason is mandatory normalized bounded and browser input is fail-closed", async () => {
  assert.match(closeRpc, /p_reason is null[\s\S]*?p_reason ~ '\[\[:cntrl:\]\]'/);
  assert.match(closeRpc, /char_length\(v_reason\) not between 1 and 300/);
  let receivedReason = "";
  const formData = new FormData();
  formData.set("reason", "  Duplicate   future request  ");
  const result = await submitDuplicateFutureConsultationClosure(
    "11111111-1111-4111-8111-111111111111",
    formData,
    async (_id, reason) => {
      receivedReason = reason;
      return {
        data: [{
          request_number: "KGEOC-2026-000001",
          consultation_status: "cancelled",
          cancelled_at: "2026-08-23T10:00:00Z",
        }],
        error: null,
      };
    },
  );
  assert.equal(result.status, "success");
  assert.equal(receivedReason, "Duplicate future request");

  const extra = new FormData();
  extra.set("reason", DEFAULT_DUPLICATE_FUTURE_REASON);
  extra.set("directorId", "11111111-1111-4111-8111-111111111111");
  const rejected = await submitDuplicateFutureConsultationClosure(
    "11111111-1111-4111-8111-111111111111",
    extra,
    async () => ({ data: null, error: null }),
  );
  assert.equal(rejected.status, "error");
});

test("Step 4.5C audit fields and immutability trigger are reused, not duplicated", () => {
  assert.doesNotMatch(migration, /alter table public\.consultation_requests/);
  assert.doesNotMatch(migration, /create trigger|add column cancelled_/);
  assert.match(closeRpc, /cancelled_at = v_cancelled_at/);
  assert.match(closeRpc, /cancelled_by = v_director_id/);
  assert.match(closeRpc, /cancellation_reason = v_reason/);
  assert.match(closeRpc, /v_cancelled_at := pg_catalog\.statement_timestamp\(\)/);
});

test("concurrent target changes and lost scheduled evidence fail safely", () => {
  assert.match(closeRpc, /duplicate consultation request changed concurrently/);
  assert.match(closeRpc, /errcode = '40001'/);
  assert.match(
    closeRpc,
    /perform scheduled\.id[\s\S]*?for update;[\s\S]*?if not found then[\s\S]*?does not have another future scheduled consultation/,
  );
  assert.match(
    closeRpc,
    /update public\.consultation_requests[\s\S]*?and exists \([\s\S]*?scheduled\.status = 'scheduled'/,
  );
});

test("bounded parser accepts the safe projection and rejects extra identity", () => {
  const safe = {
    consultation_id: "11111111-1111-4111-8111-111111111111",
    request_number: "KGEOC-2026-000001",
    student_full_name: "Student A",
    requested_date: "2026-08-24",
    requested_slot_start: "14:30:00",
    requested_slot_end: "15:00:00",
    scheduled_date: "2027-02-22",
    scheduled_slot_start: "15:30:00",
    scheduled_slot_end: "16:00:00",
    scheduled_counselor_full_name: "Counselor A",
  };
  const parsed = parseDirectorDuplicateFutureWaitingConsultations([safe]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.requestedDate, "2026-08-24");
  assert.throws(() =>
    parseDirectorDuplicateFutureWaitingConsultations([
      { ...safe, student_id: "22222222-2222-4222-8222-222222222222" },
    ]),
  );
});

test("Director UI is separate narrow confirmed and keeps technical IDs hidden", () => {
  for (const label of [
    "Duplicate future requests",
    "Duplicate future request",
    "Waiting for assignment",
    "Existing active appointment",
    "Close Duplicate Request",
    "This Student already has another scheduled consultation",
    "keeps the existing scheduled appointment",
    "Confirm Closure",
  ]) {
    assert.match(component, new RegExp(label));
  }
  assert.match(component, /\.bind\([\s\S]*?consultation\.consultationId/);
  assert.doesNotMatch(component, /type="hidden"|Auth UUID|SQLSTATE|constraint name|technical email/i);
  assert.match(page, /DirectorDuplicateFutureConsultationResolution/);
  assert.match(page, /loadDirectorDuplicateFutureWaitingConsultations/);
});

test("server action reauthorizes and sends no Director identity", () => {
  assert.match(action, /^"use server";/);
  assert.equal(action.match(/^export async function /gm)?.length, 1);
  assert.match(action, /await requireDirector\(\)/);
  assert.match(action, /close_duplicate_future_waiting_consultation/);
  assert.doesNotMatch(action, /directorId|p_director_id|p_cancelled_by/);
  assert.doesNotMatch(action, /error\.(?:message|details|hint|code)/);
});

test("legacy closure migration remains byte-identical", () => {
  const source = readFileSync(
    new URL(
      "../../../supabase/migrations/202608220002_controlled_legacy_consultation_closure.sql",
      import.meta.url,
    ),
  );
  assert.equal(
    createHash("sha256").update(source).digest("hex"),
    "19e1a56fc8df6c4de899cc80ea76233f7eb53ee71af38ad38603ee4674679dd3",
  );
});

test("Claim Next outcome and Director reassignment migrations remain byte-identical", () => {
  const expected = {
    "202608110001_consultation_ownership_fcfs_assignment.sql":
      "9f0e2d2250168cb6d84ce570a73a16014fc2f92cff2666868b43c5691356f1cc",
    "202608180001_record_consultation_outcome_acl_alignment.sql":
      "1245ba55bf5cf3357f355e1bf997b12dfa86a1ac86f4469be0760e558f12e5fb",
    "202608210003_director_primary_counselor_assignment.sql":
      "5d8a80ba10857214daf1e6bce36eb77b99c4dbb06d7f205857593261285614f4",
  } as const;
  for (const [name, hash] of Object.entries(expected)) {
    const source = readFileSync(
      new URL(`../../../supabase/migrations/${name}`, import.meta.url),
    );
    assert.equal(createHash("sha256").update(source).digest("hex"), hash);
  }
  assert.doesNotMatch(
    migration,
    /create or replace function public\.(?:claim_next_consultation|record_consultation_outcome|reassign_primary_counselor)/,
  );
});

test("focused Step 4.5C.2 test is registered in the standard suite", () => {
  const script = JSON.parse(packageSource).scripts.test as string;
  assert.match(script, /duplicate-future-consultation-resolution\.test\.ts/);
});
