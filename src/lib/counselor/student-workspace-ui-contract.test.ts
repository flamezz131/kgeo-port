import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const layout = read("../../app/counselor/students/[student-id]/layout.tsx");
const overviewPage = read("../../app/counselor/students/[student-id]/page.tsx");
const applicationsPage = read("../../app/counselor/students/[student-id]/applications/page.tsx");
const documentsPage = read("../../app/counselor/students/[student-id]/documents/page.tsx");
const profileDocuments = read("../../components/counselor/student-profile-documents.tsx");
const workspaceServer = read("./student-workspace-server.ts");
const shell = read("../../components/counselor/student-workspace-shell.tsx");
const navigation = read("../../components/counselor/student-workspace-navigation.tsx");
const sections = read("../../components/counselor/student-workspace-sections.tsx");
const applications = read("../../components/counselor/university-applications-section.tsx");
const myStudents = read("../../components/counselor/my-primary-students.tsx");

test("current Primary Counselor is required before the shared Workspace renders", () => {
  assert.match(workspaceServer, /await requireCounselor\(\)/);
  assert.match(workspaceServer, /verifyPrimaryCounselorCaseAccess\(supabase, studentId\)/);
  assert.match(workspaceServer, /caseAccess\.valid/);
  assert.match(layout, /loadCounselorStudentWorkspaceBase\(studentId\)/);
});

test("unassigned and former Counselors fail closed without partial Student data", () => {
  assert.match(workspaceServer, /\{ kind: "not_found" \}/);
  assert.match(layout, /if \(result\.kind === "not_found"\) notFound\(\)/);
  assert.ok(
    workspaceServer.indexOf("verifyPrimaryCounselorCaseAccess") <
      workspaceServer.indexOf("Promise.all"),
  );
});

test("every request rechecks assignment so reassignment revokes old access immediately", () => {
  assert.match(layout, /loadCounselorStudentWorkspaceBase\(studentId\)/);
  assert.doesNotMatch(workspaceServer, /cache\(|unstable_cache|revalidate/);
});

test("shared header contains safe human-readable fields only", () => {
  for (const label of [
    "Academic period",
    "Graduation year",
    "Current CGPA",
    "Target intake",
    "Preferred countries",
    "Current journey",
    "Current Primary Counselor",
  ]) {
    assert.match(shell, new RegExp(label));
  }
  assert.doesNotMatch(shell, /auth uuid|technical|storage_path|bucket_id|policy metadata/i);
});

test("Profile composes existing Student-owned facts as read-only content", () => {
  assert.match(sections, /Personal \/ College Information/);
  assert.match(sections, /Academic Portfolio/);
  assert.match(sections, /Higher Studies Preferences/);
  assert.match(sections, /Study Abroad Exams/);
  assert.doesNotMatch(sections, /Save profile|Edit profile/);
});

test("Overview is summary-only and excludes private notes and application history", () => {
  assert.match(overviewPage, /CounselorStudentWorkspaceOverview/);
  const overview =
    sections.match(
      /export function CounselorStudentWorkspaceOverview[\s\S]*?\n}\n\nexport function CounselorStudentWorkspaceProfile/,
    )?.[0] ?? "";
  assert.doesNotMatch(overview, /CounselorPrivateRecords|ApplicationHistory|changeReason/);
  assert.doesNotMatch(overviewPage, /loadUniversityApplicationHistory|progression-evidence/);
  assert.doesNotMatch(overviewPage, /loadCounselorStudentProfile/);
  assert.match(overviewPage, /loadCounselorStudentWorkspaceOverview/);
});

test("Applications uses the existing bounded loader and links to detail", () => {
  assert.match(applicationsPage, /loadCounselorUniversityApplications\(studentId\)/);
  assert.match(applicationsPage, /UniversityApplicationsSection/);
  assert.match(applications, /View Application/);
  assert.match(applications, /applications\/\$\{application\.id\}/);
});

test("Documents uses only Primary-scoped Profile Documents and preserves separation", () => {
  assert.match(documentsPage, /loadPrimaryCounselorProfileDocuments/);
  assert.match(documentsPage, /CounselorStudentProfileDocuments/);
  assert.match(profileDocuments, /Profile Documents/);
  assert.match(profileDocuments, /Progression evidence remains in Journey Progress/);
  assert.match(profileDocuments, /university-specific[\s\S]*documents remain inside each Application/);
  assert.doesNotMatch(`${documentsPage}\n${profileDocuments}`, /Resume Upload|Marksheet Upload/);
});

test("safe empty and future states never invent missing values", () => {
  for (const copy of [
    "Not provided",
    "No test scores recorded",
    "No achievements added",
    "Assessment not completed",
    "No available progression evidence",
  ]) {
    assert.match(sections, new RegExp(copy));
  }
  // The readiness tab no longer renders "Not yet assessed" placeholder cards:
  // it now renders the Global Master's Readiness Assessment, whose own empty
  // state is asserted by global-readiness-ui-contract.test.ts. The achievements
  // tab keeps a safe empty state for evidence.
  assert.match(sections, /No evidence uploaded/);
  assert.match(sections, /Evidence is temporarily unavailable\./);
});

test("existing Student 360 advisory, progression and mutation interfaces remain composed", () => {
  assert.match(sections, /CounselorStudentConsultationHistory/);
  assert.match(sections, /CounselorPrivateRecords/);
  assert.match(sections, /OfficialProgressionSection/);
  assert.match(sections, /UniversityApplicationDocuments/);
});

test("all permanent tab routes exist and navigation preserves the trusted Student id", () => {
  for (const route of [
    "profile",
    "eligibility",
    "advisory",
    "applications",
    "readiness",
    "achievements",
    "documents",
    "report",
  ]) {
    assert.ok(
      existsSync(
        new URL(
          `../../app/counselor/students/[student-id]/${route}/page.tsx`,
          import.meta.url,
        ),
      ),
    );
    assert.match(navigation, new RegExp(`/${route}`));
  }
  assert.match(navigation, /const basePath = `\/counselor\/students\/\$\{studentId\}`/);
});

test("My Students links assigned rows directly to the permanent Workspace", () => {
  assert.match(myStudents, /result\.items\.map/);
  assert.match(myStudents, /href=\{`\/counselor\/students\/\$\{student\.studentId\}`\}/);
  assert.match(myStudents, /Open Student Workspace/);
  assert.doesNotMatch(myStudents, /student directory|all students/i);
});
