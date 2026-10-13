import Link from "next/link";
import Image from "next/image";
import type { ReactNode } from "react";
import { HideOnScroll } from "@/components/public/hide-on-scroll";
import {
  HomeSectionLink,
  PublicMobileMenu,
  PublicNavigation,
} from "@/components/public/public-navigation";

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#F8FAFC] text-[#0F172A] font-sans selection:bg-[#1D4ED8] selection:text-white">
      {/* The top bar slides away on scroll down and returns on scroll up. */}
      <HideOnScroll className="fixed top-0 inset-x-0 z-50">
        <header className="bg-white/40 backdrop-blur-xl backdrop-saturate-[2.5] border-b border-white/50 shadow-[0_8px_32px_rgba(0,0,0,0.04)] transition-all duration-300">
          <div className="max-w-[1500px] mx-auto px-6 h-24 flex items-center justify-between">
            <Link href="/" aria-label="K-GEO home" className="flex items-center gap-2 transition-transform hover:-translate-y-0.5 hover:scale-105 duration-300">
              <Image src="/logo-updated.png" alt="K-GEO Logo" width={549} height={306} className="h-16 md:h-20 w-auto object-contain" preload />
            </Link>

            <PublicNavigation />

            <div className="flex items-center gap-3">
              <Link
                href="/login"
                className="hidden sm:inline-flex items-center justify-center h-11 px-8 font-bold text-sm rounded-full bg-white/40 backdrop-blur-md border border-white/60 text-[#0B1F3A] shadow-[0_4px_16px_rgba(0,0,0,0.05)] hover:-translate-y-1 hover:bg-white/60 hover:shadow-[0_0_24px_rgba(29,78,216,0.3)] hover:border-blue-300 hover:text-[#1D4ED8] transition-all duration-300"
              >
                Login
              </Link>
              <PublicMobileMenu />
            </div>
          </div>
        </header>
      </HideOnScroll>
      <main className="pt-24">{children}</main>

      <footer className="bg-[#0B1F3A] text-white py-16 px-6">
        <div className="max-w-[1400px] mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
          <div>
            <span className="inline-flex rounded-2xl bg-white px-4 py-2">
              <Image src="/logo-updated.png" alt="K-GEO Logo" width={549} height={306} className="h-14 md:h-16 w-auto object-contain" loading="eager" />
            </span>
            <p className="text-[#8295b2] text-sm leading-relaxed mt-4">
              Official Global Engagement Office of Kumaraguru Institutions, empowering students with systematic pathways to international education.
            </p>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-white">Quick Links</h4>
            <ul className="space-y-2 text-[#8295b2] text-sm">
              <li><HomeSectionLink href="/#kgeo-progress" className="hover:text-white transition-colors">About Us</HomeSectionLink></li>
              <li><HomeSectionLink href="/#destinations" className="hover:text-white transition-colors">Destinations</HomeSectionLink></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-white">Portals</h4>
            <ul className="space-y-2 text-[#8295b2] text-sm">
              <li><Link href="/login" className="hover:text-white transition-colors">Student Portal</Link></li>
              <li><Link href="/counselor/login" className="hover:text-white transition-colors">Counselor Portal</Link></li>
              <li><Link href="/director/login" className="hover:text-white transition-colors">Director Portal</Link></li>
            </ul>
          </div>
          <div>
            <h4 className="font-bold mb-4 text-white">Kumaraguru Institutions</h4>
            {/* Plain text until the official institution URLs are confirmed. */}
            <ul className="space-y-2 text-[#8295b2] text-sm">
              <li>KCT - Engineering</li>
              <li>KCLAS - Liberal Arts</li>
              <li>KBS - Management</li>
              <li>Kumaraguru Foundation</li>
            </ul>
          </div>
        </div>
        <div className="max-w-[1400px] mx-auto mt-16 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between text-xs text-[#8295b2]">
          <p>© 2026 Kumaraguru Global Education Guidance. All rights reserved.</p>
          <div className="flex gap-4 mt-4 md:mt-0">
            <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms of Service</Link>
            <Link href="/disclaimer" className="hover:text-white transition-colors">Disclaimer</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
