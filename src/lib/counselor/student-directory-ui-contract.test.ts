import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const pageSource = read("../../app/counselor/students/page.tsx");
const loadingSource = read("../../app/counselor/students/loading.tsx");
const componentSource = read(
  "../../components/counselor/student-directory.tsx",
);
const serverSource = read("./student-directory-server.ts");
const navigationSource = read(
  "../../components/counselor/CounselorSidebar.tsx",
);
const dashboardSource = read("../../app/counselor/dashboard/page.tsx");
const styleSource = read("../../app/globals.css");

test("page and focused loader independently repeat counselor authorization", () => {
  assert.match(pageSource, /await requireCounselor\(\)/);
  assert.match(pageSource, /loadCounselorStudentDirectory/);
  assert.ok(
    serverSource.indexOf("await requireCounselor()") <
      serverSource.indexOf("const query = parseStudentDirectoryQuery"),
  );
});

test("server loader uses only the authenticated named directory RPC", () => {
  assert.match(serverSource, /supabase\.rpc\(\s*"list_counselor_student_directory"/);
  assert.match(serverSource, /return \{ data, error \}/);
  assert.doesNotMatch(serverSource, /\.from\(|createClient|service[_ -]?role/i);
  assert.doesNotMatch(serverSource, /console\.|personal_email|mobile_number|cgpa/i);
});

test("page handles out-of-range, unavailable, and ready states safely", () => {
  assert.match(pageSource, /result\.kind === "out_of_range"/);
  assert.match(pageSource, /redirect\(result\.redirectTo\)/);
  assert.match(
    pageSource,
    /Student directory is temporarily unavailable\./,
  );
  assert.doesNotMatch(
    pageSource,
    /result\.error|error\.message|sqlstate|list_counselor_student_directory\(/i,
  );
});

test("directory search URLs use a route-local no-referrer policy", () => {
  assert.match(pageSource, /referrer: "no-referrer"/);
  assert.doesNotMatch(componentSource, /href=["']https?:\/\//i);
});

test("GET filter form exposes every approved control with associated labels", () => {
  assert.match(componentSource, /method="get"/);
  for (const field of [
    "q",
    "college",
    "course",
    "department",
    "graduationYear",
    "active",
    "profileState",
    "interest",
    "studyLevel",
    "targetIntake",
    "sort",
  ]) {
    assert.match(componentSource, new RegExp(`name="${field}"`));
  }
  assert.doesNotMatch(componentSource, /type="hidden"|name="pageSize"/);
  assert.match(componentSource, /Apply filters/);
  assert.match(componentSource, /Clear filters/);
  assert.match(componentSource, /query\.hadInvalidParameters/);
  assert.match(
    componentSource,
    /Some invalid or duplicate filter values were ignored\./,
  );
});

test("desktop table, mobile cards, progress, and pagination are accessible", () => {
  assert.match(componentSource, /<caption>/);
  assert.match(componentSource, /scope="col"/);
  assert.match(componentSource, /scope="row"/);
  assert.match(componentSource, /aria-label="Registered students"/);
  assert.match(componentSource, /role="progressbar"/);
  assert.match(componentSource, /aria-valuenow=\{percentage\}/);
  assert.match(componentSource, /aria-label="Student directory pagination"/);
  assert.match(componentSource, /aria-current="page"/);
  assert.match(componentSource, /aria-disabled="true"/);
});

test("empty states are distinct and filtered emptiness offers recovery", () => {
  const resultsSource = componentSource.slice(
    componentSource.indexOf("export function StudentDirectoryResults"),
  );
  assert.match(
    componentSource,
    /No student accounts are available yet\./,
  );
  assert.match(
    componentSource,
    /No students match the selected search or filters\./,
  );
  assert.match(componentSource, /result\.query\.hasFilters/);
  assert.match(componentSource, /href=\{DIRECTORY_BASE_PATH\}/);
  assert.ok(
    resultsSource.indexOf("<DirectorySummary result={result} />") <
      resultsSource.indexOf("result.students.length === 0"),
  );
});

test("summary metrics distinguish global matching count from current-page counts", () => {
  assert.match(componentSource, /label: "Total matching students"/);
  assert.match(componentSource, /value: result\.totalCount/);
  assert.match(componentSource, /scope: "All matching records"/);
  assert.equal(
    componentSource.match(/scope: "Current page"/g)?.length,
    3,
  );
});

test("directory exposes only an authorized UUID detail link, not private profile fields", () => {
  const directorySources = `${pageSource}\n${componentSource}\n${serverSource}`;
  assert.doesNotMatch(
    directorySources,
    /personal_email|mobile_number|cgpa|backlogs|academic_remarks|preferred_countries|preferred_program_areas|test_scores|achievements|consultation_notes|documents|auth metadata/i,
  );
  assert.doesNotMatch(directorySources, /href=["'{`]\/student\/profile/i);
  assert.match(
    componentSource,
    /href=\{`\$\{DIRECTORY_BASE_PATH\}\/\$\{student\.student_id\}`\}/,
  );
  assert.match(
    componentSource,
    /aria-label=\{`View profile for \$\{studentName\}`\}/,
  );
  assert.doesNotMatch(
    componentSource,
    /\/counselor\/students\/\$\{student\.(?:full_name|college_email|roll_number)\}/,
  );
});

test("Students is a real, active counselor navigation link", () => {
  assert.match(
    navigationSource,
    /href: "\/counselor\/students", label: "Students"/,
  );
  assert.match(
    navigationSource,
    /isCounselorNavigationItemActive\(pathname, link\.href\)/,
  );
  assert.doesNotMatch(navigationSource, /futureItems|aria-disabled="true"/);
});

test("dashboard and schedule behavior are not coupled to the directory RPC", () => {
  assert.doesNotMatch(
    dashboardSource,
    /list_counselor_student_directory|\/student\/profile/,
  );
  assert.doesNotMatch(pageSource, /consultation|schedule/i);
});

test("loading skeleton is private, responsive, and reduced-motion safe", () => {
  assert.match(loadingSource, /aria-busy="true"/);
  assert.match(loadingSource, /aria-live="polite"/);
  assert.doesNotMatch(loadingSource, /@kct\.ac\.in|roll number|student_id/i);
  assert.match(styleSource, /\.directory-mobile-list/);
  assert.match(styleSource, /@media \(max-width: 900px\)/);
  assert.match(
    styleSource,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.directory-loading-controls/,
  );
});

test("table cells retain native table-cell layout semantics", () => {
  assert.doesNotMatch(
    styleSource,
    /\.directory-table tbody th,[\s\S]{0,120}display:\s*grid/,
  );
  assert.match(
    styleSource,
    /\.directory-table tbody th strong,[\s\S]*?display:\s*block/,
  );
});

test("directory remains server-rendered without importing server modules into a client component", () => {
  assert.doesNotMatch(componentSource, /["']use client["']/);
  assert.doesNotMatch(
    componentSource,
    /student-directory-server|supabase\/server|permissions/,
  );
  assert.doesNotMatch(pageSource, /["']use client["']/);
});
