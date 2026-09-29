export default function CounselorApplicationsLoading() {
  return (
    <section
      aria-busy="true"
      aria-live="polite"
      className="counselor-page application-workspace-page"
      role="status"
    >
      <span className="eyebrow">Counselor operations</span>
      <h1>Loading applications…</h1>
      <p className="muted">Preparing application metrics and results.</p>

      <div aria-hidden="true" className="application-workspace-loading-metrics">
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} />
        ))}
      </div>
      <div aria-hidden="true" className="application-workspace-loading-controls" />
      <div aria-hidden="true" className="application-workspace-loading-results">
        <span />
        <span />
        <span />
      </div>
    </section>
  );
}
