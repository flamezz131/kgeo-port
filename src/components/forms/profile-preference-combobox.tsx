"use client";

import { useId, useState, type ReactNode } from "react";
import { FieldError } from "@/components/forms/field-error";

type ProfilePreferenceComboboxProps = {
  /**
   * Renders the searchable dropdown. The wrapper owns the selection so the
   * K-GEO-merge1 combobox components can stay controlled and unchanged.
   */
  children: (
    selected: string[],
    onChange: (next: string[]) => void,
  ) => ReactNode;
  defaultValues: string[];
  description: string;
  errors?: string[];
  label: string;
  maximumItems?: number;
  name: "preferredCountries" | "preferredProgramAreas" | "preferredCourses";
  /** The curated list a value must appear in to be selectable. */
  options: string[];
};

/**
 * Form plumbing around the K-GEO-merge1 combobox components.
 *
 * The comboboxes are controlled React components with no form participation, so
 * this wrapper contributes the label, hint, live region, validation message and
 * — critically — one hidden input per selection. The profile preferences form
 * posts to a server action that reads `formData.getAll(name)`, which is exactly
 * the shape `AccessibleTagInput` produced before, so the server contract and
 * the `preferred_countries` / `preferred_program_areas` columns are unchanged.
 *
 * Selections are restricted to `options`: a stored value that is no longer in
 * the curated list is dropped rather than shown, so everything saved from here
 * on is canonical.
 */
export function ProfilePreferenceCombobox({
  children,
  defaultValues,
  description,
  errors,
  label,
  maximumItems = 10,
  name,
  options,
}: ProfilePreferenceComboboxProps) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const feedbackId = `${fieldId}-feedback`;
  const errorId = `${fieldId}-error`;

  // Curated lists only: anything saved previously that is not an option is
  // discarded here and will not be written back on the next save.
  const [items, setItems] = useState(() =>
    defaultValues.filter((value) => options.includes(value)),
  );
  const [feedback, setFeedback] = useState("");

  // `options` can change after mount — Preferred Courses narrows when the
  // Field of Study answer changes. Only selections still on offer are shown
  // and submitted; switching the answer back brings them back.
  const selected = items.filter((value) => options.includes(value));

  function handleChange(next: string[]) {
    if (next.length > maximumItems) {
      setFeedback(`You can add up to ${maximumItems}.`);
      return;
    }
    const added = next.find((value) => !selected.includes(value));
    const removed = selected.find((value) => !next.includes(value));
    // Keep remembered picks that are hidden by the current options.
    setItems([...items.filter((value) => !options.includes(value)), ...next]);
    setFeedback(
      added ? `${added} added.` : removed ? `${removed} removed.` : "",
    );
  }

  return (
    <div className="field profile-tag-field">
      {/* A combobox is not a labelable element, so the existing `.field-label`
          style is reused on a span that labels the group instead. */}
      <span className="field-label" id={fieldId}>
        {label}
      </span>
      <span className="field-hint" id={hintId}>
        {description} Add up to {maximumItems}.
      </span>
      <div
        aria-describedby={`${hintId} ${feedbackId} ${errorId}`}
        aria-labelledby={fieldId}
        role="group"
      >
        {children(selected, handleChange)}
      </div>
      {selected.map((item) => (
        <input key={item} name={name} type="hidden" value={item} />
      ))}
      <span aria-live="polite" className="profile-tag-feedback" id={feedbackId}>
        {feedback}
      </span>
      <FieldError id={errorId} messages={errors} />
    </div>
  );
}
