"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { createConsultation } from "@/app/actions/consultation-actions";
import { FieldError } from "@/components/forms/field-error";
import { ConsultationSlotPicker } from "@/components/forms/consultation-slot-picker";
import { SubmitButton } from "@/components/ui/submit-button";
import {
  COLLEGE_END_YEARS,
  COURSE_DEPARTMENTS,
  COURSES,
  HIGHER_STUDIES_INTEREST_OPTIONS,
  isCourse,
  type Course,
} from "@/lib/consultations/options";
import { isConsultationSubmissionLocked } from "@/lib/consultations/submission-state";
import {
  formatConsultationDate,
  formatConsultationTimeRange,
} from "@/lib/consultations/booking";
import { initialConsultationActionState } from "@/types";

type ConsultationFormProps = {
  collegeEmail: string;
  defaultStudentName: string;
  maximumConsultationDate: string;
  minimumConsultationDate: string;
};

export function ConsultationForm({
  collegeEmail,
  defaultStudentName,
  maximumConsultationDate,
  minimumConsultationDate,
}: ConsultationFormProps) {
  const [state, action, isPending] = useActionState(
    createConsultation,
    initialConsultationActionState,
  );
  const [course, setCourse] = useState<Course | "">("");
  const [department, setDepartment] = useState("");
  const isLocked = isConsultationSubmissionLocked(isPending, state);

  if (state.status === "success" && state.receipt) {
    return (
      <section className="panel mt-8 grid gap-4 [&_h2]:m-0" role="status">
        <span className="eyebrow">Consultation Confirmed</span>
        <h2>{state.message}</h2>
        <dl className="m-0 grid gap-3 [&_dd]:m-0 [&_dd]:font-bold [&_dt]:text-[var(--muted)] [&_div]:grid [&_div]:grid-cols-[minmax(130px,0.35fr)_1fr] [&_div]:gap-4 [&_div]:border-b [&_div]:border-[var(--line)] [&_div]:pb-3 max-[760px]:[&_div]:grid-cols-[1fr] max-[760px]:[&_div]:gap-1">
          <div>
            <dt>Reference</dt>
            <dd>{state.receipt.request_number}</dd>
          </div>
          <div>
            <dt>Consultation date</dt>
            <dd>{formatConsultationDate(state.receipt.consultation_date)}</dd>
          </div>
          <div>
            <dt>Time</dt>
            <dd>
              {formatConsultationTimeRange(
                state.receipt.slot_start,
                state.receipt.slot_end,
              )}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>Scheduled</dd>
          </div>
        </dl>
        <div className="actions">
          <Link className="button" href="/student/dashboard">
            Return to Student Dashboard
          </Link>
          <Link
            className="button button-secondary"
            href="/student/dashboard#my-consultations"
          >
            View My Consultations
          </Link>
        </div>
      </section>
    );
  }

  const departments = course ? COURSE_DEPARTMENTS[course] : [];

  return (
    <form action={action} aria-busy={isPending} className="form-stack">
      {state.message && (
        <p className="form-error" role="alert">
          {state.message}
        </p>
      )}

      <fieldset className="form-fields" disabled={isLocked}>
        <div className="field">
          <label htmlFor="studentName">Student Name</label>
          <input
            aria-describedby="studentName-error"
            aria-invalid={Boolean(state.errors?.studentName)}
            autoComplete="name"
            defaultValue={defaultStudentName}
            id="studentName"
            maxLength={150}
            minLength={2}
            name="studentName"
            required
            type="text"
          />
          <FieldError
            id="studentName-error"
            messages={state.errors?.studentName}
          />
        </div>

        <div className="field">
          <label htmlFor="rollNumber">Roll Number</label>
          <input
            aria-describedby="rollNumber-hint rollNumber-error"
            aria-invalid={Boolean(state.errors?.rollNumber)}
            autoCapitalize="characters"
            id="rollNumber"
            maxLength={50}
            name="rollNumber"
            required
            type="text"
          />
          <span className="field-hint" id="rollNumber-hint">
            Your roll number will be stored in uppercase.
          </span>
          <FieldError
            id="rollNumber-error"
            messages={state.errors?.rollNumber}
          />
        </div>

        <div className="field">
          <label htmlFor="collegeEmail">College Email ID</label>
          <input
            aria-describedby="collegeEmail-hint"
            id="collegeEmail"
            readOnly
            type="email"
            value={collegeEmail}
          />
          <span className="field-hint" id="collegeEmail-hint">
            Verified from your authenticated K-GEO profile. This value cannot
            be edited or submitted by the form.
          </span>
        </div>

        <div className="field">
          <label htmlFor="personalEmail">Personal Email ID</label>
          <input
            aria-describedby="personalEmail-error"
            aria-invalid={Boolean(state.errors?.personalEmail)}
            autoCapitalize="none"
            autoComplete="email"
            id="personalEmail"
            name="personalEmail"
            required
            type="email"
          />
          <FieldError
            id="personalEmail-error"
            messages={state.errors?.personalEmail}
          />
        </div>

        <div className="field">
          <label htmlFor="collegeEndYear">College End Year</label>
          <select
            aria-describedby="collegeEndYear-error"
            aria-invalid={Boolean(state.errors?.collegeEndYear)}
            defaultValue=""
            id="collegeEndYear"
            name="collegeEndYear"
            required
          >
            <option disabled value="">
              Select your end year
            </option>
            {COLLEGE_END_YEARS.map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
          <FieldError
            id="collegeEndYear-error"
            messages={state.errors?.collegeEndYear}
          />
        </div>

        <div className="field">
          <label htmlFor="course">Course</label>
          <select
            aria-describedby="course-error"
            aria-invalid={Boolean(state.errors?.course)}
            id="course"
            name="course"
            onChange={(event) => {
              const selectedCourse = event.currentTarget.value;
              setCourse(isCourse(selectedCourse) ? selectedCourse : "");
              setDepartment("");
            }}
            required
            value={course}
          >
            <option disabled value="">
              Select your course
            </option>
            {COURSES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <FieldError id="course-error" messages={state.errors?.course} />
        </div>

        <div className="field">
          <label htmlFor="department">Department</label>
          <select
            aria-describedby="department-hint department-error"
            aria-invalid={Boolean(state.errors?.department)}
            disabled={!course}
            id="department"
            name="department"
            onChange={(event) => setDepartment(event.target.value)}
            required
            value={department}
          >
            <option disabled value="">
              {course ? "Select your department" : "Select a course first"}
            </option>
            {departments.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
          <span className="field-hint" id="department-hint">
            Department options depend on your selected course.
          </span>
          <FieldError
            id="department-error"
            messages={state.errors?.department}
          />
        </div>

        <div className="field">
          <label htmlFor="mobileNumber">Mobile Number</label>
          <input
            aria-describedby="mobileNumber-hint mobileNumber-error"
            aria-invalid={Boolean(state.errors?.mobileNumber)}
            autoComplete="tel"
            id="mobileNumber"
            inputMode="numeric"
            maxLength={10}
            name="mobileNumber"
            pattern="[0-9]{10}"
            required
            type="tel"
          />
          <span className="field-hint" id="mobileNumber-hint">
            Enter exactly 10 digits.
          </span>
          <FieldError
            id="mobileNumber-error"
            messages={state.errors?.mobileNumber}
          />
        </div>

        <fieldset
          aria-describedby="higherStudiesInterest-error"
          aria-invalid={Boolean(state.errors?.higherStudiesInterest)}
          className="m-0 grid gap-3 rounded-[0.8rem] border border-[var(--line)] p-4 [&_legend]:px-[0.35rem] [&_legend]:py-0 [&_legend]:text-[0.88rem] [&_legend]:font-bold"
        >
          <legend>Interested in Higher Studies</legend>
          <div className="flex flex-wrap gap-x-5 gap-y-3 max-[760px]:flex-col max-[760px]:items-stretch [&_input]:size-[1.1rem] [&_input]:accent-[var(--green)] [&_label]:inline-flex [&_label]:cursor-pointer [&_label]:items-center [&_label]:gap-[0.45rem]">
            {HIGHER_STUDIES_INTEREST_OPTIONS.map((option) => (
              <label key={option.value}>
                <input
                  name="higherStudiesInterest"
                  required
                  type="radio"
                  value={option.value}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
          <FieldError
            id="higherStudiesInterest-error"
            messages={state.errors?.higherStudiesInterest}
          />
        </fieldset>

        <ConsultationSlotPicker
          dateErrors={state.errors?.consultationDate}
          feedbackSignal={state}
          maximumDate={maximumConsultationDate}
          minimumDate={minimumConsultationDate}
          refreshSignal={state.refreshAvailability ? state : null}
          slotErrors={state.errors?.slotStart}
        />
      </fieldset>

      <SubmitButton pendingLabel="Booking consultation...">
        Book Consultation
      </SubmitButton>
    </form>
  );
}
