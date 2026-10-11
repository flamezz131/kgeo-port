"use client";

import { motion, Variants } from "framer-motion";
import { HomeDestinations } from "./HomeDestinations";
import { HomeSuccessStories } from "./HomeSuccessStories";

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: "easeOut" } },
};

export function HomeSections() {
  return (
    <>
      {/* Intro */}
      <section id="about" className="py-20 bg-white px-6">
        <div className="max-w-[1400px] mx-auto">
          <motion.div
            initial="hidden" whileInView="visible" viewport={{ once: true, margin: "-100px" }} variants={fadeUp}
            className="text-center"
          >
            <h2 className="text-3xl lg:text-4xl font-extrabold text-[#0B1F3A] mb-4">Guided Pathways to Global Education</h2>
            <p className="text-[#64748B] max-w-3xl mx-auto text-lg leading-relaxed">
              K-GEO (Kumaraguru Global Engagement Office) acts as the official bridge between your aspirations and international academic realities. We provide a structured ecosystem connecting students with verified consultants and top-tier universities worldwide.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Destinations and partner universities */}
      <HomeDestinations />

      {/* Alumni success stories */}
      <HomeSuccessStories />
    </>
  );
}
