"use client";

import { PUBLIC_PROGRESS_METRICS } from "@/lib/public-progress";
import type { PublicProgressMetricKey } from "@/types";
import { motion, useReducedMotion, type Variants } from "framer-motion";
import {
  FileEdit,
  Send,
  Award,
  CheckCircle,
  Plane,
  GraduationCap,
} from "lucide-react";
import React from "react";

const icons: Record<PublicProgressMetricKey, React.ElementType> = {
  applications_initiated: FileEdit,
  applications_submitted: Send,
  offers_received: Award,
  confirmed_acceptance: CheckCircle,
  visa_approved: Plane,
  enrolled_overseas: GraduationCap,
};

// Route geometry in a 600×100 viewBox: one waypoint per 100 units, alternating
// high (text above) and low (text below) so the path winds gently.
const STEP_COUNT = PUBLIC_PROGRESS_METRICS.length;
const waypointY = (index: number) => (index % 2 === 0 ? 34 : 66);
const waypointX = (index: number) => index * 100 + 50;

const routePath = (() => {
  let d = `M ${waypointX(0)} ${waypointY(0)}`;
  for (let i = 1; i < STEP_COUNT; i++) {
    const [x1, y1, x2, y2] = [waypointX(i - 1), waypointY(i - 1), waypointX(i), waypointY(i)];
    d += ` C ${x1 + 50} ${y1} ${x2 - 50} ${y2} ${x2} ${y2}`;
  }
  return d;
})();

const numberFormat = new Intl.NumberFormat("en-IN");

const listVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15, delayChildren: 0.1 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } },
};

type Milestone = {
  key: PublicProgressMetricKey;
  label: string;
  value: string;
  Icon: React.ElementType;
  isDestination: boolean;
};

function MilestoneText({
  milestone,
  align = "center",
}: {
  milestone: Milestone;
  align?: "center" | "left";
}) {
  const { label, value, isDestination } = milestone;
  return (
    <div className={align === "center" ? "text-center" : "text-left"}>
      <div
        className={`text-3xl lg:text-4xl font-extrabold tracking-tight tabular-nums ${
          isDestination ? "text-[#1D4ED8]" : "text-[#0B1F3A]"
        }`}
      >
        {value}
      </div>
      <div className="mt-1 text-sm font-semibold text-[#64748B]">{label}</div>
    </div>
  );
}

function WaypointPin({ milestone }: { milestone: Milestone }) {
  const { Icon, isDestination } = milestone;
  return (
    <div
      className={`flex size-12 items-center justify-center rounded-full text-white ring-4 ring-white ${
        isDestination ? "bg-[#1D4ED8]" : "bg-[#0B1F3A]"
      }`}
    >
      <Icon size={20} strokeWidth={2} aria-hidden="true" />
    </div>
  );
}

export function PublicProgressFunnel({
  values,
  ariaLabel = "K-GEO student progress",
}: {
  values: Record<PublicProgressMetricKey, number | null>;
  ariaLabel?: string;
}) {
  const reduceMotion = useReducedMotion();
  const initial = reduceMotion ? "visible" : "hidden";

  const milestones: Milestone[] = PUBLIC_PROGRESS_METRICS.map((metric, index) => {
    const raw = values[metric.key];
    return {
      key: metric.key,
      label: metric.label,
      value: raw === null || raw === undefined ? "—" : numberFormat.format(raw),
      Icon: icons[metric.key],
      isDestination: index === STEP_COUNT - 1,
    };
  });

  return (
    <div className="@container w-full">
      {/* Wide layout: a winding route with milestones alternating above and below */}
      <div className="relative hidden @4xl:block">
        <motion.div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 h-28 -translate-y-1/2"
          initial={initial}
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
        >
          <svg
            viewBox="0 0 600 100"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <defs>
              <linearGradient id="kgeo-route-gradient" x1="0" x2="1" y1="0" y2="0">
                <stop offset="0%" stopColor="#93C5FD" />
                <stop offset="100%" stopColor="#1D4ED8" />
              </linearGradient>
              {/* Draw the route in once, left to right */}
              <clipPath id="kgeo-route-reveal">
                <motion.rect
                  x={0}
                  y={-20}
                  height={140}
                  variants={{
                    hidden: { width: 0 },
                    visible: {
                      width: 600,
                      transition: { duration: 1.6, ease: "easeInOut" },
                    },
                  }}
                />
              </clipPath>
            </defs>
            <path
              d={routePath}
              fill="none"
              stroke="#E2E8F0"
              strokeWidth={2}
              strokeDasharray="4 6"
              vectorEffect="non-scaling-stroke"
            />
            <path
              d={routePath}
              fill="none"
              stroke="url(#kgeo-route-gradient)"
              strokeWidth={2}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              clipPath="url(#kgeo-route-reveal)"
            />
          </svg>
        </motion.div>

        <motion.ol
          aria-label={ariaLabel}
          className="relative grid grid-cols-6"
          initial={initial}
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={listVariants}
        >
          {milestones.map((milestone, index) => {
            const above = index % 2 === 0;
            return (
              <motion.li
                key={milestone.key}
                variants={itemVariants}
                className="relative grid grid-rows-[1fr_7rem_1fr] px-3"
              >
                <div className={above ? "row-start-1 self-end pb-4" : "row-start-3 self-start pt-4"}>
                  <MilestoneText milestone={milestone} />
                </div>
                <div
                  className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
                  style={{
                    // Sit the pin on the route, which spans the middle 7rem track.
                    top: `calc(50% - 3.5rem + ${waypointY(index) / 100} * 7rem)`,
                  }}
                >
                  <WaypointPin milestone={milestone} />
                </div>
              </motion.li>
            );
          })}
        </motion.ol>
      </div>

      {/* Narrow layout: a vertical trail */}
      <motion.ol
        aria-label={ariaLabel}
        className="relative flex flex-col gap-8 @4xl:hidden"
        initial={initial}
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        variants={listVariants}
      >
        <span
          aria-hidden="true"
          className="absolute left-6 top-6 bottom-6 w-0.5 -translate-x-1/2 bg-gradient-to-b from-blue-200 to-[#1D4ED8]"
        />
        {milestones.map((milestone) => (
          <motion.li
            key={milestone.key}
            variants={itemVariants}
            className="relative flex items-center gap-5"
          >
            <div className="relative shrink-0">
              <WaypointPin milestone={milestone} />
            </div>
            <MilestoneText milestone={milestone} align="left" />
          </motion.li>
        ))}
      </motion.ol>
    </div>
  );
}
