import { z } from "zod";
import {
  HIGHER_STUDIES_INTEREST_OPTIONS,
  isAllowedCollegeEndYear,
  isCourse,
  isDepartmentForCourse,
} from "@/lib/consultations/options";
import {
  getAsiaKolkataBusinessDateTime,
  getBookingDateIssue,
  getBookingDateIssueMessage,
  isConsultationSlotStart,
  isSlotExpired,
} from "@/lib/consultations/booking";

type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: Record<string, string[]> };

const interestValues = HIGHER_STUDIES_INTEREST_OPTIONS.map(
  ({ value }) => value,
);

const courseSchema = z
  .string({ error: "Choose your course." })
  .refine(isCourse, "Choose a valid course.");

export function createConsultationRequestSchema(now = new Date()) {
  const businessToday = getAsiaKolkataBusinessDateTime(now).date;

  return z
    .object({
      studentName: z
        .string({ error: "Enter your name." })
        .trim()
        .min(2, "Student Name must contain at least 2 characters.")
        .max(150, "Student Name must not exceed 150 characters."),
      rollNumber: z
        .string({ error: "Enter your roll number." })
        .trim()
        .min(1, "Enter your roll number.")
        .max(50, "Roll Number must not exceed 50 characters.")
        .transform((value) => value.toUpperCase()),
      personalEmail: z
        .string({ error: "Enter your personal email address." })
        .trim()
        .toLowerCase()
        .pipe(z.email("Enter a valid personal email address.")),
      collegeEndYear: z
        .string({ error: "Choose your college end year." })
        .regex(/^\d{4}$/, "Choose a valid college end year.")
        .transform(Number)
        .refine(isAllowedCollegeEndYear, "Choose a valid college end year."),
      course: courseSchema,
      department: z
        .string({ error: "Choose your department." })
        .trim()
        .min(1, "Choose your department."),
      mobileNumber: z
        .string({ error: "Enter your mobile number." })
        .trim()
        .regex(/^\d{10}$/, "Mobile Number must contain exactly 10 digits."),
      higherStudiesInterest: z.enum(interestValues, {
        error: "Choose your higher-studies interest.",
      }),
      consultationDate: z
        .string({ error: "Choose a consultation date." })
        .superRefine((value, context) => {
          const issue = getBookingDateIssue(value, businessToday);
          if (issue) {
            context.addIssue({
              code: "custom",
              message: getBookingDateIssueMessage(issue),
            });
          }
        }),
      slotStart: z
        .string({ error: "Choose a consultation time slot." })
        .refine(isConsultationSlotStart, "Choose an available time slot."),
    })
    .strip()
    .superRefine((data, context) => {
      if (!isDepartmentForCourse(data.course, data.department)) {
        context.addIssue({
          code: "custom",
          path: ["department"],
          message: "Choose a department available for the selected course.",
        });
      }

      const dateIssue = getBookingDateIssue(
        data.consultationDate,
        businessToday,
      );
      if (
        !dateIssue &&
        isConsultationSlotStart(data.slotStart) &&
        isSlotExpired(data.consultationDate, data.slotStart, now)
      ) {
        context.addIssue({
          code: "custom",
          path: ["slotStart"],
          message: "This consultation time slot has already started or expired.",
        });
      }
    });
}

export type ConsultationRequestInput = z.infer<
  ReturnType<typeof createConsultationRequestSchema>
>;

export function validateConsultationRequest(
  formData: FormData,
  now = new Date(),
): ValidationResult<ConsultationRequestInput> {
  const result = createConsultationRequestSchema(now).safeParse({
    studentName: formData.get("studentName"),
    rollNumber: formData.get("rollNumber"),
    personalEmail: formData.get("personalEmail"),
    collegeEndYear: formData.get("collegeEndYear"),
    course: formData.get("course"),
    department: formData.get("department"),
    mobileNumber: formData.get("mobileNumber"),
    higherStudiesInterest: formData.get("higherStudiesInterest"),
    consultationDate: formData.get("consultationDate"),
    slotStart: formData.get("slotStart"),
  });

  if (!result.success) {
    const fieldErrors = z.flattenError(result.error).fieldErrors;
    const errors: Record<string, string[]> = {};

    for (const [field, messages] of Object.entries(fieldErrors)) {
      if (messages?.length) {
        errors[field] = messages;
      }
    }

    return {
      success: false,
      errors,
    };
  }

  return { success: true, data: result.data };
}
