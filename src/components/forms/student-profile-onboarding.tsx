"use client";

import {
  Fragment,
  useActionState,
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CircleCheck, CircleX } from "lucide-react";
import {
  saveStudentAcademics,
  saveStudentIdentity,
  saveStudentPreferences,
} from "@/app/actions/profile-actions";
import { CountryCombobox } from "@/components/CountryCombobox";
import { CourseCombobox } from "@/components/CourseCombobox";
import { SpecializationCombobox } from "@/components/SpecializationCombobox";
import { ALL_COURSES, getStudentCategory } from "@/lib/courses";
import { getSpecializationsForCourses } from "@/lib/specializations";
import { FieldError } from "@/components/forms/field-error";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  COURSE_DEPARTMENTS,
  COURSES,
  isCourse,
  type Course,
} from "@/lib/consultations/options";
import {
  ACADEMIC_PREFERENCE_OPTIONS,
  CGPA_SCALES,
  GLOBAL_TRACK_DURATION_OPTIONS,
  HIGHER_STUDIES_INTEREST_PROFILE_OPTIONS,
  PREFERRED_STUDY_LEVEL_OPTIONS,
  STUDENT_FUNDING_METHOD_OPTIONS,
  PROFILE_CATALOG_NOTICE,
  PROFILE_COLLEGES,
  PROFILE_CURRENT_SEMESTERS,
  PROFILE_CURRENT_YEARS,
  getGraduationYearOptions,
  STUDENT_PLANNING_STAGE_OPTIONS,
  STUDY_MODE_OPTIONS,
  TARGET_INTAKE_SEASONS,
  TARGET_INTAKE_YEARS,
  parseTargetIntake,
} from "@/lib/profiles/options";
import {
  initialProfileActionState,
  type ProfileActionState,
  type ProfileCompletionPresentation,
  type ProfileStep,
  type StudentPreferenceFormValues,
  type StudentProfileFormValues,
} from "@/lib/profiles/types";
import { buildProfileRequirementChecklist } from "@/lib/profiles/completion";
import { PROFILE_FULL_NAME_MAX_LENGTH } from "@/lib/validation/full-name";
import { sectionPlainClass } from "@/components/shell/form-ui";

type StudentProfileOnboardingProps = {
  achievementsSection: ReactNode;
  collegeEmail: string;
  completion: ProfileCompletionPresentation;
  fullName: string;
  initialStep?: ProfileStep;
  preferences: StudentPreferenceFormValues | null;
  profile: StudentProfileFormValues | null;
  recordsSection: ReactNode;
};

const STEPS: ReadonlyArray<{ id: ProfileStep; label: string }> = [
  { id: "identity", label: "Identity" },
  { id: "academics", label: "Academic Portfolio" },
  { id: "preferences", label: "Preferences" },
  { id: "records", label: "Exams & Documents" },
];

function ActionFeedback({ state }: { state: ProfileActionState }) {
  if (!state.message || state.status !== "error") return null;
  return (
    <p className="form-error" role="alert">
      {state.message}
    </p>
  );
}

function RequirementStatusIcon({ complete }: { complete: boolean }) {
  const Icon = complete ? CircleCheck : CircleX;
  return (
    <Icon
      aria-label={complete ? "Complete" : "Incomplete"}
      className="profile-check-icon"
      role="img"
      size={15}
    />
  );
}

function BooleanSelect({
  defaultValue,
  errors,
  id,
  label,
  name,
}: {
  defaultValue: boolean | null | undefined;
  errors?: string[];
  id: string;
  label: string;
  name: string;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        aria-describedby={`${id}-error`}
        aria-invalid={Boolean(errors)}
        defaultValue={
          defaultValue === null || defaultValue === undefined
            ? ""
            : String(defaultValue)
        }
        id={id}
        name={name}
      >
        <option value="">Not decided</option>
        <option value="true">Yes</option>
        <option value="false">No</option>
      </select>
      <FieldError id={`${id}-error`} messages={errors} />
    </div>
  );
}

