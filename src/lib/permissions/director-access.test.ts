import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { getDirectorAccessDecision } = require(
  "./director-access.ts",
) as typeof import("./director-access");

const verifiedUser = {
  id: "director-id",
  email_confirmed_at: "2026-08-08T08:00:00Z",
};

const activeDirectorProfile = {
  id: "director-id",
  full_name: "K-GEO Director",
  role: "director",
  is_active: true,
} as const;

test("allows only the matching active verified Director", () => {
  assert.equal(
    getDirectorAccessDecision(verifiedUser, activeDirectorProfile),
    "allowed",
  );
});

test("rejects an unauthenticated request", () => {
  assert.equal(getDirectorAccessDecision(null, null), "unauthenticated");
});

test("rejects an unverified Director", () => {
  assert.equal(
    getDirectorAccessDecision(
      { ...verifiedUser, email_confirmed_at: null },
      activeDirectorProfile,
    ),
    "unverified",
  );
});

for (const role of ["student", "counselor", "admin"] as const) {
  test(`rejects a ${role} profile`, () => {
    assert.equal(
      getDirectorAccessDecision(verifiedUser, {
        ...activeDirectorProfile,
        role,
      }),
      "forbidden",
    );
  });
}

test("rejects an inactive Director", () => {
  assert.equal(
    getDirectorAccessDecision(verifiedUser, {
      ...activeDirectorProfile,
      is_active: false,
    }),
    "forbidden",
  );
});

test("rejects a missing or mismatched Director profile", () => {
  assert.equal(getDirectorAccessDecision(verifiedUser, null), "forbidden");
  assert.equal(
    getDirectorAccessDecision(verifiedUser, {
      ...activeDirectorProfile,
      id: "another-user-id",
    }),
    "forbidden",
  );
});

test("the server guard fails closed through the shared profile infrastructure", () => {
  const permissionsSource = readFileSync(
    new URL("./index.ts", import.meta.url),
    "utf8",
  );

  assert.match(permissionsSource, /requireDirector = cache/);
  assert.match(permissionsSource, /supabase\.auth\.getUser\(\)/);
  assert.match(permissionsSource, /!user\.email_confirmed_at/);
  assert.match(
    permissionsSource,
    /select\("id, full_name, role, is_active"\)/,
  );
  assert.match(permissionsSource, /\.eq\("id", user\.id\)/);
  assert.match(
    permissionsSource,
    /const directorProfile = profileError \? null : profile/,
  );
  assert.match(
    permissionsSource,
    /getDirectorAccessDecision\(user, directorProfile\)/,
  );
  assert.match(
    permissionsSource,
    /decision !== "allowed" \|\| !directorProfile/,
  );
  assert.match(permissionsSource, /redirect\("\/director\/login"\)/);
  assert.doesNotMatch(
    permissionsSource,
    /raw_(?:app|user)_meta_data|email\.endsWith|@kct|@kclas/,
  );
});
