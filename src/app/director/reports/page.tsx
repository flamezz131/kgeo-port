import Link from "next/link";
import { parentReportStatusLabels, formatParentReportTimestamp } from "@/lib/parent-reports/parent-report";
import { loadDirectorParentReports } from "@/lib/parent-reports/server";
import { sectionCardClass } from "@/components/shell/form-ui";

export default async function DirectorParentReportsPage() {
  const result = await loadDirectorParentReports();
  if (result.kind === "unavailable") {
    return <section className="counselor-page" role="alert"><h1>Parent Reports are temporarily unavailable.</h1></section>;
  }
  return (
    <section className="counselor-page director-parent-reports">
      <header className="counselor-page-header">
        <div><span className="eyebrow">Director review workspace</span><h1>Parent Reports</h1><p>Review parent-safe narrative and selected attachments before immutable finalization.</p></div>
      </header>
      {result.reports.length === 0 ? (
        <div className={sectionCardClass}><h2>No reports awaiting or completing review</h2><p>Counselor submissions will appear here.</p></div>
      ) : (
        <div className="parent-report-director-list">
          {result.reports.map((report) => (
            <Link className={sectionCardClass} href={`/director/reports/${report.report_id}`} key={report.report_id}>
              <span className="inline-block text-[0.76rem] font-[850] uppercase leading-[1.4] tracking-[0.12em] text-[var(--brand-600)]">{parentReportStatusLabels[report.status]}</span>
              <h2>{report.student_name}</h2>
              <p>{report.academic_period} · Version {report.version_number}</p>
              <small>Primary Counselor: {report.counselor_name} · Updated {formatParentReportTimestamp(report.updated_at)}</small>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
