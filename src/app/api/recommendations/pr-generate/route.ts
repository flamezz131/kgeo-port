/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports -- ported as-is from K-GEO-merge2; the recommendation schema is untyped. */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { GoogleGenAI } from "@google/genai";
import { loadStudentContextForPR, FormattedStudentContext } from "@/lib/recommendations/loadStudentContext";

export async function POST(request: Request) {
  // Prevent pdf-parse / pdf.js from crashing in Next.js edge/webpack environments
  if (typeof global.DOMMatrix === 'undefined') {
    (global as any).DOMMatrix = class DOMMatrix {};
  }
  const pdf = require("pdf-parse");

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const studentId = user.id;

  try {
    const studentContext = await loadStudentContextForPR(studentId, supabase);

    const supabaseAny = supabase as any;

    if (!studentContext.academic?.department || !studentContext.preferences?.preferredCountries.length) {
      return NextResponse.json({ error: 'complete the intake form first' }, { status: 409 });
    }

    // Cooldown check (7 Days)
    if (studentContext.lastPrGeneratedAt) {
      const lastGenDate = new Date(studentContext.lastPrGeneratedAt);
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - lastGenDate.getTime() < sevenDaysInMs) {
        // Find latest successful PR
        const { data: prevRec } = await supabaseAny
          .from('recommendations')
          .select('id')
          .eq('student_id', studentId)
          .eq('status', 'completed')
          .order('generated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        return NextResponse.json({
          success: true,
          source: 'stored',
          recommendationId: prevRec?.id,
          cooldown: {
            active: true,
            generatedAt: studentContext.lastPrGeneratedAt,
            nextGenerationAt: new Date(lastGenDate.getTime() + sevenDaysInMs).toISOString()
          }
        }, { status: 202 });
      }
    }

    const normalizedCgpa = studentContext.academic?.cgpa || 0;
    let resumeText = '';
    if (studentContext.resumePath) {
      try {
        const { data: resumeData, error: resumeError } = await supabaseAny.storage
          .from('student-resumes')
          .download(studentContext.resumePath);
        
        if (resumeError) throw resumeError;
        
        const buffer = await resumeData.arrayBuffer();
        const pdfFn = pdf.default || pdf;
        const pdfData = await pdfFn(Buffer.from(buffer));
        resumeText = pdfData.text.substring(0, 3000);
      } catch (err) {
        console.error('Failed to extract resume text:', err);
      }
    }

    let candidateQuery = supabaseAny
      .schema('recommendation')
      .from('university_programs')
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
      candidateQuery = candidateQuery.in('universities.country', studentContext.preferences.preferredCountries);
    }

    if (studentContext.preferences?.preferredCourses?.length > 0) {
      candidateQuery = candidateQuery.in('programs.name', studentContext.preferences.preferredCourses);
    }

    const { data: candidatesData, error: candError } = await candidateQuery;
    if (candError) console.error('Error querying candidates:', candError);
    
    let candidates = candidatesData || [];
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    if (candidates.length > 150) {
      candidates = candidates.slice(0, 150);
    }

    const geminiModel = "gemini-3.6-flash";
    const { data: recData, error: recError } = await supabaseAdmin
      .from('recommendations')
      .insert({
        student_id: studentId,
        type: 'PR',
        status: 'queued',
        model: geminiModel,
        profile_snapshot: studentContext,
      })
      .select('id')
      .single();

    if (recError || !recData) {
      console.error('Failed to insert queued recommendation:', recError);
      return NextResponse.json({ error: 'Failed to initialize recommendation' }, { status: 500 });
    }

    const recommendationId = recData.id;
    let rawOutput = '';
    let succeeded = false;
    let parsedData: any = null;

    try {
      const prompt = buildPrPrompt(studentContext, candidates, resumeText);
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const response = await ai.models.generateContent({
        model: geminiModel,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      rawOutput = response.text || '';
      parsedData = JSON.parse(rawOutput);

      if (parsedData && Array.isArray(parsedData.universities)) {
        succeeded = true;
      } else {
        throw new Error('Parsed JSON does not contain universities array');
      }
    } catch (llmError) {
      console.error('LLM generation failed:', llmError);
      succeeded = false;
    }

    const { error: logError } = await supabaseAdmin
      .from('llm_call_log')
      .insert({
        recommendation_id: recommendationId,
        prompt_summary: { candidateCount: candidates.length },
        raw_output: rawOutput,
        succeeded: succeeded,
      });

    if (logError) console.error('Failed to write llm_call_log:', logError);

    if (succeeded && parsedData) {
      // 1. Fetch old tasks to preserve progress
      const { data: previousRec } = await supabaseAdmin
        .from('recommendations')
        .select('id')
        .eq('student_id', studentId)
        .neq('id', recommendationId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let oldTasks: any[] = [];
      if (previousRec) {
        const { data: ot } = await supabaseAdmin
          .from('student_roadmap_tasks')
          .select('*')
          .eq('recommendation_id', previousRec.id);
        if (ot) oldTasks = ot;
      }

      const matchedOldTaskIds = new Set<string>();

      // 2. Save top-level development plan
      await supabaseAdmin
        .from('development_plans')
        .insert({
          recommendation_id: recommendationId,
          readiness_score: parsedData.readiness_score || null,
          strengths: parsedData.strengths || [],
          priority_gaps: parsedData.priority_gaps || [],
          quick_wins: parsedData.quick_wins || [],
          long_term_actions: parsedData.long_term_actions || [],
        });

      // 3. Process each university and its roadmap
      for (let idx = 0; idx < parsedData.universities.length; idx++) {
        const rec = parsedData.universities[idx];
        const matchedCandidate = candidates.find((c: any) => {
          const uniName = (c.universities as any)?.name || '';
          const progName = (c.programs as any)?.name || '';
          return (
            uniName.toLowerCase().trim() === (rec.university || '').toLowerCase().trim() &&
            progName.toLowerCase().trim() === (rec.program || '').toLowerCase().trim()
          );
        });

        const universityProgramId = matchedCandidate ? matchedCandidate.id : null;
        let bucket: 'Ambitious' | 'Target' | 'Achievable' = 'Target';
        const probability = rec.fit_score || 0;
        if (probability < 50) bucket = 'Ambitious';
        else if (probability <= 80) bucket = 'Target';
        else bucket = 'Achievable';

        const { data: itemData, error: itemError } = await supabaseAdmin
          .from('recommendation_items')
          .insert({
            recommendation_id: recommendationId,
            university_program_id: universityProgramId,
            score: probability,
            rank: idx + 1,
            bucket: bucket,
            reason_summary: rec.why_recommended ? [rec.why_recommended[0]] : [],
          })
          .select('id')
          .single();

        if (itemError || !itemData) {
          console.error(`Failed to insert item at rank ${idx + 1}:`, itemError);
          continue;
        }

        // Insert pr_insights
        await supabaseAdmin
          .from('pr_insights')
          .insert({
            recommendation_item_id: itemData.id,
            fit_score: probability,
            admission_probability: probability,
            why_recommended: rec.why_recommended || [],
            current_profile: rec.current_profile || {},
            target_profile: rec.target_profile || {},
            gaps: rec.gaps || [],
            top_actions: rec.top_actions || [],
            detailed_roadmap: rec.roadmap || [],
            risks: rec.risks || [],
            application_readiness: rec.application_readiness || {},
            raw_ai_output: rec,
          });

        // We no longer insert tasks per-university here. They will be inserted globally later.
        if (rec.roadmap && Array.isArray(rec.roadmap)) {
          // Backward compatibility if AI still outputs it, but we instruct it not to.
          // We will rely on roadmap_stages instead.
        }
      }

      // 4. Process global deduplicated roadmap stages
      if (parsedData.roadmap_stages && Array.isArray(parsedData.roadmap_stages)) {
        for (const stage of parsedData.roadmap_stages) {
          const stageTitle = stage.title || "General Stage";
          const stagePhase = stage.order || 1;
          const stageDesc = stage.description || "";
          const stagePriority = stage.priority || "MEDIUM";
          const uniReqs = stage.university_requirements || [];

          if (Array.isArray(stage.steps)) {
            for (const step of stage.steps) {
              const taskKey = step.task_key || step.title.toLowerCase().replace(/\s+/g, '_');
              
              // Look for existing task progress across any previous tasks with same key
              const oldTask = oldTasks.find(ot => ot.task_key === taskKey);
              let status = 'not_started';
              
              if (oldTask) {
                status = oldTask.status;
                matchedOldTaskIds.add(oldTask.id);
              }

              // Encode rich metadata into description for the frontend
              const richDescription = JSON.stringify({
                is_rich_format: true,
                stage_id: stage.id || stage.stage_id || "stage",
                stage_description: stageDesc,
                stage_priority: stagePriority,
                step_description: step.description || "",
                step_order: step.order || 1,
                university_requirements: uniReqs
              });

              await supabaseAdmin
                .from('student_roadmap_tasks')
                .insert({
                  student_id: studentId,
                  recommendation_id: recommendationId,
                  university_program_id: null, // Global step
                  task_key: taskKey,
                  category: stageTitle,
                  title: step.title,
                  description: richDescription,
                  priority: step.priority || 'MEDIUM',
                  status: status,
                  target_outcome: step.expected_outcome || step.target_outcome || '',
                  estimated_duration: step.estimated_duration || '',
                  phase: stagePhase
                });
            }
          }
        }
      }

      // Carry over unmatched old tasks
      for (const oldTask of oldTasks) {
        if (!matchedOldTaskIds.has(oldTask.id)) {
          const newStatus = oldTask.status === 'completed' ? 'completed' : 'archived';
          await supabaseAdmin
            .from('student_roadmap_tasks')
            .insert({
              student_id: studentId,
              recommendation_id: recommendationId,
              university_program_id: oldTask.university_program_id,
              task_key: oldTask.task_key,
              category: oldTask.category,
              title: oldTask.title,
              description: oldTask.description,
              priority: oldTask.priority,
              status: newStatus,
              target_outcome: oldTask.target_outcome,
              estimated_duration: oldTask.estimated_duration,
              phase: oldTask.phase
            });
        }
      }
    }

    const finalStatus = succeeded ? 'completed' : 'failed';
    await supabaseAdmin
      .from('recommendations')
      .update({ status: finalStatus })
      .eq('id', recommendationId);

    if (succeeded) {
      await supabaseAdmin
        .schema('public')
        .from('student_profiles')
        .update({ last_pr_generated_at: new Date().toISOString() })
        .eq('student_id', studentId);
    }

    return NextResponse.json({ recommendationId, status: finalStatus }, { status: 202 });
  } catch (err) {
    console.error('Unhandled server exception in PR Generate:', err);
    return NextResponse.json({ error: 'Internal server error during recommendation generation' }, { status: 500 });
  }
}

function buildPrPrompt(context: any, candidates: any[], resumeText: string): string {
  return `You are an expert AI Study-Abroad Counselor for K-GEO.
Transform this recommendation into a TRUE PERSONALIZED HIGHER-STUDIES ROADMAP focused on UNIVERSITY ADMISSIONS READINESS.

CRITICAL RULES:
1. DO NOT HALLUCINATE STUDENT DATA. Focus on academics, achievements, experience, projects, and test scores explicitly in their profile. If information is missing (e.g. no internships, no research), explicitly identify this as a profile-development gap if relevant to their target program.
2. DO NOT INVENT UNIVERSITY REQUIREMENTS. Only claim a university requires something if it is a factual admission requirement (like IELTS/TOEFL). For other areas (like internships or research), state that it "could strengthen your profile". Differentiate FACTUAL REQUIREMENT vs PROFILE STRENGTHENING RECOMMENDATION.
3. AVOID GENERIC ADVICE. Never just say "Take IELTS" or "Improve profile". Explain WHY. E.g., "Complete IELTS Academic Examination - required to demonstrate English proficiency for your target university."
4. GAP CATEGORIES: Distinguish requirements from profile gaps. For every institution/program, classify gap findings strictly as: "REQUIRED" (e.g., IELTS), "PROFILE_GAP", "PROFILE_STRENGTHENING" (e.g., Internships, Research), or "APPLICATION_PREPARATION" (e.g., SOP, LOR).
5. GLOBAL STAGE-BASED ROADMAP: Create a SINGLE top-level 'roadmap_stages' array. The roadmap must reflect profile gaps and communicate progression. Do not simply repeat the same task across stages. E.g. Phase 1 - Assess & Prepare -> Phase 2 - Build Profile -> Phase 3 - Application Preparation.
6. STABLE TASK KEYS: For every step, generate a 'task_key' (a short, stable snake_case identifier).
7. UNIVERSITY REQUIREMENTS: Inside each stage, include a 'university_requirements' array linking the recommended programs to the stage.
8. IELTS/TESTS HANDLING: IELTS must be recommended if required, but as an application requirement, not the only thing they need to improve. If they lack internships/research, prioritize building those practical skills in the roadmap.

STUDENT PROFILE (JSON):
${JSON.stringify(context, null, 2)}

${resumeText ? 'Resume content (extracted automatically):\\n' + resumeText + '\\n' : ''}

CANDIDATE UNIVERSITY PROGRAMS LIST (JSON):
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

Return ONLY valid JSON matching this EXACT structure:
{
  "profile_summary": "A concise 2-3 sentence summary evaluating their university admissions readiness.",
  "readiness_score": 72,
  "strengths": ["string"],
  "priority_gaps": ["string"],
  "quick_wins": ["string"],
  "long_term_actions": ["string"],
  "universities": [
    {
      "university": "Exact name from candidate list",
      "program": "Exact program name from candidate list",
      "country": "Country",
      "category": "Target / Achievable / Ambitious",
      "fit_score": 75,
      "why_recommended": ["Detailed reasoning integrating profile strengths and specific university expectations."],
      "current_profile": { "cgpa": "...", "research": "...", "ielts": "..." },
      "target_profile": { "cgpa": "...", "research": "...", "ielts": "..." },
      "gaps": [
        { "type": "PROFILE_STRENGTHENING", "area": "Research", "current": "None", "target": "1 paper", "gap_level": "High", "priority": "HIGH", "action": "Seek a faculty-led research project" }
      ],
      "top_actions": ["1. ...", "2. ..."],
      "risks": [
        { "risk": "No Internship", "mitigation": "Complete a domain-relevant internship before applying." }
      ],
      "application_readiness": { "score": 60, "breakdown": "Academics 80, Projects 50..." }
    }
  ],
  "roadmap_stages": [
    {
      "id": "assess_prepare",
      "order": 1,
      "title": "STAGE 1 - Assess & Prepare",
      "description": "Evaluate admission requirements and plan initial preparation.",
      "priority": "HIGH",
      "steps": [
        {
          "task_key": "confirm_ielts_req",
          "order": 1,
          "title": "Confirm IELTS Requirement",
          "description": "Your target program requires an English proficiency score. Understand the target score needed.",
          "priority": "HIGH",
          "estimated_duration": "1 week",
          "target_outcome": "Target Score Identified",
          "status": "not_started"
        }
      ],
      "university_requirements": [
        { "university": "Target Uni", "program": "MS CS", "requirement": "IELTS 7.0+" }
      ]
    },
    {
      "id": "build_profile",
      "order": 2,
      "title": "STAGE 2 - Build Profile",
      "description": "Strengthen missing practical and academic experiences.",
      "priority": "HIGH",
      "steps": [
        {
          "task_key": "domain_internship",
          "order": 1,
          "title": "Complete a Domain-Relevant Internship",
          "description": "Your profile currently has limited industry experience. An internship could strengthen your application.",
          "priority": "HIGH",
          "estimated_duration": "3 months",
          "target_outcome": "Internship Completed",
          "status": "not_started"
        }
      ],
      "university_requirements": []
    }
  ]
}
`;
}

