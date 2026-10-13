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
    if (specifier === "@/lib/consultations/booking") {
      return {
        shortCircuit: true,
        url: new URL("../consultations/booking.ts", import.meta.url).href,
      };
    }
    if (specifier === "@/lib/validation/institutional-email") {
      return {
        shortCircuit: true,
        url: new URL("../validation/institutional-email.ts", import.meta.url)
          .href,
      };
    }
    if (specifier === "@/lib/auth/student-institutions") {
      return {
        shortCircuit: true,
        url: new URL("../auth/student-institutions.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  UNIVERSITY_APPLICATION_WORKSPACE_ARCHIVE_FILTERS,
  UNIVERSITY_APPLICATION_WORKSPACE_DEADLINE_FILTERS,
  UNIVERSITY_APPLICATION_WORKSPACE_DEGREE_LEVELS,
  UNIVERSITY_APPLICATION_WORKSPACE_INTAKE_TERMS,
  UNIVERSITY_APPLICATION_WORKSPACE_PRIMARY_FILTERS,
  UNIVERSITY_APPLICATION_WORKSPACE_SORTS,
  UNIVERSITY_APPLICATION_WORKSPACE_STATUSES,
  buildUniversityApplicationWorkspaceUrl,
  buildUniversityApplicationWorkspaceRpcArgs,
  getUniversityApplicationDeadlinePresentation,
  executeUniversityApplicationWorkspaceRead,
  getUniversityApplicationWorkspaceEmptyKind,
  getUniversityApplicationWorkspacePagination,
  parseUniversityApplicationWorkspaceListResponse,
  parseUniversityApplicationWorkspaceMetricsResponse,
  parseUniversityApplicationWorkspaceQuery,
  parseUniversityApplicationWorkspaceSearchParams,
} = require("./university-application-workspace.ts") as typeof import(
  "./university-application-workspace"
);
const { isCounselorNavigationItemActive } = require("./navigation.ts") as typeof import(
  "./navigation"
);

const applicationId1 = "11111111-1111-4111-8111-111111111111";
const applicationId2 = "22222222-2222-4222-8222-222222222222";
const applicationId3 = "33333333-3333-4333-8333-333333333333";
const studentId = "33333333-3333-4333-8333-333333333333";

function row(overrides: Record<string, unknown> = {}) {
  return {
    application_id: applicationId1,
    student_id: studentId,
    student_full_name: "Student Name",
    college_email: "student@kct.ac.in",
    roll_number: "22ABC001",
    university_name: "Example University",
    programme_name: "Master of Science",
    country_code: "US",
    degree_level: "masters",
    intake_term: "fall",
    intake_year: 2027,
    current_status: "planning",
    application_reference: "APP-001",
    submission_deadline: "2026-08-20",
    submitted_at: null,
    is_primary: true,
    is_archived: false,
    last_changed_at: "2026-08-02T10:00:00.123456+00:00",
    available_document_count: 2,
    total_count: 1,
    ...overrides,
  };
}

function metricsRow(overrides: Record<string, unknown> = {}) {
  return {
    total_active_applications: 10,
    total_archived_applications: 2,
    students_with_applications: 5,
    primary_applications: 4,
    planning_count: 1,
    documents_collecting_count: 1,
    application_preparing_count: 1,
    ready_to_submit_count: 1,
    submitted_count: 1,
    under_university_review_count: 1,
    additional_information_requested_count: 1,
    decision_received_count: 1,
    withdrawn_count: 1,
    closed_count: 1,
    overdue_deadline_count: 2,
    due_next_30_days_count: 3,
    ...overrides,
  };
}

test("query defaults are bounded and RPC arguments use exact names", () => {
  const query = parseUniversityApplicationWorkspaceQuery({});
  assert.ok(query);
  assert.deepEqual(query, {
    search: null,
    status: null,
    countryCode: null,
    degreeLevel: null,
    intakeTerm: null,
    intakeYear: null,
    primaryFilter: "all",
    archiveFilter: "active",
    deadlineFilter: "all",
    sort: "last_changed_desc",
    page: 1,
    pageSize: 20,
  });
  assert.deepEqual(buildUniversityApplicationWorkspaceRpcArgs(query), {
    p_search: null,
    p_status: null,
    p_country_code: null,
    p_degree_level: null,
    p_intake_term: null,
    p_intake_year: null,
    p_primary_filter: "all",
    p_archive_filter: "active",
    p_deadline_filter: "all",
    p_sort: "last_changed_desc",
    p_page: 1,
    p_page_size: 20,
  });
});

test("invalid URLs issue zero RPCs and valid URLs issue each RPC exactly once", async () => {
  let listCalls = 0;
  let metricsCalls = 0;
  let receivedArgs: unknown = null;
  const executeList = async (args: unknown) => {
    listCalls += 1;
    receivedArgs = args;
    return { data: [row()], error: null };
  };
  const executeMetrics = async () => {
    metricsCalls += 1;
    return { data: [metricsRow()], error: null };
  };

  assert.deepEqual(
    await executeUniversityApplicationWorkspaceRead(
      { role: "counselor" },
      executeList,
      executeMetrics,
    ),
    { kind: "invalid" },
  );
  assert.equal(listCalls, 0);
  assert.equal(metricsCalls, 0);

  const result = await executeUniversityApplicationWorkspaceRead(
    {},
    executeList,
    executeMetrics,
    new Date("2026-08-02T06:00:00Z"),
  );
  assert.equal(result.kind, "ready");
  assert.equal(listCalls, 1);
  assert.equal(metricsCalls, 1);
  assert.deepEqual(receivedArgs, {
    p_search: null,
    p_status: null,
    p_country_code: null,
    p_degree_level: null,
    p_intake_term: null,
    p_intake_year: null,
    p_primary_filter: "all",
    p_archive_filter: "active",
    p_deadline_filter: "all",
    p_sort: "last_changed_desc",
    p_page: 1,
    p_page_size: 20,
  });
});

test("list and metrics failures remain independent without retries", async () => {
  let listCalls = 0;
  let metricsCalls = 0;
  const listFailure = await executeUniversityApplicationWorkspaceRead(
    {},
    async () => {
      listCalls += 1;
      return { data: null, error: { category: "unavailable" } };
    },
    async () => {
      metricsCalls += 1;
      return { data: [metricsRow()], error: null };
    },
  );
  assert.equal(listFailure.kind, "ready");
  if (listFailure.kind === "ready") {
    assert.equal(listFailure.list, null);
    assert.ok(listFailure.metrics);
  }
  assert.equal(listCalls, 1);
  assert.equal(metricsCalls, 1);

  const metricsFailure = await executeUniversityApplicationWorkspaceRead(
    {},
    async () => ({ data: [row()], error: null }),
    async () => ({ data: null, error: { category: "unavailable" } }),
  );
  assert.equal(metricsFailure.kind, "ready");
  if (metricsFailure.kind === "ready") {
    assert.ok(metricsFailure.list);
    assert.equal(metricsFailure.metrics, null);
  }
});

test("URL query parsing rejects duplicates injections and noncanonical bounds", () => {
  assert.deepEqual(
    parseUniversityApplicationWorkspaceSearchParams({
      q: "  APP_%   NAME ",
      country: "us",
      page: "2",
      pageSize: "25",
    }),
    {
      search: "app_% name",
      status: null,
      countryCode: "US",
      degreeLevel: null,
      intakeTerm: null,
      intakeYear: null,
      primaryFilter: "all",
      archiveFilter: "active",
      deadlineFilter: "all",
      sort: "last_changed_desc",
      page: 2,
      pageSize: 25,
    },
  );
  assert.equal(parseUniversityApplicationWorkspaceSearchParams({ q: ["a", "b"] }), null);
  assert.equal(parseUniversityApplicationWorkspaceSearchParams({ role: "admin" }), null);
  assert.equal(parseUniversityApplicationWorkspaceSearchParams({ redirect: "https://example.com" }), null);
  assert.equal(parseUniversityApplicationWorkspaceSearchParams({ page: "01" }), null);
  assert.equal(parseUniversityApplicationWorkspaceSearchParams({ page: "100001" }), null);
  assert.equal(parseUniversityApplicationWorkspaceSearchParams({ pageSize: "24" }), null);
  assert.equal(parseUniversityApplicationWorkspaceSearchParams({ intakeYear: "2101" }), null);
});

test("workspace URLs stay route-local preserve filters and omit defaults", () => {
  const defaults = parseUniversityApplicationWorkspaceSearchParams({});
  assert.ok(defaults);
  assert.equal(buildUniversityApplicationWorkspaceUrl(defaults), "/counselor/applications");
  assert.equal(
    buildUniversityApplicationWorkspaceUrl(defaults, {
      search: "o'brien_100%\\",
      archiveFilter: "all",
      page: 3,
      pageSize: 25,
    }),
    "/counselor/applications?q=o%27brien_100%25%5C&archive=all&page=3&pageSize=25",
  );
  assert.doesNotMatch(
    buildUniversityApplicationWorkspaceUrl(defaults, { search: "https://example.com" }),
    /^https?:/,
  );
});

test("pagination is derived from the list count without another count query", () => {
  const query = parseUniversityApplicationWorkspaceQuery({ page: 2, pageSize: 20 });
  assert.ok(query);
  assert.deepEqual(getUniversityApplicationWorkspacePagination(query, 45), {
    currentPage: 2,
    pageCount: 3,
    previousUrl: "/counselor/applications",
    nextUrl: "/counselor/applications?page=3",
  });

  const maximumPage = parseUniversityApplicationWorkspaceQuery({
    page: 100_000,
    pageSize: 1,
  });
  assert.ok(maximumPage);
  assert.deepEqual(
    getUniversityApplicationWorkspacePagination(
      maximumPage,
      Number.MAX_SAFE_INTEGER,
    ),
    {
      currentPage: 100_000,
      pageCount: 100_000,
      previousUrl: "/counselor/applications?page=99999&pageSize=1",
      nextUrl: null,
    },
  );
});

test("empty-state precedence preserves search intent and distinguishes archive scopes", () => {
  const cases = [
    [{}, "active"],
    [{ archiveFilter: "all" }, "all"],
    [{ archiveFilter: "archived" }, "archived"],
    [{ archiveFilter: "archived", status: "submitted" }, "filters"],
    [{ archiveFilter: "archived", search: "student" }, "search"],
  ] as const;
  for (const [input, expected] of cases) {
    const query = parseUniversityApplicationWorkspaceQuery(input);
    assert.ok(query);
    assert.equal(getUniversityApplicationWorkspaceEmptyKind(query), expected);
  }
});

test("counselor navigation uses an exact route-segment boundary", () => {
  assert.equal(
    isCounselorNavigationItemActive(
      "/counselor/applications",
      "/counselor/applications",
    ),
    true,
  );
  assert.equal(
    isCounselorNavigationItemActive(
      "/counselor/applications/example",
      "/counselor/applications",
    ),
    true,
  );
  assert.equal(
    isCounselorNavigationItemActive(
      "/counselor/applications-archive",
      "/counselor/applications",
    ),
    false,
  );
});

test("deadline presentation uses Asia Kolkata business-date boundaries", () => {
  const now = new Date("2026-08-01T20:00:00.000Z");
  assert.equal(getUniversityApplicationDeadlinePresentation(null, now).kind, "none");
  assert.equal(getUniversityApplicationDeadlinePresentation("2026-08-01", now).kind, "overdue");
  assert.equal(getUniversityApplicationDeadlinePresentation("2026-08-02", now).kind, "due_today");
  assert.equal(getUniversityApplicationDeadlinePresentation("2026-09-01", now).kind, "due_soon");
  assert.equal(getUniversityApplicationDeadlinePresentation("2026-09-02", now).kind, "upcoming");
});

test("search normalization preserves literal input and rejects unsafe Unicode", () => {
  assert.equal(
    parseUniversityApplicationWorkspaceQuery({ search: "  APP_%   NAME " })
      ?.search,
    "app_% name",
  );
  for (const search of ["%", "_", "\\", "O'Brien", "MiXeD CaSe"]) {
    assert.equal(
      parseUniversityApplicationWorkspaceQuery({ search })?.search,
      search.toLowerCase(),
    );
  }
  assert.equal(
    parseUniversityApplicationWorkspaceQuery({ search: "alpha     beta" })
      ?.search,
    "alpha beta",
  );
  assert.equal(parseUniversityApplicationWorkspaceQuery({ search: "   " })?.search, null);
  assert.ok(
    parseUniversityApplicationWorkspaceQuery({ search: "😀".repeat(100) }),
  );
  assert.equal(
    parseUniversityApplicationWorkspaceQuery({ search: "😀".repeat(101) }),
    null,
  );
  for (const unsafe of ["\u0000", "\u0085", "\u00a0", "\u200b", "\u202e", "\u2066", "\ufeff"]) {
    assert.equal(
      parseUniversityApplicationWorkspaceQuery({ search: `unsafe${unsafe}text` }),
      null,
    );
  }
  assert.equal(
    parseUniversityApplicationWorkspaceQuery({ search: "safe", role: "admin" }),
    null,
  );
});

test("every filter and sort allowlist value parses while unknown values fail", () => {
  for (const status of UNIVERSITY_APPLICATION_WORKSPACE_STATUSES) {
    assert.equal(parseUniversityApplicationWorkspaceQuery({ status })?.status, status);
  }
  for (const degreeLevel of UNIVERSITY_APPLICATION_WORKSPACE_DEGREE_LEVELS) {
    assert.equal(
      parseUniversityApplicationWorkspaceQuery({ degreeLevel })?.degreeLevel,
      degreeLevel,
    );
  }
  for (const intakeTerm of UNIVERSITY_APPLICATION_WORKSPACE_INTAKE_TERMS) {
    assert.equal(
      parseUniversityApplicationWorkspaceQuery({ intakeTerm })?.intakeTerm,
      intakeTerm,
    );
  }
  for (const primaryFilter of UNIVERSITY_APPLICATION_WORKSPACE_PRIMARY_FILTERS) {
    assert.equal(
      parseUniversityApplicationWorkspaceQuery({ primaryFilter })?.primaryFilter,
      primaryFilter,
    );
  }
  for (const archiveFilter of UNIVERSITY_APPLICATION_WORKSPACE_ARCHIVE_FILTERS) {
    assert.equal(
      parseUniversityApplicationWorkspaceQuery({ archiveFilter })?.archiveFilter,
      archiveFilter,
    );
  }
  for (const deadlineFilter of UNIVERSITY_APPLICATION_WORKSPACE_DEADLINE_FILTERS) {
    assert.equal(
      parseUniversityApplicationWorkspaceQuery({ deadlineFilter })?.deadlineFilter,
      deadlineFilter,
    );
  }
  for (const sort of UNIVERSITY_APPLICATION_WORKSPACE_SORTS) {
    assert.equal(parseUniversityApplicationWorkspaceQuery({ sort })?.sort, sort);
  }
  for (const input of [
    { status: "unknown" },
    { countryCode: "USA" },
    { degreeLevel: "mba" },
    { intakeTerm: "autumn" },
    { intakeYear: 2101 },
    { primaryFilter: "yes" },
    { archiveFilter: "hidden" },
    { deadlineFilter: "today" },
    { sort: "drop_table" },
  ]) {
    assert.equal(parseUniversityApplicationWorkspaceQuery(input), null);
  }
  assert.equal(
    parseUniversityApplicationWorkspaceQuery({ countryCode: " in " })
      ?.countryCode,
    "IN",
  );
});

test("page and page-size boundaries are exact", () => {
  assert.ok(parseUniversityApplicationWorkspaceQuery({ page: 1, pageSize: 1 }));
  assert.ok(
    parseUniversityApplicationWorkspaceQuery({ page: 100_000, pageSize: 25 }),
  );
  for (const input of [
    { page: 0 },
    { page: 100_001 },
    { page: 1.5 },
    { pageSize: 0 },
    { pageSize: 26 },
  ]) {
    assert.equal(parseUniversityApplicationWorkspaceQuery(input), null);
  }
});

test("list parsing accepts exact rows and preserves microsecond ordering", () => {
  const query = parseUniversityApplicationWorkspaceQuery({
    archiveFilter: "all",
    pageSize: 2,
  });
  assert.ok(query);
  const result = parseUniversityApplicationWorkspaceListResponse(
    [
      row({ total_count: 2 }),
      row({
        application_id: applicationId2,
        is_primary: false,
        last_changed_at: "2026-08-02T10:00:00.123455+00:00",
        total_count: 2,
      }),
    ],
    query,
    new Date("2026-08-02T06:00:00Z"),
  );
  assert.ok(result);
  assert.equal(result.entries.length, 2);
  assert.equal(result.entries[0].applicationId, applicationId1);
  assert.equal(result.totalCount, 2);
});

test("list parsing accepts KCT, KCLAS and KCTBS Student emails and rejects other domains", () => {
  const query = parseUniversityApplicationWorkspaceQuery({
    archiveFilter: "all",
    pageSize: 2,
  });
  assert.ok(query);
  const now = new Date("2026-08-02T06:00:00Z");

  for (const collegeEmail of [
    "student@kct.ac.in",
    "student@kclas.ac.in",
    "student@kctbs.ac.in",
  ]) {
    const result = parseUniversityApplicationWorkspaceListResponse(
      [row({ college_email: collegeEmail, total_count: 1 })],
      query,
      now,
    );
    assert.ok(result, collegeEmail);
    assert.equal(result.entries.length, 1, collegeEmail);
  }

  for (const collegeEmail of [
    "student@student.kct.ac.in",
    "student@sub.kclas.ac.in",
    "student@kct.ac.in.fake.com",
    "student@kctbs-ac.in",
    "student@gmail.com",
    "Student@KCLAS.ac.in",
    "student@@kct.ac.in",
  ]) {
    assert.equal(
      parseUniversityApplicationWorkspaceListResponse(
        [row({ college_email: collegeEmail, total_count: 1 })],
        query,
        now,
      ),
      null,
      collegeEmail,
    );
  }
});

test("list parsing validates empty and beyond-last-page sentinels", () => {
  const firstPage = parseUniversityApplicationWorkspaceQuery({});
  const laterPage = parseUniversityApplicationWorkspaceQuery({ page: 3 });
  assert.ok(firstPage && laterPage);
  const sentinel = row(
    Object.fromEntries(
      Object.keys(row()).map((key) => [key, key === "total_count" ? 0 : null]),
    ),
  );
  assert.deepEqual(
    parseUniversityApplicationWorkspaceListResponse([sentinel], firstPage),
    { entries: [], totalCount: 0, pageBeyondRange: false },
  );
  assert.deepEqual(
    parseUniversityApplicationWorkspaceListResponse(
      [{ ...sentinel, total_count: 30 }],
      laterPage,
    ),
    { entries: [], totalCount: 30, pageBeyondRange: true },
  );
  assert.equal(
    parseUniversityApplicationWorkspaceListResponse(
      [{ ...sentinel, total_count: 50 }],
      laterPage,
    ),
    null,
  );
});

test("list parsing enforces full partial and maximum-page boundaries", () => {
  const fullPage = parseUniversityApplicationWorkspaceQuery({ pageSize: 2 });
  const partialPage = parseUniversityApplicationWorkspaceQuery({
    page: 2,
    pageSize: 2,
  });
  const maximumPage = parseUniversityApplicationWorkspaceQuery({
    page: 100_000,
    pageSize: 25,
  });
  assert.ok(fullPage && partialPage && maximumPage);
  assert.ok(
    parseUniversityApplicationWorkspaceListResponse(
      [
        row({ application_id: applicationId2, is_primary: false, total_count: 3 }),
        row({ total_count: 3 }),
      ],
      fullPage,
    ),
  );
  assert.ok(
    parseUniversityApplicationWorkspaceListResponse(
      [row({ application_id: applicationId3, is_primary: false, total_count: 3 })],
      partialPage,
    ),
  );
  const sentinel = row(
    Object.fromEntries(
      Object.keys(row()).map((key) => [key, key === "total_count" ? 1 : null]),
    ),
  );
  assert.deepEqual(
    parseUniversityApplicationWorkspaceListResponse([sentinel], maximumPage),
    { entries: [], totalCount: 1, pageBeyondRange: true },
  );
});

test("every workspace sort validates exact order null placement and UUID ties", () => {
  const cases = [
    {
      sort: "last_changed_desc" as const,
      left: row({ total_count: 2 }),
      right: row({
        application_id: applicationId2,
        is_primary: false,
        last_changed_at: "2026-08-02T10:00:00.123455+00:00",
        total_count: 2,
      }),
    },
    {
      sort: "deadline_asc" as const,
      left: row({ submission_deadline: "2026-08-20", total_count: 2 }),
      right: row({
        application_id: applicationId2,
        is_primary: false,
        submission_deadline: null,
        total_count: 2,
      }),
    },
    {
      sort: "deadline_desc" as const,
      left: row({ submission_deadline: "2026-09-20", total_count: 2 }),
      right: row({
        application_id: applicationId2,
        is_primary: false,
        submission_deadline: "2026-08-20",
        total_count: 2,
      }),
    },
    {
      sort: "student_name_asc" as const,
      left: row({ student_full_name: "\ue000", total_count: 2 }),
      right: row({
        application_id: applicationId2,
        student_full_name: "𐀀",
        is_primary: false,
        total_count: 2,
      }),
    },
    {
      sort: "university_name_asc" as const,
      left: row({ university_name: "Alpha University", total_count: 2 }),
      right: row({
        application_id: applicationId2,
        university_name: "Zulu University",
        is_primary: false,
        total_count: 2,
      }),
    },
    {
      sort: "intake_year_desc" as const,
      left: row({ intake_year: 2028, total_count: 2 }),
      right: row({
        application_id: applicationId2,
        intake_year: 2027,
        is_primary: false,
        total_count: 2,
      }),
    },
  ];
  for (const sortCase of cases) {
    const query = parseUniversityApplicationWorkspaceQuery({
      archiveFilter: "all",
      pageSize: 2,
      sort: sortCase.sort,
    });
    assert.ok(query);
    assert.ok(
      parseUniversityApplicationWorkspaceListResponse(
        [sortCase.left, sortCase.right],
        query,
        new Date("2026-08-02T06:00:00Z"),
      ),
      sortCase.sort,
    );
  }

  const ascendingTie = parseUniversityApplicationWorkspaceQuery({
    pageSize: 2,
    sort: "deadline_asc",
  });
  const descendingTie = parseUniversityApplicationWorkspaceQuery({
    pageSize: 2,
    sort: "last_changed_desc",
  });
  assert.ok(ascendingTie && descendingTie);
  const higherId = row({ application_id: applicationId2, is_primary: false, total_count: 2 });
  assert.ok(
    parseUniversityApplicationWorkspaceListResponse(
      [row({ total_count: 2 }), higherId],
      ascendingTie,
    ),
  );
  assert.ok(
    parseUniversityApplicationWorkspaceListResponse(
      [higherId, row({ total_count: 2 })],
      descendingTie,
    ),
  );
});

test("deadline filters use inclusive Asia Kolkata day boundaries", () => {
  const now = new Date("2026-08-01T18:30:00.000Z");
  for (const submissionDeadline of ["2026-08-02", "2026-09-01"]) {
    const query = parseUniversityApplicationWorkspaceQuery({
      deadlineFilter: "due_30_days",
    });
    assert.ok(query);
    assert.ok(
      parseUniversityApplicationWorkspaceListResponse(
        [row({ submission_deadline: submissionDeadline })],
        query,
        now,
      ),
    );
  }
  const dueQuery = parseUniversityApplicationWorkspaceQuery({
    deadlineFilter: "due_30_days",
  });
  const overdueQuery = parseUniversityApplicationWorkspaceQuery({
    deadlineFilter: "overdue",
  });
  assert.ok(dueQuery && overdueQuery);
  assert.equal(
    parseUniversityApplicationWorkspaceListResponse(
      [row({ submission_deadline: "2026-09-02" })],
      dueQuery,
      now,
    ),
    null,
  );
  assert.ok(
    parseUniversityApplicationWorkspaceListResponse(
      [row({ submission_deadline: "2026-08-01" })],
      overdueQuery,
      now,
    ),
  );
  assert.equal(
    parseUniversityApplicationWorkspaceListResponse(
      [row({ submission_deadline: "2026-08-02" })],
      overdueQuery,
      now,
    ),
    null,
  );
});

test("archived applications may expose only the bounded available-document count", () => {
  const query = parseUniversityApplicationWorkspaceQuery({
    archiveFilter: "archived",
  });
  assert.ok(query);
  assert.ok(
    parseUniversityApplicationWorkspaceListResponse(
      [row({ is_primary: false, is_archived: true, available_document_count: 20 })],
      query,
    ),
  );
});

test("search tolerates nullable profile fields without widening the search surface", () => {
  const query = parseUniversityApplicationWorkspaceQuery({ search: "student@kct.ac.in" });
  assert.ok(query);
  assert.ok(
    parseUniversityApplicationWorkspaceListResponse(
      [
        row({
          student_full_name: null,
          roll_number: null,
          application_reference: null,
        }),
      ],
      query,
    ),
  );
});

test("list parsing rejects private fields relational drift filters and count drift", () => {
  const query = parseUniversityApplicationWorkspaceQuery({ countryCode: "US" });
  assert.ok(query);
  for (const data of [
    [{ ...row(), portal_url: "https://private.example" }],
    [row({ available_document_count: 21 })],
    [row({ current_status: "submitted", submitted_at: null })],
    [row({ is_archived: true })],
    [row({ country_code: "GB" })],
    [row({ total_count: 2 })],
  ]) {
    assert.equal(
      parseUniversityApplicationWorkspaceListResponse(
        data,
        query,
        new Date("2026-08-02T06:00:00Z"),
      ),
      null,
    );
  }
});

test("metrics parsing accepts one consistent aggregate-only row", () => {
  const metrics = parseUniversityApplicationWorkspaceMetricsResponse([
    metricsRow(),
  ]);
  assert.ok(metrics);
  assert.equal(metrics.totalActiveApplications, 10);
  assert.equal(metrics.dueNext30DaysCount, 3);
  assert.equal(
    parseUniversityApplicationWorkspaceMetricsResponse([
      { ...metrics, student_id: studentId },
    ]),
    null,
  );
  assert.equal(
    parseUniversityApplicationWorkspaceMetricsResponse([
      {
        total_active_applications: 1,
        total_archived_applications: 2,
        students_with_applications: 2,
        primary_applications: 0,
        planning_count: 1,
        documents_collecting_count: 0,
        application_preparing_count: 0,
        ready_to_submit_count: 0,
        submitted_count: 0,
        under_university_review_count: 0,
        additional_information_requested_count: 0,
        decision_received_count: 0,
        withdrawn_count: 0,
        closed_count: 0,
        overdue_deadline_count: 0,
        due_next_30_days_count: 0,
      },
    ]),
    null,
  );
});
