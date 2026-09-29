import { z } from "zod";

export const COUNSELOR_ASSIGNMENT_QUEUE_LIMIT = 10;

export type ConsultationAssignmentActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export const initialConsultationAssignmentActionState: ConsultationAssignmentActionState =
  { status: "idle" };

type ClaimNextConsultation = () => Promise<{
  data: unknown;
  error: unknown;
}>;

function readErrorCode(error: unknown): string {
  if (typeof error !== "object" || error === null) return "";
  try {
    const value = Reflect.get(error, "code");
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

export async function submitClaimNextConsultation(
  claim: ClaimNextConsultation,
): Promise<ConsultationAssignmentActionState> {
  try {
    const { data, error } = await claim();
    if (error) {
      const code = readErrorCode(error);
      if (code === "42501") {
        return {
          status: "error",
          message: "This account cannot claim consultations.",
        };
      }
      if (code === "40001") {
        return {
          status: "error",
          message:
            "The queue changed while claiming. Review the refreshed queue and try again.",
        };
      }
      return {
        status: "error",
        message: "The next consultation could not be claimed. Please try again.",
      };
    }

    if (data === null) {
      return {
        status: "error",
        message: "No booked consultation is currently waiting for assignment.",
      };
    }

    if (!z.uuid().safeParse(data).success) {
      return {
        status: "error",
        message: "The next consultation could not be claimed. Please try again.",
      };
    }

    return {
      status: "success",
      message: "The next FCFS consultation is now assigned to you.",
    };
  } catch {
    return {
      status: "error",
      message: "The next consultation could not be claimed. Please try again.",
    };
  }
}
