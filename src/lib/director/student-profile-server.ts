import "server-only";

import {
  STUDENT_360_ACHIEVEMENT_COLUMNS,
  STUDENT_360_COMPLETION_COLUMNS,
  STUDENT_360_PREFERENCE_COLUMNS,
  STUDENT_360_PROFILE_COLUMNS,
  STUDENT_360_SECTION_LIMIT,
  STUDENT_360_TEST_SCORE_COLUMNS,
  fetchCounselorStudentProfile,
  isCounselorStudentIdentity,
  isStudent360StudentId,
  type Student360LoadResult,
  type Student360ReadyResult,
} from "@/lib/counselor/student-profile";
import {
  parseDirectorEligibility,
  parseDirectorStudentCaseDetail,
  type DirectorEligibilityAssessment,
  type DirectorStudentAdditionalDetail,
  type DirectorStudentCaseDetail,
  type DirectorStudentSection,
} from "@/lib/director/student-profile-detail";
import { createDirectorStudentDiagnostic } from "@/lib/director/student-profile-diagnostics";
import { requireDirector } from "@/lib/permissions";
import { parseStudentAchievementDocuments } from "@/lib/student/achievement-evidence";
import { parseProfileDocumentList } from "@/lib/student/profile-documents";
import type {
  StudentAchievementDocument,
  StudentProfileDocument,
} from "@/types";

export type DirectorStudentProfileReadyResult = Student360ReadyResult &
  DirectorStudentAdditionalDetail;

export type DirectorStudentProfileLoadResult =
  | DirectorStudentProfileReadyResult
  | Exclude<Student360LoadResult, Student360ReadyResult>;

function logDirectorStudentFailure(section: string, error: unknown): void {
  console.error(createDirectorStudentDiagnostic(section, error));
}

function logDirectorStudentParserFailure(section: string): void {
  logDirectorStudentFailure(section, {
    code: "PARSER_ERROR",
    message: "Response did not match the expected section contract.",
  });
}

function readySection<T>(data: T): DirectorStudentSection<T> {
  return { status: "ready", data };
}

function unavailableSection<T>(): DirectorStudentSection<T> {
  return { status: "unavailable" };
}

function unavailableCaseDetail(): DirectorStudentCaseDetail {
  return parseDirectorStudentCaseDetail(undefined);
}

function logCaseParserFailures(detail: DirectorStudentCaseDetail): void {
  const sections: Array<[string, DirectorStudentSection<unknown>]> = [
    ["Journey / Progress", detail.progress],
    ["Semester summaries", detail.semesterSummaries],
    ["Applications / Application Journey", detail.applications],
    ["Global Readiness and history", detail.readinessAssessments],
    ["Consultation history", detail.consultations],
    ["Current Primary Counselor", detail.primaryCounselor],
    ["Parent Reports", detail.parentReports],
  ];
  for (const [section, result] of sections) {
    if (result.status === "unavailable") {
      logDirectorStudentParserFailure(section);
    }
  }
}

