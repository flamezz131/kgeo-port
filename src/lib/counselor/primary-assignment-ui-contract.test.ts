import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

const page = source("../../app/counselor/students/page.tsx");
const component = source("../../components/counselor/my-primary-students.tsx");
const server = source("./primary-assignment-server.ts");
const director = source("../../components/director/director-operational-oversight.tsx");

test("Counselor Students clearly separates My Students from the organization directory", () => {
  assert.match(page, /<MyPrimaryStudents result=\{primaryStudents\}/);
  assert.match(page, /title="Student directory"/);
  assert.match(page, /not a Primary Counselor assignment list/);
  // Title now reaches the shared SectionHeader as a prop rather than inline text.
  assert.match(component, /title="My Students"/);
  assert.match(component, /No students are assigned to you/);
});

test("My Students independently authorizes and invokes only the scoped RPC", () => {
  assert.match(server, /await requireCounselor\(\)/);
  assert.match(server, /\.rpc\("list_my_primary_students"/);
  assert.match(server, /p_page_size: 6/);
  assert.doesNotMatch(server, /\.from\(/);
});

test("My Students exposes safe identity and academic summary without mutation", () => {
  assert.match(component, /Open Student Workspace/);
  assert.doesNotMatch(
    component,
    /note_text|next_action|details|personal_email|mobile_number|use server|<form/i,
  );
});

test("Director UI distinguishes Primary Counselor from application last changer", () => {
  assert.match(director, /Primary Counselor/);
  assert.match(director, /Primary Students/);
  assert.match(director, /Last counselor change/);
  assert.match(director, /primaryCounselorFullName/);
  assert.doesNotMatch(director, /note_text|follow_up_content/i);
});
