export default function CounselorLoading() {
  return (
    <section aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">Loading…</span>
      <div aria-hidden="true" className="flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <span className="block h-3 w-32 rounded bg-[var(--surface-3)]" />
          <span className="block h-8 w-64 rounded bg-[var(--surface-3)]" />
          <span className="block h-4 w-full max-w-xl rounded bg-[var(--surface-3)]" />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          {Array.from({ length: 6 }, (_, index) => (
            <span
              className="block h-24 rounded-xl border border-[var(--line)] bg-[var(--surface)]"
              key={index}
            />
          ))}
        </div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.75fr)_minmax(0,1fr)]">
          <span className="block h-80 rounded-2xl border border-[var(--line)] bg-[var(--surface)]" />
          <span className="block h-80 rounded-2xl border border-[var(--line)] bg-[var(--surface)]" />
        </div>
      </div>
    </section>
  );
}
