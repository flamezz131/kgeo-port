import type { ComponentPropsWithoutRef, ReactNode } from "react";

const PANEL_SURFACE =
  "rounded-2xl border border-[var(--line)] bg-[var(--surface)] shadow-[0_1px_3px_rgb(15_23_42/0.06)]";

/**
 * Headers align to `items-start`, never `items-end`: a trailing badge or button
 * must sit level with the title, not with the last line of the description.
 */
export function PageHeader({
  action,
  description,
  eyebrow,
  title,
  titleId,
}: {
  action?: ReactNode;
  description?: ReactNode;
  eyebrow: string;
  title: ReactNode;
  titleId?: string;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <span className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[var(--brand-600)]">
          {eyebrow}
        </span>
        <h1 className="mt-2" id={titleId}>
          {title}
        </h1>
        {description && (
          <p className="mt-2 max-w-2xl text-[var(--muted)]">{description}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function SectionHeader({
  action,
  description,
  eyebrow,
  title,
  titleId,
}: {
  action?: ReactNode;
  description?: ReactNode;
  eyebrow: string;
  title: ReactNode;
  titleId?: string;
}) {
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <span className="text-[0.65rem] font-extrabold uppercase tracking-[0.14em] text-[var(--brand-600)]">
          {eyebrow}
        </span>
        <h2 className="mt-1.5" id={titleId}>
          {title}
        </h2>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-[var(--muted)]">
            {description}
          </p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </header>
  );
}

export function Panel({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return (
    <section className={`${PANEL_SURFACE} p-5 sm:p-6 ${className}`} {...props} />
  );
}

/**
 * The single empty/error presentation for portal content. It renders no
 * heading: these blocks replace a region's body, not its place in the outline,
 * and a heading here produced duplicate `h1`s on sub-pages.
 */
export function StateBlock({
  description,
  role,
  title,
  tone = "empty",
}: {
  description?: ReactNode;
  role?: "status" | "alert";
  title: string;
  tone?: "empty" | "error";
}) {
  const isError = tone === "error";
  return (
    <div
      className={`rounded-xl border p-6 ${
        isError
          ? "border-rose-200 bg-rose-50"
          : "border-dashed border-[var(--line-strong)] bg-[var(--surface-2)]"
      }`}
      role={role ?? (isError ? "alert" : "status")}
    >
      <p
        className={`font-bold ${isError ? "text-rose-900" : "text-[var(--ink)]"}`}
      >
        {title}
      </p>
      {description && (
        <p
          className={`mt-1.5 text-sm ${
            isError ? "text-rose-800" : "text-[var(--muted)]"
          }`}
        >
          {description}
        </p>
      )}
    </div>
  );
}
