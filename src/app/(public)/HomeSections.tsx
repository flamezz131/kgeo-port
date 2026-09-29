"use client";

import Link from "next/link";
import { motion, Variants } from "framer-motion";
import { User, FileText, Users, Map, Award, Briefcase } from "lucide-react";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.1 } },
};

export function HomeSections() {
  return (
    <>
      {/* Intro */}
      <section id="about" className="py-20 bg-white px-6">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp}
            className="text-center"
          >
            <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0B1F3A] mb-4">Guided Pathways to Global Education</h2>
            <p className="text-[#64748B] max-w-3xl mx-auto text-lg leading-relaxed">
              K-GEO (Kumaraguru Global Engagement Office) acts as the official bridge between your aspirations and international academic realities. We provide a structured ecosystem connecting students with verified consultants and top-tier universities worldwide.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Destinations */}
      <section id="destinations" className="py-24 bg-[#F8FAFC] px-6">
        <div className="max-w-[1400px] mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="flex justify-between items-end mb-12">
            <div>
              <h2 className="text-3xl font-extrabold text-[#0B1F3A] mb-2">Explore Top Destinations</h2>
              <p className="text-[#64748B]">Preferred academic hubs for Kumaraguru alumni</p>
            </div>
            <Link href="#" className="hidden md:flex items-center gap-2 text-[#1D4ED8] font-bold hover:underline">
              View All Countries &rarr;
            </Link>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="grid md:grid-cols-2 lg:grid-cols-5 gap-6">
            {[
              { name: "USA", desc: "World-leading research & industry hubs", img: "https://images.unsplash.com/photo-1550850839-8dc894ed385a?auto=format&fit=crop&q=80&w=600" },
              { name: "United Kingdom", desc: "Heritage institutions, diverse culture", img: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&q=80&w=600" },
              { name: "Germany", desc: "Low tuition, high industrial growth", img: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&q=80&w=600" },
              { name: "Canada", desc: "Strong PR pathways & inclusive society", img: "https://images.unsplash.com/photo-1517935706615-2717063c2225?auto=format&fit=crop&q=80&w=600" },
              { name: "Europe / AUS", desc: "Global lifestyle & high employability", img: "https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?auto=format&fit=crop&q=80&w=600" },
            ].map((dest, i) => (
              <motion.div key={i} variants={fadeUp} className="group relative h-[280px] sm:h-[320px] lg:h-[380px] rounded-2xl overflow-hidden shadow-lg">
                <div className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover:scale-110" style={{ backgroundImage: `url(${dest.img})` }} />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A]/90 via-[#0B1F3A]/40 to-transparent" />
                <div className="absolute inset-x-0 bottom-0 p-6">
                  <h3 className="text-xl font-bold text-white mb-2">{dest.name}</h3>
                  <p className="text-white/80 text-sm mb-4 line-clamp-2">{dest.desc}</p>
                  <button className="bg-white/20 hover:bg-white/30 backdrop-blur-md text-white text-xs font-bold py-2 px-4 rounded-full transition-colors">
                    Explore
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Success Stories */}
      <section id="success" className="py-24 bg-white px-6">
        <div className="max-w-[1400px] mx-auto">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="text-center mb-16">
            <h2 className="text-3xl font-extrabold text-[#0B1F3A] mb-2">Alumni Success Stories</h2>
            <p className="text-[#64748B]">Inspiring journeys from our campus to the world</p>
          </motion.div>

          <div className="grid lg:grid-cols-5 gap-6">
            <motion.div initial={{ opacity: 0, x: -30 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} className="lg:col-span-3 bg-white border border-[#E2E8F0] rounded-3xl p-8 shadow-xl shadow-blue-900/5 flex flex-col md:flex-row gap-8 items-center">
              <div className="w-full md:w-1/3 aspect-square rounded-2xl bg-gray-200 overflow-hidden shrink-0 bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1556157382-97eda2d62296?auto=format&fit=crop&q=80&w=600')" }}></div>
              <div>
                <div className="inline-block px-3 py-1 bg-blue-50 text-[#1D4ED8] text-xs font-bold rounded-full mb-4">Computing Resident</div>
                <h3 className="text-2xl font-extrabold text-[#0B1F3A] mb-1">Karthik S.</h3>
                <p className="text-sm font-semibold text-[#64748B] mb-6">M.S. in Cybersecurity | Purdue University, USA</p>
                <p className="text-[#0F172A] italic text-lg leading-relaxed mb-6">
                  &quot;The structured guidance at K-GEO helped me navigate the complex visa process and university shortlisting. From my B.Tech at Kumaraguru to a top-tier US university, the transition was seamless.&quot;
                </p>
                <div className="flex gap-4 text-xs font-bold text-[#64748B] uppercase tracking-wider">
                  <span>Dept: Computer Science</span>
                  <span>Year: 2024 Grad</span>
                </div>
              </div>
            </motion.div>

            <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="lg:col-span-2 flex flex-col gap-6">
              {[
                { name: "Aanya Rao", uni: "M.Sc. Data Science | France", tag: "100% Scholarship" },
                { name: "Vijay Krishna", uni: "M.Eng Automotive | RWTH Aachen", tag: "DAAD Fellow" },
                { name: "Meera Nair", uni: "MBA | University of Melbourne", tag: "Global Leader Scholarship" }
              ].map((alumni, i) => (
                <motion.div key={i} variants={fadeUp} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 flex items-center gap-4 hover:shadow-lg transition-shadow">
                  <div className="w-14 h-14 rounded-full bg-gray-200 shrink-0"></div>
                  <div>
                    <h4 className="font-bold text-[#0B1F3A] text-sm">{alumni.name}</h4>
                    <p className="text-xs text-[#64748B] my-1">{alumni.uni}</p>
                    <span className="text-xs font-bold text-[#1D4ED8]">{alumni.tag}</span>
                  </div>
                </motion.div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Path to the World */}
      <section id="how-it-works" className="py-24 bg-[#0B1F3A] text-white px-6">
        <div className="max-w-[1400px] mx-auto text-center">
          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={fadeUp} className="mb-20">
            <h2 className="text-3xl lg:text-4xl font-extrabold mb-4">Your Path to the World</h2>
            <p className="text-[#8295b2] max-w-2xl mx-auto">A seamless 6-step journey from Kumaraguru campus to your dream global university destination.</p>
          </motion.div>

          <motion.div initial="hidden" whileInView="visible" viewport={{ once: true }} variants={staggerContainer} className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-8 relative">
            <div className="hidden lg:block absolute top-8 left-[8%] right-[8%] h-0.5 bg-white/10 z-0"></div>

            {[
              { icon: <User />, title: "Create Profile", desc: "Submit academic records & career interests" },
              { icon: <FileText />, title: "Assess Readiness", desc: "Evaluate GPA, IELTS/GRE, and eligibility scores" },
              { icon: <Map />, title: "Explore Destinations", desc: "Identify best-fit countries and courses" },
              { icon: <Users />, title: "Meet a Counselor", desc: "Connect with K-GEO or partner advisors" },
              { icon: <Briefcase />, title: "Apply to Universities", desc: "Complete applications & scholarship forms" },
              { icon: <Award />, title: "Track Offer & Visa", desc: "Securing your seat and departure prep" }
            ].map((step, i) => (
              <motion.div key={i} variants={fadeUp} className="relative z-10 flex flex-col items-center">
                <div className="w-16 h-16 rounded-full bg-[#1D4ED8] flex items-center justify-center mb-6 shadow-lg shadow-blue-900/50">
                  {step.icon}
                </div>
                <h4 className="font-bold text-sm mb-2">{step.title}</h4>
                <p className="text-xs text-[#8295b2] leading-relaxed">{step.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Final CTA */}
      <section id="contact" className="py-24 bg-white px-6">
        <div className="max-w-[1200px] mx-auto">
          <motion.div initial={{ opacity: 0, scale: 0.95 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ duration: 0.5 }} className="bg-[#1D4ED8] rounded-3xl p-12 lg:p-20 text-center text-white shadow-2xl shadow-blue-900/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full blur-3xl translate-x-1/2 -translate-y-1/2"></div>
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-white/10 rounded-full blur-3xl -translate-x-1/2 translate-y-1/2"></div>

            <div className="relative z-10">
              <h2 className="text-3xl lg:text-5xl font-extrabold mb-6">Start building your global education plan today.</h2>
              <p className="text-blue-100 text-lg mb-10 max-w-2xl mx-auto">
                Join Kumaraguru students who have embarked on their international academic journey with K-GEO guidance.
              </p>
              <div className="flex flex-wrap justify-center gap-4">
                <Link href="/register" className="h-14 px-8 inline-flex items-center justify-center font-bold text-white bg-transparent border-2 border-white/30 rounded-full hover:bg-white/10 transition-colors">
                  Book Consultation
                </Link>
                <Link href="/login" className="h-14 px-8 inline-flex items-center justify-center font-bold text-white bg-transparent border-2 border-white/30 rounded-full hover:bg-white/10 transition-colors">
                  Login
                </Link>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
