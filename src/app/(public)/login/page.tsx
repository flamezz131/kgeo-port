import type { Metadata } from "next";
import Link from "next/link";
import { LoginForm } from "@/components/auth/login-form";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = { title: "Log in" };

type LoginPageProps = {
  searchParams: Promise<{ verified?: string | string[] }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { verified } = await searchParams;
  const showVerifiedMessage = verified === "true";

  return (
    <AuthCard
      eyebrow="Welcome back"
      title="Log in to K-GEO"
      description="Use your K-GEO account to access the correct portal for your account."
      footer={
        <>
          <p>
            Kumaraguru student?{" "}
            <Link
              href="/register"
              className="font-semibold text-[#1D4ED8] underline decoration-1 underline-offset-4 hover:text-[#1E40AF]"
            >
              Create a student account
            </Link>
          </p>
        </>
      }
    >
      {showVerifiedMessage && (
        <p
          className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[0.9rem] font-medium text-emerald-800"
          role="status"
        >
          Your email is verified. You can now log in.
        </p>
      )}
      <LoginForm />
    </AuthCard>
  );
}
