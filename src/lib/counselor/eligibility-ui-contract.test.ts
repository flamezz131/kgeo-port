import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const page = read("../../app/counselor/students/[student-id]/eligibility/page.tsx");
const action = read("../../app/actions/counselor-eligibility-actions.ts");
const component = read("../../components/counselor/eligibility-assessment.tsx");
const loader = read("./eligibility-server.ts");
const submission = read("./eligibility-submission.ts");
const overviewLoader = read("./student-workspace-server.ts");
const workspaceSections = read("../../components/counselor/student-workspace-sections.tsx");
const privateRecords = read("../../components/counselor/counselor-private-records.tsx");
const styles = read("../../app/globals.css");

test("Eligibility route independently enforces Primary Counselor access and fails closed", () => {
  assert.match(page, /loadCounselorEligibilityPage\(studentId\)/);
  assert.match(page, /result\.kind === "not_found"\) notFound\(\)/);
  assert.match(loader, /await requireCounselor\(\)/);
  assert.match(loader, /verifyPrimaryCounselorCaseAccess\(supabase, studentId\)/);
  assert.ok(loader.indexOf("verifyPrimaryCounselorCaseAccess") < loader.indexOf("Promise.all"));
});

test("Eligibility context reads only existing Student facts and is read-only", () => {
  assert.match(loader, /student_profiles/);
  assert.match(loader, /cgpa, cgpa_scale, active_backlogs, cleared_backlogs/);
  assert.match(loader, /student_preferences/);
  assert.match(loader, /preferred_countries, target_intake/);
  assert.match(loader, /student_test_scores/);
  for (const label of ["CGPA", "Active backlogs", "IELTS", "GRE / GMAT", "Student preferred countries", "Student target intake"]) {
    assert.match(`${component}\n${loader}`, new RegExp(label.replace("/", "\\/"), "i"));
  }
  assert.doesNotMatch(component, /Save Student|Edit profile|Update CGPA/);
});

test("professional form contains the exact bounded Counselor assessment dimensions", () => {
  for (const label of [
    "Overall Eligibility",
    "Academic Eligibility",
    "Backlog Assessment",
    "English Test Readiness",
    "GRE / GMAT Readiness",
    "Profile Strength",
    "Application Readiness",
    "Recommended Countries",
    "Recommended Intake",
    "Counselor Assessment Summary",
  ]) {
    assert.match(component, new RegExp(label.replace("/", "\\/")));
  }
  assert.match(component, /Save New Assessment/);
  assert.match(component, /Saving never overwrites history/);
  assert.doesNotMatch(component, /assessedBy|assessed_by|counselorId/);
});

test("server action is the only async export and rechecks trusted ownership", () => {
  assert.match(action, /^"use server";/);
  assert.equal(action.match(/export async function/g)?.length, 1);
  assert.doesNotMatch(action, /export (?:const|type|interface|class)/);
  assert.match(action, /await requireCounselor\(\)/);
  assert.match(action, /get_counselor_student_identity/);
  assert.match(action, /verifyPrimaryCounselorCaseAccess/);
  assert.match(action, /save_student_eligibility_assessment/);
  assert.doesNotMatch(action, /service[_ -]?role|admin\.createUser/i);
});

test("current assessment and immutable history show names rather than UUIDs", () => {
  assert.match(component, /Current assessment/);
  assert.match(component, /Assessment History/);
  assert.match(component, /assessment\.assessor_full_name/);
  assert.match(component, /formatEligibilityDateTime\(assessment\.assessed_at\)/);
  assert.doesNotMatch(component, /assessment\.assessed_by|Auth UUID|technical email/);
  assert.doesNotMatch(component, /Delete assessment|Edit history/);
});

test("Overview loads only latest Eligibility and never full history", () => {
  const overviewFunction = overviewLoader.match(
    /export async function loadCounselorStudentWorkspaceOverview[\s\S]*?\n}/,
  )?.[0] ?? "";
  assert.match(overviewFunction, /get_counselor_latest_student_eligibility_assessment/);
  assert.doesNotMatch(overviewFunction, /get_counselor_student_eligibility_assessments/);
  assert.match(workspaceSections, /STUDENT_ELIGIBILITY_STATUS_LABELS/);
  assert.match(workspaceSections, /Last assessed/);
  assert.match(workspaceSections, /Assessment not completed/);
});

test("no automatic admission decision or global readiness calculation exists", () => {
  const eligibilityRuntime = `${loader}\n${submission}\n${action}`;
  assert.doesNotMatch(eligibilityRuntime, /cgpa\s*[<>]|ielts\s*[<>]|toefl\s*[<>]|global readiness score|readinessScore/i);
  assert.match(component, /professional assessment/);
});

test("private Counselor notes remain separate from Eligibility and Overview", () => {
  assert.doesNotMatch(`${component}\n${loader}\n${submission}`, /counselor_student_notes|CounselorPrivateRecords|privateRecords/);
  assert.match(privateRecords, /CounselorPrivateRecords/);
  const overview = workspaceSections.match(
    /export function CounselorStudentWorkspaceOverview[\s\S]*?export function CounselorStudentWorkspaceProfile/,
  )?.[0] ?? "";
  assert.doesNotMatch(overview, /CounselorPrivateRecords|privateRecords|note_text/);
});

test("UI has pending errors success empty history and responsive contracts", () => {
  assert.match(component, /useActionState/);
  assert.match(component, /aria-busy=\{pending\}/);
  assert.match(component, /disabled=\{pending\}/);
  assert.match(component, /role=\{state\.status === "success" \? "status" : "alert"\}/);
  assert.match(component, /Eligibility assessment has not been completed/);
  assert.match(component, /No assessment history recorded/);
  assert.match(styles, /eligibility-form-grid/);
  assert.match(styles, /@media \(max-width: 640px\)[\s\S]*?eligibility-form-grid/);
});

test("Eligibility runtime does not expose Student or Director mutation UI", () => {
  assert.doesNotMatch(`${page}\n${component}\n${action}`, /requireStudent|requireDirector|saveDirectorEligibility|saveStudentOwnEligibility/i);
  assert.doesNotMatch(component, /Parent Report|PDF|SOP readiness|LoR readiness/);
});
