import type { Metadata } from "next";
import { HomeHero } from "./HomeHero";
import { HomeSections } from "./HomeSections";
import { PublicProgressSection } from "@/components/public/public-progress-section";
import { loadPublicKgeoProgress } from "@/lib/public-progress-server";

export const metadata: Metadata = {
  title: "K-GEO — From Kumaraguru to Global Universities",
};

export default async function HomePage() {
  const publicProgress = await loadPublicKgeoProgress();

  return (
    <div className="overflow-hidden">
      <HomeHero />
      <div className="bg-white px-6 pt-4 pb-20">
        <div className="max-w-[1400px] mx-auto">
          <PublicProgressSection progress={publicProgress} />
        </div>
      </div>
      <HomeSections />
    </div>
  );
}
