import "server-only";
import { readFileSync } from "fs";
import path from "path";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFImage,
} from "pdf-lib";
import type { ParentReportRenderPayload } from "./parent-report";

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const PAGE_MARGIN = 36;
const BODY_SIZE = 9;
const MAX_ATTACHMENT_PAGES = 40;
// Resolved from the project root so the logo loads on any machine.
const LOGO_PATH = path.join(process.cwd(), "src", "logo", "image.png");

function rgbFromHex(hex: string) {
  const r = parseInt(hex.substring(1, 3), 16) / 255;
  const g = parseInt(hex.substring(3, 5), 16) / 255;
  const b = parseInt(hex.substring(5, 7), 16) / 255;
  return rgb(r, g, b);
}

const COLORS = {
  navy: rgbFromHex('#0b1f3a'),
  royal: rgbFromHex('#1d4ed8'),
  surface: rgbFromHex('#f1f5f9'),
  text: rgbFromHex('#0f172a'),
  muted: rgbFromHex('#64748b'),
  line: rgbFromHex('#cbd5e1'), 
  greenPillBg: rgbFromHex('#dcfce7'),
  greenPillText: rgbFromHex('#166534'),
  white: rgb(1,1,1),
  amber: rgbFromHex('#d97706'),
  emerald: rgbFromHex('#10b981'),
};

export type ParentReportPdfAttachment = {
  bytes: Uint8Array;
  displayName: string;
  mimeType: string;
};

type LayoutContext = {
  doc: PDFDocument;
  page: PDFPage;
  y: number;
  pageNum: number;
  regular: PDFFont;
  bold: PDFFont;
  logo: PDFImage | null;
  report: ParentReportRenderPayload;
};

// --- Formatters ---
function formatEnum(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function formatBudget(val: unknown): string {
  if (typeof val !== 'string') return formatSourceValue(val);
  let v = val.toLowerCase();
  v = v.replace(/([0-9]+)\s*to\s*rs\.?\s*([0-9]+)\s*lakhs/i, 'Rs. $1-$2 Lakhs');
  v = v.replace(/([0-9]+)\s*to\s*([0-9]+)\s*lakhs/i, 'Rs. $1-$2 Lakhs');
  if (v.includes('lakhs') && !v.includes('rs')) {
    v = v.replace(/([0-9-]+)\s*lakhs/i, 'Rs. $1 Lakhs');
  }
  return v;
}

function formatDateStr(val: unknown): string {
  if (typeof val !== 'string') return '';
  try {
    const d = new Date(val);
    if (isNaN(d.getTime())) return val;
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  } catch {
    return val;
  }
}

function safePdfText(value: string): string {
  return value.normalize("NFKC").replace(/[^\x20-\x7E]/g, " ").trim();
}

function formatSourceValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "";
  if (Array.isArray(value)) return value.map(formatSourceValue).filter(Boolean).join(", ");
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" || typeof value === "string") return safePdfText(String(value));
  return "";
}

// --- Layout Engine ---
function wrapTextToLines(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const paragraphs = text.split('\n');
  const allLines: string[] = [];
  
  for (const p of paragraphs) {
    if (p.trim() === '') {
      allLines.push('');
      continue;
    }
    const words = p.split(/\s+/);
    let currentLine = '';
    
    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(safePdfText(candidate), size);
      
      if (width <= maxWidth) {
        currentLine = candidate;
      } else {
        if (!currentLine) {
           let tempWord = '';
           for(const char of word) {
             if (font.widthOfTextAtSize(safePdfText(tempWord + char), size) <= maxWidth) {
               tempWord += char;
             } else {
               allLines.push(tempWord);
               tempWord = char;
             }
           }
           currentLine = tempWord;
        } else {
           allLines.push(currentLine);
           currentLine = word;
        }
      }
    }
    if (currentLine) {
      allLines.push(currentLine);
    }
  }
  return allLines;
}

