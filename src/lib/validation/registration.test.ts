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

    if (specifier === "@/lib/auth/student-institutions") {
      return {
        shortCircuit: true,
        url: new URL("../auth/student-institutions.ts", import.meta.url).href,
      };
    }

    return nextResolve(specifier, context);
  },
});

const { registrationSchema, validateLogin, validateRegistration } = require(
  "./auth.ts"
) as typeof import("./auth");

const {
  STUDENT_INSTITUTIONS,
  STUDENT_INSTITUTION_DOMAINS,
  getExactEmailDomain,
  getStudentInstitutionEmailHint,
  institutionMatchesEmail,
  isStudentInstitution,
} = require(
  "../auth/student-institutions.ts"
) as typeof import("../auth/student-institutions");

const validRegistration = {
  fullName: "Kumar Student",
  institution: "KCT" as const,
  collegeEmail: "student@kct.ac.in",
  password: "kgeo2026",
  confirmPassword: "kgeo2026",
  termsAccepted: "accepted" as const,
};

const matchingInstitutionEmails = [
  ["KCT", "student@kct.ac.in"],
  ["KCLAS", "student@kclas.ac.in"],
  ["KCTBS", "student@kctbs.ac.in"],
] as const;

const mismatchedInstitutionEmails = [
  ["KCT", "student@kclas.ac.in"],
  ["KCT", "student@kctbs.ac.in"],
  ["KCLAS", "student@kct.ac.in"],
  ["KCLAS", "student@kctbs.ac.in"],
  ["KCTBS", "student@kct.ac.in"],
  ["KCTBS", "student@kclas.ac.in"],
  ["KCT", "student@gmail.com"],
  ["KCLAS", "student@example.org"],
  ["KCTBS", "student@gmail.com"],
  ["KCT", "student@student.kct.ac.in"],
  ["KCT", "student@mail.kct.ac.in"],
  ["KCLAS", "student@mail.kclas.ac.in"],
  ["KCT", "student@kct.ac.in.fake.com"],
  ["KCT", "student@kct.ac.in.example.com"],
  ["KCTBS", "student@kctbs.ac.in.fake.com"],
  ["KCT", "student@kct-ac.in"],
  ["KCT", "student@fakekct.ac.in"],
] as const;

function registrationForm(overrides: Record<string, string> = {}): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries({
    ...validRegistration,
    ...overrides,
  })) {
    formData.set(key, value);
  }
  return formData;
}

function loginForm(values: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) formData.set(key, value);
  return formData;
}

test("student institution contract maps exactly three institutions to exact domains", () => {
  assert.deepEqual([...STUDENT_INSTITUTIONS], ["KCT", "KCLAS", "KCTBS"]);
  assert.deepEqual(
    { ...STUDENT_INSTITUTION_DOMAINS },
    { KCT: "kct.ac.in", KCLAS: "kclas.ac.in", KCTBS: "kctbs.ac.in" },
  );

  for (const value of ["KCT", "KCLAS", "KCTBS"]) {
    assert.equal(isStudentInstitution(value), true, value);
  }
  for (const value of ["kct", "KCG", "", " KCT", "director", null, undefined, 1]) {
    assert.equal(isStudentInstitution(value), false, String(value));
  }

  assert.equal(getExactEmailDomain("  Student@KCT.AC.IN "), "kct.ac.in");
  assert.equal(getExactEmailDomain("student@@kct.ac.in"), null);
  assert.equal(getExactEmailDomain("a@b@kct.ac.in"), null);
  assert.equal(getExactEmailDomain("@kct.ac.in"), null);
  assert.equal(getExactEmailDomain("student@"), null);
  assert.equal(
    getStudentInstitutionEmailHint("KCLAS"),
    "Use your @kclas.ac.in institutional email",
  );

  for (const [institution, email] of matchingInstitutionEmails) {
    assert.equal(institutionMatchesEmail(institution, email), true, email);
  }
  for (const [institution, email] of mismatchedInstitutionEmails) {
    assert.equal(
      institutionMatchesEmail(institution, email),
      false,
      `${institution} ${email}`,
    );
  }
});

