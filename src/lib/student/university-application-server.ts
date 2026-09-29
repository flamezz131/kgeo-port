import "server-only";

import { requireStudent } from "@/lib/permissions";
import {
  fetchMyUniversityApplications,
  type StudentUniversityApplicationListResult,
} from "@/lib/student/university-applications";

export async function getMyUniversityApplications(): Promise<StudentUniversityApplicationListResult> {
  const { supabase } = await requireStudent();

  return fetchMyUniversityApplications(async () => {
    const { data, error } = await supabase.rpc(
      "get_my_university_applications",
    );
    return { data, error };
  });
}
