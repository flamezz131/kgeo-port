const MAX_VERIFICATION_VALUE_LENGTH = 2048;

export const VERIFIED_LOGIN_PATH = "/login?verified=true";
export const VERIFICATION_ERROR_PATH =
  "/auth/error?reason=verification_failed";

export type EmailVerificationParameters =
  | { method: "code"; code: string }
  | { method: "token_hash"; tokenHash: string; type: "email" };

type VerificationUser = {
  email_confirmed_at?: string | null;
};

type VerificationResult = {
  data: { user: VerificationUser | null };
  error: unknown;
};

export type EmailVerificationAuth = {
  exchangeCodeForSession(code: string): Promise<VerificationResult>;
  verifyOtp(parameters: {
    token_hash: string;
    type: "email";
  }): Promise<VerificationResult>;
  signOut(options: { scope: "local" }): Promise<{ error: unknown }>;
};

function getSingleSafeValue(
  searchParams: URLSearchParams,
  name: string,
): string | null {
  const values = searchParams.getAll(name);
  if (values.length !== 1) {
    return null;
  }

  const value = values[0].trim();
  const containsWhitespaceOrControlCharacter = /[\s\u0000-\u001f\u007f]/u.test(
    value,
  );

  if (
    !value ||
    value.length > MAX_VERIFICATION_VALUE_LENGTH ||
    containsWhitespaceOrControlCharacter
  ) {
    return null;
  }

  return value;
}

export function parseEmailVerificationParameters(
  searchParams: URLSearchParams,
): EmailVerificationParameters | null {
  const hasCode = searchParams.has("code");
  const hasTokenHash = searchParams.has("token_hash");
  const hasType = searchParams.has("type");

  if (hasCode && !hasTokenHash && !hasType) {
    const code = getSingleSafeValue(searchParams, "code");
    return code ? { method: "code", code } : null;
  }

  if (!hasCode && hasTokenHash && hasType) {
    const tokenHash = getSingleSafeValue(searchParams, "token_hash");
    const type = getSingleSafeValue(searchParams, "type");

    if (tokenHash && type === "email") {
      return { method: "token_hash", tokenHash, type };
    }
  }

  return null;
}

export async function verifyStudentEmail(
  parameters: EmailVerificationParameters,
  auth: EmailVerificationAuth,
): Promise<boolean> {
  const result =
    parameters.method === "code"
      ? await auth.exchangeCodeForSession(parameters.code)
      : await auth.verifyOtp({
          token_hash: parameters.tokenHash,
          type: parameters.type,
        });

  if (result.error || !result.data.user?.email_confirmed_at) {
    if (result.data.user) {
      await auth.signOut({ scope: "local" });
    }
    return false;
  }

  const { error: signOutError } = await auth.signOut({ scope: "local" });
  return !signOutError;
}

export function getEmailVerificationRedirectPath(verified: boolean): string {
  return verified ? VERIFIED_LOGIN_PATH : VERIFICATION_ERROR_PATH;
}
