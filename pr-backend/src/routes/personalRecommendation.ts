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

const aiRecommendationItemSchema = z.object({
  university: z.string().optional(),
  country: z.string().optional(),
  course: z.string().optional(),
  degree_type: z.string().optional(),
  tagline: z.string().optional(),
  admission_probability: z.number().optional(),
  improvement_message: z.string().optional()
});

function buildPrPrompt(intake: any, resumeText: string): string {
  const isPreFinal = intake.year_stage === 'pre_final';

  const stageInstruction = isPreFinal
    ? "IMPORTANT: The student is in their PRE-FINAL year ('pre_final'). Any improvement_message must be phrased as a forward-looking target for their final year applications. Do NOT claim a probability based on an exam score the student hasn't taken yet or assume applications are submitted."
    : "IMPORTANT: The student is in their FINAL year ('final'). Any improvement_message must be phrased as direct, immediate feedback on their actual current academic standing and profile for immediate applications.";

  return `You are an expert AI Study-Abroad Counselor for K-GEO.
Analyse the following student profile and use your vast global knowledge of universities to recommend the 20 to 25 best-fit programs for this student from around the world.
CRITICAL RULES:
1. Provide genuine, honest recommendations without bias. Match the student to universities across the world that align with their profile, preferences, and scores.
2. You MUST categorize the programs into three probability buckets:
   - Safe/Achievable: admission_probability > 80
   - Target/Match: admission_probability between 50 and 80
   - Ambitious/Reach: admission_probability < 50
   You MUST STRICTLY include AT LEAST 5 programs in EVERY single category based on the student's choices, specialization, CGPA, and other metrics. Do not skip the Ambitious category!
3. For each selected program, provide:
   - university: exact university name
   - country: the country where the university is located
   - course: exact course/program name
   - degree_type: strictly one of "Bachelors", "Masters", "PhD", or "Diploma"
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
- Preferred Courses: ${JSON.stringify(intake.preferred_courses || [])}
- Preferred Universities: ${JSON.stringify(intake.preferred_universities || [])}
- Internships: ${intake.internships_text || "None"}
- Research/Projects: ${intake.research_text || "None"}
- Competitive Exams: ${JSON.stringify(intake.competitive_exams || [])}
- Portfolio/Project Note: ${intake.portfolio_or_project_note || 'None'}
- Other Work: ${intake.other_work_text || "None specified"}

${resumeText ? `Resume content (extracted automatically, may include formatting artifacts):\n${resumeText}\n` : ''}

Return ONLY valid JSON matching this exact structure:
{
  "profile_summary": "A concise 2-3 sentence summary of the student's study abroad profile and overall competitiveness.",
  "recommendations": [
    {
      "university": "University Name",
      "country": "Country",
      "course": "Program Name",
      "degree_type": "Masters",
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

    if (!intakeRow.ai_consent) {
      res.status(403).json({ error: 'AI processing consent is required' });
      return;
    }

    if (intakeRow.last_generated_at) {
      const lastGenerated = new Date(intakeRow.last_generated_at);
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      if (lastGenerated > sevenDaysAgo) {
        const nextAllowedDate = new Date(lastGenerated.getTime() + 7 * 24 * 60 * 60 * 1000);
        res.status(429).json({
          error: `You can only generate a recommendation once every 7 days. You can regenerate on ${nextAllowedDate.toDateString()}`
        });
        return;
      }
    }

    const { data: pendingRec } = await supabaseAdmin
      .from('recommendations')
      .select('id')
      .eq('student_id', studentId)
      .eq('status', 'queued')
      .maybeSingle();

    if (pendingRec) {
      res.status(429).json({ error: 'A recommendation is already being generated for this student' });
      return;
    }

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
        
        let rawResume = pdfData.text.substring(0, 3000);
        // Simple PII redaction for phone numbers and emails
        rawResume = rawResume.replace(/\b\d{10}\b/g, '[REDACTED PHONE]');
        rawResume = rawResume.replace(/[\w.-]+@[\w.-]+\.\w+/g, '[REDACTED EMAIL]');
        resumeText = rawResume;
      } catch (err) {
        console.error('Failed to extract resume text:', err);
      }
    }

    // Removed limited university candidate fetching.
    // The AI will now recommend from its global knowledge.

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
      const prompt = buildPrPrompt(intakeRow, resumeText);
      const response = await geminiClient.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: {
          responseMimeType: 'application/json',
        },
      });

      rawOutput = response.text || '';
      const parsed = JSON.parse(rawOutput);

      let extracted = [];
      if (parsed && Array.isArray(parsed.recommendations)) {
        extracted = parsed.recommendations;
      } else if (Array.isArray(parsed)) {
        extracted = parsed;
      } else {
        throw new Error('Parsed JSON does not contain recommendations array');
      }

      const validationResult = z.array(aiRecommendationItemSchema).safeParse(extracted);
      if (!validationResult.success) {
        throw new Error('AI output schema drift detected: ' + JSON.stringify(validationResult.error.issues));
      }
      
      parsedRecommendations = validationResult.data;
      succeeded = true;
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
        prompt_summary: { type: 'global_search' },
        raw_output: rawOutput,
        succeeded: succeeded,
      });

    if (logError) {
      console.error('Failed to write llm_call_log:', logError instanceof Error ? { message: logError.message, stack: logError.stack } : logError);
    }

    if (succeeded && parsedRecommendations.length > 0) {
      for (let idx = 0; idx < parsedRecommendations.length; idx++) {
        const rec = parsedRecommendations[idx];

        const uniName = (rec.university || '').trim();
        const progName = (rec.course || '').trim();
        const country = (rec.country || '').trim();
        let degreeType = (rec.degree_type || 'Masters').trim();

        if (!['Bachelors', 'Masters', 'PhD', 'Diploma'].includes(degreeType)) {
          degreeType = 'Masters';
        }

        let universityProgramId: string | null = null;

        if (uniName && progName) {
          let { data: uniData } = await supabaseAdmin
            .from('universities')
            .select('id')
            .ilike('name', uniName)
            .limit(1)
            .maybeSingle();

          if (!uniData) {
            const { data: newUni } = await supabaseAdmin
              .from('universities')
              .insert({ name: uniName, country: country || 'Unknown' })
              .select('id')
              .single();
            uniData = newUni;
          }

          let { data: progData } = await supabaseAdmin
            .from('programs')
            .select('id')
            .ilike('name', progName)
            .eq('degree_type', degreeType)
            .limit(1)
            .maybeSingle();

          if (!progData) {
            const { data: newProg } = await supabaseAdmin
              .from('programs')
              .insert({ name: progName, degree_type: degreeType })
              .select('id')
              .single();
            progData = newProg;
          }

          if (uniData?.id && progData?.id) {
            let { data: upData } = await supabaseAdmin
              .from('university_programs')
              .select('id')
              .eq('university_id', uniData.id)
              .eq('program_id', progData.id)
              .limit(1)
              .maybeSingle();

            if (!upData) {
              const { data: newUp } = await supabaseAdmin
                .from('university_programs')
                .insert({ university_id: uniData.id, program_id: progData.id })
                .select('id')
                .single();
              upData = newUp;
            }
            universityProgramId = upData?.id || null;
          }
        }

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
