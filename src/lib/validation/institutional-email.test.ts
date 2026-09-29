import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  institutionalEmailSchema,
  isInstitutionalEmail,
  normalizeInstitutionalEmail,
} = require("./institutional-email.ts") as typeof import("./institutional-email");

test("accepts the exact kct.ac.in domain", () => {
  assert.equal(isInstitutionalEmail("student@kct.ac.in"), true);
});

test("trims whitespace and normalizes the address to lowercase", () => {
  assert.equal(
    normalizeInstitutionalEmail("  STUDENT@KCT.AC.IN  "),
    "student@kct.ac.in",
  );
});

test("rejects subdomains and lookalike domains", () => {
  const invalidEmails = [
    "student@mail.kct.ac.in",
    "student@kct.ac.in.example.com",
    "student@kct-ac.in",
    "student@gmail.com",
  ];

  invalidEmails.forEach((email) => {
    assert.equal(isInstitutionalEmail(email), false, email);
  });
});

test("rejects malformed email addresses", () => {
  const invalidEmails = [
    "student@",
    "@kct.ac.in",
    "student@@kct.ac.in",
    "student kct.ac.in",
  ];

  invalidEmails.forEach((email) => {
    assert.equal(institutionalEmailSchema.safeParse(email).success, false, email);
  });
});
