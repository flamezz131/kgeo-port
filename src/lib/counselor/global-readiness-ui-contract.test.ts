import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../../app/counselor/students/[student-id]/readiness/page.tsx");
const component = read("../../components/counselor/global-readiness-assessment.tsx");
const action = read("../../app/actions/counselor-global-readiness-actions.ts");
const loader = read("./global-readiness-server.ts");
const submission = read("./global-readiness-submission.ts");
const styles = read("../../app/globals.css");

test("existing readiness route loads only a current Primary Counselor workspace", () => {
  assert.match(page, /loadGlobalReadinessPage\(studentId\)/);
  assert.match(page, /result\.kind === "not_found"\) notFound\(\)/);
  assert.match(loader, /await requireCounselor\(\)/);
  assert.match(loader, /verifyPrimaryCounselorCaseAccess\(supabase, studentId\)/);
  assert.ok(loader.indexOf("verifyPrimaryCounselorCaseAccess") < loader.indexOf("Promise.all"));
});

test("server action independently authorizes and accepts no trusted ownership metadata", () => {
  assert.match(action, /^"use server";/);
  assert.equal(action.match(/export async function/g)?.length, 1);
  assert.doesNotMatch(action, /export (?:const|type|interface|class)/);
  assert.match(action, /await requireCounselor\(\)/);
  assert.match(action, /get_counselor_student_identity/);
  assert.match(action, /verifyPrimaryCounselorCaseAccess/);
  assert.match(action, /create_student_global_readiness_assessment/);
  const allowlist = submission.match(/const allowedFields[\s\S]*?\n\]\);/)?.[0] ?? "";
  assert.doesNotMatch(allowlist, /studentId|counselorId|totalScore|readinessBand|revisionNumber/);
});

test("UI separates evidence and scoring across all five dimensions and thirteen criteria", () => {
  assert.match(component, /Canonical evidence/);
  assert.match(component, /readiness-evidence/);
  assert.match(component, /readiness-scoring/);
  assert.match(component, /GLOBAL_READINESS_DIMENSIONS\.map/);
  assert.match(component, /GLOBAL_READINESS_CRITERIA\.filter/);
  assert.match(component, /maximum \{criterion\.maximum\}/);
  assert.match(component, /step=\{1\}/);
});

test("preview is explicitly non-authoritative and no derived values are submitted", () => {
  assert.match(component, /Preview only/);
  assert.match(component, /Database totals remain authoritative/);
  assert.doesNotMatch(component, /name="(?:totalScore|readinessBand|revisionNumber|assessedBy|evidenceSnapshot)"/);
  assert.doesNotMatch(action, /p_(?:total_score|readiness_band|revision_number|assessed_by|evidence_snapshot)/);
});

test("immutable current summary history loading empty errors and pending states exist", () => {
  for (const value of ["Global Master&apos;s Readiness", "Latest immutable assessment", "Assessment History", "No readiness assessment has been created", "Create Readiness Assessment", "Creating Readiness Assessment..."]) {
    assert.match(component, new RegExp(value.replace("/", "\\/")));
  }
  assert.match(component, /useActionState/);
  assert.match(component, /aria-busy=\{pending\}/);
  assert.match(component, /disabled=\{pending\}/);
  assert.match(page, /temporarily unavailable/);
});

test("parent-safe summary remains stored-only and private modules are absent", () => {
  assert.match(component, /not exposed to Parent Report in Phase 1/);
  assert.doesNotMatch(`${component}\n${loader}\n${action}`, /counselor_student_notes|counselor_follow_ups|signed_url|storage_path|ParentReportWorkspace/);
  assert.doesNotMatch(`${page}\n${component}\n${action}`, /requireStudent|requireDirector|requireAdmin/);
});

test("readiness UI is responsive and accessible", () => {
  assert.match(component, /aria-invalid/);
  assert.match(component, /aria-describedby/);
  assert.match(component, /aria-live="polite"/);
  assert.match(styles, /\.readiness-criterion/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?\.readiness-current-card,[\s\S]*?\.readiness-criterion/);
});
