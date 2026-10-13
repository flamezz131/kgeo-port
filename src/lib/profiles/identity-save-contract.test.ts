import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const migrationSource = read(
  "../../../supabase/migrations/202607230002_atomic_student_identity_save.sql",
);
const profileFoundationSource = read(
  "../../../supabase/migrations/202607190002_student_profile_foundation.sql",
);
const canonicalMigrationSource = read(
  "../../../supabase/migrations/202607230001_canonical_names_and_consultation_outcomes.sql",
);

test("identity RPC is one transaction with a fixed authenticated contract", () => {
  assert.match(migrationSource, /\bbegin;/);
  assert.match(migrationSource, /\bcommit;/);
  assert.equal(migrationSource.match(/\bcreate function\b/g)?.length, 1);
  assert.match(
    migrationSource,
    /create function public\.save_student_identity\([\s\S]*returns void[\s\S]*security definer[\s\S]*set search_path = ''/,
  );
  assert.match(migrationSource, /requester_id := \(select auth\.uid\(\)\)/);
  assert.match(
    migrationSource,
    /profile\.role = 'student'::public\.user_role[\s\S]*profile\.is_active is true[\s\S]*auth_user\.email_confirmed_at is not null/,
  );
});

test("identity RPC writes only the canonical name and approved identity fields", () => {
  const profileUpdate = migrationSource.match(
    /update public\.profiles[\s\S]*?returning profile\.id/,
  )?.[0];
  const detailedProfileUpsert = migrationSource.match(
    /insert into public\.student_profiles[\s\S]*?graduation_year = excluded\.graduation_year;/,
  )?.[0];

  assert.ok(profileUpdate);
  assert.match(profileUpdate, /set full_name = normalized_full_name/);
  const profileSetClause = profileUpdate.match(/set[\s\S]*?\n\s+where/)?.[0];
  assert.ok(profileSetClause);
  assert.doesNotMatch(
    profileSetClause,
    /\b(?:role|college_email|is_active)\s*=/,
  );

  assert.ok(detailedProfileUpsert);
  assert.match(detailedProfileUpsert, /on conflict \(student_id\) do update/);
  for (const field of [
    "roll_number",
    "personal_email",
    "mobile_number",
    "college",
    "course",
    "department",
    "current_year",
    "current_semester",
    "graduation_year",
  ]) {
    assert.match(detailedProfileUpsert, new RegExp(`${field} = excluded\\.${field}`));
  }

  assert.doesNotMatch(
    migrationSource,
    /\bp_(?:student_id|role|college_email|is_active|profile_status|created_at|updated_at)\b/,
  );
  assert.doesNotMatch(
    migrationSource,
    /\b(?:profile_status|profile_submitted_at|created_at|updated_at)\s*=/,
  );
});

test("identity upsert supports first save, later save, and cross-college roll reuse", () => {
  assert.match(
    migrationSource,
    /insert into public\.student_profiles[\s\S]*on conflict \(student_id\) do update/,
  );
  assert.match(
    profileFoundationSource,
    /create unique index student_profiles_college_roll_number_key[\s\S]*pg_catalog\.lower\(college\),[\s\S]*roll_number/,
  );
  assert.doesNotMatch(
    profileFoundationSource,
    /create unique index[\s\S]{0,120}\(\s*roll_number\s*\)/,
  );
});

test("identity RPC rejects every non-student role without accepting role input", () => {
  assert.match(
    migrationSource,
    /profile\.role = 'student'::public\.user_role[\s\S]*profile\.is_active is true/,
  );
  assert.doesNotMatch(migrationSource, /\bp_role\b|\bp_student_id\b/);
  for (const role of ["counselor", "admin", "director"]) {
    assert.doesNotMatch(
      migrationSource,
      new RegExp(`profile\\.role = '${role}'`),
    );
  }
});

test("database failure cannot leave only one identity table changed", () => {
  assert.match(
    migrationSource,
    /update public\.profiles[\s\S]*insert into public\.student_profiles/,
  );
  assert.match(migrationSource, /on conflict \(student_id\) do update/);
  assert.doesNotMatch(migrationSource, /\bcommit;[\s\S]*insert into public\.student_profiles/);
  assert.match(
    migrationSource,
    /exception[\s\S]*when unique_violation[\s\S]*when check_violation or not_null_violation[\s\S]*when insufficient_privilege[\s\S]*when others/,
  );
  assert.match(
    migrationSource,
    /when others then[\s\S]*errcode = 'P0001'[\s\S]*message = 'The student identity could not be saved'/,
  );
});

test("RPC has minimum execution grants and replaces direct name mutation", () => {
  assert.match(
    migrationSource,
    /revoke all on function public\.save_student_identity\([\s\S]*from public, anon, authenticated;/,
  );
  assert.match(
    migrationSource,
    /grant execute on function public\.save_student_identity\([\s\S]*to authenticated;/,
  );
  assert.match(
    migrationSource,
    /revoke update \(full_name\) on table public\.profiles from authenticated;/,
  );
  assert.match(
    migrationSource,
    /revoke insert \([\s\S]*?graduation_year[\s\S]*?\) on table public\.student_profiles from authenticated;/,
  );
  assert.match(
    migrationSource,
    /revoke update \([\s\S]*?graduation_year[\s\S]*?\) on table public\.student_profiles from authenticated;/,
  );
  assert.doesNotMatch(migrationSource, /grant execute[\s\S]*to (?:public|anon)/);
  assert.doesNotMatch(migrationSource, /service[_-]?role/i);
});

test("identity follow-up preserves historical consultations and completion rules", () => {
  assert.doesNotMatch(migrationSource, /consultation_requests|student_name/);
  assert.match(profileFoundationSource, /11::integer as essential_fields_total/);

  const completionView = profileFoundationSource.match(
    /create view public\.student_profile_completion[\s\S]*?comment on view public\.student_profile_completion/,
  )?.[0];
  assert.ok(completionView);
  assert.doesNotMatch(completionView, /full_name/);

  assert.match(
    canonicalMigrationSource,
    /profile names or historical consultation snapshots/,
  );
  assert.doesNotMatch(migrationSource, /update\s+public\.consultation_requests/i);
});
