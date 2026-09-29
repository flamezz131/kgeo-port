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
      "@/lib/consultations/booking": "../consultations/booking.ts",
      "@/lib/consultations/counselor-references":
        "../consultations/counselor-references.ts",
      "@/lib/counselor/private-records": "./private-records.ts",
      "@/lib/profiles/options": "../profiles/options.ts",
      "@/lib/validation/institutional-email":
        "../validation/institutional-email.ts",
    };
    const target = aliases[specifier];
    if (target) {
      return { shortCircuit: true, url: new URL(target, import.meta.url).href };
    }
    return nextResolve(specifier, context);
  },
});

const {
  STUDENT_360_HISTORY_PAGE_SIZE,
  STUDENT_360_SECTION_LIMIT,
  STUDENT_360_CONSULTATION_COLUMNS,
  fetchCounselorStudentProfile,
  formatStudent360Boolean,
  formatStudent360Date,
  formatStudent360TargetIntake,
  getStudent360ProfileStateLabel,
  isLegacyStudentConsultation,
  parseStudent360HistoryPage,
} = require("./student-profile.ts") as typeof import("./student-profile");

type Student360DataSource =
  import("./student-profile").Student360DataSource;
type Student360SectionResults =
  import("./student-profile").Student360SectionResults;

const STUDENT_ID = "11111111-1111-4111-8111-111111111111";
const CONSULTATION_ID = "22222222-2222-4222-8222-222222222222";

const identity = {
  student_id: STUDENT_ID,
  full_name: "Ananya Kumar",
  college_email: "ananya@kct.ac.in",
  account_created_at: "2026-07-20T08:30:00+00:00",
  is_active: true,
};

const profile = {
  student_id: STUDENT_ID,
  roll_number: "22BCS001",
  personal_email: "ananya@example.com",
  mobile_number: "9876543210",
  college: "Kumaraguru College of Technology",
  course: "B.E",
  department: "Computer Science and Engineering",
  current_year: 4,
  current_semester: 7,
  graduation_year: 2027,
  cgpa: 8.7,
  cgpa_scale: 10,
  cgpa_unavailable: false,
  active_backlogs: 0,
  cleared_backlogs: 1,
  sslc_percentage: 93.5,
  hsc_percentage: 91,
  diploma_percentage: null,
  academic_remarks: null,
  profile_status: "draft",
  profile_submitted_at: null,
  created_at: "2026-07-20T09:00:00+00:00",
  updated_at: "2026-07-23T09:00:00+00:00",
};

const preference = {
  student_id: STUDENT_ID,
  higher_studies_interest: "interested",
  preferred_study_area: "engineering",
  preferred_domain: "engineering_computing",
  study_pathway: "masters_degree",
  global_track_program: null,
  preferred_countries: ["Germany", "Ireland"],
  preferred_program_areas: ["Computer Science"],
  target_intake: "fall-2027",
  budget_range: "INR 20–30 lakh",
  scholarship_required: true,
  funding_required: false,
  funding_method: "self_funded",
  study_mode: "on_campus",
  academic_preference: "coursework",
  student_planning_stage: "shortlisting",
  created_at: "2026-07-20T09:00:00+00:00",
  updated_at: "2026-07-23T09:00:00+00:00",
};

const completion = {
  student_id: STUDENT_ID,
  profile_status: "draft",
  academic_section_complete: true,
  preferences_section_complete: true,
  test_scores_section_started: false,
  achievements_section_started: false,
  essential_fields_completed: 11,
  essential_fields_total: 11,
  overall_completion_percentage: 100,
  ready_for_counseling: true,
};

const consultation = {
  id: CONSULTATION_ID,
  student_id: STUDENT_ID,
  student_name: "Ananya Kumar",
  roll_number: "22BCS001",
  course: "B.E",
  department: "Computer Science and Engineering",
  assigned_counselor_id: null,
  status: "scheduled",
  consultation_date: "2026-08-03",
  slot_start: "14:00:00",
  slot_end: "14:30:00",
  submitted_at: "2026-07-23T09:00:00+00:00",
};

const testScore = {
  id: "33333333-3333-4333-8333-333333333333",
  student_id: STUDENT_ID,
  exam_name: "ielts",
  custom_exam_name: null,
  exam_status: "completed",
  attempt_number: 1,
  planned_date: "2026-05-01",
  completed_date: "2026-06-01",
  score: "8.0",
  valid_until: "2028-06-01",
  remarks: null,
  created_at: "2026-06-01T09:00:00+00:00",
  updated_at: "2026-06-01T09:00:00+00:00",
};

