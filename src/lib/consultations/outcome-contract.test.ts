import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const actionSource = readFileSync(
  new URL("../../app/actions/consultation-outcome-actions.ts", import.meta.url),
  "utf8",
);
const authActionSource = readFileSync(
  new URL("../../app/actions/auth-actions.ts", import.meta.url),
  "utf8",
);
const profileActionSource = readFileSync(
  new URL("../../app/actions/profile-actions.ts", import.meta.url),
  "utf8",
);
const scheduleSource = readFileSync(
  new URL("../../app/counselor/schedule/page.tsx", import.meta.url),
  "utf8",
);
const migrationSource = readFileSync(
  new URL(
    "../../../supabase/migrations/202607230001_canonical_names_and_consultation_outcomes.sql",
    import.meta.url,
  ),
  "utf8",
);
const ownershipMigrationSource = readFileSync(
  new URL(
    "../../../supabase/migrations/202608110001_consultation_ownership_fcfs_assignment.sql",
    import.meta.url,
  ),
  "utf8",
);

test("outcome actions enforce counselor auth and fixed server outcomes", () => {
  assert.match(actionSource, /await requireCounselor\(\)/);
  assert.match(actionSource, /recordOutcome\(formData, "completed"\)/);
  assert.match(actionSource, /recordOutcome\(formData, "no_show"\)/);
  assert.match(actionSource, /revalidatePath\("\/counselor\/dashboard"\)/);
  assert.match(actionSource, /revalidatePath\("\/counselor\/schedule"\)/);
  assert.match(
    actionSource,
    /revalidatePath\("\/counselor\/students\/\[student-id\]", "page"\)/,
  );
});

test("the database function independently enforces role, verification, and time", () => {
  assert.match(ownershipMigrationSource, /profile\.role = 'counselor'/);
  assert.match(ownershipMigrationSource, /profile\.is_active is true/);
  assert.match(ownershipMigrationSource, /auth_user\.email_confirmed_at is not null/);
  assert.match(ownershipMigrationSource, /target_end > business_time/);
  assert.match(ownershipMigrationSource, /target_status <> 'scheduled'/);
  assert.match(ownershipMigrationSource, /for update;/);
  assert.match(
    ownershipMigrationSource,
    /target_assigned_counselor_id is distinct from caller_id/,
  );
});

test("consultation reads require the shared active verified counselor predicate", () => {
  const policySource =
    migrationSource.match(
      /create policy consultation_requests_select_counselor_all[\s\S]*?\n\);/,
    )?.[0] ?? "";

  assert.match(
    migrationSource,
    /drop policy consultation_requests_select_counselor_all\s+on public\.consultation_requests;/,
  );
  assert.match(
    policySource,
    /public\.has_active_verified_kgeo_role\(\s*'counselor'::public\.user_role/,
  );
});

test("outcome SQL remaps expected and unexpected failures to safe categories", () => {
  assert.match(
    ownershipMigrationSource,
    /exception[\s\S]*when insufficient_privilege[\s\S]*errcode = '42501'/,
  );
  assert.match(
    ownershipMigrationSource,
    /when invalid_parameter_value[\s\S]*errcode = '22023'/,
  );
  assert.match(
    ownershipMigrationSource,
    /when serialization_failure[\s\S]*errcode = '40001'/,
  );
  assert.match(
    ownershipMigrationSource,
    /when others then[\s\S]*errcode = 'P0001'[\s\S]*message = 'The consultation outcome could not be recorded'/,
  );
});

test("only outcome-required schedule rows render finalization controls", () => {
  assert.match(
    scheduleSource,
    /slot\.state === "outcome_required"[\s\S]*ConsultationOutcomeControls/,
  );
});

test("outcome access adds no table update grant and name saves never rewrite snapshots", () => {
  assert.doesNotMatch(
    ownershipMigrationSource,
    /grant\s+update[\s\S]*consultation_requests/i,
  );
  assert.doesNotMatch(profileActionSource, /consultation_requests|student_name/);
});

test("registration passes only canonical name metadata and the trigger still fixes role", () => {
  assert.match(authActionSource, /data:\s*\{\s*full_name:/);
  assert.doesNotMatch(authActionSource, /data:\s*\{[\s\S]*?role\s*:/);

  const handleNewUserBody =
    migrationSource.match(
      /create or replace function public\.handle_new_user\(\)[\s\S]*?\$function\$;/,
    )?.[0] ?? "";
  assert.match(handleNewUserBody, /raw_user_meta_data -> 'full_name'/);
  assert.match(handleNewUserBody, /'student'::public\.user_role/);
  assert.doesNotMatch(handleNewUserBody, /raw_user_meta_data ->>? 'role'/);
});

test("the profile constraint makes canonical whitespace authoritative for direct API writes", () => {
  assert.match(
    migrationSource,
    /full_name = pg_catalog\.regexp_replace\([\s\S]*?'\[\[:space:\]\]\+'[\s\S]*?'g'/,
  );
});