function addPage(ctx: LayoutContext) {
  ctx.page = ctx.doc.addPage([A4_WIDTH, A4_HEIGHT]);
  ctx.pageNum++;
  
  if (ctx.logo) {
    const wmWidth = 140; 
    const wmHeight = (ctx.logo.height / ctx.logo.width) * wmWidth;
    ctx.page.drawImage(ctx.logo, {
      x: (A4_WIDTH - wmWidth) / 2, y: (A4_HEIGHT - wmHeight) / 2,
      width: wmWidth, height: wmHeight, opacity: 0.06
    });
  }
  
  const HEADER_HEIGHT = 50;
  ctx.page.drawRectangle({
    x: 0, y: A4_HEIGHT - HEADER_HEIGHT, width: A4_WIDTH, height: HEADER_HEIGHT, color: COLORS.white
  });
  ctx.page.drawLine({
    start: { x: PAGE_MARGIN, y: A4_HEIGHT - HEADER_HEIGHT }, end: { x: A4_WIDTH - PAGE_MARGIN, y: A4_HEIGHT - HEADER_HEIGHT },
    thickness: 1, color: COLORS.line
  });
  
  if (ctx.logo) {
    const logoHeight = 22;
    const logoWidth = (ctx.logo.width / ctx.logo.height) * logoHeight;
    ctx.page.drawImage(ctx.logo, {
      x: PAGE_MARGIN, y: A4_HEIGHT - HEADER_HEIGHT + (HEADER_HEIGHT - logoHeight) / 2,
      width: logoWidth, height: logoHeight
    });
  }
  
  const studentInfo = (ctx.report.source_snapshot.student || {}) as Record<string, unknown>;
  const subtitleText = safePdfText(`${studentInfo.full_name || '--'} | ${studentInfo.roll_number || '--'} | Parent Report`);
  ctx.page.drawText(subtitleText, {
    x: A4_WIDTH - PAGE_MARGIN - ctx.regular.widthOfTextAtSize(subtitleText, 9),
    y: A4_HEIGHT - 30, font: ctx.regular, size: 9, color: COLORS.muted
  });
  
  ctx.y = A4_HEIGHT - HEADER_HEIGHT - 20;
}

function checkSpace(ctx: LayoutContext, neededHeight: number) {
  if (ctx.y - neededHeight < PAGE_MARGIN + 20) {
    addPage(ctx);
  }
}

function drawSectionHeading(ctx: LayoutContext, eyebrow: string, title: string) {
  ctx.y -= 10; 
  checkSpace(ctx, 45);
  
  ctx.page.drawText(eyebrow.toUpperCase(), { x: PAGE_MARGIN, y: ctx.y, font: ctx.bold, size: 7.5, color: COLORS.royal });
  ctx.y -= 12;
  ctx.page.drawText(safePdfText(title), { x: PAGE_MARGIN, y: ctx.y, font: ctx.bold, size: 12, color: COLORS.navy });
  ctx.page.drawLine({
    start: { x: PAGE_MARGIN, y: ctx.y - 8 },
    end: { x: PAGE_MARGIN + 35, y: ctx.y - 8 },
    thickness: 2, color: COLORS.royal
  });
  ctx.y -= 18; 
}

function drawTableRow(ctx: LayoutContext, label: string, value: string | string[]) {
  const valueLines = Array.isArray(value) ? value : wrapTextToLines(value, ctx.regular, BODY_SIZE, (A4_WIDTH - PAGE_MARGIN * 2) * 0.65);
  const rowHeight = Math.max(1, valueLines.length) * 14 + 14; 
  checkSpace(ctx, rowHeight);
  
  const labelColX = PAGE_MARGIN;
  const valueColX = PAGE_MARGIN + (A4_WIDTH - PAGE_MARGIN * 2) * 0.35;
  
  ctx.page.drawLine({
    start: { x: PAGE_MARGIN, y: ctx.y }, end: { x: A4_WIDTH - PAGE_MARGIN, y: ctx.y },
    thickness: 0.5, color: COLORS.line
  });
  
  ctx.y -= 14;
  ctx.page.drawText(safePdfText(label).toUpperCase(), { x: labelColX, y: ctx.y, font: ctx.bold, size: 7.5, color: COLORS.muted });
  
  let tempY = ctx.y;
  for (const line of valueLines) {
    ctx.page.drawText(safePdfText(line), { x: valueColX, y: tempY, font: ctx.bold, size: BODY_SIZE, color: COLORS.navy });
    tempY -= 14;
  }
  
  ctx.y -= (valueLines.length * 14) + 2; 
}

