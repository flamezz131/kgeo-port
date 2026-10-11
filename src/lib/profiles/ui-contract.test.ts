import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import "./profile-v2-client-corrections.test.ts";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const pageSource = read("../../app/student/profile/page.tsx");
const actionSource = read("../../app/actions/profile-actions.ts");
const formSource = read("../../components/forms/student-profile-onboarding.tsx");
const submitButtonSource = read("../../components/ui/submit-button.tsx");
const studentLayoutSource = read("../../app/student/layout.tsx");
const studentSidebarSource = read("../../app/student/StudentSidebar.tsx");
const dashboardSource = read("../../app/student/dashboard/page.tsx");
const preferenceComboboxSource = read(
  "../../components/forms/profile-preference-combobox.tsx",
);
const countryComboboxSource = read("../../components/CountryCombobox.tsx");
const specializationComboboxSource = read(
  "../../components/SpecializationCombobox.tsx",
);
const stylesSource = read("../../app/globals.css");

test("profile page and every mutation repeat the student server guard", () => {
  assert.match(pageSource, /await requireStudent\(\)/);
  assert.equal(actionSource.match(/await requireStudent\(\)/g)?.length, 3);
});

test("one identity form contains the canonical name first and read-only college email", () => {
  const identityFormStart = formSource.indexOf("<form action={identityAction}");
  const identityFormEnd = formSource.indexOf("</form>", identityFormStart);
  const identityForm = formSource.slice(identityFormStart, identityFormEnd);

  assert.notEqual(identityFormStart, -1);
  assert.match(formSource, /id="profileFullName"[\s\S]*name="fullName"/);
  assert.ok(
    identityForm.indexOf('name="fullName"') <
      identityForm.indexOf('name="rollNumber"'),
  );
  assert.match(identityForm, /id="trustedCollegeEmail"[\s\S]*?readOnly/);
  assert.doesNotMatch(identityForm, /name="collegeEmail"/);
  assert.equal(formSource.match(/action=\{identityAction\}/g)?.length, 1);
  assert.doesNotMatch(formSource, /Save Full Name|saveStudentFullName/);
  assert.match(pageSource, /full_name\?\.trim\(\) \|\| ""/);
  assert.match(actionSource, /\.rpc\("save_student_identity", payload\)/);
  assert.match(actionSource, /revalidatePath\("\/counselor\/students"\)/);
});

