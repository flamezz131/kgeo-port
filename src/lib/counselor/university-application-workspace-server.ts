import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  executeUniversityApplicationWorkspaceRead,
  type UniversityApplicationWorkspaceReadResult,
  type UniversityApplicationWorkspaceSearchParams,
} from "@/lib/counselor/university-application-workspace";
import type { Database } from "@/types/database";

export async function loadCounselorUniversityApplicationWorkspace(
  supabase: SupabaseClient<Database>,
  searchParams: UniversityApplicationWorkspaceSearchParams,
  now = new Date(),
): Promise<UniversityApplicationWorkspaceReadResult> {
  return executeUniversityApplicationWorkspaceRead(
    searchParams,
    async (args) =>
      supabase.rpc(
        "list_counselor_university_application_workspace",
        args,
      ),
    async () =>
      supabase.rpc("get_counselor_university_application_workspace_metrics"),
    now,
  );
}
