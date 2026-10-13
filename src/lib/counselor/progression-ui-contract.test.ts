import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import {
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function readTree(relativePath: string): string {
  const root = fileURLToPath(new URL(relativePath, import.meta.url));
  function collect(path: string): string[] {
    return readdirSync(path).flatMap((name) => {
      const child = join(path, name);
      return statSync(child).isDirectory() ? collect(child) : [child];
    });
  }
  return collect(root)
    .filter((path) => /\.(?:ts|tsx)$/.test(path))
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
}

const page = read("../../app/counselor/students/[student-id]/advisory/page.tsx");
const loading = read(
  "../../app/counselor/students/[student-id]/loading.tsx",
);
const loader = read("./progression-server.ts");
const contract = read("./progression.ts");
const submission = read("./progression-submission.ts");
const action = read(
  "../../app/actions/counselor-progression-actions.ts",
);
const section = read(
  "../../components/counselor/official-progression-section.tsx",
);
const actionForms = read(
  "../../components/counselor/official-progression-actions.tsx",
);
const profileView = read(
  "../../components/counselor/student-profile-view.tsx",
);
const styles = read("../../app/globals.css");
const docs = read("../../../docs/database.md");
const migrationPath = new URL(
  "../../../supabase/migrations/202607250003_official_counseling_progression.sql",
  import.meta.url,
);

test("page, focused loader, and both mutation actions independently authorize", () => {
  assert.equal(page.match(/await requireCounselor\(\)/g)?.length, 1);
  assert.equal(loader.match(/await requireCounselor\(\)/g)?.length, 1);
  assert.equal(action.match(/await requireCounselor\(\)/g)?.length, 2);
  assert.doesNotMatch(
    page + loader + action,
    /requireStudent|requireAdmin|service[_ -]?role/i,
  );
});

test("trusted Student 360 identity is resolved before the focused progression load", () => {
  assert.ok(
    page.indexOf("loadCounselorStudentProfile") <
      page.indexOf("loadCounselorStudentProgression"),
  );
  assert.match(
    page,
    /loadCounselorStudentProgression\(\s*result\.identity\.student_id/,
  );
  assert.match(action, /get_counselor_student_identity/);
  assert.match(action, /isCounselorStudentIdentity\(data, studentId\)/);
  assert.doesNotMatch(
    action,
    /studentName|collegeEmail|rollNumber|browserRole|counselorId/,
  );
});

test("focused loader performs one current and one bounded exact-count history query", () => {
  assert.equal(
    loader.match(/\.from\("student_counseling_progressions"\)/g)
      ?.length,
    1,
  );
  assert.equal(
    loader.match(
      /\.from\("student_counseling_progression_events"\)/g,
    )?.length,
    1,
  );
  assert.match(loader, /count: "exact"/);
  assert.match(loader, /\.range\(from, to\)/);
  assert.match(loader, /\.order\("changed_at", \{ ascending: false \}\)/);
  assert.match(loader, /\.order\("id", \{ ascending: false \}\)/);
  assert.match(contract, /OFFICIAL_PROGRESSION_PAGE_SIZE = 20/);
  assert.doesNotMatch(
    loader,
    /auth\.users|counselor_student_notes|counselor_follow_ups|unstable_cache/,
  );
});

test("the action derives operation-specific transitions and uses only the trusted RPC", () => {
  assert.equal(
    action.match(
      /\.rpc\("record_student_counseling_progression"/g,
    )?.length,
    1,
  );
  assert.equal(
    action.match(
      /\.rpc\("undo_latest_student_counseling_progression_event"/g,
    )?.length,
    1,
  );
  assert.doesNotMatch(
    action,
    /\.from\("student_counseling_progressions"\)[\s\S]*?\.(?:insert|update|delete)\(/,
  );
  assert.doesNotMatch(
    action,
    /\.from\("student_counseling_progression_events"\)/,
  );
  assert.match(submission, /case "change_stage"/);
  assert.match(submission, /case "pause"/);
  assert.match(submission, /case "resume"/);
  assert.match(submission, /case "complete"/);
  assert.match(submission, /workflow_state === "completed"/);
  assert.doesNotMatch(
    action + submission,
    /p_counselor|p_actor|p_previous|p_timestamp|p_percentage/,
  );
});

test("strict FormData and success-only trusted revalidation exclude protected inputs", () => {
  for (const protectedName of [
    "counselorId",
    "actorId",
    "previousStage",
    "previousState",
    "targetState",
    "currentStage",
    "changedAt",
    "eventId",
    "progressPercentage",
    "redirect",
  ]) {
    assert.doesNotMatch(
      actionForms,
      new RegExp(`name=["']${protectedName}["']`),
    );
  }
  assert.match(submission, /formData\.getAll\(field\)/);
  assert.match(submission, /unsupported field/);
  assert.match(
    action,
    /state\.status === "success" && trustedStudentId/,
  );
  assert.match(
    action,
    /revalidatePath\(`\/counselor\/students\/\$\{trustedStudentId\}`\)/,
  );
  assert.doesNotMatch(actionForms, /redirect|revalidate|percentage/i);
});

test("official progression is a separate section after counselor-private records", () => {
  assert.ok(
    profileView.indexOf("<CounselorPrivateRecords") <
      profileView.indexOf("<OfficialProgressionSection"),
  );
  assert.match(section, /id="official-progression"/);
  assert.match(section, /Official Counseling Progression/);
  assert.match(
    section,
    /separate from the[\s\S]*self-reported planning stage/,
  );
  assert.match(profileView, /Student-reported planning stage/);
});

test("UI exposes exact empty, active, on-hold, completed, history, and safe failure states", () => {
  for (const text of [
    "Yet to begin",
    "Start official progression",
    "Change official stage",
    "Put progression on hold",
    "Resume progression",
    "Mark progression completed",
    "Counseling journey completed",
    "This official progression is final",
    "Official progression is temporarily unavailable.",
    "Progression history",
    "Updated by an authorized counselor.",
  ]) {
    assert.match(section + actionForms, new RegExp(text));
  }
  assert.match(section, /workflow_state === "active"/);
  assert.match(section, /workflow_state === "on_hold"/);
  assert.match(section, /workflow_state === "completed"/);
  assert.doesNotMatch(section + actionForms, /Reopen|withdrawn|Plan Dropped/);
});

test("history uses the approved event wording exactly", () => {
  for (const text of [
    "Official progression started.",
    "Official stage changed.",
    "Progression put on hold.",
    "Progression resumed.",
    "Official progression completed.",
  ]) {
    assert.match(section, new RegExp(text.replace(".", "\\.")));
  }
  assert.doesNotMatch(section, /Official progression resumed/);
});

test("history and client props do not expose actor UUIDs or unrelated private domains", () => {
  assert.doesNotMatch(section, /event\.changed_by|last_changed_by/);
  assert.doesNotMatch(
    section + actionForms,
    /note_text|follow-up details|application_status|offer_status|visa_status|request_number/i,
  );
  const studentRuntime = readTree("../../app/student");
  assert.doesNotMatch(
    studentRuntime,
    /student_counseling_progressions|student_counseling_progression_events|record_student_counseling_progression/,
  );
  assert.doesNotMatch(
    page + loader + action + section + actionForms,
    /console\.|error\.message|sqlstate|constraint name|auth\.users/i,
  );
});

test("pagination preserves only approved Student 360 parameters and canonicalizes out of range", () => {
  for (const parameter of [
    "historyPage",
    "notesPage",
    "followUpsPage",
    "progressionPage",
  ]) {
    assert.match(contract, new RegExp(`query\\.set\\("${parameter}"`));
  }
  assert.match(section, /aria-current="page"/);
  assert.match(section, />First</);
  assert.match(section, />Previous</);
  assert.match(section, />Next</);
  assert.match(section, />Final</);
  assert.match(page, /progression\.kind === "out_of_range"/);
  assert.match(page, /progressionPage: progression\.finalPage/);
  assert.match(page, /isOfficialProgressionPageCanonical/);
  assert.doesNotMatch(
    contract.match(
      /export function buildOfficialProgressionUrl[\s\S]*?\n}\n/,
    )?.[0] ?? "",
    /reason|stage|state|email|name|actor/i,
  );
});

test("accessibility, loading, mobile, and reduced-motion contracts are explicit", () => {
  assert.match(section, /role="progressbar"/);
  assert.match(section, /aria-valuemin=\{0\}/);
  assert.match(section, /aria-valuemax=\{100\}/);
  assert.match(section, /aria-valuenow=\{percentage\}/);
  assert.match(actionForms, /aria-busy=\{pending\}/);
  assert.match(actionForms, /disabled=\{pending\}/);
  assert.match(
    actionForms,
    /role=\{state\.status === "success" \? "status" : "alert"\}/,
  );
  assert.match(actionForms, /up to 500 characters/);
  assert.doesNotMatch(actionForms, /maxLength=/);
  assert.match(section, /<ol className="official-progression-event-list">/);
  assert.match(loading, /role="status"/);
  // Shared Workspace skeleton: decorative, and no progression copy invented.
  assert.match(loading, /aria-hidden="true"/);
  assert.doesNotMatch(
    loading,
    /authorized counselor|Initial review|Start official progression/,
  );
  assert.match(styles, /@media \(max-width: 650px\)/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(styles, /official-progression-progress-track/);
});

test("D3.1 migration stays byte-identical and D3.2 documentation is accurate", () => {
  const hash = createHash("sha256")
    .update(readFileSync(migrationPath))
    .digest("hex");
  assert.equal(
    hash,
    "7f59a16d970db1e79b6dd9789f35e71c07b9f0a90d2802741cb76fd6141a523c",
  );
  assert.match(docs, /Counselor Student 360 application behavior \(Phase D3\.2\)/);
  assert.match(docs, /not stored or\s+accepted by the RPC/);
  assert.match(docs, /Students, admins, directors, and anonymous/);
  assert.match(docs, /Study Abroad Plan\s+Dropped” is not implemented/);
});
