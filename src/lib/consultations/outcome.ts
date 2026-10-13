import { z } from "zod";

export type ConsultationOutcome = "completed" | "no_show";

export type ConsultationOutcomeActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: { consultationId?: string[] };
};

export const initialConsultationOutcomeActionState: ConsultationOutcomeActionState =
  { status: "idle" };

type OutcomeStore = {
  record: (
    consultationId: string,
    outcome: ConsultationOutcome,
  ) => Promise<{ data: string | null; error: unknown }>;
};

function readErrorCode(error: unknown) {
  if (typeof error !== "object" || error === null) return "";
  try {
    const value = Reflect.get(error, "code");
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function getSafeOutcomeError(error: unknown): ConsultationOutcomeActionState {
  const code = readErrorCode(error);
  if (code === "42501") {
    return {
      status: "error",
      message: "This account cannot record consultation outcomes.",
    };
  }
  if (code === "22023") {
    return {
      status: "error",
      message:
        "This consultation is not ready for an outcome. Refresh the schedule and try again.",
    };
  }
  if (code === "40001") {
    return {
      status: "error",
      message: "The consultation changed. Refresh the schedule and try again.",
    };
  }
  return {
    status: "error",
    message: "We could not record the outcome. Please try again.",
  };
}

export async function submitConsultationOutcome(
  formData: FormData,
  outcome: ConsultationOutcome,
  store: OutcomeStore,
): Promise<ConsultationOutcomeActionState> {
  if (formData.getAll("consultationId").length !== 1) {
    return {
      status: "error",
      message: "Choose one valid consultation and try again.",
      errors: {
        consultationId: ["Submit exactly one consultation identifier."],
      },
    };
  }

  const validation = z
    .uuid("Choose one valid consultation and try again.")
    .safeParse(formData.get("consultationId"));
  if (!validation.success) {
    return {
      status: "error",
      message: "Choose one valid consultation and try again.",
      errors: {
        consultationId: validation.error.issues.map((issue) => issue.message),
      },
    };
  }

  try {
    const result = await store.record(validation.data, outcome);
    if (result.error) return getSafeOutcomeError(result.error);
    if (result.data !== outcome) return getSafeOutcomeError(null);
  } catch (error) {
    return getSafeOutcomeError(error);
  }

  return {
    status: "success",
    message:
      outcome === "completed"
        ? "Consultation marked completed."
        : "Consultation marked as student no-show.",
  };
}
