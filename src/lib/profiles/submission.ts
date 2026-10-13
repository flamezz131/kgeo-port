import type { Database } from "@/types/database";
import type { ProfileActionState } from "@/lib/profiles/types";
import { isSelectableGraduationYear } from "@/lib/profiles/options";
import {
  validateStudentAcademics,
  validateStudentIdentity,
  validateStudentPreferences,
} from "@/lib/validation/student-profile";

export type StudentProfileInsertPayload =
  Database["public"]["Tables"]["student_profiles"]["Insert"];
export type StudentProfileUpdatePayload =
  Database["public"]["Tables"]["student_profiles"]["Update"];
export type StudentPreferenceInsertPayload =
  Database["public"]["Tables"]["student_preferences"]["Insert"];
export type StudentPreferenceUpdatePayload =
  Database["public"]["Tables"]["student_preferences"]["Update"];

type ExistenceResult = { exists: boolean; error: unknown };
type MutationResult = { error: unknown };

export type StudentIdentitySavePayload =
  Database["public"]["Functions"]["save_student_identity"]["Args"];

export type StudentIdentityStore = {
  save: (payload: StudentIdentitySavePayload) => Promise<MutationResult>;
  // Returns the Student's currently stored graduation year, or null. Used
  // only so that an already-stored year outside the selectable range is not
  // lost when the Student edits other identity fields.
  loadStoredGraduationYear?: () => Promise<number | null>;
};

async function resolveStoredGraduationYear(
  formData: FormData,
  store: StudentIdentityStore,
): Promise<number | null> {
  if (!store.loadStoredGraduationYear) return null;

  const submitted = formData.get("graduationYear");
  if (
    typeof submitted !== "string" ||
    !/^\d+$/.test(submitted.trim()) ||
    isSelectableGraduationYear(Number(submitted.trim()))
  ) {
    return null;
  }

  try {
    const storedYear = await store.loadStoredGraduationYear();
    return typeof storedYear === "number" && Number.isInteger(storedYear)
      ? storedYear
      : null;
  } catch {
    // Fail closed: without a trusted stored value only the range is accepted.
    return null;
  }
}

export type ProfileSectionStore<InsertPayload, UpdatePayload> = {
  findExisting: () => Promise<ExistenceResult>;
  insert: (payload: InsertPayload) => Promise<MutationResult>;
  update: (payload: UpdatePayload) => Promise<MutationResult>;
};

export type ProfileUpdateStore<UpdatePayload> = {
  findExisting: () => Promise<ExistenceResult>;
  update: (payload: UpdatePayload) => Promise<MutationResult>;
};

export type PreferenceSectionStore<InsertPayload, UpdatePayload> =
  ProfileSectionStore<InsertPayload, UpdatePayload> & {
    findProfile: () => Promise<ExistenceResult>;
  };