test("graduation year options come from the shared helper and keep the stored value", () => {
  assert.match(
    formSource,
    /getGraduationYearOptions\(\s*undefined,\s*profile\?\.graduation_year \?\? null,\s*\)\.map\(\(year\) => \(/,
  );
  assert.match(
    formSource,
    /defaultValue=\{profile\?\.graduation_year \?\? ""\}\s*id="profileGraduationYear"\s*name="graduationYear"/,
  );
  assert.doesNotMatch(formSource, /PROFILE_GRADUATION_YEARS/);
  assert.match(
    actionSource,
    /loadStoredGraduationYear: async \(\) => \{[\s\S]*?\.from\("student_profiles"\)[\s\S]*?\.select\("graduation_year"\)[\s\S]*?\.eq\("student_id", user\.id\)/,
  );
});

test("forms announce outcomes and expose a pending state", () => {
  assert.match(formSource, /state\.status !== "error"/);
  assert.match(formSource, /className="form-error" role="alert"/);
  assert.match(formSource, /className="form-success profile-save-notice" role="status"/);
  assert.match(formSource, /aria-busy=\{identityPending\}/);
  assert.match(formSource, /aria-busy=\{academicsPending\}/);
  assert.match(formSource, /aria-busy=\{preferencesPending\}/);
  assert.match(submitButtonSource, /disabled=\{pending\}/);
  assert.match(formSource, /Saving identity/);
  assert.match(formSource, /Saving academics/);
  assert.match(formSource, /<SubmitButton pendingLabel="Saving\.\.\.">\s*Save and Continue\s*<\/SubmitButton>/);
});

test("student navigation and dashboard expose the guarded profile route", () => {
  // The student shell renders its nav via <StudentSidebar>; the profile route
  // lives there as the link on the signed-in student's name block.
  assert.match(studentLayoutSource, /<StudentSidebar/);
  assert.match(studentSidebarSource, /href: "\/student\/profile"/);
  assert.match(studentSidebarSource, /label: "View my profile"/);
  assert.match(studentSidebarSource, /profileLink=\{/);
  assert.match(dashboardSource, /href="\/student\/profile"/);
  assert.match(dashboardSource, /mapProfileCompletion/);
});

test("preferences require saved identity in both UI and server persistence", () => {
  assert.match(formSource, /\{!identitySaved && \([\s\S]*?Save your identity section first/);
  assert.match(formSource, /disabled=\{preferencesPending\}/);
  assert.match(actionSource, /findProfile: async/);
  assert.match(actionSource, /\.from\("student_profiles"\)/);
});

test("successful saves revalidate routes and explicitly refresh server data", () => {
  assert.match(actionSource, /revalidatePath\("\/student\/profile"\)/);
  assert.match(actionSource, /revalidatePath\("\/student\/dashboard"\)/);
  assert.match(actionSource, /revalidatePath\("\/counselor\/students"\)/);
  assert.equal(formSource.match(/router\.refresh\(\)/g)?.length, 3);
});

test("dashboard separates database failure from a not-started profile", () => {
  assert.match(dashboardSource, /profileUnavailable/);
  assert.match(dashboardSource, /Profile progress unavailable/);
  assert.match(dashboardSource, /role="alert"/);
});

test("preference comboboxes stay accessible and keep the server form contract", () => {
  // Preferred countries and program areas are curated dropdowns, not free
  // text. The wrapper still has to label the group, announce changes and post
  // the same repeated field the server action reads with getAll().
  assert.match(preferenceComboboxSource, /role="group"/);
  assert.match(preferenceComboboxSource, /aria-labelledby=\{fieldId\}/);
  assert.match(preferenceComboboxSource, /aria-live="polite"/);
  assert.match(preferenceComboboxSource, /<input key=\{item\} name=\{name\} type="hidden"/);
  // Curated lists only: a stored value outside the catalogue is not restored.
  assert.match(
    preferenceComboboxSource,
    /defaultValues\.filter\(\(value\) => options\.includes\(value\)\)/,
  );
  for (const source of [countryComboboxSource, specializationComboboxSource]) {
    assert.match(source, /role="combobox"/);
    assert.match(source, /aria-expanded=\{open\}/);
    assert.match(source, /aria-label=\{`Remove \$\{\w+\}`\}/);
  }
});

test("responsive and reduced-motion profile styles are present", () => {
  assert.match(stylesSource, /@media \(max-width: 650px\)/);
  assert.match(stylesSource, /\.profile-field-grid,[\s\S]*grid-template-columns: 1fr/);
  assert.match(stylesSource, /@media \(prefers-reduced-motion: reduce\)/);
});

test("actions do not construct protected ownership or status fields", () => {
  assert.doesNotMatch(actionSource, /student_id\s*:/);
  assert.doesNotMatch(actionSource, /profile_status\s*:/);
  assert.doesNotMatch(actionSource, /profile_submitted_at\s*:/);
  assert.doesNotMatch(actionSource, /(?:created_at|updated_at)\s*:/);
});

test("profile UI contains no private values in URLs or diagnostic logging", () => {
  const source = [pageSource, actionSource, formSource].join("\n");
  assert.doesNotMatch(source, /console\.(?:log|error|warn)/);
  assert.doesNotMatch(source, /service[_-]?role/i);
  assert.doesNotMatch(source, /\?email=|\?mobile=|\?cgpa=/i);
});
