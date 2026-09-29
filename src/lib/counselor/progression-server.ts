import "server-only";

import {
  OFFICIAL_PROGRESSION_CURRENT_COLUMNS,
  OFFICIAL_PROGRESSION_EVENT_COLUMNS,
  fetchCounselorStudentProgression,
  type OfficialProgressionLoadResult,
} from "@/lib/counselor/progression";
import { isStudent360StudentId } from "@/lib/counselor/student-profile";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import { requireCounselor } from "@/lib/permissions";

export async function loadCounselorStudentProgression(
  trustedStudentId: string,
  progressionPage: number,
): Promise<OfficialProgressionLoadResult> {
  const { supabase } = await requireCounselor();
  if (!isStudent360StudentId(trustedStudentId)) {
    return { kind: "unavailable" };
  }
  const caseAccess = await verifyPrimaryCounselorCaseAccess(
    supabase,
    trustedStudentId,
  );
  if (!caseAccess.valid) return { kind: "unavailable" };

  return fetchCounselorStudentProgression(
    trustedStudentId,
    progressionPage,
    {
      loadCurrent: async () => {
        const { data, error } = await supabase
          .from("student_counseling_progressions")
          .select(OFFICIAL_PROGRESSION_CURRENT_COLUMNS)
          .eq("student_id", trustedStudentId)
          .maybeSingle();
        return { data, error };
      },
      loadHistory: async (from, to) => {
        const { data, error, count } = await supabase
          .from("student_counseling_progression_events")
          .select(OFFICIAL_PROGRESSION_EVENT_COLUMNS, {
            count: "exact",
          })
          .eq("student_id", trustedStudentId)
          .order("changed_at", { ascending: false })
          .order("id", { ascending: false })
          .range(from, to);
        return { data, error, count };
      },
      loadCorrectionContext: async (eventIds) => {
        const { data, error } = await supabase.rpc(
          "get_counselor_progression_correction_context",
          {
            p_student_id: trustedStudentId,
            p_event_ids: eventIds,
          },
        );
        return { data, error };
      },
    },
  );
}