function readErrorText(error: unknown, property: string) {
  if (
    (typeof error !== "object" || error === null) &&
    typeof error !== "function"
  ) {
    return "";
  }

  try {
    const value = Reflect.get(error, property);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function getSafeProfileDatabaseError(error: unknown): ProfileActionState {
  const code = readErrorText(error, "code");
  const constraint = readErrorText(error, "constraint");

  if (code === "23505" && constraint === "student_profiles_college_roll_number_key") {
    return {
      status: "error",
      message: "That college and roll-number combination is already in use.",
      errors: {
        rollNumber: ["Check your college and roll number before saving."],
      },
    };
  }

  if (code === "23505" || code === "40001") {
    return {
      status: "error",
      message:
        "This section was created in another session. Refresh the page and try again.",
    };
  }

  if (code === "42501") {
    return {
      status: "error",
      message: "Your profile could not be saved with this account.",
    };
  }

  return {
    status: "error",
    message: "We could not save this section. Please try again.",
  };
}

async function chooseInsertOrUpdate<InsertPayload, UpdatePayload>(
  store: ProfileSectionStore<InsertPayload, UpdatePayload>,
  insertPayload: InsertPayload,
  updatePayload: UpdatePayload,
): Promise<ProfileActionState | null> {
  try {
    const existence = await store.findExisting();
    if (existence.error) return getSafeProfileDatabaseError(existence.error);

    const mutation = existence.exists
      ? await store.update(updatePayload)
      : await store.insert(insertPayload);
    return mutation.error ? getSafeProfileDatabaseError(mutation.error) : null;
  } catch (error) {
    return getSafeProfileDatabaseError(error);
  }
}

export async function submitStudentIdentity(
  formData: FormData,
  store: StudentIdentityStore,
): Promise<ProfileActionState> {
  const validation = validateStudentIdentity(formData, {
    storedGraduationYear: await resolveStoredGraduationYear(formData, store),
  });
  if (!validation.success) {
    return {
      status: "error",
      message: "Check the highlighted identity fields and try again.",
      errors: validation.errors,
    };
  }

  const payload: StudentIdentitySavePayload = {
    p_full_name: validation.data.fullName,
    p_roll_number: validation.data.rollNumber,
    p_personal_email: validation.data.personalEmail,
    p_mobile_number: validation.data.mobileNumber,
    p_college: validation.data.college,
    p_course: validation.data.course,
    p_department: validation.data.department,
    p_current_year: validation.data.currentYear,
    p_current_semester: validation.data.currentSemester,
    p_graduation_year: validation.data.graduationYear,
  };

  try {
    const mutation = await store.save(payload);
    if (mutation.error) return getSafeProfileDatabaseError(mutation.error);
  } catch (error) {
    return getSafeProfileDatabaseError(error);
  }

  return {
    status: "success",
    message: "Personal and academic identity saved.",
    savedSection: "identity",
  };
}

export async function submitStudentAcademics(
  formData: FormData,
  store: ProfileUpdateStore<StudentProfileUpdatePayload>,
): Promise<ProfileActionState> {
  const validation = validateStudentAcademics(formData);
  if (!validation.success) {
    return {
      status: "error",
      message: "Check the highlighted academic fields and try again.",
      errors: validation.errors,
    };
  }

  const payload: StudentProfileUpdatePayload = {
    cgpa: validation.data.cgpa,
    cgpa_scale: validation.data.cgpaScale,
    cgpa_unavailable: false,
    active_backlogs: validation.data.activeBacklogs,
    cleared_backlogs: validation.data.clearedBacklogs,
    sslc_percentage: validation.data.sslcPercentage,
    hsc_percentage: validation.data.hscPercentage,
    diploma_percentage: validation.data.diplomaPercentage,
    academic_remarks: validation.data.academicRemarks,
  };

  try {
    const existence = await store.findExisting();
    if (existence.error) return getSafeProfileDatabaseError(existence.error);
    if (!existence.exists) {
      return {
        status: "error",
        message: "Save your personal and academic identity before this section.",
      };
    }

    const mutation = await store.update(payload);
    if (mutation.error) return getSafeProfileDatabaseError(mutation.error);
  } catch (error) {
    return getSafeProfileDatabaseError(error);
  }

  return {
    status: "success",
    message: "Academic Portfolio saved.",
    savedSection: "academics",
  };
}

export async function submitStudentPreferences(
  formData: FormData,
  store: PreferenceSectionStore<
    StudentPreferenceInsertPayload,
    StudentPreferenceUpdatePayload
  >,
): Promise<ProfileActionState> {
  const validation = validateStudentPreferences(formData);
  if (!validation.success) {
    return {
      status: "error",
      message: "Check the highlighted preference fields and try again.",
      errors: validation.errors,
    };
  }

  const payload: StudentPreferenceInsertPayload = {
    higher_studies_interest: validation.data.higherStudiesInterest,
    preferred_study_level: validation.data.preferredStudyLevel,
    preferred_countries: validation.data.preferredCountries,
    preferred_program_areas: validation.data.preferredProgramAreas,
    // The Preferences tab posts the chosen degree courses as program areas.
    // Mirror them into preferred_courses, which the PR intake pre-fills from.
    preferred_courses: validation.data.preferredProgramAreas,
    target_intake: validation.data.targetIntake,
    budget_range: validation.data.budgetRange,
    scholarship_required: validation.data.scholarshipRequired,
    funding_required: validation.data.fundingRequired,
    study_mode: validation.data.studyMode,
    academic_preference: validation.data.academicPreference,
    student_planning_stage: validation.data.studentPlanningStage,
    same_as_ug: validation.data.sameAsUg,
    domain_specializations: validation.data.domainSpecializations,
    global_track_duration: validation.data.globalTrackDuration,
    funding_method: validation.data.fundingMethod,
  };

  try {
    const profile = await store.findProfile();
    if (profile.error) return getSafeProfileDatabaseError(profile.error);
    if (!profile.exists) {
      return {
        status: "error",
        message:
          "Save your personal and academic identity before this section.",
      };
    }
  } catch (error) {
    return getSafeProfileDatabaseError(error);
  }

  const errorState = await chooseInsertOrUpdate(store, payload, payload);
  return (
    errorState ?? {
      status: "success",
      message: "Higher-studies preferences saved.",
      savedSection: "preferences",
    }
  );
}
