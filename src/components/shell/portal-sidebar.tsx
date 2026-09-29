"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { LogOut, Menu, X } from "lucide-react";

export type PortalLink = {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
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
}: {
  portalLabel: string;
  userName: string;
  links: PortalLink[];
  logoutAction: (payload: FormData) => void;
}) {
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
      <div className="fixed inset-x-0 top-0 z-60 flex h-16 items-center justify-between border-b border-white/10 bg-[#0B1F3A] px-4 shadow-lg md:hidden">
        <Link href="/" aria-label="K-GEO home" className="flex items-center">
          <Image
            src="/logo-updated.png"
            alt="K-GEO"
            width={280}
            height={80}
            className="h-10 w-auto object-contain brightness-0 invert"
            priority
          />
        </Link>
        <button
          type="button"
          onClick={() => setIsOpen((open) => !open)}
          aria-expanded={isOpen}
          aria-controls="portal-navigation"
          aria-label={isOpen ? "Close navigation" : "Open navigation"}
          className="rounded-xl border border-white/15 bg-white/10 p-2 text-white transition-colors hover:bg-white/20"
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
        className={`fixed inset-y-0 left-0 z-50 flex w-[17rem] flex-col overflow-hidden border-r border-white/10 bg-[#0B1F3A] transition-transform duration-300 ease-out md:translate-x-0 ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Depth: a cool glow behind the mark, so the rail is not a flat slab. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-64 bg-[radial-gradient(120%_90%_at_50%_0%,rgba(59,130,246,0.3),transparent_72%)]"
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
              width={280}
              height={80}
              className="h-14 w-auto object-contain brightness-0 invert"
              priority
            />
          </Link>

          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3">
            <p className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-blue-300">
              {portalLabel}
            </p>
            <p className="mt-1 truncate font-semibold text-white" title={userName}>
              {userName}
            </p>
          </div>

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
                    : "!text-slate-300 hover:bg-white/[0.07] hover:!text-white"
                }`}
              >
                <span
                  className={`flex shrink-0 transition-colors ${
                    link.active
                      ? "text-white"
                      : "text-slate-400 group-hover:text-blue-300"
                  }`}
                >
                  {link.icon}
                </span>
                <span className="truncate">{link.label}</span>
              </Link>
            ))}
          </nav>

          <form action={logoutAction} className="mt-auto pt-4">
            <button
              type="submit"
              className="flex w-full items-center gap-3 rounded-xl border border-transparent px-3.5 py-2.5 text-sm font-semibold !text-slate-300 transition-all duration-200 hover:border-red-400/25 hover:bg-red-500/10 hover:!text-red-300"
            >
              <LogOut size={18} className="shrink-0" />
              Log out
            </button>
          </form>
        </div>
      </aside>
    </>
  );
}
