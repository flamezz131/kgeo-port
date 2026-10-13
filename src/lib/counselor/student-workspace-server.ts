import "server-only";

import { z } from "zod";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import {
  parseCounselorEligibilityLatest,
  type CounselorEligibilityLatest,
} from "@/lib/counselor/eligibility";
import {
  COUNSELING_PROGRESSION_STAGES,
  COUNSELING_PROGRESSION_STATES,
} from "@/lib/counselor/progression";
import { isStudent360StudentId } from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";

const identitySchema = z.object({
  student_id: z.uuid(),
  full_name: z.string().trim().min(1).nullable(),
  is_active: z.boolean(),
});

const profileSchema = z.object({
  student_id: z.uuid(),
  roll_number: z.string().trim().min(1),
  course: z.string().trim().min(1),
  department: z.string().trim().min(1),
  current_year: z.number().int().nullable(),
  current_semester: z.number().int().nullable(),
  graduation_year: z.number().int(),
  cgpa: z.number().nullable(),
  cgpa_scale: z.number(),
});

const preferenceSchema = z.object({
  student_id: z.uuid(),
  preferred_study_area: z
    .enum(["engineering", "business", "psychology"])
    .nullable(),
  preferred_domain: z
    .enum([
      "engineering_computing",
      "engineering_electrical",
      "engineering_mechanical",
      "business_management",
      "business_finance",
      "business_analytics",
      "psychology_clinical",
      "psychology_counseling",
      "psychology_organizational",
    ])
    .nullable(),
  study_pathway: z
    .enum(["masters_degree", "global_track"])
    .nullable(),
  global_track_program: z
    .enum(["fifteen_day_program", "one_year_program", "two_year_program"])
    .nullable(),
  preferred_countries: z.array(z.string()),
  preferred_program_areas: z.array(z.string()),
  target_intake: z.string().nullable(),
  budget_range: z.string().nullable(),
  study_mode: z
    .enum(["full_time", "part_time", "either", "on_campus", "online"])
    .nullable(),
  funding_method: z
    .enum([
      "self_funded",
      "education_loan",
      "scholarship_fully_funded",
      "scholarship_partially_funded",
      "other",
    ])
    .nullable(),
  student_planning_stage: z.string().nullable(),
});

const progressionSchema = z.object({
  student_id: z.uuid(),
  current_stage: z.enum(COUNSELING_PROGRESSION_STAGES),
  workflow_state: z.enum(COUNSELING_PROGRESSION_STATES),
});

export type CounselorStudentWorkspaceBase = {
  studentId: string;
  fullName: string;
  isActive: boolean;
  profile: z.infer<typeof profileSchema> | null;
  preference: z.infer<typeof preferenceSchema> | null;
  progression: z.infer<typeof progressionSchema> | null;
};

export type CounselorStudentWorkspaceBaseResult =
  | { kind: "ready"; workspace: CounselorStudentWorkspaceBase }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export type CounselorStudentWorkspaceOverviewData = {
  studentId: string;
  profile: CounselorStudentWorkspaceBase["profile"];
  preference: CounselorStudentWorkspaceBase["preference"];
  testScoreCount: number;
  achievementCount: number;
  recentAchievementTitle: string | null;
  eligibilityLatest: CounselorEligibilityLatest | null | undefined;
};