const achievement = {
  id: "44444444-4444-4444-8444-444444444444",
  student_id: STUDENT_ID,
  achievement_type: "project",
  title: "Research project",
  organization: "KCT",
  achievement_date: "2026-04-01",
  description: null,
  created_at: "2026-04-01T09:00:00+00:00",
  updated_at: "2026-04-01T09:00:00+00:00",
};

function validSections(
  overrides: Partial<Student360SectionResults> = {},
): Student360SectionResults {
  return {
    profile: { data: profile, error: null },
    preference: { data: preference, error: null },
    completion: { data: completion, error: null },
    testScores: { data: [], error: null, count: 0 },
    achievements: { data: [], error: null, count: 0 },
    consultations: { data: [consultation], error: null, count: 1 },
    ...overrides,
  };
}

function validSource(options?: {
  identityData?: unknown;
  sections?: Student360SectionResults;
  referenceData?: unknown;
  onIdentity?: (studentId: string) => void;
  onSections?: (studentId: string, from: number, to: number) => void;
  onReferences?: (ids: string[]) => void;
}): Student360DataSource {
  return {
    loadIdentity: async (studentId) => {
      options?.onIdentity?.(studentId);
      return {
        data:
          options && "identityData" in options
            ? options.identityData
            : identity,
        error: null,
      };
    },
    loadSections: async (studentId, from, to) => {
      options?.onSections?.(studentId, from, to);
      return options?.sections ?? validSections();
    },
    loadReferences: async (ids) => {
      options?.onReferences?.(ids);
      return {
        data:
          options && "referenceData" in options
            ? options.referenceData
            : [
                {
                  consultation_id: CONSULTATION_ID,
                  request_number: "KGEOC-2026-000001",
                },
              ],
        error: null,
      };
    },
  };
}

test("invalid route UUID fails before any data source call", async () => {
  let callCount = 0;
  const source = validSource({
    onIdentity: () => {
      callCount += 1;
    },
  });

  assert.deepEqual(
    await fetchCounselorStudentProfile("not-a-uuid", 1, source),
    { kind: "not_found" },
  );
  assert.equal(callCount, 0);
});

test("unknown or staff identity returns not found without detail queries", async () => {
  let sectionCalls = 0;
  const result = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource({
      identityData: null,
      onSections: () => {
        sectionCalls += 1;
      },
    }),
  );

  assert.deepEqual(result, { kind: "not_found" });
  assert.equal(sectionCalls, 0);
});

test("identity is validated and its trusted UUID keys every detail query", async () => {
  let identityArgument = "";
  let sectionArgument = "";
  let range: [number, number] = [-1, -1];
  const result = await fetchCounselorStudentProfile(
    STUDENT_ID,
    2,
    validSource({
      sections: validSections({
        consultations: { data: [], error: null, count: 1 },
      }),
      onIdentity: (studentId) => {
        identityArgument = studentId;
      },
      onSections: (studentId, from, to) => {
        sectionArgument = studentId;
        range = [from, to];
      },
    }),
  );

  assert.equal(identityArgument, STUDENT_ID);
  assert.equal(sectionArgument, STUDENT_ID);
  assert.deepEqual(range, [20, 39]);
  assert.deepEqual(result, { kind: "out_of_range", studentId: STUDENT_ID });
});

test("active, inactive, null-name, and blank-name identities remain viewable", async () => {
  for (const identityData of [
    identity,
    { ...identity, is_active: false },
    { ...identity, full_name: null },
    { ...identity, full_name: "   " },
  ]) {
    const result = await fetchCounselorStudentProfile(
      STUDENT_ID,
      1,
      validSource({ identityData }),
    );
    assert.equal(result.kind, "ready");
  }
});

test("no core profile produces an authoritative not-started view", async () => {
  const result = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource({
      sections: validSections({
        profile: { data: null, error: null },
        preference: { data: null, error: null },
        completion: { data: null, error: null },
      }),
    }),
  );

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.profileState, "profile_not_started");
  assert.equal(result.completionPercentage, 0);
});

