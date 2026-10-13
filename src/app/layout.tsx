import type { Metadata } from "next";
import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
  title: {
    default: "K-GEO | Higher Studies Consultancy",
    template: "%s | K-GEO",
  },
  description:
    "Personal guidance for university selection, applications, visas, and studying abroad.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={cn("font-sans", geist.variable)}
      data-scroll-behavior="smooth"
    >
      <body>{children}</body>
    </html>
  );
}