function drawTableRowChips(ctx: LayoutContext, label: string, items: string[]) {
  if (!items || items.length === 0) {
    drawTableRow(ctx, label, "--");
    return;
  }
  
  let lines = 1;
  let currentX = PAGE_MARGIN + (A4_WIDTH - PAGE_MARGIN * 2) * 0.35;
  for (const item of items) {
    const text = safePdfText(formatEnum(item));
    const w = ctx.regular.widthOfTextAtSize(text, 8);
    if (currentX + w + 12 > A4_WIDTH - PAGE_MARGIN) {
      currentX = PAGE_MARGIN + (A4_WIDTH - PAGE_MARGIN * 2) * 0.35;
      lines++;
    }
    currentX += w + 16;
  }
  
  const rowHeight = lines * 18 + 12;
  checkSpace(ctx, rowHeight);
  
  ctx.page.drawLine({
    start: { x: PAGE_MARGIN, y: ctx.y }, end: { x: A4_WIDTH - PAGE_MARGIN, y: ctx.y },
    thickness: 0.5, color: COLORS.line
  });
  ctx.y -= 14;
  ctx.page.drawText(safePdfText(label).toUpperCase(), { x: PAGE_MARGIN, y: ctx.y, font: ctx.bold, size: 7.5, color: COLORS.muted });
  
  currentX = PAGE_MARGIN + (A4_WIDTH - PAGE_MARGIN * 2) * 0.35;
  let tempY = ctx.y + 2;
  for (const item of items) {
    const text = safePdfText(formatEnum(item));
    const w = ctx.regular.widthOfTextAtSize(text, 8);
    if (currentX + w + 12 > A4_WIDTH - PAGE_MARGIN) {
      currentX = PAGE_MARGIN + (A4_WIDTH - PAGE_MARGIN * 2) * 0.35;
      tempY -= 18;
    }
    ctx.page.drawRectangle({
      x: currentX, y: tempY - 4, width: w + 8, height: 14,
      color: COLORS.surface, borderColor: COLORS.line, borderWidth: 1,
    });
    ctx.page.drawText(text, {
      x: currentX + 4, y: tempY, font: ctx.regular, size: 8, color: COLORS.navy
    });
    currentX += w + 12;
  }
  ctx.y -= (lines * 18) + 4;
}

function drawMetricsCards(ctx: LayoutContext, student: any, prefs: any) {
  checkSpace(ctx, 60);
  const cards = [
    { label: "CGPA", value: `${student.cgpa || '--'}/${student.cgpa_scale || '10'}` },
    { label: "BACKLOGS", value: `${student.active_backlogs || '0'}` },
    { label: "GRADUATION", value: `${student.graduation_year || '--'}` },
    { label: "BUDGET", value: formatBudget(prefs?.budget_range) || '--' },
  ];
  
  const spacing = 8;
  const cardWidth = (A4_WIDTH - (PAGE_MARGIN * 2) - (spacing * 3)) / 4;
  const cardHeight = 40;
  
  cards.forEach((card, i) => {
    const x = PAGE_MARGIN + (cardWidth + spacing) * i;
    ctx.page.drawRectangle({
      x, y: ctx.y - cardHeight, width: cardWidth, height: cardHeight,
      color: COLORS.surface, borderColor: COLORS.line, borderWidth: 1,
    });
    
    let vSize = 11;
    const safeVal = safePdfText(card.value);
    let vWidth = ctx.bold.widthOfTextAtSize(safeVal, vSize);
    while (vWidth > cardWidth - 8 && vSize > 7) {
      vSize -= 0.5;
      vWidth = ctx.bold.widthOfTextAtSize(safeVal, vSize);
    }
    
    ctx.page.drawText(safeVal, {
      x: x + (cardWidth - vWidth) / 2, y: ctx.y - 18, font: ctx.bold, size: vSize, color: COLORS.navy
    });
    
    const lWidth = ctx.bold.widthOfTextAtSize(card.label, 6.5);
    ctx.page.drawText(card.label, {
      x: x + (cardWidth - lWidth) / 2, y: ctx.y - 30, font: ctx.bold, size: 6.5, color: COLORS.muted
    });
  });
  ctx.y -= cardHeight + 20;
}

