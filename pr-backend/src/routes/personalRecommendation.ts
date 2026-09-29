import { Router, Request, Response } from 'express';
import { z } from 'zod';
import pdf from 'pdf-parse';
import { getStudentCategory } from '../lib/courses';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { geminiClient, GEMINI_MODEL } from '../lib/gemini';

export const prGenerateRouter = Router();

const prGenerateSchema = z.object({
  studentId: z.string().uuid('studentId must be a valid UUID'),
});

function buildPrPrompt(intake: any, candidates: any[], resumeText: string): string {
  const isPreFinal = intake.year_stage === 'pre_final';

  const stageInstruction = isPreFinal
    ? "IMPORTANT: The student is in their PRE-FINAL year ('pre_final'). Any improvement_message must be phrased as a forward-looking target for their final year applications. Do NOT claim a probability based on an exam score the student hasn't taken yet or assume applications are submitted."
    : "IMPORTANT: The student is in their FINAL year ('final'). Any improvement_message must be phrased as direct, immediate feedback on their actual current academic standing and profile for immediate applications.";

  return `You are an expert AI Study-Abroad Counselor for K-GEO.
Analyse the following student profile and candidate university programs list. Select and rank up to 20 to 25 of the best-fit programs from the candidates list (if fewer than 20 candidates are in the list, select and rank all suitable candidates).
CRITICAL RULES:
1. NEVER invent or hallucinate universities or courses that are NOT in the candidate list provided below. You MUST ONLY select from the provided candidate list. Provide genuine, honest recommendations without bias.
2. You MUST categorize the programs into three probability buckets:
   - Safe/Achievable: admission_probability > 80
   - Target/Match: admission_probability between 50 and 80
   - Ambitious/Reach: admission_probability < 50
   You MUST STRICTLY include AT LEAST 5 programs in EVERY single category based on the student's choices, specialization, CGPA, and other metrics. Do not skip the Ambitious category!
3. For each selected program, provide:
   - university: exact university name from the candidate list
   - country: country from the candidate list
   - course: exact course/program name from the candidate list
   - tagline: a compelling tagline under 15 words summarizing why this program is selected
   - admission_probability: an integer from 0 to 100 representing admission chance
   - improvement_message: Specific, directive coaching referencing the student's actual numbers and resume content by name. Never generic encouragement.
4. ${stageInstruction}

STUDENT PROFILE:
- Stream: ${intake.stream}
- Year Stage: ${intake.year_stage}
- Department: ${intake.department}
- CGPA: ${intake.cgpa} (Scale: ${intake.cgpa_scale})
- Active Backlogs: ${intake.backlogs}
- 10th Grade Score: ${intake.tenth_percentage ? intake.tenth_percentage + '%' : 'N/A'}
- 12th Grade Score: ${intake.twelfth_percentage ? intake.twelfth_percentage + '%' : 'N/A'}
- Specializations: ${JSON.stringify(intake.specialization || [])}
- Preferred Countries: ${JSON.stringify(intake.preferred_countries || [])}
- Same field as UG?: ${intake.same_as_ug ? "Yes" : "No, exploring other fields"}
- Preferred Courses: ${JSON.stringify(
    (intake.preferred_courses || []).map((c: string) => `${c} (${getStudentCategory(c)})`)
  )}
- Preferred Universities: ${JSON.stringify(intake.preferred_universities || [])}
- Internships: ${intake.internships_text || "None"}
- Research/Projects: ${intake.research_text || "None"}
- Competitive Exams: ${JSON.stringify(intake.competitive_exams || [])}
- Portfolio/Project Note: ${intake.portfolio_or_project_note || 'None'}
- Other Work: ${intake.other_work_text || "None specified"}

${resumeText ? `Resume content (extracted automatically, may include formatting artifacts):\n${resumeText}\n` : ''}

CANDIDATE UNIVERSITY PROGRAMS LIST (JSON):
${JSON.stringify(
  candidates.map((c) => ({
    id: c.id,
    university: (c.universities as any)?.name,
    country: (c.universities as any)?.country,
    world_rank: (c.universities as any)?.world_rank,
    course: (c.programs as any)?.name,
    degree_type: (c.programs as any)?.degree_type,
    min_cgpa: c.min_cgpa,
    min_ielts: c.min_ielts,
    min_toefl: c.min_toefl,
    min_gre: c.min_gre,
    tuition_estimate_inr: c.tuition_estimate_inr,
  })),
  null,
  2
)}

Return ONLY valid JSON matching this exact structure:
{
  "profile_summary": "A concise 2-3 sentence summary of the student's study abroad profile and overall competitiveness.",
  "recommendations": [
    {
      "university": "University Name",
      "country": "Country",
      "course": "Program Name",
      "tagline": "Short tagline under 15 words",
      "admission_probability": 75,
      "improvement_message": "Actionable advice..."
    }
  ]
}
`;
}

