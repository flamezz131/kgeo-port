import type { Metadata } from "next";
import Link from "next/link";
import { GraduationCap, MailCheck, ShieldCheck } from "lucide-react";
import { RegisterForm } from "@/components/auth/register-form";

export const metadata: Metadata = { title: "Create an account" };

const steps = [
  {
    icon: <GraduationCap size={16} />,
    text: "Register with your Kumaraguru college email.",
  },
  {
    icon: <MailCheck size={16} />,
    text: "Confirm the verification link we send you.",
  },
  {
    icon: <ShieldCheck size={16} />,
    text: "Build your counseling profile and book a consultation.",
  },
];

export default function RegisterPage() {
  return (
    <section className="mx-auto grid w-full max-w-6xl gap-10 px-5 pt-10 pb-24 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1fr)] lg:items-start lg:gap-16">
      <div className="lg:sticky lg:top-32">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-[#1E40AF] ring-1 ring-inset ring-blue-100">
          K-GEO student registration
        </span>
        <h1 className="mt-4">Create your student account</h1>
        <p className="mt-3 max-w-md leading-relaxed text-slate-500">
          Register with your Kumaraguru college email and create a separate
          password used only for K-GEO.
        </p>

        <ol className="mt-8 flex flex-col gap-3">
          {steps.map((step, index) => (
            <li key={step.text} className="flex items-center gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-white text-[#1D4ED8] ring-1 ring-[#E2E8F0]">
                {step.icon}
              </span>
              <span className="text-[0.9rem] text-slate-600">
                <span className="mr-1.5 font-bold tabular-nums text-slate-500">
                  {index + 1}.
                </span>
                {step.text}
              </span>
            </li>
          ))}
        </ol>
      </div>

      <div className="relative">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-8 right-0 h-56 w-72 rounded-full bg-blue-200/35 blur-3xl"
        />
        <div className="relative rounded-3xl border border-[#E2E8F0] bg-white p-7 shadow-[0_24px_60px_-30px_rgb(11_31_58/0.35)] sm:p-9">
          <RegisterForm />
          <p className="mt-6 border-t border-[#E2E8F0] pt-5 text-[0.87rem] text-slate-500">
            Already registered?{" "}
            <Link
              href="/login"
              className="font-semibold text-[#1D4ED8] underline decoration-1 underline-offset-4 hover:text-[#1E40AF]"
            >
              Log in
            </Link>
          </p>
        </div>
      </div>
    </section>
  );
}
