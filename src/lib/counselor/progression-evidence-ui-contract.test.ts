import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const actions = read(
  "../../app/actions/counselor-progression-evidence-actions.ts",
);
const route = read(
  "../../app/counselor/progression-evidence/[evidence-id]/view/route.ts",
);
const studentPage = read(
  "../../app/counselor/students/[student-id]/advisory/page.tsx",
);
const loading = read(
  "../../app/counselor/students/[student-id]/loading.tsx",
);
const controls = read(
  "../../components/counselor/progression-evidence-controls.tsx",
);
const progressionSection = read(
  "../../components/counselor/official-progression-section.tsx",
);
const evidenceServer = read("./progression-evidence-server.ts");
const evidenceModel = read("./progression-evidence.ts");
const uploadMachine = read("./progression-evidence-upload.ts");
const documentation = read("../../../docs/database.md");

test("every evidence server entry point independently requires a counselor", () => {
  assert.equal(actions.match(/await requireCounselor\(\)/g)?.length, 3);
  assert.match(route, /await requireCounselor\(\)/);
  assert.match(
    evidenceServer,
    /loadCounselorProgressionEvidence[\s\S]*?await requireCounselor\(\)/,
  );
  assert.match(
    actions,
    /verifyCounselorProgressionEventTarget[\s\S]*?prepare_student_counseling_progression_evidence_upload/,
  );
  assert.match(
    actions,
    /verifyCounselorProgressionEventTarget[\s\S]*?finalize_student_counseling_progression_evidence_upload/,
  );
  assert.match(
    actions,
    /verifyCounselorProgressionEventTarget[\s\S]*?remove_student_counseling_progression_evidence/,
  );
});

test("Student 360 loads bounded available and pending evidence queries without N plus one calls", () => {
  assert.match(
    studentPage,
    /progression\.kind === "ready"[\s\S]*?loadCounselorProgressionEvidence[\s\S]*?progression\.events\.map/,
  );
  assert.equal(
    evidenceServer.match(
      /\.from\("student_counseling_progression_evidence"\)/g,
    )?.length,
    3,
  );
  const focusedLoader =
    evidenceServer.match(
      /export async function loadCounselorProgressionEvidence[\s\S]*?^}/m,
    )?.[0] ?? "";
  assert.equal(
    focusedLoader.match(
      /\.from\("student_counseling_progression_evidence"\)/g,
    )?.length,
    2,
  );
  assert.match(focusedLoader, /\.in\("progression_event_id", eventIds\)/);
  assert.match(focusedLoader, /\.eq\("status", "available"\)/);
  assert.match(focusedLoader, /\.eq\("status", "pending"\)/);
  assert.match(focusedLoader, /\.gt\("upload_expires_at", nowIso\)/);
  assert.match(focusedLoader, /\.limit\(maximumRows\)/);
  assert.doesNotMatch(focusedLoader, /\.storage\b|\.list\(/);
});

test("available evidence props exclude Storage and audit internals", () => {
  const visibleType =
    evidenceModel.match(
      /export type ProgressionEvidenceVisibleFile = \{[\s\S]*?\n};/,
    )?.[0] ?? "";
  for (const approved of [
    "id",
    "progressionEventId",
    "originalFileName",
    "mimeType",
    "fileSizeBytes",
    "availableAt",
  ]) {
    assert.match(visibleType, new RegExp(`\\b${approved}\\b`));
  }
  assert.doesNotMatch(
    visibleType,
    /storagePath|bucketId|uploadedBy|removedBy|removalReason|uploadExpiresAt/,
  );
});

test("event-level UI isolates unavailable evidence and preserves progression history", () => {
  assert.match(
    progressionSection,
    /presentation\.events\.map[\s\S]*?<ProgressionEvent/,
  );
  assert.match(
    progressionSection,
    /Supporting evidence is temporarily unavailable\./,
  );
  assert.match(
    progressionSection,
    /<ProgressionEvidenceControls[\s\S]*?progressionEventId=\{event\.id\}/,
  );
  assert.doesNotMatch(
    progressionSection,
    /Official progression is temporarily unavailable\.[\s\S]*?Supporting evidence is temporarily unavailable\./,
  );
});

