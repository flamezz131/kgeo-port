// Public Student institution contract. An institution only identifies which
// Kumaraguru college email domain a Student uses. It never grants a role.

export const STUDENT_INSTITUTION_DOMAINS = {
  KCT: "kct.ac.in",
  KCLAS: "kclas.ac.in",
  KCTBS: "kctbs.ac.in",
} as const;

export type StudentInstitution = keyof typeof STUDENT_INSTITUTION_DOMAINS;

export const STUDENT_INSTITUTIONS = [
  "KCT",
  "KCLAS",
  "KCTBS",
] as const satisfies readonly StudentInstitution[];

export const DEFAULT_STUDENT_INSTITUTION: StudentInstitution = "KCT";

export function isStudentInstitution(
  value: unknown,
): value is StudentInstitution {
  return (
    typeof value === "string" &&
    (STUDENT_INSTITUTIONS as readonly string[]).includes(value)
  );
}

export function normalizeStudentEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Returns the exact domain only for an address with a single "@" and
// non-empty local and domain parts.
export function getExactEmailDomain(email: string): string | null {
  const parts = normalizeStudentEmail(email).split("@");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return parts[1];
}

export function institutionMatchesEmail(
  institution: StudentInstitution,
  email: string,
): boolean {
  return getExactEmailDomain(email) === STUDENT_INSTITUTION_DOMAINS[institution];
}

export function getStudentInstitutionMismatchMessage(
  institution: StudentInstitution,
): string {
  return `Use your exact @${STUDENT_INSTITUTION_DOMAINS[institution]} email address for ${institution}.`;
}

export function getStudentInstitutionEmailHint(
  institution: StudentInstitution,
): string {
  return `Use your @${STUDENT_INSTITUTION_DOMAINS[institution]} institutional email`;
}

export function getStudentInstitutionEmailPlaceholder(
  institution: StudentInstitution,
): string {
  return `yourname@${STUDENT_INSTITUTION_DOMAINS[institution]}`;
}

// Browser-side convenience only. Server validation remains authoritative.
export function getStudentInstitutionEmailInputPattern(
  institution: StudentInstitution,
): string {
  return `[^\\s@]+@${STUDENT_INSTITUTION_DOMAINS[institution].replaceAll(".", "\\.")}`;
}
