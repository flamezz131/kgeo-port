import type { Metadata } from "next";
import Link from "next/link";
import { CounselorLoginForm } from "@/components/auth/counselor-login-form";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = {
  title: "Counselor login",
  robots: { index: false, follow: false },
};

type CounselorLoginPageProps = {
  searchParams: Promise<{ status?: string | string[] }>;
};

export default async function CounselorLoginPage({
  searchParams,
}: CounselorLoginPageProps) {
  const { status } = await searchParams;
  const stateMessage =
    status === "rejected"
      ? "This counselor registration was not approved. Contact the Director if you need assistance."
      : status === "inactive"
        ? "This counselor account is currently inactive. Contact the Director if you need assistance."
        : null;

  return (
    <AuthCard
      eyebrow="K-GEO Counselor Portal"
      title="Counselor Login"
      description="Use the username and password you created during counselor registration."
      footer={
        <p>
          New counselor?{" "}
          <Link
            href="/counselor/register"
            className="font-semibold text-[#1D4ED8] underline decoration-1 underline-offset-4 hover:text-[#1E40AF]"
          >
            Register here
          </Link>
        </p>
      }
    >
      {stateMessage && (
        <p
          className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[0.9rem] font-medium text-amber-900"
          role="status"
        >
          {stateMessage}
        </p>
      )}
      <CounselorLoginForm />
    </AuthCard>
  );
}
