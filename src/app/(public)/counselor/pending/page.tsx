import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = {
  title: "Counselor approval pending",
  robots: { index: false, follow: false },
};

export default async function CounselorPendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user?.email_confirmed_at) {
    redirect("/counselor/login");
  }

  const [profileResult, accountResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, role, is_active")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("counselor_accounts")
      .select("user_id, username, approval_status")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const profile = profileResult.error ? null : profileResult.data;
  const account = accountResult.error ? null : accountResult.data;

  if (
    profile?.id !== user.id ||
    profile.role !== "counselor" ||
    account?.user_id !== user.id
  ) {
    redirect("/counselor/login");
  }

  if (account.approval_status === "approved" && profile.is_active) {
    redirect("/counselor/dashboard");
  }

  if (account.approval_status !== "pending" || profile.is_active) {
    redirect(
      account.approval_status === "rejected"
        ? "/counselor/login?status=rejected"
        : "/counselor/login?status=inactive",
    );
  }

  return (
    <AuthCard
      eyebrow="K-GEO Counselor Portal"
      title="Registration Submitted"
      description={
        <span role="status">
          Your counselor account has been created successfully and is awaiting
          Director approval.
        </span>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-emerald-500 text-white"
          >
            <Check size={20} strokeWidth={3} />
          </span>
          <p className="text-[0.9rem] text-emerald-900">
            Counselor username:{" "}
            <strong className="font-bold">{account.username}</strong>
          </p>
        </div>

        <p className="text-[0.9rem] leading-relaxed text-slate-500">
          Once approved, you can access the Counselor Portal using your username
          and password.
        </p>

        <Link
          href="/counselor/login"
          className="inline-flex h-11 items-center justify-center rounded-xl bg-[#1D4ED8] px-5 text-sm font-bold text-white shadow-[0_8px_20px_-8px_rgb(29_78_216/0.8)] transition-all hover:-translate-y-0.5 hover:bg-[#1E40AF] motion-reduce:transform-none"
        >
          Return to Counselor Login
        </Link>
      </div>
    </AuthCard>
  );
}
