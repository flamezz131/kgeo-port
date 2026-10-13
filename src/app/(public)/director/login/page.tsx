import type { Metadata } from "next";
import { DirectorLoginForm } from "@/components/auth/director-login-form";
import { AuthCard } from "@/components/auth/auth-card";

export const metadata: Metadata = {
  title: "Director login",
  robots: { index: false, follow: false },
};

export default function DirectorLoginPage() {
  return (
    <AuthCard
      eyebrow="K-GEO Director Portal"
      title="Director sign in"
      description="Use your authorized institutional Director email and password. There is no public Director registration."
    >
      <DirectorLoginForm />
    </AuthCard>
  );
}
