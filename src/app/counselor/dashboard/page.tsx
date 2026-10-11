import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  CircleSlash,
  ClipboardCheck,
  UserX,
} from "lucide-react";
import { buildCounselorDaySchedule } from "@/lib/consultations/counselor-schedule";
import {
  getConsultationLifecycleLabel,
  getConsultationLifecycleState,
  type ConsultationLifecycleState,
} from "@/lib/consultations/lifecycle";
import {
  formatConsultationDate,
  formatConsultationTimeRange,
  getAsiaKolkataBusinessDateTime,
} from "@/lib/consultations/booking";
import {
  STUDENT_360_BASE_PATH,
  isStudent360StudentId,
} from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";

export const metadata: Metadata = { title: "Counselor dashboard" };

type SlotState = "available" | "expired" | ConsultationLifecycleState;

type MetricTone = "brand" | "amber" | "emerald" | "rose" | "slate";

const METRIC_TONE: Record<MetricTone, { chip: string; value: string }> = {
  brand: { chip: "bg-blue-50 text-[#1D4ED8]", value: "text-[#0B1F3A]" },
  amber: { chip: "bg-amber-50 text-amber-700", value: "text-amber-700" },
  emerald: { chip: "bg-emerald-50 text-emerald-700", value: "text-[#0B1F3A]" },
  rose: { chip: "bg-rose-50 text-rose-700", value: "text-rose-700" },
  slate: { chip: "bg-slate-100 text-slate-500", value: "text-slate-600" },
};

const SLOT_TONE: Record<string, string> = {
  available: "border-dashed border-slate-200 bg-slate-50/60",
  expired: "border-slate-200 bg-slate-100/70",
  upcoming: "border-blue-200 bg-blue-50/50",
  in_progress: "border-emerald-300 bg-emerald-50/70",
  counselor_assigned: "border-blue-200 bg-blue-50/50",
  outcome_required: "border-amber-300 bg-amber-50/60",
  completed: "border-emerald-200 bg-white",
  no_show: "border-rose-200 bg-rose-50/50",
  cancelled: "border-slate-200 bg-slate-50/60",
  pending: "border-amber-200 bg-amber-50/50",
  assignment_pending: "border-amber-200 bg-amber-50/50",
  expired_request: "border-slate-200 bg-slate-50/60",
};

function MetricCard({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: MetricTone;
  icon: React.ReactNode;
}) {
  const styles = METRIC_TONE[tone];
  return (
    <article className="flex flex-col justify-between gap-4 rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-[0_1px_3px_rgb(15_23_42/0.06)] transition-shadow hover:shadow-[0_10px_24px_-14px_rgb(15_23_42/0.3)]">
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 text-[0.72rem] font-bold leading-snug text-slate-500 [overflow-wrap:anywhere]">
          {label}
        </span>
        <span className={`grid size-7 shrink-0 place-items-center rounded-lg ${styles.chip}`}>
          {icon}
        </span>
      </div>
      <strong
        className={`text-3xl font-extrabold tabular-nums tracking-tight ${styles.value}`}
      >
        {value}
      </strong>
    </article>
  );
}

function getSlotStateLabel(state: SlotState) {
  if (state === "available") return "Available";
  if (state === "expired") return "Expired";
  return getConsultationLifecycleLabel(state);
}

function CounselorDashboardUnavailable() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="mt-2">Schedule temporarily unavailable</h1>
      </div>
      <div
        className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800"
        role="alert"
      >
        <AlertTriangle size={19} className="mt-0.5 shrink-0" />
        <p className="text-sm">Please refresh the page and try again.</p>
      </div>
    </div>
  );
}

