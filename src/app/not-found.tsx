import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center bg-[#F8FAFC] px-6 py-16">
      <div className="grid max-w-md gap-4 text-center">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#1D4ED8]">
          Error 404
        </span>
        <h1 className="text-3xl font-extrabold text-[#0B1F3A]">Page not found</h1>
        <p className="text-[#475569]">
          The page you asked for does not exist or has moved.
        </p>
        <div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#1D4ED8] px-6 text-sm font-bold text-white hover:bg-[#0B1F3A]"
            href="/"
          >
            Go to the K-GEO home page
          </Link>
        </div>
      </div>
    </main>
  );
}
