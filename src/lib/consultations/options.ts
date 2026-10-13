export const COURSES = [
  "B.E",
  "B.Tech",
  "B.A",
  "B.Sc",
  "BBA",
  "BBA International Business",
  "B.Com",
  "B.Com Professional Accounting",
  "M.E",
  "M.Tech",
  "MCA",
  "MBA",
  "MSW",
] as const;

export type Course = (typeof COURSES)[number];

export const COURSE_DEPARTMENTS = {
  "B.E": [
    "Aeronautical Engineering",
    "Automobile Engineering",
    "Civil Engineering",
    "Computer Science and Engineering",
    "Electrical and Electronics Engineering",
    "Electronics and Communication Engineering",
    "Electronics and Instrumentation Engineering",
    "Mechanical Engineering",
    "Mechatronics Engineering",
  ],
  "B.Tech": [
    "Artificial Intelligence and Data Science",
    "Biotechnology",
    "Fashion Technology",
    "Information Technology",
    "Textile Technology",
  ],
  "B.A": ["Liberal Arts"],
  "B.Sc": ["Computer Science", "Data Science"],
  BBA: ["Business Administration"],
  "BBA International Business": ["International Business"],
  "B.Com": ["Commerce"],
  "B.Com Professional Accounting": ["Professional Accounting"],
  "M.E": [
    "Computer Science and Engineering",
    "Embedded Systems",
    "Engineering Design",
    "Power Electronics and Drives",
    "Structural Engineering",
  ],
  "M.Tech": [
    "Biotechnology",
    "Data Science",
    "Information Technology",
    "Textile Technology",
  ],
  MCA: ["Computer Applications"],
  MBA: ["Business Administration"],
  MSW: ["Social Work"],
} as const satisfies Record<Course, readonly string[]>;

export const COLLEGE_END_YEARS = Array.from(
  { length: 2040 - 2024 + 1 },
  (_, index) => 2024 + index,
);

export const HIGHER_STUDIES_INTEREST_OPTIONS = [
  { label: "Interested", value: "interested" },
  { label: "Exploring", value: "exploring" },
  { label: "Not Interested", value: "not_interested" },
] as const;

export function isCourse(value: string): value is Course {
  return Object.hasOwn(COURSE_DEPARTMENTS, value);
}

export function isDepartmentForCourse(
  course: string,
  department: string,
): boolean {
  return (
    isCourse(course) &&
    COURSE_DEPARTMENTS[course].some((option) => option === department)
  );
}

export function isAllowedCollegeEndYear(year: number): boolean {
  return COLLEGE_END_YEARS.includes(year);
}
