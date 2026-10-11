"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/** Scrolling less than this many pixels in one direction is ignored. */
const SCROLL_TOLERANCE = 8;
/** The bar never hides this close to the top of the page. */
const ALWAYS_VISIBLE_ABOVE = 96;

/**
 * Fixed bar that slides out of view while the page scrolls down and slides
 * back as soon as it scrolls up.
 *
 * It stays visible while something inside it is open (a menu with
 * aria-expanded="true") or holds keyboard focus, so it never disappears from
 * under someone who is using it.
 */
export function HideOnScroll({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let lastY = Math.max(window.scrollY, 0);
    let frame = 0;

    const update = () => {
      frame = 0;
      // Clamp: mobile browsers report negative positions while overscrolling.
      const y = Math.max(window.scrollY, 0);
      const delta = y - lastY;
      if (Math.abs(delta) < SCROLL_TOLERANCE) return;
      lastY = y;

      const container = containerRef.current;
      const inUse =
        container !== null &&
        container.querySelector('[aria-expanded="true"], :focus-visible') !==
          null;
      setHidden(delta > 0 && y > ALWAYS_VISIBLE_ABOVE && !inUse);
    };

    const onScroll = () => {
      if (frame === 0) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div
      className={`transition-transform duration-300 ease-out will-change-transform motion-reduce:transition-none ${
        hidden ? "-translate-y-full" : "translate-y-0"
      } ${className}`}
      // Tabbing into the bar while it is off screen brings it back.
      onFocus={() => setHidden(false)}
      ref={containerRef}
    >
      {children}
    </div>
  );
}
