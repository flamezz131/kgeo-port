import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import "./progression-correction-foundation.test.ts";

const migrationPath = new URL(
  "../../../supabase/migrations/202607250003_official_counseling_progression.sql",
  import.meta.url,
);
const readinessPath = new URL(
  "../../../supabase/verification/pre_phase_c2_readiness.sql",
  import.meta.url,
);
const databaseTypesPath = new URL("../../types/database.ts", import.meta.url);
const sharedTypesPath = new URL("../../types/index.ts", import.meta.url);
const progressionTypesPath = new URL("./progression.ts", import.meta.url);
const roleHelperMigrationPath = new URL(
  "../../../supabase/migrations/202607190002_student_profile_foundation.sql",
  import.meta.url,
);
const docsPath = new URL("../../../docs/database.md", import.meta.url);

const migrationSource = readFileSync(migrationPath, "utf8");
const executableMigration = migrationSource.replace(/--.*$/gm, "");
const readinessSource = readFileSync(readinessPath, "utf8");
const databaseTypesSource = readFileSync(databaseTypesPath, "utf8");
const sharedTypesSource = readFileSync(sharedTypesPath, "utf8");
const progressionTypesSource = readFileSync(progressionTypesPath, "utf8");
const roleHelperMigrationSource = readFileSync(
  roleHelperMigrationPath,
  "utf8",
);
const docsSource = readFileSync(docsPath, "utf8");
const migrationsDirectory = new URL(
  "../../../supabase/migrations/",
  import.meta.url,
);
const earlierMigrationHashes = {
  "202607170001_initial_kgeo_schema.sql":
    "5c3c7a5b4628db997f91d577b3f1b51400cf4693213e2daeaf7828c1f18024bb",
  "202607180001_consultation_requests_v1.sql":
    "f5beca24476a0c5d9f48cd3fbc222b9c278ebf9781291faa1cff8b250951e02d",
  "202607190001_single_counselor_slot_booking.sql":
    "5e814237b6230c04f517f2083393adc5818c3bd040fd3d7a26d1df8b541cc075",
  "202607190002_student_profile_foundation.sql":
    "370cf60acdef96ad57b5e1c384a1c4b29f7ee2f5cb0e822f77572c1db33c3219",
  "202607200001_require_core_profile_for_preferences.sql":
    "aec0c0207b54cd54387af6ce1d075de6a4830d6f8bc7dae9e8cd29e9b0fe3ab1",
  "202607200002_counselor_student_directory_foundation.sql":
    "38bdda3750f3c5398c1ae5144b93b40059327ae553bfffc9967b81bb385590ad",
  "202607230001_canonical_names_and_consultation_outcomes.sql":
    "500e575889108dad91bb6a08a6d01560f607707fac9656c3b5438ae476964b69",
  "202607230002_atomic_student_identity_save.sql":
    "0e8cf2228c80d3a58bdec3cdc520f65b0066aecccc14c51671e3a8960a171b64",
  "202607230003_counselor_consultation_reference_rpc.sql":
    "1cfd1e5ff871f76cacd290b3427d3652b537f18690056faa62e896422203a397",
  "202607230004_consultation_reference_column_hardening.sql":
    "11c7d770301f439ada3d4b8082c8bab48ebd4941cd331eeee9e1b7fdbfefbb51",
  "202607250001_counselor_notes_and_follow_ups_foundation.sql":
    "946782e65887ceacfe87bc028aed0f24f36519ab311390dd60e87dbb26b3d37f",
  "202607250002_counselor_follow_up_workload.sql":
    "8b03ad6970913d2d6e216e4985dda1f5ac5aa87f22a94d7ac670cd42c43c990f",
} as const;

const rpcSource =
  executableMigration.match(
    /create function public\.record_student_counseling_progression\([\s\S]*?\$function\$;/,
  )?.[0] ?? "";

function enumValues(enumName: string): string[] {
  const body =
    executableMigration.match(
      new RegExp(
        `create type public\\.${enumName} as enum \\(([\\s\\S]*?)\\);`,
      ),
    )?.[1] ?? "";
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? sourceFiles(path) : [path];
  });
}

