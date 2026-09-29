"use client";

import { useActionState } from "react";
import { loginCounselor } from "@/app/actions/counselor-auth-actions";
import { FieldError } from "@/components/forms/field-error";
import {
  Field,
  FormError,
  FormStack,
  controlClass,
} from "@/components/shell/form-ui";
import { SubmitButton } from "@/components/ui/submit-button";

export function CounselorLoginForm() {
  const [state, action, isPending] = useActionState(loginCounselor, null);

  return (
    <FormStack action={action} aria-busy={isPending}>
      {state?.message && <FormError>{state.message}</FormError>}

      <Field htmlFor="counselor-login-username" label="Username">
        <input
          aria-describedby="counselor-login-username-error"
          aria-invalid={Boolean(state?.errors?.username)}
          autoCapitalize="none"
          autoComplete="username"
          className={controlClass}
          id="counselor-login-username"
          name="username"
          required
          spellCheck={false}
          type="text"
        />
        <FieldError
          id="counselor-login-username-error"
          messages={state?.errors?.username}
        />
      </Field>

      <Field htmlFor="counselor-login-password" label="Password">
        <input
          aria-describedby="counselor-login-password-error"
          aria-invalid={Boolean(state?.errors?.password)}
          autoComplete="current-password"
          className={controlClass}
          id="counselor-login-password"
          name="password"
          required
          type="password"
        />
        <FieldError
          id="counselor-login-password-error"
          messages={state?.errors?.password}
        />
      </Field>

      <SubmitButton pendingLabel="Signing in…">
        Sign in to Counselor Portal
      </SubmitButton>
    </FormStack>
  );
}
