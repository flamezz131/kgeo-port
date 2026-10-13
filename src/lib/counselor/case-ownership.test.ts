import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { getCounselorCaseAccessMessage, parseCounselorCaseAccess } = require(
  "./case-ownership.ts",
) as typeof import("./case-ownership");

test("parses each bounded Primary Counselor case access state", () => {
  assert.equal(parseCounselorCaseAccess([{ access_state: "primary" }]), "primary");
  assert.equal(
    parseCounselorCaseAccess([{ access_state: "managed_by_other" }]),
    "managed_by_other",
  );
  assert.equal(
    parseCounselorCaseAccess([{ access_state: "unassigned" }]),
    "unassigned",
  );
});

test("fails closed on malformed or ambiguous case access projections", () => {
  for (const value of [
    [],
    [{ access_state: "primary" }, { access_state: "unassigned" }],
    [{ access_state: "director" }],
    [{ access_state: "primary", counselor_id: crypto.randomUUID() }],
  ]) {
    assert.throws(() => parseCounselorCaseAccess(value));
  }
});

test("uses safe read-only guidance without exposing owner identity", () => {
  assert.equal(
    getCounselorCaseAccessMessage("managed_by_other"),
    "Managed by another Primary Counselor. Long-term case records are read-only.",
  );
  assert.equal(
    getCounselorCaseAccessMessage("unassigned"),
    "Primary Counselor assignment required before case updates.",
  );
});
