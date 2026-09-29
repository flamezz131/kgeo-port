import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const homeSource = read("../../app/(public)/page.tsx");
const rootLayoutSource = read("../../app/layout.tsx");
const publicLayoutSource = read("../../app/(public)/layout.tsx");
const loginPageSource = read("../../app/(public)/login/page.tsx");
const loginFormSource = read("../../components/auth/login-form.tsx");
const registerPageSource = read("../../app/(public)/register/page.tsx");
const registerFormSource = read("../../components/auth/register-form.tsx");
const loginActionSource = read("../../app/actions/auth-actions.ts");
const roleRedirectSource = read("./role-redirect.ts");
const studentLayoutSource = read("../../app/student/layout.tsx");
const counselorLayoutSource = read("../../app/counselor/layout.tsx");
const adminLayoutSource = read("../../app/admin/layout.tsx");
const portalShellSource = read("../../components/shell/portal-shell.tsx");
const counselorLoadingSource = read("../../app/counselor/loading.tsx");
const publicNavigationSource = read(
  "../../components/public/public-navigation.tsx",
);

test("public navigation exposes one shared student login plus labelled staff portals", () => {
  const publicSource = [homeSource, publicLayoutSource, loginPageSource].join("\n");

  // One shared entry point for students (not "Student login" implying several).
  assert.match(publicSource, /href="\/login"/);
  assert.doesNotMatch(publicSource, /Student login/i);

  // Staff portals are reachable, but only counselor/director self-serve — never
  // an admin login route, and never a role-selection field.
  assert.doesNotMatch(publicSource, /Admin login/i);
  assert.doesNotMatch(publicSource, /href="\/admin(?:\/login)?"/i);
});

test("every public and authenticated shell owns its main landmark", () => {
  // The public shell renders its own <main>. The three signed-in portals share
  // one frame (PortalShell) so the rail, content width and padding cannot drift
  // apart again — the landmark lives there, and each layout must route through
  // it rather than hand-rolling a shell.
  assert.match(publicLayoutSource, /<main(?:\s|>)/);
  assert.match(publicLayoutSource, /<\/main>/);

  assert.match(portalShellSource, /<main(?:\s|>)/);
  assert.match(portalShellSource, /<\/main>/);

  for (const layoutSource of [
    studentLayoutSource,
    counselorLayoutSource,
    adminLayoutSource,
  ]) {
    assert.match(layoutSource, /<PortalShell/);
    assert.match(layoutSource, /<\/PortalShell>/);
  }
});

test("public registration is clearly student-only", () => {
  const registrationSource = [
    publicLayoutSource,
    registerPageSource,
    registerFormSource,
  ].join("\n");

  assert.match(registrationSource, /Student (?:registration|sign-up)/i);
  assert.match(registrationSource, /Create your student account/i);
  assert.doesNotMatch(
    registrationSource,
    /(?:counselor|admin|director|staff) registration/i,
  );
});

test("authentication forms expose no role-selection mechanism", () => {
  const authenticationSource = [loginFormSource, registerFormSource].join("\n");

  assert.doesNotMatch(authenticationSource, /name=["']role["']/i);
  assert.doesNotMatch(authenticationSource, /type=["']hidden["'][^>]*role/i);
  assert.doesNotMatch(authenticationSource, /localStorage/i);
});

test("login destination comes from profiles and ignores next or redirect input", () => {
  assert.match(loginActionSource, /\.from\("profiles"\)/);
  assert.match(loginActionSource, /getRoleHomePath\(profile\.role\)/);
  assert.doesNotMatch(loginActionSource, /formData\.get\(["']role["']\)/);
  assert.doesNotMatch(loginActionSource, /formData\.get\(["']next["']\)/);
  assert.doesNotMatch(loginActionSource, /redirect_to|localStorage/i);
  assert.doesNotMatch(roleRedirectSource, /next|redirect_to|searchParams/i);
});

test("student shell has its own server-side role guard", () => {
  assert.match(studentLayoutSource, /import \{ requireStudent \}/);
  assert.match(studentLayoutSource, /await requireStudent\(\)/);
});

test("public navigation is isolated from authenticated counselor states", () => {
  // The public shell owns a header landmark and a labelled primary nav.
  assert.match(publicLayoutSource, /<header/);
  assert.match(publicNavigationSource, /aria-label="Main navigation"/);

  // Authenticated shells must not reuse the public marketing nav or its links.
  const privateShellSource = [
    rootLayoutSource,
    counselorLayoutSource,
    counselorLoadingSource,
  ].join("\n");
  assert.doesNotMatch(privateShellSource, /Main navigation/);
  assert.doesNotMatch(
    privateShellSource,
    /Services|Student sign-up|href="\/login"/,
  );
});
