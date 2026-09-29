import type { Metadata } from "next";
import { DirectorDashboard } from "@/components/director/director-dashboard";
import { loadDirectorDashboard } from "@/lib/director/dashboard-server";

export const metadata: Metadata = { title: "Director dashboard" };

export default async function DirectorDashboardPage() {
  const dashboard = await loadDirectorDashboard();

  return <DirectorDashboard dashboard={dashboard} />;
}
