import { z } from "zod";
import type { GlobalReadinessBand } from "@/types";

export const GLOBAL_READINESS_HISTORY_LIMIT = 20;
export const GLOBAL_READINESS_RUBRIC_VERSION = "K-GEO-GMRI-1";

export const GLOBAL_READINESS_CRITERIA = [
  { key: "academicReadiness", dimension: "Academic Readiness", label: "CGPA and academic consistency", maximum: 15 },
  { key: "intellectualProjects", dimension: "Intellectual Depth", label: "Projects / research / dissertation", maximum: 10 },
  { key: "intellectualDistinction", dimension: "Intellectual Depth", label: "Publications / competitions / academic distinction", maximum: 10 },
  { key: "professionalExperience", dimension: "Professional Readiness", label: "Internships / work experience", maximum: 10 },
  { key: "professionalIndustry", dimension: "Professional Readiness", label: "Industry projects / certifications", maximum: 5 },
  { key: "globalLeadership", dimension: "Global and Leadership Profile", label: "Leadership / responsibility", maximum: 5 },
  { key: "globalExposure", dimension: "Global and Leadership Profile", label: "International exposure / global learning", maximum: 5 },
  { key: "globalDistinction", dimension: "Global and Leadership Profile", label: "Awards / service / extracurricular distinction", maximum: 5 },
  { key: "applicationGmap", dimension: "Application Strength", label: "Trained through G-MAP", maximum: 5 },
  { key: "applicationAdvisory", dimension: "Application Strength", label: "Engaged in K-GEO advisory services", maximum: 5 },
  { key: "applicationDocuments", dimension: "Application Strength", label: "SOP and LoR completed", maximum: 10 },
  { key: "applicationShortlist", dimension: "Application Strength", label: "Universities shortlisted", maximum: 10 },
  { key: "applicationSubmitted", dimension: "Application Strength", label: "Applications submitted", maximum: 5 },
] as const;

export type GlobalReadinessCriterionKey =
  (typeof GLOBAL_READINESS_CRITERIA)[number]["key"];

export const GLOBAL_READINESS_DIMENSIONS = [
  { name: "Academic Readiness", maximum: 15, totalKey: "academicReadiness" },
  { name: "Intellectual Depth", maximum: 20, totalKey: "intellectualDepth" },
  { name: "Professional Readiness", maximum: 15, totalKey: "professionalReadiness" },
  { name: "Global and Leadership Profile", maximum: 15, totalKey: "globalLeadershipProfile" },
  { name: "Application Strength", maximum: 35, totalKey: "applicationStrength" },
] as const;

export const GLOBAL_READINESS_BAND_LABELS: Record<GlobalReadinessBand, string> = {
  early_readiness: "Early Readiness",
  developing_readiness: "Developing Readiness",
  competitive_readiness: "Competitive Readiness",
  advanced_readiness: "Advanced Readiness",
  global_distinction: "Global Distinction",
};

const criterionKeySchema = z.enum(
  GLOBAL_READINESS_CRITERIA.map((criterion) => criterion.key) as [
    GlobalReadinessCriterionKey,
    ...GlobalReadinessCriterionKey[],
  ],
);

const scoreShape = Object.fromEntries(
  GLOBAL_READINESS_CRITERIA.map((criterion) => [
    criterion.key,
    z.number().int().min(0).max(criterion.maximum),
  ]),
) as Record<GlobalReadinessCriterionKey, z.ZodNumber>;

const rationaleShape = Object.fromEntries(
  GLOBAL_READINESS_CRITERIA.map((criterion) => [
    criterion.key,
    z.string().trim().min(1).max(1000).nullable(),
  ]),
) as Record<GlobalReadinessCriterionKey, z.ZodNullable<z.ZodString>>;

const evidenceCriterionSchema = z
  .object({
    recorded: z.boolean(),
    facts: z.array(z.string().min(1).max(200)).min(1).max(6),
  })
  .strict();

const evidenceShape = Object.fromEntries(
  GLOBAL_READINESS_CRITERIA.map((criterion) => [criterion.key, evidenceCriterionSchema]),
) as Record<GlobalReadinessCriterionKey, typeof evidenceCriterionSchema>;

