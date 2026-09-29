import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseCounselorCaseAccess,
  type CounselorCaseAccessResult,
} from "@/lib/counselor/case-ownership";
import { requireCounselor } from "@/lib/permissions";
import type { Database } from "@/types/database";

type KgeoSupabaseClient = SupabaseClient<Database>;

export async function verifyPrimaryCounselorCaseAccess(
  supabase: KgeoSupabaseClient,
  studentId: string,
): Promise<{ valid: boolean; error: unknown }> {
  const { data, error } = await supabase.rpc(
    "get_my_primary_counselor_case_access",
    { p_student_id: studentId },
  );
  if (error || data === null) return { valid: false, error };

  try {
    return {
      valid: parseCounselorCaseAccess(data) === "primary",
      error: null,
    };
  } catch (parseError) {
    return { valid: false, error: parseError };
  }
}

export async function loadCounselorCaseAccess(
  studentId: string,
): Promise<CounselorCaseAccessResult> {
  const { supabase } = await requireCounselor();
  const { data, error } = await supabase.rpc(
    "get_my_primary_counselor_case_access",
    { p_student_id: studentId },
  );
  if (error || data === null) return { kind: "unavailable" };
  try {
    return { kind: "ready", state: parseCounselorCaseAccess(data) };
  } catch {
    return { kind: "unavailable" };
  }
}