export function StudentProfileOnboarding({
  achievementsSection,
  collegeEmail,
  completion,
  fullName,
  initialStep = "identity",
  preferences,
  profile,
  recordsSection,
}: StudentProfileOnboardingProps) {
  const router = useRouter();
  const [activeStep, setActiveStep] = useState<ProfileStep>(initialStep);
  const [identitySaved, setIdentitySaved] = useState(Boolean(profile));
  const [saveNotice, setSaveNotice] = useState("");
  const identityActionWithAdvance = useCallback(
    async (previousState: ProfileActionState, formData: FormData) => {
      const nextState = await saveStudentIdentity(previousState, formData);
      if (nextState.status === "success") {
        setIdentitySaved(true);
        setSaveNotice(nextState.message ?? "Identity saved.");
        setActiveStep("academics");
        router.refresh();
      } else {
        setSaveNotice("");
      }
      return nextState;
    },
    [router],
  );
  const academicsActionWithAdvance = useCallback(
    async (previousState: ProfileActionState, formData: FormData) => {
      const nextState = await saveStudentAcademics(previousState, formData);
      if (nextState.status === "success") {
        setSaveNotice(nextState.message ?? "Academic Portfolio saved.");
        setActiveStep("preferences");
        router.refresh();
      } else {
        setSaveNotice("");
      }
      return nextState;
    },
    [router],
  );
  const preferencesActionWithAdvance = useCallback(
    async (previousState: ProfileActionState, formData: FormData) => {
      const nextState = await saveStudentPreferences(previousState, formData);
      if (nextState.status === "success") {
        setSaveNotice(nextState.message ?? "Preferences saved.");
        setActiveStep("records");
        router.refresh();
      } else {
        setSaveNotice("");
      }
      return nextState;
    },
    [router],
  );
  const [identityState, identityAction, identityPending] = useActionState(
    identityActionWithAdvance,
    initialProfileActionState,
  );
  const [academicsState, academicsAction, academicsPending] = useActionState(
    academicsActionWithAdvance,
    initialProfileActionState,
  );
  const [preferencesState, preferencesAction, preferencesPending] =
    useActionState(preferencesActionWithAdvance, initialProfileActionState);
  const initialCourse = profile && isCourse(profile.course) ? profile.course : "";
  const [course, setCourse] = useState<Course | "">(initialCourse);
  const [department, setDepartment] = useState(profile?.department ?? "");
  const targetIntake = parseTargetIntake(preferences?.target_intake ?? null);
  const departments = course ? COURSE_DEPARTMENTS[course] : [];

  const [preferredCountries, setPreferredCountries] = useState<string[]>(
    preferences?.preferred_countries ?? []
  );
  const [preferredCourses, setPreferredCourses] = useState<string[]>(
    preferences?.preferred_program_areas ?? []
  );
  const [sameAsUg, setSameAsUg] = useState<boolean>(
    preferences?.same_as_ug ?? true
  );
  const [specialization, setSpecialization] = useState<string[]>(
    preferences?.domain_specializations ?? []
  );
  const [studyPathway, setStudyPathway] = useState(
    preferences?.preferred_study_level ?? ""
  );

  const stream = "engineering";

  const sortedCourses = useMemo(() => {
    const studentCategory = getStudentCategory(department, stream);

    if (sameAsUg) {
      return ALL_COURSES
        .filter(c => c.category === studentCategory)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => c.name);
    } else {
      return ALL_COURSES
        .filter(c => c.category !== studentCategory)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(c => c.name);
    }
  }, [department, stream, sameAsUg]);

  const specOptions = getSpecializationsForCourses(preferredCourses, stream);
  const requirementChecklist = buildProfileRequirementChecklist(
    completion,
    profile,
    preferences,
  );

  return (
    <div className="profile-experience">
      <aside className="profile-completion-card" aria-labelledby="completion-title">
        <div>
          <h2 id="completion-title">{completion.title}</h2>
          <p>{completion.description}</p>
        </div>
        <div
          aria-label={`${completion.percentage}% profile completion`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={completion.percentage}
          className="profile-progress"
          role="progressbar"
        >
          <span style={{ width: `${completion.percentage}%` }} />
        </div>
        <p className="profile-progress-caption">
          <strong>{completion.percentage}%</strong> complete &middot;{" "}
          {completion.completedFields} of {completion.totalFields} essential fields
        </p>
        <ul className="profile-check-list">
          {requirementChecklist.map((section) => {
            const missingItems = section.complete
              ? []
              : section.items.filter((item) => !item.complete);
            return (
              <li data-complete={section.complete} key={section.id}>
                <span className="profile-check-row">
                  <RequirementStatusIcon complete={section.complete} />
                  <span>{section.label}</span>
                </span>
                {missingItems.length > 0 && (
                  <div className="profile-check-missing">
                    Missing:{" "}
                    {missingItems.map((item, index) => (
                      <Fragment key={item.label}>
                        {index > 0 && ", "}
                        <button
                          onClick={() => setActiveStep(item.step)}
                          type="button"
                        >
                          {item.label}
                        </button>
                      </Fragment>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </aside>

      <div className="profile-workspace">
        {saveNotice && (
          <p className="form-success profile-save-notice" role="status">
            {saveNotice}
          </p>
        )}
        <nav aria-label="Profile sections" className="profile-stepper">
          <ol>
            {STEPS.map((step, index) => (
              <li key={step.id}>
                <button
                  aria-current={activeStep === step.id ? "step" : undefined}
                  onClick={() => setActiveStep(step.id)}
                  type="button"
                >
                  <span aria-hidden="true">{index + 1}</span>
                  {step.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <section
          aria-labelledby="identity-heading"
          className={sectionPlainClass}
          style={activeStep === "identity" ? {} : { display: "none" }}
        >
          <header>
            <h2 id="identity-heading">Basic / Identity Details</h2>
            <p>Start with the information your counselor needs to identify your course.</p>
          </header>
          <form action={identityAction} aria-busy={identityPending} className="form-stack">
            <ActionFeedback state={identityState} />
            <fieldset className="form-fields" disabled={identityPending}>
              <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 max-[650px]:grid-cols-[1fr]">
                <div className="field">
                  <label htmlFor="profileFullName">Full name</label>
                  <input
                    aria-describedby="profileFullName-hint profileFullName-error"
                    aria-invalid={Boolean(identityState.errors?.fullName)}
                    autoComplete="name"
                    defaultValue={fullName}
                    id="profileFullName"
                    maxLength={PROFILE_FULL_NAME_MAX_LENGTH}
                    name="fullName"
                    required
                    type="text"
                  />
                  <span className="field-hint" id="profileFullName-hint">
                    This is your current canonical K-GEO name. Earlier
                    consultation snapshots remain unchanged.
                  </span>
                  <FieldError
                    id="profileFullName-error"
                    messages={identityState.errors?.fullName}
                  />
                </div>
                <div className="field">
                  <label htmlFor="trustedCollegeEmail">College email</label>
                  <input
                    id="trustedCollegeEmail"
                    readOnly
                    type="email"
                    value={collegeEmail}
                  />
                  <span className="field-hint">
                    Verified account information. This cannot be changed here.
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="profileRollNumber">Roll number</label>
                  <input
                    aria-describedby="profileRollNumber-hint profileRollNumber-error"
                    aria-invalid={Boolean(identityState.errors?.rollNumber)}
                    autoCapitalize="characters"
                    defaultValue={profile?.roll_number ?? ""}
                    id="profileRollNumber"
                    maxLength={50}
                    name="rollNumber"
                    required
                    type="text"
                  />
                  <span className="field-hint" id="profileRollNumber-hint">
                    Saved in uppercase.
                  </span>
                  <FieldError
                    id="profileRollNumber-error"
                    messages={identityState.errors?.rollNumber}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profilePersonalEmail">Personal email</label>
                  <input
                    aria-describedby="profilePersonalEmail-error"
                    aria-invalid={Boolean(identityState.errors?.personalEmail)}
                    autoComplete="email"
                    defaultValue={profile?.personal_email ?? ""}
                    id="profilePersonalEmail"
                    maxLength={320}
                    name="personalEmail"
                    required
                    type="email"
                  />
                  <FieldError
                    id="profilePersonalEmail-error"
                    messages={identityState.errors?.personalEmail}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profileMobileNumber">Mobile number</label>
                  <input
                    aria-describedby="profileMobileNumber-hint profileMobileNumber-error"
                    aria-invalid={Boolean(identityState.errors?.mobileNumber)}
                    autoComplete="tel"
                    defaultValue={profile?.mobile_number ?? ""}
                    id="profileMobileNumber"
                    inputMode="numeric"
                    maxLength={10}
                    name="mobileNumber"
                    pattern="[0-9]{10}"
                    required
                    type="tel"
                  />
                  <span className="field-hint" id="profileMobileNumber-hint">
                    Enter exactly 10 digits.
                  </span>
                  <FieldError
                    id="profileMobileNumber-error"
                    messages={identityState.errors?.mobileNumber}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profileCollege">College</label>
                  <select
                    aria-describedby="profileCollege-error"
                    aria-invalid={Boolean(identityState.errors?.college)}
                    defaultValue={profile?.college ?? PROFILE_COLLEGES[0]}
                    id="profileCollege"
                    name="college"
                    required
                  >
                    {PROFILE_COLLEGES.map((college) => (
                      <option key={college} value={college}>
                        {college}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    id="profileCollege-error"
                    messages={identityState.errors?.college}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profileCourse">Course</label>
                  <select
                    aria-describedby="profileCourse-error"
                    aria-invalid={Boolean(identityState.errors?.course)}
                    id="profileCourse"
                    name="course"
                    onChange={(event) => {
                      const selectedCourse = event.currentTarget.value;
                      setCourse(isCourse(selectedCourse) ? selectedCourse : "");
                      setDepartment("");
                    }}
                    required
                    value={course}
                  >
                    <option disabled value="">Select your course</option>
                    {COURSES.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <FieldError id="profileCourse-error" messages={identityState.errors?.course} />
                </div>
                <div className="field">
                  <label htmlFor="profileDepartment">Department</label>
                  <select
                    aria-describedby="profileDepartment-error"
                    aria-invalid={Boolean(identityState.errors?.department)}
                    disabled={!course}
                    id="profileDepartment"
                    name="department"
                    onChange={(event) => setDepartment(event.currentTarget.value)}
                    required
                    value={department}
                  >
                    <option disabled value="">
                      {course ? "Select your department" : "Select a course first"}
                    </option>
                    {departments.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </select>
                  <FieldError
                    id="profileDepartment-error"
                    messages={identityState.errors?.department}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profileCurrentYear">Current year</label>
                  <select
                    aria-describedby="profileCurrentYear-error"
                    aria-invalid={Boolean(identityState.errors?.currentYear)}
                    defaultValue={profile?.current_year ?? ""}
                    id="profileCurrentYear"
                    name="currentYear"
                  >
                    <option value="">Not specified</option>
                    {PROFILE_CURRENT_YEARS.map((year) => (
                      <option key={year} value={year}>Year {year}</option>
                    ))}
                  </select>
                  <FieldError
                    id="profileCurrentYear-error"
                    messages={identityState.errors?.currentYear}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profileCurrentSemester">Current semester</label>
                  <select
                    aria-describedby="profileCurrentSemester-error"
                    aria-invalid={Boolean(identityState.errors?.currentSemester)}
                    defaultValue={profile?.current_semester ?? ""}
                    id="profileCurrentSemester"
                    name="currentSemester"
                  >
                    <option value="">Not specified</option>
                    {PROFILE_CURRENT_SEMESTERS.map((semester) => (
                      <option key={semester} value={semester}>Semester {semester}</option>
                    ))}
                  </select>
                  <FieldError
                    id="profileCurrentSemester-error"
                    messages={identityState.errors?.currentSemester}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profileGraduationYear">Graduation year</label>
                  <select
                    aria-describedby="profileGraduationYear-error"
                    aria-invalid={Boolean(identityState.errors?.graduationYear)}
                    defaultValue={profile?.graduation_year ?? ""}
                    id="profileGraduationYear"
                    name="graduationYear"
                    required
                  >
                    <option disabled value="">Select graduation year</option>
                    {getGraduationYearOptions(
                      undefined,
                      profile?.graduation_year ?? null,
                    ).map((year) => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                  <FieldError
                    id="profileGraduationYear-error"
                    messages={identityState.errors?.graduationYear}
                  />
                </div>
              </div>
              <p className="rounded-[0.8rem] border border-[#bfdbfe] bg-[var(--brand-50)] px-4 py-[0.85rem] text-[0.84rem] leading-normal text-[var(--brand-800)]">{PROFILE_CATALOG_NOTICE}</p>
              <div className="mt-2 flex justify-end gap-3 max-[650px]:flex-col max-[650px]:items-stretch max-[650px]:[&_.button]:w-full">
                <SubmitButton pendingLabel="Saving identity...">Save and Continue</SubmitButton>
              </div>
            </fieldset>
          </form>
        </section>

        <section
          aria-labelledby="academics-heading"
          className={sectionPlainClass}
          style={activeStep === "academics" ? {} : { display: "none" }}
        >
          <header>
            <h2 id="academics-heading">Academic Portfolio</h2>
            <p>Record your current academic results.</p>
          </header>
          {!identitySaved && (
            <p className="rounded-[0.8rem] border border-[#bfdbfe] bg-[var(--brand-50)] px-4 py-[0.85rem] text-[0.84rem] leading-normal text-[var(--brand-800)]" role="status">
              Save your identity section first so this information has a profile to update.
            </p>
          )}
          <form action={academicsAction} aria-busy={academicsPending} className="form-stack">
            <ActionFeedback state={academicsState} />
            <fieldset
              className="form-fields"
              disabled={!identitySaved || academicsPending}
            >
              <div className="grid grid-cols-[repeat(2,minmax(0,1fr))] gap-4 max-[650px]:grid-cols-[1fr]">
                <div className="field">
                  <label htmlFor="profileCgpa">CGPA</label>
                  <input
                    aria-describedby="profileCgpa-error"
                    aria-invalid={Boolean(academicsState.errors?.cgpa)}
                    defaultValue={profile?.cgpa ?? ""}
                    id="profileCgpa"
                    inputMode="decimal"
                    name="cgpa"
                    required
                    step="0.01"
                    type="number"
                  />
                  <FieldError id="profileCgpa-error" messages={academicsState.errors?.cgpa} />
                </div>
                <div className="field">
                  <label htmlFor="profileCgpaScale">CGPA scale</label>
                  <select
                    aria-describedby="profileCgpaScale-error"
                    aria-invalid={Boolean(academicsState.errors?.cgpaScale)}
                    defaultValue={String(profile?.cgpa_scale ?? 10)}
                    id="profileCgpaScale"
                    name="cgpaScale"
                    required
                  >
                    {CGPA_SCALES.map((scale) => (
                      <option key={scale} value={scale}>Out of {scale}</option>
                    ))}
                  </select>
                  <FieldError
                    id="profileCgpaScale-error"
                    messages={academicsState.errors?.cgpaScale}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profileActiveBacklogs">Active backlogs</label>
                  <input
                    aria-describedby="profileActiveBacklogs-error"
                    aria-invalid={Boolean(academicsState.errors?.activeBacklogs)}
                    defaultValue={profile?.active_backlogs ?? 0}
                    id="profileActiveBacklogs"
                    inputMode="numeric"
                    min={0}
                    name="activeBacklogs"
                    required
                    type="number"
                  />
                  <FieldError
                    id="profileActiveBacklogs-error"
                    messages={academicsState.errors?.activeBacklogs}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profileClearedBacklogs">Cleared backlogs</label>
                  <input
                    aria-describedby="profileClearedBacklogs-error"
                    aria-invalid={Boolean(academicsState.errors?.clearedBacklogs)}
                    defaultValue={profile?.cleared_backlogs ?? 0}
                    id="profileClearedBacklogs"
                    inputMode="numeric"
                    min={0}
                    name="clearedBacklogs"
                    required
                    type="number"
                  />
                  <FieldError
                    id="profileClearedBacklogs-error"
                    messages={academicsState.errors?.clearedBacklogs}
                  />
                </div>
                {[
                  ["sslcPercentage", "profileSslcPercentage", "SSLC percentage", profile?.sslc_percentage],
                  ["hscPercentage", "profileHscPercentage", "HSC percentage", profile?.hsc_percentage],
                  ["diplomaPercentage", "profileDiplomaPercentage", "Diploma percentage", profile?.diploma_percentage],
                ].map(([name, id, label, value]) => (
                  <div className="field" key={String(name)}>
                    <label htmlFor={String(id)}>{label}</label>
                    <input
                      aria-describedby={`${id}-error`}
                      aria-invalid={Boolean(academicsState.errors?.[String(name)])}
                      defaultValue={value ?? ""}
                      id={String(id)}
                      inputMode="decimal"
                      max={100}
                      min={0}
                      name={String(name)}
                      step="0.01"
                      type="number"
                    />
                    <FieldError
                      id={`${id}-error`}
                      messages={academicsState.errors?.[String(name)]}
                    />
                  </div>
                ))}
              </div>
              <div className="field">
                <label htmlFor="profileAcademicRemarks">Academic remarks</label>
                <textarea
                  aria-describedby="profileAcademicRemarks-hint profileAcademicRemarks-error"
                  aria-invalid={Boolean(academicsState.errors?.academicRemarks)}
                  defaultValue={profile?.academic_remarks ?? ""}
                  id="profileAcademicRemarks"
                  maxLength={2000}
                  name="academicRemarks"
                />
                <span className="field-hint" id="profileAcademicRemarks-hint">
                  Optional context for your counselor, up to 2,000 characters.
                </span>
                <FieldError
                  id="profileAcademicRemarks-error"
                  messages={academicsState.errors?.academicRemarks}
                />
              </div>
              <div className="mt-2 flex justify-end gap-3 max-[650px]:flex-col max-[650px]:items-stretch max-[650px]:[&_.button]:w-full">
                <button
                  className="button button-secondary"
                  onClick={() => setActiveStep("identity")}
                  type="button"
                >
                  Back
                </button>
                <SubmitButton pendingLabel="Saving academics...">Save and Continue</SubmitButton>
              </div>
            </fieldset>
          </form>
        </section>

        <div style={activeStep === "academics" ? {} : { display: "none" }}>
          {achievementsSection}
        </div>

        <section
          aria-labelledby="preferences-heading"
          style={activeStep === "preferences" ? {} : { display: "none" }}
        >
          <div className="mb-8">
            <h2
              className="text-3xl font-extrabold text-[#0B1F3A]"
              id="preferences-heading"
            >
              Higher-studies Preferences
            </h2>
            <p className="text-[#64748B] mt-2 text-lg">
              Share your present goals. You can change these as your
              plans develop.
            </p>
          </div>

          {!identitySaved && (
            <div className="bg-amber-50 text-amber-800 p-4 rounded-xl border border-amber-200 mb-6 flex items-start gap-3">
              <AlertCircle size={20} className="mt-0.5" />
              <p>
                Save your identity section first before adding
                preferences.
              </p>
            </div>
          )}

          <form
            action={preferencesAction}
            aria-busy={preferencesPending}
            className="space-y-6"
          >
            <ActionFeedback state={preferencesState} />
            <fieldset
              className="form-fields"
              disabled={preferencesPending}
            >
              <fieldset
                aria-describedby="profileHigherStudiesInterest-error"
                className="interest-field"
              >
                <legend>Higher-studies interest</legend>
                <div className="interest-options">
                  {HIGHER_STUDIES_INTEREST_PROFILE_OPTIONS.map(
                    (option) => (
                      <label key={option.value}>
                        <input
                          defaultChecked={
                            preferences?.higher_studies_interest ===
                            option.value
                          }
                          name="higherStudiesInterest"
                          required
                          type="radio"
                          value={option.value}
                        />
                        <span>{option.label}</span>
                      </label>
                    ),
                  )}
                </div>
                <FieldError
                  id="profileHigherStudiesInterest-error"
                  messages={
                    preferencesState.errors?.higherStudiesInterest
                  }
                />
              </fieldset>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="field">
                  <label htmlFor="profilePreferredStudyLevel">
                    Preferred study level
                  </label>
                  <select
                    aria-describedby="profilePreferredStudyLevel-error"
                    aria-invalid={Boolean(
                      preferencesState.errors?.preferredStudyLevel,
                    )}
                    defaultValue={
                      preferences?.preferred_study_level ?? ""
                    }
                    id="profilePreferredStudyLevel"
                    name="preferredStudyLevel"
                    onChange={(e) => setStudyPathway(e.target.value)}
                  >
                    <option value="">Not decided</option>
                    {PREFERRED_STUDY_LEVEL_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    id="profilePreferredStudyLevel-error"
                    messages={
                      preferencesState.errors?.preferredStudyLevel
                    }
                  />
                </div>
                {studyPathway === "global_track" && (
                  <div className="field">
                    <label htmlFor="profileGlobalTrackDuration">
                      Global Track Duration
                    </label>
                    <select
                      aria-describedby="profileGlobalTrackDuration-error"
                      aria-invalid={Boolean(
                        preferencesState.errors?.globalTrackDuration,
                      )}
                      defaultValue={preferences?.global_track_duration ?? ""}
                      id="profileGlobalTrackDuration"
                      name="globalTrackDuration"
                    >
                      <option value="">Select a duration</option>
                      {GLOBAL_TRACK_DURATION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                    <FieldError
                      id="profileGlobalTrackDuration-error"
                      messages={preferencesState.errors?.globalTrackDuration}
                    />
                  </div>
                )}
                <div className="field">
                  <label htmlFor="profileStudyMode">Study mode</label>
                  <select
                    aria-describedby="profileStudyMode-error"
                    aria-invalid={Boolean(
                      preferencesState.errors?.studyMode,
                    )}
                    defaultValue={preferences?.study_mode ?? ""}
                    id="profileStudyMode"
                    name="studyMode"
                  >
                    <option value="">Not decided</option>
                    {STUDY_MODE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    id="profileStudyMode-error"
                    messages={preferencesState.errors?.studyMode}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profileAcademicPreference">
                    Academic preference
                  </label>
                  <select
                    aria-describedby="profileAcademicPreference-error"
                    aria-invalid={Boolean(
                      preferencesState.errors?.academicPreference,
                    )}
                    defaultValue={
                      preferences?.academic_preference ?? ""
                    }
                    id="profileAcademicPreference"
                    name="academicPreference"
                  >
                    <option value="">Not decided</option>
                    {ACADEMIC_PREFERENCE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    id="profileAcademicPreference-error"
                    messages={
                      preferencesState.errors?.academicPreference
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="profilePlanningStage">
                    Your planning stage
                  </label>
                  <select
                    aria-describedby="profilePlanningStage-hint profilePlanningStage-error"
                    aria-invalid={Boolean(
                      preferencesState.errors?.studentPlanningStage,
                    )}
                    defaultValue={
                      preferences?.student_planning_stage ?? ""
                    }
                    id="profilePlanningStage"
                    name="studentPlanningStage"
                  >
                    <option value="">Not decided</option>
                    {STUDENT_PLANNING_STAGE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <span
                    className="field-hint"
                    id="profilePlanningStage-hint"
                  >
                    This is your own planning stage, not an official
                    counselor progression status.
                  </span>
                  <FieldError
                    id="profilePlanningStage-error"
                    messages={
                      preferencesState.errors?.studentPlanningStage
                    }
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-[#DCE6F2]">
                <h2 className="text-xl font-bold text-[#0B1F3A] mb-1">Preferred Study Destinations <span aria-hidden="true">*</span></h2>
                <p className="text-sm text-[#64748B] mb-3">Select countries where you wish to study.</p>
                <CountryCombobox
                  selectedCountries={preferredCountries}
                  onChange={setPreferredCountries}
                />
                {preferredCountries.map((c) => (
                  <input key={`country-${c}`} type="hidden" name="preferredCountries" value={c} />
                ))}
                <FieldError
                  id="preferredCountries-error"
                  messages={preferencesState.errors?.preferredCountries}
                />
              </div>

              <div className="pt-4 border-t border-[#DCE6F2] mt-6">
                <h2 className="text-xl font-bold text-[#0B1F3A] mb-1">Field of Study Preference <span aria-hidden="true">*</span></h2>
                <p className="text-sm text-[#64748B] mb-3">Are you planning to continue in the same field as your undergraduate degree, or explore a different field?</p>
                <div className="flex flex-col gap-2 mb-6">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="sameAsUg" 
                      value="true" 
                      checked={sameAsUg === true} 
                      onChange={() => setSameAsUg(true)} 
                      className="text-[#1D4ED8] focus:ring-[#1D4ED8]" 
                    />
                    <span className="text-sm text-[#0F172A]">Continue in the same field ({profile?.department || "your UG degree"})</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="sameAsUg" 
                      value="false" 
                      checked={sameAsUg === false} 
                      onChange={() => setSameAsUg(false)} 
                      className="text-[#1D4ED8] focus:ring-[#1D4ED8]" 
                    />
                    <span className="text-sm text-[#0F172A]">Explore a different field</span>
                  </label>
                </div>
                <FieldError
                  id="sameAsUg-error"
                  messages={preferencesState.errors?.sameAsUg}
                />

                <h2 className="text-xl font-bold text-[#0B1F3A] mb-1">Preferred Courses <span aria-hidden="true">*</span></h2>
                <p className="text-sm text-[#64748B] mb-3">Select your degree programs or course areas.</p>
                <CourseCombobox
                  selectedCourses={preferredCourses}
                  onChange={setPreferredCourses}
                  allCourses={sortedCourses}
                />
                {preferredCourses.map((c) => (
                  <input key={`course-${c}`} type="hidden" name="preferredProgramAreas" value={c} />
                ))}
                <FieldError
                  id="preferredProgramAreas-error"
                  messages={preferencesState.errors?.preferredProgramAreas}
                />
              </div>

              <div className="pt-4 border-t border-[#DCE6F2] mt-6">
                <div className="flex items-center justify-between mb-1">
                  <h2 className="text-xl font-bold text-[#0B1F3A]">Domain Specializations</h2>
                </div>
                <p className="text-sm text-[#64748B] mb-3 leading-relaxed">
                  Domain specializations allow you to dive deeper into a focused area of study within your preferred degree programs.
                </p>
                <SpecializationCombobox 
                  selectedSpecs={specialization}
                  onChange={setSpecialization}
                  allSpecs={specOptions}
                />
                {specialization.map((s) => (
                  <input key={`spec-${s}`} type="hidden" name="domainSpecializations" value={s} />
                ))}
                <FieldError
                  id="domainSpecializations-error"
                  messages={preferencesState.errors?.domainSpecializations}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                <div className="field">
                  <label htmlFor="profileTargetSeason">
                    Target intake season
                  </label>
                  <select
                    aria-describedby="profileTargetSeason-error"
                    defaultValue={targetIntake.season}
                    id="profileTargetSeason"
                    name="targetSeason"
                  >
                    <option value="">Not decided</option>
                    {TARGET_INTAKE_SEASONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    id="profileTargetSeason-error"
                    messages={preferencesState.errors?.targetSeason}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profileTargetYear">
                    Target intake year
                  </label>
                  <select
                    aria-describedby="profileTargetYear-error"
                    defaultValue={targetIntake.year}
                    id="profileTargetYear"
                    name="targetYear"
                  >
                    <option value="">Not decided</option>
                    {TARGET_INTAKE_YEARS.map((year) => (
                      <option key={year} value={year}>
                        {year}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    id="profileTargetYear-error"
                    messages={preferencesState.errors?.targetYear}
                  />
                </div>
                <div className="field">
                  <label htmlFor="profileBudgetRange">
                    Budget range
                  </label>
                  <input
                    aria-describedby="profileBudgetRange-error"
                    aria-invalid={Boolean(
                      preferencesState.errors?.budgetRange,
                    )}
                    defaultValue={preferences?.budget_range ?? ""}
                    id="profileBudgetRange"
                    maxLength={100}
                    name="budgetRange"
                    placeholder="Example: INR 20–30 lakh"
                    type="text"
                  />
                  <FieldError
                    id="profileBudgetRange-error"
                    messages={preferencesState.errors?.budgetRange}
                  />
                </div>
                <BooleanSelect
                  defaultValue={preferences?.scholarship_required}
                  errors={preferencesState.errors?.scholarshipRequired}
                  id="profileScholarshipRequired"
                  label="Scholarship required"
                  name="scholarshipRequired"
                />
                <BooleanSelect
                  defaultValue={preferences?.funding_required}
                  errors={preferencesState.errors?.fundingRequired}
                  id="profileFundingRequired"
                  label="Education funding required"
                  name="fundingRequired"
                />
                <div className="field">
                  <label htmlFor="profileFundingMethod">
                    Funding Method
                  </label>
                  <select
                    aria-describedby="profileFundingMethod-error"
                    aria-invalid={Boolean(
                      preferencesState.errors?.fundingMethod,
                    )}
                    defaultValue={preferences?.funding_method ?? ""}
                    id="profileFundingMethod"
                    name="fundingMethod"
                  >
                    <option value="">Select a funding method</option>
                    {STUDENT_FUNDING_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    id="profileFundingMethod-error"
                    messages={preferencesState.errors?.fundingMethod}
                  />
                </div>
              </div>
              <div className="mt-8 flex justify-between">
                <button
                  className="button bg-gray-100 text-gray-700 hover:bg-gray-200"
                  onClick={() => setActiveStep("academics")}
                  type="button"
                >
                  Back
                </button>
                <SubmitButton pendingLabel="Saving...">
                  Save and Continue
                </SubmitButton>
              </div>
            </fieldset>
          </form>
        </section>

        <div
          className="grid gap-10"
          style={activeStep === "records" ? {} : { display: "none" }}
        >
          {recordsSection}
          <div>
            <button
              className="button bg-gray-100 text-gray-700 hover:bg-gray-200"
              onClick={() => setActiveStep("preferences")}
              type="button"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
