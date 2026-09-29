import assert from "node:assert/strict";
import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function readTree(relativePath: string): string {
  const root = new URL(relativePath, import.meta.url);
  const rootPath = root.pathname.startsWith("/")
    ? decodeURIComponent(root.pathname.slice(1))
    : decodeURIComponent(root.pathname);

  function collect(path: string): string[] {
    return readdirSync(path).flatMap((name) => {
      const child = join(path, name);
      return statSync(child).isDirectory() ? collect(child) : [child];
    });
  }

  return collect(rootPath)
    .filter((path) => /\.(?:ts|tsx)$/.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

const migration = read(
  "../../../supabase/migrations/202607250001_counselor_notes_and_follow_ups_foundation.sql",
);
const actions = read(
  "../../app/actions/counselor-private-record-actions.ts",
);
const component = read(
  "../../components/counselor/counselor-private-records.tsx",
);
const profileView = read(
  "../../components/counselor/student-profile-view.tsx",
);
const profileServer = read("./student-profile-server.ts");
const profileContract = read("./student-profile.ts");
const privateRecordsSource = read("./private-records.ts");
const validation = read("../validation/counselor-private-records.ts");
const databaseTypes = read("../../types/database.ts");
const styles = read("../../app/globals.css");
const documentation = read("../../../docs/database.md");
const readiness = read(
  "../../../supabase/verification/pre_phase_c2_readiness.sql",
);

test("prepared migration is additive, transactional, and creates only the D1 foundation", () => {
  assert.match(migration, /^begin;/m);
  assert.match(migration, /^commit;/m);
  assert.equal(
    migration.match(/^create table public\./gm)?.length,
    2,
  );
  assert.match(migration, /create table public\.counselor_student_notes/);
  assert.match(migration, /create table public\.counselor_follow_ups/);
  assert.match(
    migration,
    /create type public\.counselor_follow_up_priority as enum \(\s*'low',\s*'normal',\s*'high'/,
  );
  assert.match(
    migration,
    /create type public\.counselor_follow_up_status as enum \(\s*'pending',\s*'completed',\s*'cancelled'/,
  );
  assert.doesNotMatch(
    migration,
    /^(?:update|delete from|truncate)\s+public\./im,
  );
  assert.doesNotMatch(
    migration,
    /alter table public\.(?:profiles|student_profiles|student_preferences|consultation_requests)\b/i,
  );
  assert.doesNotMatch(migration, /service[_ -]?role/i);
});

test("constraints preserve history, normalize bounded text, and protect completion audit", () => {
  assert.match(migration, /on delete restrict/g);
  assert.equal(migration.match(/on delete set null/g)?.length, 2);
  assert.match(migration, /char_length\(note_text\) between 1 and 5000/);
  assert.match(migration, /char_length\(next_action\) between 1 and 500/);
  assert.match(migration, /char_length\(details\) between 1 and 2000/);
  assert.match(
    migration,
    /status = 'completed'[\s\S]*?completed_at is not null[\s\S]*?completed_by = counselor_id/,
  );
  assert.match(
    migration,
    /status in \([\s\S]*?'pending'[\s\S]*?'cancelled'[\s\S]*?completed_at is null[\s\S]*?completed_by is null/,
  );
  assert.match(migration, /updated_at >= created_at/g);
});

test("trusted trigger derives counselor ownership and rejects invalid targets", () => {
  const triggerFunction =
    migration.match(
      /create function public\.prepare_counselor_private_record\(\)[\s\S]*?\$function\$;/,
    )?.[0] ?? "";
  assert.match(triggerFunction, /security definer/);
  assert.match(triggerFunction, /set search_path = ''/);
  assert.match(triggerFunction, /caller_id := \(select auth\.uid\(\)\)/);
  assert.match(triggerFunction, /role = 'counselor'::public\.user_role/);
  assert.match(triggerFunction, /is_active is true/);
  assert.match(triggerFunction, /email_confirmed_at is not null/);
  assert.match(triggerFunction, /student_profile\.role = 'student'/);
  assert.match(
    triggerFunction,
    /consultation\.student_id = new\.student_id/,
  );
  assert.match(triggerFunction, /new\.counselor_id := caller_id/);
  assert.match(triggerFunction, /new\.created_at := change_time/);
  assert.match(triggerFunction, /new\.updated_at := change_time/);
  assert.match(triggerFunction, /new\.status := 'pending'/);
  assert.match(triggerFunction, /new\.completed_at := null/);
  assert.match(triggerFunction, /new\.completed_by := null/);
});

test("RLS exposes only active verified counselor-owned rows", () => {
  assert.equal(
    migration.match(/^create policy /gm)?.length,
    7,
  );
  assert.match(
    migration,
    /alter table public\.counselor_student_notes enable row level security/,
  );
  assert.match(
    migration,
    /alter table public\.counselor_follow_ups enable row level security/,
  );
  const policySection = migration.slice(
    migration.indexOf("create policy counselor_student_notes_select_own"),
  );
  assert.equal(
    policySection.match(/counselor_id = \(select auth\.uid\(\)\)/g)?.length,
    9,
  );
  assert.equal(
    policySection.match(/has_active_verified_kgeo_role/g)?.length,
    9,
  );
  assert.match(
    policySection,
    /counselor_follow_ups_update_pending_own[\s\S]*?using \([\s\S]*?status = 'pending'[\s\S]*?with check \([\s\S]*?status = 'pending'/,
  );
  assert.doesNotMatch(
    policySection,
    /to anon|role = '(?:student|admin|director)'|select_(?:student|admin|director)/,
  );
});

test("grants expose only approved mutable columns and no follow-up deletion", () => {
  assert.match(
    migration,
    /revoke all privileges on table public\.counselor_student_notes\s+from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /revoke all privileges on table public\.counselor_follow_ups\s+from public, anon, authenticated/,
  );
  const noteUpdate =
    migration.match(
      /grant update \(([^)]*)\) on table public\.counselor_student_notes\s+to authenticated;/,
    )?.[1] ?? "";
  const followUpUpdate =
    migration.match(
      /grant update \(([^)]*)\) on table public\.counselor_follow_ups\s+to authenticated;/,
    )?.[1] ?? "";
  assert.match(noteUpdate, /consultation_id/);
  assert.match(noteUpdate, /note_text/);
  assert.match(noteUpdate, /is_pinned/);
  assert.doesNotMatch(
    noteUpdate,
    /student_id|counselor_id|created_at|updated_at/,
  );
  assert.match(followUpUpdate, /due_date/);
  assert.match(followUpUpdate, /priority/);
  assert.match(followUpUpdate, /next_action/);
  assert.match(followUpUpdate, /details/);
  assert.doesNotMatch(
    followUpUpdate,
    /student_id|counselor_id|status|completed_at|completed_by|created_at|updated_at/,
  );
  assert.doesNotMatch(
    migration,
    /grant delete on table public\.counselor_follow_ups/,
  );
});

test("follow-up status RPC is counselor-authorized, locking, auditable, and first-writer-wins", () => {
  const rpc =
    migration.match(
      /create function public\.record_counselor_follow_up_status\([\s\S]*?\$function\$;/,
    )?.[0] ?? "";
  assert.match(rpc, /security definer/);
  assert.match(rpc, /set search_path = ''/);
  assert.match(rpc, /p_status not in \('completed', 'cancelled'\)/);
  assert.match(rpc, /for update/);
  assert.match(rpc, /target_counselor_id <> caller_id/);
  assert.match(rpc, /target_status <> 'pending'/);
  assert.match(rpc, /follow_up\.status =\s*'pending'/);
  assert.match(rpc, /completed_at = case/);
  assert.match(rpc, /completed_by = case/);
  assert.match(rpc, /then caller_id/);
  assert.match(rpc, /errcode = '40001'/);
  assert.match(rpc, /when others then[\s\S]*?errcode = 'P0001'/);
  assert.match(
    migration,
    /revoke all on function public\.record_counselor_follow_up_status\(uuid, text\)\s+from public, anon, authenticated/,
  );
  assert.match(
    migration,
    /grant execute on function public\.record_counselor_follow_up_status\(uuid, text\)\s+to authenticated/,
  );
});

test("only four query-driven indexes are added", () => {
  assert.equal(migration.match(/^create index /gm)?.length, 4);
  for (const index of [
    "counselor_student_notes_student_history_idx",
    "counselor_student_notes_counselor_activity_idx",
    "counselor_follow_ups_student_status_due_idx",
    "counselor_follow_ups_counselor_status_due_idx",
  ]) {
    assert.match(migration, new RegExp(index));
  }
});

test("every action independently authorizes and uses a trusted target verifier", () => {
  assert.equal(
    actions.match(/export async function /g)?.length,
    9,
  );
  assert.equal(
    actions.match(/await requireCounselor\(\)/g)?.length,
    9,
  );
  assert.match(
    actions,
    /\.rpc\("get_counselor_student_identity"[\s\S]*?p_student_id: studentId/,
  );
  assert.match(
    actions,
    /\.from\("consultation_requests"\)[\s\S]*?\.eq\("id", consultationId\)[\s\S]*?\.eq\("student_id", studentId\)/,
  );
  assert.match(actions, /createTrustedTargetVerifier/);
  assert.match(actions, /getTrustedStudentId/);
  assert.match(actions, /\.eq\("counselor_id", user\.id\)/);
  assert.match(actions, /\.eq\("status", "pending"\)/);
  assert.doesNotMatch(actions, /console\.|error\.message|service[_ -]?role/i);
});

test("validation rejects duplicate and protected FormData instead of accepting audit fields", () => {
  assert.match(validation, /formData\.getAll\(field\)\.length !== 1/);
  assert.match(validation, /unsupported field/);
  assert.match(validation, /field\.startsWith\("\$ACTION_"\)/);
  assert.doesNotMatch(
    validation.match(/const NOTE_FIELDS[\s\S]*?as const;/)?.[0] ?? "",
    /counselor|created|updated|role/,
  );
  assert.doesNotMatch(
    validation.match(/const FOLLOW_UP_FIELDS[\s\S]*?as const;/)?.[0] ?? "",
    /counselor|completed|status|created|updated|role/,
  );
});

test("Student 360 keeps the existing six sections and adds counselor-only sections seven and eight", () => {
  for (const section of [
    "Overview",
    "Academic Portfolio",
    "Higher-Studies Preferences",
    "Consultation History",
    "Study Abroad Exams",
    "Achievements",
  ]) {
    assert.match(profileContract, new RegExp(section));
  }
  assert.match(profileView, /<CounselorPrivateRecords/);
  assert.match(component, /Section 7/);
  assert.match(component, /COUNSELOR_PRIVATE_RECORD_LABELS\.notes/);
  assert.match(privateRecordsSource, /Private Counselor Notes/);
  assert.match(component, /Section 8/);
  assert.match(component, /COUNSELOR_PRIVATE_RECORD_LABELS\.followUps/);
  assert.match(privateRecordsSource, /Follow-ups/);
  assert.match(privateRecordsSource, /Internal — not visible to student/);
});

test("D1 loading is bounded, parallel, independently unavailable, and uses one reference batch", () => {
  assert.match(profileServer, /await Promise\.all\(\[/);
  assert.match(profileServer, /\.range\(noteFrom, noteTo\)/);
  assert.match(profileServer, /\.range\(followUpFrom, followUpTo\)/);
  assert.match(
    profileServer,
    /\.limit\(COUNSELOR_PRIVATE_CONSULTATION_LIMIT\)/,
  );
  assert.equal(
    profileServer.match(
      /\.rpc\(\s*"get_counselor_consultation_references"/g,
    )?.length,
    1,
  );
  assert.match(
    profileContract,
    /notes: sections\.notes \?\? unavailablePrivateQuery/,
  );
  assert.match(
    profileContract,
    /followUps: sections\.followUps \?\? unavailablePrivateQuery/,
  );
  assert.match(
    privateRecordsSource,
    /Counselor notes are temporarily unavailable\./,
  );
  assert.match(
    privateRecordsSource,
    /Follow-up information is temporarily unavailable\./,
  );
});

test("consultation linking uses UUIDs, trusted student filtering, and no direct request-number selection", () => {
  const consultationProjection =
    privateRecordsSource.match(
      /COUNSELOR_PRIVATE_CONSULTATION_COLUMNS =\s*\n\s*"([^"]+)"/,
    )?.[1] ?? "";
  assert.match(consultationProjection, /\bid\b/);
  assert.match(consultationProjection, /\bstudent_id\b/);
  assert.doesNotMatch(consultationProjection, /request_number/);
  assert.match(profileServer, /\.eq\("student_id", trustedStudentId\)/);
  assert.match(actions, /\.eq\("student_id", studentId\)/);
  assert.match(
    component,
    /Consultation linking is temporarily unavailable[\s\S]*?"preserve the current link"/,
  );
  assert.doesNotMatch(component, /request_number.*(?:href|URLSearchParams)/);
});

test("private UI provides accessible forms, outcomes, confirmation, pagination, and reduced motion", () => {
  assert.match(component, /role=\{state\.status === "success" \? "status" : "alert"\}/);
  assert.match(component, /aria-busy=\{pending\}/g);
  assert.match(component, /<fieldset className="form-fields" disabled=\{pending\}>/g);
  assert.match(component, /aria-invalid=\{Boolean\(state\.errors/);
  assert.match(component, /<details className="counselor-private-delete">/);
  assert.match(component, /Confirm deletion/);
  assert.match(component, /aria-label=\{`Edit private note/);
  assert.match(component, /aria-label=\{`Edit follow-up/);
  assert.match(component, /aria-current="page"/);
  for (const label of [
    "Due today",
    "Overdue",
    "Upcoming",
    "Completed",
    "Cancelled",
  ]) {
    assert.match(privateRecordsSource, new RegExp(label));
  }
  assert.match(
    styles,
    /@media \(max-width: 650px\)[\s\S]*?counselor-private/,
  );
  assert.match(
    styles,
    /@media \(prefers-reduced-motion: reduce\)[\s\S]*?counselor-private/,
  );
});

test("student runtime modules contain no D1 table, action, or private-value references", () => {
  const studentRuntime = [
    readTree("../../app/student"),
    read("../../components/forms/student-profile-onboarding.tsx"),
    read("../../components/forms/student-profile-optional-sections.tsx"),
  ].join("\n");

  assert.doesNotMatch(
    studentRuntime,
    /counselor_student_notes|counselor_follow_ups|Private Counselor Notes|follow-up details|next_action|counselor-private/i,
  );
  assert.doesNotMatch(
    studentRuntime,
    /createCounselorStudentNote|createCounselorFollowUp|recordCounselorFollowUp/i,
  );
});

test("D1 values are not logged, placed in URLs, or rendered through raw errors", () => {
  const sources = `${actions}\n${component}\n${profileServer}\n${profileContract}`;
  assert.doesNotMatch(sources, /console\.(?:log|info|warn|error)/);
  assert.doesNotMatch(sources, /error\.message|sqlerrm/);
  assert.doesNotMatch(
    component.match(/function getPrivateRecordsUrl[\s\S]*?\n\}/)?.[0] ?? "",
    /note_text|next_action|details|consultation_reference/,
  );
  assert.doesNotMatch(actions, /redirect|redirect_to|next=/);
});

test("database types and read-only verification include exact D1 objects without row text", () => {
  assert.match(databaseTypes, /counselor_student_notes:/);
  assert.match(databaseTypes, /counselor_follow_ups:/);
  assert.match(databaseTypes, /counselor_follow_up_priority:/);
  assert.match(databaseTypes, /counselor_follow_up_status:/);
  assert.match(databaseTypes, /record_counselor_follow_up_status:/);
  assert.match(readiness, /counselor_student_notes/);
  assert.match(readiness, /counselor_follow_ups/);
  assert.match(readiness, /D1 policies are counselor-owned only/);
  assert.match(readiness, /D1 has no broad authenticated insert or update grants/);
  const aggregateSection =
    readiness.match(
      /-- Aggregate-only D1 inventory[\s\S]*?order by count_name;/,
    )?.[0] ?? "";
  assert.match(aggregateSection, /count\(\*\)::bigint/g);
  assert.doesNotMatch(
    aggregateSection,
    /note_text|next_action|details|student_id|counselor_id/,
  );
});

test("documentation records privacy, retention, lifecycle, performance, and rollout boundaries", () => {
  assert.match(documentation, /prepared, unapplied/);
  assert.match(documentation, /No D1 record is\s+student-visible/);
  assert.match(documentation, /on delete restrict/);
  assert.match(documentation, /on delete set null/);
  assert.match(documentation, /Due today/);
  assert.match(documentation, /Overdue/);
  assert.match(documentation, /EXPLAIN \(ANALYZE, BUFFERS\)/);
  assert.match(documentation, /Apply it manually/);
  assert.match(documentation, /direct student PostgREST/);
});
