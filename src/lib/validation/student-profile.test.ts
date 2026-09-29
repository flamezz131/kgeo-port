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
      "@/lib/validation/full-name": "./full-name.ts",
    };
    const target = aliases[specifier];
    if (target) {
      return { shortCircuit: true, url: new URL(target, import.meta.url).href };
    }
    return nextResolve(specifier, context);
  },
});

const {
  validateStudentAcademics,
  validateStudentIdentity,
  validateStudentPreferences,
} = require("./student-profile.ts") as typeof import("./student-profile");

function validIdentityFormData() {
  const formData = new FormData();
  formData.set("fullName", "  Ananya   Kumar  ");
  formData.set("rollNumber", "22bcs001");
  formData.set("personalEmail", "STUDENT@EXAMPLE.COM");
  formData.set("mobileNumber", "9876543210");
  formData.set("college", "Kumaraguru College of Technology");
  formData.set("course", "B.E");
  formData.set("department", "Computer Science and Engineering");
  formData.set("currentYear", "4");
  formData.set("currentSemester", "7");
  formData.set("graduationYear", "2027");
  return formData;
}

function validAcademicsFormData() {
  const formData = new FormData();
  formData.set("cgpa", "8.45");
  formData.set("cgpaScale", "10");
  formData.set("activeBacklogs", "0");
  formData.set("clearedBacklogs", "1");
  formData.set("sslcPercentage", "91.25");
  formData.set("hscPercentage", "88.50");
  formData.set("diplomaPercentage", "");
  formData.set("academicRemarks", "Consistent academic progress");
  return formData;
}

function validPreferencesFormData() {
  const formData = new FormData();
  formData.set("higherStudiesInterest", "interested");
  formData.set("preferredStudyLevel", "masters");
  formData.append("preferredCountries", "Germany");
  formData.append("preferredCountries", "United States");
  formData.append("preferredProgramAreas", "Data Science");
  formData.set("targetSeason", "fall");
  formData.set("targetYear", "2027");
  formData.set("budgetRange", "INR 20-30 lakh");
  formData.set("scholarshipRequired", "true");
  formData.set("fundingRequired", "false");
  formData.set("studyMode", "full_time");
  formData.set("fundingMethod", "self_funded");
  formData.set("academicPreference", "coursework");
  formData.set("studentPlanningStage", "shortlisting");
  formData.set("sameAsUg", "true");
  return formData;
}

test("accepts a complete identity and normalizes name, roll number, and email", () => {
  const result = validateStudentIdentity(validIdentityFormData());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.fullName, "Ananya Kumar");
    assert.equal(result.data.rollNumber, "22BCS001");
    assert.equal(result.data.personalEmail, "student@example.com");
  }
});

test("rejects blank, oversized, and duplicate full names in the identity form", () => {
  const whitespace = validIdentityFormData();
  whitespace.set("fullName", "   ");
  assert.equal(validateStudentIdentity(whitespace).success, false);

  const oversized = validIdentityFormData();
  oversized.set("fullName", "A".repeat(151));
  assert.equal(validateStudentIdentity(oversized).success, false);

  const duplicate = validIdentityFormData();
  duplicate.append("fullName", "Injected Name");
  const result = validateStudentIdentity(duplicate);
  assert.equal(result.success, false);
  if (!result.success) {
    assert.deepEqual(result.errors.fullName, [
      "Submit exactly one value for this field.",
    ]);
  }
});

test("rejects malformed FormData file values", () => {
  const formData = validIdentityFormData();
  formData.set("rollNumber", new File(["22BCS001"], "roll-number.txt"));
  assert.equal(validateStudentIdentity(formData).success, false);
});

for (const [name, field, value] of [
  ["invalid mobile", "mobileNumber", "98765-43210"],
  ["invalid graduation year", "graduationYear", "2041"],
  ["inconsistent year and semester", "currentSemester", "3"],
  ["unknown college", "college", "Unknown College"],
  ["unknown course", "course", "Unknown Course"],
  ["department outside the selected course", "department", "Social Work"],
  ["whitespace-only roll number", "rollNumber", "   "],
] as const) {
  test(`rejects ${name}`, () => {
    const formData = validIdentityFormData();
    formData.set(field, value);
    assert.equal(validateStudentIdentity(formData).success, false);
  });
}

