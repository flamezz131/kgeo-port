import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const pageSource = read("../../app/student/profile/page.tsx");
const actionSource = read(
  "../../app/actions/student-profile-record-actions.ts",
);
const componentSource = read(
  "../../components/forms/student-profile-optional-sections.tsx",
);
const runtimeSource = read("./optional-records.ts");
const submissionSource = read("./optional-record-submission.ts");
const validationSource = read(
  "../validation/student-optional-records.ts",
);
const optionsSource = read("./options.ts");
const counselorSource = read("../counselor/student-profile.ts");
const counselorViewSource = read(
  "../../components/counselor/student-profile-view.tsx",
);
const completionSource = read("./completion.ts");
const stylesSource = read("../../app/globals.css");
const migrationSource = read(
  "../../../supabase/migrations/202607190002_student_profile_foundation.sql",
);

test("existing schema grants student CRUD and counselor read-only access", () => {
  for (const table of ["student_test_scores", "student_achievements"]) {
    for (const operation of ["select", "insert", "update", "delete"]) {
      assert.match(
        migrationSource,
        new RegExp(
          `create policy ${table}_${operation}_own[\\s\\S]*?${operation}[\\s\\S]*?student_id = \\(select auth\\.uid\\(\\)\\)`,
        ),
      );
    }
    assert.match(
      migrationSource,
      new RegExp(
        `create policy ${table}_select_counselor_all[\\s\\S]*?'counselor'::public\\.user_role`,
      ),
    );
    assert.doesNotMatch(
      migrationSource,
      new RegExp(
        `create policy ${table}_(?:insert|update|delete)_counselor`,
      ),
    );
  }
  assert.match(
    migrationSource,
    /create trigger student_test_scores_10_prepare_insert[\s\S]*?prepare_student_owned_insert/,
  );
  assert.match(
    migrationSource,
    /create trigger student_achievements_30_set_updated_at[\s\S]*?set_profiles_updated_at/,
  );
});

