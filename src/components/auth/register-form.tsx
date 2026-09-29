"use client";

import { useActionState } from "react";
import { register } from "@/app/actions/auth-actions";
import { FieldError } from "@/components/forms/field-error";
import {
  Field,
  FormError,
  FormStack,
  controlClass,
} from "@/components/shell/form-ui";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  INSTITUTIONAL_EMAIL_INPUT_PATTERN,
  institutionalEmailSchema,
} from "@/lib/validation/institutional-email";
import { PROFILE_FULL_NAME_MAX_LENGTH } from "@/lib/validation/full-name";
import { initialActionState } from "@/types";

/** Registration fields use a softer border than the shared control default. */
const registrationControl = `${controlClass} border-[#dce6f2]`;

export function RegisterForm() {
  const [state, action, isPending] = useActionState(
    register,
    initialActionState,
  );

  return (
    <FormStack
      action={action}
      aria-busy={isPending}
      className="mt-0 [&_.button]:border-[var(--brand-600)] [&_.button]:bg-[var(--brand-600)] [&_.button:hover]:bg-[var(--brand-900)]"
    >
      {state.message && <FormError>{state.message}</FormError>}

      <Field
        hint="Used as your current K-GEO profile name."
        hintId="fullName-hint"
        htmlFor="fullName"
        label="Full Name"
      >
        <input
          aria-describedby="fullName-hint fullName-error"
          aria-invalid={Boolean(state.errors?.fullName)}
          autoComplete="name"
          className={registrationControl}
          id="fullName"
          maxLength={PROFILE_FULL_NAME_MAX_LENGTH}
          name="fullName"
          onBlur={(event) => {
            event.currentTarget.value = event.currentTarget.value
              .trim()
              .replace(/\s+/g, " ");
          }}
          placeholder="Your full name"
          required
          type="text"
        />
        <FieldError id="fullName-error" messages={state.errors?.fullName} />
      </Field>

      <Field
        hint="Use your exact @kct.ac.in student email."
        hintId="collegeEmail-hint"
        htmlFor="collegeEmail"
        label="College Email ID"
      >
        <input
          aria-describedby="collegeEmail-hint collegeEmail-error"
          aria-invalid={Boolean(state.errors?.collegeEmail)}
          autoCapitalize="none"
          autoComplete="email"
          className={registrationControl}
          id="collegeEmail"
          inputMode="email"
          name="collegeEmail"
          onBlur={(event) => {
            const result = institutionalEmailSchema.safeParse(
              event.currentTarget.value,
            );
            event.currentTarget.value = result.success
              ? result.data
              : event.currentTarget.value.trim().toLowerCase();
          }}
          onInput={(event) => {
            event.currentTarget.value = event.currentTarget.value
              .trim()
              .toLowerCase();
          }}
          pattern={INSTITUTIONAL_EMAIL_INPUT_PATTERN}
          placeholder="yourname@kct.ac.in"
          required
          type="email"
        />
        <FieldError
          id="collegeEmail-error"
          messages={state.errors?.collegeEmail}
        />
      </Field>

      <Field
        hint="At least 8 characters with one letter and one number. Do not use your college Microsoft or Outlook password."
        hintId="password-hint"
        htmlFor="password"
        label="K-GEO Password"
      >
        <input
          aria-describedby="password-hint password-error"
          aria-invalid={Boolean(state.errors?.password)}
          autoComplete="new-password"
          className={registrationControl}
          id="password"
          minLength={8}
          name="password"
          pattern="(?=.*[A-Za-z])(?=.*[0-9]).{8,}"
          required
          title="Use at least 8 characters with one letter and one number."
          type="password"
        />
        <FieldError id="password-error" messages={state.errors?.password} />
      </Field>

      <Field htmlFor="confirmPassword" label="Confirm K-GEO Password">
        <input
          aria-describedby="confirmPassword-error"
          aria-invalid={Boolean(state.errors?.confirmPassword)}
          autoComplete="new-password"
          className={registrationControl}
          id="confirmPassword"
          minLength={8}
          name="confirmPassword"
          required
          type="password"
        />
        <FieldError
          id="confirmPassword-error"
          messages={state.errors?.confirmPassword}
        />
      </Field>

      <div className="grid grid-cols-[auto_1fr] items-start gap-[0.7rem]">
        <input
          aria-describedby="termsAccepted-error"
          aria-invalid={Boolean(state.errors?.termsAccepted)}
          className="mt-[0.15rem] size-[1.1rem] accent-[var(--brand-600)]"
          id="termsAccepted"
          name="termsAccepted"
          required
          type="checkbox"
          value="accepted"
        />
        <div className="[&_.form-error]:mt-2 [&_.form-error]:block">
          <label
            className="text-[0.9rem] leading-normal text-[var(--ink-body)]"
            htmlFor="termsAccepted"
          >
            I agree to the K-GEO Terms and Privacy Policy.
          </label>
          <FieldError
            id="termsAccepted-error"
            messages={state.errors?.termsAccepted}
          />
        </div>
      </div>

      <SubmitButton pendingLabel="Creating account...">
        Create K-GEO account
      </SubmitButton>
    </FormStack>
  );
}
