import { z } from "zod";
import {
  APPLICATION_JOURNEY_REASON_LIMIT,
  APPLICATION_JOURNEY_REQUIREMENTS_LIMIT,
  UNIVERSITY_APPLICATION_DECISIONS,
  UNIVERSITY_APPLICATION_ENROLLMENT_STATUSES,
  UNIVERSITY_APPLICATION_FEE_STATUSES,
  UNIVERSITY_APPLICATION_OFFER_STATUSES,
  UNIVERSITY_APPLICATION_STUDENT_DECISIONS,
  UNIVERSITY_APPLICATION_VISA_STATUSES,
  normalizeApplicationJourneyText,
  parseCounselorApplicationJourney,
  type ApplicationJourneyActionState,
} from "@/lib/counselor/application-journey";
import type {
  UniversityApplicationDecision,
  UniversityApplicationEnrollmentStatus,
  UniversityApplicationFeeStatus,
  UniversityApplicationOfferStatus,
  UniversityApplicationStudentDecision,
  UniversityApplicationVisaStatus,
} from "@/types";

export type ApplicationJourneyInput = {
  studentId: string;
  applicationId: string;
  universityDecision: UniversityApplicationDecision;
  universityDecisionDate: string | null;
  offerStatus: UniversityApplicationOfferStatus;
  offerDate: string | null;
  conditionalOfferRequirements: string | null;
  conditionDueDate: string | null;
  conditionsSatisfiedDate: string | null;
  studentDecision: UniversityApplicationStudentDecision;
  studentDecisionDate: string | null;
  feeStatus: UniversityApplicationFeeStatus;
  feePaymentDate: string | null;
  visaStatus: UniversityApplicationVisaStatus;
  visaSubmissionDate: string | null;
  visaDecisionDate: string | null;
  enrollmentStatus: UniversityApplicationEnrollmentStatus;
  enrollmentDate: string | null;
  changeReason: string;
};

type ApplicationJourneyStore = {
  verifyTarget: (
    studentId: string,
    applicationId: string,
  ) => Promise<{ valid: boolean; error: unknown }>;
  save: (
    input: ApplicationJourneyInput,
  ) => Promise<{ data: unknown; error: unknown }>;
};

