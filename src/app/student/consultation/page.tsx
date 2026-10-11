import type { Metadata } from "next";
import { ConsultationForm } from "@/components/forms/consultation-form";
import {
  addCalendarDays,
  CONSULTATION_BOOKING_HORIZON_DAYS,
  getAsiaKolkataBusinessDateTime,
} from "@/lib/consultations/booking";
import { requireStudent } from "@/lib/permissions";
import { Calendar } from "lucide-react";

export const metadata: Metadata = { title: "Request a consultation" };

export default async function ConsultationPage() {
  const { supabase, user, profile } = await requireStudent();
  // Prefill from the saved profile when available; the form stays editable.
  const { data: savedProfile } = await supabase
    .from("student_profiles")
    .select(
      "roll_number, personal_email, mobile_number, course, department, graduation_year",
    )
    .eq("student_id", user.id)
    .maybeSingle();
  const minimumConsultationDate = getAsiaKolkataBusinessDateTime(
    new Date(),
  ).date;
  const maximumConsultationDate = addCalendarDays(
    minimumConsultationDate,
    CONSULTATION_BOOKING_HORIZON_DAYS - 1,
  );
  if (!maximumConsultationDate) {
    throw new Error("The consultation booking horizon is unavailable.");
  }

  return (
    <section className="w-full">
      <header className="max-w-3xl">
        <div
          aria-hidden="true"
          className="mb-4 w-10 h-10 rounded-full bg-blue-100/80 flex items-center justify-center text-blue-700 shadow-sm border border-blue-200/50"
        >
          <Calendar size={20} />
        </div>

        <h1 className="text-3xl md:text-4xl font-extrabold text-[#0B1F3A] mb-4">
          Request a consultation
        </h1>
        <p className="text-blue-900/60 text-lg leading-relaxed font-medium">
          Choose a weekday and reserve one available 30-minute session between
          9:00 AM and 5:00 PM. Your Counselor is assigned automatically when the
          booking is confirmed.
        </p>
      </header>

      <ConsultationForm
        collegeEmail={profile.college_email}
        defaults={{
          rollNumber: savedProfile?.roll_number ?? "",
          personalEmail: savedProfile?.personal_email ?? "",
          mobileNumber: savedProfile?.mobile_number ?? "",
          course: savedProfile?.course ?? "",
          department: savedProfile?.department ?? "",
          collegeEndYear: savedProfile?.graduation_year ?? null,
        }}
        defaultStudentName={profile.full_name ?? ""}
        maximumConsultationDate={maximumConsultationDate}
        minimumConsultationDate={minimumConsultationDate}
      />
    </section>
  );
}
