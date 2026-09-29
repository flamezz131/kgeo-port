import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  MAX_COUNSELOR_REFERENCE_IDS,
  loadCounselorConsultationReferences,
  mergeCounselorConsultationReferences,
} = require(
  "./counselor-references.ts",
) as typeof import("./counselor-references");

const FIRST_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_ID = "22222222-2222-4222-8222-222222222222";

test("loads one bounded counselor reference batch and merges it server-side", async () => {
  let callCount = 0;
  let receivedIds: string[] = [];
  const references = await loadCounselorConsultationReferences(
    [FIRST_ID, SECOND_ID, FIRST_ID],
    async (consultationIds) => {
      callCount += 1;
      receivedIds = consultationIds;
      return {
        data: [
          {
            consultation_id: FIRST_ID,
            request_number: "KGEOC-2026-000001",
          },
          {
            consultation_id: SECOND_ID,
            request_number: "KGEOC-2026-000002",
          },
        ],
        error: null,
      };
    },
  );

  assert.equal(callCount, 1);
  assert.deepEqual(receivedIds, [FIRST_ID, SECOND_ID]);
  assert.ok(references);
  assert.deepEqual(
    mergeCounselorConsultationReferences(
      [{ id: FIRST_ID, status: "scheduled" }],
      references,
    ),
    [
      {
        id: FIRST_ID,
        status: "scheduled",
        request_number: "KGEOC-2026-000001",
      },
    ],
  );
});

test("does not call the RPC when the counselor page has no consultations", async () => {
  let callCount = 0;
  const references = await loadCounselorConsultationReferences(
    [],
    async () => {
      callCount += 1;
      return { data: [], error: null };
    },
  );

  assert.equal(callCount, 0);
  assert.ok(references);
  assert.equal(references.size, 0);
});

test("malformed, missing, duplicate, and unrelated RPC rows fail closed", async () => {
  const cases: unknown[] = [
    [],
    [
      {
        consultation_id: FIRST_ID,
        request_number: "KGEOC-2026-000001",
      },
    ],
    [
      {
        consultation_id: FIRST_ID,
        request_number: "KGEOC-2026-000001",
      },
      {
        consultation_id: FIRST_ID,
        request_number: "KGEOC-2026-000001",
      },
    ],
    [
      {
        consultation_id: FIRST_ID,
        request_number: "not-a-reference",
      },
      {
        consultation_id: SECOND_ID,
        request_number: "KGEOC-2026-000002",
      },
    ],
    [
      {
        consultation_id: FIRST_ID,
        request_number: "KGEOC-2026-000001",
      },
      {
        consultation_id: "33333333-3333-4333-8333-333333333333",
        request_number: "KGEOC-2026-000003",
      },
    ],
  ];

  for (const data of cases) {
    const result = await loadCounselorConsultationReferences(
      [FIRST_ID, SECOND_ID],
      async () => ({ data, error: null }),
    );
    assert.equal(result, null);
  }
});

test("invalid or excessive input and RPC failures return no references", async () => {
  let callCount = 0;
  const invalid = await loadCounselorConsultationReferences(
    ["not-a-uuid"],
    async () => {
      callCount += 1;
      return { data: [], error: null };
    },
  );
  const excessive = await loadCounselorConsultationReferences(
    Array.from({ length: MAX_COUNSELOR_REFERENCE_IDS + 1 }, () => FIRST_ID),
    async () => {
      callCount += 1;
      return { data: [], error: null };
    },
  );
  const databaseFailure = await loadCounselorConsultationReferences(
    [FIRST_ID],
    async () => ({ data: null, error: new Error("private database detail") }),
  );
  const thrownFailure = await loadCounselorConsultationReferences(
    [FIRST_ID],
    async () => {
      throw new Error("private transport detail");
    },
  );

  assert.equal(invalid, null);
  assert.equal(excessive, null);
  assert.equal(databaseFailure, null);
  assert.equal(thrownFailure, null);
  assert.equal(callCount, 0);
});

