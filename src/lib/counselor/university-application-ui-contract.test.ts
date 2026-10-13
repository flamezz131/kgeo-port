import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const pagePath = new URL(
  "../../app/counselor/students/[student-id]/page.tsx",
  import.meta.url,
);
const loadingPath = new URL(
  "../../app/counselor/students/[student-id]/loading.tsx",
  import.meta.url,
);
const viewPath = new URL(
  "../../components/counselor/student-profile-view.tsx",
  import.meta.url,
);
const componentPath = new URL(
  "../../components/counselor/university-applications-section.tsx",
  import.meta.url,
);
const actionsPath = new URL(
  "../../app/actions/counselor-university-application-actions.ts",
  import.meta.url,
);
const serverPath = new URL(
  "./university-application-server.ts",
  import.meta.url,
);
const submissionPath = new URL(
  "./university-application-submission.ts",
  import.meta.url,
);
const managementPath = new URL(
  "./university-application-management.ts",
  import.meta.url,
);
const cssPath = new URL("../../app/globals.css", import.meta.url);
const docsPath = new URL("../../../docs/database.md", import.meta.url);
const migrationPath = new URL(
  "../../../supabase/migrations/202607270001_university_application_foundation.sql",
  import.meta.url,
);
const readinessPath = new URL(
  "../../../supabase/verification/pre_phase_c2_readiness.sql",
  import.meta.url,
);

const page = readFileSync(pagePath, "utf8");
const loading = readFileSync(loadingPath, "utf8");
const view = readFileSync(viewPath, "utf8");
const component = readFileSync(componentPath, "utf8");
const actions = readFileSync(actionsPath, "utf8");
const server = readFileSync(serverPath, "utf8");
const submission = readFileSync(submissionPath, "utf8");
const management = readFileSync(managementPath, "utf8");
const css = readFileSync(cssPath, "utf8");
const docs = readFileSync(docsPath, "utf8");

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

test("E1.1 migration and readiness contracts remain byte-identical", () => {
  assert.equal(
    createHash("sha256")
      .update(readFileSync(migrationPath))
      .digest("hex"),
    "09d8c32734b159535387a4f6e21fda54d4b59ba4bbb60de4f93b7179794cb35b",
  );
  assert.equal(
    createHash("sha256")
      .update(readFileSync(readinessPath))
      .digest("hex"),
    "21ff407489dee1fa637f2c44efe50c253ea41f03293b425bedc5f7a12d06ab01",
  );
});

