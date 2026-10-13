import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type { EmailVerificationAuth } from "./email-verification";

const require = createRequire(import.meta.url);
const {
  getEmailVerificationRedirectPath,
  parseEmailVerificationParameters,
  VERIFIED_LOGIN_PATH,
  VERIFICATION_ERROR_PATH,
  verifyStudentEmail,
} = require("./email-verification.ts") as typeof import("./email-verification");

function createAuthMock(overrides?: Partial<EmailVerificationAuth>) {
  const calls = {
    code: [] as string[],
    tokenHash: [] as Array<{ token_hash: string; type: "email" }>,
    signOut: [] as Array<{ scope: "local" }>,
  };
  const confirmedResult = {
    data: { user: { email_confirmed_at: "2026-07-18T12:00:00Z" } },
    error: null,
  };

  const auth: EmailVerificationAuth = {
    async exchangeCodeForSession(code) {
      calls.code.push(code);
      return confirmedResult;
    },
    async verifyOtp(parameters) {
      calls.tokenHash.push(parameters);
      return confirmedResult;
    },
    async signOut(options) {
      calls.signOut.push(options);
      return { error: null };
    },
    ...overrides,
  };

  return { auth, calls };
}

test("handles a valid PKCE code and clears its temporary session", async () => {
  const parameters = parseEmailVerificationParameters(
    new URLSearchParams("code=valid-code"),
  );
  assert.deepEqual(parameters, { method: "code", code: "valid-code" });

  const { auth, calls } = createAuthMock();
  assert.equal(await verifyStudentEmail(parameters!, auth), true);
  assert.deepEqual(calls.code, ["valid-code"]);
  assert.deepEqual(calls.signOut, [{ scope: "local" }]);
});

test("handles the supported token hash email template parameters", async () => {
  const parameters = parseEmailVerificationParameters(
    new URLSearchParams("token_hash=valid-hash&type=email"),
  );
  assert.deepEqual(parameters, {
    method: "token_hash",
    tokenHash: "valid-hash",
    type: "email",
  });

  const { auth, calls } = createAuthMock();
  assert.equal(await verifyStudentEmail(parameters!, auth), true);
  assert.deepEqual(calls.tokenHash, [
    { token_hash: "valid-hash", type: "email" },
  ]);
  assert.deepEqual(calls.signOut, [{ scope: "local" }]);
});

test("rejects missing and mixed verification parameters", () => {
  assert.equal(parseEmailVerificationParameters(new URLSearchParams()), null);
  assert.equal(
    parseEmailVerificationParameters(
      new URLSearchParams("code=a&token_hash=b&type=email"),
    ),
    null,
  );
});

test("rejects duplicate verification parameters", () => {
  const duplicateQueries = [
    "code=first&code=second",
    "token_hash=first&token_hash=second&type=email",
    "token_hash=hash&type=email&type=email",
  ];

  duplicateQueries.forEach((query) => {
    assert.equal(
      parseEmailVerificationParameters(new URLSearchParams(query)),
      null,
      query,
    );
  });
});

test("rejects empty, malformed, and oversized verification values", () => {
  const oversizedValue = "a".repeat(2049);
  const invalidQueries = [
    "code=",
    "code=%20%20",
    "code=contains%20space",
    "token_hash=&type=email",
    "token_hash=contains%0Anewline&type=email",
    `code=${oversizedValue}`,
    `token_hash=${oversizedValue}&type=email`,
  ];

  invalidQueries.forEach((query) => {
    assert.equal(
      parseEmailVerificationParameters(new URLSearchParams(query)),
      null,
    );
  });
});

test("rejects malformed verification types", () => {
  assert.equal(
    parseEmailVerificationParameters(
      new URLSearchParams("token_hash=valid-hash&type=admin"),
    ),
    null,
  );
});

test("uses only fixed success and error destinations", () => {
  assert.equal(getEmailVerificationRedirectPath(true), VERIFIED_LOGIN_PATH);
  assert.equal(
    getEmailVerificationRedirectPath(false),
    VERIFICATION_ERROR_PATH,
  );
});

test("ignores injected redirects, role, and metadata", () => {
  const parameters = parseEmailVerificationParameters(
    new URLSearchParams(
      "code=valid-code&next=https%3A%2F%2Fevil.example&redirect=https%3A%2F%2Fevil.example&redirect_to=https%3A%2F%2Fevil.example&role=admin&metadata=director",
    ),
  );

  assert.deepEqual(parameters, { method: "code", code: "valid-code" });
  assert.equal(Object.hasOwn(parameters!, "next"), false);
  assert.equal(Object.hasOwn(parameters!, "redirect"), false);
  assert.equal(Object.hasOwn(parameters!, "redirect_to"), false);
  assert.equal(Object.hasOwn(parameters!, "role"), false);
  assert.equal(Object.hasOwn(parameters!, "metadata"), false);
  assert.equal(getEmailVerificationRedirectPath(true), "/login?verified=true");
});

test("returns a safe failure for an invalid or reused verification value", async () => {
  const { auth, calls } = createAuthMock({
    async exchangeCodeForSession() {
      return { data: { user: null }, error: new Error("invalid code") };
    },
  });

  assert.equal(
    await verifyStudentEmail({ method: "code", code: "reused" }, auth),
    false,
  );
  assert.equal(calls.signOut.length, 0);
  assert.equal(getEmailVerificationRedirectPath(false), VERIFICATION_ERROR_PATH);
});

test("handles a missing PKCE verifier without exposing its internal error", async () => {
  const internalError = "PKCE code verifier is missing from storage";
  const { auth } = createAuthMock({
    async exchangeCodeForSession() {
      return { data: { user: null }, error: new Error(internalError) };
    },
  });

  assert.equal(
    await verifyStudentEmail({ method: "code", code: "valid-code" }, auth),
    false,
  );

  const destination = getEmailVerificationRedirectPath(false);
  assert.equal(destination, VERIFICATION_ERROR_PATH);
  assert.equal(destination.includes("PKCE"), false);
  assert.equal(destination.includes("verifier"), false);
});

test("requires Supabase to report the email as confirmed", async () => {
  const { auth, calls } = createAuthMock({
    async verifyOtp() {
      return { data: { user: { email_confirmed_at: null } }, error: null };
    },
  });

  assert.equal(
    await verifyStudentEmail(
      { method: "token_hash", tokenHash: "hash", type: "email" },
      auth,
    ),
    false,
  );
  assert.deepEqual(calls.signOut, [{ scope: "local" }]);
});

test("does not expose callback secrets in either redirect destination", () => {
  const forbiddenFragments = [
    "code",
    "token",
    "email",
    "cookie",
    "user",
    "role",
    "metadata",
  ];

  [VERIFIED_LOGIN_PATH, VERIFICATION_ERROR_PATH].forEach((path) => {
    forbiddenFragments.forEach((fragment) => {
      assert.equal(path.includes(fragment), false, `${path}: ${fragment}`);
    });
  });
});
