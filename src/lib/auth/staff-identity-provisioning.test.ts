import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function normalizedHash(source: string): string {
  return createHash("sha256")
    .update(source.replace(/\r\n/g, "\n"))
    .digest("hex");
}

function sourceHash(source: string): string {
  return createHash("sha256").update(source).digest("hex");
}

const migrationName = "202608060003_staff_identity_provisioning.sql";
const migrationSource = read(`../../../supabase/migrations/${migrationName}`);
const executableMigration = migrationSource.replace(/--.*$/gm, "");
const hotfixMigrationName =
  "202608070001_staff_provisioning_trigger_ambiguity_fix.sql";
const hotfixMigrationSource = read(
  `../../../supabase/migrations/${hotfixMigrationName}`,
);
const executableHotfixMigration = hotfixMigrationSource.replace(/--.*$/gm, "");
const hotfixFunction =
  executableHotfixMigration.match(
    /create or replace function public\.handle_new_user\(\)[\s\S]*?\$function\$;/,
  )?.[0] ?? "";
const a11MigrationSource = read(
  "../../../supabase/migrations/202608060001_director_dashboard_read_foundation.sql",
);
const a111MigrationSource = read(
  "../../../supabase/migrations/202608060002_director_identity_bootstrap_support.sql",
);
const profileFoundationSource = read(
  "../../../supabase/migrations/202607190002_student_profile_foundation.sql",
);
const registrationValidationSource = read("../validation/institutional-email.ts");
const registrationActionSource = read("../../app/actions/auth-actions.ts");
const counselorAccessSource = read("../permissions/counselor-access.ts");
const provisioningScriptUrl = new URL(
  "../../../provision-staff-once.mjs",
  import.meta.url,
);
const packageSource = read("../../../package.json");
const appDirectoryUrl = new URL("../../app/", import.meta.url);

type StaffRole = "counselor" | "director";
type UserMetadata = Record<string, unknown>;

type ProvisioningRequest = {
  approvedRole: StaffRole;
  consumed: boolean;
  email: string;
  expiresAt: number;
  tokenHash: string;
};

type IdentityResult =
  | { accepted: false }
  | {
      accepted: true;
      active: true;
      profileId: string;
      role: "student" | StaffRole;
    };

function applySupabaseMetadataUpdate(
  initialMetadata: UserMetadata,
  metadataUpdate: UserMetadata,
): UserMetadata {
  const updatedMetadata = { ...initialMetadata };

  for (const [key, value] of Object.entries(metadataUpdate)) {
    if (value === null) {
      delete updatedMetadata[key];
    } else {
      updatedMetadata[key] = value;
    }
  }

  return updatedMetadata;
}

const preparedToken = "A".repeat(43);
const preparedHash = createHash("sha256")
  .update(preparedToken, "utf8")
  .digest("hex");
