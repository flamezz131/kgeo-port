import type { Metadata } from "next";
import { DirectorDuplicateFutureConsultationResolution } from "@/components/director/director-duplicate-future-consultation-resolution";
import { DirectorLegacyConsultationResolution } from "@/components/director/director-legacy-consultation-resolution";
import { DirectorConsultationsOversight } from "@/components/director/director-operational-oversight";
import { loadDirectorDuplicateFutureWaitingConsultations } from "@/lib/director/duplicate-future-consultation-server";
import { loadDirectorLegacyWaitingConsultations } from "@/lib/director/legacy-consultation-server";
import type { DirectorSearchParams } from "@/lib/director/operational-oversight";
import { loadDirectorConsultations } from "@/lib/director/operational-oversight-server";

export const metadata: Metadata = { title: "Director consultation oversight", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function DirectorConsultationsPage({ searchParams }: { searchParams: Promise<DirectorSearchParams> }) {
  const params = await searchParams;
  const [result, legacyData, duplicateFutureData] = await Promise.all([
    loadDirectorConsultations(params),
    loadDirectorLegacyWaitingConsultations(),
    loadDirectorDuplicateFutureWaitingConsultations(),
  ]);

  return (
    <div className="director-consultations-page">
      <DirectorConsultationsOversight result={result} />
      <DirectorLegacyConsultationResolution data={legacyData} />
      <DirectorDuplicateFutureConsultationResolution
        data={duplicateFutureData}
      />
    </div>
  );
}
