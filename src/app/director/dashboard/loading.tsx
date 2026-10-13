function Block({ className }: { className: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-lg bg-slate-200/70 motion-reduce:animate-none ${className}`}
    />
  );
}

export default function DirectorDashboardLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="director-page flex flex-col gap-8"
      role="status"
    >
      <div>
        <h1 className="mt-2">Loading operational overview&hellip;</h1>
        <p className="mt-2 text-slate-500">
          Preparing current metrics, workload, and attention items.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,2fr)] xl:items-start">
        <Block className="h-40 rounded-2xl" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Block className="h-28 rounded-xl" />
          <Block className="h-28 rounded-xl" />
          <Block className="h-28 rounded-xl" />
          <Block className="h-28 rounded-xl" />
          <Block className="h-28 rounded-xl" />
          <Block className="h-28 rounded-xl" />
        </div>
      </div>

      <Block className="h-64 rounded-2xl" />

      <div className="grid gap-3 lg:grid-cols-3">
        <Block className="h-56 rounded-xl" />
        <Block className="h-56 rounded-xl" />
        <Block className="h-56 rounded-xl" />
      </div>
    </div>
  );
}
