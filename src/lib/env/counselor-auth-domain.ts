import "server-only";

import { z } from "zod";

const counselorAuthDomainSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    "K_GEO_COUNSELOR_AUTH_DOMAIN must be a valid DNS domain.",
  )
  .refine(
    (domain) => domain !== "kct.ac.in" && domain !== "kclas.ac.in",
    "K_GEO_COUNSELOR_AUTH_DOMAIN must not reuse a public institutional domain.",
  );

export function getCounselorAuthDomain(): string {
  const result = counselorAuthDomainSchema.safeParse(
    process.env.K_GEO_COUNSELOR_AUTH_DOMAIN,
  );

  if (!result.success) {
    throw new Error("The server-only counselor Auth domain is invalid.");
  }

  return result.data;
}
