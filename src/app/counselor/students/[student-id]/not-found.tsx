import Link from "next/link";
import { STUDENT_360_BASE_PATH } from "@/lib/counselor/student-profile";

export default function CounselorStudentProfileNotFound() {
  return (
    <section className="counselor-page student-360-unavailable">
      <h1>Student profile not found</h1>
      <p>
        This student profile is unavailable or the link is no longer valid.
      </p>
      <Link className="button button-secondary" href={STUDENT_360_BASE_PATH}>
        Back to Students
      </Link>
    </section>
  );
}
