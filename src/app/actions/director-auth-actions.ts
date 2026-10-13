"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { validateDirectorLogin } from "@/lib/validation/auth";
import type { ActionState } from "@/types";

const genericDirectorLoginError = "Invalid email or password.";

export async function loginDirector(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateDirectorLogin(formData);
  if (!validation.success) {
    return { status: "error", errors: validation.errors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(
    validation.data,
  );

  if (error || !data.user?.email_confirmed_at) {
    return { status: "error", message: genericDirectorLoginError };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();

  if (
    profileError ||
    profile?.id !== data.user.id ||
    profile.role !== "director" ||
    !profile.is_active
  ) {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", message: genericDirectorLoginError };
  }

  redirect("/director/dashboard");
}
