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
  const { profile } = await requireStudent();
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
    <section className="relative mx-auto w-full max-w-2xl">
      <div className="absolute inset-0 bg-white/40 backdrop-blur-2xl rounded-[2.5rem] border border-white/60 shadow-[0_8px_32px_rgba(29,78,216,0.08)] -z-10" />

      <div className="p-10 md:p-14">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-blue-100/80 flex items-center justify-center text-blue-700 shadow-sm border border-blue-200/50">
            <Calendar size={20} />
          </div>
          <span className="text-sm font-bold text-blue-700 uppercase tracking-wider">
            Student consultation
          </span>
        </div>

        <h1 className="text-3xl md:text-4xl font-extrabold text-[#0B1F3A] mb-4">
          Request a consultation
        </h1>
        <p className="text-blue-900/60 text-lg mb-10 leading-relaxed font-medium">
          Choose a weekday and reserve one available 30-minute session between
          9:00 AM and 5:00 PM. Your Counselor is assigned automatically when the
          booking is confirmed.
        </p>

        <div className="bg-white/60 backdrop-blur-md rounded-2xl p-6 md:p-8 border border-white/80 shadow-sm">
          <ConsultationForm
            collegeEmail={profile.college_email}
            defaultStudentName={profile.full_name ?? ""}
            maximumConsultationDate={maximumConsultationDate}
            minimumConsultationDate={minimumConsultationDate}
          />
        </div>
      </div>
    </section>
  );
}
