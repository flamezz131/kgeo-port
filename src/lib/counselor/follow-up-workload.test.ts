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
    const aliases: Record<string, string> = {
      "@/lib/consultations/booking": "../consultations/booking.ts",
      "@/lib/counselor/private-records": "./private-records.ts",
      "@/lib/validation/institutional-email":
        "../validation/institutional-email.ts",
    };
    const target = aliases[specifier];
    if (target) {
      return {
        shortCircuit: true,
        url: new URL(target, import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  FOLLOW_UP_LIFECYCLE_OPTIONS,
  FOLLOW_UP_PRIORITY_FILTER_OPTIONS,
  FOLLOW_UP_WORKLOAD_PAGE_SIZE,
  attachFollowUpWorkloadReferences,
  buildFollowUpWorkloadRpcArgs,
  buildFollowUpWorkloadUrl,
  getFollowUpWorkloadLifecycle,
  getFollowUpWorkloadLifecycleLabel,
  getFollowUpWorkloadPagination,
  getFollowUpWorkloadPriorityLabel,
  parseFollowUpWorkloadQuery,
  parseFollowUpWorkloadResponse,
} = require("./follow-up-workload.ts") as typeof import("./follow-up-workload");
import type { FollowUpWorkloadRecord } from "./follow-up-workload";

const FOLLOW_UP_ID = "11111111-1111-4111-8111-111111111111";
const SECOND_FOLLOW_UP_ID = "22222222-2222-4222-8222-222222222222";
const STUDENT_ID = "33333333-3333-4333-8333-333333333333";
const CONSULTATION_ID = "44444444-4444-4444-8444-444444444444";
const NOW = new Date("2026-07-25T06:30:00.000Z");

const defaultQuery = parseFollowUpWorkloadQuery({});

const metricFields = {
  total_count: 1,
  overdue_count: 0,
  due_today_count: 1,
  upcoming_count: 0,
  completed_count: 0,
  cancelled_count: 0,
  total_pending_count: 1,
};

function workloadRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    follow_up_id: FOLLOW_UP_ID,
    student_id: STUDENT_ID,
    consultation_id: null,
    due_date: "2026-07-25",
    priority: "normal",
    stored_status: "pending",
    next_action: "Review university shortlist",
    completed_at: null,
    created_at: "2026-07-24T10:00:00.000Z",
    updated_at: "2026-07-24T10:00:00.000Z",
    full_name: null,
    college_email: "student@kct.ac.in",
    roll_number: null,
    ...metricFields,
    ...overrides,
  };
}

function metricsOnlyRow(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return workloadRow({
    follow_up_id: null,
    student_id: null,
    consultation_id: null,
    due_date: null,
    priority: null,
    stored_status: null,
    next_action: null,
    completed_at: null,
    created_at: null,
    updated_at: null,
    full_name: null,
    college_email: null,
    roll_number: null,
    total_count: 0,
    ...overrides,
  });
}

function readyRecord(
  overrides: Partial<FollowUpWorkloadRecord> = {},
): FollowUpWorkloadRecord {
  return {
    followUpId: FOLLOW_UP_ID,
    studentId: STUDENT_ID,
    consultationId: null,
    dueDate: "2026-07-25",
    priority: "normal",
    storedStatus: "pending",
    nextAction: "Review university shortlist",
    completedAt: null,
    createdAt: "2026-07-24T10:00:00.000Z",
    updatedAt: "2026-07-24T10:00:00.000Z",
    fullName: null,
    collegeEmail: "student@kct.ac.in",
    rollNumber: null,
    ...overrides,
  };
}

function followUpId(index: number): string {
  return `${index.toString(16).padStart(8, "0")}-0000-4000-8000-${index
    .toString(16)
    .padStart(12, "0")}`;
}

function workloadPageRows(
  rowCount: number,
  totalCount: number,
  startIndex = 1,
) {
  return Array.from({ length: rowCount }, (_, offset) =>
    workloadRow({
      follow_up_id: followUpId(startIndex + offset),
      total_count: totalCount,
      due_today_count: totalCount,
      total_pending_count: totalCount,
    }),
  );
}

test("all approved lifecycle and priority filters map to bounded RPC arguments", () => {
  for (const lifecycle of FOLLOW_UP_LIFECYCLE_OPTIONS.map(
    (option) => option.value,
  )) {
    const query = parseFollowUpWorkloadQuery({ lifecycle });
    assert.equal(query.lifecycle, lifecycle);
    assert.equal(query.hadInvalidParameters, false);
  }
  for (const priority of FOLLOW_UP_PRIORITY_FILTER_OPTIONS.map(
    (option) => option.value,
  )) {
    const query = parseFollowUpWorkloadQuery({ priority });
    assert.equal(query.priority, priority);
    assert.equal(query.hadInvalidParameters, false);
  }
  assert.equal(buildFollowUpWorkloadRpcArgs(defaultQuery).p_page_size, 25);
  assert.equal(FOLLOW_UP_WORKLOAD_PAGE_SIZE, 25);
});

