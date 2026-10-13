import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const migrationName =
  "202607260001_progression_evidence_foundation.sql";
const migrationHash =
  "c2161759110a1531ac3bb48189648c73123a89111f3d0aee29f78fd4075b9727";
const migrationDirectory = new URL(
  "../../../supabase/migrations/",
  import.meta.url,
);
const migration = read(
  "../../../supabase/migrations/202607260001_progression_evidence_foundation.sql",
);
const executableMigration = migration.replace(/--.*$/gm, "");
const readiness = read(
  "../../../supabase/verification/pre_phase_c2_readiness.sql",
);
const databaseTypes = read("../../types/database.ts");
const sharedTypes = read("../../types/index.ts");
const constants = read("./progression-evidence.ts");
const documentation = read("../../../docs/database.md");

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
} as const;

function hash(source: string | Buffer): string {
  return createHash("sha256").update(source).digest("hex");
}

function functionSource(name: string): string {
  return (
    executableMigration.match(
      new RegExp(
        `create function public\\.${name}\\([\\s\\S]*?\\$function\\$;`,
      ),
    )?.[0] ?? ""
  );
}

test("D3.3.1 is one additive transaction and leaves all earlier migrations unchanged", () => {
  assert.equal(hash(migration), migrationHash);
  assert.match(executableMigration, /^\s*begin;/);
  assert.match(executableMigration, /\bcommit;\s*$/);
  assert.doesNotMatch(
    executableMigration,
    /^\s*(?:drop|truncate|delete)\b/im,
  );

  const earlierNames = readdirSync(migrationDirectory)
    .filter((name) => name < migrationName)
    .sort();
  assert.deepEqual(earlierNames, Object.keys(earlierMigrationHashes));

  for (const [name, expected] of Object.entries(
    earlierMigrationHashes,
  )) {
    assert.equal(
      hash(readFileSync(new URL(name, migrationDirectory))),
      expected,
      name,
    );
  }
});

test("D3.3.2 remains application-only and does not alter the foundation contract", () => {
  assert.equal(hash(migration), migrationHash);
  assert.doesNotMatch(
    executableMigration,
    /createSignedUploadUrl|uploadToSignedUrl|createSignedUrl/,
  );
});

test("enum and metadata table implement the exact private evidence model", () => {
  assert.match(
    executableMigration,
    /create type public\.counseling_progression_evidence_status as enum \(\s*'pending',\s*'available',\s*'removed'\s*\)/,
  );
  assert.match(
    executableMigration,
    /create table public\.student_counseling_progression_evidence/,
  );
  assert.doesNotMatch(
    executableMigration.match(
      /create table public\.student_counseling_progression_evidence \([\s\S]*?\n\);/,
    )?.[0] ?? "",
    /\bstudent_id\b|\bbytea\b|signed_url|public_url|upload_token|student_visible/,
  );
  for (const foreignKey of [
    "student_counseling_progression_events(id)",
    "public.profiles(id)",
  ]) {
    assert.match(
      executableMigration,
      new RegExp(foreignKey.replace(/[().]/g, "\\$&")),
    );
  }
  assert.equal(
    executableMigration.match(/on delete restrict/g)?.length,
    3,
  );
  assert.match(
    executableMigration,
    /constraint progression_evidence_storage_path_key\s+unique \(storage_path\)/,
  );
  assert.match(
    executableMigration,
    /progression_evidence_status_consistency_check/,
  );
});

test("filename MIME extension size and generated UUID-only path are enforced", () => {
  for (const mimeType of [
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]) {
    assert.match(executableMigration, new RegExp(mimeType));
  }
  assert.match(executableMigration, /file_size_bytes between 1 and 10485760/);
  assert.match(executableMigration, /original_file_name !~ '\[\[:cntrl:\]\]'/);
  assert.match(
    executableMigration,
    /strpos\(original_file_name, '\/'\) = 0/,
  );
  assert.match(executableMigration, /chr\(92\)/);
  assert.match(executableMigration, /original_file_name not in \('\.', '\.\.'\)/);
  assert.match(
    executableMigration,
    /target_student_id::text \|\| '\/' \|\|[\s\S]*?p_progression_event_id::text \|\| '\/' \|\|[\s\S]*?new_evidence_id::text/,
  );
  assert.doesNotMatch(
    executableMigration.match(
      /generated_storage_path :=[\s\S]*?;/,
    )?.[0] ?? "",
    /original_file_name|normalized_file_name|email|roll|student_name/,
  );
});

