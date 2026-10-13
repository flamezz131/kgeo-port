"use client";

import { useActionState } from "react";
import { registerCounselor } from "@/app/actions/counselor-auth-actions";
import { FieldError } from "@/components/forms/field-error";
import {
  Field,
  FormError,
  FormStack,
  controlClass,
} from "@/components/shell/form-ui";
import { SubmitButton } from "@/components/ui/submit-button";

export function CounselorRegisterForm() {
  const [state, action, isPending] = useActionState(registerCounselor, null);

  return (
    <FormStack action={action} aria-busy={isPending}>
      {state?.message && <FormError>{state.message}</FormError>}

      <Field htmlFor="counselor-full-name" label="Full name">
        <input
          aria-describedby="counselor-full-name-error"
          aria-invalid={Boolean(state?.errors?.fullName)}
          autoComplete="name"
          className={controlClass}
          id="counselor-full-name"
          name="fullName"
          required
          type="text"
        />
        <FieldError
          id="counselor-full-name-error"
          messages={state?.errors?.fullName}
        />
      </Field>

      <Field
        hint="3–32 letters, numbers, periods, underscores, or hyphens."
        hintId="counselor-username-hint"
        htmlFor="counselor-username"
        label="Username"
      >
        <input
          aria-describedby="counselor-username-hint counselor-username-error"
          aria-invalid={Boolean(state?.errors?.username)}
          autoCapitalize="none"
          autoComplete="username"
          className={controlClass}
          id="counselor-username"
          name="username"
          pattern="[A-Za-z0-9._-]{3,32}"
          required
          spellCheck={false}
          type="text"
        />
        <FieldError
          id="counselor-username-error"
          messages={state?.errors?.username}
        />
      </Field>

      <Field htmlFor="counselor-password" label="Password">
        <input
          aria-describedby="counselor-password-error"
          aria-invalid={Boolean(state?.errors?.password)}
          autoComplete="new-password"
          className={controlClass}
          id="counselor-password"
          name="password"
          required
          type="password"
        />
        <FieldError
          id="counselor-password-error"
          messages={state?.errors?.password}
        />
      </Field>

      <Field htmlFor="counselor-confirm-password" label="Confirm password">
        <input
          aria-describedby="counselor-confirm-password-error"
          aria-invalid={Boolean(state?.errors?.confirmPassword)}
          autoComplete="new-password"
          className={controlClass}
          id="counselor-confirm-password"
          name="confirmPassword"
          required
          type="password"
        />
        <FieldError
          id="counselor-confirm-password-error"
          messages={state?.errors?.confirmPassword}
        />
      </Field>

      <SubmitButton pendingLabel="Creating counselor account…">
        Create counselor account
      </SubmitButton>
    </FormStack>
  );
}