test("D3.1 migration is additive and defines the exact stage and state enums", () => {
  assert.match(executableMigration, /^\s*begin;/);
  assert.match(executableMigration, /\bcommit;\s*$/);
  assert.doesNotMatch(
    executableMigration,
    /^\s*(?:drop|truncate|delete)\b/im,
  );

  assert.deepEqual(enumValues("counseling_progression_stage"), [
    "profile_review",
    "initial_counseling",
    "goals_confirmed",
    "country_exploration",
    "program_shortlisting",
    "university_shortlisting",
    "test_preparation",
    "document_preparation",
    "application_ready",
    "application_in_progress",
    "offer_evaluation",
    "visa_preparation",
    "pre_departure",
  ]);
  assert.deepEqual(enumValues("counseling_progression_state"), [
    "active",
    "on_hold",
    "completed",
  ]);
});

test("every earlier migration retains its reviewed SHA-256", () => {
  const earlierMigrationNames = readdirSync(migrationsDirectory)
    .filter(
      (name) =>
        name < "202607250003_official_counseling_progression.sql",
    )
    .sort();

  assert.deepEqual(
    earlierMigrationNames,
    Object.keys(earlierMigrationHashes),
  );

  for (const [name, expectedHash] of Object.entries(
    earlierMigrationHashes,
  )) {
    const actualHash = createHash("sha256")
      .update(readFileSync(new URL(name, migrationsDirectory)))
      .digest("hex");

    assert.equal(actualHash, expectedHash, name);
  }
});

