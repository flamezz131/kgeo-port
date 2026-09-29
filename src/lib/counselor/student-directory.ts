import { z } from "zod";
import {
  COURSE_DEPARTMENTS,
  isCourse,
  isDepartmentForCourse,
} from "@/lib/consultations/options";
import {
  PROFILE_COLLEGES,
  PROFILE_GRADUATION_YEARS,
} from "@/lib/profiles/options";
import { institutionalEmailSchema } from "@/lib/validation/institutional-email";
import type { Database } from "@/types/database";
import type {
  HigherStudiesInterest,
  StudentDirectoryProfileState,
  StudentPreferredStudyLevel,
} from "@/types";

export const DIRECTORY_PAGE_SIZE = 25;
export const DIRECTORY_MAX_PAGE = 100_000;
export const DIRECTORY_BASE_PATH = "/counselor/students";

export const DIRECTORY_PROFILE_STATE_OPTIONS = [
  { value: "profile_not_started", label: "Profile not started" },
  { value: "profile_in_progress", label: "Profile in progress" },
  { value: "ready_for_counseling", label: "Ready for counseling" },
  { value: "submitted", label: "Submitted" },
] as const satisfies ReadonlyArray<{
  value: StudentDirectoryProfileState;
  label: string;
}>;

export const DIRECTORY_ACTIVE_OPTIONS = [
  { value: "all", label: "All accounts" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
] as const;

export const DIRECTORY_SORT_OPTIONS = [
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "recently_registered", label: "Recently registered" },
  { value: "recently_updated", label: "Recently updated" },
  { value: "completion_low_to_high", label: "Completion: low to high" },
  { value: "completion_high_to_low", label: "Completion: high to low" },
  { value: "graduation_year", label: "Graduation year" },
] as const;

export const DIRECTORY_DEPARTMENTS = Array.from(
  new Set(Object.values(COURSE_DEPARTMENTS).flat()),
).sort((left, right) => left.localeCompare(right, "en-IN"));

export const DIRECTORY_FALLBACKS = {
  name: "Name not available",
  notAdded: "Not added",
  notSelected: "Not selected",
  noUpdate: "No update yet",
} as const;

export type DirectoryActiveFilter =
  (typeof DIRECTORY_ACTIVE_OPTIONS)[number]["value"];
export type DirectorySort = (typeof DIRECTORY_SORT_OPTIONS)[number]["value"];
export type DirectorySearchParams = Record<
  string,
  string | string[] | undefined
>;

export type ParsedStudentDirectoryQuery = {
  q: string | null;
  college: string | null;
  course: string | null;
  department: string | null;
  graduationYear: number | null;
  active: DirectoryActiveFilter;
  isActive: boolean | null;
  profileState: StudentDirectoryProfileState | null;
  interest: HigherStudiesInterest | null;
  studyLevel: StudentPreferredStudyLevel | null;
  targetIntake: string | null;
  sort: DirectorySort;
  page: number;
  hasFilters: boolean;
  hadInvalidParameters: boolean;
};

export type StudentDirectoryRpcArgs =
  Database["public"]["Functions"]["list_counselor_student_directory"]["Args"];

const profileStateValues = [
  "profile_not_started",
  "profile_in_progress",
  "ready_for_counseling",
  "submitted",
] as const satisfies readonly StudentDirectoryProfileState[];
const interestValues = [
  "interested",
  "exploring",
  "not_interested",
] as const satisfies readonly HigherStudiesInterest[];
const studyLevelValues = [
  "masters",
  "postgraduate_diploma",
  "mba",
  "phd",
  "other",
] as const satisfies readonly StudentPreferredStudyLevel[];
const activeValues = DIRECTORY_ACTIVE_OPTIONS.map((option) => option.value);
const sortValues = DIRECTORY_SORT_OPTIONS.map((option) => option.value);

const optionalSearchSchema = z.string().trim().min(1).max(100);
const optionalCatalogTextSchema = z.string().trim().min(1).max(150);
const targetIntakeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(spring|summer|fall|winter)-20[2-9][0-9]$/);

function readSingleValue(
  searchParams: DirectorySearchParams,
  key: string,
): string | undefined {
  const value = searchParams[key];
  return typeof value === "string" ? value : undefined;
}

