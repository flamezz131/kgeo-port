import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID,
  UNIVERSITY_APPLICATION_DOCUMENT_MAX_ACTIVE,
  UNIVERSITY_APPLICATION_DOCUMENT_MAX_BYTES,
  UNIVERSITY_APPLICATION_DOCUMENT_MIME_TYPES,
  UNIVERSITY_APPLICATION_DOCUMENT_SIGNED_VIEW_SECONDS,
  UNIVERSITY_APPLICATION_DOCUMENT_UPLOAD_INTENT_SECONDS,
  isUniversityApplicationDocumentStoragePath,
  isUniversityApplicationDocumentTimestamp,
  isUniversityApplicationDocumentUuid,
  normalizeUniversityApplicationDocumentText,
  parsePrepareUniversityApplicationDocumentUploadResult,
  parseUniversityApplicationDocumentMetadata,
  parseUniversityApplicationDocumentList,
  parseUniversityApplicationDocumentViewAuthorization,
  validateUniversityApplicationDocumentFile,
  validateUniversityApplicationDocumentRemovalReason,
  validateUniversityApplicationDocumentTitle,
} = require("./university-application-documents.ts") as typeof import(
  "./university-application-documents"
);

const migrationUrl = new URL(
  "../../../supabase/migrations/202608010001_university_application_documents_foundation.sql",
  import.meta.url,
);
const migrationDirectoryUrl = new URL(
  "../../../supabase/migrations/",
  import.meta.url,
);
const readinessUrl = new URL(
  "../../../supabase/verification/pre_phase_c2_readiness.sql",
  import.meta.url,
);
const databaseTypesUrl = new URL("../../types/database.ts", import.meta.url);
const domainTypesUrl = new URL("../../types/index.ts", import.meta.url);
const documentationUrl = new URL("../../../docs/database.md", import.meta.url);
const moduleUrl = new URL("./university-application-documents.ts", import.meta.url);

const migration = readFileSync(migrationUrl, "utf8");
const readiness = readFileSync(readinessUrl, "utf8");
const databaseTypes = readFileSync(databaseTypesUrl, "utf8");
const domainTypes = readFileSync(domainTypesUrl, "utf8");
const documentation = readFileSync(documentationUrl, "utf8");
const moduleSource = readFileSync(moduleUrl, "utf8");

const previousMigrationHashes = {
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
  "202607260002_progression_correction_foundation.sql":
    "90d9a6e6f1b7fecb5a8a2e667c61eeb62b8546b33db402c3e1faf21a09e207fb",
  "202607270001_university_application_foundation.sql":
    "09d8c32734b159535387a4f6e21fda54d4b59ba4bbb60de4f93b7179794cb35b",
  "202607280001_student_university_application_read_foundation.sql":
    "3209de9d8bae1a8a2762fc9e539f3193cb9db2e6bd520cf60b420d85ea0d8875",
} as const;

function hashFile(url: URL): string {
  return createHash("sha256").update(readFileSync(url)).digest("hex");
}

test("E1.3.3 remains byte-identical after the reviewed E1.4.1 migration", () => {
  const migrationNames = readdirSync(migrationDirectoryUrl)
    .filter(
      (name) =>
        name.endsWith(".sql") &&
        name <= "202608020001_counselor_application_workspace_read_foundation.sql",
    )
    .sort();
  assert.equal(migrationNames.length, 19);
  assert.equal(
    migrationNames.at(-2),
    "202608010001_university_application_documents_foundation.sql",
  );
  assert.equal(
    migrationNames.at(-1),
    "202608020001_counselor_application_workspace_read_foundation.sql",
  );
  for (const [name, expectedHash] of Object.entries(previousMigrationHashes)) {
    assert.equal(hashFile(new URL(name, migrationDirectoryUrl)), expectedHash);
  }
  assert.equal(
    hashFile(migrationUrl),
    "9cff3f5849fffa9d610b3d7a8bbab2ac0f04dc3e7729ca95bc46d0c0a6d548a1",
  );
});

test("migration is one complete additive transaction with balanced function bodies", () => {
  assert.match(migration, /^-- K-GEO Phase E1\.3\.3[\s\S]*?\nbegin;/);
  assert.match(migration, /\ncommit;\s*$/);
  assert.equal((migration.match(/^begin;$/gm) ?? []).length, 1);
  assert.equal((migration.match(/^commit;$/gm) ?? []).length, 1);
  assert.equal((migration.match(/^create function public\./gm) ?? []).length, 7);
  assert.equal((migration.match(/\$function\$/g) ?? []).length, 14);
  assert.doesNotMatch(migration, /^\s*(?:drop|truncate)\b/gim);
});

