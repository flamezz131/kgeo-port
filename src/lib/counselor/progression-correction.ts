import type {
  OfficialProgressionCorrectionAudit,
  OfficialProgressionEvent,
  OfficialProgressionReadyResult,
} from "@/lib/counselor/progression";
import type { ProgressionEvidenceLoadResult } from "@/lib/counselor/progression-evidence";

export const PROGRESSION_CORRECTION_EVIDENCE_BLOCK_MESSAGE =
  "Supporting evidence must be removed or allowed to expire before this progression update can be reversed.";

export type OfficialProgressionCorrectionAction =
  | "undo"
  | "reset";

export type OfficialProgressionEventPresentation = {
  event: OfficialProgressionEvent;
  correction: OfficialProgressionCorrectionAudit | null;
  correctionAction: OfficialProgressionCorrectionAction | null;
  evidenceBlock: "available" | "pending" | null;
  isInitializationEvent: boolean;
  isLatestEffectiveEvent: boolean;
};

export type OfficialProgressionHistoryPresentation = {
  correctionMetadataAvailable: boolean;
  evidenceMetadataAvailable: boolean;
  events: OfficialProgressionEventPresentation[];
};

export function buildOfficialProgressionHistoryPresentation(
  progression: OfficialProgressionReadyResult,
  evidence: ProgressionEvidenceLoadResult,
): OfficialProgressionHistoryPresentation {
  const correctionMetadataAvailable =
    progression.corrections.kind === "ready";
  const evidenceMetadataAvailable = evidence.kind === "ready";

  return {
    correctionMetadataAvailable,
    evidenceMetadataAvailable,
    events: progression.events.map((event) => {
      const correction =
        progression.corrections.kind === "ready"
          ? progression.corrections.correctionByEvent[event.id] ?? null
          : null;
      const isInitializationEvent =
        event.previous_stage === null && event.previous_state === null;
      const isLatestEffectiveEvent =
        progression.corrections.kind === "ready" &&
        correction === null &&
        progression.corrections.latestEffectiveEventId === event.id;
      const evidenceBlock =
        evidence.kind === "ready"
          ? evidence.correctionBlockByEvent[event.id] ?? null
          : null;
      const correctionAction =
        isLatestEffectiveEvent &&
        progression.current !== null &&
        evidence.kind === "ready" &&
        evidenceBlock === null
          ? isInitializationEvent
            ? "reset"
            : "undo"
          : null;

      return {
        event,
        correction,
        correctionAction,
        evidenceBlock,
        isInitializationEvent,
        isLatestEffectiveEvent,
      };
    }),
  };
}
