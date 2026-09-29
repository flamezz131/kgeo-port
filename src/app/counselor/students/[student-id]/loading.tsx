export default function CounselorStudentWorkspaceLoading() {
  return (
    <section aria-busy="true" aria-live="polite" role="status">
      <span className="sr-only">Loading Student Workspace section…</span>
      <div aria-hidden="true" className="mb-5 flex flex-col gap-2">
        <span className="block h-3 w-28 rounded bg-[var(--surface-3)]" />
        <span className="block h-7 w-56 rounded bg-[var(--surface-3)]" />
        <span className="block h-4 w-full max-w-2xl rounded bg-[var(--surface-3)]" />
      </div>
      <div
        aria-hidden="true"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
      >
        {Array.from({ length: 8 }, (_, index) => (
          <div
            className="flex h-40 flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-4"
            key={index}
          >
            <span className="block h-4 w-2/3 rounded bg-[var(--surface-3)]" />
            <span className="block h-3 w-full rounded bg-[var(--surface-3)]" />
            <span className="block h-3 w-5/6 rounded bg-[var(--surface-3)]" />
            <span className="mt-auto block h-3 w-24 rounded bg-[var(--surface-3)]" />
          </div>
        ))}
      </div>
    </section>
  );
}
