import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
type ResolveHook = (
  specifier: string,
  context: unknown,
  nextResolve: (specifier: string, context: unknown) => unknown,
) => unknown;

const { registerHooks } = require("node:module") as {
  registerHooks: (hooks: { resolve: ResolveHook }) => void;
};

registerHooks({
  resolve(specifier, context, nextResolve) {
    const aliases: Record<string, string> = {
      "@/lib/consultations/options": "../consultations/options.ts",
      "@/lib/profiles/options": "../profiles/options.ts",
      "@/lib/validation/institutional-email":
        "../validation/institutional-email.ts",
      "@/lib/auth/student-institutions": "../auth/student-institutions.ts",
    };
    const target = aliases[specifier];
    if (target) {
      return { shortCircuit: true, url: new URL(target, import.meta.url).href };
    }
    return nextResolve(specifier, context);
  },
});

const {
  DIRECTORY_FALLBACKS,
  DIRECTORY_PAGE_SIZE,
  buildStudentDirectoryRpcArgs,
  buildStudentDirectoryUrl,
  fetchStudentDirectory,
  formatDirectoryUpdate,
  formatTargetIntake,
  getInterestLabel,
  getProfileStateLabel,
  getStudentDirectoryPagination,
  getStudyLevelLabel,
  parseStudentDirectoryQuery,
} = require("./student-directory.ts") as typeof import("./student-directory");

type CounselorStudentDirectoryEntry =
  import("./student-directory").CounselorStudentDirectoryEntry;
type StudentDirectoryReadyResult =
  import("./student-directory").StudentDirectoryReadyResult;

const completeRow: CounselorStudentDirectoryEntry = {
  student_id: "11111111-1111-4111-8111-111111111111",
  full_name: "Ananya Kumar",
  college_email: "ananya@kct.ac.in",
  account_created_at: "2026-07-20T08:30:00+00:00",
  is_active: true,
  roll_number: "22BCS001",
  college: "Kumaraguru College of Technology",
  course: "B.E",
  department: "Computer Science and Engineering",
  graduation_year: 2027,
  profile_state: "ready_for_counseling",
  completion_percentage: 84,
  ready_for_counseling: true,
  higher_studies_interest: "interested",
  preferred_study_level: "masters",
  target_intake: "fall-2027",
  last_profile_update: "2026-07-22T10:15:00+00:00",
  total_count: 1,
};

test("query parser produces the fixed safe defaults", () => {
  assert.deepEqual(parseStudentDirectoryQuery({}), {
    q: null,
    college: null,
    course: null,
    department: null,
    graduationYear: null,
    active: "all",
    isActive: null,
    profileState: null,
    interest: null,
    studyLevel: null,
    targetIntake: null,
    sort: "name_asc",
    page: 1,
    hasFilters: false,
    hadInvalidParameters: false,
  });
});

test("query parser trims search and accepts every validated filter", () => {
  assert.deepEqual(
    parseStudentDirectoryQuery({
      q: "  Ananya  ",
      college: "Kumaraguru College of Technology",
      course: "B.E",
      department: "Computer Science and Engineering",
      graduationYear: "2027",
      active: "inactive",
      profileState: "ready_for_counseling",
      interest: "interested",
      studyLevel: "masters",
      targetIntake: " FALL-2027 ",
      sort: "recently_updated",
      page: "2",
    }),
    {
      q: "Ananya",
      college: "Kumaraguru College of Technology",
      course: "B.E",
      department: "Computer Science and Engineering",
      graduationYear: 2027,
      active: "inactive",
      isActive: false,
      profileState: "ready_for_counseling",
      interest: "interested",
      studyLevel: "masters",
      targetIntake: "fall-2027",
      sort: "recently_updated",
      page: 2,
      hasFilters: true,
      hadInvalidParameters: false,
    },
  );
});

test("active filter maps all, active, and inactive to null, true, and false", () => {
  assert.equal(parseStudentDirectoryQuery({ active: "all" }).isActive, null);
  assert.equal(parseStudentDirectoryQuery({ active: "active" }).isActive, true);
  assert.equal(
    parseStudentDirectoryQuery({ active: "inactive" }).isActive,
    false,
  );
});

