"use server";

import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { getCounselorAuthDomain } from "@/lib/env/counselor-auth-domain";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  validateCounselorLogin,
  validateCounselorRegistration,
} from "@/lib/validation/auth";
import type { ActionState } from "@/types";

const genericRegistrationError =
  "We could not create your counselor account. Please try again shortly.";
const genericLoginError = "Invalid username or password.";

type CounselorRegistrationStage =
  | "validation_successful"
  | "technical_email_generation"
  | "technical_email_generated"
  | "admin_client_creation"
  | "provisioning_token_generated"
  | "provisioning_request_preparation"
  | "admin_create_user_started"
  | "admin_create_user_returned"
  | "admin_user_metadata_cleanup"
  | "profile_verification"
  | "counselor_account_verification"
  | "pending_session_creation"
  | "redirect";

type CounselorRegistrationDiagnostic = {
  stage: CounselorRegistrationStage;
  technical_email?: string;
  counselor_auth_domain_exists?: boolean;
  supabase_url_exists?: boolean;
  service_role_key_exists?: boolean;
  error_status?: string;
  error_code?: string;
  error_name?: string;
  error_message?: string;
  cause_name?: string;
  cause_code?: string;
  cause_message?: string;
};

function sanitizeDiagnosticText(value: unknown): string {
  let sanitized = String(value ?? "Unknown error").replace(/[\r\n]+/g, " ");

  for (const credential of [
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  ]) {
    if (credential) sanitized = sanitized.replaceAll(credential, "[redacted]");
  }

  return sanitized
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

function getErrorDiagnostic(error: unknown): Pick<
  CounselorRegistrationDiagnostic,
  | "error_status"
  | "error_code"
  | "error_name"
  | "error_message"
  | "cause_name"
  | "cause_code"
  | "cause_message"
> {
  const errorRecord =
    typeof error === "object" && error !== null
      ? (error as Record<string, unknown>)
      : null;
  const causeRecord =
    typeof errorRecord?.cause === "object" && errorRecord.cause !== null
      ? (errorRecord.cause as Record<string, unknown>)
      : null;
  const errorStatus = errorRecord?.status;
  const errorCode = errorRecord?.code;
  const errorName =
    error instanceof Error ? error.name : (errorRecord?.name ?? "UnknownError");
  const errorMessage =
    error instanceof Error ? error.message : (errorRecord?.message ?? error);

  return {
    error_status:
      typeof errorStatus === "string" || typeof errorStatus === "number"
        ? String(errorStatus)
        : "none",
    error_code:
      typeof errorCode === "string" || typeof errorCode === "number"
        ? String(errorCode)
        : "none",
    error_name: sanitizeDiagnosticText(errorName),
    error_message: sanitizeDiagnosticText(errorMessage),
    cause_name: sanitizeDiagnosticText(causeRecord?.name),
    cause_code: sanitizeDiagnosticText(causeRecord?.code),
    cause_message: sanitizeDiagnosticText(causeRecord?.message),
  };
}

function logCounselorRegistration(
  diagnostic: CounselorRegistrationDiagnostic,
): void {
  if (process.env.NODE_ENV !== "development") return;

  console.error("[C1 counselor registration]", diagnostic);
}

export async function registerCounselor(
  _previousState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateCounselorRegistration(formData);
  if (!validation.success) {
    return { status: "error", errors: validation.errors };
  }

  logCounselorRegistration({ stage: "validation_successful" });

  let technicalEmail: string;
  try {
    technicalEmail = `${validation.data.username}@${getCounselorAuthDomain()}`;
  } catch (error) {
    logCounselorRegistration({
      stage: "technical_email_generation",
      counselor_auth_domain_exists: Boolean(
        process.env.K_GEO_COUNSELOR_AUTH_DOMAIN,
      ),
      ...getErrorDiagnostic(error),
    });
    return { status: "error", message: genericRegistrationError };
  }

  logCounselorRegistration({
    stage: "technical_email_generated",
    technical_email: technicalEmail,
  });

  let createdUserId: string | null = null;
  let failureStage: CounselorRegistrationStage = "admin_client_creation";

  try {
    const adminClient = createAdminClient();
    logCounselorRegistration({
      stage: "admin_client_creation",
      supabase_url_exists: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      service_role_key_exists: Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
    });

    const provisioningToken = randomBytes(32).toString("base64url");
    if (provisioningToken.length !== 43) {
      throw new Error("Counselor provisioning token generation failed.");
    }
    const provisioningTokenHash = createHash("sha256")
      .update(provisioningToken, "utf8")
      .digest("hex");
    const provisioningExpiresAt = new Date(
      Date.now() + 10 * 60 * 1000,
    ).toISOString();

    logCounselorRegistration({
      stage: "provisioning_token_generated",
    });

    failureStage = "provisioning_request_preparation";
    const { error: preparationError } = await adminClient.rpc(
      "prepare_counselor_registration_provisioning",
      {
        p_email: technicalEmail,
        p_full_name: validation.data.fullName,
        p_username: validation.data.username,
        p_token_hash: provisioningTokenHash,
        p_expires_at: provisioningExpiresAt,
      },
    );

    if (preparationError) {
      logCounselorRegistration({
        stage: "provisioning_request_preparation",
        ...getErrorDiagnostic(preparationError),
      });
      throw preparationError;
    }
    logCounselorRegistration({
      stage: "provisioning_request_preparation",
    });

    failureStage = "admin_create_user_started";
    logCounselorRegistration({
      stage: "admin_create_user_started",
      technical_email: technicalEmail,
    });
    const { data, error } = await adminClient.auth.admin.createUser({
      email: technicalEmail,
      password: validation.data.password,
      email_confirm: true,
      user_metadata: {
        kgeo_staff_provisioning_token: provisioningToken,
        kgeo_counselor_full_name: validation.data.fullName,
        kgeo_counselor_username: validation.data.username,
      },
    });

    createdUserId = data.user?.id ?? null;
    if (error || !createdUserId) {
      const creationError =
        error ?? new Error("Supabase returned no created counselor user.");
      logCounselorRegistration({
        stage: "admin_create_user_returned",
        technical_email: technicalEmail,
        ...getErrorDiagnostic(creationError),
      });
      throw creationError;
    }
    logCounselorRegistration({
      stage: "admin_create_user_returned",
      technical_email: technicalEmail,
    });

    failureStage = "admin_user_metadata_cleanup";
    const { data: cleanupData, error: metadataCleanupError } =
      await adminClient.auth.admin.updateUserById(createdUserId, {
        user_metadata: {
          kgeo_staff_provisioning_token: null,
          kgeo_counselor_full_name: validation.data.fullName,
          kgeo_counselor_username: validation.data.username,
        },
      });

    if (
      metadataCleanupError ||
      cleanupData.user?.id !== createdUserId ||
      typeof cleanupData.user.user_metadata
        ?.kgeo_staff_provisioning_token === "string"
    ) {
      const cleanupError =
        metadataCleanupError ??
        new Error("Counselor provisioning token cleanup failed.");
      logCounselorRegistration({
        stage: "admin_user_metadata_cleanup",
        ...getErrorDiagnostic(cleanupError),
      });
      throw cleanupError;
    }
    logCounselorRegistration({
      stage: "admin_user_metadata_cleanup",
    });

    failureStage = "profile_verification";
    const [profileResult, accountResult] = await Promise.all([
      adminClient
        .from("profiles")
        .select("id, role, is_active")
        .eq("id", createdUserId)
        .maybeSingle(),
      adminClient
        .from("counselor_accounts")
        .select("user_id, username, approval_status")
        .eq("user_id", createdUserId)
        .maybeSingle(),
    ]);

    if (profileResult.error) {
      logCounselorRegistration({
        stage: "profile_verification",
        ...getErrorDiagnostic(profileResult.error),
      });
    } else {
      logCounselorRegistration({ stage: "profile_verification" });
    }

    if (accountResult.error) {
      logCounselorRegistration({
        stage: "counselor_account_verification",
        ...getErrorDiagnostic(accountResult.error),
      });
    } else {
      logCounselorRegistration({
        stage: "counselor_account_verification",
      });
    }

    if (
      profileResult.error ||
      accountResult.error ||
      profileResult.data?.role !== "counselor" ||
      profileResult.data.is_active ||
      accountResult.data?.user_id !== createdUserId ||
      accountResult.data.username !== validation.data.username ||
      accountResult.data.approval_status !== "pending"
    ) {
      throw new Error("Counselor provisioning verification failed.");
    }

    failureStage = "pending_session_creation";
    const supabase = await createClient();
    const { data: signInData, error: signInError } =
      await supabase.auth.signInWithPassword({
        email: technicalEmail,
        password: validation.data.password,
      });

    if (signInError || signInData.user?.id !== createdUserId) {
      const pendingSessionError =
        signInError ??
        new Error("Counselor pending-session user did not match.");
      logCounselorRegistration({
        stage: "pending_session_creation",
        ...getErrorDiagnostic(pendingSessionError),
      });
      throw pendingSessionError;
    }
    logCounselorRegistration({ stage: "pending_session_creation" });
  } catch (error) {
    logCounselorRegistration({
      stage: failureStage,
      supabase_url_exists: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL),
      service_role_key_exists: Boolean(
        process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      ...getErrorDiagnostic(error),
    });
    if (createdUserId) {
      try {
        const adminClient = createAdminClient();
        await adminClient.auth.admin.deleteUser(createdUserId);
      } catch (cleanupError) {
        logCounselorRegistration({
          stage: failureStage,
          ...getErrorDiagnostic(cleanupError),
        });
        // A generic response prevents disclosure; server operators must review logs.
      }
    }

    return {
      status: "error",
      message: genericRegistrationError,
    };
  }

  logCounselorRegistration({ stage: "redirect" });
  redirect("/counselor/pending");
}

export async function loginCounselor(
  _previousState: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateCounselorLogin(formData);
  if (!validation.success) {
    return { status: "error", errors: validation.errors };
  }

  let technicalEmail: string;
  try {
    technicalEmail = `${validation.data.username}@${getCounselorAuthDomain()}`;
  } catch {
    return { status: "error", message: genericLoginError };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: technicalEmail,
    password: validation.data.password,
  });

  if (error || !data.user) {
    return { status: "error", message: genericLoginError };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError || !profile || profile.role !== "counselor") {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", message: genericLoginError };
  }

  const { data: account, error: accountError } = await supabase
    .from("counselor_accounts")
    .select("user_id, approval_status")
    .eq("user_id", profile.id)
    .maybeSingle();

  if (
    !accountError &&
    account?.user_id === profile.id &&
    account.approval_status === "approved" &&
    profile.is_active
  ) {
    redirect("/counselor/dashboard");
  }

  if (
    !accountError &&
    account?.user_id === profile.id &&
    account.approval_status === "pending" &&
    !profile.is_active
  ) {
    redirect("/counselor/pending");
  }

  await supabase.auth.signOut({ scope: "local" });
  return {
    status: "error",
    message: "Your counselor account is not authorized to use this portal.",
  };
}
