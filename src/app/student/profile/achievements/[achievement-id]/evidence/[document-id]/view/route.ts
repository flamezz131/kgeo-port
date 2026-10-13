import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/permissions";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  STUDENT_ACHIEVEMENT_DOCUMENT_SIGNED_VIEW_SECONDS,
  isAchievementEvidenceUuid,
  isTrustedAchievementEvidenceSignedUrl,
  parseStudentAchievementDocumentViewAuthorization,
} from "@/lib/student/achievement-evidence";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
} as const;

function unavailableResponse() {
  return new Response("Achievement evidence could not be opened.", {
    status: 404,
    headers: noStoreHeaders,
  });
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{ "achievement-id": string; "document-id": string }>;
  },
) {
  const { supabase, user } = await requireStudent();
  const parameters = await context.params;
  const achievementId = parameters["achievement-id"];
  const documentId = parameters["document-id"];
  if (
    !isAchievementEvidenceUuid(achievementId) ||
    !isAchievementEvidenceUuid(documentId)
  ) {
    return unavailableResponse();
  }

  const authorizationResult = await supabase
    .rpc("authorize_student_achievement_document_view", {
      p_student_id: user.id,
      p_achievement_id: achievementId,
      p_document_id: documentId,
    })
    .maybeSingle();
  const authorization = authorizationResult.error
    ? null
    : parseStudentAchievementDocumentViewAuthorization(
        authorizationResult.data,
        documentId,
      );
  if (!authorization) return unavailableResponse();

  const signedResult = await supabase.storage
    .from(authorization.bucket_id)
    .createSignedUrl(
      authorization.storage_path,
      STUDENT_ACHIEVEMENT_DOCUMENT_SIGNED_VIEW_SECONDS,
    );
  if (
    signedResult.error ||
    !signedResult.data ||
    !isTrustedAchievementEvidenceSignedUrl(
      signedResult.data.signedUrl,
      getSupabaseEnv().url,
      authorization.storage_path,
    )
  ) {
    return unavailableResponse();
  }
  const response = NextResponse.redirect(signedResult.data.signedUrl, 307);
  for (const [name, value] of Object.entries(noStoreHeaders)) {
    response.headers.set(name, value);
  }
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
