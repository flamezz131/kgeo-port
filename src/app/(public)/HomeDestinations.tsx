"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  AnimatePresence,
  animate,
  motion,
  useInView,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { ChevronDown, Globe2, GraduationCap } from "lucide-react";
import {
  PARTNER_COUNTRIES,
  PARTNER_UNIVERSITY_COUNT,
  getPartnerUniversities,
  partnerUniversityLabel,
} from "@/lib/partner-universities";
import { PartnerWorldMap } from "./PartnerWorldMap";

const EASE = [0.22, 1, 0.36, 1] as const;

const FEATURED_DESTINATIONS = [
  {
    name: "USA",
    country: "United States of America",
    img: "https://images.unsplash.com/photo-1550850839-8dc894ed385a?auto=format&fit=crop&q=80&w=600",
  },
  {
    name: "United Kingdom",
    country: "United Kingdom",
    img: "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?auto=format&fit=crop&q=80&w=600",
  },
  {
    name: "Germany",
    country: "Germany",
    img: "https://images.unsplash.com/photo-1467269204594-9661b134dd2b?auto=format&fit=crop&q=80&w=600",
  },
  {
    name: "Malaysia",
    country: "Malaysia",
    img: "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?auto=format&fit=crop&q=80&w=600",
  },
  {
    name: "Australia",
    country: "Australia",
    img: "https://images.unsplash.com/photo-1523482580672-f109ba8cb9be?auto=format&fit=crop&q=80&w=600",
  },
] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const cardGrid: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const destinationCard: Variants = {
  hidden: { opacity: 0, y: 36 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.65,
      ease: EASE,
      // The university names follow the card in, one after another.
      delayChildren: 0.25,
      staggerChildren: 0.08,
    },
  },
};

const universityLine: Variants = {
  hidden: { opacity: 0, x: -14 },
  visible: { opacity: 1, x: 0, transition: { duration: 0.45, ease: EASE } },
};

/** Counts up to `value` the first time it scrolls into view. */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node || !inView || reduceMotion) return;
    const controls = animate(0, value, {
      duration: 1.4,
      ease: EASE,
      onUpdate: (latest) => {
        node.textContent = String(Math.round(latest));
      },
    });
    return () => controls.stop();
  }, [inView, reduceMotion, value]);

  // Rendered with the final figure so it is correct before and without script.
  return (
    <span className="tabular-nums" ref={ref}>
      {value}
    </span>
  );
}

