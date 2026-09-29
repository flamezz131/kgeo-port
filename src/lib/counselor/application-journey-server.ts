import "server-only";

import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import {
  APPLICATION_JOURNEY_HISTORY_LIMIT,
  parseCounselorApplicationJourney,
  parseCounselorApplicationJourneyHistory,
  type CounselorApplicationJourneyLoadResult,
} from "@/lib/counselor/application-journey";
import { isStudent360StudentId } from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";

export async function loadCounselorApplicationJourney(
  studentId: string,
  applicationId: string,
): Promise<CounselorApplicationJourneyLoadResult> {
  if (
    !isStudent360StudentId(studentId) ||
    !isStudent360StudentId(applicationId)
  ) {
    return { kind: "not_found" };
  }

  const { supabase } = await requireCounselor();
  const ownership = await verifyPrimaryCounselorCaseAccess(
    supabase,
    studentId,
  );
  if (!ownership.valid) {
    return ownership.error ? { kind: "unavailable" } : { kind: "not_found" };
  }

  const application = await supabase
    .from("student_university_applications")
    .select("id, student_id, is_archived")
    .eq("id", applicationId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (application.error) return { kind: "unavailable" };
  if (!application.data || application.data.is_archived) {
    return { kind: "not_found" };
  }

  const [currentResult, historyResult] = await Promise.all([
    supabase.rpc("get_counselor_university_application_journey", {
      p_application_id: applicationId,
    }),
    supabase.rpc("get_counselor_university_application_journey_history", {
      p_application_id: applicationId,
      p_limit: APPLICATION_JOURNEY_HISTORY_LIMIT,
    }),
  ]);
  if (currentResult.error || historyResult.error) {
    return { kind: "unavailable" };
  }

  const journey = parseCounselorApplicationJourney(
    currentResult.data,
    applicationId,
  );
  const events = parseCounselorApplicationJourneyHistory(historyResult.data);
  if (
    journey === null ||
    events === null ||
    (journey.version_number === 0 && events.length !== 0) ||
    (journey.version_number > 0 &&
      events[0]?.version_number !== journey.version_number)
  ) {
    return { kind: "unavailable" };
  }

  return { kind: "ready", journey, events };
}
