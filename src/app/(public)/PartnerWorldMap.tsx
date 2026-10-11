"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GraduationCap } from "lucide-react";
import {
  PARTNER_COUNTRIES,
  partnerUniversityLabel,
  type PartnerCountry,
} from "@/lib/partner-universities";
import { WORLD_MAP_ASPECT_RATIO, projectToWorldMap } from "@/lib/world-map";

const EASE = [0.22, 1, 0.36, 1] as const;

const MARKERS = PARTNER_COUNTRIES.map((entry) => ({
  entry,
  position: projectToWorldMap(entry.lat, entry.lon),
}));

type Marker = (typeof MARKERS)[number];

// Size and offsets of the floating card, in pixels. The width matches w-64.
const CARD_WIDTH = 256;
const CARD_GAP_X = 16;
const CARD_SHIFT_Y = 14;

function estimateCardHeight(marker: Marker): number {
  return 112 + marker.entry.universities.length * 32;
}

type CardPlacement = { left: boolean; vertical: "down" | "middle" | "up" };

/**
 * Picks where the card opens around its marker: the position that stays
 * inside the map and hides the fewest other markers.
 */
function chooseCardPlacement(
  map: HTMLElement | null,
  target: Marker,
): CardPlacement {
  const fallback: CardPlacement = {
    left: target.position.x > 50,
    vertical: target.position.y > 55 ? "up" : "down",
  };
  if (!map) return fallback;
  const { width, height } = map.getBoundingClientRect();
  if (!width || !height) return fallback;

  const toPixels = (marker: Marker) => ({
    x: (marker.position.x / 100) * width,
    y: (marker.position.y / 100) * height,
  });
  const origin = toPixels(target);
  const cardHeight = estimateCardHeight(target);
  let best = fallback;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const vertical of ["down", "middle", "up"] as const) {
    for (const left of [false, true]) {
      const x0 = left
        ? origin.x - CARD_GAP_X - CARD_WIDTH
        : origin.x + CARD_GAP_X;
      const y0 =
        vertical === "down"
          ? origin.y - CARD_SHIFT_Y
          : vertical === "middle"
            ? origin.y - cardHeight / 2
            : origin.y + CARD_SHIFT_Y - cardHeight;
      const overflow =
        Math.max(0, -x0) +
        Math.max(0, x0 + CARD_WIDTH - width) +
        Math.max(0, -y0) +
        Math.max(0, y0 + cardHeight - height);
      const hidden = MARKERS.filter((marker) => {
        if (marker === target) return false;
        const point = toPixels(marker);
        return (
          point.x >= x0 - 8 &&
          point.x <= x0 + CARD_WIDTH + 8 &&
          point.y >= y0 - 8 &&
          point.y <= y0 + cardHeight + 8
        );
      }).length;
      // Leaving the map is far worse than covering a neighbouring marker.
      const score = hidden + (overflow > 0 ? 100 + overflow : 0);
      if (score < bestScore) {
        bestScore = score;
        best = { left, vertical };
      }
    }
  }
  return best;
}

function CountryDetail({ entry }: { entry: PartnerCountry }) {
  return (
    <>
      <p className="text-[0.65rem] font-bold uppercase tracking-[0.12em] text-[#64748B]">
        {entry.region}
      </p>
      <p className="mt-0.5 text-base font-bold text-[#0B1F3A]">
        {entry.country}
      </p>
      <p className="mt-0.5 text-xs font-semibold text-[#1D4ED8]">
        {partnerUniversityLabel(entry.universities.length)}
      </p>
      <ul className="mt-3 grid gap-2 border-t border-[#E2E8F0] pt-3">
        {entry.universities.map((university) => (
          <li
            className="flex gap-2 text-sm leading-snug text-[#334155]"
            key={university}
          >
            <GraduationCap
              aria-hidden="true"
              className="mt-0.5 shrink-0 text-[#1D4ED8]"
              size={15}
            />
            {university}
          </li>
        ))}
      </ul>
    </>
  );
}

