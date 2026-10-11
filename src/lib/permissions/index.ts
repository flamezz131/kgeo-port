import "server-only";

import { redirect } from "next/navigation";
import { cache } from "react";
import { getRoleHomePath } from "@/lib/auth/role-redirect";
import { getStudentAccessDecision } from "@/lib/permissions/student-access";
import { getCounselorAccessDecision } from "@/lib/permissions/counselor-access";
import { getDirectorAccessDecision } from "@/lib/permissions/director-access";
import { createClient } from "@/lib/supabase/server";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  return { supabase, user };
}

export async function requireStudent() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/login");
  }

  if (!user.email_confirmed_at) {
    redirect("/verify-email");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, college_email, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  const studentProfile = profileError ? null : profile;
  const decision = getStudentAccessDecision(user, studentProfile);

  if (decision !== "allowed" || !studentProfile) {
    redirect("/login");
  }

  return { supabase, user, profile: studentProfile };
}

export async function requireCounselor() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/counselor/login");
  if (!user.email_confirmed_at) redirect("/counselor/login");

  const [profileResult, accountResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, full_name, role, is_active")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("counselor_accounts")
      .select("user_id, approval_status")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const counselorProfile = profileResult.error ? null : profileResult.data;
  const counselorAccount = accountResult.error ? null : accountResult.data;
  const decision = getCounselorAccessDecision(
    user,
    counselorProfile,
    counselorAccount,
  );
  if (decision === "pending") redirect("/counselor/pending");
  if (decision !== "allowed" || !counselorProfile) {
    redirect("/counselor/login");
  }

  return { supabase, user, profile: counselorProfile };
}

export async function requireAdmin() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") {
    redirect(getRoleHomePath(profile?.role) ?? "/login");
  }
  return { supabase, user };
}

export const requireDirector = cache(async function requireDirectorAccess() {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) redirect("/director/login");
  if (!user.email_confirmed_at) redirect("/director/login");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  const directorProfile = profileError ? null : profile;
  const decision = getDirectorAccessDecision(user, directorProfile);
  if (decision !== "allowed" || !directorProfile) {
    redirect("/director/login");
  }

  return { supabase, user, profile: directorProfile };
});
