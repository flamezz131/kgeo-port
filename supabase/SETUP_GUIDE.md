# K-GEO database setup

The web app talks to Supabase directly (SSR + RLS). The **Personal Recommendation
(PR)** feature adds an isolated `recommendation` schema used by `pr-backend/`.

There are two ways to apply the schema. **You need to do this part** — it needs
your Supabase project's credentials.

---

## What's in `supabase/`

| Path | What it is |
|---|---|
| `migrations/` | 50 ordered migrations for the **`public`** schema (the whole platform). Not idempotent — run once, in order, on a fresh DB. |
| `storage-owner/` | 4 RLS policy files for `storage.objects` — run **after** the migrations. |
| `recommendation/` | 5 SQL files for the **`recommendation`** schema (PR feature). Isolated from `public`. |
| `operations/` | One-time data fixes. **Skip unless told to** — they delete/convert legacy rows. |
| `verification/` | Read-only preflight/gate checks. Optional. |
| `_bundle_public.sql` | All 50 `migrations/` concatenated in order (for a one-paste fresh setup). |
| `_bundle_storage_policies.sql` | The 4 `storage-owner/` files concatenated. |
| `recommendation/_bundle.sql` | The recommendation schema concatenated. |
| `CHECK_STATE.sql` | Read-only — tells you what already exists. **Run this first.** |

---

## Step 0 — check what's already there

Supabase Dashboard → **SQL Editor** → New query → paste **`CHECK_STATE.sql`** → Run.
Paste the result back. It shows which tables / RPCs / schemas / buckets exist and
how many rows are in the migration-history table.

- If most `public` tables show **MISSING** → the DB is fresh → do **Step 1A**.
- If the `public` tables are **present** but `recommendation` is **MISSING** →
  only do **Step 2**.
- If it's a mix → we work out which migration files to run from the result.

---

## Step 1 — apply the `public` schema

### 1A. Fresh project (recommended path)

1. SQL Editor → New query → paste the entire contents of
   **`supabase/_bundle_public.sql`** → Run. (It's ~30k lines; the editor handles it.
   If it times out, run it in a few pieces along the `-- >>> supabase/migrations/...`
   markers.)
2. New query → paste **`supabase/_bundle_storage_policies.sql`** → Run.

### 1B. Supabase CLI (keeps a migration history)

```powershell
cd D:\Harvard_Projects\K-GEO-main\K-GEO\K-GEO-new
npx supabase login                       # opens browser once
npx supabase link --project-ref ggcfprujkuexuzrglviu   # asks for the DB password
npx supabase db push                     # applies everything in migrations/
```
Then run `_bundle_storage_policies.sql` in the SQL Editor (storage policies aren't
in `migrations/`).

> CLI push only works cleanly on a project whose history matches `migrations/`.
> If the DB was hand-migrated before, use 1A or run only the missing files.

---

## Step 2 — apply the `recommendation` schema (PR feature)

1. SQL Editor → New query → paste **`supabase/recommendation/_bundle.sql`** → Run.
2. Dashboard → **Project Settings → API → Exposed schemas** → make sure both
   `public` **and** `recommendation` are listed.

---

## Step 3 — Auth + Storage config (Dashboard)

- **Authentication → URL Configuration**: Site URL `http://localhost:3000`;
  add `http://localhost:3000/auth/confirm` to redirect URLs.
- **Authentication → Providers → Email**: email + password on, confirmation on.
- Storage buckets are created by the migrations (`student-profile-documents`,
  `progression-evidence`, `university-application-documents`,
  `parent-report-attachments`, `student-achievement-documents`, and
  `academic-documents` for PR). Confirm they exist.

---

## Step 4 — make yourself a director / admin

Public sign-up always creates a `student`. After registering + verifying an
`@kct.ac.in` account, promote it in the SQL Editor:

```sql
update public.profiles
set role = 'director'          -- or 'admin'
where id = (select id from auth.users where email = 'you@kct.ac.in');
```

For a **counselor**, use the counselor sign-up at `/counselor/register`, then a
director approves it at `/director/counselors`. (Or set `role='counselor'` and
insert the matching `public.counselor_accounts` row manually.)

---

## Step 5 — run it

```powershell
npm run dev:all      # web on :3000, PR backend (pr-backend/) on :4000
```

`pr-backend/.env` already has `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`,
`GEMINI_API_KEY`, `INTERNAL_API_SECRET`, `PORT=4000`. The web app's `.env.local`
points `KGEO_BACKEND_URL` at `http://localhost:4000` with the same
`INTERNAL_API_SECRET`.
