import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// Test 1: PII Redaction
function redactPii(text: string): string {
  if (!text) return "";
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "[REDACTED_PHONE]")
    .replace(/\b\d{6}\b/g, "[REDACTED_PIN]");
}

test("redactPii scrubs emails, phone numbers, and postal codes", () => {
  const sensitiveText = "Contact john.doe@example.com or +91 9876543210 at 641049";
  const redacted = redactPii(sensitiveText);
  assert.ok(!redacted.includes("john.doe@example.com"), "Email should be redacted");
  assert.ok(!redacted.includes("9876543210"), "Phone should be redacted");
  assert.ok(!redacted.includes("641049"), "Pin should be redacted");
  assert.ok(redacted.includes("[REDACTED_EMAIL]"));
  assert.ok(redacted.includes("[REDACTED_PHONE]"));
  assert.ok(redacted.includes("[REDACTED_PIN]"));
});

// Test 2: AI Output Schema Validation
const PrUniversitySchema = z.object({
  university: z.string().min(1).default("Target University"),
  program: z.string().min(1).default("Selected Program"),
  country: z.string().min(1).default("Global"),
  category: z.string().optional(),
  fit_score: z.coerce.number().min(0).max(100).default(50),
  why_recommended: z.array(z.string()).default([]),
  current_profile: z.record(z.string(), z.any()).default({}),
  target_profile: z.record(z.string(), z.any()).default({}),
  gaps: z.array(z.any()).default([]),
  top_actions: z.array(z.string()).default([]),
  risks: z.array(z.any()).default([]),
  application_readiness: z.record(z.string(), z.any()).default({}),
});

const PrResponseSchema = z.object({
  profile_summary: z.string().default(""),
  readiness_score: z.coerce.number().min(0).max(100).default(50),
  strengths: z.array(z.string()).default([]),
  priority_gaps: z.array(z.string()).default([]),
  quick_wins: z.array(z.string()).default([]),
  long_term_actions: z.array(z.string()).default([]),
  universities: z.array(PrUniversitySchema).min(1, "At least one recommended university is required"),
  roadmap_stages: z.array(z.any()).default([]),
});

test("PrResponseSchema accepts valid AI generation payload", () => {
  const validOutput = {
    profile_summary: "Strong candidate for MS CS programs.",
    readiness_score: 78,
    strengths: ["Strong CGPA"],
    priority_gaps: ["No GRE score"],
    quick_wins: ["Take practice diagnostic test"],
    long_term_actions: ["Publish paper"],
    universities: [
      {
        university: "University of Illinois Urbana-Champaign",
        program: "MS Computer Science",
        country: "USA",
        fit_score: 72,
        why_recommended: ["Strong academic background matches curriculum"],
      },
    ],
    roadmap_stages: [],
  };

  const parsed = PrResponseSchema.safeParse(validOutput);
  assert.ok(parsed.success, "Valid payload should pass schema parse");
  if (parsed.success) {
    assert.equal(parsed.data.universities.length, 1);
    assert.equal(parsed.data.readiness_score, 78);
  }
});

test("PrResponseSchema rejects empty universities array", () => {
  const emptyOutput = {
    profile_summary: "Incomplete candidate.",
    readiness_score: 40,
    strengths: [],
    priority_gaps: [],
    quick_wins: [],
    long_term_actions: [],
    universities: [],
    roadmap_stages: [],
  };

  const parsed = PrResponseSchema.safeParse(emptyOutput);
  assert.ok(!parsed.success, "Empty universities must fail validation");
});

// Test 3: Markdown fence stripping
test("safely parses JSON wrapped in markdown fences", () => {
  const fenced = "```json\n{\"test\": 123}\n```";
  let cleaned = fenced.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.slice(7);
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.slice(3);
  }
  if (cleaned.endsWith("```")) {
    cleaned = cleaned.slice(0, -3);
  }
  cleaned = cleaned.trim();

  const parsed = JSON.parse(cleaned);
  assert.equal(parsed.test, 123);
});

// Test 4: Task key normalization
test("generates safe stable snake_case task keys", () => {
  const title = "Confirm IELTS Requirement (Academic 7.0+)";
  const taskKey = title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 50);
  assert.equal(taskKey, "confirm_ielts_requirement_academic_7_0_");
  assert.ok(!taskKey.includes(" "), "Task key must not contain spaces");
});

// Test 5: Verify forward migration file structure and completeness
test("forward migration contains all required AI recommendation objects and grants", () => {
  const migrationPath = join(
    process.cwd(),
    "supabase/migrations/202610120001_ai_recommendation_contract.sql"
  );
  const sql = readFileSync(migrationPath, "utf-8");

  assert.ok(sql.includes("student_roadmap_tasks"), "Must create student_roadmap_tasks table");
  assert.ok(sql.includes("profile_snapshot"), "Must add profile_snapshot column");
  assert.ok(sql.includes("readiness_score"), "Must add readiness_score column");
  assert.ok(sql.includes("resume_path"), "Must add resume_path column");
  assert.ok(sql.includes("last_pr_generated_at"), "Must add last_pr_generated_at column");
  assert.ok(sql.includes("idx_recommendations_one_queued_per_student"), "Must include queued concurrency index");
  assert.ok(sql.includes("GRANT USAGE ON SCHEMA recommendation"), "Must grant schema usage to authenticated");
  assert.ok(sql.includes("REVOKE ALL ON SCHEMA recommendation FROM anon"), "Must revoke anon privileges");
});
