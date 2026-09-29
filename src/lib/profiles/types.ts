import type { Database } from "@/types/database";

export type ProfileStep = "identity" | "academics" | "preferences" | "review";

export type ProfileActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string[]>;
  savedSection?: Exclude<ProfileStep, "review">;
};

export const initialProfileActionState: ProfileActionState = {
  status: "idle",
};

export type StudentProfileRow =
  Database["public"]["Tables"]["student_profiles"]["Row"];

export type StudentPreferenceRow =
  Database["public"]["Tables"]["student_preferences"]["Row"];

export type StudentProfileCompletionRow =
  Database["public"]["Views"]["student_profile_completion"]["Row"];

export type StudentProfileFormValues = Pick<
  StudentProfileRow,
  | "roll_number"
  | "personal_email"
  | "mobile_number"
  | "college"
  | "course"
  | "department"
  | "current_year"
  | "current_semester"
  | "graduation_year"
  | "cgpa"
  | "cgpa_scale"
  | "cgpa_unavailable"
  | "active_backlogs"
  | "cleared_backlogs"
  | "sslc_percentage"
  | "hsc_percentage"
  | "diploma_percentage"
  | "academic_remarks"
>;

export type StudentPreferenceFormValues = Pick<
  StudentPreferenceRow,
  | "higher_studies_interest"
  | "preferred_study_level"
  | "preferred_countries"
  | "preferred_program_areas"
  | "target_intake"
  | "budget_range"
  | "scholarship_required"
  | "funding_required"
  | "study_mode"
  | "academic_preference"
  | "student_planning_stage"
  | "same_as_ug"
  | "domain_specializations"
  | "global_track_duration"
  | "funding_method"
>;

export type ProfileCompletionState =
  | "not_started"
  | "in_progress"
  | "ready"
  | "submitted";

export type ProfileCompletionPresentation = {
  state: ProfileCompletionState;
  title: string;
  description: string;
  ctaLabel: string;
  percentage: number;
  completedFields: number;
  totalFields: number;
  academicComplete: boolean;
  preferencesComplete: boolean;
  testScoresStarted: boolean;
  achievementsStarted: boolean;
  readyForCounseling: boolean;
  hints: string[];
};
