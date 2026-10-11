import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

const publicStaffAuthPaths = new Set([
  "/counselor/login",
  "/counselor/register",
  "/counselor/pending",
  "/director/login",
]);

function normalizePathname(pathname: string): string {
  const normalized = pathname.replace(/\/+$/, "");
  return normalized || "/";
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const pathname = normalizePathname(request.nextUrl.pathname);

  if (publicStaffAuthPaths.has(pathname)) {
    return response;
  }

  const { url, publishableKey } = getSupabaseEnv();

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims.sub) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname =
      pathname === "/counselor" || pathname.startsWith("/counselor/")
        ? "/counselor/login"
        : pathname === "/director" || pathname.startsWith("/director/")
          ? "/director/login"
          : "/login";
    loginUrl.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}
