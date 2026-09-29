import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/202608120001_primary_counselor_assignment_foundation.sql",
  import.meta.url,
);
const previousMigrationUrl = new URL(
  "../../../supabase/migrations/202608110001_consultation_ownership_fcfs_assignment.sql",
  import.meta.url,
);
const migration = readFileSync(migrationUrl, "utf8");

function hash(url: URL): string {
  return createHash("sha256").update(readFileSync(url)).digest("hex");
}

function functionBody(name: string): string {
  const match = migration.match(
    new RegExp(
      `create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\$function\\$;`,
    ),
  );
  assert.ok(match, `Missing ${name}`);
  return match[0];
}

test("A1.4.2A is one additive migration over immutable A1.4.1", () => {
  assert.equal(
    hash(previousMigrationUrl),
    "9f0e2d2250168cb6d84ce570a73a16014fc2f92cff2666868b43c5691356f1cc",
  );
  assert.match(migration, /^begin;[\s\S]*commit;\s*$/m);
  assert.doesNotMatch(migration, /alter table public\.profiles/i);
});

test("assignment model retains history with exactly one active row per student", () => {
  assert.match(migration, /create table public\.student_counselor_assignments/);
  for (const column of [
    "id uuid primary key",
    "student_id uuid not null",
    "counselor_id uuid not null",
    "assigned_at timestamptz not null",
    "assigned_by uuid not null",
    "ended_at timestamptz",
    "created_at timestamptz not null",
  ]) {
    assert.match(migration, new RegExp(column));
  }
  assert.match(
    migration,
    /create unique index student_counselor_assignments_one_active_student_key[\s\S]*?\(student_id\)[\s\S]*?where ended_at is null/,
  );
  assert.match(migration, /student_counselor_assignments_student_history_idx/);
});

test("trusted trigger rejects invalid roles and preserves immutable history", () => {
  const trigger = functionBody("protect_student_counselor_assignment_history");
  assert.match(trigger, /v_student_role is distinct from 'student'::public\.user_role/);
  assert.match(trigger, /v_counselor_role is distinct from 'counselor'::public\.user_role/);
  assert.match(trigger, /tg_op = 'DELETE'/);
  assert.match(trigger, /old\.ended_at is not null/);
  assert.match(trigger, /new\.ended_at is null/);
  assert.match(trigger, /new\.student_id is distinct from old\.student_id/);
});

test("first successful claim establishes ownership atomically without replacement", () => {
  const claim = functionBody("claim_next_consultation");
  assert.match(claim, /order by request\.submitted_at asc, request\.id asc/);
  assert.match(claim, /limit 1\s+for update/);
  assert.match(claim, /request\.assigned_counselor_id is null/);
  assert.match(claim, /insert into public\.student_counselor_assignments/);
  assert.match(claim, /on conflict \(student_id\) where ended_at is null\s+do nothing/);
  assert.doesNotMatch(claim, /update public\.student_counselor_assignments/);
  assert.ok(
    claim.indexOf("update public.consultation_requests") <
      claim.indexOf("insert into public.student_counselor_assignments"),
  );
});

test("claim authorization and failed-transaction behavior stay trusted", () => {
  const claim = functionBody("claim_next_consultation");
  assert.match(claim, /counselor_profile\.role = 'counselor'::public\.user_role/);
  assert.match(claim, /counselor_profile\.is_active is true/);
  assert.match(claim, /counselor_auth\.email_confirmed_at is not null/);
  assert.match(claim, /student_profile\.role = 'student'::public\.user_role/);
  assert.match(migration, /^begin;/m);
  assert.match(migration, /commit;\s*$/);
});

test("legacy students and final consultation history are not backfilled", () => {
  const beforeClaim = migration.slice(0, migration.indexOf("create or replace function public.claim_next_consultation"));
  assert.doesNotMatch(beforeClaim, /insert into public\.student_counselor_assignments[\s\S]*?select/i);
  assert.doesNotMatch(beforeClaim, /update public\.consultation_requests/i);
  assert.doesNotMatch(migration, /'completed'::public\.consultation_status/);
  assert.doesNotMatch(migration, /'no_show'::public\.consultation_status/);
});

test("read contracts are bounded and scoped to exact trusted roles", () => {
  const myStudents = functionBody("list_my_primary_students");
  assert.match(myStudents, /has_active_verified_kgeo_role\([\s\S]*?'counselor'/);
  assert.match(myStudents, /assignment\.counselor_id = v_caller_id/);
  assert.match(myStudents, /assignment\.ended_at is null/);
  assert.match(myStudents, /p_page_size not between 1 and 50/);
  for (const name of [
    "list_director_primary_counselor_assignments",
    "list_director_primary_counselor_counts",
  ]) {
    const body = functionBody(name);
    assert.match(body, /has_active_verified_kgeo_role\([\s\S]*?'director'/);
    assert.match(body, /cardinality\([\s\S]*?not between 1 and 50/);
  }
});

test("assignment storage and RPCs expose no direct mutation or private content", () => {
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.student_counselor_assignments/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete) on table/i);
  assert.doesNotMatch(
    migration,
    /counselor_student_notes|counselor_follow_ups|note_text|next_action|raw_user_meta_data|raw_app_meta_data|service_role|execute format/i,
  );
});
