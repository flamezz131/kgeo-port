"use client";

import { useActionState, useState } from "react";
import { login } from "@/app/actions/auth-actions";
import { FieldError } from "@/components/forms/field-error";
import {
  Field,
  FormError,
  FormStack,
  controlClass,
} from "@/components/shell/form-ui";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  DEFAULT_STUDENT_INSTITUTION,
  STUDENT_INSTITUTIONS,
  getStudentInstitutionEmailHint,
  getStudentInstitutionEmailPlaceholder,
  isStudentInstitution,
  type StudentInstitution,
} from "@/lib/auth/student-institutions";
import { initialActionState } from "@/types";

export function LoginForm() {
  const [state, action, isPending] = useActionState(login, initialActionState);
  // Display-only state. The server re-validates institution and email domain,
  // and the portal is still chosen from the stored profile role.
  const [institution, setInstitution] = useState<StudentInstitution>(
    DEFAULT_STUDENT_INSTITUTION,
  );

  return (
    <FormStack action={action} aria-busy={isPending}>
      {state.message && <FormError>{state.message}</FormError>}

      <Field htmlFor="institution" label="Institution">
        <select
          aria-describedby="login-institution-error"
          aria-invalid={Boolean(state.errors?.institution)}
          className={controlClass}
          id="institution"
          name="institution"
          onChange={(event) => {
            if (isStudentInstitution(event.currentTarget.value)) {
              setInstitution(event.currentTarget.value);
            }
          }}
          required
          value={institution}
        >
          {STUDENT_INSTITUTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
        <FieldError
          id="login-institution-error"
          messages={state.errors?.institution}
        />
      </Field>

      <Field
        hint={getStudentInstitutionEmailHint(institution)}
        hintId="login-email-hint"
        htmlFor="email"
        label="Email address"
      >
        <input
          aria-describedby="login-email-hint login-email-error"
          aria-invalid={Boolean(state.errors?.email)}
          autoCapitalize="none"
          autoComplete="email"
          className={controlClass}
          id="email"
          name="email"
          placeholder={getStudentInstitutionEmailPlaceholder(institution)}
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
