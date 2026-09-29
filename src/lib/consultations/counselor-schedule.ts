import {
  CONSULTATION_SLOTS,
  getAsiaKolkataBusinessDateTime,
  isWeekendDate,
  normalizeDatabaseTime,
  type ConsultationSlotStart,
} from "@/lib/consultations/booking";
import {
  getConsultationLifecycleState,
  type ConsultationLifecycleState,
} from "@/lib/consultations/lifecycle";
import type { ConsultationStatus } from "@/types";

export type CounselorSlotBookingBase = {
  consultation_date: string | null;
  slot_start: string | null;
  slot_end: string | null;
  status: ConsultationStatus;
};

export type CounselorDaySlot<T extends CounselorSlotBookingBase> = {
  slotStart: ConsultationSlotStart;
  slotEnd: string;
  state: "available" | "expired" | ConsultationLifecycleState;
  booking: T | null;
};

export type CounselorDaySchedule<T extends CounselorSlotBookingBase> =
  | { kind: "weekend"; slots: [] }
  | { kind: "weekday"; slots: CounselorDaySlot<T>[] };

function isUnbookedSlotExpired(
  selectedDate: string,
  slotStart: ConsultationSlotStart,
  now: Date,
) {
  const business = getAsiaKolkataBusinessDateTime(now);
  if (selectedDate < business.date) return true;
  if (selectedDate > business.date) return false;
  return slotStart <= business.time;
}

export function buildCounselorDaySchedule<
  T extends CounselorSlotBookingBase,
>(
  selectedDate: string,
  bookings: readonly T[],
  now: Date,
): CounselorDaySchedule<T> {
  if (isWeekendDate(selectedDate)) return { kind: "weekend", slots: [] };

  const bookingsBySlot = new Map<ConsultationSlotStart, T>();
  for (const booking of bookings) {
    const slotStart = normalizeDatabaseTime(booking.slot_start);
    const slotEnd = normalizeDatabaseTime(booking.slot_end);
    const fixedSlot = CONSULTATION_SLOTS.find(
      (slot) => slot.start === slotStart && slot.end === slotEnd,
    );

    if (
      booking.consultation_date === selectedDate &&
      booking.status !== "cancelled" &&
      fixedSlot
    ) {
      const existing = bookingsBySlot.get(fixedSlot.start);
      if (!existing) {
        bookingsBySlot.set(fixedSlot.start, booking);
      }
    }
  }

  return {
    kind: "weekday",
    slots: CONSULTATION_SLOTS.map((slot) => {
      const booking = bookingsBySlot.get(slot.start) ?? null;
      if (booking) {
        return {
          slotStart: slot.start,
          slotEnd: slot.end,
          state: getConsultationLifecycleState(
            {
              status: booking.status,
              consultationDate: booking.consultation_date,
              slotStart: booking.slot_start,
              slotEnd: booking.slot_end,
            },
            now,
          ),
          booking,
        };
      }

      const state = isUnbookedSlotExpired(selectedDate, slot.start, now)
        ? "expired"
        : "available";
      return {
        slotStart: slot.start,
        slotEnd: slot.end,
        state,
        booking: null,
      };
    }),
  };
}

export function getLegacyUnscheduledBookings<
  T extends CounselorSlotBookingBase,
>(bookings: readonly T[]) {
  return bookings.filter(
    (booking) =>
      booking.status === "waiting_for_assignment" &&
      booking.consultation_date === null &&
      booking.slot_start === null &&
      booking.slot_end === null,
  );
}

export function getCancelledBookings<T extends CounselorSlotBookingBase>(
  bookings: readonly T[],
) {
  return bookings.filter((booking) => booking.status === "cancelled");
}

export function resolveCounselorScheduleDate(
  value: string | string[] | undefined,
  fallbackDate: string,
) {
  if (typeof value !== "string") return fallbackDate;
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fallbackDate;
}
