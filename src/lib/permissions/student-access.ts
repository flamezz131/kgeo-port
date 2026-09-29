export type StudentAccessUser = {
  id: string;
  email_confirmed_at?: string | null;
};

export type StudentAccessProfile = {
  id: string;
  college_email: string;
  full_name: string | null;
  role: string;
  is_active: boolean;
};

export type StudentAccessDecision =
  | "allowed"
  | "unauthenticated"
  | "unverified"
  | "forbidden";

export function getStudentAccessDecision(
  user: StudentAccessUser | null,
  profile: StudentAccessProfile | null,
): StudentAccessDecision {
  if (!user) {
    return "unauthenticated";
  }

  if (!user.email_confirmed_at) {
    return "unverified";
  }

  if (
    !profile ||
    profile.id !== user.id ||
    profile.role !== "student" ||
    !profile.is_active
  ) {
    return "forbidden";
  }

  return "allowed";
}
