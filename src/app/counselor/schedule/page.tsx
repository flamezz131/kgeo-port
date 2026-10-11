import type { Metadata } from "next";
import Link from "next/link";
import {
  ConsultationNextWorkLinks,
  ConsultationOutcomeControls,
} from "@/components/counselor/consultation-outcome-controls";
import { CounselorSlotBlocks } from "@/components/counselor/counselor-slot-blocks";
import {
  addCalendarDays,
  BUSINESS_TIME_ZONE,
  formatConsultationDate,
  formatConsultationTimeRange,
  getAsiaKolkataBusinessDateTime,
  isStrictCalendarDate,
} from "@/lib/consultations/booking";
import {
  buildCounselorDaySchedule,
  getCancelledBookings,
  resolveCounselorScheduleDate,
} from "@/lib/consultations/counselor-schedule";
import {
  getConsultationLifecycleLabel,
  type ConsultationLifecycleState,
} from "@/lib/consultations/lifecycle";
import {
  STUDENT_360_BASE_PATH,
  isStudent360StudentId,
} from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";
import type { HigherStudiesInterest } from "@/types";

export const metadata: Metadata = { title: "Daily counselor schedule" };

const INTEREST_LABELS: Record<HigherStudiesInterest, string> = {
  interested: "Interested",
  exploring: "Exploring",
  not_interested: "Not Interested",
};

type CounselorSchedulePageProps = {
  searchParams: Promise<{ date?: string | string[] }>;
};

function formatSubmittedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unavailable";

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: BUSINESS_TIME_ZONE,
  }).format(date);
}

function getSlotStateLabel(
  state: "available" | "expired" | ConsultationLifecycleState,
) {
  if (state === "available") return "Available";
  if (state === "expired") return "Expired";
  return getConsultationLifecycleLabel(state);
}

function CounselorScheduleUnavailable() {
  return (
    <section className="counselor-page">
      <h1>Schedule temporarily unavailable</h1>
      <div className="panel" role="alert">
        <p>Please refresh the page and try again.</p>
      </div>
    </section>
  );
}

