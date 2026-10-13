# K-GEO Platform — Project Brief

## Project Purpose
K-GEO is a comprehensive full-stack higher-studies consultancy platform exclusively for Kumaraguru students. The system manages the complete lifecycle of a student's higher-education journey, from initial profile creation and consultation bookings with counselors to providing AI-driven Personalized Recommendations (PR) for university programs using Google's Gemini AI.

## End-to-End Functionality & Workflows

### 1. Authentication & Identity
- **Restricted Registration**: Public registration is locked to the `@kct.ac.in` domain.
- **Roles**: The system supports four distinct roles: `student`, `counselor`, `admin`, and `director`.
- **Email Verification**: Supabase Auth enforces mandatory email verification before a student can access the platform.

### 2. Student Core Profile & Consultations
- **Profile Foundation**: Students maintain a core profile tracking their academic standing, preferred study levels (Masters, MBA, PhD), target exams (IELTS, GRE, etc.), and achievements (internships, research).
- **Consultation Lifecycle**: 
  - Students book available slots.
  - Counselors view their assigned workloads via the Counselor Directory.
  - Counselors conduct sessions, update progression stages (e.g., 'country_exploration', 'document_preparation'), and record outcomes ('completed', 'no_show').
  - Counselors can add private internal notes and schedule follow-ups.

### 3. AI Personalized Recommendations (PR)
- **Intake Wizard**: A dynamic, multi-step frontend wizard collects student preferences, merges them with their core academic data, and allows them to upload 10th and 12th-grade marksheets into secure Supabase storage buckets.
- **Generation Trigger**: The frontend sends a generation request to the dedicated `kgeo-backend` microservice via an internal API secret.
- **AI Processing (Gemini)**: The Node.js Express backend securely queries the student's intake data, fetches eligible university programs from the DB, and prompts the Gemini AI model to evaluate the student's profile against the programs.
- **Roadmap Visualization**: The frontend displays the AI-generated roadmap, categorizing universities into **Safe**, **Match**, and **Reach** buckets. It provides deep insights including fit scores, admission probabilities, strengths, missing requirements, and a step-by-step roadmap.

## System Architecture

The project is divided into two primary services:
1. **Frontend Server (`web/K-GEO`)**: A Next.js App Router application responsible for UI, SSR, Auth integrations, and direct Supabase database operations using Row Level Security (RLS).
2. **Backend Server (`kgeo-backend`)**: A Node.js Express microservice that securely handles long-running LLM (Gemini) orchestration tasks. It runs concurrently with the frontend and communicates via secure internal routes.

## Technology Stack

### Frontend
- **Framework**: Next.js 14+ (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS, class-variance-authority, shadcn UI components, Lucide icons
- **State & Forms**: Zod for schema validation
- **Auth**: `@supabase/ssr`

### Backend
- **Framework**: Node.js with Express.js
- **Language**: TypeScript (running via `ts-node-dev` in development)
- **AI Integration**: `@google/genai` (Gemini API)
- **DB Client**: `@supabase/supabase-js` (with service-role key for backend operations)

### Database & Storage
- **Database**: PostgreSQL (hosted on Supabase)
- **Authentication**: Supabase Auth

## Recent Implementation Shifts
- The `pr_intake` process utilizes a dynamic UI wizard backed by a static, curated mock catalog (`src/lib/courses.ts`) ensuring reliable department matching.
- The AI Integration dynamically scales: if the `university_programs` catalog is sparsely populated, the backend gracefully delegates generation directly to Gemini's vast internal knowledge base, maintaining accurate programmatic recommendations for all global fields of study.
- **Storage**: Supabase Storage buckets (e.g., private `academic-documents` bucket with RLS)

## Database Schema & Integrations

The database is structured across two primary namespaces (schemas):

### 1. `public` Schema (Core Operations)
- **`profiles`**: Core identity mapping for auth users, enforcing roles.
- **`student_profiles`, `student_preferences`, `student_test_scores`, `student_achievements`**: Modular tables capturing a student's holistic academic state.
- **`consultation_requests`**: Tracks all booked sessions and statuses.
- **`counselor_notes`, `follow_ups`**: Private internal records for counselor management.

### 2. `recommendation` Schema (AI Engine)
An isolated schema with its own RLS policies that shares the core authentication.
- **`universities` & `programs`**: Canonical datasets of higher education institutions and degrees.
- **`university_programs`**: The bridge table tracking specific intake deadlines, tuition estimates, and minimum requirements (CGPA, IELTS, GRE).
- **`pr_intake`**: Captures a snapshot of the student's data and preferences right before triggering an AI generation (including paths to uploaded marksheets).
- **`recommendations`**: The parent record tracking the generation status (`queued`, `completed`, `failed`).
- **`recommendation_items`**: The specific bucketed recommendations (Safe, Match, Reach) and assigned ranks.
- **`pr_insights`**: Granular AI output detailing fit scores, admission probabilities, faculty matches, and bespoke roadmaps.
- **`llm_call_log`**: Audits all prompts and raw responses from the Gemini API.

## Security Requirements
- **Row Level Security (RLS)**: Enforced extensively on both `public` and `recommendation` schemas. Students can only read/write their own data and marksheets.
- **Service Keys**: The Supabase service role key is strictly confined to the `kgeo-backend` and is never exposed to the browser or the Next.js client bundle.
- **Internal API**: Communication between Next.js and the Express backend is secured using an `x-internal-secret` header.

## Development Rules
- Build one complete vertical feature at a time: UI → Validation → Server Action → Database → Permissions → Testing.
- Ensure strict separation of concerns between the frontend data-fetching and the backend LLM orchestration.