export function PartnerWorldMap() {
  const reduceMotion = useReducedMotion();
  const mapRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<
    ({ country: string } & CardPlacement) | null
  >(null);
  const activeCountry = selection?.country ?? null;
  const active =
    MARKERS.find((marker) => marker.entry.country === activeCountry) ?? null;

  function activate(marker: Marker) {
    setSelection((current) =>
      current?.country === marker.entry.country
        ? current
        : {
            country: marker.entry.country,
            ...chooseCardPlacement(mapRef.current, marker),
          },
    );
  }

  useEffect(() => {
    if (!activeCountry) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [activeCountry]);

  const opensLeft = selection?.left ?? false;
  const vertical = selection?.vertical ?? "down";

  return (
    <div>
      <div className="rounded-3xl border border-[#E2E8F0] bg-white p-3 shadow-[0_1px_3px_rgb(15_23_42/0.05)] sm:p-6">
        <div
          className="relative"
          // Hovering or tapping a marker selects it; leaving the map, or
          // tapping its empty background, clears the selection.
          onClick={(event) => {
            if (event.target === event.currentTarget) setSelection(null);
          }}
          onMouseLeave={() => setSelection(null)}
          ref={mapRef}
          style={{ aspectRatio: WORLD_MAP_ASPECT_RATIO }}
        >
          <Image
            alt=""
            className="pointer-events-none select-none"
            fill
            sizes="(min-width: 1400px) 1350px, 100vw"
            src="/world-map-dots.svg"
          />

          {MARKERS.map((marker, index) => {
            const { entry, position } = marker;
            const selected = entry.country === activeCountry;
            return (
              <motion.button
                animate={{ opacity: 1, scale: 1 }}
                aria-label={`${entry.country}: ${partnerUniversityLabel(entry.universities.length)}`}
                aria-pressed={selected}
                className={`group absolute grid size-3 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] lg:size-4 ${
                  selected ? "z-20" : "z-10 hover:z-20"
                }`}
                initial={{ opacity: 0, scale: 0 }}
                key={entry.country}
                onClick={() => activate(marker)}
                onFocus={() => activate(marker)}
                onMouseEnter={() => activate(marker)}
                style={{ left: `${position.x}%`, top: `${position.y}%` }}
                transition={{
                  duration: reduceMotion ? 0 : 0.4,
                  ease: EASE,
                  delay: reduceMotion ? 0 : 0.25 + index * 0.03,
                }}
                type="button"
              >
                {selected && (
                  // The halo grows well past the marker, so it must not catch
                  // the pointer: neighbouring markers sit only a few pixels away.
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute size-full animate-ping rounded-full bg-[#1D4ED8]/45 motion-reduce:hidden"
                  />
                )}
                <span
                  aria-hidden="true"
                  className={`relative rounded-full shadow-[0_1px_4px_rgb(11_31_58/0.35)] ring-1 ring-white transition-all duration-300 sm:ring-2 ${
                    selected
                      ? "size-2.5 bg-[#0B1F3A] lg:size-3.5"
                      : "size-1.5 bg-[#1D4ED8] group-hover:bg-[#0B1F3A] sm:size-2 lg:size-2.5"
                  }`}
                />
              </motion.button>
            );
          })}

          {/* Floating card beside the marker (large screens) */}
          <AnimatePresence>
            {active && (
              <div
                className="pointer-events-none absolute z-30 hidden w-64 xl:block"
                key={active.entry.country}
                style={{
                  left: `${active.position.x}%`,
                  top: `${active.position.y}%`,
                  translate: `${
                    opensLeft
                      ? `calc(-100% - ${CARD_GAP_X}px)`
                      : `${CARD_GAP_X}px`
                  } ${
                    vertical === "down"
                      ? `-${CARD_SHIFT_Y}px`
                      : vertical === "middle"
                        ? "-50%"
                        : `calc(-100% + ${CARD_SHIFT_Y}px)`
                  }`,
                }}
              >
                <motion.div
                  animate={{ opacity: 1, scale: 1 }}
                  className="rounded-2xl border border-[#E2E8F0] bg-white p-4 shadow-[0_18px_40px_-12px_rgb(11_31_58/0.28)]"
                  exit={{ opacity: 0, scale: 0.96 }}
                  initial={{ opacity: 0, scale: 0.94 }}
                  style={{
                    transformOrigin: `${opensLeft ? "right" : "left"} ${
                      vertical === "down"
                        ? "top"
                        : vertical === "middle"
                          ? "center"
                          : "bottom"
                    }`,
                  }}
                  transition={{ duration: reduceMotion ? 0 : 0.2, ease: EASE }}
                >
                  <CountryDetail entry={active.entry} />
                </motion.div>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Same details below the map on smaller screens, where a floating card would not fit */}
      <div
        aria-live="polite"
        className="mt-4 rounded-2xl border border-[#E2E8F0] bg-white p-4 xl:hidden"
      >
        {active ? (
          <CountryDetail entry={active.entry} />
        ) : (
          <p className="text-sm text-[#64748B]">
            Select a marker or a country below to see its partner universities.
          </p>
        )}
      </div>

      <p className="mt-5 hidden text-sm text-[#64748B] xl:block">
        Hover over a marker, or choose a country, to see its partner
        universities.
      </p>

      <ul className="mt-3 flex flex-wrap gap-2">
        {MARKERS.map((marker) => {
          const { entry } = marker;
          const selected = entry.country === activeCountry;
          return (
            <li key={entry.country}>
              <button
                aria-pressed={selected}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1D4ED8] ${
                  selected
                    ? "border-[#1D4ED8] bg-[#1D4ED8] text-white"
                    : "border-[#E2E8F0] bg-white text-[#475569] hover:border-[#93C5FD] hover:text-[#0B1F3A]"
                }`}
                onClick={() => activate(marker)}
                onFocus={() => activate(marker)}
                onMouseEnter={() => activate(marker)}
                type="button"
              >
                {entry.country}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
