import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type {
  DirectorCounselorWorkloadSummary,
  DirectorStudentOversightEntry,
} from "@/types";

const require = createRequire(import.meta.url);
const { parseCounselorPrimaryStudents } = require(
  "./primary-assignment.ts",
) as typeof import("./primary-assignment");
const {
  attachDirectorPrimaryCounselorCounts,
  attachDirectorPrimaryCounselors,
} = require("../director/operational-oversight.ts") as typeof import(
  "../director/operational-oversight"
);

const studentId = "11111111-1111-4111-8111-111111111111";
const counselorId = "22222222-2222-4222-8222-222222222222";
const assignmentId = "33333333-3333-4333-8333-333333333333";

test("My Students parses only the bounded safe projection", () => {
  const parsed = parseCounselorPrimaryStudents([{
    assignment_id: assignmentId,
    student_id: studentId,
    full_name: "Arun Student",
    college_email: "arun@kct.ac.in",
    is_active: true,
    course: "Engineering",
    department: "CSE",
    assigned_at: "2026-08-12T08:00:00Z",
    total_count: 1,
  }]);
  assert.equal(parsed.totalCount, 1);
  assert.equal(parsed.items[0]?.studentId, studentId);
  assert.equal(parsed.items[0]?.assignmentId, assignmentId);
});

test("My Students rejects private fields and inconsistent counts", () => {
  assert.throws(() => parseCounselorPrimaryStudents([{
    assignment_id: assignmentId,
    student_id: studentId,
    full_name: null,
    college_email: "arun@kct.ac.in",
    is_active: true,
    course: null,
    department: null,
    assigned_at: "2026-08-12T08:00:00Z",
    total_count: 1,
    note_text: "private",
  }]));
});

const directorStudent: DirectorStudentOversightEntry = {
  studentId,
  fullName: "Arun Student",
  collegeEmail: "arun@kct.ac.in",
  isActive: true,
  accountCreatedAt: "2026-01-01T00:00:00Z",
  course: null,
  department: null,
  graduationYear: null,
  profileState: "profile_not_started",
  progressionStage: null,
  progressionState: null,
  totalConsultations: 1,
  openConsultations: 1,
  activeApplications: 0,
  primaryCounselorId: null,
  primaryCounselorFullName: null,
  primaryCounselorCollegeEmail: null,
  primaryCounselorAssignedAt: null,
};

test("Director student enrichment distinguishes assigned and unassigned students", () => {
  const [assigned] = attachDirectorPrimaryCounselors([directorStudent], [{
    student_id: studentId,
    counselor_id: counselorId,
    counselor_full_name: "Priya Counselor",
    counselor_college_email: "priya@kct.ac.in",
    assigned_at: "2026-08-12T08:00:00Z",
  }]);
  assert.equal(assigned?.primaryCounselorId, counselorId);

  const [unassigned] = attachDirectorPrimaryCounselors([directorStudent], []);
  assert.equal(unassigned?.primaryCounselorId, null);
});

test("Director enrichment rejects duplicate or unrelated assignment rows", () => {
  const row = {
    student_id: studentId,
    counselor_id: counselorId,
    counselor_full_name: null,
    counselor_college_email: "priya@kct.ac.in",
    assigned_at: "2026-08-12T08:00:00Z",
  };
  assert.throws(() => attachDirectorPrimaryCounselors([directorStudent], [row, row]));
  assert.throws(() => attachDirectorPrimaryCounselors([directorStudent], [{
    ...row,
    student_id: "44444444-4444-4444-8444-444444444444",
  }]));
});

test("Director workload count enrichment defaults safely and rejects duplicates", () => {
  const workload: DirectorCounselorWorkloadSummary[] = [{
    counselorId,
    counselorFullName: "Priya Counselor",
    collegeEmail: "priya@kct.ac.in",
    isActive: true,
    pendingFollowUps: 0,
    overdueFollowUps: 0,
    pendingOutcomes: 0,
    consultationsToday: 0,
  }];
  assert.equal(
    attachDirectorPrimaryCounselorCounts(workload, [
      { counselor_id: counselorId, assigned_student_count: 3 },
    ])[0]?.assignedStudents,
    3,
  );
  assert.equal(
    attachDirectorPrimaryCounselorCounts(workload, [])[0]?.assignedStudents,
    0,
  );
  assert.throws(() => attachDirectorPrimaryCounselorCounts(workload, [
    { counselor_id: counselorId, assigned_student_count: 1 },
    { counselor_id: counselorId, assigned_student_count: 1 },
  ]));
});
