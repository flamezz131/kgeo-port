import Link from "next/link";
import type { CounselorProfileDocumentResult } from "@/lib/counselor/profile-documents-server";
import {
  STUDENT_PROFILE_DOCUMENT_TYPE_LABELS,
  formatProfileDocumentDate,
  formatProfileDocumentSize,
} from "@/lib/student/profile-documents";

export function CounselorStudentProfileDocuments({
  result,
  studentId,
}: {
  result: CounselorProfileDocumentResult;
  studentId: string;
}) {
  return (
    <section>
      <header className="student-workspace-section-header">
        <h2>Profile Documents</h2>
        <p>
          Read-only documents shared with the Student’s current Primary Counselor.
          Progression evidence remains in Journey Progress, and university-specific
          documents remain inside each Application.
        </p>
      </header>
      <section className="student-workspace-panel">
        {result.kind === "unavailable" ? (
          <p className="student-workspace-empty" role="alert">Profile Documents are temporarily unavailable.</p>
        ) : result.kind === "not_found" ? (
          <p className="student-workspace-empty">This Student is not available in your active Primary caseload.</p>
        ) : result.documents.length === 0 ? (
          <p className="student-workspace-empty">No Profile Documents uploaded.</p>
        ) : (
          <ul className="profile-document-list counselor-profile-document-list">
            {result.documents.map((document) => (
              <li key={document.documentId}>
                <div>
                  <span>{STUDENT_PROFILE_DOCUMENT_TYPE_LABELS[document.documentType]}</span>
                  <strong>{document.displayName}</strong>
                  <small>{document.originalFileName} · {formatProfileDocumentSize(document.fileSizeBytes)} · Uploaded {formatProfileDocumentDate(document.availableAt)}</small>
                </div>
                <a className="button button-secondary" href={`/counselor/students/${studentId}/documents/${document.documentId}/view`} rel="noreferrer" target="_blank">View</a>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="student-workspace-document-separation">
        <Link href={`/counselor/students/${studentId}/advisory`}>Journey Progress</Link>
        {" · "}
        <Link href={`/counselor/students/${studentId}/applications`}>University Applications</Link>
      </p>
    </section>
  );
}
