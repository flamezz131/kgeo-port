# K-GEO Platform

K-GEO is a comprehensive full-stack higher-studies consultancy platform built specifically for Kumaraguru students. It facilitates the entire student journey from profile creation and consultation booking to receiving AI-driven personalized university recommendations.

The project is split into two primary repositories/folders:
1. **Frontend (`web/K-GEO`)**: A Next.js 14+ App Router application with Tailwind CSS, shadcn UI, and Supabase SSR.
2. **Backend (`kgeo-backend`)**: A Node.js Express microservice that securely integrates with the Google Gemini AI API to generate dynamic recommendations.

## End-to-End Functionality & Deliverables

- **Role-Based Authentication**: Secure registration restricted to `@kct.ac.in` domains with separate distinct roles (`student`, `counselor`, `admin`, `director`).
- **Student Profiles & Consultations**: Students can build comprehensive academic profiles and book available consultation slots.
- **Counselor Dashboard**: Counselors can review assigned workloads, track official progression stages (e.g., test preparation, visa prep), write private internal notes, and schedule follow-ups.
- **AI Personalized Recommendations (PR)**: 
  - Students complete an intake wizard (including secure marksheet uploads to Supabase Storage).
  - The frontend triggers the `kgeo-backend` to process the data using Google Gemini AI.
  - The AI evaluates the profile against an internal database of global university programs.
  - Students receive a detailed roadmap categorizing universities into **Safe**, **Match**, and **Reach** buckets, complete with fit scores, admission probabilities, and bespoke suggestions.

## Local Setup

### 1. Database Setup (Supabase)
1. Create a Supabase project.
2. Run the SQL migrations found in `web/K-GEO/supabase/migrations/` in your Supabase SQL Editor. 
   - Apply the core migrations (e.g., `202607170001_initial_kgeo_schema.sql`).
   - Apply the AI recommendation migrations (e.g., `202607270001_recommendation_schema.sql` and `202607270002_pr_intake_academic_marksheets.sql`).
3. In Supabase **Authentication > URL Configuration**, set the Site URL to `http://localhost:3000` and add `http://localhost:3000/auth/confirm` to redirect URLs.
4. Go to **Project Settings > API > Exposed schemas** and ensure both `public` and `recommendation` schemas are exposed to the API.

### 2. Frontend Setup (`web/K-GEO`)
1. Navigate to the frontend directory: `cd web/K-GEO`
2. Copy `.env.example` to `.env.local` and populate:
   - `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SITE_URL=http://localhost:3000`
   - `KGEO_BACKEND_URL=http://localhost:3001`
   - `INTERNAL_API_SECRET` (A secure random string shared with the backend)
3. Install dependencies and start the dev server:
   ```bash
   npm install
   npm run dev
   ```

### 3. Backend Setup (`kgeo-backend`)
1. Navigate to the backend directory: `cd kgeo-backend`
2. Copy `.env.example` to `.env` (or create one) and populate:
   - `PORT=3001`
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` (Never expose the service key to the frontend!)
   - `GEMINI_API_KEY` (Your Google Gemini AI API key)
   - `INTERNAL_API_SECRET` (Must match the frontend's secret)
3. Install dependencies and start the backend service:
   ```bash
   npm install
   npm run dev
   ```

*Note: Both the frontend (`npm run dev` on port 3000) and backend (`npm run dev` on port 3001) must be running concurrently for the AI recommendations feature to work.*

## Database Architecture Overview

The PostgreSQL database leverages schemas to cleanly separate concerns and uses Row Level Security (RLS) to enforce strict access controls.

### `public` Schema
- **Identities & Profiles**: `profiles`, `student_profiles`, `student_preferences`, `student_test_scores`, `student_achievements`.
- **Consultations**: `consultation_requests` (tracks lifecycle and outcomes).
- **Counselor Tools**: `counselor_notes`, `follow_ups`.

### `recommendation` Schema
- **University Datasets**: `universities`, `programs`, `university_programs` (stores CGPA/IELTS requirements, tuition, deadlines).
- **AI Processing**: 
  - `pr_intake`: Snapshots student data and marksheet paths prior to generation.
  - `recommendations`: Job status tracking (`queued`, `completed`, `failed`).
  - `recommendation_items` & `pr_insights`: Stores the Gemini AI outputs, bucket rankings, fit scores, and deep rationales.
  - `llm_call_log`: System auditing for LLM prompt payloads and responses.

## Admin Creation
Because public registration enforces the `student` role, you must promote an admin user manually via the Supabase SQL editor:
```sql
update public.profiles
set role = 'admin'
where id = (
  select id from auth.users where email = 'admin@kct.ac.in'
);
```

## Recent Architecture Updates (August 2026)
- **Static Course Catalog**: Transitioned away from dynamic keyword DB matching to a reliable, static mock catalog (`src/lib/courses.ts`) for course and stream mapping.
- **Enhanced PR Intake Schema**: Updated the `pr_intake` table to use streamlined text/JSONB fields (`internships_text`, `research_text`, `competitive_exams`, `same_as_ug` boolean) instead of legacy complex JSON blobs, with frontend mapping handling dynamic formatting for the AI.
- **Dynamic AI Prompting**: The Gemini backend (`personalRecommendation.ts`) is now capable of autonomously detecting empty university candidate catalogs and generating its own highly accurate, real-world university recommendations based on student preferences.
- **Bulletproof Form Flow**: Completely stripped native HTML `<form>` wrappers from the Intake Wizard, preventing premature submissions caused by `Enter` keypresses in comboboxes and score inputs.
