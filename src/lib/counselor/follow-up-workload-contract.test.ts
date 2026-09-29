import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationUrl = new URL(
  "../../../supabase/migrations/202607250002_counselor_follow_up_workload.sql",
  import.meta.url,
);
const migration = readFileSync(migrationUrl, "utf8");
const executableMigration = migration.replace(/--.*$/gm, "");
const functionBody =
  migration.match(
    /create function public\.list_counselor_follow_up_workload\([\s\S]*?\$function\$;/,
  )?.[0] ?? "";
const returnContract =
  functionBody.match(/returns table \(([\s\S]*?)\)\s*language plpgsql/)?.[1] ??
  "";

const priorMigrationHashes: Readonly<Record<string, string>> = {
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
};

function readPriorMigration(fileName: string): string {
  return readFileSync(
    new URL(`../../../supabase/migrations/${fileName}`, import.meta.url),
    "utf8",
  );
}

test("D2 workload migration is additive and prior migrations are unchanged", () => {
  assert.match(executableMigration, /^\s*begin;/);
  assert.match(executableMigration, /\bcommit;\s*$/);
  assert.equal(
    executableMigration.match(
      /\bcreate function public\.list_counselor_follow_up_workload\(/g,
    )?.length,
    1,
  );
  assert.doesNotMatch(
    executableMigration,
    /^\s*(?:create|alter|drop)\s+(?:table|type|index|policy)\b/im,
  );
  assert.doesNotMatch(executableMigration, /\b(?:insert|update|delete)\b/i);

  for (const [fileName, expectedHash] of Object.entries(
    priorMigrationHashes,
  )) {
    const actualHash = createHash("sha256")
      .update(readPriorMigration(fileName))
      .digest("hex");
    assert.equal(actualHash, expectedHash, `${fileName} changed`);
  }
});

test("RPC has a fixed counselor-derived security boundary", () => {
  assert.match(functionBody, /security definer/);
  assert.match(functionBody, /set search_path = ''/);
  assert.match(functionBody, /caller_id := \(select auth\.uid\(\)\)/);
  assert.match(functionBody, /role = 'counselor'::public\.user_role/);
  assert.match(functionBody, /is_active is true/);
  assert.match(functionBody, /email_confirmed_at is not null/);
  assert.match(functionBody, /follow_up\.counselor_id = caller_id/);
  assert.match(
    functionBody,
    /student_account\.role = 'student'::public\.user_role/,
  );
  assert.doesNotMatch(functionBody, /\bp_counselor_id\b/);
  assert.doesNotMatch(functionBody, /\bexecute\b|\bformat\s*\(/i);
  assert.doesNotMatch(migration, /service.?role|service_role/i);
});

test("return contract is relational, minimal, and supports empty-page metrics", () => {
  for (const column of [
    "follow_up_id uuid",
    "student_id uuid",
    "consultation_id uuid",
    "due_date date",
    "priority public.counselor_follow_up_priority",
    "stored_status public.counselor_follow_up_status",
    "next_action text",
    "completed_at timestamptz",
    "created_at timestamptz",
    "updated_at timestamptz",
    "full_name text",
    "college_email text",
    "roll_number text",
    "total_count bigint",
    "overdue_count bigint",
    "due_today_count bigint",
    "upcoming_count bigint",
    "completed_count bigint",
    "cancelled_count bigint",
    "total_pending_count bigint",
  ]) {
    assert.match(returnContract, new RegExp(column.replaceAll(".", "\\.")));
  }
  assert.doesNotMatch(
    returnContract,
    /details|request_number|personal_email|mobile|cgpa|backlog|remark|preference|exam|achievement|note|auth|counselor_email/i,
  );
  assert.match(functionBody, /cross join filtered_total/);
  assert.match(functionBody, /left join page_rows as page_row\s+on true/);
  assert.doesNotMatch(functionBody, /\bjsonb?\b/i);
});

test("filters, search, metrics, and pagination remain database-side and bounded", () => {
  assert.match(functionBody, /normalized_lifecycle not in \(/);
  assert.match(
    functionBody,
    /'all',\s*'overdue',\s*'due_today',\s*'upcoming',\s*'completed',\s*'cancelled'/,
  );
  assert.match(
    functionBody,
    /normalized_priority not in \('all', 'low', 'normal', 'high'\)/,
  );
  assert.match(functionBody, /p_due_from > p_due_to/);
  assert.match(functionBody, /p_page not between 1 and 100000/);
  assert.match(functionBody, /p_page_size not between 1 and 25/);
  assert.match(functionBody, /limit p_page_size\s+offset page_offset/);
  assert.match(functionBody, /at time zone 'Asia\/Kolkata'/);

  const searchFilter =
    functionBody.match(
      /normalized_search is null([\s\S]*?)and \(\s*p_due_from is null/,
    )?.[1] ?? "";
  assert.match(searchFilter, /student_full_name/);
  assert.match(searchFilter, /student_college_email/);
  assert.match(searchFilter, /student_roll_number/);
  assert.doesNotMatch(
    searchFilter,
    /workload_next_action|details|note|request_number|personal_email|mobile/i,
  );

  assert.match(functionBody, /global_metrics as \(/);
  assert.match(
    functionBody,
    /metric_overdue_count[\s\S]*?metric_due_today_count[\s\S]*?metric_upcoming_count[\s\S]*?metric_completed_count[\s\S]*?metric_cancelled_count[\s\S]*?metric_total_pending_count/,
  );
});

test("operational ordering is deterministic before page rows are returned", () => {
  assert.match(functionBody, /lifecycle_rank asc/);
  assert.match(functionBody, /priority_rank/);
  assert.match(functionBody, /workload_due_date/);
  assert.match(functionBody, /workload_completed_at/);
  assert.match(functionBody, /workload_updated_at/);
  assert.match(functionBody, /workload_follow_up_id asc/);
  assert.ok(
    functionBody.indexOf("order by") < functionBody.indexOf("limit p_page_size"),
  );
});

test("privileges and errors are narrow and sanitized", () => {
  assert.match(
    migration,
    /alter function public\.list_counselor_follow_up_workload\([\s\S]*?\) owner to postgres;/,
  );
  assert.match(
    migration,
    /revoke all on function public\.list_counselor_follow_up_workload\([\s\S]*?\) from public, anon, authenticated;/,
  );
  assert.match(
    migration,
    /grant execute on function public\.list_counselor_follow_up_workload\([\s\S]*?\) to authenticated;/,
  );
  assert.doesNotMatch(
    executableMigration,
    /\bgrant\b[\s\S]*?\bon (?:table )?public\./i,
  );
  assert.match(functionBody, /when insufficient_privilege then/);
  assert.match(functionBody, /when invalid_parameter_value then\s+raise;/);
  assert.match(
    functionBody,
    /message = 'Follow-up workload is temporarily unavailable'/,
  );
});

test("readiness, types, and documentation cover the exact D2 RPC", () => {
  const readiness = readFileSync(
    new URL(
      "../../../supabase/verification/pre_phase_c2_readiness.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const databaseTypes = readFileSync(
    new URL("../../types/database.ts", import.meta.url),
    "utf8",
  );
  const documentation = readFileSync(
    new URL("../../../docs/database.md", import.meta.url),
    "utf8",
  );

  for (const source of [readiness, databaseTypes, documentation]) {
    assert.match(source, /list_counselor_follow_up_workload/);
  }
  assert.match(readiness, /function_return_column/);
  assert.match(readiness, /D2 workload RPC has trusted ownership/);
  assert.match(readiness, /D2 workload RPC returns global metrics/);
  assert.match(documentation, /metrics-only\s+row/);
  assert.match(documentation, /EXPLAIN \(ANALYZE, BUFFERS\)/);
});
