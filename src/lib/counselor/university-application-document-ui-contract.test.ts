import assert from "node:assert/strict";
import "../../test/setup.ts";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { isTrustedUniversityApplicationDocumentSignedViewUrl } = require(
  "./university-application-document-view-url.ts",
) as typeof import("./university-application-document-view-url");

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const component = read("../../components/counselor/university-application-documents.tsx");
const applicationSection = read("../../components/counselor/university-applications-section.tsx");
const actions = read("../../app/actions/counselor-university-application-document-actions.ts");
const route = read(
  "../../app/counselor/university-application-documents/[application-id]/[document-id]/view/route.ts",
);
const submission = read("./university-application-document-submission.ts");
const upload = read("./university-application-document-upload.ts");
const model = read("./university-application-documents.ts");
const page = read("../../app/counselor/students/[student-id]/page.tsx");
const docs = read("../../../docs/database.md");

function listFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });
}

test("reviewed E1.3.3 migration and canonical readiness remain byte-identical", () => {
  const migration = readFileSync(
    new URL(
      "../../../supabase/migrations/202608010001_university_application_documents_foundation.sql",
      import.meta.url,
    ),
  );
  const readiness = readFileSync(
    new URL("../../../supabase/verification/pre_phase_c2_readiness.sql", import.meta.url),
  );
  assert.equal(
    createHash("sha256").update(migration).digest("hex"),
    "9cff3f5849fffa9d610b3d7a8bbab2ac0f04dc3e7729ca95bc46d0c0a6d548a1",
  );
  assert.equal(
    createHash("sha256").update(readiness).digest("hex"),
    "21ff407489dee1fa637f2c44efe50c253ea41f03293b425bedc5f7a12d06ab01",
  );
});

test("documents are embedded per application and never loaded by the initial Student 360 request", () => {
  assert.match(applicationSection, /<UniversityApplicationDocuments/);
  assert.match(applicationSection, /applicationId=\{application\.id\}/);
  assert.match(component, /useState<ListState>\(\{ phase: "idle" \}\)/);
  assert.match(component, /if \(listState\.phase === "idle"\) void loadDocuments\(\)/);
  assert.equal(component.match(/loadUniversityApplicationDocumentsAction\(formData\)/g)?.length, 1);
  assert.doesNotMatch(page, /list_university_application_documents|loadUniversityApplicationDocumentsAction/);
});

test("each document entry point independently requires counselor authorization and reviewed RPCs", () => {
  assert.equal(actions.match(/await requireCounselor\(\)/g)?.length, 4);
  for (const rpc of [
    "list_university_application_documents",
    "prepare_university_application_document_upload",
    "finalize_university_application_document_upload",
    "soft_remove_university_application_document",
  ]) {
    assert.equal(actions.match(new RegExp(`"${rpc}"`, "g"))?.length, 1);
  }
  assert.match(route, /await requireCounselor\(\)/);
  assert.match(route, /authorize_university_application_document_view/);
  assert.doesNotMatch(actions + route, /service[_-]?role|auth\.admin/i);
  assert.doesNotMatch(actions, /\.from\("student_university_application_documents"\)/);
});