test("search, dates, duplicate values, and page bounds normalize safely", () => {
  const valid = parseFollowUpWorkloadQuery({
    search: "  Asha   KCT  ",
    dueFrom: "2026-07-01",
    dueTo: "2026-07-31",
    page: "2",
  });
  assert.equal(valid.search, "asha kct");
  assert.equal(valid.page, 2);
  assert.equal(valid.hadInvalidParameters, false);

  for (const query of [
    parseFollowUpWorkloadQuery({ search: ["one", "two"] }),
    parseFollowUpWorkloadQuery({ dueFrom: "2026-02-30" }),
    parseFollowUpWorkloadQuery({
      dueFrom: "2026-08-01",
      dueTo: "2026-07-01",
    }),
    parseFollowUpWorkloadQuery({ page: "0" }),
    parseFollowUpWorkloadQuery({ page: "-1" }),
    parseFollowUpWorkloadQuery({ page: "1.5" }),
    parseFollowUpWorkloadQuery({ page: "1e2" }),
    parseFollowUpWorkloadQuery({ page: "100001" }),
    parseFollowUpWorkloadQuery({ unknown: "private" }),
  ]) {
    assert.equal(query.hadInvalidParameters, true);
  }
});

test("central URL construction preserves only approved normalized filters", () => {
  const query = parseFollowUpWorkloadQuery({
    lifecycle: "overdue",
    priority: "high",
    search: "  Student  ",
    dueFrom: "2026-07-01",
    dueTo: "2026-07-31",
  });
  const url = buildFollowUpWorkloadUrl(query, 3);
  assert.equal(
    url,
    "/counselor/follow-ups?lifecycle=overdue&priority=high&search=student&dueFrom=2026-07-01&dueTo=2026-07-31&page=3",
  );
  assert.doesNotMatch(
    url,
    /next_action|details|note|redirect|student@|Review university/,
  );
});

test("a populated row is validated with safe identity fallbacks and six metrics", () => {
  const result = parseFollowUpWorkloadResponse(
    [workloadRow()],
    defaultQuery,
    NOW,
  );
  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.records.length, 1);
  assert.equal(result.records[0].fullName, null);
  assert.equal(result.records[0].rollNumber, null);
  assert.deepEqual(result.metrics, {
    overdueCount: 0,
    dueTodayCount: 1,
    upcomingCount: 0,
    completedCount: 0,
    cancelledCount: 0,
    totalPendingCount: 1,
  });
});

test("a blank full name maps to the safe fallback instead of failing the page", () => {
  const result = parseFollowUpWorkloadResponse(
    [workloadRow({ full_name: "   " })],
    defaultQuery,
    NOW,
  );
  assert.equal(result.kind, "ready");
  if (result.kind === "ready") {
    assert.equal(result.records[0].fullName, null);
  }
});

test("a valid metrics-only row is filtered-empty, while raw empty data is unavailable", () => {
  const filteredQuery = parseFollowUpWorkloadQuery({
    lifecycle: "completed",
  });
  const filteredEmpty = parseFollowUpWorkloadResponse(
    [metricsOnlyRow()],
    filteredQuery,
    NOW,
  );
  const unavailable = parseFollowUpWorkloadResponse([], defaultQuery, NOW);
  assert.equal(filteredEmpty.kind, "ready");
  if (filteredEmpty.kind === "ready") {
    assert.equal(filteredEmpty.records.length, 0);
    assert.equal(filteredEmpty.metrics.totalPendingCount, 1);
  }
  assert.equal(unavailable.kind, "unavailable");
});

test("malformed sentinel mixtures, identity, audit, enum, count, and duplicate IDs fail closed", () => {
  const malformedCases: unknown[] = [
    [metricsOnlyRow({ student_id: STUDENT_ID })],
    [metricsOnlyRow(), workloadRow()],
    [workloadRow({ student_id: "invalid" })],
    [workloadRow({ college_email: "student@example.com" })],
    [workloadRow({ stored_status: "completed", completed_at: null })],
    [workloadRow({ stored_status: "cancelled", completed_at: "2026-07-24T10:00:00.000Z" })],
    [workloadRow({ priority: "urgent" })],
    [workloadRow({ stored_status: "reopened" })],
    [workloadRow({ total_count: "not-a-count" })],
    [workloadRow({ overdue_count: 1 })],
    [
      workloadRow({ total_count: 2, due_today_count: 2, total_pending_count: 2 }),
      workloadRow({
        follow_up_id: FOLLOW_UP_ID,
        total_count: 2,
        due_today_count: 2,
        total_pending_count: 2,
      }),
    ],
  ];
  for (const rows of malformedCases) {
    assert.equal(
      parseFollowUpWorkloadResponse(rows, defaultQuery, NOW).kind,
      "unavailable",
    );
  }
});