function drawStepper(ctx: LayoutContext, currentStage: string, startedAt: unknown) {
  const stages = [
    { id: "profile", label: "Profile" },
    { id: "university_shortlisting", label: "Shortlisting" },
    { id: "applications", label: "Applications" },
    { id: "offers", label: "Offers" },
    { id: "visa", label: "Visa" },
  ];
  let currentIndex = stages.findIndex(s => s.id === currentStage);
  if (currentIndex === -1) currentIndex = 0;
  
  checkSpace(ctx, 60); 
  
  const startX = PAGE_MARGIN + 15;
  const endX = A4_WIDTH - PAGE_MARGIN - 15;
  const stepWidth = (endX - startX) / (stages.length - 1);
  
  ctx.page.drawLine({
    start: { x: startX, y: ctx.y - 10 }, end: { x: endX, y: ctx.y - 10 },
    thickness: 2, color: COLORS.line
  });
  
  if (currentIndex > 0) {
    ctx.page.drawLine({
      start: { x: startX, y: ctx.y - 10 }, end: { x: startX + stepWidth * currentIndex, y: ctx.y - 10 },
      thickness: 3, color: COLORS.royal
    });
  }
  
  stages.forEach((stage, i) => {
    const x = startX + stepWidth * i;
    const isCompleted = i < currentIndex;
    const isActive = i === currentIndex;
    
    if (isActive) {
      ctx.page.drawCircle({ x, y: ctx.y - 10, size: 4, color: COLORS.royal });
    } else if (isCompleted) {
      ctx.page.drawCircle({ x, y: ctx.y - 10, size: 3.5, color: COLORS.royal, opacity: 0.5 });
    } else {
      ctx.page.drawCircle({ x, y: ctx.y - 10, size: 3.5, color: COLORS.white, borderColor: COLORS.muted, borderWidth: 1.5 });
    }
    
    const font = isActive ? ctx.bold : ctx.regular;
    const color = isActive ? COLORS.navy : COLORS.muted;
    const lblW = font.widthOfTextAtSize(stage.label, 8);
    ctx.page.drawText(stage.label, {
      x: x - lblW / 2, y: ctx.y - 25, font, size: 8, color
    });
  });
  
  ctx.y -= 45;
  
  if (startedAt) {
    const started = formatDateStr(startedAt);
    ctx.page.drawText(`Stage started: ${started}`, {
      x: PAGE_MARGIN, y: ctx.y, font: ctx.regular, size: 8, color: COLORS.muted
    });
    ctx.y -= 20; 
  } else {
    ctx.y -= 10;
  }
}

