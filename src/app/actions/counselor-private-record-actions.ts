"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  submitCreateCounselorFollowUp,
  submitCreateCounselorNote,
  submitDeleteCounselorNote,
  submitRecordCounselorFollowUpStatus,
  submitSetCounselorNotePinned,
  submitUpdateCounselorFollowUp,
  submitUpdateCounselorWorkloadFollowUp,
  submitUpdateCounselorNote,
  type CounselorPrivateRecordActionState,
} from "@/lib/counselor/private-record-submission";
import { isCounselorStudentIdentity } from "@/lib/counselor/student-profile";
import { verifyPrimaryCounselorCaseAccess } from "@/lib/counselor/case-ownership-server";
import { requireCounselor } from "@/lib/permissions";
import type { Database } from "@/types/database";

type KgeoSupabaseClient = SupabaseClient<Database>;

async function verifyCounselorStudentTarget(
  supabase: KgeoSupabaseClient,
  studentId: string,
  consultationId: string | null,
): Promise<{ valid: boolean; error: unknown }> {
  const identity = await supabase
    .rpc("get_counselor_student_identity", {
      p_student_id: studentId,
    })
    .maybeSingle();
  if (identity.error) return { valid: false, error: identity.error };
  if (!isCounselorStudentIdentity(identity.data, studentId)) {
    return { valid: false, error: null };
  }
  const ownership = await verifyPrimaryCounselorCaseAccess(
    supabase,
    studentId,
  );
  if (!ownership.valid || ownership.error) return ownership;
  if (consultationId === null) return { valid: true, error: null };

  const consultation = await supabase
    .from("consultation_requests")
    .select("id, student_id")
    .eq("id", consultationId)
    .eq("student_id", studentId)
    .maybeSingle();
  return {
    valid:
      !consultation.error &&
      consultation.data?.id === consultationId &&
      consultation.data.student_id === studentId,
    error: consultation.error,
  };
}

function createTrustedTargetVerifier(supabase: KgeoSupabaseClient) {
  let trustedStudentId: string | null = null;

  return {
    verify: async (studentId: string, consultationId: string | null) => {
      const result = await verifyCounselorStudentTarget(
        supabase,
        studentId,
        consultationId,
      );
      if (result.valid && !result.error) trustedStudentId = studentId;
      return result;
    },
    getTrustedStudentId: () => trustedStudentId,
  };
}

function revalidateCounselorPrivateRecords(studentId: string) {
  revalidatePath(`/counselor/students/${studentId}`);
  revalidatePath("/counselor/students");
}

function revalidateSuccessfulMutation(
  state: CounselorPrivateRecordActionState,
  targetVerifier: ReturnType<typeof createTrustedTargetVerifier>,
) {
  const studentId = targetVerifier.getTrustedStudentId();
  if (state.status === "success" && studentId) {
    revalidateCounselorPrivateRecords(studentId);
    if (state.operation?.includes("follow_up")) {
      revalidatePath("/counselor/follow-ups");
    }
  }
}

export async function createCounselorStudentNote(
  _previousState: CounselorPrivateRecordActionState,
  formData: FormData,
): Promise<CounselorPrivateRecordActionState> {
  const { supabase } = await requireCounselor();
  const targetVerifier = createTrustedTargetVerifier(supabase);
  const state = await submitCreateCounselorNote(formData, {
    verifyTarget: targetVerifier.verify,
    create: async (payload) => {
      const { data, error } = await supabase
        .from("counselor_student_notes")
        .insert(payload)
        .select("id")
        .maybeSingle();
      return { affected: Boolean(data), error };
    },
  });
  revalidateSuccessfulMutation(state, targetVerifier);
  return state;
}

export async function updateCounselorStudentNote(
  _previousState: CounselorPrivateRecordActionState,
  formData: FormData,
): Promise<CounselorPrivateRecordActionState> {
  const { supabase, user } = await requireCounselor();
  const targetVerifier = createTrustedTargetVerifier(supabase);
  const state = await submitUpdateCounselorNote(formData, {
    verifyTarget: targetVerifier.verify,
    update: async (studentId, recordId, payload) => {
      const { data, error } = await supabase
        .from("counselor_student_notes")
        .update(payload)
        .eq("id", recordId)
        .eq("student_id", studentId)
        .eq("counselor_id", user.id)
        .select("id")
        .maybeSingle();
      return { affected: Boolean(data), error };
    },
  });
  revalidateSuccessfulMutation(state, targetVerifier);
  return state;
}

export async function setCounselorStudentNotePinned(
  _previousState: CounselorPrivateRecordActionState,
  formData: FormData,
): Promise<CounselorPrivateRecordActionState> {
  const { supabase, user } = await requireCounselor();
  const targetVerifier = createTrustedTargetVerifier(supabase);
  const state = await submitSetCounselorNotePinned(formData, {
    verifyTarget: targetVerifier.verify,
    pin: async (studentId, recordId, isPinned) => {
      const { data, error } = await supabase
        .from("counselor_student_notes")
        .update({ is_pinned: isPinned })
        .eq("id", recordId)
        .eq("student_id", studentId)
        .eq("counselor_id", user.id)
        .select("id")
        .maybeSingle();
      return { affected: Boolean(data), error };
    },
  });
  revalidateSuccessfulMutation(state, targetVerifier);
  return state;
}

