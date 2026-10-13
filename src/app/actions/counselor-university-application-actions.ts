"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  UNIVERSITY_APPLICATION_PROJECTION_COLUMNS,
  parseOwnedUniversityApplication,
  type CounselorUniversityApplication,
  type CounselorUniversityApplicationHistoryResult,
} from "@/lib/counselor/university-application-management";
import { loadCounselorUniversityApplicationHistory } from "@/lib/counselor/university-application-server";
import {
  submitArchiveUniversityApplication,
  submitChangeUniversityApplicationStatus,
  submitCreateUniversityApplication,
  submitSetPrimaryUniversityApplication,
  submitUpdateUniversityApplicationDetails,
  type UniversityApplicationActionState,
} from "@/lib/counselor/university-application-submission";
import { isCounselorStudentIdentity } from "@/lib/counselor/student-profile";
import { requireCounselor } from "@/lib/permissions";
import type { Database } from "@/types/database";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";

type KgeoSupabaseClient = SupabaseClient<Database>;

async function verifyTrustedStudent(
  supabase: KgeoSupabaseClient,
  studentId: string,
) {
  const { data, error } = await supabase
    .rpc("get_counselor_student_identity", {
      p_student_id: studentId,
    })
    .maybeSingle();
  if (error || !isCounselorStudentIdentity(data, studentId)) {
    return { valid: false, error };
  }
  return verifyPrimaryCounselorCaseAccess(supabase, studentId);
}

async function verifyTrustedApplication(
  supabase: KgeoSupabaseClient,
  studentId: string,
  applicationId: string,
): Promise<{
  valid: boolean;
  error: unknown;
  application?: CounselorUniversityApplication;
}> {
  const student = await verifyTrustedStudent(supabase, studentId);
  if (student.error || !student.valid) return student;

  const { data, error } = await supabase
    .from("student_university_applications")
    .select(UNIVERSITY_APPLICATION_PROJECTION_COLUMNS)
    .eq("id", applicationId)
    .eq("student_id", studentId)
    .maybeSingle();
  const application = error
    ? null
    : parseOwnedUniversityApplication(data, studentId, applicationId);
  return {
    valid: application !== null,
    error,
    application: application ?? undefined,
  };
}

function revalidateStudent360(
  state: UniversityApplicationActionState,
  studentId: string,
) {
  if (state.status === "success") {
    revalidatePath(`/counselor/students/${studentId}`);
  }
}

export async function createUniversityApplicationAction(
  formData: FormData,
): Promise<UniversityApplicationActionState> {
  const { supabase } = await requireCounselor();
  let trustedStudentId: string | null = null;
  const state = await submitCreateUniversityApplication(formData, {
    verifyStudent: async (studentId) => {
      const result = await verifyTrustedStudent(supabase, studentId);
      if (result.valid && !result.error) trustedStudentId = studentId;
      return result;
    },
    create: async (input) => {
      const { data, error } = await supabase
        .rpc("create_student_university_application", {
          p_student_id: input.studentId,
          p_country_code: input.countryCode,
          p_university_name: input.universityName,
          p_programme_name: input.programmeName,
          p_degree_level: input.degreeLevel,
          p_intake_term: input.intakeTerm,
          p_intake_year: input.intakeYear,
          p_application_reference: input.applicationReference,
          p_portal_url: input.portalUrl,
          p_submission_deadline: input.submissionDeadline,
        })
        .maybeSingle();
      return { data, error };
    },
  });
  if (trustedStudentId) revalidateStudent360(state, trustedStudentId);
  return state;
}

function createTargetVerifier(supabase: KgeoSupabaseClient) {
  let trustedStudentId: string | null = null;
  return {
    verify: async (studentId: string, applicationId: string) => {
      const result = await verifyTrustedApplication(
        supabase,
        studentId,
        applicationId,
      );
      if (result.valid && !result.error) trustedStudentId = studentId;
      return result;
    },
    getTrustedStudentId: () => trustedStudentId,
  };
}

