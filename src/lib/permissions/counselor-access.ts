import type { UserRole } from "@/types";

export type CounselorAccessUser = {
  id: string;
  email_confirmed_at?: string | null;
};

export type CounselorAccessProfile = {
  id: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
};

export type CounselorAccessAccount = {
  user_id: string;
  approval_status: "pending" | "approved" | "rejected";
};

export type CounselorAccessDecision =
  | "allowed"
  | "unauthenticated"
  | "unverified"
  | "pending"
  | "forbidden";

export function getCounselorAccessDecision(
  user: CounselorAccessUser | null,
  profile: CounselorAccessProfile | null,
  account: CounselorAccessAccount | null,
): CounselorAccessDecision {
  if (!user) return "unauthenticated";
  if (!user.email_confirmed_at) return "unverified";

  if (
    profile?.id === user.id &&
    profile.role === "counselor" &&
    !profile.is_active &&
    account?.user_id === user.id &&
    account.approval_status === "pending"
  ) {
    return "pending";
  }

  if (
    !profile ||
    profile.id !== user.id ||
    profile.role !== "counselor" ||
    !profile.is_active ||
    account?.user_id !== user.id ||
    account.approval_status !== "approved"
  ) {
    return "forbidden";
  }

  return "allowed";
}