test("accepts valid four-point and ten-point CGPA values", () => {
  const fourPoint = validAcademicsFormData();
  fourPoint.set("cgpa", "3.75");
  fourPoint.set("cgpaScale", "4");
  assert.equal(validateStudentAcademics(fourPoint).success, true);
  assert.equal(validateStudentAcademics(validAcademicsFormData()).success, true);
});

test("preserves numeric zero and maps blank optional numbers to null", () => {
  const formData = validAcademicsFormData();
  formData.set("cgpa", "0");
  formData.set("activeBacklogs", "0");
  formData.set("clearedBacklogs", "0");
  formData.set("sslcPercentage", "0");
  formData.set("hscPercentage", "");
  formData.set("diplomaPercentage", "");
  const result = validateStudentAcademics(formData);

  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.cgpa, 0);
    assert.equal(result.data.activeBacklogs, 0);
    assert.equal(result.data.clearedBacklogs, 0);
    assert.equal(result.data.sslcPercentage, 0);
    assert.equal(result.data.hscPercentage, null);
    assert.equal(result.data.diplomaPercentage, null);
  }
});

test("rejects a blank CGPA under the current academic contract", () => {
  const formData = validAcademicsFormData();
  formData.set("cgpa", "");
  assert.equal(validateStudentAcademics(formData).success, false);
});

for (const [name, mutate] of [
  [
    "CGPA exceeding its scale",
    (formData: FormData) => {
      formData.set("cgpa", "4.25");
      formData.set("cgpaScale", "4");
    },
  ],
  [
    "negative backlogs",
    (formData: FormData) => formData.set("activeBacklogs", "-1"),
  ],
  [
    "percentage over 100",
    (formData: FormData) => formData.set("hscPercentage", "100.01"),
  ],
  [
    "overlong academic remarks",
    (formData: FormData) => formData.set("academicRemarks", "x".repeat(2001)),
  ],
] as const) {
  test(`rejects ${name}`, () => {
    const formData = validAcademicsFormData();
    mutate(formData);
    assert.equal(validateStudentAcademics(formData).success, false);
  });
}

test("accepts preferences and builds the validated target-intake format", () => {
  const result = validateStudentPreferences(validPreferencesFormData());
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.targetIntake, "fall-2027");
    assert.equal(result.data.scholarshipRequired, true);
    assert.equal(result.data.fundingRequired, false);
    assert.equal(result.data.preferredStudyLevel, "masters");
    assert.equal(result.data.globalTrackDuration, null);
    assert.equal(result.data.studyMode, "full_time");
    assert.equal(result.data.fundingMethod, "self_funded");
    assert.equal(result.data.sameAsUg, true);
    assert.deepEqual(result.data.domainSpecializations, []);
  }
});

test("accepts Global Track only with a valid duration", () => {
  const formData = validPreferencesFormData();
  formData.set("preferredStudyLevel", "global_track");
  formData.set("globalTrackDuration", "1_year_abroad");
  const result = validateStudentPreferences(formData);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.preferredStudyLevel, "global_track");
    assert.equal(result.data.globalTrackDuration, "1_year_abroad");
  }
});

test("rejects Global Track without a duration", () => {
  const formData = validPreferencesFormData();
  formData.set("preferredStudyLevel", "global_track");
  formData.set("globalTrackDuration", "");
  const result = validateStudentPreferences(formData);
  assert.equal(result.success, false);
});

test("leaves an undecided study level, study mode and funding method null", () => {
  const formData = validPreferencesFormData();
  formData.set("preferredStudyLevel", "");
  formData.set("studyMode", "");
  formData.set("fundingMethod", "");
  const result = validateStudentPreferences(formData);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.preferredStudyLevel, null);
    assert.equal(result.data.studyMode, null);
    assert.equal(result.data.fundingMethod, null);
  }
});

test("requires a domain specialization when exploring a different field", () => {
  const formData = validPreferencesFormData();
  formData.set("sameAsUg", "false");
  assert.equal(validateStudentPreferences(formData).success, false);

  formData.append("domainSpecializations", "Machine Learning");
  const result = validateStudentPreferences(formData);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.sameAsUg, false);
    assert.deepEqual(result.data.domainSpecializations, ["Machine Learning"]);
  }
});

