"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { CheckCircle2, GraduationCap } from "lucide-react";
import { HeroCarousel } from "./HeroCarousel";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

export function HomeHero() {
  return (
    <section className="relative isolate min-h-[90vh] flex items-center pt-20 pb-20 px-6 bg-[#F3F8FF] overflow-hidden">
      <HeroCarousel />

      {/* Light veil so the navy text stays readable over any photo: even on
          phones, fading out to the right on wide screens. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-b from-[#F3F8FF]/95 via-[#F3F8FF]/90 to-[#F3F8FF]/75 lg:bg-gradient-to-r lg:from-[#F3F8FF] lg:from-40% lg:via-[#F3F8FF]/75 lg:via-55% lg:to-transparent lg:to-75%"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 z-0 h-24 bg-gradient-to-t from-white to-transparent"
      />

      <div className="max-w-[1400px] mx-auto w-full relative z-10">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-2xl">
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-sm font-semibold tracking-wide uppercase mb-6 border border-blue-100">
            <GraduationCap size={16} /> Global Education Guidance
          </motion.div>

          <motion.div variants={fadeUp}>
            <h1 className="text-[3.5rem] md:text-[4rem] lg:text-[4.5rem] leading-[1.05] font-extrabold text-[#0B1F3A] tracking-tight mb-6">
              From Kumaraguru to <span className="text-[#1D4ED8]">Global</span> Universities
            </h1>
          </motion.div>

          <motion.p variants={fadeUp} className="text-[#334155] text-lg lg:text-xl leading-relaxed mb-10 max-w-xl">
            Discover suitable countries, courses, universities, scholarships, and application pathways through structured guidance from K-GEO. Your bridge to international academic excellence.
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-4 mb-10">
            <Link href="/register" className="h-14 px-8 inline-flex items-center justify-center font-bold text-white bg-[#1D4ED8] rounded-full hover:bg-[#0B1F3A] transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-900/20 hover:-translate-y-1">
              Book a Consultation
            </Link>
            <Link href="/login" className="h-14 px-8 inline-flex items-center justify-center font-bold text-[#0B1F3A] bg-white border border-[#E2E8F0] rounded-full hover:border-[#0B1F3A] transition-all hover:-translate-y-1">
              Check Your Eligibility
            </Link>
          </motion.div>

          <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-[#334155]">
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#047857]" /> Personalized Guidance</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#047857]" /> Verified Opportunities</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#047857]" /> End-to-End Support</span>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
