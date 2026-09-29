import "server-only";

import { requireCounselor } from "@/lib/permissions";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import {
  COUNSELOR_FOLLOW_UP_COLUMNS,
  COUNSELOR_PRIVATE_CONSULTATION_COLUMNS,
  COUNSELOR_PRIVATE_CONSULTATION_LIMIT,
  COUNSELOR_STUDENT_NOTE_COLUMNS,
} from "@/lib/counselor/private-records";
import {
  STUDENT_360_ACHIEVEMENT_COLUMNS,
  STUDENT_360_COMPLETION_COLUMNS,
  STUDENT_360_CONSULTATION_COLUMNS,
  STUDENT_360_PREFERENCE_COLUMNS,
  STUDENT_360_PROFILE_COLUMNS,
  STUDENT_360_SECTION_LIMIT,
  STUDENT_360_TEST_SCORE_COLUMNS,
  fetchCounselorStudentProfile,
  isStudent360StudentId,
  type Student360LoadResult,
} from "@/lib/counselor/student-profile";

export async function loadCounselorStudentProfile(
  routeStudentId: string,
  historyPage: number,
  notePage: number,
  followUpPage: number,
): Promise<Student360LoadResult> {
  if (!isStudent360StudentId(routeStudentId)) {
    return { kind: "not_found" };
  }

  const { supabase, user } = await requireCounselor();
  const caseAccess = await verifyPrimaryCounselorCaseAccess(
    supabase,
    routeStudentId,
  );
  if (!caseAccess.valid) {
    return caseAccess.error
      ? { kind: "unavailable" }
      : { kind: "not_found" };
  }

  return fetchCounselorStudentProfile(routeStudentId, historyPage, {
    loadIdentity: async (studentId) => {
      const { data, error } = await supabase
        .rpc("get_counselor_student_identity", {
          p_student_id: studentId,
        })
        .maybeSingle();
      return { data, error };
    },
    loadSections: async (
      trustedStudentId,
      consultationFrom,
      consultationTo,
      noteFrom,
      noteTo,
      followUpFrom,
      followUpTo,
    ) => {
      const [
        profile,
        preference,
        completion,
        testScores,
        achievements,
        consultations,
        notes,
        followUps,
        consultationChoices,
      ] = await Promise.all([
        supabase
          .from("student_profiles")
          .select(STUDENT_360_PROFILE_COLUMNS)
          .eq("student_id", trustedStudentId)
          .maybeSingle(),
        supabase
          .from("student_preferences")
          .select(STUDENT_360_PREFERENCE_COLUMNS)
          .eq("student_id", trustedStudentId)
          .maybeSingle(),
        supabase
          .from("student_profile_completion")
          .select(STUDENT_360_COMPLETION_COLUMNS)
          .eq("student_id", trustedStudentId)
          .maybeSingle(),
        supabase
          .from("student_test_scores")
          .select(STUDENT_360_TEST_SCORE_COLUMNS, {
            count: "exact",
          })
          .eq("student_id", trustedStudentId)
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .limit(STUDENT_360_SECTION_LIMIT),
        supabase
          .from("student_achievements")
          .select(STUDENT_360_ACHIEVEMENT_COLUMNS, {
            count: "exact",
          })
          .eq("student_id", trustedStudentId)
          .order("achievement_date", {
            ascending: false,
            nullsFirst: false,
          })
          .order("id", { ascending: true })
          .limit(STUDENT_360_SECTION_LIMIT),
        supabase
          .from("consultation_requests")
          .select(STUDENT_360_CONSULTATION_COLUMNS, {
            count: "exact",
          })
          .eq("student_id", trustedStudentId)
          .order("submitted_at", { ascending: false })
          .order("id", { ascending: false })
          .range(consultationFrom, consultationTo),
        supabase
          .from("counselor_student_notes")
          .select(COUNSELOR_STUDENT_NOTE_COLUMNS, {
            count: "exact",
          })
          .eq("student_id", trustedStudentId)
          .eq("counselor_id", user.id)
          .order("is_pinned", { ascending: false })
          .order("created_at", { ascending: false })
          .order("id", { ascending: true })
          .range(noteFrom, noteTo),
        supabase
          .from("counselor_follow_ups")
          .select(COUNSELOR_FOLLOW_UP_COLUMNS, {
            count: "exact",
          })
          .eq("student_id", trustedStudentId)
          .eq("counselor_id", user.id)
          .order("status", { ascending: true })
          .order("due_date", { ascending: true })
          .order("id", { ascending: true })
          .range(followUpFrom, followUpTo),
        supabase
          .from("consultation_requests")
          .select(COUNSELOR_PRIVATE_CONSULTATION_COLUMNS)
          .eq("student_id", trustedStudentId)
          .order("submitted_at", { ascending: false })
          .order("id", { ascending: false })
          .limit(COUNSELOR_PRIVATE_CONSULTATION_LIMIT),
      ]);

      return {
        profile,
        preference,
        completion,
        testScores,
        achievements,
        consultations,
        notes,
        followUps,
        consultationChoices,
      };
    },
    loadReferences: async (consultationIds) => {
      const { data, error } = await supabase.rpc(
        "get_counselor_consultation_references",
        { p_consultation_ids: consultationIds },
      );
      return { data, error };
    },
  }, {
    counselorId: user.id,
    notePage,
    followUpPage,
  });
}
