import { z } from "zod";
import {
  ACADEMIC_PREFERENCE_OPTIONS,
  GLOBAL_TRACK_DURATION_OPTIONS,
  HIGHER_STUDIES_INTEREST_PROFILE_OPTIONS,
  PREFERRED_STUDY_LEVEL_OPTIONS,
  STUDENT_FUNDING_METHOD_OPTIONS,
  STUDENT_PLANNING_STAGE_OPTIONS,
  STUDY_MODE_OPTIONS,
  TARGET_INTAKE_SEASONS,
  getGraduationYearRange,
  isProfileCollege,
  isSelectableGraduationYear,
} from "@/lib/profiles/options";
import {
  isCourse,
  isDepartmentForCourse,
} from "@/lib/consultations/options";
import {
  canonicalFullNameSchema,
  PROFILE_FULL_NAME_MAX_LENGTH,
} from "@/lib/validation/full-name";

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]> };

export { PROFILE_FULL_NAME_MAX_LENGTH };

function getDuplicateFieldErrors(
  formData: FormData,
  fields: readonly string[],
): Record<string, string[]> {
  const errors: Record<string, string[]> = {};
  for (const field of fields) {
    if (formData.getAll(field).length > 1) {
      errors[field] = ["Submit exactly one value for this field."];
    }
  }
  return errors;
}

function hasValidationErrors(errors: Record<string, string[]>) {
  return Object.keys(errors).length > 0;
}

function optionalInteger(minimum: number, maximum: number, message: string) {
  return z
    .union([z.string(), z.null()])
    .transform((value) => (value === null ? "" : value.trim()))
    .refine(
      (value) => value === "" || /^\d+$/.test(value),
      message,
    )
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) => value === null || (value >= minimum && value <= maximum),
      message,
    );
}

function requiredInteger(minimum: number, maximum: number, message: string) {
  return z
    .string({ error: message })
    .trim()
    .regex(/^\d+$/, message)
    .transform(Number)
    .refine((value) => value >= minimum && value <= maximum, message);
}

function optionalDecimal(message: string) {
  return z
    .union([z.string(), z.null()])
    .transform((value) => (value === null ? "" : value.trim()))
    .refine(
      (value) => value === "" || /^\d+(?:\.\d{1,2})?$/.test(value),
      message,
    )
    .transform((value) => (value === "" ? null : Number(value)));
}

function requiredDecimal(message: string) {
  return z
    .string({ error: message })
    .trim()
    .regex(/^\d+(?:\.\d{1,2})?$/, message)
    .transform(Number);
}

function optionalText(maximum: number, message: string) {
  return z
    .union([z.string(), z.null()])
    .transform((value) => (value === null ? "" : value.trim()))
    .refine((value) => value.length <= maximum, message)
    .transform((value) => (value === "" ? null : value));
}

function nullableBooleanValue() {
  return z
    .union([z.literal("true"), z.literal("false"), z.literal(""), z.null()])
    .transform((value) => {
      if (value === "true") return true;
      if (value === "false") return false;
      return null;
    });
}

function toValidationResult<T>(result: z.ZodSafeParseResult<T>): ValidationResult<T> {
  if (result.success) return { success: true, data: result.data };

  const flattened = z.flattenError(result.error).fieldErrors as Record<
    string,
    string[] | undefined
  >;
  const errors: Record<string, string[]> = {};
  for (const [field, messages] of Object.entries(flattened)) {
    if (messages?.length) errors[field] = messages;
  }
  return { success: false, errors };
}

export type GraduationYearValidationOptions = {
  // Defaults to the current calendar year at validation time.
  referenceYear?: number;
  // The Student's already-stored year, loaded by trusted server code. It
  // stays acceptable so an edit can never be forced to change it.
  storedGraduationYear?: number | null;
};

// The range is resolved on every parse, so it follows the calendar year even
// in a long-running server process.
function graduationYearField(options: GraduationYearValidationOptions) {
  return z
    .string({ error: "Choose a graduation year." })
    .trim()
    .regex(/^\d+$/, "Choose a valid graduation year.")
    .transform(Number)
    .superRefine((year, context) => {
      const referenceYear = options.referenceYear ?? new Date().getFullYear();
      if (
        isSelectableGraduationYear(
          year,
          referenceYear,
          options.storedGraduationYear ?? null,
        )
      ) {
        return;
      }
      const { minimum, maximum } = getGraduationYearRange(referenceYear);
      context.addIssue({
        code: "custom",
        message: `Choose a graduation year from ${minimum} to ${maximum}.`,
      });
    });
}

