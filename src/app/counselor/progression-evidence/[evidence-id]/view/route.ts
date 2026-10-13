import { NextResponse } from "next/server";
import {
  PROGRESSION_EVIDENCE_SIGNED_VIEW_SECONDS,
  parseTrustedProgressionEvidenceOperationRow,
} from "@/lib/counselor/progression-evidence";
import {
  loadProgressionEvidenceOperationRow,
  verifyCounselorProgressionEventTarget,
} from "@/lib/counselor/progression-evidence-server";
import { isTrustedProgressionEvidenceSignedViewUrl } from "@/lib/counselor/progression-evidence-view-url";
import { requireCounselor } from "@/lib/permissions";
import { getSupabaseEnv } from "@/lib/supabase/env";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
} as const;

function unavailableResponse() {
  return new Response("Evidence could not be opened.", {
    status: 404,
    headers: noStoreHeaders,
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ "evidence-id": string }> },
) {
  const { supabase } = await requireCounselor();
  const evidenceId = (await context.params)["evidence-id"];
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      evidenceId,
    )
  ) {
    return unavailableResponse();
  }

  const { data: evidenceData, error: evidenceError } =
    await loadProgressionEvidenceOperationRow(supabase, evidenceId);
  if (
    evidenceError ||
    !evidenceData ||
    evidenceData.status !== "available"
  ) {
    return unavailableResponse();
  }

  const event = await supabase
    .from("student_counseling_progression_events")
    .select("id, student_id")
    .eq("id", evidenceData.progression_event_id)
    .maybeSingle();
  if (
    event.error ||
    !event.data ||
    !(await verifyCounselorProgressionEventTarget(
      supabase,
      event.data.student_id,
      evidenceData.progression_event_id,
    )).valid
  ) {
    return unavailableResponse();
  }

  const evidence = parseTrustedProgressionEvidenceOperationRow(
    evidenceData,
    {
      studentId: event.data.student_id,
      progressionEventId: event.data.id,
      evidenceId,
      status: "available",
    },
  );
  if (!evidence) return unavailableResponse();

  const { data: signedView, error: signedViewError } =
    await supabase.storage
      .from(evidence.bucket_id)
      .createSignedUrl(
        evidence.storage_path,
        PROGRESSION_EVIDENCE_SIGNED_VIEW_SECONDS,
      );
  if (
    signedViewError ||
    !signedView ||
    !isTrustedProgressionEvidenceSignedViewUrl(
      signedView.signedUrl,
      getSupabaseEnv().url,
      evidence.bucket_id,
      evidence.storage_path,
    )
  ) {
    return unavailableResponse();
  }

  const response = NextResponse.redirect(signedView.signedUrl, 307);
  for (const [name, value] of Object.entries(noStoreHeaders)) {
    response.headers.set(name, value);
  }
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
