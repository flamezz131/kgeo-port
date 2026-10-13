"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import { useRouter } from "next/navigation";
import {
  finalizeProgressionEvidenceUploadAction,
  prepareProgressionEvidenceUploadAction,
  removeProgressionEvidenceAction,
} from "@/app/actions/counselor-progression-evidence-actions";
import { FieldError } from "@/components/forms/field-error";
import {
  PROGRESSION_EVIDENCE_ACCEPT,
  PROGRESSION_EVIDENCE_MAX_FILES_PER_EVENT,
  PROGRESSION_EVIDENCE_REMOVAL_REASON_MAX_LENGTH,
  formatProgressionEvidenceSize,
  getProgressionEvidenceTypeLabel,
  type ProgressionEvidenceVisibleFile,
} from "@/lib/counselor/progression-evidence";
import {
  initialProgressionEvidenceMutationState,
  type ProgressionEvidenceMutationActionState,
} from "@/lib/counselor/progression-evidence-submission";
import {
  runProgressionEvidenceUpload,
  type ProgressionEvidenceUploadPhase,
} from "@/lib/counselor/progression-evidence-upload";
import { createClient } from "@/lib/supabase/client";
import { formatStudent360Timestamp } from "@/lib/counselor/student-profile";

const phaseMessages: Partial<
  Record<ProgressionEvidenceUploadPhase, string>
> = {
  validating: "Checking evidence file…",
  preparing: "Preparing secure upload…",
  uploading: "Uploading evidence…",
  finalizing: "Finalizing evidence…",
  succeeded: "Evidence uploaded successfully.",
};

function ProgressionEvidenceRemoval({
  evidence,
  progressionEventId,
  studentId,
}: {
  evidence: ProgressionEvidenceVisibleFile;
  progressionEventId: string;
  studentId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [state, setState] =
    useState<ProgressionEvidenceMutationActionState>(
    initialProgressionEvidenceMutationState,
  );
  const [pending, startTransition] = useTransition();
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const removalInFlightRef = useRef(false);

  useEffect(() => {
    if (state.status === "idle") return;
    feedbackRef.current?.focus();
  }, [state]);

  function handleRemovalSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      removalInFlightRef.current ||
      state.status === "success"
    ) {
      return;
    }

    removalInFlightRef.current = true;
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      try {
        const result =
          await removeProgressionEvidenceAction(formData);
        setState(result);
        if (result.status === "success") {
          router.refresh();
        }
      } catch {
        setState({
          status: "error",
          message: "Evidence could not be removed.",
        });
      } finally {
        removalInFlightRef.current = false;
      }
    });
  }

  if (!confirming) {
    return (
      <button
        aria-label={`Remove evidence: ${evidence.originalFileName}`}
        className="button button-secondary button-small"
        onClick={() => setConfirming(true)}
        type="button"
      >
        Remove
      </button>
    );
  }

  return (
    <form
      aria-busy={pending}
      className="progression-evidence-remove-form form-stack"
      onSubmit={handleRemovalSubmit}
    >
      <input name="studentId" type="hidden" value={studentId} />
      <input
        name="progressionEventId"
        type="hidden"
        value={progressionEventId}
      />
      <input name="evidenceId" type="hidden" value={evidence.id} />
      <p className="progression-evidence-warning">
        Remove this evidence from counselor access? The audit record will
        be retained. The stored object is not physically deleted in the
        current workflow.
      </p>
      <div className="field">
        <label htmlFor={`evidence-removal-${evidence.id}`}>
          Removal reason <span aria-hidden="true">*</span>
        </label>
        <textarea
          aria-describedby={`evidence-removal-hint-${evidence.id} evidence-removal-error-${evidence.id}`}
          aria-invalid={Boolean(
            state.status === "error" &&
              state.errors?.removalReason,
          )}
          disabled={pending || state.status === "success"}
          id={`evidence-removal-${evidence.id}`}
          maxLength={PROGRESSION_EVIDENCE_REMOVAL_REASON_MAX_LENGTH}
          name="removalReason"
          required
          rows={3}
        />
        <span
          className="field-hint"
          id={`evidence-removal-hint-${evidence.id}`}
        >
          Required for the retained audit record. Maximum 500 characters.
        </span>
        <FieldError
          id={`evidence-removal-error-${evidence.id}`}
          messages={
            state.status === "error"
              ? state.errors?.removalReason
              : undefined
          }
        />
      </div>
      {state.status !== "idle" && (
        <p
          className={
            state.status === "success" ? "form-success" : "form-error"
          }
          ref={feedbackRef}
          role={state.status === "success" ? "status" : "alert"}
          tabIndex={-1}
        >
          {state.message}
        </p>
      )}
      <div className="progression-evidence-inline-actions">
        <button
          className="button button-small"
          disabled={pending || state.status === "success"}
          type="submit"
        >
          {pending ? "Removing evidence…" : "Remove evidence"}
        </button>
        <button
          className="button button-secondary button-small"
          disabled={pending || state.status === "success"}
          onClick={() => setConfirming(false)}
          type="button"
        >
          Keep evidence
        </button>
      </div>
    </form>
  );
}

