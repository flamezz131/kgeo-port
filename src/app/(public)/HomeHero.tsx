"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { CheckCircle2, GraduationCap } from "lucide-react";

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
    <section className="relative min-h-[90vh] flex items-center pt-20 pb-16 px-6 bg-gradient-to-br from-[#EFF6FF] via-white to-white overflow-hidden">
      <div className="absolute top-0 right-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[600px] rounded-full bg-[#1D4ED8]/5 blur-3xl" />
        <div className="absolute bottom-[10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-[#0B1F3A]/5 blur-3xl" />
      </div>

      <div className="max-w-[1400px] mx-auto w-full grid lg:grid-cols-2 gap-12 lg:gap-8 relative z-10 items-center">
        <motion.div initial="hidden" animate="visible" variants={staggerContainer} className="max-w-2xl">
          <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-50 text-blue-700 text-sm font-semibold tracking-wide uppercase mb-6 border border-blue-100">
            <GraduationCap size={16} /> Global Education Guidance
          </motion.div>

          <motion.div variants={fadeUp}>
            <h1 className="text-[3.5rem] md:text-[4rem] lg:text-[4.5rem] leading-[1.05] font-extrabold text-[#0B1F3A] tracking-tight mb-6">
              From Kumaraguru to <span className="text-[#1D4ED8]">Global</span> Universities
            </h1>
          </motion.div>

          <motion.p variants={fadeUp} className="text-[#64748B] text-lg lg:text-xl leading-relaxed mb-10 max-w-xl">
            Discover suitable countries, courses, universities, scholarships, and application pathways through structured guidance from K-GEO. Your bridge to international academic excellence.
          </motion.p>

          <motion.div variants={fadeUp} className="flex flex-wrap items-center gap-4 mb-10">
            <Link href="/register" className="h-14 px-8 inline-flex items-center justify-center font-bold text-white bg-[#1D4ED8] rounded-full hover:bg-[#0B1F3A] transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-900/20 hover:-translate-y-1">
              Book a Consultation
            </Link>
            <Link href="#services" className="h-14 px-8 inline-flex items-center justify-center font-bold text-[#0B1F3A] bg-white border border-[#E2E8F0] rounded-full hover:border-[#0B1F3A] transition-all hover:-translate-y-1">
              Check Your Eligibility
            </Link>
          </motion.div>

          <motion.div variants={fadeUp} className="flex items-center gap-6 text-sm font-medium text-[#64748B]">
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#10B981]" /> Personalized Guidance</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#10B981]" /> Verified Opportunities</span>
            <span className="flex items-center gap-2"><CheckCircle2 size={16} className="text-[#10B981]" /> End-to-End Support</span>
          </motion.div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: "easeOut" }}
          className="relative lg:h-[600px] flex items-center justify-center lg:justify-end"
        >
          <div className="w-full max-w-[550px] bg-white rounded-2xl shadow-2xl shadow-blue-900/10 border border-[#E2E8F0] p-6 lg:p-8 relative">
            <div className="flex items-center justify-between mb-8 pb-4 border-b border-[#E2E8F0]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#1D4ED8] flex items-center justify-center text-white font-bold">KR</div>
                <div>
                  <div className="font-bold text-[#0B1F3A]">Karthik Ram</div>
                  <div className="text-xs text-[#64748B]">Profile Completion: 95%</div>
                </div>
              </div>
              <div className="flex gap-1">
                <div className="w-2 h-2 rounded-full bg-red-400"></div>
                <div className="w-2 h-2 rounded-full bg-yellow-400"></div>
                <div className="w-2 h-2 rounded-full bg-green-400"></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-[#F8FAFC] rounded-xl p-4 border border-[#E2E8F0]">
                <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Eligibility Score</div>
                <div className="text-4xl font-extrabold text-[#1D4ED8]">780</div>
                <div className="text-xs text-[#10B981] font-medium mt-1">High Chance for Top 50</div>
              </div>
              <div className="bg-[#F8FAFC] rounded-xl p-4 border border-[#E2E8F0]">
                <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-2">Recommended Countries</div>
                <div className="flex gap-2 mt-2">
                  {["us", "gb", "ca", "de"].map((code) => (
                    <div key={code} className="w-10 h-7 rounded overflow-hidden border border-[#E2E8F0] shadow-sm">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`https://flagcdn.com/${code}.svg`} alt="" className="w-full h-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="bg-[#F8FAFC] rounded-xl p-4 border border-[#E2E8F0]">
              <div className="text-xs font-bold text-[#64748B] uppercase tracking-wider mb-4">University Shortlist</div>
              <div className="space-y-3">
                <div className="flex justify-between items-center pb-2 border-b border-[#E2E8F0]">
                  <span className="text-sm font-semibold text-[#0B1F3A]">Stanford University</span>
                  <span className="text-xs font-bold text-[#1D4ED8] bg-blue-50 px-2 py-1 rounded">DREAM</span>
                </div>
                <div className="flex justify-between items-center pb-2 border-b border-[#E2E8F0]">
                  <span className="text-sm font-semibold text-[#0B1F3A]">University of Manchester</span>
                  <span className="text-xs font-bold text-[#10B981] bg-green-50 px-2 py-1 rounded">MATCH</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm font-semibold text-[#0B1F3A]">TUM Germany</span>
                  <span className="text-xs font-bold text-[#64748B] bg-gray-100 px-2 py-1 rounded">SAFE</span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
