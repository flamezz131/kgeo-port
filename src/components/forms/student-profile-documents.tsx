"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  deleteStudentProfileDocumentAction,
  finalizeStudentProfileDocumentUploadAction,
  prepareStudentProfileDocumentUploadAction,
} from "@/app/actions/student-profile-document-actions";
import { createClient } from "@/lib/supabase/client";
import {
  STUDENT_PROFILE_DOCUMENT_ACCEPT,
  STUDENT_PROFILE_DOCUMENT_MAX_ACTIVE,
  STUDENT_PROFILE_DOCUMENT_TYPES,
  STUDENT_PROFILE_DOCUMENT_TYPE_LABELS,
  formatProfileDocumentDate,
  formatProfileDocumentSize,
  validateProfileDocumentDisplayName,
  validateProfileDocumentFile,
  validateProfileDocumentType,
} from "@/lib/student/profile-documents";
import type { StudentProfileDocument } from "@/types";
import { sectionPlainClass } from "@/components/shell/form-ui";

export function StudentProfileDocuments({
  documents,
  unavailable = false,
}: {
  documents: StudentProfileDocument[];
  unavailable?: boolean;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [retryFinalizeDocumentId, setRetryFinalizeDocumentId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || unavailable) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const documentType = validateProfileDocumentType(
      String(form.get("documentType") ?? ""),
    );
    const displayName = validateProfileDocumentDisplayName(
      String(form.get("displayName") ?? ""),
    );
    const selectedFile = fileRef.current?.files?.[0] ?? null;
    const file = selectedFile
      ? validateProfileDocumentFile(selectedFile)
      : { success: false as const, message: "Select one document file." };
    if (!documentType.success || !displayName.success || !file.success || !selectedFile) {
      setMessage("");
      if (!documentType.success) setError(documentType.message);
      else if (!displayName.success) setError(displayName.message);
      else if (!file.success) setError(file.message);
      else setError("Select one document file.");
      return;
    }

    setPending(true);
    setError("");
    setRetryFinalizeDocumentId(null);
    setMessage("Preparing secure upload…");
    try {
      const prepareForm = new FormData();
      prepareForm.set("documentType", documentType.data);
      prepareForm.set("displayName", displayName.data);
      prepareForm.set("originalFileName", file.data.originalFileName);
      prepareForm.set("mimeType", file.data.mimeType);
      prepareForm.set("fileSizeBytes", String(file.data.fileSizeBytes));
      const prepared = await prepareStudentProfileDocumentUploadAction(prepareForm);
      if (prepared.status !== "success") {
        setMessage("");
        setError(prepared.message);
        return;
      }
      if (fileRef.current?.files?.[0] !== selectedFile) {
        setMessage("");
        setError("The selected file changed. Select it again and retry.");
        return;
      }

      setMessage("Uploading document…");
      const uploaded = await supabase.storage
        .from(prepared.upload.bucketId)
        .uploadToSignedUrl(
          prepared.upload.path,
          prepared.upload.token,
          selectedFile,
          { contentType: prepared.upload.mimeType },
        );
      if (
        uploaded.error ||
        uploaded.data?.path !== prepared.upload.path ||
        uploaded.data.fullPath !==
          `${prepared.upload.bucketId}/${prepared.upload.path}`
      ) {
        setMessage("");
        setError("The document could not be uploaded. Please retry.");
        return;
      }

      setMessage("Finalizing document…");
      const finalizeForm = new FormData();
      finalizeForm.set("documentId", prepared.upload.documentId);
      const finalized =
        await finalizeStudentProfileDocumentUploadAction(finalizeForm);
      if (finalized.status !== "success") {
        setMessage("");
        setError(finalized.message);
        setRetryFinalizeDocumentId(prepared.upload.documentId);
        return;
      }
      setRetryFinalizeDocumentId(null);
      formElement.reset();
      setMessage(finalized.message);
      router.refresh();
    } catch {
      setMessage("");
      setError("The document could not be uploaded. Please retry.");
    } finally {
      setPending(false);
    }
  }

  async function retryFinalization() {
    if (pending || !retryFinalizeDocumentId) return;
    setPending(true);
    setError("");
    setMessage("Finalizing document…");
    try {
      const form = new FormData();
      form.set("documentId", retryFinalizeDocumentId);
      const result = await finalizeStudentProfileDocumentUploadAction(form);
      if (result.status !== "success") {
        setMessage("");
        setError(result.message);
        return;
      }
      setRetryFinalizeDocumentId(null);
      setMessage(result.message);
      router.refresh();
    } catch {
      setMessage("");
      setError("The document upload could not be finalized. Please retry.");
    } finally {
      setPending(false);
    }
  }

  async function deleteDocument(document: StudentProfileDocument) {
    if (
      pending ||
      !window.confirm(`Delete “${document.displayName}”? This cannot be undone.`)
    ) {
      return;
    }
    setPending(true);
    setError("");
    setMessage("Deleting document…");
    try {
      const form = new FormData();
      form.set("documentId", document.documentId);
      const result = await deleteStudentProfileDocumentAction(form);
      if (result.status !== "success") {
        setMessage("");
        setError(result.message);
        return;
      }
      setMessage(result.message);
      router.refresh();
    } catch {
      setMessage("");
      setError("The document could not be deleted. Please retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-labelledby="profile-documents-heading" className={`${sectionPlainClass} border-t border-[#dce6f2] pt-10`}>
      <header>
        <h2 id="profile-documents-heading">Documents</h2>
        <p>Upload documents that can be reused during your K-GEO higher-studies journey.</p>
      </header>

      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="form-success" role="status">{message}</p>}
      {retryFinalizeDocumentId && (
        <button
          className="button button-secondary"
          disabled={pending}
          onClick={() => void retryFinalization()}
          type="button"
        >
          Retry finalization
        </button>
      )}

      <form aria-busy={pending} className="profile-document-upload" onSubmit={handleUpload}>
        <fieldset disabled={pending || unavailable || documents.length >= STUDENT_PROFILE_DOCUMENT_MAX_ACTIVE}>
          <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 max-[650px]:grid-cols-[1fr]">
            <div className="field">
              <label htmlFor="profileDocumentType">Document type</label>
              <select id="profileDocumentType" name="documentType" required>
                <option value="">Select a type</option>
                {STUDENT_PROFILE_DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>{STUDENT_PROFILE_DOCUMENT_TYPE_LABELS[type]}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="profileDocumentName">Display name</label>
              <input id="profileDocumentName" maxLength={100} name="displayName" required type="text" />
            </div>
            <div className="field profile-document-file-field">
              <label htmlFor="profileDocumentFile">File</label>
              <input accept={STUDENT_PROFILE_DOCUMENT_ACCEPT} id="profileDocumentFile" name="documentFile" ref={fileRef} required type="file" />
              <span className="field-hint">PDF, JPEG, or PNG. Maximum 10 MB.</span>
            </div>
          </div>
          <button className="button" type="submit">{pending ? "Working…" : "Upload Document"}</button>
        </fieldset>
      </form>

      {unavailable ? (
        <p className="profile-document-empty" role="alert">Documents are temporarily unavailable.</p>
      ) : documents.length === 0 ? (
        <p className="profile-document-empty">No Profile Documents uploaded yet.</p>
      ) : (
        <ul className="profile-document-list">
          {documents.map((document) => (
            <li key={document.documentId}>
              <div>
                <span>{STUDENT_PROFILE_DOCUMENT_TYPE_LABELS[document.documentType]}</span>
                <strong>{document.displayName}</strong>
                <small>{document.originalFileName} · {formatProfileDocumentSize(document.fileSizeBytes)} · Uploaded {formatProfileDocumentDate(document.availableAt)}</small>
              </div>
              <div className="profile-document-actions">
                <a className="button button-secondary" href={`/student/profile/documents/${document.documentId}/view`} rel="noreferrer" target="_blank">View</a>
                <button className="button button-danger" disabled={pending} onClick={() => void deleteDocument(document)} type="button">Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
