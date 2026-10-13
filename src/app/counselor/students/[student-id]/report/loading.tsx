export default function CounselorParentReportLoading() {
  return (
    <section aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">Loading report workspace…</span>
      <div aria-hidden="true" className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <span className="block h-3 w-28 rounded bg-[var(--surface-3)]" />
          <span className="block h-7 w-64 rounded bg-[var(--surface-3)]" />
        </div>
        <span className="block h-48 rounded-2xl border border-[var(--line)] bg-[var(--surface)]" />
        <span className="block h-64 rounded-2xl border border-[var(--line)] bg-[var(--surface)]" />
      </div>
    </section>
  );
}
