import { z } from "zod";
import {
  STUDENT_INSTITUTION_DOMAINS,
  getExactEmailDomain,
} from "@/lib/auth/student-institutions";

// A Student institutional email: normalized by trim + lowercase, and its exact
// domain must be one of the Student institution domains. The domain list has a
// single source of truth in student-institutions.ts.
const studentInstitutionDomains: readonly string[] = Object.values(
  STUDENT_INSTITUTION_DOMAINS,
);

export const institutionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid college email address."))
  .refine((email) => {
    const domain = getExactEmailDomain(email);
    return domain !== null && studentInstitutionDomains.includes(domain);
  }, "Use your exact Kumaraguru institutional email address.");

export function normalizeInstitutionalEmail(email: string): string {
  return institutionalEmailSchema.parse(email);
}

export function isInstitutionalEmail(email: string): boolean {
  return institutionalEmailSchema.safeParse(email).success;
}
