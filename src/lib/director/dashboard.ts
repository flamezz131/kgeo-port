import { z } from "zod";
import type {
  DirectorAttentionItem,
  DirectorAttentionSeverity,
  DirectorAttentionType,
  DirectorCounselorWorkloadSummary,
  DirectorDashboardMetrics,
} from "@/types";

const countSchema = z.number().int().nonnegative().safe();
const nullableTextSchema = z.string().nullable();

const dashboardMetricsRowSchema = z
  .object({
    total_students: countSchema,
    active_students: countSchema,
    active_counselors: countSchema,
    consultations_today: countSchema,
    upcoming_scheduled_consultations: countSchema,
    unresolved_past_consultations: countSchema,
    completed_consultations: countSchema,
    no_show_consultations: countSchema,
    pending_follow_ups: countSchema,
    overdue_follow_ups: countSchema,
    due_today_follow_ups: countSchema,
    active_progressions: countSchema,
    on_hold_progressions: countSchema,
    completed_progressions: countSchema,
    active_applications: countSchema,
    submitted_applications: countSchema,
    additional_information_requested_applications: countSchema,
    overdue_application_deadlines: countSchema,
  })
  .strict();

const workloadRowSchema = z
  .object({
    counselor_id: z.string().uuid(),
    counselor_full_name: nullableTextSchema,
    college_email: z.string().email(),
    is_active: z.boolean(),
    overdue_follow_ups: countSchema,
    pending_follow_ups: countSchema,
    pending_outcomes: countSchema,
    consultations_today: countSchema,
  })
  .strict();

const attentionTypes = [
  "overdue_application_deadline",
  "due_soon_application_deadline",
  "additional_information_requested",
  "pending_consultation_outcome",
] as const satisfies readonly DirectorAttentionType[];
const attentionSeverities = ["high", "medium"] as const satisfies readonly DirectorAttentionSeverity[];
const applicationStatusSchema = z.enum([
  "planning",
  "documents_collecting",
  "application_preparing",
  "ready_to_submit",
  "submitted",
  "under_university_review",
  "additional_information_requested",
  "decision_received",
  "withdrawn",
  "closed",
]);

const attentionRowSchema = z
  .object({
    attention_kind: z.enum(attentionTypes),
    severity: z.enum(attentionSeverities),
    student_id: z.string().uuid(),
    student_full_name: nullableTextSchema,
    college_email: z.string().email(),
    application_id: z.string().uuid().nullable(),
    consultation_id: z.string().uuid().nullable(),
    application_status: applicationStatusSchema.nullable(),
    submission_deadline: z.iso.date().nullable(),
    consultation_scheduled_at: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/)
      .nullable(),
  })
  .strict()
  .superRefine((row, context) => {
    const applicationKind = row.attention_kind !== "pending_consultation_outcome";
    if (applicationKind) {
      if (row.application_id === null || row.consultation_id !== null) {
        context.addIssue({ code: "custom", message: "Invalid application attention relationship." });
      }
      if (row.attention_kind !== "additional_information_requested" && row.submission_deadline === null) {
        context.addIssue({ code: "custom", message: "Application deadline is required." });
      }
      if (row.attention_kind === "additional_information_requested" && row.application_status !== "additional_information_requested") {
        context.addIssue({ code: "custom", message: "Application status is invalid." });
      }
      if (row.consultation_scheduled_at !== null) {
        context.addIssue({ code: "custom", message: "Consultation time is not allowed." });
      }
    } else if (
      row.consultation_id === null ||
      row.application_id !== null ||
      row.application_status !== null ||
      row.submission_deadline !== null ||
      row.consultation_scheduled_at === null
    ) {
      context.addIssue({ code: "custom", message: "Invalid consultation attention relationship." });
    }
    const expectedSeverity = row.attention_kind === "overdue_application_deadline" ||
      row.attention_kind === "additional_information_requested" ? "high" : "medium";
    if (row.severity !== expectedSeverity) {
      context.addIssue({ code: "custom", message: "Attention severity is invalid." });
    }
  });

