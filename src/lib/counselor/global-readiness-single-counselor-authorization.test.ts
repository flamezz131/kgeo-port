import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../../../supabase/migrations/202610130001_single_counselor_global_readiness_authorization.sql",
    import.meta.url,
  ),
  "utf8",
);

const foundation = readFileSync(
  new URL(
    "../../../supabase/migrations/202609020001_global_masters_readiness_index.sql",
    import.meta.url,
  ),
  "utf8",
);

// Executable SQL only: comment lines are documentation, not behaviour.
const executable = migration
  .split("\n")
  .filter((line) => !line.trimStart().startsWith("--"))
  .join("\n");

function functionBody(sql: string, name: string): string {
  const match = sql.match(
    new RegExp(
      `create (?:or replace )?function ${name.replace(".", "\\.")}\\([\\s\\S]*?\\n\\$function\\$;`,
    ),
  );
  assert.ok(match, `${name} is defined`);
  return match[0];
}

const createFunction = functionBody(
  executable,
  "public.create_student_global_readiness_assessment",
);

test("the legacy write path required an active Primary Counselor assignment", () => {
  const legacy = functionBody(
    foundation,
    "public.create_student_global_readiness_assessment",
  );
  assert.match(legacy, /from public\.student_counselor_assignments as assignment/);
  assert.match(legacy, /if v_assignment_id is null then/);
  assert.match(foundation, /primary_assignment_id uuid not null/);
});

test("the corrected write path has no Primary Counselor assignment requirement", () => {
  assert.doesNotMatch(createFunction, /student_counselor_assignments/);
  assert.doesNotMatch(createFunction, /v_assignment_id/);
  assert.doesNotMatch(createFunction, /is_active_primary_counselor_for_student/);
  assert.match(
    executable,
    /alter table public\.student_global_readiness_assessments\s+alter column primary_assignment_id drop not null;/,
  );
  // New revisions record no assignment.
  assert.match(createFunction, /p_student_id, v_revision, null, v_counselor_id,/);
});

test("canonical institutional Counselor authorization is required before any read or write", () => {
  assert.match(
    createFunction,
    /if v_counselor_id is null\s+or public\.is_approved_active_verified_counselor\(\) is distinct from true\s+then\s+raise exception using errcode = '42501'/,
  );
  assert.ok(
    createFunction.indexOf("public.is_approved_active_verified_counselor()") <
      createFunction.indexOf("from public.profiles as student_profile"),
  );
  assert.ok(
    createFunction.indexOf("public.is_approved_active_verified_counselor()") <
      createFunction.indexOf(
        "insert into public.student_global_readiness_assessments",
      ),
  );
  // The caller is derived from the session, never supplied.
  assert.match(createFunction, /v_counselor_id uuid := \(select auth\.uid\(\)\);/);
  assert.doesNotMatch(createFunction, /p_counselor_id|p_assessed_by|p_caller_id/);
});

test("the target must be a Student and revisions stay serialized", () => {
  assert.match(
    createFunction,
    /from public\.profiles as student_profile\s+where student_profile\.id = p_student_id\s+and student_profile\.role = 'student'::public\.user_role\s+for update;/,
  );
  assert.match(createFunction, /errcode = '23514'/);
  assert.ok(
    createFunction.indexOf("for update") <
      createFunction.indexOf("max(assessment.revision_number)"),
  );
});

test("the signature, return shape and security contract are preserved", () => {
  const legacy = functionBody(
    foundation,
    "public.create_student_global_readiness_assessment",
  );
  const signature = (sql: string) =>
    sql.slice(sql.indexOf("("), sql.indexOf("returns jsonb")).replace(/\s+/g, " ");
  assert.equal(signature(createFunction), signature(legacy));
  assert.match(createFunction, /returns jsonb\s+language plpgsql\s+security definer\s+set search_path = ''/);
  for (const key of [
    "assessmentId",
    "revisionNumber",
    "totalScore",
    "readinessBand",
    "assessedAt",
  ]) {
    assert.match(createFunction, new RegExp(`'${key}'`));
  }
  assert.match(
    executable,
    /alter function public\.create_student_global_readiness_assessment\([\s\S]*?\) owner to postgres;/,
  );
  assert.match(
    executable,
    /revoke all on function public\.create_student_global_readiness_assessment\([\s\S]*?\) from public, anon, authenticated, service_role;/,
  );
  assert.match(
    executable,
    /grant execute on function public\.create_student_global_readiness_assessment\([\s\S]*?\) to authenticated;/,
  );
  assert.doesNotMatch(executable, /grant [^;]*\bto (?:anon|public|service_role)\b/);
});

test("historical assignments and existing assessments are not modified", () => {
  assert.doesNotMatch(
    executable,
    /(?:update|delete from|insert into|alter table|drop table|truncate)\s+(?:table\s+)?public\.student_counselor_assignments/i,
  );
  assert.doesNotMatch(
    executable,
    /(?:update|delete from)\s+public\.student_global_readiness_assessments/i,
  );
  assert.doesNotMatch(executable, /drop (?:column|constraint|trigger|policy|function)/i);
  // The foreign key and the column itself remain for historical revisions.
  assert.doesNotMatch(executable, /drop column primary_assignment_id/);
  // Only one function is replaced; the read functions are left alone.
  assert.equal(executable.match(/create or replace function/g)?.length, 1);
});

test("the migration is one fail-closed forward transaction", () => {
  assert.match(executable, /^begin;/m);
  assert.match(executable, /^commit;\s*$/m);
  assert.match(executable, /do \$preflight\$/);
  assert.match(executable, /do \$verification\$/);
  assert.match(
    executable,
    /Global readiness write function still depends on a Primary Counselor assignment/,
  );
});
