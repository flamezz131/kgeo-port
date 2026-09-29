// K-GEO one-time legacy Counselor conversion.
//
// This owner-operated helper preserves the existing Auth user, password,
// profile, and Primary Counselor assignments. It adds the approved username
// mapping before changing the same Auth identity to the server-only technical
// email required by the frozen C1 login flow.

import { createHash } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

const { loadEnvConfig } = nextEnv;

const target = Object.freeze({
  userId: "eaaccd6a-9e05-46e4-bc59-60455f1da7f7",
  fullName: "Durga K",
  username: "durga",
  legacyEmailSha256:
    "4b41990e2ad6f2ee2c9993803c82495fbb2cbda25fc4618d49cc43d35c1aa097",
  approvedBy: "051329bd-c5bd-464e-ae4b-ee82916aa003",
  activeAssignmentCount: 2,
});

const confirmation = `CONVERT:${target.userId}:${target.username}`;
const counselorDomainPattern =
  /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const counselorUsernamePattern = /^[a-z0-9._-]{3,32}$/;
const reservedCounselorUsernames = new Set([
  "admin",
  "administrator",
  "director",
  "kgeo",
  "root",
  "student",
  "support",
  "system",
]);

let currentStage = "environment_validation";

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function normalizeEmail(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function sanitizeErrorText(value) {
  let text = String(value ?? "Unknown error").replace(/[\r\n]+/g, " ");

  for (const secret of [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ]) {
    if (secret) text = text.replaceAll(secret, "[redacted]");
  }

  return text
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/password\s*[:=]\s*[^\s,;]+/gi, "password=[redacted]")
    .slice(0, 500);
}

function getSafeError(error) {
  const record =
    typeof error === "object" && error !== null ? error : Object.create(null);

  return {
    name: sanitizeErrorText(
      error instanceof Error ? error.name : (record.name ?? "UnknownError"),
    ),
    status:
      typeof record.status === "string" || typeof record.status === "number"
        ? String(record.status)
        : "none",
    code:
      typeof record.code === "string" || typeof record.code === "number"
        ? String(record.code)
        : "none",
    message: sanitizeErrorText(
      error instanceof Error ? error.message : (record.message ?? error),
    ),
  };
}

function requireCondition(condition, message) {
  if (!condition) throw new Error(message);
}

function requireSuccessful(result, stage) {
  if (result.error) {
    currentStage = stage;
    throw result.error;
  }
  return result.data;
}

async function listAllAuthUsers(adminClient) {
  const users = [];

  for (let page = 1; page <= 20; page += 1) {
    const result = await adminClient.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    const pageUsers = requireSuccessful(result, "auth_user_inventory").users;
    users.push(...pageUsers);
    if (pageUsers.length < 1000) return users;
  }

  throw new Error("Auth user inventory exceeded the reviewed pagination limit.");
}

function assignmentSnapshot(assignments) {
  return assignments
    .map(
      (assignment) =>
        `${assignment.id}:${assignment.student_id}:${assignment.counselor_id}`,
    )
    .sort();
}

