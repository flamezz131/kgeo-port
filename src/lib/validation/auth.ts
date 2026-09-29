import { z } from "zod";
import { canonicalFullNameSchema } from "@/lib/validation/full-name";
import { institutionalEmailSchema } from "@/lib/validation/institutional-email";

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]> };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const counselorUsernamePattern = /^[a-z0-9._-]{3,32}$/;
const reservedCounselorUsernames = new Set([
  "admin",
  "administrator",
  "director",
  "kgeo",
  "root",
  "student",
  "support",
  "system",
]);

export function validateLogin(formData: FormData): ValidationResult<{
  email: string;
  password: string;
}> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const errors: Record<string, string[]> = {};

  if (!emailPattern.test(email)) errors.email = ["Enter a valid email address."];
  if (!password) errors.password = ["Enter your password."];

  return Object.keys(errors).length
    ? { success: false, errors }
    : { success: true, data: { email, password } };
}

export const registrationSchema = z
  .object({
    fullName: canonicalFullNameSchema,
    collegeEmail: institutionalEmailSchema,
    password: z
      .string()
      .min(8, "K-GEO Password must be at least 8 characters.")
      .regex(/[A-Za-z]/, "K-GEO Password must contain at least one letter.")
      .regex(/[0-9]/, "K-GEO Password must contain at least one number."),
    confirmPassword: z.string().min(1, "Confirm your K-GEO Password."),
    termsAccepted: z.literal("accepted", {
      error: "You must agree to the Terms and Privacy Policy.",
    }),
  })
  .superRefine(({ password, confirmPassword }, context) => {
    if (password !== confirmPassword) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "K-GEO Passwords do not match.",
      });
    }
  });

export function validateRegistration(formData: FormData): ValidationResult<{
  fullName: string;
  email: string;
  password: string;
}> {
  const duplicateErrors: Record<string, string[]> = {};
  for (const field of [
    "fullName",
    "collegeEmail",
    "password",
    "confirmPassword",
    "termsAccepted",
  ]) {
    if (formData.getAll(field).length > 1) {
      duplicateErrors[field] = ["Submit exactly one value for this field."];
    }
  }
  if (Object.keys(duplicateErrors).length) {
    return { success: false, errors: duplicateErrors };
  }

  const result = registrationSchema.safeParse({
    fullName: formData.get("fullName"),
    collegeEmail: formData.get("collegeEmail"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    termsAccepted: formData.get("termsAccepted"),
  });

  if (!result.success) {
    return {
      success: false,
      errors: z.flattenError(result.error).fieldErrors,
    };
  }

  return {
    success: true,
    data: {
      fullName: result.data.fullName,
      email: result.data.collegeEmail,
      password: result.data.password,
    },
  };
}


export const counselorRegistrationSchema = z
  .object({
    fullName: canonicalFullNameSchema,
    username: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        counselorUsernamePattern,
        "Use 3–32 lowercase letters, numbers, periods, underscores, or hyphens.",
      )
      .refine(
        (username) => !reservedCounselorUsernames.has(username),
        "Choose a different username.",
      ),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters.")
      .regex(/[A-Za-z]/, "Password must contain at least one letter.")
      .regex(/[0-9]/, "Password must contain at least one number."),
    confirmPassword: z.string().min(1, "Confirm your password."),
  })
  .superRefine(({ password, confirmPassword }, context) => {
    if (password !== confirmPassword) {
      context.addIssue({
        code: "custom",
        path: ["confirmPassword"],
        message: "Passwords do not match.",
      });
    }
  });

export function validateCounselorRegistration(formData: FormData): ValidationResult<{
  fullName: string;
  username: string;
  password: string;
}> {
  const duplicateErrors: Record<string, string[]> = {};
  for (const field of ["fullName", "username", "password", "confirmPassword"]) {
    if (formData.getAll(field).length > 1) {
      duplicateErrors[field] = ["Submit exactly one value for this field."];
    }
  }
  if (Object.keys(duplicateErrors).length) {
    return { success: false, errors: duplicateErrors };
  }

  const result = counselorRegistrationSchema.safeParse({
    fullName: formData.get("fullName"),
    username: formData.get("username"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!result.success) {
    return {
      success: false,
      errors: z.flattenError(result.error).fieldErrors,
    };
  }

  return {
    success: true,
    data: {
      fullName: result.data.fullName,
      username: result.data.username,
      password: result.data.password,
    },
  };
}

export function validateCounselorLogin(formData: FormData): ValidationResult<{
  username: string;
  password: string;
}> {
  const duplicateErrors: Record<string, string[]> = {};
  for (const field of ["username", "password"]) {
    if (formData.getAll(field).length > 1) {
      duplicateErrors[field] = ["Submit exactly one value for this field."];
    }
  }
  if (Object.keys(duplicateErrors).length) {
    return { success: false, errors: duplicateErrors };
  }

  const username = String(formData.get("username") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const errors: Record<string, string[]> = {};

  if (!counselorUsernamePattern.test(username)) {
    errors.username = ["Enter a valid username."];
  }
  if (!password) errors.password = ["Enter your password."];

  return Object.keys(errors).length
    ? { success: false, errors }
    : { success: true, data: { username, password } };
}

export function validateDirectorLogin(formData: FormData): ValidationResult<{
  email: string;
  password: string;
}> {
  const duplicateErrors: Record<string, string[]> = {};
  for (const field of ["email", "password"]) {
    if (formData.getAll(field).length > 1) {
      duplicateErrors[field] = ["Submit exactly one value for this field."];
    }
  }
  if (Object.keys(duplicateErrors).length) {
    return { success: false, errors: duplicateErrors };
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const errors: Record<string, string[]> = {};

  if (!emailPattern.test(email) || email.split("@")[1] !== "kclas.ac.in") {
    errors.email = ["Use your exact @kclas.ac.in Director email address."];
  }
  if (!password) errors.password = ["Enter your password."];

  return Object.keys(errors).length
    ? { success: false, errors }
    : { success: true, data: { email, password } };
}
