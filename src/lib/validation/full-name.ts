import { z } from "zod";

export const PROFILE_FULL_NAME_MAX_LENGTH = 150;

export const canonicalFullNameSchema = z
  .string({ error: "Enter your full name." })
  .transform((value) => value.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(1, "Enter your full name.")
      .max(
        PROFILE_FULL_NAME_MAX_LENGTH,
        `Full name must not exceed ${PROFILE_FULL_NAME_MAX_LENGTH} characters.`,
      ),
  );
