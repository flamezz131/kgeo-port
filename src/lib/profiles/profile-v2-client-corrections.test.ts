import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) => readFileSync(path, "utf8");
const onboarding = read("src/components/forms/student-profile-onboarding.tsx");
const optionalSections = read("src/components/forms/student-profile-optional-sections.tsx");
const studentPage = read("src/app/student/profile/page.tsx");
const options = read("src/lib/profiles/options.ts");
const validation = read("src/lib/validation/student-profile.ts");
const submission = read("src/lib/profiles/submission.ts");
const counselorContract = read("src/lib/counselor/student-profile.ts");
const counselorView = read("src/components/counselor/student-profile-view.tsx");
const workspaceServer = read("src/lib/counselor/student-workspace-server.ts");
const workspaceSections = read("src/components/counselor/student-workspace-sections.tsx");
const caseOwnershipServer = read("src/lib/counselor/case-ownership-server.ts");
const completion = read("src/lib/profiles/completion.ts");
const migration = read("supabase/migrations/202608250001_student_profile_v2_client_corrections.sql");
const verifier = read("supabase/verification/202608250001_student_profile_v2_client_corrections.sql");
// The My Profile Preferences tab now follows the K-GEO-merge2 contract.
const preferencesMigration = read("supabase/migrations/202609230001_student_preferences_merge2_tab.sql");

test("1 CGPA unavailable option is absent from the current Student UI", () => {
  assert.doesNotMatch(onboarding, /CGPA is not available|name="cgpaUnavailable"/);
  assert.match(onboarding, /name="cgpa"[\s\S]*?required/);
});

test("2 Academic Portfolio precedes Achievements", () => {
  assert.ok(onboarding.indexOf("Academic Portfolio") < onboarding.indexOf("{achievementsSection}"));
});

test("3 Sports achievement is accepted by the strict contract", () => {
  assert.match(migration, /student_achievement_type add value if not exists 'sports'/);
  assert.match(options, /value: "sports", label: "Sports"/);
});

test("4 Sports displays in the Counselor Workspace", () => {
  assert.match(counselorContract, /"sports"/);
  assert.match(counselorView, /getStudent360AchievementTypeLabel/);
});

for (const [number, value, label] of [
  [5, "engineering", "Engineering"], [6, "business", "Business"],
  [7, "psychology", "Psychology"],
] as const) {
  test(`${number} ${label} preference is accepted`, () => {
    assert.match(options, new RegExp(`value: "${value}", label: "${label}"`));
    assert.match(migration, new RegExp(`'${value}'`));
  });
}

test("8 Preferred study level offers the Global Track Programme", () => {
  assert.match(options, /value: "global_track", label: "Global Track Programme"/);
  assert.match(preferencesMigration, /student_preferred_study_level\s+add value if not exists 'global_track'/);
});

test("9 Global Track durations are exact", () => {
  for (const value of ["1_year_abroad", "2_years_abroad"]) {
    assert.match(options, new RegExp(`value: "${value}"`));
    assert.match(preferencesMigration, new RegExp(`'${value}'`));
  }
});

test("10 Global Track requires a duration", () => {
  assert.match(validation, /data\.preferredStudyLevel === "global_track" && !data\.globalTrackDuration/);
  assert.match(onboarding, /studyPathway === "global_track" &&[\s\S]*?name="globalTrackDuration"/);
});

test("11 Global Track Programme values are exact", () => {
  for (const value of [
    "fifteen_day_program",
    "one_year_program",
    "two_year_program",
  ]) {
    assert.match(options, new RegExp(`value: "${value}"`));
    assert.match(migration, new RegExp(`'${value}'`));
  }
});

for (const [number, value, label] of [
  [12, "full_time", "Full time"],
  [13, "part_time", "Part time"],
  [14, "either", "Either"],
] as const) {
  test(`${number} ${label} study mode is offered`, () => {
    const currentModes = options.match(/export const STUDY_MODE_OPTIONS[\s\S]*?\];/)?.[0] ?? "";
    assert.match(currentModes, new RegExp(`value: "${value}", label: "${label}"`));
  });
}

test("14a On-campus and Online are legacy selections no longer enforced", () => {
  assert.match(options, /on_campus: "Legacy selection: On-campus"/);
  assert.match(options, /online: "Legacy selection: Online"/);
  assert.match(preferencesMigration, /drop trigger if exists student_preferences_25_enforce_v2_input/);
});

test("15 Budget range is the current user-facing label", () => {
  assert.match(onboarding, /htmlFor="profileBudgetRange">\s*Budget range\s*</);
});

test("16 Funding Method is a dropdown of every funding method", () => {
  assert.match(onboarding, /htmlFor="profileFundingMethod">\s*Funding Method\s*<\/label>[\s\S]*?<select[\s\S]*?STUDENT_FUNDING_METHOD_OPTIONS\.map/);
  for (const value of [
    "education_loan",
    "scholarship_fully_funded",
    "scholarship_partially_funded",
    "other",
  ]) {
    assert.match(options, new RegExp(`value: "${value}"`));
    assert.match(preferencesMigration, new RegExp(`student_funding_method\\s+add value if not exists '${value}'`));
  }
});

test("17 Self-funded is accepted", () => {
  assert.match(options, /value: "self_funded", label: "Self-funded"/);
  assert.match(submission, /funding_method: validation\.data\.fundingMethod/);
});

test("18 Entrance Exams terminology is removed from the Student Profile UI", () => {
  assert.doesNotMatch(`${studentPage}\n${optionalSections}`, /Entrance Exams/i);
});