export async function deleteCounselorStudentNote(
  _previousState: CounselorPrivateRecordActionState,
  formData: FormData,
): Promise<CounselorPrivateRecordActionState> {
  const { supabase, user } = await requireCounselor();
  const targetVerifier = createTrustedTargetVerifier(supabase);
  const state = await submitDeleteCounselorNote(formData, {
    verifyTarget: targetVerifier.verify,
    delete: async (studentId, recordId) => {
      const { data, error } = await supabase
        .from("counselor_student_notes")
        .delete()
        .eq("id", recordId)
        .eq("student_id", studentId)
        .eq("counselor_id", user.id)
        .select("id")
        .maybeSingle();
      return { affected: Boolean(data), error };
    },
  });
  revalidateSuccessfulMutation(state, targetVerifier);
  return state;
}

export async function createCounselorFollowUp(
  _previousState: CounselorPrivateRecordActionState,
  formData: FormData,
): Promise<CounselorPrivateRecordActionState> {
  const { supabase } = await requireCounselor();
  const targetVerifier = createTrustedTargetVerifier(supabase);
  const state = await submitCreateCounselorFollowUp(formData, {
    verifyTarget: targetVerifier.verify,
    create: async (payload) => {
      const { data, error } = await supabase
        .from("counselor_follow_ups")
        .insert(payload)
        .select("id")
        .maybeSingle();
      return { affected: Boolean(data), error };
    },
  });
  revalidateSuccessfulMutation(state, targetVerifier);
  return state;
}

export async function updateCounselorFollowUp(
  _previousState: CounselorPrivateRecordActionState,
  formData: FormData,
): Promise<CounselorPrivateRecordActionState> {
  const { supabase, user } = await requireCounselor();
  const targetVerifier = createTrustedTargetVerifier(supabase);
  const state = await submitUpdateCounselorFollowUp(formData, {
    verifyTarget: targetVerifier.verify,
    update: async (studentId, recordId, payload) => {
      const { data, error } = await supabase
        .from("counselor_follow_ups")
        .update(payload)
        .eq("id", recordId)
        .eq("student_id", studentId)
        .eq("counselor_id", user.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      return { affected: Boolean(data), error };
    },
  });
  revalidateSuccessfulMutation(state, targetVerifier);
  return state;
}

export async function updateCounselorWorkloadFollowUp(
  _previousState: CounselorPrivateRecordActionState,
  formData: FormData,
): Promise<CounselorPrivateRecordActionState> {
  const { supabase, user } = await requireCounselor();
  const targetVerifier = createTrustedTargetVerifier(supabase);
  const state = await submitUpdateCounselorWorkloadFollowUp(formData, {
    verifyTarget: targetVerifier.verify,
    update: async (studentId, recordId, payload) => {
      const { data, error } = await supabase
        .from("counselor_follow_ups")
        .update(payload)
        .eq("id", recordId)
        .eq("student_id", studentId)
        .eq("counselor_id", user.id)
        .eq("status", "pending")
        .select("id")
        .maybeSingle();
      return { affected: Boolean(data), error };
    },
  });
  revalidateSuccessfulMutation(state, targetVerifier);
  return state;
}

async function recordCounselorFollowUpStatus(
  supabase: KgeoSupabaseClient,
  counselorId: string,
  formData: FormData,
  status: "completed" | "cancelled",
): Promise<CounselorPrivateRecordActionState> {
  const targetVerifier = createTrustedTargetVerifier(supabase);
  const state = await submitRecordCounselorFollowUpStatus(
    formData,
    status,
    {
      verifyTarget: targetVerifier.verify,
      record: async (studentId, recordId, trustedStatus) => {
        const ownedRecord = await supabase
          .from("counselor_follow_ups")
          .select("id")
          .eq("id", recordId)
          .eq("student_id", studentId)
          .eq("counselor_id", counselorId)
          .eq("status", "pending")
          .maybeSingle();
        if (ownedRecord.error || !ownedRecord.data) {
          return {
            data: undefined,
            affected: false,
            error: ownedRecord.error,
          };
        }
        const { data, error } = await supabase.rpc(
          "record_counselor_follow_up_status",
          {
            p_follow_up_id: recordId,
            p_status: trustedStatus,
          },
        );
        return { data: data ?? undefined, affected: data === trustedStatus, error };
      },
    },
  );
  revalidateSuccessfulMutation(state, targetVerifier);
  return state;
}

export async function completeCounselorFollowUp(
  _previousState: CounselorPrivateRecordActionState,
  formData: FormData,
): Promise<CounselorPrivateRecordActionState> {
  const { supabase, user } = await requireCounselor();
  return recordCounselorFollowUpStatus(
    supabase,
    user.id,
    formData,
    "completed",
  );
}

export async function cancelCounselorFollowUp(
  _previousState: CounselorPrivateRecordActionState,
  formData: FormData,
): Promise<CounselorPrivateRecordActionState> {
  const { supabase, user } = await requireCounselor();
  return recordCounselorFollowUpStatus(
    supabase,
    user.id,
    formData,
    "cancelled",
  );
}
