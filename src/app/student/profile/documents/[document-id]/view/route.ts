import { NextResponse } from "next/server";
import { requireStudent } from "@/lib/permissions";
import { getSupabaseEnv } from "@/lib/supabase/env";
import {
  STUDENT_PROFILE_DOCUMENT_SIGNED_VIEW_SECONDS,
  isProfileDocumentUuid,
  isTrustedProfileDocumentSignedUrl,
  parseProfileDocumentViewAuthorization,
} from "@/lib/student/profile-documents";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
} as const;

function unavailableResponse() {
  return new Response("Profile document could not be opened.", {
    status: 404,
    headers: noStoreHeaders,
  });
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ "document-id": string }> },
) {
  const { supabase, user } = await requireStudent();
  const documentId = (await context.params)["document-id"];
  if (!isProfileDocumentUuid(documentId)) return unavailableResponse();

  const authorizationResult = await supabase
    .rpc("authorize_student_profile_document_view", {
      p_student_id: user.id,
      p_document_id: documentId,
    })
    .maybeSingle();
  const authorization = authorizationResult.error
    ? null
    : parseProfileDocumentViewAuthorization(
        authorizationResult.data,
        documentId,
      );
  if (!authorization) return unavailableResponse();

  const signedResult = await supabase.storage
    .from(authorization.bucket_id)
    .createSignedUrl(
      authorization.storage_path,
      STUDENT_PROFILE_DOCUMENT_SIGNED_VIEW_SECONDS,
    );
  if (
    signedResult.error ||
    !signedResult.data ||
    !isTrustedProfileDocumentSignedUrl(
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
