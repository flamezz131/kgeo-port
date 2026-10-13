import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path: string) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

const migration = read(
  "../../../supabase/migrations/202608210003_director_primary_counselor_assignment.sql",
);
const assignmentFoundation = read(
  "../../../supabase/migrations/202608120001_primary_counselor_assignment_foundation.sql",
);
const stepTwoReadSecurity = read(
  "../../../supabase/migrations/202608210002_counselor_student_workspace_read_security.sql",
);
const action = read("../../app/actions/director-student-assignment-actions.ts");
const component = read(
  "../../components/director/director-student-assignment-management.tsx",
);
const page = read("../../app/director/students/page.tsx");
const server = read("./student-assignment-server.ts");
const domain = read("./student-assignment.ts");
const errors = read("./student-assignment-errors.ts");
const packageSource = read("../../../package.json");

function functionBody(name: string): string {
  const match = migration.match(
    new RegExp(
      `create(?: or replace)? function public\\.${name}\\([\\s\\S]*?\\$function\\$;`,
    ),
  );
  assert.ok(match, `Missing ${name}`);
  return match[0];
}

const reassignmentRpc = functionBody("reassign_primary_counselor");
const historyRpc = functionBody(
  "list_director_primary_counselor_assignment_history",
);

test("Step 2.5 is one forward transaction and leaves FCFS and Step 2 untouched", () => {
  assert.match(migration, /^--[\s\S]*?\nbegin;/);
  assert.match(migration, /\ncommit;\s*$/);
  assert.doesNotMatch(migration, /create or replace function public\.claim_next_consultation/);
  assert.doesNotMatch(migration, /create or replace function public\.is_active_primary_counselor_for_student/);
  assert.match(
    assignmentFoundation,
    /on conflict \(student_id\) where ended_at is null\s+do nothing/,
  );
  assert.match(
    stepTwoReadSecurity,
    /is_active_primary_counselor_for_student/,
  );
});