export function parseDirectorDashboardMetrics(
  value: unknown,
): DirectorDashboardMetrics {
  const row = dashboardMetricsRowSchema.parse(value);
  return {
    totalStudents: row.total_students,
    activeStudents: row.active_students,
    activeCounselors: row.active_counselors,
    consultationsToday: row.consultations_today,
    upcomingScheduledConsultations: row.upcoming_scheduled_consultations,
    unresolvedPastConsultations: row.unresolved_past_consultations,
    completedConsultations: row.completed_consultations,
    noShowConsultations: row.no_show_consultations,
    pendingFollowUps: row.pending_follow_ups,
    overdueFollowUps: row.overdue_follow_ups,
    dueTodayFollowUps: row.due_today_follow_ups,
    activeProgressions: row.active_progressions,
    onHoldProgressions: row.on_hold_progressions,
    completedProgressions: row.completed_progressions,
    activeApplications: row.active_applications,
    submittedApplications: row.submitted_applications,
    additionalInformationRequestedApplications:
      row.additional_information_requested_applications,
    overdueApplicationDeadlines: row.overdue_application_deadlines,
  };
}

export function parseDirectorCounselorWorkload(value: unknown): DirectorCounselorWorkloadSummary[] {
  const rows = z.array(workloadRowSchema).parse(value);
  const counselorIds = new Set(rows.map((row) => row.counselor_id));
  if (counselorIds.size !== rows.length) {
    throw new Error("Duplicate director workload counselor.");
  }
  return rows.map((row) => ({
    counselorId: row.counselor_id,
    counselorFullName: row.counselor_full_name,
    collegeEmail: row.college_email,
    isActive: row.is_active,
    pendingFollowUps: row.pending_follow_ups,
    overdueFollowUps: row.overdue_follow_ups,
    pendingOutcomes: row.pending_outcomes,
    consultationsToday: row.consultations_today,
  }));
}

export function parseDirectorAttentionItems(value: unknown): DirectorAttentionItem[] {
  const rows = z.array(attentionRowSchema).parse(value);
  const entityKeys = new Set<string>();
  for (const row of rows) {
    const entityId = row.application_id ?? row.consultation_id;
    const key = `${row.attention_kind}:${entityId}`;
    if (entityKeys.has(key)) {
      throw new Error("Duplicate director attention item.");
    }
    entityKeys.add(key);
  }
  return rows.map((row) => ({
      attentionType: row.attention_kind,
      severity: row.severity,
      studentId: row.student_id,
      studentFullName: row.student_full_name,
      collegeEmail: row.college_email,
      applicationId: row.application_id,
      consultationId: row.consultation_id,
      applicationStatus: row.application_status,
      submissionDeadline: row.submission_deadline,
      consultationScheduledAt: row.consultation_scheduled_at,
    }));
}

export type DirectorMetricItem = {
  key: keyof DirectorDashboardMetrics;
  label: string;
  description: string;
  value: number;
};

export type DirectorMetricGroup = {
  key: "consultations" | "studentProgress" | "applicationsAndFollowUps";
  title: string;
  description: string;
  items: DirectorMetricItem[];
};

type DirectorMetricDefinition = Omit<DirectorMetricItem, "value">;

const primaryMetricDefinitions = [
  {
    key: "activeStudents",
    label: "Active students",
    description: "Student accounts currently active",
  },
  {
    key: "activeCounselors",
    label: "Active counselors",
    description: "Active counselors with verified email",
  },
  {
    key: "consultationsToday",
    label: "Consultations today",
    description: "Today’s sessions excluding cancelled requests",
  },
  {
    key: "unresolvedPastConsultations",
    label: "Pending outcomes",
    description: "Past scheduled sessions awaiting an outcome",
  },
  {
    key: "overdueApplicationDeadlines",
    label: "Overdue deadlines",
    description: "Active applications past their submission deadline",
  },
  {
    key: "overdueFollowUps",
    label: "Overdue follow-ups",
    description: "Pending counselor follow-ups past due",
  },
] as const satisfies readonly DirectorMetricDefinition[];

const secondaryMetricGroupDefinitions = [
  {
    key: "consultations",
    title: "Consultation flow",
    description: "Current scheduled demand and recorded outcomes.",
    items: [
      {
        key: "upcomingScheduledConsultations",
        label: "Upcoming scheduled",
        description: "Future scheduled consultations",
      },
      {
        key: "completedConsultations",
        label: "Completed",
        description: "Consultations with a completed outcome",
      },
      {
        key: "noShowConsultations",
        label: "Student no-shows",
        description: "Consultations recorded as student no-show",
      },
    ],
  },
  {
    key: "studentProgress",
    title: "Student progression",
    description: "Student population and counseling progression state.",
    items: [
      {
        key: "totalStudents",
        label: "Registered students",
        description: "All student profiles",
      },
      {
        key: "activeProgressions",
        label: "Active progressions",
        description: "Counseling progressions currently active",
      },
      {
        key: "onHoldProgressions",
        label: "On-hold progressions",
        description: "Counseling progressions currently on hold",
      },
      {
        key: "completedProgressions",
        label: "Completed progressions",
        description: "Counseling progressions marked completed",
      },
    ],
  },
  {
    key: "applicationsAndFollowUps",
    title: "Applications and follow-ups",
    description: "Application pipeline and aggregate follow-up activity.",
    items: [
      {
        key: "activeApplications",
        label: "Active applications",
        description: "Non-archived university applications",
      },
      {
        key: "submittedApplications",
        label: "Submitted applications",
        description: "Applications currently in submitted status",
      },
      {
        key: "additionalInformationRequestedApplications",
        label: "Information requested",
        description: "Applications awaiting additional information",
      },
      {
        key: "pendingFollowUps",
        label: "Pending follow-ups",
        description: "Pending counselor follow-ups in aggregate",
      },
      {
        key: "dueTodayFollowUps",
        label: "Follow-ups due today",
        description: "Pending counselor follow-ups due today",
      },
    ],
  },
] as const satisfies readonly {
  key: DirectorMetricGroup["key"];
  title: string;
  description: string;
  items: readonly DirectorMetricDefinition[];
}[];

