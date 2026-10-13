import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PROGRESSION_EVIDENCE_AVAILABLE_COLUMNS,
  PROGRESSION_EVIDENCE_OPERATION_COLUMNS,
  PROGRESSION_EVIDENCE_PENDING_COLUMNS,
  fetchAvailableProgressionEvidence,
  type ProgressionEvidenceLoadResult,
} from "@/lib/counselor/progression-evidence";
import {
  isCounselorStudentIdentity,
  isStudent360StudentId,
} from "@/lib/counselor/student-profile";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import { requireCounselor } from "@/lib/permissions";
import type { Database } from "@/types/database";

export type KgeoSupabaseClient = SupabaseClient<Database>;

export async function verifyCounselorProgressionEventTarget(
  supabase: KgeoSupabaseClient,
  studentId: string,
  progressionEventId: string,
): Promise<{ valid: boolean; error: unknown }> {
  if (
    !isStudent360StudentId(studentId) ||
    !isStudent360StudentId(progressionEventId)
  ) {
    return { valid: false, error: null };
  }

  const identity = await supabase
    .rpc("get_counselor_student_identity", {
      p_student_id: studentId,
    })
    .maybeSingle();
  if (
    identity.error ||
    !isCounselorStudentIdentity(identity.data, studentId)
  ) {
    return { valid: false, error: identity.error };
  }

  const event = await supabase
    .from("student_counseling_progression_events")
    .select("id, student_id")
    .eq("id", progressionEventId)
    .eq("student_id", studentId)
    .maybeSingle();

  return {
    valid:
      !event.error &&
      event.data?.id === progressionEventId &&
      event.data.student_id === studentId,
    error: event.error,
  };
}

export async function loadCounselorProgressionEvidence(
  trustedStudentId: string,
  progressionEventIds: string[],
): Promise<ProgressionEvidenceLoadResult> {
  const { supabase } = await requireCounselor();
  const caseAccess = await verifyPrimaryCounselorCaseAccess(
    supabase,
    trustedStudentId,
  );
  if (!caseAccess.valid) return { kind: "unavailable" };

  return fetchAvailableProgressionEvidence(
    trustedStudentId,
    progressionEventIds,
    {
      loadAvailable: async (eventIds, maximumRows) => {
        const { data, error } = await supabase
          .from("student_counseling_progression_evidence")
          .select(PROGRESSION_EVIDENCE_AVAILABLE_COLUMNS)
          .in("progression_event_id", eventIds)
          .eq("status", "available")
          .order("progression_event_id", { ascending: true })
          .order("available_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(maximumRows);
        return { data, error };
      },
      loadPending: async (eventIds, nowIso, maximumRows) => {
        const { data, error } = await supabase
          .from("student_counseling_progression_evidence")
          .select(PROGRESSION_EVIDENCE_PENDING_COLUMNS)
          .in("progression_event_id", eventIds)
          .eq("status", "pending")
          .gt("upload_expires_at", nowIso)
          .order("progression_event_id", { ascending: true })
          .order("upload_expires_at", { ascending: true })
          .order("id", { ascending: true })
          .limit(maximumRows);
        return { data, error };
      },
    },
  );
}

export async function loadProgressionEvidenceOperationRow(
  supabase: KgeoSupabaseClient,
  evidenceId: string,
) {
  return supabase
    .from("student_counseling_progression_evidence")
    .select(PROGRESSION_EVIDENCE_OPERATION_COLUMNS)
    .eq("id", evidenceId)
    .maybeSingle();
}
