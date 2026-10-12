-- K-GEO — AI Recommendation Subsystem Contract & Hardening Migration
-- Forward migration to align database schema with runtime recommendation requirements.
-- Idempotent and safe to apply in any environment.

-- 1. Ensure recommendation schema exists
CREATE SCHEMA IF NOT EXISTS recommendation;

-- 2. Core student_profiles additions
ALTER TABLE public.student_profiles
  ADD COLUMN IF NOT EXISTS resume_path text,
  ADD COLUMN IF NOT EXISTS last_pr_generated_at timestamptz;

-- Column-level update grant for authenticated students to save their own resume path
GRANT UPDATE (resume_path) ON public.student_profiles TO authenticated;

-- 3. Hardening recommendations table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'recommendation' AND table_name = 'recommendations'
  ) THEN
    ALTER TABLE recommendation.recommendations
      ADD COLUMN IF NOT EXISTS profile_snapshot jsonb,
      ADD COLUMN IF NOT EXISTS error_message text;
  END IF;
END $$;

-- Indexes on recommendations
CREATE INDEX IF NOT EXISTS idx_recommendations_student_generated
  ON recommendation.recommendations (student_id, generated_at DESC);

-- Concurrency guard: Only one queued run per student at a time
CREATE UNIQUE INDEX IF NOT EXISTS idx_recommendations_one_queued_per_student
  ON recommendation.recommendations (student_id)
  WHERE (status = 'queued');

-- 4. Ensure development_plans table & columns exist
CREATE TABLE IF NOT EXISTS recommendation.development_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id uuid NOT NULL REFERENCES recommendation.recommendations(id) ON DELETE CASCADE,
  priority_exams jsonb NOT NULL DEFAULT '[]'::jsonb,
  language_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_internships jsonb NOT NULL DEFAULT '[]'::jsonb,
  suggested_certifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  readiness_score numeric,
  strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  priority_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  quick_wins jsonb NOT NULL DEFAULT '[]'::jsonb,
  long_term_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_development_plans_recommendation_id UNIQUE (recommendation_id)
);

ALTER TABLE recommendation.development_plans
  ADD COLUMN IF NOT EXISTS readiness_score numeric,
  ADD COLUMN IF NOT EXISTS strengths jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS priority_gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS quick_wins jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS long_term_actions jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE recommendation.development_plans ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'recommendation'
      AND tablename = 'development_plans'
      AND policyname = 'students read own development plans'
  ) THEN
    CREATE POLICY "students read own development plans"
      ON recommendation.development_plans
      FOR SELECT
      USING (
        EXISTS (
          SELECT 1 FROM recommendation.recommendations r
          WHERE r.id = development_plans.recommendation_id AND r.student_id = auth.uid()
        )
      );
  END IF;
END $$;

-- 5. Expand pr_insights table
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'recommendation' AND table_name = 'pr_insights'
  ) THEN
    ALTER TABLE recommendation.pr_insights
      ADD COLUMN IF NOT EXISTS why_recommended jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS top_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS current_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS target_profile jsonb NOT NULL DEFAULT '{}'::jsonb,
      ADD COLUMN IF NOT EXISTS gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS detailed_roadmap jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS risks jsonb NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS application_readiness jsonb NOT NULL DEFAULT '{}'::jsonb;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_recommendation_items_rec_id
  ON recommendation.recommendation_items (recommendation_id);

CREATE INDEX IF NOT EXISTS idx_pr_insights_item_id
  ON recommendation.pr_insights (recommendation_item_id);

-- Ensure recommendation_items bucket check constraint accepts modern buckets
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'recommendation' AND table_name = 'recommendation_items'
  ) THEN
    ALTER TABLE recommendation.recommendation_items
      DROP CONSTRAINT IF EXISTS recommendation_items_bucket_check;

    ALTER TABLE recommendation.recommendation_items
      ADD CONSTRAINT recommendation_items_bucket_check
      CHECK (bucket IN ('Ambitious', 'Target', 'Achievable', 'Safe', 'Match', 'Reach'));
  END IF;
END $$;

-- 6. Create student_roadmap_tasks table
CREATE TABLE IF NOT EXISTS recommendation.student_roadmap_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_id uuid NOT NULL REFERENCES recommendation.recommendations(id) ON DELETE CASCADE,
  university_program_id uuid REFERENCES recommendation.university_programs(id) ON DELETE SET NULL,
  task_key text NOT NULL,
  category text,
  title text NOT NULL,
  description text,
  priority text NOT NULL DEFAULT 'MEDIUM' CHECK (priority IN ('HIGH', 'MEDIUM', 'LOW')),
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'completed', 'archived')),
  target_outcome text,
  estimated_duration text,
  phase int NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_rec_id
  ON recommendation.student_roadmap_tasks (recommendation_id);

CREATE INDEX IF NOT EXISTS idx_roadmap_tasks_student_id
  ON recommendation.student_roadmap_tasks (student_id);

ALTER TABLE recommendation.student_roadmap_tasks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'recommendation'
      AND tablename = 'student_roadmap_tasks'
      AND policyname = 'students read own roadmap tasks'
  ) THEN
    CREATE POLICY "students read own roadmap tasks"
      ON recommendation.student_roadmap_tasks
      FOR SELECT
      USING (student_id = auth.uid());
  END IF;
END $$;

-- 7. Secure Grants on recommendation Schema
-- Authenticated users have USAGE and SELECT on their data only; service_role has ALL; anon has NONE.
GRANT USAGE ON SCHEMA recommendation TO authenticated, service_role;
REVOKE ALL ON SCHEMA recommendation FROM anon;

GRANT SELECT ON
  recommendation.recommendations,
  recommendation.recommendation_items,
  recommendation.pr_insights,
  recommendation.development_plans,
  recommendation.student_roadmap_tasks,
  recommendation.universities,
  recommendation.programs,
  recommendation.university_programs
TO authenticated;

GRANT ALL ON ALL TABLES IN SCHEMA recommendation TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA recommendation TO service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA recommendation TO service_role;

REVOKE ALL ON ALL TABLES IN SCHEMA recommendation FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA recommendation FROM anon;
REVOKE ALL ON ALL ROUTINES IN SCHEMA recommendation FROM anon;

-- 8. Non-canonical AI estimation comments
COMMENT ON COLUMN recommendation.development_plans.readiness_score IS 
  'AI-estimated readiness percentage (0-100). Indicative only; canonical global readiness is evaluated by counselors.';

COMMENT ON COLUMN recommendation.recommendations.status IS 
  'Status of recommendation generation: queued, completed, failed.';
