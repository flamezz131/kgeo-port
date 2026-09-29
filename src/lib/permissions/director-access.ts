import type { UserRole } from "@/types";

export type DirectorAccessUser = {
  id: string;
  email_confirmed_at?: string | null;
};

export type DirectorAccessProfile = {
  id: string;
  full_name: string | null;
  role: UserRole;
  is_active: boolean;
};

export type DirectorAccessDecision =
  | "allowed"
  | "unauthenticated"
  | "unverified"
  | "forbidden";

export function getDirectorAccessDecision(
  user: DirectorAccessUser | null,
  profile: DirectorAccessProfile | null,
): DirectorAccessDecision {
  if (!user) return "unauthenticated";
  if (!user.email_confirmed_at) return "unverified";

  if (
    !profile ||
    profile.id !== user.id ||
    profile.role !== "director" ||
    !profile.is_active
  ) {
    return "forbidden";
  }

  return "allowed";
}