test("accepts each institution with its exact email domain", () => {
  for (const [institution, collegeEmail] of matchingInstitutionEmails) {
    const result = registrationSchema.safeParse({
      ...validRegistration,
      institution,
      collegeEmail,
    });
    assert.equal(result.success, true, `${institution} ${collegeEmail}`);

    const formResult = validateRegistration(
      registrationForm({ institution, collegeEmail }),
    );
    assert.equal(formResult.success, true, `${institution} ${collegeEmail}`);
    if (formResult.success) {
      assert.equal(formResult.data.institution, institution);
      assert.equal(formResult.data.email, collegeEmail);
    }
  }
});

test("accepts and normalizes a valid registration by trimming and lowercasing", () => {
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

  const kclas = validateRegistration(
    registrationForm({
      institution: "KCLAS",
      collegeEmail: "  Student.Name@KCLAS.ac.IN ",
    }),
  );
  assert.equal(kclas.success, true);
  if (kclas.success) assert.equal(kclas.data.email, "student.name@kclas.ac.in");
});

test("rejects institution and email-domain mismatches subdomains lookalikes and external domains", () => {
  for (const [institution, collegeEmail] of mismatchedInstitutionEmails) {
    const result = registrationSchema.safeParse({
      ...validRegistration,
      institution,
      collegeEmail,
    });
    assert.equal(result.success, false, `${institution} ${collegeEmail}`);

    const formResult = validateRegistration(
      registrationForm({ institution, collegeEmail }),
    );
    assert.equal(formResult.success, false, `${institution} ${collegeEmail}`);
    if (!formResult.success) {
      assert.ok(formResult.errors.collegeEmail?.length, collegeEmail);
    }
  }
});

test("reports the expected domain when the institution and email disagree", () => {
  const result = validateRegistration(
    registrationForm({
      institution: "KCLAS",
      collegeEmail: "student@kct.ac.in",
    }),
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(result.errors.collegeEmail, [
      "Use your exact @kclas.ac.in email address for KCLAS.",
    ]);
  }
});

test("rejects a missing institution", () => {
  const formData = registrationForm();
  formData.delete("institution");

  const result = validateRegistration(formData);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(result.errors.institution, ["Select your institution."]);
  }
});

test("rejects unknown and non-canonical institutions", () => {
  for (const institution of [
    "KCG",
    "kct",
    "Kclas",
    " KCT",
    "",
    "director",
    "kct.ac.in",
  ]) {
    const result = validateRegistration(registrationForm({ institution }));
    assert.equal(result.success, false, institution);
    if (!result.success) {
      assert.deepEqual(result.errors.institution, ["Select your institution."]);
    }
  }
});

test("rejects duplicate institution values", () => {
  const formData = registrationForm();
  formData.append("institution", "KCLAS");

  const result = validateRegistration(formData);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(result.errors.institution, [
      "Submit exactly one value for this field.",
    ]);
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
  const formData = registrationForm();
  formData.set("collegeEmail", new File(["student@kct.ac.in"], "email.txt"));
  assert.equal(validateRegistration(formData).success, false);

  const institutionFile = registrationForm();
  institutionFile.set("institution", new File(["KCT"], "institution.txt"));
  assert.equal(validateRegistration(institutionFile).success, false);
});

