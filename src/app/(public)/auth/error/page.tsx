import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard, AuthNotice } from "@/components/auth/auth-card";

export const metadata: Metadata = { title: "Email verification problem" };

export default function AuthErrorPage() {
  return (
    <AuthCard
      eyebrow="Verification problem"
      title="We could not verify that link"
      footer={
        <p>
          <Link
            href="/register"
            className="font-semibold text-[#1D4ED8] underline decoration-1 underline-offset-4 hover:text-[#1E40AF]"
          >
            Create account
          </Link>{" "}
          or{" "}
          <Link
            href="/login"
            className="font-semibold text-[#1D4ED8] underline decoration-1 underline-offset-4 hover:text-[#1E40AF]"
          >
            go to login
          </Link>
        </p>
      }
    >
      <AuthNotice tone="danger">
        <p>
          The email verification link may be invalid, expired, or already used.
          You can register again or return to the login page.
        </p>
      </AuthNotice>
    </AuthCard>
  );
}
