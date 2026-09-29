import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import {
  AlertCircle,
  ArrowRight,
  CalendarDays,
  CalendarPlus,
  CheckCircle2,
  Clock,
  History,
  Sparkles,
} from "lucide-react";
import {
  StudentUniversityApplicationsSection,
  StudentUniversityApplicationsSkeleton,
} from "@/components/student/university-applications-section";
import { ContinueWithKgeoForm } from "@/components/student/continue-with-kgeo-form";
import { STUDENT_CONSULTATION_LIST_QUERY } from "@/lib/consultations/student-list";
import { getConsultationScheduleDisplay } from "@/lib/consultations/booking";
import {
  getConsultationLifecycleState,
  getConsultationPresentationGroup,
  getStudentConsultationLifecycleLabel,
  type ConsultationLifecycleState,
} from "@/lib/consultations/lifecycle";
import { requireStudent } from "@/lib/permissions";
import { mapProfileCompletion } from "@/lib/profiles/completion";
import type { Database } from "@/types/database";

export const metadata: Metadata = { title: "Student dashboard" };

type StudentConsultation = Pick<
  Database["public"]["Tables"]["consultation_requests"]["Row"],
  | "id"
  | "student_name"
  | "course"
  | "department"
  | "submitted_at"
  | "status"
  | "consultation_date"
  | "slot_start"
  | "slot_end"
>;

const STATUS_TONE: Record<ConsultationLifecycleState, string> = {
  upcoming: "bg-blue-50 text-blue-700 ring-blue-200",
  in_progress: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  counselor_assigned: "bg-blue-50 text-blue-700 ring-blue-200",
  assignment_pending: "bg-amber-50 text-amber-700 ring-amber-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  outcome_required: "bg-amber-50 text-amber-700 ring-amber-200",
  expired_request: "bg-slate-100 text-slate-600 ring-slate-200",
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  no_show: "bg-rose-50 text-rose-700 ring-rose-200",
  cancelled: "bg-slate-100 text-slate-600 ring-slate-200",
};

function ProgressRing({ value }: { value: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.min(100, Math.max(0, value));
  const filled = (clamped / 100) * circumference;

  return (
    <div className="relative grid size-28 shrink-0 place-items-center">
      <svg viewBox="0 0 112 112" className="size-28 -rotate-90" aria-hidden="true">
        <defs>
          <linearGradient id="profile-ring" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#60A5FA" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth="9"
        />
        <circle
          cx="56"
          cy="56"
          r={radius}
          fill="none"
          stroke="url(#profile-ring)"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference - filled}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-content-center text-center">
        <span className="text-2xl font-extrabold tabular-nums tracking-tight text-[#0B1F3A]">
          {clamped}%
        </span>
        <span className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-slate-400">
          Complete
        </span>
      </div>
    </div>
  );
}

