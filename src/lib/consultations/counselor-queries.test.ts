import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const dashboard = read("../../app/counselor/dashboard/page.tsx");
const schedule = read("../../app/counselor/schedule/page.tsx");
const blockActions = read("../../app/actions/counselor-slot-block-actions.ts");

test("Counselor pages use assigned-only RPCs and no direct consultation reads", () => {
  for (const source of [dashboard, schedule]) {
    assert.match(source, /\.rpc\("list_my_assigned_consultations"/);
    assert.doesNotMatch(source, /\.from\("consultation_requests"\)/);
    assert.doesNotMatch(source, /service[_ -]?role/i);
  }
  assert.match(dashboard, /\.rpc\("get_my_consultation_dashboard_metrics"\)/);
});

test("Counselor schedule is personal and supports owned slot blocks", () => {
  assert.match(schedule, /My Consultation Schedule/);
  assert.match(schedule, /\.rpc\("list_my_active_consultation_slot_blocks"\)/);
  assert.match(schedule, /CounselorSlotBlocks/);
  assert.doesNotMatch(schedule, /Organization-wide|another counselor|Claim next/i);
});

test("slot-block actions reauthorize and call only their narrow RPCs", () => {
  assert.equal((blockActions.match(/await requireCounselor\(\)/g) ?? []).length, 2);
  assert.match(blockActions, /\.rpc\("block_my_consultation_slot"/);
  assert.match(
    blockActions,
    /\.rpc\(\s*"release_my_consultation_slot_block"/,
  );
  assert.doesNotMatch(blockActions, /\.(?:insert|update|upsert|delete)\s*\(/);
  assert.doesNotMatch(blockActions, /service[_ -]?role/i);
});

test("Student routes do not call Counselor-only projections", () => {
  const source = [
    read("../../app/student/dashboard/page.tsx"),
    read("../../app/student/consultation/page.tsx"),
    read("../../app/actions/consultation-actions.ts"),
  ].join("\n");

  assert.doesNotMatch(
    source,
    /list_my_assigned_consultations|get_my_consultation_dashboard_metrics|list_my_active_consultation_slot_blocks/,
  );
});

require("./assignment-foundation.test.ts");
require("./assignment-ui-contract.test.ts");
require("./assignment.test.ts");
require("./automatic-allocation-foundation.test.ts");
require("./continuation.test.ts");
