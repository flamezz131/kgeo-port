import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

type ResolveHook = (
  specifier: string,
  context: object,
  nextResolve: (specifier: string, context: object) => unknown,
) => unknown;

const require = createRequire(import.meta.url);
const { registerHooks } = require("node:module") as {
  registerHooks: (hooks: { resolve: ResolveHook }) => void;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/types") {
      return {
        shortCircuit: true,
        url: new URL("../../types/index.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  buildDirectorMetricPresentation,
  getDirectorAttentionPresentation,
  parseDirectorAttentionItems,
  parseDirectorCounselorWorkload,
  parseDirectorDashboardMetrics,
  summarizeDirectorAttention,
} = require("./dashboard.ts") as typeof import("./dashboard");

const migrationUrl = new URL(
  "../../../supabase/migrations/202608060001_director_dashboard_read_foundation.sql",
  import.meta.url,
);
const migration = readFileSync(migrationUrl, "utf8");
const executableMigration = migration.replace(/--.*$/gm, "");

test("director RPCs use exact trusted authorization and ACL contracts", () => {
  assert.equal((executableMigration.match(/security definer/g) ?? []).length, 3);
  assert.equal((executableMigration.match(/stable/g) ?? []).length, 3);
  assert.equal((executableMigration.match(/set search_path = ''/g) ?? []).length, 3);
  assert.equal((executableMigration.match(/'director'::public\.user_role/g) ?? []).length, 3);
  assert.doesNotMatch(
    executableMigration,
    /has_active_verified_kgeo_role\(\s*'(?:admin|counselor|student)'/,
  );
  assert.equal((executableMigration.match(/owner to postgres/g) ?? []).length, 3);
  assert.equal((executableMigration.match(/revoke all on function public\./g) ?? []).length, 3);
  assert.equal((executableMigration.match(/grant execute on function public\./g) ?? []).length, 3);
  assert.match(executableMigration, /list_director_counselor_workload\(\s*p_limit integer default 20\s*\)/);
  assert.match(executableMigration, /list_director_attention_items\(\s*p_limit integer default 25\s*\)/);
  assert.doesNotMatch(executableMigration, /list_director_(?:counselor_workload|attention_items)\(integer, integer\)/);
});

test("director reads use projections and exclude private content", () => {
  assert.match(executableMigration, /from public\.student_counseling_progressions/);
  assert.match(executableMigration, /from public\.student_university_applications/);
  assert.doesNotMatch(executableMigration, /student_counseling_progression_events/);
  assert.doesNotMatch(executableMigration, /student_university_application_events/);
  assert.doesNotMatch(executableMigration, /student_university_application_documents/);
  assert.doesNotMatch(executableMigration, /counselor_student_notes/);
  assert.doesNotMatch(
    executableMigration,
    /next_action|details|personal_email|mobile_number|original_file_name|storage_path|change_reason|archive_reason/,
  );
  assert.match(executableMigration, /at time zone 'Asia\/Kolkata'/);
  assert.equal((executableMigration.match(/p_limit not between 1 and 50/g) ?? []).length, 2);
  assert.doesNotMatch(executableMigration, /p_page|p_page_size|offset page_offset|total_count/);
  assert.doesNotMatch(executableMigration, /follow_up_id|item_follow_up|overdue_follow_up'::text/);
  for (const kind of [
    "overdue_application_deadline",
    "due_soon_application_deadline",
    "additional_information_requested",
    "pending_consultation_outcome",
  ]) {
    assert.match(executableMigration, new RegExp(`'${kind}'::text`));
  }
});

test("dashboard metrics parser is strict and maps every field", () => {
  const row = {
    total_students: 100,
    active_students: 95,
    active_counselors: 4,
    consultations_today: 3,
    upcoming_scheduled_consultations: 8,
    unresolved_past_consultations: 1,
    completed_consultations: 20,
    no_show_consultations: 2,
    pending_follow_ups: 9,
    overdue_follow_ups: 3,
    due_today_follow_ups: 2,
    active_progressions: 30,
    on_hold_progressions: 5,
    completed_progressions: 10,
    active_applications: 40,
    submitted_applications: 7,
    additional_information_requested_applications: 2,
    overdue_application_deadlines: 1,
  };
  const parsed = parseDirectorDashboardMetrics(row);
  assert.equal(parsed.totalStudents, 100);
  assert.equal(parsed.additionalInformationRequestedApplications, 2);
  assert.throws(() => parseDirectorDashboardMetrics({ ...row, private_note: "x" }));
});

test("metric presentation maps all 18 returned values once and preserves zero", () => {
  const metrics = parseDirectorDashboardMetrics({
    total_students: 0,
    active_students: 0,
    active_counselors: 0,
    consultations_today: 0,
    upcoming_scheduled_consultations: 0,
    unresolved_past_consultations: 0,
    completed_consultations: 0,
    no_show_consultations: 0,
    pending_follow_ups: 0,
    overdue_follow_ups: 0,
    due_today_follow_ups: 0,
    active_progressions: 0,
    on_hold_progressions: 0,
    completed_progressions: 0,
    active_applications: 0,
    submitted_applications: 0,
    additional_information_requested_applications: 0,
    overdue_application_deadlines: 0,
  });
  const presentation = buildDirectorMetricPresentation(metrics);
  const metricItems = [
    ...presentation.primary,
    ...presentation.secondary.flatMap((group) => group.items),
  ];

  assert.equal(presentation.primary.length, 6);
  assert.equal(presentation.secondary.length, 3);
  assert.equal(metricItems.length, 18);
  assert.equal(new Set(metricItems.map((metric) => metric.key)).size, 18);
  assert.equal(metricItems.every((metric) => metric.value === 0), true);
});

test("workload parser enforces real unique counselors without sentinels", () => {
  const counselorId = "11111111-1111-4111-8111-111111111111";
  assert.deepEqual(
    parseDirectorCounselorWorkload([{
      counselor_id: counselorId,
      counselor_full_name: "Counselor",
      college_email: "counselor@kct.ac.in",
      is_active: true,
      overdue_follow_ups: 0,
      pending_follow_ups: 1,
      pending_outcomes: 2,
      consultations_today: 3,
    }]),
    [{
      counselorId,
      counselorFullName: "Counselor",
      collegeEmail: "counselor@kct.ac.in",
      isActive: true,
      overdueFollowUps: 0,
      pendingFollowUps: 1,
      pendingOutcomes: 2,
      consultationsToday: 3,
    }],
  );
  assert.throws(() => parseDirectorCounselorWorkload([
    {
      counselor_id: counselorId,
      counselor_full_name: null,
      college_email: "counselor@kct.ac.in",
      is_active: true,
      overdue_follow_ups: 0,
      pending_follow_ups: 0,
      pending_outcomes: 0,
      consultations_today: 0,
    },
    {
      counselor_id: counselorId,
      counselor_full_name: null,
      college_email: "counselor@kct.ac.in",
      is_active: false,
      overdue_follow_ups: 0,
      pending_follow_ups: 0,
      pending_outcomes: 0,
      consultations_today: 0,
    },
  ]));
});

test("attention parser enforces kinds severities relationships and uniqueness", () => {
  const applicationId = "22222222-2222-4222-8222-222222222222";
  const studentId = "33333333-3333-4333-8333-333333333333";
  assert.deepEqual(
    parseDirectorAttentionItems([{
      attention_kind: "overdue_application_deadline",
      severity: "high",
      student_id: studentId,
      student_full_name: null,
      college_email: "student@kct.ac.in",
      application_id: applicationId,
      consultation_id: null,
      application_status: "planning",
      submission_deadline: "2026-08-05",
      consultation_scheduled_at: null,
    }]),
    [{
      attentionType: "overdue_application_deadline",
      severity: "high",
      studentId,
      studentFullName: null,
      collegeEmail: "student@kct.ac.in",
      applicationId,
      consultationId: null,
      applicationStatus: "planning",
      submissionDeadline: "2026-08-05",
      consultationScheduledAt: null,
    }],
  );
  assert.throws(() => parseDirectorAttentionItems([{
    attention_kind: "pending_consultation_outcome",
    severity: "high",
    student_id: studentId,
    student_full_name: null,
    college_email: "student@kct.ac.in",
    application_id: applicationId,
    consultation_id: null,
    application_status: null,
    submission_deadline: null,
    consultation_scheduled_at: null,
  }]));
});

test("attention presentation retains approved severity timing and next-action meaning", () => {
  const studentId = "33333333-3333-4333-8333-333333333333";
  const items = parseDirectorAttentionItems([
    {
      attention_kind: "overdue_application_deadline",
      severity: "high",
      student_id: studentId,
      student_full_name: "Student One",
      college_email: "student.one@kct.ac.in",
      application_id: "22222222-2222-4222-8222-222222222222",
      consultation_id: null,
      application_status: "application_preparing",
      submission_deadline: "2026-08-05",
      consultation_scheduled_at: null,
    },
    {
      attention_kind: "pending_consultation_outcome",
      severity: "medium",
      student_id: studentId,
      student_full_name: null,
      college_email: "student.one@kct.ac.in",
      application_id: null,
      consultation_id: "44444444-4444-4444-8444-444444444444",
      application_status: null,
      submission_deadline: null,
      consultation_scheduled_at: "2026-08-08 14:00:00",
    },
  ]);

  assert.deepEqual(summarizeDirectorAttention(items), {
    total: 2,
    high: 1,
    medium: 1,
  });
  assert.deepEqual(summarizeDirectorAttention([]), {
    total: 0,
    high: 0,
    medium: 0,
  });

  const overdue = getDirectorAttentionPresentation(items[0]);
  assert.equal(overdue.title, "Application deadline overdue");
  assert.equal(overdue.priorityLabel, "High priority");
  assert.match(overdue.timingLabel, /^Deadline /);
  assert.equal(overdue.statusLabel, "Application Preparing");
  assert.match(overdue.nextAction, /Review the missed deadline/);

  const consultation = getDirectorAttentionPresentation(items[1]);
  assert.equal(consultation.priorityLabel, "Medium priority");
  assert.match(consultation.timingLabel, /Asia\/Kolkata$/);
  assert.equal(consultation.statusLabel, null);
});

test("the A1.1 migration has a stable review hash shape", () => {
  assert.match(
    createHash("sha256").update(readFileSync(migrationUrl)).digest("hex"),
    /^[a-f0-9]{64}$/,
  );
});
