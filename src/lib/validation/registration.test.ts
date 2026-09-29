import assert from "node:assert/strict";
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
        url: new URL("./full-name.ts", import.meta.url).href,
      };
    }

    if (specifier === "@/lib/validation/institutional-email") {
      return {
        shortCircuit: true,
        url: new URL("./institutional-email.ts", import.meta.url).href,
      };
    }

    return nextResolve(specifier, context);
  },
});

const { registrationSchema, validateRegistration } = require(
  "./auth.ts"
) as typeof import("./auth");

const validRegistration = {
  fullName: "Kumar Student",
  collegeEmail: "student@kct.ac.in",
  password: "kgeo2026",
  confirmPassword: "kgeo2026",
  termsAccepted: "accepted" as const,
};

test("accepts and normalizes a valid KCT registration", () => {
  const result = registrationSchema.safeParse({
    ...validRegistration,
    fullName: "  Kumar   Student  ",
    collegeEmail: "  STUDENT@KCT.AC.IN  ",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.fullName, "Kumar Student");
    assert.equal(result.data.collegeEmail, "student@kct.ac.in");
  }
});

test("rejects KCT subdomains lookalikes KCLAS and external domains", () => {
  for (const collegeEmail of [
    "student@mail.kct.ac.in",
    "student@kct.ac.in.example.com",
    "student@kct-ac.in",
    "student@kclas.ac.in",
    "student@example.org",
  ]) {
    const result = registrationSchema.safeParse({
      ...validRegistration,
      collegeEmail,
    });
    assert.equal(result.success, false, collegeEmail);
  }
});

test("keeps full name required for new student registration", () => {
  const result = registrationSchema.safeParse({
    ...validRegistration,
    fullName: "   ",
  });

  assert.equal(result.success, false);
});

test("rejects a short password", () => {
  const result = registrationSchema.safeParse({
    ...validRegistration,
    password: "abc123",
    confirmPassword: "abc123",
  });
  assert.equal(result.success, false);
});

test("rejects a letter-only password", () => {
  const result = registrationSchema.safeParse({
    ...validRegistration,
    password: "passwordonly",
    confirmPassword: "passwordonly",
  });
  assert.equal(result.success, false);
});

test("rejects a number-only password", () => {
  const result = registrationSchema.safeParse({
    ...validRegistration,
    password: "12345678",
    confirmPassword: "12345678",
  });
  assert.equal(result.success, false);
});

test("rejects mismatched passwords", () => {
  const result = registrationSchema.safeParse({
    ...validRegistration,
    confirmPassword: "different2026",
  });
  assert.equal(result.success, false);
});

test("rejects a missing terms agreement", () => {
  const result = registrationSchema.safeParse({
    ...validRegistration,
    termsAccepted: null,
  });
  assert.equal(result.success, false);
});

test("rejects malformed FormData values", () => {
  const formData = new FormData();
  formData.set("fullName", "Kumar Student");
  formData.set("collegeEmail", new File(["student@kct.ac.in"], "email.txt"));
  formData.set("password", "kgeo2026");
  formData.set("confirmPassword", "kgeo2026");
  formData.set("termsAccepted", "accepted");

  assert.equal(validateRegistration(formData).success, false);
});

test("rejects duplicate registration values", () => {
  const formData = new FormData();
  formData.append("fullName", "Kumar Student");
  formData.append("fullName", "Injected Name");
  formData.set("collegeEmail", "student@kct.ac.in");
  formData.set("password", "kgeo2026");
  formData.set("confirmPassword", "kgeo2026");
  formData.set("termsAccepted", "accepted");

  const result = validateRegistration(formData);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(result.errors.fullName, [
      "Submit exactly one value for this field.",
    ]);
  }
});

test("strips unexpected fields including an injected role", () => {
  const result = registrationSchema.safeParse({
    ...validRegistration,
    role: "admin",
    redirectTo: "https://example.com",
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(Object.hasOwn(result.data, "role"), false);
    assert.equal(Object.hasOwn(result.data, "redirectTo"), false);
  }
});

test("strips injected Director markers from public registration", () => {
  const result = registrationSchema.safeParse({
    ...validRegistration,
    role: "director",
    kgeo_bootstrap_role: "director",
    raw_user_meta_data: { kgeo_bootstrap_role: "director" },
  });

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(Object.hasOwn(result.data, "role"), false);
    assert.equal(Object.hasOwn(result.data, "kgeo_bootstrap_role"), false);
    assert.equal(Object.hasOwn(result.data, "raw_user_meta_data"), false);
  }
});