test("all six Server Actions authorize independently and enforce ownership", () => {
  assert.equal(actionSource.match(/await requireStudent\(\)/g)?.length, 6);
  assert.equal(
    actionSource.match(/\.eq\("student_id", user\.id\)/g)?.length,
    4,
  );
  assert.doesNotMatch(actionSource, /formData\.get\(["']student_id/);
  assert.doesNotMatch(actionSource, /service.?role|SUPABASE_SERVICE/i);
  assert.doesNotMatch(actionSource, /console\.(?:log|warn|error)/);
  assert.match(
    actionSource,
    /revalidatePath\(`\/counselor\/students\/\$\{studentId\}`\)/,
  );
  assert.match(actionSource, /revalidatePath\("\/student\/profile"\)/);
  assert.match(actionSource, /revalidatePath\("\/student\/dashboard"\)/);
});

test("student page loads two bounded owned histories in parallel", () => {
  assert.match(pageSource, /await requireStudent\(\)/);
  assert.match(pageSource, /Promise\.all\(\[/);
  assert.equal(
    pageSource.match(/\.eq\("student_id", user\.id\)/g)?.length,
    5,
  );
  assert.match(
    pageSource,
    /\.from\("student_test_scores"\)[\s\S]*?count: "exact"[\s\S]*?\.range\(examRange\.from, examRange\.to\)/,
  );
  assert.match(
    pageSource,
    /\.from\("student_achievements"\)[\s\S]*?count: "exact"[\s\S]*?\.range\(achievementRange\.from, achievementRange\.to\)/,
  );
  assert.match(runtimeSource, /STUDENT_OPTIONAL_RECORD_PAGE_SIZE = 20/);
  assert.match(runtimeSource, /\.max\(STUDENT_OPTIONAL_RECORD_PAGE_SIZE\)/);
  assert.doesNotMatch(pageSource, /\.select\(["']\*["']/);
});

test("runtime validation checks UUID ownership enums dates timestamps IDs and totals", () => {
  for (const pattern of [
    /id: z\.uuid\(\)/,
    /student_id: z\.uuid\(\)/,
    /exam_name: z\.enum\(examNames\)/,
    /achievement_type: z\.enum\(achievementTypes\)/,
    /dateOnlySchema/,
    /timestampSchema/,
    /record\.student_id !== authenticatedStudentId/,
    /uniqueIds\.size !== rows\.data\.length/,
    /z\s*\.number\(\)\s*\.int\(\)\s*\.min\(0\)/,
  ]) {
    assert.match(runtimeSource, pattern);
  }
  assert.doesNotMatch(
    `${runtimeSource}\n${validationSource}\n${submissionSource}`,
    /\bas any\b|:\s*any\b|as unknown as/,
  );
});

test("forms expose optional add edit cancel and confirmed delete workflows", () => {
  assert.match(componentSource, /id="student-exams-heading">Study Abroad Exams</);
  assert.match(componentSource, /id="student-achievements-heading">Achievements</);
  assert.doesNotMatch(componentSource, /Section \d of \d/);
  assert.match(componentSource, /Add exam attempt/);
  assert.match(componentSource, /Save exam changes/);
  assert.match(componentSource, /Add achievement/);
  assert.match(componentSource, /Save achievement changes/);
  assert.match(componentSource, /Cancel edit/);
  assert.match(componentSource, /<details className="optional-record-delete">/);
  assert.match(componentSource, /Delete exam attempt/);
  assert.match(componentSource, /Delete achievement/);
  assert.match(componentSource, /Confirm deletion/);
  assert.match(componentSource, /This cannot be undone/);
});

test("forms provide accessible errors pending states labels tables and mobile structure", () => {
  assert.match(componentSource, /role="alert"/);
  assert.match(componentSource, /role="status"/);
  assert.match(componentSource, /aria-busy=\{pending\}/);
  assert.match(componentSource, /disabled=\{pending\}/);
  assert.match(componentSource, /aria-invalid=/);
  assert.match(componentSource, /<caption>/);
  assert.match(componentSource, /scope="col"/);
  assert.match(componentSource, /scope="row"/);
  assert.match(componentSource, /aria-current="page"/);
  assert.match(componentSource, /aria-label=\{accessibleLabel\}/);
  assert.match(stylesSource, /@media \(max-width: 650px\)[\s\S]*?\.optional-record-table/);
  assert.match(
    stylesSource,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.optional-profile-section/,
  );
  assert.equal(
    componentSource.match(/onActionStart\(\);/g)?.length,
    3,
  );
});

test("student mutations accept only schema fields and never return raw records", () => {
  assert.match(validationSource, /validateFormShape/);
  assert.match(validationSource, /field\.startsWith\("\$ACTION_"\)/);
  assert.match(validationSource, /recordId: z\.uuid/);
  for (const protectedField of [
    "student_id",
    "created_at",
    "updated_at",
    "role",
    "is_active",
  ]) {
    assert.doesNotMatch(
      submissionSource,
      new RegExp(`${protectedField}\\s*:`),
    );
  }
  assert.doesNotMatch(
    submissionSource,
    /message:\s*(?:error|result)\.(?:message|details|hint)/,
  );
});

test("unsupported evidence, level, candidate, and numeric score fields are absent", () => {
  const productionSources = `${pageSource}\n${actionSource}\n${componentSource}\n${submissionSource}`;
  assert.doesNotMatch(
    productionSources,
    /evidence_url|certificate_url|candidate_number|registration_number|maximum_score|percentile|band_score|achievement_level/i,
  );
  assert.match(
    componentSource,
    /File uploads and evidence links are not\s+collected/,
  );
});

test("completion remains database-derived from eleven essential fields", () => {
  assert.match(migrationSource, /11::integer as essential_fields_total/);
  assert.match(
    migrationSource,
    /test_scores_section_started[\s\S]*?achievements_section_started[\s\S]*?essential_fields_completed/,
  );
  assert.doesNotMatch(
    completionSource,
    /testScoresStarted.*percentage|achievementsStarted.*percentage/,
  );
  assert.match(
    componentSource,
    /does\s+not change your essential profile\s+completion/,
  );
  assert.match(
    componentSource,
    /does not change counseling readiness/,
  );
});

test("Counselor Student 360 reuses labels and remains read-only", () => {
  assert.match(counselorSource, /getStudentExamNameLabel/);
  assert.match(counselorSource, /getStudentExamStatusLabel/);
  assert.match(counselorSource, /getStudentAchievementTypeLabel/);
  assert.match(counselorSource, /formatOptionalProfileDate/);
  const examSection = counselorViewSource.slice(
    counselorViewSource.indexOf('id="student-360-exams"'),
    counselorViewSource.indexOf('id="student-360-achievements"'),
  );
  const achievementSection = counselorViewSource.slice(
    counselorViewSource.indexOf('id="student-360-achievements"'),
    counselorViewSource.indexOf("student-360-readonly-note"),
  );
  assert.doesNotMatch(
    `${examSection}\n${achievementSection}`,
    /createStudent|updateStudent|deleteStudent|Edit exam|Delete achievement/,
  );
  assert.match(counselorViewSource, /Student-reported profile is read-only/);
});

test("client optional UI imports no Supabase, permissions, or server loader", () => {
  assert.match(componentSource, /^"use client";/);
  assert.doesNotMatch(
    componentSource,
    /supabase\/server|@\/lib\/permissions|optional-record-submission|server-only/,
  );
  assert.doesNotMatch(
    componentSource,
    /\/counselor\/students|\/student\/profile\?.*(?:score|title|email|name)/,
  );
});

test("central options match the exact database enums", () => {
  for (const value of [
    "ielts",
    "toefl",
    "pte",
    "gre",
    "gmat",
    "gate",
    "other",
    "not_planned",
    "planning",
    "booked",
    "completed",
    "not_required",
    "internship",
    "project",
    "certification",
    "research",
    "publication",
    "award",
    "hackathon",
    "leadership",
    "volunteering",
    "work_experience",
  ]) {
    assert.match(optionsSource, new RegExp(`value: "${value}"`));
  }
});
