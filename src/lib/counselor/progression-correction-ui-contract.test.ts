import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const action = read(
  "../../app/actions/counselor-progression-actions.ts",
);
const control = read(
  "../../components/counselor/progression-correction-control.tsx",
);
const section = read(
  "../../components/counselor/official-progression-section.tsx",
);
const loading = read(
  "../../app/counselor/students/[student-id]/loading.tsx",
);
const presentation = read("./progression-correction.ts");
const submission = read("./progression-correction-submission.ts");
const evidenceServer = read("./progression-evidence-server.ts");
const docs = read("../../../docs/database.md");
const migrationUrl = new URL(
  "../../../supabase/migrations/202607260002_progression_correction_foundation.sql",
  import.meta.url,
);
const readinessUrl = new URL(
  "../../../supabase/verification/pre_phase_c2_readiness.sql",
  import.meta.url,
);

test("the correction action independently authorizes and calls only the reviewed RPC", () => {
  const correctionAction =
    action.match(
      /export async function undoLatestProgressionEventAction[\s\S]*?^}/m,
    )?.[0] ?? "";
  assert.match(correctionAction, /await requireCounselor\(\)/);
  assert.equal(
    correctionAction.match(
      /\.rpc\("undo_latest_student_counseling_progression_event"/g,
    )?.length,
    1,
  );
  for (const argument of [
    "p_student_id: studentId",
    "p_event_id: eventId",
    "p_correction_reason: correctionReason",
  ]) {
    assert.match(correctionAction, new RegExp(argument));
  }
  assert.doesNotMatch(
    correctionAction,
    /p_counselor|p_restored|p_corrected|p_type|service[_-]?role/i,
  );
  assert.match(
    correctionAction,
    /state\.status === "success" && trustedStudentId/,
  );
});

test("strict input validation rejects unknown duplicate and protected values", () => {
  assert.match(submission, /formData\.getAll\(field\)/);
  assert.match(submission, /unsupported field/);
  assert.doesNotMatch(submission, /\$ACTION_/);
  for (const protectedName of [
    "counselorId",
    "correctionType",
    "restoredStage",
    "restoredState",
    "correctedAt",
    "role",
    "redirect",
  ]) {
    assert.doesNotMatch(
      control,
      new RegExp(`name=["']${protectedName}["']`),
    );
  }
  assert.doesNotMatch(
    action + submission,
    /console\.|error\.message|error\.details|constraint/i,
  );
});

test("only trusted latest-event eligibility can render one event-specific control", () => {
  assert.match(
    presentation,
    /latestEffectiveEventId === event\.id/,
  );
  assert.match(presentation, /progression\.current !== null/);
  assert.match(presentation, /evidence\.kind === "ready"/);
  assert.match(presentation, /evidenceBlock === null/);
  assert.match(section, /\{correctionAction && \(/);
  assert.match(section, /action=\{correctionAction\}/);
  assert.match(control, /Undo latest update/);
  assert.match(control, /Reset official progression/);
});

test("corrected history is retained with safe audit fields and no identifiers", () => {
  assert.match(section, /Correction reason/);
  assert.match(section, /correction\.correctionReason/);
  assert.match(section, /correction\.correctedAt/);
  assert.match(
    section,
    /retained for audit and no longer determines/,
  );
  assert.doesNotMatch(
    section + control,
    /correction_id|corrected_by|event\.changed_by|last_changed_by/,
  );
});

test("the native modal implements focus, escape, busy, lock, and feedback contracts", () => {
  assert.match(control, /<dialog/);
  assert.match(control, /aria-modal="true"/);
  assert.match(control, /\.showModal\(\)/);
  assert.match(control, /reasonRef\.current\?\.focus\(\)/);
  assert.match(control, /triggerRef\.current\?\.focus\(\)/);
  assert.match(control, /onCancel=\{handleCancel\}/);
  assert.match(control, /if \(submitting \|\| succeeded\) return;/);
  assert.match(control, /submissionInFlightRef\.current = true/);
  assert.match(
    control,
    /finally \{[\s\S]*?result\?\.status !== "success"[\s\S]*?submissionInFlightRef\.current = false;/,
  );
  assert.doesNotMatch(
    control,
    /finally \{\s*submissionInFlightRef\.current = false;/,
  );
  assert.match(control, /setPhase\("succeeded"\)[\s\S]*?router\.refresh\(\)/);
  assert.match(control, /aria-busy=\{submitting\}/);
  assert.match(
    control,
    /role=\{state\.status === "success" \? "status" : "alert"\}/,
  );
  assert.match(control, /router\.refresh\(\)/);
  assert.doesNotMatch(control, /optimistic|useOptimistic|localStorage/);
});

test("loading UI contains no fabricated correction action or audit data", () => {
  assert.doesNotMatch(
    loading,
    /Undo latest update|Reset official progression|Correction reason|Progression update reversed/,
  );
});

test("available and unexpired pending evidence are loaded in bounded batches", () => {
  assert.equal(
    evidenceServer.match(
      /\.from\("student_counseling_progression_evidence"\)/g,
    )?.length,
    3,
  );
  assert.match(evidenceServer, /\.eq\("status", "available"\)/);
  assert.match(evidenceServer, /\.eq\("status", "pending"\)/);
  assert.match(evidenceServer, /\.gt\("upload_expires_at", nowIso\)/);
  assert.equal(evidenceServer.match(/\.limit\(maximumRows\)/g)?.length, 2);
  assert.match(
    section + presentation,
    /Supporting evidence must be removed or allowed to expire/,
  );
});

test("reset state retains history and offers normal initialization", () => {
  assert.match(
    section,
    /Official progression has been reset and is ready for a fresh start\./,
  );
  assert.match(section, /<ProgressionHistory/);
  assert.match(section, /operation="initialize"/);
  assert.match(section, /<ProgressBar percentage=\{0\}/);
});

test("D3.4.1 migration stays byte-identical and readiness includes E1.1", () => {
  assert.equal(
    createHash("sha256")
      .update(readFileSync(migrationUrl))
      .digest("hex"),
    "90d9a6e6f1b7fecb5a8a2e667c61eeb62b8546b33db402c3e1faf21a09e207fb",
  );
  assert.equal(
    createHash("sha256")
      .update(readFileSync(readinessUrl))
      .digest("hex"),
    "21ff407489dee1fa637f2c44efe50c253ea41f03293b425bedc5f7a12d06ab01",
  );
  assert.match(docs, /Phase D3\.4\.2/);
  assert.match(docs, /latest effective event/i);
});