function buildStudentIdentitySchema(
  graduationYearOptions: GraduationYearValidationOptions = {},
) {
  return z
    .object({
      fullName: canonicalFullNameSchema,
      rollNumber: z
        .string({ error: "Enter your roll number." })
        .trim()
        .min(1, "Enter your roll number.")
        .max(50, "Roll number must not exceed 50 characters.")
        .transform((value) => value.toUpperCase()),
      personalEmail: z
        .string({ error: "Enter your personal email address." })
        .trim()
        .toLowerCase()
        .max(320, "Personal email must not exceed 320 characters.")
        .pipe(z.email("Enter a valid personal email address.")),
      mobileNumber: z
        .string({ error: "Enter your mobile number." })
        .trim()
        .regex(/^\d{10}$/, "Mobile number must contain exactly 10 digits."),
      college: z
        .string({ error: "Choose your college." })
        .trim()
        .refine(isProfileCollege, "Choose a supported college."),
      course: z
        .string({ error: "Choose your course." })
        .refine(isCourse, "Choose a valid course."),
      department: z
        .string({ error: "Choose your department." })
        .trim()
        .min(1, "Choose your department."),
      currentYear: optionalInteger(1, 4, "Choose a current year from 1 to 4."),
      currentSemester: optionalInteger(
        1,
        8,
        "Choose a current semester from 1 to 8.",
      ),
      graduationYear: graduationYearField(graduationYearOptions),
    })
    .strip()
    .superRefine((data, context) => {
      if (!isDepartmentForCourse(data.course, data.department)) {
        context.addIssue({
          code: "custom",
          path: ["department"],
          message: "Choose a department available for the selected course.",
        });
      }

      if (
        data.currentYear !== null &&
        data.currentSemester !== null &&
        (data.currentSemester < (data.currentYear - 1) * 2 + 1 ||
          data.currentSemester > data.currentYear * 2)
      ) {
        context.addIssue({
          code: "custom",
          path: ["currentSemester"],
          message: "Current semester must match the selected academic year.",
        });
      }
    });
}

export const studentIdentitySchema = buildStudentIdentitySchema();

export const studentAcademicsSchema = z
  .object({
    cgpa: requiredDecimal("Enter a CGPA with no more than two decimal places."),
    cgpaScale: z
      .enum(["4", "10"], { error: "Choose a CGPA scale of 4 or 10." })
      .transform(Number),
    activeBacklogs: requiredInteger(
      0,
      100,
      "Active backlogs must be between 0 and 100.",
    ),
    clearedBacklogs: requiredInteger(
      0,
      100,
      "Cleared backlogs must be between 0 and 100.",
    ),
    sslcPercentage: optionalDecimal(
      "SSLC percentage must use no more than two decimal places.",
    ),
    hscPercentage: optionalDecimal(
      "HSC percentage must use no more than two decimal places.",
    ),
    diplomaPercentage: optionalDecimal(
      "Diploma percentage must use no more than two decimal places.",
    ),
    academicRemarks: optionalText(
      2000,
      "Academic remarks must not exceed 2,000 characters.",
    ),
  })
  .strip()
  .superRefine((data, context) => {
    if (data.cgpa > data.cgpaScale) {
      context.addIssue({
        code: "custom",
        path: ["cgpa"],
        message: "CGPA cannot exceed the selected scale.",
      });
    }

    for (const [field, value, label] of [
      ["sslcPercentage", data.sslcPercentage, "SSLC percentage"],
      ["hscPercentage", data.hscPercentage, "HSC percentage"],
      ["diplomaPercentage", data.diplomaPercentage, "Diploma percentage"],
    ] as const) {
      if (value !== null && (value < 0 || value > 100)) {
        context.addIssue({
          code: "custom",
          path: [field],
          message: `${label} must be between 0 and 100.`,
        });
      }
    }
  });

const higherStudiesInterestValues =
  HIGHER_STUDIES_INTEREST_PROFILE_OPTIONS.map(({ value }) => value);
const preferredStudyLevelValues = PREFERRED_STUDY_LEVEL_OPTIONS.map(
  ({ value }) => value,
);
const studyModeValues = STUDY_MODE_OPTIONS.map(({ value }) => value);
const academicPreferenceValues = ACADEMIC_PREFERENCE_OPTIONS.map(
  ({ value }) => value,
);
const planningStageValues = STUDENT_PLANNING_STAGE_OPTIONS.map(
  ({ value }) => value,
);
const targetSeasonValues = TARGET_INTAKE_SEASONS.map(({ value }) => value);
const globalTrackDurationValues = GLOBAL_TRACK_DURATION_OPTIONS.map(({ value }) => value);
const fundingMethodValues = STUDENT_FUNDING_METHOD_OPTIONS.map(({ value }) => value);

