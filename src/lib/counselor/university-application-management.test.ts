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
        url: new URL("./university-applications.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  parseCounselorUniversityApplicationHistory,
  parseCounselorUniversityApplicationList,
  parseOwnedUniversityApplication,
} = require("./university-application-management.ts") as typeof import(
  "./university-application-management"
);

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_STUDENT_ID = "22222222-2222-4222-8222-222222222222";
const APPLICATION_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_APPLICATION_ID = "44444444-4444-4444-8444-444444444444";
const TIMESTAMP = "2026-07-28T10:00:00+05:30";

function application(overrides: Record<string, unknown> = {}) {
  return {
    id: APPLICATION_ID,
    student_id: STUDENT_ID,
    country_code: "AU",
    university_name: "University of Melbourne",
    programme_name: "Master of Data Science",
    degree_level: "masters",
    intake_term: "fall",
    intake_year: 2027,
    current_status: "planning",
    application_reference: null,
    portal_url: null,
    submission_deadline: null,
    submitted_at: null,
    is_primary: false,
    is_archived: false,
    archived_at: null,
    version_number: 1,
    created_at: TIMESTAMP,
    updated_at: TIMESTAMP,
    last_changed_at: TIMESTAMP,
    ...overrides,
  };
}

function event(overrides: Record<string, unknown> = {}) {
  return {
    application_id: APPLICATION_ID,
    event_type: "created",
    version_number: 1,
    country_code: "AU",
    university_name: "University of Melbourne",
    programme_name: "Master of Data Science",
    degree_level: "masters",
    intake_term: "fall",
    intake_year: 2027,
    application_status: "planning",
    application_reference: null,
    portal_url: null,
    submission_deadline: null,
    submitted_at: null,
    is_primary: false,
    is_archived: false,
    change_reason: null,
    changed_at: TIMESTAMP,
    ...overrides,
  };
}

test("parses empty and one-row application lists into safe presentation data", () => {
  const empty = parseCounselorUniversityApplicationList([], STUDENT_ID);
  assert.deepEqual(empty, {
    kind: "ready",
    applications: [],
    totalCount: 0,
    activeCount: 0,
    archivedCount: 0,
    primaryApplicationName: null,
  });

  const one = parseCounselorUniversityApplicationList(
    [application()],
    STUDENT_ID,
  );
  assert.equal(one.kind, "ready");
  if (one.kind !== "ready") return;
  assert.equal(one.applications.length, 1);
  assert.equal(one.applications[0]?.universityName, "University of Melbourne");
  assert.equal(one.applications[0]?.degreeLevelLabel, "Master’s");
  assert.equal("studentId" in one.applications[0], false);
  assert.equal("createdBy" in one.applications[0], false);
  assert.equal("archivedReason" in one.applications[0], false);
});

test("requires active-first, active-primary-first, updated-desc, id-desc ordering", () => {
  const latest = "2026-07-28T11:00:00+05:30";
  const primary = application({
    id: OTHER_APPLICATION_ID,
    is_primary: true,
  });
  const active = application({
    id: "55555555-5555-4555-8555-555555555555",
    updated_at: latest,
    last_changed_at: latest,
  });
  const archived = application({
    id: "66666666-6666-4666-8666-666666666666",
    is_archived: true,
    archived_at: latest,
    updated_at: latest,
    last_changed_at: latest,
  });

  assert.equal(
    parseCounselorUniversityApplicationList(
      [primary, active, archived],
      STUDENT_ID,
    ).kind,
    "ready",
  );
  assert.equal(
    parseCounselorUniversityApplicationList(
      [active, primary, archived],
      STUDENT_ID,
    ).kind,
    "unavailable",
  );
});

test("preserves PostgreSQL microsecond precision when validating list ordering", () => {
  const newer = application({
    updated_at: "2026-07-28T10:00:00.000002+05:30",
    last_changed_at: "2026-07-28T10:00:00.000002+05:30",
  });
  const older = application({
    id: OTHER_APPLICATION_ID,
    updated_at: "2026-07-28T10:00:00.000001+05:30",
    last_changed_at: "2026-07-28T10:00:00.000001+05:30",
  });

  assert.equal(
    parseCounselorUniversityApplicationList(
      [newer, older],
      STUDENT_ID,
    ).kind,
    "ready",
  );
});

