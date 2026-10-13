export default function DirectorPublicProgressLoading() {
  return (
    <div className="director-page director-loading" aria-busy="true">
      <h1>K-GEO Public Statistics</h1>
      <p>Loading the latest published figures…</p>
      <div className="director-loading-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => <span key={index} />)}
      </div>
    </div>
  );
}
