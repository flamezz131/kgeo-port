import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path: string): string { return readFileSync(new URL(path, import.meta.url), "utf8"); }
const component = read("../../components/director/director-operational-oversight.tsx");
const navigation = read("../../components/director/DirectorSidebar.tsx");
const portalSidebar = read("../../components/shell/portal-sidebar.tsx");
const server = read("./operational-oversight-server.ts");
const styles = read("../../app/globals.css");
const packageSource = read("../../../package.json");
const pages = ["students", "consultations", "applications", "counselors"].map((route) => read(`../../app/director/${route}/page.tsx`));
const loadingPages = ["students", "consultations", "applications", "counselors"].map((route) => read(`../../app/director/${route}/loading.tsx`));
const production = [component, navigation, server, ...pages, ...loadingPages].join("\n");

function oversightView(
  componentName: string,
  nextComponentName: string,
  mobileLabel: string,
): { desktop: string; mobile: string } {
  const section = component.match(
    new RegExp(`export function ${componentName}\\b[\\s\\S]*?(?=export function ${nextComponentName}\\b)`),
  )?.[0] ?? "";
  const desktopStart = section.indexOf('<div className="director-oversight-table-wrapper">');
  const mobileStart = section.indexOf(
    `<ul className="director-oversight-mobile" aria-label="${mobileLabel}">`,
  );
  assert.notEqual(desktopStart, -1, `${componentName} desktop table is missing`);
  assert.notEqual(mobileStart, -1, `${componentName} mobile cards are missing`);
  return {
    desktop: section.slice(desktopStart, mobileStart),
    mobile: section.slice(mobileStart),
  };
}

function assertFieldParity(
  view: { desktop: string; mobile: string },
  recordName: string,
  fields: readonly string[],
): void {
  for (const field of fields) {
    const access = `${recordName}.${field}`;
    const accessPattern = new RegExp(`\\b${recordName}\\.${field}\\b`);
    assert.match(view.desktop, accessPattern, `${access} is missing from desktop`);
    assert.match(view.mobile, accessPattern, `${access} is missing from mobile`);
  }
}

test("all four routes are protected server views with no-store metadata", () => {
  assert.equal((server.match(/await requireDirector\(\)/g) ?? []).length, 4);
  for (const page of pages) {
    assert.match(page, /robots: \{ index: false, follow: false \}/);
    assert.match(page, /referrer: "no-referrer"/);
    assert.match(page, /dynamic = "force-dynamic"/);
    assert.match(page, /fetchCache = "force-no-store"/);
  }
  assert.doesNotMatch(server, /createClient|service_role|\.from\(/);
});

test("navigation exposes only real Director routes and marks the active page", () => {
  for (const route of ["dashboard", "students", "consultations", "applications", "counselors", "reports"]) {
    assert.match(navigation, new RegExp(`/director/${route}`));
  }
  assert.match(navigation, /usePathname\(\)/);
  assert.match(
    portalSidebar,
    /aria-current=\{link\.active \? "page" : undefined\}/,
  );
  assert.doesNotMatch(navigation, /Settings|Edit/);
});

test("oversight lists use semantic desktop tables and field-equivalent mobile cards", () => {
  assert.equal((component.match(/<table className="director-oversight-table">/g) ?? []).length, 4);
  assert.equal((component.match(/<caption>/g) ?? []).length, 4);
  assert.match(component, /<th scope="row">/);
  assert.match(component, /director-oversight-mobile/);
  assert.match(styles, /@media \(max-width: 760px\)[\s\S]*?director-oversight-table-wrapper[\s\S]*?display: none[\s\S]*?director-oversight-mobile[\s\S]*?display: grid/);

  assertFieldParity(
    oversightView(
      "DirectorStudentsOversight",
      "DirectorConsultationsOversight",
      "Student oversight results",
    ),
    "student",
    [
      "collegeEmail", "fullName", "course", "department", "graduationYear",
      "isActive", "accountCreatedAt", "profileState", "progressionState",
      "progressionStage", "openConsultations", "totalConsultations",
      "activeApplications",
    ],
  );
  assertFieldParity(
    oversightView(
      "DirectorConsultationsOversight",
      "DirectorApplicationsOversight",
      "Consultation oversight results",
    ),
    "item",
    [
      "requestNumber", "submittedAt", "studentCollegeEmail", "studentFullName",
      "counselorCollegeEmail", "counselorFullName", "consultationDate",
      "slotStart", "slotEnd", "consultationStatus", "outcomeRecordedAt",
    ],
  );
  assertFieldParity(
    oversightView(
      "DirectorApplicationsOversight",
      "DirectorCounselorsOversight",
      "Application oversight results",
    ),
    "item",
    [
      "studentCollegeEmail", "studentFullName", "universityName", "programmeName",
      "countryCode", "degreeLevel", "intakeTerm", "intakeYear",
      "applicationStatus", "isPrimary", "isArchived", "submissionDeadline",
      "counselorCollegeEmail", "counselorFullName", "lastChangedAt",
    ],
  );
  assertFieldParity(
    oversightView(
      "DirectorCounselorsOversight",
      "DirectorOversightLoading",
      "Counselor workload results",
    ),
    "item",
    [
      "collegeEmail", "counselorFullName", "isActive", "consultationsToday",
      "pendingOutcomes", "pendingFollowUps", "overdueFollowUps",
    ],
  );
});

test("loading empty invalid and unavailable states are explicit and safe", () => {
  for (const loading of loadingPages) assert.match(loading, /DirectorOversightLoading/);
  assert.match(component, /aria-busy="true"/);
  assert.match(component, /aria-live="polite"/);
  assert.match(component, /No matching records/);
  assert.match(component, /Filters could not be used/);
  assert.match(component, /temporarily unavailable/);
  assert.doesNotMatch(production, /error\.message|error\.details|error\.hint|sqlstate/i);
});

test("filters and pagination are server-driven and bounded", () => {
  assert.match(component, /method="get"/);
  assert.match(component, /maxLength=\{100\}/);
  assert.match(component, /Oversight results pages/);
  assert.match(server, /DIRECTOR_OVERSIGHT_PAGE_SIZE/);
  assert.match(server, /DIRECTOR_COUNSELOR_LIMIT/);
  assert.doesNotMatch(production, /useEffect|fetch\(|axios|dangerouslySetInnerHTML/);
});

test("Director UI remains read-only and excludes private operational content", () => {
  assert.doesNotMatch(production, /counselor_student_notes|raw_(?:user|app)_meta_data|auth\.users|SUPABASE_SECRET_KEY|sb_secret|service_role/i);
  assert.doesNotMatch(production, /next_action|note_text|private_note|document contents|application_reference|portal_url/i);
  assert.doesNotMatch(component, /type="submit">(?:Edit|Update|Delete|Assign|Record|Create)/);
  assert.match(component, /Read-only oversight/);
  for (const mobile of component.match(/<ul className="director-oversight-mobile"[\s\S]*?<\/ul>/g) ?? []) {
    assert.doesNotMatch(
      mobile,
      /next_action|note_text|private_note|application_reference|portal_url|document|storage|raw_(?:user|app)_meta_data/i,
    );
  }
});

test("focused A1.3 tests run in the normal project suite", () => {
  const script = JSON.parse(packageSource).scripts.test as string;
  for (const name of ["operational-oversight-foundation.test.ts", "operational-oversight.test.ts", "operational-oversight-ui-contract.test.ts"]) {
    assert.match(script, new RegExp(name.replaceAll(".", "\\.")));
  }
});
