import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { backendUrl } from "@/lib/recommendations/backend";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Override / inject studentId from the authenticated user session
  const payload = {
    ...body,
    studentId: user.id,
  };

  const targetUrl = backendUrl("api/pr-intake");
  const internalSecret = process.env.INTERNAL_API_SECRET;

  if (!targetUrl || !internalSecret) {
    console.error(
      "Server configuration error in /api/recommendations/pr-intake: Missing KGEO_BACKEND_URL or INTERNAL_API_SECRET. KGEO_BACKEND_URL:",
      process.env.KGEO_BACKEND_URL,
      "INTERNAL_API_SECRET:",
      internalSecret ? "[SET]" : "[MISSING]"
    );
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const backendResponse = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-internal-secret": internalSecret,
      },
      body: JSON.stringify(payload),
    });

    const responseData = await backendResponse.text();
    let jsonResponse: unknown;
    try {
      jsonResponse = JSON.parse(responseData);
    } catch {
      jsonResponse = { raw: responseData };
    }

    if (!backendResponse.ok) {
      console.error(
        `KGEO backend returned error status ${backendResponse.status} for /api/pr-intake. Response body:`,
        jsonResponse
      );
    }

    return NextResponse.json(jsonResponse, { status: backendResponse.status });
  } catch (fetchError) {
    console.error(
      "Failed to forward request to KGEO backend. Error:",
      fetchError instanceof Error ? { message: fetchError.message, stack: fetchError.stack, cause: fetchError.cause } : fetchError
    );
    return NextResponse.json(
      { error: "Failed to communicate with recommendation backend" },
      { status: 502 }
    );
  }
}

