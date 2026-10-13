import { DirectorSidebar } from "@/components/director/DirectorSidebar";
import { PortalShell } from "@/components/shell/portal-shell";
import { logout } from "@/app/actions/auth-actions";
import { requireDirector } from "@/lib/permissions";

export default async function DirectorLayout({
  children,
}: LayoutProps<"/director">) {
  const { profile } = await requireDirector();

  return (
    <PortalShell
      sidebar={
        <DirectorSidebar
          directorName={profile.full_name ?? "Director"}
          logoutAction={logout}
        />
      }
    >
      {children}
    </PortalShell>
  );
}
