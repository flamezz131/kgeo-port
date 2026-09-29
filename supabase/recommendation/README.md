# Recommendation / Personal Recommendation (PR) schema

These SQL scripts set up the **Personal Recommendation (PR)** feature. They are
kept out of `supabase/migrations/` on purpose:

- PR lives entirely in an isolated `recommendation` schema and never touches
  `public.*`.
- The files in `supabase/migrations/` are a single, immutability-checked lineage
  for the core platform (student/counselor/director). The automated tests assert
  that folder contains exactly that lineage, byte-for-byte.

Apply these in filename order (Supabase SQL editor or `psql`). See
[`docs/recommendation_sql_setup_guide.md`](../../docs/recommendation_sql_setup_guide.md)
for the full walkthrough and architecture notes.

Order:

1. `202607260001_recommendation_schema.sql` / `202607270001_recommendation_schema.sql`
   (iterations of the base schema — apply the later one)
2. `202607270002_pr_intake_academic_marksheets.sql`
3. `20240801000000_add_development_plans.sql`
4. `20260813000000_consolidated_pr_upgrades.sql`
