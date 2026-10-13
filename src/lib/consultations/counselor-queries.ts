export const COUNSELOR_DASHBOARD_BOOKING_COLUMNS =
  "id, student_id, student_name, roll_number, course, department, consultation_date, slot_start, slot_end, status, assigned_counselor_id" as const;

export const COUNSELOR_SCHEDULE_DETAIL_COLUMNS =
  "id, student_id, student_name, roll_number, college_email, personal_email, mobile_number, course, department, higher_studies_interest, consultation_date, slot_start, slot_end, status, submitted_at, assigned_counselor_id" as const;

export const COUNSELOR_ASSIGNMENT_QUEUE_COLUMNS =
  "id, student_id, student_name, roll_number, course, department, consultation_date, slot_start, slot_end, status, submitted_at, assigned_counselor_id" as const;

export const COUNSELOR_LEGACY_COLUMNS =
  "id, student_id, student_name, roll_number, course, department, consultation_date, slot_start, slot_end, status, submitted_at" as const;

export const COUNSELOR_LEGACY_QUERY = {
  table: "consultation_requests",
  columns: COUNSELOR_LEGACY_COLUMNS,
  statusColumn: "status",
  statusValue: "waiting_for_assignment",
  nullDateColumn: "consultation_date",
  nullStartColumn: "slot_start",
  nullEndColumn: "slot_end",
  submittedOrderColumn: "submitted_at",
  tieBreakOrderColumn: "id",
  limit: 10,
} as const;

export const COUNSELOR_SCHEDULE_QUERY = {
  table: "consultation_requests",
  columns: COUNSELOR_SCHEDULE_DETAIL_COLUMNS,
  dateColumn: "consultation_date",
  statusColumn: "status",
  orderColumn: "slot_start",
  ascending: true,
} as const;

export const COUNSELOR_DASHBOARD_QUERY = {
  table: "consultation_requests",
  columns: COUNSELOR_DASHBOARD_BOOKING_COLUMNS,
  dateColumn: "consultation_date",
  statusColumn: "status",
  dateOrderColumn: "consultation_date",
  slotOrderColumn: "slot_start",
  ascending: true,
} as const;

export const COUNSELOR_ASSIGNMENT_QUEUE_QUERY = {
  table: "consultation_requests",
  columns: COUNSELOR_ASSIGNMENT_QUEUE_COLUMNS,
  statusColumn: "status",
  statusValue: "waiting_for_assignment",
  ownerColumn: "assigned_counselor_id",
  submittedOrderColumn: "submitted_at",
  tieBreakOrderColumn: "id",
  limit: 10,
} as const;

export {
  getUpcomingScheduledFilter as getUpcomingConsultationsFilter,
} from "@/lib/consultations/lifecycle";
