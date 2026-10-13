import "server-only";

import { requireCounselor } from "@/lib/permissions";
import {
  fetchStudentDirectory,
  parseStudentDirectoryQuery,
  type DirectorySearchParams,
  type StudentDirectoryLoadResult,
} from "@/lib/counselor/student-directory";

export async function loadCounselorStudentDirectory(
  searchParams: DirectorySearchParams,
): Promise<StudentDirectoryLoadResult> {
  const { supabase } = await requireCounselor();
  const query = parseStudentDirectoryQuery(searchParams);

  return fetchStudentDirectory(query, async (args) => {
    const { data, error } = await supabase.rpc(
      "list_counselor_student_directory",
      args,
    );
    return { data, error };
  });
}