const preferenceArrayItem = (maximum: number, label: string) =>
  z
    .string({ error: `${label} must be text.` })
    .trim()
    .min(1, `${label} cannot be empty.`)
    .max(maximum, `${label} is too long.`);

function addDuplicateIssues(
  values: string[],
  field: "preferredCountries" | "preferredProgramAreas",
  context: z.RefinementCtx,
) {
  const normalized = new Set<string>();
  for (const value of values) {
    const key = value.toLocaleLowerCase("en");
    if (normalized.has(key)) {
      context.addIssue({
        code: "custom",
        path: [field],
        message: "Remove duplicate values before saving.",
      });
      return;
    }
    normalized.add(key);
  }
}

export const studentPreferencesSchema = z
  .object({
    higherStudiesInterest: z.enum(higherStudiesInterestValues, {
      error: "Choose your higher-studies interest.",
    }),
    preferredStudyLevel: z
      .union([z.enum(preferredStudyLevelValues), z.literal(""), z.null()])
      .transform((value) => (value ? value : null)),
    preferredCountries: z
      .array(preferenceArrayItem(80, "Country"))
      .max(10, "Add no more than 10 countries."),
    preferredProgramAreas: z
      .array(preferenceArrayItem(120, "Program area"))
      .max(10, "Add no more than 10 program areas."),
    targetSeason: z.union([
      z.enum(targetSeasonValues),
      z.literal(""),
      z.null(),
    ]),
    targetYear: z
      .union([z.string(), z.null()])
      .transform((value) => (value === null ? "" : value.trim()))
      .refine(
        (value) => value === "" || /^20[2-9][0-9]$/.test(value),
        "Choose a valid target intake year.",
      ),
    budgetRange: optionalText(
      100,
      "Budget range must not exceed 100 characters.",
    ),
    scholarshipRequired: nullableBooleanValue(),
    fundingRequired: nullableBooleanValue(),
    studyMode: z
      .union([z.enum(studyModeValues), z.literal(""), z.null()])
      .transform((value) => (value ? value : null)),
    academicPreference: z
      .union([z.enum(academicPreferenceValues), z.literal(""), z.null()])
      .transform((value) => (value ? value : null)),
    studentPlanningStage: z
      .union([z.enum(planningStageValues), z.literal(""), z.null()])
      .transform((value) => (value ? value : null)),
    sameAsUg: nullableBooleanValue(),
    domainSpecializations: z
      .array(preferenceArrayItem(120, "Domain specialization"))
      .max(10, "Add no more than 10 specializations.")
      .default([]),
    globalTrackDuration: z
      .union([z.enum(globalTrackDurationValues), z.literal(""), z.null()])
      .transform((value) => (value ? value : null)),
    fundingMethod: z
      .union([z.enum(fundingMethodValues), z.literal(""), z.null()])
      .transform((value) => (value ? value : null)),
  })
  .strip()
  .superRefine((data, context) => {
    addDuplicateIssues(data.preferredCountries, "preferredCountries", context);
    addDuplicateIssues(
      data.preferredProgramAreas,
      "preferredProgramAreas",
      context,
    );

    if (
      (data.targetSeason && !data.targetYear) ||
      (!data.targetSeason && data.targetYear)
    ) {
      const message = "Provide both a season and a year.";
      if (!data.targetSeason) {
        context.addIssue({ code: "custom", path: ["targetSeason"], message });
      }
      if (!data.targetYear) {
        context.addIssue({ code: "custom", path: ["targetYear"], message });
      }
    }

    if (data.preferredStudyLevel === "global_track" && !data.globalTrackDuration) {
      context.addIssue({
        code: "custom",
        path: ["globalTrackDuration"],
        message: "Select a global track duration.",
      });
    }

    if (data.sameAsUg === false && data.domainSpecializations.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["domainSpecializations"],
        message: "Add at least one domain specialization.",
      });
    }
  })
  .transform((data) => ({
    higherStudiesInterest: data.higherStudiesInterest,
    preferredStudyLevel: data.preferredStudyLevel,
    preferredCountries: data.preferredCountries,
    preferredProgramAreas: data.preferredProgramAreas,
    targetIntake:
      data.targetSeason && data.targetYear
        ? `${data.targetSeason.toLowerCase()}-${data.targetYear}`
        : null,
    budgetRange: data.budgetRange,
    scholarshipRequired: data.scholarshipRequired,
    fundingRequired: data.fundingRequired,
    studyMode: data.studyMode,
    academicPreference: data.academicPreference,
    studentPlanningStage: data.studentPlanningStage,
    sameAsUg: data.sameAsUg,
    domainSpecializations: data.domainSpecializations,
    globalTrackDuration: data.globalTrackDuration,
    fundingMethod: data.fundingMethod,
  }));

