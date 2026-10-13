"use client";

import { useActionState } from "react";
import { continueWithKgeoAction } from "@/app/actions/consultation-continuation-actions";
import { initialContinueWithKgeoActionState } from "@/lib/consultations/continuation";

export function ContinueWithKgeoForm() {
  const [state, formAction, isPending] = useActionState(
    continueWithKgeoAction,
    initialContinueWithKgeoActionState,
  );

  return (
    <form action={formAction} aria-busy={isPending}>
      <button className="button button-small" disabled={isPending} type="submit">
        {isPending ? "Activating your case..." : "Continue with K-GEO"}
      </button>
      {state.message && (
        <p
          className={state.status === "success" ? "form-success" : "form-error"}
          role={state.status === "success" ? "status" : "alert"}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
