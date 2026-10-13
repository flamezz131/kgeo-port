import "server-only";

import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import { isStudent360StudentId } from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";
import { parseStudentAchievementDocuments } from "@/lib/student/achievement-evidence";
import type { StudentAchievementDocument } from "@/types";

export type CounselorAchievementEvidenceResult =
  | { kind: "ready"; documents: StudentAchievementDocument[] }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export async function loadPrimaryCounselorAchievementEvidence(
  studentId: string,
): Promise<CounselorAchievementEvidenceResult> {
  if (!isStudent360StudentId(studentId)) return { kind: "not_found" };
  const { supabase } = await requireCounselor();
  const access = await verifyPrimaryCounselorCaseAccess(supabase, studentId);
  if (!access.valid) {
    return access.error ? { kind: "unavailable" } : { kind: "not_found" };
  }
  const result = await supabase.rpc(
    "list_primary_counselor_student_achievement_documents",
    { p_student_id: studentId },
  );
  if (result.error) return { kind: "unavailable" };
  const documents = parseStudentAchievementDocuments(result.data);
  return documents ? { kind: "ready", documents } : { kind: "unavailable" };
}
