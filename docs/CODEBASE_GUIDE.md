# K-GEO codebase guide

How this project is laid out, the conventions it follows, and where to put new
code. Read this before changing anything — the repo is very consistent, and most
confusion comes from not knowing the pattern rather than from the code itself.

For database setup see [`supabase/SETUP_GUIDE.md`](../supabase/SETUP_GUIDE.md).

---

## 1. The two applications

| | Path | What it is |
|---|---|---|
| Web app | `src/` | Next.js App Router. Talks to Supabase directly using SSR + Row-Level Security |
| PR backend | `pr-backend/` | A small Express service. Holds the Gemini key and the Supabase **service-role** key, so it must never be reachable from a browser |

They are separate npm projects with separate `package.json` and `tsconfig.json`
files. The root `tsconfig.json` excludes `pr-backend`, so typechecking the web
app never sees it. Run both together with `npm run dev:all`.

The web app reaches the PR backend through `KGEO_BACKEND_URL`, authenticated
with the shared `INTERNAL_API_SECRET` header that
`pr-backend/src/middleware/verifyInternalSecret.ts` checks.

---

## 2. Four portals, one shell

Routes are grouped by audience under `src/app/`:

| Route group | Audience | Guard |
|---|---|---|
| `(public)/` | Anonymous visitors, login, registration | none |
| `student/` | Students | `requireStudent()` |
| `counselor/` | Counselors | `requireCounselor()` |
| `director/` | Directors | `requireDirector()` |
| `admin/` | Admins | `requireAdmin()` |

The guards live in `src/lib/permissions/`. **Every page and every server action
calls its own guard** — authorisation is never inherited from a layout. That
looks repetitive and is deliberate: a layout guard would not protect a server
action invoked directly.

Each portal layout renders `PortalShell` (`src/components/shell/portal-shell.tsx`)
with its own sidebar (`CounselorSidebar`, `DirectorSidebar`, `StudentSidebar`).
That is the only place navigation is defined.

---

## 3. The layering convention — the important part

Almost every feature in `src/lib/<domain>/` is split into the same files. Using
counselor eligibility as the example:

| File | Runs where | Responsibility |
|---|---|---|
| `eligibility.ts` | anywhere | **Pure domain model.** Types, constants, label maps, formatters, pure functions. No I/O, no `server-only`. Safe to import from client components |
| `eligibility-server.ts` | server only | **Reads.** Starts with `import "server-only"`. Calls the guard, verifies case access, then calls Supabase RPCs. Returns a discriminated union like `{ kind: "ready" \| "not_found" \| "unavailable" }` |
| `eligibility-submission.ts` | anywhere | **Writes.** Parses `FormData`, validates with Zod, and defines the action state the form's `useActionState` holds |

The matching server action in `src/app/actions/` is thin: guard, validate via
the `-submission` module, call one RPC, `revalidatePath`. Business rules belong
in the database functions, not in the action.

### Why reads return a union instead of throwing

`{ kind: "unavailable" }` means the query failed; `{ kind: "not_found" }` means
the record is not yours to see. Pages render a `StateBlock` for the first and
call `notFound()` for the second, so a permissions failure never leaks the
difference between "does not exist" and "exists but is not yours".

---

## 4. Three kinds of test

`npm test` runs `node --test` over an explicit file list in `package.json`.
There is no test runner config and no jsdom — tests are plain Node.

| Suffix | Asserts |
|---|---|
| `<feature>.test.ts` | The pure model in `<feature>.ts`. Ordinary unit tests |
| `<feature>-foundation.test.ts` | The **SQL migration**. Reads the `.sql` file and asserts the table, policies, triggers, function bodies and grants it must contain |
| `<feature>-ui-contract.test.ts` | The **rendered component**. Reads the `.tsx` file as text and asserts required markup, ARIA attributes, and that forbidden things are absent |

`-ui-contract` tests read component files **by exact path**. Renaming, moving or
splitting a component breaks every test that pins it, so update those paths in
the same change. 84 component paths are pinned this way.