test("prepare RPC validates ownership and locks before counting five active reservations", () => {
  const prepare = functionSource(
    "prepare_student_counseling_progression_evidence_upload",
  );
  assert.match(prepare, /caller_id := \(select auth\.uid\(\)\)/);
  assert.match(
    prepare,
    /has_active_verified_kgeo_role\(\s*'counselor'::public\.user_role/,
  );
  assert.match(
    prepare,
    /student_counseling_progression_events[\s\S]*?student_profile\.role = 'student'/,
  );
  assert.ok(
    prepare.indexOf("pg_try_advisory_xact_lock") <
      prepare.indexOf("select pg_catalog.count(*)"),
  );
  assert.match(prepare, /active_evidence_count >= 5/);
  assert.match(prepare, /upload_expires_at > prepared_time/);
  assert.match(prepare, /prepared_time \+ interval '2 hours'/);
  assert.doesNotMatch(
    prepare,
    /p_student_id|p_counselor|p_storage_path|p_uploaded_by/,
  );
});

test("finalize is uploader-bound and checks exact Storage existence without mutating it", () => {
  const finalize = functionSource(
    "finalize_student_counseling_progression_evidence_upload",
  );
  assert.match(finalize, /for update/);
  assert.match(finalize, /evidence_record\.uploaded_by <> caller_id/);
  assert.match(finalize, /evidence_record\.upload_expires_at <= finalized_time/);
  assert.match(
    finalize,
    /from storage\.objects[\s\S]*?bucket_id = evidence_record\.bucket_id[\s\S]*?name = evidence_record\.storage_path/,
  );
  assert.match(finalize, /status = 'available'/);
  assert.doesNotMatch(
    finalize,
    /(?:insert into|update|delete from) storage\.(?:objects|buckets)/i,
  );
});

test("remove performs final audited soft removal and never deletes metadata or bytes", () => {
  const remove = functionSource(
    "remove_student_counseling_progression_evidence",
  );
  assert.match(remove, /for update/);
  assert.match(remove, /evidence_record\.status <>[\s\S]*?'available'/);
  assert.match(remove, /status = 'removed'/);
  assert.match(remove, /removed_at = removal_time/);
  assert.match(remove, /removed_by = caller_id/);
  assert.match(remove, /char_length\(normalized_removal_reason\) > 500/);
  assert.doesNotMatch(remove, /\bdelete\b|storage\.objects|restore/i);
});

test("migration preserves metadata RLS without owning Supabase Storage relations", () => {
  assert.match(
    executableMigration,
    /alter table public\.student_counseling_progression_evidence\s+enable row level security/,
  );
  assert.equal(executableMigration.match(/\bcreate policy\b/g)?.length, 1);
  assert.equal(
    executableMigration.match(/\nfor select\n/g)?.length,
    1,
  );
  assert.doesNotMatch(
    executableMigration,
    /\nfor (?:insert|update|delete|all)\n/,
  );
  assert.match(
    executableMigration,
    /grant select \([\s\S]*?\) on table public\.student_counseling_progression_evidence\s+to authenticated/,
  );
  assert.doesNotMatch(
    executableMigration,
    /grant (?:insert|update|delete|truncate)[\s\S]*?student_counseling_progression_evidence/i,
  );
  assert.doesNotMatch(
    executableMigration,
    /(?:create|drop)\s+policy[\s\S]*?on\s+storage\.objects/i,
  );
  assert.doesNotMatch(
    executableMigration,
    /alter\s+table\s+storage\.objects/i,
  );
  assert.doesNotMatch(
    executableMigration,
    /(?:grant|revoke)[\s\S]*?\bon\s+(?:table\s+)?storage\.objects/i,
  );
});

test("SQL never creates the bucket or directly mutates Storage catalogs", () => {
  assert.doesNotMatch(
    executableMigration,
    /(?:insert into|update|delete from)\s+storage\.(?:objects|buckets)/i,
  );
  assert.doesNotMatch(
    executableMigration,
    /create table storage\.|getPublicUrl|service[_-]?role|set role\s+supabase_storage_admin/i,
  );
  assert.match(
    migration,
    /bucket is intentionally not[\s\S]*?created here/,
  );
  assert.match(
    migration,
    /no DDL against Supabase-managed storage\.objects/,
  );
  assert.match(migration, /Do not create Storage UPDATE, DELETE/);
});

test("documentation defines the two exact Dashboard-managed Storage policies", () => {
  assert.match(
    documentation,
    /policy name: `progression_evidence_object_insert_counselor`[\s\S]*?operation: `INSERT`[\s\S]*?target role: `authenticated`/,
  );
  assert.match(
    documentation,
    /storage\.objects\.bucket_id = 'counseling-progression-evidence'[\s\S]*?has_active_verified_kgeo_role\([\s\S]*?'counselor'::public\.user_role[\s\S]*?evidence\.storage_path = storage\.objects\.name[\s\S]*?evidence\.status =[\s\S]*?'pending'::public\.counseling_progression_evidence_status[\s\S]*?evidence\.uploaded_by = \(select auth\.uid\(\)\)[\s\S]*?evidence\.upload_expires_at > pg_catalog\.statement_timestamp\(\)/,
  );
  assert.match(
    documentation,
    /policy name: `progression_evidence_object_select_counselor`[\s\S]*?operation: `SELECT`[\s\S]*?target role: `authenticated`/,
  );
  assert.match(
    documentation,
    /viewing policy[\s\S]*?storage\.objects\.bucket_id = 'counseling-progression-evidence'[\s\S]*?has_active_verified_kgeo_role\([\s\S]*?'counselor'::public\.user_role[\s\S]*?evidence\.storage_path = storage\.objects\.name[\s\S]*?evidence\.status =[\s\S]*?'available'::public\.counseling_progression_evidence_status/,
  );
  assert.match(
    documentation,
    /Do not\s+create an UPDATE, DELETE, public, anonymous, student, admin, or director\s+policy/,
  );
  assert.match(
    documentation,
    /public-schema foundation checks can pass immediately[\s\S]*?Storage-policy checks must remain failed[\s\S]*?Full D3\.3\.1 readiness requires both stages/,
  );
});

test("function ownership execution and unexpected errors are narrowly controlled", () => {
  for (const name of [
    "prepare_student_counseling_progression_evidence_upload",
    "finalize_student_counseling_progression_evidence_upload",
    "remove_student_counseling_progression_evidence",
  ]) {
    const source = functionSource(name);
    assert.match(source, /security definer/);
    assert.match(source, /set search_path = ''/);
    assert.match(
      executableMigration,
      new RegExp(
        `alter function\\s+public\\.${name}\\([\\s\\S]*?\\)\\s+owner to postgres`,
      ),
    );
    assert.match(
      executableMigration,
      new RegExp(
        `revoke all on function\\s+public\\.${name}\\([\\s\\S]*?\\)\\s+from public, anon, authenticated`,
      ),
    );
    assert.match(
      executableMigration,
      new RegExp(
        `grant execute on function\\s+public\\.${name}\\([\\s\\S]*?\\)\\s+to authenticated`,
      ),
    );
    assert.doesNotMatch(source, /sqlerrm|sqlstate|raise notice|raise log/i);
  }
});

test("types constants readiness and documentation cover the complete foundation", () => {
  for (const name of [
    "CounselingProgressionEvidenceStatus",
    "student_counseling_progression_evidence",
    "prepare_student_counseling_progression_evidence_upload",
    "finalize_student_counseling_progression_evidence_upload",
    "remove_student_counseling_progression_evidence",
    "counseling_progression_evidence_status",
  ]) {
    assert.match(
      sharedTypes + databaseTypes,
      new RegExp(`\\b${name}\\b`),
    );
  }
  for (const constant of [
    "PROGRESSION_EVIDENCE_BUCKET_ID",
    "PROGRESSION_EVIDENCE_MAX_BYTES",
    "PROGRESSION_EVIDENCE_MAX_FILES_PER_EVENT",
    "PROGRESSION_EVIDENCE_MIME_TYPES",
    "PROGRESSION_EVIDENCE_EXTENSIONS",
    "PROGRESSION_EVIDENCE_EXTENSIONS_BY_MIME",
    "PROGRESSION_EVIDENCE_UPLOAD_INTENT_SECONDS",
    "PROGRESSION_EVIDENCE_SIGNED_VIEW_SECONDS",
  ]) {
    assert.match(constants, new RegExp(`\\b${constant}\\b`));
  }
  for (const readinessContract of [
    "D3.3.1 evidence enum has exact lifecycle values",
    "D3.3.1 evidence table has exact columns and nullability",
    "D3.3.1 RPC signatures and return contracts exist",
    "D3.3.1 Storage policies are exact INSERT and SELECT only",
    "D3.3.1 Storage denies UPDATE DELETE public and anonymous evidence access",
    "D3.3.1 private bucket has exact size and MIME configuration",
    "available evidence missing Storage object",
    "removed evidence retaining Storage object",
  ]) {
    assert.match(readiness, new RegExp(readinessContract));
  }
  assert.match(
    documentation,
    /Official progression evidence database and Storage foundation \(Phase D3\.3\.1\)/,
  );
});
