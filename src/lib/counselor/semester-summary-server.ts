import "server-only";

import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import {
  COUNSELOR_SEMESTER_SUMMARY_LIMIT,
  parseCounselorSemesterSummaries,
  type CounselorSemesterSummaryLoadResult,
} from "@/lib/counselor/semester-summary";
import { isStudent360StudentId } from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";

export async function loadCounselorSemesterSummaries(
  studentId: string,
): Promise<CounselorSemesterSummaryLoadResult> {
  if (!isStudent360StudentId(studentId)) return { kind: "not_found" };

  const { supabase } = await requireCounselor();
  const ownership = await verifyPrimaryCounselorCaseAccess(
    supabase,
    studentId,
  );
  if (!ownership.valid) {
    return ownership.error ? { kind: "unavailable" } : { kind: "not_found" };
  }

  const result = await supabase.rpc(
    "get_counselor_student_semester_summaries",
    {
      p_student_id: studentId,
      p_limit: COUNSELOR_SEMESTER_SUMMARY_LIMIT,
    },
  );
  if (result.error) return { kind: "unavailable" };

  const summaries = parseCounselorSemesterSummaries(result.data);
  return summaries === null
    ? { kind: "unavailable" }
    : { kind: "ready", summaries };
}
