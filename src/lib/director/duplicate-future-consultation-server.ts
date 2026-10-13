import "server-only";

import {
  parseDirectorDuplicateFutureWaitingConsultations,
  type DirectorDuplicateFutureWaitingConsultation,
} from "@/lib/director/duplicate-future-consultation";
import { requireDirector } from "@/lib/permissions";

export type DirectorDuplicateFutureConsultationData =
  | { status: "ready"; items: DirectorDuplicateFutureWaitingConsultation[] }
  | { status: "unavailable" };

export async function loadDirectorDuplicateFutureWaitingConsultations(): Promise<DirectorDuplicateFutureConsultationData> {
  const { supabase } = await requireDirector();
  const { data, error } = await supabase.rpc(
    "list_director_duplicate_future_waiting_consultations",
  );

  if (error || data === null) return { status: "unavailable" };

  try {
    return {
      status: "ready",
      items: parseDirectorDuplicateFutureWaitingConsultations(data),
    };
  } catch {
    return { status: "unavailable" };
  }
}
