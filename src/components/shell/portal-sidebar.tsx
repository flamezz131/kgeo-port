"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronRight, LogOut, Menu, X } from "lucide-react";

export type PortalLink = {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
};

/** Turns the signed-in user's name block into a link to their own page. */
export type PortalProfileLink = {
  href: string;
  label: string;
  active: boolean;
};

export type PortalSidebarTone = "navy" | "sky";

function getInitials(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

/** Every colour the rail uses, per tone, so the two never drift apart. */
const TONES: Record<
  PortalSidebarTone,
  {
    surface: string;
    logo: string;
    menuButton: string;
    glow: string;
    userCard: string;
    userName: string;
    profileIdle: string;
    profileActive: string;
    avatar: string;
    profileHint: string;
    footnote: string;
    idleLink: string;
    idleIcon: string;
    logout: string;
  }
> = {
  navy: {
    surface: "border-white/10 bg-[#0B1F3A]",
    logo: "brightness-0 invert",
    menuButton: "border-white/15 bg-white/10 text-white hover:bg-white/20",
    glow: "bg-[radial-gradient(120%_90%_at_50%_0%,rgba(59,130,246,0.3),transparent_72%)]",
    userCard: "border-white/10 bg-white/[0.04]",
    userName: "text-white",
    profileIdle: "border-white/10 bg-white/[0.04] hover:bg-white/[0.09]",
    profileActive: "border-blue-400/50 bg-white/[0.1]",
    avatar: "bg-white/15 text-white",
    profileHint: "text-blue-300",
    footnote: "text-slate-400",
    idleLink: "!text-slate-300 hover:bg-white/[0.07] hover:!text-white",
    idleIcon: "text-slate-400 group-hover:text-blue-300",
    logout:
      "!text-slate-300 hover:border-red-400/25 hover:bg-red-500/10 hover:!text-red-300",
  },
  // Baby blue ground with navy text; every pairing clears WCAG AA.
  sky: {
    surface: "border-[#93C5FD]/70 bg-[#BDE0FE]",
    logo: "",
    menuButton:
      "border-[#0B1F3A]/15 bg-white/50 text-[#0B1F3A] hover:bg-white/80",
    glow: "bg-[radial-gradient(120%_90%_at_50%_0%,rgba(255,255,255,0.75),transparent_72%)]",
    userCard: "border-white/70 bg-white/45",
    userName: "text-[#0B1F3A]",
    profileIdle: "border-white/70 bg-white/45 hover:bg-white/85",
    profileActive:
      "border-[#1D4ED8]/45 bg-white shadow-[0_8px_20px_-10px_rgba(29,78,216,0.6)]",
    avatar: "bg-[#0B1F3A] text-white",
    profileHint: "text-[#1D4ED8]",
    footnote: "text-[#1E3A5F]/80",
    idleLink: "!text-[#1E3A5F] hover:bg-white/60 hover:!text-[#0B1F3A]",
    idleIcon: "text-[#33557F] group-hover:text-[#1D4ED8]",
    logout:
      "!text-[#1E3A5F] hover:border-red-300 hover:bg-red-50/80 hover:!text-red-700",
  },
};

/**
 * The single navigation rail for every K-GEO portal.
 *
 * Each role keeps its own thin wrapper (StudentSidebar, CounselorSidebar,
 * DirectorSidebar, AdminNavigation) so route matching stays local to the role,
 * but all four render through this component — previously they were four
 * independent designs with different grounds, paddings and gaps, and only one
 * of them showed the signed-in user.
 */
export function PortalSidebar({
  portalLabel,
  userName,
  links,
  logoutAction,
  tone = "navy",
  profileLink,
}: {
  portalLabel: string;
  userName: string;
  profileLink?: PortalProfileLink;
  links: PortalLink[];
  logoutAction: (payload: FormData) => void;
  tone?: PortalSidebarTone;
}) {
  const colors = TONES[tone];
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Close the mobile drawer when the route changes. Adjusted during render
  // rather than in an effect, so navigation never paints the open drawer over
  // the new page for a frame.
  const [renderedPathname, setRenderedPathname] = useState(pathname);
  if (pathname !== renderedPathname) {
    setRenderedPathname(pathname);
    setIsOpen(false);
  }

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  return (
    <>
      {/* Mobile top bar */}
      <div
        className={`fixed inset-x-0 top-0 z-60 flex h-16 items-center justify-between border-b px-4 shadow-lg md:hidden ${colors.surface}`}
      >
        <Link href="/" aria-label="K-GEO home" className="flex items-center">
          <Image
            src="/logo-updated.png"
            alt="K-GEO"
            width={549}
            height={306}
            className={`h-10 w-auto object-contain ${colors.logo}`}
            preload
          />
        </Link>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls="portal-navigation"
          aria-label={isOpen ? "Close navigation" : "Open navigation"}
          className={`rounded-xl border p-2 transition-colors ${colors.menuButton}`}
        >
          {isOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {isOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsOpen(false)}
          className="fixed inset-0 z-40 cursor-default bg-[#0B1F3A]/50 backdrop-blur-[2px] md:hidden"
        />
      )}

      <aside
        id="portal-navigation"
        className={`fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col overflow-hidden border-r transition-transform duration-300 ease-out md:translate-x-0 ${colors.surface} ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Depth: a cool glow behind the mark, so the rail is not a flat slab. */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 top-0 h-64 ${colors.glow}`}
        />

        <div className="relative flex min-h-0 flex-1 flex-col gap-7 overflow-y-auto px-4 pt-20 pb-6 md:pt-7">
          <Link
            href="/"
            aria-label="K-GEO home"
            className="hidden px-2 md:block"
          >
            <Image
              src="/logo-updated.png"
              alt="K-GEO"
              width={549}
              height={306}
              className={`h-14 w-auto object-contain ${colors.logo}`}
              preload
            />
          </Link>

          {profileLink ? (
            // The name block doubles as the way into the user's own page, so
            // it is drawn as a button and says where it goes.
            <Link
              href={profileLink.href}
              aria-current={profileLink.active ? "page" : undefined}
              onClick={() => setIsOpen(false)}
              className={`group flex items-center gap-3 rounded-2xl border px-3 py-3 outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-[#1D4ED8] ${
                profileLink.active ? colors.profileActive : colors.profileIdle
              }`}
            >
              <span
                aria-hidden="true"
                className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${colors.avatar}`}
              >
                {getInitials(userName)}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={`block truncate font-semibold ${colors.userName}`}
                  title={userName}
                >
                  {userName}
                </span>
                <span
                  className={`mt-0.5 flex items-center gap-0.5 text-xs font-semibold ${colors.profileHint}`}
                >
                  {profileLink.label}
                  <ChevronRight
                    size={14}
                    className="transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                  />
                </span>
              </span>
            </Link>
          ) : (
            // No page of their own to open: the same block, not clickable.
            <div
              className={`flex items-center gap-3 rounded-2xl border px-3 py-3 ${colors.userCard}`}
            >
              <span
                aria-hidden="true"
                className={`grid size-10 shrink-0 place-items-center rounded-full text-sm font-bold ${colors.avatar}`}
              >
                {getInitials(userName)}
              </span>
              <p
                className={`min-w-0 flex-1 truncate font-semibold ${colors.userName}`}
                title={userName}
              >
                {userName}
              </p>
            </div>
          )}

          <nav aria-label={portalLabel} className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={link.active ? "page" : undefined}
                onClick={() => setIsOpen(false)}
                className={`group flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 ${
                  link.active
                    ? "bg-[#1D4ED8] !text-white shadow-[0_8px_20px_-8px_rgba(29,78,216,0.95)]"
                    : colors.idleLink
                }`}
              >
                <span
                  className={`flex shrink-0 transition-colors ${
                    link.active ? "text-white" : colors.idleIcon
                  }`}
                >
                  {link.icon}
                </span>
                <span className="truncate">{link.label}</span>
              </Link>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-3 pt-4">
            <form action={logoutAction}>
              <button
                type="submit"
                className={`flex w-full items-center gap-3 rounded-xl border border-transparent px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 ${colors.logout}`}
              >
                <LogOut size={18} className="shrink-0" />
                Log out
              </button>
            </form>
            {/* The portal name sits here as a quiet footnote, leaving the
                top of the rail to the person who is signed in. */}
            <p
              className={`px-3.5 text-[0.6rem] font-semibold uppercase tracking-[0.16em] ${colors.footnote}`}
            >
              {portalLabel}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
