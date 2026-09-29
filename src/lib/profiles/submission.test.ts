import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import type {
  StudentIdentitySavePayload,
  StudentPreferenceInsertPayload,
  StudentPreferenceUpdatePayload,
  StudentProfileUpdatePayload,
} from "./submission";

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
      "@/lib/profiles/options": "./options.ts",
      "@/lib/validation/full-name": "../validation/full-name.ts",
      "@/lib/validation/student-profile": "../validation/student-profile.ts",
    };
    const target = aliases[specifier];
    if (target) {
      return { shortCircuit: true, url: new URL(target, import.meta.url).href };
    }
    return nextResolve(specifier, context);
  },
});

const {
  submitStudentAcademics,
  submitStudentIdentity,
  submitStudentPreferences,
} = require("./submission.ts") as typeof import("./submission");

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
  formData.set("student_id", "attacker-id");
  formData.set("role", "director");
  formData.set("college_email", "attacker@example.com");
  formData.set("is_active", "false");
  formData.set("profile_status", "submitted");
  formData.set("updated_at", "2000-01-01");
  return formData;
}

function validAcademicsFormData() {
  const formData = new FormData();
  formData.set("cgpa", "8.45");
  formData.set("cgpaScale", "10");
  formData.set("activeBacklogs", "0");
  formData.set("clearedBacklogs", "1");
  formData.set("sslcPercentage", "91.25");
  formData.set("hscPercentage", "88.5");
  formData.set("diplomaPercentage", "");
  formData.set("academicRemarks", "Consistent progress");
  return formData;
}

function validPreferencesFormData() {
  const formData = new FormData();
  formData.set("higherStudiesInterest", "interested");
  formData.set("preferredStudyLevel", "masters");
  formData.append("preferredCountries", "Germany");
  formData.append("preferredCountries", "United States");
  formData.append("preferredProgramAreas", "  MS Computer Science  ");
  formData.append("preferredProgramAreas", "MS Data Science");
  formData.set("sameAsUg", "true");
  formData.set("targetSeason", "fall");
  formData.set("targetYear", "2027");
  formData.set("budgetRange", "INR 20-30 lakh");
  formData.set("scholarshipRequired", "true");
  formData.set("fundingRequired", "false");
  formData.set("studyMode", "full_time");
  formData.set("fundingMethod", "self_funded");
  formData.set("academicPreference", "coursework");
  formData.set("studentPlanningStage", "shortlisting");
  formData.set("student_id", "attacker-id");
  formData.set("created_at", "2000-01-01");
  return formData;
}

const expectedIdentityPayload: StudentIdentitySavePayload = {
  p_full_name: "Ananya Kumar",
  p_roll_number: "22BCS001",
  p_personal_email: "student@example.com",
  p_mobile_number: "9876543210",
  p_college: "Kumaraguru College of Technology",
  p_course: "B.E",
  p_department: "Computer Science and Engineering",
  p_current_year: 4,
  p_current_semester: 7,
  p_graduation_year: 2027,
};

const expectedPreferencePayload: StudentPreferenceInsertPayload = {
  higher_studies_interest: "interested",
  preferred_study_level: "masters",
  preferred_countries: ["Germany", "United States"],
  preferred_program_areas: ["MS Computer Science", "MS Data Science"],
  preferred_courses: ["MS Computer Science", "MS Data Science"],
  target_intake: "fall-2027",
  budget_range: "INR 20-30 lakh",
  scholarship_required: true,
  funding_required: false,
  study_mode: "full_time",
  academic_preference: "coursework",
  student_planning_stage: "shortlisting",
  same_as_ug: true,
  domain_specializations: [],
  global_track_duration: null,
  funding_method: "self_funded",
};

test("saves the normalized name and approved identity fields in one call", async () => {
  let received: StudentIdentitySavePayload | null = null;
  let saveCalls = 0;
  const state = await submitStudentIdentity(validIdentityFormData(), {
    save: async (payload) => {
      saveCalls += 1;
      received = payload;
      return { error: null };
    },
  });

  assert.equal(state.status, "success");
  assert.deepEqual(received, expectedIdentityPayload);
  assert.equal(saveCalls, 1);
});

