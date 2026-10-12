/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- Recommendation DB schema runtime mapping */
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GoogleGenAI } from "@google/genai";
import { loadStudentContextForPR } from "@/lib/recommendations/loadStudentContext";

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

const PrStepSchema = z.object({
  task_key: z.string().optional(),
  order: z.coerce.number().optional().default(1),
  title: z.string().min(1).default("Action Item"),
  description: z.string().default(""),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  estimated_duration: z.string().default(""),
  target_outcome: z.string().optional(),
  expected_outcome: z.string().optional(),
  status: z.string().default("not_started"),
});

const PrStageSchema = z.object({
  id: z.string().default("stage"),
  order: z.coerce.number().default(1),
  title: z.string().default("Roadmap Stage"),
  description: z.string().default(""),
  priority: z.enum(["HIGH", "MEDIUM", "LOW"]).default("MEDIUM"),
  steps: z.array(PrStepSchema).default([]),
  university_requirements: z.array(z.any()).default([]),
});

const PrResponseSchema = z.object({
  profile_summary: z.string().default(""),
  readiness_score: z.coerce.number().min(0).max(100).default(50),
  strengths: z.array(z.string()).default([]),
  priority_gaps: z.array(z.string()).default([]),
  quick_wins: z.array(z.string()).default([]),
  long_term_actions: z.array(z.string()).default([]),
  universities: z.array(PrUniversitySchema).min(1, "At least one recommended university is required"),
  roadmap_stages: z.array(PrStageSchema).default([]),
});

function redactPii(text: string): string {
  if (!text) return "";
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[REDACTED_EMAIL]")
    .replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, "[REDACTED_PHONE]")
    .replace(/\b\d{6}\b/g, "[REDACTED_PIN]");
}