test("migration creates only the exact document enum table indexes and trusted RPCs", () => {
  assert.match(
    migration,
    /create type public\.university_application_document_status as enum \(\s*'pending',\s*'available',\s*'removed'\s*\)/,
  );
  assert.match(
    migration,
    /create table public\.student_university_application_documents/,
  );
  assert.match(
    migration,
    /references public\.student_university_applications\(id\)\s*on delete restrict/,
  );
  assert.match(migration, /unique \(storage_path\)/);
  assert.match(
    migration,
    /create index university_application_documents_application_available_idx/,
  );
  assert.match(
    migration,
    /create index university_application_documents_status_expiry_idx/,
  );
  assert.equal((migration.match(/create type public\./g) ?? []).length, 1);
  assert.equal((migration.match(/create table public\./g) ?? []).length, 1);
  assert.doesNotMatch(
    migration,
    /alter table public\.(student_university_applications|student_university_application_events|student_counseling_progressions|student_counseling_progression_events)/,
  );
});

test("table constraints enforce normalized titles safe names MIME size expiry and final lifecycle", () => {
  for (const constraint of [
    "university_application_documents_bucket_check",
    "university_application_documents_storage_path_key",
    "university_application_documents_storage_path_check",
    "university_application_documents_title_check",
    "university_application_documents_original_name_check",
    "university_application_documents_mime_type_check",
    "university_application_documents_mime_extension_check",
    "university_application_documents_file_size_check",
    "university_application_documents_upload_window_check",
    "university_application_documents_status_consistency_check",
  ]) {
    assert.match(migration, new RegExp(constraint));
  }
  assert.match(migration, /file_size_bytes between 1 and 10485760/);
  assert.match(
    migration,
    /upload_expires_at = prepared_at \+ interval '2 hours'/,
  );
  assert.match(migration, /document_title[\s\S]*?between 2 and 100/);
  assert.match(migration, /original_file_name[\s\S]*?between 1 and 255/);
  assert.match(migration, /removal_reason[\s\S]*?between 1 and 500/);
  assert.match(migration, /original_file_name ~ '\^\[\^\.\]\+\\\.\[\^\.\]\+\$'/);
  assert.match(migration, /strpos\(original_file_name, '\.\.'\) = 0/);
  assert.match(migration, /p_original_file_name <> normalized_file_name/);
  assert.match(migration, /U&'\[\\0080-\\009F[\s\S]*?\\FEFF\]'/);
  assert.doesNotMatch(migration, /student_visible|approved|infected/);
});