export async function updateUniversityApplicationDetailsAction(
  formData: FormData,
): Promise<UniversityApplicationActionState> {
  const { supabase } = await requireCounselor();
  const target = createTargetVerifier(supabase);
  const state = await submitUpdateUniversityApplicationDetails(formData, {
    verifyTarget: target.verify,
    update: async (input) => {
      const { data, error } = await supabase
        .rpc("update_student_university_application_details", {
          p_application_id: input.applicationId,
          p_country_code: input.countryCode,
          p_university_name: input.universityName,
          p_programme_name: input.programmeName,
          p_degree_level: input.degreeLevel,
          p_intake_term: input.intakeTerm,
          p_intake_year: input.intakeYear,
          p_application_reference: input.applicationReference,
          p_portal_url: input.portalUrl,
          p_submission_deadline: input.submissionDeadline,
          p_change_reason: input.changeReason,
        })
        .maybeSingle();
      return { data, error };
    },
  });
  const studentId = target.getTrustedStudentId();
  if (studentId) revalidateStudent360(state, studentId);
  return state;
}

export async function changeUniversityApplicationStatusAction(
  formData: FormData,
): Promise<UniversityApplicationActionState> {
  const { supabase } = await requireCounselor();
  const target = createTargetVerifier(supabase);
  const state = await submitChangeUniversityApplicationStatus(
    formData,
    {
      verifyTarget: target.verify,
      updateStatus: async (applicationId, status, reason) => {
        const { data, error } = await supabase
          .rpc("record_student_university_application_status", {
            p_application_id: applicationId,
            p_new_status: status,
            p_change_reason: reason,
          })
          .maybeSingle();
        return { data, error };
      },
    },
  );
  const studentId = target.getTrustedStudentId();
  if (studentId) revalidateStudent360(state, studentId);
  return state;
}

export async function setPrimaryUniversityApplicationAction(
  formData: FormData,
): Promise<UniversityApplicationActionState> {
  const { supabase } = await requireCounselor();
  const target = createTargetVerifier(supabase);
  const state = await submitSetPrimaryUniversityApplication(formData, {
    verifyTarget: target.verify,
    setPrimary: async (applicationId, reason) => {
      const { data, error } = await supabase
        .rpc("set_primary_student_university_application", {
          p_application_id: applicationId,
          p_change_reason: reason,
        })
        .maybeSingle();
      return { data, error };
    },
  });
  const studentId = target.getTrustedStudentId();
  if (studentId) revalidateStudent360(state, studentId);
  return state;
}

export async function archiveUniversityApplicationAction(
  formData: FormData,
): Promise<UniversityApplicationActionState> {
  const { supabase } = await requireCounselor();
  const target = createTargetVerifier(supabase);
  const state = await submitArchiveUniversityApplication(formData, {
    verifyTarget: target.verify,
    archive: async (applicationId, reason) => {
      const { data, error } = await supabase
        .rpc("archive_student_university_application", {
          p_application_id: applicationId,
          p_archive_reason: reason,
        })
        .maybeSingle();
      return { data, error };
    },
  });
  const studentId = target.getTrustedStudentId();
  if (studentId) revalidateStudent360(state, studentId);
  return state;
}

export async function loadUniversityApplicationHistoryAction(
  formData: FormData,
): Promise<CounselorUniversityApplicationHistoryResult> {
  const allowed = new Set([
    "studentId",
    "applicationId",
    "historyPage",
  ]);
  for (const key of new Set(formData.keys())) {
    if (!allowed.has(key)) return { kind: "unavailable" };
  }
  const studentIds = formData.getAll("studentId");
  const applicationIds = formData.getAll("applicationId");
  const pages = formData.getAll("historyPage");
  if (
    studentIds.length !== 1 ||
    applicationIds.length !== 1 ||
    pages.length !== 1 ||
    typeof studentIds[0] !== "string" ||
    typeof applicationIds[0] !== "string" ||
    typeof pages[0] !== "string" ||
    !/^[1-9]\d*$/.test(pages[0])
  ) {
    return { kind: "unavailable" };
  }
  const page = Number(pages[0]);
  if (!Number.isSafeInteger(page) || page > 100) {
    return { kind: "unavailable" };
  }
  return loadCounselorUniversityApplicationHistory(
    studentIds[0],
    applicationIds[0],
    page,
  );
}
