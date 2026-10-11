import type {
  ProfileCompletionPresentation,
  ProfileRequirementItem,
  ProfileRequirementPreferenceFields,
  ProfileRequirementProfileFields,
  ProfileRequirementSection,
  StudentProfileCompletionRow,
} from "@/lib/profiles/types";

const TOTAL_ESSENTIAL_FIELDS = 11;

// Mirrors the eleven essential fields of the student_profile_completion view.
// The view stays authoritative for each section's status: a section it reports
// complete has every item ticked, whatever the locally loaded values say.
export function buildProfileRequirementChecklist(
  completion: Pick<
    ProfileCompletionPresentation,
    "academicComplete" | "preferencesComplete" | "readyForCounseling"
  >,
  profile: ProfileRequirementProfileFields | null,
  preferences: ProfileRequirementPreferenceFields | null,
): ProfileRequirementSection[] {
  const { academicComplete, preferencesComplete, readyForCounseling } =
    completion;
  const provided = (value: string | number | null | undefined) =>
    value !== null && value !== undefined;

  const academicItems: ProfileRequirementItem[] = [
    { label: "Roll number", complete: provided(profile?.roll_number), step: "identity" },
    { label: "Personal email", complete: provided(profile?.personal_email), step: "identity" },
    { label: "Mobile number", complete: provided(profile?.mobile_number), step: "identity" },
    { label: "College", complete: provided(profile?.college), step: "identity" },
    { label: "Course", complete: provided(profile?.course), step: "identity" },
    { label: "Department", complete: provided(profile?.department), step: "identity" },
    { label: "Graduation year", complete: provided(profile?.graduation_year), step: "identity" },
    {
      label: "CGPA",
      complete: provided(profile?.cgpa) || profile?.cgpa_unavailable === true,
      step: "academics",
    },
  ];
  const preferenceItems: ProfileRequirementItem[] = [
    {
      label: "Higher-studies interest",
      complete: provided(preferences?.higher_studies_interest),
      step: "preferences",
    },
    {
      label: "Study level",
      complete: provided(preferences?.preferred_study_level),
      step: "preferences",
    },
    {
      label: "Target intake",
      complete: provided(preferences?.target_intake),
      step: "preferences",
    },
  ];
  const settle = (items: ProfileRequirementItem[], sectionComplete: boolean) =>
    sectionComplete ? items.map((item) => ({ ...item, complete: true })) : items;

  return [
    {
      id: "academic",
      label: "Academic section",
      complete: academicComplete,
      items: settle(academicItems, academicComplete),
    },
    {
      id: "preferences",
      label: "Preferences",
      complete: preferencesComplete,
      items: settle(preferenceItems, preferencesComplete),
    },
    {
      id: "readiness",
      label: "Ready for counseling",
      complete: readyForCounseling,
      items: [],
    },
  ];
}

function isStudentProfileCompletionRow(
  value: unknown,
): value is StudentProfileCompletionRow {
  if (typeof value !== "object" || value === null) return false;

  const studentId = Reflect.get(value, "student_id");
  const profileStatus = Reflect.get(value, "profile_status");
  const academicComplete = Reflect.get(value, "academic_section_complete");
  const preferencesComplete = Reflect.get(
    value,
    "preferences_section_complete",
  );
  const testScoresStarted = Reflect.get(value, "test_scores_section_started");
  const achievementsStarted = Reflect.get(
    value,
    "achievements_section_started",
  );
  const completedFields = Reflect.get(value, "essential_fields_completed");
  const totalFields = Reflect.get(value, "essential_fields_total");
  const percentage = Reflect.get(value, "overall_completion_percentage");
  const readyForCounseling = Reflect.get(value, "ready_for_counseling");

  return (
    typeof studentId === "string" &&
    studentId.length > 0 &&
    (profileStatus === "draft" || profileStatus === "submitted") &&
    typeof academicComplete === "boolean" &&
    typeof preferencesComplete === "boolean" &&
    typeof testScoresStarted === "boolean" &&
    typeof achievementsStarted === "boolean" &&
    typeof completedFields === "number" &&
    Number.isInteger(completedFields) &&
    completedFields >= 0 &&
    typeof totalFields === "number" &&
    Number.isInteger(totalFields) &&
    totalFields > 0 &&
    completedFields <= totalFields &&
    typeof percentage === "number" &&
    Number.isInteger(percentage) &&
    percentage >= 0 &&
    percentage <= 100 &&
    typeof readyForCounseling === "boolean"
  );
}

export function mapProfileCompletion(
  row: unknown,
  hasProfile: boolean,
): ProfileCompletionPresentation {
  if (!hasProfile) {
    return {
      state: "not_started",
      title: "Profile not started",
      description:
        "Add your academic background and higher-studies goals to prepare for counseling.",
      ctaLabel: "Start Profile",
      percentage: 0,
      completedFields: 0,
      totalFields: TOTAL_ESSENTIAL_FIELDS,
      academicComplete: false,
      preferencesComplete: false,
      testScoresStarted: false,
      achievementsStarted: false,
      readyForCounseling: false,
      hints: [
        "Add your personal and academic identity",
        "Record your Academic Portfolio",
        "Share your higher-studies preferences",
      ],
    };
  }

  const safeRow = isStudentProfileCompletionRow(row) ? row : null;

  const percentage = safeRow?.overall_completion_percentage ?? 0;
  const completedFields = safeRow?.essential_fields_completed ?? 0;
  const totalFields = safeRow?.essential_fields_total ?? TOTAL_ESSENTIAL_FIELDS;
  const academicComplete = safeRow?.academic_section_complete ?? false;
  const preferencesComplete = safeRow?.preferences_section_complete ?? false;
  const testScoresStarted = safeRow?.test_scores_section_started ?? false;
  const achievementsStarted = safeRow?.achievements_section_started ?? false;
  const readyForCounseling = safeRow?.ready_for_counseling ?? false;
  const hints: string[] = [];

  if (!academicComplete) hints.push("Complete your Academic Portfolio");
  if (!preferencesComplete) hints.push("Complete your higher-studies preferences");

  if (safeRow?.profile_status === "submitted") {
    return {
      state: "submitted",
      title: "Profile submitted",
      description: "Your submitted profile is available for review.",
      ctaLabel: "View Profile",
      percentage,
      completedFields,
      totalFields,
      academicComplete,
      preferencesComplete,
      testScoresStarted,
      achievementsStarted,
      readyForCounseling,
      hints,
    };
  }

  if (readyForCounseling) {
    return {
      state: "ready",
      title: "Profile ready for counseling",
      description:
        "Your essential academic and preference information is complete.",
      ctaLabel: "Review Profile",
      percentage,
      completedFields,
      totalFields,
      academicComplete,
      preferencesComplete,
      testScoresStarted,
      achievementsStarted,
      readyForCounseling,
      hints,
    };
  }

  return {
    state: "in_progress",
    title: `Profile ${percentage}% complete`,
    description: "Your saved information is secure. Continue when you are ready.",
    ctaLabel: "Continue Profile",
    percentage,
    completedFields,
    totalFields,
    academicComplete,
    preferencesComplete,
    testScoresStarted,
    achievementsStarted,
    readyForCounseling,
    hints,
  };
}
