import "server-only";

import { z } from "zod";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import {
  ELIGIBILITY_HISTORY_LIMIT,
  parseCounselorEligibilityAssessments,
  type CounselorEligibilityAssessment,
} from "@/lib/counselor/eligibility";
import { isStudent360StudentId } from "@/lib/counselor/student-profile";
import { logDataLoadFailure } from "@/lib/diagnostics/log-data-load-failure";
import { requireCounselor } from "@/lib/permissions";

const contextProfileSchema = z
  .object({
    student_id: z.uuid(),
    cgpa: z.number().nullable(),
    cgpa_scale: z.number().positive(),
    active_backlogs: z.number().int().min(0),
    cleared_backlogs: z.number().int().min(0),
  })
  .strict();

const contextPreferenceSchema = z
  .object({
    student_id: z.uuid(),
    preferred_countries: z.array(z.string().trim().min(1).max(80)).max(10),
    target_intake: z
      .string()
      .regex(/^(spring|summer|fall|winter)-20[2-9]\d$/)
      .nullable(),
  })
  .strict();

const contextTestSchema = z
  .object({
    id: z.uuid(),
    student_id: z.uuid(),
    exam_name: z.enum(["ielts", "toefl", "pte", "gre", "gmat", "gate", "other"]),
    custom_exam_name: z.string().trim().min(1).max(100).nullable(),
    exam_status: z.enum(["not_planned", "planning", "booked", "completed", "not_required"]),
    planned_date: z.iso.date().nullable(),
    completed_date: z.iso.date().nullable(),
    score: z.string().trim().min(1).max(100).nullable(),
  })
  .strict()
  .superRefine((score, context) => {
    if ((score.exam_name === "other") !== (score.custom_exam_name !== null)) {
      context.addIssue({ code: "custom", message: "Invalid exam name" });
    }
    if ((score.exam_status === "completed") !== (score.completed_date !== null)) {
      context.addIssue({ code: "custom", message: "Invalid exam status" });
    }
    if (score.score !== null && score.exam_status !== "completed") {
      context.addIssue({ code: "custom", message: "Invalid exam score" });
    }
  });

export type CounselorEligibilityContext = {
  cgpa: number | null;
  cgpaScale: number | null;
  activeBacklogs: number | null;
  clearedBacklogs: number | null;
  preferredCountries: string[];
  targetIntake: string | null;
  tests: Array<{
    id: string;
    name: string;
    status: string;
    score: string | null;
    date: string | null;
  }>;
};

export type CounselorEligibilityPageResult =
  | {
      kind: "ready";
      context: CounselorEligibilityContext;
      assessments: CounselorEligibilityAssessment[];
    }
  | { kind: "not_found" }
  | { kind: "unavailable" };

const examLabels = {
  ielts: "IELTS",
  toefl: "TOEFL",
  pte: "PTE",
  gre: "GRE",
  gmat: "GMAT",
  gate: "GATE",
  other: "Other",
} as const;

const examStatusLabels = {
  not_planned: "Not planned",
  planning: "Planning",
  booked: "Booked",
  completed: "Completed",
  not_required: "Not required",
} as const;

export async function loadCounselorEligibilityPage(
  studentId: string,
): Promise<CounselorEligibilityPageResult> {
  if (!isStudent360StudentId(studentId)) return { kind: "not_found" };

  const { supabase } = await requireCounselor();
  const ownership = await verifyPrimaryCounselorCaseAccess(supabase, studentId);
  if (!ownership.valid) {
    return ownership.error ? { kind: "unavailable" } : { kind: "not_found" };
  }

  const [profile, preference, tests, assessmentHistory] = await Promise.all([
    supabase
      .from("student_profiles")
      .select("student_id, cgpa, cgpa_scale, active_backlogs, cleared_backlogs")
      .eq("student_id", studentId)
      .maybeSingle(),
    supabase
      .from("student_preferences")
      .select("student_id, preferred_countries, target_intake")
      .eq("student_id", studentId)
      .maybeSingle(),
    supabase
      .from("student_test_scores")
      .select("id, student_id, exam_name, custom_exam_name, exam_status, planned_date, completed_date, score")
      .eq("student_id", studentId)
      .in("exam_name", ["ielts", "toefl", "pte", "gre", "gmat"])
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.rpc("get_counselor_student_eligibility_assessments", {
      p_student_id: studentId,
      p_limit: ELIGIBILITY_HISTORY_LIMIT,
    }),
  ]);

  const queryFailure = [
    ["Eligibility context (student_profiles)", profile.error],
    ["Eligibility context (student_preferences)", preference.error],
    ["Eligibility context (student_test_scores)", tests.error],
    [
      "Eligibility history (get_counselor_student_eligibility_assessments)",
      assessmentHistory.error,
    ],
  ] as const;
  const failedQuery = queryFailure.find(([, failure]) => failure);
  if (failedQuery) {
    logDataLoadFailure(failedQuery[0], failedQuery[1]);
    return { kind: "unavailable" };
  }

  const parsedProfile =
    profile.data === null ? null : contextProfileSchema.safeParse(profile.data);
  const parsedPreference =
    preference.data === null
      ? null
      : contextPreferenceSchema.safeParse(preference.data);
  const parsedTests = z.array(contextTestSchema).max(20).safeParse(tests.data);
  const assessments = parseCounselorEligibilityAssessments(
    assessmentHistory.data,
  );

  if (
    (parsedProfile !== null &&
      (!parsedProfile.success || parsedProfile.data.student_id !== studentId)) ||
    (parsedPreference !== null &&
      (!parsedPreference.success ||
        parsedPreference.data.student_id !== studentId)) ||
    !parsedTests.success ||
    parsedTests.data.some((score) => score.student_id !== studentId) ||
    assessments === null
  ) {
    logDataLoadFailure(
      "Eligibility page",
      "Loaded rows did not match the expected shape.",
    );
    return { kind: "unavailable" };
  }

  const profileData = parsedProfile?.success ? parsedProfile.data : null;
  const preferenceData = parsedPreference?.success
    ? parsedPreference.data
    : null;

  return {
    kind: "ready",
    context: {
      cgpa: profileData?.cgpa ?? null,
      cgpaScale: profileData?.cgpa_scale ?? null,
      activeBacklogs: profileData?.active_backlogs ?? null,
      clearedBacklogs: profileData?.cleared_backlogs ?? null,
      preferredCountries: preferenceData?.preferred_countries ?? [],
      targetIntake: preferenceData?.target_intake ?? null,
      tests: parsedTests.data.map((score) => ({
        id: score.id,
        name:
          score.exam_name === "other"
            ? (score.custom_exam_name ?? "Other")
            : examLabels[score.exam_name],
        status: examStatusLabels[score.exam_status],
        score: score.score,
        date: score.completed_date ?? score.planned_date,
      })),
    },
    assessments,
  };
}
