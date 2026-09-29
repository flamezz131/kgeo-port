import "server-only";

import { parsePublicKgeoProgress } from "@/lib/public-progress";
import { createClient } from "@/lib/supabase/server";
import type { KgeoPublicProgressSnapshot } from "@/types";

export async function loadPublicKgeoProgress(): Promise<KgeoPublicProgressSnapshot | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_kgeo_progress");

  if (error || !data || data.length !== 1) return null;

  try {
    return parsePublicKgeoProgress(data[0]);
  } catch {
    return null;
  }
}
