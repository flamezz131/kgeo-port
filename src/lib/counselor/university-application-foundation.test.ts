import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  UNIVERSITY_APPLICATION_DEGREE_LEVELS,
  UNIVERSITY_APPLICATION_EVENT_PAGE_SIZE,
  UNIVERSITY_APPLICATION_EVENT_TYPES,
  UNIVERSITY_APPLICATION_INTAKE_TERMS,
  UNIVERSITY_APPLICATION_PORTAL_URL_PATTERN,
  UNIVERSITY_APPLICATION_STATUSES,
  UNIVERSITY_APPLICATION_STATUS_TRANSITIONS,
  UNIVERSITY_APPLICATION_STUDENT_READ_LIMIT,
  UNIVERSITY_APPLICATION_TERMINAL_STATUSES,
} = require("./university-applications.ts") as typeof import(
  "./university-applications"
);

const migrationName =
  "202607270001_university_application_foundation.sql";
const migrationPath = new URL(
  `../../../supabase/migrations/${migrationName}`,
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
const docsPath = new URL("../../../docs/database.md", import.meta.url);

const migrationSource = readFileSync(migrationPath, "utf8");
const executableMigration = migrationSource.replace(/--.*$/gm, "");
const readinessSource = readFileSync(readinessPath, "utf8");
const databaseTypesSource = readFileSync(databaseTypesPath, "utf8");
const sharedTypesSource = readFileSync(sharedTypesPath, "utf8");
const docsSource = readFileSync(docsPath, "utf8");

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
  "202607260002_progression_correction_foundation.sql":
    "90d9a6e6f1b7fecb5a8a2e667c61eeb62b8546b33db402c3e1faf21a09e207fb",
} as const;

function enumValues(enumName: string): string[] {
  const enumBody =
    executableMigration.match(
      new RegExp(
        `create type public\\.${enumName} as enum \\(([\\s\\S]*?)\\);`,
      ),
    )?.[1] ?? "";
  return [...enumBody.matchAll(/'([^']+)'/g)].map(
    (match) => match[1],
  );
}

function tableBody(tableName: string): string {
  return (
    executableMigration.match(
      new RegExp(
        `create table public\\.${tableName} \\(([\\s\\S]*?)\\n\\);`,
      ),
    )?.[1] ?? ""
  );
}

function functionBody(functionName: string): string {
  return (
    executableMigration.match(
      new RegExp(
        `create function public\\.${functionName}\\([\\s\\S]*?\\$function\\$;`,
      ),
    )?.[0] ?? ""
  );
}

const createRpc = functionBody(
  "create_student_university_application",
);
const detailsRpc = functionBody(
  "update_student_university_application_details",
);
const statusRpc = functionBody(
  "record_student_university_application_status",
);
const primaryRpc = functionBody(
  "set_primary_student_university_application",
);
const archiveRpc = functionBody(
  "archive_student_university_application",
);
const mutationRpcs = [
  createRpc,
  detailsRpc,
  statusRpc,
  primaryRpc,
  archiveRpc,
];

test("the reviewed E1.1 migration has the expected production hash", () => {
  assert.equal(
    createHash("sha256").update(migrationSource).digest("hex"),
    "09d8c32734b159535387a4f6e21fda54d4b59ba4bbb60de4f93b7179794cb35b",
  );
});