export function ProgressionEvidenceControls({
  canManageCase,
  evidence,
  progressionEventId,
  studentId,
}: {
  canManageCase: boolean;
  evidence: ProgressionEvidenceVisibleFile[];
  progressionEventId: string;
  studentId: string;
}) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [phase, setPhase] =
    useState<ProgressionEvidenceUploadPhase>("idle");
  const [message, setMessage] = useState("");
  const [retryFinalizeEvidenceId, setRetryFinalizeEvidenceId] =
    useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const uploadInFlightRef = useRef(false);
  const finalizationInFlightRef = useRef(false);
  const active = [
    "validating",
    "preparing",
    "uploading",
    "finalizing",
  ].includes(phase);
  const atLimit =
    evidence.length >= PROGRESSION_EVIDENCE_MAX_FILES_PER_EVENT;

  useEffect(() => {
    if (phase !== "failed" && phase !== "succeeded") return;
    feedbackRef.current?.focus();
  }, [message, phase]);

  async function finalizeEvidence(evidenceId: string) {
    if (finalizationInFlightRef.current) {
      return {
        status: "error" as const,
        message: "Evidence finalization is already in progress.",
      };
    }
    finalizationInFlightRef.current = true;
    setPhase("finalizing");
    setMessage(phaseMessages.finalizing ?? "");
    try {
      const formData = new FormData();
      formData.set("studentId", studentId);
      formData.set("progressionEventId", progressionEventId);
      formData.set("evidenceId", evidenceId);
      const result =
        await finalizeProgressionEvidenceUploadAction(formData);
      if (result.status === "success") {
        setRetryFinalizeEvidenceId(null);
        setPhase("succeeded");
        setMessage(result.message);
        if (fileInputRef.current) fileInputRef.current.value = "";
        router.refresh();
      } else {
        setRetryFinalizeEvidenceId(evidenceId);
        setPhase("failed");
        setMessage(
          result.status === "error"
            ? result.message
            : "Evidence upload could not be finalized.",
        );
      }
      return result;
    } finally {
      finalizationInFlightRef.current = false;
    }
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploadInFlightRef.current || active) return;
    const selectedFile = fileInputRef.current?.files?.[0] ?? null;
    if (!selectedFile) {
      setPhase("failed");
      setMessage("Select a supported PDF, DOCX or image file.");
      return;
    }
    setRetryFinalizeEvidenceId(null);
    uploadInFlightRef.current = true;

    try {
      const result = await runProgressionEvidenceUpload(selectedFile, {
        getCurrentFile: () =>
          fileInputRef.current?.files?.[0] ?? null,
        onPhase: (nextPhase) => {
          setPhase(nextPhase);
          const nextMessage = phaseMessages[nextPhase];
          if (nextMessage) setMessage(nextMessage);
        },
        prepare: async (file) => {
          const formData = new FormData();
          formData.set("studentId", studentId);
          formData.set("progressionEventId", progressionEventId);
          formData.set("originalFileName", file.name);
          formData.set("mimeType", file.type);
          formData.set("fileSizeBytes", String(file.size));
          const prepared =
            await prepareProgressionEvidenceUploadAction(formData);
          return prepared.status === "success"
            ? prepared
            : {
                status: "error" as const,
                message:
                  prepared.status === "error"
                    ? prepared.message
                    : "Evidence upload could not be prepared.",
              };
        },
        upload: async (upload, file) => {
          return supabase.storage
            .from(upload.bucketId)
            .uploadToSignedUrl(upload.path, upload.token, file, {
              contentType: upload.mimeType,
              upsert: false,
            });
        },
        finalize: async (evidenceId) => {
          const finalized = await finalizeEvidence(evidenceId);
          return finalized.status === "success"
            ? finalized
            : {
                status: "error" as const,
                message:
                  finalized.status === "error"
                    ? finalized.message
                    : "Evidence upload could not be finalized.",
              };
        },
      });

      setMessage(result.message);
      if (result.status === "error") {
        setPhase("failed");
        setRetryFinalizeEvidenceId(
          result.retryFinalizeEvidenceId ?? null,
        );
      }
    } finally {
      uploadInFlightRef.current = false;
    }
  }

  const headingId = `progression-evidence-${progressionEventId}`;
  const fileHintId = `${headingId}-file-hint`;
  const feedbackId = `${headingId}-feedback`;
  const feedbackIsError = phase === "failed";

  return (
    <section
      aria-labelledby={headingId}
      className="progression-evidence"
    >
      <header>
        <h5 id={headingId}>
          Supporting evidence
          {evidence.length > 0 && ` · ${evidence.length} files`}
        </h5>
      </header>

      {evidence.length === 0 ? (
        <p className="progression-evidence-empty" role="status">
          No evidence attached.
        </p>
      ) : (
        <ul className="progression-evidence-list">
          {evidence.map((file) => (
            <li key={file.id}>
              <div className="progression-evidence-file">
                <strong title={file.originalFileName}>
                  {file.originalFileName}
                </strong>
                <span>
                  {getProgressionEvidenceTypeLabel(file.mimeType)}
                  {" · "}
                  {formatProgressionEvidenceSize(file.fileSizeBytes)}
                  {" · Added "}
                  {formatStudent360Timestamp(file.availableAt)}
                </span>
              </div>
              <div className="progression-evidence-file-actions">
                <a
                  aria-label={`View evidence: ${file.originalFileName}`}
                  className="button button-secondary button-small"
                  href={`/counselor/progression-evidence/${file.id}/view`}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  View
                </a>
                {canManageCase && (
                  <ProgressionEvidenceRemoval
                    evidence={file}
                    progressionEventId={progressionEventId}
                    studentId={studentId}
                  />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {!canManageCase ? null : atLimit ? (
        <p className="progression-evidence-limit" role="status">
          Maximum of 5 evidence files reached for this event.
        </p>
      ) : (
        <form
          aria-busy={active}
          className="progression-evidence-upload form-stack"
          onSubmit={handleUpload}
        >
          <div className="field">
            <label htmlFor={`${headingId}-file`}>
              Attach evidence <span aria-hidden="true">*</span>
            </label>
            <input
              accept={PROGRESSION_EVIDENCE_ACCEPT}
              aria-describedby={
                message ? `${fileHintId} ${feedbackId}` : fileHintId
              }
              aria-invalid={feedbackIsError}
              disabled={active}
              id={`${headingId}-file`}
              name="evidenceFile"
              ref={fileInputRef}
              required
              type="file"
            />
            <span className="field-hint" id={fileHintId}>
              Accepted: PDF, DOCX, JPG, JPEG, PNG and WebP. Maximum size:
              10 MiB. Maximum files per event: 5.
            </span>
          </div>
          <button
            className="button button-small"
            disabled={active}
            type="submit"
          >
            {active ? "Uploading evidence…" : "Upload evidence"}
          </button>
        </form>
      )}

      {message && (
        <p
          className={feedbackIsError ? "form-error" : "form-success"}
          id={feedbackId}
          ref={feedbackRef}
          role={feedbackIsError ? "alert" : "status"}
          tabIndex={-1}
        >
          {message}
        </p>
      )}
      {canManageCase && retryFinalizeEvidenceId && (
        <button
          className="button button-secondary button-small"
          disabled={active}
          onClick={() => finalizeEvidence(retryFinalizeEvidenceId)}
          type="button"
        >
          Retry finalization
        </button>
      )}
    </section>
  );
}
