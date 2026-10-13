"use server";

import { redirect } from "next/navigation";
import { getSiteUrl } from "@/lib/env/site-url";
import { ROLE_HOME_PATHS, getRoleHomePath } from "@/lib/auth/role-redirect";
import { getStudentAccessDecision } from "@/lib/permissions/student-access";
import { createClient } from "@/lib/supabase/server";
import { validateLogin, validateRegistration } from "@/lib/validation/auth";
import type { ActionState } from "@/types";

const studentOnlyLoginError =
  "This sign-in page is for active, verified Student accounts only. K-GEO staff must use their dedicated staff portal.";

export async function login(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateLogin(formData);
  if (!validation.success) {
    return { status: "error", errors: validation.errors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(
    validation.data,
  );

  if (error || !data.user?.email_confirmed_at) {
    return { status: "error", message: "Email or password is incorrect." };
  }

  // This route signs in Students only. The portal decision comes from the
  // trusted stored profile, never from the institution selected in the form.
  const { data: loadedProfile, error: profileError } = await supabase
    .from("profiles")
    .select("id, college_email, full_name, role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  const profile = profileError ? null : loadedProfile;
  const decision = getStudentAccessDecision(data.user, profile);
  const destination =
    decision === "allowed" && profile ? getRoleHomePath(profile.role) : null;

  if (destination !== ROLE_HOME_PATHS.student) {
    await supabase.auth.signOut({ scope: "local" });
    return { status: "error", message: studentOnlyLoginError };
  }

  redirect(destination);
}

export async function register(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const validation = validateRegistration(formData);
  if (!validation.success) {
    return { status: "error", errors: validation.errors };
  }

  let signupFailed = false;

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signUp({
      email: validation.data.email,
      password: validation.data.password,
      options: {
        data: {
          full_name: validation.data.fullName,
        },
        emailRedirectTo: `${getSiteUrl()}/auth/confirm`,
      },
    });
    signupFailed = Boolean(error);
  } catch {
    signupFailed = true;
  }

  if (signupFailed) {
    return {
      status: "error",
      message: "We could not create your account. Please try again shortly.",
    };
  }

  redirect("/verify-email");
}

export async function logout() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Staff return to their own portal's sign-in page; everyone else to /login.
  let destination = "/login";
  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();
    if (profile?.role === "counselor") destination = "/counselor/login";
    if (profile?.role === "director") destination = "/director/login";
  }

  await supabase.auth.signOut();
  redirect(destination);
}
