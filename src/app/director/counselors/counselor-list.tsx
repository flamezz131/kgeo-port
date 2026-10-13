"use client";

import { useMemo, useState, useTransition } from "react";
import {
  approveCounselorAction,
  rejectCounselorAction,
} from "@/app/actions/director-counselor-actions";

type CounselorRow = {
  userId: string;
  username: string;
  fullName: string;
  approvalStatus: "pending" | "approved" | "rejected";
  isActive: boolean;
  createdAt: string;
};

type CounselorSection = "pending" | "approved" | "inactive";

const sectionLabels: Record<CounselorSection, string> = {
  pending: "Pending Counselors",
  approved: "Approved Counselors",
  inactive: "Rejected / Inactive",
};

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "UTC",
});

function formatRequestedDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Date unavailable"
    : dateFormatter.format(date);
}

export function DirectorCounselorList({
  counselors,
  isUnavailable,
}: {
  counselors: CounselorRow[];
  isUnavailable: boolean;
}) {
  const [selectedSection, setSelectedSection] =
    useState<CounselorSection>("pending");
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    kind: "error" | "success";
    message: string;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const sections = useMemo(
    () => ({
      pending: counselors.filter(
        (counselor) => counselor.approvalStatus === "pending",
      ),
      approved: counselors.filter(
        (counselor) =>
          counselor.approvalStatus === "approved" && counselor.isActive,
      ),
      inactive: counselors.filter(
        (counselor) =>
          counselor.approvalStatus === "rejected" ||
          (counselor.approvalStatus === "approved" && !counselor.isActive),
      ),
    }),
    [counselors],
  );

  function transitionCounselor(
    counselor: CounselorRow,
    operation: "approve" | "reject",
  ) {
    const confirmed = window.confirm(
      `${operation === "approve" ? "Approve" : "Reject"} ${counselor.fullName}'s counselor registration?`,
    );
    if (!confirmed) return;

    setFeedback(null);
    setActiveUserId(counselor.userId);
    startTransition(async () => {
      const result =
        operation === "approve"
          ? await approveCounselorAction(counselor.userId)
          : await rejectCounselorAction(counselor.userId);
      setFeedback({
        kind: result.status === "success" ? "success" : "error",
        message:
          result.message ?? "The counselor approval state could not be changed.",
      });
      setActiveUserId(null);
    });
  }

  if (isUnavailable) {
    return (
      <div className="director-state director-state-error" role="alert">
        <h2>Counselor registrations are temporarily unavailable</h2>
        <p>Refresh the page and try again. No approval state was changed.</p>
      </div>
    );
  }

  const visibleCounselors = sections[selectedSection];

  return (
    <div className="director-approval-panel">
      <nav aria-label="Counselor approval states" className="approval-tabs">
        {(Object.keys(sectionLabels) as CounselorSection[]).map((section) => (
          <button
            aria-current={selectedSection === section ? "page" : undefined}
            className={selectedSection === section ? "is-active" : undefined}
            key={section}
            onClick={() => setSelectedSection(section)}
            type="button"
          >
            <span>{sectionLabels[section]}</span>
            <strong>{sections[section].length}</strong>
          </button>
        ))}
      </nav>

      <div aria-live="polite">
        {feedback && (
          <p
            className={
              feedback.kind === "success" ? "form-success" : "form-error"
            }
            role={feedback.kind === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        )}
      </div>

      {visibleCounselors.length === 0 ? (
        <div className="director-state" role="status">
          <h2>No {sectionLabels[selectedSection].toLowerCase()}</h2>
          <p>New or updated counselor registrations will appear here.</p>
        </div>
      ) : (
        <div className="director-approval-table-wrapper">
          <table className="director-approval-table">
            <caption>{sectionLabels[selectedSection]}</caption>
            <thead>
              <tr>
                <th scope="col">Counselor</th>
                <th scope="col">Username</th>
                <th scope="col">Requested</th>
                <th scope="col">Status</th>
                {selectedSection === "pending" && (
                  <th scope="col">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {visibleCounselors.map((counselor) => {
                const isThisRowPending =
                  isPending && activeUserId === counselor.userId;
                return (
                  <tr key={counselor.userId}>
                    <th data-label="Counselor" scope="row">
                      {counselor.fullName}
                    </th>
                    <td data-label="Username">{counselor.username}</td>
                    <td data-label="Requested">
                      {formatRequestedDate(counselor.createdAt)}
                    </td>
                    <td data-label="Status">
                      <span
                        className={`director-approval-status is-${counselor.approvalStatus}`}
                      >
                        {counselor.approvalStatus}
                      </span>
                      {counselor.approvalStatus === "approved" &&
                        !counselor.isActive && (
                          <span className="director-approval-status is-inactive">
                            inactive
                          </span>
                        )}
                    </td>
                    {selectedSection === "pending" && (
                      <td data-label="Actions">
                        <div className="approval-actions">
                          <button
                            className="button button-small"
                            disabled={isPending}
                            onClick={() =>
                              transitionCounselor(counselor, "approve")
                            }
                            type="button"
                          >
                            {isThisRowPending ? "Working…" : "Approve"}
                          </button>
                          <button
                            className="button button-secondary button-small approval-reject-button"
                            disabled={isPending}
                            onClick={() =>
                              transitionCounselor(counselor, "reject")
                            }
                            type="button"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
