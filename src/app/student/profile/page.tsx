import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  StudentProfileAchievementSection,
  StudentProfileExamSection,
} from "@/components/forms/student-profile-optional-sections";
import { StudentProfileDocuments } from "@/components/forms/student-profile-documents";
import { StudentProfileOnboarding } from "@/components/forms/student-profile-onboarding";
import { getAsiaKolkataBusinessDateTime } from "@/lib/consultations/booking";
import { mapProfileCompletion } from "@/lib/profiles/completion";
import { getStudentProfileOptionalRecordUrl } from "@/lib/profiles/options";
import {
  STUDENT_ACHIEVEMENT_COLUMNS,
  STUDENT_TEST_SCORE_COLUMNS,
  getStudentOptionalRecordRange,
  mapStudentAchievementPage,
  mapStudentTestScorePage,
  parseStudentOptionalRecordPage,
} from "@/lib/profiles/optional-records";
import { requireStudent } from "@/lib/permissions";
import { parseStudentAchievementDocuments } from "@/lib/student/achievement-evidence";
import { parseProfileDocumentList } from "@/lib/student/profile-documents";

export const metadata: Metadata = { title: "My profile" };

const STUDENT_PROFILE_FIELDS =
  "roll_number, personal_email, mobile_number, college, course, department, current_year, current_semester, graduation_year, cgpa, cgpa_scale, cgpa_unavailable, active_backlogs, cleared_backlogs, sslc_percentage, hsc_percentage, diploma_percentage, academic_remarks";

const STUDENT_PREFERENCE_FIELDS =
  "higher_studies_interest, preferred_study_level, preferred_countries, preferred_program_areas, target_intake, budget_range, scholarship_required, funding_required, study_mode, academic_preference, student_planning_stage, same_as_ug, domain_specializations, global_track_duration, funding_method";

const COMPLETION_FIELDS =
  "student_id, profile_status, academic_section_complete, preferences_section_complete, test_scores_section_started, achievements_section_started, essential_fields_completed, essential_fields_total, overall_completion_percentage, ready_for_counseling";

type StudentProfilePageProps = {
  searchParams: Promise<{
    achievementPage?: string | string[];
    examPage?: string | string[];
  }>;
};

export default async function StudentProfilePage({
  searchParams,
}: StudentProfilePageProps) {
  const { supabase, user, profile: accountProfile } = await requireStudent();
  const parameters = await searchParams;
  const examPage = parseStudentOptionalRecordPage(parameters.examPage);
  const achievementPage = parseStudentOptionalRecordPage(
    parameters.achievementPage,
  );
  const examRange = getStudentOptionalRecordRange(examPage);
  const achievementRange =
    getStudentOptionalRecordRange(achievementPage);
  const [
    profileResult,
    preferenceResult,
    completionResult,
    examResult,
    achievementResult,
    achievementDocumentResult,
    documentResult,
  ] = await Promise.all([
    supabase
      .from("student_profiles")
      .select(STUDENT_PROFILE_FIELDS)
      .eq("student_id", user.id)
      .maybeSingle(),
    supabase
      .from("student_preferences")
      .select(STUDENT_PREFERENCE_FIELDS)
      .eq("student_id", user.id)
      .maybeSingle(),
    supabase
      .from("student_profile_completion")
      .select(COMPLETION_FIELDS)
      .eq("student_id", user.id)
      .maybeSingle(),
    supabase
      .from("student_test_scores")
      .select(STUDENT_TEST_SCORE_COLUMNS, { count: "exact" })
      .eq("student_id", user.id)
      .order("completed_date", {
        ascending: false,
        nullsFirst: false,
      })
      .order("planned_date", {
        ascending: false,
        nullsFirst: false,
      })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(examRange.from, examRange.to),
    supabase
      .from("student_achievements")
      .select(STUDENT_ACHIEVEMENT_COLUMNS, { count: "exact" })
      .eq("student_id", user.id)
      .order("achievement_date", {
        ascending: false,
        nullsFirst: false,
      })
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(achievementRange.from, achievementRange.to),
    supabase.rpc("list_my_student_achievement_documents"),
    supabase.rpc("list_my_student_profile_documents"),
  ]);

  if (profileResult.error || preferenceResult.error || completionResult.error) {
    return (
      <section className="profile-load-error panel" role="alert">
        <span className="eyebrow">My profile</span>
        <h1>Profile temporarily unavailable</h1>
        <p className="muted">
          We could not safely load your profile. No information was changed.
          Please try again.
        </p>
        <Link className="button" href="/student/profile">
          Try again
        </Link>
      </section>
    );
  }

  const completion = mapProfileCompletion(
    completionResult.data,
    Boolean(profileResult.data),
  );
  const canonicalFullName = accountProfile.full_name?.trim() || "";
  const exams = mapStudentTestScorePage(examResult, user.id, examPage);
  const achievements = mapStudentAchievementPage(
    achievementResult,
    user.id,
    achievementPage,
  );
  const normalizedExamPage =
    exams.kind === "ready"
      ? Math.min(exams.page, exams.pageCount)
      : examPage;
  const normalizedAchievementPage =
    achievements.kind === "ready"
      ? Math.min(achievements.page, achievements.pageCount)
      : achievementPage;
  if (
    normalizedExamPage !== examPage ||
    normalizedAchievementPage !== achievementPage
  ) {
    redirect(
      getStudentProfileOptionalRecordUrl(
        normalizedExamPage,
        normalizedAchievementPage,
      ),
    );
  }
  const businessToday = getAsiaKolkataBusinessDateTime(new Date()).date;
  const achievementDocuments = achievementDocumentResult.error
    ? null
    : parseStudentAchievementDocuments(achievementDocumentResult.data);
  const profileDocuments = documentResult.error
    ? null
    : parseProfileDocumentList(documentResult.data);

  return (
    <>
      <header className="profile-page-header">
        <span className="inline-block text-[0.76rem] font-[850] uppercase leading-[1.4] tracking-[0.12em] text-[var(--brand-600)]">K-GEO student profile</span>
        <h1>Build your counseling profile</h1>
        <p>
          Save one section at a time. Your progress stays available when you
          return.
        </p>
      </header>
      <StudentProfileOnboarding
        achievementsSection={(
          <div className="mt-5 grid gap-5">
            <StudentProfileAchievementSection
              achievements={achievements}
              achievementDocuments={achievementDocuments}
              businessToday={businessToday}
              exams={exams}
            />
          </div>
        )}
        collegeEmail={accountProfile.college_email}
        completion={completion}
        fullName={canonicalFullName}
        preferences={preferenceResult.data}
        profile={profileResult.data}
      />
    </>
  );
}