test("missing preferences remains in progress while ready and submitted use completion view", async () => {
  const missingPreference = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource({
      sections: validSections({
        preference: { data: null, error: null },
        completion: {
          data: {
            ...completion,
            preferences_section_complete: false,
            essential_fields_completed: 8,
            overall_completion_percentage: 73,
            ready_for_counseling: false,
          },
          error: null,
        },
      }),
    }),
  );
  assert.equal(missingPreference.kind, "ready");
  if (missingPreference.kind !== "ready") return;
  assert.equal(missingPreference.preference, null);
  assert.equal(missingPreference.profileState, "profile_in_progress");

  const ready = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource(),
  );
  assert.equal(ready.kind, "ready");
  if (ready.kind !== "ready") return;
  assert.equal(ready.profileState, "ready_for_counseling");

  const submitted = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource({
      sections: validSections({
        profile: {
          data: {
            ...profile,
            profile_status: "submitted",
            profile_submitted_at: "2026-07-23T09:00:00+00:00",
          },
          error: null,
        },
        completion: {
          data: { ...completion, profile_status: "submitted" },
          error: null,
        },
      }),
    }),
  );
  assert.equal(submitted.kind, "ready");
  if (submitted.kind !== "ready") return;
  assert.equal(submitted.profileState, "submitted");
});

test("every malformed or cross-student detail response fails closed", async () => {
  const invalidSections: Student360SectionResults[] = [
    validSections({
      profile: {
        data: { ...profile, student_id: CONSULTATION_ID },
        error: null,
      },
    }),
    validSections({
      profile: { data: { ...profile, cgpa: 11 }, error: null },
    }),
    validSections({
      preference: {
        data: { ...preference, student_id: CONSULTATION_ID },
        error: null,
      },
    }),
    validSections({
      completion: {
        data: { ...completion, overall_completion_percentage: 101 },
        error: null,
      },
    }),
    validSections({
      completion: {
        data: { ...completion, essential_fields_total: 12 },
        error: null,
      },
    }),
    validSections({
      completion: {
        data: {
          ...completion,
          preferences_section_complete: false,
          ready_for_counseling: true,
        },
        error: null,
      },
    }),
    validSections({
      completion: {
        data: { ...completion, profile_status: "submitted" },
        error: null,
      },
    }),
    validSections({
      testScores: {
        data: [{ id: "not-a-uuid" }],
        error: null,
        count: 1,
      },
    }),
    validSections({
      testScores: {
        data: [{ ...testScore, student_id: CONSULTATION_ID }],
        error: null,
        count: 1,
      },
    }),
    validSections({
      achievements: {
        data: [{ id: "not-a-uuid" }],
        error: null,
        count: 1,
      },
    }),
    validSections({
      achievements: {
        data: [{ ...achievement, student_id: CONSULTATION_ID }],
        error: null,
        count: 1,
      },
    }),
    validSections({
      consultations: {
        data: [{ ...consultation, student_id: CONSULTATION_ID }],
        error: null,
        count: 1,
      },
    }),
    validSections({
      consultations: {
        data: [consultation, consultation],
        error: null,
        count: 2,
      },
    }),
  ];

  for (const sections of invalidSections) {
    const result = await fetchCounselorStudentProfile(
      STUDENT_ID,
      1,
      validSource({ sections }),
    );
    assert.deepEqual(result, { kind: "unavailable" });
  }
});

test("section errors and malformed identity never become empty profile data", async () => {
  const malformedIdentity = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource({ identityData: { ...identity, role: "student" } }),
  );
  assert.deepEqual(malformedIdentity, { kind: "unavailable" });

  const detailFailure = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource({
      sections: validSections({
        profile: { data: null, error: new Error("private detail") },
      }),
    }),
  );
  assert.deepEqual(detailFailure, { kind: "unavailable" });
});

test("unapplied D1 tables degrade only the two private sections", async () => {
  const result = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource(),
  );

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(result.consultations.length, 1);
  assert.equal(result.privateRecords.notes.kind, "unavailable");
  assert.equal(result.privateRecords.followUps.kind, "unavailable");
  assert.equal(result.privateRecords.consultationChoices, null);
});

test("malformed private paging and counselor options fail before queries", async () => {
  let identityCalls = 0;
  const result = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource({
      onIdentity: () => {
        identityCalls += 1;
      },
    }),
    {
      counselorId: "not-a-uuid",
      notePage: 0,
      followUpPage: 1,
      now: new Date("invalid"),
    },
  );

  assert.deepEqual(result, { kind: "unavailable" });
  assert.equal(identityCalls, 0);
});