function parseOptionalString(
  searchParams: DirectorySearchParams,
  key: string,
  schema: z.ZodType<string>,
): string | null {
  const value = readSingleValue(searchParams, key);
  if (value === undefined || value.trim() === "") return null;

  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

function isOneOf<T extends string>(
  value: string,
  values: readonly T[],
): value is T {
  return values.some((candidate) => candidate === value);
}

function parseGraduationYear(
  searchParams: DirectorySearchParams,
): number | null {
  const value = readSingleValue(searchParams, "graduationYear");
  if (!value || !/^\d{4}$/.test(value)) return null;

  const year = Number(value);
  return PROFILE_GRADUATION_YEARS.includes(year) ? year : null;
}

function parsePage(searchParams: DirectorySearchParams): number {
  const value = readSingleValue(searchParams, "page");
  if (!value || !/^[1-9]\d*$/.test(value)) return 1;

  const page = Number(value);
  return Number.isSafeInteger(page) && page <= DIRECTORY_MAX_PAGE ? page : 1;
}

const knownScalarParameterKeys = [
  "q",
  "college",
  "course",
  "department",
  "graduationYear",
  "active",
  "profileState",
  "interest",
  "studyLevel",
  "targetIntake",
  "sort",
  "page",
] as const;

function hasInvalidOptionalInput(
  searchParams: DirectorySearchParams,
  key: string,
  parsedValue: string | number | null,
): boolean {
  const rawValue = searchParams[key];
  return (
    typeof rawValue === "string" &&
    rawValue.trim() !== "" &&
    parsedValue === null
  );
}

function hasInvalidAllowedInput<T extends string>(
  searchParams: DirectorySearchParams,
  key: string,
  allowedValues: readonly T[],
): boolean {
  const rawValue = searchParams[key];
  return (
    typeof rawValue === "string" &&
    rawValue.trim() !== "" &&
    !isOneOf(rawValue, allowedValues)
  );
}

function hasInvalidPageInput(searchParams: DirectorySearchParams): boolean {
  const rawValue = searchParams.page;
  if (typeof rawValue !== "string" || rawValue.trim() === "") return false;
  if (!/^[1-9]\d*$/.test(rawValue)) return true;

  const page = Number(rawValue);
  return !Number.isSafeInteger(page) || page > DIRECTORY_MAX_PAGE;
}

export function parseStudentDirectoryQuery(
  searchParams: DirectorySearchParams,
): ParsedStudentDirectoryQuery {
  const q = parseOptionalString(
    searchParams,
    "q",
    optionalSearchSchema,
  );

  const rawCollege = parseOptionalString(
    searchParams,
    "college",
    optionalCatalogTextSchema,
  );
  const college =
    rawCollege && isOneOf(rawCollege, PROFILE_COLLEGES) ? rawCollege : null;

  const rawCourse = parseOptionalString(
    searchParams,
    "course",
    optionalCatalogTextSchema,
  );
  const course = rawCourse && isCourse(rawCourse) ? rawCourse : null;

  const rawDepartment = parseOptionalString(
    searchParams,
    "department",
    optionalCatalogTextSchema,
  );
  const departmentIsKnown =
    rawDepartment !== null &&
    DIRECTORY_DEPARTMENTS.some((option) => option === rawDepartment);
  const department =
    departmentIsKnown &&
    (!course || isDepartmentForCourse(course, rawDepartment))
      ? rawDepartment
      : null;

  const rawActive = readSingleValue(searchParams, "active");
  const active: DirectoryActiveFilter =
    rawActive && isOneOf(rawActive, activeValues) ? rawActive : "all";
  const isActive =
    active === "active" ? true : active === "inactive" ? false : null;

  const rawProfileState = readSingleValue(searchParams, "profileState");
  const profileState =
    rawProfileState && isOneOf(rawProfileState, profileStateValues)
      ? rawProfileState
      : null;

  const rawInterest = readSingleValue(searchParams, "interest");
  const interest =
    rawInterest && isOneOf(rawInterest, interestValues) ? rawInterest : null;

  const rawStudyLevel = readSingleValue(searchParams, "studyLevel");
  const studyLevel =
    rawStudyLevel && isOneOf(rawStudyLevel, studyLevelValues)
      ? rawStudyLevel
      : null;

  const targetIntake = parseOptionalString(
    searchParams,
    "targetIntake",
    targetIntakeSchema,
  );

  const rawSort = readSingleValue(searchParams, "sort");
  const sort: DirectorySort =
    rawSort && isOneOf(rawSort, sortValues) ? rawSort : "name_asc";

  const graduationYear = parseGraduationYear(searchParams);
  const hadInvalidParameters =
    knownScalarParameterKeys.some((key) =>
      Array.isArray(searchParams[key]),
    ) ||
    hasInvalidOptionalInput(searchParams, "q", q) ||
    hasInvalidOptionalInput(searchParams, "college", college) ||
    hasInvalidOptionalInput(searchParams, "course", course) ||
    hasInvalidOptionalInput(searchParams, "department", department) ||
    hasInvalidOptionalInput(
      searchParams,
      "graduationYear",
      graduationYear,
    ) ||
    hasInvalidAllowedInput(searchParams, "active", activeValues) ||
    hasInvalidAllowedInput(
      searchParams,
      "profileState",
      profileStateValues,
    ) ||
    hasInvalidAllowedInput(searchParams, "interest", interestValues) ||
    hasInvalidAllowedInput(searchParams, "studyLevel", studyLevelValues) ||
    hasInvalidOptionalInput(searchParams, "targetIntake", targetIntake) ||
    hasInvalidAllowedInput(searchParams, "sort", sortValues) ||
    hasInvalidPageInput(searchParams);

  return {
    q,
    college,
    course,
    department,
    graduationYear,
    active,
    isActive,
    profileState,
    interest,
    studyLevel,
    targetIntake,
    sort,
    page: parsePage(searchParams),
    hasFilters:
      q !== null ||
      college !== null ||
      course !== null ||
      department !== null ||
      graduationYear !== null ||
      active !== "all" ||
      profileState !== null ||
      interest !== null ||
      studyLevel !== null ||
      targetIntake !== null,
    hadInvalidParameters,
  };
}

export function buildStudentDirectoryRpcArgs(
  query: ParsedStudentDirectoryQuery,
): StudentDirectoryRpcArgs {
  return {
    p_search: query.q,
    p_college: query.college,
    p_course: query.course,
    p_department: query.department,
    p_graduation_year: query.graduationYear,
    p_is_active: query.isActive,
    p_profile_state: query.profileState,
    p_higher_studies_interest: query.interest,
    p_preferred_study_level: query.studyLevel,
    p_target_intake: query.targetIntake,
    p_sort: query.sort,
    p_page: query.page,
    p_page_size: DIRECTORY_PAGE_SIZE,
  };
}

function appendQueryValue(
  params: URLSearchParams,
  key: string,
  value: string | number | null,
) {
  if (value !== null) params.set(key, String(value));
}

export function buildStudentDirectoryUrl(
  query: ParsedStudentDirectoryQuery,
  page: number,
): string {
  const params = new URLSearchParams();
  appendQueryValue(params, "q", query.q);
  appendQueryValue(params, "college", query.college);
  appendQueryValue(params, "course", query.course);
  appendQueryValue(params, "department", query.department);
  appendQueryValue(params, "graduationYear", query.graduationYear);
  if (query.active !== "all") params.set("active", query.active);
  appendQueryValue(params, "profileState", query.profileState);
  appendQueryValue(params, "interest", query.interest);
  appendQueryValue(params, "studyLevel", query.studyLevel);
  appendQueryValue(params, "targetIntake", query.targetIntake);
  if (query.sort !== "name_asc") params.set("sort", query.sort);
  if (page > 1) params.set("page", String(page));

  const queryString = params.toString();
  return queryString
    ? `${DIRECTORY_BASE_PATH}?${queryString}`
    : DIRECTORY_BASE_PATH;
}

const timestampSchema = z.string().refine((value) => {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  ) {
    return false;
  }
  return !Number.isNaN(Date.parse(value));
});

