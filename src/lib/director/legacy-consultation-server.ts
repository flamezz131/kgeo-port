import "server-only";

import {
  parseDirectorLegacyWaitingConsultations,
  type DirectorLegacyWaitingConsultation,
} from "@/lib/director/legacy-consultation";
import { requireDirector } from "@/lib/permissions";

export type DirectorLegacyConsultationData =
  | { status: "ready"; items: DirectorLegacyWaitingConsultation[] }
  | { status: "unavailable" };

export async function loadDirectorLegacyWaitingConsultations(): Promise<DirectorLegacyConsultationData> {
  const { supabase } = await requireDirector();
  const { data, error } = await supabase.rpc(
    "list_director_legacy_waiting_consultations",
  );

  if (error || data === null) return { status: "unavailable" };

  try {
    return {
      status: "ready",
      items: parseDirectorLegacyWaitingConsultations(data),
    };
  } catch {
    return { status: "unavailable" };
  }
}
