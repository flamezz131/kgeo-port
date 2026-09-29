import { StudentSidebar } from "./StudentSidebar";
import { PortalShell } from "@/components/shell/portal-shell";
import { logout } from "@/app/actions/auth-actions";
import { requireStudent } from "@/lib/permissions";

export default async function StudentLayout({
  children,
}: LayoutProps<"/student">) {
  const { profile } = await requireStudent();

  return (
    <PortalShell
      sidebar={
        <StudentSidebar
          studentName={profile.full_name ?? "K-GEO Student"}
          logoutAction={logout}
        />
      }
    >
      {children}
    </PortalShell>
  );
}
