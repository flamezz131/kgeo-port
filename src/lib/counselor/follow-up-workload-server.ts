import "server-only";

import { loadCounselorConsultationReferences } from "@/lib/consultations/counselor-references";
import {
  attachFollowUpWorkloadReferences,
  fetchFollowUpWorkload,
  parseFollowUpWorkloadQuery,
  type FollowUpWorkloadLoadResult,
  type FollowUpWorkloadSearchParams,
} from "@/lib/counselor/follow-up-workload";
import { requireCounselor } from "@/lib/permissions";

export async function loadCounselorFollowUpWorkload(
  searchParams: FollowUpWorkloadSearchParams,
): Promise<FollowUpWorkloadLoadResult> {
  const { supabase } = await requireCounselor();
  const query = parseFollowUpWorkloadQuery(searchParams);
  const workload = await fetchFollowUpWorkload(query, async (args) => {
    const { data, error } = await supabase.rpc(
      "list_counselor_follow_up_workload",
      args,
    );
    return { data, error };
  });

  if (workload.kind !== "ready") return workload;

  const consultationIds = [
    ...new Set(
      workload.records.flatMap((record) =>
        record.consultationId ? [record.consultationId] : [],
      ),
    ),
  ];
  const references = await loadCounselorConsultationReferences(
    consultationIds,
    async (ids) => {
      const { data, error } = await supabase.rpc(
        "get_counselor_consultation_references",
        { p_consultation_ids: ids },
      );
      return { data, error };
    },
  );
  if (references === null) {
    return {
      kind: "reference_unavailable",
      query,
      metrics: workload.metrics,
    };
  }

  return (
    attachFollowUpWorkloadReferences(workload, references) ?? {
      kind: "reference_unavailable",
      query,
      metrics: workload.metrics,
    }
  );
}
