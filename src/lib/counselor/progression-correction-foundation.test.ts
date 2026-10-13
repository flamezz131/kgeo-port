import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL(
  "../../../supabase/migrations/202607260002_progression_correction_foundation.sql",
  import.meta.url,
);
const migrationsDirectory = new URL(
  "../../../supabase/migrations/",
  import.meta.url,
);
const readinessPath = new URL(
  "../../../supabase/verification/pre_phase_c2_readiness.sql",
  import.meta.url,
);
const databaseTypesPath = new URL("../../types/database.ts", import.meta.url);
const sharedTypesPath = new URL("../../types/index.ts", import.meta.url);
const progressionPath = new URL("./progression.ts", import.meta.url);
const docsPath = new URL("../../../docs/database.md", import.meta.url);

const migrationSource = readFileSync(migrationPath, "utf8");
const executableMigration = migrationSource.replace(/--.*$/gm, "");
const readinessSource = readFileSync(readinessPath, "utf8");
const databaseTypesSource = readFileSync(databaseTypesPath, "utf8");
const sharedTypesSource = readFileSync(sharedTypesPath, "utf8");
const progressionSource = readFileSync(progressionPath, "utf8");
const docsSource = readFileSync(docsPath, "utf8");

const normalRpc =
  executableMigration.match(
    /create or replace function public\.record_student_counseling_progression\([\s\S]*?\$function\$;/,
  )?.[0] ?? "";
const correctionRpc =
  executableMigration.match(
    /create function public\.undo_latest_student_counseling_progression_event\([\s\S]*?\$function\$;/,
  )?.[0] ?? "";
const readRpc =
  executableMigration.match(
    /create function\s+public\.get_counselor_progression_correction_context\([\s\S]*?\$function\$;/,
  )?.[0] ?? "";

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
  "202607250003_official_counseling_progression.sql":
    "7f59a16d970db1e79b6dd9789f35e71c07b9f0a90d2802741cb76fd6141a523c",
  "202607260001_progression_evidence_foundation.sql":
    "c2161759110a1531ac3bb48189648c73123a89111f3d0aee29f78fd4075b9727",
} as const;

function enumValues(enumName: string): string[] {
  const body =
    executableMigration.match(
      new RegExp(
        `create type public\\.${enumName} as enum \\(([\\s\\S]*?)\\);`,
      ),
    )?.[1] ?? "";
  return [...body.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

test("D3.4.1 is one transaction and every earlier migration is unchanged", () => {
  assert.match(executableMigration, /^\s*begin;/);
  assert.match(executableMigration, /\bcommit;\s*$/);

  const earlierNames = readdirSync(migrationsDirectory)
    .filter(
      (name) =>
        name < "202607260002_progression_correction_foundation.sql",
    )
    .sort();
  assert.deepEqual(earlierNames, Object.keys(earlierMigrationHashes));

  for (const [name, expectedHash] of Object.entries(
    earlierMigrationHashes,
  )) {
    const actualHash = createHash("sha256")
      .update(readFileSync(new URL(name, migrationsDirectory)))
      .digest("hex");
    assert.equal(actualHash, expectedHash, name);
  }
});

test("event ownership is preflighted then rewired to durable student profiles", () => {
  assert.match(
    executableMigration,
    /left join public\.profiles as student_profile[\s\S]*?student_profile\.role = 'student'::public\.user_role[\s\S]*?where student_profile\.id is null/,
  );
  assert.match(
    executableMigration,
    /drop constraint\s+student_counseling_progression_events_student_id_fkey/,
  );
  assert.match(
    executableMigration,
    /add constraint student_counseling_progression_events_student_id_fkey[\s\S]*?foreign key \(student_id\)[\s\S]*?references public\.profiles\(id\)[\s\S]*?on delete restrict/,
  );
  assert.doesNotMatch(
    executableMigration,
    /add constraint[\s\S]*?references public\.student_counseling_progressions\(student_id\)/,
  );
  assert.doesNotMatch(
    executableMigration,
    /(?:delete from|update)\s+public\.student_counseling_progression_events/i,
  );
});

test("lifetime initialization uniqueness is replaced at the trusted lock boundary", () => {
  assert.match(
    executableMigration,
    /drop index public\.student_counseling_progression_events_initial_key/,
  );
  assert.doesNotMatch(
    executableMigration,
    /create unique index[\s\S]*?previous_stage is null/,
  );
  assert.match(
    normalRpc,
    /hashtextextended\(p_student_id::text, 202607250003\)/,
  );
  assert.match(normalRpc, /uncorrected_initialization_count/);
  assert.match(
    normalRpc,
    /correction\.target_event_id = event\.id/,
  );
  assert.match(
    normalRpc,
    /uncorrected_initialization_count > 1/,
  );
  assert.match(
    normalRpc,
    /if exists \([\s\S]*?where event\.student_id = p_student_id[\s\S]*?and not exists \([\s\S]*?correction\.target_event_id = event\.id/,
  );
  assert.match(
    normalRpc,
    /if not progression_exists then[\s\S]*?insert into public\.student_counseling_progressions[\s\S]*?insert into public\.student_counseling_progression_events/,
  );
});

test("correction enum and append-only table have the exact integrity contract", () => {
  assert.deepEqual(
    enumValues("counseling_progression_correction_type"),
    ["undo_transition", "reset_initialization"],
  );
  assert.match(
    executableMigration,
    /create table public\.student_counseling_progression_event_corrections \([\s\S]*?target_event_id uuid[\s\S]*?unique[\s\S]*?references public\.student_counseling_progression_events\(id\)[\s\S]*?on delete restrict/,
  );
  assert.match(
    executableMigration,
    /corrected_by uuid[\s\S]*?references public\.profiles\(id\)[\s\S]*?on delete restrict/,
  );
  assert.match(
    executableMigration,
    /progression_event_corrections_restoration_check[\s\S]*?undo_transition[\s\S]*?restored_stage is not null[\s\S]*?reset_initialization[\s\S]*?restored_stage is null/,
  );
  assert.match(
    executableMigration,
    /progression_event_corrections_reason_check[\s\S]*?regexp_replace[\s\S]*?char_length\(correction_reason\) between 1 and 500[\s\S]*?\[\[:cntrl:\]\]/,
  );
});

test("correction RPC derives ownership and accepts no restored or audit values", () => {
  assert.match(
    correctionRpc,
    /undo_latest_student_counseling_progression_event\(\s*p_student_id uuid,\s*p_event_id uuid,\s*p_correction_reason text\s*\)/,
  );
  assert.match(correctionRpc, /caller_id := \(select auth\.uid\(\)\)/);
  assert.match(
    correctionRpc,
    /has_active_verified_kgeo_role\(\s*'counselor'::public\.user_role/,
  );
  assert.match(
    correctionRpc,
    /student_profile\.id = p_student_id[\s\S]*?student_profile\.role = 'student'::public\.user_role/,
  );
  assert.doesNotMatch(
    correctionRpc,
    /p_counselor|p_restored|p_corrected_at|p_stage_started_at/,
  );
  assert.match(correctionRpc, /security definer/);
  assert.match(correctionRpc, /set search_path = ''/);
});

test("correction lock ordering and latest-effective selection are deterministic", () => {
  const studentLock = correctionRpc.indexOf(
    "hashtextextended(p_student_id::text, 202607250003)",
  );
  const eventLock = correctionRpc.indexOf(
    "hashtextextended(p_event_id::text, 202607260001)",
  );
  const rowLock = correctionRpc.indexOf("for update");
  const latestRead = correctionRpc.indexOf(
    "order by event.changed_at desc, event.id desc",
  );
  assert.ok(
    studentLock > 0 &&
      eventLock > studentLock &&
      rowLock > eventLock &&
      latestRead > rowLock,
  );
  assert.match(
    correctionRpc,
    /not exists \([\s\S]*?correction\.target_event_id = event\.id[\s\S]*?order by event\.changed_at desc, event\.id desc[\s\S]*?limit 1/,
  );
  assert.match(
    correctionRpc,
    /latest_effective_event_id is distinct from p_event_id/,
  );
});

test("sequential undo restores only trusted event values and retains history", () => {
  assert.match(
    correctionRpc,
    /result_restored_stage := target_event\.previous_stage/,
  );
  assert.match(
    correctionRpc,
    /result_restored_state := target_event\.previous_state/,
  );
  assert.match(
    correctionRpc,
    /current_stage_value is distinct from target_event\.new_stage[\s\S]*?current_state_value is distinct from target_event\.new_state/,
  );
  assert.match(
    correctionRpc,
    /insert into public\.student_counseling_progression_event_corrections/,
  );
  assert.doesNotMatch(
    correctionRpc,
    /(?:delete from|update)\s+public\.student_counseling_progression_events/i,
  );
});

test("stage restoration preserves state-only starts and derives stage-change origins", () => {
  assert.match(
    correctionRpc,
    /previous_stage = target_event\.new_stage[\s\S]*?result_restored_stage_started_at := current_stage_started_at/,
  );
  assert.match(
    correctionRpc,
    /origin\.new_stage = target_event\.previous_stage/,
  );
  assert.match(
    correctionRpc,
    /origin\.previous_stage is null[\s\S]*?origin\.previous_stage is distinct from origin\.new_stage/,
  );
  assert.match(
    correctionRpc,
    /correction\.target_event_id = origin\.id/,
  );
  assert.match(
    correctionRpc,
    /order by origin\.changed_at desc, origin\.id desc[\s\S]*?if not found/,
  );
});

test("evidence gate is locked and never mutates evidence or Storage", () => {
  assert.match(
    correctionRpc,
    /status =\s*'available'::public\.counseling_progression_evidence_status/,
  );
  assert.match(
    correctionRpc,
    /status =\s*'pending'::public\.counseling_progression_evidence_status[\s\S]*?upload_expires_at >/,
  );
  assert.doesNotMatch(
    executableMigration,
    /(?:delete from|update)\s+public\.student_counseling_progression_evidence/i,
  );
  assert.doesNotMatch(
    executableMigration,
    /(?:insert into|update|delete from)\s+storage\.objects/i,
  );
});

test("reset deletes only the projection and permits later trusted initialization", () => {
  assert.match(
    correctionRpc,
    /reset_initialization[\s\S]*?delete from public\.student_counseling_progressions/,
  );
  assert.match(
    correctionRpc,
    /result_current_exists := false/,
  );
  assert.match(
    normalRpc,
    /correction\.correction_type <>\s*'reset_initialization'/,
  );
  const deleteTargets = [
    ...executableMigration.matchAll(
      /delete from\s+([a-z_.]+)/gi,
    ),
  ].map((match) => match[1]);
  assert.deepEqual(deleteTargets, [
    "public.student_counseling_progressions",
  ]);
});

test("bounded read RPC returns one context set with an independent effective event", () => {
  assert.match(
    readRpc,
    /p_student_id uuid,\s*p_event_ids uuid\[\]/,
  );
  assert.match(readRpc, /requested_count > 20/);
  assert.match(readRpc, /count\(distinct requested\.event_id\)/);
  assert.match(readRpc, /event\.id = any\(p_event_ids\)/);
  assert.match(
    readRpc,
    /not exists \([\s\S]*?correction\.target_event_id = event\.id[\s\S]*?order by event\.changed_at desc, event\.id desc/,
  );
  assert.match(
    readRpc,
    /unnest\(p_event_ids\) with ordinality/,
  );
  assert.doesNotMatch(readRpc, /service_role|raw_user_meta_data/);
});

test("RLS and grants are counselor-read and RPC-write only", () => {
  assert.match(
    executableMigration,
    /alter table\s+public\.student_counseling_progression_event_corrections\s+enable row level security/,
  );
  assert.equal(
    executableMigration.match(/\bcreate policy\b/g)?.length,
    1,
  );
  assert.match(
    executableMigration,
    /create policy progression_event_corrections_select_counselor[\s\S]*?for select[\s\S]*?has_active_verified_kgeo_role\(\s*'counselor'/,
  );
  assert.doesNotMatch(
    executableMigration,
    /create policy [\s\S]*?\nfor (?:insert|update|delete)\n/,
  );
  assert.doesNotMatch(
    executableMigration,
    /grant (?:insert|update|delete|truncate)[\s\S]*?progression_event_corrections/i,
  );
  assert.match(
    executableMigration,
    /revoke all on function\s+public\.undo_latest_student_counseling_progression_event\([\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    executableMigration,
    /grant execute on function\s+public\.undo_latest_student_counseling_progression_event\([\s\S]*?to authenticated/,
  );
});

test("types labels readiness and documentation contain the D3.4.1 contract without UI", () => {
  for (const name of [
    "CounselingProgressionCorrectionType",
    "student_counseling_progression_event_corrections",
    "undo_latest_student_counseling_progression_event",
    "get_counselor_progression_correction_context",
    "counseling_progression_correction_type",
  ]) {
    assert.match(
      `${sharedTypesSource}\n${databaseTypesSource}`,
      new RegExp(name),
    );
  }
  assert.match(
    progressionSource,
    /undo_transition: "Progression update reversed"/,
  );
  assert.match(
    progressionSource,
    /reset_initialization: "Official progression reset"/,
  );
  assert.match(readinessSource, /D3\.4\.1/);
  assert.match(docsSource, /Audited official progression corrections/);
  assert.doesNotMatch(
    migrationSource,
    /service_role|auth\.admin|storage\.objects/,
  );
});