export type CounselorStudentWorkspaceOverviewResult =
  | { kind: "ready"; overview: CounselorStudentWorkspaceOverviewData }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export async function loadCounselorStudentWorkspaceBase(
  studentId: string,
): Promise<CounselorStudentWorkspaceBaseResult> {
  if (!isStudent360StudentId(studentId)) return { kind: "not_found" };

  const { supabase } = await requireCounselor();
  const caseAccess = await verifyPrimaryCounselorCaseAccess(supabase, studentId);
  if (!caseAccess.valid) {
    return caseAccess.error ? { kind: "unavailable" } : { kind: "not_found" };
  }

  const [identity, profile, preference, progression] = await Promise.all([
    supabase
      .rpc("get_counselor_student_identity", { p_student_id: studentId })
      .maybeSingle(),
    supabase
      .from("student_profiles")
      .select(
        "student_id, roll_number, course, department, current_year, current_semester, graduation_year, cgpa, cgpa_scale",
      )
      .eq("student_id", studentId)
      .maybeSingle(),
    supabase
      .from("student_preferences")
      .select(
        "student_id, preferred_study_area, preferred_domain, study_pathway, global_track_program, preferred_countries, preferred_program_areas, target_intake, budget_range, study_mode, funding_method, student_planning_stage",
      )
      .eq("student_id", studentId)
      .maybeSingle(),
    supabase
      .from("student_counseling_progressions")
      .select("student_id, current_stage, workflow_state")
      .eq("student_id", studentId)
      .maybeSingle(),
  ]);

  if (identity.error || profile.error || preference.error || progression.error) {
    return { kind: "unavailable" };
  }
  if (identity.data === null) return { kind: "not_found" };

  const parsedIdentity = identitySchema.safeParse(identity.data);
  const parsedProfile =
    profile.data === null ? null : profileSchema.safeParse(profile.data);
  const parsedPreference =
    preference.data === null
      ? null
      : preferenceSchema.safeParse(preference.data);
  const parsedProgression =
    progression.data === null
      ? null
      : progressionSchema.safeParse(progression.data);

  if (
    !parsedIdentity.success ||
    parsedIdentity.data.student_id !== studentId ||
    (parsedProfile !== null &&
      (!parsedProfile.success || parsedProfile.data.student_id !== studentId)) ||
    (parsedPreference !== null &&
      (!parsedPreference.success ||
        parsedPreference.data.student_id !== studentId)) ||
    (parsedProgression !== null &&
      (!parsedProgression.success ||
        parsedProgression.data.student_id !== studentId))
  ) {
    return { kind: "unavailable" };
  }

  return {
    kind: "ready",
    workspace: {
      studentId,
      fullName: parsedIdentity.data.full_name ?? "Name not provided",
      isActive: parsedIdentity.data.is_active,
      profile: parsedProfile?.success ? parsedProfile.data : null,
      preference: parsedPreference?.success ? parsedPreference.data : null,
      progression: parsedProgression?.success ? parsedProgression.data : null,
    },
  };
}

export async function loadCounselorStudentWorkspaceOverview(
  studentId: string,
): Promise<CounselorStudentWorkspaceOverviewResult> {
  const base = await loadCounselorStudentWorkspaceBase(studentId);
  if (base.kind !== "ready") return base;

  const { supabase } = await requireCounselor();
  const [testScores, achievements, recentAchievement, eligibilityLatest] =
    await Promise.all([
    supabase
      .from("student_test_scores")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId),
    supabase
      .from("student_achievements")
      .select("id", { count: "exact", head: true })
      .eq("student_id", studentId),
    supabase
      .from("student_achievements")
      .select("title")
      .eq("student_id", studentId)
      .order("achievement_date", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.rpc("get_counselor_latest_student_eligibility_assessment", {
      p_student_id: studentId,
    }),
  ]);

  if (testScores.error || achievements.error || recentAchievement.error) {
    return { kind: "unavailable" };
  }

  const parsedRecentAchievement = z
    .object({ title: z.string().trim().min(1) })
    .nullable()
    .safeParse(recentAchievement.data);
  if (!parsedRecentAchievement.success) return { kind: "unavailable" };
  const parsedEligibilityLatest = eligibilityLatest.error
    ? undefined
    : parseCounselorEligibilityLatest(eligibilityLatest.data);

  return {
    kind: "ready",
    overview: {
      studentId,
      profile: base.workspace.profile,
      preference: base.workspace.preference,
      testScoreCount: testScores.count ?? 0,
      achievementCount: achievements.count ?? 0,
      recentAchievementTitle: parsedRecentAchievement.data?.title ?? null,
      eligibilityLatest: parsedEligibilityLatest,
    },
  };
}
