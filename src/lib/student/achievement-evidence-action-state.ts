export type AchievementEvidenceMutationState =
  | { status: "success"; message: string; documentId: string }
  | { status: "error"; message: string };