const nullableTextSchema = z.string().max(500).nullable();

const totalCountSchema = z
  .union([z.number(), z.string()])
  .transform((value, context) => {
    const numericValue =
      typeof value === "number"
        ? value
        : /^\d+$/.test(value)
          ? Number(value)
          : Number.NaN;

    if (
      !Number.isSafeInteger(numericValue) ||
      numericValue < 0
    ) {
      context.addIssue({
        code: "custom",
        message: "Invalid directory count",
      });
      return z.NEVER;
    }

    return numericValue;
  });

const studentDirectoryRowSchema = z
  .object({
    student_id: z.string().uuid(),
    full_name: z.string().max(200).nullable(),
    college_email: institutionalEmailSchema,
    account_created_at: timestampSchema,
    is_active: z.boolean(),
    roll_number: nullableTextSchema,
    college: nullableTextSchema,
    course: nullableTextSchema,
    department: nullableTextSchema,
    graduation_year: z
      .number()
      .int()
      .min(PROFILE_GRADUATION_YEARS[0])
      .max(PROFILE_GRADUATION_YEARS.at(-1) ?? 2040)
      .nullable(),
    profile_state: z.enum(profileStateValues),
    completion_percentage: z.number().int().min(0).max(100),
    ready_for_counseling: z.boolean(),
    higher_studies_interest: z.enum(interestValues).nullable(),
    preferred_study_level: z.enum(studyLevelValues).nullable(),
    target_intake: targetIntakeSchema.nullable(),
    last_profile_update: timestampSchema.nullable(),
    total_count: totalCountSchema,
  })
  .strict();

export type CounselorStudentDirectoryEntry = z.infer<
  typeof studentDirectoryRowSchema
>;

