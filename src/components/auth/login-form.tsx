"use client";

import { useActionState } from "react";
import { login } from "@/app/actions/auth-actions";
import { FieldError } from "@/components/forms/field-error";
import {
  Field,
  FormError,
  FormStack,
  controlClass,
} from "@/components/shell/form-ui";
import { SubmitButton } from "@/components/ui/submit-button";
import { initialActionState } from "@/types";

export function LoginForm() {
  const [state, action, isPending] = useActionState(login, initialActionState);

  return (
    <FormStack action={action} aria-busy={isPending}>
      {state.message && <FormError>{state.message}</FormError>}

      <Field htmlFor="email" label="Email address">
        <input
          aria-describedby="login-email-error"
          aria-invalid={Boolean(state.errors?.email)}
          autoComplete="email"
          className={controlClass}
          id="email"
          name="email"
          required
          type="email"
        />
        <FieldError id="login-email-error" messages={state.errors?.email} />
      </Field>

      <Field htmlFor="password" label="Password">
        <input
          aria-describedby="login-password-error"
          aria-invalid={Boolean(state.errors?.password)}
          autoComplete="current-password"
          className={controlClass}
          id="password"
          name="password"
          required
          type="password"
        />
        <FieldError
          id="login-password-error"
          messages={state.errors?.password}
        />
      </Field>

      <SubmitButton pendingLabel="Logging in...">Log in</SubmitButton>
    </FormStack>
  );
}
