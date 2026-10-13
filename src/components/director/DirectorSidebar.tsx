"use client";

import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Users,
  CalendarDays,
  FileText,
  UserCog,
  BarChart3,
  ClipboardList,
} from "lucide-react";
import { PortalSidebar } from "@/components/shell/portal-sidebar";

const links = [
  {
    href: "/director/dashboard",
    label: "Dashboard",
    icon: <LayoutDashboard size={18} />,
  },
  { href: "/director/students", label: "Students", icon: <Users size={18} /> },
  {
    href: "/director/consultations",
    label: "Consultations",
    icon: <CalendarDays size={18} />,
  },
  {
    href: "/director/applications",
    label: "Applications",
    icon: <FileText size={18} />,
  },
  {
    href: "/director/counselors",
    label: "Counselors",
    icon: <UserCog size={18} />,
  },
  {
    href: "/director/public-progress",
    label: "Public Statistics",
    icon: <BarChart3 size={18} />,
  },
  {
    href: "/director/reports",
    label: "Parent Reports",
    icon: <ClipboardList size={18} />,
  },
];

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DirectorSidebar({
  directorName,
  logoutAction,
}: {
  directorName: string;
  logoutAction: (payload: FormData) => void;
}) {
  const pathname = usePathname();

  return (
    <PortalSidebar
      portalLabel="Director Portal"
      userName={directorName}
      logoutAction={logoutAction}
      links={links.map((link) => ({
        ...link,
        active: isActive(pathname, link.href),
      }))}
    />
  );
}
