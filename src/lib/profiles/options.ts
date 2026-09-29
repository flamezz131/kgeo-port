import type {
  HigherStudiesInterest,
  StudentAcademicPreference,
  StudentAchievementType,
  StudentExamName,
  StudentExamStatus,
  StudentGlobalTrackProgram,
  StudentPlanningStage,
  StudentPreferredDomain,
  StudentPreferredStudyArea,
  StudentPreferredStudyLevel,
  StudentStudyPathway,
  StudentFundingMethod,
  StudentStudyMode,
} from "@/types";

export const PROFILE_COLLEGES = [
  "Kumaraguru College of Technology",
] as const;

export type ProfileCollege = (typeof PROFILE_COLLEGES)[number];

export const PROFILE_CATALOG_NOTICE =
  "The current college, course, and department lists are provisional and require official Kumaraguru verification.";

export const PROFILE_GRADUATION_YEARS = Array.from(
  { length: 2040 - 2024 + 1 },
  (_, index) => 2024 + index,
);

export const PROFILE_CURRENT_YEARS = Array.from(
  { length: 8 },
  (_, index) => index + 1,
);

export const PROFILE_CURRENT_SEMESTERS = Array.from(
  { length: 16 },
  (_, index) => index + 1,
);

export const CGPA_SCALES = [4, 10] as const;

export const HIGHER_STUDIES_INTEREST_PROFILE_OPTIONS: ReadonlyArray<{
  value: HigherStudiesInterest;
  label: string;
}> = [
  { value: "interested", label: "Interested" },
  { value: "exploring", label: "Exploring" },
  { value: "not_interested", label: "Not interested" },
];

export const PREFERRED_STUDY_LEVEL_OPTIONS: ReadonlyArray<{
  value: StudentPreferredStudyLevel;
  label: string;
}> = [
  { value: "masters", label: "Master's degree" },
  { value: "postgraduate_diploma", label: "Postgraduate diploma" },
  { value: "mba", label: "MBA" },
  { value: "phd", label: "PhD" },
  { value: "global_track", label: "Global Track Programme" },
  { value: "other", label: "Other" },
];

export const GLOBAL_TRACK_DURATION_OPTIONS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "1_year_abroad", label: "1 Year Abroad" },
  { value: "2_years_abroad", label: "2 Years Abroad" },
];

export const STUDY_MODE_OPTIONS: ReadonlyArray<{
  value: StudentStudyMode;
  label: string;
}> = [
  { value: "full_time", label: "Full time" },
  { value: "part_time", label: "Part time" },
  { value: "either", label: "Either" },
];

export const PREFERRED_STUDY_AREA_OPTIONS: ReadonlyArray<{
  value: StudentPreferredStudyArea;
  label: string;
}> = [
  { value: "engineering", label: "Engineering" },
  { value: "business", label: "Business" },
  { value: "psychology", label: "Psychology" },
];

export const PREFERRED_DOMAIN_OPTIONS: Readonly<
  Record<
    StudentPreferredStudyArea,
    ReadonlyArray<{ value: StudentPreferredDomain; label: string }>
  >
> = {
  engineering: [
    { value: "engineering_computing", label: "Computing and Software" },
    { value: "engineering_electrical", label: "Electrical and Electronics" },
    { value: "engineering_mechanical", label: "Mechanical and Manufacturing" },
  ],
  business: [
    { value: "business_management", label: "Management" },
    { value: "business_finance", label: "Finance" },
    { value: "business_analytics", label: "Business Analytics" },
  ],
  psychology: [
    { value: "psychology_clinical", label: "Clinical Psychology" },
    { value: "psychology_counseling", label: "Counseling Psychology" },
    { value: "psychology_organizational", label: "Organizational Psychology" },
  ],
};

export const STUDY_PATHWAY_OPTIONS: ReadonlyArray<{
  value: StudentStudyPathway;
  label: string;
}> = [
  { value: "masters_degree", label: "Master's Degree" },
  { value: "global_track", label: "Global Track" },
];

export const GLOBAL_TRACK_PROGRAM_OPTIONS: ReadonlyArray<{
  value: StudentGlobalTrackProgram;
  label: string;
}> = [
  { value: "fifteen_day_program", label: "15-Day Programme" },
  { value: "one_year_program", label: "1-Year Programme" },
  { value: "two_year_program", label: "2-Year Programme" },
];

export const FUNDING_METHOD_OPTIONS: ReadonlyArray<{
  value: StudentFundingMethod;
  label: string;
}> = [
  { value: "self_funded", label: "Self-funded" },
  { value: "education_loan", label: "Education Loan" },
  { value: "scholarship_fully_funded", label: "Fully Funded by Scholarship" },
  { value: "scholarship_partially_funded", label: "Partially Funded" },
  { value: "other", label: "Other" },
];

export const STUDENT_FUNDING_METHOD_OPTIONS = FUNDING_METHOD_OPTIONS;

export const ACADEMIC_PREFERENCE_OPTIONS: ReadonlyArray<{
  value: StudentAcademicPreference;
  label: string;
}> = [
  { value: "coursework", label: "Coursework" },
  { value: "research", label: "Research" },
  { value: "either", label: "Either" },
  { value: "undecided", label: "Undecided" },
];

export const STUDENT_PLANNING_STAGE_OPTIONS: ReadonlyArray<{
  value: StudentPlanningStage;
  label: string;
}> = [
  { value: "exploring", label: "Exploring options" },
  { value: "preparing_exams", label: "Preparing for exams" },
  { value: "shortlisting", label: "Shortlisting programs" },
  { value: "preparing_documents", label: "Preparing documents" },
  { value: "applications_started", label: "Applications started" },
];

