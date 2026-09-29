import { z } from "zod";

export const INSTITUTIONAL_EMAIL_DOMAIN = "kct.ac.in";
export const INSTITUTIONAL_EMAIL_INPUT_PATTERN =
  "[^\\s@]+@[kK][cC][tT]\\.[aA][cC]\\.[iI][nN]";

export const institutionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid college email address."))
  .refine(
    (email) => email.split("@")[1] === INSTITUTIONAL_EMAIL_DOMAIN,
    `Use your exact @${INSTITUTIONAL_EMAIL_DOMAIN} email address.`,
  );

export function normalizeInstitutionalEmail(email: string): string {
  return institutionalEmailSchema.parse(email);
}

export function isInstitutionalEmail(email: string): boolean {
  return institutionalEmailSchema.safeParse(email).success;
}
