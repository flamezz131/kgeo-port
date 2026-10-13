import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DirectorStudentProfile } from "@/components/director/director-student-profile";
import { loadDirectorStudentProfile } from "@/lib/director/student-profile-server";

export const metadata: Metadata = {
  title: "Director student profile",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function DirectorStudentProfilePage({
  params,
}: {
  params: Promise<{ "student-id": string }>;
}) {
  const studentId = (await params)["student-id"];
  const result = await loadDirectorStudentProfile(studentId);

  if (result.kind === "not_found") notFound();
  if (result.kind !== "ready") {
    return (
      <section className="counselor-page student-360-unavailable" role="alert">
        <h1>Student profile is temporarily unavailable.</h1>
        <p>Please refresh the page and try again shortly.</p>
      </section>
    );
  }

  return <DirectorStudentProfile result={result} />;
}