export const globalReadinessEvidenceSchema = z
  .object({
    schemaVersion: z.literal(1),
    criteria: z.object(evidenceShape).strict(),
  })
  .strict();

export type GlobalReadinessEvidence = z.infer<
  typeof globalReadinessEvidenceSchema
>;

const dimensionTotalsSchema = z
  .object({
    academicReadiness: z.number().int().min(0).max(15),
    intellectualDepth: z.number().int().min(0).max(20),
    professionalReadiness: z.number().int().min(0).max(15),
    globalLeadershipProfile: z.number().int().min(0).max(15),
    applicationStrength: z.number().int().min(0).max(35),
  })
  .strict();

const assessmentSchema = z
  .object({
    assessmentId: z.uuid(),
    revisionNumber: z.number().int().min(1),
    rubricVersion: z.literal(GLOBAL_READINESS_RUBRIC_VERSION),
    scores: z.object(scoreShape).strict(),
    rationales: z.object(rationaleShape).strict(),
    dimensionTotals: dimensionTotalsSchema,
    totalScore: z.number().int().min(0).max(100),
    readinessBand: z.enum([
      "early_readiness",
      "developing_readiness",
      "competitive_readiness",
      "advanced_readiness",
      "global_distinction",
    ]),
    assessmentRationale: z.string().trim().min(1).max(2000),
    parentSafeSummary: z.string().trim().min(1).max(1500).nullable(),
    evidenceSchemaVersion: z.literal(1),
    evidenceSnapshot: globalReadinessEvidenceSchema,
    evidenceCapturedAt: z.iso.datetime({ offset: true }),
    assessorFullName: z.string().trim().min(1).max(150),
    assessedAt: z.iso.datetime({ offset: true }),
  })
  .strict();

export type GlobalReadinessAssessment = z.infer<typeof assessmentSchema>;

export function parseGlobalReadinessEvidence(
  value: unknown,
): GlobalReadinessEvidence | null {
  const parsed = globalReadinessEvidenceSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseGlobalReadinessAssessments(
  value: unknown,
): GlobalReadinessAssessment[] | null {
  const parsed = z.array(assessmentSchema).max(GLOBAL_READINESS_HISTORY_LIMIT).safeParse(value);
  if (!parsed.success) return null;
  for (let index = 0; index < parsed.data.length; index += 1) {
    const assessment = parsed.data[index];
    const expectedTotal = Object.values(assessment.scores).reduce(
      (sum, score) => sum + score,
      0,
    );
    const expectedDimensions = {
      academicReadiness: assessment.scores.academicReadiness,
      intellectualDepth:
        assessment.scores.intellectualProjects +
        assessment.scores.intellectualDistinction,
      professionalReadiness:
        assessment.scores.professionalExperience +
        assessment.scores.professionalIndustry,
      globalLeadershipProfile:
        assessment.scores.globalLeadership +
        assessment.scores.globalExposure +
        assessment.scores.globalDistinction,
      applicationStrength:
        assessment.scores.applicationGmap +
        assessment.scores.applicationAdvisory +
        assessment.scores.applicationDocuments +
        assessment.scores.applicationShortlist +
        assessment.scores.applicationSubmitted,
    };
    if (
      assessment.totalScore !== expectedTotal ||
      assessment.readinessBand !== getGlobalReadinessBand(expectedTotal) ||
      Object.entries(expectedDimensions).some(
        ([key, total]) =>
          assessment.dimensionTotals[
            key as keyof typeof assessment.dimensionTotals
          ] !== total,
      )
    ) return null;
    if (index > 0 && assessment.revisionNumber >= parsed.data[index - 1].revisionNumber) {
      return null;
    }
  }
  return parsed.data;
}

export function getGlobalReadinessBand(total: number): GlobalReadinessBand {
  if (total >= 85) return "global_distinction";
  if (total >= 75) return "advanced_readiness";
  if (total >= 65) return "competitive_readiness";
  if (total >= 50) return "developing_readiness";
  return "early_readiness";
}

export function getCriterionByKey(key: string) {
  const parsed = criterionKeySchema.safeParse(key);
  return parsed.success
    ? GLOBAL_READINESS_CRITERIA.find((criterion) => criterion.key === parsed.data) ?? null
    : null;
}

export function formatGlobalReadinessDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}
