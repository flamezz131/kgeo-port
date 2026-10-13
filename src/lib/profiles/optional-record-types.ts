export type StudentOptionalRecordOperation =
  | "create_exam"
  | "update_exam"
  | "delete_exam"
  | "create_achievement"
  | "update_achievement"
  | "delete_achievement";

export type StudentOptionalRecordActionState = {
  status: "idle" | "error" | "success";
  message?: string;
  errors?: Record<string, string[]>;
  operation?: StudentOptionalRecordOperation;
};

export const initialStudentOptionalRecordActionState: StudentOptionalRecordActionState =
  { status: "idle" };
