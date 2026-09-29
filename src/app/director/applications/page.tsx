import type { Metadata } from "next";
import { DirectorApplicationsOversight } from "@/components/director/director-operational-oversight";
import type { DirectorSearchParams } from "@/lib/director/operational-oversight";
import { loadDirectorApplications } from "@/lib/director/operational-oversight-server";

export const metadata: Metadata = { title: "Director application oversight", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function DirectorApplicationsPage({ searchParams }: { searchParams: Promise<DirectorSearchParams> }) {
  return <DirectorApplicationsOversight result={await loadDirectorApplications(await searchParams)} />;
}
