import assert from "node:assert/strict";
import "../../test/setup.ts";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function readTree(relativePath: string): string {
  const root = new URL(relativePath, import.meta.url);
  const rootPath = root.pathname.startsWith("/")
    ? decodeURIComponent(root.pathname.slice(1))
    : decodeURIComponent(root.pathname);

  function collect(path: string): string[] {
    return readdirSync(path).flatMap((name) => {
      const child = join(path, name);
      return statSync(child).isDirectory() ? collect(child) : [child];
    });
  }

  return collect(rootPath)
    .filter((path) => /\.(?:ts|tsx)$/.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

const page = read("../../app/counselor/follow-ups/page.tsx");
const loading = read("../../app/counselor/follow-ups/loading.tsx");
const loader = read("./follow-up-workload-server.ts");
const contract = read("./follow-up-workload.ts");
const component = read(
  "../../components/counselor/follow-up-workload.tsx",
);
const actionsComponent = read(
  "../../components/counselor/follow-up-workload-actions.tsx",
);
const serverActions = read(
  "../../app/actions/counselor-private-record-actions.ts",
);
const navigation = read(
  "../../components/counselor/CounselorSidebar.tsx",
);
const student360 = read(
  "../../components/counselor/counselor-private-records.tsx",
);
const styles = read("../../app/globals.css");

test("page and focused loader independently authorize only through requireCounselor", () => {
  assert.equal(page.match(/await requireCounselor\(\)/g)?.length, 1);
  assert.equal(loader.match(/await requireCounselor\(\)/g)?.length, 1);
  assert.doesNotMatch(page + loader, /requireStudent|service[_ -]?role/i);
});

test("workload and identity use one bounded RPC with zero or one reference batch", () => {
  assert.equal(
    loader.match(/\.rpc\(\s*"list_counselor_follow_up_workload"/g)?.length,
    1,
  );
  assert.equal(
    loader.match(/\.rpc\(\s*"get_counselor_consultation_references"/g)?.length,
    1,
  );
  assert.match(loader, /new Set/);
  assert.match(loader, /record\.consultationId/);
  assert.doesNotMatch(
    loader,
    /\.from\("profiles"\)|\.from\("student_profiles"\)|\.from\("counselor_follow_ups"\)|auth\.users/,
  );
  assert.match(contract, /FOLLOW_UP_WORKLOAD_PAGE_SIZE = 25/);
});

test("page has fixed safe filters, global metrics, unavailable handling, and canonical redirects", () => {
  assert.match(page, /<h1>Follow-ups<\/h1>/);
  assert.match(
    page,
    /Track overdue, due-today, upcoming and completed student actions/,
  );
  assert.match(page, /hadInvalidParameters/);
  assert.match(page, /result\.kind === "out_of_range"/);
  assert.match(page, /FOLLOW_UP_WORKLOAD_UNAVAILABLE/);
  for (const label of [
    "Overdue",
    "Due Today",
    "Upcoming",
    "Total Pending",
    "Completed",
    "Cancelled",
  ]) {
    assert.match(component, new RegExp(label));
  }
  assert.match(component, /method="get"/);
  assert.match(component, /name="lifecycle"/);
  assert.match(component, /name="priority"/);
  assert.match(component, /name="search"/);
  assert.match(component, /name="dueFrom"/);
  assert.match(component, /name="dueTo"/);
});

test("desktop table and mobile cards expose equivalent approved workload fields", () => {
  assert.match(component, /<table/);
  assert.match(component, /<caption>/);
  assert.match(component, /follow-up-workload-mobile-list/);
  for (const property of [
    "fullName",
    "collegeEmail",
    "rollNumber",
    "dueDate",
    "priority",
    "nextAction",
    "consultationReference",
    "createdAt",
    "updatedAt",
    "completedAt",
  ]) {
    assert.ok(
      component.match(new RegExp(`record\\.${property}`, "g"))?.length,
      `${property} missing`,
    );
  }
  assert.match(component, /Name not available/);
  assert.match(component, /Not provided/);
  assert.doesNotMatch(component, /record\.details|private note/i);
});

test("pending actions are record-specific and final records cannot mutate", () => {
  assert.match(component, /record\.storedStatus === "pending"/);
  assert.match(actionsComponent, /Mark completed/);
  assert.match(actionsComponent, /Mark cancelled/);
  assert.match(actionsComponent, /Edit pending follow-up/);
  assert.match(actionsComponent, /for \$\{studentLabel\}/);
  assert.match(component, /View Student Profile/);
  assert.match(
    component,
    /Final records cannot be edited, reopened or deleted/,
  );
  assert.doesNotMatch(actionsComponent, /delete|reopen|bulk/i);
  assert.match(actionsComponent, /instance: "desktop" \| "mobile"/);
  assert.match(
    component,
    /<dt>Consultation<\/dt>\s*<dd>\{record\.consultationReference \?\? "Not linked"\}<\/dd>/,
  );
});

test("successful follow-up mutations revalidate workload and trusted Student 360 only", () => {
  assert.match(
    serverActions,
    /state\.status === "success"[\s\S]*?revalidateCounselorPrivateRecords\(studentId\)[\s\S]*?revalidatePath\("\/counselor\/follow-ups"\)/,
  );
  assert.match(
    serverActions,
    /updateCounselorWorkloadFollowUp[\s\S]*?await requireCounselor\(\)/,
  );
  const workloadAction =
    serverActions.match(
      /export async function updateCounselorWorkloadFollowUp[\s\S]*?\n}\n/,
    )?.[0] ?? "";
  assert.match(workloadAction, /\.eq\("counselor_id", user\.id\)/);
  assert.match(workloadAction, /\.eq\("status", "pending"\)/);
  assert.doesNotMatch(
    workloadAction,
    /details|consultation_id|counselor_id:\s|status:\s|completed_at/,
  );
});

test("navigation and Student 360 integration add only safe counselor links", () => {
  assert.match(
    navigation,
    /href: "\/counselor\/follow-ups", label: "Follow-ups"/,
  );
  assert.match(
    navigation,
    /isCounselorNavigationItemActive\(pathname, link\.href\)/,
  );
  assert.doesNotMatch(navigation, /futureItems|Coming soon/i);
  assert.match(
    student360,
    /href="\/counselor\/follow-ups">View all follow-ups/,
  );
  assert.doesNotMatch(
    student360,
    /\/counselor\/follow-ups\?(?:search|name|email|roll)/,
  );
});

test("privacy boundary keeps D2 RPC out of student runtime and private values out of URLs", () => {
  const studentRuntime = readTree("../../app/student");
  assert.doesNotMatch(
    studentRuntime,
    /list_counselor_follow_up_workload|counselor_follow_ups/,
  );
  assert.doesNotMatch(
    page + loader + component + actionsComponent,
    /console\.|error\.message|request_number|service[_ -]?role/i,
  );
  const urlBuilder =
    contract.match(
      /export function buildFollowUpWorkloadUrl[\s\S]*?\n}\n/,
    )?.[0] ?? "";
  assert.doesNotMatch(
    urlBuilder,
    /nextAction|next_action|details|note|email|name|roll|studentId/,
  );
});

test("accessibility and responsive loading contracts are explicit", () => {
  assert.match(page, /<h1>Follow-ups<\/h1>/);
  assert.match(component, /aria-label=\{`\$\{label\}: \$\{metrics\[key\]\}`\}/);
  assert.match(component, /aria-current="page"/);
  assert.match(actionsComponent, /role=\{state\.status === "success" \? "status" : "alert"\}/);
  assert.match(actionsComponent, /aria-busy=/);
  assert.match(actionsComponent, /disabled=/);
  assert.match(loading, /role="status"/);
  assert.match(loading, /aria-busy="true"/);
  assert.doesNotMatch(loading, /student@|View Student|Mark completed/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /follow-up-workload-mobile-list/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
});
