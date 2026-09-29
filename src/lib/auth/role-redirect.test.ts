import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { getRoleHomePath } = require(
  "./role-redirect.ts",
) as typeof import("./role-redirect");

test("maps every stored profile role to its server-controlled home", () => {
  assert.equal(getRoleHomePath("student"), "/student/dashboard");
  assert.equal(getRoleHomePath("counselor"), "/counselor/dashboard");
  assert.equal(getRoleHomePath("admin"), "/admin/consultations");
  assert.equal(getRoleHomePath("director"), "/director/dashboard");
});

test("rejects missing and browser-invented roles", () => {
  assert.equal(getRoleHomePath(undefined), null);
  assert.equal(getRoleHomePath("super_admin"), null);
  assert.equal(getRoleHomePath("/counselor/dashboard"), null);
});
