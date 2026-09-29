import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/202608220001_student_eligibility_assessment.sql",
    import.meta.url,
  ),
  "utf8",
);
const stepTwo = readFileSync(
  new URL(
    "../../../supabase/migrations/202608210002_counselor_student_workspace_read_security.sql",
    import.meta.url,
  ),
  "utf8",
);

test("Step 4 is one complete forward-only transaction", () => {
  assert.match(migration, /^--[\s\S]*?\nbegin;/);
  assert.match(migration, /\ncommit;\s*$/);
  assert.equal(migration.match(/create table public\./g)?.length, 1);
  assert.match(migration, /create table public\.student_eligibility_assessments/);
  assert.doesNotMatch(migration, /alter table public\.(?!student_eligibility_assessments)/);
});

test("all seven assessment dimensions use exact typed enums", () => {
  const contracts = {
    student_eligibility_status: ["needs_review", "eligible", "conditionally_eligible", "not_yet_eligible"],
    student_eligibility_academic_status: ["needs_review", "meets_requirement", "conditionally_meets", "does_not_meet"],
    student_eligibility_backlog_status: ["needs_review", "clear", "acceptable", "concern"],
    student_eligibility_english_readiness: ["needs_review", "ready", "in_progress", "required"],
    student_eligibility_aptitude_readiness: ["needs_review", "ready", "in_progress", "not_required", "required"],
    student_eligibility_profile_strength: ["needs_review", "strong", "good", "developing", "weak"],
    student_eligibility_application_readiness: ["needs_review", "ready", "partially_ready", "not_ready"],
  } as const;
  for (const [name, values] of Object.entries(contracts)) {
    const body = migration.match(
      new RegExp(`create type public\\.${name} as enum \\(([\\s\\S]*?)\\);`),
    )?.[1] ?? "";
    assert.deepEqual(
      [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]),
      values,
    );
    assert.match(migration, new RegExp(`alter type public\\.${name} owner to postgres`));
  }
});

test("assessment rows are append-only with permanent assessor and time", () => {
  assert.match(migration, /assessed_by uuid not null[\s\S]*?references public\.profiles/);
  assert.match(migration, /assessed_at timestamptz not null default pg_catalog\.statement_timestamp\(\)/);
  assert.match(migration, /before update or delete on public\.student_eligibility_assessments/);
  assert.match(migration, /Eligibility Assessment history is immutable/);
  assert.doesNotMatch(migration, /update public\.student_eligibility_assessments|delete from public\.student_eligibility_assessments/);
});

