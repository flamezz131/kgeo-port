"use client";

import { useActionState } from "react";
import { loginDirector } from "@/app/actions/director-auth-actions";
import { FieldError } from "@/components/forms/field-error";
import {
  Field,
  FormError,
  FormStack,
  controlClass,
} from "@/components/shell/form-ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/types";

export function DirectorLoginForm() {
  const [state, action, isPending] = useActionState(
    loginDirector,
    initialActionState,
  );

  return (
    <FormStack action={action} aria-busy={isPending}>
      {state.message && <FormError>{state.message}</FormError>}

      <Field
        hint="Use your authorized @kclas.ac.in Director identity."
        hintId="director-email-hint"
        htmlFor="director-email"
        label="Institutional email"
      >
        <input
          aria-describedby="director-email-hint director-email-error"
          aria-invalid={Boolean(state.errors?.email)}
          autoCapitalize="none"
          autoComplete="email"
          className={controlClass}
          id="director-email"
          name="email"
          required
          spellCheck={false}
          type="email"
        />
        <FieldError id="director-email-error" messages={state.errors?.email} />
      </Field>

      <Field htmlFor="director-password" label="Password">
        <input
          aria-describedby="director-password-error"
          aria-invalid={Boolean(state.errors?.password)}
          autoComplete="current-password"
          className={controlClass}
          id="director-password"
          name="password"
          required
          type="password"
        />
        <FieldError
          id="director-password-error"
          messages={state.errors?.password}
        />
      </Field>

      <SubmitButton pendingLabel="Signing in…">
        Sign in to Director Portal
      </SubmitButton>
    </FormStack>
  );
}