function StudentConsultationCard({
  consultation,
  now,
}: {
  consultation: StudentConsultation;
  now: Date;
}) {
  const schedule = getConsultationScheduleDisplay({
    consultationDate: consultation.consultation_date,
    slotStart: consultation.slot_start,
    slotEnd: consultation.slot_end,
  });
  const lifecycleState = getConsultationLifecycleState(
    {
      status: consultation.status,
      consultationDate: consultation.consultation_date,
      slotStart: consultation.slot_start,
      slotEnd: consultation.slot_end,
    },
    now,
  );
  const isLegacy = schedule.kind === "legacy";

  return (
    <article className="group rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-[0_1px_3px_rgb(15_23_42/0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_12px_28px_-12px_rgb(15_23_42/0.22)] motion-reduce:transform-none motion-reduce:transition-none">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-base font-bold text-[#0B1F3A]">
            {consultation.student_name}
          </h4>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.8rem] text-slate-500">
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
              {consultation.course}
            </span>
            <span aria-hidden="true">&middot;</span>
            <span className="truncate">{consultation.department}</span>
          </div>
        </div>
        <span
          className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wide ring-1 ring-inset ${STATUS_TONE[lifecycleState]}`}
        >
          {isLegacy && lifecycleState === "pending"
            ? "Legacy request"
            : getStudentConsultationLifecycleLabel(lifecycleState)}
        </span>
      </div>

      {isLegacy ? (
        <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-[#0B1F3A]">
            {schedule.label}
          </p>
          <p className="mt-1 text-[0.8rem] text-slate-500">
            Create a new consultation to reserve an available date and time slot.
          </p>
        </div>
      ) : (
        <dl className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-blue-100 bg-blue-50/60 p-4 sm:grid-cols-2">
          <div>
            <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
              Consultation date
            </dt>
            <dd className="mt-1 flex items-center gap-2 text-sm font-bold text-[#0B1F3A]">
              <CalendarDays size={15} className="shrink-0 text-[#1D4ED8]" />
              {schedule.dateLabel}
            </dd>
          </div>
          <div>
            <dt className="text-[0.65rem] font-extrabold uppercase tracking-[0.08em] text-slate-500">
              Booked time
            </dt>
            <dd className="mt-1 flex items-center gap-2 text-sm font-bold tabular-nums text-[#0B1F3A]">
              <Clock size={15} className="shrink-0 text-[#1D4ED8]" />
              {schedule.timeLabel}
            </dd>
          </div>
        </dl>
      )}

      <p className="mt-3 text-[0.7rem] text-slate-400">
        Requested{" "}
        <time dateTime={consultation.submitted_at}>
          {new Intl.DateTimeFormat("en", {
            dateStyle: "medium",
            timeStyle: "short",
          }).format(new Date(consultation.submitted_at))}
        </time>
      </p>
    </article>
  );
}

export default async function StudentDashboardPage() {
  const { supabase, user, profile } = await requireStudent();
  const now = new Date();
  const [consultationResult, profileResult, completionResult] =
    await Promise.all([
      supabase
        .from(STUDENT_CONSULTATION_LIST_QUERY.table)
        .select(STUDENT_CONSULTATION_LIST_QUERY.columns)
        .eq(STUDENT_CONSULTATION_LIST_QUERY.ownerColumn, user.id)
        .order(STUDENT_CONSULTATION_LIST_QUERY.orderColumn, {
          ascending: STUDENT_CONSULTATION_LIST_QUERY.ascending,
        }),
      supabase
        .from("student_profiles")
        .select("student_id")
        .eq("student_id", user.id)
        .maybeSingle(),
      supabase
        .from("student_profile_completion")
        .select(
          "student_id, profile_status, academic_section_complete, preferences_section_complete, test_scores_section_started, achievements_section_started, essential_fields_completed, essential_fields_total, overall_completion_percentage, ready_for_counseling",
        )
        .eq("student_id", user.id)
        .maybeSingle(),
    ]);
  const consultations = consultationResult.data;
  const upcomingConsultations = consultations
    ?.filter((consultation) => {
      const state = getConsultationLifecycleState(
        {
          status: consultation.status,
          consultationDate: consultation.consultation_date,
          slotStart: consultation.slot_start,
          slotEnd: consultation.slot_end,
        },
        now,
      );
      return getConsultationPresentationGroup(state) === "upcoming";
    })
    .sort((left, right) => {
      const dateOrder = (left.consultation_date ?? "").localeCompare(
        right.consultation_date ?? "",
      );
      if (dateOrder !== 0) return dateOrder;

      const startOrder = (left.slot_start ?? "").localeCompare(
        right.slot_start ?? "",
      );
      return startOrder !== 0 ? startOrder : left.id.localeCompare(right.id);
    });
  const pastConsultations = consultations?.filter((consultation) => {
    const state = getConsultationLifecycleState(
      {
        status: consultation.status,
        consultationDate: consultation.consultation_date,
        slotStart: consultation.slot_start,
        slotEnd: consultation.slot_end,
      },
      now,
    );
    return getConsultationPresentationGroup(state) !== "upcoming";
  });
  const hasCompletedConsultation = pastConsultations?.some(
    (consultation) =>
      consultation.status === "completed" &&
      consultation.consultation_date !== null &&
      consultation.slot_start !== null &&
      consultation.slot_end !== null,
  );
  const profileCompletion = mapProfileCompletion(
    completionResult.data,
    Boolean(profileResult.data),
  );
  const profileUnavailable = Boolean(
    profileResult.error || completionResult.error,
  );
  const firstName = (profile.full_name ?? "student").split(" ")[0];

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#1D4ED8]">
            Student dashboard
          </span>
          <h1 className="mt-2 text-[#0B1F3A]">Hello, {firstName}</h1>
          <p className="mt-2 max-w-xl text-slate-500">
            Track confirmed appointments and their final outcomes.
          </p>
        </div>
        <Link
          href="/student/consultation"
          className="inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#1D4ED8] px-5 text-sm font-bold shadow-[0_8px_20px_-8px_rgb(29_78_216/0.8)] transition-all hover:-translate-y-0.5 hover:bg-[#1E40AF] motion-reduce:transform-none"
          style={{ color: 'white' }}
        >
          <CalendarPlus size={17} style={{ color: 'white' }} />
          New consultation
        </Link>
      </header>

      <section
        aria-labelledby="profile-progress-heading"
        className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]"
      >
        {profileUnavailable ? (
          <div
            className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800"
            role="alert"
          >
            <h2
              id="profile-progress-heading"
              className="flex items-center gap-2 text-rose-900"
            >
              <AlertCircle size={19} /> Profile progress unavailable
            </h2>
            <p className="mt-2 text-sm text-rose-700">
              Please refresh the page to try again.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-6 rounded-2xl border border-[#E2E8F0] bg-white p-6 shadow-[0_1px_3px_rgb(15_23_42/0.06)] sm:flex-row sm:items-start sm:gap-7">
            <ProgressRing value={profileCompletion.percentage} />

            <div className="flex min-w-0 flex-1 flex-col">
              <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[#1D4ED8]">
                Counseling profile
              </span>
              <h2 id="profile-progress-heading" className="mt-1.5">
                {profileCompletion.title}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                {profileCompletion.description}
              </p>

              {profileCompletion.hints.length > 0 && (
                <ul className="mt-4 flex flex-col gap-2">
                  {profileCompletion.hints.slice(0, 3).map((hint) => (
                    <li
                      key={hint}
                      className="flex items-start gap-2 text-[0.83rem] text-slate-600"
                    >
                      <CheckCircle2
                        size={15}
                        className="mt-0.5 shrink-0 text-emerald-500"
                      />
                      <span>{hint}</span>
                    </li>
                  ))}
                </ul>
              )}

              <Link
                href="/student/profile"
                className="group mt-5 inline-flex h-10 w-fit items-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 text-sm font-bold text-[#1D4ED8] transition-colors hover:bg-[#1D4ED8] hover:text-white"
              >
                {profileCompletion.ctaLabel}
                <ArrowRight
                  size={16}
                  className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                />
              </Link>
            </div>
          </div>
        )}

        <div className="group/roadmap relative flex flex-col overflow-hidden rounded-3xl bg-[#0B1F3A] p-8 text-white shadow-[0_20px_40px_-15px_rgba(11,31,58,0.5)] transition-all duration-500 hover:-translate-y-1 hover:shadow-[0_25px_50px_-12px_rgba(29,78,216,0.3)] sm:p-10 border border-white/10">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-24 size-80 rounded-full bg-blue-600/30 blur-[100px] transition-all duration-700 group-hover/roadmap:bg-blue-500/40"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-24 -left-24 size-80 rounded-full bg-[#1D4ED8]/20 blur-[100px] transition-all duration-700 group-hover/roadmap:bg-[#1D4ED8]/30"
          />

          <div className="relative z-10 flex flex-1 flex-col h-full">
            <div className="flex w-fit items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[0.65rem] font-bold uppercase tracking-[0.15em] text-blue-200 backdrop-blur-md shadow-sm">
              <Sparkles size={14} className="text-blue-400" />
              <span>Powered by Gemini AI</span>
            </div>
            
            <h2 className="mt-6 text-3xl font-bold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-white to-blue-100">
              K-GEO Global Journey
            </h2>
            
            <p className="mt-3 text-sm leading-relaxed text-blue-100/80 sm:text-base max-w-md font-medium">
              Discover best-fit university programmes classified into <span className="text-white font-semibold">Safe, Match, and Reach</span>. Get your personalized fit scores and actionable steps to achieve your goals.
            </p>
            
            <div className="mt-8">
              <Link
                href="/student/pr/roadmap"
                className="group/btn inline-flex h-12 w-fit items-center justify-center gap-3 rounded-xl bg-white px-7 text-sm font-bold text-[#0B1F3A] shadow-[0_0_20px_rgba(255,255,255,0.15)] transition-all duration-300 hover:scale-[1.02] hover:bg-blue-50 hover:shadow-[0_0_30px_rgba(255,255,255,0.25)] focus:outline-none focus:ring-2 focus:ring-white/50 focus:ring-offset-2 focus:ring-offset-[#0B1F3A]"
              >
                Generate Roadmap
                <ArrowRight
                  size={18}
                  className="text-[#1D4ED8] transition-transform duration-300 group-hover/btn:translate-x-1"
                />
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Suspense fallback={<StudentUniversityApplicationsSkeleton />}>
        <StudentUniversityApplicationsSection />
      </Suspense>

      <section aria-labelledby="my-consultations-heading" id="my-consultations">
        <div className="mb-5">
          <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[#1D4ED8]">
            Consultations
          </span>
          <h2 id="my-consultations-heading" className="mt-1.5">
            My consultations
          </h2>
        </div>

        {consultationResult.error ? (
          <div
            className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-rose-800"
            role="alert"
          >
            <h3 className="flex items-center gap-2 text-rose-900">
              <AlertCircle size={18} /> Requests are temporarily unavailable
            </h3>
            <p className="mt-2 text-sm text-rose-700">
              Please refresh the page and try again.
            </p>
          </div>
        ) : consultations?.length ? (
          <div className="flex flex-col gap-10">
            <section aria-labelledby="upcoming-consultations-heading">
              <div className="flex items-center gap-2.5">
                <CalendarDays size={17} className="text-[#1D4ED8]" />
                <h3 id="upcoming-consultations-heading">Upcoming Consultations</h3>
                <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[0.7rem] font-bold tabular-nums text-[#1D4ED8]">
                  {upcomingConsultations?.length ?? 0}
                </span>
              </div>
              <p className="mt-1.5 text-[0.83rem] text-slate-500">
                Confirmed appointments remain here until their end time.
              </p>
              {upcomingConsultations?.length ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {upcomingConsultations.map((consultation) => (
                    <StudentConsultationCard
                      consultation={consultation}
                      key={consultation.id}
                      now={now}
                    />
                  ))}
                </div>
              ) : (
                <p
                  className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500"
                  role="status"
                >
                  No upcoming consultations.
                </p>
              )}
            </section>

            <section aria-labelledby="past-consultations-heading">
              <div className="flex items-center gap-2.5">
                <History size={17} className="text-slate-400" />
                <h3 id="past-consultations-heading">Consultation History</h3>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[0.7rem] font-bold tabular-nums text-slate-600">
                  {pastConsultations?.length ?? 0}
                </span>
              </div>
              <p className="mt-1.5 text-[0.83rem] text-slate-500">
                Completed, no-show, cancelled and elapsed appointments are
                retained here.
              </p>
              {hasCompletedConsultation && (
                <div className="mt-4">
                  <ContinueWithKgeoForm />
                </div>
              )}
              {pastConsultations?.length ? (
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  {pastConsultations.map((consultation) => (
                    <StudentConsultationCard
                      consultation={consultation}
                      key={consultation.id}
                      now={now}
                    />
                  ))}
                </div>
              ) : (
                <p
                  className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500"
                  role="status"
                >
                  No past consultations.
                </p>
              )}
            </section>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center">
            <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-[#1D4ED8]">
              <CalendarDays size={26} />
            </div>
            <h3 className="mt-4">No consultations yet</h3>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
              Choose a weekday and reserve an available consultation time.
            </p>
            <Link
              href="/student/consultation"
              className="mt-6 inline-flex h-11 items-center gap-2 rounded-xl bg-[#1D4ED8] px-5 text-sm font-bold shadow-[0_8px_20px_-8px_rgb(29_78_216/0.8)] transition-all hover:-translate-y-0.5 hover:bg-[#1E40AF] motion-reduce:transform-none"
              style={{ color: 'white' }}
            >
              <CalendarPlus size={17} style={{ color: 'white' }} />
              Request a consultation
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
