import "server-only";

import {
  attachDirectorPrimaryCounselorCounts,
  attachDirectorPrimaryCounselors,
  DIRECTOR_COUNSELOR_LIMIT,
  DIRECTOR_OVERSIGHT_PAGE_SIZE,
  oversightTotalPages,
  parseApplicationOversightFilters,
  parseConsultationOversightFilters,
  parseDirectorApplicationOversight,
  parseDirectorConsultationOversight,
  parseDirectorStudentOversight,
  parseStudentOversightFilters,
  type ApplicationOversightFilters,
  type ConsultationOversightFilters,
  type DirectorOversightResult,
  type DirectorCounselorAssignmentWorkload,
  type DirectorSearchParams,
  type StudentOversightFilters,
} from "@/lib/director/operational-oversight";
import { parseDirectorCounselorWorkload } from "@/lib/director/dashboard";
import { requireDirector } from "@/lib/permissions";
import type {
  DirectorApplicationOversightEntry,
  DirectorConsultationOversightEntry,
  DirectorStudentOversightEntry,
} from "@/types";

async function loadPage<T, F>(
  filters: F | null,
  request: () => PromiseLike<{ data: unknown; error: unknown }>,
  parse: (value: unknown) => { items: T[]; totalCount: number },
): Promise<DirectorOversightResult<T, F>> {
  if (filters === null) return { status: "invalid" };
  const result = await request();
  if (result.error || result.data === null) {
    return { status: "unavailable", filters };
  }
  try {
    const parsed = parse(result.data);
    return {
      status: "ready",
      filters,
      items: parsed.items,
      totalCount: parsed.totalCount,
      totalPages: oversightTotalPages(parsed.totalCount),
    };
  } catch {
    return { status: "unavailable", filters };
  }
}

export async function loadDirectorStudents(
  params: DirectorSearchParams,
): Promise<DirectorOversightResult<DirectorStudentOversightEntry, StudentOversightFilters>> {
  const { supabase } = await requireDirector();
  const filters = parseStudentOversightFilters(params);
  const base = await loadPage(filters, () => supabase.rpc("list_director_student_oversight", {
    p_search: filters?.search ?? null,
    p_is_active: filters?.active ?? null,
    p_progression_state: filters?.progression ?? null,
    p_page: filters?.page ?? 1,
    p_page_size: DIRECTOR_OVERSIGHT_PAGE_SIZE,
  }), parseDirectorStudentOversight);
  if (base.status !== "ready" || base.items.length === 0) return base;

  const assignments = await supabase.rpc(
    "list_director_primary_counselor_assignments",
    { p_student_ids: base.items.map((student) => student.studentId) },
  );
  if (assignments.error || assignments.data === null) {
    return { status: "unavailable", filters: base.filters };
  }
  try {
    return {
      ...base,
      items: attachDirectorPrimaryCounselors(base.items, assignments.data),
    };
  } catch {
    return { status: "unavailable", filters: base.filters };
  }
}

export async function loadDirectorConsultations(
  params: DirectorSearchParams,
): Promise<DirectorOversightResult<DirectorConsultationOversightEntry, ConsultationOversightFilters>> {
  const { supabase } = await requireDirector();
  const filters = parseConsultationOversightFilters(params);
  return loadPage(filters, () => supabase.rpc("list_director_consultation_oversight", {
    p_search: filters?.search ?? null,
    p_status: filters?.status ?? null,
    p_date_from: filters?.dateFrom ?? null,
    p_date_to: filters?.dateTo ?? null,
    p_page: filters?.page ?? 1,
    p_page_size: DIRECTOR_OVERSIGHT_PAGE_SIZE,
  }), parseDirectorConsultationOversight);
}

export async function loadDirectorApplications(
  params: DirectorSearchParams,
): Promise<DirectorOversightResult<DirectorApplicationOversightEntry, ApplicationOversightFilters>> {
  const { supabase } = await requireDirector();
  const filters = parseApplicationOversightFilters(params);
  return loadPage(filters, () => supabase.rpc("list_director_application_oversight", {
    p_search: filters?.search ?? null,
    p_status: filters?.status ?? null,
    p_archive_state: filters?.archive ?? "active",
    p_page: filters?.page ?? 1,
    p_page_size: DIRECTOR_OVERSIGHT_PAGE_SIZE,
  }), parseDirectorApplicationOversight);
}

export type DirectorCounselorsData =
  | { status: "ready"; items: DirectorCounselorAssignmentWorkload[] }
  | { status: "unavailable" };

export async function loadDirectorCounselors(): Promise<DirectorCounselorsData> {
  const { supabase } = await requireDirector();
  const result = await supabase.rpc("list_director_counselor_workload", {
    p_limit: DIRECTOR_COUNSELOR_LIMIT,
  });
  if (result.error || result.data === null) return { status: "unavailable" };
  try {
    const workload = parseDirectorCounselorWorkload(result.data);
    if (workload.length === 0) return { status: "ready", items: [] };
    const counts = await supabase.rpc("list_director_primary_counselor_counts", {
      p_counselor_ids: workload.map((item) => item.counselorId),
    });
    if (counts.error || counts.data === null) return { status: "unavailable" };
    return {
      status: "ready",
      items: attachDirectorPrimaryCounselorCounts(workload, counts.data),
    };
  } catch {
    return { status: "unavailable" };
  }
}
