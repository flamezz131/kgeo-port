import "server-only";

import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import { isStudent360StudentId } from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";
import { parseProfileDocumentList } from "@/lib/student/profile-documents";
import type { StudentProfileDocument } from "@/types";

export type CounselorProfileDocumentResult =
  | { kind: "ready"; documents: StudentProfileDocument[] }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export async function loadPrimaryCounselorProfileDocuments(
  studentId: string,
): Promise<CounselorProfileDocumentResult> {
  if (!isStudent360StudentId(studentId)) return { kind: "not_found" };
  const { supabase } = await requireCounselor();
  const access = await verifyPrimaryCounselorCaseAccess(supabase, studentId);
  if (!access.valid) {
    return access.error ? { kind: "unavailable" } : { kind: "not_found" };
  }
  const result = await supabase.rpc(
    "list_primary_counselor_student_profile_documents",
    { p_student_id: studentId },
  );
  const documents = result.error ? null : parseProfileDocumentList(result.data);
  return documents
    ? { kind: "ready", documents }
    : { kind: "unavailable" };
}
