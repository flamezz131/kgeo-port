"use client";

import { usePathname } from "next/navigation";
import { CalendarDays, PlusCircle, Sparkles } from "lucide-react";
import { PortalSidebar } from "@/components/shell/portal-sidebar";

export function StudentSidebar({
  studentName,
  logoutAction,
}: {
  studentName: string;
  logoutAction: (payload: FormData) => void;
}) {
  const pathname = usePathname();

  // The profile is opened from the name block at the top of the sidebar, not
  // from a separate menu item.
  const profileLink = { href: "/student/profile", label: "View my profile" };

  const links = [
    {
      href: "/student/dashboard",
      label: "Consultations",
      icon: <CalendarDays size={18} />,
    },
    {
      href: "/student/consultation",
      label: "New Consultation",
      icon: <PlusCircle size={18} />,
    },
    {
      href: "/student/pr/roadmap",
      label: "AI Recommendations",
      icon: <Sparkles size={18} />,
    },
  ];

  return (
    <PortalSidebar
      portalLabel="Student Portal"
      userName={studentName}
      logoutAction={logoutAction}
      tone="sky"
      profileLink={{
        ...profileLink,
        active:
          pathname === profileLink.href ||
          pathname.startsWith(`${profileLink.href}/`),
      }}
      links={links.map((link) => ({
        ...link,
        active: pathname === link.href || pathname.startsWith(`${link.href}/`),
      }))}
    />
  );
}
