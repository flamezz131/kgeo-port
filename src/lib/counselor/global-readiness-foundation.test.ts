import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/202609020001_global_masters_readiness_index.sql",
    import.meta.url,
  ),
  "utf8",
);

test("readiness rubric has exactly thirteen bounded integer scores totaling 100", () => {
  const maxima = [...migration.matchAll(/_score integer not null check \([^\n]+ between 0 and (\d+)\)/g)].map((match) => Number(match[1]));
  assert.equal(maxima.length, 13);
  assert.equal(maxima.reduce((sum, value) => sum + value, 0), 100);
  assert.deepEqual(maxima, [15, 10, 10, 10, 5, 5, 5, 5, 5, 5, 10, 10, 5]);
});

test("database derives all dimension totals total and readiness band", () => {
  for (const column of [
    "academic_readiness_total",
    "intellectual_depth_total",
    "professional_readiness_total",
    "global_leadership_total",
    "application_strength_total",
    "total_score",
    "readiness_band",
  ]) {
    assert.match(migration, new RegExp(`${column}[^;]*generated always as`, "s"));
  }
  for (const boundary of [50, 65, 75, 85]) {
    assert.match(migration, new RegExp(`>= ${boundary}`));
  }
});

test("assessment history is sealed append-only and revisions are concurrency-safe", () => {
  assert.match(migration, /force row level security/);
  assert.match(migration, /before update or delete on public\.student_global_readiness_assessments/);
  assert.match(migration, /unique \(student_id, revision_number\)/);
  const create = migration.match(/create function public\.create_student_global_readiness_assessment[\s\S]*?\nend;\n\$function\$/)?.[0] ?? "";
  assert.match(create, /from public\.profiles as student_profile[\s\S]*?for update/);
  assert.ok(create.indexOf("for update") < create.indexOf("max(assessment.revision_number)"));
  assert.doesNotMatch(create, /update public\.student_global_readiness_assessments|delete from public\.student_global_readiness_assessments/);
});

test("current Primary Counselor is the only browser authorization path", () => {
  for (const name of [
    "get_primary_counselor_global_readiness_evidence",
    "create_student_global_readiness_assessment",
    "list_primary_counselor_global_readiness_assessments",
    "get_primary_counselor_latest_global_readiness_assessment",
  ]) {
    const body = migration.match(new RegExp(`create function public\\.${name}[\\s\\S]*?\\nend;\\n\\$function\\$`))?.[0] ?? "";
    assert.match(body, /is_active_primary_counselor_for_student\(p_student_id\)/);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}[\\s\\S]*?from public, anon, authenticated, service_role`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}[\\s\\S]*?to authenticated`));
  }
  assert.doesNotMatch(migration, /has_active_verified_kgeo_role\(\s*'(director|admin|student)'/);
});

test("caller assignment context identity time revision totals and band are database-derived", () => {
  const create = migration.match(/create function public\.create_student_global_readiness_assessment[\s\S]*?\nend;\n\$function\$/)?.[0] ?? "";
  assert.match(create, /v_counselor_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(create, /assignment\.counselor_id = v_counselor_id/);
  assert.match(create, /assignment\.ended_at is null/);
  assert.match(create, /private\.build_global_readiness_evidence_snapshot\(p_student_id\)/);
  assert.doesNotMatch(create, /p_(revision|total|band|assessed_by|assignment_id|evidence_snapshot)/);
});

test("missing canonical evidence requires rationale for every non-zero criterion", () => {
  assert.equal(migration.match(/private\.is_valid_global_readiness_rationale\(/g)?.length, 16);
  assert.match(migration, /p_score = 0[\s\S]*?recorded'[\s\S]*?p_rationale is not null/);
  assert.match(migration, /p_rationale !~ '\[\[:cntrl:\]\]'/);
});

test("evidence snapshot is bounded and excludes private material", () => {
  const evidence = migration.match(/create function private\.build_global_readiness_evidence_snapshot[\s\S]*?\n\$function\$/)?.[0] ?? "";
  for (const source of [
    "student_profiles",
    "student_achievements",
    "student_profile_documents",
    "consultation_requests",
    "student_counseling_progressions",
    "student_university_applications",
  ]) assert.match(evidence, new RegExp(`public\\.${source}`));
  assert.match(evidence, /Not recorded \/ no canonical G-MAP record/);
  assert.match(evidence, /Term-by-term academic consistency: Not recorded/);
  assert.doesNotMatch(evidence, /counselor_student_notes|counselor_follow_ups|storage_path|signed_url|document_token|raw_user_meta_data/);
});

test("Phase 1 does not expose Student Director Admin or Parent Report access", () => {
  assert.equal(migration.match(/create policy /g)?.length, 1);
  assert.match(migration, /create policy student_global_readiness_select_current_primary/);
  assert.doesNotMatch(migration, /parent_reports|parent_report_|get_director|grant execute[^;]+to (?:anon|service_role)/);
});

test("migration is one additive transaction and does not replace historical objects", () => {
  assert.match(migration, /^--[\s\S]*?\nbegin;/);
  assert.match(migration, /\ncommit;\s*$/);
  assert.equal(migration.match(/create table public\./g)?.length, 1);
  assert.doesNotMatch(migration, /create or replace|drop table|alter table public\.(?!student_global_readiness_assessments)/);
});