export function HomeDestinations() {
  const reduceMotion = useReducedMotion();
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const directoryId = useId();


  return (
    <section id="destinations" className="py-24 bg-[#F8FAFC] px-6">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="mb-12"
        >
          <h2 className="text-3xl font-extrabold text-[#0B1F3A] mb-2">
            Explore Top Destinations
          </h2>
          <p className="text-[#64748B]">
            Preferred academic hubs for Kumaraguru alumni
          </p>
        </motion.div>

        {/* Featured destinations, each with its partner universities */}
        <motion.ul
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={cardGrid}
          className="grid sm:grid-cols-2 lg:grid-cols-5 gap-6"
        >
          {FEATURED_DESTINATIONS.map((destination) => {
            const universities = getPartnerUniversities(destination.country);
            return (
              <motion.li
                key={destination.name}
                variants={destinationCard}
                whileHover={reduceMotion ? undefined : { y: -8 }}
                transition={{ type: "spring", stiffness: 260, damping: 22 }}
                className="group relative flex min-h-[380px] flex-col justify-end overflow-hidden rounded-2xl shadow-lg transition-shadow duration-500 hover:shadow-2xl hover:shadow-blue-900/25 lg:min-h-[440px]"
              >
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-[1200ms] ease-out group-hover:scale-110"
                  style={{ backgroundImage: `url(${destination.img})` }}
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-[#0B1F3A] via-[#0B1F3A]/85 to-[#0B1F3A]/10"
                />

                <div className="relative p-6">
                  <h3 className="text-xl font-bold text-white">
                    {destination.name}
                  </h3>
                  <p className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/15 px-3 py-1 text-[0.7rem] font-bold uppercase tracking-wide text-white backdrop-blur-md">
                    <GraduationCap aria-hidden="true" size={14} />
                    {partnerUniversityLabel(universities.length)}
                  </p>

                  <ul className="mt-3 grid gap-2 border-t border-white/20 pt-3">
                    {universities.map((university) => (
                      <motion.li
                        key={university}
                        variants={universityLine}
                        className="flex gap-2 text-[0.8rem] font-medium leading-snug text-white"
                      >
                        <span
                          aria-hidden="true"
                          className="mt-[0.45rem] size-1.5 shrink-0 rounded-full bg-[#60A5FA] transition-transform duration-300 group-hover:scale-150"
                        />
                        {university}
                      </motion.li>
                    ))}
                  </ul>
                </div>
              </motion.li>
            );
          })}
        </motion.ul>

        {/* Every partner university, by country. Collapsed until opened. */}
        <div className="mt-12" id="partners">
          <div className="flex justify-center">
            <button
              aria-controls={directoryId}
              aria-expanded={directoryOpen}
              className="inline-flex min-h-12 items-center gap-3 rounded-full border border-[#BFDBFE] bg-white px-6 py-2.5 text-sm font-bold text-[#0B1F3A] shadow-[0_4px_16px_rgb(29_78_216/0.08)] transition-all duration-300 hover:-translate-y-0.5 hover:border-[#1D4ED8] hover:shadow-[0_10px_26px_rgb(29_78_216/0.18)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8]"
              onClick={() => setDirectoryOpen((isOpen) => !isOpen)}
              type="button"
            >
              <Globe2 aria-hidden="true" className="shrink-0 text-[#1D4ED8]" size={18} />
              <span className="font-bold">
                {directoryOpen
                  ? "Hide partner universities"
                  : `View all ${PARTNER_UNIVERSITY_COUNT} partner universities`}
              </span>
              <motion.span
                animate={{ rotate: directoryOpen ? 180 : 0 }}
                aria-hidden="true"
                className="grid size-6 shrink-0 place-items-center rounded-full bg-[#EFF6FF] text-[#1D4ED8]"
                transition={{ duration: reduceMotion ? 0 : 0.35, ease: EASE }}
              >
                <ChevronDown size={16} />
              </motion.span>
            </button>
          </div>

          <AnimatePresence initial={false}>
            {directoryOpen && (
              <motion.div
                animate={{ height: "auto", opacity: 1 }}
                className="overflow-hidden"
                exit={{ height: 0, opacity: 0 }}
                id={directoryId}
                initial={{ height: 0, opacity: 0 }}
                key="partner-directory"
                transition={{ duration: reduceMotion ? 0 : 0.55, ease: EASE }}
              >
                {/* Inner padding keeps card shadows inside the clipped panel. */}
                <div className="px-1 pb-8 pt-12">
                  <motion.div
                    initial="hidden"
                    animate="visible"
                    variants={fadeUp}
                    className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between"
                  >
                    <div>
                      <span className="inline-flex items-center gap-2 rounded-full bg-[#EFF6FF] px-3 py-1 text-[0.7rem] font-bold uppercase tracking-[0.12em] text-[#1D4ED8]">
                        <Globe2 aria-hidden="true" size={14} />
                        Global partner network
                      </span>
                      <h3 className="mt-3 text-2xl font-extrabold text-[#0B1F3A]">
                        Our partner universities
                      </h3>
                      <p className="mt-2 max-w-xl text-[#64748B]">
                        Institutions that work with Kumaraguru on student pathways,
                        exchanges and higher studies.
                      </p>
                    </div>

                    <div className="flex gap-10">
                      <p>
                        <span className="block text-4xl font-extrabold text-[#1D4ED8]">
                          <CountUp value={PARTNER_UNIVERSITY_COUNT} />
                        </span>
                        <span className="mt-1 block text-sm font-semibold text-[#475569]">
                          Partner universities
                        </span>
                      </p>
                      <p>
                        <span className="block text-4xl font-extrabold text-[#1D4ED8]">
                          <CountUp value={PARTNER_COUNTRIES.length} />
                        </span>
                        <span className="mt-1 block text-sm font-semibold text-[#475569]">
                          Countries
                        </span>
                      </p>
                    </div>
                  </motion.div>

                  <div className="mt-8">
                    <PartnerWorldMap />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
