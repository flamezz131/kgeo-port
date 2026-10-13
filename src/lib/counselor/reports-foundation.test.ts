import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/202610130002_counselor_reporting.sql",
    import.meta.url,
  ),
  "utf8",
);

const directoryMigration = readFileSync(
  new URL(
    "../../../supabase/migrations/202607200002_counselor_student_directory_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);

// Executable SQL only: comment lines are documentation, not behaviour.
const executable = migration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function functionSource(name: string): string {
  const match = executable.match(
    new RegExp(
      `create function ${name.replace(".", "\\.")}\\([\\s\\S]*?\\n\\$function\\$;`,
    ),
  );
  assert.ok(match, `${name} is defined`);
  return match[0];
}

function normalize(sql: string): string {
  return sql.replace(/\s+/g, " ").trim();
}

const rowBuilder = functionSource("private.counselor_report_student_rows");
const studentsRpc = functionSource("public.get_counselor_report_students");
const summaryRpc = functionSource("public.get_counselor_report_summary");
const breakdownsRpc = functionSource("public.get_counselor_report_breakdowns");
const publicRpcs = [
  ["public.get_counselor_report_students", studentsRpc],
  ["public.get_counselor_report_summary", summaryRpc],
  ["public.get_counselor_report_breakdowns", breakdownsRpc],
] as const;

const filterParameters = [
  "p_search text",
  "p_institution text",
  "p_department text",
  "p_graduation_year integer",
  "p_higher_studies_interest text",
  "p_profile_state text",
  "p_active text",
  "p_consultation_status text",
  "p_country text",
  "p_application_status text",
  "p_readiness_min integer",
  "p_readiness_max integer",
];

function returnedColumns(source: string): string[] {
  const block = source.match(/returns table \(([\s\S]*?)\n\)/)?.[1] ?? "";
  return block
    .split("\n")
    .map((line) => line.trim().split(" ")[0])
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

test("every report RPC begins with the canonical institutional Counselor check", () => {
  for (const [name, source] of publicRpcs) {
    const begin = source.indexOf("\nbegin\n");
    const helper = source.indexOf(
      "public.is_approved_active_verified_counselor() is distinct from true",
    );
    assert.ok(begin > 0 && helper > begin, `${name} checks the helper`);
    assert.match(
      source.slice(begin, helper + 200),
      /if \(select auth\.uid\(\)\) is null\s+or public\.is_approved_active_verified_counselor\(\) is distinct from true\s+then\s+raise exception using\s+errcode = '42501'/,
    );
    // Nothing is read before the caller is authorized.
    assert.ok(
      helper < source.indexOf("private.counselor_report_student_rows("),
      `${name} authorizes before reading`,
    );
    assert.equal(
      source.slice(begin, helper).includes("return query"),
      false,
    );
  }
});

test("report RPCs use no weaker or legacy authorization", () => {
  for (const source of [rowBuilder, studentsRpc, summaryRpc, breakdownsRpc]) {
    assert.doesNotMatch(source, /is_active_primary_counselor_for_student/);
    assert.doesNotMatch(source, /student_counselor_assignments/);
    assert.doesNotMatch(source, /has_active_verified_kgeo_role/);
    assert.doesNotMatch(source, /caller_profile\.role|counselor_profile\.role/);
    assert.doesNotMatch(source, /assigned_counselor_id/);
  }
});

test("report RPCs follow the definer security contract", () => {
  for (const [, source] of publicRpcs) {
    assert.match(
      source,
      /language plpgsql\s+stable\s+security definer\s+set search_path = ''/,
    );
  }
  // The private builder is not an API and is not SECURITY DEFINER.
  assert.match(rowBuilder, /language plpgsql\s+stable\s+set search_path = ''/);
  assert.doesNotMatch(rowBuilder, /security definer/);
});

test("PUBLIC, anon and service_role are denied; only authenticated may execute", () => {
  for (const [name] of publicRpcs) {
    const escaped = name.replace(".", "\\.");
    assert.match(
      executable,
      new RegExp(`alter function ${escaped}\\([\\s\\S]*?\\) owner to postgres;`),
    );
    assert.match(
      executable,
      new RegExp(
        `revoke all on function ${escaped}\\([\\s\\S]*?\\) from public, anon, authenticated, service_role;`,
      ),
    );
    assert.match(
      executable,
      new RegExp(
        `grant execute on function ${escaped}\\([\\s\\S]*?\\) to authenticated;`,
      ),
    );
  }
  assert.match(
    executable,
    /revoke all on function private\.counselor_report_student_rows\([\s\S]*?\) from public, anon, authenticated, service_role;/,
  );
  assert.doesNotMatch(
    executable,
    /grant execute on function private\.counselor_report_student_rows/,
  );
  assert.equal(executable.match(/grant execute on function/g)?.length, 3);
  assert.doesNotMatch(executable, /grant [^;]*to (?:anon|public|service_role)\b/);
  // The migration re-checks the effective privileges in the catalog.
  assert.match(executable, /Counselor report RPC privileges are invalid/);
  assert.match(executable, /Counselor report row builder privileges are invalid/);
});

test("no caller identity is accepted as a parameter", () => {
  for (const source of [rowBuilder, studentsRpc, summaryRpc, breakdownsRpc]) {
    const parameters = source.slice(
      source.indexOf("("),
      source.indexOf("returns table"),
    );
    assert.doesNotMatch(parameters, /uuid/);
    assert.doesNotMatch(parameters, /p_(?:caller|counselor|user|student)_id/);
  }
});

test("errors are generic and use the agreed SQLSTATEs", () => {
  for (const [, source] of publicRpcs) {
    assert.match(
      source,
      /exception\s+when sqlstate '22023' then\s+raise exception using\s+errcode = '22023',\s+message = 'Counselor report filters are invalid\.';\s+when insufficient_privilege then\s+raise exception using\s+errcode = '42501',\s+message = 'Counselor report data is temporarily unavailable\.';\s+when others then\s+raise exception using\s+errcode = 'P0001',\s+message = 'Counselor report data is temporarily unavailable\.';/,
    );
    assert.doesNotMatch(source, /sqlerrm|sqlstate\s*\|\|/i);
  }
});

// ---------------------------------------------------------------------------
// Report contract and privacy
// ---------------------------------------------------------------------------

test("the Student row returns exactly the report-safe columns", () => {
  assert.deepEqual(returnedColumns(studentsRpc), [
    "student_id",
    "student_name",
    "college_email",
    "is_active",
    "institution",
    "roll_number",
    "department",
    "graduation_year",
    "higher_studies_interest",
    "target_countries",
    "profile_state",
    "profile_completion_percentage",
    "consultation_status",
    "global_readiness_score",
    "global_readiness_band",
    "application_stage",
    "last_profile_update",
    "total_count",
  ]);
  assert.deepEqual(returnedColumns(summaryRpc), [
    "total_students",
    "profile_complete",
    "consultations_completed",
    "applications_started",
    "offers_received",
  ]);
  assert.deepEqual(returnedColumns(breakdownsRpc), [
    "dimension",
    "label",
    "student_count",
  ]);
});

test("no private, internal or sensitive data source is referenced", () => {
  for (const forbidden of [
    // Personal contact detail.
    "personal_email",
    "mobile_number",
    // Counselor-private records.
    "counselor_student_notes",
    "counselor_follow_ups",
    "counselor_student_semester_summaries",
    "note_text",
    // Readiness rationale and evidence.
    "_rationale",
    "evidence_snapshot",
    "parent_safe_summary",
    // Eligibility detail.
    "student_eligibility_assessments",
    // Parent Report content.
    "parent_reports",
    "parent_report_events",
    "parent_report_attachments",
    // Documents and paths.
    "student_profile_documents",
    "student_achievement_documents",
    "student_university_application_documents",
    "progression_evidence",
    "storage.",
    "object_path",
    "portal_url",
    "application_reference",
    // Reasons and requirement text.
    "cancellation_reason",
    "archive_reason",
    "conditional_offer_requirements",
    // Audit and event history.
    "student_university_application_events",
    "student_university_application_journey_events",
    "student_counseling_progression_events",
    // AI output.
    "recommendation.",
    "development_plans",
    "pr_insights",
    "profile_snapshot",
    "raw_ai_output",
    "llm_call_log",
    // Auth metadata and Director data.
    "auth.users",
    "auth.sessions",
    "email_confirmed_at",
    "banned_until",
    "counselor_accounts",
    "kgeo_public_progress",
    // Historical ownership.
    "student_counselor_assignments",
  ]) {
    assert.equal(
      executable.includes(forbidden),
      false,
      `${forbidden} must not appear in the reporting migration`,
    );
  }
  // The only Auth reference is the caller-identity lookup.
  assert.deepEqual(
    [...new Set(executable.match(/\bauth\.[a-z_]+/g))],
    ["auth.uid"],
  );
});

test("only the reviewed read sources are queried and nothing is written", () => {
  const sources = [
    ...new Set(
      [...rowBuilder.matchAll(/(?:from|join) (public\.[a-z_]+) as/g)].map(
        (match) => match[1],
      ),
    ),
  ].sort();
  assert.deepEqual(sources, [
    "public.consultation_requests",
    "public.profiles",
    "public.student_achievements",
    "public.student_global_readiness_assessments",
    "public.student_preferences",
    "public.student_profile_completion",
    "public.student_profiles",
    "public.student_test_scores",
    "public.student_university_application_journeys",
    "public.student_university_applications",
  ]);
  assert.doesNotMatch(
    executable,
    /\b(?:insert into|update|delete from|truncate|create table|create materialized view|create index|create view|alter table|create policy|create trigger)\b/i,
  );
  assert.doesNotMatch(executable, /create or replace/);
  assert.equal(executable.match(/create function/g)?.length, 4);
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

test("all three RPCs take the same filters and pass them unchanged", () => {
  const builderParameters = normalize(
    rowBuilder.slice(rowBuilder.indexOf("("), rowBuilder.indexOf("returns table")),
  );
  for (const parameter of filterParameters) {
    assert.ok(builderParameters.includes(parameter), parameter);
  }
  const call = normalize(`private.counselor_report_student_rows(
    p_search, p_institution, p_department, p_graduation_year,
    p_higher_studies_interest, p_profile_state, p_active,
    p_consultation_status, p_country, p_application_status,
    p_readiness_min, p_readiness_max )`);
  for (const [name, source] of publicRpcs) {
    const parameters = normalize(
      source.slice(source.indexOf("("), source.indexOf("returns table")),
    );
    let position = -1;
    for (const parameter of filterParameters) {
      const next = parameters.indexOf(parameter, position + 1);
      assert.ok(next > position, `${name} declares ${parameter} in order`);
      position = next;
    }
    assert.ok(normalize(source).includes(call), `${name} forwards filters`);
    assert.equal(source.match(/private\.counselor_report_student_rows\(/g)?.length, 1);
  }
});

test("active filter defaults to active Students and supports inactive and all", () => {
  for (const [, source] of publicRpcs) {
    assert.match(source, /p_active text default 'active'/);
  }
  assert.match(
    rowBuilder,
    /v_active := coalesce\(\s+nullif\(pg_catalog\.lower\(pg_catalog\.btrim\(p_active\)\), ''\),\s+'active'\s+\);/,
  );
  assert.match(rowBuilder, /if v_active not in \('active', 'inactive', 'all'\) then/);
  assert.match(
    normalize(rowBuilder),
    /v_active = 'all' or \(v_active = 'active' and report_entry\.is_active is true\) or \(v_active = 'inactive' and report_entry\.is_active is false\)/,
  );
  assert.match(rowBuilder, /where student_account\.role = 'student'::public\.user_role/);
});

test("institution accepts only KCT, KCLAS and KCTBS and is derived from the email domain", () => {
  assert.match(
    rowBuilder,
    /v_institution not in \('KCT', 'KCLAS', 'KCTBS'\)\s+then\s+raise exception using\s+errcode = '22023'/,
  );
  assert.match(
    normalize(rowBuilder),
    /case pg_catalog\.split_part\(student_account\.college_email, '@', 2\) when 'kct\.ac\.in' then 'KCT' when 'kclas\.ac\.in' then 'KCLAS' when 'kctbs\.ac\.in' then 'KCTBS' end as institution/,
  );
  assert.match(rowBuilder, /report_entry\.institution = v_institution/);
  // student_profiles.college is not an institution source.
  assert.doesNotMatch(rowBuilder, /student_profile\.college\b/);
  assert.doesNotMatch(rowBuilder, /p_college/);
});

test("department and graduation year use the stored values and the 2000-2100 envelope", () => {
  assert.match(
    normalize(rowBuilder),
    /pg_catalog\.lower\(report_entry\.department\) = pg_catalog\.lower\(v_department\)/,
  );
  assert.match(
    rowBuilder,
    /p_graduation_year not between 2000 and 2100\s+then\s+raise exception using\s+errcode = '22023'/,
  );
  assert.doesNotMatch(executable, /between 2024 and 2040/);
  assert.match(rowBuilder, /report_entry\.graduation_year = p_graduation_year/);
});

test("interest, profile state and application status are validated against their enums", () => {
  for (const [variable, enumType] of [
    ["v_interest", "public.higher_studies_interest"],
    ["v_profile_state", "public.student_directory_profile_state"],
    ["v_application_status", "public.university_application_status"],
  ]) {
    assert.match(
      normalize(rowBuilder),
      new RegExp(
        `if ${variable} is not null and not exists \\( select 1 from pg_catalog\\.pg_enum as enum_value where enum_value\\.enumtypid = '${enumType.replace(".", "\\.")}'::pg_catalog\\.regtype and enum_value\\.enumlabel::text = ${variable} \\) then raise exception using errcode = '22023'`,
      ),
    );
  }
  assert.match(rowBuilder, /report_entry\.higher_studies_interest::text = v_interest/);
  assert.match(rowBuilder, /report_entry\.profile_state::text = v_profile_state/);
  assert.match(rowBuilder, /report_entry\.application_stage = v_application_status/);
});

test("country filter is containment in the Student preferred countries", () => {
  assert.match(
    normalize(rowBuilder),
    /coalesce\( preference\.preferred_countries, array\[\]::text\[\] \) as target_countries/,
  );
  assert.match(
    rowBuilder,
    /report_entry\.target_countries @> array\[v_country\]::text\[\]/,
  );
  assert.match(rowBuilder, /pg_catalog\.char_length\(v_country\) > 80/);
});

test("readiness range is bounded and excludes unassessed Students when supplied", () => {
  assert.match(
    normalize(rowBuilder),
    /\(p_readiness_min is not null and p_readiness_min not between 0 and 100\) or \(p_readiness_max is not null and p_readiness_max not between 0 and 100\) or \( p_readiness_min is not null and p_readiness_max is not null and p_readiness_min > p_readiness_max \)/,
  );
  // A NULL score compared with a supplied bound is not true, so an
  // unassessed Student cannot match either bound.
  assert.match(
    normalize(rowBuilder),
    /p_readiness_min is null or report_entry\.global_readiness_score >= p_readiness_min/,
  );
  assert.match(
    normalize(rowBuilder),
    /p_readiness_max is null or report_entry\.global_readiness_score <= p_readiness_max/,
  );
  assert.doesNotMatch(rowBuilder, /coalesce\(\s*report_entry\.global_readiness_score/);
});

test("search reuses the directory semantics over name, roll number and college email", () => {
  assert.match(
    rowBuilder,
    /v_search := nullif\(pg_catalog\.lower\(pg_catalog\.btrim\(p_search\)\), ''\);/,
  );
  assert.match(rowBuilder, /pg_catalog\.char_length\(v_search\) > 100/);
  assert.match(rowBuilder, /v_search ~ '\[\[:cntrl:\]\]'/);
  const search = normalize(rowBuilder);
  for (const field of [
    "pg_catalog.lower(coalesce(report_entry.student_name, ''))",
    "pg_catalog.lower(coalesce(report_entry.roll_number, ''))",
    "pg_catalog.lower(report_entry.college_email)",
  ]) {
    assert.ok(
      search.includes(`pg_catalog.strpos( ${field}, v_search ) > 0`),
      field,
    );
  }
  assert.equal(rowBuilder.match(/pg_catalog\.strpos\(/g)?.length, 3);
  // Parameterized only: no dynamic SQL and no pattern operators.
  for (const source of [rowBuilder, studentsRpc, summaryRpc, breakdownsRpc]) {
    assert.doesNotMatch(source, /\bexecute\b|format\(|quote_ident|quote_literal/i);
    assert.doesNotMatch(source, /\bi?like\b/i);
  }
});

test("every filter combines with AND in one shared predicate", () => {
  const predicate = normalize(
    rowBuilder.slice(rowBuilder.lastIndexOf("from report_base as report_entry")),
  );
  for (const condition of [
    "v_active = 'all'",
    "v_search is null",
    "v_institution is null",
    "v_department is null",
    "p_graduation_year is null",
    "v_interest is null",
    "v_profile_state is null",
    "v_consultation_status is null",
    "v_country is null",
    "v_application_status is null",
    "p_readiness_min is null",
    "p_readiness_max is null",
  ]) {
    assert.ok(predicate.includes(condition), condition);
  }
  assert.equal(predicate.match(/\) and \(/g)?.length, 11);
});

// ---------------------------------------------------------------------------
// Derivations
// ---------------------------------------------------------------------------

test("consultation status follows the frozen precedence", () => {
  const ranks = normalize(rowBuilder).match(
    /case consultation\.state_rank (.*?) end as consultation_status/,
  )?.[1];
  assert.equal(
    ranks,
    "when 1 then 'in_progress' when 2 then 'outcome_required' when 3 then 'upcoming' when 4 then 'booking_pending' when 5 then 'completed' when 6 then 'no_show' when 7 then 'cancelled' else 'no_consultation'",
  );
  // The lowest rank across a Student's consultations wins.
  assert.match(rowBuilder, /pg_catalog\.min\(\s+case/);
  assert.match(rowBuilder, /where request\.student_id = student_account\.id/);
  assert.match(
    normalize(rowBuilder),
    /v_consultation_status not in \( 'in_progress', 'outcome_required', 'upcoming', 'booking_pending', 'completed', 'no_show', 'cancelled', 'no_consultation' \)/,
  );
});

test("consultation timing reuses the Asia/Kolkata business clock", () => {
  assert.match(
    normalize(rowBuilder),
    /v_business_now := pg_catalog\.statement_timestamp\(\) at time zone 'Asia\/Kolkata'; v_business_date := v_business_now::date; v_business_time := v_business_now::time;/,
  );
  const states = normalize(rowBuilder);
  // In progress: scheduled, today, started and not yet ended.
  assert.ok(
    states.includes(
      "when request.status = 'scheduled'::public.consultation_status and request.consultation_date = v_business_date and request.slot_start <= v_business_time and request.slot_end > v_business_time then 1",
    ),
  );
  // Outcome required: scheduled and already ended.
  assert.ok(
    states.includes(
      "when request.status = 'scheduled'::public.consultation_status and ( request.consultation_date < v_business_date or ( request.consultation_date = v_business_date and request.slot_end <= v_business_time ) ) then 2",
    ),
  );
  // Upcoming: scheduled and not yet started.
  assert.ok(
    states.includes(
      "when request.status = 'scheduled'::public.consultation_status and ( request.consultation_date > v_business_date or ( request.consultation_date = v_business_date and request.slot_start > v_business_time ) ) then 3",
    ),
  );
  // Booking pending: every request not yet a usable appointment.
  assert.ok(
    states.includes(
      "when request.status in ( 'submitted'::public.consultation_status, 'waiting_for_assignment'::public.consultation_status, 'counselor_assigned'::public.consultation_status, 'scheduled'::public.consultation_status ) then 4",
    ),
  );
  for (const [status, rank] of [
    ["completed", 5],
    ["no_show", 6],
    ["cancelled", 7],
  ] as const) {
    assert.ok(
      states.includes(
        `when request.status = '${status}'::public.consultation_status then ${rank}`,
      ),
    );
  }
});

test("application stage is the primary non-archived application status", () => {
  assert.match(
    normalize(rowBuilder),
    /left join public\.student_university_applications as primary_application on primary_application\.student_id = student_account\.id and primary_application\.is_primary is true and primary_application\.is_archived is false/,
  );
  assert.match(
    normalize(rowBuilder),
    /coalesce\( primary_application\.current_status::text, 'No primary application' \) as application_stage/,
  );
  // No "most advanced application" ranking is invented.
  assert.doesNotMatch(rowBuilder, /max\(\s*application\.current_status|order by\s+application\.current_status/);
});

test("readiness is the latest canonical assessment and NULL when unassessed", () => {
  assert.match(
    normalize(rowBuilder),
    /left join lateral \( select assessment\.total_score, assessment\.readiness_band from public\.student_global_readiness_assessments as assessment where assessment\.student_id = student_account\.id order by assessment\.revision_number desc, assessment\.assessed_at desc, assessment\.id desc limit 1 \) as latest_readiness on true/,
  );
  assert.match(rowBuilder, /latest_readiness\.total_score as global_readiness_score/);
  assert.match(rowBuilder, /latest_readiness\.readiness_band as global_readiness_band/);
  // Only the score and band are read from the assessment.
  assert.deepEqual(
    [...new Set(rowBuilder.match(/assessment\.[a-z_]+/g))].sort(),
    [
      "assessment.assessed_at",
      "assessment.id",
      "assessment.readiness_band",
      "assessment.revision_number",
      "assessment.student_id",
      "assessment.total_score",
    ],
  );
});

test("profile state and last profile update match the Student Directory exactly", () => {
  const directory = normalize(directoryMigration);
  const builder = normalize(rowBuilder);
  const profileState = directory.match(
    /case when student_profile\.student_id is null then .*? end as profile_state/,
  )?.[0];
  const lastProfileUpdate = directory.match(
    /greatest\( student_profile\.updated_at, .*? \) as last_profile_update/,
  )?.[0];
  assert.ok(profileState && lastProfileUpdate);
  assert.ok(builder.includes(profileState), "profile_state derivation");
  assert.ok(builder.includes(lastProfileUpdate), "last_profile_update calculation");
  // No consultation, application or readiness timestamp is mixed in.
  assert.doesNotMatch(lastProfileUpdate, /request\.|application\.|assessment\./);
  assert.doesNotMatch(executable, /last_activity/);
  // The joins that feed both derivations also match the directory.
  for (const join of [
    "left join public.student_profiles as student_profile on student_profile.student_id = student_account.id",
    "left join public.student_preferences as preference on preference.student_id = student_profile.student_id",
    "left join public.student_profile_completion as completion on completion.student_id = student_profile.student_id",
  ]) {
    assert.ok(directory.includes(join) && builder.includes(join), join);
  }
  assert.match(
    builder,
    /coalesce\( completion\.ready_for_counseling, false \) as ready_for_counseling/,
  );
});

// ---------------------------------------------------------------------------
// KPIs and breakdowns
// ---------------------------------------------------------------------------

test("every KPI counts distinct Students, never child rows", () => {
  const summary = normalize(summaryRpc);
  assert.ok(
    summary.includes(
      "pg_catalog.count(distinct report_row.student_id) as total_students",
    ),
  );
  for (const [flag, kpi] of [
    ["ready_for_counseling", "profile_complete"],
    ["has_completed_consultation", "consultations_completed"],
    ["has_active_application", "applications_started"],
    ["has_offer_received", "offers_received"],
  ]) {
    assert.ok(
      summary.includes(
        `pg_catalog.count(distinct report_row.student_id) filter ( where report_row.${flag} is true ) as ${kpi}`,
      ),
      kpi,
    );
  }
  assert.equal(summaryRpc.match(/pg_catalog\.count\(/g)?.length, 5);
  assert.doesNotMatch(summaryRpc, /count\(\*\)/);
  // Child tables are reduced to one boolean per Student before counting.
  const builder = normalize(rowBuilder);
  assert.ok(
    builder.includes(
      "coalesce( consultation.has_completed, false ) as has_completed_consultation",
    ),
  );
  assert.ok(
    builder.includes(
      "pg_catalog.bool_or( request.status = 'completed'::public.consultation_status ) as has_completed",
    ),
  );
  assert.ok(
    builder.includes(
      "exists ( select 1 from public.student_university_applications as application where application.student_id = student_account.id and application.is_archived is false ) as has_active_application",
    ),
  );
});

test("offers received counts any offer_received journey, conditional or unconditional", () => {
  const builder = normalize(rowBuilder);
  assert.ok(
    builder.includes(
      "exists ( select 1 from public.student_university_applications as application inner join public.student_university_application_journeys as journey on journey.application_id = application.id where application.student_id = student_account.id and journey.university_decision = 'offer_received'::public.university_application_decision ) as has_offer_received",
    ),
  );
  // Offer type does not narrow the KPI.
  assert.doesNotMatch(rowBuilder, /offer_status|student_decision/);
});

test("breakdowns cover institution, target country and application stage", () => {
  const breakdowns = normalize(breakdownsRpc);
  assert.ok(
    breakdowns.includes(
      "select 'institution'::text as dimension, report_rows.institution as label, pg_catalog.count(distinct report_rows.student_id) as student_count from report_rows where report_rows.institution is not null group by report_rows.institution",
    ),
  );
  // Student-country selections: every preferred country counts.
  assert.ok(
    breakdowns.includes(
      "select 'target_country'::text as dimension, selected_country.label as label, pg_catalog.count(distinct report_rows.student_id) as student_count from report_rows cross join lateral pg_catalog.unnest( report_rows.target_countries ) as selected_country(label) group by selected_country.label",
    ),
  );
  assert.ok(
    breakdowns.includes(
      "select 'application_stage'::text as dimension, report_rows.application_stage as label, pg_catalog.count(distinct report_rows.student_id) as student_count from report_rows group by report_rows.application_stage",
    ),
  );
  assert.equal(breakdownsRpc.match(/union all/g)?.length, 2);
  assert.ok(
    breakdowns.includes(
      "order by breakdown.dimension asc, breakdown.student_count desc, breakdown.label asc",
    ),
  );
});

// ---------------------------------------------------------------------------
// Pagination and sorting
// ---------------------------------------------------------------------------

test("pagination is page-number based with a default of 25 and a maximum of 100", () => {
  assert.match(studentsRpc, /p_page integer default 1,/);
  assert.match(studentsRpc, /p_page_size integer default 25\s+\)/);
  assert.match(
    normalize(studentsRpc),
    /or p_page is null or p_page not between 1 and 100000 or p_page_size is null or p_page_size not between 1 and 100 then raise exception using errcode = '22023'/,
  );
  assert.match(
    studentsRpc,
    /v_page_offset := \(p_page::bigint - 1\) \* p_page_size::bigint;/,
  );
  assert.match(studentsRpc, /pg_catalog\.count\(\*\) over \(\) as total_count/);
  assert.match(studentsRpc, /limit p_page_size\s+offset v_page_offset;/);
});

test("sorting is allowlisted and ends with a deterministic student_id tiebreak", () => {
  const sortKeys = [
    "name_asc",
    "name_desc",
    "roll_number_asc",
    "roll_number_desc",
    "graduation_year_asc",
    "graduation_year_desc",
    "readiness_asc",
    "readiness_desc",
    "recently_updated",
  ];
  const allowlist = normalize(studentsRpc).match(/if v_sort not in \( (.*?) \)/)?.[1];
  assert.equal(allowlist, sortKeys.map((key) => `'${key}'`).join(", "));
  assert.match(studentsRpc, /p_sort text default 'name_asc'/);
  const orderBy = normalize(
    studentsRpc.slice(
      studentsRpc.indexOf("order by"),
      studentsRpc.indexOf("limit p_page_size"),
    ),
  );
  for (const key of sortKeys) {
    assert.ok(orderBy.includes(`case when v_sort = '${key}' then`), key);
  }
  assert.equal(orderBy.match(/case when v_sort = /g)?.length, sortKeys.length);
  assert.ok(orderBy.endsWith("report_row.student_id asc"));
  // The client value selects a branch; it is never used as a column.
  assert.doesNotMatch(studentsRpc, /order by\s+p_sort|order by\s+v_sort/);
  assert.doesNotMatch(summaryRpc + breakdownsRpc, /p_sort|p_page/);
});

// ---------------------------------------------------------------------------
// Migration shape
// ---------------------------------------------------------------------------

test("the reporting migration is one fail-closed forward transaction", () => {
  assert.match(executable, /^begin;/m);
  assert.match(executable, /^commit;\s*$/m);
  assert.match(executable, /do \$preflight\$/);
  assert.match(executable, /do \$verification\$/);
  assert.match(
    executable,
    /Counselor reporting requires the institutional Counselor helper/,
  );
  assert.doesNotMatch(executable, /\bdrop\b/i);
});
