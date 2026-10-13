import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/permissions";
import GeneratingRoadmapLoading from "./loading";

export const dynamic = "force-dynamic";

/**
 * Landing page after "Generate My Roadmap".
 *
 * Generation runs to completion inside POST /api/recommendations/pr-generate
 * before the intake wizard navigates here, so this page only routes the
 * student on. It deliberately does not call the legacy KGEO backend, which
 * would start a second, stale generation from the retired pr_intake table.
 */
export default async function GeneratingRoadmapPage() {
  const { supabase, user } = await requireStudent();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: latest } = await (supabase as any)
    .schema("recommendation")
    .from("recommendations")
    .select("status")
    .eq("student_id", user.id)
    .order("generated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Still queued: stay here and re-check shortly instead of bouncing between
  // this page and the roadmap page (which sends queued runs back here).
  if (latest?.status === "queued") {
    return (
      <>
        <meta httpEquiv="refresh" content="5" />
        <GeneratingRoadmapLoading />
      </>
    );
  }

  redirect("/student/pr/roadmap");
}