test("does not call persistence when the combined identity is invalid", async () => {
  const formData = validIdentityFormData();
  formData.set("fullName", "   ");
  let saveCalled = false;
  const state = await submitStudentIdentity(formData, {
    save: async () => {
      saveCalled = true;
      return { error: null };
    },
  });

  assert.equal(state.status, "error");
  assert.equal(saveCalled, false);
});

test("updates only approved academic fields and never inserts", async () => {
  let updated: StudentProfileUpdatePayload | null = null;
  const state = await submitStudentAcademics(validAcademicsFormData(), {
    findExisting: async () => ({ exists: true, error: null }),
    update: async (payload) => {
      updated = payload;
      return { error: null };
    },
  });

  assert.equal(state.status, "success");
  assert.deepEqual(updated, {
    cgpa: 8.45,
    cgpa_scale: 10,
    cgpa_unavailable: false,
    active_backlogs: 0,
    cleared_backlogs: 1,
    sslc_percentage: 91.25,
    hsc_percentage: 88.5,
    diploma_percentage: null,
    academic_remarks: "Consistent progress",
  });
});

test("academic save fails safely when its parent profile row is absent", async () => {
  let updateCalled = false;
  const state = await submitStudentAcademics(validAcademicsFormData(), {
    findExisting: async () => ({ exists: false, error: null }),
    update: async () => {
      updateCalled = true;
      return { error: null };
    },
  });

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /identity/i);
  assert.equal(updateCalled, false);
});

test("inserts exact preferences when absent and updates them when present", async () => {
  let inserted: StudentPreferenceInsertPayload | null = null;
  let updated: StudentPreferenceUpdatePayload | null = null;
  const insertState = await submitStudentPreferences(validPreferencesFormData(), {
    findProfile: async () => ({ exists: true, error: null }),
    findExisting: async () => ({ exists: false, error: null }),
    insert: async (payload) => {
      inserted = payload;
      return { error: null };
    },
    update: async () => ({ error: null }),
  });
  const updateState = await submitStudentPreferences(validPreferencesFormData(), {
    findProfile: async () => ({ exists: true, error: null }),
    findExisting: async () => ({ exists: true, error: null }),
    insert: async () => ({ error: null }),
    update: async (payload) => {
      updated = payload;
      return { error: null };
    },
  });

  assert.equal(insertState.status, "success");
  assert.equal(updateState.status, "success");
  assert.deepEqual(inserted, expectedPreferencePayload);
  assert.deepEqual(updated, expectedPreferencePayload);
});

test("field of study and domain specializations are optional and default safely", async () => {
  const formData = validPreferencesFormData();
  formData.delete("sameAsUg");
  // Assigned inside the store callback, so keep the declared type.
  let inserted = null as StudentPreferenceInsertPayload | null;
  const state = await submitStudentPreferences(formData, {
    findProfile: async () => ({ exists: true, error: null }),
    findExisting: async () => ({ exists: false, error: null }),
    insert: async (payload) => {
      inserted = payload;
      return { error: null };
    },
    update: async () => ({ error: null }),
  });

  assert.equal(state.status, "success");
  assert.deepEqual(inserted?.domain_specializations, []);
  assert.equal(inserted?.same_as_ug, null);
});

test("field of study accepts only true or false", async () => {
  for (const [value, expected] of [
    ["true", true],
    ["false", false],
  ] as const) {
    const formData = validPreferencesFormData();
    formData.set("sameAsUg", value);
    // Exploring a different field needs at least one specialization.
    formData.append("domainSpecializations", "Machine Learning");
    // Assigned inside the store callback, so keep the declared type.
    let inserted = null as StudentPreferenceInsertPayload | null;
    await submitStudentPreferences(formData, {
      findProfile: async () => ({ exists: true, error: null }),
      findExisting: async () => ({ exists: false, error: null }),
      insert: async (payload) => {
        inserted = payload;
        return { error: null };
      },
      update: async () => ({ error: null }),
    });
    assert.equal(inserted?.same_as_ug, expected);
  }

  const invalid = validPreferencesFormData();
  invalid.set("sameAsUg", "maybe");
  const state = await submitStudentPreferences(invalid, {
    findProfile: async () => ({ exists: true, error: null }),
    findExisting: async () => ({ exists: false, error: null }),
    insert: async () => ({ error: null }),
    update: async () => ({ error: null }),
  });
  assert.equal(state.status, "error");
  assert.ok(state.errors?.sameAsUg);
});

