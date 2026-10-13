import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { getCounselorAccessDecision } = require(
  "./counselor-access.ts",
) as typeof import("./counselor-access");

const verifiedUser = {
  id: "counselor-id",
  email_confirmed_at: "2026-07-19T08:00:00Z",
};

const activeCounselorProfile = {
  id: "counselor-id",
  full_name: "K-GEO Counselor",
  role: "counselor",
  is_active: true,
} as const;

const approvedCounselorAccount = {
  user_id: "counselor-id",
  approval_status: "approved",
} as const;

test("allows a verified user with their active counselor profile", () => {
  assert.equal(
    getCounselorAccessDecision(
      verifiedUser,
      activeCounselorProfile,
      approvedCounselorAccount,
    ),
    "allowed",
  );
});

test("rejects an anonymous request", () => {
  assert.equal(
    getCounselorAccessDecision(null, null, null),
    "unauthenticated",
  );
});

test("rejects an unverified user", () => {
  assert.equal(
    getCounselorAccessDecision(
      { ...verifiedUser, email_confirmed_at: null },
      activeCounselorProfile,
      approvedCounselorAccount,
    ),
    "unverified",
  );
});

for (const role of ["student", "admin", "director"] as const) {
  test(`rejects a ${role} profile`, () => {
    assert.equal(
      getCounselorAccessDecision(
        verifiedUser,
        {
          ...activeCounselorProfile,
          role,
        },
        approvedCounselorAccount,
      ),
      "forbidden",
    );
  });
}

test("rejects an inactive counselor", () => {
  assert.equal(
    getCounselorAccessDecision(
      verifiedUser,
      {
        ...activeCounselorProfile,
        is_active: false,
      },
      approvedCounselorAccount,
    ),
    "forbidden",
  );
});

test("routes a matching pending inactive counselor to the status page", () => {
  assert.equal(
    getCounselorAccessDecision(
      verifiedUser,
      { ...activeCounselorProfile, is_active: false },
      { ...approvedCounselorAccount, approval_status: "pending" },
    ),
    "pending",
  );
});

test("rejects approved counselors without an active profile", () => {
  assert.equal(
    getCounselorAccessDecision(
      verifiedUser,
      { ...activeCounselorProfile, is_active: false },
      approvedCounselorAccount,
    ),
    "forbidden",
  );
});

test("rejects a rejected counselor from dashboard access", () => {
  assert.equal(
    getCounselorAccessDecision(
      verifiedUser,
      { ...activeCounselorProfile, is_active: false },
      { ...approvedCounselorAccount, approval_status: "rejected" },
    ),
    "forbidden",
  );
});

test("rejects active counselors without an approved account mapping", () => {
  assert.equal(
    getCounselorAccessDecision(verifiedUser, activeCounselorProfile, null),
    "forbidden",
  );
});

test("fails closed for a missing or mismatched profile", () => {
  assert.equal(
    getCounselorAccessDecision(verifiedUser, null, approvedCounselorAccount),
    "forbidden",
  );
  assert.equal(
    getCounselorAccessDecision(
      verifiedUser,
      {
        ...activeCounselorProfile,
        id: "another-user-id",
      },
      approvedCounselorAccount,
    ),
    "forbidden",
  );
});

test("requireCounselor maps profile query errors to a denied decision", () => {
  const permissionsSource = readFileSync(
    new URL("./index.ts", import.meta.url),
    "utf8",
  );

  assert.match(permissionsSource, /\.eq\("id", user\.id\)/);
  assert.match(
    permissionsSource,
    /const counselorProfile = profileResult\.error \? null : profileResult\.data/,
  );
  assert.match(
    permissionsSource,
    /getCounselorAccessDecision\([\s\S]*user,[\s\S]*counselorProfile,[\s\S]*counselorAccount/,
  );
  assert.match(
    permissionsSource,
    /decision === "pending"\) redirect\("\/counselor\/pending"\)/,
  );
  assert.match(permissionsSource, /redirect\("\/counselor\/login"\)/);
});