test("rejects duplicate registration values", () => {
  const formData = registrationForm();
  formData.append("fullName", "Injected Name");

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

test("KCLAS selection never produces a role or privilege field", () => {
  const formData = registrationForm({
    institution: "KCLAS",
    collegeEmail: "student@kclas.ac.in",
    role: "director",
    is_admin: "true",
    is_active: "true",
    kgeo_bootstrap_role: "director",
  });

  const result = validateRegistration(formData);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(Object.keys(result.data).sort(), [
      "email",
      "fullName",
      "institution",
      "password",
    ]);
    assert.equal(result.data.institution, "KCLAS");
  }
});

test("login accepts each institution with its exact email domain", () => {
  for (const [institution, email] of matchingInstitutionEmails) {
    const result = validateLogin(
      loginForm({ institution, email, password: "kgeo2026" }),
    );
    assert.equal(result.success, true, `${institution} ${email}`);
    if (result.success) {
      assert.deepEqual(result.data, { email, password: "kgeo2026" });
    }
  }
});

test("login trims and lowercases the email and returns only credentials", () => {
  const result = validateLogin(
    loginForm({
      institution: "KCTBS",
      email: "  Student@KCTBS.AC.IN ",
      password: "kgeo2026",
      role: "director",
      next: "/director/dashboard",
    }),
  );

  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(Object.keys(result.data).sort(), ["email", "password"]);
    assert.equal(result.data.email, "student@kctbs.ac.in");
  }
});

test("login rejects institution and email-domain mismatches before authentication", () => {
  for (const [institution, email] of mismatchedInstitutionEmails) {
    const result = validateLogin(
      loginForm({ institution, email, password: "kgeo2026" }),
    );
    assert.equal(result.success, false, `${institution} ${email}`);
    if (!result.success) assert.ok(result.errors.email?.length, email);
  }

  const mismatch = validateLogin(
    loginForm({
      institution: "KCT",
      email: "abc@kclas.ac.in",
      password: "kgeo2026",
    }),
  );
  assert.equal(mismatch.success, false);
  if (!mismatch.success) {
    assert.deepEqual(mismatch.errors.email, [
      "Use your exact @kct.ac.in email address for KCT.",
    ]);
  }
});

test("login rejects a Counselor technical email before authentication for every institution", () => {
  for (const institution of ["KCT", "KCLAS", "KCTBS"]) {
    for (const email of [
      "durga@counselor-auth.kgeo.internal",
      "durga@counselor-auth.kgeo.internal.kct.ac.in.fake.com",
    ]) {
      const result = validateLogin(
        loginForm({ institution, email, password: "kgeo2026" }),
      );
      assert.equal(result.success, false, `${institution} ${email}`);
      if (!result.success) assert.ok(result.errors.email?.length);
    }
  }
});

test("login validation treats a KCLAS Director address as an ordinary KCLAS email with no role", () => {
  const result = validateLogin(
    loginForm({
      institution: "KCLAS",
      email: "director@kclas.ac.in",
      password: "kgeo2026",
      role: "director",
    }),
  );

  // Domain validation alone cannot tell a Director from a Student. The login
  // action rejects this identity afterwards from its trusted profile role.
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data, {
      email: "director@kclas.ac.in",
      password: "kgeo2026",
    });
  }
});

test("login rejects missing unknown and duplicate institutions", () => {
  const missing = validateLogin(
    loginForm({ email: "student@kct.ac.in", password: "kgeo2026" }),
  );
  assert.equal(missing.success, false);
  if (!missing.success) {
    assert.deepEqual(missing.errors.institution, ["Select your institution."]);
  }

  const unknown = validateLogin(
    loginForm({
      institution: "director",
      email: "student@kct.ac.in",
      password: "kgeo2026",
    }),
  );
  assert.equal(unknown.success, false);

  const duplicate = loginForm({
    institution: "KCT",
    email: "student@kct.ac.in",
    password: "kgeo2026",
  });
  duplicate.append("institution", "KCLAS");
  assert.equal(validateLogin(duplicate).success, false);
});

test("login still requires a valid email and a password", () => {
  const result = validateLogin(
    loginForm({ institution: "KCT", email: "not-an-email", password: "" }),
  );

  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(result.errors.email, ["Enter a valid email address."]);
    assert.deepEqual(result.errors.password, ["Enter your password."]);
  }
});