export type StudentIdentityInput = z.infer<typeof studentIdentitySchema>;
export type StudentAcademicsInput = z.infer<typeof studentAcademicsSchema>;
export type StudentPreferencesInput = z.infer<typeof studentPreferencesSchema>;

export function validateStudentIdentity(
  formData: FormData,
  graduationYearOptions: GraduationYearValidationOptions = {},
): ValidationResult<StudentIdentityInput> {
  const duplicateErrors = getDuplicateFieldErrors(formData, [
    "fullName",
    "rollNumber",
    "personalEmail",
    "mobileNumber",
    "college",
    "course",
    "department",
    "currentYear",
    "currentSemester",
    "graduationYear",
  ]);
  if (hasValidationErrors(duplicateErrors)) {
    return { success: false, errors: duplicateErrors };
  }

  return toValidationResult(
    buildStudentIdentitySchema(graduationYearOptions).safeParse({
      fullName: formData.get("fullName"),
      rollNumber: formData.get("rollNumber"),
      personalEmail: formData.get("personalEmail"),
      mobileNumber: formData.get("mobileNumber"),
      college: formData.get("college"),
      course: formData.get("course"),
      department: formData.get("department"),
      currentYear: formData.get("currentYear"),
      currentSemester: formData.get("currentSemester"),
      graduationYear: formData.get("graduationYear"),
    }),
  );
}

export function validateStudentAcademics(
  formData: FormData,
): ValidationResult<StudentAcademicsInput> {
  const duplicateErrors = getDuplicateFieldErrors(formData, [
    "cgpa",
    "cgpaScale",
    "activeBacklogs",
    "clearedBacklogs",
    "sslcPercentage",
    "hscPercentage",
    "diplomaPercentage",
    "academicRemarks",
  ]);
  if (hasValidationErrors(duplicateErrors)) {
    return { success: false, errors: duplicateErrors };
  }

  return toValidationResult(
    studentAcademicsSchema.safeParse({
      cgpa: formData.get("cgpa"),
      cgpaScale: formData.get("cgpaScale"),
      activeBacklogs: formData.get("activeBacklogs"),
      clearedBacklogs: formData.get("clearedBacklogs"),
      sslcPercentage: formData.get("sslcPercentage"),
      hscPercentage: formData.get("hscPercentage"),
      diplomaPercentage: formData.get("diplomaPercentage"),
      academicRemarks: formData.get("academicRemarks"),
    }),
  );
}

export function validateStudentPreferences(
  formData: FormData,
): ValidationResult<StudentPreferencesInput> {
  const duplicateErrors = getDuplicateFieldErrors(formData, [
    "higherStudiesInterest",
    "preferredStudyLevel",
    "targetSeason",
    "targetYear",
    "budgetRange",
    "scholarshipRequired",
    "fundingRequired",
    "fundingMethod",
    "studyMode",
    "academicPreference",
    "studentPlanningStage",
    "sameAsUg",
    "globalTrackDuration",
  ]);
  if (hasValidationErrors(duplicateErrors)) {
    return { success: false, errors: duplicateErrors };
  }

  return toValidationResult(
    studentPreferencesSchema.safeParse({
      higherStudiesInterest: formData.get("higherStudiesInterest"),
      preferredStudyLevel: formData.get("preferredStudyLevel"),
      preferredCountries: formData.getAll("preferredCountries"),
      preferredProgramAreas: formData.getAll("preferredProgramAreas"),
      targetSeason: formData.get("targetSeason"),
      targetYear: formData.get("targetYear"),
      budgetRange: formData.get("budgetRange"),
      scholarshipRequired: formData.get("scholarshipRequired"),
      fundingRequired: formData.get("fundingRequired"),
      fundingMethod: formData.get("fundingMethod"),
      studyMode: formData.get("studyMode"),
      academicPreference: formData.get("academicPreference"),
      studentPlanningStage: formData.get("studentPlanningStage"),
      sameAsUg: formData.get("sameAsUg"),
      domainSpecializations: formData.getAll("domainSpecializations"),
      globalTrackDuration: formData.get("globalTrackDuration"),
    }),
  );
}
