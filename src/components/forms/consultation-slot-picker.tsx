"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { FieldError } from "@/components/forms/field-error";
import {
  availabilityReducer,
  initialAvailabilityState,
} from "@/lib/consultations/availability-state";
import {
  formatConsultationTimeRange,
  getAvailabilityStatusLabel,
  getBookingDateIssueMessage,
  isSlotSelectable,
  normalizeAvailabilityRows,
} from "@/lib/consultations/booking";
import { createClient } from "@/lib/supabase/client";

type ConsultationSlotPickerProps = {
  dateErrors?: string[];
  feedbackSignal: object;
  maximumDate: string;
  minimumDate: string;
  refreshSignal: object | null;
  slotErrors?: string[];
};

export function ConsultationSlotPicker({
  dateErrors,
  feedbackSignal,
  maximumDate,
  minimumDate,
  refreshSignal,
  slotErrors,
}: ConsultationSlotPickerProps) {
  const supabase = useMemo(() => createClient(), []);
  const [state, dispatch] = useReducer(
    availabilityReducer,
    initialAvailabilityState,
  );
  const [dateErrorsDismissedFor, setDateErrorsDismissedFor] =
    useState<object | null>(null);
  const [slotErrorsDismissedFor, setSlotErrorsDismissedFor] =
    useState<object | null>(null);
  const refreshIsPending = Boolean(
    refreshSignal && refreshSignal !== state.handledRefreshSignal,
  );

  useEffect(() => {
    if (refreshSignal && refreshIsPending) {
      dispatch({ type: "refresh_requested", signal: refreshSignal });
    }
  }, [refreshIsPending, refreshSignal]);

  useEffect(() => {
    if (state.phase !== "loading" || !state.selectedDate) return;

    const requestId = state.requestId;
    const selectedDate = state.selectedDate;
    let isCurrentRequest = true;

    async function loadAvailability() {
      try {
        const { data, error } = await supabase.rpc(
          "get_consultation_slot_availability",
          { p_date: selectedDate },
        );

        if (!isCurrentRequest) return;
        const slots = error ? null : normalizeAvailabilityRows(data);
        if (!slots) {
          dispatch({ type: "request_failed", requestId });
          return;
        }

        dispatch({ type: "request_succeeded", requestId, slots });
      } catch {
        if (isCurrentRequest) {
          dispatch({ type: "request_failed", requestId });
        }
      }
    }

    void loadAvailability();
    return () => {
      isCurrentRequest = false;
    };
  }, [state.phase, state.requestId, state.selectedDate, supabase]);

  const localDateErrors = state.dateIssue
    ? [getBookingDateIssueMessage(state.dateIssue)]
    : undefined;
  const visibleDateErrors =
    dateErrorsDismissedFor === feedbackSignal
      ? localDateErrors
      : (dateErrors ?? localDateErrors);
  const visibleSlotErrors =
    slotErrorsDismissedFor === feedbackSignal ? undefined : slotErrors;
  const availableCount = state.slots.filter((slot) =>
    isSlotSelectable(slot.availabilityStatus),
  ).length;

  return (
    <section className="grid gap-4" aria-labelledby="booking-time-heading">
      <div className="field">
        <label htmlFor="consultationDate">Consultation Date</label>
        <input
          aria-describedby="consultationDate-hint consultationDate-error"
          aria-invalid={Boolean(visibleDateErrors?.length)}
          id="consultationDate"
          max={maximumDate}
          min={minimumDate}
          name="consultationDate"
          onChange={(event) => {
            setDateErrorsDismissedFor(feedbackSignal);
            setSlotErrorsDismissedFor(feedbackSignal);
            dispatch({
              type: "date_changed",
              date: event.currentTarget.value,
              businessToday: minimumDate,
            });
          }}
          required
          type="date"
          value={state.selectedDate}
        />
        <span className="field-hint" id="consultationDate-hint">
          Choose a Monday-to-Friday date from today through the next six
          calendar days. Dates and times use Asia/Kolkata business time.
        </span>
        <FieldError
          id="consultationDate-error"
          messages={visibleDateErrors}
        />
      </div>

      <fieldset
        aria-describedby="slotStart-hint slotStart-error"
        aria-invalid={Boolean(visibleSlotErrors?.length)}
        className="m-0 grid min-w-0 gap-3 rounded-[0.8rem] border border-[var(--line)] p-4 [&_legend]:px-[0.35rem] [&_legend]:py-0 [&_legend]:text-[0.88rem] [&_legend]:font-bold"
      >
        <legend id="booking-time-heading">Consultation Time Slot</legend>
        <span className="field-hint" id="slotStart-hint">
          Select one available 30-minute session.
        </span>

        {state.phase === "idle" && !state.dateIssue && (
          <p className="muted">
            Choose a valid date to see genuinely available slots.
          </p>
        )}
        {state.phase === "loading" && (
          <p className="muted" role="status">
            Loading available time slots...
          </p>
        )}
        {state.phase === "error" && (
          <div className="rounded-xl bg-[var(--bad-bg)] p-4 text-[var(--danger)] [&_p]:mt-0" role="alert">
            <p>Time slots could not be loaded. Please try again.</p>
            <button
              className="button button-secondary button-small"
              onClick={() => dispatch({ type: "retry" })}
              type="button"
            >
              Retry availability
            </button>
          </div>
        )}
        {state.phase === "ready" && (
          <>
            <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-[0.65rem] max-[760px]:grid-cols-[1fr]">
              {state.slots.filter((slot) =>
                isSlotSelectable(slot.availabilityStatus),
              ).map((slot) => {
                const selectable = isSlotSelectable(
                  slot.availabilityStatus,
                );
                const statusLabel = getAvailabilityStatusLabel(
                  slot.availabilityStatus,
                );

                return (
                  <label
                    className="grid cursor-pointer grid-cols-[auto_1fr] items-center gap-x-[0.65rem] gap-y-[0.2rem] rounded-xl border border-[var(--line)] bg-[var(--white)] p-[0.8rem] has-[input:checked]:border-[var(--green)] has-[input:checked]:shadow-[var(--focus-ring)] has-[input:disabled]:cursor-not-allowed has-[input:disabled]:bg-[var(--surface-3)] has-[input:disabled]:text-[var(--muted)] [&_input]:size-[1.1rem] [&_input]:[grid-row:1/span_2] [&_input]:accent-[var(--green)]"
                    data-status={slot.availabilityStatus}
                    key={slot.slotStart}
                  >
                    <input
                      checked={
                        !refreshIsPending &&
                        state.selectedSlot === slot.slotStart
                      }
                      disabled={refreshIsPending || !selectable}
                      name="slotStart"
                      onChange={() => {
                        setSlotErrorsDismissedFor(feedbackSignal);
                        dispatch({
                          type: "slot_selected",
                          slotStart: slot.slotStart,
                        });
                      }}
                      required
                      type="radio"
                      value={slot.slotStart}
                    />
                    <span className="slot-time">
                      {formatConsultationTimeRange(
                        slot.slotStart,
                        slot.slotEnd,
                      )}
                    </span>
                    <span
                      className={`text-[0.78rem] ${
                        selectable
                          ? "font-bold text-[var(--green-dark)]"
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {statusLabel}
                    </span>
                  </label>
                );
              })}
            </div>
            {availableCount === 0 && (
              <p className="muted" role="status">
                No time slots remain available for this date. Choose another
                weekday.
              </p>
            )}
          </>
        )}

        <FieldError id="slotStart-error" messages={visibleSlotErrors} />
      </fieldset>
    </section>
  );
}
