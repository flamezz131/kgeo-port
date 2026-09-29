import "server-only";

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";
import type { ParentReportRenderPayload } from "./parent-report";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 44;
const BODY_SIZE = 9.5;
const LINE_HEIGHT = 13;
const MAX_ATTACHMENT_PAGES = 40;

export type ParentReportPdfAttachment = {
  bytes: Uint8Array;
  displayName: string;
  mimeType: string;
};

type DrawContext = {
  page: PDFPage;
  regular: PDFFont;
  bold: PDFFont;
  y: number;
};

export async function createParentReportPdf(
  report: ParentReportRenderPayload,
  attachments: ParentReportPdfAttachment[] = [],
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const capturedAt = new Date(report.source_snapshot.captured_at);
  document.setTitle(`K-GEO Parent Report - ${report.academic_period}`);
  document.setAuthor("K-GEO");
  document.setCreator("K-GEO Parent Report Workflow");
  document.setProducer("K-GEO");
  document.setCreationDate(capturedAt);
  document.setModificationDate(capturedAt);

  const pageOne = document.addPage([A4_WIDTH, A4_HEIGHT]);
  const first = startPage(pageOne, regular, bold, report);
  drawHeading(first, "Student readiness snapshot");
  drawStudentFacts(first, report.source_snapshot.student);
  drawSection(first, "Academic period", report.academic_period);
  drawCompactObject(first, "Study preferences", report.source_snapshot.preferences);
  drawRecordList(
    first,
    "Study Abroad Exams",
    report.source_snapshot.study_abroad_exams,
    ["exam_name", "status", "score"],
  );
  drawRecordList(
    first,
    "Achievements and highlights",
    report.source_snapshot.achievements,
    ["title", "type", "organization"],
  );
  drawSection(first, "Semester overview", report.semester_overview);
  drawSection(first, "Strengths and highlights", report.strengths_highlights);
  drawSection(
    first,
    "Areas requiring attention",
    report.areas_requiring_attention,
  );
  drawFooter(pageOne, regular, report, 1);

  const pageTwo = document.addPage([A4_WIDTH, A4_HEIGHT]);
  const second = startPage(pageTwo, regular, bold, report);
  drawHeading(second, "Higher studies journey");
  drawCompactObject(
    second,
    "Current journey",
    report.source_snapshot.journey_progress,
  );
  drawApplicationFacts(second, report.source_snapshot.applications);
  drawCompactObject(
    second,
    "Counselor semester summary",
    report.source_snapshot.semester_summary,
  );
  drawSection(second, "Next actions", report.next_actions);
  drawSection(second, "Counselor remarks", report.counselor_remarks);
  drawSection(second, "Director remarks", report.director_remarks);
  drawReportMetadata(second, report);
  drawFooter(pageTwo, regular, report, 2);

  let appendedPages = 0;
  for (const attachment of attachments) {
    if (attachment.mimeType === "application/pdf") {
      const source = await PDFDocument.load(attachment.bytes, {
        ignoreEncryption: false,
        updateMetadata: false,
      });
      if (appendedPages + source.getPageCount() > MAX_ATTACHMENT_PAGES) {
        throw new Error("Selected attachments exceed the 40-page report limit.");
      }
      const copied = await document.copyPages(source, source.getPageIndices());
      copied.forEach((page) => document.addPage(page));
      appendedPages += copied.length;
      continue;
    }

    if (appendedPages >= MAX_ATTACHMENT_PAGES) {
      throw new Error("Selected attachments exceed the 40-page report limit.");
    }
    const page = document.addPage([A4_WIDTH, A4_HEIGHT]);
    const image =
      attachment.mimeType === "image/png"
        ? await document.embedPng(attachment.bytes)
        : await document.embedJpg(attachment.bytes);
    const maximumWidth = A4_WIDTH - PAGE_MARGIN * 2;
    const maximumHeight = A4_HEIGHT - PAGE_MARGIN * 2 - 36;
    const scale = Math.min(
      maximumWidth / image.width,
      maximumHeight / image.height,
      1,
    );
    page.drawText(safePdfText(attachment.displayName), {
      x: PAGE_MARGIN,
      y: A4_HEIGHT - PAGE_MARGIN,
      font: bold,
      size: 11,
      color: rgb(0.08, 0.2, 0.35),
    });
    page.drawImage(image, {
      x: (A4_WIDTH - image.width * scale) / 2,
      y: PAGE_MARGIN,
      width: image.width * scale,
      height: image.height * scale,
    });
    appendedPages += 1;
  }

  return document.save({
    addDefaultPage: false,
    useObjectStreams: false,
    updateFieldAppearances: false,
  });
}

