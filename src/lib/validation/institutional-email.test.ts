import assert from "node:assert/strict";
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
    if (specifier === "@/lib/auth/student-institutions") {
      return {
        shortCircuit: true,
        url: new URL("../auth/student-institutions.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  institutionalEmailSchema,
  isInstitutionalEmail,
  normalizeInstitutionalEmail,
} = require("./institutional-email.ts") as typeof import("./institutional-email");

const schemaSource = readFileSync(
  new URL("./institutional-email.ts", import.meta.url),
  "utf8",
);

test("accepts the exact kct.ac.in domain", () => {
  assert.equal(isInstitutionalEmail("student@kct.ac.in"), true);
});

test("accepts the exact kclas.ac.in domain", () => {
  assert.equal(isInstitutionalEmail("student@kclas.ac.in"), true);
});

test("accepts the exact kctbs.ac.in domain", () => {
  assert.equal(isInstitutionalEmail("student@kctbs.ac.in"), true);
});

test("trims whitespace and normalizes the address to lowercase", () => {
  assert.equal(
    normalizeInstitutionalEmail("  STUDENT@KCT.AC.IN  "),
    "student@kct.ac.in",
  );
  assert.equal(
    normalizeInstitutionalEmail("  Student.Name@KCLAS.ac.IN "),
    "student.name@kclas.ac.in",
  );
  assert.equal(
    normalizeInstitutionalEmail("\tSTUDENT@kctbs.AC.in\n"),
    "student@kctbs.ac.in",
  );
});

test("rejects subdomains and lookalike domains", () => {
  const invalidEmails = [
    "student@mail.kct.ac.in",
    "student@student.kct.ac.in",
    "student@sub.kclas.ac.in",
    "student@mail.kctbs.ac.in",
    "student@kct.ac.in.example.com",
    "student@kct.ac.in.fake.com",
    "student@kclas.ac.in.fake.com",
    "student@kctbs.ac.in.fake.com",
    "student@kct-ac.in",
    "student@kclas-ac.in",
    "student@fakekct.ac.in",
    "student@kct.ac.com",
    "student@kctbs.ac",
  ];

  invalidEmails.forEach((email) => {
    assert.equal(isInstitutionalEmail(email), false, email);
  });
});

test("rejects external domains including staff and technical domains", () => {
  const invalidEmails = [
    "student@gmail.com",
    "student@example.org",
    "student@kumaraguru.in",
    "durga@counselor-auth.kgeo.internal",
  ];

  invalidEmails.forEach((email) => {
    assert.equal(isInstitutionalEmail(email), false, email);
  });
});

test("rejects malformed email addresses", () => {
  const invalidEmails = [
    "student@",
    "@kct.ac.in",
    "@kclas.ac.in",
    "student@@kct.ac.in",
    "student@kct.ac.in@kclas.ac.in",
    "student kct.ac.in",
    "student@kctbs .ac.in",
    "",
  ];

  invalidEmails.forEach((email) => {
    assert.equal(institutionalEmailSchema.safeParse(email).success, false, email);
  });
});

test("Student domains come only from the shared institution contract", () => {
  assert.match(schemaSource, /from "@\/lib\/auth\/student-institutions"/);
  assert.match(schemaSource, /STUDENT_INSTITUTION_DOMAINS/);
  assert.doesNotMatch(schemaSource, /ac\.in/);
  assert.doesNotMatch(schemaSource, /endsWith/);
});