These tests are why some modules exist without being imported by the app —
`src/lib/student/achievement-evidence-lifecycle.ts` is a state-machine spec that
documents the transitions the database enforces. The app calls the RPCs; the
module exists so the rules are executable and tested. Do not delete a module
just because nothing imports it; check for a test first.

### The git-blob test harness

`src/test/setup.ts` monkey-patches `fs.readFileSync`. For files matching
`supabase/migrations/*.sql` or `supabase/verification/pre_phase_c2_readiness.sql`
it returns the **git-committed blob** rather than the working copy, so the
migration-immutability tests detect edits to reviewed SQL.

K-GEO-combine has no `.git`, so that lookup fails and the tests fall back to the
working tree. The hashes they pin were recomputed against the LF-normalised
files on disk. If you ever `git init` this project, expect those hashes to need
updating once.

`.gitattributes` forces LF for the same reason: a CRLF checkout would change
every hash.

---

## 5. Styling

Three layers, currently mixed:

1. **Design tokens** — CSS custom properties on `:root` at the top of
   `src/app/globals.css` (`--brand-600`, `--ink`, `--line`, `--surface`,
   `--shadow-sm`, …). Everything else should reference these, never raw hex.
2. **Tailwind utilities** — used directly in `className`, referencing tokens via
   arbitrary values: `text-[var(--muted)]`, `border-[var(--line)]`.
3. **Semantic classes** — `.field`, `.button`, `.student-workspace-panel`,
   `.optional-record-table` … defined in `globals.css`.

Of 144 components: 43 use Tailwind only, 46 use semantic classes only, 18 mix
both, 37 have no styling. **Migration to Tailwind is in progress**, portal by
portal. When you touch a component, prefer Tailwind + tokens over adding new
rules to `globals.css`.

Shared presentational primitives live in `src/components/shell/portal-ui.tsx`:
`PageHeader`, `SectionHeader`, `Panel`, `StateBlock`. Use `StateBlock` for every
empty and error state rather than inventing new markup.

Note that several `-ui-contract` tests assert on `globals.css` text (for example
that `@media (max-width: 650px)` exists, or a specific responsive rule). Those
assertions encode real responsive and accessibility requirements — when a rule
moves to Tailwind, retarget the assertion rather than deleting it.

---

## 6. Adding a feature

1. **Migration first.** Add `supabase/migrations/<timestamp>_<name>.sql` with the
   table, RLS policies, and `security definer` RPCs. The database enforces the
   rules; the app calls them.
2. **Domain model** — `src/lib/<domain>/<feature>.ts`. Pure, testable.
3. **Reads** — `<feature>-server.ts`, returning the `kind` union.
4. **Writes** — `<feature>-submission.ts` plus a thin action in
   `src/app/actions/`.
5. **UI** — a component under `src/components/<portal>/`, and a page that calls
   the guard, loads, and renders `StateBlock` on failure.
6. **Tests** — the three kinds above, and add each new file to the `test` script
   in `package.json` (it is an explicit list, not a glob).
7. **Bundles** — if you added SQL, regenerate `supabase/_bundle_public.sql` and
   update the counts in `supabase/SETUP_GUIDE.md`.

---

## 7. Things that will surprise you

- **`npm test` takes an explicit file list.** A new `.test.ts` file does not run
  until you add it to `package.json`.
- **`npm run lint` currently reports problems** (mostly `no-explicit-any` in the
  Personal Recommendation screens). That is the inherited baseline, not
  something you broke. Do not add to it.
- **Storage buckets are created by migrations**, not by hand in the dashboard.
- **Storage RLS policies are not in `migrations/`.** They live in
  `supabase/storage-owner/` and must be run by the owner of `storage.objects`
  after the migrations.
- **`recommendation` is a separate schema** in `supabase/recommendation/`, used
  only by `pr-backend`. It is deliberately isolated from `public`.
- **Never import `src/lib/supabase/admin.ts` from a page or client component.**
  It is the service-role client and belongs only in server actions that need to
  bypass RLS, such as the achievement-evidence upload.