function startPage(
  page: PDFPage,
  regular: PDFFont,
  bold: PDFFont,
  report: ParentReportRenderPayload,
): DrawContext {
  page.drawRectangle({
    x: 0,
    y: A4_HEIGHT - 76,
    width: A4_WIDTH,
    height: 76,
    color: rgb(0.04, 0.16, 0.29),
  });
  page.drawText("K-GEO", {
    x: PAGE_MARGIN,
    y: A4_HEIGHT - 36,
    font: bold,
    size: 20,
    color: rgb(1, 1, 1),
  });
  page.drawText("Parent Progress Report", {
    x: PAGE_MARGIN,
    y: A4_HEIGHT - 57,
    font: regular,
    size: 10,
    color: rgb(0.84, 0.91, 0.98),
  });
  page.drawText(
    safePdfText(`${report.academic_period}  |  Version ${report.version_number}`),
    {
      x: A4_WIDTH - PAGE_MARGIN - 190,
      y: A4_HEIGHT - 48,
      font: regular,
      size: 9,
      color: rgb(1, 1, 1),
    },
  );
  return { page, regular, bold, y: A4_HEIGHT - 103 };
}

function drawHeading(context: DrawContext, text: string) {
  context.page.drawText(text, {
    x: PAGE_MARGIN,
    y: context.y,
    font: context.bold,
    size: 16,
    color: rgb(0.04, 0.16, 0.29),
  });
  context.y -= 29;
}

function drawStudentFacts(context: DrawContext, value: Record<string, unknown>) {
  const ordered = [
    ["Student", value.full_name],
    ["Roll number", value.roll_number],
    ["Course", value.course],
    ["Department", value.department],
    ["Current year / semester", joinValues(value.current_year, value.current_semester)],
    ["Expected graduation", value.graduation_year],
    ["CGPA", joinValues(value.cgpa, value.cgpa_scale)],
    ["Active backlogs", value.active_backlogs],
  ] as const;
  for (const [label, item] of ordered) {
    const formatted = formatSourceValue(item);
    if (formatted) drawKeyValue(context, label, formatted);
  }
  context.y -= 5;
}

function drawApplicationFacts(
  context: DrawContext,
  applications: Array<Record<string, unknown>>,
) {
  if (applications.length === 0) return;
  drawSubheading(context, "University applications");
  for (const application of applications.slice(0, 6)) {
    const title = [application.university_name, application.programme_name]
      .filter((value) => typeof value === "string" && value.length > 0)
      .join(" - ");
    const status = formatSourceValue(
      application.journey_status ?? application.status,
    );
    drawLines(
      context,
      [`• ${title || "Application"}${status ? ` (${status})` : ""}`],
      2,
    );
  }
  context.y -= 5;
}

function drawCompactObject(
  context: DrawContext,
  heading: string,
  value: Record<string, unknown>,
) {
  const entries = Object.entries(value)
    .filter(([, item]) => formatSourceValue(item) !== "")
    .slice(0, 8);
  if (entries.length === 0) return;
  drawSubheading(context, heading);
  for (const [key, item] of entries) {
    drawKeyValue(context, humanizeKey(key), formatSourceValue(item));
  }
  context.y -= 5;
}

function drawSection(context: DrawContext, heading: string, value: string | null) {
  if (!value) return;
  drawSubheading(context, heading);
  drawLines(
    context,
    wrapText(value, context.regular, BODY_SIZE, A4_WIDTH - PAGE_MARGIN * 2),
    7,
  );
  context.y -= 7;
}

