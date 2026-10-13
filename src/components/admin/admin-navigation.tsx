"use client";

import { usePathname } from "next/navigation";
import { LayoutDashboard } from "lucide-react";
import { PortalSidebar } from "@/components/shell/portal-sidebar";

const links = [
  {
    href: "/admin/consultations",
    label: "Consultations",
    icon: <LayoutDashboard size={18} />,
  },
];

export function AdminNavigation({
  logoutAction,
}: {
  logoutAction: (payload: FormData) => void;
}) {
  const pathname = usePathname();

  return (
    <PortalSidebar
      portalLabel="Admin Portal"
      userName="Administrator"
      logoutAction={logoutAction}
      links={links.map((link) => ({
        ...link,
        active: pathname === link.href || pathname.startsWith(`${link.href}/`),
      }))}
    />
  );
}
