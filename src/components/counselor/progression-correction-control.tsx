"use client";

import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type SyntheticEvent,
} from "react";
import { useRouter } from "next/navigation";
import { undoLatestProgressionEventAction } from "@/app/actions/counselor-progression-actions";
import { FieldError } from "@/components/forms/field-error";
import type { OfficialProgressionCorrectionAction } from "@/lib/counselor/progression-correction";
import {
  initialProgressionCorrectionActionState,
  type ProgressionCorrectionActionState,
} from "@/lib/counselor/progression-correction-submission";

type ProgressionCorrectionPhase =
  | "idle"
  | "confirming"
  | "submitting"
  | "succeeded"
  | "failed";

const content = {
  undo: {
    actionLabel: "Undo latest update",
    title: "Undo latest progression update?",
    description:
      "The previous official stage and workflow state will be restored. The original history event will remain for audit.",
    confirmLabel: "Confirm undo",
    pendingLabel: "Undoing latest update…",
  },
  reset: {
    actionLabel: "Reset official progression",
    title: "Reset official progression?",
    description:
      "The student will return to Yet to begin at 0%. The original initialization event will remain for audit.",
    confirmLabel: "Confirm reset",
    pendingLabel: "Resetting official progression…",
  },
} as const satisfies Record<
  OfficialProgressionCorrectionAction,
  {
    actionLabel: string;
    title: string;
    description: string;
    confirmLabel: string;
    pendingLabel: string;
  }
>;

export function ProgressionCorrectionControl({
  action,
  eventId,
  eventLabel,
  isCompletion,
  studentId,
}: {
  action: OfficialProgressionCorrectionAction;
  eventId: string;
  eventLabel: string;
  isCompletion: boolean;
  studentId: string;
}) {
  const router = useRouter();
  const [phase, setPhase] =
    useState<ProgressionCorrectionPhase>("idle");
  const [state, setState] =
    useState<ProgressionCorrectionActionState>(
      initialProgressionCorrectionActionState,
    );
  const [reason, setReason] = useState("");
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  const submissionInFlightRef = useRef(false);
  const details = content[action];
  const prefix = `progression-correction-${eventId}`;
  const reasonLength = [...reason].length;
  const submitting = phase === "submitting" || pending;
  const succeeded = phase === "succeeded";

  useEffect(() => {
    if (phase !== "confirming") return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    reasonRef.current?.focus();
  }, [phase]);

  useEffect(() => {
    if (phase !== "failed" && phase !== "succeeded") return;
    feedbackRef.current?.focus();
  }, [phase, state.message]);

  function openConfirmation() {
    if (submissionInFlightRef.current || succeeded) return;
    setState(initialProgressionCorrectionActionState);
    setReason("");
    setPhase("confirming");
  }

  function closeConfirmation() {
    if (submitting || succeeded) return;
    dialogRef.current?.close();
    setPhase("idle");
    setState(initialProgressionCorrectionActionState);
    setReason("");
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    closeConfirmation();
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      submissionInFlightRef.current ||
      submitting ||
      succeeded
    ) {
      return;
    }

    submissionInFlightRef.current = true;
    setPhase("submitting");
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      let result: ProgressionCorrectionActionState | null = null;
      try {
        result = await undoLatestProgressionEventAction(
          initialProgressionCorrectionActionState,
          formData,
        );
      } catch {
        result = {
          status: "error",
          message: "Official progression could not be corrected.",
        };
      } finally {
        if (result?.status !== "success") {
          submissionInFlightRef.current = false;
        }
      }

      setState(result);
      if (result.status === "success") {
        setPhase("succeeded");
        router.refresh();
      } else {
        setPhase("failed");
      }
    });
  }

  const description =
    action === "undo" && isCompletion
      ? "This will reverse the latest completion entry and restore the immediately previous official state. The completion history remains for audit."
      : details.description;
  const reasonInvalid =
    reasonLength > 500 ||
    Boolean(
      state.status === "error" &&
        state.errors?.correctionReason,
    );

  return (
    <div className="progression-correction-control">
      <button
        aria-label={`${details.actionLabel}: ${eventLabel}`}
        className="inline-flex items-center justify-center h-8 px-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
        disabled={phase !== "idle"}
        onClick={openConfirmation}
        ref={triggerRef}
        type="button"
      >
        {details.actionLabel}
      </button>

      <dialog
        aria-describedby={`${prefix}-description`}
        aria-labelledby={`${prefix}-title`}
        aria-modal="true"
        className="fixed inset-0 m-auto w-[90vw] max-w-lg rounded-2xl bg-white shadow-2xl p-0 open:flex flex-col max-h-[85vh] backdrop:bg-slate-900/40 backdrop:backdrop-blur-sm transition-all border border-slate-200"
        onCancel={handleCancel}
        ref={dialogRef}
      >
        <form
          aria-busy={submitting}
          className="flex flex-col h-full"
          onSubmit={handleSubmit}
        >
          <input name="studentId" type="hidden" value={studentId} />
          <input name="eventId" type="hidden" value={eventId} />
          <div className="p-6 pb-4 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
            <h5 id={`${prefix}-title`} className="text-lg font-bold text-[#0B1F3A] mb-2">{details.title}</h5>
            <p id={`${prefix}-description`} className="text-sm text-slate-600 leading-relaxed">{description}</p>
          </div>

          <div className="p-6 overflow-y-auto">
            <fieldset disabled={submitting || succeeded}>
              <div className="flex flex-col gap-2">
                <label htmlFor={`${prefix}-reason`} className="text-sm font-semibold text-slate-700">
                  Correction reason <span aria-hidden="true" className="text-red-500">*</span>
                </label>
                <textarea
                  aria-describedby={`${prefix}-reason-hint ${prefix}-reason-error`}
                  aria-invalid={reasonInvalid}
                  id={`${prefix}-reason`}
                  name="correctionReason"
                  onChange={(event) => setReason(event.target.value)}
                  ref={reasonRef}
                  required
                  rows={4}
                  value={reason}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-y"
                  placeholder="Enter reason for correction..."
                />
                <span
                  className="text-xs text-slate-500"
                  id={`${prefix}-reason-hint`}
                >
                  Required for the retained audit record. {reasonLength}/500
                  characters.
                </span>
                <FieldError
                  id={`${prefix}-reason-error`}
                  messages={
                    state.status === "error"
                      ? state.errors?.correctionReason
                      : reasonLength > 500
                        ? ["Enter no more than 500 characters."]
                        : undefined
                  }
                />
              </div>
            </fieldset>

            {state.status !== "idle" && (
              <p
                className={`mt-4 text-sm font-medium p-3 rounded-lg ${
                  state.status === "success"
                    ? "bg-green-50 text-green-700 border border-green-200"
                    : "bg-red-50 text-red-700 border border-red-200"
                }`}
                ref={feedbackRef}
                role={state.status === "success" ? "status" : "alert"}
                tabIndex={-1}
              >
                {state.message}
              </p>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-3 rounded-b-2xl mt-auto">
            <button
              className="inline-flex items-center justify-center h-10 px-4 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              disabled={submitting || succeeded}
              onClick={closeConfirmation}
              type="button"
            >
              Cancel
            </button>
            <button
              className="inline-flex items-center justify-center h-10 px-5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm disabled:opacity-50"
              disabled={
                submitting ||
                succeeded ||
                reason.trim() === "" ||
                reasonLength > 500
              }
              type="submit"
            >
              {submitting
                ? details.pendingLabel
                : succeeded
                  ? "Refreshing trusted progression…"
                  : details.confirmLabel}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
