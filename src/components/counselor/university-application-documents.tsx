"use client";

import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type SyntheticEvent,
} from "react";
import {
  finalizeUniversityApplicationDocumentUploadAction,
  loadUniversityApplicationDocumentsAction,
  prepareUniversityApplicationDocumentUploadAction,
  removeUniversityApplicationDocumentAction,
} from "@/app/actions/counselor-university-application-document-actions";
import { FieldError } from "@/components/forms/field-error";
import {
  UNIVERSITY_APPLICATION_DOCUMENT_ACCEPT,
  UNIVERSITY_APPLICATION_DOCUMENT_MAX_ACTIVE,
  UNIVERSITY_APPLICATION_DOCUMENT_REMOVAL_REASON_MAX_LENGTH,
  UNIVERSITY_APPLICATION_DOCUMENT_TITLE_MAX_LENGTH,
  formatUniversityApplicationDocumentSize,
  getUniversityApplicationDocumentMimeLabel,
} from "@/lib/counselor/university-application-documents";
import type {
  UniversityApplicationDocumentMutationState,
  UniversityApplicationDocumentPrepareState,
} from "@/lib/counselor/university-application-document-submission";
import {
  runUniversityApplicationDocumentUpload,
  type UniversityApplicationDocumentUploadPhase,
} from "@/lib/counselor/university-application-document-upload";
import { formatStudent360Timestamp } from "@/lib/counselor/student-profile";
import { createClient } from "@/lib/supabase/client";
import type { CounselorUniversityApplicationDocument } from "@/types";

type ListState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; documents: CounselorUniversityApplicationDocument[] };

const uploadPhaseMessages: Partial<
  Record<UniversityApplicationDocumentUploadPhase, string>
> = {
  preparing: "Preparing secure upload\u2026",
  uploading: "Uploading document\u2026",
  finalizing: "Finalizing document\u2026",
  succeeded: "Document uploaded successfully.",
};

const activeUploadPhases: UniversityApplicationDocumentUploadPhase[] = [
  "preparing",
  "uploading",
  "finalizing",
];

