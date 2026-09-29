import { logout } from "@/app/actions/auth-actions";
import { AdminNavigation } from "@/components/admin/admin-navigation";
import { PortalShell } from "@/components/shell/portal-shell";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <PortalShell sidebar={<AdminNavigation logoutAction={logout} />}>
      {children}
    </PortalShell>
  );
}
