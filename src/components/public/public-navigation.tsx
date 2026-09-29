"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

const navItems = [
  { name: "Home", href: "/" },
  { name: "About", href: "/#about" },
  { name: "How it Works", href: "/#how-it-works" },
  { name: "Destinations", href: "/#destinations" },
  { name: "Success Stories", href: "/#success" },
  { name: "Partners", href: "/#partners" },
  { name: "Contact", href: "/#contact" },
];

export function PublicNavigation() {
  const [activeTab, setActiveTab] = useState("Home");

  return (
    <nav aria-label="Main navigation" className="hidden lg:flex items-center p-1.5 rounded-full bg-white/40 backdrop-blur-md border border-white/60 shadow-[0_4px_32px_rgba(0,0,0,0.04)]">
      {navItems.map((item) => (
        <Link
          key={item.name}
          href={item.href}
          onClick={() => setActiveTab(item.name)}
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