test("E1.1 is one additive transaction and every earlier migration is unchanged", () => {
  assert.match(executableMigration, /^\s*begin;/);
  assert.match(executableMigration, /\bcommit;\s*$/);

  const earlierNames = readdirSync(migrationsDirectory)
    .filter((name) => name < migrationName)
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

test("the four enums contain only the exact E1.1 values", () => {
  assert.deepEqual(
    enumValues("university_application_status"),
    UNIVERSITY_APPLICATION_STATUSES,
  );
  assert.deepEqual(
    enumValues("university_application_degree_level"),
    UNIVERSITY_APPLICATION_DEGREE_LEVELS,
  );
  assert.deepEqual(
    enumValues("university_application_intake_term"),
    UNIVERSITY_APPLICATION_INTAKE_TERMS,
  );
  assert.deepEqual(
    enumValues("university_application_event_type"),
    UNIVERSITY_APPLICATION_EVENT_TYPES,
  );
  assert.deepEqual(UNIVERSITY_APPLICATION_TERMINAL_STATUSES, [
    "withdrawn",
    "closed",
  ]);
});

test("the current projection has the exact required columns and restrictive foreign keys", () => {
  const body = tableBody("student_university_applications");
  for (const column of [
    "id uuid",
    "student_id uuid",
    "country_code text",
    "university_name text",
    "programme_name text",
    "degree_level public.university_application_degree_level",
    "intake_term public.university_application_intake_term",
    "intake_year smallint",
    "current_status public.university_application_status",
    "application_reference text",
    "portal_url text",
    "submission_deadline date",
    "submitted_at timestamptz",
    "is_primary boolean",
    "is_archived boolean",
    "archived_at timestamptz",
    "archived_by uuid",
    "archive_reason text",
    "version_number integer",
    "created_by uuid",
    "last_changed_by uuid",
    "created_at timestamptz",
    "updated_at timestamptz",
    "last_changed_at timestamptz",
  ]) {
    assert.match(body, new RegExp(`\\b${column.replaceAll(".", "\\.")}`));
  }
  assert.equal(body.match(/references public\.profiles\(id\)/g)?.length, 4);
  assert.equal(body.match(/on delete restrict/g)?.length, 4);
  assert.doesNotMatch(
    body,
    /student_counseling_progressions|on delete cascade/,
  );
});

test("field constraints normalize bounded identity data and HTTPS URLs", () => {
  const applicationBody = tableBody(
    "student_university_applications",
  );
  const eventBody = tableBody(
    "student_university_application_events",
  );
  for (const body of [applicationBody, eventBody]) {
    assert.match(body, /\^\[A-Z\]\{2\}\$/);
    assert.match(body, /char_length\(university_name\) between 2 and 200/);
    assert.match(body, /char_length\(programme_name\) between 2 and 200/);
    assert.match(body, /intake_year between 2020 and 2100/);
    assert.match(body, /char_length\(application_reference\) between 1 and 100/);
    assert.match(body, /char_length\(portal_url\) between 1 and 2048/);
    assert.match(body, /\^https:\/\//);
    assert.match(body, /\[A-Za-z0-9-\]\{0,61\}/);
    assert.match(body, /portal_url !~ '\^https:\/\/\[\^\/\?#\]\*@'/);
    assert.match(body, /\[\[:cntrl:\]\]/);
  }
});

test("portal URL validation accepts ordinary HTTPS portals and rejects ambiguous hosts", () => {
  for (const validUrl of [
    "https://apply.example.edu",
    "https://student-portal.example.edu/apply?intake=fall#documents",
    "https://xn--bcher-kva.example/path",
  ]) {
    assert.equal(
      UNIVERSITY_APPLICATION_PORTAL_URL_PATTERN.test(validUrl),
      true,
      validUrl,
    );
  }

  for (const invalidUrl of [
    "http://apply.example.edu",
    "/apply",
    "https://user:password@example.edu/apply",
    "https://example..edu",
    "https://-example.edu",
    "https://example-.edu",
    "https://example.-edu",
    "https://example.edu:8443/apply",
    "https://[2001:db8::1]/apply",
    "https://example.edu/white space",
    "https://example.edu/\u0000",
  ]) {
    assert.equal(
      UNIVERSITY_APPLICATION_PORTAL_URL_PATTERN.test(invalidUrl),
      false,
      invalidUrl,
    );
  }
});

test("the append-only event table is a complete typed post-mutation snapshot", () => {
  const body = tableBody(
    "student_university_application_events",
  );
  for (const snapshotField of [
    "country_code",
    "university_name",
    "programme_name",
    "degree_level",
    "intake_term",
    "intake_year",
    "application_status",
    "application_reference",
    "portal_url",
    "submission_deadline",
    "submitted_at",
    "is_primary",
    "is_archived",
  ]) {
    assert.match(body, new RegExp(`\\b${snapshotField}\\b`));
  }
  assert.match(
    body,
    /unique \(application_id, version_number\)/,
  );
  assert.match(
    body,
    /references public\.student_university_applications\(id\)[\s\S]*?on delete restrict/,
  );
  assert.match(
    body,
    /event_type = 'created'[\s\S]*?change_reason is null/,
  );
  assert.match(
    body,
    /event_type <> 'created'[\s\S]*?char_length\(change_reason\) between 1 and 500/,
  );
  assert.match(
    body,
    /version_number = 1[\s\S]*?event_type =[\s\S]*?'created'[\s\S]*?version_number > 1[\s\S]*?event_type <>[\s\S]*?'created'/,
  );
});

test("all mutation RPCs independently authorize, share one lock, and validate student role", () => {
  assert.equal(mutationRpcs.filter(Boolean).length, 5);
  for (const rpc of mutationRpcs) {
    assert.match(rpc, /caller_id := \(select auth\.uid\(\)\)/);
    assert.match(
      rpc,
      /has_active_verified_kgeo_role\(\s*'counselor'::public\.user_role/,
    );
    assert.match(
      rpc,
      /student_profile\.role = 'student'::public\.user_role/,
    );
    assert.match(rpc, /hashtextextended\([\s\S]*?202607270001/);
    assert.match(rpc, /security definer/);
    assert.match(rpc, /set search_path = ''/);
    assert.doesNotMatch(
      rpc,
      /p_counselor|p_actor|p_changed_by|p_created_by|p_version|p_timestamp/,
    );
  }
  for (const rpc of mutationRpcs.slice(1)) {
    assert.match(rpc, /for update/);
  }
});

test("creation fixes planning version one and writes one atomic created snapshot", () => {
  assert.match(
    createRpc,
    /'planning'::public\.university_application_status/,
  );
  assert.match(createRpc, /null,\s*false,\s*false,/);
  assert.match(createRpc, /\s1,\s*caller_id,\s*caller_id,/);
  assert.match(
    createRpc,
    /'created'::public\.university_application_event_type/,
  );
  assert.doesNotMatch(
    createRpc.match(
      /create_student_university_application\(([\s\S]*?)\)\s*returns/,
    )?.[1] ?? "",
    /status|primary|archiv|submitted|actor|version|event/,
  );
  for (const requiredValue of [
    "normalized_country_code",
    "normalized_university_name",
    "normalized_programme_name",
    "normalized_degree_level",
    "normalized_intake_term",
    "p_intake_year",
  ]) {
    assert.match(createRpc, new RegExp(`or ${requiredValue} is null`));
  }
});

test("details updates are normalized, reasoned, no-op safe, versioned, and atomic", () => {
  assert.match(detailsRpc, /normalized_reason is null/);
  assert.match(
    detailsRpc,
    /current_application\.country_code = normalized_country_code/,
  );
  assert.match(
    detailsRpc,
    /version_number = application\.version_number \+ 1/,
  );
  assert.match(
    detailsRpc,
    /'details_updated'::public\.university_application_event_type/,
  );
  assert.match(detailsRpc, /current_application\.is_archived/);
  assert.doesNotMatch(
    detailsRpc.match(
      /update_student_university_application_details\(([\s\S]*?)\)\s*returns/,
    )?.[1] ?? "",
    /student_id|status|submitted_at|primary|archived_by|version|actor/,
  );
  for (const requiredValue of [
    "normalized_country_code",
    "normalized_university_name",
    "normalized_programme_name",
    "normalized_degree_level",
    "normalized_intake_term",
    "p_intake_year",
  ]) {
    assert.match(detailsRpc, new RegExp(`or ${requiredValue} is null`));
  }
});

test("the central and SQL transition graphs contain every permitted transition and no terminal exit", () => {
  const expectedTransitions = {
    planning: [
      "documents_collecting",
      "application_preparing",
      "withdrawn",
      "closed",
    ],
    documents_collecting: [
      "application_preparing",
      "ready_to_submit",
      "withdrawn",
      "closed",
    ],
    application_preparing: [
      "documents_collecting",
      "ready_to_submit",
      "withdrawn",
      "closed",
    ],
    ready_to_submit: ["submitted", "withdrawn", "closed"],
    submitted: [
      "under_university_review",
      "additional_information_requested",
      "decision_received",
      "withdrawn",
      "closed",
    ],
    under_university_review: [
      "additional_information_requested",
      "decision_received",
      "withdrawn",
      "closed",
    ],
    additional_information_requested: [
      "under_university_review",
      "decision_received",
      "withdrawn",
      "closed",
    ],
    decision_received: ["withdrawn", "closed"],
    withdrawn: [],
    closed: [],
  };
  assert.deepEqual(
    UNIVERSITY_APPLICATION_STATUS_TRANSITIONS,
    expectedTransitions,
  );

  const sqlTransitions = Object.fromEntries(
    [
      ...statusRpc.matchAll(
        /when '([^']+)'::public\.university_application_status then\s+requested_status in \(([\s\S]*?)\)\s+(?=when|else)/g,
      ),
    ].map((match) => [
      match[1],
      [...match[2].matchAll(/'([^']+)'::public\./g)].map(
        (value) => value[1],
      ),
    ]),
  );
  assert.deepEqual(sqlTransitions, {
    planning: expectedTransitions.planning,
    documents_collecting: expectedTransitions.documents_collecting,
    application_preparing: expectedTransitions.application_preparing,
    ready_to_submit: expectedTransitions.ready_to_submit,
    submitted: expectedTransitions.submitted,
    under_university_review:
      expectedTransitions.under_university_review,
    additional_information_requested:
      expectedTransitions.additional_information_requested,
    decision_received: expectedTransitions.decision_received,
  });
  assert.match(
    statusRpc,
    /transition_allowed := case current_application\.current_status/,
  );
  assert.match(
    statusRpc,
    /current_application\.current_status in \([\s\S]*?'withdrawn'[\s\S]*?'closed'/,
  );
  assert.match(statusRpc, /current_application\.current_status = requested_status/);
  assert.match(statusRpc, /or normalized_status is null/);
});

test("submitted timestamps are created once and preserved through later statuses", () => {
  assert.match(
    statusRpc,
    /next_submitted_at := current_application\.submitted_at/,
  );
  assert.match(
    statusRpc,
    /requested_status =[\s\S]*?'submitted'[\s\S]*?next_submitted_at is null[\s\S]*?next_submitted_at := change_time/,
  );
  assert.doesNotMatch(statusRpc, /p_submitted_at/);
  assert.doesNotMatch(
    detailsRpc + primaryRpc + archiveRpc,
    /submitted_at = null/,
  );
});

test("primary switching locks deterministically and audits both affected applications", () => {
  assert.match(
    executableMigration,
    /create unique index student_university_applications_one_primary_idx[\s\S]*?where is_primary is true/,
  );
  assert.match(
    tableBody("student_university_applications"),
    /primary_consistency_check[\s\S]*?not is_archived[\s\S]*?'withdrawn'[\s\S]*?'closed'/,
  );
  assert.match(
    primaryRpc,
    /order by application\.id\s+for update/,
  );
  assert.match(primaryRpc, /previous_primary_exists/);
  assert.match(primaryRpc, /is_primary = false/);
  assert.match(primaryRpc, /is_primary = true/);
  assert.equal(
    primaryRpc.match(
      /'primary_changed'::public\.university_application_event_type/g,
    )?.length,
    2,
  );
});

test("archive is one final soft-retention mutation that preserves status and clears primary", () => {
  assert.match(archiveRpc, /current_application\.is_archived/);
  assert.match(archiveRpc, /is_primary = false/);
  assert.match(archiveRpc, /is_archived = true/);
  assert.match(archiveRpc, /archived_at = change_time/);
  assert.match(archiveRpc, /archived_by = caller_id/);
  assert.match(
    archiveRpc,
    /'archived'::public\.university_application_event_type/,
  );
  assert.doesNotMatch(archiveRpc, /current_status\s*=/);
  assert.doesNotMatch(executableMigration, /create function [\s\S]*unarchive/i);
});

test("projection and snapshot mutations are versioned in one PostgreSQL function statement", () => {
  assert.equal(
    executableMigration.match(
      /insert into public\.student_university_application_events/g,
    )?.length,
    6,
  );
  assert.equal(
    executableMigration.match(
      /version_number = application\.version_number \+ 1/g,
    )?.length,
    5,
  );
  assert.match(
    tableBody("student_university_applications"),
    /version_number >= 1/,
  );
  assert.match(
    tableBody("student_university_application_events"),
    /version_number >= 1/,
  );
});

test("RLS and grants are exactly counselor SELECT and RPC-only mutation", () => {
  assert.match(
    executableMigration,
    /alter table public\.student_university_applications\s+enable row level security/,
  );
  assert.match(
    executableMigration,
    /alter table public\.student_university_application_events\s+enable row level security/,
  );
  assert.equal(executableMigration.match(/\bcreate policy\b/g)?.length, 2);
  assert.equal(
    executableMigration.match(
      /has_active_verified_kgeo_role\(\s*'counselor'::public\.user_role/g,
    )?.length,
    7,
  );
  assert.doesNotMatch(
    executableMigration,
    /create policy [\s\S]*?\nfor (?:insert|update|delete)\n/,
  );
  assert.doesNotMatch(
    executableMigration,
    /grant (?:insert|update|delete|truncate) [\s\S]*?student_university_application/i,
  );
  assert.match(
    executableMigration,
    /revoke all on function public\.create_student_university_application[\s\S]*?from public, anon, authenticated/,
  );
});

test("RPC return contracts expose no counselor UUID or private event reason", () => {
  for (const rpc of mutationRpcs.slice(0, 4)) {
    const returns = rpc.match(/returns table \(([\s\S]*?)\)\s*language/)?.[1] ?? "";
    assert.match(returns, /application_id uuid/);
    assert.match(returns, /student_id uuid/);
    assert.match(returns, /version_number integer/);
    assert.doesNotMatch(
      returns,
      /created_by|last_changed_by|archived_by|changed_by|change_reason|college_email|full_name/,
    );
  }
  const archiveReturns =
    archiveRpc.match(/returns table \(([\s\S]*?)\)\s*language/)?.[1] ?? "";
  assert.match(archiveReturns, /archived_at timestamptz/);
  assert.doesNotMatch(archiveReturns, /archived_by|archive_reason/);
});

test("indexes support bounded future reads without global reporting indexes", () => {
  assert.match(
    executableMigration,
    /student_university_applications_student_active_idx[\s\S]*?student_id[\s\S]*?is_archived[\s\S]*?is_primary desc[\s\S]*?updated_at desc[\s\S]*?id desc/,
  );
  assert.match(
    executableMigration,
    /student_university_applications_student_status_idx[\s\S]*?student_id[\s\S]*?current_status[\s\S]*?updated_at desc[\s\S]*?id desc/,
  );
  assert.match(
    executableMigration,
    /student_university_application_events_history_idx[\s\S]*?application_id[\s\S]*?version_number desc[\s\S]*?changed_at desc[\s\S]*?id desc/,
  );
  assert.equal(UNIVERSITY_APPLICATION_STUDENT_READ_LIMIT, 100);
  assert.equal(UNIVERSITY_APPLICATION_EVENT_PAGE_SIZE, 25);
});

test("types, labels, readiness, and documentation contain the exact E1.1 contract", () => {
  for (const contractName of [
    "UniversityApplicationStatus",
    "UniversityApplicationDegreeLevel",
    "UniversityApplicationIntakeTerm",
    "UniversityApplicationEventType",
    "student_university_applications",
    "student_university_application_events",
    "create_student_university_application",
    "update_student_university_application_details",
    "record_student_university_application_status",
    "set_primary_student_university_application",
    "archive_student_university_application",
  ]) {
    assert.match(
      `${sharedTypesSource}\n${databaseTypesSource}`,
      new RegExp(contractName),
    );
  }
  assert.match(readinessSource, /Phase E1\.1/);
  assert.match(readinessSource, /E1\.1 RPC execution is authenticated only/);
  assert.match(readinessSource, /application projections differing from latest snapshot/);
  assert.match(docsSource, /University application tracking foundation \(Phase E1\.1\)/);
  assert.match(docsSource, /independent domains/);
  assert.match(docsSource, /excludes nonstandard ports, IPv6 literals/);
  assert.match(docsSource, /version one to be the `created` event/);
});

test("E1.1 adds no hard delete, Storage, progression automation, or later-phase model", () => {
  assert.doesNotMatch(
    executableMigration,
    /delete from public\.student_university_application/i,
  );
  assert.doesNotMatch(
    executableMigration,
    /(?:insert into|update|delete from)\s+public\.student_counseling_progression/i,
  );
  assert.doesNotMatch(
    executableMigration,
    /storage\.objects|service[_-]?role|auth\.admin|execute\s+format/i,
  );

  const tableColumns =
    tableBody("student_university_applications") +
    tableBody("student_university_application_events");
  assert.doesNotMatch(
    tableColumns,
    /\b(?:offer|scholarship|deposit|visa|cas|i_20|travel|accommodation)\w*\s+(?:text|date|boolean|integer|numeric|uuid)/i,
  );
  assert.doesNotMatch(
    enumValues("university_application_status").join(" "),
    /offer|scholarship|deposit|visa|admitted|rejected/,
  );
});

test("expected and unexpected failures are sanitized without raw database detail", () => {
  for (const rpc of mutationRpcs) {
    assert.match(
      rpc,
      /The university application request is invalid/,
    );
    assert.match(
      rpc,
      /The university applications changed concurrently/,
    );
    assert.match(rpc, /when others then/);
    assert.doesNotMatch(
      rpc,
      /SQLERRM|PG_EXCEPTION_DETAIL|constraint_name|table_name/,
    );
  }
});
