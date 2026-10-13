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
    if (specifier === "@/lib/counselor/application-journey") {
      return {
        shortCircuit: true,
        url: new URL("./application-journey.ts", import.meta.url).href,
      };
    }
    return nextResolve(specifier, context);
  },
});

const {
  parseCounselorApplicationJourney,
  parseCounselorApplicationJourneyHistory,
  parseStudentApplicationJourneys,
} = require("./application-journey.ts") as typeof import("./application-journey");
const {
  submitApplicationJourney,
  validateApplicationJourneyFormData,
} = require("./application-journey-submission.ts") as typeof import("./application-journey-submission");

const studentId = "11111111-1111-4111-8111-111111111111";
const applicationId = "22222222-2222-4222-8222-222222222222";
const eventId = "33333333-3333-4333-8333-333333333333";

const completeJourney = {
  application_id: applicationId,
  university_decision: "offer_received",
  university_decision_date: "2026-08-01",
  offer_status: "unconditional",
  offer_date: "2026-08-01",
  conditional_offer_requirements: "Submit final transcript",
  condition_due_date: "2026-08-10",
  conditions_satisfied_date: "2026-08-08",
  student_decision: "accepted",
  student_decision_date: "2026-08-09",
  fee_status: "paid",
  fee_payment_date: "2026-08-10",
  visa_status: "approved",
  visa_submission_date: "2026-08-12",
  visa_decision_date: "2026-08-20",
  enrollment_status: "enrolled",
  enrollment_date: "2026-08-24",
  updated_at: "2026-08-24T10:00:00+05:30",
} as const;

function validForm(): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries({
    studentId,
    applicationId,
    universityDecision: "offer_received",
    universityDecisionDate: "2026-08-01",
    offerStatus: "unconditional",
    offerDate: "2026-08-01",
    conditionalOfferRequirements: "  Submit   final transcript ",
    conditionDueDate: "2026-08-10",
    conditionsSatisfiedDate: "2026-08-08",
    studentDecision: "accepted",
    studentDecisionDate: "2026-08-09",
    feeStatus: "paid",
    feePaymentDate: "2026-08-10",
    visaStatus: "approved",
    visaSubmissionDate: "2026-08-12",
    visaDecisionDate: "2026-08-20",
    enrollmentStatus: "enrolled",
    enrollmentDate: "2026-08-24",
    changeReason: "  Confirmed   from university records ",
  })) {
    form.set(key, value);
  }
  return form;
}

test("separated complete Journey projection parses without conflating domains", () => {
  const parsed = parseCounselorApplicationJourney(
    [{ ...completeJourney, version_number: 3 }],
    applicationId,
  );
  assert.ok(parsed);
  assert.equal(parsed.offer_status, "unconditional");
  assert.equal(parsed.student_decision, "accepted");
  assert.equal(parsed.fee_status, "paid");
  assert.equal(parsed.visa_status, "approved");
});

test("legacy default projection remains readable at version zero", () => {
  const parsed = parseCounselorApplicationJourney(
    [
      {
        application_id: applicationId,
        university_decision: "pending",
        university_decision_date: null,
        offer_status: "none",
        offer_date: null,
        conditional_offer_requirements: null,
        condition_due_date: null,
        conditions_satisfied_date: null,
        student_decision: "pending",
        student_decision_date: null,
        fee_status: "not_started",
        fee_payment_date: null,
        visa_status: "not_started",
        visa_submission_date: null,
        visa_decision_date: null,
        enrollment_status: "not_enrolled",
        enrollment_date: null,
        version_number: 0,
        updated_at: null,
      },
    ],
    applicationId,
  );
  assert.equal(parsed?.version_number, 0);
});

test("Student safe parser rejects private audit and Counselor fields", () => {
  assert.equal(
    parseStudentApplicationJourneys([
      { ...completeJourney, change_reason: "Internal reason" },
    ]),
    null,
  );
  assert.equal(
    parseStudentApplicationJourneys([
      { ...completeJourney, counselor_note: "Private observation" },
    ]),
    null,
  );
  assert.ok(parseStudentApplicationJourneys([completeJourney]));
});

test("history is strict newest-first and excludes actor identifiers", () => {
  const {
    application_id: _applicationId,
    updated_at: _updatedAt,
    ...historyState
  } = completeJourney;
  void _applicationId;
  void _updatedAt;
  const event = {
    ...historyState,
    event_id: eventId,
    version_number: 2,
    change_reason: "Offer and visa state confirmed",
    changed_at: "2026-08-24T10:00:00+05:30",
  };
  const older = {
    ...event,
    event_id: "44444444-4444-4444-8444-444444444444",
    version_number: 1,
    changed_at: "2026-08-20T10:00:00+05:30",
  };
  assert.equal(parseCounselorApplicationJourneyHistory([event, older])?.length, 2);
  assert.equal(parseCounselorApplicationJourneyHistory([older, event]), null);
  assert.equal(
    parseCounselorApplicationJourneyHistory([
      { ...event, changed_by: studentId },
    ]),
    null,
  );
});

