"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { Pause, Play } from "lucide-react";

/** How long each photo stays before the next one fades in. */
const SLIDE_DURATION_MS = 5000;

/**
 * Photos live in public/carousel and are served exactly as saved there, so
 * keep them web-sized. `focus` keeps the people in frame: phones crop the
 * sides hard, desktops only slightly.
 */
const SLIDES = [
  {
    src: "/carousel/hero-1.jpg",
    label: "A counselling session at the K-GEO office",
    focus: "object-[50%_50%] lg:object-[35%_50%]",
  },
  {
    src: "/carousel/hero-2.webp",
    label: "Students working together in the K-GEO lounge",
    focus: "object-[36%_50%] lg:object-[30%_50%]",
  },
  {
    src: "/carousel/hero-3.webp",
    label: "Students planning their applications at K-GEO",
    focus: "object-[68%_50%] lg:object-[72%_50%]",
  },
] as const;

/**
 * Photo backdrop for the home hero: cross-fades every five seconds with a slow
 * drift. Rendered behind the hero text, so the photos are decorative and the
 * controls carry the accessible names.
 */
export function HeroCarousel() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  // False for the first paint: only the first photo is requested up front and
  // its drift starts from rest.
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setStarted(true));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!playing) return;
    const timer = window.setTimeout(
      () => setIndex((current) => (current + 1) % SLIDES.length),
      SLIDE_DURATION_MS,
    );
    return () => window.clearTimeout(timer);
  }, [index, playing]);

  return (
    <>
      <div
        aria-hidden="true"
        className="absolute inset-0 z-0 lg:left-[28%] lg:[mask-image:linear-gradient(to_right,transparent,black_42%)]"
      >
        {SLIDES.map((slide, slideIndex) => {
          const active = slideIndex === index;
          if (slideIndex !== 0 && !started) return null;
          return (
            <Image
              key={slide.src}
              src={slide.src}
              alt=""
              fill
              sizes="(min-width: 1024px) 72vw, 100vw"
              preload={slideIndex === 0}
              className={`object-cover transition-[opacity,scale] duration-[1200ms,7000ms] ease-[ease,linear] motion-reduce:scale-100 motion-reduce:duration-700 ${slide.focus} ${
                active ? "opacity-100" : "opacity-0"
              } ${active && started ? "scale-[1.06]" : "scale-100"}`}
            />
          );
        })}
      </div>

      <div
        role="group"
        aria-label="Background photos"
        className="absolute bottom-5 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-full border border-white/70 bg-white/70 px-2 py-1 shadow-[0_8px_24px_rgba(11,31,58,0.08)] backdrop-blur-md lg:bottom-8 lg:left-auto lg:right-10 lg:translate-x-0"
      >
        {SLIDES.map((slide, slideIndex) => {
          const active = slideIndex === index;
          return (
            <button
              key={slide.src}
              type="button"
              onClick={() => setIndex(slideIndex)}
              aria-label={`Photo ${slideIndex + 1} of ${SLIDES.length}: ${slide.label}`}
              aria-current={active ? "true" : undefined}
              className="group grid h-6 min-w-6 place-items-center rounded-full px-1 outline-none focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
            >
              <span
                className={`relative block h-1.5 overflow-hidden rounded-full transition-[width,background-color] duration-500 ease-out motion-reduce:transition-none ${
                  active
                    ? "w-8 bg-[#0B1F3A]/20"
                    : "w-1.5 bg-[#0B1F3A]/35 group-hover:bg-[#0B1F3A]/60"
                }`}
              >
                {active && (
                  <span
                    // Restart the fill whenever the photo or play state changes.
                    key={`${index}-${playing}`}
                    className={`absolute inset-0 origin-left rounded-full bg-[#1D4ED8] ${
                      playing
                        ? "animate-[hero-carousel-progress_5s_linear_forwards] motion-reduce:animate-none"
                        : ""
                    }`}
                  />
                )}
              </span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setPlaying((current) => !current)}
          aria-label={playing ? "Pause background photos" : "Play background photos"}
          className="grid size-6 place-items-center rounded-full text-[#0B1F3A] outline-none transition-colors hover:bg-[#0B1F3A]/10 focus-visible:ring-2 focus-visible:ring-[#1D4ED8]"
        >
          {playing ? <Pause size={12} /> : <Play size={12} />}
        </button>
      </div>
    </>
  );
}
