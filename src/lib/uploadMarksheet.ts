import { createClient } from "@/lib/supabase/client";

export async function uploadMarksheet(
  file: File,
  studentId: string,
  label: "tenth" | "twelfth"
): Promise<string> {
  const supabase = createClient();
  const parts = file.name.split(".");
  const ext = parts.length > 1 ? parts.pop()?.toLowerCase() || "pdf" : "pdf";
  const path = `${studentId}/${label}_marksheet.${ext}`;

  const { error } = await supabase.storage
    .from("academic-documents")
    .upload(path, file, { upsert: true });

  if (error) {
    throw new Error(`Failed to upload ${label} marksheet: ${error.message}`);
  }

  return path;
}
