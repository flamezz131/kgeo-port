/* eslint-disable react-hooks/purity -- timeout calculation against current server time */
import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/permissions";
import GeneratingRoadmapLoading from "./loading";

export const dynamic = "force-dynamic";

/**
 * Landing page after "Generate My Roadmap".
 *
 * Generation runs to completion inside POST /api/recommendations/pr-generate.
 * If the generation is queued, this page polls for status updates.
 * If generation exceeds 90 seconds, it is automatically marked as failed so
 * students can retry without getting stuck in an infinite refresh loop.
 */
export default async function GeneratingRoadmapPage() {
  const { supabase, user } = await requireStudent();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: latest } = await (supabase as any)
    .schema("recommendation")
    .from("recommendations")
    .select("id, status, generated_at")
    .eq("student_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latest?.status === "queued") {
    const ageMs = latest.generated_at
      ? Date.now() - new Date(latest.generated_at).getTime()
      : 0;

    // Timeout guard: Avoid infinite loops on crashed/stuck runs
    if (ageMs > 90_000) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      await admin
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .schema("recommendation" as any)
        .from("recommendations")
        .update({
          status: "failed",
          error_message: "Generation timed out before completion.",
        })
        .eq("id", latest.id);

      redirect("/student/pr/roadmap");
    }

    return (
      <>
        <meta httpEquiv="refresh" content="5" />
        <GeneratingRoadmapLoading />
      </>
    );
  }

  redirect("/student/pr/roadmap");
}