test("zero consultations skips the reference RPC", async () => {
  let referenceCalls = 0;
  const result = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource({
      sections: validSections({
        consultations: { data: [], error: null, count: 0 },
      }),
      onReferences: () => {
        referenceCalls += 1;
      },
    }),
  );

  assert.equal(result.kind, "ready");
  assert.equal(referenceCalls, 0);
});

test("consultation page uses one bounded reference call and displays references", async () => {
  let referenceCalls = 0;
  let referenceIds: string[] = [];
  const result = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource({
      onReferences: (ids) => {
        referenceCalls += 1;
        referenceIds = ids;
      },
    }),
  );

  assert.equal(result.kind, "ready");
  if (result.kind !== "ready") return;
  assert.equal(referenceCalls, 1);
  assert.deepEqual(referenceIds, [CONSULTATION_ID]);
  assert.equal(
    result.consultations[0].request_number,
    "KGEOC-2026-000001",
  );
  assert.ok(referenceIds.length <= STUDENT_360_HISTORY_PAGE_SIZE);
});

test("missing, duplicate, unrelated, and malformed references fail safely", async () => {
  const invalidReferenceResults: unknown[] = [
    [],
    [
      {
        consultation_id: CONSULTATION_ID,
        request_number: "KGEOC-2026-000001",
      },
      {
        consultation_id: CONSULTATION_ID,
        request_number: "KGEOC-2026-000001",
      },
    ],
    [
      {
        consultation_id: STUDENT_ID,
        request_number: "KGEOC-2026-000001",
      },
    ],
    [
      {
        consultation_id: CONSULTATION_ID,
        request_number: "invalid",
      },
    ],
  ];

  for (const referenceData of invalidReferenceResults) {
    const result = await fetchCounselorStudentProfile(
      STUDENT_ID,
      1,
      validSource({ referenceData }),
    );
    assert.deepEqual(result, { kind: "unavailable" });
  }
});

test("valid exams and achievements are bounded and malformed records fail", async () => {
  const valid = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource({
      sections: validSections({
        testScores: { data: [testScore], error: null, count: 51 },
        achievements: { data: [achievement], error: null, count: 51 },
      }),
    }),
  );
  assert.equal(valid.kind, "ready");
  if (valid.kind !== "ready") return;
  assert.equal(valid.testScoreCount, 51);
  assert.equal(valid.achievementCount, 51);
  assert.ok(valid.testScores.length <= STUDENT_360_SECTION_LIMIT);
  assert.ok(valid.achievements.length <= STUDENT_360_SECTION_LIMIT);

  const malformed = await fetchCounselorStudentProfile(
    STUDENT_ID,
    1,
    validSource({
      sections: validSections({
        testScores: {
          data: [{ ...testScore, exam_status: "completed", completed_date: null }],
          error: null,
          count: 1,
        },
      }),
    }),
  );
  assert.deepEqual(malformed, { kind: "unavailable" });
});

test("legacy classification requires the exact status and null slot tuple", () => {
  assert.equal(
    isLegacyStudentConsultation({
      ...consultation,
      status: "waiting_for_assignment",
      consultation_date: null,
      slot_start: null,
      slot_end: null,
    }),
    true,
  );
  assert.equal(
    isLegacyStudentConsultation({
      ...consultation,
      status: "cancelled",
      consultation_date: null,
      slot_start: null,
      slot_end: null,
    }),
    false,
  );
});

test("history parsing, safe projection, and presentation mappings are stable", () => {
  assert.equal(parseStudent360HistoryPage(undefined), 1);
  assert.equal(parseStudent360HistoryPage(["1", "2"]), 1);
  assert.equal(parseStudent360HistoryPage("2"), 2);
  assert.equal(parseStudent360HistoryPage("100001"), 1);
  assert.doesNotMatch(
    STUDENT_360_CONSULTATION_COLUMNS,
    /request_number|outcome_recorded_by|outcome_recorded_at/,
  );
  assert.equal(
    getStudent360ProfileStateLabel("ready_for_counseling"),
    "Ready for counseling",
  );
  assert.equal(formatStudent360TargetIntake("fall-2027"), "Fall 2027");
  assert.equal(formatStudent360Boolean(null), "Not selected");
  assert.match(formatStudent360Date("2026-07-24"), /24 Jul 2026/);
});