test("Student 360 loads applications independently and isolates section failure", () => {
  assert.match(page, /loadCounselorUniversityApplications/);
  assert.match(
    page,
    /Promise\.all\(\[[\s\S]*?loadCounselorStudentProgression[\s\S]*?loadCounselorUniversityApplications/,
  );
  assert.match(view, /<UniversityApplicationsSection/);
  assert.match(component, /UNIVERSITY_APPLICATION_LIST_ERROR/);
  assert.match(
    management,
    /University applications are temporarily unavailable\./,
  );
  assert.match(component, /result\.kind === "unavailable"/);
  // Shared Workspace skeleton: decorative placeholder, no application data.
  assert.match(loading, /aria-busy="true"/);
  assert.doesNotMatch(loading, /universityName|programmeName/);
});

test("bounded list loader uses trusted identity and exact deterministic ordering", () => {
  assert.equal(server.match(/await requireCounselor\(\)/g)?.length, 2);
  assert.match(server, /get_counselor_student_identity/);
  assert.match(server, /isCounselorStudentIdentity/);
  assert.match(
    server,
    /\.eq\("student_id", routeStudentId\)[\s\S]*?\.order\("is_archived", \{ ascending: true \}\)[\s\S]*?\.order\("is_primary", \{ ascending: false \}\)[\s\S]*?\.order\("updated_at", \{ ascending: false \}\)[\s\S]*?\.order\("id", \{ ascending: false \}\)[\s\S]*?\.limit\(UNIVERSITY_APPLICATION_STUDENT_READ_LIMIT \+ 1\)/,
  );
  assert.equal(
    server.match(/from\("student_university_applications"\)/g)?.length,
    2,
  );
});

test("history is loaded only on request with 26-row version-desc pagination", () => {
  assert.doesNotMatch(
    page,
    /student_university_application_events/,
  );
  assert.match(
    server,
    /from\("student_university_application_events"\)[\s\S]*?\.eq\("application_id", applicationId\)[\s\S]*?\.order\("version_number", \{ ascending: false \}\)[\s\S]*?\.range\(from, to\)/,
  );
  assert.match(
    server,
    /const to = from \+ UNIVERSITY_APPLICATION_EVENT_PAGE_SIZE;/,
  );
  assert.match(component, /loadUniversityApplicationHistoryAction/);
  assert.match(component, /Previous/);
  assert.match(component, /Next/);
  assert.match(component, /previous\.versionNumber === event\.versionNumber - 1/);
});

test("all five mutations independently authorize and call only the reviewed RPCs", () => {
  assert.equal(actions.match(/await requireCounselor\(\)/g)?.length, 5);
  for (const rpc of [
    "create_student_university_application",
    "update_student_university_application_details",
    "record_student_university_application_status",
    "set_primary_student_university_application",
    "archive_student_university_application",
  ]) {
    assert.equal(actions.match(new RegExp(`"${rpc}"`, "g"))?.length, 1);
  }
  assert.doesNotMatch(
    actions,
    /\.insert\(|\.update\(|\.delete\(/,
  );
  assert.doesNotMatch(
    actions,
    /record_student_counseling_progression|student_counseling_progressions|student_counseling_progression_events/,
  );
  assert.match(
    actions,
    /state\.status === "success"[\s\S]*?revalidatePath\(`\/counselor\/students\/\$\{studentId\}`\)/,
  );
});

test("actions validate trusted student and application ownership before RPC mutation", () => {
  assert.match(actions, /get_counselor_student_identity/);
  assert.match(
    actions,
    /\.eq\("id", applicationId\)[\s\S]*?\.eq\("student_id", studentId\)/,
  );
  assert.match(actions, /parseOwnedUniversityApplication/);
  assert.match(submission, /store\.verifyStudent/);
  assert.match(submission, /store\.verifyTarget/);
  assert.match(submission, /parsed\.data\.student_id !== studentId/);
  assert.match(
    submission,
    /parsed\.data\.application_id !== applicationId/,
  );
});

test("strict FormData parsing rejects unknown, duplicate, file and protected fields", () => {
  assert.match(submission, /new Set\(formData\.keys\(\)\)/);
  assert.match(submission, /!allowed\.has\(key\)/);
  assert.match(submission, /formData\.getAll\(field\)/);
  assert.match(
    submission,
    /entries\.length !== 1 \|\| typeof entries\[0\] !== "string"/,
  );
  assert.doesNotMatch(
    submission,
    /startsWith\("\$ACTION_"\)/,
  );
  for (const protectedField of [
    "createdBy",
    "lastChangedBy",
    "archivedBy",
    "versionNumber",
    "submittedAt",
    "initialStatus",
    "redirectPath",
  ]) {
    assert.doesNotMatch(
      submission,
      new RegExp(`"${protectedField}"`),
    );
  }
});

test("client uses accessible native dialogs, focus restoration and synchronous locks", () => {
  assert.equal(component.match(/<dialog/g)?.length, 2);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /aria-labelledby/);
  assert.match(component, /aria-describedby/);
  assert.match(component, /\.showModal\(\)/);
  assert.match(component, /onCancel=/);
  assert.match(component, /requestAnimationFrame\(\(\) => mutationTriggerRef\.current\?\.focus\(\)\)/);
  assert.match(component, /mutationInFlightRef\.current = true/);
  assert.match(
    component,
    /nextState\.status === "success"[\s\S]*?setPhase\("succeeded"\)[\s\S]*?router\.refresh\(\)/,
  );
  assert.match(
    component,
    /mutationInFlightRef\.current = false;[\s\S]*?setPhase\("failed"\)/,
  );
  assert.match(component, /role="alert"/);
  assert.match(component, /role="status"/);
  assert.match(component, /mutationHeadingRef\.current\?\.focus\(\)/);
});

test("cards expose approved values, safe portal links and read-only archived state", () => {
  assert.match(component, /target="_blank"/);
  assert.match(component, /rel="noopener noreferrer"/);
  assert.match(component, /opens in a new tab/);
  assert.match(component, /Primary application/);
  assert.match(component, /Show.*archived applications/);
  assert.match(
    component,
    /!application\.isArchived && \([\s\S]*?Edit details[\s\S]*?Change status[\s\S]*?Set primary[\s\S]*?Archive/,
  );
  assert.doesNotMatch(component, /Delete application|Restore application|Unarchive/);
  assert.match(
    component,
    /The application will be removed from the normal active list, but the record and complete history will be retained\. This action does not withdraw or close the application automatically\./,
  );
  for (const actorField of [
    "created_by",
    "last_changed_by",
    "archived_by",
    "changed_by",
  ]) {
    assert.doesNotMatch(component, new RegExp(actorField));
    assert.doesNotMatch(management, new RegExp(`\\b${actorField}:`));
  }
});

test("timestamps and mutation responses fail closed without JavaScript date normalization", () => {
  assert.match(management, /parseUniversityApplicationTimestamp/);
  assert.doesNotMatch(management + submission, /Date\.parse/);
  assert.match(
    management,
    /BigInt\(epochMilliseconds\) \* BigInt\(1_000\)/,
  );
  assert.match(submission, /parsed\.is_primary !== target\.isPrimary/);
  assert.match(
    submission,
    /parsed\.current_status !== target\.currentStatus/,
  );
  assert.match(
    management,
    /oldestVisibleEvent\?\.version_number !== 1/,
  );
});

test("new E1.2 interface strings contain no mojibake", () => {
  assert.doesNotMatch(component, /[\u00c2\u00c3\u00e2]/);
  assert.match(component, /\\u2026/);
  assert.match(component, /\\u2192/);
  assert.match(component, /\\u00b7/);
});

test("E1.2 UI is counselor-only and no other portal imports it", () => {
  const appRoot = fileURLToPath(new URL("../../app/", import.meta.url));
  const forbiddenDirectories = ["student", "admin", "(public)"];
  for (const directory of forbiddenDirectories) {
    for (const file of listFiles(join(appRoot, directory))) {
      if (!/\.(?:ts|tsx)$/.test(file)) continue;
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /\bUniversityApplicationsSection\b|counselor-university-application-actions|student_university_applications/,
        file,
      );
    }
  }
});

test("responsive, reduced-motion, privacy and documentation contracts are present", () => {
  assert.match(css, /@media \(max-width: 650px\)/);
  assert.match(css, /university-application-field-grid/);
  assert.match(css, /overflow-wrap: anywhere/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.doesNotMatch(actions + component, /console\.log|console\.error/);
  assert.doesNotMatch(actions + server, /service[_-]role|auth\.admin/i);
  assert.match(docs, /Phase E1\.2 counselor university application management/);
  assert.match(docs, /No browser actor ID, version, timestamp/);
  assert.match(docs, /no restore or hard-delete control/i);
  assert.match(docs, /does not automatically mutate[\s\S]*official counseling progression/);
});
