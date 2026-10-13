"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Variants,
} from "framer-motion";
import { Award, ChevronRight, GraduationCap, MapPin } from "lucide-react";
import { ALUMNI_STORIES, type AlumniStory } from "@/lib/alumni-stories";

const EASE = [0.22, 1, 0.36, 1] as const;

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

const listContainer: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

function destinationLine(story: AlumniStory): string {
  const place = `${story.university}, ${story.country}`;
  return story.program ? `${story.program} | ${place}` : place;
}

function storyFacts(story: AlumniStory): Array<{ label: string; value: string }> {
  return [
    { label: "University", value: story.university },
    { label: "Country", value: story.country },
    ...(story.program ? [{ label: "Programme", value: story.program }] : []),
    { label: "Intake", value: story.intake },
    ...(story.batch ? [{ label: "Batch", value: story.batch }] : []),
  ];
}

export function HomeSuccessStories() {
  const reduceMotion = useReducedMotion();
  const [activeSlug, setActiveSlug] = useState(ALUMNI_STORIES[0].slug);
  const featureRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  // Which edges of the scrolling list have more students beyond them.
  const [listFade, setListFade] = useState({ top: false, bottom: false });

  const updateListFade = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const top = list.scrollTop > 4;
    const bottom = list.scrollTop + list.clientHeight < list.scrollHeight - 4;
    setListFade((current) =>
      current.top === top && current.bottom === bottom
        ? current
        : { top, bottom },
    );
  }, []);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    // The list is as tall as the featured card, which changes per student.
    const observer = new ResizeObserver(updateListFade);
    observer.observe(list);
    return () => observer.disconnect();
  }, [updateListFade]);
  const active =
    ALUMNI_STORIES.find((story) => story.slug === activeSlug) ??
    ALUMNI_STORIES[0];

  function selectStory(slug: string) {
    setActiveSlug(slug);
    // On narrow screens the large card sits above the list, so bring it back
    // into view when a name is chosen further down.
    const card = featureRef.current;
    if (!card) return;
    const bounds = card.getBoundingClientRect();
    if (bounds.top < 96 || bounds.bottom > window.innerHeight) {
      card.scrollIntoView({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "center",
      });
    }
  }

  return (
    <section id="success" className="py-24 bg-white px-6">
      <div className="max-w-[1400px] mx-auto">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={fadeUp}
          className="text-center mb-16"
        >
          <h2 className="text-3xl font-extrabold text-[#0B1F3A] mb-2">
            Alumni Success Stories
          </h2>
          <p className="text-[#64748B]">
            Inspiring journeys from our campus to the world
          </p>
        </motion.div>

        <div className="grid lg:grid-cols-5 gap-6">
          {/* Featured student */}
          <motion.div
            aria-live="polite"
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, ease: EASE }}
            className="lg:col-span-3 flex scroll-mt-28 items-center overflow-hidden rounded-3xl border border-[#E2E8F0] bg-white p-8 shadow-xl shadow-blue-900/5"
            ref={featureRef}
          >
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full flex-col items-center gap-8 md:flex-row"
                exit={{ opacity: 0, y: -14 }}
                initial={{ opacity: 0, y: 14 }}
                key={active.slug}
                transition={{ duration: reduceMotion ? 0 : 0.32, ease: EASE }}
              >
                <motion.div
                  animate={{ scale: 1 }}
                  className="aspect-square w-full max-w-[19rem] shrink-0 overflow-hidden rounded-2xl bg-[#E2E8F0] md:w-2/5"
                  initial={{ scale: reduceMotion ? 1 : 1.06 }}
                  transition={{ duration: reduceMotion ? 0 : 0.7, ease: EASE }}
                >
                  <Image
                    alt={`Portrait of ${active.name}`}
                    className="size-full object-cover"
                    height={521}
                    src={`/alumni/${active.slug}.jpg`}
                    width={521}
                  />
                </motion.div>

                <div className="min-w-0 flex-1">
                  <div className="mb-4 flex flex-wrap gap-2">
                    {active.scholarship && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ECFDF5] px-3 py-1 text-xs font-bold text-[#047857]">
                        <Award aria-hidden="true" size={14} />
                        {active.scholarship}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-bold text-[#1D4ED8]">
                      <MapPin aria-hidden="true" size={14} />
                      {active.country}
                    </span>
                  </div>

                  <h3 className="mb-1 !text-2xl font-extrabold text-[#0B1F3A]">
                    {active.name}
                  </h3>
                  <p className="mb-6 text-sm font-semibold text-[#64748B]">
                    {destinationLine(active)}
                  </p>

                  <dl className="mb-6 grid gap-x-8 gap-y-4 sm:grid-cols-2">
                    {storyFacts(active).map((fact) => (
                      <div key={fact.label}>
                        <dt className="text-xs font-bold uppercase tracking-wider text-[#64748B]">
                          {fact.label}
                        </dt>
                        <dd className="mt-0.5 font-semibold text-[#0F172A]">
                          {fact.value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  <p className="flex items-start gap-2 border-t border-[#E2E8F0] pt-4 text-xs font-bold uppercase tracking-wider text-[#64748B]">
                    <GraduationCap
                      aria-hidden="true"
                      className="mt-px shrink-0 text-[#1D4ED8]"
                      size={16}
                    />
                    <span>Kumaraguru: {active.degree}</span>
                  </p>
                </div>
              </motion.div>
            </AnimatePresence>
          </motion.div>

          {/* All students: choose one to feature. On large screens this column
              takes no height of its own, so the featured card sets the row
              height and the list scrolls inside it. */}
          <div className="relative -m-1 lg:col-span-2">
            <motion.ul
              aria-label="Choose a student to feature"
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              variants={listContainer}
              className="flex max-h-[22rem] flex-col gap-3 overflow-y-auto p-1 pr-2 [scrollbar-color:#CBD5E1_transparent] [scrollbar-width:thin] lg:absolute lg:inset-0 lg:max-h-none"
              onScroll={updateListFade}
              ref={listRef}
            >
              {ALUMNI_STORIES.map((story) => {
                const selected = story.slug === active.slug;
                return (
                  <motion.li key={story.slug} variants={fadeUp}>
                    <button
                      aria-pressed={selected}
                      className={`group relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-[border-color,box-shadow] duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${
                        selected
                          ? "border-[#1D4ED8] shadow-lg shadow-blue-900/10"
                          : "border-[#E2E8F0] hover:border-[#93C5FD] hover:shadow-lg"
                      }`}
                      onClick={() => selectStory(story.slug)}
                      type="button"
                    >
                      {selected && (
                        <motion.span
                          aria-hidden="true"
                          className="absolute inset-0 rounded-2xl bg-[#EFF6FF]"
                          layoutId="alumni-active-card"
                          transition={{
                            type: "spring",
                            stiffness: 380,
                            damping: 34,
                          }}
                        />
                      )}
                      <Image
                        alt=""
                        className="relative size-14 shrink-0 rounded-full object-cover ring-2 ring-white"
                        height={160}
                        src={`/alumni/${story.slug}-avatar.jpg`}
                        width={160}
                      />
                      <span className="relative min-w-0 flex-1">
                        <span className="block text-sm font-bold text-[#0B1F3A]">
                          {story.name}
                        </span>
                        <span className="my-1 block text-xs text-[#64748B]">
                          {destinationLine(story)}
                        </span>
                        <span className="block text-xs font-bold text-[#1D4ED8]">
                          {story.scholarship ?? story.intake}
                        </span>
                      </span>
                      <ChevronRight
                        aria-hidden="true"
                        className={`relative shrink-0 transition-all duration-300 ${
                          selected
                            ? "translate-x-0 text-[#1D4ED8]"
                            : "-translate-x-1 text-[#94A3B8] group-hover:translate-x-0 group-hover:text-[#1D4ED8]"
                        }`}
                        size={18}
                      />
                    </button>
                  </motion.li>
                );
              })}
            </motion.ul>
            {/* Soft fades that show there are more students above or below. */}
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-1 top-1 h-10 bg-gradient-to-b from-white to-transparent transition-opacity duration-300 ${
                listFade.top ? "opacity-100" : "opacity-0"
              }`}
            />
            <div
              aria-hidden="true"
              className={`pointer-events-none absolute inset-x-1 bottom-1 h-10 bg-gradient-to-t from-white to-transparent transition-opacity duration-300 ${
                listFade.bottom ? "opacity-100" : "opacity-0"
              }`}
            />
          </div>
        </div>
      </div>
    </section>
  );
}
