"use client";

import { useEffect, useRef, useState } from "react";
import { REGION_TILE_LABEL } from "@/lib/data/regions";
import { KIND_LABEL } from "@/lib/engine/proposals";
import { findProposal, useRhume } from "@/lib/store";

export const REJECT_REASONS = ["Signal looks like noise", "Stock needed elsewhere", "Store capacity", "Other"] as const;
export type RejectReason = (typeof REJECT_REASONS)[number];

/** "Signal looks like noise: <text>", or the text alone for Other. */
export function rejectReasonText(reason: RejectReason, text: string): string {
  const t = text.trim();
  if (reason === "Other") return t ? `Other: ${t}` : "";
  return t ? `${reason}: ${t}` : reason;
}

function RejectForm({ proposalId }: { proposalId: string }) {
  const proposal = useRhume((s) => findProposal(s, proposalId));
  const cancel = useRhume((s) => s.cancelReject);
  const confirm = useRhume((s) => s.confirmReject);
  const [reason, setReason] = useState<RejectReason | null>(null);
  const [text, setText] = useState("");
  const [tried, setTried] = useState(false);
  const firstRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstRef.current?.focus();
  }, []);

  const full = reason ? rejectReasonText(reason, text) : "";
  const error = !reason ? "Choose a reason." : !full ? "Describe the reason for Other." : null;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        setTried(true);
        if (!error) confirm(full);
      }}
      className="flex flex-col"
    >
      <div className="border-b border-line px-5 py-3">
        <p className="section-label">Reject card</p>
        <h2 id="reject-title" className="text-lg leading-6 font-semibold text-ink">
          {proposal ? `${REGION_TILE_LABEL[proposal.regionId]} · ${KIND_LABEL[proposal.kind]}` : "Card"}
        </h2>
        <p className="text-xs text-muted">A reason is required. It is written to the decision log.</p>
      </div>
      <fieldset className="flex flex-col gap-1.5 px-5 py-3">
        <legend className="sr-only">Reason</legend>
        {REJECT_REASONS.map((r, i) => (
          <label key={r} className="flex items-center gap-2 text-sm text-ink">
            <input
              ref={i === 0 ? firstRef : undefined}
              type="radio"
              name="reject-reason"
              value={r}
              checked={reason === r}
              onChange={() => setReason(r)}
              className="accent-[var(--accent)]"
            />
            {r}
          </label>
        ))}
        <label className="mt-2 flex flex-col gap-1 text-xs text-muted">
          {reason === "Other" ? "Reason (required)" : "Details (optional)"}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            maxLength={400}
            className="rounded-[4px] border border-line px-2 py-1.5 text-sm text-ink"
          />
        </label>
        {tried && error && (
          <p role="alert" className="text-xs text-accent">
            {error}
          </p>
        )}
      </fieldset>
      <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
        <button type="button" className="btn btn-secondary" onClick={cancel}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary">
          Reject card
        </button>
      </div>
    </form>
  );
}

/** Reject dialog: radio reasons plus free text; a reason is required (DESIGN.md §10.4). */
export default function RejectDialog() {
  const id = useRhume((s) => s.rejectProposalId);
  const cancel = useRhume((s) => s.cancelReject);
  if (!id) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div aria-hidden className="absolute inset-0 bg-ink/30" onClick={cancel} />
      <div role="dialog" aria-modal="true" aria-labelledby="reject-title" className="card relative w-full max-w-[440px]">
        <RejectForm key={id} proposalId={id} />
      </div>
    </div>
  );
}
