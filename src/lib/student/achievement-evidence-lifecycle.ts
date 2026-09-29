import type {
  StudentAchievementDocumentRemovalReason,
  StudentAchievementDocumentStatus,
} from "@/types";

export type AchievementEvidenceLifecycle = {
  status: StudentAchievementDocumentStatus;
  objectPresent: boolean;
  removalReason: StudentAchievementDocumentRemovalReason | null;
};

export type AchievementEvidenceTransition =
  | { accepted: true; next: AchievementEvidenceLifecycle }
  | { accepted: false; next: AchievementEvidenceLifecycle };

function accepted(next: AchievementEvidenceLifecycle): AchievementEvidenceTransition {
  return { accepted: true, next };
}

function rejected(current: AchievementEvidenceLifecycle): AchievementEvidenceTransition {
  return { accepted: false, next: current };
}

export function commitAuthenticatedAchievementEvidenceUpload(
  current: AchievementEvidenceLifecycle,
  reservationIsUnexpired = true,
): AchievementEvidenceTransition {
  if (current.status !== "pending" || !reservationIsUnexpired) {
    return rejected(current);
  }
  return accepted({ ...current, objectPresent: true });
}

export function finalizeAchievementEvidenceUpload(
  current: AchievementEvidenceLifecycle,
): AchievementEvidenceTransition {
  if (current.status !== "pending" || !current.objectPresent) {
    return rejected(current);
  }
  return accepted({ ...current, status: "available" });
}

export function requestAchievementEvidenceRemoval(
  current: AchievementEvidenceLifecycle,
  expectedStatus: "pending" | "available" | "removal_pending",
): AchievementEvidenceTransition {
  if (current.status !== expectedStatus) return rejected(current);
  const removalReason =
    current.status === "available"
      ? "student_delete"
      : current.status === "pending"
        ? "pending_cancel"
        : current.removalReason;
  if (!removalReason) return rejected(current);
  return accepted({ ...current, status: "removal_pending", removalReason });
}

export function rejectInvalidAchievementEvidence(
  current: AchievementEvidenceLifecycle,
): AchievementEvidenceTransition {
  if (current.status !== "pending") return rejected(current);
  return accepted({
    ...current,
    status: "removal_pending",
    removalReason: "invalid_file",
  });
}

export function deleteAchievementEvidenceObject(
  current: AchievementEvidenceLifecycle,
): AchievementEvidenceTransition {
  if (current.status !== "removal_pending") return rejected(current);
  return accepted({ ...current, objectPresent: false });
}

export function completeAchievementEvidenceRemoval(
  current: AchievementEvidenceLifecycle,
): AchievementEvidenceTransition {
  if (current.status !== "removal_pending" || current.objectPresent) {
    return rejected(current);
  }
  return accepted({ ...current, status: "removed" });
}

export function canDeleteAchievementWithEvidence(
  evidence: readonly AchievementEvidenceLifecycle[],
): boolean {
  return evidence.every((document) => document.status === "removed");
}
