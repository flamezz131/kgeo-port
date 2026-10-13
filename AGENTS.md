<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->


# K-GEO Development Instructions

## General behavior

- Read PROJECT_BRIEF.md before making changes.
- Explain the plan before editing multiple files.
- Build only the requested feature.
- Do not rewrite unrelated files.
- Use TypeScript strictly.
- Avoid `any`.
- Add error handling.
- Add loading and empty states.
- Keep components reusable but do not over-engineer.
- Use secure server-side validation.
- Never put secrets in client code.
- Never expose Supabase service-role keys.

## Coding standards

- Use Next.js App Router.
- Prefer Server Components unless client interactivity is required.
- Use Server Actions for internal form mutations.
- Use Zod for server-side input validation.
- Use Tailwind CSS.
- Keep database types explicit.
- Use descriptive names.
- Add comments only when logic is not obvious.

## Authentication rules

- Only exact `@kct.ac.in` addresses can sign up.
- All public registrations are students.
- Do not allow public selection of admin or counselor roles.
- Require verified email before portal access.
- Redirect unauthenticated users to `/login`.
- Redirect users according to role.

## Workflow rules

Before completing a task:

1. Run linting.
2. Run type checking.
3. Run relevant tests.
4. Report files changed.
5. Report commands run.
6. Mention any remaining manual configuration.

## Safety

Do not delete database data.
Do not run destructive SQL without approval.
Do not install unnecessary packages.
Ask before replacing major architecture.