test("current and append-only history tables retain institutional records", () => {
  assert.match(
    executableMigration,
    /create table public\.student_counseling_progressions \([\s\S]*?student_id uuid[\s\S]*?primary key[\s\S]*?references public\.profiles\(id\)[\s\S]*?on delete restrict/,
  );
  assert.match(
    executableMigration,
    /create table public\.student_counseling_progression_events \([\s\S]*?references public\.student_counseling_progressions\(student_id\)[\s\S]*?on delete restrict/,
  );
  assert.match(
    executableMigration,
    /last_changed_by uuid[\s\S]*?references public\.profiles\(id\)[\s\S]*?on delete restrict/,
  );
  assert.match(
    executableMigration,
    /changed_by uuid[\s\S]*?references public\.profiles\(id\)[\s\S]*?on delete restrict/,
  );
  assert.match(
    executableMigration,
    /student_counseling_progressions_timestamp_order_check[\s\S]*?stage_started_at >= created_at[\s\S]*?last_changed_at >= stage_started_at[\s\S]*?updated_at = last_changed_at/,
  );
  assert.match(
    executableMigration,
    /student_counseling_progression_events_previous_pair_check/,
  );
  assert.match(
    executableMigration,
    /create unique index student_counseling_progression_events_initial_key[\s\S]*?where previous_stage is null and previous_state is null/,
  );
  assert.match(
    executableMigration,
    /create index student_counseling_progression_events_student_history_idx[\s\S]*?\(\s*student_id,\s*changed_at desc,\s*id desc\s*\)/,
  );
});

test("RLS exposes counselor reads and denies every direct authenticated mutation", () => {
  assert.match(
    executableMigration,
    /alter table public\.student_counseling_progressions\s+enable row level security/,
  );
  assert.match(
    executableMigration,
    /alter table public\.student_counseling_progression_events\s+enable row level security/,
  );
  assert.equal(
    executableMigration.match(/\bcreate policy\b/g)?.length,
    2,
  );
  assert.equal(
    executableMigration.match(
      /create policy [\s\S]*?\nfor select\n/g,
    )?.length,
    2,
  );
  assert.equal(
    executableMigration.match(
      /has_active_verified_kgeo_role\(\s*'counselor'::public\.user_role/g,
    )?.length,
    3,
  );
  assert.doesNotMatch(
    executableMigration,
    /create policy [\s\S]*?\nfor (?:insert|update|delete)\n/,
  );
  assert.doesNotMatch(
    executableMigration,
    /grant (?:insert|update|delete)[\s\S]*?student_counseling_progression/i,
  );
  assert.match(
    executableMigration,
    /revoke all privileges on table\s+public\.student_counseling_progressions\s+from public, anon, authenticated/,
  );
});

test("the mutation RPC derives and validates both counselor and student identities", () => {
  assert.match(
    rpcSource,
    /record_student_counseling_progression\(\s*p_student_id uuid,\s*p_stage text,\s*p_state text,\s*p_change_reason text default null\s*\)/,
  );
  assert.match(rpcSource, /caller_id := \(select auth\.uid\(\)\)/);
  assert.match(
    rpcSource,
    /public\.has_active_verified_kgeo_role\(\s*'counselor'::public\.user_role/,
  );
  assert.match(
    rpcSource,
    /from public\.profiles as student_profile[\s\S]*?student_profile\.id = p_student_id[\s\S]*?student_profile\.role = 'student'::public\.user_role/,
  );
  assert.doesNotMatch(
    rpcSource,
    /p_counselor|raw_user_meta_data|raw_app_meta_data|service_role/,
  );
  assert.match(rpcSource, /security definer/);
  assert.match(rpcSource, /set search_path = ''/);
  assert.match(
    executableMigration,
    /alter function public\.record_student_counseling_progression\([\s\S]*?\) owner to postgres/,
  );

  const roleHelperSource =
    roleHelperMigrationSource.match(
      /create function public\.has_active_verified_kgeo_role\([\s\S]*?\$function\$;/,
    )?.[0] ?? "";
  assert.match(roleHelperSource, /profile\.id = \(select auth\.uid\(\)\)/);
  assert.match(roleHelperSource, /profile\.role = p_role/);
  assert.match(roleHelperSource, /profile\.is_active is true/);
  assert.match(roleHelperSource, /email_confirmed_at is not null/);
});

test("input validation normalizes reasons and validates text before enum casts", () => {
  assert.ok(
    rpcSource.indexOf("normalized_stage not in") <
      rpcSource.indexOf(
        "normalized_stage::public.counseling_progression_stage",
      ),
  );
  assert.ok(
    rpcSource.indexOf("normalized_state not in") <
      rpcSource.indexOf(
        "normalized_state::public.counseling_progression_state",
      ),
  );
  assert.match(rpcSource, /normalized_reason := nullif\(/);
  assert.match(rpcSource, /pg_catalog\.btrim\(p_change_reason\)/);
  assert.ok(rpcSource.includes("'[[:space:]]+'"));
  assert.match(rpcSource, /nullif\([\s\S]*?''\s*\n\s*\)/);
  assert.match(
    rpcSource,
    /char_length\(normalized_reason\) > 500/,
  );
});

test("transition rules separate stage and state changes and reject final or invalid changes", () => {
  assert.match(
    rpcSource,
    /if not progression_exists then[\s\S]*?requested_state <>[\s\S]*?'active'::public\.counseling_progression_state/,
  );
  assert.match(
    rpcSource,
    /previous_state_value =\s*'completed'::public\.counseling_progression_state/,
  );
  assert.match(
    rpcSource,
    /previous_stage_value = requested_stage[\s\S]*?previous_state_value = requested_state/,
  );
  assert.match(
    rpcSource,
    /previous_stage_value is distinct from requested_stage[\s\S]*?previous_state_value is distinct from requested_state/,
  );
  assert.match(
    rpcSource,
    /previous_state_value =\s*'on_hold'::public\.counseling_progression_state[\s\S]*?previous_stage_value is distinct from requested_stage/,
  );
  assert.match(
    rpcSource,
    /stage_started_at = case[\s\S]*?current_stage is distinct from requested_stage[\s\S]*?then change_time[\s\S]*?else existing_stage_started_at/,
  );
});

test("concurrent writes are first-writer-wins and current plus history stay atomic", () => {
  assert.match(rpcSource, /pg_try_advisory_xact_lock/);
  assert.match(rpcSource, /hashtextextended\(p_student_id::text/);
  assert.match(
    rpcSource,
    /from public\.student_counseling_progressions as progression[\s\S]*?for update/,
  );
  assert.match(rpcSource, /errcode = '40001'/);
  assert.equal(
    rpcSource.match(
      /insert into public\.student_counseling_progression_events/g,
    )?.length,
    2,
  );
  assert.match(
    rpcSource,
    /previous_stage_value,[\s\S]*?requested_stage,[\s\S]*?previous_state_value,[\s\S]*?requested_state,[\s\S]*?caller_id,[\s\S]*?normalized_reason,[\s\S]*?change_time/,
  );
  assert.match(
    rpcSource,
    /last_changed_at = change_time,[\s\S]*?last_changed_by = caller_id,[\s\S]*?updated_at = change_time/,
  );
  assert.match(
    rpcSource,
    /change_time <= existing_last_changed_at[\s\S]*?existing_last_changed_at \+ interval '1 microsecond'/,
  );
});

test("RPC grants are narrow and failures do not expose raw database details", () => {
  assert.match(
    executableMigration,
    /revoke all on function public\.record_student_counseling_progression\([\s\S]*?\) from public, anon, authenticated/,
  );
  assert.match(
    executableMigration,
    /grant execute on function public\.record_student_counseling_progression\([\s\S]*?\) to authenticated/,
  );
  assert.match(
    rpcSource,
    /message = 'Official progression could not be updated'/,
  );
  assert.doesNotMatch(
    rpcSource,
    /sqlerrm|sqlstate|message\s*=\s*(?:p_change_reason|p_student_id)/i,
  );
  assert.doesNotMatch(
    rpcSource,
    /counselor_student_notes|counselor_follow_ups|note_text|next_action|details|request_number/,
  );
});

test("database types and centralized labels cover the complete D3.1 contract", () => {
  for (const name of [
    "CounselingProgressionStage",
    "CounselingProgressionState",
  ]) {
    assert.match(sharedTypesSource, new RegExp(`export type ${name}`));
    assert.match(databaseTypesSource, new RegExp(`\\b${name}\\b`));
  }

  for (const name of [
    "student_counseling_progressions",
    "student_counseling_progression_events",
    "record_student_counseling_progression",
    "counseling_progression_stage",
    "counseling_progression_state",
  ]) {
    assert.match(databaseTypesSource, new RegExp(`\\b${name}\\b`));
  }

  const stageOptions =
    progressionTypesSource.match(
      /COUNSELING_PROGRESSION_STAGE_OPTIONS = \[([\s\S]*?)\] as const/,
    )?.[1] ?? "";
  const stateOptions =
    progressionTypesSource.match(
      /COUNSELING_PROGRESSION_STATE_OPTIONS = \[([\s\S]*?)\] as const/,
    )?.[1] ?? "";

  assert.equal(stageOptions.match(/\{ value:/g)?.length, 13);
  assert.equal(stateOptions.match(/\{ value:/g)?.length, 3);

  for (const [value, label] of [
    ["profile_review", "Profile review"],
    ["initial_counseling", "Initial counseling"],
    ["goals_confirmed", "Goals confirmed"],
    ["country_exploration", "Country exploration"],
    ["program_shortlisting", "Program shortlisting"],
    ["university_shortlisting", "University shortlisting"],
    ["test_preparation", "Test preparation"],
    ["document_preparation", "Document preparation"],
    ["application_ready", "Application ready"],
    ["application_in_progress", "Application in progress"],
    ["offer_evaluation", "Offer evaluation"],
    ["visa_preparation", "Visa preparation"],
    ["pre_departure", "Pre-departure"],
    ["active", "Active"],
    ["on_hold", "On hold"],
    ["completed", "Completed"],
  ]) {
    assert.match(
      progressionTypesSource,
      new RegExp(`${value}: "${label}"`),
    );
    assert.match(
      progressionTypesSource,
      new RegExp(`value: "${value}", label: "${label}"`),
    );
  }
});

test("readiness, documentation, and counselor-only runtime boundaries include D3", () => {
  for (const name of [
    "counseling_progression_stage",
    "counseling_progression_state",
    "student_counseling_progressions",
    "student_counseling_progression_events",
    "record_student_counseling_progression(uuid,text,text,text)",
    "students without official progression",
    "latest-event/current-row mismatches",
  ]) {
    assert.match(readinessSource, new RegExp(name.replace(/[()]/g, "\\$&")));
  }

  assert.match(docsSource, /Official counseling progression \(Phase D3\.1\)/);
  assert.match(
    docsSource,
    /Students cannot read\s+official progression in D3/,
  );
  assert.match(
    docsSource,
    /Counselor Student 360 application behavior \(Phase D3\.2\)/,
  );

  const appSource = [
    ...sourceFiles(fileURLToPath(new URL("../../app", import.meta.url))),
    ...sourceFiles(fileURLToPath(new URL("../../components", import.meta.url))),
  ]
    .filter((path) => /\.(?:ts|tsx)$/.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");

  assert.match(
    appSource,
    /student_counseling_progressions|student_counseling_progression_events|record_student_counseling_progression/,
  );

  const studentSource = sourceFiles(
    fileURLToPath(new URL("../../app/student", import.meta.url)),
  )
    .filter((path) => /\.(?:ts|tsx)$/.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  assert.doesNotMatch(
    studentSource,
    /student_counseling_progressions|student_counseling_progression_events|record_student_counseling_progression/,
  );
});
