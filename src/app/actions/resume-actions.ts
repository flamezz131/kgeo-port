"use server";

import { createClient } from "@/lib/supabase/server";

type ResumeActionResult = { success: true } | { success: false; error: string };

/**
 * Resolves the signed-in student and checks the id the client sent matches,
 * so one student can never write another student's resume path.
 */
async function getAuthorizedStudent(studentId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== studentId) return null;
  return { supabase, user };
}

/**
 * Saves the uploaded resume path to the student's profile.
 */
export async function linkResumeToProfile(
  studentId: string,
  path: string,
): Promise<ResumeActionResult> {
  const session = await getAuthorizedStudent(studentId);
  if (!session) return { success: false, error: "You are not signed in." };

  // Verify that the path strictly belongs to the student's own folder and has .pdf extension
  if (!path.startsWith(`${session.user.id}/`) || !path.toLowerCase().endsWith(".pdf")) {
    return { success: false, error: "Invalid resume file path." };
  }

  const { error } = await session.supabase
    .from("student_profiles")
    .update({ resume_path: path })
    .eq("student_id", session.user.id);

  if (error) {
    console.error("Failed to link resume to profile:", error);
    return { success: false, error: "Failed to update profile with resume." };
  }
  return { success: true };
}

/**
 * Removes the resume from storage and clears the path in the database.
 */
export async function removeResume(
  studentId: string,
  path: string,
): Promise<ResumeActionResult> {
  const session = await getAuthorizedStudent(studentId);
  if (!session) return { success: false, error: "You are not signed in." };

  if (!path.startsWith(`${session.user.id}/`)) {
    return { success: false, error: "Invalid resume file path." };
  }

  // 1. Remove from DB first so it instantly disappears from UI, even if storage deletion fails
  const { error: dbError } = await session.supabase
    .from("student_profiles")
    .update({ resume_path: null })
    .eq("student_id", session.user.id);

  if (dbError) {
    console.error("Failed to remove resume from DB:", dbError);
    return { success: false, error: "Failed to remove resume record." };
  }

  // 2. Remove from Storage
  const { error: storageError } = await session.supabase.storage
    .from("student-resumes")
    .remove([path]);

  if (storageError) {
    // The DB record is already cleared, so the student can upload a new one;
    // the old file is overwritten on the next upload (upsert: true).
    console.error("Failed to remove resume from storage:", storageError);
  }

  return { success: true };
}
