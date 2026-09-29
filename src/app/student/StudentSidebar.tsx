"use client";

import { usePathname } from "next/navigation";
import { User, CalendarDays, PlusCircle, Sparkles } from "lucide-react";
import { PortalSidebar } from "@/components/shell/portal-sidebar";

export function StudentSidebar({
  studentName,
  logoutAction,
}: {
  studentName: string;
  logoutAction: (payload: FormData) => void;
}) {
  const pathname = usePathname();

  const links = [
    { href: "/student/profile", label: "My Profile", icon: <User size={18} /> },
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
      links={links.map((link) => ({
        ...link,
        active: pathname === link.href || pathname.startsWith(`${link.href}/`),
      }))}
    />
  );
}
