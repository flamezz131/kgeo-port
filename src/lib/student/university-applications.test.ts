import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown,
) => unknown;
const { registerHooks } = require("node:module") as {
  registerHooks: (hooks: { resolve: ResolveHook }) => void;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/lib/counselor/university-applications") {
      return {
        shortCircuit: true,
        url: new URL(
          "../counselor/university-applications.ts",
          import.meta.url,
        ).href,
      };
    }
    if (
      specifier ===
      "@/lib/counselor/university-application-management"
    ) {
      return {
        shortCircuit: true,
        url: new URL(
          "../counselor/university-application-management.ts",
          import.meta.url,
        ).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  STUDENT_UNIVERSITY_APPLICATION_ERROR,
  fetchMyUniversityApplications,
  formatStudentApplicationDate,
  formatStudentApplicationTimestamp,
  parseStudentUniversityApplications,
} = require("./university-applications.ts") as typeof import(
  "./university-applications"
);

const APPLICATION_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_APPLICATION_ID =
  "22222222-2222-4222-8222-222222222222";
const TIMESTAMP = "2026-07-28T10:00:00.000001+05:30";

function application(overrides: Record<string, unknown> = {}) {
  return {
    application_id: APPLICATION_ID,
    university_name: "University of Melbourne",
    programme_name: "Master of Data Science",
    country_code: "AU",
    degree_level: "masters",
    intake_term: "fall",
    intake_year: 2027,
    current_status: "planning",
    submission_deadline: null,
    submitted_at: null,
    is_primary: false,
    last_changed_at: TIMESTAMP,
    ...overrides,
  };
}

test("accepts zero, one and multiple safe relational rows", () => {
  assert.deepEqual(parseStudentUniversityApplications([]), {
    kind: "ready",
    applications: [],
  });

  const one = parseStudentUniversityApplications([application()]);
  assert.equal(one.kind, "ready");
  if (one.kind !== "ready") return;
  assert.equal(one.applications.length, 1);
  assert.deepEqual(Object.keys(one.applications[0] ?? {}).sort(), [
    "applicationId",
    "countryCode",
    "currentStatusDescription",
    "currentStatusLabel",
    "degreeLevelLabel",
    "intakeTermLabel",
    "intakeYear",
    "isPrimary",
    "lastChangedAt",
    "programmeName",
    "submissionDeadline",
    "submittedAt",
    "universityName",
  ]);
  assert.equal(one.applications[0]?.degreeLevelLabel, "Master\u2019s");
  assert.equal(one.applications[0]?.intakeTermLabel, "Fall");
  assert.equal(one.applications[0]?.currentStatusLabel, "Planning");

  const multiple = parseStudentUniversityApplications([
    application({ is_primary: true }),
    application({ application_id: OTHER_APPLICATION_ID }),
  ]);
  assert.equal(multiple.kind, "ready");
});

test("accepts exactly 100 rows and rejects more than 100 rows", () => {
  const rows = Array.from({ length: 100 }, (_, index) =>
    application({
      application_id: `00000000-0000-4000-8000-${String(
        100 - index,
      ).padStart(12, "0")}`,
    }),
  );
  assert.equal(parseStudentUniversityApplications(rows).kind, "ready");
  assert.equal(
    parseStudentUniversityApplications([
      ...rows,
      application({
        application_id: "ffffffff-ffff-4fff-bfff-ffffffffffff",
        is_primary: true,
      }),
    ]).kind,
    "unavailable",
  );
});

test("rejects duplicate IDs and multiple primary applications", () => {
  assert.equal(
    parseStudentUniversityApplications([
      application(),
      application(),
    ]).kind,
    "unavailable",
  );
  assert.equal(
    parseStudentUniversityApplications([
      application({ is_primary: true }),
      application({
        application_id: OTHER_APPLICATION_ID,
        is_primary: true,
      }),
    ]).kind,
    "unavailable",
  );
});

test("rejects malformed identifiers, names, country, enums and year", () => {
  for (const invalid of [
    application({ application_id: "not-a-uuid" }),
    application({
      application_id: "33333333-3333-4333-8333-33333333333A",
    }),
    application({ university_name: "A" }),
    application({ university_name: `U${"n".repeat(200)}` }),
    application({ university_name: " University of Melbourne" }),
    application({ university_name: "University  of Melbourne" }),
    application({ programme_name: "A" }),
    application({ programme_name: "Master\nData Science" }),
    application({ country_code: "au" }),
    application({ country_code: "AUS" }),
    application({ degree_level: "mba" }),
    application({ intake_term: "autumn" }),
    application({ intake_year: 2019 }),
    application({ intake_year: 2101 }),
    application({ intake_year: 2027.5 }),
    application({ current_status: "offer_received" }),
  ]) {
    assert.equal(
      parseStudentUniversityApplications([invalid]).kind,
      "unavailable",
    );
  }
});

test("rejects invalid dates and impossible or malformed timestamps", () => {
  for (const invalid of [
    application({ submission_deadline: "2027/03/31" }),
    application({ submission_deadline: "2027-02-29" }),
    application({ last_changed_at: "not-a-timestamp" }),
    application({
      last_changed_at: "2026-02-30T10:00:00+05:30",
    }),
    application({
      last_changed_at: "2026-07-28T10:00:00.0000001+05:30",
    }),
    application({
      current_status: "submitted",
      submitted_at: "not-a-timestamp",
    }),
    application({
      current_status: "submitted",
      submitted_at: "2026-02-30T10:00:00+05:30",
    }),
    application({
      last_changed_at: "2026-07-28T10:00:00+14:01",
    }),
  ]) {
    assert.equal(
      parseStudentUniversityApplications([invalid]).kind,
      "unavailable",
    );
  }
});

test("enforces submitted timestamp semantics without rejecting pre-submission terminal rows", () => {
  for (const status of [
    "submitted",
    "under_university_review",
    "additional_information_requested",
    "decision_received",
  ]) {
    assert.equal(
      parseStudentUniversityApplications([
        application({ current_status: status, submitted_at: null }),
      ]).kind,
      "unavailable",
    );
    assert.equal(
      parseStudentUniversityApplications([
        application({ current_status: status, submitted_at: TIMESTAMP }),
      ]).kind,
      "ready",
    );
  }

  for (const status of ["withdrawn", "closed"]) {
    assert.equal(
      parseStudentUniversityApplications([
        application({ current_status: status, submitted_at: null }),
      ]).kind,
      "ready",
    );
    assert.equal(
      parseStudentUniversityApplications([
        application({
          current_status: status,
          submitted_at: TIMESTAMP,
        }),
      ]).kind,
      "ready",
    );
    assert.equal(
      parseStudentUniversityApplications([
        application({ current_status: status, is_primary: true }),
      ]).kind,
      "unavailable",
    );
  }

  assert.equal(
    parseStudentUniversityApplications([
      application({ current_status: "planning", submitted_at: TIMESTAMP }),
    ]).kind,
    "unavailable",
  );
});

test("validates primary-first, microsecond-descending and UUID-descending order", () => {
  const newer = application({
    application_id: APPLICATION_ID,
    last_changed_at: "2026-07-28T10:00:00.000002+05:30",
  });
  const older = application({
    application_id: OTHER_APPLICATION_ID,
    last_changed_at: "2026-07-28T10:00:00.000001+05:30",
  });

  assert.equal(
    parseStudentUniversityApplications([
      application({
        application_id: "44444444-4444-4444-8444-444444444444",
        is_primary: true,
      }),
      newer,
      older,
    ]).kind,
    "ready",
  );
  assert.equal(
    parseStudentUniversityApplications([
      newer,
      application({
        application_id: OTHER_APPLICATION_ID,
        is_primary: true,
      }),
    ]).kind,
    "unavailable",
  );
  assert.equal(
    parseStudentUniversityApplications([older, newer]).kind,
    "unavailable",
  );
  assert.equal(
    parseStudentUniversityApplications([
      application({ application_id: APPLICATION_ID }),
      application({ application_id: OTHER_APPLICATION_ID }),
    ]).kind,
    "ready",
  );
  assert.equal(
    parseStudentUniversityApplications([
      application({ application_id: OTHER_APPLICATION_ID }),
      application({ application_id: APPLICATION_ID }),
    ]).kind,
    "unavailable",
  );

  const sameInstantWithOffsets = [
    application({
      application_id: APPLICATION_ID,
      last_changed_at: "2026-07-28T10:00:00.000001+05:30",
    }),
    application({
      application_id: OTHER_APPLICATION_ID,
      last_changed_at: "2026-07-28T04:30:00.000001Z",
    }),
  ];
  assert.equal(
    parseStudentUniversityApplications(sameInstantWithOffsets).kind,
    "ready",
  );
  assert.equal(
    parseStudentUniversityApplications(
      [...sameInstantWithOffsets].reverse(),
    ).kind,
    "unavailable",
  );
});

test("strict row parsing excludes private fields from the presentation boundary", () => {
  for (const privateField of [
    "student_id",
    "application_reference",
    "portal_url",
    "is_archived",
    "archive_reason",
    "archived_by",
    "created_by",
    "last_changed_by",
    "version_number",
    "event_history",
    "email",
  ]) {
    assert.equal(
      parseStudentUniversityApplications([
        application({ [privateField]: "private" }),
      ]).kind,
      "unavailable",
    );
  }
});

test("RPC execution is called once and every failure is translated generically", async () => {
  let calls = 0;
  const ready = await fetchMyUniversityApplications(async () => {
    calls += 1;
    return { data: [application()], error: null };
  });
  assert.equal(calls, 1);
  assert.equal(ready.kind, "ready");

  const databaseFailure = await fetchMyUniversityApplications(async () => ({
    data: null,
    error: {
      message: "private database detail",
      code: "P0001",
    },
  }));
  assert.deepEqual(databaseFailure, { kind: "unavailable" });

  const thrownFailure = await fetchMyUniversityApplications(async () => {
    throw new Error("private exception");
  });
  assert.deepEqual(thrownFailure, { kind: "unavailable" });
  assert.equal(
    STUDENT_UNIVERSITY_APPLICATION_ERROR,
    "University applications are temporarily unavailable.",
  );
});

test("date presentation uses readable labels without raw offsets or milliseconds", () => {
  assert.equal(
    formatStudentApplicationDate("2027-03-31"),
    "31 March 2027",
  );
  assert.equal(formatStudentApplicationDate(null), "Not added");
  const timestamp = formatStudentApplicationTimestamp(
    "2026-07-28T23:45:00.123456+00:00",
  );
  assert.match(timestamp, /29 July 2026/);
  assert.doesNotMatch(timestamp, /T|Z|\+00|123456/);
});