test("malformed, overlong, duplicate, and unknown query values fail to defaults", () => {
  const query = parseStudentDirectoryQuery({
    q: "x".repeat(101),
    college: "Unknown college",
    course: "Unknown course",
    department: "Unknown department",
    graduationYear: "2041",
    active: ["active", "inactive"],
    profileState: "draft",
    interest: "yes",
    studyLevel: "undergraduate",
    targetIntake: "2027-fall",
    sort: "email_desc",
    page: ["2", "3"],
    pageSize: "500",
    role: "admin",
  });

  assert.equal(query.q, null);
  assert.equal(query.college, null);
  assert.equal(query.course, null);
  assert.equal(query.department, null);
  assert.equal(query.graduationYear, null);
  assert.equal(query.active, "all");
  assert.equal(query.profileState, null);
  assert.equal(query.interest, null);
  assert.equal(query.studyLevel, null);
  assert.equal(query.targetIntake, null);
  assert.equal(query.sort, "name_asc");
  assert.equal(query.page, 1);
  assert.equal(query.hasFilters, false);
  assert.equal(query.hadInvalidParameters, true);
});

test("unknown parameters are ignored without being reported as malformed filters", () => {
  const query = parseStudentDirectoryQuery({
    redirect: "https://example.com",
    role: "admin",
    pageSize: "500",
  });

  assert.equal(query.hadInvalidParameters, false);
  assert.equal(query.hasFilters, false);
});

test("graduation year and page reject non-integers, zero, and oversized values", () => {
  for (const value of ["2027.5", "02027", "2023", "not-a-year"]) {
    assert.equal(
      parseStudentDirectoryQuery({ graduationYear: value }).graduationYear,
      null,
    );
  }
  for (const value of ["0", "-1", "1.5", "100001", "999999999999999999"]) {
    assert.equal(parseStudentDirectoryQuery({ page: value }).page, 1);
  }
});

test("department must be catalogued and compatible with a selected course", () => {
  const mismatched = parseStudentDirectoryQuery({
    course: "B.E",
    department: "Biotechnology",
  });
  assert.equal(mismatched.department, null);
  assert.equal(mismatched.hadInvalidParameters, true);
  assert.equal(
    parseStudentDirectoryQuery({
      department: "Biotechnology",
    }).department,
    "Biotechnology",
  );
});

test("RPC payload uses exact named arguments, fixed page size, and no private fields", () => {
  const args = buildStudentDirectoryRpcArgs(
    parseStudentDirectoryQuery({
      active: "active",
      profileState: "submitted",
      page: "3",
    }),
  );

  assert.deepEqual(args, {
    p_search: null,
    p_college: null,
    p_course: null,
    p_department: null,
    p_graduation_year: null,
    p_is_active: true,
    p_profile_state: "submitted",
    p_higher_studies_interest: null,
    p_preferred_study_level: null,
    p_target_intake: null,
    p_sort: "name_asc",
    p_page: 3,
    p_page_size: DIRECTORY_PAGE_SIZE,
  });
  assert.doesNotMatch(
    JSON.stringify(args),
    /personal_email|mobile_number|cgpa|backlog|role|metadata/i,
  );
});

test("Student emails from KCT, KCLAS and KCTBS parse and other domains fail closed", async () => {
  for (const collegeEmail of [
    "ananya@kct.ac.in",
    "ananya@kclas.ac.in",
    "ananya@kctbs.ac.in",
  ]) {
    const result = await fetchStudentDirectory(
      parseStudentDirectoryQuery({}),
      async () => ({
        data: [{ ...completeRow, college_email: collegeEmail }],
        error: null,
      }),
    );
    assert.equal(result.kind, "ready", collegeEmail);
    if (result.kind === "ready") {
      assert.equal(result.students[0].college_email, collegeEmail);
    }
  }

  for (const collegeEmail of [
    "ananya@student.kct.ac.in",
    "ananya@sub.kclas.ac.in",
    "ananya@kct.ac.in.fake.com",
    "ananya@kctbs-ac.in",
    "ananya@gmail.com",
    "ananya@@kct.ac.in",
  ]) {
    const result = await fetchStudentDirectory(
      parseStudentDirectoryQuery({}),
      async () => ({
        data: [{ ...completeRow, college_email: collegeEmail }],
        error: null,
      }),
    );
    assert.equal(result.kind, "unavailable", collegeEmail);
  }
});