test("prepare derives counselor student path timestamps and enforces the bounded concurrent limit", () => {
  const prepare = migration.slice(
    migration.indexOf(
      "create function public.prepare_university_application_document_upload",
    ),
    migration.indexOf(
      "create function public.finalize_university_application_document_upload",
    ),
  );
  assert.match(prepare, /caller_id := \(select auth\.uid\(\)\)/);
  assert.match(
    prepare,
    /has_active_verified_kgeo_role\([\s\S]*?'counselor'::public\.user_role/,
  );
  assert.match(
    prepare,
    /student_profile\.role = 'student'::public\.user_role/,
  );
  assert.match(prepare, /application_record\.is_archived/);
  assert.match(prepare, /pg_try_advisory_xact_lock/);
  assert.match(prepare, /202608010001/);
  assert.match(prepare, /limit 21/);
  assert.match(prepare, /active_document_count >= 20/);
  assert.match(prepare, /document\.upload_expires_at > prepared_time/);
  assert.match(prepare, /prepared_time \+ interval '2 hours'/);
  assert.match(
    prepare,
    /'applications\/'.*application_record\.student_id[\s\S]*?p_application_id[\s\S]*?new_document_id/,
  );
  assert.doesNotMatch(
    prepare.slice(0, prepare.indexOf("returns table")),
    /student_id|counselor_id|bucket_id|storage_path|status|uploaded_by|expires/,
  );
});

test("finalization is uploader-bound object-existence checked immutable and archive-safe", () => {
  const finalize = migration.slice(
    migration.indexOf(
      "create function public.finalize_university_application_document_upload",
    ),
    migration.indexOf(
      "create function public.list_university_application_documents",
    ),
  );
  assert.match(finalize, /where document\.id = p_document_id\s*for update/);
  assert.match(finalize, /document_record\.uploaded_by <> caller_id/);
  assert.match(finalize, /document_record\.status <>[\s\S]*?'pending'/);
  assert.match(finalize, /application_record\.is_archived/);
  assert.match(finalize, /document_record\.upload_expires_at <= finalized_time/);
  assert.match(finalize, /from storage\.objects as storage_object/);
  assert.match(finalize, /storage_object\.bucket_id = document_record\.bucket_id/);
  assert.match(finalize, /storage_object\.name = document_record\.storage_path/);
  assert.match(finalize, /status = 'available'/);
  assert.doesNotMatch(finalize, /delete from|insert into storage\.objects|update storage\.objects/);
});

test("listing and view authorization are bounded available-only and relationship-bound", () => {
  const list = migration.slice(
    migration.indexOf("create function public.list_university_application_documents"),
    migration.indexOf(
      "create function public.authorize_university_application_document_view",
    ),
  );
  assert.match(list, /document\.application_id = p_application_id/);
  assert.match(list, /document\.status =[\s\S]*?'available'/);
  assert.match(list, /order by document\.available_at desc, document\.id desc/);
  assert.match(list, /limit 20/);
  assert.doesNotMatch(
    list.slice(list.indexOf("returns table"), list.indexOf("language plpgsql")),
    /student_id|uploaded_by|removed_by|removal_reason|storage_path|bucket_id|signed/,
  );

  const view = migration.slice(
    migration.indexOf(
      "create function public.authorize_university_application_document_view",
    ),
    migration.indexOf(
      "create function public.soft_remove_university_application_document",
    ),
  );
  assert.match(view, /document\.id = p_document_id/);
  assert.match(view, /document\.application_id = p_application_id/);
  assert.match(view, /document\.status =[\s\S]*?'available'/);
  assert.doesNotMatch(view, /createSignedUrl|getPublicUrl|token|expires_in/);
});

test("soft removal is archived-safe final audited and retains metadata and bytes", () => {
  const remove = migration.slice(
    migration.indexOf(
      "create function public.soft_remove_university_application_document",
    ),
    migration.indexOf(
      "create function public.can_upload_university_application_document_object",
    ),
  );
  assert.match(remove, /document_record\.status <>[\s\S]*?'available'/);
  assert.match(remove, /application_record\.is_archived/);
  assert.match(remove, /status = 'removed'/);
  assert.match(remove, /removed_by = caller_id/);
  assert.match(remove, /removed_at = removal_time/);
  assert.match(remove, /removal_reason = normalized_removal_reason/);
  assert.doesNotMatch(remove, /delete from|storage\.objects/);
  assert.doesNotMatch(migration, /restore_university|unremove_university/);
});

test("RLS grants and Storage predicates deny every non-counselor and direct mutation path", () => {
  assert.match(
    migration,
    /alter table public\.student_university_application_documents\s*enable row level security/,
  );
  assert.match(
    migration,
    /revoke all privileges on table[\s\S]*?from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /create policy university_application_documents_select_counselor[\s\S]*?status = 'available'/,
  );
  assert.equal(
    (migration.match(/create policy university_application_documents_/g) ?? [])
      .length,
    1,
  );
  assert.doesNotMatch(migration, /grant (insert|update|delete|select).*on table/i);
  assert.doesNotMatch(migration, /grant[\s\S]*?to (?:anon|public)\b/i);
  assert.match(
    migration,
    /can_upload_university_application_document_object[\s\S]*?document\.uploaded_by = \(select auth\.uid\(\)\)[\s\S]*?document\.upload_expires_at > pg_catalog\.statement_timestamp\(\)/,
  );
  assert.match(
    migration,
    /can_view_university_application_document_object[\s\S]*?document\.status =[\s\S]*?'available'/,
  );
  for (const helperName of [
    "can_upload_university_application_document_object",
    "can_view_university_application_document_object",
  ]) {
    const helperStart = migration.indexOf(`create function public.${helperName}`);
    const helperEnd = migration.indexOf("$function$;", helperStart);
    const helper = migration.slice(helperStart, helperEnd);
    assert.match(helper, /p_bucket_id = 'university-application-documents'/);
    assert.match(helper, /exception\s+when others then\s+return false/);
  }
  assert.doesNotMatch(migration, /storage\.objects[\s\S]*?(insert into|update|delete from) storage\.objects/i);
});

test("every callable contract is postgres-owned empty-search-path and authenticated-only", () => {
  const functionNames = [
    "prepare_university_application_document_upload",
    "finalize_university_application_document_upload",
    "list_university_application_documents",
    "authorize_university_application_document_view",
    "soft_remove_university_application_document",
    "can_upload_university_application_document_object",
    "can_view_university_application_document_object",
  ];
  for (const functionName of functionNames) {
    assert.match(
      migration,
      new RegExp(
        `create function public\\.${functionName}\\([\\s\\S]*?security definer[\\s\\S]*?set search_path = ''`,
      ),
    );
    assert.match(
      migration,
      new RegExp(`alter function public\\.${functionName}\\([\\s\\S]*?owner to postgres`),
    );
    assert.match(
      migration,
      new RegExp(`revoke all on function[\\s\\S]*?public\\.${functionName}\\([\\s\\S]*?from public, anon, authenticated`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function[\\s\\S]*?public\\.${functionName}\\([\\s\\S]*?to authenticated`),
    );
  }
});

test("document file validation accepts only PDF JPEG PNG and WebP with matching extensions", () => {
  const accepted = [
    ["statement.pdf", "application/pdf"],
    ["photo.jpg", "image/jpeg"],
    ["photo.jpeg", "image/jpeg"],
    ["scan.png", "image/png"],
    ["scan.webp", "image/webp"],
  ] as const;
  for (const [name, type] of accepted) {
    assert.equal(
      validateUniversityApplicationDocumentFile({ name, type, size: 1 })
        .success,
      true,
    );
  }
  for (const file of [
    { name: "letter.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", size: 1 },
    { name: "archive.zip", type: "application/zip", size: 1 },
    { name: "wrong.png", type: "application/pdf", size: 1 },
    { name: "../secret.pdf", type: "application/pdf", size: 1 },
    { name: "folder\\secret.pdf", type: "application/pdf", size: 1 },
    { name: ".pdf", type: "application/pdf", size: 1 },
    { name: "secret..pdf", type: "application/pdf", size: 1 },
    { name: "payload.exe.pdf", type: "application/pdf", size: 1 },
    { name: "report.final.pdf", type: "application/pdf", size: 1 },
    { name: "report.pdf ", type: "application/pdf", size: 1 },
    { name: "report.pdf.", type: "application/pdf", size: 1 },
    { name: "report\u202epdf.pdf", type: "application/pdf", size: 1 },
    { name: "empty.pdf", type: "application/pdf", size: 0 },
    { name: "large.pdf", type: "application/pdf", size: UNIVERSITY_APPLICATION_DOCUMENT_MAX_BYTES + 1 },
  ]) {
    assert.equal(validateUniversityApplicationDocumentFile(file).success, false);
  }
});

test("title reason UUID path and expiry contracts normalize and reject malformed values", () => {
  assert.equal(normalizeUniversityApplicationDocumentText("  Visa   copy  "), "Visa copy");
  assert.deepEqual(validateUniversityApplicationDocumentTitle(" Visa  copy "), {
    success: true,
    data: "Visa copy",
  });
  assert.equal(validateUniversityApplicationDocumentTitle(" ").success, false);
  assert.equal(validateUniversityApplicationDocumentTitle("A").success, false);
  assert.equal(validateUniversityApplicationDocumentTitle("Bad\u0000title").success, false);
  assert.equal(validateUniversityApplicationDocumentTitle("Bad\ttitle").success, false);
  assert.equal(validateUniversityApplicationDocumentTitle("Bad\u202etitle").success, false);
  assert.equal(validateUniversityApplicationDocumentRemovalReason(" ").success, false);
  assert.equal(
    validateUniversityApplicationDocumentRemovalReason("Bad\nreason").success,
    false,
  );
  assert.equal(
    validateUniversityApplicationDocumentRemovalReason("Bad\u200breason").success,
    false,
  );
  assert.equal(
    validateUniversityApplicationDocumentRemovalReason(" Duplicate   copy ").success,
    true,
  );

  const studentId = "11111111-1111-4111-8111-111111111111";
  const applicationId = "22222222-2222-4222-8222-222222222222";
  const documentId = "33333333-3333-4333-8333-333333333333";
  const path = `applications/${studentId}/${applicationId}/${documentId}/${documentId}.pdf`;
  assert.equal(isUniversityApplicationDocumentUuid(applicationId), true);
  assert.equal(isUniversityApplicationDocumentUuid("not-a-uuid"), false);
  assert.equal(
    isUniversityApplicationDocumentStoragePath(
      path,
      applicationId,
      documentId,
      "pdf",
    ),
    true,
  );
  assert.equal(
    isUniversityApplicationDocumentStoragePath(
      `../${path}`,
      applicationId,
      documentId,
      "pdf",
    ),
    false,
  );

  for (const timestamp of [
    "2026-08-01T08:00:00Z",
    "2026-08-01T13:30:00.123456+05:30",
    "2026-08-01T02:30:00-05:30",
  ]) {
    assert.equal(isUniversityApplicationDocumentTimestamp(timestamp), true);
  }
  for (const timestamp of [
    "2026-02-30T08:00:00Z",
    "2026-13-01T08:00:00Z",
    "2026-08-01T24:00:00Z",
    "2026-08-01T08:00:60Z",
    "2026-08-01",
    "2026-08-01T08:00:00",
  ]) {
    assert.equal(isUniversityApplicationDocumentTimestamp(timestamp), false);
  }
  assert.doesNotMatch(moduleSource, /Date\.parse/);
});

test("prepare list and view parsers reject tampering unbounded rows and raw unexpected metadata", () => {
  const now = new Date("2026-08-01T08:00:00.000Z");
  const studentId = "11111111-1111-4111-8111-111111111111";
  const applicationId = "22222222-2222-4222-8222-222222222222";
  const documentId = "33333333-3333-4333-8333-333333333333";
  const storagePath = `applications/${studentId}/${applicationId}/${documentId}/${documentId}.pdf`;
  const prepared = {
    document_id: documentId,
    application_id: applicationId,
    bucket_id: UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID,
    storage_path: storagePath,
    document_title: "Application form",
    original_file_name: "application.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 1024,
    upload_expires_at: "2026-08-01T10:00:00.000Z",
  };
  const expected = {
    applicationId,
    documentTitle: "Application form",
    originalFileName: "application.pdf",
    mimeType: "application/pdf" as const,
    fileSizeBytes: 1024,
  };
  assert.ok(parsePrepareUniversityApplicationDocumentUploadResult(prepared, expected, now));
  assert.equal(
    parsePrepareUniversityApplicationDocumentUploadResult(
      { ...prepared, uploaded_by: studentId },
      expected,
      now,
    ),
    null,
  );
  assert.equal(
    parsePrepareUniversityApplicationDocumentUploadResult(
      { ...prepared, storage_path: `../${storagePath}` },
      expected,
      now,
    ),
    null,
  );

  const listed = {
    document_id: documentId,
    application_id: applicationId,
    document_title: "Application form",
    original_file_name: "application.pdf",
    mime_type: "application/pdf",
    file_size_bytes: 1024,
    available_at: "2026-08-01T09:00:00.000Z",
  };
  assert.equal(parseUniversityApplicationDocumentList([listed], applicationId)?.length, 1);
  assert.equal(
    parseUniversityApplicationDocumentList(
      Array.from({ length: UNIVERSITY_APPLICATION_DOCUMENT_MAX_ACTIVE + 1 }, () => listed),
      applicationId,
    ),
    null,
  );
  assert.equal(
    parseUniversityApplicationDocumentList(
      [{ ...listed, storage_path: storagePath }],
      applicationId,
    ),
    null,
  );
  assert.equal(
    parseUniversityApplicationDocumentList(
      [{ ...listed, mime_type: "image/png" }],
      applicationId,
    ),
    null,
  );
  assert.ok(
    parseUniversityApplicationDocumentViewAuthorization(
      {
        document_id: documentId,
        application_id: applicationId,
        bucket_id: UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID,
        storage_path: storagePath,
      },
      { applicationId, documentId },
    ),
  );
});

test("metadata parsing enforces path file and complete lifecycle relationships", () => {
  const studentId = "11111111-1111-4111-8111-111111111111";
  const applicationId = "22222222-2222-4222-8222-222222222222";
  const documentId = "33333333-3333-4333-8333-333333333333";
  const counselorId = "44444444-4444-4444-8444-444444444444";
  const storagePath = `applications/${studentId}/${applicationId}/${documentId}/${documentId}.pdf`;
  const availableMetadata = {
    id: documentId,
    application_id: applicationId,
    status: "available",
    document_title: "Application form",
    original_file_name: "application.pdf",
    bucket_id: UNIVERSITY_APPLICATION_DOCUMENT_BUCKET_ID,
    storage_path: storagePath,
    mime_type: "application/pdf",
    file_size_bytes: 1024,
    uploaded_by: counselorId,
    prepared_at: "2026-08-01T08:00:00.000Z",
    upload_expires_at: "2026-08-01T10:00:00.000Z",
    available_at: "2026-08-01T09:00:00.000Z",
    removed_at: null,
    removed_by: null,
    removal_reason: null,
    created_at: "2026-08-01T08:00:00.000Z",
    updated_at: "2026-08-01T09:00:00.000Z",
  };

  assert.ok(parseUniversityApplicationDocumentMetadata(availableMetadata));
  assert.equal(
    parseUniversityApplicationDocumentMetadata({
      ...availableMetadata,
      mime_type: "image/png",
    }),
    null,
  );
  assert.equal(
    parseUniversityApplicationDocumentMetadata({
      ...availableMetadata,
      storage_path: `applications/${studentId}/${applicationId}/${counselorId}/${counselorId}.pdf`,
    }),
    null,
  );
  assert.equal(
    parseUniversityApplicationDocumentMetadata({
      ...availableMetadata,
      status: "pending",
    }),
    null,
  );
  assert.equal(
    parseUniversityApplicationDocumentMetadata({
      ...availableMetadata,
      upload_expires_at: "2026-08-01T11:00:00.000Z",
    }),
    null,
  );
  assert.equal(
    parseUniversityApplicationDocumentMetadata({
      ...availableMetadata,
      status: "removed",
      removed_at: "2026-08-01T09:30:00.000Z",
      removed_by: counselorId,
      removal_reason: "Bad\u200breason",
      updated_at: "2026-08-01T09:30:00.000Z",
    }),
    null,
  );
});

test("database and domain types contain exact E1.3.3 parity without changing existing RPC names", () => {
  for (const symbol of [
    "UniversityApplicationDocumentStatus",
    "UniversityApplicationDocumentMimeType",
    "UniversityApplicationDocumentMetadata",
    "CounselorUniversityApplicationDocument",
  ]) {
    assert.match(domainTypes, new RegExp(symbol));
  }
  for (const symbol of [
    "student_university_application_documents",
    "prepare_university_application_document_upload",
    "finalize_university_application_document_upload",
    "list_university_application_documents",
    "authorize_university_application_document_view",
    "soft_remove_university_application_document",
    "can_upload_university_application_document_object",
    "can_view_university_application_document_object",
    "university_application_document_status",
  ]) {
    assert.match(databaseTypes, new RegExp(symbol));
  }
  assert.equal(UNIVERSITY_APPLICATION_DOCUMENT_UPLOAD_INTENT_SECONDS, 7200);
  assert.equal(UNIVERSITY_APPLICATION_DOCUMENT_SIGNED_VIEW_SECONDS, 300);
  assert.deepEqual(UNIVERSITY_APPLICATION_DOCUMENT_MIME_TYPES, [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);
});

test("readiness and documentation preserve the E1.3.3 foundation while E1.3.4 uses it", () => {
  for (const marker of [
    "E1.3.3",
    "university_application_document_status",
    "student_university_application_documents",
    "university-application-documents",
    "invalid university application document lifecycle rows",
    "expired pending university application documents",
  ]) {
    assert.match(readiness, new RegExp(marker));
  }
  assert.match(readiness, /enumlabel::text/);
  assert.match(readiness, /array\['pending', 'available', 'removed'\]::text\[\]/);
  assert.match(documentation, /Phase E1\.3\.3/);
  assert.match(documentation, /`CREATE POLICY` rejects an existing policy name/);
  assert.match(documentation, /cannot be live-tested during E1\.3\.3/);
  assert.match(documentation, /Phase E1\.3\.4 now provides/);
  assert.match(documentation, /foundation itself contains no upload UI/);
  assert.match(documentation, /E1\.4 has not started/);
  assert.doesNotMatch(migration, /service_role|service-role|auth\.admin/i);
  assert.doesNotMatch(migration, /getPublicUrl|createSignedUrl|createSignedUploadUrl/);
  assert.doesNotMatch(migration, /insert into public\.student_university_application_events/);
  assert.doesNotMatch(migration, /update public\.student_university_applications/);
  assert.doesNotMatch(migration, /student_counseling_progression/);
  assert.doesNotMatch(migration, /execute format|dynamic sql/i);
});
