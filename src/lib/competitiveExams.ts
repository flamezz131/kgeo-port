import { CourseCategory } from "./courses";

export interface CompetitiveExam {
  id: string;
  name: string;
  referenceRange: string;
}

export const COMPETITIVE_EXAMS: CompetitiveExam[] = [
  { id: "IELTS", name: "IELTS", referenceRange: "6.5-7.5" },
  { id: "TOEFL", name: "TOEFL", referenceRange: "100-110" },
  { id: "GRE", name: "GRE", referenceRange: "315-325" },
  { id: "GMAT", name: "GMAT", referenceRange: "650-720" },
  { id: "GATE", name: "GATE", referenceRange: "college-specific, check target programs" },
];

export function getRelevantExams(
  selectedCategories: CourseCategory[],
  isIndiaTargeted: boolean = false
): CompetitiveExam[] {
  const relevant: CompetitiveExam[] = [];

  // IELTS and TOEFL are broadly relevant to all international programs
  relevant.push(COMPETITIVE_EXAMS.find((e) => e.id === "IELTS")!);
  relevant.push(COMPETITIVE_EXAMS.find((e) => e.id === "TOEFL")!);

  if (selectedCategories.includes("Business")) {
    relevant.push(COMPETITIVE_EXAMS.find((e) => e.id === "GMAT")!);
  }

  if (selectedCategories.includes("Engineering") || selectedCategories.includes("Arts")) {
    // GRE for Engineering and research-track Arts
    relevant.push(COMPETITIVE_EXAMS.find((e) => e.id === "GRE")!);
  }

  if (isIndiaTargeted) {
    relevant.push(COMPETITIVE_EXAMS.find((e) => e.id === "GATE")!);
  }

  // Deduplicate just in case
  return Array.from(new Set(relevant));
}
