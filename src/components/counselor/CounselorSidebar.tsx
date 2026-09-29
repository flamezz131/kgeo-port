"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  Users,
  RefreshCcw,
  FileText,
} from "lucide-react";
import { isCounselorNavigationItemActive } from "@/lib/counselor/navigation";
import { PortalSidebar } from "@/components/shell/portal-sidebar";

export function CounselorSidebar({
  counselorName,
  logoutAction,
}: {
  counselorName: string;
  logoutAction: (payload: FormData) => void;
}) {
  const pathname = usePathname();

  // Keep each entry on one line: the counselor UI contract tests assert on the
  // exact `href: "…", label: "…"` pairs in this source.
  const links = [
    { href: "/counselor/dashboard", label: "Dashboard", icon: <LayoutDashboard size={18} /> },
    { href: "/counselor/schedule", label: "Daily Schedule", icon: <CalendarDays size={18} /> },
    { href: "/counselor/students", label: "Students", icon: <Users size={18} /> },
    { href: "/counselor/follow-ups", label: "Follow-ups", icon: <RefreshCcw size={18} /> },
    { href: "/counselor/applications", label: "Applications", icon: <FileText size={18} /> },
  ];

  return (
    <PortalSidebar
      portalLabel="Counselor Portal"
      userName={counselorName}
      logoutAction={logoutAction}
      links={links.map((link) => ({
        ...link,
        active: isCounselorNavigationItemActive(pathname, link.href),
      }))}
    />
  );
}
