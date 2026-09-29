import { NextResponse } from "next/server";
import { getSiteUrl } from "@/lib/env/site-url";
import {
  getEmailVerificationRedirectPath,
  parseEmailVerificationParameters,
  verifyStudentEmail,
} from "@/lib/auth/email-verification";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const parameters = parseEmailVerificationParameters(url.searchParams);
  let verified = false;

  if (parameters) {
    try {
      const supabase = await createClient();
      verified = await verifyStudentEmail(parameters, supabase.auth);
    } catch {
      verified = false;
    }
  }

  const destination = getEmailVerificationRedirectPath(verified);
  const response = NextResponse.redirect(new URL(destination, getSiteUrl()));
  response.headers.set("Cache-Control", "private, no-store, max-age=0");
  return response;
}
