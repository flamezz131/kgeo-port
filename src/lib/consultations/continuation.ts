export type ContinueWithKgeoActionState = {
  status: "idle" | "error" | "success";
  message?: string;
};

export const initialContinueWithKgeoActionState: ContinueWithKgeoActionState = {
  status: "idle",
};

type ContinueWithKgeoStore = {
  activate: () => Promise<{ data: boolean | null; error: unknown }>;
};

function readErrorText(error: unknown, property: string) {
  if (typeof error !== "object" || error === null) return "";
  try {
    const value = Reflect.get(error, property);
    return typeof value === "string" ? value : "";
  } catch {
    return "";
  }
}

function getSafeContinuationError(
  error: unknown,
): ContinueWithKgeoActionState {
  const code = readErrorText(error, "code");
  const internalMessage = readErrorText(error, "message").toLowerCase();

  if (
    code === "55000" &&
    internalMessage.includes("staff review is required")
  ) {
    return {
      status: "error",
      message:
        "K-GEO staff review is required before your counseling case can be activated.",
    };
  }

  if (code === "22023") {
    return {
      status: "error",
      message:
        "Only your completed consultation can be used to continue with K-GEO.",
    };
  }

  if (code === "42501") {
    return {
      status: "error",
      message: "This account cannot activate a K-GEO counseling case.",
    };
  }

  return {
    status: "error",
    message: "We could not activate your K-GEO case. Please try again.",
  };
}

export async function submitContinueWithKgeo(
  store: ContinueWithKgeoStore,
): Promise<ContinueWithKgeoActionState> {
  try {
    const result = await store.activate();
    if (result.error || typeof result.data !== "boolean") {
      return getSafeContinuationError(result.error);
    }
  } catch (error) {
    return getSafeContinuationError(error);
  }

  return {
    status: "success",
    message: "Your K-GEO counseling case is active.",
  };
}
