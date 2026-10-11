"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  addParentReportExistingAttachmentAction,
  approveParentReportAction,
  createParentReportDraftAction,
  finalizeParentReportAction,
  finalizeParentReportAttachmentUploadAction,
  prepareParentReportAttachmentUploadAction,
  removeParentReportAttachmentAction,
  requestParentReportRevisionAction,
  saveCounselorParentReportAction,
  saveDirectorParentReportAction,
  submitParentReportAction,
} from "@/app/actions/parent-report-actions";
import { createClient } from "@/lib/supabase/client";
import { ChevronDown } from "lucide-react";
import { sectionCardClass } from "@/components/shell/form-ui";
import {
  formatParentReportTimestamp,
  initialParentReportActionState,
  isAllowedParentReportAttachment,
  parentReportStatusLabels,
  type ParentReportAttachmentCandidate,
  type ParentReportListItem,
  type ParentReportWorkspace,
} from "@/lib/parent-reports/parent-report";

type Props = {
  viewerRole: "counselor" | "director";
  workspace: ParentReportWorkspace | null;
  candidates: ParentReportAttachmentCandidate[];
  studentId?: string;
  reports?: ParentReportListItem[];
};

export function ParentReportWorkspace({
  viewerRole,
  workspace,
  candidates,
  studentId,
  reports = [],
}: Props) {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const saveAction =
    viewerRole === "director"
      ? saveDirectorParentReportAction
      : saveCounselorParentReportAction;
  const [saveState, saveFormAction, savePending] = useActionState(
    saveAction,
    initialParentReportActionState,
  );
  const [createState, createFormAction, createPending] = useActionState(
    createParentReportDraftAction,
    initialParentReportActionState,
  );

  useEffect(() => {
    if (
      viewerRole === "counselor" &&
      studentId &&
      createState.status === "success" &&
      createState.reportId
    ) {
      router.replace(
        `/counselor/students/${studentId}/report?report=${createState.reportId}`,
      );
    }
  }, [createState, router, studentId, viewerRole]);

  const report = workspace?.report;
  const counselorCanEdit =
    viewerRole === "counselor" &&
    (report?.status === "draft" || report?.status === "revision_requested");
  const directorCanEdit =
    viewerRole === "director" && report?.status === "director_review";
  const canEdit = counselorCanEdit || directorCanEdit;
  const previewHref = report
    ? viewerRole === "director"
      ? `/director/reports/${report.report_id}/pdf`
      : `/counselor/students/${report.student_id}/report/${report.report_id}/pdf`
    : "#";

  function runMutation(
    action: (formData: FormData) => Promise<{ status: string; message?: string }>,
    formData: FormData,
  ) {
    setError("");
    setFeedback("");
    startTransition(async () => {
      const result = await action(formData);
      if (result.status === "success") {
        setFeedback(result.message ?? "Saved.");
        router.refresh();
      } else {
        setError(result.message ?? "The request could not be completed.");
      }
    });
  }

  async function handleUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!report || pending || !canEdit) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const file = fileRef.current?.files?.[0];
    const displayName = String(form.get("displayName") ?? "").trim();
    if (!file || !isAllowedParentReportAttachment(file) || displayName.length < 2) {
      setError("Enter a display name and select a PDF, JPEG, or PNG up to 10 MB.");
      return;
    }
    setError("");
    setFeedback("Preparing secure upload…");
    const preparedForm = new FormData();
    preparedForm.set("viewerRole", viewerRole);
    preparedForm.set("reportId", report.report_id);
    preparedForm.set("displayName", displayName);
    preparedForm.set("originalFileName", file.name);
    preparedForm.set("mimeType", file.type);
    preparedForm.set("fileSizeBytes", String(file.size));
    const prepared = await prepareParentReportAttachmentUploadAction(preparedForm);
    if (prepared.status !== "success") {
      setFeedback("");
      setError(prepared.message);
      return;
    }
    setFeedback("Uploading attachment…");
    const uploaded = await supabase.storage
      .from(prepared.upload.bucketId)
      .uploadToSignedUrl(prepared.upload.path, prepared.upload.token, file, {
        contentType: prepared.upload.mimeType,
      });
    if (uploaded.error || uploaded.data?.path !== prepared.upload.path) {
      setFeedback("");
      setError("The attachment could not be uploaded. Please retry.");
      return;
    }
    const finalizeForm = new FormData();
    finalizeForm.set("viewerRole", viewerRole);
    finalizeForm.set("reportId", report.report_id);
    finalizeForm.set("attachmentId", prepared.upload.attachmentId);
    const finalized = await finalizeParentReportAttachmentUploadAction(finalizeForm);
    setFeedback(finalized.status === "success" ? finalized.message ?? "Attachment uploaded." : "");
    setError(finalized.status === "error" ? finalized.message ?? "Finalization failed." : "");
    if (finalized.status === "success") {
      formElement.reset();
      router.refresh();
    }
  }

  return (
    <div className="parent-report-workspace">
      {viewerRole === "counselor" && studentId && (
        <section className={`${sectionCardClass} parent-report-create`}>
          <div>
            <h2>Create a Parent Report</h2>
            <p>
              Each draft captures a frozen, parent-safe source snapshot. Finalized
              reports remain immutable; corrections use a new version.
            </p>
          </div>
          <form action={createFormAction}>
            <input name="studentId" type="hidden" value={studentId} />
            <label htmlFor="parentReportAcademicPeriod">Academic period</label>
            <div className="parent-report-inline-form">
              <input
                id="parentReportAcademicPeriod"
                maxLength={80}
                name="academicPeriod"
                placeholder="Example: Semester 6 · 2026"
                required
              />
              <button className="button" disabled={createPending} type="submit">
                {createPending ? "Creating…" : "Create Draft"}
              </button>
            </div>
            {createState.message && (
              <p className={createState.status === "error" ? "form-error" : "form-success"}>
                {createState.message}
              </p>
            )}
          </form>
        </section>
      )}

      {viewerRole === "counselor" && reports.length > 0 && studentId && (
        <nav aria-label="Parent Report versions" className="parent-report-version-nav">
          {reports.map((item) => (
            <Link
              aria-current={item.report_id === report?.report_id ? "page" : undefined}
              href={`/counselor/students/${studentId}/report?report=${item.report_id}`}
              key={item.report_id}
            >
              {item.academic_period} · v{item.version_number} · {parentReportStatusLabels[item.status]}
            </Link>
          ))}
        </nav>
      )}

      {!workspace || !report ? (
        <section className={`${sectionCardClass} parent-report-empty`}>
          <h2>No Parent Report selected</h2>
          <p>Create a draft to begin from a verified, parent-safe snapshot.</p>
        </section>
      ) : (
        <>
          <section className={`${sectionCardClass} parent-report-header`}>
            <div>
              <span className="inline-block text-[0.76rem] font-[850] uppercase leading-[1.4] tracking-[0.12em] text-[var(--brand-600)]">
                {report.academic_period} · Version {report.version_number}
              </span>
              {/* Director opens this as its own page; the Counselor renders it
                  inside the Student Workspace, which already owns the h1. */}
              {viewerRole === "director" ? (
                <h1>Parent Progress Report</h1>
              ) : (
                <h2>Parent Progress Report</h2>
              )}
              <p>
                Status: <strong>{parentReportStatusLabels[report.status]}</strong>
                {report.finalized_at
                  ? ` · Finalized ${formatParentReportTimestamp(report.finalized_at)}`
                  : ""}
              </p>
            </div>
            <a className="button button-secondary" href={previewHref} rel="noreferrer" target="_blank">
              {report.status === "finalized" ? "Download Final PDF" : "Preview PDF"}
            </a>
          </section>

          <SourceSnapshot snapshot={report.source_snapshot} />

          <form action={saveFormAction} className={`${sectionCardClass} parent-report-editor`}>
            <input name="reportId" type="hidden" value={report.report_id} />
            <header>
              <h2>Report narrative</h2>
              <p>Private Counselor Notes and individual follow-ups are never report sources.</p>
            </header>
            <fieldset disabled={!canEdit || savePending}>
              <NarrativeField label="Semester overview" name="semesterOverview" value={report.semester_overview} limit={3000} />
              <NarrativeField label="Strengths and highlights" name="strengthsHighlights" value={report.strengths_highlights} limit={3000} />
              <NarrativeField label="Areas requiring attention" name="areasRequiringAttention" value={report.areas_requiring_attention} limit={3000} />
              <NarrativeField label="Next actions" name="nextActions" value={report.next_actions} limit={3000} />
              <NarrativeField label="Counselor remarks" name="counselorRemarks" value={report.counselor_remarks} limit={2000} />
              {viewerRole === "director" && (
                <NarrativeField label="Director remarks" name="directorRemarks" value={report.director_remarks} limit={2000} />
              )}
              {canEdit && (
                <button className="button" type="submit">
                  {savePending ? "Saving…" : "Save Narrative"}
                </button>
              )}
            </fieldset>
            {saveState.message && (
              <p className={saveState.status === "error" ? "form-error" : "form-success"}>
                {saveState.message}
              </p>
            )}
          </form>

          <section className={`${sectionCardClass} parent-report-attachments`}>
            <header>
              <h2>Report attachments</h2>
              <p>Only explicit selections appear after the two-page core report.</p>
            </header>
            {workspace.attachments.length === 0 ? (
              <p>No attachments selected.</p>
            ) : (
              <ul>
                {workspace.attachments.map((attachment) => (
                  <li key={attachment.attachment_id}>
                    <span>
                      <strong>{attachment.display_name}</strong>
                      <small>{attachment.source_type.replaceAll("_", " ")} · {formatBytes(attachment.file_size_bytes)}</small>
                    </span>
                    {canEdit && (
                      <button
                        className="button button-danger button-small"
                        disabled={pending}
                        onClick={() => {
                          const form = new FormData();
                          form.set("viewerRole", viewerRole);
                          form.set("reportId", report.report_id);
                          form.set("attachmentId", attachment.attachment_id);
                          runMutation(removeParentReportAttachmentAction, form);
                        }}
                        type="button"
                      >
                        Remove
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {canEdit && (
              <div className="parent-report-attachment-controls">
                <div>
                  <h3>Select an existing safe document</h3>
                  {candidates.length === 0 ? (
                    <p>No eligible unselected documents are available.</p>
                  ) : (
                    <ul>
                      {candidates.map((candidate) => (
                        <li key={`${candidate.source_type}:${candidate.source_document_id}`}>
                          <span>{candidate.display_name} · {formatBytes(candidate.file_size_bytes)}</span>
                          <button
                            className="button button-secondary button-small"
                            disabled={pending}
                            onClick={() => {
                              const form = new FormData();
                              form.set("viewerRole", viewerRole);
                              form.set("reportId", report.report_id);
                              form.set("sourceType", candidate.source_type);
                              form.set("sourceDocumentId", candidate.source_document_id);
                              form.set("displayName", candidate.display_name);
                              runMutation(addParentReportExistingAttachmentAction, form);
                            }}
                            type="button"
                          >
                            Add
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <form onSubmit={handleUpload}>
                  <h3>Upload report-specific attachment</h3>
                  <label htmlFor="parentReportAttachmentName">Display name</label>
                  <input id="parentReportAttachmentName" maxLength={100} name="displayName" required />
                  <label htmlFor="parentReportAttachmentFile">PDF, JPEG, or PNG · 10 MB maximum</label>
                  <input accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" id="parentReportAttachmentFile" ref={fileRef} required type="file" />
                  <button className="button button-secondary" disabled={pending} type="submit">Upload Attachment</button>
                </form>
              </div>
            )}
          </section>

          <WorkflowActions
            pending={pending}
            reportId={report.report_id}
            status={report.status}
            viewerRole={viewerRole}
            runMutation={runMutation}
          />

          {(feedback || error) && (
            <p className={error ? "form-error" : "form-success"} role={error ? "alert" : "status"}>
              {error || feedback}
            </p>
          )}

          <section className={`${sectionCardClass} parent-report-history`}>
            {/* Collapsed by default: the log is reference material, opened on demand. */}
            <details>
              <summary>
                <h2>Audit history</h2>
                <span>
                  {workspace.events.length}{" "}
                  {workspace.events.length === 1 ? "event" : "events"}
                </span>
                <ChevronDown aria-hidden="true" size={20} />
              </summary>
              <ol>
                {workspace.events.map((event) => (
                  <li key={event.event_id}>
                    <strong>{event.event_type.replaceAll("_", " ")}</strong>
                    <span>{event.actor_name} · {formatParentReportTimestamp(event.occurred_at)}</span>
                    {event.event_reason && <p>{event.event_reason}</p>}
                  </li>
                ))}
              </ol>
            </details>
          </section>
        </>
      )}
    </div>
  );
}

function WorkflowActions({
  pending,
  reportId,
  status,
  viewerRole,
  runMutation,
}: {
  pending: boolean;
  reportId: string;
  status: ParentReportWorkspace["report"]["status"];
  viewerRole: Props["viewerRole"];
  runMutation: (
    action: (formData: FormData) => Promise<{ status: string; message?: string }>,
    formData: FormData,
  ) => void;
}) {
  const reportForm = () => {
    const form = new FormData();
    form.set("reportId", reportId);
    return form;
  };
  if (viewerRole === "counselor" && (status === "draft" || status === "revision_requested")) {
    return (
      <section className={`${sectionCardClass} parent-report-workflow-actions`}>
        <h2>Submit for review</h2>
        <p>Save the narrative and confirm selected attachments before submission.</p>
        <button className="button" disabled={pending} onClick={() => runMutation(submitParentReportAction, reportForm())} type="button">Submit to Director</button>
      </section>
    );
  }
  if (viewerRole === "director" && status === "director_review") {
    return (
      <section className={`${sectionCardClass} parent-report-workflow-actions`}>
        <h2>Director decision</h2>
        <div className="parent-report-inline-actions">
          <form onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            form.set("reportId", reportId);
            runMutation(requestParentReportRevisionAction, form);
          }}>
            <label htmlFor="parentReportRevisionReason">Revision reason</label>
            <input id="parentReportRevisionReason" maxLength={1000} name="reason" required />
            <button className="button button-secondary" disabled={pending} type="submit">Request Revision</button>
          </form>
          <button className="button" disabled={pending} onClick={() => runMutation(approveParentReportAction, reportForm())} type="button">Approve Report</button>
        </div>
      </section>
    );
  }
  if (viewerRole === "director" && status === "approved") {
    return (
      <section className={`${sectionCardClass} parent-report-workflow-actions`}>
        <h2>Finalize immutable PDF</h2>
        <p>Finalization seals the snapshot, narrative, attachment selection, and generated PDF.</p>
        <button className="button" disabled={pending} onClick={() => runMutation(finalizeParentReportAction, reportForm())} type="button">Finalize Report</button>
      </section>
    );
  }
  return null;
}

function NarrativeField({ label, name, value, limit }: { label: string; name: string; value: string | null; limit: number }) {
  return (
    <div className="field">
      <label htmlFor={`parentReport-${name}`}>{label}</label>
      <textarea defaultValue={value ?? ""} id={`parentReport-${name}`} maxLength={limit} name={name} rows={5} />
    </div>
  );
}

function SourceSnapshot({ snapshot }: { snapshot: ParentReportWorkspace["report"]["source_snapshot"] }) {
  const student = snapshot.student;
  return (
    <section className={`${sectionCardClass} parent-report-source`}>
      <header>
        <h2>Verified information captured for this version</h2>
        <p>Captured {formatParentReportTimestamp(snapshot.captured_at)}. Later operational changes do not rewrite this version.</p>
      </header>
      <dl>
        <SourceFact label="Student" value={student.full_name} />
        <SourceFact label="Roll number" value={student.roll_number} />
        <SourceFact label="Course" value={student.course} />
        <SourceFact label="Department" value={student.department} />
        <SourceFact label="Current semester" value={student.current_semester} />
        <SourceFact label="Applications" value={snapshot.applications.length} />
        <SourceFact label="Achievements" value={snapshot.achievements.length} />
        <SourceFact label="Recorded exams" value={snapshot.study_abroad_exams.length} />
      </dl>
    </section>
  );
}

function SourceFact({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined || value === "") return null;
  return <div><dt>{label}</dt><dd>{String(value)}</dd></div>;
}

function formatBytes(value: number): string {
  return value < 1024 * 1024
    ? `${Math.ceil(value / 1024)} KB`
    : `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
