import "server-only";

import {
  parseDirectorAttentionItems,
  parseDirectorCounselorWorkload,
  parseDirectorDashboardMetrics,
} from "@/lib/director/dashboard";
import { requireDirector } from "@/lib/permissions";
import type {
  DirectorAttentionItem,
  DirectorCounselorWorkloadSummary,
  DirectorDashboardMetrics,
} from "@/types";

export const DIRECTOR_WORKLOAD_LIMIT = 20;
export const DIRECTOR_ATTENTION_LIMIT = 25;

export type DirectorDashboardSection<T> =
  | { status: "ready"; data: T }
  | { status: "error" };

export type DirectorDashboardData = {
  directorName: string;
  metrics: DirectorDashboardSection<DirectorDashboardMetrics>;
  workload: DirectorDashboardSection<DirectorCounselorWorkloadSummary[]>;
  attention: DirectorDashboardSection<DirectorAttentionItem[]>;
};

function parseSection<T>(
  hasError: boolean,
  parse: () => T,
): DirectorDashboardSection<T> {
  if (hasError) return { status: "error" };

  try {
    return { status: "ready", data: parse() };
  } catch {
    return { status: "error" };
  }
}

export async function loadDirectorDashboard(): Promise<DirectorDashboardData> {
  const { supabase, profile } = await requireDirector();

  const [metricsResult, workloadResult, attentionResult] = await Promise.all([
    supabase.rpc("get_director_dashboard_metrics"),
    supabase.rpc("list_director_counselor_workload", {
      p_limit: DIRECTOR_WORKLOAD_LIMIT,
    }),
    supabase.rpc("list_director_attention_items", {
      p_limit: DIRECTOR_ATTENTION_LIMIT,
    }),
  ]);

  const metrics = parseSection(
    Boolean(metricsResult.error),
    () => {
      if (!metricsResult.data || metricsResult.data.length !== 1) {
        throw new Error("Invalid Director metrics response.");
      }
      return parseDirectorDashboardMetrics(metricsResult.data[0]);
    },
  );
  const workload = parseSection(
    Boolean(workloadResult.error) || workloadResult.data === null,
    () => parseDirectorCounselorWorkload(workloadResult.data ?? []),
  );
  const attention = parseSection(
    Boolean(attentionResult.error) || attentionResult.data === null,
    () => parseDirectorAttentionItems(attentionResult.data ?? []),
  );

  return {
    directorName: profile.full_name ?? "Director",
    metrics,
    workload,
    attention,
  };
}
