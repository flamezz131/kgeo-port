export default function StudentProfileLoading() {
  return (
    <section aria-busy="true" aria-live="polite" className="profile-loading panel">
      <h1>Loading your profile…</h1>
      <p className="muted">Preparing your saved sections and progress.</p>
    </section>
  );
}