test("migration A authorizes only active verified counselors", () => {
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/202607230003_counselor_consultation_reference_rpc.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /security definer/);
  assert.match(migration, /set search_path = ''/);
  assert.match(migration, /caller_id := \(select auth\.uid\(\)\)/);
  assert.match(migration, /profile\.role = 'counselor'::public\.user_role/);
  assert.match(migration, /profile\.is_active is true/);
  assert.match(migration, /auth_user\.email_confirmed_at is not null/);
  assert.doesNotMatch(migration, /p_(?:role|staff|counselor)/);
  assert.doesNotMatch(migration, /execute\s+format|dynamic sql/i);
  assert.match(
    migration,
    /owner to postgres/,
  );
  assert.match(
    migration,
    /revoke all on function[\s\S]*from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function[\s\S]*to authenticated/,
  );
  assert.doesNotMatch(migration, /revoke select on table/);
  assert.doesNotMatch(migration, /grant select\s*\(/);
});

test("migration A validates its bounded UUID array and returns only references", () => {
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/202607230003_counselor_consultation_reference_rpc.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(migration, /requested_count < 1/);
  assert.match(migration, /requested_count > 100/);
  assert.match(migration, /array_position\(p_consultation_ids, null\)/);
  assert.match(migration, /distinct_count <> requested_count/);
  assert.match(
    migration,
    /returns table \(\s*consultation_id uuid,\s*request_number text\s*\)/,
  );
  assert.match(migration, /where request\.id = any \(p_consultation_ids\)/);
  assert.doesNotMatch(
    migration.match(/return query[\s\S]*?end;/)?.[0] ?? "",
    /student_name|college_email|mobile_number|role/,
  );
});

test("migration B removes the base request-number grant and retains safe columns", () => {
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/202607230004_consultation_reference_column_hardening.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const safeGrant = migration.match(
    /grant select \(([\s\S]*?)\) on table public\.consultation_requests\s+to authenticated;/,
  )?.[1];

  assert.ok(safeGrant);
  for (const column of [
    "id",
    "student_id",
    "student_name",
    "roll_number",
    "college_email",
    "personal_email",
    "college_end_year",
    "department",
    "course",
    "mobile_number",
    "higher_studies_interest",
    "status",
    "consultation_date",
    "slot_start",
    "slot_end",
    "submitted_at",
    "created_at",
    "updated_at",
  ]) {
    assert.match(safeGrant, new RegExp(`\\b${column}\\b`));
  }

  assert.match(
    migration,
    /revoke select on table public\.consultation_requests\s+from authenticated;/,
  );
  assert.match(migration, /revoke select \(request_number\)/);
  assert.doesNotMatch(safeGrant, /request_number/);
  assert.doesNotMatch(
    safeGrant,
    /assigned_counselor_id|assigned_at|outcome_recorded_by|outcome_recorded_at/,
  );
  assert.doesNotMatch(migration, /grant (?:update|delete)/);
});

test("handwritten database types expose the exact counselor reference RPC", () => {
  const databaseTypes = readFileSync(
    new URL("../../types/database.ts", import.meta.url),
    "utf8",
  );
  const rpcType =
    databaseTypes.match(
      /get_counselor_consultation_references:\s*\{[\s\S]*?\n\s{6}\};/,
    )?.[0] ?? "";

  assert.match(
    rpcType,
    /Args:\s*\{\s*p_consultation_ids: string\[\]\s*\}/,
  );
  assert.match(
    rpcType,
    /Returns: Array<\{\s*consultation_id: string;\s*request_number: string;\s*\}>/,
  );
  assert.doesNotMatch(rpcType, /\bany\b|student_name|college_email|role/);
});

test("neither privacy migration rewrites consultation rows or generation", () => {
  const migrations = [
    "202607230003_counselor_consultation_reference_rpc.sql",
    "202607230004_consultation_reference_column_hardening.sql",
  ].map((name) =>
    readFileSync(
      new URL(`../../../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    ),
  );
  const bookingMigration = readFileSync(
    new URL(
      "../../../supabase/migrations/202607190001_single_counselor_slot_booking.sql",
      import.meta.url,
    ),
    "utf8",
  );

  for (const migration of migrations) {
    assert.match(migration, /^begin;/m);
    assert.match(migration, /^commit;/m);
    assert.doesNotMatch(
      migration,
      /^(?:insert into|update|delete from|truncate)\s+public\.consultation_requests/im,
    );
    assert.doesNotMatch(migration, /alter table[\s\S]*drop column/i);
  }

  assert.match(bookingMigration, /new\.request_number := pg_catalog\.format\(/);
  assert.match(bookingMigration, /'KGEOC-%s-%s'/);
});