test("completed audit pairs and lifecycle and priority labels are validated", () => {
  const completedQuery = parseFollowUpWorkloadQuery({
    lifecycle: "completed",
  });
  const result = parseFollowUpWorkloadResponse(
    [
      workloadRow({
        stored_status: "completed",
        completed_at: "2026-07-24T10:30:00.000Z",
        updated_at: "2026-07-24T10:30:00.000Z",
        due_date: "2026-07-20",
        due_today_count: 0,
        completed_count: 1,
        total_pending_count: 0,
      }),
    ],
    completedQuery,
    NOW,
  );
  assert.equal(result.kind, "ready");
  assert.equal(
    getFollowUpWorkloadLifecycle(readyRecord(), "2026-07-25"),
    "due_today",
  );
  assert.equal(getFollowUpWorkloadLifecycleLabel("due_today"), "Due today");
  assert.equal(getFollowUpWorkloadPriorityLabel("high"), "High");
});

test("consultation references merge once and reject missing linked references", () => {
  const raw = {
    kind: "ready" as const,
    query: defaultQuery,
    records: [
      readyRecord({ consultationId: CONSULTATION_ID }),
      readyRecord({
        followUpId: SECOND_FOLLOW_UP_ID,
        consultationId: null,
      }),
    ],
    totalCount: 2,
    metrics: {
      overdueCount: 0,
      dueTodayCount: 2,
      upcomingCount: 0,
      completedCount: 0,
      cancelledCount: 0,
      totalPendingCount: 2,
    },
    businessToday: "2026-07-25",
  };
  const merged = attachFollowUpWorkloadReferences(
    raw,
    new Map([[CONSULTATION_ID, "KGEOC-2026-000001"]]),
  );
  assert.ok(merged);
  assert.equal(merged.records[0].consultationReference, "KGEOC-2026-000001");
  assert.equal(merged.records[1].consultationReference, null);
  assert.equal(attachFollowUpWorkloadReferences(raw, new Map()), null);
});

test("pagination preserves approved filters and canonicalizes an out-of-range page", () => {
  const query = parseFollowUpWorkloadQuery({
    lifecycle: "upcoming",
    page: "3",
  });
  const outOfRange = parseFollowUpWorkloadResponse(
    [
      metricsOnlyRow({
        total_count: 26,
        due_today_count: 0,
        upcoming_count: 26,
        total_pending_count: 26,
      }),
    ],
    query,
    NOW,
  );
  assert.deepEqual(outOfRange, {
    kind: "out_of_range",
    redirectTo: "/counselor/follow-ups?lifecycle=upcoming&page=2",
  });

  const pagination = getFollowUpWorkloadPagination({
    kind: "ready",
    query: parseFollowUpWorkloadQuery({
      lifecycle: "upcoming",
      page: "2",
    }),
    records: [],
    totalCount: 51,
    metrics: {
      overdueCount: 0,
      dueTodayCount: 0,
      upcomingCount: 51,
      completedCount: 0,
      cancelledCount: 0,
      totalPendingCount: 51,
    },
    businessToday: "2026-07-25",
  });
  assert.equal(pagination.firstUrl, "/counselor/follow-ups?lifecycle=upcoming");
  assert.equal(
    pagination.nextUrl,
    "/counselor/follow-ups?lifecycle=upcoming&page=3",
  );
  assert.equal(pagination.pageCount, 3);
});

test("runtime pagination accepts exact 1, 25, 26, full-final, and partial-final boundaries", () => {
  const cases = [
    {
      query: parseFollowUpWorkloadQuery({ page: "1" }),
      rows: workloadPageRows(1, 1),
      expected: 1,
    },
    {
      query: parseFollowUpWorkloadQuery({ page: "1" }),
      rows: workloadPageRows(25, 25),
      expected: 25,
    },
    {
      query: parseFollowUpWorkloadQuery({ page: "1" }),
      rows: workloadPageRows(25, 26),
      expected: 25,
    },
    {
      query: parseFollowUpWorkloadQuery({ page: "2" }),
      rows: workloadPageRows(1, 26, 26),
      expected: 1,
    },
    {
      query: parseFollowUpWorkloadQuery({ page: "2" }),
      rows: workloadPageRows(25, 50, 26),
      expected: 25,
    },
    {
      query: parseFollowUpWorkloadQuery({ page: "3" }),
      rows: workloadPageRows(1, 51, 51),
      expected: 1,
    },
  ];

  for (const boundary of cases) {
    const result = parseFollowUpWorkloadResponse(
      boundary.rows,
      boundary.query,
      NOW,
    );
    assert.equal(result.kind, "ready");
    if (result.kind === "ready") {
      assert.equal(result.records.length, boundary.expected);
    }
  }
});
