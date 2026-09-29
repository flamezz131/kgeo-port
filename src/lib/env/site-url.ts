import "server-only";

import { z } from "zod";

const siteUrlSchema = z.url("SITE_URL must be a valid URL.").transform(
  (value, context) => {
    const url = new URL(value);
    const isHttpOrigin = url.protocol === "http:" || url.protocol === "https:";
    const hasOnlyOrigin =
      !url.username &&
      !url.password &&
      (url.pathname === "/" || url.pathname === "") &&
      !url.search &&
      !url.hash;

    if (!isHttpOrigin || !hasOnlyOrigin) {
      context.addIssue({
        code: "custom",
        message: "SITE_URL must be an HTTP or HTTPS origin without a path.",
      });
      return z.NEVER;
    }

    return url.origin;
  },
);

export function getSiteUrl(): string {
  const result = siteUrlSchema.safeParse(process.env.SITE_URL);

  if (!result.success) {
    throw new Error(
      "Invalid SITE_URL. Copy .env.example to .env.local and set the application origin.",
    );
  }

  return result.data;
}