test("upload sends scalar metadata to the server and bytes directly to signed private Storage", () => {
  assert.match(actions, /createSignedUploadUrl\(path, \{ upsert: false \}\)/);
  assert.match(component, /\.uploadToSignedUrl\(capability\.path, capability\.token, file, \{/);
  assert.match(component, /contentType: capability\.mimeType/);
  assert.doesNotMatch(component, /uploadToSignedUrl[\s\S]{0,180}upsert:/);
  assert.doesNotMatch(actions + submission, /\bFile\b|\bBlob\b|arrayBuffer|multipart/);
  assert.match(submission, /"applicationId",[\s\S]*?"documentTitle",[\s\S]*?"originalFileName",[\s\S]*?"mimeType",[\s\S]*?"fileSizeBytes"/);
  assert.match(upload, /finally \{[\s\S]*?capability = null;/);
  assert.doesNotMatch(component + upload, /localStorage|sessionStorage|console\.log|console\.error/);
});

test("finalize removal and list FormData contracts reject browser ownership and audit data", () => {
  assert.match(component, /formData\.set\("documentId", documentId\)/);
  const finalizeFunction = component.match(
    /async function finalizeDocument[\s\S]*?^  }/m,
  )?.[0] ?? "";
  const finalizeForm = finalizeFunction.match(
    /const formData = new FormData\(\);[\s\S]*?finalizeUniversityApplicationDocumentUploadAction\(formData\)/,
  )?.[0] ?? "";
  assert.match(finalizeForm, /formData\.set\("documentId", documentId\)/);
  assert.doesNotMatch(
    finalizeForm,
    /formData\.set\("(?:applicationId|studentId|counselorId|status|availableAt|bucketId|path|token)"/,
  );
  assert.match(submission, /readExactFields\(formData, \["documentId"\]\)/);
  assert.match(submission, /readExactFields\(formData, \["documentId", "removalReason"\]\)/);
  assert.match(submission, /entries\.length !== 1/);
  assert.doesNotMatch(
    submission,
    /startsWith\("\$ACTION_"\)|uploadedBy|removedBy|studentId|counselorId|availableAt/,
  );
});

test("archived applications list and view documents but expose no mutation controls", () => {
  assert.match(component, /if \(isArchived \|\| atLimit\) return;/);
  assert.match(component, /if \(isArchived\) return;/);
  assert.match(component, /\{!isArchived && \([\s\S]*?Remove/);
  assert.match(component, /isArchived \? \([\s\S]*?archived application is read-only/);
  assert.match(component, /Existing documents remain viewable/);
  assert.doesNotMatch(component, /Restore document|Unremove|Delete object/);
});

test("view is an explicit five-minute server-created no-store redirect", () => {
  assert.match(route, /createSignedUrl\([\s\S]*?UNIVERSITY_APPLICATION_DOCUMENT_SIGNED_VIEW_SECONDS/);
  assert.match(route, /NextResponse\.redirect\(signedView\.signedUrl, 307\)/);
  assert.match(route, /private, no-store, max-age=0/);
  assert.match(route, /"Referrer-Policy": "no-referrer"/);
  assert.match(component, /rel="noopener noreferrer"/);
  assert.match(component, /target="_blank"/);
  assert.doesNotMatch(component + route, /getPublicUrl|createSignedUrl[\s\S]*?3600|signedUrl.*state/);

  const storagePath =
    "applications/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222/33333333-3333-4333-8333-333333333333/33333333-3333-4333-8333-333333333333.pdf";
  const url = `https://example.supabase.co/storage/v1/object/sign/university-application-documents/${storagePath}?token=private`;
  assert.equal(
    isTrustedUniversityApplicationDocumentSignedViewUrl(
      url,
      "https://example.supabase.co",
      "university-application-documents",
      storagePath,
    ),
    true,
  );
  assert.equal(
    isTrustedUniversityApplicationDocumentSignedViewUrl(
      url.replace("example.supabase.co", "attacker.example"),
      "https://example.supabase.co",
      "university-application-documents",
      storagePath,
    ),
    false,
  );

  for (const hostileUrl of [
    url.replace("https://", "http://"),
    url.replace("example.supabase.co", "example.supabase.co:444"),
    url.replace("https://", "https://user@"),
    url.replace("/object/sign/", "/object/sign/wrong/"),
    `${url}&token=second`,
    `${url}&redirect=https://attacker.example`,
    `${url}#fragment`,
    url.replace("/applications/", "/applications%2F"),
    "//example.supabase.co/storage/v1/object/sign/path?token=private",
    "not-a-url",
  ]) {
    assert.equal(
      isTrustedUniversityApplicationDocumentSignedViewUrl(
        hostileUrl,
        "https://example.supabase.co",
        "university-application-documents",
        storagePath,
      ),
      false,
      hostileUrl,
    );
  }
  assert.equal(
    isTrustedUniversityApplicationDocumentSignedViewUrl(
      url.replace("private", "x".repeat(4097)),
      "https://example.supabase.co",
      "university-application-documents",
      storagePath,
    ),
    false,
  );
  assert.match(route, /try \{[\s\S]*?createSignedUrl[\s\S]*?\} catch \{[\s\S]*?return unavailableResponse\(\)/);
});

test("visible document props and markup exclude Storage capability and audit internals", () => {
  const visibleType = read("../../types/index.ts").match(
    /export type CounselorUniversityApplicationDocument = \{[\s\S]*?\n\};/,
  )?.[0] ?? "";
  assert.doesNotMatch(
    visibleType,
    /bucketId|storagePath|uploadedBy|removedBy|removalReason|token|status/,
  );
  assert.doesNotMatch(
    component,
    /document\.bucket|document\.storage|document\.uploaded|document\.removed|document\.token/,
  );
  assert.doesNotMatch(component, /request_number|requestNumber|analytics|metadata:/);
});

test("document dialogs and local states are accessible and responsive contracts are present", () => {
  assert.match(component, /aria-expanded=\{expanded\}/);
  assert.match(component, /aria-controls=/);
  assert.match(component, /role="status"/);
  assert.match(component, /role="alert"/);
  assert.match(component, /aria-modal="true"/);
  assert.match(component, /onCancel=\{handleUploadCancel\}/);
  assert.match(component, /onCancel=\{handleRemovalCancel\}/);
  assert.match(component, /requestAnimationFrame\(\(\) => uploadTriggerRef\.current\?\.focus\(\)\)/);
  assert.match(component, /requestAnimationFrame\(\(\) => removeTriggerRef\.current\?\.focus\(\)\)/);
  assert.match(component, /uploadErrors\.documentTitle\?\.length[\s\S]*?titleInputRef\.current\?\.focus\(\)/);
  assert.match(component, /uploadErrors\.documentFile\?\.length[\s\S]*?fileInputRef\.current\?\.focus\(\)/);
  assert.match(component, /activeUploadPhases\.includes\(uploadPhase\) \|\| uploadRefreshPending/);
  assert.match(component, /accept=\{UNIVERSITY_APPLICATION_DOCUMENT_ACCEPT\}/);
  assert.match(model, /application\/pdf,image\/jpeg,image\/png,image\/webp/);
  const css = read("../../app/globals.css");
  assert.match(css, /application-document-list/);
  assert.match(css, /@media \(max-width: 650px\)/);
  assert.match(css, /overflow-wrap: anywhere/);
});

test("student admin director and public runtime do not import or query E1.3.4 documents", () => {
  const appRoot = fileURLToPath(new URL("../../app/", import.meta.url));
  for (const directory of ["student", "admin", "(public)"]) {
    for (const file of listFiles(join(appRoot, directory))) {
      if (!/\.(?:ts|tsx)$/.test(file)) continue;
      assert.doesNotMatch(
        readFileSync(file, "utf8"),
        /UniversityApplicationDocuments|university-application-document-actions|list_university_application_documents|student_university_application_documents/,
        file,
      );
    }
  }
});

test("documentation records the implemented E1.3.4 boundary and leaves E1.4 absent", () => {
  for (const phrase of [
    "Phase E1.3.4",
    "lazy",
    "direct signed upload",
    "five-minute",
    "soft removal",
    "archived",
    "counselor-only",
    "E1.4 has not started",
  ]) {
    assert.match(docs, new RegExp(phrase, "i"));
  }
});