function drawRecordList(
  context: DrawContext,
  heading: string,
  records: Array<Record<string, unknown>>,
  keys: string[],
) {
  if (records.length === 0) return;
  drawSubheading(context, heading);
  for (const record of records.slice(0, 5)) {
    const value = keys
      .map((key) => formatSourceValue(record[key]))
      .filter(Boolean)
      .join(" · ");
    if (value) drawLines(context, [`• ${value}`], 1);
  }
  context.y -= 5;
}

function drawReportMetadata(
  context: DrawContext,
  report: ParentReportRenderPayload,
) {
  const metadata: Array<[string, string | null]> = [
    ["Academic period", report.academic_period],
    ["Report version", String(report.version_number)],
    ["Counselor", report.counselor_name],
    ["Director", report.director_name],
    ["Approved", report.approved_at ? formatReportDate(report.approved_at) : null],
  ];
  if (!metadata.some(([, value]) => value)) return;
  drawSubheading(context, "Report metadata");
  for (const [label, value] of metadata) {
    if (value) drawKeyValue(context, label, value);
  }
}

function drawSubheading(context: DrawContext, text: string) {
  if (context.y < 74) return;
  context.page.drawText(text, {
    x: PAGE_MARGIN,
    y: context.y,
    font: context.bold,
    size: 11,
    color: rgb(0.08, 0.29, 0.47),
  });
  context.y -= 17;
}

function drawKeyValue(context: DrawContext, key: string, value: string) {
  if (context.y < 74) return;
  context.page.drawText(`${safePdfText(key)}:`, {
    x: PAGE_MARGIN,
    y: context.y,
    font: context.bold,
    size: BODY_SIZE,
    color: rgb(0.18, 0.23, 0.29),
  });
  const lines = wrapText(value, context.regular, BODY_SIZE, 330).slice(0, 2);
  lines.forEach((line, index) => {
    context.page.drawText(line, {
      x: PAGE_MARGIN + 150,
      y: context.y - index * LINE_HEIGHT,
      font: context.regular,
      size: BODY_SIZE,
      color: rgb(0.18, 0.23, 0.29),
    });
  });
  context.y -= Math.max(1, lines.length) * LINE_HEIGHT;
}

function drawLines(context: DrawContext, lines: string[], maximumLines: number) {
  const visible = lines.slice(0, maximumLines);
  visible.forEach((line, index) => {
    if (context.y - index * LINE_HEIGHT < 68) return;
    const suffix = index === maximumLines - 1 && lines.length > maximumLines ? "..." : "";
    context.page.drawText(`${safePdfText(line)}${suffix}`, {
      x: PAGE_MARGIN,
      y: context.y - index * LINE_HEIGHT,
      font: context.regular,
      size: BODY_SIZE,
      color: rgb(0.18, 0.23, 0.29),
    });
  });
  context.y -= visible.length * LINE_HEIGHT;
}

function drawFooter(
  page: PDFPage,
  font: PDFFont,
  report: ParentReportRenderPayload,
  pageNumber: number,
) {
  page.drawLine({
    start: { x: PAGE_MARGIN, y: 48 },
    end: { x: A4_WIDTH - PAGE_MARGIN, y: 48 },
    thickness: 0.5,
    color: rgb(0.75, 0.8, 0.85),
  });
  page.drawText(
    safePdfText(`K-GEO confidential parent report  |  ${report.report_id}`),
    { x: PAGE_MARGIN, y: 31, font, size: 7, color: rgb(0.38, 0.43, 0.48) },
  );
  page.drawText(`Core page ${pageNumber} of 2`, {
    x: A4_WIDTH - PAGE_MARGIN - 70,
    y: 31,
    font,
    size: 7,
    color: rgb(0.38, 0.43, 0.48),
  });
}

function wrapText(text: string, font: PDFFont, size: number, width: number): string[] {
  const words = safePdfText(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : ["No information recorded."];
}

function safePdfText(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[^\x20-\x7E]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatReportDate(value: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeZone: "Asia/Kolkata",
  }).format(new Date(value));
}

function humanizeKey(value: string): string {
  return value.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

function formatSourceValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map(formatSourceValue).filter(Boolean).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "string") return safePdfText(String(value));
  return "";
}

function joinValues(first: unknown, second: unknown): string {
  return [formatSourceValue(first), formatSourceValue(second)]
    .filter(Boolean)
    .join(" / ");
}
