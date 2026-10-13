import type { Metadata } from "next";
import { DirectorPublicProgress } from "@/components/director/director-public-progress";
import { loadDirectorPublicProgress } from "@/lib/director/public-progress-server";

export const metadata: Metadata = { title: "K-GEO public statistics" };

export default async function DirectorPublicProgressPage() {
  const data = await loadDirectorPublicProgress();
  return <DirectorPublicProgress data={data} />;
}
