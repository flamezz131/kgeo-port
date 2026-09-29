import type { ConsultationActionState } from "@/types";

export function isConsultationSubmissionLocked(
  isPending: boolean,
  state: ConsultationActionState,
): boolean {
  return isPending || state.status === "success";
}