export function UniversityApplicationDocuments({
  applicationId,
  applicationLabel,
  canManageCase,
  isArchived,
}: {
  applicationId: string;
  applicationLabel: string;
  canManageCase: boolean;
  isArchived: boolean;
}) {
  const [supabase] = useState(() => createClient());
  const [expanded, setExpanded] = useState(false);
  const [listState, setListState] = useState<ListState>({ phase: "idle" });
  const listRequestRef = useRef(0);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadPhase, setUploadPhase] =
    useState<UniversityApplicationDocumentUploadPhase>("idle");
  const [uploadMessage, setUploadMessage] = useState("");
  const [uploadErrors, setUploadErrors] = useState<Record<string, string[]>>({});
  const [uploadRefreshPending, setUploadRefreshPending] = useState(false);
  const [retryFinalizeDocumentId, setRetryFinalizeDocumentId] =
    useState<string | null>(null);
  const uploadDialogRef = useRef<HTMLDialogElement>(null);
  const uploadHeadingRef = useRef<HTMLHeadingElement>(null);
  const uploadTriggerRef = useRef<HTMLButtonElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFeedbackRef = useRef<HTMLParagraphElement>(null);
  const uploadInFlightRef = useRef(false);
  const finalizeInFlightRef = useRef(false);

  const [removeDocument, setRemoveDocument] =
    useState<CounselorUniversityApplicationDocument | null>(null);
  const [removeState, setRemoveState] =
    useState<UniversityApplicationDocumentMutationState | null>(null);
  const [removePending, setRemovePending] = useState(false);
  const removeDialogRef = useRef<HTMLDialogElement>(null);
  const removeHeadingRef = useRef<HTMLHeadingElement>(null);
  const removeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const removeReasonRef = useRef<HTMLTextAreaElement>(null);
  const removeFeedbackRef = useRef<HTMLParagraphElement>(null);
  const removeInFlightRef = useRef(false);

  const uploadActive =
    activeUploadPhases.includes(uploadPhase) || uploadRefreshPending;
  const documents = listState.phase === "ready" ? listState.documents : [];
  const atLimit = documents.length >= UNIVERSITY_APPLICATION_DOCUMENT_MAX_ACTIVE;
  const sectionId = `application-documents-${applicationId}`;

  useEffect(() => {
    if (!uploadOpen) return;
    const dialog = uploadDialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    requestAnimationFrame(() => titleInputRef.current?.focus());
  }, [uploadOpen]);

  useEffect(() => {
    if (!removeDocument) return;
    const dialog = removeDialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    requestAnimationFrame(() => removeReasonRef.current?.focus());
  }, [removeDocument]);

  useEffect(() => {
    if (uploadPhase === "prepare_failed") {
      if (uploadErrors.documentTitle?.length) {
        titleInputRef.current?.focus();
        return;
      }
      if (uploadErrors.documentFile?.length) {
        fileInputRef.current?.focus();
        return;
      }
    }
    if (
      uploadPhase === "prepare_failed" ||
      uploadPhase === "upload_failed" ||
      uploadPhase === "finalize_failed" ||
      uploadPhase === "succeeded"
    ) {
      uploadFeedbackRef.current?.focus();
    }
  }, [uploadErrors, uploadMessage, uploadPhase]);

  useEffect(() => {
    if (removeState) removeFeedbackRef.current?.focus();
  }, [removeState]);

  async function loadDocuments(): Promise<boolean> {
    const request = listRequestRef.current + 1;
    listRequestRef.current = request;
    setListState({ phase: "loading" });
    const formData = new FormData();
    formData.set("applicationId", applicationId);
    try {
      const result = await loadUniversityApplicationDocumentsAction(formData);
      if (listRequestRef.current !== request) return false;
      if (result.status !== "ready" || result.applicationId !== applicationId) {
        setListState({
          phase: "error",
          message: "Application documents are temporarily unavailable.",
        });
        return false;
      }
      setListState({ phase: "ready", documents: result.documents });
      return true;
    } catch {
      if (listRequestRef.current === request) {
        setListState({
          phase: "error",
          message: "Application documents are temporarily unavailable.",
        });
      }
      return false;
    }
  }

  function toggleExpanded(): void {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    if (listState.phase === "idle") void loadDocuments();
  }

  function openUpload(trigger: HTMLButtonElement): void {
    if (isArchived || atLimit) return;
    uploadTriggerRef.current = trigger;
    setUploadPhase("idle");
    setUploadMessage("");
    setUploadErrors({});
    setUploadRefreshPending(false);
    setRetryFinalizeDocumentId(null);
    setUploadOpen(true);
  }

  function closeUpload(): void {
    if (uploadActive || uploadInFlightRef.current || finalizeInFlightRef.current) return;
    uploadDialogRef.current?.close();
    setUploadOpen(false);
    setUploadPhase("idle");
    setUploadMessage("");
    setUploadErrors({});
    setUploadRefreshPending(false);
    setRetryFinalizeDocumentId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    requestAnimationFrame(() => uploadTriggerRef.current?.focus());
  }

  function handleUploadCancel(event: SyntheticEvent<HTMLDialogElement>): void {
    event.preventDefault();
    closeUpload();
  }

  async function finalizeDocument(
    documentId: string,
  ): Promise<UniversityApplicationDocumentMutationState> {
    if (finalizeInFlightRef.current) {
      return {
        status: "error",
        message: "Document finalization is already in progress.",
      };
    }
    finalizeInFlightRef.current = true;
    try {
      const formData = new FormData();
      formData.set("documentId", documentId);
      const result =
        await finalizeUniversityApplicationDocumentUploadAction(formData);
      if (result.status === "success" && result.applicationId !== applicationId) {
        return {
          status: "error",
          message: "The document upload could not be finalized.",
        };
      }
      return result;
    } catch {
      return {
        status: "error",
        message: "The document upload could not be finalized.",
      };
    } finally {
      finalizeInFlightRef.current = false;
    }
  }

  async function handleUploadSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadInFlightRef.current || uploadActive || isArchived) return;
    const title = titleInputRef.current?.value ?? "";
    const selectedFile = fileInputRef.current?.files?.[0] ?? null;
    if (!selectedFile) {
      setUploadPhase("prepare_failed");
      setUploadMessage("Select a supported PDF or image file.");
      setUploadErrors({ documentFile: ["Select one document file."] });
      return;
    }

    uploadInFlightRef.current = true;
    setUploadErrors({});
    setRetryFinalizeDocumentId(null);
    try {
      const result = await runUniversityApplicationDocumentUpload(
        applicationId,
        title,
        selectedFile,
        {
          getCurrentFile: () => fileInputRef.current?.files?.[0] ?? null,
          onPhase: (phase) => {
            setUploadPhase(phase);
            const message = uploadPhaseMessages[phase];
            if (message) setUploadMessage(message);
          },
          prepare: async (input): Promise<UniversityApplicationDocumentPrepareState> => {
            const formData = new FormData();
            formData.set("applicationId", input.applicationId);
            formData.set("documentTitle", input.documentTitle);
            formData.set("originalFileName", input.originalFileName);
            formData.set("mimeType", input.mimeType);
            formData.set("fileSizeBytes", String(input.fileSizeBytes));
            return prepareUniversityApplicationDocumentUploadAction(formData);
          },
          upload: (capability, file) =>
            supabase.storage
              .from(capability.bucketId)
              .uploadToSignedUrl(capability.path, capability.token, file, {
                contentType: capability.mimeType,
              }),
          finalize: finalizeDocument,
        },
      );
      setUploadMessage(result.message);
      setUploadErrors(result.status === "error" ? result.errors ?? {} : {});
      if (result.status === "error") {
        setUploadPhase(result.failurePhase);
        setRetryFinalizeDocumentId(result.retryFinalizeDocumentId ?? null);
      } else {
        if (fileInputRef.current) fileInputRef.current.value = "";
        setUploadRefreshPending(true);
        try {
          await loadDocuments();
        } finally {
          setUploadRefreshPending(false);
        }
      }
    } finally {
      uploadInFlightRef.current = false;
    }
  }

  async function retryFinalization(): Promise<void> {
    if (!retryFinalizeDocumentId || finalizeInFlightRef.current) return;
    setUploadPhase("finalizing");
    setUploadMessage("Finalizing document\u2026");
    const result = await finalizeDocument(retryFinalizeDocumentId);
    if (result.status === "success") {
      setRetryFinalizeDocumentId(null);
      setUploadPhase("succeeded");
      setUploadMessage(result.message);
      setUploadRefreshPending(true);
      try {
        await loadDocuments();
      } finally {
        setUploadRefreshPending(false);
      }
    } else {
      setUploadPhase("finalize_failed");
      setUploadMessage(result.message);
    }
  }

  function openRemoval(
    document: CounselorUniversityApplicationDocument,
    trigger: HTMLButtonElement,
  ): void {
    if (isArchived) return;
    removeTriggerRef.current = trigger;
    setRemoveState(null);
    setRemovePending(false);
    setRemoveDocument(document);
  }

  function closeRemoval(): void {
    if (removeInFlightRef.current) return;
    removeDialogRef.current?.close();
    setRemoveDocument(null);
    setRemoveState(null);
    setRemovePending(false);
    requestAnimationFrame(() => removeTriggerRef.current?.focus());
  }

  function handleRemovalCancel(event: SyntheticEvent<HTMLDialogElement>): void {
    event.preventDefault();
    closeRemoval();
  }

  async function handleRemovalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!removeDocument || removeInFlightRef.current || isArchived) return;
    removeInFlightRef.current = true;
    setRemovePending(true);
    setRemoveState(null);
    const formData = new FormData(event.currentTarget);
    try {
      const result = await removeUniversityApplicationDocumentAction(formData);
      if (result.status === "success" && result.applicationId !== applicationId) {
        setRemoveState({
          status: "error",
          message: "The document could not be removed.",
        });
        return;
      }
      setRemoveState(result);
      if (result.status === "success") {
        await loadDocuments();
        removeDialogRef.current?.close();
        setRemoveDocument(null);
        setRemovePending(false);
        requestAnimationFrame(() => removeTriggerRef.current?.focus());
      }
    } catch {
      setRemoveState({
        status: "error",
        message: "The document could not be removed.",
      });
    } finally {
      removeInFlightRef.current = false;
      setRemovePending(false);
    }
  }

  return (
    <section aria-labelledby={`${sectionId}-heading`} className="application-documents">
      <div className="application-documents-toggle-row">
        <div>
          <h4 id={`${sectionId}-heading`}>
            Documents
            {listState.phase === "ready" && ` (${documents.length})`}
          </h4>
          <p>Private counselor-managed application files.</p>
        </div>
        <button
          aria-controls={`${sectionId}-content`}
          aria-expanded={expanded}
          className="button button-secondary button-small"
          onClick={toggleExpanded}
          type="button"
        >
          {expanded ? "Hide documents" : "Show documents"}
        </button>
      </div>

      {expanded && (
        <div className="application-documents-content" id={`${sectionId}-content`}>
          {listState.phase === "loading" && (
            <p aria-live="polite" role="status">Loading documents\u2026</p>
          )}
          {listState.phase === "error" && (
            <div className="application-documents-local-error">
              <p className="form-error" role="alert">{listState.message}</p>
              <button
                className="button button-secondary button-small"
                onClick={() => void loadDocuments()}
                type="button"
              >
                Retry loading
              </button>
            </div>
          )}
          {listState.phase === "ready" && (
            <>
              {documents.length === 0 ? (
                <p className="application-documents-empty" role="status">
                  No application documents have been added.
                </p>
              ) : (
                <ul className="application-document-list">
                  {documents.map((document) => (
                    <li key={document.documentId}>
                      <div className="application-document-file">
                        <strong>{document.documentTitle}</strong>
                        <span title={document.originalFileName}>
                          {document.originalFileName}
                        </span>
                        <small>
                          {getUniversityApplicationDocumentMimeLabel(document.mimeType)}
                          {" \u00b7 "}
                          {formatUniversityApplicationDocumentSize(document.fileSizeBytes)}
                          {" \u00b7 Available "}
                          {formatStudent360Timestamp(document.availableAt)}
                        </small>
                      </div>
                      <div className="application-document-actions">
                        <a
                          aria-label={`View ${document.documentTitle} (opens in a new tab)`}
                          className="button button-secondary button-small"
                          href={`/counselor/university-application-documents/${applicationId}/${document.documentId}/view`}
                          rel="noopener noreferrer"
                          target="_blank"
                        >
                          View
                        </a>
                        {!isArchived && (
                          canManageCase ? (
                            <button
                              aria-label={`Remove ${document.documentTitle}`}
                              className="button button-secondary button-small"
                              onClick={(event) => openRemoval(document, event.currentTarget)}
                              type="button"
                            >
                              Remove
                            </button>
                          ) : null
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {!canManageCase ? null : isArchived ? (
                <p className="application-documents-read-only" role="status">
                  This archived application is read-only. Existing documents remain viewable.
                </p>
              ) : atLimit ? (
                <p className="application-documents-limit" role="status">
                  The maximum of 20 active documents has been reached.
                </p>
              ) : (
                <button
                  className="button button-small"
                  onClick={(event) => openUpload(event.currentTarget)}
                  type="button"
                >
                  Upload document
                </button>
              )}
            </>
          )}
        </div>
      )}

      <dialog
        aria-describedby={`${sectionId}-upload-description`}
        aria-labelledby={`${sectionId}-upload-title`}
        aria-modal="true"
        className="fixed m-auto rounded-2xl bg-white shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm p-0 w-full max-w-xl outline-none border border-slate-200 open:animate-in open:fade-in open:zoom-in-95"
        onCancel={handleUploadCancel}
        ref={uploadDialogRef}
      >
        {uploadOpen && (
          <form
            aria-busy={uploadActive}
            className="flex flex-col"
            onSubmit={handleUploadSubmit}
          >
            <div className="p-6 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-1 block">Private application file</span>
              <h3 id={`${sectionId}-upload-title`} className="text-xl font-bold text-[#0B1F3A]" ref={uploadHeadingRef} tabIndex={-1}>
                Upload document
              </h3>
              <p id={`${sectionId}-upload-description`} className="text-sm text-slate-500 mt-1">
                Add a file to {applicationLabel}. Files stay private to authorized counselors.
              </p>
            </div>
            <fieldset disabled={uploadActive || uploadPhase === "succeeded"} className="p-6 flex flex-col gap-4">
              <div className="field">
                <label htmlFor={`${sectionId}-document-title`}>
                  Document title <span aria-hidden="true">*</span>
                </label>
                <input
                  aria-describedby={`${sectionId}-document-title-hint ${sectionId}-document-title-error`}
                  aria-invalid={Boolean(uploadErrors.documentTitle)}
                  id={`${sectionId}-document-title`}
                  maxLength={UNIVERSITY_APPLICATION_DOCUMENT_TITLE_MAX_LENGTH}
                  name="documentTitle"
                  ref={titleInputRef}
                  required
                />
                <span className="field-hint" id={`${sectionId}-document-title-hint`}>
                  Use a clear title between 2 and 100 characters.
                </span>
                <FieldError
                  id={`${sectionId}-document-title-error`}
                  messages={uploadErrors.documentTitle}
                />
              </div>
              <div className="field">
                <label htmlFor={`${sectionId}-document-file`}>
                  File <span aria-hidden="true">*</span>
                </label>
                <input
                  accept={UNIVERSITY_APPLICATION_DOCUMENT_ACCEPT}
                  aria-describedby={`${sectionId}-document-file-hint ${sectionId}-document-file-error`}
                  aria-invalid={Boolean(uploadErrors.documentFile)}
                  id={`${sectionId}-document-file`}
                  name="documentFile"
                  ref={fileInputRef}
                  required
                  type="file"
                />
                <span className="field-hint" id={`${sectionId}-document-file-hint`}>
                  One PDF, JPEG, PNG or WebP file. Maximum 10 MiB.
                </span>
                <FieldError
                  id={`${sectionId}-document-file-error`}
                  messages={uploadErrors.documentFile}
                />
              </div>
            </fieldset>
            {uploadMessage && (
              <p
                className={uploadPhase.endsWith("failed") ? "form-error" : "form-success"}
                ref={uploadFeedbackRef}
                role={uploadPhase.endsWith("failed") ? "alert" : "status"}
                tabIndex={-1}
              >
                {uploadMessage}
              </p>
            )}
            {retryFinalizeDocumentId && (
              <div className="px-6 pb-2">
                <button
                  className="inline-flex items-center justify-center h-10 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                  disabled={uploadActive}
                  onClick={() => void retryFinalization()}
                  type="button"
                >
                  Retry finalization
                </button>
              </div>
            )}
            <div className="p-4 px-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                className="inline-flex items-center justify-center h-10 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                disabled={uploadActive}
                onClick={closeUpload}
                type="button"
              >
                {uploadPhase === "succeeded" ? "Close" : "Cancel"}
              </button>
              {uploadPhase !== "succeeded" && (
                <button className="inline-flex items-center justify-center h-10 px-5 text-white text-sm font-semibold rounded-xl transition-colors bg-blue-600 hover:bg-blue-700 shadow-sm shadow-blue-500/20 disabled:opacity-50" disabled={uploadActive} type="submit">
                  {uploadActive ? "Uploading document\u2026" : "Upload document"}
                </button>
              )}
            </div>
          </form>
        )}
      </dialog>

      <dialog
        aria-describedby={`${sectionId}-remove-description`}
        aria-labelledby={`${sectionId}-remove-title`}
        aria-modal="true"
        className="fixed m-auto rounded-2xl bg-white shadow-2xl backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm p-0 w-full max-w-xl outline-none border border-slate-200 open:animate-in open:fade-in open:zoom-in-95"
        onCancel={handleRemovalCancel}
        ref={removeDialogRef}
      >
        {removeDocument && (
          <form
            aria-busy={removePending}
            className="flex flex-col"
            onSubmit={handleRemovalSubmit}
          >
            <input name="documentId" type="hidden" value={removeDocument.documentId} />
            <div className="p-6 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600 mb-1 block">Retained audit record</span>
              <h3 id={`${sectionId}-remove-title`} className="text-xl font-bold text-[#0B1F3A]" ref={removeHeadingRef} tabIndex={-1}>
                Remove document
              </h3>
              <p id={`${sectionId}-remove-description`} className="text-sm text-slate-500 mt-1">
                Remove this document from counselor access? Its metadata and stored object are retained.
              </p>
            </div>
            <div className="p-6 flex flex-col gap-4">
              <label htmlFor={`${sectionId}-removal-reason`}>
                Removal reason <span aria-hidden="true">*</span>
              </label>
              <textarea
                aria-describedby={`${sectionId}-removal-reason-hint ${sectionId}-removal-reason-error`}
                aria-invalid={Boolean(
                  removeState?.status === "error" && removeState.errors?.removalReason,
                )}
                id={`${sectionId}-removal-reason`}
                maxLength={UNIVERSITY_APPLICATION_DOCUMENT_REMOVAL_REASON_MAX_LENGTH}
                name="removalReason"
                ref={removeReasonRef}
                required
                rows={4}
                disabled={removePending}
              />
              <span className="field-hint" id={`${sectionId}-removal-reason-hint`}>
                Required for the retained audit record. Maximum 500 characters.
              </span>
              <FieldError
                id={`${sectionId}-removal-reason-error`}
                messages={
                  removeState?.status === "error"
                    ? removeState.errors?.removalReason
                    : undefined
                }
              />
            </div>
            {removeState && (
              <p
                className={removeState.status === "success" ? "form-success" : "form-error"}
                ref={removeFeedbackRef}
                role={removeState.status === "success" ? "status" : "alert"}
                tabIndex={-1}
              >
                {removeState.message}
              </p>
            )}
            <div className="p-4 px-6 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-2xl">
              <button
                className="inline-flex items-center justify-center h-10 px-4 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                disabled={removePending}
                onClick={closeRemoval}
                type="button"
              >
                Cancel
              </button>
              <button
                className="inline-flex items-center justify-center h-10 px-5 text-white text-sm font-semibold rounded-xl transition-colors bg-red-600 hover:bg-red-700 shadow-sm shadow-red-500/20 disabled:opacity-50"
                disabled={removePending}
                type="submit"
              >
                {removePending ? "Removing document\u2026" : "Remove document"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </section>
  );
}
