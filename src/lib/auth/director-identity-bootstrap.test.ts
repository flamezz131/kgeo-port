import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function normalizedHash(source: string): string {
  return createHash("sha256")
    .update(source.replace(/\r\n/g, "\n"))
    .digest("hex");
}

const migrationName =
  "202608060002_director_identity_bootstrap_support.sql";
const migrationSource = read(`../../../supabase/migrations/${migrationName}`);
const executableMigration = migrationSource.replace(/--.*$/gm, "");
const a11MigrationSource = read(
  "../../../supabase/migrations/202608060001_director_dashboard_read_foundation.sql",
);
const initialIdentitySource = read(
  "../../../supabase/migrations/202607170001_initial_kgeo_schema.sql",
);
const profileFoundationSource = read(
  "../../../supabase/migrations/202607190002_student_profile_foundation.sql",
);
const readinessSource = read(
  "../../../supabase/verification/pre_phase_c2_readiness.sql",
);
const registrationValidationSource = read("../validation/institutional-email.ts");
const registrationActionSource = read("../../app/actions/auth-actions.ts");

const kctEmailPattern = /^[^\s@]+@kct\.ac\.in$/;
const directorEmailPattern =
  /^[^\s@.]+(?:\.[^\s@.]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function profileEmailAllowed(
  role: "student" | "counselor" | "admin" | "director",
  email: string,
): boolean {
  const normalized = email === email.trim().toLowerCase();
  const validSyntax =
    email.length >= 3 &&
    email.length <= 254 &&
    email.split("@")[0].length <= 64 &&
    directorEmailPattern.test(email);
  return normalized && validSyntax && (role === "director" || kctEmailPattern.test(email));
}

test("A1.1.1 is one additive migration and preserves every earlier migration", () => {
  assert.equal(
    normalizedHash(a11MigrationSource),
    "1179d59e46ba49904efe5bf610705aff6338dc52e92dd0b00ed57ad6630a0303",
  );

  const migrationNames = readdirSync(
    new URL("../../../supabase/migrations/", import.meta.url),
  );
  assert.deepEqual(
    migrationNames.filter((name) => name.startsWith("202608060002_")),
    [migrationName],
  );
  assert.match(executableMigration, /^\s*begin;/);
  assert.match(executableMigration, /commit;\s*$/);
  assert.doesNotMatch(
    executableMigration,
    /create\s+(?:table|view|type)|alter\s+type|create\s+policy/i,
  );
});

test("the profile constraint keeps KCT roles exact and gives only Directors a valid-domain rule", () => {
  const constraint =
    executableMigration.match(
      /add constraint profiles_college_email_check[\s\S]*?\n\s*\);/,
    )?.[0] ?? "";

  assert.match(
    constraint,
    /college_email = pg_catalog\.lower\(pg_catalog\.btrim\(college_email\)\)/,
  );
  assert.match(constraint, /char_length\(college_email\) between 3 and 254/);
  assert.match(constraint, /split_part\(college_email, '@', 1\)/);
  assert.match(constraint, /role = 'director'::public\.user_role/);
  assert.match(constraint, /role <> 'director'::public\.user_role/);
  assert.match(constraint, /@kct\[\.\]ac\[\.\]in/);
  assert.doesNotMatch(constraint, /kclas/);

  assert.equal(kctEmailPattern.test("student@kct.ac.in"), true);
  assert.equal(kctEmailPattern.test("student@mail.kct.ac.in"), false);
  assert.equal(kctEmailPattern.test("student@kct.ac.in.example.com"), false);
  assert.equal(kctEmailPattern.test("student@kclas.ac.in"), false);
  assert.equal(directorEmailPattern.test("director@kclas.ac.in"), true);
  assert.equal(directorEmailPattern.test("director@example.org"), true);
  for (const malformed of [
    "director@",
    ".director@kclas.ac.in",
    "director..office@kclas.ac.in",
    "director@-kclas.ac.in",
    "director@kclas-.ac.in",
    "director@kclas..ac.in",
    "director @kclas.ac.in",
  ]) {
    assert.equal(directorEmailPattern.test(malformed), false, malformed);
  }

  assert.equal(profileEmailAllowed("director", "director@kclas.ac.in"), true);
  assert.equal(profileEmailAllowed("director", "director@example.org"), true);
  for (const role of ["student", "counselor", "admin"] as const) {
    assert.equal(profileEmailAllowed(role, "member@kct.ac.in"), true);
    assert.equal(profileEmailAllowed(role, "director@kclas.ac.in"), false);
    assert.equal(profileEmailAllowed(role, "director@example.org"), false);
  }
});

