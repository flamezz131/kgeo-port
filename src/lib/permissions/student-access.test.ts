import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { getStudentAccessDecision } = require(
  "./student-access.ts",
) as typeof import("./student-access");
const permissionSource = readFileSync(
  new URL("./index.ts", import.meta.url),
  "utf8",
);

const verifiedUser = {
  id: "student-id",
  email_confirmed_at: "2026-07-18T12:00:00Z",
};

const activeStudentProfile = {
  id: "student-id",
  college_email: "student@kct.ac.in",
  full_name: "Kumar Student",
  role: "student",
  is_active: true,
};

test("rejects an unauthenticated request", () => {
  assert.equal(getStudentAccessDecision(null, null), "unauthenticated");
});

test("rejects an unverified authenticated user", () => {
  assert.equal(
    getStudentAccessDecision(
      { id: "student-id", email_confirmed_at: null },
      activeStudentProfile,
    ),
    "unverified",
  );
});

for (const role of ["counselor", "admin", "director"] as const) {
  test(`rejects a ${role} profile`, () => {
    assert.equal(
      getStudentAccessDecision(verifiedUser, {
        ...activeStudentProfile,
        role,
      }),
      "forbidden",
    );
  });
}

test("rejects an inactive student profile", () => {
  assert.equal(
    getStudentAccessDecision(verifiedUser, {
      ...activeStudentProfile,
      is_active: false,
    }),
    "forbidden",
  );
});

test("fails closed when the student profile is missing", () => {
  assert.equal(getStudentAccessDecision(verifiedUser, null), "forbidden");
});

test("allows only a verified user with their active student profile", () => {
  assert.equal(
    getStudentAccessDecision(verifiedUser, activeStudentProfile),
    "allowed",
  );
});

test("requireStudent maps profile query failure to a denied decision", () => {
  assert.match(permissionSource, /const studentProfile = profileError \? null : profile/);
  assert.match(permissionSource, /if \(decision !== "allowed" \|\| !studentProfile\)/);
});