prGenerateRouter.post('/recommendations/pr/generate', async (req: Request, res: Response): Promise<void> => {
  try {
    const parseResult = prGenerateSchema.safeParse(req.body);
    if (!parseResult.success) {
      console.error('Validation failed in POST /recommendations/pr/generate:', parseResult.error.issues);
      res.status(400).json({ error: 'Validation failed', details: parseResult.error.issues });
      return;
    }

    const { studentId } = parseResult.data;

    const { data: intakeRow, error: intakeError } = await supabaseAdmin
      .from('pr_intake')
      .select('*')
      .eq('student_id', studentId)
      .maybeSingle();

    if (intakeError) {
      console.error(
        'Database error fetching pr_intake in POST /recommendations/pr/generate. Error:',
        intakeError instanceof Error ? { message: intakeError.message, stack: intakeError.stack } : intakeError
      );
      res.status(500).json({ error: 'Database error while checking student intake profile' });
      return;
    }

    if (!intakeRow) {
      console.error(`No completed pr_intake found for studentId ${studentId}. Rejecting with 409.`);
      res.status(409).json({ error: 'complete the intake form first' });
      return;
    }

    // TODO: Re-enable the 7-day cooldown limit after testing AI updates
    // if (intakeRow.last_generated_at) {
    //   const lastGenerated = new Date(intakeRow.last_generated_at);
    //   const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    //   if (lastGenerated > sevenDaysAgo) {
    //     const nextAllowedDate = new Date(lastGenerated.getTime() + 7 * 24 * 60 * 60 * 1000);
    //     res.status(429).json({
    //       error: `You can only generate a recommendation once every 7 days. You can regenerate on ${nextAllowedDate.toDateString()}`
    //     });
    //     return;
    //   }
    // }

    const normalizedCgpa = (intakeRow.cgpa / intakeRow.cgpa_scale) * 10;
    let resumeText = '';
    if (intakeRow.resume_path) {
      try {
        const { data: resumeData, error: resumeError } = await supabaseAdmin.storage
          .from('student-resumes')
          .download(intakeRow.resume_path);
        
        if (resumeError) throw resumeError;
        
        const buffer = await resumeData.arrayBuffer();
        const pdfData = await pdf(Buffer.from(buffer));
        
        resumeText = pdfData.text.substring(0, 3000);
      } catch (err) {
        console.error('Failed to extract resume text:', err);
      }
    }

    let candidateQuery = supabaseAdmin
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

    if (Array.isArray(intakeRow.preferred_countries) && intakeRow.preferred_countries.length > 0) {
      candidateQuery = candidateQuery.in('universities.country', intakeRow.preferred_countries);
    }

    if (Array.isArray(intakeRow.preferred_courses) && intakeRow.preferred_courses.length > 0) {
      candidateQuery = candidateQuery.in('programs.name', intakeRow.preferred_courses);
    }

    const { data: candidatesData, error: candError } = await candidateQuery;
    if (candError) {
      console.error(
        'Error querying university_programs in generate endpoint:',
        candError instanceof Error ? { message: candError.message, stack: candError.stack } : candError
      );
    }
    
    // Shuffle the candidate pool to ensure random diversity in AI selection
    let candidates = candidatesData || [];
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }
    
    // Limit to 150 to keep prompt within context bounds while maintaining high diversity
    if (candidates.length > 150) {
      candidates = candidates.slice(0, 150);
    }

    const { data: recData, error: recError } = await supabaseAdmin
      .from('recommendations')
      .insert({
        student_id: studentId,
        type: 'PR',
        status: 'queued',
        model: GEMINI_MODEL,
      })
      .select('id')
      .single();

    if (recError || !recData) {
      console.error(
        'Failed to insert queued recommendation record in recommendations table. Error:',
        recError instanceof Error ? { message: recError.message, stack: recError.stack } : recError
      );
      res.status(500).json({ error: 'Failed to initialize recommendation record in database' });
      return;
    }

    const recommendationId = recData.id;

    let rawOutput = '';
    let succeeded = false;
    let parsedRecommendations: any[] = [];

    try {
      const prompt = buildPrPrompt(intakeRow, candidates, resumeText);
      const response = await geminiClient.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      rawOutput = response.text || '';
      const parsed = JSON.parse(rawOutput);

      if (parsed && Array.isArray(parsed.recommendations)) {
        parsedRecommendations = parsed.recommendations;
        succeeded = true;
      } else if (Array.isArray(parsed)) {
        parsedRecommendations = parsed;
        succeeded = true;
      } else {
        throw new Error('Parsed JSON does not contain recommendations array');
      }
    } catch (llmError) {
      console.error(
        'LLM generation or JSON parse failed in POST /recommendations/pr/generate. Error:',
        llmError instanceof Error ? { message: llmError.message, stack: llmError.stack } : llmError
      );
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

    if (logError) {
      console.error('Failed to write llm_call_log:', logError instanceof Error ? { message: logError.message, stack: logError.stack } : logError);
    }

    if (succeeded && parsedRecommendations.length > 0) {
      for (let idx = 0; idx < parsedRecommendations.length; idx++) {
        const rec = parsedRecommendations[idx];

        const matchedCandidate = candidates.find((c: any) => {
          const uniName = (c.universities as any)?.name || '';
          const progName = (c.programs as any)?.name || '';
          return (
            uniName.toLowerCase().trim() === (rec.university || '').toLowerCase().trim() &&
            progName.toLowerCase().trim() === (rec.course || '').toLowerCase().trim()
          );
        });

        const universityProgramId = matchedCandidate ? matchedCandidate.id : null;

        const probability = typeof rec.admission_probability === 'number' ? rec.admission_probability : 0;
        let bucket: 'Ambitious' | 'Target' | 'Achievable' = 'Target';
        if (probability < 50) {
          bucket = 'Ambitious';
        } else if (probability <= 80) {
          bucket = 'Target';
        } else {
          bucket = 'Achievable';
        }

        const { data: itemData, error: itemError } = await supabaseAdmin
          .from('recommendation_items')
          .insert({
            recommendation_id: recommendationId,
            university_program_id: universityProgramId,
            score: typeof rec.admission_probability === 'number' ? rec.admission_probability : null,
            rank: idx + 1,
            bucket: bucket,
            reason_summary: rec.tagline ? [rec.tagline] : [],
          })
          .select('id')
          .single();

        if (itemError || !itemData) {
          console.error(`Failed to insert recommendation_item at rank ${idx + 1}:`, itemError instanceof Error ? { message: itemError.message, stack: itemError.stack } : itemError);
          continue;
        }

        const { error: insightError } = await supabaseAdmin
          .from('pr_insights')
          .insert({
            recommendation_item_id: itemData.id,
            fit_score: typeof rec.admission_probability === 'number' ? rec.admission_probability : null,
            admission_probability: typeof rec.admission_probability === 'number' ? rec.admission_probability : null,
            key_reasons: rec.tagline ? [rec.tagline] : [],
            suggestions: rec.improvement_message ? [rec.improvement_message] : [],
            raw_ai_output: rec,
          });

        if (insightError) {
          console.error(`Failed to insert pr_insights for item ${itemData.id}:`, insightError instanceof Error ? { message: insightError.message, stack: insightError.stack } : insightError);
        }
      }
    }

    // 8. Update recommendations row status and return 202
    const finalStatus = succeeded ? 'completed' : 'failed';
    await supabaseAdmin
      .from('recommendations')
      .update({ status: finalStatus })
      .eq('id', recommendationId);

    if (succeeded) {
      await supabaseAdmin
        .from('pr_intake')
        .update({ last_generated_at: new Date().toISOString() })
        .eq('student_id', studentId);
    }

    res.status(202).json({ recommendationId, status: finalStatus });
  } catch (err) {
    console.error(
      'Unhandled server exception in POST /recommendations/pr/generate. Error:',
      err instanceof Error ? { message: err.message, stack: err.stack } : err
    );
    res.status(500).json({ error: 'Internal server error during recommendation generation' });
  }
});