export const TARGET_INTAKE_SEASONS = [
  { value: "spring", label: "Spring" },
  { value: "summer", label: "Summer" },
  { value: "fall", label: "Fall" },
  { value: "winter", label: "Winter" },
] as const;

export const TARGET_INTAKE_YEARS = Array.from(
  { length: 2099 - 2020 + 1 },
  (_, index) => 2020 + index,
);

export const STUDENT_EXAM_NAME_OPTIONS: ReadonlyArray<{
  value: StudentExamName;
  label: string;
}> = [
  { value: "ielts", label: "IELTS" },
  { value: "toefl", label: "TOEFL" },
  { value: "pte", label: "PTE" },
  { value: "gre", label: "GRE" },
  { value: "gmat", label: "GMAT" },
  { value: "dmat", label: "DMAT" },
  { value: "gate", label: "GATE" },
  { value: "other", label: "Other exam" },
];

export const STUDENT_EXAM_STATUS_OPTIONS: ReadonlyArray<{
  value: StudentExamStatus;
  label: string;
}> = [
  { value: "not_planned", label: "Not planned" },
  { value: "planning", label: "Planning" },
  { value: "booked", label: "Booked" },
  { value: "completed", label: "Completed" },
  { value: "not_required", label: "Not required" },
];

export const STUDENT_ACHIEVEMENT_TYPE_OPTIONS: ReadonlyArray<{
  value: StudentAchievementType;
  label: string;
}> = [
  { value: "internship", label: "Internship" },
  { value: "project", label: "Project" },
  { value: "certification", label: "Certification" },
  { value: "research", label: "Research" },
  { value: "publication", label: "Publication" },
  { value: "award", label: "Award" },
  { value: "hackathon", label: "Hackathon" },
  { value: "leadership", label: "Leadership" },
  { value: "volunteering", label: "Volunteering" },
  { value: "work_experience", label: "Work experience" },
  { value: "sports", label: "Sports" },
  { value: "other", label: "Other" },
];

export const OPTIONAL_PROFILE_RECORD_FALLBACKS = {
  notAdded: "Not added",
  noDate: "Date not added",
  noRemarks: "No remarks added",
} as const;

function getOptionLabel<T extends string>(
  options: ReadonlyArray<{ value: T; label: string }>,
  value: T,
): string {
  return options.find((option) => option.value === value)?.label ?? value;
}

export function getStudentExamNameLabel(value: StudentExamName): string {
  return getOptionLabel(STUDENT_EXAM_NAME_OPTIONS, value);
}

export function isStudentExamName(value: string): value is StudentExamName {
  return STUDENT_EXAM_NAME_OPTIONS.some((option) => option.value === value);
}

export function getStudentExamStatusLabel(value: StudentExamStatus): string {
  return getOptionLabel(STUDENT_EXAM_STATUS_OPTIONS, value);
}

export function isStudentExamStatus(
  value: string,
): value is StudentExamStatus {
  return STUDENT_EXAM_STATUS_OPTIONS.some(
    (option) => option.value === value,
  );
}

export function getStudentAchievementTypeLabel(
  value: StudentAchievementType,
): string {
  return getOptionLabel(STUDENT_ACHIEVEMENT_TYPE_OPTIONS, value);
}

export function getStudentStudyModeLabel(value: StudentStudyMode): string {
  const currentLabel = STUDY_MODE_OPTIONS.find(
    (option) => option.value === value,
  )?.label;
  if (currentLabel) return currentLabel;
  const legacyLabels: Record<"on_campus" | "online", string> = {
    on_campus: "Legacy selection: On-campus",
    online: "Legacy selection: Online",
  };
  return legacyLabels[value as keyof typeof legacyLabels] ?? value;
}

export function getStudentPreferredStudyAreaLabel(
  value: StudentPreferredStudyArea,
): string {
  return getOptionLabel(PREFERRED_STUDY_AREA_OPTIONS, value);
}

export function getStudentPreferredDomainLabel(
  value: StudentPreferredDomain,
): string {
  for (const options of Object.values(PREFERRED_DOMAIN_OPTIONS)) {
    const match = options.find((option) => option.value === value);
    if (match) return match.label;
  }
  return value;
}

export function getStudentStudyPathwayLabel(
  value: StudentStudyPathway,
): string {
  return getOptionLabel(STUDY_PATHWAY_OPTIONS, value);
}

export function getStudentGlobalTrackProgramLabel(
  value: StudentGlobalTrackProgram,
): string {
  return getOptionLabel(GLOBAL_TRACK_PROGRAM_OPTIONS, value);
}

export function getStudentFundingMethodLabel(
  value: StudentFundingMethod,
): string {
  return getOptionLabel(FUNDING_METHOD_OPTIONS, value);
}

export function formatOptionalProfileDate(value: string | null): string {
  if (!value) return OPTIONAL_PROFILE_RECORD_FALLBACKS.noDate;
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function getStudentProfileOptionalRecordUrl(
  examPage: number,
  achievementPage: number,
): string {
  const parameters = new URLSearchParams();
  if (examPage > 1) parameters.set("examPage", String(examPage));
  if (achievementPage > 1) {
    parameters.set("achievementPage", String(achievementPage));
  }
  const query = parameters.toString();
  return query ? `/student/profile?${query}` : "/student/profile";
}

export function isProfileCollege(value: string): value is ProfileCollege {
  return PROFILE_COLLEGES.some((college) => college === value);
}

export function parseTargetIntake(value: string | null): {
  season: string;
  year: string;
} {
  if (!value) return { season: "", year: "" };
  const match = /^(spring|summer|fall|winter)-(20[2-9][0-9])$/.exec(value);
  return match ? { season: match[1], year: match[2] } : { season: "", year: "" };
}