test("save RPC derives identity and time and only inserts a new revision", () => {
  const save = migration.match(
    /create function public\.save_student_eligibility_assessment[\s\S]*?\nend;\n\$function\$/,
  )?.[0] ?? "";
  assert.match(save, /v_counselor_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(save, /v_assessed_at := pg_catalog\.clock_timestamp\(\)/);
  assert.match(save, /assessed_by,[\s\S]*?v_counselor_id/);
  assert.match(save, /assessed_at[\s\S]*?v_assessed_at/);
  assert.match(save, /insert into public\.student_eligibility_assessments/);
  assert.doesNotMatch(save, /p_assessed_by|p_assessed_at|\bupdate\b|\bdelete\b/);
});

test("save serializes with reassignment before rechecking current ownership", () => {
  const save = migration.match(
    /create function public\.save_student_eligibility_assessment[\s\S]*?\nend;\n\$function\$/,
  )?.[0] ?? "";
  assert.ok(save.indexOf("from public.profiles as student_profile") < save.indexOf("is_active_primary_counselor_for_student"));
  assert.match(save, /for key share/);
  assert.match(save, /student_profile\.role = 'student'::public\.user_role/);
  assert.match(save, /is_active_primary_counselor_for_student\(p_student_id\)[\s\S]*?is distinct from true/);
});

test("Director Student admin anonymous and former Counselor cannot mutate", () => {
  const save = migration.match(
    /create function public\.save_student_eligibility_assessment[\s\S]*?\nend;\n\$function\$/,
  )?.[0] ?? "";
  assert.match(save, /is_active_primary_counselor_for_student/);
  assert.doesNotMatch(save, /has_active_verified_kgeo_role\(\s*'(?:director|admin|student)'/);
  assert.match(migration, /revoke all on function public\.save_student_eligibility_assessment\([\s\S]*?from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.save_student_eligibility_assessment\([\s\S]*?to authenticated/);
  assert.doesNotMatch(migration, /create policy[\s\S]*?for insert|create policy[\s\S]*?for update|create policy[\s\S]*?for delete/);
});

test("country intake and summary contracts are normalized and bounded twice", () => {
  assert.match(migration, /pg_catalog\.cardinality\(p_countries\) <= 10/);
  assert.match(migration, /pg_catalog\.char_length\(country\.value\) not between 1 and 80/);
  assert.match(migration, /count\(distinct pg_catalog\.lower\(country\.value\)\)/);
  assert.match(migration, /student_eligibility_assessments_intake_check[\s\S]*?between 1 and 40/);
  assert.match(migration, /student_eligibility_assessments_summary_check[\s\S]*?between 1 and 1500/);
  assert.ok((migration.match(/\[\[:cntrl:\]\]/g)?.length ?? 0) >= 5);
});

test("RLS exposes history only to current Primary Counselor or active Director", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /student_eligibility_assessments_select_primary_counselor[\s\S]*?is_active_primary_counselor_for_student/);
  assert.match(migration, /student_eligibility_assessments_select_director[\s\S]*?has_active_verified_kgeo_role\([\s\S]*?'director'/);
  assert.doesNotMatch(migration, /student_eligibility_assessments_select_(?:student|admin|anon)/);
  assert.match(migration, /revoke all on table public\.student_eligibility_assessments[\s\S]*?from public, anon, authenticated, service_role/);
  assert.doesNotMatch(migration, /grant (?:select|insert|update|delete) on table public\.student_eligibility_assessments/);
});

test("Counselor history and latest reads independently enforce Primary ownership", () => {
  for (const functionName of [
    "get_counselor_student_eligibility_assessments",
    "get_counselor_latest_student_eligibility_assessment",
  ]) {
    const body = migration.match(
      new RegExp(`create function public\\.${functionName}[\\s\\S]*?\\nend;\\n\\$function\\$`),
    )?.[0] ?? "";
    assert.match(body, /is_active_primary_counselor_for_student\(p_student_id\)/);
    assert.match(body, /is distinct from true/);
  }
  assert.match(migration, /p_limit integer default 20/);
  assert.match(migration, /p_limit < 1 or p_limit > 20/);
});

test("latest selection is deterministic and history keeps human assessor names", () => {
  assert.ok((migration.match(/order by assessment\.assessed_at desc, assessment\.id desc/g)?.length ?? 0) >= 3);
  assert.match(migration, /inner join public\.profiles as counselor[\s\S]*?counselor\.full_name/);
  const historyProjection = migration.match(
    /create function public\.get_counselor_student_eligibility_assessments[\s\S]*?\)\nlanguage plpgsql/,
  )?.[0] ?? "";
  assert.match(historyProjection, /assessor_full_name text/);
  assert.doesNotMatch(historyProjection, /assessed_by/);
});

test("Director has one read-only latest-assessment projection", () => {
  const director = migration.match(
    /create function public\.get_director_latest_student_eligibility_assessment[\s\S]*?\nend;\n\$function\$/,
  )?.[0] ?? "";
  assert.match(director, /has_active_verified_kgeo_role\([\s\S]*?'director'/);
  assert.match(director, /order by assessment\.assessed_at desc, assessment\.id desc[\s\S]*?limit 1/);
  assert.doesNotMatch(director, /insert|update|delete/);
});

test("Step 2 assignment security remains the unchanged authorization primitive", () => {
  assert.match(stepTwo, /get_counselor_student_identity[\s\S]*?is_active_primary_counselor_for_student/);
  assert.match(migration, /public\.is_active_primary_counselor_for_student/);
  assert.doesNotMatch(migration, /create or replace function public\.is_active_primary_counselor_for_student/);
  assert.doesNotMatch(migration, /student_counselor_assignments[\s\S]*?(?:insert|update|delete)/i);
});

test("migration contains no automated admissions or readiness scoring", () => {
  assert.doesNotMatch(migration, /cgpa|ielts|toefl|gre_score|gmat_score|global_readiness|readiness_score/i);
});
