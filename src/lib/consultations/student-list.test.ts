import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { STUDENT_CONSULTATION_LIST_QUERY } = require(
  "./student-list.ts",
) as typeof import("./student-list");

test("uses the minimal own-student request list shape in newest-first order", () => {
  assert.deepEqual(STUDENT_CONSULTATION_LIST_QUERY, {
    table: "consultation_requests",
    columns:
      "id, student_name, course, department, consultation_date, slot_start, slot_end, submitted_at, status",
    ownerColumn: "student_id",
    orderColumn: "submitted_at",
    ascending: false,
  });

  assert.equal(
    STUDENT_CONSULTATION_LIST_QUERY.columns.includes("personal_email"),
    false,
  );
  assert.equal(
    STUDENT_CONSULTATION_LIST_QUERY.columns.includes("mobile_number"),
    false,
  );
  assert.equal(
    STUDENT_CONSULTATION_LIST_QUERY.columns.includes("assigned_counselor_id"),
    false,
  );
  assert.equal(
    STUDENT_CONSULTATION_LIST_QUERY.columns.includes("request_number"),
    false,
  );
});

test("booking receipt exposes a safe reference without broadening Student list reads", () => {
  const studentSources = [
    new URL("../../app/student/dashboard/page.tsx", import.meta.url),
    new URL("../../components/forms/consultation-form.tsx", import.meta.url),
    new URL("../../app/actions/consultation-actions.ts", import.meta.url),
    new URL("../../types/index.ts", import.meta.url),
  ].map((file) => readFileSync(file, "utf8"));

  assert.doesNotMatch(studentSources[0], /request_number/);
  for (const source of studentSources.slice(1)) {
    assert.match(source, /request_number/);
  }
  assert.ok(studentSources.every((source) => !/assigned_counselor_id/.test(source)));

  const dashboardSource = studentSources[0];
  assert.match(dashboardSource, /upcomingConsultations\.map/);
  assert.match(
    dashboardSource,
    /upcomingConsultations[\s\S]*?\.sort\([\s\S]*?consultation_date[\s\S]*?slot_start/,
  );
  assert.match(dashboardSource, /getStudentConsultationLifecycleLabel/);
  assert.match(dashboardSource, /schedule\.kind === "legacy"/);
  assert.doesNotMatch(dashboardSource, /KGEOC-\d/);
});

test("database types and request-number generation remain intact", () => {
  const databaseTypes = readFileSync(
    new URL("../../types/database.ts", import.meta.url),
    "utf8",
  );
  const bookingMigration = readFileSync(
    new URL(
      "../../../supabase/migrations/202607190001_single_counselor_slot_booking.sql",
      import.meta.url,
    ),
    "utf8",
  );

  assert.match(databaseTypes, /request_number: string;/);
  assert.match(bookingMigration, /new\.request_number := pg_catalog\.format\(/);
  assert.match(bookingMigration, /'KGEOC-%s-%s'/);
});
