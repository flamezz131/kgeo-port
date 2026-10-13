import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  DEFAULT_LEGACY_CONSULTATION_REASON,
  parseDirectorLegacyWaitingConsultations,
  submitLegacyConsultationClosure,
} = require("./legacy-consultation.ts") as typeof import("./legacy-consultation");

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const migration = read(
  "../../../supabase/migrations/202608220002_controlled_legacy_consultation_closure.sql",
);
const action = read("../../app/actions/director-consultation-actions.ts");
const component = read(
  "../../components/director/director-legacy-consultation-resolution.tsx",
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

const listRpc = functionBody("list_director_legacy_waiting_consultations");
const closeRpc = functionBody("close_legacy_waiting_consultation");
const auditTriggerFunction = functionBody(
  "protect_legacy_consultation_cancellation_audit",
);

test("Step 4.5C is one forward-only migration with no automatic remediation", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.doesNotMatch(migration, /^update public\.consultation_requests/im);
  assert.doesNotMatch(migration, /2027-02-22|09:00|17:00|counselor_block/i);
  assert.doesNotMatch(
    migration,
    /create (?:unique )?index[\s\S]*?consultation_requests|claim_next_consultation|reassign_primary_counselor/,
  );
});

test("the exact legacy list and closure are active-verified Director only", () => {
  for (const rpc of [listRpc, closeRpc]) {
    assert.match(rpc, /\(select auth\.uid\(\)\)/);
    assert.match(
      rpc,
      /has_active_verified_kgeo_role\([\s\S]*?'director'::public\.user_role[\s\S]*?is distinct from true/,
    );
  }
  assert.doesNotMatch(closeRpc, /p_director_id|p_actor_id/);
  assert.doesNotMatch(
    closeRpc,
    /'counselor'::public\.user_role|'student'::public\.user_role|'admin'::public\.user_role/,
  );
  assert.match(
    migration,
    /revoke all on function public\.close_legacy_waiting_consultation\(uuid, text\)[\s\S]*?from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.close_legacy_waiting_consultation\(uuid, text\)[\s\S]*?to authenticated/,
  );
});

test("both RPCs are postgres-owned with empty trusted search paths", () => {
  for (const signature of [
    "list_director_legacy_waiting_consultations\\(\\)",
    "close_legacy_waiting_consultation\\(uuid, text\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter function public\\.${signature}[\\s\\S]*?owner to postgres`),
    );
  }
  assert.match(listRpc, /stable[\s\S]*?security definer[\s\S]*?set search_path = ''/);
  assert.match(closeRpc, /security definer[\s\S]*?set search_path = ''/);
});

test("closure locks and rechecks every exact legacy predicate", () => {
  assert.match(
    closeRpc,
    /from public\.consultation_requests as request[\s\S]*?request\.id = p_consultation_id[\s\S]*?for update/,
  );
  for (const predicate of [
    "v_target_status is distinct from",
    "v_assigned_counselor_id is not null",
    "v_assigned_at is not null",
    "v_consultation_date is not null",
    "v_slot_start is not null",
    "v_slot_end is not null",
  ]) {
    assert.match(closeRpc, new RegExp(predicate));
  }
  for (const predicate of [
    "request.assigned_counselor_id is null",
    "request.assigned_at is null",
    "request.consultation_date is null",
    "request.slot_start is null",
    "request.slot_end is null",
  ]) {
    assert.equal(closeRpc.match(new RegExp(predicate, "g"))?.length, 1);
    assert.match(listRpc, new RegExp(predicate));
  }
  assert.equal(
    closeRpc.match(/'waiting_for_assignment'::public\.consultation_status/g)
      ?.length,
    2,
  );
});

test("the active Primary Counselor requirement is locked before closure", () => {
  assert.match(
    closeRpc,
    /from public\.student_counselor_assignments as assignment[\s\S]*?assignment\.student_id = v_student_id[\s\S]*?assignment\.ended_at is null[\s\S]*?for share/,
  );
  assert.match(closeRpc, /Student does not have an active Primary Counselor/);
  assert.match(
    listRpc,
    /exists \([\s\S]*?student_counselor_assignments[\s\S]*?assignment\.ended_at is null/,
  );
});

test("reason validation is mandatory bounded normalized and control-free", async () => {
  assert.match(closeRpc, /p_reason is null[\s\S]*?p_reason ~ '\[\[:cntrl:\]\]'/);
  assert.match(closeRpc, /regexp_replace\([\s\S]*?'\[\[:space:\]\]\+'[\s\S]*?' '/);
  assert.match(closeRpc, /char_length\(v_reason\) not between 1 and 300/);
  assert.match(migration, /consultation_requests_cancellation_reason_check/);

  let trustedReason = "";
  const valid = new FormData();
  valid.set("reason", "  Reviewed   legacy request  ");
  const result = await submitLegacyConsultationClosure(
    "11111111-1111-4111-8111-111111111111",
    valid,
    async (_consultationId, reason) => {
      trustedReason = reason;
      return {
        data: [{
          request_number: "KGEOC-2026-000001",
          consultation_status: "cancelled",
          cancelled_at: "2026-08-22T10:00:00Z",
        }],
        error: null,
      };
    },
  );
  assert.equal(result.status, "success");
  assert.equal(trustedReason, "Reviewed legacy request");
});

test("malformed and duplicate browser fields fail before the RPC", async () => {
  let calls = 0;
  const close = async () => {
    calls += 1;
    return { data: null, error: null };
  };
  for (const formData of [
    new FormData(),
    (() => {
      const data = new FormData();
      data.set("reason", "line one\nline two");
      return data;
    })(),
    (() => {
      const data = new FormData();
      data.append("reason", "one");
      data.append("reason", "two");
      return data;
    })(),
    (() => {
      const data = new FormData();
      data.set("reason", DEFAULT_LEGACY_CONSULTATION_REASON);
      data.set("directorId", "11111111-1111-4111-8111-111111111111");
      return data;
    })(),
  ]) {
    const result = await submitLegacyConsultationClosure(
      "11111111-1111-4111-8111-111111111111",
      formData,
      close,
    );
    assert.equal(result.status, "error");
  }
  assert.equal(calls, 0);
});

test("closure retains the row and changes only status plus trusted audit fields", () => {
  const update = closeRpc.match(
    /update public\.consultation_requests as request[\s\S]*?returning[\s\S]*?into[\s\S]*?;/,
  )?.[0];
  assert.ok(update);
  for (const assignment of [
    "status = 'cancelled'::public.consultation_status",
    "cancelled_at = v_cancelled_at",
    "cancelled_by = v_director_id",
    "cancellation_reason = v_reason",
  ]) {
    assert.match(update, new RegExp(assignment));
  }
  const setClause = update.match(/\n  set\n([\s\S]*?)\n  where/)?.[1];
  assert.ok(setClause);
  assert.doesNotMatch(
    setClause,
    /request_number|student_id|student_name|roll_number|college_email|personal_email|submitted_at|created_at|assigned_counselor_id|assigned_at/i,
  );
  assert.doesNotMatch(closeRpc, /delete from/i);
});

test("cancellation audit is complete and immutable after terminal closure", () => {
  assert.match(
    migration,
    /add column cancelled_at timestamptz,[\s\S]*?add column cancelled_by uuid,[\s\S]*?add column cancellation_reason text/,
  );
  assert.match(
    migration,
    /cancelled_at is not null[\s\S]*?cancelled_by is not null[\s\S]*?cancellation_reason is not null[\s\S]*?status = 'cancelled'/,
  );
  assert.match(auditTriggerFunction, /tg_op = 'DELETE'/);
  for (const field of ["status", "cancelled_at", "cancelled_by", "cancellation_reason"]) {
    assert.match(
      auditTriggerFunction,
      new RegExp(`new\\.${field} is distinct from old\\.${field}`),
    );
  }
  assert.match(
    migration,
    /create trigger consultation_requests_protect_legacy_cancellation_audit[\s\S]*?before update or delete on public\.consultation_requests/,
  );
});

test("normal lifecycle and every terminal or populated state remain ineligible", () => {
  type Candidate = {
    status: string;
    counselorId: string | null;
    assignedAt: string | null;
    date: string | null;
    start: string | null;
    end: string | null;
    hasPrimary: boolean;
  };
  const eligible = (row: Candidate) =>
    row.status === "waiting_for_assignment" &&
    row.counselorId === null &&
    row.assignedAt === null &&
    row.date === null &&
    row.start === null &&
    row.end === null &&
    row.hasPrimary;
  const legacy: Candidate = {
    status: "waiting_for_assignment",
    counselorId: null,
    assignedAt: null,
    date: null,
    start: null,
    end: null,
    hasPrimary: true,
  };
  assert.equal(eligible(legacy), true);
  for (const status of [
    "submitted",
    "counselor_assigned",
    "scheduled",
    "completed",
    "no_show",
    "cancelled",
  ]) {
    assert.equal(eligible({ ...legacy, status }), false);
  }
  assert.equal(
    eligible({ ...legacy, date: "2027-02-22", start: "15:30", end: "16:00" }),
    false,
  );
  assert.equal(eligible({ ...legacy, hasPrimary: false }), false);
});

test("RPC response and list projection are bounded and identity-safe", () => {
  assert.match(
    closeRpc,
    /returns table \([\s\S]*?request_number text,[\s\S]*?consultation_status public\.consultation_status,[\s\S]*?cancelled_at timestamptz[\s\S]*?\)/,
  );
  assert.match(listRpc, /order by request\.submitted_at asc, request\.id asc[\s\S]*?limit 25/);
  assert.doesNotMatch(
    listRpc,
    /personal_email|mobile_number|roll_number|raw_(?:user|app)_meta_data|auth\.users/,
  );

  const parsed = parseDirectorLegacyWaitingConsultations([{
    consultation_id: "11111111-1111-4111-8111-111111111111",
    request_number: "KGEOC-2026-000001",
    student_full_name: "Student A",
    student_college_email: "student.a@kct.ac.in",
    submitted_at: "2026-08-01T10:00:00Z",
  }]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.studentFullName, "Student A");
});

test("Director UI is narrow confirmed and does not display technical identity", () => {
  for (const label of [
    "Legacy unscheduled requests",
    "Legacy unscheduled request",
    "Close Legacy Request",
    "Close this old unscheduled consultation request?",
    "Reason",
    "Confirm Closure",
  ]) {
    assert.match(component, new RegExp(label.replace(/[?]/gu, "\\?")));
  }
  assert.match(component, /\.bind\([\s\S]*?consultation\.consultationId/);
  assert.match(component, /<ul className="director-assignment-history">/);
  assert.doesNotMatch(component, /<ul className="director-oversight-mobile">/);
  assert.doesNotMatch(component, /type="hidden"|Auth UUID|technical email|SQL state/i);
  assert.match(page, /DirectorLegacyConsultationResolution/);
  assert.match(page, /loadDirectorLegacyWaitingConsultations/);
});

test("server action authenticates independently and never accepts Director identity", () => {
  assert.match(action, /^"use server";/);
  assert.equal(
    action.match(/^export async function /gm)?.length,
    1,
  );
  assert.match(action, /await requireDirector\(\)/);
  assert.match(action, /close_legacy_waiting_consultation/);
  assert.doesNotMatch(action, /directorId|p_director_id|p_cancelled_by/);
  for (const path of [
    "/director/consultations",
    "/counselor/schedule",
    "/student/dashboard",
  ]) {
    assert.match(action, new RegExp(`revalidatePath\\("${path}"\\)`));
  }
});

test("existing factual outcome flow and Director reassignment sources are unchanged", () => {
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
    /create or replace function public\.(?:record_consultation_outcome|claim_next_consultation|reassign_primary_counselor)/,
  );
  assert.match(
    read("../../app/actions/consultation-outcome-actions.ts"),
    /record_consultation_outcome/,
  );
  assert.match(
    read("../../app/counselor/schedule/page.tsx"),
    /slot\.state === "outcome_required"[\s\S]*?slot\.booking\.status === "scheduled"[\s\S]*?ConsultationOutcomeControls/,
  );
});

test("focused Step 4.5C test is registered in the standard suite", () => {
  const script = JSON.parse(packageSource).scripts.test as string;
  assert.match(script, /legacy-consultation-resolution\.test\.ts/);
});