function buildMetricItem(
  metrics: DirectorDashboardMetrics,
  definition: DirectorMetricDefinition,
): DirectorMetricItem {
  return { ...definition, value: metrics[definition.key] };
}

export function buildDirectorMetricPresentation(
  metrics: DirectorDashboardMetrics,
): {
  primary: DirectorMetricItem[];
  secondary: DirectorMetricGroup[];
} {
  return {
    primary: primaryMetricDefinitions.map((definition) =>
      buildMetricItem(metrics, definition),
    ),
    secondary: secondaryMetricGroupDefinitions.map((group) => ({
      ...group,
      items: group.items.map((definition) =>
        buildMetricItem(metrics, definition),
      ),
    })),
  };
}

const attentionCopy = {
  overdue_application_deadline: {
    title: "Application deadline overdue",
    nextAction:
      "Review the missed deadline and confirm the application’s next step.",
  },
  due_soon_application_deadline: {
    title: "Application deadline due soon",
    nextAction:
      "Confirm that the application is on track before the deadline.",
  },
  additional_information_requested: {
    title: "Additional information requested",
    nextAction:
      "Confirm that the requested application information is being addressed.",
  },
  pending_consultation_outcome: {
    title: "Consultation outcome pending",
    nextAction:
      "Ask the assigned counselor to record the completed session outcome.",
  },
} as const satisfies Record<
  DirectorAttentionType,
  { title: string; nextAction: string }
>;

const directorDateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC",
});
const directorDateTimeFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatDirectorDate(value: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  );
  return Number.isNaN(date.valueOf()) ? null : directorDateFormatter.format(date);
}

function formatDirectorDateTime(value: string): string | null {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?$/.exec(
      value,
    );
  if (!match) return null;

  const date = new Date(
    Date.UTC(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(match[4]),
      Number(match[5]),
      Number(match[6]),
    ),
  );
  return Number.isNaN(date.valueOf())
    ? null
    : directorDateTimeFormatter.format(date);
}

function formatApplicationStatus(value: string): string {
  return value
    .split("_")
    .map((word) => `${word.charAt(0).toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export type DirectorAttentionPresentation = {
  title: string;
  nextAction: string;
  priorityLabel: "High priority" | "Medium priority";
  timingLabel: string;
  statusLabel: string | null;
};

export function getDirectorAttentionPresentation(
  item: DirectorAttentionItem,
): DirectorAttentionPresentation {
  const copy = attentionCopy[item.attentionType];
  const deadline = item.submissionDeadline
    ? formatDirectorDate(item.submissionDeadline)
    : null;
  const scheduledAt = item.consultationScheduledAt
    ? formatDirectorDateTime(item.consultationScheduledAt)
    : null;

  return {
    ...copy,
    priorityLabel: item.severity === "high" ? "High priority" : "Medium priority",
    timingLabel: deadline
      ? `Deadline ${deadline}`
      : scheduledAt
        ? `Scheduled ${scheduledAt} · Asia/Kolkata`
        : "No deadline recorded",
    statusLabel: item.applicationStatus
      ? formatApplicationStatus(item.applicationStatus)
      : null,
  };
}

export function summarizeDirectorAttention(items: DirectorAttentionItem[]): {
  total: number;
  high: number;
  medium: number;
} {
  return items.reduce(
    (summary, item) => ({
      total: summary.total + 1,
      high: summary.high + (item.severity === "high" ? 1 : 0),
      medium: summary.medium + (item.severity === "medium" ? 1 : 0),
    }),
    { total: 0, high: 0, medium: 0 },
  );
}