test("every stored graduation year inside the database envelope parses", async () => {
  for (const graduationYear of [2000, 2022, 2023, 2024, 2035, 2040, 2041, 2100]) {
    const result = await fetchStudentDirectory(
      parseStudentDirectoryQuery({}),
      async () => ({
        data: [{ ...completeRow, graduation_year: graduationYear }],
        error: null,
      }),
    );
    assert.equal(result.kind, "ready", String(graduationYear));
    if (result.kind === "ready") {
      assert.equal(result.students[0].graduation_year, graduationYear);
    }
  }

  for (const graduationYear of [1999, 2101, 2026.5, "2026"]) {
    const result = await fetchStudentDirectory(
      parseStudentDirectoryQuery({}),
      async () => ({
        data: [{ ...completeRow, graduation_year: graduationYear }],
        error: null,
      }),
    );
    assert.equal(result.kind, "unavailable", String(graduationYear));
  }
});

test("valid complete and profile-not-started rows are runtime mapped", async () => {
  const ready = await fetchStudentDirectory(
    parseStudentDirectoryQuery({}),
    async () => ({ data: [completeRow], error: null }),
  );
  assert.equal(ready.kind, "ready");
  if (ready.kind !== "ready") return;
  assert.equal(ready.students[0].completion_percentage, 84);
  assert.equal(ready.totalCount, 1);

  const notStarted = await fetchStudentDirectory(
    parseStudentDirectoryQuery({}),
    async () => ({
      data: [
        {
          ...completeRow,
          full_name: null,
          is_active: false,
          roll_number: null,
          college: null,
          course: null,
          department: null,
          graduation_year: null,
          profile_state: "profile_not_started",
          completion_percentage: 0,
          ready_for_counseling: false,
          higher_studies_interest: null,
          preferred_study_level: null,
          target_intake: null,
          last_profile_update: null,
          total_count: "1",
        },
      ],
      error: null,
    }),
  );
  assert.equal(notStarted.kind, "ready");
  if (notStarted.kind !== "ready") return;
  assert.equal(notStarted.students[0].is_active, false);
  assert.equal(notStarted.students[0].total_count, 1);
});

test("malformed rows and unsafe counts fail to unavailable without throwing", async () => {
  const invalidRows = [
    { ...completeRow, student_id: "not-a-uuid" },
    { ...completeRow, profile_state: "unknown" },
    { ...completeRow, completion_percentage: 101 },
    { ...completeRow, total_count: "-1" },
    { ...completeRow, total_count: "9007199254740992" },
    { ...completeRow, account_created_at: "yesterday" },
    { ...completeRow, last_profile_update: "2026-99-99T00:00:00Z" },
    { ...completeRow, unexpected_field: "not part of the RPC contract" },
  ];

  for (const row of invalidRows) {
    const result = await fetchStudentDirectory(
      parseStudentDirectoryQuery({}),
      async () => ({ data: [row], error: null }),
    );
    assert.equal(result.kind, "unavailable");
  }
});

test("RPC failures, thrown failures, malformed arrays, and inconsistent counts are unavailable", async () => {
  const query = parseStudentDirectoryQuery({});
  const failures = [
    async () => ({ data: null, error: null }),
    async () => ({ data: [], error: { message: "hidden" } }),
    async () => ({
      data: [
        completeRow,
        {
          ...completeRow,
          student_id: "22222222-2222-4222-8222-222222222222",
          total_count: 2,
        },
      ],
      error: null,
    }),
  ];

  for (const execute of failures) {
    const result = await fetchStudentDirectory(query, execute);
    assert.equal(result.kind, "unavailable");
  }

  const thrown = await fetchStudentDirectory(query, async () => {
    throw new Error("hidden database failure");
  });
  assert.equal(thrown.kind, "unavailable");
});