async function inspectState(adminClient, technicalEmail) {
  currentStage = "read_only_preflight";

  const [profileResult, accountResult, usernameResult, assignmentResult] =
    await Promise.all([
      adminClient
        .from("profiles")
        .select("id, full_name, college_email, role, is_active")
        .eq("id", target.userId)
        .maybeSingle(),
      adminClient
        .from("counselor_accounts")
        .select(
          "user_id, username, approval_status, approved_by, approved_at, rejected_by, rejected_at",
        )
        .eq("user_id", target.userId)
        .maybeSingle(),
      adminClient
        .from("counselor_accounts")
        .select("user_id, username")
        .eq("username", target.username),
      adminClient
        .from("student_counselor_assignments")
        .select("id, student_id, counselor_id, ended_at")
        .eq("counselor_id", target.userId)
        .is("ended_at", null),
    ]);

  const profile = requireSuccessful(profileResult, "profile_lookup");
  const account = requireSuccessful(accountResult, "counselor_account_lookup");
  const usernameRows = requireSuccessful(usernameResult, "username_lookup");
  const assignments = requireSuccessful(
    assignmentResult,
    "primary_assignment_lookup",
  );

  const [authUserResult, approverResult, authUsers] = await Promise.all([
    adminClient.auth.admin.getUserById(target.userId),
    adminClient.auth.admin.getUserById(target.approvedBy),
    listAllAuthUsers(adminClient),
  ]);
  const authUser = requireSuccessful(authUserResult, "auth_user_lookup").user;
  const approverUser = requireSuccessful(
    approverResult,
    "director_auth_lookup",
  ).user;

  const directorResult = await adminClient
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", target.approvedBy)
    .maybeSingle();
  const director = requireSuccessful(directorResult, "director_profile_lookup");

  const currentAuthEmail = normalizeEmail(authUser?.email);
  const isLegacyEmail = sha256(currentAuthEmail) === target.legacyEmailSha256;
  const isTechnicalEmail = currentAuthEmail === technicalEmail;
  const emailIdentityProviders = (authUser?.identities ?? []).map(
    (identity) => identity.provider,
  );
  const emailIdentityAddress = normalizeEmail(
    authUser?.identities?.[0]?.identity_data?.email,
  );
  const conflictingUsernameRows = usernameRows.filter(
    (row) => row.user_id !== target.userId,
  );
  const conflictingTechnicalUsers = authUsers.filter(
    (user) =>
      normalizeEmail(user.email) === technicalEmail && user.id !== target.userId,
  );

  requireCondition(profile?.id === target.userId, "Legacy profile is missing.");
  requireCondition(
    profile.full_name === target.fullName &&
      profile.role === "counselor" &&
      profile.is_active === true,
    "Legacy Counselor profile does not match the reviewed active state.",
  );
  requireCondition(
    sha256(normalizeEmail(profile.college_email)) === target.legacyEmailSha256,
    "Legacy profile contact email does not match the reviewed value.",
  );
  requireCondition(
    authUser?.id === target.userId && (isLegacyEmail || isTechnicalEmail),
    "Legacy Auth identity does not match the reviewed user and email state.",
  );
  requireCondition(
    Boolean(authUser.email_confirmed_at) &&
      emailIdentityProviders.length === 1 &&
      emailIdentityProviders[0] === "email" &&
      emailIdentityAddress === currentAuthEmail,
    "Legacy Auth identity is not one confirmed email/password identity.",
  );
  requireCondition(
    conflictingUsernameRows.length === 0,
    "The reviewed Counselor username is already assigned to another user.",
  );
  requireCondition(
    conflictingTechnicalUsers.length === 0,
    "The technical Counselor Auth email belongs to another user.",
  );
  requireCondition(
    director?.id === target.approvedBy &&
      director.role === "director" &&
      director.is_active === true &&
      approverUser?.id === target.approvedBy &&
      Boolean(approverUser.email_confirmed_at),
    "The reviewed approving Director is not active and verified.",
  );
  requireCondition(
    assignments.length === target.activeAssignmentCount &&
      assignments.every(
        (assignment) =>
          assignment.counselor_id === target.userId &&
          assignment.ended_at === null,
      ),
    "Active Primary Counselor assignments do not match the reviewed state.",
  );

  if (account) {
    requireCondition(
      account.user_id === target.userId &&
        account.username === target.username &&
        account.approval_status === "approved" &&
        account.approved_by === target.approvedBy &&
        typeof account.approved_at === "string" &&
        account.rejected_by === null &&
        account.rejected_at === null,
      "Existing Counselor account mapping does not match the reviewed conversion.",
    );
  }

  return {
    account,
    assignments,
    assignmentSnapshot: assignmentSnapshot(assignments),
    authEmailConverted: isTechnicalEmail,
  };
}

