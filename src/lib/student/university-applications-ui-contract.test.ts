import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const page = read("../../app/student/dashboard/page.tsx");
const loading = read("../../app/student/dashboard/loading.tsx");
const component = read(
  "../../components/student/university-applications-section.tsx",
);
const server = read("./university-application-server.ts");
const runtime = read("./university-applications.ts");
const options = read("../counselor/university-applications.ts");
const styles = read("../../app/globals.css");
const docs = read("../../../docs/database.md");
const permissions = read("../permissions/index.ts");
const accessTests = read("../permissions/student-access.test.ts");
const migrationPath = new URL(
  "../../../supabase/migrations/202607280001_student_university_application_read_foundation.sql",
  import.meta.url,
);
const readinessPath = new URL(
  "../../../supabase/verification/pre_phase_c2_readiness.sql",
  import.meta.url,
);

test("E1.3.1 migration and readiness SQL remain byte-identical", () => {
  assert.equal(
    createHash("sha256")
      .update(readFileSync(migrationPath))
      .digest("hex"),
    "3209de9d8bae1a8a2762fc9e539f3193cb9db2e6bd520cf60b420d85ea0d8875",
  );
  assert.equal(
    createHash("sha256")
      .update(readFileSync(readinessPath))
      .digest("hex"),
    "21ff407489dee1fa637f2c44efe50c253ea41f03293b425bedc5f7a12d06ab01",
  );
});

test("dashboard places the read-only section after profile and before consultations", () => {
  const profileIndex = page.indexOf('aria-labelledby="profile-progress-heading"');
  const applicationIndex = page.indexOf(
    "<StudentUniversityApplicationsSection",
  );
  const consultationIndex = page.indexOf(
    'aria-labelledby="my-consultations-heading"',
  );
  assert.ok(profileIndex >= 0);
  assert.ok(applicationIndex > profileIndex);
  assert.ok(consultationIndex > applicationIndex);
  assert.match(page, /<Suspense fallback=\{<StudentUniversityApplicationsSkeleton \/>}/);
});

