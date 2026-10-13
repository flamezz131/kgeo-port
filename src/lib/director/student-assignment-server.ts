import "server-only";

import {
  parseDirectorAssignmentHistory,
  parseEligibleDirectorAssignmentCounselors,
  type DirectorAssignmentCounselor,
  type DirectorAssignmentHistoryEntry,
} from "@/lib/director/student-assignment";
import { requireDirector } from "@/lib/permissions";

export type DirectorAssignmentManagementData =
  | {
      status: "ready";
      counselors: DirectorAssignmentCounselor[];
      history: DirectorAssignmentHistoryEntry[];
    }
  | { status: "unavailable" };

export async function loadDirectorAssignmentManagement(
  studentIds: string[],
): Promise<DirectorAssignmentManagementData> {
  if (studentIds.length === 0 || studentIds.length > 50) {
    return { status: "unavailable" };
  }

  const { supabase } = await requireDirector();
  const [accounts, history] = await Promise.all([
    supabase.rpc("list_director_counselor_accounts"),
    supabase.rpc("list_director_primary_counselor_assignment_history", {
      p_student_ids: studentIds,
    }),
  ]);

  if (
    accounts.error ||
    accounts.data === null ||
    history.error ||
    history.data === null
  ) {
    return { status: "unavailable" };
  }

  try {
    return {
      status: "ready",
      counselors: parseEligibleDirectorAssignmentCounselors(accounts.data),
      history: parseDirectorAssignmentHistory(history.data),
    };
  } catch {
    return { status: "unavailable" };
  }
}
