import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown,
) => unknown;

const { registerHooks } = require("node:module") as {
  registerHooks: (hooks: { resolve: ResolveHook }) => void;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/validation/full-name") {
      return {
        shortCircuit: true,
        url: new URL("../validation/full-name.ts", import.meta.url).href,
      };
    }
    if (specifier === "@/lib/validation/institutional-email") {
      return {
        shortCircuit: true,
        url: new URL("../validation/institutional-email.ts", import.meta.url)
          .href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { validateCounselorLogin, validateCounselorRegistration } = require(
  "../validation/auth.ts",
) as typeof import("../validation/auth");

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function sha256(relativePath: string): string {
  return createHash("sha256").update(read(relativePath)).digest("hex");
}

function registrationForm(overrides: Record<string, string> = {}): FormData {
  const values = {
    fullName: "Priya Kumar",
    username: "priya.kumar",
    password: "SecurePass123",
    confirmPassword: "SecurePass123",
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

const migrationSource = read(
  "../../../supabase/migrations/202608180002_counselor_registration_approval.sql",
);
const timingFixMigrationSource = read(
  "../../../supabase/migrations/202608200001_counselor_registration_insert_timing_fix.sql",
);
const triggerBaselineSource = read(
  "../../../supabase/migrations/202608070001_staff_provisioning_trigger_ambiguity_fix.sql",
);
const registrationActionSource = read(
  "../../app/actions/counselor-auth-actions.ts",
);
const directorActionSource = read(
  "../../app/actions/director-counselor-actions.ts",
);
const permissionsSource = read("../permissions/index.ts");
const pendingPageSource = read(
  "../../app/(public)/counselor/pending/page.tsx",
);
const registerPageSource = read(
  "../../app/(public)/counselor/register/page.tsx",
);
const registerFormSource = read(
  "../../components/auth/counselor-register-form.tsx",
);
const submitButtonSource = read("../../components/ui/submit-button.tsx");
const directorPageSource = read("../../app/director/counselors/page.tsx");
const directorListSource = read(
  "../../app/director/counselors/counselor-list.tsx",
);
const counselorLoginPageSource = read(
  "../../app/(public)/counselor/login/page.tsx",
);
const counselorLoginFormSource = read(
  "../../components/auth/counselor-login-form.tsx",
);
const studentLoginPageSource = read("../../app/(public)/login/page.tsx");
const studentLoginFormSource = read("../../components/auth/login-form.tsx");
const sessionProxySource = read("../supabase/proxy.ts");
const rootProxySource = read("../../proxy.ts");
const legacyConversionSource = read(
  "../../../supabase/operations/202608250001_convert_legacy_counselor_durga.mjs",
);
const adminClientSource = read("../supabase/admin.ts");
const browserEnvSource = read("../supabase/env.ts");

test("valid counselor usernames are accepted and normalized lowercase", () => {
  for (const username of ["arun", "arun.kumar", "counselor01", "priya_s"]) {
    const result = validateCounselorRegistration(
      registrationForm({ username: `  ${username.toUpperCase()}  ` }),
    );
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.username, username);
  }
});

test("invalid and reserved counselor usernames are rejected", () => {
  for (const username of [
    "ab",
    "has space",
    "bad@email",
    "x".repeat(33),
    "admin",
    "director",
    "system",
  ]) {
    assert.equal(
      validateCounselorRegistration(registrationForm({ username })).success,
      false,
      username,
    );
  }
});

test("password confirmation and duplicated browser fields fail closed", () => {
  assert.equal(
    validateCounselorRegistration(
      registrationForm({ confirmPassword: "DifferentPass123" }),
    ).success,
    false,
  );
  const duplicateForm = registrationForm();
  duplicateForm.append("username", "another-name");
  assert.equal(validateCounselorRegistration(duplicateForm).success, false);
});

test("counselor login uses the same normalized username grammar", () => {
  const valid = new FormData();
  valid.set("username", "  PRIYA.KUMAR  ");
  valid.set("password", "SecurePass123");
  const result = validateCounselorLogin(valid);
  assert.deepEqual(result, {
    success: true,
    data: { username: "priya.kumar", password: "SecurePass123" },
  });

  const invalid = new FormData();
  invalid.set("username", "bad username");
  invalid.set("password", "SecurePass123");
  assert.equal(validateCounselorLogin(invalid).success, false);
});

test("database enforces normalized case-insensitive unique usernames", () => {
  assert.match(
    migrationSource,
    /username text not null[\s\S]*counselor_accounts_username_key unique/,
  );
  assert.match(
    migrationSource,
    /username = pg_catalog\.lower\(pg_catalog\.btrim\(username\)\)/,
  );
  assert.match(migrationSource, /username ~ '\^\[a-z0-9\._-\]\{3,32\}\$'/);
});

test("counselor_accounts stores approval state but no password material", () => {
  const tableDefinition = migrationSource.match(
    /create table public\.counselor_accounts \([\s\S]*?\n\);/,
  )?.[0];
  assert.ok(tableDefinition);
  assert.doesNotMatch(
    tableDefinition,
    /password|password_hash|temporary_password/i,
  );
  assert.match(tableDefinition, /approval_status[\s\S]*default 'pending'/);
  assert.match(migrationSource, /revoke all on table[\s\S]*authenticated/);
  assert.doesNotMatch(migrationSource, /grant (?:insert|update|delete)/i);
});

test("timing fix is one forward transaction and preserves the applied migration", () => {
  assert.match(timingFixMigrationSource, /^--[\s\S]*?\nbegin;/);
  assert.match(timingFixMigrationSource, /commit;\s*$/);
  assert.equal(
    sha256(
      "../../../supabase/migrations/202608180002_counselor_registration_approval.sql",
    ),
    "74eef63ccd6af184685d140824b100df4d98aaa1d8f4f88d460da1b9adb38792",
  );
});

test("registration requests are private, hashed, short-lived, and credential-free", () => {
  const tableDefinition = timingFixMigrationSource.match(
    /create table private\.kgeo_counselor_registration_requests \([\s\S]*?\n\);/,
  )?.[0];
  assert.ok(tableDefinition);
  assert.match(tableDefinition, /token_hash text not null unique/);
  assert.match(tableDefinition, /token_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(tableDefinition, /expires_at > created_at/);
  assert.match(tableDefinition, /interval '15 minutes'/);
  assert.match(tableDefinition, /consumed_at is null or consumed_at >= created_at/);
  assert.doesNotMatch(tableDefinition, /password|raw_token|service_role_key/i);
  assert.match(
    timingFixMigrationSource,
    /alter table private\.kgeo_counselor_registration_requests owner to postgres/,
  );
  assert.match(
    timingFixMigrationSource,
    /enable row level security;[\s\S]*revoke all on table private\.kgeo_counselor_registration_requests[\s\S]*public, anon, authenticated, service_role/,
  );
  assert.doesNotMatch(
    timingFixMigrationSource,
    /grant (?:select|insert|update|delete|truncate|references|trigger) on table private\.kgeo_counselor_registration_requests/i,
  );
});

test("only service_role can prepare a counselor registration request", () => {
  const preparationFunction = timingFixMigrationSource.match(
    /create or replace function public\.prepare_counselor_registration_provisioning[\s\S]*?\$function\$;/,
  )?.[0];
  assert.ok(preparationFunction);
  assert.match(preparationFunction, /security definer/);
  assert.match(preparationFunction, /set search_path = ''/);
  assert.match(preparationFunction, /p_token_hash !~ '\^\[0-9a-f\]\{64\}\$'/);
  assert.match(preparationFunction, /p_expires_at <= v_request_time/);
  assert.match(preparationFunction, /interval '15 minutes'/);
  assert.match(preparationFunction, /split_part\(p_email, '@', 1\) <> p_username/);
  assert.match(
    timingFixMigrationSource,
    /revoke all on function public\.prepare_counselor_registration_provisioning\([\s\S]*?\) from public, anon, authenticated, service_role;/,
  );
  assert.match(
    timingFixMigrationSource,
    /grant execute on function public\.prepare_counselor_registration_provisioning\([\s\S]*?\) to service_role;/,
  );
});

test("malformed, expired, consumed, wrong-email, and replayed tokens fail closed", () => {
  const triggerSource = timingFixMigrationSource.match(
    /create or replace function public\.handle_new_user\(\)[\s\S]*?\$function\$;/,
  )?.[0];
  assert.ok(triggerSource);
  assert.match(triggerSource, /v_provisioning_token !~ '\^\[A-Za-z0-9_-\]\{43\}\$'/);
  assert.match(triggerSource, /request\.normalized_email = v_normalized_email/);
  assert.match(triggerSource, /request\.token_hash = v_token_hash/);
  assert.match(triggerSource, /request\.consumed_at is null/);
  assert.match(triggerSource, /request\.expires_at > v_request_time/);
  assert.match(
    triggerSource,
    /update private\.kgeo_counselor_registration_requests as request[\s\S]*request\.consumed_at is null[\s\S]*request\.expires_at > v_request_time[\s\S]*get diagnostics v_affected_rows = row_count[\s\S]*v_affected_rows <> 1/,
  );
});

test("trusted registration identity is exact and creates one pending inactive counselor", () => {
  const triggerSource = timingFixMigrationSource.match(
    /create or replace function public\.handle_new_user\(\)[\s\S]*?\$function\$;/,
  )?.[0];
  assert.ok(triggerSource);
  assert.match(
    triggerSource,
    /split_part\(v_normalized_email, '@', 1\) <>[\s\S]*v_normalized_username/,
  );
  for (const reserved of ["admin", "director", "root", "system"]) {
    assert.match(triggerSource, new RegExp(`'${reserved}'`));
  }
  assert.match(
    triggerSource,
    /insert into public\.profiles[\s\S]*'counselor'::public\.user_role,[\s\S]*v_normalized_full_name,[\s\S]*false/,
  );
  assert.match(
    triggerSource,
    /insert into public\.counselor_accounts[\s\S]*v_normalized_username,[\s\S]*'pending'::public\.counselor_approval_status/,
  );
});

test("counselor identity transport fields are present, strings, and exact", () => {
  const triggerSource = timingFixMigrationSource.match(
    /create or replace function public\.handle_new_user\(\)[\s\S]*?\$function\$;/,
  )?.[0];
  assert.ok(triggerSource);
  assert.match(
    triggerSource,
    /not \(\s*coalesce\(new\.raw_user_meta_data, '\{\}'::jsonb\)\s*\? 'kgeo_counselor_full_name'\s*\)/,
  );
  assert.match(
    triggerSource,
    /not \(\s*coalesce\(new\.raw_user_meta_data, '\{\}'::jsonb\)\s*\? 'kgeo_counselor_username'\s*\)/,
  );
  assert.match(
    triggerSource,
    /jsonb_typeof\(\s*new\.raw_user_meta_data -> 'kgeo_counselor_full_name'\s*\) is distinct from 'string'/,
  );
  assert.match(
    triggerSource,
    /jsonb_typeof\(\s*new\.raw_user_meta_data -> 'kgeo_counselor_username'\s*\) is distinct from 'string'/,
  );
  assert.match(
    triggerSource,
    /new\.raw_user_meta_data ->> 'kgeo_counselor_full_name'[\s\S]*<> v_normalized_full_name/,
  );
  assert.match(
    triggerSource,
    /new\.raw_user_meta_data ->> 'kgeo_counselor_username'[\s\S]*<> v_normalized_username/,
  );

  const validTransport = (metadata: Record<string, unknown>): boolean =>
    typeof metadata.kgeo_counselor_full_name === "string" &&
    typeof metadata.kgeo_counselor_username === "string" &&
    metadata.kgeo_counselor_full_name === "Counselor A" &&
    metadata.kgeo_counselor_username === "counselor.a";

  assert.equal(validTransport({ kgeo_counselor_username: "counselor.a" }), false);
  assert.equal(validTransport({ kgeo_counselor_full_name: "Counselor A" }), false);
  assert.equal(
    validTransport({
      kgeo_counselor_full_name: null,
      kgeo_counselor_username: "counselor.a",
    }),
    false,
  );
  assert.equal(
    validTransport({
      kgeo_counselor_full_name: "Counselor A",
      kgeo_counselor_username: null,
    }),
    false,
  );
  assert.equal(
    validTransport({
      kgeo_counselor_full_name: 1,
      kgeo_counselor_username: ["counselor.a"],
    }),
    false,
  );
  assert.equal(
    validTransport({
      kgeo_counselor_full_name: "Different Name",
      kgeo_counselor_username: "counselor.a",
    }),
    false,
  );
  assert.equal(
    validTransport({
      kgeo_counselor_full_name: "Counselor A",
      kgeo_counselor_username: "different",
    }),
    false,
  );
  assert.equal(
    validTransport({
      kgeo_counselor_full_name: "Counselor A",
      kgeo_counselor_username: "counselor.a",
    }),
    true,
  );
});

test("trusted counselor registration uses a locked private request and fails closed", () => {
  const triggerSource = timingFixMigrationSource.match(
    /create or replace function public\.handle_new_user\(\)[\s\S]*?\$function\$;/,
  )?.[0];
  assert.ok(triggerSource);
  assert.doesNotMatch(triggerSource, /raw_app_meta_data/);
  assert.match(triggerSource, /kgeo_staff_provisioning_token/);
  assert.match(
    triggerSource,
    /from private\.kgeo_counselor_registration_requests as request[\s\S]*for update/,
  );
  assert.match(triggerSource, /request\.normalized_email = v_normalized_email/);
  assert.match(triggerSource, /request\.token_hash = v_token_hash/);
  assert.match(triggerSource, /request\.consumed_at is null/);
  assert.match(triggerSource, /request\.expires_at > v_request_time/);
  assert.match(triggerSource, /'counselor'::public\.user_role/);
  assert.match(triggerSource, /v_normalized_full_name,[\s\S]*false/);
  assert.match(triggerSource, /'pending'::public\.counselor_approval_status/);
});

test("public user metadata cannot select a staff role or active state", () => {
  const createUserPayload = registrationActionSource.match(
    /auth\.admin\.createUser\(\{[\s\S]*?\n    \}\);/,
  )?.[0];
  assert.ok(createUserPayload);
  assert.match(createUserPayload, /user_metadata:\s*\{/);
  assert.match(createUserPayload, /kgeo_staff_provisioning_token/);
  assert.doesNotMatch(createUserPayload, /app_metadata|\brole\s*:|approval_status/);
  assert.doesNotMatch(
    timingFixMigrationSource,
    /raw_user_meta_data\s*->>\s*'(?:role|is_active|is_counselor_registration)'/,
  );
});

test("server registration creates, verifies, signs in, and cleans up failures", () => {
  assert.match(registrationActionSource, /auth\.admin\.createUser/);
  assert.match(registrationActionSource, /email_confirm:\s*true/);
  assert.match(
    registrationActionSource,
    /prepare_counselor_registration_provisioning/,
  );
  assert.match(registrationActionSource, /randomBytes\(32\)\.toString\("base64url"\)/);
  assert.match(registrationActionSource, /createHash\("sha256"\)/);
  assert.match(registrationActionSource, /10 \* 60 \* 1000/);
  assert.match(registrationActionSource, /auth\.admin\.updateUserById/);
  assert.match(
    registrationActionSource,
    /kgeo_staff_provisioning_token:\s*null/,
  );
  assert.match(registrationActionSource, /approval_status !== "pending"/);
  assert.match(registrationActionSource, /auth\.admin\.deleteUser\(createdUserId\)/);
  assert.match(registrationActionSource, /redirect\("\/counselor\/pending"\)/);

  const registrationFunction = registrationActionSource.match(
    /export async function registerCounselor[\s\S]*?\n\}\n\nexport async function loginCounselor/,
  )?.[0];
  assert.ok(registrationFunction);
  assert.ok(
    registrationFunction.lastIndexOf('redirect("/counselor/pending")') >
      registrationFunction.lastIndexOf("} catch (error)"),
    "the success redirect must remain outside the error-catching block",
  );
});

test("registration diagnostics are server-only, development-only, and sanitized", () => {
  assert.match(registrationActionSource, /import "server-only"/);
  assert.match(
    registrationActionSource,
    /process\.env\.NODE_ENV !== "development"/,
  );
  assert.match(registrationActionSource, /\[C1 counselor registration\]/);
  assert.match(registrationActionSource, /stage: "admin_create_user_started"/);
  assert.match(registrationActionSource, /stage: "profile_verification"/);
  assert.match(
    registrationActionSource,
    /stage: "counselor_account_verification"/,
  );
  assert.match(registrationActionSource, /stage: "pending_session_creation"/);
  assert.match(registrationActionSource, /stage: "redirect"/);
  assert.match(registrationActionSource, /Bearer \[redacted\]/);
  assert.match(registrationActionSource, /error_status/);
  assert.match(registrationActionSource, /cause_name/);
  assert.match(registrationActionSource, /cause_code/);
  assert.match(registrationActionSource, /cause_message/);
  assert.doesNotMatch(
    registrationActionSource,
    /console\.error\([^\n]*(?:password|SUPABASE_SERVICE_ROLE_KEY|NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)/,
  );
  assert.doesNotMatch(
    registrationActionSource,
    /logCounselorRegistration\(\{[\s\S]{0,180}(?:provisioningToken|provisioningTokenHash|password)/,
  );
});

test("registration returns no technical email or provisioning token to the browser", () => {
  assert.match(
    registrationActionSource,
    /return \{\s*status: "error",\s*message: genericRegistrationError,?\s*\}/,
  );
  assert.doesNotMatch(
    registrationActionSource,
    /return \{\s*status: "error",\s*(?:message|errors):\s*(?:technicalEmail|provisioningToken|provisioningTokenHash|serviceRoleKey)/,
  );
});

test("service-role credential is isolated from browser-importable environment code", () => {
  assert.match(adminClientSource, /import "server-only"/);
  assert.match(adminClientSource, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(browserEnvSource, /SERVICE_ROLE|serviceRole/i);
  assert.doesNotMatch(adminClientSource, /NEXT_PUBLIC_SUPABASE_SERVICE/);
});

test("pending counselors can view only their own pending state", () => {
  assert.match(pendingPageSource, /supabase\.auth\.getUser\(\)/);
  assert.match(pendingPageSource, /\.eq\("user_id", user\.id\)/);
  assert.match(pendingPageSource, /approval_status === "approved"/);
  assert.match(pendingPageSource, /redirect\("\/counselor\/dashboard"\)/);
  assert.match(
    pendingPageSource,
    /Your counselor account has been created successfully and is awaiting[\s\S]*Director approval\./,
  );
  assert.match(pendingPageSource, /Registration Submitted/);
  assert.match(
    pendingPageSource,
    /Once approved, you can access the Counselor Portal using your username[\s\S]*and password\./,
  );
  assert.match(pendingPageSource, /Counselor username:/);
  assert.match(pendingPageSource, /account\.username/);
  assert.match(
    pendingPageSource,
    /approval_status !== "pending" \|\| profile\.is_active/,
  );
  assert.match(pendingPageSource, /status=rejected/);
  assert.doesNotMatch(
    pendingPageSource,
    /college_email|technicalEmail|kgeo_staff_provisioning_token/,
  );
  assert.doesNotMatch(pendingPageSource, /\{user\.id\}/);
});

test("successful counselor registration cannot remain on the registration form", () => {
  assert.match(registerFormSource, /useActionState\(\s*registerCounselor/);
  assert.match(submitButtonSource, /disabled=\{pending\}/);
  assert.match(
    registerPageSource,
    /approval_status === "pending" && !profile\.is_active[\s\S]*redirect\("\/counselor\/pending"\)/,
  );
  assert.match(
    registerPageSource,
    /approval_status === "approved" && profile\.is_active[\s\S]*redirect\("\/counselor\/dashboard"\)/,
  );
  assert.match(registerPageSource, /status=rejected/);
});

test("working Counselor routes require approved and active account state", () => {
  assert.match(permissionsSource, /\.from\("counselor_accounts"\)/);
  assert.match(permissionsSource, /getCounselorAccessDecision/);
  assert.match(permissionsSource, /redirect\("\/counselor\/pending"\)/);
  assert.match(permissionsSource, /redirect\("\/counselor\/login"\)/);
});

test("counselor login treats unknown username and wrong password identically", () => {
  assert.match(
    registrationActionSource,
    /const genericLoginError = "Invalid username or password\."/,
  );
  assert.ok(
    (registrationActionSource.match(/message: genericLoginError/g)?.length ??
      0) >= 3,
  );
});

test("Counselor login route is public and renders its role-specific form", () => {
  // The staff auth screens render through the shared AuthCard, which owns the
  // <h1>; the role-specific heading text is what this route must still supply.
  assert.match(counselorLoginPageSource, /title="Counselor Login"/);
  assert.match(counselorLoginPageSource, /<CounselorLoginForm \/>/);
  assert.match(counselorLoginFormSource, /name="username"/);
  assert.match(counselorLoginFormSource, /name="password"/);
  assert.doesNotMatch(counselorLoginFormSource, /name="email"/);
  assert.match(rootProxySource, /"\/counselor\/:path\*"/);
  assert.match(
    sessionProxySource,
    /publicStaffAuthPaths = new Set\(\[\s*"\/counselor\/login",\s*"\/counselor\/register"/,
  );
  assert.ok(
    sessionProxySource.indexOf("publicStaffAuthPaths.has(pathname)") <
      sessionProxySource.indexOf("supabase.auth.getClaims()"),
    "public staff auth routes must bypass session enforcement",
  );
});

test("protected Counselor routes fall back only to Counselor login", () => {
  assert.match(
    sessionProxySource,
    /pathname\.startsWith\("\/counselor\/"\)[\s\S]*\? "\/counselor\/login"[\s\S]*: "\/login"/,
  );
  assert.doesNotMatch(
    registrationActionSource.match(
      /export async function loginCounselor[\s\S]*$/,
    )?.[0] ?? "",
    /\/student\/dashboard/,
  );
  assert.match(
    registrationActionSource,
    /account\.approval_status === "approved"[\s\S]*profile\.is_active[\s\S]*redirect\("\/counselor\/dashboard"\)/,
  );
});

test("Student login remains a separate email and password flow", () => {
  assert.match(studentLoginPageSource, /<LoginForm \/>/);
  assert.match(studentLoginFormSource, /name="email"/);
  assert.match(studentLoginFormSource, /type="email"/);
  assert.match(studentLoginFormSource, /name="password"/);
  assert.doesNotMatch(studentLoginFormSource, /name="username"/);
  assert.match(sessionProxySource, /: "\/login"/);
});

test("Durga conversion and frozen C1 username mapping remain unchanged", () => {
  assert.match(
    registrationActionSource,
    /technicalEmail = `\$\{validation\.data\.username\}@\$\{getCounselorAuthDomain\(\)\}`/,
  );
  assert.match(
    registrationActionSource,
    /validateCounselorLogin\(formData\)[\s\S]*signInWithPassword\(\{\s*email: technicalEmail/,
  );
  assert.equal(
    createHash("sha256").update(legacyConversionSource).digest("hex"),
    "f5448310d5f8170d582e5ea328923f5c0a08bc96f0557d156771f0a42b2c40d9",
  );
});

test("Student and Director sessions are cleared if presented to Counselor Portal", () => {
  assert.match(registrationActionSource, /profile\.role !== "counselor"/);
  assert.match(
    registrationActionSource,
    /supabase\.auth\.signOut\(\{ scope: "local" \}\)/,
  );
});

test("Director list is bounded, safe, and does not expose technical emails", () => {
  assert.match(migrationSource, /list_director_counselor_accounts/);
  assert.match(migrationSource, /limit 500/);
  assert.doesNotMatch(
    migrationSource.match(
      /create or replace function public\.list_director_counselor_accounts[\s\S]*?\$function\$;/,
    )?.[0] ?? "",
    /college_email/,
  );
  assert.match(directorPageSource, /list_director_counselor_accounts/);
  assert.doesNotMatch(directorPageSource, /college_email|technicalEmail/);
});

test("Director management renders pending, approved, and rejected or inactive states", () => {
  assert.match(directorListSource, /Pending Counselors/);
  assert.match(directorListSource, /Approved Counselors/);
  assert.match(directorListSource, /Rejected \/ Inactive/);
  assert.match(directorListSource, /Approve/);
  assert.match(directorListSource, /Reject/);
  assert.match(directorListSource, /window\.confirm/);
  assert.match(directorListSource, /form-success/);
});

test("only an active verified Director may list or transition counselors", () => {
  for (const functionName of [
    "list_director_counselor_accounts",
    "approve_counselor",
    "reject_counselor",
  ]) {
    const functionSource = migrationSource.match(
      new RegExp(
        `create or replace function public\\.${functionName}[\\s\\S]*?\\$function\\$;`,
      ),
    )?.[0];
    assert.ok(functionSource, functionName);
    assert.match(functionSource, /has_active_verified_kgeo_role/);
    assert.match(functionSource, /'director'::public\.user_role/);
    assert.match(functionSource, /errcode = '42501'/);
  }
  assert.match(directorActionSource, /await requireDirector\(\)/);
});

test("approval and rejection lock exact pending inactive counselors atomically", () => {
  const approvalSource = migrationSource.match(
    /create or replace function public\.approve_counselor[\s\S]*?\$function\$;/,
  )?.[0];
  const rejectionSource = migrationSource.match(
    /create or replace function public\.reject_counselor[\s\S]*?\$function\$;/,
  )?.[0];
  assert.ok(approvalSource);
  assert.ok(rejectionSource);
  for (const source of [approvalSource, rejectionSource]) {
    assert.match(source, /for update of account, profile/);
    assert.match(source, /'pending'::public\.counselor_approval_status/);
    assert.match(source, /v_profile_is_active/);
    assert.match(source, /get diagnostics v_affected_rows = row_count/);
  }
  assert.match(approvalSource, /approval_status = 'approved'/);
  assert.match(approvalSource, /is_active = true/);
  assert.match(rejectionSource, /approval_status = 'rejected'/);
  assert.match(rejectionSource, /is_active = false/);
});

test("two counselor registrations retain their distinct Auth UUIDs", () => {
  const counselorBranch = timingFixMigrationSource.match(
    /if found then[\s\S]*?insert into public\.counselor_accounts[\s\S]*?return new;\n    end if;/,
  )?.[0];
  assert.ok(counselorBranch);
  assert.equal(counselorBranch.match(/new\.id/g)?.length, 2);
  assert.match(counselorBranch, /insert into public\.profiles/);
  assert.match(counselorBranch, /insert into public\.counselor_accounts/);
});

test("exact @kct.ac.in Student registration remains the final public branch", () => {
  assert.match(
    timingFixMigrationSource,
    /v_normalized_email !~ '\^\[\^@\[:space:\]\]\+@kct\[\.\]ac\[\.\]in\$'/,
  );
  assert.match(
    timingFixMigrationSource,
    /'student'::public\.user_role,[\s\S]*v_normalized_full_name,[\s\S]*true/,
  );
  assert.match(
    timingFixMigrationSource,
    /K-GEO requires a valid @kct\.ac\.in email/,
  );
});

test("existing private staff token and Director provisioning contract is preserved", () => {
  for (const fragment of [
    "kgeo_staff_provisioning_token",
    "private.kgeo_staff_provisioning_requests as request",
    "request.normalized_email = v_normalized_email",
    "request.consumed_at is null",
    "request.expires_at > v_request_time",
    "'director'::public.user_role",
  ]) {
    assert.ok(timingFixMigrationSource.includes(fragment), fragment);
    assert.ok(triggerBaselineSource.includes(fragment), fragment);
  }
  assert.match(
    timingFixMigrationSource,
    /v_approved_role,[\s\S]*null,[\s\S]*true/,
  );
});

test("Director portal is institutional login only with no public registration", () => {
  const directorLoginPage = read(
    "../../app/(public)/director/login/page.tsx",
  );
  const directorLoginForm = read(
    "../../components/auth/director-login-form.tsx",
  );
  const directorLoginAction = read("../../app/actions/director-auth-actions.ts");
  assert.match(`${directorLoginPage}\n${directorLoginForm}`, /@kclas\.ac\.in/);
  assert.doesNotMatch(directorLoginPage, /href=["'][^"']*register/i);
  assert.match(directorLoginAction, /profile\.role !== "director"/);
  assert.match(directorLoginAction, /redirect\("\/director\/dashboard"\)/);
  assert.match(permissionsSource, /redirect\("\/director\/login"\)/);
});

test("existing counselor workload oversight remains on Director counselor page", () => {
  assert.match(directorPageSource, /DirectorCounselorsOversight/);
  assert.match(directorPageSource, /loadDirectorCounselors/);
});

test("already-applied A1.4.2B and outcome migrations remain byte-for-byte unchanged", () => {
  assert.equal(
    sha256(
      "../../../supabase/migrations/202608130001_primary_counselor_storage_authorization_helpers.sql",
    ),
    "420721812ead7f7c357836c396542c2ad6f3bad5707b94124f591689003808b3",
  );
  assert.equal(
    sha256(
      "../../../supabase/migrations/202608130002_primary_counselor_case_ownership_enforcement.sql",
    ),
    "6cb85edd3ab1bb93ddd6ee426cba9f14502e0d1a25859fcbd993f41596d05405",
  );
  assert.equal(
    sha256(
      "../../../supabase/migrations/202608180001_record_consultation_outcome_acl_alignment.sql",
    ),
    "1245ba55bf5cf3357f355e1bf997b12dfa86a1ac86f4469be0760e558f12e5fb",
  );
});
