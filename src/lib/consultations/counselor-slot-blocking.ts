import { z } from "zod";
import { CONSULTATION_SLOTS } from "@/lib/consultations/booking";

export type CounselorSlotBlockActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string[]>;
};

export const initialCounselorSlotBlockActionState: CounselorSlotBlockActionState = {
  status: "idle",
};

const canonicalSlotStarts = CONSULTATION_SLOTS.map((slot) => slot.start) as [
  string,
  ...string[],
];

const blockSchema = z.object({
  consultationDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a valid date."),
  slotStart: z.enum(canonicalSlotStarts, {
    error: "Choose a canonical 30-minute slot.",
  }),
  reason: z
    .string()
    .trim()
    .max(200, "Keep the internal reason within 200 characters."),
});

const releaseSchema = z.object({
  blockId: z.uuid("The slot block is invalid."),
});

export function parseCounselorSlotBlock(formData: FormData) {
  return blockSchema.safeParse({
    consultationDate: formData.get("consultationDate"),
    slotStart: formData.get("slotStart"),
    reason: formData.get("reason") ?? "",
  });
}

export function parseCounselorSlotBlockRelease(formData: FormData) {
  return releaseSchema.safeParse({ blockId: formData.get("blockId") });
}

export function getCounselorSlotBlockErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null) {
    const message = Reflect.get(error, "message");
    if (typeof message === "string") {
      const normalized = message.toLowerCase();
      if (normalized.includes("already occupies")) {
        return "A consultation is already assigned to you for that slot.";
      }
      if (normalized.includes("already blocked")) {
        return "That slot is already blocked.";
      }
      if (normalized.includes("future canonical")) {
        return "Choose a future Monday-to-Friday 30-minute slot.";
      }
    }
  }
  return "The slot block could not be updated. Please try again.";
}
