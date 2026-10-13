import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { Database } from "@/types/database";

const adminEnvSchema = z.object({
  url: z.url(),
  serviceRoleKey: z.string().trim().min(1),
});

export function createAdminClient() {
  const result = adminEnvSchema.safeParse({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });

  if (!result.success) {
    throw new Error("The server-only Supabase Admin environment is invalid.");
  }

  return createSupabaseClient<Database>(
    result.data.url,
    result.data.serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
