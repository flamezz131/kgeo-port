"use server";

import { redirect } from "next/navigation";
import { getSiteUrl } from "@/lib/env/site-url";
import { getRoleHomePath } from "@/lib/auth/role-redirect";
import { createClient } from "@/lib/supabase/server";
import { validateLogin, validateRegistration } from "@/lib/validation/auth";
import type { ActionState } from "@/types";

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

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, role, is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  const destination =
    !profileError &&
    profile?.id === data.user.id &&
    profile.is_active
      ? getRoleHomePath(profile.role)
      : null;

  if (!destination) {
    await supabase.auth.signOut({ scope: "local" });
    return {
      status: "error",
      message: "Your account is not currently authorized to access K-GEO.",
    };
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
  await supabase.auth.signOut();
  redirect("/login");
}
