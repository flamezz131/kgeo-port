import type { Metadata } from "next";
import { DirectorStudentsOversight } from "@/components/director/director-operational-oversight";
import { DirectorStudentAssignmentManagement } from "@/components/director/director-student-assignment-management";
import { loadDirectorStudents } from "@/lib/director/operational-oversight-server";
import type { DirectorSearchParams } from "@/lib/director/operational-oversight";
import { loadDirectorAssignmentManagement } from "@/lib/director/student-assignment-server";

export const metadata: Metadata = { title: "Director student oversight", referrer: "no-referrer", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default async function DirectorStudentsPage({ searchParams }: { searchParams: Promise<DirectorSearchParams> }) {
  const result = await loadDirectorStudents(await searchParams);
  const assignmentData = result.status === "ready" && result.items.length > 0
    ? await loadDirectorAssignmentManagement(
        result.items.map((student) => student.studentId),
      )
    : null;

  return (
    <div className="director-student-management-page">
      <DirectorStudentsOversight result={result} />
      {result.status === "ready" && result.items.length > 0 && assignmentData && (
        <DirectorStudentAssignmentManagement
          data={assignmentData}
          students={result.items.map((student) => ({
            studentId: student.studentId,
            fullName: student.fullName,
            programme: student.course,
            department: student.department,
            isActive: student.isActive,
            currentCounselorId: student.primaryCounselorId,
            currentCounselorFullName: student.primaryCounselorFullName,
            assignedAt: student.primaryCounselorAssignedAt,
          }))}
        />
      )}
    </div>
  );
}