test("client uses signed upload once and never sends bytes through a Server Action", () => {
  assert.match(controls, /prepareProgressionEvidenceUploadAction\(formData\)/);
  assert.match(controls, /\.uploadToSignedUrl\(/);
  assert.match(
    controls,
    /uploadToSignedUrl\(upload\.path, upload\.token, file,/,
  );
  assert.match(controls, /contentType: upload\.mimeType/);
  assert.match(controls, /upsert: false/);
  assert.match(
    controls,
    /finalizeProgressionEvidenceUploadAction\(formData\)/,
  );
  assert.doesNotMatch(actions, /\bFile\b|Blob|arrayBuffer|multipart/);
  assert.doesNotMatch(
    controls,
    /localStorage|sessionStorage|console\.log|server-only/,
  );
  assert.match(
    controls,
    /if \(uploadInFlightRef\.current \|\| active\) return;/,
  );
  assert.match(
    controls,
    /if \(finalizationInFlightRef\.current\)/,
  );
  assert.match(uploadMachine, /uploadIntent = null/);
});

test("view route contains only evidence UUID and creates a five-minute no-store signed view", () => {
  assert.match(
    route,
    /createSignedUrl\([\s\S]*?PROGRESSION_EVIDENCE_SIGNED_VIEW_SECONDS/,
  );
  assert.match(route, /NextResponse\.redirect\(signedView\.signedUrl, 307\)/);
  assert.match(route, /private, no-store, max-age=0/);
  assert.match(route, /Referrer-Policy/);
  assert.match(
    route,
    /isTrustedProgressionEvidenceSignedViewUrl\([\s\S]*?getSupabaseEnv\(\)\.url/,
  );
  assert.doesNotMatch(
    route,
    /getPublicUrl|storagePath.*params|fileName.*params|studentId.*params/,
  );
  assert.match(
    controls,
    /\/counselor\/progression-evidence\/\$\{file\.id\}\/view/,
  );
});

test("soft removal is RPC-only and explains retained metadata and object bytes", () => {
  assert.match(controls, /Removal reason/);
  assert.match(controls, /audit record will[\s\S]*?not physically deleted/);
  assert.match(
    controls,
    /removalInFlightRef\.current \|\|[\s\S]*?state\.status === "success"[\s\S]*?removalInFlightRef\.current = true;[\s\S]*?removeProgressionEvidenceAction\(formData\)/,
  );
  assert.match(
    controls,
    /finally \{[\s\S]*?removalInFlightRef\.current = false;/,
  );
  assert.match(actions, /remove_student_counseling_progression_evidence/);
  assert.doesNotMatch(
    actions + controls,
    /\.remove\(|\.delete\(|\.update\(|\.insert\(/,
  );
  assert.doesNotMatch(controls, /Restore|Undo removal/);
});

test("evidence UI is accessible responsive and has no fabricated loading data", () => {
  for (const contract of [
    "aria-labelledby",
    "type=\"file\"",
    "aria-describedby",
    "aria-invalid={feedbackIsError}",
    "aria-busy",
    "role={feedbackIsError ? \"alert\" : \"status\"}",
    "Remove evidence",
    "View evidence:",
  ]) {
    assert.match(controls, new RegExp(contract.replace(/[{}?]/g, "\\$&")));
  }
  // The Workspace skeleton fills the shared page slot for every tab, so it
  // carries no per-section placeholder. What still matters is that it is
  // decorative and invents no evidence data.
  assert.match(loading, /aria-busy="true"/);
  assert.match(loading, /aria-hidden="true"/);
  assert.doesNotMatch(
    loading,
    /\.pdf|\.docx|\.png|counselor name|evidenceId/,
  );
});

test("privacy boundary excludes student admin director and public evidence runtime", () => {
  const forbiddenRuntime = [
    "../../app/student/dashboard/page.tsx",
    "../../app/student/profile/page.tsx",
    "../../app/admin/consultations/page.tsx",
    "../../app/(public)/page.tsx",
  ]
    .map(read)
    .join("\n");
  assert.doesNotMatch(
    forbiddenRuntime,
    /progression-evidence|progression_evidence|Supporting evidence/,
  );

  const production = [
    actions,
    route,
    controls,
    evidenceServer,
    evidenceModel,
    uploadMachine,
  ].join("\n");
  assert.doesNotMatch(
    production,
    /service[_-]?role|auth\.admin|getPublicUrl|\.list\(|listV2|storage\.remove|localStorage|sessionStorage|console\.log/,
  );
});

test("documentation states the exact D3.3.2 operational limitations", () => {
  for (const phrase of [
    "event-level evidence",
    "counselor-only",
    "10 MiB",
    "five",
    "direct signed upload",
    "two-hour",
    "five-minute",
    "soft removal",
    "not physically delete",
    "malware scanning",
    "student access",
  ]) {
    assert.match(documentation, new RegExp(phrase, "i"));
  }
});
