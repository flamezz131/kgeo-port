import { z } from "zod";

export const counselorCaseAccessStateSchema = z.enum([
  "primary",
  "managed_by_other",
  "unassigned",
]);

export type CounselorCaseAccessState = z.infer<
  typeof counselorCaseAccessStateSchema
>;

const caseAccessRowsSchema = z
  .array(
    z
      .object({ access_state: counselorCaseAccessStateSchema })
      .strict(),
  )
  .length(1);

export type CounselorCaseAccessResult =
  | { kind: "ready"; state: CounselorCaseAccessState }
  | { kind: "unavailable" };

export function parseCounselorCaseAccess(value: unknown): CounselorCaseAccessState {
  return caseAccessRowsSchema.parse(value)[0].access_state;
}

export function getCounselorCaseAccessMessage(
  state: Exclude<CounselorCaseAccessState, "primary">,
): string {
  return state === "managed_by_other"
    ? "Managed by another Primary Counselor. Long-term case records are read-only."
    : "Primary Counselor assignment required before case updates.";
}
