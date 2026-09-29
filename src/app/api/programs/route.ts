import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { backendUrl } from "@/lib/recommendations/backend";

export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const targetUrl = backendUrl("api/programs");
  const internalSecret = process.env.INTERNAL_API_SECRET;

  if (!targetUrl || !internalSecret) {
    console.error(
      "Server configuration error in /api/programs: Missing KGEO_BACKEND_URL or INTERNAL_API_SECRET."
    );
    return NextResponse.json(
      { error: "Server configuration error" },
      { status: 500 }
    );
  }

  try {
    const backendResponse = await fetch(targetUrl, {
      method: "GET",
      headers: {
        "x-internal-secret": internalSecret,
      },
      // Using next: { revalidate: 3600 } or similar could be done, but dynamic fetch is safer for now
      cache: 'no-store'
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
        `KGEO backend returned error status ${backendResponse.status} for /api/programs. Response body:`,
        jsonResponse
      );
    }

    return NextResponse.json(jsonResponse, { status: backendResponse.status });
  } catch (fetchError) {
    console.error(
      "Failed to forward request to KGEO backend. Error:",
      fetchError instanceof Error ? { message: fetchError.message, stack: fetchError.stack } : fetchError
    );
    return NextResponse.json(
      { error: "Failed to communicate with recommendation backend" },
      { status: 502 }
    );
  }
}
