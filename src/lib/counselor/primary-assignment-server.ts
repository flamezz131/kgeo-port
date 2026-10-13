import "server-only";

import {
  parseCounselorPrimaryStudents,
  type CounselorPrimaryStudentsResult,
} from "@/lib/counselor/primary-assignment";
import { requireCounselor } from "@/lib/permissions";

export async function loadCounselorPrimaryStudents(): Promise<CounselorPrimaryStudentsResult> {
  const { supabase } = await requireCounselor();
  const { data, error } = await supabase.rpc("list_my_primary_students", {
    p_page: 1,
    p_page_size: 6,
  });

  if (error || data === null) return { status: "unavailable" };

  try {
    return { status: "ready", ...parseCounselorPrimaryStudents(data) };
  } catch {
    return { status: "unavailable" };
  }
}
