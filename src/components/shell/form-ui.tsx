import type { ComponentPropsWithoutRef, ReactNode } from "react";

/**
 * Tailwind replacements for the form primitives that used to live in
 * globals.css as `.form-stack`, `.field`, `.field-hint`, `.form-error` and
 * `.form-success`.
 *
 * These are components rather than bare utility strings on purpose: `.field`
 * styled the label, input, select, textarea, focus ring and readonly state as
 * descendants, so inlining it would mean repeating ten classes on every input.
 * Keeping the utilities here means a call site stays as short as the old
 * semantic class, and the styling is changed in one place.
 *
 * The CSS rules still exist for the portals that have not been converted yet.
 */

/** Utilities applied to a native input/select/textarea inside `Field`. */
export const controlClass =
  "w-full rounded-[0.8rem] border border-[var(--line)] bg-white px-4 py-[0.9rem] text-[var(--ink)] outline-none " +
  "focus:border-[var(--brand-600)] focus:shadow-[var(--focus-ring)] " +
  "read-only:cursor-not-allowed read-only:bg-[var(--surface-3)] read-only:text-[var(--muted)]";

/** Adds the textarea-specific sizing on top of `controlClass`. */
export const textareaClass = `${controlClass} min-h-[130px] resize-y`;

/** A vertical stack of fields. Replaces `.form-stack`. */
export function FormStack({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"form">) {
  return <form className={`mt-8 grid gap-4 ${className}`} {...props} />;
}

/**
 * One labelled control with an optional hint. Replaces `.field`.
 *
 * `htmlFor` is required because every control here must be reachable by label:
 * the accessibility contract tests assert the association.
 */
export function Field({
  children,
  className = "",
  hint,
  hintId,
  htmlFor,
  label,
}: {
  children: ReactNode;
  className?: string;
  hint?: ReactNode;
  hintId?: string;
  htmlFor: string;
  label: ReactNode;
}) {
  return (
    <div className={`grid gap-[0.45rem] ${className}`}>
      <label className="text-[0.88rem] font-bold" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint && (
        <span
          className="text-[0.82rem] leading-normal text-[var(--muted)]"
          id={hintId}
        >
          {hint}
        </span>
      )}
    </div>
  );
}

/** Replaces `.form-error`. Always announced. */
export function FormError({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-xl bg-[var(--bad-bg)] px-4 py-[0.8rem] text-[var(--danger)]"
      role="alert"
    >
      {children}
    </p>
  );
}

/** Replaces `.form-success`. */
export function FormSuccess({ children }: { children: ReactNode }) {
  return (
    <p
      className="rounded-xl bg-[var(--ok-bg)] px-4 py-[0.8rem] text-[var(--ok)]"
      role="status"
    >
      {children}
    </p>
  );
}

/**
 * The large rounded card each profile section sits in. Replaces
 * `.profile-section-card`.
 *
 * It carries descendant styling for the controls inside it — a softer field
 * border, the brand focus ring, solid brand buttons and a dimmed disabled
 * fieldset — which is why this is a component rather than a utility string.
 *
 * Exported as a class too, because the director report list renders the same
 * card as a `<Link>`.
 */
export const sectionCardClass =
  "rounded-[1.25rem] border border-[#dce6f2] bg-white p-[clamp(1.25rem,4vw,2.5rem)] " +
  "shadow-[0_16px_45px_rgba(11,31,58,0.07)] " +
  "[&>header_h2]:mx-0 [&>header_h2]:mb-0 [&>header_h2]:mt-[0.45rem] [&>header_h2]:text-[clamp(1.6rem,3vw,2.35rem)] [&>header_h2]:leading-[1.15] [&>header_h2]:tracking-[-0.035em] [&>header_h2]:text-[var(--ink)] " +
  "[&>header_p]:leading-[1.65] [&>header_p]:text-[var(--muted)] " +
  "[&_.field_input]:border-[#dce6f2] [&_.field_select]:border-[#dce6f2] [&_.field_textarea]:border-[#dce6f2] " +
  "[&_.field_input:focus]:border-[var(--brand-600)] [&_.field_select:focus]:border-[var(--brand-600)] [&_.field_textarea:focus]:border-[var(--brand-600)] " +
  "[&_.field_input:focus]:shadow-[0_0_0_3px_rgba(29,78,216,0.12)] [&_.field_select:focus]:shadow-[0_0_0_3px_rgba(29,78,216,0.12)] [&_.field_textarea:focus]:shadow-[0_0_0_3px_rgba(29,78,216,0.12)] " +
  "[&_.button]:border-[var(--brand-600)] [&_.button]:bg-[var(--brand-600)] [&_.button:hover]:bg-[var(--ink)] " +
  "[&_.button-secondary]:bg-transparent [&_.button-secondary]:text-[var(--brand-600)] [&_.button-secondary:hover]:bg-[var(--brand-50)] " +
  "[&_.button-danger]:border-[#b42318] [&_.button-danger]:bg-[#b42318] [&_.button-danger]:text-white " +
  "[&_.button-danger:hover]:border-[#7f1d1d] [&_.button-danger:hover]:bg-[#7f1d1d] " +
  "[&_fieldset:disabled]:opacity-[0.68] motion-reduce:[&_.button]:transition-none";

export function SectionCard({
  className = "",
  ...props
}: ComponentPropsWithoutRef<"section">) {
  return <section className={`${sectionCardClass} ${className}`} {...props} />;
}
