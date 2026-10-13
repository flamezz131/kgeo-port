# K-GEO — Technical Reference

A file-by-file and subsystem-by-subsystem reference for the K-GEO platform.

Everything here was read out of the repository rather than from `PROJECT_BRIEF.md`,
so where the brief and the code disagree, this document follows the code.

**Contents**

1. [What the system is](#1-what-the-system-is)
2. [Repository layout](#2-repository-layout)
3. [Runtime architecture](#3-runtime-architecture)
4. [Authentication and authorization](#4-authentication-and-authorization)
5. [The three-layer module pattern](#5-the-three-layer-module-pattern)
6. [File reference — `src/app`](#6-file-reference--srcapp)
7. [File reference — `src/components`](#7-file-reference--srccomponents)
8. [File reference — `src/lib`](#8-file-reference--srclib)
9. [File reference — supporting files](#9-file-reference--supporting-files)
10. [File reference — `pr-backend`](#10-file-reference--pr-backend)
11. [File reference — `supabase`](#11-file-reference--supabase)
12. [Deep dives](#12-deep-dives)
13. [Conventions and invariants](#13-conventions-and-invariants)
14. [Environment and commands](#14-environment-and-commands)

---

## 1. What the system is

K-GEO (Kumaraguru Global Education Guidance) is the higher-studies advisory
platform for Kumaraguru Institutions. It carries a student from a first advisory
consultation through profile building, university applications, visa preparation
and overseas enrolment, and keeps an auditable record of every counselor
decision along the way.

Four roles use it: **student**, **counselor**, **director**, **admin**.

The defining architectural property is that **authorization lives in the
database**, not in the interface. The web app queries Postgres as the signed-in
user with Row Level Security applied, and almost every read and write goes
through a security-definer function rather than a table select. A bug in a React
component cannot widen access.

| Measure | Count |
| --- | --- |
| TypeScript/TSX source files (excluding tests) | 289 |
| Test files / assertions | 106 / 1,219 |
| Application routes (`page.tsx`) | 39 |
| Route handlers (`route.ts`) | 10 |
| Server Action modules | 24 |
| React components | 64 |
| SQL migrations (46 core + 6 recommendation) | 52 |
| RLS policies | 61 |
| Distinct Postgres RPCs called by the app | 62 |
| Storage buckets | 7 |

---

## 2. Repository layout

```
K-GEO-new/
├── src/
│   ├── app/                  Next.js App Router: routes, layouts, Server Actions
│   │   ├── (public)/         Unauthenticated marketing + auth screens
│   │   ├── student/          Student portal
│   │   ├── counselor/        Counselor portal
│   │   ├── director/         Director portal
│   │   ├── admin/            Admin portal (deliberately minimal)
│   │   ├── api/              Route handlers that cross the service boundary
│   │   ├── actions/          "use server" mutation entry points
│   │   ├── auth/confirm/     Email verification callback
│   │   ├── layout.tsx        Root HTML document
│   │   └── globals.css       The entire stylesheet (~9,400 lines)
│   ├── components/           React components, grouped by role/domain
│   ├── lib/                  Domain logic, validation, data access
│   ├── types/                Generated DB types + hand-written domain types
│   ├── test/                 Test harness setup
│   └── proxy.ts              Route-matching middleware
├── pr-backend/               Standalone Node/Express AI service
├── supabase/
│   ├── migrations/           46 ordered, immutable core migrations
│   ├── recommendation/       6 migrations for the isolated AI schema
│   ├── storage-owner/        Storage bucket policies (run as bucket owner)
│   ├── verification/         Read-only pre-flight gates run before a migration
│   ├── operations/           One-off data operations, retained as a record
│   ├── SETUP_GUIDE.md        Database bring-up instructions
│   └── CHECK_STATE.sql       Diagnostic: what is currently applied
└── docs/                     database.md, this file, PR design notes
```

---

## 3. Runtime architecture

Two deployable services plus Supabase.

```
Browser
   │
   │  cookies (Supabase session)
   ▼
┌──────────────────────────────────────────────┐
│ Next.js 16 (App Router)                      │
│                                              │
│  proxy.ts ── session check on /student,      │
│              /counselor, /director, /admin   │
│                                              │
│  Server Components ──┐                       │
│  Server Actions    ──┼──► supabase (user JWT, RLS applies)
│  Route handlers    ──┘                       │
│         │                                    │
└─────────┼────────────────────────────────────┘
          │  x-internal-secret header
          ▼
┌──────────────────────────────────────────────┐
│ pr-backend (Express, port 4000)              │
│  CORS rejects any browser Origin             │
│  ──► supabase (SERVICE ROLE, bypasses RLS)   │
│  ──► Google Gemini                           │
└──────────────────────────────────────────────┘
                     │
                     ▼
        ┌──────────────────────────────┐
        │ Supabase                     │
        │  Postgres: public,           │
        │            recommendation,   │
        │            private           │
        │  Auth · Storage (7 buckets)  │
        └──────────────────────────────┘
```

### Why the split exists

One line divides the two services: **anything that must answer in milliseconds
lives in the web app; anything that waits on a language model lives in
`pr-backend`.** A Gemini call can take tens of seconds. Holding a Next.js
request handler open for that would consume a worker slot a counselor is waiting
on, so generation is pushed to a process whose only job is to wait.

The second reason is key custody. `pr-backend` is the only process holding a
Supabase **service-role** key, which bypasses RLS entirely. Confining it to a
service that browsers cannot reach means the powerful key never travels through
a request path that also serves HTML.

### The three Supabase clients

| File | Key used | RLS | Where it runs |
| --- | --- | --- | --- |
| `lib/supabase/server.ts` | publishable + user session cookie | **enforced** | Server Components, Server Actions, route handlers |
| `lib/supabase/client.ts` | publishable + user session | **enforced** | Browser (uploads, live forms) |
| `lib/supabase/admin.ts` | service role | **bypassed** | Narrow server-only paths |
| `pr-backend/src/lib/supabaseAdmin.ts` | service role | **bypassed** | AI service only |

`lib/supabase/env.ts` reads and validates the URL/key pair once so a missing
variable fails loudly at the boundary rather than as a confusing runtime error.

---

## 4. Authentication and authorization

Five layers, each of which independently refuses.

### Layer 1 — the proxy (`src/proxy.ts` → `lib/supabase/proxy.ts`)

Matches `/student/:path*`, `/counselor/:path*`, `/admin/:path*`,
`/director/:path*`. It refreshes the session cookie and, if there are no claims,
redirects. The redirect target is role-aware: a request under `/counselor/`
returns to `/counselor/login`, everything else to `/login`.

A `publicStaffAuthPaths` set (`/counselor/login`, `/counselor/register`,
`/counselor/pending`, `/director/login`) short-circuits **before** the session
check, so staff auth screens stay reachable to signed-out visitors even though
they sit under a protected path prefix. The path is normalized (trailing slashes
stripped) before that comparison, closing the `/counselor/login/` bypass.

### Layer 2 — the guard functions (`lib/permissions/index.ts`)

Every protected layout and page opens with one of these. They are `server-only`
and they `redirect()` rather than returning an error, so there is no "forgot to
check the result" failure mode.

- `requireUser()` — signed in at all.
- `requireStudent()` — signed in, **email confirmed**, profile row exists, and
  `getStudentAccessDecision` returns `allowed`. Otherwise `/login`, or
  `/verify-email` when only confirmation is missing.
- `requireCounselor()` — loads the profile and the `counselor_accounts` row in
  parallel; a `pending` decision redirects to `/counselor/pending` rather than
  bouncing to login, so an approved-but-waiting counselor sees an explanation.
- `requireAdmin()` — role must be exactly `admin`, else `/student/dashboard`.
- `requireDirector()` — wrapped in React's `cache()`, so several Server
  Components on one Director page share a single auth round-trip.

The decision logic itself is split into three pure, separately tested modules
(`student-access.ts`, `counselor-access.ts`, `director-access.ts`) that take
plain objects and return a decision string. They have no I/O, which is why they
can be exhaustively unit-tested.

### Layer 3 — Row Level Security

61 policies across the `public` and `recommendation` schemas. Because the web
app queries under the user's own JWT, a forgotten `.eq("student_id", user.id)`
returns nothing rather than someone else's row.

### Layer 4 — security-definer RPCs

The app calls **62 distinct Postgres functions**. The authorization check runs
inside the same transaction as the read, and the function returns only the
columns the caller is cleared for — so privacy becomes a property of the
function signature rather than of a component's JSX.

### Layer 5 — case ownership

`lib/counselor/case-ownership-server.ts` verifies that the signed-in counselor
is the **primary counselor** for the student before any student-scoped screen
loads. Enforced again in the database, so hiding a link is never the control.

### Role assignment

Public signup runs through the `on_auth_user_created` trigger calling
`handle_new_user()`. It reads only the verified `auth.users.email`, requires an
exact `@kct.ac.in` domain, and writes the role `student` **as a literal**. It
never reads form data, URL parameters or `raw_user_meta_data`, so a crafted
signup payload cannot mint a counselor. Directors may use any valid email
because they are provisioned by hand through a `private` schema flow.

---

## 5. The three-layer module pattern

Nearly every feature in `src/lib` is split into three files. Understanding this
pattern makes the file reference below read quickly.

| Layer | Filename | Contains | Imports Supabase? |
| --- | --- | --- | --- |
| **Domain** | `feature.ts` | Constants, enums, labels, Zod schemas, parsers, presentation helpers, and a `fetch*` function that takes I/O as **injected callbacks** | No |
| **Server** | `feature-server.ts` | `"server-only"`. Calls `require*()`, verifies case ownership, then supplies the real Supabase queries to the domain layer's `fetch*` | Yes |
| **Submission** | `feature-submission.ts` | Form validation plus a `submit*` function that takes a **store** object of injected mutations | No |
| **Action** | `app/actions/feature-actions.ts` | Thin `"use server"` wrapper: guard, build the store, call `submit*`, `revalidatePath` | Yes |

The injection is the point. `loadCounselorStudentProgression`
(`progression-server.ts`, 64 lines) does authorization and then hands three
closures — `loadCurrent`, `loadHistory`, `loadCorrectionContext` — to
`fetchCounselorStudentProgression` in `progression.ts` (901 lines). All the
pagination, parsing, ordering and presentation logic lives in the pure module
and is tested against fake closures with no database in sight.

That is why 106 test files can cover this system without a test database.

---

## 6. File reference — `src/app`

### 6.1 Root

| File | Purpose |
| --- | --- |
| `layout.tsx` | Root HTML document. Loads the Geist font as a CSS variable, sets the title template `%s \| K-GEO`, imports `globals.css`. |
| `globals.css` | The entire stylesheet (~9,400 lines): design tokens, type scale, all feature CSS, the semantic design layer, and container-query responsive rules. See [12.6](#126-css-architecture). |
| `favicon.ico` | Browser icon. |

### 6.2 `(public)` — unauthenticated

A route group, so the folder name does not appear in URLs.

| File | Purpose |
| --- | --- |
| `layout.tsx` | Public shell: fixed glass header, logo, `PublicNavigation`, login button, four-column footer with portal links. |
| `page.tsx` | Landing page. Composes `HomeHero`, the Director-published `PublicProgressSection`, and `HomeSections`. |
| `HomeHero.tsx` | Marketing hero. Client component; uses framer-motion. |
| `HomeSections.tsx` | About / services / destinations / contact sections. |
| `login/page.tsx` | Student and general login. Reads `?verified=true` to show the post-verification confirmation. Renders `LoginForm` inside `AuthCard`. |
| `register/page.tsx` | Student registration. Two-column: a three-step explainer beside `RegisterForm`. |
| `verify-email/page.tsx` | "Check your email" holding screen after signup. |
| `auth/error/page.tsx` | Shown when an email verification link is invalid, expired or already used. |
| `counselor/login/page.tsx` | Counselor login by **username**, not email. Surfaces `?status=rejected` and `?status=inactive` messages. |
| `counselor/register/page.tsx` | Counselor self-registration. Redirects an already-registered counselor to pending / dashboard / login depending on `approval_status` and `is_active`. |
| `counselor/pending/page.tsx` | Post-registration holding screen. Re-verifies the session server-side and redirects out if the account has since been approved, rejected or deactivated. Shows the chosen username. |
| `director/login/page.tsx` | Director login. `robots: { index: false }` — there is no public Director registration. |

### 6.3 `student/`

| File | Purpose |
| --- | --- |
| `layout.tsx` | `requireStudent()`, then renders `PortalShell` with `StudentSidebar`. |
| `StudentSidebar.tsx` | Student nav items; computes active state and delegates rendering to `PortalSidebar`. |
| `loading.tsx` | Portal-wide fallback. |
| `dashboard/page.tsx` | The student home. Loads consultations, profile row and completion view in one `Promise.all`; splits consultations into upcoming vs history by **derived** lifecycle state; renders a progress ring, the AI roadmap card, applications (in `Suspense`) and the two consultation groups. |
| `dashboard/loading.tsx` | Skeleton mirroring the dashboard's grid. |
| `profile/page.tsx` | Profile builder. Loads profile, preferences, completion, paginated test scores and achievements, and documents. Normalizes out-of-range page numbers with a `redirect()`. |
| `profile/loading.tsx` | Profile skeleton. |
| `profile/documents/[document-id]/view/route.ts` | Authorizes via RPC, then issues a short-lived signed URL for a private document. Never exposes the storage path. |
| `consultation/page.tsx` | Booking form. Computes the 7-day horizon from Asia/Kolkata business time and passes min/max dates to `ConsultationForm`. |
| `pr/intake/page.tsx` | Entry point for the AI intake wizard. |
| `pr/intake/PrIntakeWizard.tsx` | 845-line client wizard: multi-step preference capture, marksheet upload, submission to the intake API. |
| `pr/generating/page.tsx` | Polling screen shown while a recommendation is `queued`. |
| `pr/roadmap/page.tsx` | The generated roadmap. Redirects to intake when no recommendation exists, to `generating` when queued, and shows a retry path when `failed`. Renders Safe/Match/Reach buckets with fit scores and insights, plus a print-only PDF cover. |
| `pr/roadmap/ExportRoadmapButton.tsx` | Client-side export of the roadmap to PDF. |
| `pr/roadmap/RoadmapRetryButton.tsx` | Re-triggers generation after a failure. |

### 6.4 `counselor/`

| File | Purpose |
| --- | --- |
| `layout.tsx` | `requireCounselor()` + `PortalShell`. |
| `loading.tsx` | Portal-wide fallback. |
| `dashboard/page.tsx` | Six metrics from `get_my_consultation_dashboard_metrics`, today's slot grid built by `buildCounselorDaySchedule`, and the next upcoming consultation. |
| `schedule/page.tsx` | Day view with date navigation, outcome controls, and personal slot blocking. |
| `students/page.tsx` | Student directory: filters, pagination, table + card fallback. |
| `students/loading.tsx` | Directory skeleton. |
| `students/[student-id]/layout.tsx` | Student workspace shell. Verifies case ownership once and renders the sub-navigation. |
| `students/[student-id]/page.tsx` | Workspace overview tab. |
| `students/[student-id]/profile/page.tsx` | Full student profile, read-only. |
| `students/[student-id]/readiness/page.tsx` | Test scores and readiness. |
| `students/[student-id]/achievements/page.tsx` | Achievements. |
| `students/[student-id]/advisory/page.tsx` | Private notes, follow-ups, semester summaries, official progression. |
| `students/[student-id]/eligibility/page.tsx` | Eligibility assessment form and history. |
| `students/[student-id]/documents/page.tsx` | Student-uploaded documents. |
| `students/[student-id]/documents/[document-id]/view/route.ts` | Authorized signed-URL issuer for a student document. |
| `students/[student-id]/applications/page.tsx` | This student's university applications. |
| `students/[student-id]/applications/[application-id]/page.tsx` | One application: details, journey, documents, history. |
| `students/[student-id]/report/page.tsx` | Parent report workspace for this student. |
| `students/[student-id]/report/[report-id]/pdf/route.ts` | Renders a parent report to PDF via `pdf-lib`. |
| `students/[student-id]/loading.tsx`, `not-found.tsx` | Workspace fallbacks. |
| `applications/page.tsx` | Cross-student application workspace with filters, search and pagination. |
| `follow-ups/page.tsx` | Follow-up workload queue across all assigned students. |
| `progression-evidence/[evidence-id]/view/route.ts` | Authorized signed-URL issuer for progression evidence files. |
| `university-application-documents/[application-id]/[document-id]/view/route.ts` | Authorized signed-URL issuer for application documents. |

### 6.5 `director/`

| File | Purpose |
| --- | --- |
| `layout.tsx` | `requireDirector()` + `PortalShell`. |
| `dashboard/page.tsx` | Thin: calls `loadDirectorDashboard()` and renders `DirectorDashboard`. |
| `dashboard/loading.tsx` | Dashboard skeleton. |
| `students/page.tsx` | Student oversight plus primary-counselor assignment management. |
| `consultations/page.tsx` | Consultation oversight, plus legacy and duplicate-future consultation resolution tools. |
| `applications/page.tsx` | Application oversight across the institution. |
| `counselors/page.tsx` | Counselor accounts and approval queue. |
| `counselors/counselor-list.tsx` | Client component: approve/reject actions, section switching, the approval table. |
| `public-progress/page.tsx` | Curate and publish the seven public funnel metrics. |
| `reports/page.tsx` | Parent reports awaiting or completing Director review. |
| `reports/[report-id]/page.tsx` | Review one report: approve, or request revision. |
| `reports/[report-id]/pdf/route.ts` | Director-side PDF render. |
| `*/loading.tsx` | Per-route skeletons. |

### 6.6 `admin/`

| File | Purpose |
| --- | --- |
| `layout.tsx` | `PortalShell` with `AdminNavigation`. |
| `consultations/page.tsx` | Placeholder. States explicitly that admin consultation reporting is reserved for a separately reviewed feature, and reads no consultation records. |

### 6.7 `api/` and `auth/`

| File | Purpose |
| --- | --- |
| `api/recommendations/pr-intake/route.ts` | Re-checks the session, then forwards the intake payload to `pr-backend` with the internal secret. |
| `api/recommendations/pr-generate/route.ts` | Same, for generation. **Takes the student ID from the verified session, never from the request body.** Returns the backend status through unchanged; logs failures server-side without leaking them to the client. |
| `api/programs/route.ts` | Proxies the programme catalogue lookup used by the intake wizard. |
| `auth/confirm/route.ts` | Supabase email verification callback. Delegates to `verifyStudentEmail` and redirects to `/login?verified=true` or `/auth/error`. |

### 6.8 `actions/` — 24 Server Action modules

All are `"use server"`. Each guards, validates with Zod, delegates to a
`submit*` function, and calls `revalidatePath`. Grouped by domain:

**Auth** — `auth-actions.ts` (`login`, `register`, `logout`; login reads the
destination from `profiles.role`, never from a `next` parameter),
`counselor-auth-actions.ts` (421 lines — username registration, approval-aware
login), `director-auth-actions.ts`.

**Student self-service** — `profile-actions.ts` (identity / academics /
preferences, three separate saves), `student-profile-record-actions.ts` (test
scores and achievements CRUD), `student-profile-document-actions.ts` (two-phase
upload and delete), `consultation-actions.ts`,
`consultation-continuation-actions.ts` ("continue with K-GEO" after a completed
consultation).

**Counselor** — `consultation-outcome-actions.ts`, `counselor-slot-block-actions.ts`,
`counselor-private-record-actions.ts` (notes and follow-ups, 8 exports),
`counselor-progression-actions.ts` (advance and undo),
`counselor-progression-evidence-actions.ts`, `counselor-semester-summary-actions.ts`,
`counselor-eligibility-actions.ts`, `counselor-university-application-actions.ts`
(create / update / status / primary / archive / history),
`counselor-university-application-document-actions.ts`,
`counselor-application-journey-actions.ts`.

**Director** — `director-counselor-actions.ts` (approve / reject),
`director-student-assignment-actions.ts` (reassign primary counselor),
`director-consultation-actions.ts`, `director-duplicate-future-consultation-actions.ts`,
`director-public-progress-actions.ts`.

**Shared workflow** — `parent-report-actions.ts` (410 lines: the full draft →
review → revision → approve → finalize state machine plus attachments).

---

## 7. File reference — `src/components`

### 7.1 Shell (`components/shell/`)

| File | Purpose |
| --- | --- |
| `portal-shell.tsx` | The frame every signed-in portal renders inside. One ground, one max width, one padding rhythm. Declares the `portal-canvas` CSS container. |
| `portal-sidebar.tsx` | The single navigation rail behind all four roles. Mobile drawer with body-scroll lock; closes on route change by adjusting state during render rather than in an effect. |

Each role keeps a thin wrapper (`StudentSidebar`, `CounselorSidebar`,
`DirectorSidebar`, `AdminNavigation`) so route-matching stays local to the role
while the visual treatment stays in one place.

### 7.2 Auth (`components/auth/`)

| File | Purpose |
| --- | --- |
| `auth-card.tsx` | `AuthCard` (the frame for every auth screen) and `AuthNotice` (info / danger / success block). |
| `login-form.tsx` | Student email + password. `useActionState` against `login`. |
| `register-form.tsx` | Student registration with live institutional-email pattern validation. |
| `counselor-login-form.tsx` | Username + password. Deliberately has no `name="email"` field. |
| `counselor-register-form.tsx` | Counselor self-registration. |
| `director-login-form.tsx` | Director email + password. |

### 7.3 Forms (`components/forms/`)

| File | Purpose |
| --- | --- |
| `student-profile-onboarding.tsx` | 1,039 lines. The profile experience: sticky completion card with progress ring, a four-step stepper, and the identity/academics/preferences forms. Preferences stay disabled until identity is saved. |
| `student-profile-optional-sections.tsx` | 1,057 lines. Paginated test-score and achievement tables with inline create/edit/delete and a stacked card fallback driven by `data-label`. |
| `student-profile-documents.tsx` | Student document upload and list. |
| `consultation-form.tsx` | Booking form; renders the success receipt after submission. |
| `consultation-slot-picker.tsx` | Date + slot selection. Shows only genuinely selectable slots — no counselor workload or block reasons leak to the student. |
| `accessible-tag-input.tsx` | Multi-value tag entry. Prevents Enter from submitting the form; `aria-live` announcements; per-item remove labels. |
| `field-error.tsx` | Renders Zod field errors with the right `aria-describedby` wiring. |

### 7.4 Counselor (`components/counselor/`)

| File | Lines | Purpose |
| --- | --- | --- |
| `university-applications-section.tsx` | 1,399 | The full application management surface for one student: create, edit, status change, primary, archive, history. |
| `university-application-workspace.tsx` | 680 | Cross-student application workspace: filters, metrics, table + card list. |
| `university-application-documents.tsx` | 698 | Application document upload/list/remove, using native `<dialog>` modals. |
| `application-journey-section.tsx` | 519 | Offer / fee / visa / enrolment journey editor with conditional-offer requirements. |
| `counselor-private-records.tsx` | 904 | Notes and follow-ups: create, edit, pin, delete, complete. |
| `official-progression-section.tsx` | 612 | Current stage, history, and the correction control. |
| `official-progression-actions.tsx` | 157 | The advance-stage form. |
| `progression-correction-control.tsx` | 293 | Reversal dialog for a mistaken transition. |
| `progression-evidence-controls.tsx` | 470 | Evidence upload/list/remove for a progression event. |
| `student-profile-view.tsx` | 851 | Read-only Student 360 view plus consultation history. |
| `student-workspace-shell.tsx` / `-navigation.tsx` / `-sections.tsx` | 101 / 46 / 332 | The workspace frame, its tab bar, and the eight tab bodies. |
| `student-directory.tsx` | 576 | Directory filters and results (table + mobile cards). |
| `follow-up-workload.tsx` / `-actions.tsx` | 516 / 223 | The follow-up queue and its row actions. |
| `eligibility-assessment.tsx` | 340 | Eligibility form and assessment history. |
| `counselor-semester-summary.tsx` | 182 | Semester summary entry and history. |
| `counselor-slot-blocks.tsx` | 161 | Personal slot blocking. |
| `consultation-outcome-controls.tsx` | 110 | Mark completed / no-show, plus next-work links. |
| `my-primary-students.tsx` | 62 | The counselor's primary-student list. |
| `student-profile-documents.tsx` | 57 | Read-only view of a student's documents. |
| `CounselorSidebar.tsx` | 45 | Counselor nav wrapper. |

### 7.5 Director (`components/director/`)

| File | Lines | Purpose |
| --- | --- | --- |
| `director-dashboard.tsx` | 523 | Attention summary, primary metrics, attention items, counselor workload table + cards, secondary metric groups. |
| `director-student-assignment-management.tsx` | 343 | Reassign a student's primary counselor, with history. |
| `director-operational-oversight.tsx` | 256 | Four oversight views (students, consultations, applications, counselors) sharing one filter/table/card structure. |
| `director-duplicate-future-consultation-resolution.tsx` | 216 | Close duplicate future waiting consultations. |
| `director-legacy-consultation-resolution.tsx` | 189 | Close legacy pre-slot consultations. |
| `director-public-progress.tsx` | 144 | Edit and publish the seven public metrics. |
| `DirectorSidebar.tsx` | 74 | Director nav wrapper. |

### 7.6 Student, public, UI

| File | Purpose |
| --- | --- |
| `student/university-applications-section.tsx` | Read-only application list for the student. Contract-tested to contain **no** `<button>`, `<form>`, `<a>` or `href`. |
| `student/continue-with-kgeo-form.tsx` | The one trusted post-consultation action a student can take. |
| `parent-reports/parent-report-workspace.tsx` | 479 lines. The shared counselor/director report editor. |
| `public/public-navigation.tsx` | Landing-page primary nav. |
| `public/public-progress-section.tsx` / `-funnel.tsx` | The published funnel on the landing page. |
| `CountryCombobox.tsx`, `CourseCombobox.tsx`, `SpecializationCombobox.tsx` | Searchable comboboxes over the static catalogues in `lib/`. |
| `admin/admin-navigation.tsx` | Admin nav wrapper. |
| `ui/*.tsx` | shadcn-style primitives over Base UI: `badge`, `button`, `command`, `dialog`, `input`, `input-group`, `popover`, `textarea`, plus `submit-button` (a `useFormStatus` pending-state button). |

---

## 8. File reference — `src/lib`

### 8.1 `lib/permissions/`

| File | Purpose |
| --- | --- |
| `index.ts` | The five `require*` guards. See [section 4](#4-authentication-and-authorization). |
| `student-access.ts` | Pure decision: `allowed` / denied, from user + profile. |
| `counselor-access.ts` | Pure decision including the `pending` state, from user + profile + account. |
| `director-access.ts` | Pure decision for Director. |

### 8.2 `lib/supabase/`

| File | Purpose |
| --- | --- |
| `server.ts` | Cookie-bound server client. |
| `client.ts` | Browser client. |
| `admin.ts` | Service-role client, server-only. |
| `env.ts` | Validates `NEXT_PUBLIC_SUPABASE_URL` and the publishable key once. |
| `proxy.ts` | `updateSession` — the middleware body. |

### 8.3 `lib/auth/`

| File | Purpose |
| --- | --- |
| `email-verification.ts` | Parses the Supabase verification parameters, calls `verifyOtp`, and returns the redirect path. Both success and failure paths are constants. |
| `role-redirect.ts` | `ROLE_HOME_PATHS` and `getRoleHomePath`. Deliberately ignores `next`, `redirect_to` and search parameters — the destination comes only from the stored role. |

### 8.4 `lib/validation/`

Every Server Action validates here before touching the database.

| File | Purpose |
| --- | --- |
| `auth.ts` | Login, student registration, counselor registration/login, Director login schemas. |
| `institutional-email.ts` | The exact `@kct.ac.in` rule, its normalizer, and the HTML `pattern` used by the register form. |
| `full-name.ts` | Canonical full-name schema and max length. |
| `consultation.ts` | Booking payload: date within horizon, valid slot, course/department pair. |
| `student-profile.ts` | 535 lines. Identity, academics and preferences schemas including CGPA scales, backlogs, funding, study pathway. |
| `student-optional-records.ts` | 440 lines. Test score and achievement schemas with date bounds. |
| `counselor-private-records.ts` | Note and follow-up schemas, including status transitions. |

### 8.5 `lib/consultations/`

| File | Purpose |
| --- | --- |
| `booking.ts` | `BUSINESS_TIME_ZONE = "Asia/Kolkata"`, `CONSULTATION_BOOKING_HORIZON_DAYS = 7`, the 16 half-hour `CONSULTATION_SLOTS` (09:00–17:00), calendar-date and weekend predicates, and the Asia/Kolkata business date/time reader. |
| `lifecycle.ts` | The **derived** state machine. See [12.1](#121-time-derived-consultation-lifecycle). |
| `submission.ts` | Booking submission and database-error mapping. |
| `submission-state.ts` | Whether the form should be locked. |
| `availability-state.ts` | Reducer for the slot picker. |
| `counselor-schedule.ts` | Builds a counselor's day: merges bookings and blocks onto the 16-slot grid, flags weekends, separates legacy and cancelled bookings. |
| `counselor-queries.ts` | Frozen column lists and query descriptors, so a screen cannot silently start selecting more columns. |
| `counselor-references.ts` | Batched request-number lookups with a hard ID cap. |
| `counselor-slot-blocking.ts` | Personal block/release validation. |
| `outcome.ts` | Completed / no-show outcome submission. |
| `continuation.ts` | The "continue with K-GEO" flow that creates a primary-counselor assignment. |
| `assignment.ts` | Retained assignment-queue types from before automatic allocation. |
| `options.ts` | Courses, departments, college end years, higher-studies interest options. |
| `student-list.ts` | The single frozen query descriptor for the student's own consultation list. |

### 8.6 `lib/counselor/` — the largest module

Follows the three-layer pattern throughout. Grouped by feature:

| Feature | Files |
| --- | --- |
| **Student 360** | `student-profile.ts` (931L), `student-profile-server.ts` |
| **Workspace** | `student-workspace-server.ts` |
| **Directory** | `student-directory.ts` (623L), `student-directory-server.ts` |
| **Case ownership** | `case-ownership.ts`, `case-ownership-server.ts` |
| **Progression** | `progression.ts` (901L), `progression-server.ts`, `progression-submission.ts` |
| **Corrections** | `progression-correction.ts`, `progression-correction-submission.ts` |
| **Evidence** | `progression-evidence.ts` (651L), `-server.ts`, `-submission.ts`, `-upload.ts`, `-view-url.ts` |
| **Applications** | `university-applications.ts`, `university-application-management.ts` (684L), `-server.ts`, `-submission.ts` (967L) |
| **App workspace** | `university-application-workspace.ts` (1,020L), `-server.ts` |
| **App documents** | `university-application-documents.ts` (829L), `-submission.ts`, `-upload.ts`, `-view-url.ts` |
| **Journey** | `application-journey.ts`, `-server.ts`, `-submission.ts` |
| **Private records** | `private-records.ts` (511L), `private-record-submission.ts` (576L) |
| **Follow-ups** | `follow-up-workload.ts` (751L), `-server.ts` |
| **Eligibility** | `eligibility.ts`, `-server.ts`, `-submission.ts` |
| **Semester summary** | `semester-summary.ts`, `-server.ts`, `-submission.ts` |
| **Primary students** | `primary-assignment.ts`, `-server.ts` |
| **Documents (read)** | `profile-documents-server.ts` |
| **Navigation** | `navigation.ts` — `isCounselorNavigationItemActive` |

The `*-view-url.ts` files are small but important: they validate that a signed
URL returned by Storage actually belongs to the expected bucket and object
before the app redirects a browser to it.

### 8.7 `lib/director/`

| File | Purpose |
| --- | --- |
| `dashboard.ts` (473L) | Strict parsers for the three dashboard RPCs, the primary/secondary metric definitions, attention-item presentation and severity summary. |
| `dashboard-server.ts` | `DIRECTOR_WORKLOAD_LIMIT = 20`, `DIRECTOR_ATTENTION_LIMIT = 25`; authorizes then fires exactly three RPCs in parallel, each degrading to an independent `{ status: "error" }` section. |
| `operational-oversight.ts` (427L) / `-server.ts` | The four oversight views: filters, pagination, search caps. |
| `student-assignment.ts` / `-server.ts` / `-errors.ts` | Primary-counselor reassignment, with database failures mapped to user-safe messages. |
| `legacy-consultation.ts` / `-server.ts` | Closing pre-slot legacy consultations. |
| `duplicate-future-consultation.ts` / `-server.ts` | Closing duplicate future waiting consultations. |
| `public-progress-server.ts`, `public-progress-action-state.ts` | Loading and publishing the public funnel. |

### 8.8 `lib/profiles/`, `lib/student/`, `lib/parent-reports/`

| File | Purpose |
| --- | --- |
| `profiles/types.ts` | `ProfileStep`, action state, the row/form value types, `ProfileCompletionPresentation`. |
| `profiles/completion.ts` | Maps the `student_profile_completion` view into a title, description, CTA label, percentage and up to three hints. |
| `profiles/submission.ts` | Identity/academics/preferences save payloads and injectable stores. |
| `profiles/options.ts` | Colleges, graduation years, semesters, CGPA scales, interest options. |
| `profiles/optional-records.ts` / `-submission.ts` / `-types.ts` | Test scores and achievements: schemas, pagination, CRUD. |
| `student/university-applications.ts` | Student-safe presentation of applications; the neutral status labels. |
| `student/university-application-server.ts`, `application-journey-server.ts` | The two student-side read loaders. |
| `student/profile-documents.ts` | Bucket ID, size caps, accepted MIME types, document type labels. |
| `student/profile-document-action-state.ts` | Upload capability and phase types. |
| `parent-reports/parent-report.ts` | Status schema, attachment rules, workspace types, status labels. |
| `parent-reports/server.ts` | Counselor and Director load paths, plus the render payloads. |
| `parent-reports/pdf.ts` (426L) | Builds the report PDF with `pdf-lib`. |
| `parent-reports/response.ts` | Wraps the PDF bytes in a `Response` with the right headers. |

### 8.9 Root-level `lib/` files

| File | Purpose |
| --- | --- |
| `utils.ts` | `cn()` — `clsx` + `tailwind-merge`. |
| `countries.ts` | Country list for the combobox. |
| `courses.ts` | Curated course catalogue and student-category mapping used by PR intake. |
| `specializations.ts` | Course → specialization map. |
| `competitiveExams.ts` | Exam catalogue and relevance filter. |
| `public-progress.ts` / `-server.ts` | The seven funnel metric keys, parser, timestamp formatter, loader. |
| `uploadMarksheet.ts`, `uploadResume.ts` | Direct browser uploads to their private buckets. |
| `env/site-url.ts` | Canonical site URL for email redirect links. |
| `env/counselor-auth-domain.ts` | The synthetic domain counselor usernames are mapped onto for Supabase Auth. |

---

## 9. File reference — supporting files

| File | Purpose |
| --- | --- |
| `src/proxy.ts` | Exports `proxy` and the `config.matcher` for the four protected prefixes. |
| `src/types/database.ts` | 2,332 lines. Generated Supabase types: tables, views, functions, enums for both schemas. |
| `src/types/index.ts` | 589 lines. Hand-written domain unions — roles, consultation statuses, progression stages, application statuses, parent report statuses, public progress keys. |
| `src/test/setup.ts` | The test harness. See [12.5](#125-the-test-harness). |
| `next.config.ts` | Next.js config, including the pinned Turbopack workspace root. |
| `eslint.config.mjs` | Flat ESLint config extending `eslint-config-next`. |
| `postcss.config.mjs` | Loads `@tailwindcss/postcss`. |
| `components.json` | shadcn component generation config. |
| `tsconfig.json` | Strict TypeScript, `@/*` path alias. |
| `AGENTS.md` / `CLAUDE.md` | Contributor instructions (coding standards, auth rules, workflow gates). |
| `PROJECT_BRIEF.md` | Product-level brief. |

---

## 10. File reference — `pr-backend`

A standalone Express service. It is never reachable from a browser.

| File | Purpose |
| --- | --- |
| `src/index.ts` | Bootstraps Express on port 4000. A public `GET /health`. Everything under `/api` is mounted **behind** `verifyInternalSecret`. The CORS callback **rejects any request carrying an `Origin` header** — the only legitimate callers are server-to-server and send none. |
| `src/middleware/verifyInternalSecret.ts` | Compares `x-internal-secret` against `INTERNAL_API_SECRET`; 401 on missing, mismatched, or unset. |
| `src/lib/supabaseAdmin.ts` | The service-role Supabase client. The only one in the system. |
| `src/lib/gemini.ts` | `GoogleGenAI` client and the single `GEMINI_MODEL` constant. Throws at startup if `GEMINI_API_KEY` is absent, so a misconfigured deploy fails immediately rather than at first use. |
| `src/routes/prIntake.ts` | Persists the intake snapshot into `recommendation.pr_intake`. |
| `src/routes/personalRecommendation.ts` | The generation pipeline. See [12.4](#124-the-ai-generation-pipeline). |
| `src/routes/programs.ts` | Serves the programme catalogue lookup. |

> **Note on the model constant.** `GEMINI_MODEL` is `'gemini-3.5-flash'`, and
> the source carries its own comment that the name should be re-checked against
> AI Studio because Google renames models. It is pinned in one place precisely
> so that check has a single target.

---

## 11. File reference — `supabase`

### 11.1 `migrations/` — 46 files, applied in filename order

Named `YYYYMMDDNNNN_description.sql`. **They are never edited after being
applied**, and several tests assert their SHA-256 hashes. Reading the filenames
in order gives a build log of the product:

| Phase | Migrations |
| --- | --- |
| Identity | `202607170001_initial_kgeo_schema` |
| Consultations v1 | `202607180001_consultation_requests_v1`, `202607190001_single_counselor_slot_booking` |
| Student profile | `202607190002_student_profile_foundation`, `202607200001_require_core_profile_for_preferences` |
| Directory | `202607200002_counselor_student_directory_foundation` |
| Names & outcomes | `202607230001..0004` (canonical names, atomic identity save, reference RPC, column hardening) |
| Private records | `202607250001_counselor_notes_and_follow_ups_foundation`, `202607250002_counselor_follow_up_workload` |
| Progression | `202607250003_official_counseling_progression`, `202607260001_progression_evidence_foundation`, `202607260002_progression_correction_foundation` |
| Applications | `202607270001_university_application_foundation`, `202607280001_student_university_application_read_foundation`, `202608010001_university_application_documents_foundation`, `202608020001_counselor_application_workspace_read_foundation` |
| Director | `202608060001..0003` (dashboard read, identity bootstrap, staff provisioning), `202608070001` (trigger ambiguity fix), `202608090001_director_operational_oversight_foundation` |
| Assignment | `202608110001_consultation_ownership_fcfs_assignment`, `202608120001_primary_counselor_assignment_foundation`, `202608130001..0002` (storage authorization helpers, case-ownership enforcement) |
| Counselor accounts | `202608180001` (outcome ACL), `202608180002_counselor_registration_approval`, `202608200001` (insert timing fix) |
| Public progress | `202608210001_kgeo_public_progress_publishing` |
| Hardening | `202608210002_counselor_student_workspace_read_security`, `202608210003_director_primary_counselor_assignment` |
| Eligibility | `202608220001_student_eligibility_assessment` |
| Consultation cleanup | `202608220002_controlled_legacy_consultation_closure`, `202608230001_duplicate_future_waiting_consultation_closure` |
| Time-aware lifecycle | `202608230002_time_aware_consultation_lifecycle`, `202608230003_complete_time_aware_consultation_prerequisites` |
| Automatic allocation | `202608240001_automatic_consultation_allocation` |
| Student documents | `202608240002_student_profile_documents`, `202608250001_student_profile_v2_client_corrections` |
| Journey & reports | `202608250002_counselor_journey_progress_semester_summaries`, `202608250003_university_application_journey_extension`, `202608250004_application_journey_rpc_acl_correction`, `202608250005_parent_report_workflow` |

### 11.2 Other SQL directories

| Directory | Purpose |
| --- | --- |
| `recommendation/` | The AI schema, kept separate: `202607260001` and `202607270001_recommendation_schema`, `202607270002_pr_intake_academic_marksheets`, `20240801000000_add_development_plans`, `20260813000000_consolidated_pr_upgrades`, `_bundle.sql`, `README.md`. |
| `storage-owner/` | Policies that must run as the **bucket owner** rather than as the migration role: progression evidence select, student profile document policies, parent report attachment policies. |
| `verification/` | Read-only pre-flight gates run *before* a risky migration to prove the database is in the expected state. Includes `pre_phase_c2_readiness.sql`, whose hash is asserted by tests. |
| `operations/` | One-off data operations, retained as a record: deleting demo consultations, inventorying and deleting legacy pending consultations, and a legacy counselor conversion script. |
| `_bundle_public.sql`, `_bundle_storage_policies.sql` | Concatenated bundles for a fresh bring-up. |
| `SETUP_GUIDE.md`, `CHECK_STATE.sql` | Bring-up instructions and a diagnostic query for what is currently applied. |

### 11.3 The three schemas

| Schema | Tables | Reach |
| --- | --- | --- |
| `public` | 27 | Operational records: identity, consultations, progression, applications, documents, reports, public progress. |
| `recommendation` | 9 | `universities`, `programs`, `university_programs`, `pr_intake`, `recommendations`, `recommendation_items`, `pr_insights`, `development_plans`, `llm_call_log`. Own RLS policies, shared authentication. |
| `private` | 2 | `kgeo_staff_provisioning_requests`, `kgeo_counselor_registration_requests`. No application role can reach it. |

### 11.4 Storage buckets

All private. `academic-documents`, `student-profile-documents`,
`university-application-documents`, `counseling-progression-evidence`,
`parent-report-attachments`, `student-resumes`, `universities`.

---

## 12. Deep dives

### 12.1 Time-derived consultation lifecycle

`lib/consultations/lifecycle.ts` does not read a lifecycle column. It derives
state from the stored status **plus the current time**:

```ts
getConsultationLifecycleState(consultation, now) → ConsultationLifecycleState
```

Terminal statuses (`completed`, `no_show`, `cancelled`) short-circuit. Otherwise
the function checks whether the booking is *canonical* — weekday, start between
09:00 and 16:30, aligned to :00/:30, and exactly 30 minutes — and returns
`pending` when it is not. That single predicate is what identifies pre-slot
"legacy" bookings without a migration flag.

For canonical bookings it compares against Asia/Kolkata business time to produce
`upcoming`, `in_progress`, `outcome_required` or `expired_request`.

**Why this matters.** "In progress" and "outcome required" exist without any
scheduled job writing them. There is no cron, no queue, and no window in which
the database disagrees with what the screen shows. The cost is that the state is
only correct relative to the `now` passed in — which is why every caller passes
one explicit `now` for the whole render rather than calling `new Date()` per row.

Two label functions serve different audiences: `getConsultationLifecycleLabel`
for staff, and `getStudentConsultationLifecycleLabel`, which softens
`outcome_required` to "Outcome Pending" and collapses assignment states into
"Booking needs review" so students never see internal queue vocabulary.

### 12.2 The two-phase upload protocol

Every private file in the system — marksheets, profile documents, application
documents, progression evidence, report attachments — uses the same protocol,
implemented in the `*-upload.ts` files as an injectable state machine:

```
validating → preparing → uploading → finalizing → succeeded
                                                → failed
```

1. **validate** — size, MIME type and filename checked client-side first.
2. **prepare** — a `prepare_*` RPC authorizes the caller, records an upload
   *intent* with a short expiry, and returns a signed target path.
3. **upload** — the browser puts the bytes directly to Storage.
4. **finalize** — a `finalize_*` RPC records the object only after the bytes
   have landed.

The intent step is what makes this safe: the database never has a row pointing
at an object that does not exist, and an abandoned upload expires rather than
leaving a phantom record. `runProgressionEvidenceUpload` also re-checks that the
file being uploaded is byte-for-byte the file that was prepared (name, MIME and
size must all match) before finalizing, and surfaces a
`retryFinalizeEvidenceId` so a network failure between steps 3 and 4 can be
resumed rather than restarted.

Reading a file back is symmetric: the `view/route.ts` handlers call an
`authorize_*` RPC, then mint a short-lived signed URL, then validate that the
URL actually points at the expected bucket and object (`*-view-url.ts`) before
redirecting. No storage path is ever exposed to the client.

### 12.3 Append-only progression with corrections

`student_counseling_progressions` holds the current stage; every transition is
appended to `student_counseling_progression_events`.

A mistake is **not** fixed by editing. `progression-correction-submission.ts`
writes a row to `student_counseling_progression_event_corrections` describing
either an `undo_transition` or a `reset_initialization`, and the current stage is
restored from the corrected event's `previous_stage`. The original event stays in
the log.

Two guards make this trustworthy:

- A transition that has **evidence files attached** cannot be silently undone —
  `PROGRESSION_CORRECTION_EVIDENCE_BLOCK_MESSAGE` refuses it, because reversing
  it would orphan the evidence.
- Correction targets are verified twice: `verifyPrimaryCounselorCaseAccess`
  confirms the counselor owns the case, then `verifyCounselorProgressionEventTarget`
  confirms the event belongs to that student. Only then is the student ID marked
  trusted, via the `createTrustedCorrectionTargetVerifier` closure in
  `counselor-progression-actions.ts` — the action never trusts the student ID
  from the submitted form.

### 12.4 The AI generation pipeline

1. The intake wizard uploads marksheets and posts to `/api/recommendations/pr-intake`.
2. That handler re-checks the session and forwards to `pr-backend`, which writes
   `recommendation.pr_intake`.
3. The student triggers generation; `/api/recommendations/pr-generate` takes the
   student ID **from the verified session** and forwards with the internal secret.
4. `personalRecommendation.ts` validates with Zod, refuses with **409** if no
   intake exists ("complete the intake form first"), and inserts a
   `recommendations` row with `status: 'queued'` and the model name.
5. It prompts Gemini for a strict JSON shape: each item carries a `fit_bucket`
   of exactly `Safe`, `Match` or `Reach`, a fit score, admission probability,
   strengths, missing requirements and a roadmap. A `503`/`UNAVAILABLE` response
   is detected and retried rather than treated as a hard failure.
6. Results are parsed defensively — an unrecognised `fit_bucket` falls back to
   `Match` rather than throwing — and written as ranked `recommendation_items`
   with per-programme `pr_insights`.
7. The prompt and raw response go to `recommendation.llm_call_log`.
8. The row is marked complete or failed; the route returns **202** with the
   recommendation ID and status.

The student's roadmap page then reads the finished record under their own
RLS-scoped session. A `failed` row renders a retry rather than a dead end.

### 12.5 The test harness

`src/test/setup.ts` is the most unusual file in the repository. It monkey-patches
`fs.readFileSync` before any test runs, and intercepts two path shapes:

- `supabase/migrations/202*_*.sql`
- `supabase/verification/pre_phase_c2_readiness.sql`

For those, it returns the **git-committed blob** (`git show HEAD:<path>`, or
`origin/main` for the readiness file) instead of the working-tree file.

The consequence: the migration hash assertions cannot be defeated by editing a
migration locally. The test compares against what is committed, so an attempt to
quietly rewrite applied history fails the suite. A genuinely new, uncommitted
migration falls through to the workspace, so adding one is not blocked.

The same patch normalizes `\r\n` → `\n` on every other read, which is what makes
the hash assertions stable on Windows checkouts.

The suite is plain `node:test` — no external framework — with all 106 files
listed explicitly in the `test` script rather than globbed, so adding a test file
is a deliberate act.

**UI contract tests.** Alongside ordinary unit tests, 25 contract files read
component source and `globals.css` as text and assert on their structure:

- the student application view contains no `<button>`, `<form>`, `<a>` or `href`;
- a Director screen renders no raw student identifier;
- every wide table has a mobile fallback, a reduced-motion rule, and
  `overflow-wrap: anywhere`;
- the dashboard renders the profile section before applications before consultations;
- production sources contain no `service_role`, `console.log`, or direct
  `.from()` access on privacy-sensitive paths.

These catch the class of regression where a screen still renders correctly but
has quietly gained a capability it was never meant to have.

### 12.6 CSS architecture

`globals.css` is one file, in four bands:

1. **Tokens** — a single palette (`--brand-*`, `--ink*`, `--surface*`, semantic
   `--ok/--warn/--bad/--info`, elevation, radii). Legacy names (`--green`,
   `--paper`, `--line`) survive as *aliases* pointing at the new values, so
   older feature CSS resolves correctly without being rewritten rule by rule.
2. **Type scale** — element-level `h1`–`h6` rules. Tailwind's preflight resets
   headings to `font-size: inherit`, so without these every unstyled heading
   renders at body size.
3. **Feature CSS** — the per-screen rules written alongside each migration.
4. **Design layer** — maps the semantic vocabulary (`.button`, `.panel`,
   `.*-table`, `.field`) onto the token system. Written with `:where()`, so it
   carries **zero specificity** and can only fill in what no feature rule
   claims. An earlier version used plain class selectors appended last, which
   silently beat every feature rule at equal specificity and flattened
   intentional gradients to white.

**Container queries.** The portal shell declares `container: portal / inline-size`
on its content canvas. Because every portal has a fixed 17rem rail, viewport
media queries measure something ~272px wider than the column content actually
gets. Each wide table therefore swaps to its card or stacked layout at a
threshold matched to its own minimum width plus the padding of the card it sits
in — so a table is only ever rendered at a width where it genuinely fits.

---

## 13. Conventions and invariants

These hold across the codebase. Breaking one should fail a test.

1. **Server Components by default.** `"use client"` only where interaction
   requires it.
2. **Every mutation is a Server Action** that guards, validates with Zod, and
   revalidates. No mutation happens in a route handler.
3. **Never trust a client-supplied identity.** Student IDs come from the
   verified session or from a verifier closure that has confirmed ownership.
4. **Column lists are frozen constants.** `*_COLUMNS` and `*_QUERY` descriptors
   live in the domain layer so a screen cannot silently widen its select.
5. **No `any`.** Contract tests assert its absence on sensitive paths, along
   with `as unknown as`, `@ts-ignore` and `@ts-expect-error`.
6. **Errors never leak diagnostics.** No `error.message`, SQL state or hint
   reaches a component; failures degrade to a stated safe state.
7. **Sections fail independently.** A Director dashboard with one broken RPC
   renders the other two and an inline error for the third.
8. **Migrations are immutable** and hash-asserted.
9. **Build one complete vertical slice at a time** — UI, validation, action,
   migration, RLS policy and tests land together.
10. **Every list has an empty state, a loading state and an unavailable state.**

---

## 14. Environment and commands

### Environment variables

| Variable | Service | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | web | Supabase project URL. |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | web | Publishable key. RLS applies. Validated by `lib/supabase/env.ts`. |
| `NEXT_PUBLIC_SITE_URL` | web | Canonical origin for verification email links. |
| `KGEO_BACKEND_URL` | web | Base URL of `pr-backend`. Set in `.env.local` for local dev; on Vercel it is injected by the service binding in `vercel.json`, so do not set it there. |
| `INTERNAL_API_SECRET` | **both** | Shared secret for the `x-internal-secret` header. |
| `SUPABASE_URL` | backend | Supabase project URL. |
| `SUPABASE_SERVICE_ROLE_KEY` | backend | **Service role.** Bypasses RLS. Backend only. |
| `GEMINI_API_KEY` | backend | Google Gemini key. Absence throws at startup. |
| `PORT` | backend | Defaults to 4000. |

### Commands

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js dev server. |
| `npm run dev:backend` | `pr-backend` via `ts-node-dev`. |
| `npm run dev:all` | Both, via `concurrently`. |
| `npm run build` / `npm start` | Production build and serve. |
| `npm run typecheck` | `next typegen && tsc --noEmit`. |
| `npm run lint` | ESLint. |
| `npm test` | All 106 test files under `node:test`. |

### Before completing any change

Per `AGENTS.md`: run linting, run type checking, run the relevant tests, then
report the files changed, the commands run, and any manual configuration still
outstanding.
