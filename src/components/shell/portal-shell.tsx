import type { ReactNode } from "react";

/**
 * The frame every signed-in portal renders inside.
 *
 * One ground, one content width, one padding rhythm — the four layouts used to
 * disagree on all three. `portal-canvas` opens a CSS container so the feature
 * stylesheet can reflow tables and grids against the real content width rather
 * than the viewport, which is 17rem wider than the column the rail leaves.
 */
export function PortalShell({
  sidebar,
  children,
}: {
  sidebar: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-[var(--ground)] text-[var(--ink-body)] selection:bg-[var(--brand-600)] selection:text-white print:bg-white">
      <div className="print:hidden">{sidebar}</div>
      <main className="min-w-0 flex-1 pt-16 md:ml-[17rem] md:pt-0 print:pt-0 print:ml-0 print:m-0">
        <div className="portal-canvas mx-auto w-full max-w-[1440px] px-5 py-7 md:px-8 md:py-10 print:p-0 print:m-0">
          {children}
        </div>
      </main>
    </div>
  );
}