test("19 Study Abroad Exams terminology is shown", () => {
  assert.match(optionalSections, /Study Abroad Exams/);
  assert.match(workspaceSections, /Study Abroad Exams/);
});

test("20 DMAT is accepted separately from GMAT", () => {
  assert.match(options, /value: "gmat", label: "GMAT"[\s\S]*?value: "dmat", label: "DMAT"/);
  assert.match(migration, /student_exam_name add value if not exists 'dmat'/);
});

test("21 existing exam history create edit and delete remain composed", () => {
  for (const action of ["createStudentTestScore", "updateStudentTestScore", "deleteStudentTestScore"]) {
    assert.match(optionalSections, new RegExp(action));
  }
});

test("22 Counselor reads all newly structured Student values", () => {
  for (const field of ["preferred_study_area", "preferred_domain", "study_pathway", "global_track_program", "study_mode", "budget_range", "funding_method"]) {
    assert.match(counselorContract, new RegExp(field));
    assert.match(workspaceServer, new RegExp(field));
  }
});

test("23 covering and former Counselors do not gain full Profile access", () => {
  assert.match(workspaceServer, /verifyPrimaryCounselorCaseAccess/);
  assert.match(caseOwnershipServer, /get_my_primary_counselor_case_access/);
  assert.match(caseOwnershipServer, /parseCounselorCaseAccess\(data\) === "primary"/);
});

test("24 existing Profile Documents remain untouched and separate", () => {
  assert.match(studentPage, /StudentProfileDocuments/);
  assert.match(verifier, /PROFILE_DOCUMENTS_UNCHANGED/);
  assert.doesNotMatch(migration, /alter table (?:public\.)?student_profile_documents|storage\.objects/i);
});

test("25 existing profile insert and update save path remains functional", () => {
  assert.match(submission, /chooseInsertOrUpdate\(store, payload, payload\)/);
  assert.match(submission, /cgpa_unavailable: false/);
});

test("26 completion remains deterministic and legacy-compatible", () => {
  assert.match(completion, /const TOTAL_ESSENTIAL_FIELDS = 11/);
  assert.match(completion, /overall_completion_percentage/);
  assert.match(migration, /create or replace view public\.student_profile_completion/);
  assert.match(migration, /preference\.study_pathway is not null[\s\S]*?preference\.preferred_study_level is not null/);
  assert.match(migration, /11::integer as essential_fields_total/);
});

test("27 absent Preferred Study Area resolves safely without regtype 42704", () => {
  assert.match(migration, /to_regtype\([\s\S]*?'public\.student_preferred_study_area'[\s\S]*?\)::oid/);
  assert.match(migration, /if v_type_oid is null then[\s\S]*?create type public\.student_preferred_study_area/);
});

test("28 an existing exact Preferred Study Area enum is accepted and reused", () => {
  assert.match(migration, /where enum_value\.enumtypid = v_type_oid[\s\S]*?array\['engineering', 'business', 'psychology'\]::text\[\]/);
});

test("29 an existing mismatched Preferred Study Area enum fails closed", () => {
  assert.match(migration, /v_actual_labels is distinct from[\s\S]*?errcode = '55000'[\s\S]*?Preferred Study Area type does not match/);
});

test("30 every optional enum type has a safe lookup and conditional create path", () => {
  for (const typeName of [
    "student_preferred_study_area",
    "student_preferred_domain",
    "student_study_pathway",
    "student_global_track_program",
    "student_funding_method",
  ]) {
    assert.match(migration, new RegExp(`to_regtype\\([\\s\\S]*?'public\\.${typeName}'`));
    assert.match(migration, new RegExp(`create type public\\.${typeName} as enum`));
  }
});

test("31 no optional new Profile V2 type uses an unsafe direct regtype cast", () => {
  for (const typeName of [
    "student_preferred_study_area",
    "student_preferred_domain",
    "student_study_pathway",
    "student_global_track_program",
    "student_funding_method",
  ]) {
    const unsafe = new RegExp(`['\"]public\\.${typeName}['\"]::(?:pg_catalog\\.)?regtype`);
    assert.doesNotMatch(migration, unsafe);
    assert.doesNotMatch(verifier, unsafe);
  }
});

test("32 the read-only verifier resolves all optional enum types safely", () => {
  for (const typeName of [
    "student_preferred_study_area",
    "student_preferred_domain",
    "student_study_pathway",
    "student_global_track_program",
    "student_funding_method",
  ]) {
    assert.match(verifier, new RegExp(`to_regtype\\('public\\.${typeName}'\\)`));
  }
  assert.match(verifier, /begin transaction read only/);
  assert.doesNotMatch(verifier, /\b(?:insert|update|delete|alter|create|drop|grant|revoke)\b/i);
});

test("33 final Profile V2 preference rules are exact", () => {
  assert.match(migration, /student_preferences_study_area_domain_check/);
  assert.match(migration, /array\['masters_degree', 'global_track'\]::text\[\]/);
  assert.match(migration, /student_preferences_study_pathway_check/);
  assert.match(migration, /array\['self_funded'\]::text\[\]/);
});

test("34 verifier returns strict booleans when optional metadata is absent", () => {
  assert.match(verifier, /CURRENT_STUDY_MODES_INSTALLED'[\s\S]*?coalesce\([\s\S]*?false\)/);
  assert.match(verifier, /V2_ENUMS_EXACT'[\s\S]*?coalesce\(/);
  assert.match(verifier, /select check_name, coalesce\(passed, false\) as passed/);
  assert.doesNotMatch(verifier, /pg_catalog\.(?:coalesce|extract)\s*\(/i);
});