function drawNarrativeCard(ctx: LayoutContext, eyebrow: string, title: string, text: string, type: 'counselor' | 'warning' | 'positive' | 'neutral') {
  if (!text) return;
  
  let bg = COLORS.white;
  let accent = COLORS.line;
  if (type === 'counselor') { bg = COLORS.surface; accent = COLORS.royal; }
  else if (type === 'warning') { accent = COLORS.amber; } 
  else if (type === 'positive') { accent = COLORS.emerald; } 
  else { accent = COLORS.royal; }
  
  drawSectionHeading(ctx, eyebrow, title);
  
  const lines = wrapTextToLines(text, ctx.regular, BODY_SIZE, A4_WIDTH - PAGE_MARGIN * 2 - 24);
  let currentLinesIndex = 0;
  
  const signature = type === 'counselor' && ctx.report.counselor_name ? `— ${ctx.report.counselor_name}, Counselor, K-GEO` : null;
  if (signature) {
     lines.push(""); 
     lines.push(signature);
  }
  
  while (currentLinesIndex < lines.length) {
    const spaceAvailable = ctx.y - 45;
    const padding = 20;
    const availableHeightForLines = spaceAvailable - padding;
    const maxLinesThisPage = Math.floor(availableHeightForLines / 13);
    
    let linesToDrawCount = lines.length - currentLinesIndex;
    let pageBreakNeeded = false;
    
    if (maxLinesThisPage < 2 && currentLinesIndex < lines.length) {
      addPage(ctx);
      continue;
    }
    
    if (linesToDrawCount > maxLinesThisPage) {
      linesToDrawCount = maxLinesThisPage;
      pageBreakNeeded = true;
    }
    
    const boxHeight = (linesToDrawCount * 13) + padding;
    ctx.page.drawRectangle({
      x: PAGE_MARGIN, y: ctx.y - boxHeight, width: A4_WIDTH - PAGE_MARGIN * 2, height: boxHeight,
      color: bg, borderColor: COLORS.line, borderWidth: type === 'counselor' ? 0 : 1
    });
    ctx.page.drawLine({
      start: { x: PAGE_MARGIN + 1, y: ctx.y - boxHeight }, end: { x: PAGE_MARGIN + 1, y: ctx.y },
      thickness: 3, color: accent
    });
    
    let textY = ctx.y - 16;
    for (let i = 0; i < linesToDrawCount; i++) {
      const lineStr = lines[currentLinesIndex + i];
      const isSignature = signature && currentLinesIndex + i === lines.length - 1;
      ctx.page.drawText(safePdfText(lineStr), { 
         x: PAGE_MARGIN + 12, y: textY, 
         font: isSignature ? ctx.bold : ctx.regular, 
         size: isSignature ? 8.5 : BODY_SIZE, 
         color: isSignature ? COLORS.navy : COLORS.text 
      });
      textY -= 13;
    }
    
    ctx.y -= boxHeight + 15;
    currentLinesIndex += linesToDrawCount;
    
    if (pageBreakNeeded && currentLinesIndex < lines.length) {
      addPage(ctx);
    }
  }
}