export async function POST() {
  // Prevent pdf-parse / pdf.js from crashing in Next.js edge/webpack environments
  if (typeof global.DOMMatrix === "undefined") {
    (global as any).DOMMatrix = class DOMMatrix {};
  }
  let pdf: any = null;
  try {
    pdf = require("pdf-parse");
  } catch {
    // pdf-parse optional fallback
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: "Email verification required" }, { status: 403 });
  }

  // Authorization: Verify user is an active student
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!profileRow || profileRow.role !== "student" || !profileRow.is_active) {
    return NextResponse.json(
      { error: "Only active students can generate recommendations" },
      { status: 403 }
    );
  }

  const studentId = user.id;
  let recommendationId: string | null = null;

  try {
    // 1. Concurrency Guard: Clean up stale queued runs (> 2 mins) or reject active queued runs (< 2 mins)
    const { data: existingQueued } = await supabaseAdmin
      .from("recommendations")
      .select("id, generated_at")
      .eq("student_id", studentId)
      .eq("status", "queued")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existingQueued) {
      const runAgeMs = Date.now() - new Date(existingQueued.generated_at).getTime();
      if (runAgeMs < 120_000) {
        return NextResponse.json(
          {
            error: "Recommendation generation is already in progress. Please wait.",
            recommendationId: existingQueued.id,
            status: "queued",
          },
          { status: 409 }
        );
      } else {
        // Stale run (> 2 minutes old) — mark failed so user can proceed
        await supabaseAdmin
          .from("recommendations")
          .update({
            status: "failed",
            error_message: "Generation timed out before completion.",
          })
          .eq("id", existingQueued.id);
      }
    }

    // 2. Load Student Context
    const studentContext = await loadStudentContextForPR(studentId, supabase);

    if (
      !studentContext.academic?.department ||
      !studentContext.preferences?.preferredCountries?.length
    ) {
      return NextResponse.json(
        { error: "Complete the intake form first." },
        { status: 409 }
      );
    }

    // 3. Cooldown Check (7 Days)
    if (studentContext.lastPrGeneratedAt) {
      const lastGenDate = new Date(studentContext.lastPrGeneratedAt);
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastGenDate.getTime() < sevenDaysInMs) {
        // Find latest successful PR using correct schema
        const { data: prevRec } = await supabaseAdmin
          .from("recommendations")
          .select("id")
          .eq("student_id", studentId)
          .eq("status", "completed")
          .order("generated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        return NextResponse.json(
          {
            success: true,
            source: "stored",
            recommendationId: prevRec?.id,
            cooldown: {
              active: true,
              generatedAt: studentContext.lastPrGeneratedAt,
              nextGenerationAt: new Date(lastGenDate.getTime() + sevenDaysInMs).toISOString(),
            },
          },
          { status: 202 }
        );
      }
    }

    // 4. Resume Text Extraction & PII Redaction
    const normalizedCgpa = studentContext.academic?.cgpa || 0;
    let resumeText = "";
    if (studentContext.resumePath) {
      try {
        const { data: resumeData, error: resumeError } = await supabase.storage
          .from("student-resumes")
          .download(studentContext.resumePath);

        if (!resumeError && resumeData) {
          const buffer = await resumeData.arrayBuffer();

          if (process.env.GEMINI_API_KEY) {
            try {
              const extractionModel = process.env.GEMINI_EXTRACTION_MODEL || "gemini-1.5-flash";
              const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
              const base64Pdf = Buffer.from(buffer).toString("base64");
              const extractionResponse = await Promise.race([
                ai.models.generateContent({
                  model: extractionModel,
                  contents: [
                    "Extract text accurately from this resume, focusing on academic details, skills, internships, and research projects. Do not include personal identity numbers.",
                    { inlineData: { data: base64Pdf, mimeType: "application/pdf" } },
                  ],
                }),
                new Promise<never>((_, reject) =>
                  setTimeout(() => reject(new Error("Resume extraction timeout")), 25000)
                ),
              ]);
              resumeText = (extractionResponse.text || "").substring(0, 6000);
            } catch (geminiError) {
              console.error("Gemini resume extraction failed, attempting fallback:", geminiError);
              if (pdf) {
                try {
                  const pdfFn = pdf.default || pdf;
                  const pdfData = await pdfFn(Buffer.from(buffer));
                  resumeText = (pdfData.text || "").substring(0, 3000);
                } catch (pdfError) {
                  console.error("Fallback pdf-parse failed:", pdfError);
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to process resume:", err);
      }
    }

    // Redact any phone numbers or emails before sending to AI
    resumeText = redactPii(resumeText);

    // 5. Query candidate university programs
    let candidateQuery = supabase
      .schema("recommendation" as any)
      .from("university_programs")
      .select(`
        id,
        min_cgpa,
        min_ielts,
        min_toefl,
        min_gre,
        tuition_estimate_inr,
        universities!inner (
          id,
          name,
          country,
          world_rank
        ),
        programs!inner (
          id,
          name,
          degree_type
        )
      `)
      .or(`min_cgpa.lte.${normalizedCgpa},min_cgpa.is.null`);

    if (studentContext.preferences?.preferredCountries?.length > 0) {
      candidateQuery = candidateQuery.in(
        "universities.country",
        studentContext.preferences.preferredCountries
      );
    }

    if (studentContext.preferences?.preferredCourses?.length > 0) {
      candidateQuery = candidateQuery.in(
        "programs.name",
        studentContext.preferences.preferredCourses
      );
    }

    const { data: candidatesData, error: candError } = await candidateQuery;
    if (candError) {
      console.error("Error querying candidates:", candError);
    }

    let candidates = candidatesData || [];
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    if (candidates.length > 150) {
      candidates = candidates.slice(0, 150);
    }

    // 6. Insert queued recommendation row
    const geminiModel = process.env.GEMINI_MODEL || "gemini-2.0-flash";
    const { data: recData, error: recError } = await supabaseAdmin
      .from("recommendations")
      .insert({
        student_id: studentId,
        type: "PR",
        status: "queued",
        model: geminiModel,
        profile_snapshot: studentContext,
      })
      .select("id")
      .single();

    if (recError || !recData) {
      console.error("Failed to insert queued recommendation:", recError);
      return NextResponse.json(
        { error: "Failed to initialize recommendation" },
        { status: 500 }
      );
    }

    recommendationId = recData.id;

    // 7. Invoke Gemini with Strict Prompt and Timeout
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("GEMINI_API_KEY is not configured on the server");
    }

    const prompt = buildPrPrompt(studentContext, candidates, resumeText);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    let rawOutput = "";
    let parsedData: z.infer<typeof PrResponseSchema> | null = null;
    let generationError: string | null = null;

    try {
      const response = await Promise.race([
        ai.models.generateContent({
          model: geminiModel,
          contents: prompt,
          config: {
            responseMimeType: "application/json",
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("AI generation request timed out (45s)")), 45000)
        ),
      ]);

      rawOutput = response.text || "";

      // Strip potential markdown code fences from JSON output
      let cleaned = rawOutput.trim();
      if (cleaned.startsWith("```json")) {
        cleaned = cleaned.slice(7);
      } else if (cleaned.startsWith("```")) {
        cleaned = cleaned.slice(3);
      }
      if (cleaned.endsWith("```")) {
        cleaned = cleaned.slice(0, -3);
      }
      cleaned = cleaned.trim();

      const jsonParsed = JSON.parse(cleaned);
      const validated = PrResponseSchema.safeParse(jsonParsed);

      if (!validated.success) {
        console.error("Zod output validation failed:", validated.error.format());
        throw new Error(
          `AI output schema validation failed: ${validated.error.issues.map((i) => i.message).join(", ")}`
        );
      }

      parsedData = validated.data;
    } catch (llmErr) {
      generationError = llmErr instanceof Error ? llmErr.message : "LLM generation failed";
      console.error("AI generation failed:", llmErr);
    }

    // 8. Audit Log
    await supabaseAdmin.from("llm_call_log").insert({
      recommendation_id: recommendationId,
      prompt_summary: { candidateCount: candidates.length, model: geminiModel },
      raw_output: rawOutput || generationError,
      succeeded: parsedData !== null,
    });

    // 9. IF GENERATION FAILED: Mark status 'failed' — NEVER INVENT FAKE DATA!
    if (!parsedData) {
      await supabaseAdmin
        .from("recommendations")
        .update({
          status: "failed",
          error_message: generationError || "Failed to generate recommendation.",
        })
        .eq("id", recommendationId);

      return NextResponse.json(
        {
          recommendationId,
          status: "failed",
          error: "Failed to generate personalized recommendation. Please retry.",
        },
        { status: 202 }
      );
    }

    // 10. SUCCESS: Persist Results Atomically
    // A. Fetch previous tasks to preserve completed checklist progress
    const { data: previousRec } = await supabaseAdmin
      .from("recommendations")
      .select("id")
      .eq("student_id", studentId)
      .neq("id", recommendationId)
      .eq("status", "completed")
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let oldTasks: any[] = [];
    if (previousRec) {
      const { data: ot } = await supabaseAdmin
        .from("student_roadmap_tasks")
        .select("*")
        .eq("recommendation_id", previousRec.id);
      if (ot) oldTasks = ot;
    }

    const matchedOldTaskIds = new Set<string>();

    // B. Save development plan
    await supabaseAdmin.from("development_plans").insert({
      recommendation_id: recommendationId,
      readiness_score: parsedData.readiness_score,
      strengths: parsedData.strengths,
      priority_gaps: parsedData.priority_gaps,
      quick_wins: parsedData.quick_wins,
      long_term_actions: parsedData.long_term_actions,
    });

    // C. Process each university and insert insights
    for (let idx = 0; idx < parsedData.universities.length; idx++) {
      const rec = parsedData.universities[idx];
      const matchedCandidate = candidates.find((c: any) => {
        const uniName = (c.universities as any)?.name || "";
        const progName = (c.programs as any)?.name || "";
        return (
          uniName.toLowerCase().trim() === rec.university.toLowerCase().trim() &&
          progName.toLowerCase().trim() === rec.program.toLowerCase().trim()
        );
      });

      const universityProgramId = matchedCandidate ? matchedCandidate.id : null;
      let bucket: "Ambitious" | "Target" | "Achievable" = "Target";
      const probability = rec.fit_score || 0;
      if (probability < 50) bucket = "Ambitious";
      else if (probability <= 80) bucket = "Target";
      else bucket = "Achievable";

      const { data: itemData, error: itemError } = await supabaseAdmin
        .from("recommendation_items")
        .insert({
          recommendation_id: recommendationId,
          university_program_id: universityProgramId,
          score: probability,
          rank: idx + 1,
          bucket: bucket,
          reason_summary: rec.why_recommended?.length ? [rec.why_recommended[0]] : [],
        })
        .select("id")
        .single();

      if (itemError || !itemData) {
        console.error(`Failed to insert recommendation item at rank ${idx + 1}:`, itemError);
        continue;
      }

      await supabaseAdmin.from("pr_insights").insert({
        recommendation_item_id: itemData.id,
        fit_score: probability,
        admission_probability: probability,
        why_recommended: rec.why_recommended || [],
        current_profile: rec.current_profile || {},
        target_profile: rec.target_profile || {},
        gaps: rec.gaps || [],
        top_actions: rec.top_actions || [],
        detailed_roadmap: (rec as any).roadmap || [],
        risks: rec.risks || [],
        application_readiness: rec.application_readiness || {},
        raw_ai_output: rec,
      });
    }

    // D. Process roadmap stages & checklist steps
    if (parsedData.roadmap_stages?.length) {
      for (const stage of parsedData.roadmap_stages) {
        const stageTitle = stage.title || "Roadmap Stage";
        const stagePhase = stage.order || 1;
        const stageDesc = stage.description || "";
        const stagePriority = stage.priority || "MEDIUM";
        const uniReqs = stage.university_requirements || [];

        if (Array.isArray(stage.steps)) {
          for (const step of stage.steps) {
            const safeTitle = step.title || "Action Item";
            const taskKey =
              step.task_key ||
              safeTitle.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 50);

            const oldTask = oldTasks.find((ot) => ot.task_key === taskKey);
            let status = "not_started";
            if (oldTask) {
              status = oldTask.status;
              matchedOldTaskIds.add(oldTask.id);
            }

            const richDescription = JSON.stringify({
              is_rich_format: true,
              stage_id: stage.id || "stage",
              stage_description: stageDesc,
              stage_priority: stagePriority,
              step_description: step.description || "",
              step_order: step.order || 1,
              university_requirements: uniReqs,
            });

            await supabaseAdmin.from("student_roadmap_tasks").insert({
              student_id: studentId,
              recommendation_id: recommendationId,
              university_program_id: null,
              task_key: taskKey,
              category: stageTitle,
              title: safeTitle,
              description: richDescription,
              priority: step.priority || "MEDIUM",
              status: status,
              target_outcome: step.expected_outcome || step.target_outcome || "",
              estimated_duration: step.estimated_duration || "",
              phase: stagePhase,
            });
          }
        }
      }
    }

    // Carry over unmatched completed old tasks
    for (const oldTask of oldTasks) {
      if (!matchedOldTaskIds.has(oldTask.id)) {
        const carryStatus = oldTask.status === "completed" ? "completed" : "archived";
        await supabaseAdmin.from("student_roadmap_tasks").insert({
          student_id: studentId,
          recommendation_id: recommendationId,
          university_program_id: oldTask.university_program_id,
          task_key: oldTask.task_key,
          category: oldTask.category,
          title: oldTask.title,
          description: oldTask.description,
          priority: oldTask.priority,
          status: carryStatus,
          target_outcome: oldTask.target_outcome,
          estimated_duration: oldTask.estimated_duration,
          phase: oldTask.phase,
        });
      }
    }

    // E. Mark recommendation complete
    await supabaseAdmin
      .from("recommendations")
      .update({ status: "completed" })
      .eq("id", recommendationId);

    // Stamp cooldown timestamp on student_profiles only on successful run
    await supabaseAdmin
      .schema("public")
      .from("student_profiles")
      .update({ last_pr_generated_at: new Date().toISOString() })
      .eq("student_id", studentId);

    return NextResponse.json(
      { recommendationId, status: "completed" },
      { status: 202 }
    );
  } catch (err) {
    console.error("Unhandled exception in PR Generate:", err);

    // Safety net: Guarantee the recommendation never remains in 'queued' state
    if (recommendationId) {
      try {
        await supabaseAdmin
          .from("recommendations")
          .update({
            status: "failed",
            error_message:
              err instanceof Error ? err.message : "Unhandled server error occurred during generation.",
          })
          .eq("id", recommendationId);
      } catch (cleanupErr) {
        console.error("Failed to mark recommendation as failed:", cleanupErr);
      }
    }

    return NextResponse.json(
      {
        recommendationId,
        status: "failed",
        error: "Internal server error during recommendation generation",
      },
      { status: 500 }
    );
  }
}

function buildPrPrompt(context: any, candidates: any[], resumeText: string): string {
  return `You are an expert higher-studies admissions counselor for K-GEO.
Generate an actionable, personalized admissions roadmap for the student below.

CRITICAL INSTRUCTIONS:
1. Ground your recommendations on the student's verified academic profile, achievements, test scores, and preferred countries.
2. Distinguish factual university requirements (e.g. minimum IELTS score) from profile-strengthening suggestions (e.g. research papers, internships).
3. Do not invent unrealistic requirements.
4. Output a single top-level 'roadmap_stages' array containing structured steps with stable 'task_key' strings.
5. Return ONLY a single valid JSON object with no additional text or Markdown wrapping.

STUDENT PROFILE DATA:
${JSON.stringify(context, null, 2)}

${resumeText ? "RESUME SUMMARY:\n" + resumeText + "\n" : ""}

AVAILABLE UNIVERSITY PROGRAMS CATALOG:
${JSON.stringify(
  candidates.map((c) => ({
    id: c.id,
    university: (c.universities as any)?.name,
    country: (c.universities as any)?.country,
    world_rank: (c.universities as any)?.world_rank,
    program: (c.programs as any)?.name,
    degree_type: (c.programs as any)?.degree_type,
    min_cgpa: c.min_cgpa,
    min_ielts: c.min_ielts,
  })),
  null,
  2
)}

JSON SCHEMA TO PRODUCE:
{
  "profile_summary": "Concise summary of student admissions readiness.",
  "readiness_score": 75,
  "strengths": ["Strong undergraduate academic performance in core department"],
  "priority_gaps": ["English proficiency examination target score not yet recorded"],
  "quick_wins": ["Identify target IELTS exam dates within 30 days"],
  "long_term_actions": ["Pursue an industry-oriented domain capstone project"],
  "universities": [
    {
      "university": "Institution Name",
      "program": "Program Name",
      "country": "Country",
      "category": "Target",
      "fit_score": 75,
      "why_recommended": ["Detailed justification highlighting alignment with coursework and goals."],
      "current_profile": { "cgpa": "8.2", "ielts": "None" },
      "target_profile": { "cgpa": "8.0+", "ielts": "7.0+" },
      "gaps": [
        {
          "type": "REQUIRED",
          "area": "English Proficiency",
          "current": "Not taken",
          "target": "7.0+",
          "gap_level": "Medium",
          "priority": "HIGH",
          "action": "Register for IELTS Academic"
        }
      ],
      "top_actions": ["Complete IELTS Academic with minimum band 7.0"],
      "risks": [
        { "risk": "Application deadline approaching", "mitigation": "Submit scores by target priority round" }
      ],
      "application_readiness": { "score": 70 }
    }
  ],
  "roadmap_stages": [
    {
      "id": "stage_1_assess",
      "order": 1,
      "title": "Stage 1: Assessment & Core Prerequisites",
      "description": "Establish testing schedule and confirm department eligibility.",
      "priority": "HIGH",
      "steps": [
        {
          "task_key": "ielts_exam_preparation",
          "order": 1,
          "title": "IELTS Exam Preparation and Booking",
          "description": "Prepare for target 7.0+ overall band score required by target programs.",
          "priority": "HIGH",
          "estimated_duration": "4 weeks",
          "target_outcome": "Exam Booked",
          "status": "not_started"
        }
      ],
      "university_requirements": []
    }
  ]
}
`;
}
