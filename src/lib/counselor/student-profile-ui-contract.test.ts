import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const pageSource = read(
  "../../app/counselor/students/[student-id]/page.tsx",
);
const layoutSource = read(
  "../../app/counselor/students/[student-id]/layout.tsx",
);
const workspaceServerSource = read("./student-workspace-server.ts");
const loadingSource = read(
  "../../app/counselor/students/[student-id]/loading.tsx",
);
const notFoundSource = read(
  "../../app/counselor/students/[student-id]/not-found.tsx",
);
const viewSource = read(
  "../../components/counselor/student-profile-view.tsx",
);
const serverSource = read("./student-profile-server.ts");
const contractSource = read("./student-profile.ts");
const directorySource = read(
  "../../components/counselor/student-directory.tsx",
);
const scheduleSource = read("../../app/counselor/schedule/page.tsx");
const dashboardSource = read("../../app/counselor/dashboard/page.tsx");
const querySource = read("../consultations/counselor-queries.ts");
const styles = read("../../app/globals.css");

test("page and focused loader independently enforce counselor authorization", () => {
  assert.match(workspaceServerSource, /await requireCounselor\(\)/);
  assert.match(serverSource, /await requireCounselor\(\)/);
  assert.ok(
    workspaceServerSource.indexOf("await requireCounselor()") <
      workspaceServerSource.indexOf("verifyPrimaryCounselorCaseAccess("),
  );
  assert.ok(
    serverSource.indexOf("await requireCounselor()") <
      serverSource.indexOf("return fetchCounselorStudentProfile("),
  );
});

test("route validation occurs before authorization database work and fails with notFound", () => {
  assert.ok(
    workspaceServerSource.indexOf("if (!isStudent360StudentId(studentId))") <
      workspaceServerSource.indexOf("await requireCounselor()"),
  );
  assert.ok(
    workspaceServerSource.indexOf("isStudent360StudentId(studentId)") <
      workspaceServerSource.indexOf("verifyPrimaryCounselorCaseAccess("),
  );
  assert.ok(
    serverSource.indexOf("if (!isStudent360StudentId(routeStudentId))") <
      serverSource.indexOf("await requireCounselor()"),
  );
  assert.match(layoutSource, /result\.kind === "not_found"\) notFound\(\)/);
  assert.match(notFoundSource, /Student profile not found/);
  assert.doesNotMatch(notFoundSource, /role|staff|auth\.users|database/i);
});

