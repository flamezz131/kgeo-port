# K-GEO Backend Development Instructions

## General behavior

- Read PROJECT_BRIEF.md before making changes.
- Explain your plan before editing multiple files.
- Build only the requested feature.
- Do not rewrite unrelated files.
- Use TypeScript strictly, no `any`.
- Add error handling: loading states are not applicable here (backend), but add explicit error responses for every route.
- Never put the Supabase service-role key or Gemini API key in any file that isn't `.env` (which must be gitignored).
- Do not run any SQL against the database directly — only ever generate migration files for a human to review and apply manually.

## Workflow rules

After finishing a task:
1. Report every file changed.
2. Report every command run.
3. Mention any remaining manual configuration or migrations to apply.
