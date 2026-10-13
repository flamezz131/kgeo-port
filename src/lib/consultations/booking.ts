import type { StudentConsultationAvailabilityStatus } from "@/types";

export const BUSINESS_TIME_ZONE = "Asia/Kolkata";
export const CONSULTATION_BOOKING_HORIZON_DAYS = 7;

export const CONSULTATION_SLOTS = [
  { start: "09:00", end: "09:30" },
  { start: "09:30", end: "10:00" },
  { start: "10:00", end: "10:30" },
  { start: "10:30", end: "11:00" },
  { start: "11:00", end: "11:30" },
  { start: "11:30", end: "12:00" },
  { start: "12:00", end: "12:30" },
  { start: "12:30", end: "13:00" },
  { start: "13:00", end: "13:30" },
  { start: "13:30", end: "14:00" },
  { start: "14:00", end: "14:30" },
  { start: "14:30", end: "15:00" },
  { start: "15:00", end: "15:30" },
  { start: "15:30", end: "16:00" },
  { start: "16:00", end: "16:30" },
  { start: "16:30", end: "17:00" },
] as const;

export type ConsultationSlotStart = (typeof CONSULTATION_SLOTS)[number]["start"];

export type SlotAvailability = {
  slotStart: ConsultationSlotStart;
  slotEnd: string;
  availabilityStatus: StudentConsultationAvailabilityStatus;
};

export type BookingDateIssue =
  | "format"
  | "invalid_date"
  | "past"
  | "outside_horizon"
  | "weekend";

function getDateParts(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return { date, year, month, day };
}

export function isStrictCalendarDate(value: string) {
  return getDateParts(value) !== null;
}

export function isWeekendDate(value: string) {
  const parts = getDateParts(value);
  if (!parts) return false;
  const weekday = parts.date.getUTCDay();
  return weekday === 0 || weekday === 6;
}

export function addCalendarDays(value: string, dayOffset: number) {
  const parts = getDateParts(value);
  if (!parts || !Number.isInteger(dayOffset)) return null;

  parts.date.setUTCDate(parts.date.getUTCDate() + dayOffset);
  return parts.date.toISOString().slice(0, 10);
}

function getFormattedPart(
  parts: Intl.DateTimeFormatPart[],
  type: Intl.DateTimeFormatPart["type"],
) {
  return parts.find((part) => part.type === type)?.value ?? "";
}

export function getAsiaKolkataBusinessDateTime(now: Date) {
  if (Number.isNaN(now.getTime())) {
    throw new Error("A valid timestamp is required.");
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const year = getFormattedPart(parts, "year");
  const month = getFormattedPart(parts, "month");
  const day = getFormattedPart(parts, "day");
  const hour = getFormattedPart(parts, "hour");
  const minute = getFormattedPart(parts, "minute");

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

export function getBookingDateIssue(
  value: string,
  businessToday: string,
): BookingDateIssue | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return "format";

  const parts = getDateParts(value);
  if (!parts) return "invalid_date";
  if (value < businessToday) return "past";
  const maximumDate = addCalendarDays(
    businessToday,
    CONSULTATION_BOOKING_HORIZON_DAYS - 1,
  );
  if (!maximumDate || value > maximumDate) return "outside_horizon";

  const weekday = parts.date.getUTCDay();
  if (weekday === 0 || weekday === 6) return "weekend";

  return null;
}

export function getBookingDateIssueMessage(issue: BookingDateIssue) {
  const messages: Record<BookingDateIssue, string> = {
    format: "Choose a date using the YYYY-MM-DD format.",
    invalid_date: "Choose a real calendar date.",
    past: "Consultation date cannot be in the past.",
    outside_horizon:
      "Choose a consultation date within the next seven calendar dates.",
    weekend: "Consultations are available Monday through Friday.",
  };

  return messages[issue];
}

export function isConsultationSlotStart(
  value: string,
): value is ConsultationSlotStart {
  return CONSULTATION_SLOTS.some((slot) => slot.start === value);
}

export function isSlotExpired(
  consultationDate: string,
  slotStart: ConsultationSlotStart,
  now: Date,
) {
  const business = getAsiaKolkataBusinessDateTime(now);
  return consultationDate === business.date && slotStart <= business.time;
}

export function isSlotAvailabilityStatus(
  value: unknown,
): value is StudentConsultationAvailabilityStatus {
  return (
    value === "available" || value === "unavailable" || value === "expired"
  );
}

export function isSlotSelectable(status: StudentConsultationAvailabilityStatus) {
  return status === "available";
}

export function getAvailabilityStatusLabel(
  status: StudentConsultationAvailabilityStatus,
) {
  const labels: Record<StudentConsultationAvailabilityStatus, string> = {
    available: "Available",
    unavailable: "Unavailable",
    expired: "Expired",
  };

  return labels[status];
}

export function normalizeDatabaseTime(value: unknown) {
  if (typeof value !== "string") return null;

  const match = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/.exec(value);
  if (!match || (match[3] !== undefined && match[3] !== "00")) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;

  return `${match[1]}:${match[2]}`;
}

function readRpcField(row: object, field: string) {
  try {
    return Reflect.get(row, field);
  } catch {
    return undefined;
  }
}

export function normalizeAvailabilityRows(
  rows: unknown,
): SlotAvailability[] | null {
  if (!Array.isArray(rows) || rows.length !== CONSULTATION_SLOTS.length) {
    return null;
  }

  const normalized: SlotAvailability[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (typeof row !== "object" || row === null) return null;

    const slotStart = normalizeDatabaseTime(readRpcField(row, "slot_start"));
    const slotEnd = normalizeDatabaseTime(readRpcField(row, "slot_end"));
    const availabilityStatus = readRpcField(row, "availability_status");

    if (
      !slotStart ||
      !slotEnd ||
      !isConsultationSlotStart(slotStart) ||
      !isSlotAvailabilityStatus(availabilityStatus) ||
      seen.has(slotStart)
    ) {
      return null;
    }

    const fixedSlot = CONSULTATION_SLOTS.find(
      (slot) => slot.start === slotStart,
    );
    if (!fixedSlot || fixedSlot.end !== slotEnd) return null;

    seen.add(slotStart);
    normalized.push({
      slotStart,
      slotEnd,
      availabilityStatus,
    });
  }

  return normalized.sort(
    (left, right) => left.slotStart.localeCompare(right.slotStart),
  );
}

function formatTime(time: string) {
  const normalized = normalizeDatabaseTime(time);
  if (!normalized) return time;

  const [hourText, minute] = normalized.split(":");
  const hour = Number(hourText);
  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minute} ${suffix}`;
}

export function formatConsultationTimeRange(start: string, end: string) {
  return `${formatTime(start)} \u2013 ${formatTime(end)}`;
}

export function formatConsultationDate(value: string) {
  const parts = getDateParts(value);
  if (!parts) return value;

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(parts.date);
}

export const LEGACY_CONSULTATION_MESSAGE =
  "Legacy consultation request \u2014 no appointment slot was booked.";

export function getConsultationScheduleDisplay(schedule: {
  consultationDate: string | null;
  slotStart: string | null;
  slotEnd: string | null;
}) {
  if (!schedule.consultationDate || !schedule.slotStart || !schedule.slotEnd) {
    return {
      kind: "legacy" as const,
      label: LEGACY_CONSULTATION_MESSAGE,
    };
  }

  return {
    kind: "scheduled" as const,
    dateLabel: formatConsultationDate(schedule.consultationDate),
    timeLabel: formatConsultationTimeRange(schedule.slotStart, schedule.slotEnd),
  };
}
