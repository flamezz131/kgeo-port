"use server";

import { revalidatePath } from "next/cache";
import { getAsiaKolkataBusinessDateTime } from "@/lib/consultations/booking";
import {
  submitCreateStudentAchievement,
  submitCreateStudentTestScore,
  submitDeleteStudentAchievement,
  submitDeleteStudentTestScore,
  submitUpdateStudentAchievement,
  submitUpdateStudentTestScore,
} from "@/lib/profiles/optional-record-submission";
import type { StudentOptionalRecordActionState } from "@/lib/profiles/optional-record-types";
import { requireStudent } from "@/lib/permissions";

function revalidateOptionalProfileRecords(studentId: string) {
  revalidatePath("/student/profile");
  revalidatePath("/student/dashboard");
  revalidatePath(`/counselor/students/${studentId}`);
}

export async function createStudentTestScore(
  _previousState: StudentOptionalRecordActionState,
  formData: FormData,
): Promise<StudentOptionalRecordActionState> {
  const { supabase, user } = await requireStudent();
  const businessToday = getAsiaKolkataBusinessDateTime(new Date()).date;
  const state = await submitCreateStudentTestScore(
    formData,
    businessToday,
    {
      create: async (payload) => {
        const { data, error } = await supabase
          .from("student_test_scores")
          .insert(payload)
          .select("id")
          .maybeSingle();
        return { affected: Boolean(data), error };
      },
    },
  );

  if (state.status === "success") {
    revalidateOptionalProfileRecords(user.id);
  }
  return state;
}

export async function updateStudentTestScore(
  _previousState: StudentOptionalRecordActionState,
  formData: FormData,
): Promise<StudentOptionalRecordActionState> {
  const { supabase, user } = await requireStudent();
  const businessToday = getAsiaKolkataBusinessDateTime(new Date()).date;
  const state = await submitUpdateStudentTestScore(
    formData,
    businessToday,
    {
      update: async (recordId, payload) => {
        const { data, error } = await supabase
          .from("student_test_scores")
          .update(payload)
          .eq("id", recordId)
          .eq("student_id", user.id)
          .select("id")
          .maybeSingle();
        return { affected: Boolean(data), error };
      },
    },
  );

  if (state.status === "success") {
    revalidateOptionalProfileRecords(user.id);
  }
  return state;
}

export async function deleteStudentTestScore(
  _previousState: StudentOptionalRecordActionState,
  formData: FormData,
): Promise<StudentOptionalRecordActionState> {
  const { supabase, user } = await requireStudent();
  const state = await submitDeleteStudentTestScore(formData, {
    delete: async (recordId) => {
      const { data, error } = await supabase
        .from("student_test_scores")
        .delete()
        .eq("id", recordId)
        .eq("student_id", user.id)
        .select("id")
        .maybeSingle();
      return { affected: Boolean(data), error };
    },
  });

  if (state.status === "success") {
    revalidateOptionalProfileRecords(user.id);
  }
  return state;
}

export async function createStudentAchievement(
  _previousState: StudentOptionalRecordActionState,
  formData: FormData,
): Promise<StudentOptionalRecordActionState> {
  const { supabase, user } = await requireStudent();
  const businessToday = getAsiaKolkataBusinessDateTime(new Date()).date;
  const state = await submitCreateStudentAchievement(
    formData,
    businessToday,
    {
      create: async (payload) => {
        const { data, error } = await supabase
          .from("student_achievements")
          .insert(payload)
          .select("id")
          .maybeSingle();
        return { affected: Boolean(data), error };
      },
    },
  );

  if (state.status === "success") {
    revalidateOptionalProfileRecords(user.id);
  }
  return state;
}

export async function updateStudentAchievement(
  _previousState: StudentOptionalRecordActionState,
  formData: FormData,
): Promise<StudentOptionalRecordActionState> {
  const { supabase, user } = await requireStudent();
  const businessToday = getAsiaKolkataBusinessDateTime(new Date()).date;
  const state = await submitUpdateStudentAchievement(
    formData,
    businessToday,
    {
      update: async (recordId, payload) => {
        const { data, error } = await supabase
          .from("student_achievements")
          .update(payload)
          .eq("id", recordId)
          .eq("student_id", user.id)
          .select("id")
          .maybeSingle();
        return { affected: Boolean(data), error };
      },
    },
  );

  if (state.status === "success") {
    revalidateOptionalProfileRecords(user.id);
  }
  return state;
}

export async function deleteStudentAchievement(
  _previousState: StudentOptionalRecordActionState,
  formData: FormData,
): Promise<StudentOptionalRecordActionState> {
  const { supabase, user } = await requireStudent();
  const state = await submitDeleteStudentAchievement(formData, {
    delete: async (recordId) => {
      const { data, error } = await supabase
        .from("student_achievements")
        .delete()
        .eq("id", recordId)
        .eq("student_id", user.id)
        .select("id")
        .maybeSingle();
      return { affected: Boolean(data), error };
    },
  });

  if (state.status === "success") {
    revalidateOptionalProfileRecords(user.id);
  }
  return state;
}
