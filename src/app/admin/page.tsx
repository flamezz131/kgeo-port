import { redirect } from "next/navigation";

// The portal root has no page of its own; send visitors to the dashboard.
export default function AdminPortalIndex() {
  redirect("/admin/consultations");
}