async function main() {
  loadEnvConfig(process.cwd());

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const counselorAuthDomain = normalizeEmail(
    process.env.K_GEO_COUNSELOR_AUTH_DOMAIN,
  );
  const mode = process.env.K_GEO_LEGACY_COUNSELOR_MODE ?? "preflight";

  requireCondition(Boolean(url), "NEXT_PUBLIC_SUPABASE_URL is required.");
  requireCondition(
    Boolean(serviceRoleKey),
    "SUPABASE_SERVICE_ROLE_KEY is required.",
  );
  requireCondition(
    counselorDomainPattern.test(counselorAuthDomain) &&
      counselorAuthDomain !== "kct.ac.in" &&
      counselorAuthDomain !== "kclas.ac.in",
    "K_GEO_COUNSELOR_AUTH_DOMAIN is invalid.",
  );
  requireCondition(
    counselorUsernamePattern.test(target.username) &&
      !reservedCounselorUsernames.has(target.username),
    "The reviewed Counselor username is invalid.",
  );
  requireCondition(
    mode === "preflight" || mode === "apply",
    "K_GEO_LEGACY_COUNSELOR_MODE must be preflight or apply.",
  );

  const adminClient = createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
  const technicalEmail = `${target.username}@${counselorAuthDomain}`;
  const before = await inspectState(adminClient, technicalEmail);

  console.log("[legacy counselor conversion]");
  console.log(`mode=${mode}`);
  console.log(`target_uuid_matches=${true}`);
  console.log(`profile_uuid_matches=${true}`);
  console.log("username_compatible=true");
  console.log(`active_primary_assignments=${before.assignments.length}`);
  console.log(`already_converted=${before.authEmailConverted}`);

  if (mode === "preflight") {
    console.log("preflight_passed=true");
    console.log("changes_applied=false");
    return;
  }

  requireCondition(
    process.env.K_GEO_CONFIRM_LEGACY_COUNSELOR_DURGA === confirmation,
    "Exact legacy Counselor conversion confirmation is required.",
  );

  if (!before.account) {
    currentStage = "approved_username_mapping";
    const changedAt = new Date().toISOString();
    const mappingResult = await adminClient
      .from("counselor_accounts")
      .insert({
        user_id: target.userId,
        username: target.username,
        approval_status: "approved",
        approved_by: target.approvedBy,
        approved_at: changedAt,
        rejected_by: null,
        rejected_at: null,
        created_at: changedAt,
        updated_at: changedAt,
      })
      .select("user_id, username, approval_status")
      .single();
    const mapping = requireSuccessful(
      mappingResult,
      "approved_username_mapping",
    );
    requireCondition(
      mapping.user_id === target.userId &&
        mapping.username === target.username &&
        mapping.approval_status === "approved",
      "Approved Counselor username mapping verification failed.",
    );
  }

  if (!before.authEmailConverted) {
    currentStage = "same_auth_user_email_update";
    const updateResult = await adminClient.auth.admin.updateUserById(
      target.userId,
      {
        email: technicalEmail,
        email_confirm: true,
      },
    );
    const updatedUser = requireSuccessful(
      updateResult,
      "same_auth_user_email_update",
    ).user;
    requireCondition(
      updatedUser?.id === target.userId &&
        normalizeEmail(updatedUser.email) === technicalEmail,
      "Same-user Auth email update verification failed.",
    );
  }

  currentStage = "post_conversion_verification";
  const after = await inspectState(adminClient, technicalEmail);
  requireCondition(
    after.authEmailConverted &&
      after.account !== null &&
      JSON.stringify(after.assignmentSnapshot) ===
        JSON.stringify(before.assignmentSnapshot),
    "Post-conversion identity or assignment verification failed.",
  );

  console.log("conversion_succeeded=true");
  console.log("same_auth_uuid=true");
  console.log("same_profile_uuid=true");
  console.log("password_changed=false");
  console.log("profile_contact_email_changed=false");
  console.log("primary_assignments_changed=false");
  console.log("new_auth_user_created=false");
}

main().catch((error) => {
  console.error("[legacy counselor conversion]");
  console.error(`stage=${currentStage}`);
  console.error(getSafeError(error));
  process.exitCode = 1;
});
