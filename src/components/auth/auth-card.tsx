import type { ReactNode } from "react";

/**
 * The frame for every sign-in, registration and account-state screen.
 *
 * These pages previously shared `.auth-shell`, which had been written as a
 * borderless shell (`padding: <n>rem 0`) and later given a card border — so the
 * copy ran flush against the card edge on every one of them.
 */
export function AuthCard({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section className="relative mx-auto w-full max-w-lg px-5 pt-10 pb-24">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-10 mx-auto h-64 max-w-md rounded-full bg-blue-200/35 blur-3xl"
      />

      <div className="relative rounded-3xl border border-[#E2E8F0] bg-white p-7 shadow-[0_24px_60px_-30px_rgb(11_31_58/0.35)] sm:p-9">
        <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[0.65rem] font-extrabold uppercase tracking-[0.12em] text-[#1E40AF] ring-1 ring-inset ring-blue-100">
          {eyebrow}
        </span>

        <h1 className="mt-4 text-[1.75rem] leading-tight sm:text-[2rem]">
          {title}
        </h1>

        {description && (
          <div className="mt-3 text-[0.92rem] leading-relaxed text-slate-500">
            {description}
          </div>
        )}

        {children && <div className="mt-7">{children}</div>}

        {footer && (
          <div className="mt-7 flex flex-col gap-2 border-t border-[#E2E8F0] pt-5 text-[0.87rem] text-slate-500">
            {footer}
          </div>
        )}
      </div>
    </section>
  );
}

/** A quiet inline block for informational copy inside an AuthCard. */
export function AuthNotice({
  tone = "info",
  children,
}: {
  tone?: "info" | "danger" | "success";
  children: ReactNode;
}) {
  const tones = {
    info: "border-blue-100 bg-blue-50/70 text-slate-700",
    danger: "border-rose-200 bg-rose-50 text-rose-800",
    success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  } as const;

  return (
    <div
      className={`flex flex-col gap-2 rounded-xl border p-4 text-[0.9rem] leading-relaxed ${tones[tone]}`}
    >
      {children}
    </div>
  );
}
