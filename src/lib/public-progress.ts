import { z } from "zod";
import type {
  KgeoPublicProgressSnapshot,
  PublicProgressMetricKey,
} from "@/types";

export const PUBLIC_PROGRESS_METRICS = [
  { key: "applications_initiated", label: "Applications Initiated" },
  { key: "applications_submitted", label: "Applications Submitted" },
  { key: "offers_received", label: "Offers Received" },
  { key: "confirmed_acceptance", label: "Confirmed Acceptance" },
  { key: "visa_approved", label: "Visa Approved" },
  { key: "enrolled_overseas", label: "Enrolled Overseas" },
] as const satisfies readonly {
  key: PublicProgressMetricKey;
  label: string;
}[];

const countSchema = z.number().int().nonnegative().safe();
const publicProgressRowSchema = z
  .object({
    applications_initiated: countSchema,
    applications_submitted: countSchema,
    offers_received: countSchema,
    confirmed_acceptance: countSchema,
    visa_approved: countSchema,
    enrolled_overseas: countSchema,
    published_at: z.iso.datetime({ offset: true }),
  });

export function parsePublicKgeoProgress(
  value: unknown,
): KgeoPublicProgressSnapshot {
  const row = publicProgressRowSchema.parse(value);
  return {
    values: {
      applications_initiated: row.applications_initiated,
      applications_submitted: row.applications_submitted,
      offers_received: row.offers_received,
      confirmed_acceptance: row.confirmed_acceptance,
      visa_approved: row.visa_approved,
      enrolled_overseas: row.enrolled_overseas,
    },
    publishedAt: row.published_at,
  };
}

export function formatPublicProgressTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
