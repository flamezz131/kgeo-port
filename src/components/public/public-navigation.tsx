"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";

const navItems = [
  { name: "Home", href: "/" },
  { name: "About", href: "/#kgeo-progress" },
  { name: "Destinations", href: "/#destinations" },
  { name: "Success Stories", href: "/#success" },
];

/**
 * Scrolls to the section a home-page link names. The router does nothing when
 * the address already ends in that section, so a second click on the same
 * link would otherwise leave the page where it is.
 */
function scrollToHomeSection(href: string, pathname: string) {
  const sectionId = href.split("#")[1];
  if (!sectionId || pathname !== "/") return;
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  document
    .getElementById(sectionId)
    ?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth" });
}

/** A link to a home-page section that scrolls every time it is clicked. */
export function HomeSectionLink({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className?: string;
  href: string;
}) {
  const pathname = usePathname();
  return (
    <Link
      className={className}
      href={href}
      onClick={() => scrollToHomeSection(href, pathname)}
    >
      {children}
    </Link>
  );
}

export function PublicNavigation() {
  const [activeTab, setActiveTab] = useState("Home");
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="hidden lg:flex items-center p-1.5 rounded-full bg-white/40 backdrop-blur-md border border-white/60 shadow-[0_4px_32px_rgba(0,0,0,0.04)]">
      {navItems.map((item) => (
        <Link
          key={item.name}
          href={item.href}
          onClick={() => {
            setActiveTab(item.name);
            scrollToHomeSection(item.href, pathname);
          }}
          className={`relative px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300 hover:-translate-y-[1px] ${
            activeTab === item.name ? "text-[#1D4ED8]" : "text-[#475569] hover:text-[#0F172A]"
          }`}
        >
          {activeTab === item.name && (
            <motion.div
              layoutId="nav-pill"
              className="absolute inset-0 bg-white rounded-full shadow-sm border border-white/80 z-[-1]"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span className="relative z-10">{item.name}</span>
        </Link>
      ))}
    </nav>
  );
}

/** Compact menu for screens where the main navigation is hidden. */
export function PublicMobileMenu() {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="inline-flex size-11 items-center justify-center rounded-full border border-white/60 bg-white/60 text-[#0B1F3A] shadow-[0_4px_16px_rgba(0,0,0,0.05)] backdrop-blur-md"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {open ? <X size={20} /> : <Menu size={20} />}
      </button>
      {open && (
        <nav
          aria-label="Main navigation"
          className="absolute inset-x-4 top-[calc(100%+0.5rem)] rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-[0_16px_40px_rgba(11,31,58,0.14)]"
          id={panelId}
        >
          <ul className="grid gap-1">
            {navItems.map((item) => (
              <li key={item.name}>
                <Link
                  className="block rounded-xl px-4 py-3 text-sm font-semibold text-[#334155] hover:bg-[#F1F5F9] hover:text-[#0B1F3A]"
                  href={item.href}
                  onClick={() => {
                    setOpen(false);
                    scrollToHomeSection(item.href, pathname);
                  }}
                >
                  {item.name}
                </Link>
              </li>
            ))}
            <li className="mt-1 border-t border-[#E2E8F0] pt-2">
              <Link
                className="block rounded-xl bg-[#1D4ED8] px-4 py-3 text-center text-sm font-bold text-white hover:bg-[#0B1F3A]"
                href="/login"
                onClick={() => setOpen(false)}
              >
                Login
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </div>
  );
}