test("valid form normalizes audit and conditional-offer text", () => {
  const parsed = validateApplicationJourneyFormData(validForm());
  assert.equal(parsed.success, true);
  if (!parsed.success) return;
  assert.equal(parsed.data.conditionalOfferRequirements, "Submit final transcript");
  assert.equal(parsed.data.changeReason, "Confirmed from university records");
});

test("conditional and unconditional offers remain distinct from Student decision", () => {
  const conditional = validForm();
  conditional.set("offerStatus", "conditional");
  conditional.set("studentDecision", "pending");
  conditional.set("studentDecisionDate", "");
  conditional.set("feeStatus", "not_started");
  conditional.set("feePaymentDate", "");
  conditional.set("visaStatus", "not_started");
  conditional.set("visaSubmissionDate", "");
  conditional.set("visaDecisionDate", "");
  conditional.set("enrollmentStatus", "not_enrolled");
  conditional.set("enrollmentDate", "");
  assert.equal(validateApplicationJourneyFormData(conditional).success, true);

  conditional.set("studentDecision", "accepted");
  assert.equal(validateApplicationJourneyFormData(conditional).success, false);
});

test("an offer-received decision requires an explicit offer classification", () => {
  const unclassifiedOffer = validForm();
  unclassifiedOffer.set("offerStatus", "none");
  unclassifiedOffer.set("offerDate", "");
  unclassifiedOffer.set("conditionalOfferRequirements", "");
  unclassifiedOffer.set("conditionDueDate", "");
  unclassifiedOffer.set("conditionsSatisfiedDate", "");
  unclassifiedOffer.set("studentDecision", "pending");
  unclassifiedOffer.set("studentDecisionDate", "");
  unclassifiedOffer.set("feeStatus", "not_started");
  unclassifiedOffer.set("feePaymentDate", "");
  unclassifiedOffer.set("visaStatus", "not_started");
  unclassifiedOffer.set("visaSubmissionDate", "");
  unclassifiedOffer.set("visaDecisionDate", "");
  unclassifiedOffer.set("enrollmentStatus", "not_enrolled");
  unclassifiedOffer.set("enrollmentDate", "");

  assert.equal(
    validateApplicationJourneyFormData(unclassifiedOffer).success,
    false,
  );
});

test("fee visa and enrollment consistency fails closed independently", () => {
  const feeWithoutAcceptance = validForm();
  feeWithoutAcceptance.set("studentDecision", "pending");
  feeWithoutAcceptance.set("studentDecisionDate", "");
  assert.equal(validateApplicationJourneyFormData(feeWithoutAcceptance).success, false);

  const visaWithoutFee = validForm();
  visaWithoutFee.set("feeStatus", "pending");
  visaWithoutFee.set("feePaymentDate", "");
  assert.equal(validateApplicationJourneyFormData(visaWithoutFee).success, false);

  const enrollmentWithoutApproval = validForm();
  enrollmentWithoutApproval.set("visaStatus", "submitted");
  enrollmentWithoutApproval.set("visaDecisionDate", "");
  assert.equal(validateApplicationJourneyFormData(enrollmentWithoutApproval).success, false);
});

test("submission rechecks ownership before the trusted mutation", async () => {
  const calls: string[] = [];
  const result = await submitApplicationJourney(validForm(), {
    verifyTarget: async () => {
      calls.push("verify");
      return { valid: true, error: null };
    },
    save: async () => {
      calls.push("save");
      return {
        data: [{ ...completeJourney, version_number: 1 }],
        error: null,
      };
    },
  });
  assert.equal(result.status, "success");
  assert.deepEqual(calls, ["verify", "save"]);
});

test("covering or former Counselor denial prevents mutation", async () => {
  let saved = false;
  const result = await submitApplicationJourney(validForm(), {
    verifyTarget: async () => ({ valid: false, error: null }),
    save: async () => {
      saved = true;
      return { data: null, error: null };
    },
  });
  assert.equal(result.status, "error");
  assert.equal(saved, false);
});

test("duplicate extra malformed and inconsistent inputs fail closed", () => {
  const duplicate = validForm();
  duplicate.append("feeStatus", "pending");
  assert.equal(validateApplicationJourneyFormData(duplicate).success, false);

  const extra = validForm();
  extra.set("privateNote", "must never be accepted");
  assert.equal(validateApplicationJourneyFormData(extra).success, false);

  const pendingWithDate = validForm();
  pendingWithDate.set("universityDecision", "pending");
  assert.equal(validateApplicationJourneyFormData(pendingWithDate).success, false);
});
