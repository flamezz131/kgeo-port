import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Panel, SectionHeader, StateBlock } from "@/components/shell/portal-ui";
import type { CounselorPrimaryStudentsResult } from "@/lib/counselor/primary-assignment";

export function MyPrimaryStudents({
  result,
}: {
  result: CounselorPrimaryStudentsResult;
}) {
  return (
    <Panel aria-labelledby="my-students-heading">
      <SectionHeader
        action={
          result.status === "ready" && result.totalCount > 0 ? (
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wide text-[var(--brand-700)] ring-1 ring-inset ring-blue-200">
              {result.totalCount} assigned
            </span>
          ) : undefined
        }
        description="Students currently assigned to you as their Primary Counselor."
        eyebrow="Primary case responsibility"
        title="My Students"
        titleId="my-students-heading"
      />

      {result.status === "unavailable" ? (
        <StateBlock
          description="The organization-wide list remains available below."
          title="Assigned students are temporarily unavailable."
          tone="error"
        />
      ) : result.items.length === 0 ? (
        <StateBlock
          description="A Student appears here when your first successful consultation claim establishes Primary Counselor responsibility."
          title="No students are assigned to you"
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {result.items.map((student) => (
            <li className="min-w-0" key={student.assignmentId}>
              <article className="flex h-full flex-col rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[var(--brand-600)]">
                      Primary assignment
                    </span>
                    <h3 className="mt-1 break-words text-[var(--ink)]">
                      {student.fullName ?? "Name unavailable"}
                    </h3>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-0.5 text-[0.65rem] font-extrabold uppercase tracking-wide ring-1 ring-inset ${
                      student.isActive
                        ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                        : "bg-[var(--surface-3)] text-[var(--ink-soft)] ring-[var(--line-strong)]"
                    }`}
                  >
                    {student.isActive ? "Active student" : "Inactive student"}
                  </span>
                </div>

                <p className="mt-3 break-words text-sm text-[var(--muted)]">
                  {student.collegeEmail}
                </p>
                <p className="mt-1 break-words text-sm text-[var(--muted)]">
                  {student.course ?? "Course not recorded"} ·{" "}
                  {student.department ?? "Department not recorded"}
                </p>

                <Link
                  className="mt-4 inline-flex h-10 w-fit items-center justify-center gap-2 rounded-xl border border-blue-100 bg-blue-50 px-4 text-sm font-bold text-[var(--brand-600)] transition-colors hover:bg-[var(--brand-600)] hover:text-white"
                  href={`/counselor/students/${student.studentId}`}
                >
                  Open Student Workspace
                  <ArrowUpRight aria-hidden="true" size={15} />
                </Link>
              </article>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
