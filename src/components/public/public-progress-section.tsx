import { PublicProgressFunnel } from "@/components/public/public-progress-funnel";
import { formatPublicProgressTimestamp } from "@/lib/public-progress";
import type { KgeoPublicProgressSnapshot } from "@/types";
import { Globe } from "lucide-react";

/**
 * Director-approved funnel figures on the marketing home page.
 *
 * `progress` is null until a director publishes a snapshot, which is a normal
 * state rather than an error — hence the "being prepared" notice instead of an
 * empty section.
 */
export function PublicProgressSection({
  progress,
}: {
  progress: KgeoPublicProgressSnapshot | null;
}) {
  return (
    <section id="kgeo-progress">
      <div className="flex flex-col items-center text-center max-w-3xl mx-auto mb-12 lg:mb-16">
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-50 border border-blue-100 text-[#1D4ED8] text-[0.7rem] font-extrabold uppercase tracking-[0.15em] mb-6">
          <Globe size={14} strokeWidth={2.5} />
          <span>K-GEO Global Journey</span>
        </div>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-extrabold text-[#0B1F3A] tracking-tight leading-[1.15]">
          From first advisory to international enrolment
        </h2>
        <p className="mt-6 text-lg text-[#64748B] leading-relaxed max-w-2xl">
          Supporting our students at every milestone. Here&apos;s a transparent look at the scale of our impact, guiding aspirations to successful international placements.
        </p>
      </div>

      {progress ? (
        <>
          <PublicProgressFunnel values={progress.values} />
          <p className="mt-10 text-center text-[0.8rem] font-medium text-slate-400">
            Last updated{" "}
            <time dateTime={progress.publishedAt} className="text-slate-500 font-semibold">
              {formatPublicProgressTimestamp(progress.publishedAt)}
            </time>
          </p>
        </>
      ) : (
        <div className="text-center" role="status">
          <h3 className="text-xl font-bold text-[#0B1F3A]">
            Latest progress update is being prepared
          </h3>
          <p className="mt-3 text-[#64748B] max-w-md mx-auto">
            Director-approved K-GEO journey figures and successful enrollment metrics will appear here soon.
          </p>
        </div>
      )}
    </section>
  );
}
