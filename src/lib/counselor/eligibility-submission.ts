import { z } from "zod";
import {
  ELIGIBILITY_COUNTRY_LIMIT,
  ELIGIBILITY_COUNTRY_MAX_LENGTH,
  ELIGIBILITY_INTAKE_MAX_LENGTH,
  ELIGIBILITY_SUMMARY_MAX_LENGTH,
  STUDENT_ELIGIBILITY_ACADEMIC_STATUSES,
  STUDENT_ELIGIBILITY_APPLICATION_READINESS,
  STUDENT_ELIGIBILITY_APTITUDE_READINESS,
  STUDENT_ELIGIBILITY_BACKLOG_STATUSES,
  STUDENT_ELIGIBILITY_ENGLISH_READINESS,
  STUDENT_ELIGIBILITY_PROFILE_STRENGTHS,
  STUDENT_ELIGIBILITY_STATUSES,
  normalizeEligibilityCountries,
  normalizeEligibilityText,
  parseEligibilityTimestamp,
} from "@/lib/counselor/eligibility";
import type {
  StudentEligibilityAcademicStatus,
  StudentEligibilityApplicationReadiness,
  StudentEligibilityAptitudeReadiness,
  StudentEligibilityBacklogStatus,
  StudentEligibilityEnglishReadiness,
  StudentEligibilityProfileStrength,
  StudentEligibilityStatus,
} from "@/types";

export type EligibilityAssessmentActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string[]>;
};

export const initialEligibilityAssessmentActionState: EligibilityAssessmentActionState =
  { status: "idle" };

export type EligibilityAssessmentInput = {
  studentId: string;
  overallStatus: StudentEligibilityStatus;
  academicStatus: StudentEligibilityAcademicStatus;
  backlogStatus: StudentEligibilityBacklogStatus;
  englishReadiness: StudentEligibilityEnglishReadiness;
  aptitudeReadiness: StudentEligibilityAptitudeReadiness;
  profileStrength: StudentEligibilityProfileStrength;
  applicationReadiness: StudentEligibilityApplicationReadiness;
  recommendedCountries: string[];
  recommendedIntake: string | null;
  assessmentSummary: string;
};

type EligibilityAssessmentStore = {
  verifyTarget: (
    studentId: string,
  ) => Promise<{ valid: boolean; error: unknown }>;
  save: (
    input: EligibilityAssessmentInput,
  ) => Promise<{ data: unknown; error: unknown }>;
};

const allowedFields = new Set([
  "studentId",
  "overallStatus",
  "academicStatus",
  "backlogStatus",
  "englishReadiness",
  "aptitudeReadiness",
  "profileStrength",
  "applicationReadiness",
  "recommendedCountries",
  "recommendedIntake",
  "assessmentSummary",
]);

function addError(
  errors: Record<string, string[]>,
  field: string,
  message: string,
) {
  if (!errors[field]) errors[field] = [message];
}

function exactlyOneString(
  formData: FormData,
  field: string,
  errors: Record<string, string[]>,
): string | null {
  const values = formData.getAll(field);
  if (values.length !== 1 || typeof values[0] !== "string") {
    addError(errors, field, "Submit exactly one value for this field.");
    return null;
  }
  return values[0];
}

