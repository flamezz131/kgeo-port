import { z } from "zod";

export const MAX_COUNSELOR_REFERENCE_IDS = 100;

const consultationIdSchema = z.uuid();
const referenceRowSchema = z
  .object({
    consultation_id: consultationIdSchema,
    request_number: z
      .string()
      .max(64)
      .regex(/^KGEOC-\d{4}-\d{6,19}$/),
  })
  .strict();

type ReferenceRpc = (
  consultationIds: string[],
) => Promise<{ data: unknown; error: unknown }>;

export type CounselorConsultationReferenceMap = ReadonlyMap<string, string>;

export async function loadCounselorConsultationReferences(
  consultationIds: readonly string[],
  callReferenceRpc: ReferenceRpc,
): Promise<CounselorConsultationReferenceMap | null> {
  const idResult = z
    .array(consultationIdSchema)
    .max(MAX_COUNSELOR_REFERENCE_IDS)
    .safeParse(consultationIds);
  if (!idResult.success) return null;

  const uniqueIds = [...new Set(idResult.data)];
  if (uniqueIds.length === 0) return new Map();

  try {
    const { data, error } = await callReferenceRpc(uniqueIds);
    if (error) return null;

    const rowsResult = z.array(referenceRowSchema).safeParse(data);
    if (!rowsResult.success || rowsResult.data.length !== uniqueIds.length) {
      return null;
    }

    const requestedIds = new Set(uniqueIds);
    const references = new Map<string, string>();
    for (const row of rowsResult.data) {
      if (
        !requestedIds.has(row.consultation_id) ||
        references.has(row.consultation_id)
      ) {
        return null;
      }
      references.set(row.consultation_id, row.request_number);
    }

    return references.size === uniqueIds.length ? references : null;
  } catch {
    return null;
  }
}

export function mergeCounselorConsultationReferences<
  T extends { id: string },
>(
  consultations: readonly T[],
  references: CounselorConsultationReferenceMap,
): Array<T & { request_number: string }> | null {
  const merged: Array<T & { request_number: string }> = [];

  for (const consultation of consultations) {
    const requestNumber = references.get(consultation.id);
    if (!requestNumber) return null;
    merged.push({ ...consultation, request_number: requestNumber });
  }

  return merged;
}
