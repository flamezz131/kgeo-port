"use server";

import { revalidatePath } from "next/cache";
import {
  submitStudentAcademics,
  submitStudentIdentity,
  submitStudentPreferences,
} from "@/lib/profiles/submission";
import type { ProfileActionState } from "@/lib/profiles/types";
import { requireStudent } from "@/lib/permissions";

function revalidateStudentProfile() {
  revalidatePath("/student/profile");
  revalidatePath("/student/dashboard");
}

export async function saveStudentIdentity(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const { supabase, user } = await requireStudent();

  const state = await submitStudentIdentity(formData, {
    save: async (payload) => {
      const { error } = await supabase.rpc("save_student_identity", payload);
      return { error };
    },
    loadStoredGraduationYear: async () => {
      const { data, error } = await supabase
        .from("student_profiles")
        .select("graduation_year")
        .eq("student_id", user.id)
        .maybeSingle();
      return error ? null : (data?.graduation_year ?? null);
    },
  });

  if (state.status === "success") {
    revalidateStudentProfile();
    revalidatePath("/counselor/students");
  }
  return state;
}

export async function saveStudentAcademics(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const { supabase, user } = await requireStudent();

  const state = await submitStudentAcademics(formData, {
    findExisting: async () => {
      const { data, error } = await supabase
        .from("student_profiles")
        .select("student_id")
        .eq("student_id", user.id)
        .maybeSingle();
      return { exists: Boolean(data), error };
    },
    update: async (payload) => {
      const { data, error } = await supabase
        .from("student_profiles")
        .update(payload)
        .eq("student_id", user.id)
        .select("student_id")
        .maybeSingle();
      return { error: error ?? (data ? null : { code: "PROFILE_NOT_FOUND" }) };
    },
  });

  if (state.status === "success") revalidateStudentProfile();
  return state;
}

export async function saveStudentPreferences(
  _previousState: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const { supabase, user } = await requireStudent();

  const state = await submitStudentPreferences(formData, {
    findProfile: async () => {
      const { data, error } = await supabase
        .from("student_profiles")
        .select("student_id")
        .eq("student_id", user.id)
        .maybeSingle();
      return { exists: Boolean(data), error };
    },
    findExisting: async () => {
      const { data, error } = await supabase
        .from("student_preferences")
        .select("student_id")
        .eq("student_id", user.id)
        .maybeSingle();
      return { exists: Boolean(data), error };
    },
    insert: async (payload) => {
      const { error } = await supabase
        .from("student_preferences")
        .insert(payload)
        .select("student_id")
        .single();
      return { error };
    },
    update: async (payload) => {
      const { data, error } = await supabase
        .from("student_preferences")
        .update(payload)
        .eq("student_id", user.id)
        .select("student_id")
        .maybeSingle();
      return { error: error ?? (data ? null : { code: "PROFILE_NOT_FOUND" }) };
    },
  });

  if (state.status === "success") revalidateStudentProfile();
  return state;
}
