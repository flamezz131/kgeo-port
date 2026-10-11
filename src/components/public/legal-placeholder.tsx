import Link from "next/link";

/**
 * Temporary page for a legal document that K-GEO has not published yet.
 * Replace with the approved wording once it is available.
 */
export function LegalPlaceholder({ title }: { title: string }) {
  return (
    <section className="px-6 py-20">
      <div className="mx-auto grid max-w-2xl gap-5 rounded-3xl border border-[#E2E8F0] bg-white p-8 shadow-[0_8px_32px_rgba(0,0,0,0.04)] md:p-12">
        <span className="text-xs font-bold uppercase tracking-[0.14em] text-[#1D4ED8]">
          Being finalised
        </span>
        <h1 className="text-3xl font-extrabold text-[#0B1F3A]">{title}</h1>
        <p className="text-[#475569] leading-relaxed">
          The K-GEO {title} is being finalised by the Kumaraguru Global
          Engagement Office and will be published on this page.
        </p>
        <p className="text-[#475569] leading-relaxed">
          If you have a question in the meantime, please contact the
          Kumaraguru Global Engagement Office.
        </p>
        <div>
          <Link
            className="inline-flex h-11 items-center justify-center rounded-full bg-[#1D4ED8] px-6 text-sm font-bold text-white hover:bg-[#0B1F3A]"
            href="/"
          >
            Back to home
          </Link>
        </div>
      </div>
    </section>
  );
}
