import "server-only";

import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import {
  GLOBAL_READINESS_HISTORY_LIMIT,
  parseGlobalReadinessAssessments,
  parseGlobalReadinessEvidence,
  type GlobalReadinessAssessment,
  type GlobalReadinessEvidence,
} from "@/lib/counselor/global-readiness";
import { isStudent360StudentId } from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";

export type GlobalReadinessPageResult =
  | {
      kind: "ready";
      evidence: GlobalReadinessEvidence;
      assessments: GlobalReadinessAssessment[];
    }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export async function loadGlobalReadinessPage(
  studentId: string,
): Promise<GlobalReadinessPageResult> {
  if (!isStudent360StudentId(studentId)) return { kind: "not_found" };

  const { supabase } = await requireCounselor();
  const ownership = await verifyPrimaryCounselorCaseAccess(supabase, studentId);
  if (!ownership.valid) {
    return ownership.error ? { kind: "unavailable" } : { kind: "not_found" };
  }

  const [evidenceResult, historyResult] = await Promise.all([
    supabase.rpc("get_primary_counselor_global_readiness_evidence", {
      p_student_id: studentId,
    }),
    supabase.rpc("list_primary_counselor_global_readiness_assessments", {
      p_student_id: studentId,
      p_limit: GLOBAL_READINESS_HISTORY_LIMIT,
    }),
  ]);

  if (evidenceResult.error || historyResult.error) return { kind: "unavailable" };
  const evidence = parseGlobalReadinessEvidence(evidenceResult.data);
  const assessments = parseGlobalReadinessAssessments(historyResult.data);
  if (!evidence || !assessments) return { kind: "unavailable" };

  return { kind: "ready", evidence, assessments };
}