function drawApplicationsTable(ctx: LayoutContext, apps: any[]) {
  drawSectionHeading(ctx, "APPLICATIONS", "University applications");
  
  if (!apps || apps.length === 0) {
    ctx.page.drawText("No applications submitted yet.", {
      x: PAGE_MARGIN, y: ctx.y, font: ctx.regular, size: BODY_SIZE, color: COLORS.muted
    });
    ctx.y -= 20;
    return;
  }
  
  const col1 = PAGE_MARGIN;
  const col2 = PAGE_MARGIN + 160;
  const col3 = PAGE_MARGIN + 360;
  
  checkSpace(ctx, 35);
  ctx.page.drawText("UNIVERSITY", { x: col1, y: ctx.y, font: ctx.bold, size: 7.5, color: COLORS.muted });
  ctx.page.drawText("PROGRAM", { x: col2, y: ctx.y, font: ctx.bold, size: 7.5, color: COLORS.muted });
  ctx.page.drawText("STATUS", { x: col3, y: ctx.y, font: ctx.bold, size: 7.5, color: COLORS.muted });
  ctx.y -= 8;
  ctx.page.drawLine({ start: { x: PAGE_MARGIN, y: ctx.y }, end: { x: A4_WIDTH - PAGE_MARGIN, y: ctx.y }, thickness: 1, color: COLORS.line });
  ctx.y -= 14;
  
  for (const app of apps) {
    checkSpace(ctx, 25);
    const uni = app.university_name || '--';
    const prog = app.programme_name || '--';
    const stat = formatEnum(app.journey_status ?? app.status) || '--';
    
    const displayUni = wrapTextToLines(uni, ctx.regular, BODY_SIZE, 140)[0] + (uni.length > 25 ? '...' : '');
    const displayProg = wrapTextToLines(prog, ctx.regular, BODY_SIZE, 180)[0] + (prog.length > 30 ? '...' : '');
    
    ctx.page.drawText(safePdfText(displayUni), { x: col1, y: ctx.y, font: ctx.bold, size: BODY_SIZE, color: COLORS.navy });
    ctx.page.drawText(safePdfText(displayProg), { x: col2, y: ctx.y, font: ctx.regular, size: BODY_SIZE, color: COLORS.text });
    
    const safeStat = safePdfText(stat);
    const sWidth = ctx.bold.widthOfTextAtSize(safeStat, 7.5);
    const isOk = stat.toLowerCase().includes('active') || stat.toLowerCase().includes('offer');
    ctx.page.drawRectangle({
      x: col3, y: ctx.y - 3, width: sWidth + 10, height: 13,
      color: isOk ? COLORS.greenPillBg : COLORS.surface,
      borderColor: isOk ? COLORS.greenPillBg : COLORS.line, borderWidth: 1
    });
    ctx.page.drawText(safeStat, { x: col3 + 5, y: ctx.y, font: ctx.bold, size: 7.5, color: isOk ? COLORS.greenPillText : COLORS.navy });
    
    ctx.y -= 20;
  }
  ctx.y -= 5;
}

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
  
  let logoImage: PDFImage | null = null;
  try {
    const logoBytes = readFileSync(LOGO_PATH);
    logoImage = await document.embedPng(logoBytes);
  } catch (error) {
    console.warn("Could not load logo image for PDF report");
  }

  const ctx: LayoutContext = {
    doc: document,
    page: document.addPage([A4_WIDTH, A4_HEIGHT]),
    y: A4_HEIGHT - 100,
    pageNum: 1,
    regular,
    bold,
    logo: logoImage,
    report
  };
  
  // Page 1 Light Header
  const HEADER_HEIGHT = 75;
  ctx.page.drawRectangle({ x: 0, y: A4_HEIGHT - HEADER_HEIGHT, width: A4_WIDTH, height: HEADER_HEIGHT, color: COLORS.white });
  ctx.page.drawLine({ start: { x: PAGE_MARGIN, y: A4_HEIGHT - HEADER_HEIGHT }, end: { x: A4_WIDTH - PAGE_MARGIN, y: A4_HEIGHT - HEADER_HEIGHT }, thickness: 1, color: COLORS.line });
  if (ctx.logo) {
    const lh = 28;
    const lw = (ctx.logo.width / ctx.logo.height) * lh;
    ctx.page.drawImage(ctx.logo, { x: PAGE_MARGIN, y: A4_HEIGHT - HEADER_HEIGHT + (HEADER_HEIGHT - lh) / 2, width: lw, height: lh });
  } else {
    ctx.page.drawText("K-GEO", { x: PAGE_MARGIN, y: A4_HEIGHT - 45, font: bold, size: 16, color: COLORS.navy });
  }
  const tText = "Parent Progress Report";
  ctx.page.drawText(tText, { x: A4_WIDTH - PAGE_MARGIN - bold.widthOfTextAtSize(tText, 16), y: A4_HEIGHT - 35, font: bold, size: 16, color: COLORS.navy });
  const pText = `Academic Period: ${report.academic_period}`;
  ctx.page.drawText(pText, { x: A4_WIDTH - PAGE_MARGIN - regular.widthOfTextAtSize(pText, 9.5), y: A4_HEIGHT - 52, font: regular, size: 9.5, color: COLORS.muted });
  
  if (ctx.logo) {
    const wmWidth = 140; // Small rectangle
    const wmHeight = (ctx.logo.height / ctx.logo.width) * wmWidth;
    ctx.page.drawImage(ctx.logo, {
      x: (A4_WIDTH - wmWidth) / 2, y: (A4_HEIGHT - wmHeight) / 2,
      width: wmWidth, height: wmHeight, opacity: 0.06
    });
  }

  const student = (report.source_snapshot.student || {}) as Record<string, unknown>;
  const prefs = (report.source_snapshot.preferences || {}) as Record<string, unknown>;
  const journey = (report.source_snapshot.journey_progress || {}) as Record<string, unknown>;

  drawMetricsCards(ctx, student, prefs);
  drawStepper(ctx, (journey.current_stage as string) || 'profile', journey.stage_started_at);
  
  drawSectionHeading(ctx, "STUDENT PROFILE", "Verified information");
  drawTableRow(ctx, "Student", student.full_name as string || '--');
  drawTableRow(ctx, "Roll number", student.roll_number as string || '--');
  drawTableRow(ctx, "Course", student.course as string || '--');
  drawTableRow(ctx, "Department", student.department as string || '--');
  ctx.page.drawLine({ start: { x: PAGE_MARGIN, y: ctx.y }, end: { x: A4_WIDTH - PAGE_MARGIN, y: ctx.y }, thickness: 0.5, color: COLORS.line });
  ctx.y -= 20;

  drawSectionHeading(ctx, "PREFERENCES", "Study preferences");
  drawTableRow(ctx, "Study Mode", formatEnum(prefs.study_mode) || '--');
  drawTableRow(ctx, "Target Intake", formatEnum(prefs.target_intake) || '--');
  drawTableRowChips(ctx, "Preferred Countries", (prefs.preferred_countries as string[]) || []);
  drawTableRowChips(ctx, "Program Areas", (prefs.preferred_program_areas as string[]) || []);
  ctx.page.drawLine({ start: { x: PAGE_MARGIN, y: ctx.y }, end: { x: A4_WIDTH - PAGE_MARGIN, y: ctx.y }, thickness: 0.5, color: COLORS.line });
  ctx.y -= 20;

  drawApplicationsTable(ctx, (report.source_snapshot.applications || []) as any[]);

  drawNarrativeCard(ctx, "SEMESTER OVERVIEW", "Progress this semester", report.semester_overview || "", 'neutral');
  drawNarrativeCard(ctx, "HIGHLIGHTS", "Strengths and highlights", report.strengths_highlights || "", 'positive');
  drawNarrativeCard(ctx, "ATTENTION REQUIRED", "Areas requiring attention", report.areas_requiring_attention || "", 'warning');
  drawNarrativeCard(ctx, "ACTIONS", "What's Next", report.next_actions || "", 'neutral');
  drawNarrativeCard(ctx, "REMARKS", "Counselor Note", report.counselor_remarks || "", 'counselor');
  drawNarrativeCard(ctx, "DIRECTOR REMARKS", "Director Note", report.director_remarks || "", 'neutral');

  checkSpace(ctx, 40);
  const disclaimer = `Information is based on the student's records as of ${formatDateStr(report.source_snapshot.captured_at)}.`;
  ctx.page.drawText(disclaimer, { x: PAGE_MARGIN, y: ctx.y, font: ctx.regular, size: 7.5, color: COLORS.muted });

  // Post-process Footers
  const pageCount = document.getPageCount();
  const shortId = report.report_id.substring(0, 8); 
  const genDate = formatDateStr(report.source_snapshot.captured_at);
  const fText = safePdfText(`Confidential · K-GEO | Generated on ${genDate} | Ref: KG-${shortId}`);
  
  for (let i = 0; i < pageCount; i++) {
    const p = document.getPage(i);
    p.drawLine({ start: { x: PAGE_MARGIN, y: 40 }, end: { x: A4_WIDTH - PAGE_MARGIN, y: 40 }, thickness: 1, color: COLORS.line });
    p.drawText(fText, { x: PAGE_MARGIN, y: 28, font: regular, size: 7.5, color: COLORS.muted });
    const pNum = `Page ${i + 1} of ${pageCount}`;
    p.drawText(pNum, { x: A4_WIDTH - PAGE_MARGIN - regular.widthOfTextAtSize(pNum, 7.5), y: 28, font: regular, size: 7.5, color: COLORS.muted });
  }

  // Selected attachments follow the report pages. They are appended after the
  // footers are drawn so a footer is never stamped over an attached document.
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
      color: COLORS.navy,
    });
    page.drawImage(image, {
      x: (A4_WIDTH - image.width * scale) / 2,
      y: PAGE_MARGIN,
      width: image.width * scale,
      height: image.height * scale,
    });
    appendedPages += 1;
  }

  return document.save({ addDefaultPage: false, useObjectStreams: false, updateFieldAppearances: false });
}
