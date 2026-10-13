"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const workspaceTabs = [
  { href: "", label: "Overview" },
  { href: "/profile", label: "Profile" },
  { href: "/eligibility", label: "Eligibility" },
  { href: "/advisory", label: "Advisory" },
  { href: "/applications", label: "Applications" },
  { href: "/readiness", label: "Readiness" },
  { href: "/achievements", label: "Achievements" },
  { href: "/documents", label: "Documents" },
  { href: "/report", label: "Report" },
] as const;

export function CounselorStudentWorkspaceNavigation({
  studentId,
}: {
  studentId: string;
}) {
  const pathname = usePathname();
  const basePath = `/counselor/students/${studentId}`;

  return (
    <nav
      aria-label="Student Workspace"
      className="-mx-1 overflow-x-auto px-1 [scrollbar-width:thin]"
    >
      <div className="flex w-max min-w-full items-center gap-1 rounded-xl border border-[var(--line)] bg-[var(--surface)] p-1.5 shadow-[0_1px_3px_rgb(15_23_42/0.06)]">
        {workspaceTabs.map((tab) => {
          const href = `${basePath}${tab.href}`;
          const active =
            tab.href === ""
              ? pathname === basePath
              : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`shrink-0 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                active
                  ? "bg-[var(--brand-600)] text-white"
                  : "text-[var(--ink-soft)] hover:bg-[var(--surface-3)] hover:text-[var(--brand-700)]"
              }`}
              href={href}
              key={tab.label}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