export default async function CounselorDashboardPage() {
  const { supabase, profile } = await requireCounselor();
  const now = new Date();
  const business = getAsiaKolkataBusinessDateTime(now);

  const [metricsResult, todayResult, upcomingResult] = await Promise.all([
    supabase.rpc("get_my_consultation_dashboard_metrics").single(),
    supabase.rpc("list_my_assigned_consultations", {
      p_date_from: business.date,
      p_date_to: business.date,
      p_limit: 100,
    }),
    supabase.rpc("list_my_assigned_consultations", {
      p_date_from: business.date,
      p_date_to: null,
      p_limit: 200,
    }),
  ]);

  if (
    metricsResult.error ||
    todayResult.error ||
    upcomingResult.error ||
    !metricsResult.data
  ) {
    return <CounselorDashboardUnavailable />;
  }

  const todayBookings = todayResult.data ?? [];
  const nextConsultation =
    (upcomingResult.data ?? []).find((consultation) => {
      if (consultation.status !== "scheduled") return false;
      const state = getConsultationLifecycleState(
        {
          status: consultation.status,
          consultationDate: consultation.consultation_date,
          slotStart: consultation.slot_start,
          slotEnd: consultation.slot_end,
        },
        now,
      );
      return state === "upcoming" || state === "in_progress";
    }) ?? null;
  const todaySchedule = buildCounselorDaySchedule(
    business.date,
    todayBookings,
    now,
  );
  const metrics = metricsResult.data;

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="mt-2">Good day, {profile.full_name ?? "Counselor"}</h1>
          <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-2.5 py-1 text-[0.8rem] font-semibold text-slate-500 ring-1 ring-[#E2E8F0]">
            <CalendarDays size={14} className="text-[#1D4ED8]" />
            {formatConsultationDate(business.date)}
            <span aria-hidden="true" className="text-slate-300">
              &middot;
            </span>
            Asia/Kolkata
          </p>
        </div>
        <Link
          href={`/counselor/schedule?date=${business.date}`}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-5 text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgb(29_78_216/0.8)] transition-all hover:-translate-y-0.5 hover:bg-[#1E40AF] motion-reduce:transform-none"
        >
          View my schedule
          <ArrowUpRight size={16} />
        </Link>
      </header>

      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6"
        aria-label="My consultation metrics"
      >
        <MetricCard
          label="My sessions today (excluding cancelled)"
          value={metrics.today_count}
          tone="brand"
          icon={<CalendarDays size={14} />}
        />
        <MetricCard
          label="My current/upcoming consultations"
          value={metrics.upcoming_count}
          tone="brand"
          icon={<CalendarClock size={14} />}
        />
        <MetricCard
          label="My consultations awaiting outcome"
          value={metrics.outcome_required_count}
          tone="amber"
          icon={<ClipboardCheck size={14} />}
        />
        <MetricCard
          label="My completed consultations"
          value={metrics.completed_count}
          tone="emerald"
          icon={<CheckCircle2 size={14} />}
        />
        <MetricCard
          label="My student no-shows"
          value={metrics.no_show_count}
          tone="rose"
          icon={<UserX size={14} />}
        />
        <MetricCard
          label="My cancelled consultations"
          value={metrics.cancelled_count}
          tone="slate"
          icon={<CircleSlash size={14} />}
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)] xl:items-start">
        <section aria-labelledby="today-heading">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="today-heading" className="mt-1.5">
                My assigned schedule today
              </h2>
            </div>
            <Link
              href={`/counselor/schedule?date=${business.date}`}
              className="text-sm font-bold text-[#1D4ED8] underline decoration-1 underline-offset-4 transition-colors hover:text-[#1E40AF]"
            >
              View details
            </Link>
          </div>

          {todaySchedule.kind === "weekend" ? (
            <div
              className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center"
              role="status"
            >
              <h3>No regular consultation schedule on weekends</h3>
              <p className="mt-1.5 text-sm text-slate-500">
                Regular sessions resume Monday between 9:00 AM and 5:00 PM.
              </p>
            </div>
          ) : (
            <div>
              {metrics.today_count === 0 && (
                <p
                  className="mb-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500"
                  role="status"
                >
                  No consultations are assigned to you today.
                </p>
              )}
              <ol className="flex flex-col gap-2">
                {todaySchedule.slots.map((slot) => (
                  <li key={slot.slotStart}>
                    <article
                      className={`flex flex-col gap-3 rounded-xl border p-3 sm:flex-row sm:items-center sm:gap-4 ${
                        SLOT_TONE[slot.state] ?? "border-slate-200 bg-white"
                      }`}
                    >
                      <time className="w-full shrink-0 text-[0.78rem] font-bold tabular-nums text-slate-600 sm:w-32">
                        {formatConsultationTimeRange(
                          slot.slotStart,
                          slot.slotEnd,
                        )}
                      </time>
                      {slot.booking ? (
                        <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-1.5">
                          <div className="min-w-0">
                            <strong className="block truncate text-sm font-bold text-[#0B1F3A]">
                              {slot.booking.student_name}
                            </strong>
                            <span className="block truncate text-[0.78rem] text-slate-500">
                              {slot.booking.course} &middot;{" "}
                              {slot.booking.department}
                            </span>
                            <small className="block text-[0.7rem] tabular-nums text-slate-500">
                              {slot.booking.request_number}
                            </small>
                          </div>
                          <div className="flex shrink-0 items-center gap-3">
                            <small className="rounded-full bg-white/80 px-2 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-slate-600 ring-1 ring-inset ring-slate-200">
                              {getSlotStateLabel(slot.state)}
                            </small>
                            {slot.booking.student_id &&
                              isStudent360StudentId(slot.booking.student_id) && (
                                <Link
                                  href={`${STUDENT_360_BASE_PATH}/${slot.booking.student_id}`}
                                  className="text-[0.78rem] font-bold text-[#1D4ED8] underline decoration-1 underline-offset-4 hover:text-[#1E40AF]"
                                >
                                  View Student Workspace
                                </Link>
                              )}
                          </div>
                        </div>
                      ) : (
                        <strong className="text-[0.8rem] font-semibold text-slate-500">
                          No assigned consultation
                        </strong>
                      )}
                    </article>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>

        <aside className="rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgb(15_23_42/0.06)] sm:p-6">
          <h2 className="mt-1.5">My next consultation</h2>

          {nextConsultation ? (
            <div className="mt-5 flex flex-col gap-4">
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-4">
                <strong className="block text-base font-bold text-[#0B1F3A]">
                  {nextConsultation.student_name}
                </strong>
                <span className="mt-1 inline-flex items-center rounded-full bg-white px-2.5 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide text-[#1D4ED8] ring-1 ring-inset ring-blue-200">
                  {getConsultationLifecycleLabel(
                    getConsultationLifecycleState(
                      {
                        status: nextConsultation.status,
                        consultationDate: nextConsultation.consultation_date,
                        slotStart: nextConsultation.slot_start,
                        slotEnd: nextConsultation.slot_end,
                      },
                      now,
                    ),
                  )}
                </span>
              </div>

              <dl className="flex flex-col gap-3 text-sm">
                <div>
                  <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                    Programme
                  </dt>
                  <dd className="mt-0.5 font-semibold text-[#0B1F3A]">
                    {nextConsultation.course} &middot;{" "}
                    {nextConsultation.department}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                    When
                  </dt>
                  <dd className="mt-0.5 font-semibold tabular-nums text-[#0B1F3A]">
                    {formatConsultationDate(
                      nextConsultation.consultation_date ?? "",
                    )}
                    <br />
                    {formatConsultationTimeRange(
                      nextConsultation.slot_start ?? "",
                      nextConsultation.slot_end ?? "",
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
                    Request
                  </dt>
                  <dd className="mt-0.5 tabular-nums text-slate-500">
                    <small>{nextConsultation.request_number}</small>
                  </dd>
                </div>
              </dl>

              {nextConsultation.student_id &&
                isStudent360StudentId(nextConsultation.student_id) && (
                  <Link
                    href={`${STUDENT_360_BASE_PATH}/${nextConsultation.student_id}`}
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 text-sm font-bold text-[#1D4ED8] transition-colors hover:bg-[#1D4ED8] hover:text-white"
                  >
                    View Student Workspace
                    <ArrowUpRight size={15} />
                  </Link>
                )}
            </div>
          ) : (
            <div
              className="mt-5 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center"
              role="status"
            >
              <h3>No active or upcoming assigned consultation</h3>
              <p className="mt-1.5 text-sm text-slate-500">
                Automatically assigned future consultations appear here.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