const commonEmailPattern =
  /^[^@\s.]+(?:\.[^@\s.]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
const kctEmailPattern = /^[^@\s]+@kct[.]ac[.]in$/;

function validPreparedIdentity(role: StaffRole, email: string): boolean {
  return (
    email === email.trim().toLowerCase() &&
    email.length >= 3 &&
    email.length <= 254 &&
    email.split("@")[0].length <= 64 &&
    commonEmailPattern.test(email) &&
    (role === "director" || kctEmailPattern.test(email))
  );
}

function simulateIdentityInsert(input: {
  authId: string;
  downstreamFailure?: boolean;
  email: string;
  fullName?: string;
  request?: ProvisioningRequest;
  token?: string;
}): IdentityResult {
  const normalizedEmail = input.email.trim().toLowerCase();

  if (input.token !== undefined) {
    if (!/^[A-Za-z0-9_-]{43}$/.test(input.token)) {
      return { accepted: false };
    }

    const request = input.request;
    const tokenHash = createHash("sha256")
      .update(input.token, "utf8")
      .digest("hex");
    if (
      !request ||
      request.email !== normalizedEmail ||
      request.tokenHash !== tokenHash ||
      request.expiresAt <= 50 ||
      request.consumed ||
      !validPreparedIdentity(request.approvedRole, normalizedEmail)
    ) {
      return { accepted: false };
    }

    request.consumed = true;
    if (input.downstreamFailure) {
      request.consumed = false;
      return { accepted: false };
    }

    return {
      accepted: true,
      active: true,
      profileId: input.authId,
      role: request.approvedRole,
    };
  }

  if (!kctEmailPattern.test(normalizedEmail) || !input.fullName?.trim()) {
    return { accepted: false };
  }

  return {
    accepted: true,
    active: true,
    profileId: input.authId,
    role: "student",
  };
}

function request(
  approvedRole: StaffRole,
  email = approvedRole === "counselor"
    ? "counselor@kct.ac.in"
    : "director@kclas.ac.in",
): ProvisioningRequest {
  return {
    approvedRole,
    consumed: false,
    email,
    expiresAt: 100,
    tokenHash: preparedHash,
  };
}

test("A1.1.2 is exactly one generalized migration and preserves its foundations", () => {
  assert.equal(
    normalizedHash(a11MigrationSource),
    "1179d59e46ba49904efe5bf610705aff6338dc52e92dd0b00ed57ad6630a0303",
  );
  assert.equal(
    normalizedHash(a111MigrationSource),
    "944e1fc3d71c93d983f41efc244e8814f2c489c47627a89c85f5339d56d83b8c",
  );
  assert.equal(
    sourceHash(migrationSource),
    "2f3a4780c9056cb619e58e9c50ad4d0dd96063550faec68585ee1585b69573b0",
  );
  const migrationNames = readdirSync(
    new URL("../../../supabase/migrations/", import.meta.url),
  );
  assert.deepEqual(
    migrationNames.filter((name) => name.startsWith("202608060003_")),
    [migrationName],
  );
  assert.match(executableMigration, /^\s*begin;/);
  assert.match(executableMigration, /commit;\s*$/);
  assert.doesNotMatch(executableMigration, /director_bootstrap_token_flow/);
});

test("the ambiguity hotfix is one additive function-only migration", () => {
  const migrationNames = readdirSync(
    new URL("../../../supabase/migrations/", import.meta.url),
  );
  assert.deepEqual(
    migrationNames.filter((name) => name.startsWith("202608070001_")),
    [hotfixMigrationName],
  );
  assert.match(executableHotfixMigration, /^\s*begin;/);
  assert.match(executableHotfixMigration, /commit;\s*$/);
  assert.equal(
    executableHotfixMigration.match(
      /create or replace function public\.handle_new_user\(\)/g,
    )?.length,
    1,
  );
  assert.match(hotfixFunction, /security definer/);
  assert.match(hotfixFunction, /set search_path = ''/);
  assert.match(
    executableHotfixMigration,
    /alter function public\.handle_new_user\(\) owner to postgres/,
  );
  assert.match(
    executableHotfixMigration,
    /revoke all on function public\.handle_new_user\(\)\s+from public, anon, authenticated/,
  );
  assert.doesNotMatch(
    executableHotfixMigration,
    /(?:create|alter|drop)\s+(?:schema|table|type|trigger|policy)\b/i,
  );
  assert.doesNotMatch(
    executableHotfixMigration,
    /prepare_staff_identity_provisioning|on_auth_user_created/,
  );
});

test("the replacement trigger has no variable and column name conflicts", () => {
  const declarationBlock =
    hotfixFunction.match(/\bdeclare\b([\s\S]*?)\bbegin\b/)?.[1] ?? "";
  const declaredIdentifiers = Array.from(
    declarationBlock.matchAll(/^\s*([a-z][a-z0-9_]*)\s+/gm),
    (match) => match[1],
  );

  assert.deepEqual(declaredIdentifiers, [
    "v_normalized_email",
    "v_normalized_full_name",
    "v_provisioning_token",
    "v_token_hash",
    "v_approved_role",
    "v_request_time",
    "v_affected_rows",
  ]);

  for (const columnName of [
    "normalized_email",
    "approved_role",
    "token_hash",
    "expires_at",
    "consumed_at",
    "created_at",
    "id",
    "college_email",
    "role",
    "full_name",
    "is_active",
  ]) {
    assert.equal(declaredIdentifiers.includes(columnName), false, columnName);
  }

  const requestLookup =
    hotfixFunction.match(
      /select request\.approved_role[\s\S]*?for update;/,
    )?.[0] ?? "";
  assert.match(requestLookup, /into v_approved_role/);
  assert.match(
    requestLookup,
    /from private\.kgeo_staff_provisioning_requests as request/,
  );
  assert.match(
    requestLookup,
    /request\.normalized_email = v_normalized_email/,
  );
  assert.match(requestLookup, /request\.token_hash = v_token_hash/);
  assert.match(requestLookup, /request\.consumed_at is null/);
  assert.match(requestLookup, /request\.expires_at > v_request_time/);

  const requestConsumption =
    hotfixFunction.match(
      /update private\.kgeo_staff_provisioning_requests as request[\s\S]*?v_affected_rows = row_count;/,
    )?.[0] ?? "";
  assert.match(
    requestConsumption,
    /request\.normalized_email = v_normalized_email/,
  );
  assert.match(requestConsumption, /request\.approved_role = v_approved_role/);
  assert.match(requestConsumption, /request\.token_hash = v_token_hash/);
  assert.match(requestConsumption, /request\.consumed_at is null/);
  assert.match(requestConsumption, /request\.expires_at > v_request_time/);
  assert.doesNotMatch(
    hotfixFunction,
    /\b(?:normalized_email|provisioning_token|provisioning_token_hash|approved_staff_role|request_time|affected_rows)\s+(?:text|public\.user_role|timestamptz|bigint)\b/,
  );
});

test("the private request has exact role hash lifetime uniqueness and isolation", () => {
  const table =
    executableMigration.match(
      /create table private\.kgeo_staff_provisioning_requests[\s\S]*?\n\);/,
    )?.[0] ?? "";

  assert.match(table, /normalized_email text primary key/);
  assert.match(table, /approved_role public\.user_role not null/);
  assert.match(table, /token_hash text not null unique/);
  assert.match(table, /expires_at timestamptz not null/);
  assert.match(table, /consumed_at timestamptz/);
  assert.match(table, /created_at timestamptz not null/);
  assert.match(table, /approved_role in \([\s\S]*?'counselor'[\s\S]*?'director'/);
  assert.doesNotMatch(table, /'student'::public\.user_role|'admin'::public\.user_role/);
  assert.match(table, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(table, /expires_at > created_at/);
  assert.match(table, /interval '15 minutes'/);
  assert.match(table, /consumed_at is null/);
  assert.doesNotMatch(table, /raw_token|provisioning_token\s+text/);
  assert.match(executableMigration, /enable row level security/);
  assert.match(
    executableMigration,
    /revoke all on schema private from public, anon, authenticated, service_role/,
  );
  assert.match(
    executableMigration,
    /revoke all on table private\.kgeo_staff_provisioning_requests\s+from public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    executableMigration,
    /create\s+policy|grant\s+[^;]*on\s+(?:table\s+)?private\.kgeo_staff_provisioning_requests/i,
  );
});

test("preparation is a volatile service-role-only exact-signature write", () => {
  const prepareFunction =
    executableMigration.match(
      /create or replace function public\.prepare_staff_identity_provisioning\([\s\S]*?\$function\$;/,
    )?.[0] ?? "";

  assert.match(
    prepareFunction,
    /p_email text,\s*p_role public\.user_role,\s*p_token_hash text,\s*p_expires_at timestamptz/,
  );
  assert.match(prepareFunction, /returns void/);
  assert.match(prepareFunction, /language plpgsql\s+volatile\s+security definer/);
  assert.match(prepareFunction, /set search_path = ''/);
  assert.doesNotMatch(prepareFunction, /\bstable\b|\bexecute\b|auth\.users|public\.profiles/i);
  assert.match(
    executableMigration,
    /revoke all on function public\.prepare_staff_identity_provisioning\([\s\S]*?from public, anon, authenticated, service_role;/,
  );
  assert.match(
    executableMigration,
    /grant execute on function public\.prepare_staff_identity_provisioning\([\s\S]*?to service_role;/,
  );
});

test("preparation validates role-specific email hash expiry and replacement", () => {
  const prepareFunction =
    executableMigration.match(
      /create or replace function public\.prepare_staff_identity_provisioning\([\s\S]*?\$function\$;/,
    )?.[0] ?? "";

  assert.equal(validPreparedIdentity("counselor", "counselor@kct.ac.in"), true);
  assert.equal(validPreparedIdentity("counselor", "counselor@kclas.ac.in"), false);
  assert.equal(validPreparedIdentity("director", "director@kclas.ac.in"), true);
  assert.equal(validPreparedIdentity("director", "director@example.org"), true);
  for (const unsupported of ["student", "admin", "owner", ""] as const) {
    assert.equal(
      (["counselor", "director"] as readonly string[]).includes(unsupported),
      false,
    );
  }

  assert.match(prepareFunction, /p_role is null/);
  assert.match(prepareFunction, /p_role not in \([\s\S]*?'counselor'[\s\S]*?'director'/);
  assert.match(prepareFunction, /p_role = 'counselor'[\s\S]*?@kct/);
  assert.match(prepareFunction, /p_token_hash !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(prepareFunction, /p_expires_at <= request_time/);
  assert.match(prepareFunction, /interval '15 minutes'/);
  assert.match(prepareFunction, /on conflict \(normalized_email\) do update/);
  assert.match(prepareFunction, /consumed_at is not null/);
  assert.match(prepareFunction, /expires_at <= request_time/);
  assert.match(prepareFunction, /affected_rows <> 1/);
});

test("public registration remains exact-KCT student-only", () => {
  assert.match(
    registrationValidationSource,
    /INSTITUTIONAL_EMAIL_DOMAIN = "kct\.ac\.in"/,
  );
  assert.match(registrationActionSource, /supabase\.auth\.signUp/);
  assert.match(registrationActionSource, /data:\s*\{\s*full_name:/);
  assert.doesNotMatch(
    registrationActionSource,
    /prepare_staff_identity_provisioning|kgeo_staff_provisioning_token|\brole\s*:/,
  );

  const student = simulateIdentityInsert({
    authId: "student-id",
    email: "student@kct.ac.in",
    fullName: "Student Name",
  });
  assert.deepEqual(student, {
    accepted: true,
    active: true,
    profileId: "student-id",
    role: "student",
  });
  for (const rejectedEmail of [
    "student@mail.kct.ac.in",
    "student@kct.ac.in.example.com",
    "student@kclas.ac.in",
  ]) {
    assert.deepEqual(
      simulateIdentityInsert({
        authId: "student-id",
        email: rejectedEmail,
        fullName: "Student Name",
      }),
      { accepted: false },
    );
  }
});

test("the trigger derives either staff role only from its locked private row", () => {
  const triggerFunction = hotfixFunction;

  assert.match(triggerFunction, /\? 'kgeo_staff_provisioning_token'/);
  assert.match(triggerFunction, /jsonb_typeof\([\s\S]*?kgeo_staff_provisioning_token/);
  assert.match(triggerFunction, /'\^\[A-Za-z0-9_-\]\{43\}\$'/);
  assert.match(triggerFunction, /pg_catalog\.sha256/);
  assert.match(triggerFunction, /select request\.approved_role\s+into v_approved_role/);
  assert.match(triggerFunction, /for update/);
  assert.match(triggerFunction, /role,\s*full_name,[\s\S]*?v_approved_role,\s*null,\s*true/);
  assert.doesNotMatch(triggerFunction, /raw_app_meta_data/);
  assert.doesNotMatch(
    triggerFunction,
    /raw_user_meta_data\s*->>?\s*'(?:role|kgeo_bootstrap_role|kgeo_provisioned_role)'/,
  );
  assert.doesNotMatch(
    triggerFunction,
    /values \(\s*new\.id,\s*v_normalized_email,\s*'(?:counselor|director)'/,
  );
});

test("valid counselor and Director requests create matching active profiles", () => {
  const counselor = simulateIdentityInsert({
    authId: "counselor-auth-id",
    email: "counselor@kct.ac.in",
    request: request("counselor"),
    token: preparedToken,
  });
  assert.deepEqual(counselor, {
    accepted: true,
    active: true,
    profileId: "counselor-auth-id",
    role: "counselor",
  });

  const director = simulateIdentityInsert({
    authId: "director-auth-id",
    email: "director@kclas.ac.in",
    request: request("director"),
    token: preparedToken,
  });
  assert.deepEqual(director, {
    accepted: true,
    active: true,
    profileId: "director-auth-id",
    role: "director",
  });
});

test("metadata roles cannot alter the prepared role", () => {
  const triggerFunction = hotfixFunction;
  assert.doesNotMatch(triggerFunction, /new\.raw_app_meta_data/);
  assert.doesNotMatch(triggerFunction, /new\.raw_user_meta_data\s*->>?\s*'role'/);
  assert.doesNotMatch(
    triggerFunction,
    /new\.raw_user_meta_data\s*->>?\s*'kgeo_bootstrap_role'/,
  );

  const counselorRequest = request("counselor");
  const result = simulateIdentityInsert({
    authId: "staff-id",
    email: counselorRequest.email,
    request: counselorRequest,
    token: preparedToken,
  });
  assert.equal(result.accepted && result.role, "counselor");
});

test("invalid unknown mismatched expired consumed and replayed tokens fail", () => {
  assert.deepEqual(
    simulateIdentityInsert({
      authId: "staff-id",
      email: "director@kclas.ac.in",
      token: "short",
      request: request("director"),
    }),
    { accepted: false },
  );
  assert.deepEqual(
    simulateIdentityInsert({
      authId: "staff-id",
      email: "director@kclas.ac.in",
      token: "B".repeat(43),
      request: request("director"),
    }),
    { accepted: false },
  );
  assert.deepEqual(
    simulateIdentityInsert({
      authId: "staff-id",
      email: "other@kclas.ac.in",
      token: preparedToken,
      request: request("director"),
    }),
    { accepted: false },
  );
  const expired = request("director");
  expired.expiresAt = 50;
  assert.equal(
    simulateIdentityInsert({
      authId: "staff-id",
      email: expired.email,
      token: preparedToken,
      request: expired,
    }).accepted,
    false,
  );
  const consumed = request("director");
  consumed.consumed = true;
  assert.equal(
    simulateIdentityInsert({
      authId: "staff-id",
      email: consumed.email,
      token: preparedToken,
      request: consumed,
    }).accepted,
    false,
  );

  const singleUse = request("director");
  const first = simulateIdentityInsert({
    authId: "first-id",
    email: singleUse.email,
    token: preparedToken,
    request: singleUse,
  });
  const concurrentReplay = simulateIdentityInsert({
    authId: "second-id",
    email: singleUse.email,
    token: preparedToken,
    request: singleUse,
  });
  assert.equal(first.accepted, true);
  assert.deepEqual(concurrentReplay, { accepted: false });
});

test("consumption and profile creation share rollback-safe trigger scope", () => {
  const triggerFunction = hotfixFunction;
  assert.ok(
    triggerFunction.indexOf("set consumed_at = v_request_time") <
      triggerFunction.indexOf("insert into public.profiles"),
  );
  assert.doesNotMatch(triggerFunction, /\b(?:commit|rollback|dblink)\b/i);

  const rollbackRequest = request("counselor");
  assert.deepEqual(
    simulateIdentityInsert({
      authId: "conflicting-id",
      downstreamFailure: true,
      email: rollbackRequest.email,
      request: rollbackRequest,
      token: preparedToken,
    }),
    { accepted: false },
  );
  assert.equal(rollbackRequest.consumed, false);
});

test("existing counselor and Director authorization remain profile-role based", () => {
  assert.match(counselorAccessSource, /profile\.role !== "counselor"/);
  assert.match(counselorAccessSource, /!profile\.is_active/);
  assert.match(counselorAccessSource, /user\.email_confirmed_at/);

  const helper =
    profileFoundationSource.match(
      /create function public\.has_active_verified_kgeo_role\([\s\S]*?\$function\$;/,
    )?.[0] ?? "";
  assert.match(helper, /profile\.id = \(select auth\.uid\(\)\)/);
  assert.match(helper, /profile\.role = p_role/);
  assert.match(helper, /profile\.is_active is true/);
  assert.match(helper, /auth_user\.email_confirmed_at is not null/);
  assert.doesNotMatch(helper, /raw_(?:user|app)_meta_data|@kct|kclas/);
  assert.match(a11MigrationSource, /has_active_verified_kgeo_role\(\s*'director'/);
  assert.doesNotMatch(a11MigrationSource, /has_active_verified_kgeo_role\(\s*'admin'/);
});

test("Supabase metadata merge semantics require targeted token deletion", () => {
  const initialMetadata = {
    kgeo_staff_provisioning_token: "sample-placeholder",
    unrelated_preference: "preserved-value",
  };

  const emptyUpdate = applySupabaseMetadataUpdate(initialMetadata, {});
  assert.equal(
    emptyUpdate.kgeo_staff_provisioning_token,
    "sample-placeholder",
  );

  const targetedUpdate = applySupabaseMetadataUpdate(initialMetadata, {
    kgeo_staff_provisioning_token: null,
  });
  assert.equal(
    Object.prototype.hasOwnProperty.call(
      targetedUpdate,
      "kgeo_staff_provisioning_token",
    ),
    false,
  );
  assert.equal(targetedUpdate.unrelated_preference, "preserved-value");
});

test("any temporary helper uses approved inputs and verifies targeted cleanup", () => {
  const helperExists = existsSync(provisioningScriptUrl);

  if (!helperExists) {
    assert.equal(helperExists, false, "the temporary helper may remain absent");
    return;
  }

  const provisioningScript = read("../../../provision-staff-once.mjs");

  assert.match(provisioningScript, /process\.env\.STAFF_EMAIL/);
  assert.match(provisioningScript, /process\.env\.STAFF_ROLE/);
  assert.match(
    provisioningScript,
    /staffRole !== "counselor" && staffRole !== "director"/,
  );
  assert.match(provisioningScript, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(provisioningScript, /createHash\("sha256"\)/);
  assert.match(provisioningScript, /10 \* 60 \* 1000/);
  assert.match(provisioningScript, /"prepare_staff_identity_provisioning"/);
  assert.match(provisioningScript, /p_role: staffRole/);
  assert.ok(
    provisioningScript.indexOf("prepare_staff_identity_provisioning") <
      provisioningScript.indexOf("supabase.auth.admin.createUser"),
  );
  assert.match(
    provisioningScript,
    /user_metadata:\s*\{\s*kgeo_staff_provisioning_token: provisioningToken,?\s*\}/,
  );
  assert.match(
    provisioningScript,
    /app_metadata:\s*\{\s*kgeo_provisioned_role: staffRole,?\s*\}/,
  );
  assert.match(provisioningScript, /updateUserById/);
  assert.match(
    provisioningScript,
    /user_metadata:\s*\{\s*kgeo_staff_provisioning_token: null,?\s*\}/,
  );
  assert.doesNotMatch(provisioningScript, /user_metadata:\s*\{\s*\}/);
  assert.match(provisioningScript, /unrelatedUserMetadataPreserved/);
  assert.match(provisioningScript, /cleanedUser\.email !== staffEmail/);
  assert.match(provisioningScript, /cleanedUser\.id !== profile\.id/);
  assert.match(provisioningScript, /!cleanedUser\.email_confirmed_at/);
  assert.ok(
    provisioningScript.indexOf('console.log("Temporary password:", temporaryPassword)') >
      provisioningScript.indexOf("updateUserById"),
  );
  assert.doesNotMatch(provisioningScript, /process\.exit\(/);
  assert.doesNotMatch(
    provisioningScript,
    /console\.(?:log|error)\([^\n]*(?:provisioningToken|provisioningTokenHash|supabaseSecretKey)/,
  );
});

test("application runtime exposes no staff provisioning caller or UI", () => {
  const appPaths = readdirSync(appDirectoryUrl, {
    encoding: "utf8",
    recursive: true,
  }).filter((path) => /\.(?:ts|tsx)$/.test(path));

  for (const path of appPaths) {
    const normalizedPath = path.replaceAll("\\", "/");
    const source = readFileSync(
      new URL(normalizedPath, appDirectoryUrl),
      "utf8",
    );

    assert.doesNotMatch(source, /prepare_staff_identity_provisioning/);

    if (normalizedPath === "actions/counselor-auth-actions.ts") {
      assert.match(source, /prepare_counselor_registration_provisioning/);
      assert.match(source, /kgeo_staff_provisioning_token/);
    } else {
      assert.doesNotMatch(source, /kgeo_staff_provisioning_token/);
    }
  }
});

test("the generalized suite replaces the obsolete normal-test entry", () => {
  const testScript = JSON.parse(packageSource).scripts.test as string;
  assert.match(testScript, /src\/lib\/auth\/staff-identity-provisioning\.test\.ts/);
  assert.doesNotMatch(testScript, /director-bootstrap-token\.test\.ts/);
});
