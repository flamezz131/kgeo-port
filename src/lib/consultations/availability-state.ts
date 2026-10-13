import {
  getBookingDateIssue,
  isSlotSelectable,
  type BookingDateIssue,
  type ConsultationSlotStart,
  type SlotAvailability,
} from "@/lib/consultations/booking";

export type AvailabilityState = {
  selectedDate: string;
  selectedSlot: ConsultationSlotStart | "";
  requestId: number;
  phase: "idle" | "loading" | "ready" | "error";
  dateIssue: BookingDateIssue | null;
  handledRefreshSignal: object | null;
  slots: SlotAvailability[];
};

export type AvailabilityAction =
  | { type: "date_changed"; date: string; businessToday: string }
  | { type: "request_succeeded"; requestId: number; slots: SlotAvailability[] }
  | { type: "request_failed"; requestId: number }
  | { type: "slot_selected"; slotStart: ConsultationSlotStart }
  | { type: "refresh_requested"; signal: object }
  | { type: "retry" };

export const initialAvailabilityState: AvailabilityState = {
  selectedDate: "",
  selectedSlot: "",
  requestId: 0,
  phase: "idle",
  dateIssue: null,
  handledRefreshSignal: null,
  slots: [],
};

export function availabilityReducer(
  state: AvailabilityState,
  action: AvailabilityAction,
): AvailabilityState {
  if (action.type === "date_changed") {
    const dateIssue = action.date
      ? getBookingDateIssue(action.date, action.businessToday)
      : null;

    return {
      selectedDate: action.date,
      selectedSlot: "",
      requestId: state.requestId + 1,
      phase: action.date && !dateIssue ? "loading" : "idle",
      dateIssue,
      handledRefreshSignal: state.handledRefreshSignal,
      slots: [],
    };
  }

  if (action.type === "request_succeeded") {
    if (action.requestId !== state.requestId) return state;
    return { ...state, phase: "ready", slots: action.slots };
  }

  if (action.type === "request_failed") {
    if (action.requestId !== state.requestId) return state;
    return { ...state, phase: "error", selectedSlot: "", slots: [] };
  }

  if (action.type === "slot_selected") {
    const selected = state.slots.find(
      (slot) => slot.slotStart === action.slotStart,
    );
    if (!selected || !isSlotSelectable(selected.availabilityStatus)) return state;
    return { ...state, selectedSlot: action.slotStart };
  }

  if (action.type === "refresh_requested") {
    if (action.signal === state.handledRefreshSignal) return state;
    if (!state.selectedDate || state.dateIssue) {
      return { ...state, handledRefreshSignal: action.signal };
    }

    return {
      ...state,
      selectedSlot: "",
      requestId: state.requestId + 1,
      phase: "loading",
      handledRefreshSignal: action.signal,
      slots: [],
    };
  }

  if (!state.selectedDate || state.dateIssue) return state;
  return {
    ...state,
    selectedSlot: "",
    requestId: state.requestId + 1,
    phase: "loading",
    slots: [],
  };
}