test("identity comes only from the trusted RPC and every section uses its UUID", () => {
  assert.match(
    serverSource,
    /\.rpc\("get_counselor_student_identity",\s*\{\s*p_student_id: studentId/,
  );
  assert.doesNotMatch(
    serverSource.slice(
      serverSource.indexOf("loadIdentity:"),
      serverSource.indexOf("loadSections:"),
    ),
    /\.from\("profiles"\)|auth\.users/,
  );
  assert.equal(
    serverSource.match(/\.eq\("student_id", trustedStudentId\)/g)?.length,
    9,
  );
});

test("detail queries are parallel, bounded, and select no consultation reference", () => {
  assert.match(serverSource, /await Promise\.all\(\[/);
  assert.match(serverSource, /\.limit\(STUDENT_360_SECTION_LIMIT\)/);
  assert.match(serverSource, /\.range\(consultationFrom, consultationTo\)/);
  assert.match(contractSource, /STUDENT_360_HISTORY_PAGE_SIZE = 20/);
  assert.match(contractSource, /STUDENT_360_SECTION_LIMIT = 50/);
  const consultationProjection =
    contractSource.match(
      /STUDENT_360_CONSULTATION_COLUMNS =\s*\n\s*"([^"]+)"/,
    )?.[1] ?? "";
  assert.match(consultationProjection, /\bid\b/);
  assert.match(consultationProjection, /\bstudent_id\b/);
  assert.doesNotMatch(
    consultationProjection,
    /request_number|outcome_recorded_at|outcome_recorded_by/,
  );
});

test("consultation references use one server-side bounded RPC and skip empty arrays", () => {
  assert.equal(
    serverSource.match(
      /\.rpc\(\s*"get_counselor_consultation_references"/g,
    )?.length,
    1,
  );
  assert.match(
    contractSource,
    /const referenceIds = \[[\s\S]*?consultationRows\.map[\s\S]*?getCounselorPrivateConsultationIds/,
  );
  assert.match(contractSource, /mergeCounselorConsultationReferences/);
  assert.doesNotMatch(viewSource, /get_counselor_consultation_references|supabase/);
});

test("the page renders all six read-only sections and authoritative profile state", () => {
  for (const section of [
    "Overview",
    "Academic Portfolio",
    "Higher-Studies Preferences",
    "Consultation History",
    "Study Abroad Exams",
    "Achievements",
  ]) {
    assert.match(contractSource, new RegExp(section));
  }
  assert.match(viewSource, /Student-reported planning stage/);
  assert.match(viewSource, /Profile completion/);
  assert.match(viewSource, /aria-valuenow=\{result\.completionPercentage\}/);
  assert.match(viewSource, /Profile not started|not started their detailed profile/);
  assert.doesNotMatch(viewSource, /recalculate/i);
  assert.match(
    viewSource,
    /Planning stage is not an official counselor progression\s+status\./,
  );
});

test("consultation lifecycle and outcomes reuse the approved centralized workflow", () => {
  assert.match(viewSource, /getConsultationLifecycleState/);
  assert.match(viewSource, /getConsultationLifecycleLabel/);
  assert.match(viewSource, /isLegacyStudentConsultation/);
  assert.match(
    viewSource,
    /lifecycle === "outcome_required"[\s\S]*?<ConsultationOutcomeControls/,
  );
  assert.match(viewSource, /request_number/);
  assert.doesNotMatch(viewSource, /markConsultationCompleted|markConsultationNoShow/);
});

test("counselor detail UI contains no profile editing controls", () => {
  const sources = `${pageSource}\n${viewSource}\n${serverSource}`;
  assert.doesNotMatch(
    sources,
    /<input|<textarea|<select|Save profile|Edit profile|counselor notes/i,
  );
  assert.doesNotMatch(
    serverSource,
    /\.(?:insert|update|upsert|delete)\s*\(/,
  );
  assert.doesNotMatch(sources, /service[_ -]?role/i);
  assert.doesNotMatch(sources, /\/student\/profile/);
});

test("directory, schedule, and dashboard link only with trusted student UUIDs", () => {
  assert.match(
    directorySource,
    /href=\{`\$\{DIRECTORY_BASE_PATH\}\/\$\{student\.student_id\}`\}/,
  );
  assert.match(directorySource, /View profile for \$\{studentName\}/);
  assert.match(
    scheduleSource,
    /isStudent360StudentId\(slot\.booking\.student_id\)[\s\S]*?href=\{`\$\{STUDENT_360_BASE_PATH\}\/\$\{slot\.booking\.student_id\}`\}/,
  );
  assert.match(
    dashboardSource,
    /isStudent360StudentId\(slot\.booking\.student_id\)[\s\S]*?href=\{`\$\{STUDENT_360_BASE_PATH\}\/\$\{slot\.booking\.student_id\}`\}/,
  );
  assert.equal(
    scheduleSource.match(/href=\{`\$\{STUDENT_360_BASE_PATH\}/g)?.length,
    2,
  );
  assert.match(
    dashboardSource,
    /isStudent360StudentId\(nextConsultation\.student_id\)/,
  );
  assert.doesNotMatch(querySource, /service[_ -]?role/i);
  assert.doesNotMatch(
    `${directorySource}\n${scheduleSource}\n${dashboardSource}`,
    /\/student\/profile/,
  );
});

test("privacy metadata, errors, and server boundaries expose no sensitive diagnostics", () => {
  assert.match(pageSource, /referrer: "no-referrer"/);
  assert.match(pageSource, /robots: \{ index: false, follow: false \}/);
  assert.match(pageSource, /Student overview is temporarily unavailable\./);
  assert.doesNotMatch(
    `${pageSource}\n${layoutSource}\n${workspaceServerSource}\n${serverSource}\n${contractSource}`,
    /console\.|error\.message|sqlerrm|auth metadata|password|provider/i,
  );
  assert.doesNotMatch(pageSource, /generateMetadata/);
  assert.doesNotMatch(viewSource, /["']use client["']/);
  assert.doesNotMatch(
    viewSource,
    /student-profile-server|supabase\/server|permissions/,
  );
});

test("loading, mobile, and accessible structures are present", () => {
  assert.match(loadingSource, /aria-busy="true"/);
  assert.match(loadingSource, /aria-live="polite"/);
  assert.doesNotMatch(loadingSource, /@kct\.ac\.in|\d{10}|student_id/i);
  assert.equal(viewSource.match(/<h1/g)?.length, 1);
  assert.match(viewSource, /<dl className="student-360-definition-grid">/);
  assert.match(viewSource, /<ul className="student-360-tag-list">/);
  assert.match(viewSource, /aria-label="Consultation history pagination"/);
  assert.match(viewSource, /aria-current="page"/);
  assert.match(viewSource, /← Back to Students/);
  assert.match(styles, /@media \(max-width: 650px\)[\s\S]*?student-360/);
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?student-360-loading-hero/,
  );
});
