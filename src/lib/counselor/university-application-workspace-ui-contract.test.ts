import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const page = read("../../app/counselor/applications/page.tsx");
const loading = read("../../app/counselor/applications/loading.tsx");
const component = read(
  "../../components/counselor/university-application-workspace.tsx",
);
const loader = read("./university-application-workspace-server.ts");
const workspace = read("./university-application-workspace.ts");
const navigation = read("../../components/counselor/CounselorSidebar.tsx");
const styles = read("../../app/globals.css");
const documentation = read("../../../docs/database.md");

test("route authorizes before parsing and loading and is never statically cached", () => {
  const implementation = page.slice(page.indexOf("export default async function"));
  assert.match(
    implementation,
    /await requireCounselor\(\)[\s\S]*await loadCounselorUniversityApplicationWorkspace/,
  );
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /fetchCache = "force-no-store"/);
  assert.match(page, /referrer: "no-referrer"/);
  assert.doesNotMatch(page, /generateStaticParams|revalidate\s*=/);
});

test("invalid and out-of-range URL states fail closed without exposing details", () => {
  assert.match(page, /result\.kind === "invalid"/);
  assert.match(page, /No\s+application data was loaded\./);
  assert.match(page, /result\.list\?\.pageBeyondRange/);
  assert.match(page, /redirect\(buildUniversityApplicationWorkspaceUrl/);
  assert.doesNotMatch(page, /error\.message|sqlstate|console\./i);
  assert.match(workspace, /Object\.keys\(input\)[\s\S]*allowedNames/);
  assert.match(workspace, /Array\.isArray\(value\)/);
  assert.match(workspace, /UNIVERSITY_APPLICATION_WORKSPACE_PAGE_SIZES/);
});

test("server loader calls exactly the two approved RPCs once and no tables", () => {
  assert.equal(
    loader.match(/"list_counselor_university_application_workspace"/g)?.length,
    1,
  );
  assert.equal(
    loader.match(/"get_counselor_university_application_workspace_metrics"/g)
      ?.length,
    1,
  );
  assert.match(workspace, /Promise\.all\(/);
  assert.match(workspace, /parseUniversityApplicationWorkspaceListResponse/);
  assert.match(workspace, /parseUniversityApplicationWorkspaceMetricsResponse/);
  assert.doesNotMatch(loader, /\.from\(|service[_ -]?role|console\./i);
});

test("workspace is server rendered with every approved GET control", () => {
  assert.doesNotMatch(component, /["']use client["']/);
  assert.match(component, /method="get"/);
  for (const name of [
    "q",
    "status",
    "country",
    "degree",
    "intakeTerm",
    "intakeYear",
    "primary",
    "archive",
    "deadline",
    "sort",
    "pageSize",
  ]) {
    assert.match(component, new RegExp(`name="${name}"`));
  }
  assert.match(component, /maxLength=\{200\}/);
  assert.match(component, /Maximum 100 Unicode characters/);
  assert.match(component, /aria-describedby="application-workspace-q-hint"/);
  assert.match(component, /max=\{2100\}/);
  assert.match(component, /min=\{2020\}/);
  assert.match(component, /Clear search/);
});

test("desktop table and mobile cards share the strictly parsed server data", () => {
  assert.match(component, /<ApplicationTable entries=\{list\.entries\}/);
  assert.match(component, /<ApplicationCards entries=\{list\.entries\}/);
  assert.match(component, /<caption>University application workspace results<\/caption>/);
  assert.match(component, /scope="col"/);
  assert.match(component, /scope="row"/);
  assert.match(styles, /\.application-workspace-mobile-list/);
  assert.match(styles, /@media \(max-width: 1000px\)/);
  assert.match(styles, /@media \(max-width: 520px\)/);
});

test("presentation exposes only approved workspace fields and Student 360 action", () => {
  for (const approved of [
    "studentFullName",
    "collegeEmail",
    "rollNumber",
    "universityName",
    "programmeName",
    "countryCode",
    "degreeLevel",
    "intakeTerm",
    "intakeYear",
    "currentStatus",
    "applicationReference",
    "submissionDeadline",
    "submittedAt",
    "isPrimary",
    "isArchived",
    "lastChangedAt",
    "availableDocumentCount",
  ]) {
    assert.match(component, new RegExp(`application\\.${approved}`));
  }
  assert.match(component, /Open Student 360/);
  assert.match(component, /STUDENT_360_BASE_PATH/);
  assert.doesNotMatch(
    `${page}\n${component}\n${loader}`,
    /personalEmail|mobileNumber|portalUrl|storagePath|originalFileName|archiveReason|changedBy|noteText|followUp|progressionEvidence|signedUrl/i,
  );
  assert.doesNotMatch(component, /\/counselor\/applications\/\$\{/);
});

test("workspace remains read-only and has no client persistence or data mutation", () => {
  const sources = `${page}\n${component}\n${loader}`;
  assert.doesNotMatch(
    sources,
    /Server Action|useActionState|useTransition|localStorage|sessionStorage|\.insert\(|\.update\(|\.delete\(|createStudent|archiveStudent|setPrimary|upload|signed URL/i,
  );
  assert.doesNotMatch(component, /type="file"|method="post"/i);
});

test("metrics list and unavailable states remain independent and bounded", () => {
  assert.match(component, /Application metrics are temporarily unavailable\./);
  assert.match(component, /The application list can still be reviewed below\./);
  assert.match(component, /Applications are temporarily unavailable\./);
  assert.match(component, /No active applications exist yet\./);
  assert.match(component, /No archived applications were found\./);
  assert.match(component, /No applications match this search\./);
  assert.match(component, /No applications match the selected filters\./);
  assert.match(component, /Lifecycle metrics use active applications; archived total is separate/);
  assert.match(component, /label: "Clear search"/);
  assert.match(component, /label: "Reset filters"/);
});

test("pagination uses RPC total count and preserves route-local query state", () => {
  assert.match(component, /getUniversityApplicationWorkspacePagination/);
  assert.match(component, /Page \{pagination\.currentPage\} of \{pagination\.pageCount\}/);
  assert.match(component, /aria-label="Application workspace pagination"/);
  assert.match(component, /aria-current="page"/);
  assert.match(workspace, /new URLSearchParams\(\)/);
  assert.match(workspace, /UNIVERSITY_APPLICATION_WORKSPACE_BASE_PATH/);
  assert.doesNotMatch(workspace, /https?:\/\//);
});

test("Applications navigation is active and no Coming soon placeholder remains", () => {
  assert.match(
    navigation,
    /href: "\/counselor\/applications", label: "Applications"/,
  );
  assert.match(
    navigation,
    /isCounselorNavigationItemActive\(pathname, link\.href\)/,
  );
  assert.doesNotMatch(navigation, /futureItems|Coming soon/);
});

test("loading and accessibility contracts avoid private data and motion", () => {
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /aria-live="polite"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /role="status"/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)[\s\S]*application-workspace-page/);
  assert.doesNotMatch(loading, /@kct\.ac\.in|studentId|applicationReference/);
});

test("documentation records the E1.4.2 read-only UI boundary", () => {
  assert.match(documentation, /Phase E1\.4\.2/);
  assert.match(documentation, /read-only counselor Applications workspace/i);
  assert.match(documentation, /No mutation/i);
  assert.match(documentation, /E1\.4\.1 list and metrics RPCs/i);
  assert.match(documentation, /E1\.4\.2 does not modify SQL/i);
});
