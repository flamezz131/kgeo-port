import "server-only";

import {
  parseStudentApplicationJourneys,
  type StudentApplicationJourneyLoadResult,
} from "@/lib/counselor/application-journey";
import { requireStudent } from "@/lib/permissions";

export async function getMyUniversityApplicationJourneys(): Promise<StudentApplicationJourneyLoadResult> {
  const { supabase } = await requireStudent();
  const result = await supabase.rpc("get_my_university_application_journeys");
  if (result.error) return { kind: "unavailable" };

  const journeys = parseStudentApplicationJourneys(result.data);
  return journeys === null
    ? { kind: "unavailable" }
    : { kind: "ready", journeys };
}
