export default function DirectorStudentProfileLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="counselor-page director-page director-oversight-loading" role="status">
      <span className="eyebrow">Director student profile</span>
      <h1>Loading student profile&hellip;</h1>
      <p>Preparing the read-only student record.</p>
    </section>
  );
}
