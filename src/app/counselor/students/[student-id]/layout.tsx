import { notFound } from "next/navigation";
import { CounselorStudentWorkspaceShell } from "@/components/counselor/student-workspace-shell";
import { PageHeader, StateBlock } from "@/components/shell/portal-ui";
import { loadCounselorStudentWorkspaceBase } from "@/lib/counselor/student-workspace-server";

export default async function CounselorStudentWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ "student-id": string }>;
}) {
  const studentId = (await params)["student-id"];
  const result = await loadCounselorStudentWorkspaceBase(studentId);
  if (result.kind === "not_found") notFound();

  if (result.kind === "unavailable") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title="Student Workspace is temporarily unavailable."
        />
        <StateBlock
          description="Please refresh the page and try again shortly."
          title="The Workspace could not be loaded."
          tone="error"
        />
      </div>
    );
  }

  return (
    <CounselorStudentWorkspaceShell workspace={result.workspace}>
      {children}
    </CounselorStudentWorkspaceShell>
  );
}