test("server loader independently authorizes before one zero-argument RPC call", () => {
  const authorizationIndex = server.indexOf("await requireStudent()");
  const rpcIndex = server.indexOf(
    'supabase.rpc(\n      "get_my_university_applications",\n    )',
  );
  assert.ok(authorizationIndex >= 0);
  assert.ok(rpcIndex > authorizationIndex);
  assert.equal(
    server.match(/"get_my_university_applications"/g)?.length,
    1,
  );
  assert.doesNotMatch(server, /\.from\(/);
  assert.doesNotMatch(server, /p_student_id|p_application_id|studentId/);
  assert.match(server, /^import "server-only";/);
});

test("authoritative authorization denies every non-active-verified-student case", () => {
  assert.match(permissions, /await supabase\.auth\.getUser\(\)/);
  assert.match(permissions, /if \(userError \|\| !user\)/);
  assert.match(permissions, /if \(!user\.email_confirmed_at\)/);
  assert.match(permissions, /getStudentAccessDecision/);
  for (const deniedCase of [
    "unauthenticated",
    "unverified",
    "counselor",
    "admin",
    "director",
    "inactive student",
    "profile is missing",
    "profile query failure",
  ]) {
    assert.match(accessTests, new RegExp(deniedCase));
  }
});

test("section exposes the required copy and distinct ready, empty and error states", () => {
  assert.match(component, /My university applications/);
  assert.match(
    component,
    /These application statuses are updated by the K-GEO counseling[\s\S]*?tracked separately from your overall counseling[\s\S]*?progression\./,
  );
  assert.match(component, /result\.kind === "unavailable"/);
  assert.match(component, /role="alert"/);
  assert.match(runtime, /University applications are temporarily unavailable\./);
  assert.match(component, /Please try again later\./);
  assert.match(
    component,
    /No university applications have been added yet\./,
  );
  assert.match(
    component,
    /Your K-GEO counselor will add application details/,
  );
  assert.match(
    component,
    /result\.kind === "unavailable"[\s\S]*?result\.applications\.length === 0/,
  );
  assert.match(component, /journeyResult\.kind === "unavailable"/);
  assert.match(
    component,
    /Offer, fee, and visa progress is temporarily unavailable\./,
  );
});

test("cards are semantic, read-only and expose only approved student values", () => {
  assert.match(component, /<ul className="student-university-application-list">/);
  assert.match(component, /<li key=\{application\.applicationId\}>/);
  assert.match(component, /<article className="student-university-application-card">/);
  assert.match(component, /Primary application/);
  assert.match(component, /Submission deadline/);
  assert.match(component, /Not added/);
  assert.match(component, /Not submitted yet/);
  assert.match(component, /Last updated/);
  assert.match(component, /<time dateTime=/);
  assert.doesNotMatch(
    component,
    /<button|<form|<a\b|href=|action=|Edit|Change status|Set primary|Archive|Delete|Restore|View history|Open portal|Reference number/,
  );
});

test("status labels and descriptions are student-safe and neutral", () => {
  for (const label of [
    "Planning",
    "Documents collecting",
    "Application preparing",
    "Ready to submit",
    "Submitted",
    "Under university review",
    "Additional information requested",
    "Decision received",
    "Withdrawn",
    "Closed",
  ]) {
    assert.match(options, new RegExp(label));
  }
  assert.match(
    runtime,
    /A university decision has been recorded\. Contact the counseling team for guidance\./,
  );
  assert.doesNotMatch(
    component + runtime,
    /Offer received|Rejected|Admitted|Scholarship granted/,
  );
});

test("strict runtime validation covers bounds, semantics, privacy and full-precision ordering", () => {
  for (const pattern of [
    /canonicalUuidPattern/,
    /normalizeUniversityApplicationText/,
    /UNIVERSITY_APPLICATION_COUNTRY_CODE_PATTERN/,
    /UNIVERSITY_APPLICATION_DEGREE_LEVELS/,
    /UNIVERSITY_APPLICATION_INTAKE_TERMS/,
    /UNIVERSITY_APPLICATION_STATUSES/,
    /UNIVERSITY_APPLICATION_INTAKE_YEAR_MIN/,
    /dateOnlySchema/,
    /parseUniversityApplicationTimestamp/,
    /UNIVERSITY_APPLICATION_STUDENT_READ_LIMIT/,
    /applicationIds\.has/,
    /primaryCount > 1/,
    /compareStudentApplications/,
    /BigInt/,
  ]) {
    if (pattern.source === "BigInt") {
      assert.match(
        read("../counselor/university-application-management.ts"),
        pattern,
      );
    } else {
      assert.match(runtime, pattern);
    }
  }
  assert.match(runtime, /\.strict\(\)/);
  assert.doesNotMatch(runtime, /Date\.parse/);
  assert.doesNotMatch(
    runtime + server,
    /\bas any\b|:\s*any\b|as unknown as|@ts-ignore|@ts-expect-error/,
  );
});

test("loading skeletons are neutral, accessible and contain no fake application data", () => {
  assert.match(component, /aria-busy="true"/);
  assert.match(component, /role="status"/);
  assert.match(component, /aria-hidden="true"/);
  assert.match(loading, /StudentUniversityApplicationsSkeleton/);
  assert.match(loading, /Loading your dashboard&hellip;/);
  assert.doesNotMatch(
    loading,
    /University of|Master of|Planning|Primary application|March 2027/,
  );
});

test("responsive and reduced-motion styling prevents narrow-screen overflow", () => {
  assert.match(
    styles,
    /\.student-university-application-list[\s\S]*?grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/,
  );
  assert.match(
    styles,
    /@media \(max-width: 650px\)[\s\S]*?\.student-university-application-list,[\s\S]*?grid-template-columns: 1fr/,
  );
  assert.match(styles, /overflow-wrap: anywhere/);
  assert.match(styles, /min-width: 0/);
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.student-university-applications \*[\s\S]*?animation: none/,
  );
  assert.match(
    styles,
    /\.student-university-application-status > span \{[\s\S]*?color: #475569;/,
  );
});

test("production boundary has no direct table, history, mutation, progression or secret path", () => {
  const production = [loading, component, server, runtime].join("\n");
  assert.doesNotMatch(
    production,
    /student_university_applications|student_university_application_events|\.from\(/,
  );
  assert.doesNotMatch(
    page,
    /student_university_applications|student_university_application_events/,
  );
  assert.doesNotMatch(
    production,
    /create_student_university_application|update_student_university_application_details|record_student_university_application_status|set_primary_student_university_application|archive_student_university_application/,
  );
  assert.doesNotMatch(
    production,
    /record_student_counseling_progression|student_counseling_progressions|student_counseling_progression_events/,
  );
  assert.doesNotMatch(
    production,
    /service[_-]?role|auth\.admin|console\.(?:log|warn|error)|"use server"|Server Action/,
  );
  assert.doesNotMatch(
    component + server,
    /application_reference|portal_url|archive_reason|archived_by|created_by|last_changed_by|version_number|student_id|event history|counselor identity|email/i,
  );
  assert.doesNotMatch(component, /^"use client";/);
});

test("documentation records the complete E1.3.2 privacy and read-only contract", () => {
  for (const phrase of [
    "Phase E1.3.2 student read-only university applications UI",
    "get_my_university_applications",
    "nonarchived",
    "read-only",
    "portal URLs",
    "application references",
    "event history",
    "maximum of 100",
    "official counseling progression",
    "E1.4 has not started",
  ]) {
    assert.match(docs, new RegExp(phrase, "i"));
  }
  assert.match(
    docs,
    /result-validation failures[\s\S]*?localized section error/,
  );
  assert.match(
    docs,
    /account-state[\s\S]*?fail closed through the authoritative `requireStudent\(\)`[\s\S]*?do not reveal whether applications exist/,
  );
  assert.doesNotMatch(
    docs,
    /authorization failures produce a\s+localized section error/,
  );
});
