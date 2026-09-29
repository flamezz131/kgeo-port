import { StudentUniversityApplicationsSkeleton } from "@/components/student/university-applications-section";

function Block({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-slate-200/70 motion-reduce:animate-none ${className}`}
    />
  );
}

export default function StudentDashboardLoading() {
  return (
    <div className="flex flex-col gap-8" aria-busy="true" aria-live="polite">
      <div role="status">
        <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#1D4ED8]">
          Student dashboard
        </span>
        <h1 className="mt-2 text-[#0B1F3A]">Loading your dashboard&hellip;</h1>
        <p className="mt-2 text-slate-500">
          Preparing your profile, applications and consultations.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.7fr)_minmax(0,1fr)]">
        <div className="flex gap-7 rounded-2xl border border-[#E2E8F0] bg-white p-6">
          <Block className="size-28 shrink-0 rounded-full" />
          <div className="flex flex-1 flex-col gap-3">
            <Block className="h-3 w-32" />
            <Block className="h-6 w-2/3" />
            <Block className="h-3 w-full" />
            <Block className="h-3 w-4/5" />
            <Block className="mt-2 h-10 w-44 rounded-xl" />
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-br from-[#1D4ED8] to-[#0B1F3A] p-6">
          <div
            aria-hidden="true"
            className="h-3 w-36 animate-pulse rounded-lg bg-white/20 motion-reduce:animate-none"
          />
          <div
            aria-hidden="true"
            className="h-6 w-2/3 animate-pulse rounded-lg bg-white/25 motion-reduce:animate-none"
          />
          <div
            aria-hidden="true"
            className="h-3 w-full animate-pulse rounded-lg bg-white/15 motion-reduce:animate-none"
          />
          <div
            aria-hidden="true"
            className="mt-auto h-11 w-full animate-pulse rounded-xl bg-white/30 motion-reduce:animate-none"
          />
        </div>
      </div>

      <StudentUniversityApplicationsSkeleton />

      <div className="flex flex-col gap-4">
        <Block className="h-4 w-40" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Block className="h-44 rounded-2xl" />
          <Block className="h-44 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}