test("fails closed for excessive, duplicate, cross-student and malformed projections", () => {
  const excessive = Array.from({ length: 101 }, (_, index) =>
    application({
      id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    }),
  );
  assert.equal(
    parseCounselorUniversityApplicationList(excessive, STUDENT_ID).kind,
    "unavailable",
  );
  assert.equal(
    parseCounselorUniversityApplicationList(
      [application(), application()],
      STUDENT_ID,
    ).kind,
    "unavailable",
  );
  assert.equal(
    parseCounselorUniversityApplicationList(
      [application({ student_id: OTHER_STUDENT_ID })],
      STUDENT_ID,
    ).kind,
    "unavailable",
  );

  for (const invalid of [
    application({ country_code: "Australia" }),
    application({ current_status: "offer_received" }),
    application({ portal_url: "http://apply.example.edu" }),
    application({ submission_deadline: "2026-02-31" }),
    application({ current_status: "submitted", submitted_at: null }),
    application({ is_archived: true, archived_at: null }),
    application({ is_primary: true, current_status: "closed" }),
    application({ updated_at: "invalid" }),
    application({
      updated_at: "2026-02-30T10:00:00+05:30",
      last_changed_at: "2026-02-30T10:00:00+05:30",
    }),
  ]) {
    assert.equal(
      parseCounselorUniversityApplicationList([invalid], STUDENT_ID).kind,
      "unavailable",
    );
  }
});

test("rejects multiple primary applications and validates trusted ownership", () => {
  const secondPrimary = application({
    id: OTHER_APPLICATION_ID,
    is_primary: true,
  });
  assert.equal(
    parseCounselorUniversityApplicationList(
      [application({ is_primary: true }), secondPrimary],
      STUDENT_ID,
    ).kind,
    "unavailable",
  );
  assert.ok(
    parseOwnedUniversityApplication(
      application(),
      STUDENT_ID,
      APPLICATION_ID,
    ),
  );
  assert.equal(
    parseOwnedUniversityApplication(
      application(),
      OTHER_STUDENT_ID,
      APPLICATION_ID,
    ),
    null,
  );
});

test("validates a bounded descending event page and hides actor identifiers", () => {
  const rows = Array.from({ length: 26 }, (_, index) => {
    const version = 26 - index;
    return event({
      event_type: version === 1 ? "created" : "details_updated",
      version_number: version,
      change_reason: version === 1 ? null : `Update ${version}`,
    });
  });
  const result = parseCounselorUniversityApplicationHistory(
    rows,
    APPLICATION_ID,
    1,
    26,
  );
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.events.length, 25);
  assert.equal(result.hasNextPage, true);
  assert.equal(result.events[0]?.versionNumber, 26);
  assert.equal("changedBy" in result.events[0], false);
});

test("history fails closed for empty, malformed, duplicate, unordered and cross-application rows", () => {
  assert.equal(
    parseCounselorUniversityApplicationHistory(
      [],
      APPLICATION_ID,
      1,
      1,
    ).kind,
    "unavailable",
  );
  for (const rows of [
    [event({ application_id: OTHER_APPLICATION_ID })],
    [event(), event()],
    [
      event({
        event_type: "details_updated",
        version_number: 2,
        change_reason: "Updated",
      }),
      event(),
    ],
    [event({ event_type: "created", version_number: 2 })],
    [event({ portal_url: "https://bad..example.edu" })],
    [event({ changed_at: "2026-02-30T10:00:00+05:30" })],
  ]) {
    assert.equal(
      parseCounselorUniversityApplicationHistory(
        rows,
        APPLICATION_ID,
        1,
        1,
      ).kind,
      "unavailable",
    );
  }
  assert.equal(
    parseCounselorUniversityApplicationHistory(
      [
        event({
          event_type: "details_updated",
          version_number: 2,
          change_reason: "Created event is missing",
        }),
      ],
      APPLICATION_ID,
      1,
      2,
    ).kind,
    "unavailable",
  );
});
