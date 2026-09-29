"use client";

import { useActionState, useMemo, useState } from "react";
import { publishPublicProgressAction } from "@/app/actions/director-public-progress-actions";
import { PublicProgressFunnel } from "@/components/public/public-progress-funnel";
import { initialPublishPublicProgressActionState } from "@/lib/director/public-progress-action-state";
import {
  formatPublicProgressTimestamp,
  PUBLIC_PROGRESS_METRICS,
} from "@/lib/public-progress";
import type { DirectorPublicProgressData } from "@/lib/director/public-progress-server";
import type { PublicProgressMetricKey } from "@/types";

type EditableValues = Record<PublicProgressMetricKey, string>;

function parsePreviewCount(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const count = Number(value);
  return Number.isSafeInteger(count) ? count : null;
}

function FieldError({
  errors,
  name,
}: {
  errors: Record<string, string[]> | undefined;
  name: string;
}) {
  const message = errors?.[name]?.[0];
  return message ? <span className="field-error">{message}</span> : null;
}

export function DirectorPublicProgress({
  data,
}: {
  data: DirectorPublicProgressData;
}) {
  const [values, setValues] = useState<EditableValues>(() =>
    Object.fromEntries(
      PUBLIC_PROGRESS_METRICS.map(({ key }) => [
        key,
        data.progress ? String(data.progress.values[key]) : "",
      ]),
    ) as EditableValues,
  );
  const [state, formAction, isPending] = useActionState(
    publishPublicProgressAction,
    initialPublishPublicProgressActionState,
  );
  const previewValues = useMemo(
    () => Object.fromEntries(
      PUBLIC_PROGRESS_METRICS.map(({ key }) => [
        key,
        parsePreviewCount(values[key]),
      ]),
    ) as Record<PublicProgressMetricKey, number | null>,
    [values],
  );
  const lastUpdated = state.publishedAt ?? data.progress?.publishedAt ?? null;

  function updateValue(key: PublicProgressMetricKey, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="director-page director-public-progress-page">
      <header className="page-header director-page-header">
        <div>
          <span className="eyebrow">Website statistics</span>
          <h1>K-GEO Public Statistics</h1>
          <p>
            Update the latest K-GEO progress figures displayed on the public
            website.
          </p>
        </div>
        {lastUpdated && (
          <p className="public-progress-director-updated">
            Last updated:{" "}
            <time dateTime={lastUpdated}>
              {formatPublicProgressTimestamp(lastUpdated)}
            </time>
          </p>
        )}
      </header>

      <form action={formAction} className="director-public-progress-form">
        <section className="director-section-card">
          <div className="director-section-heading">
            <div>
              <span>Published information</span>
              <h2>Latest K-GEO Figures</h2>
            </div>
            <p>Enter all six official management-supplied statistics.</p>
          </div>
          <div className="public-progress-editor-grid">
            {PUBLIC_PROGRESS_METRICS.map((metric) => (
              <label className="public-statistic-field" key={metric.key}>
                <span>{metric.label}</span>
                <input
                  inputMode="numeric"
                  min="0"
                  name={metric.key}
                  onChange={(event) =>
                    updateValue(metric.key, event.target.value)
                  }
                  required
                  step="1"
                  type="number"
                  value={values[metric.key]}
                />
                <FieldError errors={state.errors} name={metric.key} />
              </label>
            ))}
          </div>
        </section>

        <section className="director-section-card public-progress-preview-section">
          <div className="director-section-heading">
            <div>
              <span>Public website</span>
              <h2>Preview</h2>
            </div>
          </div>
          <PublicProgressFunnel
            ariaLabel="K-GEO public statistics preview"
            values={previewValues}
          />
          {state.message && (
            <p
              className={`form-message ${state.status === "error" ? "error" : "success"}`}
              role={state.status === "error" ? "alert" : "status"}
            >
              {state.message}
            </p>
          )}
          <button className="button" disabled={isPending} type="submit">
            {isPending ? "Saving…" : "Save & Publish"}
          </button>
        </section>
      </form>
    </div>
  );
}