test("only an active verified Director can invoke the mutation", () => {
  assert.match(reassignmentRpc, /v_director_id uuid := \(select auth\.uid\(\)\)/);
  assert.match(
    reassignmentRpc,
    /has_active_verified_kgeo_role\([\s\S]*?'director'::public\.user_role[\s\S]*?is distinct from true/,
  );
  assert.doesNotMatch(reassignmentRpc, /p_director_id|p_assigned_by/);
});

test("Student and Counselor identities fail closed by trusted role", () => {
  assert.match(
    reassignmentRpc,
    /student_profile\.role = 'student'::public\.user_role[\s\S]*?for update/,
  );
  assert.match(
    reassignmentRpc,
    /counselor_profile\.role = 'counselor'::public\.user_role/,
  );
  assert.match(reassignmentRpc, /p_student_id = p_counselor_id/);
});

test("only approved active verified Counselors can become Primary Counselor", () => {
  assert.match(
    reassignmentRpc,
    /account\.approval_status =[\s\S]*?'approved'::public\.counselor_approval_status/,
  );
  assert.match(reassignmentRpc, /counselor_profile\.is_active is true/);
  assert.match(reassignmentRpc, /counselor_auth\.email_confirmed_at is not null/);
  assert.match(reassignmentRpc, /for update of account, counselor_profile, counselor_auth/);
});

test("pending rejected and inactive Counselor candidates stay off the client", () => {
  assert.match(
    domain,
    /row\.approval_status === "approved" && row\.is_active/,
  );
  assert.match(domain, /approval_status: z\.enum\(\["pending", "approved", "rejected"\]\)/);
  assert.match(server, /parseEligibleDirectorAssignmentCounselors/);
});

test("an unassigned Student fails closed and remains available for FCFS", () => {
  assert.match(
    reassignmentRpc,
    /select assignment\.counselor_id[\s\S]*?assignment\.ended_at is null[\s\S]*?for update;[\s\S]*?if not found then[\s\S]*?awaiting initial counselor assignment through the consultation queue/,
  );
  assert.ok(
    reassignmentRpc.indexOf("if not found then") <
      reassignmentRpc.indexOf("insert into public.student_counselor_assignments"),
  );
  assert.match(
    assignmentFoundation,
    /insert into public\.student_counselor_assignments[\s\S]*?on conflict \(student_id\) where ended_at is null\s+do nothing/,
  );
  assert.doesNotMatch(component, />Assign Counselor</);
  assert.match(
    component,
    /No Primary Counselor assigned\. Awaiting assignment through the FCFS[\s\S]*?consultation queue\./,
  );
});

test("reassignment inserts one current history row with the Director actor", () => {
  assert.match(
    reassignmentRpc,
    /insert into public\.student_counselor_assignments[\s\S]*?p_student_id,[\s\S]*?p_counselor_id,[\s\S]*?v_assignment_time,[\s\S]*?v_director_id,[\s\S]*?null,[\s\S]*?v_assignment_time,[\s\S]*?v_reason/,
  );
  assert.match(
    assignmentFoundation,
    /student_counselor_assignments_one_active_student_key/,
  );
});

test("reassignment ends the current row and inserts the replacement atomically", () => {
  assert.match(
    reassignmentRpc,
    /select assignment\.counselor_id[\s\S]*?assignment\.ended_at is null[\s\S]*?for update/,
  );
  assert.match(
    reassignmentRpc,
    /update public\.student_counselor_assignments as assignment\s+set ended_at = v_assignment_time/,
  );
  assert.ok(
    reassignmentRpc.indexOf("set ended_at = v_assignment_time") <
      reassignmentRpc.indexOf("insert into public.student_counselor_assignments"),
  );
});

test("unresolved current-Counselor consultations block reassignment", () => {
  assert.match(
    reassignmentRpc,
    /request\.student_id = p_student_id[\s\S]*?'submitted'::public\.consultation_status[\s\S]*?'waiting_for_assignment'::public\.consultation_status[\s\S]*?'counselor_assigned'::public\.consultation_status[\s\S]*?'scheduled'::public\.consultation_status[\s\S]*?order by request\.id asc[\s\S]*?for update/,
  );
  assert.match(
    reassignmentRpc,
    /request\.assigned_counselor_id = v_current_counselor_id[\s\S]*?'counselor_assigned'::public\.consultation_status,[\s\S]*?'scheduled'::public\.consultation_status[\s\S]*?Resolve the student''s active consultation/,
  );
});

test("final consultation history cannot block or be rewritten", () => {
  const activeGuard = reassignmentRpc.match(
    /if exists \([\s\S]*?Resolve the student''s active consultation[\s\S]*?end if;/,
  )?.[0];
  assert.ok(activeGuard);
  assert.doesNotMatch(activeGuard, /completed|no_show|cancelled/);
  assert.doesNotMatch(
    reassignmentRpc,
    /(?:update|delete from) public\.consultation_requests|set\s+assigned_counselor_id/,
  );
});

test("same-Counselor reassignment and malformed reasons are rejected", () => {
  assert.match(
    reassignmentRpc,
    /v_current_counselor_id = p_counselor_id[\s\S]*?already assigned/,
  );
  assert.match(reassignmentRpc, /p_reason is null or p_reason ~ '\[\[:cntrl:\]\]'/);
  assert.match(reassignmentRpc, /char_length\(v_reason\) not between 1 and 300/);
  assert.match(domain, /new Set\(\["studentId", "counselorId", "reason"\]\)/);
  assert.match(domain, /!allowedFields\.has\(field\)/);
  assert.match(domain, /value\.trim\(\)\.replace\(\/ \+\/gu, " "\)/);
  assert.match(domain, /DIRECTOR_ASSIGNMENT_REASON_MAX_LENGTH = 300/);
});

test("assignment history remains append-only including the reason", () => {
  const protection = functionBody(
    "protect_student_counselor_assignment_history",
  );
  assert.match(protection, /tg_op = 'DELETE'/);
  assert.match(
    protection,
    /new\.assignment_reason is distinct from old\.assignment_reason/,
  );
  assert.match(protection, /old\.ended_at is not null/);
  assert.match(protection, /new\.ended_at is null/);
  assert.match(
    protection,
    /v_actor_role = 'director'::public\.user_role[\s\S]*?new\.assignment_reason is null/,
  );
  assert.doesNotMatch(reassignmentRpc, /delete from public\.student_counselor_assignments/);
  assert.doesNotMatch(reassignmentRpc, /set\s+counselor_id\s*=/);
});

test("the history projection is Director-only bounded and identity-safe", () => {
  assert.match(
    historyRpc,
    /has_active_verified_kgeo_role\([\s\S]*?'director'::public\.user_role/,
  );
  assert.match(historyRpc, /cardinality\(p_student_ids\) not between 1 and 50/);
  assert.match(historyRpc, /history\.history_rank <= 5/);
  assert.doesNotMatch(
    historyRpc,
    /college_email|username|assigned_by|counselor_id\s+uuid/,
  );
});

test("reassignment switches Step 2 access from Counselor A to B immediately", () => {
  type Assignment = {
    studentId: string;
    counselorId: string;
    endedAt: string | null;
  };
  const canRead = (
    rows: Assignment[],
    counselorId: string,
    studentId: string,
  ) =>
    rows.some(
      (row) =>
        row.counselorId === counselorId &&
        row.studentId === studentId &&
        row.endedAt === null,
    );

  const after = [
    { studentId: "X", counselorId: "A", endedAt: "2026-08-21T10:00:00Z" },
    { studentId: "X", counselorId: "B", endedAt: null },
  ];
  assert.equal(canRead(after, "A", "X"), false);
  assert.equal(canRead(after, "B", "X"), true);
});

test("browser action authenticates independently and sends no Director identity", () => {
  assert.match(action, /await requireDirector\(\)/);
  assert.match(action, /reassign_primary_counselor/);
  assert.doesNotMatch(action, /directorId|assignedBy|p_director_id|p_assigned_by/);
  assert.doesNotMatch(action, /error\.(?:message|details|hint|code)/);
  assert.match(action, /mapDirectorAssignmentDatabaseFailure\(error\)/);
  assert.match(action, /stage: "reassign_primary_counselor"/);
  assert.match(action, /revalidatePath\("\/director\/students"\)/);
});

test("reviewed database failures map to exact safe Director guidance", () => {
  const mappings = new Map([
    [
      "The student is awaiting initial counselor assignment through the consultation queue",
      "This student has not received an initial Primary Counselor yet. Initial assignment must happen through the FCFS consultation queue.",
    ],
    [
      "The selected counselor is already assigned",
      "The selected Counselor is already this student's Primary Counselor.",
    ],
    [
      "Resolve the student's active consultation before reassigning the Primary Counselor",
      "This student has an active consultation with the current Counselor. Complete or resolve that consultation before reassignment.",
    ],
    [
      "Primary counselor assignment target is invalid",
      "Select an approved and active Counselor.",
    ],
    [
      "The Primary Counselor assignment changed concurrently",
      "The assignment changed while you were working. Refresh the page and try again.",
    ],
  ]);

  for (const [databaseMessage, userMessage] of mappings) {
    assert.ok(errors.includes(databaseMessage));
    assert.ok(errors.includes(userMessage));
  }
  assert.match(
    errors,
    /failure\.databaseMessage === value\.message/,
  );
  assert.doesNotMatch(errors, /details|hint|stack|authorization|uuid/i);
});

test("assignment form validation returns errors beside invalid fields", () => {
  assert.match(domain, /fieldErrors\.studentId = "Select a valid Student\."/);
  assert.match(
    domain,
    /fieldErrors\.counselorId = "Select an approved and active Counselor\."/,
  );
  assert.match(domain, /fieldErrors\.reason = "Enter a short assignment reason\."/);
  assert.match(domain, /DIRECTOR_ASSIGNMENT_REASON_MAX_LENGTH/);
  assert.match(component, /feedback\.fieldErrors\?\.counselorId/);
  assert.match(component, /feedback\.fieldErrors\?\.reason/);
  assert.match(component, /aria-invalid/);
});

test("Director UI exposes the required state and excludes the current Counselor", () => {
  for (const label of [
    "Student Name",
    "Programme",
    "Current Primary Counselor",
    "Assignment Since",
    "Current Status",
    "Reassign Counselor",
    "New Counselor",
    "Short reason",
  ]) {
    assert.match(component, new RegExp(label));
  }
  assert.match(
    component,
    /counselor\.counselorId !== selectedStudent\.currentCounselorId/,
  );
  assert.match(component, /Recent assignment history/);
  assert.doesNotMatch(component, /technical email|Auth UUID|assigned_by/i);
  assert.match(page, /DirectorStudentAssignmentManagement/);
});

test("mutation and history RPCs are sealed and authenticated-only", () => {
  for (const signature of [
    "reassign_primary_counselor\\(uuid, uuid, text\\)",
    "list_director_primary_counselor_assignment_history\\(uuid\\[\\]\\)",
  ]) {
    assert.match(
      migration,
      new RegExp(`alter function[\\s\\S]*?public\\.${signature}[\\s\\S]*?owner to postgres`),
    );
    assert.match(
      migration,
      new RegExp(`revoke all on function[\\s\\S]*?public\\.${signature}[\\s\\S]*?from public, anon, authenticated, service_role`),
    );
    assert.match(
      migration,
      new RegExp(`grant execute on function[\\s\\S]*?public\\.${signature}[\\s\\S]*?to authenticated`),
    );
  }
});

test("Step 2.5 focused tests are registered in the normal suite", () => {
  const script = JSON.parse(packageSource).scripts.test as string;
  assert.match(script, /student-assignment-foundation\.test\.ts/);
});
