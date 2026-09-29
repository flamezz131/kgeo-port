import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  UNIVERSITY_APPLICATION_EVENT_COLUMNS,
  UNIVERSITY_APPLICATION_PROJECTION_COLUMNS,
  parseCounselorUniversityApplicationHistory,
  parseCounselorUniversityApplicationList,
  parseOwnedUniversityApplication,
  type CounselorUniversityApplicationHistoryResult,
  type CounselorUniversityApplicationListResult,
} from "@/lib/counselor/university-application-management";
import {
  UNIVERSITY_APPLICATION_EVENT_PAGE_SIZE,
  UNIVERSITY_APPLICATION_STUDENT_READ_LIMIT,
} from "@/lib/counselor/university-applications";
import {
  isCounselorStudentIdentity,
  isStudent360StudentId,
} from "@/lib/counselor/student-profile";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import { requireCounselor } from "@/lib/permissions";
import type { Database } from "@/types/database";

type KgeoSupabaseClient = SupabaseClient<Database>;

async function resolveTrustedStudent(
  supabase: KgeoSupabaseClient,
  studentId: string,
): Promise<boolean> {
  const caseAccess = await verifyPrimaryCounselorCaseAccess(
    supabase,
    studentId,
  );
  if (!caseAccess.valid) return false;

  const { data, error } = await supabase
    .rpc("get_counselor_student_identity", {
      p_student_id: studentId,
    })
    .maybeSingle();
  return !error && isCounselorStudentIdentity(data, studentId);
}

export async function loadCounselorUniversityApplications(
  routeStudentId: string,
): Promise<CounselorUniversityApplicationListResult> {
  const { supabase } = await requireCounselor();
  if (!isStudent360StudentId(routeStudentId)) {
    return { kind: "unavailable" };
  }

  try {
    if (!(await resolveTrustedStudent(supabase, routeStudentId))) {
      return { kind: "unavailable" };
    }

    const { data, error } = await supabase
      .from("student_university_applications")
      .select(UNIVERSITY_APPLICATION_PROJECTION_COLUMNS)
      .eq("student_id", routeStudentId)
      .order("is_archived", { ascending: true })
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(UNIVERSITY_APPLICATION_STUDENT_READ_LIMIT + 1);
    if (error) return { kind: "unavailable" };

    return parseCounselorUniversityApplicationList(data, routeStudentId);
  } catch {
    return { kind: "unavailable" };
  }
}

export async function loadCounselorUniversityApplicationHistory(
  routeStudentId: string,
  applicationId: string,
  page: number,
): Promise<CounselorUniversityApplicationHistoryResult> {
  const { supabase } = await requireCounselor();
  if (
    !isStudent360StudentId(routeStudentId) ||
    !isStudent360StudentId(applicationId) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 100
  ) {
    return { kind: "unavailable" };
  }

  try {
    if (!(await resolveTrustedStudent(supabase, routeStudentId))) {
      return { kind: "unavailable" };
    }

    const applicationResult = await supabase
      .from("student_university_applications")
      .select(UNIVERSITY_APPLICATION_PROJECTION_COLUMNS)
      .eq("id", applicationId)
      .eq("student_id", routeStudentId)
      .maybeSingle();
    if (applicationResult.error) return { kind: "unavailable" };

    const application = parseOwnedUniversityApplication(
      applicationResult.data,
      routeStudentId,
      applicationId,
    );
    if (!application) return { kind: "unavailable" };

    const from = (page - 1) * UNIVERSITY_APPLICATION_EVENT_PAGE_SIZE;
    const to = from + UNIVERSITY_APPLICATION_EVENT_PAGE_SIZE;
    const { data, error } = await supabase
      .from("student_university_application_events")
      .select(UNIVERSITY_APPLICATION_EVENT_COLUMNS)
      .eq("application_id", applicationId)
      .order("version_number", { ascending: false })
      .range(from, to);
    if (error) return { kind: "unavailable" };

    return parseCounselorUniversityApplicationHistory(
      data,
      applicationId,
      page,
      application.versionNumber,
    );
  } catch {
    return { kind: "unavailable" };
  }
}
