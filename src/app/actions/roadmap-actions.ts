"use server";

import { revalidatePath } from "next/cache";
import { requireStudent } from "@/lib/permissions";
import { createAdminClient } from "@/lib/supabase/admin";

const ROADMAP_TASK_STATUSES = [
  "not_started",
  "in_progress",
  "completed",
  "archived",
] as const;

export type RoadmapTaskStatus = (typeof ROADMAP_TASK_STATUSES)[number];

/**
 * Updates the status of a single roadmap task owned by the calling student.
 * Throws on failure so callers can revert optimistic UI state.
 *
 * The task lives in the `recommendation` schema, which is not part of the
 * generated `Database` type, so the admin client is narrowed with `.schema()`.
 */
export async function updateRoadmapTaskStatus(
  taskId: string,
  status: RoadmapTaskStatus,
): Promise<{ success: true }> {
  const { user } = await requireStudent();

  if (!taskId) {
    throw new Error("Missing task id.");
  }

  if (!ROADMAP_TASK_STATUSES.includes(status)) {
    throw new Error("Invalid task status.");
  }

  const admin = createAdminClient();
  const { error } = await admin
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .schema("recommendation" as any)
    .from("student_roadmap_tasks")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", taskId)
    .eq("student_id", user.id);

  if (error) {
    console.error("Failed to update roadmap task status:", error);
    throw new Error("Failed to update task status.");
  }

  revalidatePath("/student/pr/roadmap");
  return { success: true };
}
