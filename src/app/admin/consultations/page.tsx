import type { Metadata } from "next";
import { ClipboardList } from "lucide-react";
import { requireAdmin } from "@/lib/permissions";

export const metadata: Metadata = { title: "Manage consultations" };

export default async function AdminConsultationsPage() {
  await requireAdmin();

  return (
    <div className="flex flex-col gap-7">
      <header>
        <h1 className="mt-2">Consultations</h1>
        <p className="mt-2 max-w-xl text-slate-500">
          Administrative consultation reporting will be added in a separately
          reviewed feature.
        </p>
      </header>

      <section
        aria-labelledby="admin-consultations-heading"
        className="rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-14 text-center"
      >
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-blue-50 text-[#1D4ED8]">
          <ClipboardList size={26} />
        </div>
        <h2 id="admin-consultations-heading" className="mt-4">
          Consultation reporting not available yet
        </h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
          Students book appointments directly. This page does not read or modify
          consultation records until the admin reporting feature is reviewed and
          implemented.
        </p>
      </section>
    </div>
  );
}
