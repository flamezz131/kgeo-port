import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CounselorRegisterForm } from "@/components/auth/counselor-register-form";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Counselor registration",
  robots: { index: false, follow: false },
};

export default async function CounselorRegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email_confirmed_at) {
    const [profileResult, accountResult] = await Promise.all([
      supabase
        .from("profiles")
        .select("id, role, is_active")
        .eq("id", user.id)
        .maybeSingle(),
      supabase
        .from("counselor_accounts")
        .select("user_id, approval_status")
        .eq("user_id", user.id)
        .maybeSingle(),
    ]);

    const profile = profileResult.error ? null : profileResult.data;
    const account = accountResult.error ? null : accountResult.data;

    if (
      profile?.id === user.id &&
      profile.role === "counselor" &&
      account?.user_id === user.id
    ) {
      if (account.approval_status === "pending" && !profile.is_active) {
        redirect("/counselor/pending");
      }
      if (account.approval_status === "approved" && profile.is_active) {
        redirect("/counselor/dashboard");
      }
      redirect(
        account.approval_status === "rejected"
          ? "/counselor/login?status=rejected"
          : "/counselor/login?status=inactive",
      );
    }
  }

  return (
    <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pt-10 pb-24 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
      <div className="lg:sticky lg:top-32">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-[#1E40AF] ring-1 ring-inset ring-blue-100">
          K-GEO Counselor Portal
        </span>
        <h1 className="mt-4">Create your counselor account</h1>
        <p className="mt-3 max-w-md leading-relaxed text-slate-500">
          Choose your own username and password. Your account remains locked
          until the Director reviews and approves the registration.
        </p>
        <ol className="mt-8 flex flex-col gap-3">
          {[
            "Register with your professional name and chosen username.",
            "Wait for Director approval.",
            "Sign in to begin working with assigned students.",
          ].map((step, index) => (
            <li key={step} className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-sm font-bold tabular-nums text-[#1D4ED8] ring-1 ring-[#E2E8F0]">
                {index + 1}
              </span>
              <span className="text-[0.9rem] text-slate-600">{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-8 right-0 h-56 w-72 rounded-full bg-blue-200/35 blur-3xl"
        />
        <div className="relative rounded-3xl border border-[#E2E8F0] bg-white p-7 shadow-[0_24px_60px_-30px_rgb(11_31_58/0.35)] sm:p-9">
          <CounselorRegisterForm />
          <p className="mt-6 border-t border-[#E2E8F0] pt-5 text-[0.87rem] text-slate-500">
            Already registered?{" "}
            <Link
              href="/counselor/login"
              className="font-semibold text-[#1D4ED8] underline decoration-1 underline-offset-4 hover:text-[#1E40AF]"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
