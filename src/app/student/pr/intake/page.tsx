import type { Metadata } from "next";
import { requireStudent } from "@/lib/permissions";
import { PrIntakeWizard } from "./PrIntakeWizard";
import { loadStudentContextForPR } from "@/lib/recommendations/loadStudentContext";

export const metadata: Metadata = {
  title: "Personalized Roadmap Intake | K-GEO",
};

export default async function PrIntakePage() {
  const { supabase, user } = await requireStudent();

  const studentContext = await loadStudentContextForPR(user.id, supabase);

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <header className="mb-8">
        <h1 className="text-[#0B1F3A] text-3xl font-bold mt-2">
          Generate Your Personalized Study-Abroad Roadmap
        </h1>
        <p className="text-[#64748B] mt-2">
          Complete your profile details below. Our Gemini AI engine will analyze your academic standing, experience, and preferences to build your custom roadmap.
        </p>
      </header>

      <PrIntakeWizard
        studentId={user.id}
        studentContext={studentContext}
      />
    </div>
  );
}
