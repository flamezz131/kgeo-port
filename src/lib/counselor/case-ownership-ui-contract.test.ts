import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const layout = read("../../app/counselor/students/[student-id]/layout.tsx");
const workspaceServer = read("./student-workspace-server.ts");
const profile = read("../../components/counselor/student-profile-view.tsx");
const privateRecords = read("../../components/counselor/counselor-private-records.tsx");
const progression = read("../../components/counselor/official-progression-section.tsx");
const applications = read("../../components/counselor/university-applications-section.tsx");
const documents = read("../../components/counselor/university-application-documents.tsx");

test("Student Workspace loads trusted case ownership and fails closed", () => {
  assert.match(workspaceServer, /await requireCounselor\(\)/);
  assert.match(workspaceServer, /verifyPrimaryCounselorCaseAccess\(supabase, studentId\)/);
  assert.match(workspaceServer, /caseAccess\.error \? \{ kind: "unavailable" \} : \{ kind: "not_found" \}/);
  assert.match(layout, /if \(result\.kind === "not_found"\) notFound\(\)/);
});

test("non-primary and unassigned counselors receive no partial Student information", () => {
  const contract = read("./case-ownership.ts");
  assert.match(contract, /Managed by another Primary Counselor/);
  assert.match(contract, /Primary Counselor assignment required before case updates/);
  assert.doesNotMatch(contract, /counselorId|counselor_id|full_name|college_email/);
  assert.doesNotMatch(layout, /full_name|college_email|course|department/);
});

test("long-term controls are gated while read and history controls remain", () => {
  assert.match(privateRecords, /\{canManageCase && \(\s*<NoteForm/);
  assert.match(privateRecords, /\{canManageCase && \(\s*<FollowUpForm/);
  assert.match(
    progression,
    /canManageCase && progression\.current\.workflow_state/,
  );
  assert.match(progression, /\{correctionAction && \([\s\S]*?canManageCase \? \(/);
  assert.match(applications, /canManageCase && !application\.isArchived/);
  assert.match(documents, /\{!isArchived && \([\s\S]*?canManageCase \? \(/);
  assert.match(applications, />\s*View history\s*</);
  assert.match(documents, />\s*View\s*</);
});

test("consultation outcome controls remain assigned-counselor scoped", () => {
  assert.match(profile, /<CounselorStudentConsultationHistory/);
  assert.match(profile, /currentCounselorId=\{currentCounselorId\}/);
  assert.doesNotMatch(
    profile.match(/function CounselorStudentConsultationHistory[\s\S]*?^}/m)?.[0] ?? "",
    /canManageCase|caseAccess/,
  );
});