test("handles undecided nullable booleans", () => {
  const formData = validPreferencesFormData();
  formData.set("scholarshipRequired", "");
  formData.delete("fundingRequired");
  const result = validateStudentPreferences(formData);
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data.scholarshipRequired, null);
    assert.equal(result.data.fundingRequired, null);
  }
});

test("clearing country and program tags produces empty arrays", () => {
  const formData = validPreferencesFormData();
  formData.delete("preferredCountries");
  formData.delete("preferredProgramAreas");
  const result = validateStudentPreferences(formData);
  assert.equal(result.success, true);
  if (result.success) {
    assert.deepEqual(result.data.preferredCountries, []);
    assert.deepEqual(result.data.preferredProgramAreas, []);
  }
});

test("rejects duplicate scalar FormData keys but permits array entries", () => {
  const identity = validIdentityFormData();
  identity.append("rollNumber", "22BCS002");
  const academics = validAcademicsFormData();
  academics.append("cgpaScale", "4");
  const preferences = validPreferencesFormData();
  preferences.append("fundingRequired", "true");

  assert.equal(validateStudentIdentity(identity).success, false);
  assert.equal(validateStudentAcademics(academics).success, false);
  assert.equal(validateStudentPreferences(preferences).success, false);
  assert.equal(
    validateStudentPreferences(validPreferencesFormData()).success,
    true,
  );
});

for (const [name, mutate] of [
  [
    "invalid enum value",
    (formData: FormData) => formData.set("preferredStudyLevel", "admin"),
  ],
  [
    "legacy On-campus study mode",
    (formData: FormData) => formData.set("studyMode", "on_campus"),
  ],
  [
    "funding method outside the catalogue",
    (formData: FormData) => formData.set("fundingMethod", "crowdfunding"),
  ],
  [
    "invalid Global Track duration",
    (formData: FormData) => {
      formData.set("preferredStudyLevel", "global_track");
      formData.set("globalTrackDuration", "5_years_abroad");
    },
  ],
  [
    "more than ten domain specializations",
    (formData: FormData) => {
      for (let index = 0; index < 11; index += 1) {
        formData.append("domainSpecializations", `Specialization ${index}`);
      }
    },
  ],
  [
    "duplicate countries regardless of case",
    (formData: FormData) => formData.append("preferredCountries", "germany"),
  ],
  [
    "duplicate program areas regardless of case",
    (formData: FormData) =>
      formData.append("preferredProgramAreas", "data science"),
  ],
  [
    "more than ten countries",
    (formData: FormData) => {
      formData.delete("preferredCountries");
      for (let index = 0; index < 11; index += 1) {
        formData.append("preferredCountries", `Country ${index}`);
      }
    },
  ],
  [
    "empty array item",
    (formData: FormData) => formData.append("preferredProgramAreas", "   "),
  ],
  [
    "target season without target year",
    (formData: FormData) => formData.set("targetYear", ""),
  ],
  [
    "invalid target intake season",
    (formData: FormData) => formData.set("targetSeason", "monsoon"),
  ],
] as const) {
  test(`rejects ${name}`, () => {
    const formData = validPreferencesFormData();
    mutate(formData);
    assert.equal(validateStudentPreferences(formData).success, false);
  });
}

test("ignores protected and unexpected fields in all profile sections", () => {
  const formDataSets = [
    validIdentityFormData(),
    validAcademicsFormData(),
    validPreferencesFormData(),
  ];
  for (const formData of formDataSets) {
    formData.set("student_id", "attacker-id");
    formData.set("role", "director");
    formData.set("college_email", "attacker@example.com");
    formData.set("is_active", "false");
    formData.set("profile_status", "submitted");
    formData.set("profile_submitted_at", "2000-01-01");
    formData.set("created_at", "2000-01-01");
    formData.set("updated_at", "2000-01-01");
  }

  const results = [
    validateStudentIdentity(formDataSets[0]),
    validateStudentAcademics(formDataSets[1]),
    validateStudentPreferences(formDataSets[2]),
  ];
  for (const result of results) {
    assert.equal(result.success, true);
    if (result.success) {
      for (const field of [
        "student_id",
        "role",
        "college_email",
        "is_active",
        "profile_status",
        "profile_submitted_at",
        "created_at",
        "updated_at",
      ]) {
        assert.equal(Object.hasOwn(result.data, field), false);
      }
    }
  }
});
