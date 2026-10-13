export default function CounselorFollowUpsLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="counselor-page follow-up-workload-page"
      role="status"
    >
      <h1>Loading follow-ups…</h1>
      <p className="muted">Preparing the current follow-up workload.</p>

      <div aria-hidden="true" className="follow-up-workload-loading-metrics">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div aria-hidden="true" className="follow-up-workload-loading-controls" />
      <div aria-hidden="true" className="follow-up-workload-loading-results">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
