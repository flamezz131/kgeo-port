import { createClient } from "@/lib/supabase/client";

export async function uploadResume(
  file: File,
  studentId: string
): Promise<string> {
  const supabase = createClient();
  const path = `${studentId}/resume.pdf`;

  const { error } = await supabase.storage
    .from("student-resumes")
    .upload(path, file, { upsert: true });

  if (error) {
    throw new Error(`Failed to upload resume: ${error.message}`);
  }

  return path;
}
