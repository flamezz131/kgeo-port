import type { UserRole } from "@/types";

export const ROLE_HOME_PATHS: Record<UserRole, string> = {
  student: "/student/dashboard",
  counselor: "/counselor/dashboard",
  admin: "/admin/consultations",
  director: "/director/dashboard",
};

export function getRoleHomePath(role: unknown) {
  if (
    role !== "student" &&
    role !== "counselor" &&
    role !== "admin" &&
    role !== "director"
  ) {
    return null;
  }

  return ROLE_HOME_PATHS[role];
}
