import "server-only";

export type DirectorAssignmentDatabaseFailure = {
  databaseMessage: string;
  userMessage: string;
  field?: "counselorId";
};

const databaseFailureMappings: ReadonlyArray<DirectorAssignmentDatabaseFailure> = [
  {
    databaseMessage:
      "The student is awaiting initial counselor assignment through the consultation queue",
    userMessage:
      "This student has not received an initial Primary Counselor yet. Initial assignment must happen through the FCFS consultation queue.",
  },
  {
    databaseMessage: "The selected counselor is already assigned",
    userMessage:
      "The selected Counselor is already this student's Primary Counselor.",
    field: "counselorId",
  },
  {
    databaseMessage:
      "Resolve the student's active consultation before reassigning the Primary Counselor",
    userMessage:
      "This student has an active consultation with the current Counselor. Complete or resolve that consultation before reassignment.",
  },
  {
    databaseMessage: "Primary counselor assignment target is invalid",
    userMessage: "Select an approved and active Counselor.",
    field: "counselorId",
  },
  {
    databaseMessage: "The Primary Counselor assignment changed concurrently",
    userMessage:
      "The assignment changed while you were working. Refresh the page and try again.",
  },
];

export function mapDirectorAssignmentDatabaseFailure(
  value: unknown,
): DirectorAssignmentDatabaseFailure | null {
  if (
    typeof value !== "object" ||
    value === null ||
    !("message" in value) ||
    typeof value.message !== "string"
  ) {
    return null;
  }

  return (
    databaseFailureMappings.find(
      (failure) => failure.databaseMessage === value.message,
    ) ?? null
  );
}
