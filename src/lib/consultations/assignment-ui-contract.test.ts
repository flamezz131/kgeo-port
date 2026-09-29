import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const dashboard = read("../../app/counselor/dashboard/page.tsx");
const schedule = read("../../app/counselor/schedule/page.tsx");
const studentDashboard = read("../../app/student/dashboard/page.tsx");
const studentForm = read("../../components/forms/consultation-form.tsx");
const outcomeControls = read(
  "../../components/counselor/consultation-outcome-controls.tsx",
);

test("legacy Claim Next action and queue UI are removed", () => {
  assert.equal(
    existsSync(
      new URL("../../app/actions/consultation-assignment-actions.ts", import.meta.url),
    ),
    false,
  );
  assert.equal(
    existsSync(
      new URL(
        "../../components/counselor/consultation-assignment-queue.tsx",
        import.meta.url,
      ),
    ),
    false,
  );
  assert.doesNotMatch(`${dashboard}\n${schedule}`, /Claim next|FCFS queue/i);
});

test("Counselor views use only bounded assigned-consultation projections", () => {
  for (const source of [dashboard, schedule]) {
    assert.match(source, /\.rpc\("list_my_assigned_consultations"/);
    assert.doesNotMatch(source, /\.from\("consultation_requests"\)/);
    assert.doesNotMatch(source, /assigned_counselor_id.*user\.id/);
  }
  assert.match(dashboard, /\.rpc\("get_my_consultation_dashboard_metrics"\)/);
  assert.match(schedule, /My Consultation Schedule/);
  assert.doesNotMatch(schedule, /Organization-wide Daily Schedule/);
});

test("outcome controls remain available only for returned assigned rows", () => {
  assert.match(schedule, /ConsultationOutcomeControls/);
  assert.match(schedule, /ConsultationNextWorkLinks/);
  assert.match(outcomeControls, /Review progression/);
  assert.match(outcomeControls, /Create follow-up/);
  assert.doesNotMatch(outcomeControls, /createCounselor|recordStudent/);
});

test("student UI confirms the scheduled booking without Counselor identity", () => {
  assert.match(studentForm, /Consultation Confirmed/);
  assert.match(studentForm, /<dt>Reference<\/dt>/);
  assert.match(studentDashboard, />\s*Upcoming Consultations\s*</);
  assert.match(studentDashboard, />\s*Consultation History\s*</);
  assert.doesNotMatch(
    `${studentForm}\n${studentDashboard}`,
    /assigned_counselor|counselor email|technical email|Claim next/i,
  );
});