test("empty first page stays empty and an empty later page redirects to sanitized page 1", async () => {
  const firstPage = await fetchStudentDirectory(
    parseStudentDirectoryQuery({}),
    async () => ({ data: [], error: null }),
  );
  assert.equal(firstPage.kind, "ready");

  const laterPage = await fetchStudentDirectory(
    parseStudentDirectoryQuery({
      q: " Ananya ",
      active: "inactive",
      sort: "recently_registered",
      page: "999",
      redirect: "https://example.com",
    }),
    async () => ({ data: [], error: null }),
  );
  assert.deepEqual(laterPage, {
    kind: "out_of_range",
    redirectTo:
      "/counselor/students?q=Ananya&active=inactive&sort=recently_registered",
  });
});

test("pagination calculates first, middle, final, and visible ranges", () => {
  const firstQuery = parseStudentDirectoryQuery({ q: "Ananya" });
  const firstResult: StudentDirectoryReadyResult = {
    kind: "ready",
    query: firstQuery,
    students: [{ ...completeRow, total_count: 51 }],
    totalCount: 51,
  };
  const first = getStudentDirectoryPagination(firstResult);
  assert.equal(first.rangeStart, 1);
  assert.equal(first.rangeEnd, 1);
  assert.equal(first.previousUrl, null);
  assert.equal(first.nextUrl, "/counselor/students?q=Ananya&page=2");
  assert.equal(first.pageCount, 3);

  const middle = getStudentDirectoryPagination({
    ...firstResult,
    query: parseStudentDirectoryQuery({ q: "Ananya", page: "2" }),
    students: Array.from({ length: 25 }, (_, index) => ({
      ...completeRow,
      student_id: `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`,
      total_count: 51,
    })),
  });
  assert.equal(middle.rangeStart, 26);
  assert.equal(middle.rangeEnd, 50);
  assert.equal(middle.previousUrl, "/counselor/students?q=Ananya");
  assert.equal(middle.nextUrl, "/counselor/students?q=Ananya&page=3");

  const final = getStudentDirectoryPagination({
    ...firstResult,
    query: parseStudentDirectoryQuery({ q: "Ananya", page: "3" }),
    totalCount: 51,
  });
  assert.equal(final.rangeStart, 51);
  assert.equal(final.rangeEnd, 51);
  assert.equal(final.nextUrl, null);
});

test("URL builder preserves only sanitized filters with no duplicate page", () => {
  const query = parseStudentDirectoryQuery({
    q: "  Ananya  ",
    active: "active",
    sort: "completion_high_to_low",
    page: "2",
    redirect: "https://example.com",
    role: "director",
  });
  const url = buildStudentDirectoryUrl(query, 3);
  assert.equal(
    url,
    "/counselor/students?q=Ananya&active=active&sort=completion_high_to_low&page=3",
  );
  assert.equal((url.match(/page=/g) ?? []).length, 1);
  assert.doesNotMatch(url, /redirect|role|director|example\.com/);
});

test("presentation labels and fallbacks are human-readable and stable", () => {
  assert.equal(
    getProfileStateLabel("profile_not_started"),
    "Profile not started",
  );
  assert.equal(getProfileStateLabel("submitted"), "Submitted");
  assert.equal(getInterestLabel(null), DIRECTORY_FALLBACKS.notSelected);
  assert.equal(getInterestLabel("not_interested"), "Not interested");
  assert.equal(getStudyLevelLabel("postgraduate_diploma"), "Postgraduate diploma");
  assert.equal(formatTargetIntake("fall-2027"), "Fall 2027");
  assert.equal(formatTargetIntake(null), DIRECTORY_FALLBACKS.notSelected);
  assert.equal(formatDirectoryUpdate(null), DIRECTORY_FALLBACKS.noUpdate);
  assert.match(
    formatDirectoryUpdate("2026-07-22T10:15:00+00:00"),
    /22 Jul 2026/,
  );
});