export async function loadDirectorStudentProfile(
  routeStudentId: string,
): Promise<DirectorStudentProfileLoadResult> {
  if (!isStudent360StudentId(routeStudentId)) {
    return { kind: "not_found" };
  }

  const { supabase } = await requireDirector();
  let coreFailureLogged = false;

  const results = await Promise.allSettled([
    fetchCounselorStudentProfile(routeStudentId, 1, {
      loadIdentity: async (studentId) => {
        const result = await (async () => {
          try {
            return await supabase
              .rpc("get_director_student_identity", {
                p_student_id: studentId,
              })
              .maybeSingle();
          } catch (error) {
            coreFailureLogged = true;
            logDirectorStudentFailure(
              "Identity / core profile (get_director_student_identity)",
              error,
            );
            throw error;
          }
        })();
        if (result.error) {
          coreFailureLogged = true;
          logDirectorStudentFailure(
            "Identity / core profile (get_director_student_identity)",
            result.error,
          );
        } else if (
          result.data !== null &&
          !isCounselorStudentIdentity(result.data, studentId)
        ) {
          coreFailureLogged = true;
          logDirectorStudentParserFailure(
            "Identity / core profile (get_director_student_identity)",
          );
        }
        return result;
      },
      loadSections: async (trustedStudentId) => {
        const [profile, preference, completion, testScores, achievements] =
          await (async () => {
            try {
              return await Promise.all([
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
                  .select(STUDENT_360_TEST_SCORE_COLUMNS, { count: "exact" })
                  .eq("student_id", trustedStudentId)
                  .order("created_at", { ascending: false })
                  .order("id", { ascending: true })
                  .limit(STUDENT_360_SECTION_LIMIT),
                supabase
                  .from("student_achievements")
                  .select(STUDENT_360_ACHIEVEMENT_COLUMNS, { count: "exact" })
                  .eq("student_id", trustedStudentId)
                  .order("achievement_date", {
                    ascending: false,
                    nullsFirst: false,
                  })
                  .order("id", { ascending: true })
                  .limit(STUDENT_360_SECTION_LIMIT),
              ]);
            } catch (error) {
              coreFailureLogged = true;
              logDirectorStudentFailure("Core Student 360 sections", error);
              throw error;
            }
          })();

        const coreSections = [
          ["Basic profile", profile],
          ["Preferences", preference],
          ["Profile completion", completion],
          ["Study Abroad Exams", testScores],
          ["Achievements", achievements],
        ] as const;
        for (const [section, result] of coreSections) {
          if (result.error) {
            coreFailureLogged = true;
            logDirectorStudentFailure(section, result.error);
          }
        }

        return {
          profile,
          preference,
          completion,
          testScores,
          achievements,
          consultations: { data: [], error: null, count: 0 },
        };
      },
      loadReferences: async () => ({ data: [], error: null }),
    }),
    supabase.rpc("list_director_student_achievement_documents", {
      p_student_id: routeStudentId,
    }),
    supabase.rpc("list_director_student_profile_documents", {
      p_student_id: routeStudentId,
    }),
    supabase.rpc("get_director_latest_student_eligibility_assessment", {
      p_student_id: routeStudentId,
    }),
    supabase
      .rpc("get_director_student_case_detail", {
        p_student_id: routeStudentId,
      })
      .maybeSingle(),
  ]);

  const [
    coreResult,
    evidenceResult,
    documentResult,
    eligibilityResult,
    detailResult,
  ] = results;

  if (coreResult.status === "rejected") {
    logDirectorStudentFailure("Identity / core profile", coreResult.reason);
    return { kind: "unavailable" };
  }
  const core = coreResult.value;
  if (core.kind !== "ready") {
    if (core.kind === "unavailable" && !coreFailureLogged) {
      logDirectorStudentParserFailure("Core Student 360 profile");
    }
    return core;
  }

  let achievementEvidence =
    unavailableSection<StudentAchievementDocument[]>();
  if (evidenceResult.status === "rejected") {
    logDirectorStudentFailure(
      "Achievement Evidence (list_director_student_achievement_documents)",
      evidenceResult.reason,
    );
  } else if (evidenceResult.value.error) {
    logDirectorStudentFailure(
      "Achievement Evidence (list_director_student_achievement_documents)",
      evidenceResult.value.error,
    );
  } else {
    const parsed = parseStudentAchievementDocuments(evidenceResult.value.data);
    if (parsed === null) {
      logDirectorStudentParserFailure(
        "Achievement Evidence (list_director_student_achievement_documents)",
      );
    } else {
      achievementEvidence = readySection(parsed);
    }
  }

  let profileDocuments = unavailableSection<StudentProfileDocument[]>();
  if (documentResult.status === "rejected") {
    logDirectorStudentFailure(
      "Profile Documents (list_director_student_profile_documents)",
      documentResult.reason,
    );
  } else if (documentResult.value.error) {
    logDirectorStudentFailure(
      "Profile Documents (list_director_student_profile_documents)",
      documentResult.value.error,
    );
  } else {
    const parsed = parseProfileDocumentList(documentResult.value.data);
    if (parsed === null) {
      logDirectorStudentParserFailure(
        "Profile Documents (list_director_student_profile_documents)",
      );
    } else {
      profileDocuments = readySection(parsed);
    }
  }

  let eligibility =
    unavailableSection<DirectorEligibilityAssessment | null>();
  if (eligibilityResult.status === "rejected") {
    logDirectorStudentFailure(
      "Eligibility (get_director_latest_student_eligibility_assessment)",
      eligibilityResult.reason,
    );
  } else if (eligibilityResult.value.error) {
    logDirectorStudentFailure(
      "Eligibility (get_director_latest_student_eligibility_assessment)",
      eligibilityResult.value.error,
    );
  } else {
    const parsed = parseDirectorEligibility(
      eligibilityResult.value.data,
      routeStudentId,
    );
    if (parsed === undefined) {
      logDirectorStudentParserFailure(
        "Eligibility (get_director_latest_student_eligibility_assessment)",
      );
    } else {
      eligibility = readySection(parsed);
    }
  }

  let caseDetail = unavailableCaseDetail();
  if (detailResult.status === "rejected") {
    logDirectorStudentFailure(
      "Student case detail (get_director_student_case_detail)",
      detailResult.reason,
    );
  } else if (detailResult.value.error) {
    logDirectorStudentFailure(
      "Student case detail (get_director_student_case_detail)",
      detailResult.value.error,
    );
  } else {
    caseDetail = parseDirectorStudentCaseDetail(
      detailResult.value.data?.payload,
    );
    logCaseParserFailures(caseDetail);
  }

  return {
    ...core,
    achievementEvidence,
    profileDocuments,
    eligibility,
    caseDetail,
  };
}
