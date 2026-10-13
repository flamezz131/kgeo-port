import { NextResponse } from "next/server";
import {
  UNIVERSITY_APPLICATION_DOCUMENT_SIGNED_VIEW_SECONDS,
  isUniversityApplicationDocumentUuid,
  parseUniversityApplicationDocumentViewAuthorization,
} from "@/lib/counselor/university-application-documents";
import { isTrustedUniversityApplicationDocumentSignedViewUrl } from "@/lib/counselor/university-application-document-view-url";
import { requireCounselor } from "@/lib/permissions";
import { getSupabaseEnv } from "@/lib/supabase/env";

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
} as const;

function unavailableResponse(): Response {
  return new Response("Document could not be opened.", {
    status: 404,
    headers: noStoreHeaders,
  });
}

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      "application-id": string;
      "document-id": string;
    }>;
  },
) {
  const { supabase } = await requireCounselor();
  try {
    const parameters = await context.params;
    const applicationId = parameters["application-id"];
    const documentId = parameters["document-id"];
    if (
      !isUniversityApplicationDocumentUuid(applicationId) ||
      !isUniversityApplicationDocumentUuid(documentId)
    ) {
      return unavailableResponse();
    }

    const { data, error } = await supabase
      .rpc("authorize_university_application_document_view", {
        p_application_id: applicationId,
        p_document_id: documentId,
      })
      .maybeSingle();
    const authorization = error
      ? null
      : parseUniversityApplicationDocumentViewAuthorization(data, {
          applicationId,
          documentId,
        });
    if (!authorization) return unavailableResponse();

    const { data: signedView, error: signedViewError } =
      await supabase.storage
        .from(authorization.bucketId)
        .createSignedUrl(
          authorization.storagePath,
          UNIVERSITY_APPLICATION_DOCUMENT_SIGNED_VIEW_SECONDS,
        );
    if (
      signedViewError ||
      !signedView ||
      !isTrustedUniversityApplicationDocumentSignedViewUrl(
        signedView.signedUrl,
        getSupabaseEnv().url,
        authorization.bucketId,
        authorization.storagePath,
      )
    ) {
      return unavailableResponse();
    }

    const response = NextResponse.redirect(signedView.signedUrl, 307);
    for (const [name, value] of Object.entries(noStoreHeaders)) {
      response.headers.set(name, value);
    }
    return response;
  } catch {
    return unavailableResponse();
  }
}
