import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/202608090001_director_operational_oversight_foundation.sql",
  import.meta.url,
);
const migration = readFileSync(migrationUrl, "utf8");
const sql = migration.replace(/--.*$/gm, "");

test("A1.3 creates exactly three read-only Director oversight RPCs", () => {
  assert.equal((sql.match(/create function public\.list_director_/g) ?? []).length, 3);
  assert.equal((sql.match(/language plpgsql/g) ?? []).length, 3);
  assert.equal((sql.match(/\bstable\b/g) ?? []).length, 3);
  assert.equal((sql.match(/security definer/g) ?? []).length, 3);
  assert.equal((sql.match(/set search_path = ''/g) ?? []).length, 3);
  assert.equal((sql.match(/owner to postgres/g) ?? []).length, 3);
  assert.doesNotMatch(sql, /\binsert\s+into\b|\bupdate\s+public\.|\bdelete\s+from\b|execute\s+format/i);
});

test("every new RPC requires the exact active verified Director role", () => {
  assert.equal((sql.match(/v_caller_id := \(select auth\.uid\(\)\)/g) ?? []).length, 3);
  assert.equal((sql.match(/'director'::public\.user_role/g) ?? []).length, 3);
  assert.equal((sql.match(/is distinct from true/g) ?? []).length, 3);
  assert.doesNotMatch(sql, /has_active_verified_kgeo_role\(\s*'(?:student|counselor|admin)'/);
  assert.doesNotMatch(sql, /raw_(?:user|app)_meta_data|@kct|@kclas/i);
});

test("execution privileges are authenticated-only and table privileges are unchanged", () => {
  assert.equal((sql.match(/revoke all on function public\.list_director_/g) ?? []).length, 3);
  assert.equal((sql.match(/grant execute on function public\.list_director_/g) ?? []).length, 3);
  assert.equal((sql.match(/from public, anon, authenticated/g) ?? []).length, 3);
  assert.equal((sql.match(/to authenticated/g) ?? []).length, 3);
  assert.doesNotMatch(sql, /grant\s+select|create\s+policy|alter\s+table|enable\s+row level security/i);
});

test("student oversight is bounded filtered and deterministically ordered", () => {
  assert.match(sql, /list_director_student_oversight\([\s\S]*?p_page_size integer default 25/);
  assert.match(sql, /p_page not between 1 and 100000/);
  assert.match(sql, /p_page_size not between 1 and 50/);
  assert.match(sql, /char_length\(v_search\) > 100/);
  assert.match(sql, /student\.student_id asc/);
  assert.match(sql, /limit p_page_size\s+offset v_page_offset/);
  assert.match(sql, /progression_state::text = v_progression_state/);
});

test("consultation oversight preserves safe lifecycle fields and excludes narrative", () => {
  assert.match(sql, /request\.status as consultation_status/);
  assert.match(sql, /request\.outcome_recorded_at/);
  assert.match(sql, /consultation\.submitted_at desc,\s+consultation\.consultation_id desc/);
  assert.match(sql, /p_date_to - p_date_from > 3660/);
  assert.doesNotMatch(sql, /personal_email|mobile_number|outcome_(?:text|notes|narrative)|student_name|roll_number/i);
});

test("application oversight returns projection state without private artifacts", () => {
  assert.match(sql, /application\.current_status as application_status/);
  assert.match(sql, /application\.last_changed_at desc,\s+application\.application_id desc/);
  assert.match(sql, /v_archive_state not in \('active', 'archived', 'all'\)/);
  assert.doesNotMatch(sql, /application_reference|portal_url|student_university_application_documents|student_university_application_events|change_reason|archive_reason/i);
});

test("Director return contracts exclude notes and individual follow-up content", () => {
  assert.doesNotMatch(sql, /counselor_student_notes|counselor_follow_ups/);
  assert.doesNotMatch(sql, /next_action|details|note_text|service_role/i);
  assert.doesNotMatch(sql, /auth\.users|private\.kgeo_staff_provisioning_requests/);
});

test("applied A1 migrations remain byte-for-byte immutable", () => {
  const expected = {
    "202608060001_director_dashboard_read_foundation.sql": "1179d59e46ba49904efe5bf610705aff6338dc52e92dd0b00ed57ad6630a0303",
    "202608060002_director_identity_bootstrap_support.sql": "944e1fc3d71c93d983f41efc244e8814f2c489c47627a89c85f5339d56d83b8c",
    "202608060003_staff_identity_provisioning.sql": "2f3a4780c9056cb619e58e9c50ad4d0dd96063550faec68585ee1585b69573b0",
    "202608070001_staff_provisioning_trigger_ambiguity_fix.sql": "ef5ac6f499b680245565a287bc7115901895d559297b3f96106c66a8789f972a",
    "202608090001_director_operational_oversight_foundation.sql": "74de642bf267dc9ae2798ec3c9a9bc158f2717275883d84efb1f106f563bb2ed",
  } as const;
  for (const [name, hash] of Object.entries(expected)) {
    const source = readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url));
    assert.equal(createHash("sha256").update(source).digest("hex"), hash);
  }
});
