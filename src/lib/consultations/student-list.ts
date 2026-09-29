export const STUDENT_CONSULTATION_LIST_QUERY = {
  table: "consultation_requests",
  columns:
    "id, student_name, course, department, consultation_date, slot_start, slot_end, submitted_at, status",
  ownerColumn: "student_id",
  orderColumn: "submitted_at",
  ascending: false,
} as const;
