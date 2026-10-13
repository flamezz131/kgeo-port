import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function hash(relativePath: string, normalizeLineEndings = false): string {
  const source = read(relativePath);
  return createHash("sha256")
    .update(normalizeLineEndings ? source.replace(/\r\n/g, "\n") : source)
    .digest("hex");
}

const pageSource = read("../../app/director/dashboard/page.tsx");
const layoutSource = read("../../app/director/layout.tsx");
const loadingSource = read("../../app/director/dashboard/loading.tsx");
const componentSource = read(
  "../../components/director/director-dashboard.tsx",
);
const navigationSource = read(
  "../../components/director/DirectorSidebar.tsx",
);
const portalSidebarSource = read(
  "../../components/shell/portal-sidebar.tsx",
);
const serverSource = read("./dashboard-server.ts");
const dashboardSource = read("./dashboard.ts");
const permissionsSource = read("../permissions/index.ts");
const roleRedirectSource = read("../auth/role-redirect.ts");
const proxySource = read("../../proxy.ts");
const styleSource = read("../../app/globals.css");
const packageSource = read("../../../package.json");

const directorProductionSource = [
  pageSource,
  layoutSource,
  loadingSource,
  componentSource,
  navigationSource,
  serverSource,
  dashboardSource,
].join("\n");

test("the Director route uses the established protected role-route convention", () => {
  assert.match(roleRedirectSource, /director: "\/director\/dashboard"/);
  assert.match(proxySource, /"\/director\/:path\*"/);
  assert.match(layoutSource, /await requireDirector\(\)/);
  assert.match(serverSource, /await requireDirector\(\)/);
  assert.match(pageSource, /await loadDirectorDashboard\(\)/);
  assert.match(
    permissionsSource,
    /getDirectorAccessDecision\(user, directorProfile\)/,
  );
  for (const route of ["dashboard", "students", "consultations", "applications", "counselors", "reports"]) {
    assert.match(navigationSource, new RegExp(`/director/${route}`));
  }
  assert.match(navigationSource, /usePathname\(\)/);
  // The active page is marked by the shared rail every portal renders through.
  assert.match(
    portalSidebarSource,
    /aria-current=\{link\.active \? "page" : undefined\}/,
  );
  assert.doesNotMatch(navigationSource, /Settings/);
});

