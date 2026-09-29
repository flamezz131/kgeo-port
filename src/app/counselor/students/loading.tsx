export default function CounselorStudentsLoading() {
  return (
    <section aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">Loading students…</span>
      <div aria-hidden="true" className="flex flex-col gap-7">
        <div className="flex flex-col gap-2">
          <span className="block h-3 w-32 rounded bg-[var(--surface-3)]" />
          <span className="block h-8 w-56 rounded bg-[var(--surface-3)]" />
          <span className="block h-4 w-full max-w-xl rounded bg-[var(--surface-3)]" />
        </div>
        <span className="block h-64 rounded-2xl border border-[var(--line)] bg-[var(--surface)]" />
        <div className="flex flex-col gap-4">
          <span className="block h-20 rounded-xl border border-[var(--line)] bg-[var(--surface)]" />
          {Array.from({ length: 3 }, (_, index) => (
            <span
              className="block h-28 rounded-xl border border-[var(--line)] bg-[var(--surface)]"
              key={index}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
