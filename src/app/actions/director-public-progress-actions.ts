"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { PublishPublicProgressActionState } from "@/lib/director/public-progress-action-state";
import { requireDirector } from "@/lib/permissions";

const statisticSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  z.coerce.number().int().nonnegative().safe(),
);

const publishSchema = z.object({
  applications_initiated: statisticSchema,
  applications_submitted: statisticSchema,
  offers_received: statisticSchema,
  confirmed_acceptance: statisticSchema,
  visa_approved: statisticSchema,
  enrolled_overseas: statisticSchema,
});

export async function publishPublicProgressAction(
  _previousState: PublishPublicProgressActionState,
  formData: FormData,
): Promise<PublishPublicProgressActionState> {
  const { supabase } = await requireDirector();
  const validation = publishSchema.safeParse({
    applications_initiated: formData.get("applications_initiated"),
    applications_submitted: formData.get("applications_submitted"),
    offers_received: formData.get("offers_received"),
    confirmed_acceptance: formData.get("confirmed_acceptance"),
    visa_approved: formData.get("visa_approved"),
    enrolled_overseas: formData.get("enrolled_overseas"),
  });

  if (!validation.success) {
    return {
      status: "error",
      message: "Enter all six statistics as whole numbers of zero or more.",
      errors: validation.error.flatten().fieldErrors,
    };
  }

  const value = validation.data;
  const { data, error } = await supabase.rpc("publish_kgeo_public_progress", {
    p_registered_for_advisory: 0,
    p_applications_initiated: value.applications_initiated,
    p_applications_submitted: value.applications_submitted,
    p_offers_received: value.offers_received,
    p_confirmed_acceptance: value.confirmed_acceptance,
    p_visa_approved: value.visa_approved,
    p_enrolled_overseas: value.enrolled_overseas,
  });

  if (error || !data || data.length !== 1) {
    return {
      status: "error",
      message: "K-GEO public statistics could not be saved. Please try again.",
    };
  }

  revalidatePath("/");
  revalidatePath("/director/public-progress");
  return {
    status: "success",
    message: "K-GEO public statistics saved and published successfully.",
    publishedAt: data[0].published_at,
  };
}
