"use client";

import { useActionState } from "react";
import {
  blockCounselorSlot,
  releaseCounselorSlotBlock,
} from "@/app/actions/counselor-slot-block-actions";
import {
  CONSULTATION_SLOTS,
  formatConsultationDate,
  formatConsultationTimeRange,
} from "@/lib/consultations/booking";
import {
  initialCounselorSlotBlockActionState,
} from "@/lib/consultations/counselor-slot-blocking";

export type CounselorActiveSlotBlock = {
  block_id: string;
  consultation_date: string;
  slot_start: string;
  slot_end: string;
  reason: string | null;
  created_at: string;
};

function ReleaseSlotBlockButton({ blockId }: { blockId: string }) {
  const [state, action, isPending] = useActionState(
    releaseCounselorSlotBlock,
    initialCounselorSlotBlockActionState,
  );

  return (
    <form action={action} aria-busy={isPending}>
      <input name="blockId" type="hidden" value={blockId} />
      <button
        className="button button-secondary button-small"
        disabled={isPending}
        type="submit"
      >
        {isPending ? "Unblocking..." : "Unblock"}
      </button>
      {state.message && (
        <span
          className={state.status === "error" ? "form-error" : "form-success"}
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
        </span>
      )}
    </form>
  );
}

export function CounselorSlotBlocks({
  blocks,
  minimumDate,
}: {
  blocks: CounselorActiveSlotBlock[];
  minimumDate: string;
}) {
  const [state, action, isPending] = useActionState(
    blockCounselorSlot,
    initialCounselorSlotBlockActionState,
  );

  return (
    <section
      aria-labelledby="blocked-slots-heading"
      className="counselor-section-card"
    >
      <div className="counselor-section-heading">
        <div>
          <h2 id="blocked-slots-heading">Blocked Slots</h2>
          <p>Block one future canonical slot. Students never see your reason.</p>
        </div>
      </div>

      <form action={action} aria-busy={isPending} className="form-stack">
        <div className="form-fields">
          <div className="field">
            <label htmlFor="block-consultation-date">Date</label>
            <input
              id="block-consultation-date"
              min={minimumDate}
              name="consultationDate"
              required
              type="date"
            />
          </div>
          <div className="field">
            <label htmlFor="block-slot-start">Start time</label>
            <select
              defaultValue=""
              id="block-slot-start"
              name="slotStart"
              required
            >
              <option disabled value="">
                Choose a slot
              </option>
              {CONSULTATION_SLOTS.map((slot) => (
                <option key={slot.start} value={slot.start}>
                  {formatConsultationTimeRange(slot.start, slot.end)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="block-reason">Internal reason (optional)</label>
            <input
              id="block-reason"
              maxLength={200}
              name="reason"
              type="text"
            />
          </div>
        </div>
        <button className="button button-small" disabled={isPending} type="submit">
          {isPending ? "Blocking..." : "Block my slot"}
        </button>
        {state.message && (
          <p
            className={state.status === "error" ? "form-error" : "form-success"}
            role={state.status === "error" ? "alert" : "status"}
          >
            {state.message}
          </p>
        )}
      </form>

      {blocks.length === 0 ? (
        <p className="muted" role="status">
          No active blocked slots.
        </p>
      ) : (
        <div className="consultation-list">
          {blocks.map((block) => (
            <article className="consultation-card" key={block.block_id}>
              <div className="consultation-card-heading">
                <div>
                  <h3>{formatConsultationDate(block.consultation_date)}</h3>
                  <p>
                    {formatConsultationTimeRange(
                      block.slot_start,
                      block.slot_end,
                    )}
                  </p>
                </div>
                <span className="status">Blocked</span>
              </div>
              {block.reason && <p className="muted">{block.reason}</p>}
              <ReleaseSlotBlockButton blockId={block.block_id} />
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
