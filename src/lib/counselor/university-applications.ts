import type {
  UniversityApplicationDegreeLevel,
  UniversityApplicationEventType,
  UniversityApplicationIntakeTerm,
  UniversityApplicationStatus,
} from "@/types";

export const UNIVERSITY_APPLICATION_STATUSES = [
  "planning",
  "documents_collecting",
  "application_preparing",
  "ready_to_submit",
  "submitted",
  "under_university_review",
  "additional_information_requested",
  "decision_received",
  "withdrawn",
  "closed",
] as const satisfies readonly UniversityApplicationStatus[];

export const UNIVERSITY_APPLICATION_DEGREE_LEVELS = [
  "bachelors",
  "masters",
  "postgraduate_diploma",
  "doctorate",
  "other",
] as const satisfies readonly UniversityApplicationDegreeLevel[];

export const UNIVERSITY_APPLICATION_INTAKE_TERMS = [
  "spring",
  "summer",
  "fall",
  "winter",
  "rolling",
  "other",
] as const satisfies readonly UniversityApplicationIntakeTerm[];

export const UNIVERSITY_APPLICATION_EVENT_TYPES = [
  "created",
  "details_updated",
  "status_changed",
  "primary_changed",
  "archived",
] as const satisfies readonly UniversityApplicationEventType[];

export const UNIVERSITY_APPLICATION_STATUS_LABELS = {
  planning: "Planning",
  documents_collecting: "Documents collecting",
  application_preparing: "Application preparing",
  ready_to_submit: "Ready to submit",
  submitted: "Submitted",
  under_university_review: "Under university review",
  additional_information_requested: "Additional information requested",
  decision_received: "Decision received",
  withdrawn: "Withdrawn",
  closed: "Closed",
} as const satisfies Record<UniversityApplicationStatus, string>;

export const UNIVERSITY_APPLICATION_STATUS_DEFINITIONS = {
  planning:
    "The application is being considered but active preparation has not started.",
  documents_collecting:
    "Required academic and supporting documents are being collected.",
  application_preparing:
    "The application form and submission materials are being prepared.",
  ready_to_submit:
    "The application is reviewed and ready for final submission.",
  submitted: "The application has been submitted to the university.",
  under_university_review: "University review is in progress.",
  additional_information_requested:
    "The university requested more information or documents.",
  decision_received:
    "The university has issued a decision; offer details are outside E1.1.",
  withdrawn: "The application was withdrawn before completion.",
  closed: "The application record is institutionally closed.",
} as const satisfies Record<UniversityApplicationStatus, string>;

export const UNIVERSITY_APPLICATION_DEGREE_LEVEL_LABELS = {
  bachelors: "Bachelor’s",
  masters: "Master’s",
  postgraduate_diploma: "Postgraduate diploma",
  doctorate: "Doctorate",
  other: "Other",
} as const satisfies Record<UniversityApplicationDegreeLevel, string>;

export const UNIVERSITY_APPLICATION_INTAKE_TERM_LABELS = {
  spring: "Spring",
  summer: "Summer",
  fall: "Fall",
  winter: "Winter",
  rolling: "Rolling",
  other: "Other",
} as const satisfies Record<UniversityApplicationIntakeTerm, string>;

export const UNIVERSITY_APPLICATION_EVENT_TYPE_LABELS = {
  created: "Application created",
  details_updated: "Application details updated",
  status_changed: "Application status changed",
  primary_changed: "Primary application changed",
  archived: "Application archived",
} as const satisfies Record<UniversityApplicationEventType, string>;

export const UNIVERSITY_APPLICATION_STATUS_TRANSITIONS = {
  planning: [
    "documents_collecting",
    "application_preparing",
    "withdrawn",
    "closed",
  ],
  documents_collecting: [
    "application_preparing",
    "ready_to_submit",
    "withdrawn",
    "closed",
  ],
  application_preparing: [
    "documents_collecting",
    "ready_to_submit",
    "withdrawn",
    "closed",
  ],
  ready_to_submit: ["submitted", "withdrawn", "closed"],
  submitted: [
    "under_university_review",
    "additional_information_requested",
    "decision_received",
    "withdrawn",
    "closed",
  ],
  under_university_review: [
    "additional_information_requested",
    "decision_received",
    "withdrawn",
    "closed",
  ],
  additional_information_requested: [
    "under_university_review",
    "decision_received",
    "withdrawn",
    "closed",
  ],
  decision_received: ["withdrawn", "closed"],
  withdrawn: [],
  closed: [],
} as const satisfies Record<
  UniversityApplicationStatus,
  readonly UniversityApplicationStatus[]
>;

export const UNIVERSITY_APPLICATION_TERMINAL_STATUSES = [
  "withdrawn",
  "closed",
] as const satisfies readonly UniversityApplicationStatus[];

export const UNIVERSITY_APPLICATION_PRE_SUBMISSION_STATUSES = [
  "planning",
  "documents_collecting",
  "application_preparing",
  "ready_to_submit",
] as const satisfies readonly UniversityApplicationStatus[];

export const UNIVERSITY_APPLICATION_SUBMITTED_STATUSES = [
  "submitted",
  "under_university_review",
  "additional_information_requested",
  "decision_received",
] as const satisfies readonly UniversityApplicationStatus[];

export const UNIVERSITY_APPLICATION_COUNTRY_CODE_PATTERN =
  /^[A-Z]{2}$/;
export const UNIVERSITY_APPLICATION_PORTAL_URL_PATTERN =
  /^https:\/\/[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*(?:[/?#][^\s\u0000-\u001f\u007f]*)?$/;

export const UNIVERSITY_APPLICATION_NAME_MIN_LENGTH = 2;
export const UNIVERSITY_APPLICATION_NAME_MAX_LENGTH = 200;
export const UNIVERSITY_APPLICATION_REFERENCE_MAX_LENGTH = 100;
export const UNIVERSITY_APPLICATION_PORTAL_URL_MAX_LENGTH = 2048;
export const UNIVERSITY_APPLICATION_REASON_MAX_LENGTH = 500;
export const UNIVERSITY_APPLICATION_INTAKE_YEAR_MIN = 2020;
export const UNIVERSITY_APPLICATION_INTAKE_YEAR_MAX = 2100;
export const UNIVERSITY_APPLICATION_STUDENT_READ_LIMIT = 100;
export const UNIVERSITY_APPLICATION_EVENT_PAGE_SIZE = 25;