export type StudentDirectoryReadyResult = {
  kind: "ready";
  query: ParsedStudentDirectoryQuery;
  students: CounselorStudentDirectoryEntry[];
  totalCount: number;
};

export type StudentDirectoryLoadResult =
  | StudentDirectoryReadyResult
  | {
      kind: "out_of_range";
      redirectTo: string;
    }
  | {
      kind: "unavailable";
      query: ParsedStudentDirectoryQuery;
    };

export type StudentDirectoryRpcExecutor = (
  args: StudentDirectoryRpcArgs,
) => Promise<{ data: unknown; error: unknown }>;

export async function fetchStudentDirectory(
  query: ParsedStudentDirectoryQuery,
  executeRpc: StudentDirectoryRpcExecutor,
): Promise<StudentDirectoryLoadResult> {
  let result: { data: unknown; error: unknown };
  try {
    result = await executeRpc(buildStudentDirectoryRpcArgs(query));
  } catch {
    return { kind: "unavailable", query };
  }

  if (result.error || !Array.isArray(result.data)) {
    return { kind: "unavailable", query };
  }

  const parsedRows = z.array(studentDirectoryRowSchema).safeParse(result.data);
  if (
    !parsedRows.success ||
    parsedRows.data.length > DIRECTORY_PAGE_SIZE
  ) {
    return { kind: "unavailable", query };
  }

  const students = parsedRows.data;
  if (students.length === 0) {
    return query.page > 1
      ? {
          kind: "out_of_range",
          redirectTo: buildStudentDirectoryUrl(query, 1),
        }
      : { kind: "ready", query, students, totalCount: 0 };
  }

  const totalCount = students[0].total_count;
  const minimumCount =
    (query.page - 1) * DIRECTORY_PAGE_SIZE + students.length;
  if (
    totalCount < minimumCount ||
    students.some((student) => student.total_count !== totalCount)
  ) {
    return { kind: "unavailable", query };
  }

  return { kind: "ready", query, students, totalCount };
}

export type StudentDirectoryPagination = {
  pageCount: number;
  rangeStart: number;
  rangeEnd: number;
  previousUrl: string | null;
  nextUrl: string | null;
};

export function getStudentDirectoryPagination(
  result: StudentDirectoryReadyResult,
): StudentDirectoryPagination {
  const pageCount = Math.max(
    1,
    Math.ceil(result.totalCount / DIRECTORY_PAGE_SIZE),
  );
  const rangeStart =
    result.students.length === 0
      ? 0
      : (result.query.page - 1) * DIRECTORY_PAGE_SIZE + 1;
  const rangeEnd =
    result.students.length === 0
      ? 0
      : rangeStart + result.students.length - 1;

  return {
    pageCount,
    rangeStart,
    rangeEnd,
    previousUrl:
      result.query.page > 1
        ? buildStudentDirectoryUrl(result.query, result.query.page - 1)
        : null,
    nextUrl:
      rangeEnd < result.totalCount
        ? buildStudentDirectoryUrl(result.query, result.query.page + 1)
        : null,
  };
}

const profileStateLabels: Record<StudentDirectoryProfileState, string> = {
  profile_not_started: "Profile not started",
  profile_in_progress: "Profile in progress",
  ready_for_counseling: "Ready for counseling",
  submitted: "Submitted",
};

const interestLabels: Record<HigherStudiesInterest, string> = {
  interested: "Interested",
  exploring: "Exploring",
  not_interested: "Not interested",
};

const studyLevelLabels: Record<StudentPreferredStudyLevel, string> = {
  masters: "Master's degree",
  postgraduate_diploma: "Postgraduate diploma",
  mba: "MBA",
  phd: "PhD",
  global_track: "Global Track Programme",
  other: "Other",
};

export function getProfileStateLabel(
  state: StudentDirectoryProfileState,
): string {
  return profileStateLabels[state];
}

export function getInterestLabel(
  interest: HigherStudiesInterest | null,
): string {
  return interest ? interestLabels[interest] : DIRECTORY_FALLBACKS.notSelected;
}

export function getStudyLevelLabel(
  studyLevel: StudentPreferredStudyLevel | null,
): string {
  return studyLevel
    ? studyLevelLabels[studyLevel]
    : DIRECTORY_FALLBACKS.notSelected;
}

export function formatTargetIntake(value: string | null): string {
  if (!value) return DIRECTORY_FALLBACKS.notSelected;
  const [season, year] = value.split("-");
  return `${season.charAt(0).toUpperCase()}${season.slice(1)} ${year}`;
}

const directoryDateFormatter = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export function formatDirectoryUpdate(value: string | null): string {
  return value
    ? directoryDateFormatter.format(new Date(value))
    : DIRECTORY_FALLBACKS.noUpdate;
}
