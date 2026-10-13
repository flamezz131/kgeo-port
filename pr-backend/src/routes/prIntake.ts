import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export const prIntakeRouter = Router();

const prIntakeSchema = z
  .object({
    studentId: z.string().uuid(),
    department: z.string().min(1, 'Department is required'),
    stream: z.enum(['engineering', 'arts']),
    yearStage: z.enum(['pre_final', 'final']),
    cgpa: z.number().min(0, 'CGPA must be >= 0'),
    cgpaScale: z.number().min(1, 'CGPA scale must be >= 1'),
    backlogs: z.number().min(0, 'Backlogs must be >= 0').default(0),
    sameAsUg: z.boolean().default(true),
    internshipsText: z.string().max(2000, 'Max 2000 characters').optional(),
    researchText: z.string().max(2000, 'Max 2000 characters').optional(),
    otherWorkText: z.string().max(2000, 'Max 2000 characters').optional(),
    resumePath: z.string().optional(),
    preferredCountries: z.array(z.string()).min(1, 'At least 1 preferred country is required'),
    preferredCourses: z.array(z.string()).min(1, 'At least 1 preferred course is required'),
    preferredUniversities: z.array(z.string()).default([]),
    specialization: z.array(z.string()).default([]),
    portfolioNote: z.string().optional(),
    tenthPercentage: z.number().min(0).max(100).optional(),
    tenthMarksheetPath: z.string().optional(),
    twelfthPercentage: z.number().min(0).max(100).optional(),
    twelfthMarksheetPath: z.string().optional(),
    competitiveExams: z.array(
      z.object({
        type: z.string(),
        status: z.enum(['not_taken', 'target', 'actual']),
        score: z.number().optional(),
      })
    ).default([]),
  })
  .refine(
    (data) => {
      if (data.yearStage === 'final') {
        const hasTarget = data.competitiveExams.some((e) => e.status === 'target');
        if (hasTarget) return false;
      }
      return true;
    },
    {
      message: 'Cannot set a target exam score in final year',
      path: ['competitiveExams'],
    }
  )
  .refine(
    (data) => !data.tenthMarksheetPath || data.tenthMarksheetPath.startsWith(`${data.studentId}/`),
    {
      message: 'tenthMarksheetPath must start with studentId/',
      path: ['tenthMarksheetPath'],
    }
  )
  .refine(
    (data) => !data.twelfthMarksheetPath || data.twelfthMarksheetPath.startsWith(`${data.studentId}/`),
    {
      message: 'twelfthMarksheetPath must start with studentId/',
      path: ['twelfthMarksheetPath'],
    }
  )
  .refine(
    (data) => !data.resumePath || data.resumePath.startsWith(`${data.studentId}/`),
    {
      message: 'resumePath must start with studentId/',
      path: ['resumePath'],
    }
  );

prIntakeRouter.post('/pr-intake', async (req: Request, res: Response): Promise<void> => {
  const parseResult = prIntakeSchema.safeParse(req.body);

  if (!parseResult.success) {
    res.status(400).json({
      error: 'Validation failed',
      details: parseResult.error.issues,
    });
    return;
  }

  const data = parseResult.data;

  if (data.tenthMarksheetPath && !data.tenthMarksheetPath.startsWith(`${data.studentId}/`)) {
    res.status(400).json({
      error: 'Validation failed',
      details: 'tenthMarksheetPath must belong to the requesting student ID.',
    });
    return;
  }

  if (data.twelfthMarksheetPath && !data.twelfthMarksheetPath.startsWith(`${data.studentId}/`)) {
    res.status(400).json({
      error: 'Validation failed',
      details: 'twelfthMarksheetPath must belong to the requesting student ID.',
    });
    return;
  }

  const payload = {
    student_id: data.studentId,
    department: data.department,
    stream: data.stream,
    year_stage: data.yearStage,
    cgpa: data.cgpa,
    cgpa_scale: data.cgpaScale,
    backlogs: data.backlogs,
    tenth_percentage: data.tenthPercentage ?? null,
    tenth_marksheet_path: data.tenthMarksheetPath ?? null,
    twelfth_percentage: data.twelfthPercentage ?? null,
    twelfth_marksheet_path: data.twelfthMarksheetPath ?? null,
    same_as_ug: data.sameAsUg,
    internships_text: data.internshipsText ?? null,
    research_text: data.researchText ?? null,
    other_work_text: data.otherWorkText ?? null,
    resume_path: data.resumePath ?? null,
    preferred_countries: data.preferredCountries,
    preferred_courses: data.preferredCourses,
    preferred_universities: data.preferredUniversities,
    specialization: data.specialization,
    portfolio_or_project_note: data.portfolioNote ?? null,
    competitive_exams: data.competitiveExams,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabaseAdmin
    .from('pr_intake')
    .upsert(payload, { onConflict: 'student_id' });

  if (error) {
    console.error('Database error in POST /pr-intake:', error);
    res.status(500).json({ error: 'Internal server error during database operation' });
    return;
  }

  res.status(201).json({ status: 'saved' });
});