const allowedFields = new Set([
  "studentId",
  "applicationId",
  "universityDecision",
  "universityDecisionDate",
  "offerStatus",
  "offerDate",
  "conditionalOfferRequirements",
  "conditionDueDate",
  "conditionsSatisfiedDate",
  "studentDecision",
  "studentDecisionDate",
  "feeStatus",
  "feePaymentDate",
  "visaStatus",
  "visaSubmissionDate",
  "visaDecisionDate",
  "enrollmentStatus",
  "enrollmentDate",
  "changeReason",
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

function parseEnum<T extends readonly [string, ...string[]]>(
  value: string | null,
  values: T,
  field: string,
  errors: Record<string, string[]>,
): T[number] | null {
  const parsed = z.enum(values).safeParse(value);
  if (!parsed.success) {
    addError(errors, field, "Choose a valid status.");
    return null;
  }
  return parsed.data;
}

function parseOptionalDate(
  value: string | null,
  field: string,
  errors: Record<string, string[]>,
): string | null {
  if (value === null || value === "") return null;
  const parsed = z.iso.date().safeParse(value);
  if (!parsed.success) {
    addError(errors, field, "Enter a valid date.");
    return null;
  }
  return parsed.data;
}

function parseOptionalText(
  value: string | null,
  field: string,
  maximum: number,
  errors: Record<string, string[]>,
): string | null {
  if (value === null) return null;
  const normalized = normalizeApplicationJourneyText(value);
  if (!normalized) return null;
  if (normalized.length > maximum || /[\u0000-\u001f\u007f]/u.test(normalized)) {
    addError(errors, field, `Enter no more than ${maximum} plain-text characters.`);
    return null;
  }
  return normalized;
}

function parseRequiredText(
  value: string | null,
  field: string,
  maximum: number,
  errors: Record<string, string[]>,
): string | null {
  const normalized = parseOptionalText(value, field, maximum, errors);
  if (!normalized && !errors[field]) {
    addError(errors, field, "This field is required.");
  }
  return normalized;
}

export function validateApplicationJourneyFormData(
  formData: FormData,
):
  | { success: true; data: ApplicationJourneyInput }
  | { success: false; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  for (const field of new Set(formData.keys())) {
    if (!allowedFields.has(field) && !field.startsWith("$ACTION_")) {
      addError(errors, "_form", "The form contains an unsupported field.");
    }
  }

  const studentIdValue = exactlyOneString(formData, "studentId", errors);
  const applicationIdValue = exactlyOneString(
    formData,
    "applicationId",
    errors,
  );
  const studentId = z.uuid().safeParse(studentIdValue);
  const applicationId = z.uuid().safeParse(applicationIdValue);
  if (!studentId.success) addError(errors, "studentId", "Choose a valid Student.");
  if (!applicationId.success) {
    addError(errors, "applicationId", "Choose a valid application.");
  }

  const universityDecision = parseEnum(
    exactlyOneString(formData, "universityDecision", errors),
    UNIVERSITY_APPLICATION_DECISIONS,
    "universityDecision",
    errors,
  );
  const offerStatus = parseEnum(
    exactlyOneString(formData, "offerStatus", errors),
    UNIVERSITY_APPLICATION_OFFER_STATUSES,
    "offerStatus",
    errors,
  );
  const studentDecision = parseEnum(
    exactlyOneString(formData, "studentDecision", errors),
    UNIVERSITY_APPLICATION_STUDENT_DECISIONS,
    "studentDecision",
    errors,
  );
  const feeStatus = parseEnum(
    exactlyOneString(formData, "feeStatus", errors),
    UNIVERSITY_APPLICATION_FEE_STATUSES,
    "feeStatus",
    errors,
  );
  const visaStatus = parseEnum(
    exactlyOneString(formData, "visaStatus", errors),
    UNIVERSITY_APPLICATION_VISA_STATUSES,
    "visaStatus",
    errors,
  );
  const enrollmentStatus = parseEnum(
    exactlyOneString(formData, "enrollmentStatus", errors),
    UNIVERSITY_APPLICATION_ENROLLMENT_STATUSES,
    "enrollmentStatus",
    errors,
  );

  const universityDecisionDate = parseOptionalDate(
    exactlyOneString(formData, "universityDecisionDate", errors),
    "universityDecisionDate",
    errors,
  );
  const offerDate = parseOptionalDate(
    exactlyOneString(formData, "offerDate", errors),
    "offerDate",
    errors,
  );
  const conditionDueDate = parseOptionalDate(
    exactlyOneString(formData, "conditionDueDate", errors),
    "conditionDueDate",
    errors,
  );
  const conditionsSatisfiedDate = parseOptionalDate(
    exactlyOneString(formData, "conditionsSatisfiedDate", errors),
    "conditionsSatisfiedDate",
    errors,
  );
  const studentDecisionDate = parseOptionalDate(
    exactlyOneString(formData, "studentDecisionDate", errors),
    "studentDecisionDate",
    errors,
  );
  const feePaymentDate = parseOptionalDate(
    exactlyOneString(formData, "feePaymentDate", errors),
    "feePaymentDate",
    errors,
  );
  const visaSubmissionDate = parseOptionalDate(
    exactlyOneString(formData, "visaSubmissionDate", errors),
    "visaSubmissionDate",
    errors,
  );
  const visaDecisionDate = parseOptionalDate(
    exactlyOneString(formData, "visaDecisionDate", errors),
    "visaDecisionDate",
    errors,
  );
  const enrollmentDate = parseOptionalDate(
    exactlyOneString(formData, "enrollmentDate", errors),
    "enrollmentDate",
    errors,
  );
  const conditionalOfferRequirements = parseOptionalText(
    exactlyOneString(formData, "conditionalOfferRequirements", errors),
    "conditionalOfferRequirements",
    APPLICATION_JOURNEY_REQUIREMENTS_LIMIT,
    errors,
  );
  const changeReason = parseRequiredText(
    exactlyOneString(formData, "changeReason", errors),
    "changeReason",
    APPLICATION_JOURNEY_REASON_LIMIT,
    errors,
  );

  if (universityDecision === "pending" && universityDecisionDate) {
    addError(errors, "universityDecisionDate", "Leave this blank while the university decision is pending.");
  }
  if (offerStatus === "none" && (offerDate || conditionalOfferRequirements || conditionDueDate || conditionsSatisfiedDate)) {
    addError(errors, "offerStatus", "Offer details require a conditional or unconditional offer.");
  }
  if (universityDecision === "offer_received" && offerStatus === "none") {
    addError(errors, "offerStatus", "Classify the received offer as conditional or unconditional.");
  }
  if (offerStatus === "conditional" && !conditionalOfferRequirements) {
    addError(errors, "conditionalOfferRequirements", "Record the outstanding conditions for a conditional offer.");
  }
  if (offerStatus !== "none" && universityDecision !== "offer_received") {
    addError(errors, "universityDecision", "An offer requires the university decision Offer received.");
  }
  if (offerStatus === "unconditional" && conditionalOfferRequirements && !conditionsSatisfiedDate) {
    addError(errors, "conditionsSatisfiedDate", "Record when the retained conditional requirements were satisfied.");
  }
  if (!conditionalOfferRequirements && (conditionDueDate || conditionsSatisfiedDate)) {
    addError(errors, "conditionalOfferRequirements", "Condition dates require recorded offer conditions.");
  }
  if (studentDecision === "pending" && studentDecisionDate) {
    addError(errors, "studentDecisionDate", "Leave this blank while the Student decision is pending.");
  }
  if (studentDecision !== "pending" && offerStatus !== "unconditional") {
    addError(errors, "studentDecision", "Student acceptance or decline requires an unconditional offer.");
  }
  if (feeStatus === "paid" && !feePaymentDate) {
    addError(errors, "feePaymentDate", "Record the fee payment date.");
  }
  if (feeStatus !== "paid" && feePaymentDate) {
    addError(errors, "feePaymentDate", "A payment date is allowed only when the fee is paid.");
  }
  if (feeStatus !== "not_started" && studentDecision !== "accepted") {
    addError(errors, "feeStatus", "Fee tracking begins only after Student acceptance.");
  }
  if (visaStatus !== "not_started" && (studentDecision !== "accepted" || feeStatus !== "paid")) {
    addError(errors, "visaStatus", "Visa tracking begins after acceptance and fee payment.");
  }
  if ((visaStatus === "not_started" || visaStatus === "preparing") && (visaSubmissionDate || visaDecisionDate)) {
    addError(errors, "visaSubmissionDate", "Submission and decision dates do not match the selected visa status.");
  }
  if (visaStatus === "submitted" && (!visaSubmissionDate || visaDecisionDate)) {
    addError(errors, "visaSubmissionDate", "Submitted visa status requires only a submission date.");
  }
  if ((visaStatus === "approved" || visaStatus === "refused") && (!visaSubmissionDate || !visaDecisionDate)) {
    addError(errors, "visaDecisionDate", "A final visa status requires submission and decision dates.");
  }
  if (enrollmentStatus === "enrolled" && (visaStatus !== "approved" || !enrollmentDate)) {
    addError(errors, "enrollmentDate", "Enrollment requires an approved visa and enrollment date.");
  }
  if (enrollmentStatus === "not_enrolled" && enrollmentDate) {
    addError(errors, "enrollmentDate", "Leave this blank until enrollment is confirmed.");
  }

  if (
    Object.keys(errors).length > 0 ||
    !studentId.success ||
    !applicationId.success ||
    universityDecision === null ||
    offerStatus === null ||
    studentDecision === null ||
    feeStatus === null ||
    visaStatus === null ||
    enrollmentStatus === null ||
    changeReason === null
  ) {
    return { success: false, errors };
  }

  return {
    success: true,
    data: {
      studentId: studentId.data,
      applicationId: applicationId.data,
      universityDecision,
      universityDecisionDate,
      offerStatus,
      offerDate,
      conditionalOfferRequirements,
      conditionDueDate,
      conditionsSatisfiedDate,
      studentDecision,
      studentDecisionDate,
      feeStatus,
      feePaymentDate,
      visaStatus,
      visaSubmissionDate,
      visaDecisionDate,
      enrollmentStatus,
      enrollmentDate,
      changeReason,
    },
  };
}

export async function submitApplicationJourney(
  formData: FormData,
  store: ApplicationJourneyStore,
): Promise<ApplicationJourneyActionState> {
  const parsed = validateApplicationJourneyFormData(formData);
  if (!parsed.success) {
    return {
      status: "error",
      message: "Check the highlighted Application Journey fields.",
      errors: parsed.errors,
    };
  }

  const target = await store.verifyTarget(
    parsed.data.studentId,
    parsed.data.applicationId,
  );
  if (!target.valid || target.error) {
    return {
      status: "error",
      message: "This application is no longer available to your account.",
    };
  }

  const saved = await store.save(parsed.data);
  if (
    saved.error ||
    parseCounselorApplicationJourney(
      saved.data,
      parsed.data.applicationId,
    ) === null
  ) {
    return {
      status: "error",
      message: "We could not update the Application Journey. Please try again.",
    };
  }

  return {
    status: "success",
    message: "Application Journey updated and added to audit history.",
  };
}
