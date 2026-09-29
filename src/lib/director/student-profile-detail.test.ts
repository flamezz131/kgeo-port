import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown,
) => unknown;
const { registerHooks } = require("node:module") as {
  registerHooks: (hooks: { resolve: ResolveHook }) => void;
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/counselor/global-readiness") {
      return {
        shortCircuit: true,
        url: new URL("../counselor/global-readiness.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const { parseDirectorStudentCaseDetail } = require(
  "./student-profile-detail.ts",
) as typeof import("./student-profile-detail");
const { createDirectorStudentDiagnostic } = require(
  "./student-profile-diagnostics.ts",
) as typeof import("./student-profile-diagnostics");

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const migration = read(
  "../../../supabase/migrations/202609180001_director_student_profile_detail.sql",
);
const loader = read("./student-profile-server.ts");
const detailModel = read("./student-profile-detail.ts");
const diagnostics = read("./student-profile-diagnostics.ts");
const component = read("../../components/director/director-student-profile.tsx");
const list = read("../../components/director/director-operational-oversight.tsx");
const page = read("../../app/director/students/[student-id]/page.tsx");
const evidenceRoute = read(
  "../../app/director/students/[student-id]/achievements/[achievement-id]/evidence/[document-id]/view/route.ts",
);
const documentRoute = read(
  "../../app/director/students/[student-id]/documents/[document-id]/view/route.ts",
);
const packageJson = JSON.parse(read("../../../package.json")) as {
  scripts: Record<string, string>;
};

function functionSql(name: string): string {
  const start = migration.indexOf(`create function public.${name}`);
  assert.notEqual(start, -1, `${name} must exist`);
  const end = migration.indexOf("\n$function$;", start);
  assert.notEqual(end, -1, `${name} must terminate`);
  return migration.slice(start, end);
}

test("Director can open the exact protected Student 360 route from oversight", () => {
  assert.match(list, /href=\{\`\/director\/students\/\$\{student\.studentId\}\`\}/);
  assert.match(page, /loadDirectorStudentProfile\(studentId\)/);
  assert.match(page, /if \(result\.kind === "not_found"\) notFound\(\)/);
  assert.match(page, /dynamic = "force-dynamic"/);
  assert.match(page, /fetchCache = "force-no-store"/);
  assert.match(loader, /await requireDirector\(\)/);
});

test("every new database projection independently verifies an authenticated active Director", () => {
  for (const name of [
    "get_director_student_identity",
    "list_director_student_achievement_documents",
    "authorize_director_student_achievement_document_view",
    "list_director_student_profile_documents",
    "authorize_director_student_profile_document_view",
    "get_director_student_case_detail",
  ]) {
    const sql = functionSql(name);
    assert.match(sql, /\(select auth\.uid\(\)\) is null/);
    assert.match(
      sql,
      /has_active_verified_kgeo_role\('director'::public\.user_role\)/,
    );
    assert.match(sql, /security definer/);
    assert.match(sql, /set search_path = ''/);
  }
  assert.match(
    migration,
    /revoke all on function public\.%s from public, anon, authenticated, service_role/,
  );
  assert.match(
    migration,
    /grant execute on function public\.%s to authenticated/,
  );
});

test("Director sees preserved profile, academics, preferences, exams, and achievements", () => {
  for (const table of [
    "student_profiles",
    "student_preferences",
    "student_profile_completion",
    "student_test_scores",
    "student_achievements",
  ]) {
    assert.match(loader, new RegExp(`\\.from\\("${table}"\\)`));
  }
  for (const heading of [
    "Overview",
    "Academic Portfolio",
    "Higher-Studies Preferences",
    "Study Abroad Exams",
    "Achievements",
  ]) {
    assert.match(component, new RegExp(heading));
  }
});

test("Director sees Achievement Evidence and Profile Documents only through signed-view routes", () => {
  assert.match(loader, /list_director_student_achievement_documents/);
  assert.match(loader, /list_director_student_profile_documents/);
  assert.match(component, /Achievement Evidence/);
  assert.match(component, /Profile Documents/);
  for (const route of [evidenceRoute, documentRoute]) {
    assert.match(route, /await requireDirector\(\)/);
    assert.match(route, /createSignedUrl/);
    assert.match(route, /NextResponse\.redirect\(signedResult\.data\.signedUrl, 307\)/);
    assert.match(route, /private, no-store/);
    assert.match(route, /Referrer-Policy/);
    assert.doesNotMatch(route, /upload|remove\(|delete|service.role/i);
  }
  assert.doesNotMatch(component, /storage_path|bucket_id|signedUrl|token=/);
});

test("Director reuses Eligibility read RPC and receives no Eligibility mutation", () => {
  assert.match(loader, /get_director_latest_student_eligibility_assessment/);
  assert.match(component, /Eligibility Assessment/);
  assert.doesNotMatch(component, /save_student_eligibility|type="submit"/);
});

test("Director sees safe Progress and parent-safe semester summaries", () => {
  const sql = functionSql("get_director_student_case_detail");
  assert.match(sql, /student_counseling_progressions/);
  assert.match(sql, /student_counseling_progression_events/);
  assert.match(sql, /counselor_student_semester_summaries/);
  assert.match(component, /Journey and Progress/);
  assert.match(component, /Parent-safe semester summaries/);
});

test("Director sees read-only Application Journey and bounded history", () => {
  const sql = functionSql("get_director_student_case_detail");
  assert.match(sql, /student_university_applications/);
  assert.match(sql, /student_university_application_journeys/);
  assert.match(sql, /student_university_application_journey_events/);
  for (const field of [
    "University decision",
    "Offer",
    "Student decision",
    "Fee/payment",
    "Visa",
    "Enrollment",
    "Journey history",
  ]) {
    assert.match(component, new RegExp(field));
  }
  assert.doesNotMatch(component, /record_university_application_journey/);
});

test("Director sees latest Global Readiness, all dimensions, criteria, evidence summary, and history", () => {
  const sql = functionSql("get_director_student_case_detail");
  assert.match(sql, /student_global_readiness_assessments/);
  assert.match(sql, /'scores'/);
  assert.match(sql, /'rationales'/);
  assert.match(sql, /'dimensionTotals'/);
  assert.match(sql, /'evidenceSnapshot'/);
  assert.match(component, /GLOBAL_READINESS_DIMENSIONS/);
  assert.match(component, /GLOBAL_READINESS_CRITERIA/);
  assert.match(component, /13 criterion scores and rationales/);
  assert.doesNotMatch(component, /create_student_global_readiness_assessment/);
});

test("Director sees consultation history and current Primary Counselor read-only", () => {
  const sql = functionSql("get_director_student_case_detail");
  assert.match(sql, /consultation_requests/);
  assert.match(sql, /assigned_counselor_id/);
  assert.match(sql, /student_counselor_assignments/);
  assert.match(component, /Consultation History/);
  assert.match(component, /Primary Counselor/);
  assert.match(component, /Open assignment management/);
  assert.doesNotMatch(component, /record_consultation_outcome/);
});

test("Director sees student Parent Reports and reaches the existing editable workflow", () => {
  const sql = functionSql("get_director_student_case_detail");
  assert.match(sql, /public\.parent_reports/);
  assert.match(component, /Open report workspace/);
  assert.match(component, /\/director\/reports\/\$\{report\.reportId\}/);
  assert.match(component, /Preview final PDF/);
  assert.match(component, /\/director\/reports\/\$\{report\.reportId\}\/pdf/);
  assert.match(component, /only Student-case workflow editable by Directors/);
});

test("Director Student 360 exposes no ordinary case mutation controls", () => {
  assert.doesNotMatch(
    component,
    /type="submit"|<form|upload|delete|save|verify achievement/i,
  );
  assert.doesNotMatch(
    `${loader}\n${detailModel}`,
    /record_|create_|update_|delete_|remove_|upload_/,
  );
});

test("case projection excludes private notes, follow-ups, commentary, paths, tokens, and debug metadata", () => {
  const sql = functionSql("get_director_student_case_detail");
  for (const forbidden of [
    /counselor_student_notes/,
    /counselor_follow_ups/,
    /\bstorage_path\b/,
    /\bbucket_id\b/,
    /\bsigned_url\b/,
    /auth\.users/,
    /raw_user_meta_data/,
    /changed_by/,
    /change_reason/,
  ]) {
    assert.doesNotMatch(sql, forbidden);
  }
  assert.doesNotMatch(component, /privateRecords|note_text|next_action/);
  assert.match(component, /private notes, private follow-ups/);
});

test("Director projections cannot be called by Students, Counselors, or anonymous users", () => {
  assert.doesNotMatch(migration, /p_director_id|p_actor_id/);
  assert.doesNotMatch(migration, /'student'::public\.user_role[\s\S]*?is true/);
  assert.doesNotMatch(migration, /'counselor'::public\.user_role[\s\S]*?is true/);
  assert.match(
    migration,
    /revoke all on function public\.%s from public, anon, authenticated, service_role/,
  );
});

test("Director Student 360 tests are registered in the npm test lifecycle", () => {
  assert.match(
    `${packageJson.scripts.pretest ?? ""} ${packageJson.scripts.test ?? ""}`,
    /src\/lib\/director\/student-profile-detail\.test\.ts/,
  );
});

function emptyCasePayload(): Record<string, unknown> {
  return {
    progress: {
      current: null,
      history: [],
      semesterSummaries: [],
    },
    applications: [],
    readinessAssessments: [],
    consultations: [],
    primaryCounselor: null,
    parentReports: [],
  };
}

test("empty and explicitly nullable optional case fields parse as empty ready sections", () => {
  const empty = parseDirectorStudentCaseDetail(emptyCasePayload());
  for (const section of Object.values(empty)) {
    assert.equal(section.status, "ready");
  }

  const nullable = parseDirectorStudentCaseDetail({
    progress: {
      current: null,
      history: null,
      semesterSummaries: null,
    },
    applications: null,
    readinessAssessments: null,
    consultations: null,
    primaryCounselor: null,
    parentReports: null,
  });
  assert.deepEqual(nullable.progress, {
    status: "ready",
    data: { current: null, history: [] },
  });
  assert.deepEqual(nullable.semesterSummaries, {
    status: "ready",
    data: [],
  });
  assert.deepEqual(nullable.applications, { status: "ready", data: [] });
  assert.deepEqual(nullable.readinessAssessments, {
    status: "ready",
    data: [],
  });
  assert.deepEqual(nullable.consultations, { status: "ready", data: [] });
  assert.deepEqual(nullable.primaryCounselor, {
    status: "ready",
    data: null,
  });
  assert.deepEqual(nullable.parentReports, { status: "ready", data: [] });

  const nullProgressPayload = emptyCasePayload();
  nullProgressPayload.progress = null;
  const nullProgress = parseDirectorStudentCaseDetail(nullProgressPayload);
  assert.deepEqual(nullProgress.progress, {
    status: "ready",
    data: { current: null, history: [] },
  });
  assert.deepEqual(nullProgress.semesterSummaries, {
    status: "ready",
    data: [],
  });
});

test("a nullable application history is normalized without hiding the application", () => {
  const payload = emptyCasePayload();
  payload.applications = [
    {
      applicationId: "11111111-1111-4111-8111-111111111111",
      universityName: "Example University",
      programmeName: "Example Programme",
      countryCode: "GB",
      degreeLevel: "masters",
      intakeTerm: "fall",
      intakeYear: 2027,
      applicationStatus: "planning",
      submissionDeadline: null,
      submittedAt: null,
      isPrimary: false,
      isArchived: false,
      lastChangedAt: "2026-09-18T12:00:00+05:30",
      journey: {
        universityDecision: "pending",
        universityDecisionDate: null,
        offerStatus: "none",
        offerDate: null,
        conditionalOfferRequirements: null,
        conditionDueDate: null,
        conditionsSatisfiedDate: null,
        studentDecision: "pending",
        studentDecisionDate: null,
        feeStatus: "not_started",
        feePaymentDate: null,
        visaStatus: "not_started",
        visaSubmissionDate: null,
        visaDecisionDate: null,
        enrollmentStatus: "not_enrolled",
        enrollmentDate: null,
        versionNumber: 0,
        updatedAt: null,
      },
      history: null,
    },
  ];

  const parsed = parseDirectorStudentCaseDetail(payload);
  assert.equal(parsed.applications.status, "ready");
  if (parsed.applications.status === "ready") {
    assert.equal(parsed.applications.data.length, 1);
    assert.deepEqual(parsed.applications.data[0]?.history, []);
  }
});

test("one malformed case subsection does not invalidate its siblings", () => {
  const malformedApplications = emptyCasePayload();
  malformedApplications.applications = [{ applicationId: "invalid" }];
  const applicationResult = parseDirectorStudentCaseDetail(
    malformedApplications,
  );
  assert.equal(applicationResult.applications.status, "unavailable");
  assert.equal(applicationResult.progress.status, "ready");
  assert.equal(applicationResult.readinessAssessments.status, "ready");
  assert.equal(applicationResult.consultations.status, "ready");
  assert.equal(applicationResult.parentReports.status, "ready");

  const malformedReadiness = emptyCasePayload();
  malformedReadiness.readinessAssessments = [{ assessmentId: "invalid" }];
  const readinessResult = parseDirectorStudentCaseDetail(malformedReadiness);
  assert.equal(
    readinessResult.readinessAssessments.status,
    "unavailable",
  );
  assert.equal(readinessResult.applications.status, "ready");
  assert.equal(readinessResult.progress.status, "ready");

  const malformedCounselor = emptyCasePayload();
  malformedCounselor.primaryCounselor = { assignmentId: "invalid" };
  const counselorResult = parseDirectorStudentCaseDetail(malformedCounselor);
  assert.equal(counselorResult.primaryCounselor.status, "unavailable");
  assert.equal(counselorResult.parentReports.status, "ready");
});

test("a missing case payload marks only case-derived sections unavailable", () => {
  const parsed = parseDirectorStudentCaseDetail(null);
  for (const section of Object.values(parsed)) {
    assert.equal(section.status, "unavailable");
  }
});

test("loader and UI preserve the core boundary and distinguish errors from empty states", () => {
  assert.match(loader, /Promise\.allSettled/);
  assert.match(loader, /if \(core\.kind !== "ready"\)/);
  assert.match(loader, /status: "unavailable"/);
  assert.match(component, /function SectionUnavailable/);
  assert.match(component, />\s*Temporarily unavailable\s*</);
  assert.match(component, /status === "unavailable"/);
  assert.match(component, /No available Achievement Evidence/);
  assert.match(component, /No approved Profile Documents/);
  assert.match(component, /No university applications/);
  assert.match(component, /No consultation history/);
});

test("safe diagnostics log only section, code, and sanitized message", () => {
  const diagnostic = createDirectorStudentDiagnostic("Readiness", {
    code: "PGRST202",
    message:
      "Could not find get_director_student_case_detail in the schema cache.",
    details: { private: "must not be returned" },
    hint: "must not be returned",
  });
  assert.deepEqual(Object.keys(diagnostic), [
    "section",
    "error_code",
    "error_message",
  ]);
  assert.equal(diagnostic.section, "Readiness");
  assert.equal(diagnostic.error_code, "PGRST202");
  assert.match(diagnostic.error_message, /get_director_student_case_detail/);
  assert.doesNotMatch(diagnostic.error_message, /must not be returned/);
  for (const sensitiveValue of [
    "https://example.test?token=unsafe",
    "11111111-1111-4111-8111-111111111111",
    "student@kct.ac.in",
    "private/student/file.pdf",
    "Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature",
    "secret=unsafe",
    "9876543210",
  ]) {
    const sanitized = createDirectorStudentDiagnostic("Readiness", {
      code: "PGRST202",
      message: `Failure: ${sensitiveValue}`,
    });
    assert.doesNotMatch(
      sanitized.error_message,
      new RegExp(sensitiveValue.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
  }
  assert.match(loader, /console\.error\(createDirectorStudentDiagnostic/);
  assert.match(diagnostics, /error_code:/);
  assert.match(diagnostics, /error_message:/);
  assert.match(diagnostics, /redacted-token/);
  assert.match(diagnostics, /redacted-path/);
  assert.doesNotMatch(loader, /console\.error\([^)]*result\.data/);
  assert.doesNotMatch(loader, /console\.error\([^)]*routeStudentId/);
});
