import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const operationPath =
  "supabase/operations/202608250001_convert_legacy_counselor_durga.mjs";
const operation = readFileSync(operationPath, "utf8");
const authActions = readFileSync(
  "src/app/actions/counselor-auth-actions.ts",
  "utf8",
);
const counselorAccess = readFileSync(
  "src/lib/permissions/counselor-access.ts",
  "utf8",
);

test("legacy conversion targets the reviewed Durga identity exactly", () => {
  assert.match(
    operation,
    /userId: "eaaccd6a-9e05-46e4-bc59-60455f1da7f7"/,
  );
  assert.match(operation, /fullName: "Durga K"/);
  assert.match(operation, /username: "durga"/);
  assert.match(operation, /activeAssignmentCount: 2/);
  assert.match(operation, /counselorUsernamePattern = \/\^\[a-z0-9\._-\]\{3,32\}\$\//);
  assert.match(
    operation,
    /!reservedCounselorUsernames\.has\(target\.username\)/,
  );
  assert.match(
    operation,
    /K_GEO_CONFIRM_LEGACY_COUNSELOR_DURGA === confirmation/,
  );
});

test("conversion updates the same Auth user without creating an identity", () => {
  assert.match(
    operation,
    /auth\.admin\.updateUserById\(\s*target\.userId,\s*\{\s*email: technicalEmail,\s*email_confirm: true/,
  );
  assert.doesNotMatch(operation, /auth\.admin\.createUser/);
  assert.doesNotMatch(operation, /auth\.admin\.deleteUser/);
  assert.doesNotMatch(operation, /\bpassword\s*:/);
});

test("username uses the frozen C1 technical Auth email mapping", () => {
  assert.match(
    operation,
    /technicalEmail = `\$\{target\.username\}@\$\{counselorAuthDomain\}`/,
  );
  assert.match(
    authActions,
    /technicalEmail = `\$\{validation\.data\.username\}@\$\{getCounselorAuthDomain\(\)\}`/,
  );
  assert.match(
    authActions,
    /signInWithPassword\(\{\s*email: technicalEmail,\s*password: validation\.data\.password/,
  );
});

test("legacy authorized Counselor receives an approved active mapping", () => {
  assert.match(
    operation,
    /approval_status: "approved",[\s\S]*approved_by: target\.approvedBy,[\s\S]*approved_at: changedAt/,
  );
  assert.doesNotMatch(operation, /approval_status: "pending"/);
  assert.match(
    counselorAccess,
    /profile\.role !== "counselor"[\s\S]*!profile\.is_active[\s\S]*account\.approval_status !== "approved"/,
  );
});

test("profile identity and contact fields are inspected but never mutated", () => {
  assert.match(
    operation,
    /\.from\("profiles"\)[\s\S]*\.select\("id, full_name, college_email, role, is_active"\)/,
  );
  assert.doesNotMatch(
    operation,
    /\.from\("profiles"\)[\s\S]{0,160}\.(?:insert|update|upsert|delete)\(/,
  );
  assert.match(operation, /profile_contact_email_changed=false/);
});

test("Primary Counselor assignments are snapshotted and remain read-only", () => {
  assert.match(
    operation,
    /\.from\("student_counselor_assignments"\)[\s\S]*\.eq\("counselor_id", target\.userId\)[\s\S]*\.is\("ended_at", null\)/,
  );
  assert.match(
    operation,
    /JSON\.stringify\(after\.assignmentSnapshot\) ===[\s\S]*JSON\.stringify\(before\.assignmentSnapshot\)/,
  );
  assert.doesNotMatch(
    operation,
    /\.from\("student_counselor_assignments"\)[\s\S]{0,220}\.(?:insert|update|upsert|delete)\(/,
  );
  assert.match(operation, /primary_assignments_changed=false/);
});

test("conversion fails closed on username email approver or identity drift", () => {
  assert.match(operation, /conflictingUsernameRows\.length === 0/);
  assert.match(operation, /conflictingTechnicalUsers\.length === 0/);
  assert.match(
    operation,
    /director\.role === "director" &&\s*director\.is_active === true/,
  );
  assert.match(
    operation,
    /emailIdentityProviders\.length === 1 &&\s*emailIdentityProviders\[0\] === "email"/,
  );
  assert.match(operation, /mode === "preflight" \|\| mode === "apply"/);
});

test("operation is secret-safe and never executes SQL", () => {
  assert.doesNotMatch(operation, /console\.(?:log|error)\([^\n]*(?:serviceRoleKey|SUPABASE_SERVICE_ROLE_KEY)/);
  assert.doesNotMatch(operation, /Authorization|Bearer \$\{|request headers/i);
  assert.doesNotMatch(
    operation,
    /\b(?:create|alter|drop|insert into|update public|delete from)\s+(?:auth|public|private)\./i,
  );
  assert.doesNotMatch(operation, /process\.exit\(/);
});