test("public registration stays student-only and rejects all non-KCT domains and role injection", () => {
  assert.match(
    registrationValidationSource,
    /INSTITUTIONAL_EMAIL_DOMAIN = "kct\.ac\.in"/,
  );
  assert.match(registrationActionSource, /supabase\.auth\.signUp/);
  assert.match(registrationActionSource, /data:\s*\{\s*full_name:/);
  assert.doesNotMatch(
    registrationActionSource,
    /kgeo_bootstrap_role|raw_app_meta_data|\brole\s*:/,
  );

  for (const email of [
    "student@mail.kct.ac.in",
    "student@kct.ac.in.example.com",
    "student@kclas.ac.in",
    "student@example.org",
  ]) {
    assert.equal(kctEmailPattern.test(email), false, email);
  }
});

test("the Auth trigger separates public students from exact trusted Director bootstrap", () => {
  const functionBody =
    executableMigration.match(
      /create or replace function public\.handle_new_user\(\)[\s\S]*?\$function\$;/,
    )?.[0] ?? "";

  assert.match(functionBody, /new\.raw_app_meta_data/);
  assert.match(functionBody, /\? 'kgeo_bootstrap_role'/);
  assert.match(functionBody, /->> 'kgeo_bootstrap_role'/);
  assert.match(functionBody, /jsonb_typeof\([\s\S]*?-> 'kgeo_bootstrap_role'/);
  assert.match(functionBody, /bootstrap_role <> 'director'/);
  assert.match(functionBody, /'director'::public\.user_role/);
  assert.match(functionBody, /'student'::public\.user_role/);
  assert.match(functionBody, /values \(\s*new\.id,/);
  assert.doesNotMatch(
    functionBody,
    /raw_user_meta_data\s*->>?\s*'(?:role|kgeo_bootstrap_role)'/,
  );
  assert.doesNotMatch(
    functionBody,
    /'(?:counselor|admin)'::public\.user_role/,
  );

  for (const invalidMarker of [
    "Director",
    "director ",
    "counselor",
    "admin",
    "student",
    "",
  ]) {
    assert.notEqual(invalidMarker, "director");
  }
});

test("Director authorization remains exact-role active verified and domain-independent", () => {
  const helper =
    profileFoundationSource.match(
      /create function public\.has_active_verified_kgeo_role\([\s\S]*?\$function\$;/,
    )?.[0] ?? "";
  assert.match(helper, /profile\.id = \(select auth\.uid\(\)\)/);
  assert.match(helper, /profile\.role = p_role/);
  assert.match(helper, /profile\.is_active is true/);
  assert.match(helper, /auth_user\.email_confirmed_at is not null/);
  assert.doesNotMatch(helper, /kct|kclas/i);

  const authorized = (input: {
    idsMatch: boolean;
    role: "student" | "counselor" | "admin" | "director" | null;
    active: boolean;
    verified: boolean;
  }) =>
    input.idsMatch &&
    input.role === "director" &&
    input.active &&
    input.verified;

  assert.equal(
    authorized({ idsMatch: true, role: "director", active: true, verified: true }),
    true,
  );
  for (const denied of [
    { idsMatch: true, role: "director" as const, active: false, verified: true },
    { idsMatch: true, role: "director" as const, active: true, verified: false },
    { idsMatch: true, role: "admin" as const, active: true, verified: true },
    { idsMatch: true, role: "student" as const, active: true, verified: true },
    { idsMatch: true, role: "counselor" as const, active: true, verified: true },
    { idsMatch: false, role: "director" as const, active: true, verified: true },
    { idsMatch: false, role: null, active: true, verified: true },
  ]) {
    assert.equal(authorized(denied), false);
  }
});

test("readiness supersedes app-metadata bootstrap without weakening students", () => {
  const finalProvisioningSection =
    readinessSource.match(
      /Phase A1\.1\.2 secure one-time staff identity provisioning[\s\S]*?Aggregate-only A1\.1 required-zero/,
    )?.[0] ?? "";

  assert.match(finalProvisioningSection, /kgeo_staff_provisioning_token/);
  assert.match(finalProvisioningSection, /request\.approved_role/);
  assert.match(finalProvisioningSection, /not like '%raw_app_meta_data%'/);
  assert.match(
    finalProvisioningSection,
    /not like\s+'%raw_user_meta_data -> ''kgeo_bootstrap_role''%'/,
  );
  assert.match(readinessSource, /profiles whose email violates their role policy/);
  assert.doesNotMatch(
    readinessSource,
    /director profiles with invalid institutional email/,
  );
  assert.doesNotMatch(initialIdentitySource, /raw_app_meta_data/);
});
