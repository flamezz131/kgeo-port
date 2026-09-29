import { CounselorSidebar } from "@/components/counselor/CounselorSidebar";
import { PortalShell } from "@/components/shell/portal-shell";
import { requireCounselor } from "@/lib/permissions";
import { logout } from "@/app/actions/auth-actions";

export default async function CounselorLayout({
  children,
}: LayoutProps<"/counselor">) {
  const { profile } = await requireCounselor();

  return (
    <PortalShell
      sidebar={
        <CounselorSidebar
          counselorName={profile.full_name ?? "K-GEO Counselor"}
          logoutAction={logout}
        />
      }
    >
      {children}
    </PortalShell>
  );
}
