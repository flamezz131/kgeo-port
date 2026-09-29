"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  deleteStudentAchievementEvidenceAction,
  uploadStudentAchievementEvidenceAction,
} from "@/app/actions/student-achievement-evidence-actions";
import {
  STUDENT_ACHIEVEMENT_DOCUMENT_ACCEPT,
  formatAchievementEvidenceDate,
  formatAchievementEvidenceSize,
  validateAchievementEvidenceFile,
} from "@/lib/student/achievement-evidence";
import type { StudentAchievementDocument } from "@/types";

export function StudentAchievementEvidence({
  achievementId,
  achievementTitle,
  documents,
  unavailable = false,
}: {
  achievementId: string;
  achievementTitle: string;
  documents: StudentAchievementDocument[];
  unavailable?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || unavailable) return;
    const formElement = event.currentTarget;
    const selectedFile = fileRef.current?.files?.[0] ?? null;
    if (!selectedFile) {
      setMessage("");
      setError("Select one evidence file.");
      return;
    }
    const file = validateAchievementEvidenceFile(selectedFile);
    if (!file.success) {
      setMessage("");
      setError(file.message);
      return;
    }

    setPending(true);
    setError("");
    setMessage("Uploading and validating evidence…");
    try {
      if (fileRef.current?.files?.[0] !== selectedFile) {
        setMessage("");
        setError("The selected file changed. Select it again and retry.");
        return;
      }
      const uploadForm = new FormData();
      uploadForm.set("achievementId", achievementId);
      uploadForm.set("evidenceFile", selectedFile);
      const result = await uploadStudentAchievementEvidenceAction(uploadForm);
      if (result.status !== "success") {
        setMessage("");
        setError(result.message);
        return;
      }
      formElement.reset();
      setMessage(result.message);
      router.refresh();
    } catch {
      setMessage("");
      setError("The evidence could not be uploaded. Please retry.");
    } finally {
      setPending(false);
    }
  }

  async function deleteEvidence(document: StudentAchievementDocument) {
    if (
      pending ||
      !window.confirm(`Delete “${document.documentName}”? This cannot be undone.`)
    ) {
      return;
    }
    setPending(true);
    setError("");
    setMessage("Deleting evidence…");
    try {
      const form = new FormData();
      form.set("documentId", document.documentId);
      form.set("expectedStatus", document.status);
      const result = await deleteStudentAchievementEvidenceAction(form);
      if (result.status !== "success") {
        setMessage("");
        setError(result.message);
        return;
      }
      setMessage(result.message);
      router.refresh();
    } catch {
      setMessage("");
      setError("The evidence could not be deleted. Please retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      className="grid min-w-[min(20rem,75vw)] gap-[0.65rem] [&>strong]:text-[0.85rem] [&>strong]:text-[var(--ink)] [&_small]:m-0 [&_small]:text-[0.8rem] [&_small]:text-[var(--muted)]"
      aria-busy={pending}
    >
      <strong>Evidence / Certificates</strong>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      {unavailable ? (
        <p className="m-0 text-[0.8rem] text-[var(--muted)]" role="alert">
          Evidence is temporarily unavailable.
        </p>
      ) : documents.length === 0 ? (
        <p className="m-0 text-[0.8rem] text-[var(--muted)]">No evidence uploaded</p>
      ) : (
        <ul className="m-0 grid list-none gap-[0.55rem] p-0 [&_li>span:first-child]:grid [&_li>span:first-child]:gap-[0.35rem] [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:gap-3 [&_li]:rounded-[0.65rem] [&_li]:border [&_li]:border-[#dce6f2] [&_li]:p-[0.65rem]">
          {documents.map((document) => (
            <li key={document.documentId}>
              <span>
                {document.documentName}
                <small>
                  {document.mimeType} · {formatAchievementEvidenceSize(document.fileSizeBytes)} · {document.availableAt
                    ? `Uploaded ${formatAchievementEvidenceDate(document.availableAt)}`
                    : `Prepared ${formatAchievementEvidenceDate(document.preparedAt)}`}
                </small>
              </span>
              <span className="flex items-center gap-[0.6rem]">
                {document.status === "available" ? (
                  <a
                    className="cursor-pointer border-0 bg-transparent p-0 font-[750] underline [text-underline-offset:0.2em] text-[var(--brand-600)]"
                    href={`/student/profile/achievements/${achievementId}/evidence/${document.documentId}/view`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View
                  </a>
                ) : document.status === "pending" ? (
                  <small>Upload incomplete</small>
                ) : (
                  <small>Deletion pending</small>
                )}
                <button
                  aria-label={`Delete ${document.documentName} from ${achievementTitle}`}
                  className="cursor-pointer border-0 bg-transparent p-0 font-[750] underline [text-underline-offset:0.2em] text-[var(--brand-600)] text-[var(--bad)]"
                  disabled={pending}
                  onClick={() => void deleteEvidence(document)}
                  type="button"
                >
                  {document.status === "pending"
                    ? "Cancel upload"
                    : document.status === "removal_pending"
                      ? "Retry delete"
                      : "Delete"}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
      {!unavailable && (
        <form
          className="grid gap-[0.35rem] rounded-[0.65rem] bg-[var(--brand-50)] p-[0.7rem] [&_.button]:[justify-self:start] [&_label]:text-[0.82rem] [&_label]:font-bold [&_label]:text-[var(--ink)]"
          onSubmit={handleUpload}
        >
          <label htmlFor={`achievement-evidence-${achievementId}`}>
            Upload Evidence
          </label>
          <input
            accept={STUDENT_ACHIEVEMENT_DOCUMENT_ACCEPT}
            disabled={pending}
            id={`achievement-evidence-${achievementId}`}
            name="evidenceFile"
            ref={fileRef}
            required
            type="file"
          />
          <small>PDF, JPEG, or PNG. Maximum 10 MB.</small>
          <button className="button button-secondary" disabled={pending} type="submit">
            {pending ? "Working…" : "Upload Evidence"}
          </button>
        </form>
      )}
    </div>
  );
}
