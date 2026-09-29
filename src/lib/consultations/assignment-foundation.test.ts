import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/202608110001_consultation_ownership_fcfs_assignment.sql",
  import.meta.url,
);
const migration = readFileSync(migrationUrl, "utf8");
const executable = migration.replace(/--.*$/gm, "");

function hash(relativePath: string): string {
  return createHash("sha256")
    .update(readFileSync(new URL(relativePath, import.meta.url)))
    .digest("hex");
}

test("A1.4.1 is one additive migration and preserves reviewed history", () => {
  assert.equal(
    hash("../../../supabase/migrations/202608060001_director_dashboard_read_foundation.sql"),
    "1179d59e46ba49904efe5bf610705aff6338dc52e92dd0b00ed57ad6630a0303",
  );
  assert.equal(
    hash("../../../supabase/migrations/202608060002_director_identity_bootstrap_support.sql"),
    "944e1fc3d71c93d983f41efc244e8814f2c489c47627a89c85f5339d56d83b8c",
  );
  assert.equal(
    hash("../../../supabase/migrations/202608060003_staff_identity_provisioning.sql"),
    "2f3a4780c9056cb619e58e9c50ad4d0dd96063550faec68585ee1585b69573b0",
  );
  assert.match(executable, /^\s*begin;/);
  assert.match(executable, /commit;\s*$/);
  assert.equal((executable.match(/create\s+(?:or replace\s+)?function/gi) ?? []).length, 3);
});

test("student booking retains the fixed slot and starts assignment pending", () => {
  const booking = executable.match(
    /create or replace function public\.prepare_consultation_request_insert\(\)[\s\S]*?\$function\$;/,
  )?.[0] ?? "";

  assert.match(booking, /profile\.role = 'student'::public\.user_role/);
  assert.match(booking, /profile\.is_active is true/);
  assert.match(booking, /auth_user\.email_confirmed_at is not null/);
  assert.match(booking, /new\.slot_end := \(new\.slot_start \+ interval '30 minutes'\)::time/);
  assert.match(booking, /new\.status := 'waiting_for_assignment'/);
  assert.match(booking, /new\.assigned_counselor_id := null/);
  assert.match(booking, /new\.assigned_at := null/);
  assert.doesNotMatch(booking, /raw_(?:user|app)_meta_data|service_role/);
});

test("claim is exact counselor-only FCFS with row locking and repeated eligibility", () => {
  const claim = executable.match(
    /create function public\.claim_next_consultation\(\)[\s\S]*?\$function\$;/,
  )?.[0] ?? "";

  assert.match(claim, /returns uuid/);
  assert.match(claim, /security definer/);
  assert.match(claim, /set search_path = ''/);
  assert.match(claim, /counselor_profile\.role = 'counselor'/);
  assert.match(claim, /counselor_profile\.is_active is true/);
  assert.match(claim, /counselor_auth\.email_confirmed_at is not null/);
  assert.match(claim, /request\.status =\s*'waiting_for_assignment'/);
  assert.match(claim, /request\.assigned_counselor_id is null/);
  assert.match(claim, /order by request\.submitted_at asc, request\.id asc/);
  assert.match(claim, /limit 1\s+for update/);
  assert.match(claim, /assigned_counselor_id = caller_id/);
  assert.match(claim, /status = 'scheduled'/);
  assert.equal((claim.match(/request\.assigned_counselor_id is null/g) ?? []).length, 2);
  assert.doesNotMatch(claim, /execute\s+format|service_role|director|admin/);
});

test("claim grants invocation narrowly and never grants direct mutation", () => {
  assert.match(executable, /alter function public\.claim_next_consultation\(\) owner to postgres/);
  assert.match(
    executable,
    /revoke all on function public\.claim_next_consultation\(\)\s+from public, anon, authenticated/,
  );
  assert.match(
    executable,
    /grant execute on function public\.claim_next_consultation\(\)\s+to authenticated/,
  );
  assert.doesNotMatch(executable, /grant\s+(?:insert|update|delete)/i);
});

test("only the assigned counselor may finalize an ended consultation", () => {
  const outcome = executable.match(
    /create or replace function public\.record_consultation_outcome\([\s\S]*?\$function\$;/,
  )?.[0] ?? "";

  assert.match(outcome, /request\.assigned_counselor_id/);
  assert.match(outcome, /target_assigned_counselor_id is distinct from caller_id/);
  assert.match(outcome, /Only the assigned counselor may record this outcome/);
  assert.match(outcome, /request\.assigned_counselor_id = caller_id/);
  assert.match(outcome, /target_status <> 'scheduled'/);
  assert.match(outcome, /target_end > business_time/);
});

test("legacy transition queues only unresolved scheduled ownership and preserves finals", () => {
  const transition = executable.match(
    /update public\.consultation_requests as request[\s\S]*?request\.assigned_counselor_id is null;/,
  )?.[0] ?? "";

  assert.match(transition, /set status = 'waiting_for_assignment'/);
  assert.match(transition, /request\.status = 'scheduled'/);
  assert.doesNotMatch(transition, /completed|no_show|cancelled/);
  assert.match(executable, /status in \(\s*'completed'[\s\S]*?'no_show'[\s\S]*?'cancelled'/);
});

test("migration introduces no private content, messaging, or dynamic SQL", () => {
  assert.doesNotMatch(
    executable,
    /counselor_student_notes|counselor_follow_ups|director_counselor_messages|student_university|raw_(?:user|app)_meta_data|execute\s+format|sb_secret|SUPABASE_SECRET_KEY/i,
  );
});