export default async function CounselorSchedulePage({
  searchParams,
}: CounselorSchedulePageProps) {
  const { supabase } = await requireCounselor();
  const now = new Date();
  const businessToday = getAsiaKolkataBusinessDateTime(now).date;
  const requestedDate = resolveCounselorScheduleDate(
    (await searchParams).date,
    businessToday,
  );
  const selectedDate = isStrictCalendarDate(requestedDate)
    ? requestedDate
    : businessToday;
  const selectedPeriod =
    selectedDate < businessToday
      ? "Past / Outcome Required"
      : selectedDate === businessToday
        ? "Current schedule"
        : "Upcoming schedule";
  const previousDate = addCalendarDays(selectedDate, -1) ?? businessToday;
  const nextDate = addCalendarDays(selectedDate, 1) ?? businessToday;
  const [scheduleResult, blockResult] = await Promise.all([
    supabase.rpc("list_my_assigned_consultations", {
      p_date_from: selectedDate,
      p_date_to: selectedDate,
      p_limit: 100,
    }),
    supabase.rpc("list_my_active_consultation_slot_blocks"),
  ]);

  if (scheduleResult.error || blockResult.error) {
    return <CounselorScheduleUnavailable />;
  }

  const scheduleRows = scheduleResult.data ?? [];
  const scheduleBookings = scheduleRows;

  const schedule = buildCounselorDaySchedule(
    selectedDate,
    scheduleBookings,
    now,
  );
  const cancelledBookings = getCancelledBookings(scheduleBookings);
  const activeRecordCount =
    schedule.kind === "weekday"
      ? schedule.slots.filter(
          (slot) => slot.booking && slot.booking.status !== "cancelled",
        ).length
      : 0;

  return (
    <section className="counselor-page">
      <header className="counselor-page-header">
        <div>
          <h1>My Consultation Schedule</h1>
          <p className="muted">
            Sixteen canonical sessions, Monday through Friday, using
            Asia/Kolkata time.
          </p>
        </div>
      </header>

      <section className="counselor-date-controls" aria-label="Schedule date controls">
        <div className="counselor-date-links">
          <Link
            className="button button-secondary button-small"
            href={`/counselor/schedule?date=${previousDate}`}
          >
            Previous Day
          </Link>
          <Link
            className="button button-secondary button-small"
            href={`/counselor/schedule?date=${businessToday}`}
          >
            Today
          </Link>
          <Link
            className="button button-secondary button-small"
            href={`/counselor/schedule?date=${nextDate}`}
          >
            Next Day
          </Link>
        </div>

        <form action="/counselor/schedule" className="counselor-date-form" method="get">
          <label htmlFor="schedule-date">Selected date</label>
          <div>
            <input
              defaultValue={selectedDate}
              id="schedule-date"
              name="date"
              required
              type="date"
            />
            <button className="button button-small" type="submit">
              View date
            </button>
          </div>
        </form>
      </section>

      <div className="counselor-schedule-heading">
        <div>
          <span className="eyebrow">{selectedPeriod}</span>
          <h2>{formatConsultationDate(selectedDate)}</h2>
        </div>
        {schedule.kind === "weekday" && (
          <span className="status">
            {activeRecordCount}{" "}
            {activeRecordCount === 1 ? "active record" : "active records"}
          </span>
        )}
      </div>

      {schedule.kind === "weekend" ? (
        <div className="counselor-empty-state counselor-weekend-state" role="status">
          <h3>No regular consultation schedule on weekends</h3>
          <p>Select a Monday-to-Friday date to view the sixteen regular slots.</p>
        </div>
      ) : (
        <>
          {activeRecordCount === 0 && (
            <div className="counselor-empty-state" role="status">
              <h3>No active consultation records for this date</h3>
              <p>
                The slot list still shows availability and any retained
                cancelled history.
              </p>
            </div>
          )}

          <div className="counselor-slot-list counselor-slot-list-detailed">
            {schedule.slots.map((slot) => (
              <article
                className={`counselor-slot counselor-slot-${slot.state}`}
                key={slot.slotStart}
              >
                <div className="counselor-slot-time">
                  <time>
                    {formatConsultationTimeRange(slot.slotStart, slot.slotEnd)}
                  </time>
                  <span className={`counselor-slot-state counselor-slot-state-${slot.state}`}>
                    {getSlotStateLabel(slot.state)}
                  </span>
                </div>

                {slot.booking && (
                  <div className="counselor-booking-details">
                    <div className="counselor-booking-heading">
                      <div>
                        <span className="card-number">
                          {slot.booking.request_number}
                        </span>
                        <h3>{slot.booking.student_name}</h3>
                      </div>
                      <span className="status">
                        {getSlotStateLabel(slot.state)}
                      </span>
                    </div>

                    <dl className="counselor-detail-grid">
                      <div>
                        <dt>Course</dt>
                        <dd>{slot.booking.course}</dd>
                      </div>
                      <div>
                        <dt>Department</dt>
                        <dd>{slot.booking.department}</dd>
                      </div>
                      <div>
                        <dt>Higher-studies interest</dt>
                        <dd>
                          {INTEREST_LABELS[slot.booking.higher_studies_interest]}
                        </dd>
                      </div>
                      <div>
                        <dt>Graduation year</dt>
                        <dd>{slot.booking.college_end_year}</dd>
                      </div>
                      <div>
                        <dt>Submitted</dt>
                        <dd>{formatSubmittedAt(slot.booking.submitted_at)}</dd>
                      </div>
                      <div>
                        <dt>Assignment</dt>
                        <dd>Assigned to you</dd>
                      </div>
                    </dl>

                    {slot.state === "outcome_required" &&
                      slot.booking.status === "scheduled" && (
                      <ConsultationOutcomeControls
                        consultationId={slot.booking.id}
                      />
                    )}

                    {(slot.booking.status === "completed" ||
                      slot.booking.status === "no_show") &&
                      slot.booking.student_id &&
                      isStudent360StudentId(slot.booking.student_id) && (
                        <ConsultationNextWorkLinks
                          studentId={slot.booking.student_id}
                        />
                      )}

                    {slot.booking.student_id &&
                      isStudent360StudentId(slot.booking.student_id) && (
                      <Link
                        className="button button-secondary button-small"
                        href={`${STUDENT_360_BASE_PATH}/${slot.booking.student_id}`}
                      >
                        View Student Profile
                      </Link>
                    )}
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {cancelledBookings.length > 0 && (
        <section
          className="counselor-legacy-section"
          aria-labelledby="cancelled-heading"
        >
          <div className="counselor-section-heading">
            <div>
              <h2 id="cancelled-heading">Cancelled consultations</h2>
            </div>
          </div>
          <div className="consultation-list">
            {cancelledBookings.map((booking) => (
              <article className="consultation-card" key={booking.id}>
                <div className="consultation-card-heading">
                  <div>
                    <span className="card-number">
                      {booking.request_number}
                    </span>
                    <h3>{booking.student_name}</h3>
                  </div>
                  <span className="status">Cancelled</span>
                </div>
                <p className="muted">
                  {formatConsultationTimeRange(
                    booking.slot_start ?? "",
                    booking.slot_end ?? "",
                  )}
                </p>
                {booking.student_id && isStudent360StudentId(booking.student_id) && (
                  <Link
                    href={`${STUDENT_360_BASE_PATH}/${booking.student_id}`}
                  >
                    View Student Profile
                  </Link>
                )}
              </article>
            ))}
          </div>
        </section>
      )}

      <CounselorSlotBlocks
        blocks={blockResult.data ?? []}
        minimumDate={businessToday}
      />
    </section>
  );
}
