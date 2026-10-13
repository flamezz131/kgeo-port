import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard, AuthNotice } from "@/components/auth/auth-card";

export const metadata: Metadata = { title: "Verify your email" };

export default function VerifyEmailPage() {
  return (
    <AuthCard
      eyebrow="One more step"
      title="Check your email"
      footer={
        <p>
          Already verified?{" "}
          <Link
            href="/login"
            className="font-semibold text-[#1D4ED8] underline decoration-1 underline-offset-4 hover:text-[#1E40AF]"
          >
            Log in
          </Link>
        </p>
      }
    >
      <AuthNotice>
        <p>
          We sent you a confirmation link. Open it to verify your email and
          activate your K-GEO account.
        </p>
        <p className="text-slate-500">
          If it is not in your inbox, check spam or wait a few minutes before
          trying again.
        </p>
      </AuthNotice>
    </AuthCard>
  );
}
