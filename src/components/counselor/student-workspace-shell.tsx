import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { CounselorStudentWorkspaceNavigation } from "@/components/counselor/student-workspace-navigation";
import {
  COUNSELING_PROGRESSION_STAGE_LABELS,
  COUNSELING_PROGRESSION_STATE_LABELS,
} from "@/lib/counselor/progression";
import { formatStudent360TargetIntake } from "@/lib/counselor/student-profile";
import type { CounselorStudentWorkspaceBase } from "@/lib/counselor/student-workspace-server";

function provided(value: string | number | null | undefined): string {
  return value === null || value === undefined || value === ""
    ? "Not provided"
    : String(value);
}

function HeaderFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.7rem] font-bold uppercase tracking-[0.04em] text-[var(--muted)]">
        {label}
      </dt>
      <dd className="mt-1 break-words font-semibold text-[var(--ink)]">
        {value}
      </dd>
    </div>
  );
}

export function CounselorStudentWorkspaceShell({
  children,
  workspace,
}: {
  children: React.ReactNode;
  workspace: CounselorStudentWorkspaceBase;
}) {
  const profile = workspace.profile;
  const preference = workspace.preference;
  const progression = workspace.progression;
  const academicPeriod = [
    profile?.current_year ? `Year ${profile.current_year}` : null,
    profile?.current_semester ? `Semester ${profile.current_semester}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const progressionLabel = progression
    ? `${COUNSELING_PROGRESSION_STAGE_LABELS[progression.current_stage]} · ${COUNSELING_PROGRESSION_STATE_LABELS[progression.workflow_state]}`
    : "Not recorded";

  return (
    <div className="flex flex-col gap-6">
      <Link
        className="inline-flex w-fit items-center gap-1.5 text-sm font-bold text-[var(--brand-600)] transition-colors hover:text-[var(--brand-700)]"
        href="/counselor/students"
      >
        <ArrowLeft aria-hidden="true" size={16} />
        Back to My Students
      </Link>

      <header className="grid gap-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5 shadow-[0_1px_3px_rgb(15_23_42/0.06)] sm:p-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] xl:items-start xl:gap-8">
        <div className="min-w-0">
          <h1 className="mt-2 break-words">{workspace.fullName}</h1>
          <p className="mt-2 text-[var(--muted)]">
            {provided(profile?.course)}
            {profile?.department ? ` · ${profile.department}` : ""}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wide ring-1 ring-inset ${
                workspace.isActive
                  ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                  : "bg-[var(--surface-3)] text-[var(--ink-soft)] ring-[var(--line-strong)]"
              }`}
            >
              {workspace.isActive ? "Active Student" : "Inactive Student"}
            </span>
            <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[0.65rem] font-extrabold uppercase tracking-wide text-[var(--brand-700)] ring-1 ring-inset ring-blue-200">
              Current Primary Counselor
            </span>
          </div>
        </div>

        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-3">
          <HeaderFact label="Academic period" value={academicPeriod || "Not provided"} />
          <HeaderFact
            label="Graduation year"
            value={provided(profile?.graduation_year)}
          />
          <HeaderFact
            label="Current CGPA"
            value={
              profile?.cgpa === null || profile?.cgpa === undefined
                ? "Not provided"
                : `${profile.cgpa} / ${profile.cgpa_scale}`
            }
          />
          <HeaderFact
            label="Target intake"
            value={
              preference?.target_intake
                ? formatStudent360TargetIntake(preference.target_intake)
                : "Not provided"
            }
          />
          <HeaderFact
            label="Preferred countries"
            value={
              preference?.preferred_countries.length
                ? preference.preferred_countries.join(", ")
                : "Not provided"
            }
          />
          <HeaderFact label="Current journey" value={progressionLabel} />
        </dl>
      </header>

      <CounselorStudentWorkspaceNavigation studentId={workspace.studentId} />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
