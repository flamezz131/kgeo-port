# K-GEO Personal Recommendation — Intake Wizard, Gemini Generation, and Results Page
### Full plan and low-level implementation

---

## PART A — Product plan (read this before any code)

### A1. The new tab

Third card on the student dashboard, next to "Check Eligibility" and "Book Consultation": **"Get My Personalized Roadmap."** First click ever → intake wizard. Every click after that → straight to the results page (no need to refill unless the student explicitly clicks "Update my details").

### A2. The wizard, step by step

| Step | What's asked | Notes |
|---|---|---|
| 1. Basics | Student ID (hidden, pulled from session — never a visible input), name, department, current year — pre-filled from their existing profile, shown read-only with an "edit in profile" link rather than re-asking | Don't make them retype what you already have |
| 2. Academics & experience | CGPA (+ scale), active backlogs, internships (Company, Duration, and Work Details fields cleanly mapped into `internships_text`), research/projects (`research_text`), and other achievements (`other_work_text`). | Clean UI mapping that compiles strictly text-based summaries for the LLM prompt |
| 3. Preferences | Preferred countries (multi-select chips), preferred courses (multi-select chips mapped to `src/lib/courses.ts` static catalog), preferred universities (free-text multi-add, optional wishlist — doesn't need to match your DB exactly) | Multi-select as tappable chips, not a dropdown — much friendlier on mobile |
| 4a. Engineering branch (shown only if department maps to engineering) | Specialization interest (AI/ML, Core, CS, Electronics, etc. — multi-select), whether they've done a major project | |
| 4b. Arts branch (shown only if department maps to arts/humanities/commerce) | Specialization interest (Literature, Psychology, Economics, Design, etc. — multi-select), portfolio/publication link (optional) | |
| 5. Competitive exam score — **branches by year** | Uses `competitive_exams` array replacing the legacy `exam_status` constraint. **Pre-final year**: Target scores for exams. **Final year**: Actual scores. | |
| 6. Submit | Writes one row to `pr_intake`, immediately kicks off Gemini generation with a "Building your roadmap..." loading state. Submit is isolated from `Enter` keypress via `<div>` decoupling to prevent premature generation. | |

### A3. The results page

- Hero strip: student's name + "Your Personalized Roadmap" + a one-line AI-written summary of their overall profile strength.
- A responsive grid of 20-25 cards, each showing: university name, country flag, course name, the AI's one-line tagline, a Safe/Match/Reach badge, and — depending on year — either "Target to aim for" (pre-final) or "Your estimated fit: X%" plus specific improvement bullets (final year).
- A "Regenerate" button, rate-limited (e.g. once per 7 days, or after they update their intake) — Gemini calls cost quota, don't let a bored click burn it.

---

## PART B — Database schema additions

Run in Supabase SQL Editor (same process as before: Table Editor → check nothing conflicts → SQL Editor → New query → paste → Run → verify in Table Editor).

```sql
create table public.pr_intake (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references auth.users(id),

  department text not null,
  stream text not null check (stream in ('engineering','arts')),
  year_stage text not null check (year_stage in ('pre_final','final')),

  cgpa numeric not null,
  cgpa_scale numeric not null default 10,
  backlogs int not null default 0,

  internships jsonb not null default '[]',
  research_papers jsonb not null default '[]',

  preferred_countries text[] not null default '{}',
  preferred_courses text[] not null default '{}',
  preferred_universities text[] not null default '{}',

  specialization text[] not null default '{}',
  portfolio_or_project_note text,

  exam_type text check (exam_type in ('IELTS','TOEFL','GRE','GMAT','none')),
  exam_status text not null check (exam_status in ('not_taken','target','actual')),
  exam_score numeric,

  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pr_intake enable row level security;

create policy "students manage own intake" on public.pr_intake
  for all using (student_id = auth.uid());
```

This is intentionally a single table (matches your request), using `jsonb` arrays for the repeatable internship/research entries rather than separate child tables — simpler to build and query for this scale, and easy to upgrade to child tables later if you ever need to query "students with 3+ internships" directly.

You already have `recommendations`, `recommendation_items`, and `pr_insights` from the earlier build — PR generation writes into those same tables with `type = 'PR'`, so nothing new needed there.

---

## PART C — Gemini prompt design

The prompt needs to do three things at once: pick 20-25 good matches, write a tagline for each, and phrase the improvement guidance differently for pre-final vs final year. Put all three instructions directly in the prompt — don't try to post-process the tone afterward.

```
System framing:
You are an admissions counselor's assistant for K-GEO, an Indian college's
study-abroad guidance platform. You write encouraging, honest, specific
advice for students — never generic filler, never guarantees of admission.

Student profile:
- Stream: {engineering|arts}, Year stage: {pre_final|final}
- CGPA: {cgpa}/{cgpa_scale}
- Backlogs: {backlogs}
- Internships: {internships summary}
- Research papers: {research_papers summary}
- Specialization interests: {specialization}
- Preferred countries: {preferred_countries}
- Preferred courses: {preferred_courses}
- Wishlist universities (if any): {preferred_universities}
- Competitive exam: {exam_type}, status: {exam_status}, score: {exam_score or "not yet"}

Candidate universities (already filtered by country/course/hard eligibility —
pick and rank from ONLY this list, do not invent universities not listed):
{JSON list of ~50-60 candidates from university_programs, output of your rule engine}

Task:
Select and rank the 20 to 25 best-fit university-course combinations from the
candidate list above. For each one, write:
- a one-line tagline (under 15 words, specific to why THIS student fits THIS program)
- a fit bucket: "Safe", "Match", or "Reach"
- an admission_probability estimate (0-100)
- an improvement_message:
  - IF year_stage is "pre_final": phrase as a forward-looking target,
    e.g. "Aim for a 7.5 IELTS and one more internship in ML to strengthen this."
    Never claim a probability based on a score they haven't taken yet.
  - IF year_stage is "final": phrase as feedback on their actual standing,
    e.g. "Your 8.2 CGPA covers the requirement; a research publication would
    push you from Match to Safe here."

Return ONLY valid JSON, no prose outside the JSON, in this exact shape:
{
  "profile_summary": string,
  "recommendations": [
    {
      "university": string,
      "country": string,
      "course": string,
      "tagline": string,
      "fit_bucket": "Safe" | "Match" | "Reach",
      "admission_probability": number,
      "improvement_message": string
    }
  ]
}
```

Build this as a template string in code (not hardcoded per request) — fill in the `{...}` placeholders from the real `pr_intake` row and the pre-filtered candidate list.

---

## PART D — Backend (`kgeo-backend`) implementation

### D1. Intake route

`src/routes/prIntake.ts`:
```typescript
import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';

export const prIntakeRouter = Router();

const internshipSchema = z.object({
  company: z.string(),
  domain: z.string(),
  durationMonths: z.number().optional(),
});
const researchSchema = z.object({
  title: z.string(),
  domain: z.string(),
  status: z.enum(['published', 'in_progress', 'submitted']).optional(),
});

const intakeSchema = z.object({
  studentId: z.string().uuid(),
  department: z.string(),
  stream: z.enum(['engineering', 'arts']),
  yearStage: z.enum(['pre_final', 'final']),
  cgpa: z.number().min(0),
  cgpaScale: z.number().min(1),
  backlogs: z.number().min(0).default(0),
  internships: z.array(internshipSchema).default([]),
  researchPapers: z.array(researchSchema).default([]),
  preferredCountries: z.array(z.string()).min(1),
  preferredCourses: z.array(z.string()).min(1),
  preferredUniversities: z.array(z.string()).default([]),
  specialization: z.array(z.string()).default([]),
  portfolioNote: z.string().optional(),
  examType: z.enum(['IELTS', 'TOEFL', 'GRE', 'GMAT', 'none']),
  examStatus: z.enum(['not_taken', 'target', 'actual']),
  examScore: z.number().optional(),
}).refine(
  (data) => !(data.yearStage === 'final' && data.examStatus === 'target'),
  { message: 'final-year students must report actual or not_taken, not a target score' }
);

prIntakeRouter.post('/pr-intake', async (req, res) => {
  const parsed = intakeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;

  const { error } = await supabaseAdmin.from('pr_intake').upsert({
    student_id: d.studentId,
    department: d.department,
    stream: d.stream,
    year_stage: d.yearStage,
    cgpa: d.cgpa,
    cgpa_scale: d.cgpaScale,
    backlogs: d.backlogs,
    internships: d.internships,
    research_papers: d.researchPapers,
    preferred_countries: d.preferredCountries,
    preferred_courses: d.preferredCourses,
    preferred_universities: d.preferredUniversities,
    specialization: d.specialization,
    portfolio_or_project_note: d.portfolioNote ?? null,
    exam_type: d.examType,
    exam_status: d.examStatus,
    exam_score: d.examScore ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'student_id' });

  if (error) return res.status(500).json({ error: 'failed to save intake' });
  return res.status(201).json({ status: 'saved' });
});
```

The `refine()` check is the server-side enforcement of the year/exam branching rule — never trust the frontend alone to have hidden the wrong field; a final-year student calling the API directly (or a bug in the UI) shouldn't be able to submit a "target" score.

### D2. PR generation route

`src/routes/personalRecommendationV2.ts`:
```typescript
import { Router } from 'express';
import { z } from 'zod';
import { supabaseAdmin } from '../lib/supabaseAdmin';
import { genai, GEMINI_MODEL } from '../lib/gemini';

export const prGenerateRouter = Router();

prGenerateRouter.post('/recommendations/pr/generate', async (req, res) => {
  const { studentId } = z.object({ studentId: z.string().uuid() }).parse(req.body);

  const { data: intake } = await supabaseAdmin
    .from('pr_intake').select('*').eq('student_id', studentId).single();
  if (!intake) return res.status(409).json({ error: 'complete the intake form first' });

  const { data: candidates } = await supabaseAdmin
    .from('university_programs')
    .select('*, universities(name, country), programs(name, degree_type)')
    .in('universities.country', intake.preferred_countries)
    .lte('min_cgpa', intake.cgpa / intake.cgpa_scale * 10)
    .limit(60);

  const { data: recRow } = await supabaseAdmin
    .from('recommendations')
    .insert({ student_id: studentId, type: 'PR', status: 'queued' })
    .select().single();

  const prompt = buildPrPrompt(intake, candidates ?? []);

  let parsed: any;
  let succeeded = true;
  let rawOutput = '';
  try {
    const response = await genai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: { responseMimeType: 'application/json' },
    });
    rawOutput = response.text ?? '';
    parsed = JSON.parse(rawOutput);
  } catch {
    succeeded = false;
    parsed = { profile_summary: '', recommendations: [] };
  }

  await supabaseAdmin.from('llm_call_log').insert({
    recommendation_id: recRow!.id,
    prompt_summary: { candidateCount: candidates?.length ?? 0 },
    raw_output: rawOutput,
    succeeded,
  });

  for (const [i, item] of (parsed.recommendations ?? []).entries()) {
    const match = candidates?.find(
      (c: any) => c.universities?.name === item.university && c.programs?.name === item.course
    );
    const { data: itemRow } = await supabaseAdmin.from('recommendation_items').insert({
      recommendation_id: recRow!.id,
      university_program_id: match?.id ?? null,
      score: item.admission_probability,
      rank: i + 1,
      bucket: item.fit_bucket,
      reason_summary: [item.tagline],
    }).select().single();

    await supabaseAdmin.from('pr_insights').insert({
      recommendation_item_id: itemRow!.id,
      fit_score: item.admission_probability,
      admission_probability: item.admission_probability,
      key_reasons: [item.tagline],
      suggestions: [item.improvement_message],
      raw_ai_output: item,
    });
  }

  await supabaseAdmin.from('recommendations')
    .update({ status: succeeded ? 'completed' : 'failed' })
    .eq('id', recRow!.id);

  return res.status(202).json({ recommendationId: recRow!.id, status: succeeded ? 'completed' : 'failed' });
});

function buildPrPrompt(intake: any, candidates: any[]): string {
  const candidateList = candidates.map((c) => ({
    university: c.universities?.name,
    country: c.universities?.country,
    course: c.programs?.name,
    min_cgpa: c.min_cgpa,
    min_ielts: c.min_ielts,
  }));

  return `You are an admissions counselor's assistant for K-GEO, an Indian college's study-abroad guidance platform. Write encouraging, honest, specific advice — never generic filler, never guarantee admission.

Student profile:
Stream: ${intake.stream}, Year stage: ${intake.year_stage}
CGPA: ${intake.cgpa}/${intake.cgpa_scale}
Backlogs: ${intake.backlogs}
Internships: ${JSON.stringify(intake.internships)}
Research papers: ${JSON.stringify(intake.research_papers)}
Specialization interests: ${intake.specialization.join(', ')}
Preferred countries: ${intake.preferred_countries.join(', ')}
Preferred courses: ${intake.preferred_courses.join(', ')}
Wishlist universities: ${intake.preferred_universities.join(', ') || 'none specified'}
Competitive exam: ${intake.exam_type}, status: ${intake.exam_status}, score: ${intake.exam_score ?? 'not yet'}

Candidate universities (pick and rank ONLY from this list, do not invent any):
${JSON.stringify(candidateList)}

Select and rank the 20 to 25 best-fit combinations. For each, write a tagline
(under 15 words), a fit_bucket (Safe/Match/Reach), an admission_probability
(0-100), and an improvement_message. If year_stage is "pre_final", phrase the
improvement_message as a forward-looking target — never claim a probability
based on a score not yet taken. If year_stage is "final", phrase it as
feedback on their actual current standing.

Return ONLY valid JSON in this shape, nothing else:
{"profile_summary": string, "recommendations": [{"university": string, "country": string, "course": string, "tagline": string, "fit_bucket": "Safe"|"Match"|"Reach", "admission_probability": number, "improvement_message": string}]}`;
}
```

Wire both routers into `src/index.ts` the same way as before (`app.use('/api', verifyInternalSecret, prIntakeRouter)`, etc.).

---

## PART E — Frontend: the wizard

This lives in `kgeo-web`. One parent component holding step state, showing/hiding steps based on `stream` and `yearStage` — both of which you already have on the student's profile, so pre-fill them and let branch logic run automatically rather than asking "are you engineering or arts" as a separate question.

`kgeo-web/src/app/student/pr/intake/PrIntakeWizard.tsx`:
```tsx
'use client';
import { useState } from 'react';

type Stream = 'engineering' | 'arts';
type YearStage = 'pre_final' | 'final';

interface IntakeState {
  cgpa: string;
  cgpaScale: string;
  backlogs: string;
  internships: { company: string; domain: string; durationMonths?: number }[];
  researchPapers: { title: string; domain: string }[];
  preferredCountries: string[];
  preferredCourses: string[];
  preferredUniversities: string[];
  specialization: string[];
  portfolioNote: string;
  examType: string;
  examStatus: 'not_taken' | 'target' | 'actual';
  examScore: string;
}

const ENGINEERING_SPECIALIZATIONS = ['AI/ML', 'Core mechanical', 'Computer science', 'Electronics', 'Civil'];
const ARTS_SPECIALIZATIONS = ['Literature', 'Psychology', 'Economics', 'Design', 'Media studies'];
const COUNTRY_OPTIONS = ['Germany', 'Canada', 'Ireland', 'UK', 'Australia', 'USA'];

export default function PrIntakeWizard({ stream, yearStage }: { stream: Stream; yearStage: YearStage }) {
  const [step, setStep] = useState(1);
  const [state, setState] = useState<IntakeState>({
    cgpa: '', cgpaScale: '10', backlogs: '0',
    internships: [], researchPapers: [],
    preferredCountries: [], preferredCourses: [], preferredUniversities: [],
    specialization: [], portfolioNote: '',
    examType: 'none',
    examStatus: yearStage === 'final' ? 'actual' : 'target',
    examScore: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setErrorMsg] = useState<string | null>(null);

  const toggleChip = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  async function handleSubmit() {
    setSubmitting(true);
    setErrorMsg(null);
    const res = await fetch('/api/recommendations/pr-intake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department: stream, stream, yearStage,
        cgpa: parseFloat(state.cgpa), cgpaScale: parseFloat(state.cgpaScale),
        backlogs: parseInt(state.backlogs, 10),
        internships: state.internships,
        researchPapers: state.researchPapers,
        preferredCountries: state.preferredCountries,
        preferredCourses: state.preferredCourses,
        preferredUniversities: state.preferredUniversities,
        specialization: state.specialization,
        portfolioNote: state.portfolioNote,
        examType: state.examType,
        examStatus: state.examStatus,
        examScore: state.examScore ? parseFloat(state.examScore) : undefined,
      }),
    });
    setSubmitting(false);
    if (!res.ok) return setErrorMsg('Something went wrong saving your details. Please try again.');
    window.location.href = '/student/pr/generating';
  }

  const specializationOptions = stream === 'engineering' ? ENGINEERING_SPECIALIZATIONS : ARTS_SPECIALIZATIONS;

  return (
    <div className="max-w-xl mx-auto p-6">
      {step === 1 && (
        <div>
          <h2 className="text-lg font-medium mb-4">Academics and experience</h2>
          <label className="block mb-2 text-sm text-[#64748B]">CGPA</label>
          <input className="w-full border border-[#DCE6F2] rounded-lg p-2 mb-4"
            type="number" step="0.01" value={state.cgpa}
            onChange={(e) => setState({ ...state, cgpa: e.target.value })} />
          <button className="bg-[#1D4ED8] text-white rounded-lg px-4 py-2" onClick={() => setStep(2)}>
            Next
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h2 className="text-lg font-medium mb-4">Preferences</h2>
          <p className="text-sm text-[#64748B] mb-2">Preferred countries</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {COUNTRY_OPTIONS.map((c) => (
              <button key={c}
                className={`px-3 py-1 rounded-full border text-sm ${
                  state.preferredCountries.includes(c)
                    ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                    : 'bg-white text-[#0F172A] border-[#DCE6F2]'
                }`}
                onClick={() => setState({ ...state, preferredCountries: toggleChip(state.preferredCountries, c) })}>
                {c}
              </button>
            ))}
          </div>
          <button className="bg-[#1D4ED8] text-white rounded-lg px-4 py-2" onClick={() => setStep(3)}>
            Next
          </button>
        </div>
      )}

      {step === 3 && (
        <div>
          <h2 className="text-lg font-medium mb-4">
            {stream === 'engineering' ? 'Engineering focus' : 'Arts focus'}
          </h2>
          <div className="flex flex-wrap gap-2 mb-4">
            {specializationOptions.map((s) => (
              <button key={s}
                className={`px-3 py-1 rounded-full border text-sm ${
                  state.specialization.includes(s)
                    ? 'bg-[#1D4ED8] text-white border-[#1D4ED8]'
                    : 'bg-white text-[#0F172A] border-[#DCE6F2]'
                }`}
                onClick={() => setState({ ...state, specialization: toggleChip(state.specialization, s) })}>
                {s}
              </button>
            ))}
          </div>
          <button className="bg-[#1D4ED8] text-white rounded-lg px-4 py-2" onClick={() => setStep(4)}>
            Next
          </button>
        </div>
      )}

      {step === 4 && (
        <div>
          <h2 className="text-lg font-medium mb-4">Competitive exam</h2>
          {yearStage === 'pre_final' ? (
            <>
              <p className="text-sm text-[#64748B] mb-2">Optional — what score are you targeting?</p>
              <input className="w-full border border-[#DCE6F2] rounded-lg p-2 mb-4"
                type="number" placeholder="e.g. 7.5"
                value={state.examScore}
                onChange={(e) => setState({ ...state, examScore: e.target.value, examStatus: 'target' })} />
            </>
          ) : (
            <>
              <p className="text-sm text-[#64748B] mb-2">Have you taken it? Enter your actual score.</p>
              <input className="w-full border border-[#DCE6F2] rounded-lg p-2 mb-4"
                type="number" placeholder="e.g. 7.5"
                value={state.examScore}
                onChange={(e) => setState({ ...state, examScore: e.target.value, examStatus: 'actual' })} />
              <button className="text-sm text-[#64748B] underline mb-4"
                onClick={() => setState({ ...state, examScore: '', examStatus: 'not_taken' })}>
                Haven't taken it yet
              </button>
            </>
          )}
          {error && <p className="text-sm text-red-600 mb-2">{error}</p>}
          <button disabled={submitting} className="bg-[#1D4ED8] text-white rounded-lg px-4 py-2 disabled:opacity-50"
            onClick={handleSubmit}>
            {submitting ? 'Saving...' : 'Get my roadmap'}
          </button>
        </div>
      )}
    </div>
  );
}
```

This is a trimmed skeleton (steps 1-3 shown in full detail, condensed for internships/research/wishlist which repeat the same "+ Add another" pattern) — enough for you to see the branching mechanics and extend. Steps for internships/research papers follow the same repeatable-array pattern; ask me for that specific block if you want it spelled out too.

### The proxy route handler

`kgeo-web/src/app/api/recommendations/pr-intake/route.ts` — identical shape to the BR proxy from before: get the logged-in user, attach `studentId` server-side, forward to `kgeo-backend` with the internal secret. Don't rewrite this from scratch — copy the BR proxy route and swap the path and body.

---

## PART F — Frontend: the results page, with the image treatment

```tsx
function UniversityCard({ item, yearStage }: { item: any; yearStage: 'pre_final' | 'final' }) {
  const initials = item.university.split(' ').map((w: string) => w[0]).slice(0, 2).join('');
  const flagEmoji = countryToFlag(item.country); // small lookup table, e.g. { Germany: '🇩🇪', ... }

  const bucketColor = {
    Safe: 'bg-[#EFF6FF] text-[#1D4ED8]',
    Match: 'bg-[#EFF6FF] text-[#0B1F3A]',
    Reach: 'bg-[#EFF6FF] text-[#64748B]',
  }[item.fit_bucket];

  return (
    <div className="rounded-2xl border border-[#DCE6F2] overflow-hidden bg-white shadow-sm">
      <div className="h-24 bg-[#0B1F3A] flex items-center justify-center">
        <span className="text-white text-2xl font-medium">{initials}</span>
      </div>
      <div className="p-4">
        <div className="flex justify-between items-start mb-1">
          <h3 className="font-medium text-[#0F172A]">{item.university}</h3>
          <span className="text-lg">{flagEmoji}</span>
        </div>
        <p className="text-sm text-[#64748B] mb-2">{item.course}</p>
        <p className="text-sm italic text-[#0F172A] mb-3">"{item.tagline}"</p>
        <span className={`text-xs px-2 py-1 rounded-full ${bucketColor}`}>{item.fit_bucket}</span>
        <div className="mt-3 pt-3 border-t border-[#DCE6F2]">
          <p className="text-xs font-medium text-[#0F172A] mb-1">
            {yearStage === 'pre_final' ? 'Target to aim for' : `Estimated fit: ${item.admission_probability}%`}
          </p>
          <p className="text-xs text-[#64748B]">{item.improvement_message}</p>
        </div>
      </div>
    </div>
  );
}
```

The dark navy monogram header (`#0B1F3A`, your own brand color) plus a country flag emoji plus a real generated tagline is what makes these feel designed rather than templated — no external image requests, nothing that can 404.

---

## PART G — Antigravity prompt (if you want an agent to scaffold this instead of copy-pasting)

```
In the kgeo-backend repo, create three files:
1. src/routes/prIntake.ts — an Express router with a POST /pr-intake endpoint,
   validating the request body with Zod (fields: studentId uuid, department,
   stream enum[engineering,arts], yearStage enum[pre_final,final], cgpa,
   cgpaScale, backlogs, internships array, researchPapers array,
   preferredCountries array, preferredCourses array, preferredUniversities
   array, specialization array, portfolioNote optional, examType
   enum[IELTS,TOEFL,GRE,GMAT,none], examStatus enum[not_taken,target,actual],
   examScore optional number), rejecting with 400 if yearStage is "final" and
   examStatus is "target". On success, upsert into the pr_intake Supabase
   table using the existing supabaseAdmin client from src/lib/supabaseAdmin.ts.
2. src/routes/personalRecommendationV2.ts — a POST /recommendations/pr/generate
   endpoint that reads the student's pr_intake row, queries university_programs
   filtered by preferred_countries and cgpa, builds a Gemini prompt (see the
   template in this project's docs), calls Gemini with responseMimeType
   application/json, parses the result, and writes rows into recommendations,
   recommendation_items, and pr_insights tables.
3. Wire both routers into src/index.ts behind the existing verifyInternalSecret
   middleware.
Do not modify any other existing file. Show me the diff before writing to disk.
```

---

## Build order for this specific feature (1.5-2 weeks)

1. **Day 1**: Run Part B's SQL, verify `pr_intake` exists and RLS is on.
2. **Day 2-3**: Build and `curl`-test D1 (intake save) with a fake payload — confirm the final-year/target-score rejection actually fires before moving on.
3. **Day 4**: Build the wizard steps 1-3 (the non-branching ones), wire the proxy route, test end-to-end with a real logged-in student writing to `pr_intake`.
4. **Day 5**: Add the branching steps (4a/4b engineering-arts, and the year-based exam step) — test both branches manually by editing your test account's `stream`/`yearStage`.
5. **Day 6-7**: Build and test D2 (Gemini generation) in isolation first with a hand-crafted `pr_intake` row before trusting the wizard's output.
6. **Day 8-9**: Results page with the card design, test with both a pre-final and a final-year fake result to confirm the improvement-message tone actually differs.
7. **Day 10**: Full walkthrough as a real student — intake → generate → view results → confirm the whole thing feels coherent end to end.
