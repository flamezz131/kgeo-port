import assert from "node:assert/strict";
import "../../test/setup.ts";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../../../supabase/migrations/202607200002_counselor_student_directory_foundation.sql",
    import.meta.url,
  ),
  "utf8",
);
const databaseTypeSource = readFileSync(
  new URL("../../types/database.ts", import.meta.url),
  "utf8",
);

function getFunctionSource(functionName: string) {
  const startMarker = `create function public.${functionName}(`;
  const start = migrationSource.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${functionName}`);

  const end = migrationSource.indexOf("\n$function$;", start);
  assert.notEqual(end, -1, `unterminated ${functionName}`);
  return migrationSource.slice(start, end + "\n$function$;".length);
}

function getReturnColumnNames(functionSource: string) {
  const returnBlock = functionSource.match(
    /returns table \(([\s\S]*?)\)\nlanguage/,
  );
  assert.ok(returnBlock, "missing returns table block");

  return [...returnBlock[1].matchAll(/^\s{2}([a-z][a-z0-9_]*)\s+/gm)].map(
    (match) => match[1],
  );
}

const directoryFunction = getFunctionSource(
  "list_counselor_student_directory",
);
const identityFunction = getFunctionSource(
  "get_counselor_student_identity",
);

test("migration is one transaction and does not change existing tables, policies, or data", () => {
  assert.equal(migrationSource.match(/^begin;$/gm)?.length, 1);
  assert.equal(migrationSource.match(/^commit;$/gm)?.length, 1);
  assert.doesNotMatch(
    migrationSource,
    /\b(?:alter|drop|truncate)\s+(?:table|policy)|\b(?:insert|update|delete)\s+(?:into|public\.)/i,
  );
  assert.doesNotMatch(migrationSource, /create policy/i);
});

test("both definer functions use an empty search path and authorize before cross-user reads", () => {
  for (const source of [directoryFunction, identityFunction]) {
    assert.match(source, /security definer\s+set search_path = ''/);
    const authorizationEnd = source.indexOf("  end if;");
    const crossUserQuery = source.indexOf("  return query");
    assert.ok(authorizationEnd > 0);
    assert.ok(crossUserQuery > authorizationEnd);
  }

  assert.ok(
    directoryFunction.indexOf("caller_auth.email_confirmed_at is not null") <
      directoryFunction.indexOf("public.student_profile_completion"),
  );
  for (const relation of [
    "profiles",
    "users",
    "student_profiles",
    "student_preferences",
    "student_profile_completion",
    "student_test_scores",
    "student_achievements",
  ]) {
    assert.doesNotMatch(
      migrationSource,
      new RegExp(`\\b(?:from|join)\\s+${relation}\\b`, "i"),
    );
  }
});

test("directory enum privileges and function execution grants are minimal", () => {
  assert.match(
    migrationSource,
    /revoke all privileges on type public\.student_directory_profile_state\s+from public, anon;/,
  );
  assert.match(
    migrationSource,
    /grant usage on type public\.student_directory_profile_state\s+to authenticated;/,
  );
});

test("both RPCs require the current active verified counselor and accept no role input", () => {
  for (const source of [directoryFunction, identityFunction]) {
    assert.match(source, /requester_id := \(select auth\.uid\(\)\)/);
    assert.match(source, /caller_profile\.id = requester_id/);
    assert.match(
      source,
      /caller_profile\.role = 'counselor'::public\.user_role/,
    );
    assert.match(source, /caller_profile\.is_active is true/);
    assert.match(source, /caller_auth\.email_confirmed_at is not null/);
    assert.match(source, /then\s+return;/);
    assert.doesNotMatch(source, /p_(?:role|email_confirmed)/);
  }
});

test("anonymous execution is revoked and only authenticated execution is granted", () => {
  for (const functionName of [
    "list_counselor_student_directory",
    "get_counselor_student_identity",
  ]) {
    assert.match(
      migrationSource,
      new RegExp(
        `revoke all on function public\\.${functionName}\\([\\s\\S]*?\\)\\s+from public, anon, authenticated;`,
      ),
    );
    assert.match(
      migrationSource,
      new RegExp(
        `grant execute on function public\\.${functionName}\\([\\s\\S]*?\\)\\s+to authenticated;`,
      ),
    );
  }

  assert.doesNotMatch(migrationSource, /grant execute[\s\S]*?to (?:public|anon);/i);
});

test("directory starts from student identities and retains students without detail rows", () => {
  assert.match(directoryFunction, /from public\.profiles as student_account/);
  assert.match(
    directoryFunction,
    /left join public\.student_profiles as student_profile/,
  );
  assert.match(
    directoryFunction,
    /left join public\.student_preferences as preference\s+on preference\.student_id = student_profile\.student_id/,
  );
  assert.match(
    directoryFunction,
    /where student_account\.role = 'student'::public\.user_role/,
  );
});

test("inactive student accounts remain visible and can be filtered explicitly", () => {
  assert.match(directoryFunction, /p_is_active boolean default null/);
  assert.match(directoryFunction, /student_account\.is_active/);
  assert.match(
    directoryFunction,
    /p_is_active is null\s+or directory_entry\.is_active = p_is_active/,
  );
  assert.doesNotMatch(
    directoryFunction,
    /where student_account\.role = 'student'::public\.user_role\s+and student_account\.is_active/,
  );
});

test("directory state mapping covers not started, in progress, ready, and submitted", () => {
  assert.match(
    directoryFunction,
    /when student_profile\.student_id is null then\s+'profile_not_started'/,
  );
  assert.match(directoryFunction, /'profile_in_progress'/);
  assert.match(
    directoryFunction,
    /when completion\.ready_for_counseling is true then\s+'ready_for_counseling'/,
  );
  assert.match(
    directoryFunction,
    /when completion\.profile_status =\s+'submitted'::public\.student_profile_status then\s+'submitted'/,
  );
  assert.match(
    directoryFunction,
    /left join public\.student_profile_completion as completion/,
  );
});

test("search and text filters are normalized without dynamic SQL", () => {
  assert.match(
    directoryFunction,
    /normalized_search := nullif\(\s+pg_catalog\.lower\(pg_catalog\.btrim\(p_search\)\)/,
  );
  for (const field of ["full_name", "roll_number", "college_email"]) {
    assert.match(directoryFunction, new RegExp(`directory_entry\\.${field}`));
  }
  for (const parameter of ["p_college", "p_course", "p_department"]) {
    assert.match(directoryFunction, new RegExp(`btrim\\(${parameter}\\)`));
  }
  assert.doesNotMatch(directoryFunction, /\bexecute\s+(?:format|normalized|p_)/i);
});

test("enum filters and sort values form closed allow-lists", () => {
  assert.match(
    directoryFunction,
    /p_profile_state public\.student_directory_profile_state/,
  );
  assert.match(
    directoryFunction,
    /p_higher_studies_interest public\.higher_studies_interest/,
  );
  assert.match(
    directoryFunction,
    /p_preferred_study_level public\.student_preferred_study_level/,
  );
  for (const sort of [
    "name_asc",
    "recently_registered",
    "recently_updated",
    "completion_low_to_high",
    "completion_high_to_low",
    "graduation_year",
  ]) {
    assert.match(directoryFunction, new RegExp(`'${sort}'`));
  }
  assert.match(directoryFunction, /normalized_sort not in \(/);
});

test("pagination defaults to 25, caps at 100, and reports the total count", () => {
  assert.match(directoryFunction, /p_page integer default 1/);
  assert.match(directoryFunction, /p_page_size integer default 25/);
  assert.match(directoryFunction, /p_page_size not between 1 and 100/);
  assert.match(directoryFunction, /pg_catalog\.count\(\*\) over \(\) as total_count/);
  assert.match(directoryFunction, /limit p_page_size\s+offset page_offset/);
});

test("last profile update considers every profile section without requiring every child", () => {
  assert.match(
    directoryFunction,
    /greatest\(\s+student_profile\.updated_at,\s+preference\.updated_at,/,
  );
  assert.match(
    directoryFunction,
    /pg_catalog\.max\(test_score\.updated_at\)/,
  );
  assert.match(
    directoryFunction,
    /pg_catalog\.max\(achievement\.updated_at\)/,
  );
  assert.match(
    directoryFunction,
    /preference\.student_id = student_profile\.student_id/,
  );
});

test("every supported sort has a deterministic student UUID tie-breaker", () => {
  assert.match(
    directoryFunction,
    /case when normalized_sort = 'graduation_year'[\s\S]*?end asc nulls last,\s+directory_entry\.student_id asc/,
  );
});

test("directory returns exactly the approved projection and no Student 360 private fields", () => {
  assert.deepEqual(getReturnColumnNames(directoryFunction), [
    "student_id",
    "full_name",
    "college_email",
    "account_created_at",
    "is_active",
    "roll_number",
    "college",
    "course",
    "department",
    "graduation_year",
    "profile_state",
    "completion_percentage",
    "ready_for_counseling",
    "higher_studies_interest",
    "preferred_study_level",
    "target_intake",
    "last_profile_update",
    "total_count",
  ]);

  const returnBlock = directoryFunction.match(
    /returns table \(([\s\S]*?)\)\nlanguage/,
  )?.[1];
  assert.ok(returnBlock);
  assert.doesNotMatch(
    returnBlock,
    /personal_email|mobile_number|cgpa|backlogs|remarks|countries|program_areas|notes|documents/,
  );
});

test("detail lookup returns minimal identity and hides unknown or staff UUIDs", () => {
  assert.deepEqual(getReturnColumnNames(identityFunction), [
    "student_id",
    "full_name",
    "college_email",
    "account_created_at",
    "is_active",
  ]);
  assert.match(identityFunction, /p_student_id is null/);
  assert.match(identityFunction, /student_account\.id = p_student_id/);
  assert.match(
    identityFunction,
    /student_account\.role = 'student'::public\.user_role/,
  );
  assert.match(
    identityFunction,
    /message = 'The student identity is temporarily unavailable'/,
  );
  assert.doesNotMatch(identityFunction, /raise exception[\s\S]*?p_student_id/);
});

test("handwritten RPC types match active-state, nullability, and count contracts", () => {
  const rowType = databaseTypeSource.match(
    /type CounselorStudentDirectoryRow = \{([\s\S]*?)\n\};/,
  )?.[1];
  assert.ok(rowType);
  assert.match(rowType, /is_active: boolean;/);
  assert.match(rowType, /roll_number: string \| null;/);
  assert.match(rowType, /last_profile_update: string \| null;/);
  assert.match(rowType, /total_count: number;/);
  assert.doesNotMatch(
    rowType,
    /personal_email|mobile_number|cgpa|backlogs|remarks|countries|program_areas/,
  );
  assert.match(databaseTypeSource, /p_is_active\?: boolean \| null;/);
  assert.match(databaseTypeSource, /Args: \{ p_student_id: string \}/);
  assert.match(
    databaseTypeSource,
    /"account_created_at"\s+\| "is_active"/,
  );
});

test("unexpected database failures are remapped to non-sensitive messages", () => {
  assert.match(directoryFunction, /when others then/);
  assert.match(
    directoryFunction,
    /message = 'The student directory is temporarily unavailable'/,
  );
  assert.match(identityFunction, /when others then/);
  assert.doesNotMatch(
    migrationSource,
    /sqlerrm|sqlstate\s*\)|raise\s+(?:notice|warning|log)|console\./i,
  );
});

test("migration adds no broad table read or counselor mutation authority", () => {
  assert.doesNotMatch(migrationSource, /grant select on (?:table )?public\.profiles/i);
  assert.doesNotMatch(migrationSource, /grant (?:insert|update|delete)/i);
  assert.doesNotMatch(migrationSource, /service[_ -]?role/i);
});
