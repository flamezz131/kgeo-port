import "server-only";

import { parsePublicKgeoProgress } from "@/lib/public-progress";
import { requireDirector } from "@/lib/permissions";
import type { KgeoPublicProgressSnapshot } from "@/types";

export type DirectorPublicProgressData = {
  progress: KgeoPublicProgressSnapshot | null;
};

export async function loadDirectorPublicProgress(): Promise<DirectorPublicProgressData> {
  const { supabase } = await requireDirector();
  const { data, error } = await supabase.rpc("get_public_kgeo_progress");

  if (error) {
    throw new Error("K-GEO public statistics are unavailable.");
  }
  if (!data || data.length === 0) return { progress: null };
  if (data.length !== 1) {
    throw new Error("K-GEO public statistics response is invalid.");
  }

  return { progress: parsePublicKgeoProgress(data[0]) };
}
