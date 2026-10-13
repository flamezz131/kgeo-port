import { z } from "zod";
import type { CounselorPrimaryStudent } from "@/types";

const countSchema = z.number().int().nonnegative().safe();
const rowSchema = z
  .object({
    assignment_id: z.string().uuid(),
    student_id: z.string().uuid(),
    full_name: z.string().nullable(),
    college_email: z.string().email(),
    is_active: z.boolean(),
    course: z.string().nullable(),
    department: z.string().nullable(),
    assigned_at: z.string().min(1),
    total_count: countSchema,
  })
  .strict();

export type CounselorPrimaryStudentsResult =
  | {
      status: "ready";
      items: CounselorPrimaryStudent[];
      totalCount: number;
    }
  | { status: "unavailable" };

export function parseCounselorPrimaryStudents(value: unknown): {
  items: CounselorPrimaryStudent[];
  totalCount: number;
} {
  const rows = z.array(rowSchema).max(6).parse(value);
  const totalCount = rows[0]?.total_count ?? 0;
  if (rows.some((row) => row.total_count !== totalCount)) {
    throw new Error("Inconsistent Primary Counselor assignment count.");
  }

  return {
    totalCount,
    items: rows.map((row) => ({
      assignmentId: row.assignment_id,
      studentId: row.student_id,
      fullName: row.full_name,
      collegeEmail: row.college_email,
      isActive: row.is_active,
      course: row.course,
      department: row.department,
      assignedAt: row.assigned_at,
    })),
  };
}