test("courses and domain specializations reject bad values", async () => {
  const store = {
    findProfile: async () => ({ exists: true, error: null }),
    findExisting: async () => ({ exists: false, error: null }),
    insert: async () => ({ error: null }),
    update: async () => ({ error: null }),
  };

  const duplicateCourse = validPreferencesFormData();
  duplicateCourse.append("preferredProgramAreas", "ms computer science");
  assert.ok(
    (await submitStudentPreferences(duplicateCourse, store)).errors
      ?.preferredProgramAreas,
  );

  const blankSpecialization = validPreferencesFormData();
  blankSpecialization.append("domainSpecializations", "   ");
  assert.ok(
    (await submitStudentPreferences(blankSpecialization, store)).errors
      ?.domainSpecializations,
  );

  const tooManySpecializations = validPreferencesFormData();
  for (let index = 0; index < 11; index += 1) {
    tooManySpecializations.append("domainSpecializations", `Spec ${index}`);
  }
  assert.ok(
    (await submitStudentPreferences(tooManySpecializations, store)).errors
      ?.domainSpecializations,
  );

  const differentFieldWithoutSpecialization = validPreferencesFormData();
  differentFieldWithoutSpecialization.set("sameAsUg", "false");
  assert.ok(
    (await submitStudentPreferences(differentFieldWithoutSpecialization, store))
      .errors?.domainSpecializations,
  );
});

test("preferences before identity fail without inserting or updating", async () => {
  let mutationCalled = false;
  const state = await submitStudentPreferences(validPreferencesFormData(), {
    findProfile: async () => ({ exists: false, error: null }),
    findExisting: async () => ({ exists: false, error: null }),
    insert: async () => {
      mutationCalled = true;
      return { error: null };
    },
    update: async () => {
      mutationCalled = true;
      return { error: null };
    },
  });

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /identity/i);
  assert.equal(mutationCalled, false);
});

test("all persistence payloads omit ownership, status, and timestamps", () => {
  for (const payload of [expectedIdentityPayload, expectedPreferencePayload]) {
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
      assert.equal(Object.hasOwn(payload, field), false);
    }
  }
});

test("returns safe generic and RLS errors without database details", async () => {
  const internalMessage = "private database policy and student details";
  const genericState = await submitStudentPreferences(validPreferencesFormData(), {
    findProfile: async () => ({ exists: true, error: null }),
    findExisting: async () => ({ exists: false, error: null }),
    insert: async () => ({ error: new Error(internalMessage) }),
    update: async () => ({ error: null }),
  });
  const authorizationState = await submitStudentIdentity(validIdentityFormData(), {
    save: async () => ({
      error: { code: "42501", message: internalMessage },
    }),
  });

  assert.equal(genericState.status, "error");
  assert.equal(genericState.message?.includes(internalMessage), false);
  assert.equal(authorizationState.status, "error");
  assert.equal(authorizationState.message?.includes(internalMessage), false);
  assert.match(authorizationState.message ?? "", /could not be saved/i);
});

test("sanitizes an atomic identity conflict without retrying a partial write", async () => {
  const internalMessage =
    "duplicate key violates student_profiles_pkey for private student-id";
  let saveCalls = 0;
  const state = await submitStudentIdentity(validIdentityFormData(), {
    save: async () => {
      saveCalls += 1;
      return {
        error: {
          code: "23505",
          constraint: "student_profiles_pkey",
          message: internalMessage,
        },
      };
    },
  });

  assert.equal(state.status, "error");
  assert.equal(saveCalls, 1);
  assert.match(state.message ?? "", /another session/i);
  assert.equal(state.message?.includes("23505"), false);
  assert.equal(state.message?.includes("student_profiles_pkey"), false);
  assert.equal(state.message?.includes(internalMessage), false);
});

test("maps the same-college roll conflict without exposing database details", async () => {
  const internalMessage =
    "duplicate key contains private college and student roll data";
  const state = await submitStudentIdentity(validIdentityFormData(), {
    save: async () => ({
      error: {
        code: "23505",
        constraint: "student_profiles_college_roll_number_key",
        message: internalMessage,
      },
    }),
  });

  assert.equal(state.status, "error");
  assert.match(state.message ?? "", /college and roll-number combination/i);
  assert.deepEqual(state.errors?.rollNumber, [
    "Check your college and roll number before saving.",
  ]);
  assert.equal(state.message?.includes(internalMessage), false);
});