export function validateEligibilityAssessmentFormData(
  formData: FormData,
):
  | { success: true; data: EligibilityAssessmentInput }
  | { success: false; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  for (const field of new Set(formData.keys())) {
    if (!allowedFields.has(field) && !field.startsWith("$ACTION_")) {
      addError(errors, "_form", "The form contains an unsupported field.");
    }
  }

  const studentId = exactlyOneString(formData, "studentId", errors);
  const overallStatus = exactlyOneString(formData, "overallStatus", errors);
  const academicStatus = exactlyOneString(formData, "academicStatus", errors);
  const backlogStatus = exactlyOneString(formData, "backlogStatus", errors);
  const englishReadiness = exactlyOneString(
    formData,
    "englishReadiness",
    errors,
  );
  const aptitudeReadiness = exactlyOneString(
    formData,
    "aptitudeReadiness",
    errors,
  );
  const profileStrength = exactlyOneString(
    formData,
    "profileStrength",
    errors,
  );
  const applicationReadiness = exactlyOneString(
    formData,
    "applicationReadiness",
    errors,
  );
  const countriesValue = exactlyOneString(
    formData,
    "recommendedCountries",
    errors,
  );
  const intakeValue = exactlyOneString(
    formData,
    "recommendedIntake",
    errors,
  );
  const summaryValue = exactlyOneString(
    formData,
    "assessmentSummary",
    errors,
  );

  const studentIdResult = z.uuid().safeParse(studentId);
  const overallResult = z.enum(STUDENT_ELIGIBILITY_STATUSES).safeParse(overallStatus);
  const academicResult = z
    .enum(STUDENT_ELIGIBILITY_ACADEMIC_STATUSES)
    .safeParse(academicStatus);
  const backlogResult = z
    .enum(STUDENT_ELIGIBILITY_BACKLOG_STATUSES)
    .safeParse(backlogStatus);
  const englishResult = z
    .enum(STUDENT_ELIGIBILITY_ENGLISH_READINESS)
    .safeParse(englishReadiness);
  const aptitudeResult = z
    .enum(STUDENT_ELIGIBILITY_APTITUDE_READINESS)
    .safeParse(aptitudeReadiness);
  const profileResult = z
    .enum(STUDENT_ELIGIBILITY_PROFILE_STRENGTHS)
    .safeParse(profileStrength);
  const applicationResult = z
    .enum(STUDENT_ELIGIBILITY_APPLICATION_READINESS)
    .safeParse(applicationReadiness);

  if (!studentIdResult.success) addError(errors, "studentId", "Choose a valid Student.");
  if (!overallResult.success) addError(errors, "overallStatus", "Choose a valid overall status.");
  if (!academicResult.success) addError(errors, "academicStatus", "Choose a valid academic status.");
  if (!backlogResult.success) addError(errors, "backlogStatus", "Choose a valid backlog assessment.");
  if (!englishResult.success) addError(errors, "englishReadiness", "Choose valid English test readiness.");
  if (!aptitudeResult.success) addError(errors, "aptitudeReadiness", "Choose valid GRE / GMAT readiness.");
  if (!profileResult.success) addError(errors, "profileStrength", "Choose a valid profile strength.");
  if (!applicationResult.success) addError(errors, "applicationReadiness", "Choose valid application readiness.");

  let recommendedCountries: string[] = [];
  if (typeof countriesValue === "string") {
    if (/[\u0000-\u001f\u007f]/.test(countriesValue)) {
      addError(errors, "recommendedCountries", "Recommended countries contain unsupported characters.");
    } else {
      recommendedCountries = normalizeEligibilityCountries(countriesValue);
      const unique = new Set(
        recommendedCountries.map((country) => country.toLocaleLowerCase("en")),
      );
      if (
        recommendedCountries.length > ELIGIBILITY_COUNTRY_LIMIT ||
        recommendedCountries.some(
          (country) =>
            country.length === 0 ||
            country.length > ELIGIBILITY_COUNTRY_MAX_LENGTH,
        ) ||
        unique.size !== recommendedCountries.length
      ) {
        addError(
          errors,
          "recommendedCountries",
          "Enter up to 10 distinct country names separated by commas.",
        );
      }
    }
  }

  let recommendedIntake: string | null = null;
  if (typeof intakeValue === "string") {
    if (/[\u0000-\u001f\u007f]/.test(intakeValue)) {
      addError(errors, "recommendedIntake", "Recommended intake contains unsupported characters.");
    } else {
      const normalized = normalizeEligibilityText(intakeValue);
      if (normalized.length > ELIGIBILITY_INTAKE_MAX_LENGTH) {
        addError(errors, "recommendedIntake", "Use 40 characters or fewer.");
      } else {
        recommendedIntake = normalized === "" ? null : normalized;
      }
    }
  }

  let assessmentSummary = "";
  if (typeof summaryValue === "string") {
    if (/[\u0000-\u001f\u007f]/.test(summaryValue)) {
      addError(errors, "assessmentSummary", "Assessment summary contains unsupported characters.");
    } else {
      assessmentSummary = normalizeEligibilityText(summaryValue);
      if (
        assessmentSummary.length < 1 ||
        assessmentSummary.length > ELIGIBILITY_SUMMARY_MAX_LENGTH
      ) {
        addError(errors, "assessmentSummary", "Enter a summary of 1,500 characters or fewer.");
      }
    }
  }

  if (
    Object.keys(errors).length > 0 ||
    !studentIdResult.success ||
    !overallResult.success ||
    !academicResult.success ||
    !backlogResult.success ||
    !englishResult.success ||
    !aptitudeResult.success ||
    !profileResult.success ||
    !applicationResult.success
  ) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      studentId: studentIdResult.data,
      overallStatus: overallResult.data,
      academicStatus: academicResult.data,
      backlogStatus: backlogResult.data,
      englishReadiness: englishResult.data,
      aptitudeReadiness: aptitudeResult.data,
      profileStrength: profileResult.data,
      applicationReadiness: applicationResult.data,
      recommendedCountries,
      recommendedIntake,
      assessmentSummary,
    },
  };
}

function readErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  try {
    const code = Reflect.get(error, "code");
    return typeof code === "string" ? code : "";
  } catch {
    return "";
  }
}

export async function submitEligibilityAssessment(
  formData: FormData,
  store: EligibilityAssessmentStore,
): Promise<EligibilityAssessmentActionState> {
  const validation = validateEligibilityAssessmentFormData(formData);
  if (!validation.success) {
    return {
      status: "error",
      message: "Review the highlighted assessment fields.",
      errors: validation.errors,
    };
  }

  const ownership = await store.verifyTarget(validation.data.studentId);
  if (!ownership.valid || ownership.error) {
    return {
      status: "error",
      message: "Eligibility Assessment could not be saved.",
    };
  }

  const saved = await store.save(validation.data);
  if (saved.error) {
    const code = readErrorCode(saved.error);
    return {
      status: "error",
      message:
        code === "42501"
          ? "You are no longer the current Primary Counselor for this Student."
          : code === "22023" || code === "23514"
            ? "The assessment is no longer valid. Review it and try again."
            : "Eligibility Assessment could not be saved.",
    };
  }

  const result = z
    .array(
      z
        .object({
          assessment_id: z.uuid(),
          assessed_at: z.string().refine(
            (value) => parseEligibilityTimestamp(value) !== null,
          ),
        })
        .strict(),
    )
    .length(1)
    .safeParse(saved.data);
  if (!result.success) {
    return {
      status: "error",
      message: "Eligibility Assessment could not be confirmed.",
    };
  }

  return {
    status: "success",
    message: "Eligibility Assessment saved as a new history revision.",
  };
}
