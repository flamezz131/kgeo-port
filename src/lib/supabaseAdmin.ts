import "server-only";

import { createClient } from "@supabase/supabase-js";

/**
 * Service-role client for the Personalized Recommendation (PR) pipeline.
 *
 * Defaults to the `recommendation` schema, where recommendations, their items,
 * insights, development plans and roadmap tasks live. Use `.schema("public")`
 * for profile tables. Never import this from client components.
 */
const supabaseUrl =
  process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY environment variables.",
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  db: {
    schema: "recommendation",
  },
  auth: {
    persistSession: false,
  },
});
