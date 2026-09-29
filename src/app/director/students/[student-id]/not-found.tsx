import Link from "next/link";

export default function DirectorStudentProfileNotFound() {
  return (
    <section className="counselor-page student-360-unavailable">
      <span className="eyebrow">Director student profile</span>
      <h1>Student profile not found</h1>
      <p>This student is unavailable or the profile link is no longer valid.</p>
      <Link className="button button-secondary" href="/director/students">Back to Students</Link>
    </section>
  );
}