test("the server loader authorizes then starts only the three approved RPCs", () => {
  assert.ok(
    serverSource.indexOf("await requireDirector()") <
      serverSource.indexOf("await Promise.all"),
  );
  assert.equal((serverSource.match(/supabase\.rpc\(/g) ?? []).length, 3);
  for (const rpcName of [
    "get_director_dashboard_metrics",
    "list_director_counselor_workload",
    "list_director_attention_items",
  ]) {
    assert.match(serverSource, new RegExp(`supabase\\.rpc\\("${rpcName}"`));
  }
  assert.match(serverSource, /DIRECTOR_WORKLOAD_LIMIT = 20/);
  assert.match(serverSource, /DIRECTOR_ATTENTION_LIMIT = 25/);
  assert.match(serverSource, /p_limit: DIRECTOR_WORKLOAD_LIMIT/);
  assert.match(serverSource, /p_limit: DIRECTOR_ATTENTION_LIMIT/);
  assert.doesNotMatch(serverSource, /\.from\(|createClient|service_role/);
});

test("RPC results pass through strict DTO parsers and independent safe states", () => {
  assert.match(serverSource, /parseDirectorDashboardMetrics/);
  assert.match(serverSource, /parseDirectorCounselorWorkload/);
  assert.match(serverSource, /parseDirectorAttentionItems/);
  assert.match(serverSource, /metricsResult\.data\.length !== 1/);
  assert.match(serverSource, /catch \{\s*return \{ status: "error" \}/);
  assert.doesNotMatch(
    `${serverSource}\n${componentSource}`,
    /error\.message|result\.error\.(?:message|details|hint|code)|sqlstate/i,
  );
  assert.match(componentSource, /temporarily unavailable/);
  assert.match(componentSource, /Please refresh the page and try again/);
});

test("the dashboard intentionally separates primary and secondary metrics", () => {
  assert.match(dashboardSource, /primaryMetricDefinitions/);
  assert.match(dashboardSource, /secondaryMetricGroupDefinitions/);
  assert.match(componentSource, /Primary metrics/);
  assert.match(componentSource, /Secondary metrics/);
  assert.match(componentSource, /metric\.value/);
  assert.match(dashboardSource, /Consultation flow/);
  assert.match(dashboardSource, /Student progression/);
  assert.match(dashboardSource, /Applications and follow-ups/);
  assert.doesNotMatch(componentSource, /chart|canvas|svg/i);
});

test("attention rendering is bounded accessible and limited to approved kinds", () => {
  for (const kind of [
    "overdue_application_deadline",
    "due_soon_application_deadline",
    "additional_information_requested",
    "pending_consultation_outcome",
  ]) {
    assert.match(dashboardSource, new RegExp(kind));
  }
  assert.match(componentSource, /High priority/);
  assert.match(componentSource, /Medium priority/);
  assert.match(componentSource, /aria-hidden="true">!<\/span>/);
  assert.match(componentSource, /<time dateTime=/);
  assert.match(componentSource, /<strong>Next step<\/strong>/);
  assert.match(componentSource, /Up to 25 items/);
  assert.doesNotMatch(
    dashboardSource,
    /overdue_follow_up'|item_follow_up|private_note|note_body/,
  );
});

test("counselor workload uses a semantic desktop table and mobile cards", () => {
  assert.match(componentSource, /<table className="director-workload-table">/);
  assert.match(componentSource, /<caption>/);
  assert.match(componentSource, /<th scope="col">Counselor<\/th>/);
  assert.match(componentSource, /<th scope="row">/);
  assert.match(componentSource, /director-workload-mobile/);
  assert.match(componentSource, /Active" : "Inactive/);
  assert.match(componentSource, /Up to 20 counselors/);
  assert.doesNotMatch(componentSource, /assigned students|application workload/i);
});

test("zero empty loading and failure states are explicit", () => {
  assert.match(componentSource, /No Director attention items/);
  assert.match(componentSource, /No counselor workload available/);
  assert.match(componentSource, /role="status"/);
  assert.match(componentSource, /role="alert"/);
  assert.match(loadingSource, /aria-busy="true"/);
  assert.match(loadingSource, /aria-live="polite"/);
  assert.match(loadingSource, /Loading operational overview/);
  assert.doesNotMatch(componentSource, /metric\.value \|\||metric\.value \?/);
});

test("the Director runtime preserves the approved privacy boundary", () => {
  assert.doesNotMatch(
    directorProductionSource,
    /counselor_student_notes|student_university_application_documents|raw_app_meta_data|raw_user_meta_data|auth\.users|service_role|sb_secret|SUPABASE_SECRET_KEY|dangerouslySetInnerHTML|execute\s+format/i,
  );
  assert.doesNotMatch(
    directorProductionSource,
    /follow_up\.(?:description|details|next_action)|note\.(?:body|content)|private note content/i,
  );
  assert.doesNotMatch(componentSource, />\{item\.(?:studentId|applicationId|consultationId)\}</);
  assert.doesNotMatch(componentSource, /hard-coded Director|@kclas\.ac\.in/i);
});

test("responsive and reduced-motion styles retain critical information", () => {
  assert.match(styleSource, /\.director-workload-table-wrapper/);
  assert.match(styleSource, /\.director-workload-mobile/);
  assert.match(
    styleSource,
    /@media \(max-width: 760px\)[\s\S]*?\.director-workload-table-wrapper[\s\S]*?display: none[\s\S]*?\.director-workload-mobile[\s\S]*?display: grid/,
  );
  assert.match(
    styleSource,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.director-page \*/,
  );
  assert.doesNotMatch(styleSource, /\.director[^\n]*text-overflow:\s*ellipsis/);
});

test("existing Student Counselor and Admin shells remain independent", () => {
  for (const source of [
    read("../../app/student/layout.tsx"),
    read("../../app/counselor/layout.tsx"),
    read("../../app/admin/layout.tsx"),
  ]) {
    assert.doesNotMatch(source, /DirectorDashboard|requireDirector|\/director\//);
  }
});

test("A1.1 through A1.1.2 migrations remain immutable and readiness is reviewed", () => {
  const migrations = {
    "202608060001_director_dashboard_read_foundation.sql":
      "1179d59e46ba49904efe5bf610705aff6338dc52e92dd0b00ed57ad6630a0303",
    "202608060002_director_identity_bootstrap_support.sql":
      "944e1fc3d71c93d983f41efc244e8814f2c489c47627a89c85f5339d56d83b8c",
    "202608060003_staff_identity_provisioning.sql":
      "2f3a4780c9056cb619e58e9c50ad4d0dd96063550faec68585ee1585b69573b0",
    "202608070001_staff_provisioning_trigger_ambiguity_fix.sql":
      "ef5ac6f499b680245565a287bc7115901895d559297b3f96106c66a8789f972a",
  } as const;

  for (const [migration, expectedHash] of Object.entries(migrations)) {
    assert.equal(hash(`../../../supabase/migrations/${migration}`), expectedHash);
  }
  assert.equal(
    hash("../../../supabase/verification/pre_phase_c2_readiness.sql", true),
    "21ff407489dee1fa637f2c44efe50c253ea41f03293b425bedc5f7a12d06ab01",
  );
});

test("focused A1.2 tests are registered in the normal project suite", () => {
  const testScript = JSON.parse(packageSource).scripts.test as string;
  assert.match(testScript, /src\/lib\/director\/dashboard-ui-contract\.test\.ts/);
  assert.match(testScript, /src\/lib\/permissions\/director-access\.test\.ts/);
});
