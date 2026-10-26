"use client";

import type { Proposal } from "@/lib/engine/types";
import { formatWeekOf } from "@/lib/format";
import {
  selectAsOf,
  selectDecidedThisWeek,
  selectExpiredCards,
  selectOpenCards,
  useRhume,
} from "@/lib/store";
import SurgeCard, { DecidedRow, type CardHandlers } from "./SurgeCard";
import { REGION_TILE_LABEL } from "@/lib/data/regions";
import { KIND_LABEL } from "@/lib/engine/proposals";

/**
 * Store-backed default handlers: Open brief → the brief drawer; Approve → the SAP order modal
 * (Confirm writes the decision); Edit → the drawer's quantity slider; Reject → the reject dialog.
 * Swap any of them by passing props to <CardQueue />.
 */
export function useDefaultCardHandlers(): CardHandlers {
  const openBrief = useRhume((s) => s.openBrief);
  const requestApprove = useRhume((s) => s.requestApprove);
  const requestReject = useRhume((s) => s.requestReject);
  return {
    onOpenBrief: (p: Proposal) => openBrief(p.id),
    onApprove: (p: Proposal) => requestApprove(p.id),
    onEdit: (p: Proposal) => openBrief(p.id, "edit"),
    onReject: (p: Proposal) => requestReject(p.id),
  };
}

/** Right rail: open surge cards newest first, then a collapsed "Decided this week" list. Only this rail scrolls. */
export default function CardQueue(props: Partial<CardHandlers>) {
  const defaults = useDefaultCardHandlers();
  const handlers: CardHandlers = {
    onOpenBrief: props.onOpenBrief ?? defaults.onOpenBrief,
    onApprove: props.onApprove ?? defaults.onApprove,
    onEdit: props.onEdit ?? defaults.onEdit,
    onReject: props.onReject ?? defaults.onReject,
  };
  const asOf = useRhume(selectAsOf);
  const open = useRhume(selectOpenCards);
  const decided = useRhume(selectDecidedThisWeek);
  const expired = useRhume(selectExpiredCards);
  const highlighted = useRhume((s) => s.presenter.highlightedProposalId);
  const autoApprove = useRhume((s) => s.autoApprove);

  return (
    <section aria-label="Card queue" className="flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
        <h2 className="section-label">
          Surge cards <span className="tabular">({open.length})</span>
        </h2>
        <span className="text-[11px] text-muted">{autoApprove ? "Auto-approve on" : formatWeekOf(asOf)}</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {open.length === 0 ? (
          <p className="rounded-[4px] border border-dashed border-line p-3 text-xs text-muted">
            No open cards this week. Rhume only creates a card when its signal rules are met.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            {open.map((p) => (
              <li key={p.id}>
                <SurgeCard proposal={p} highlighted={highlighted === p.id} {...handlers} />
              </li>
            ))}
          </ul>
        )}

        <details className="mt-3 rounded-[4px] border border-line px-3 py-2">
          <summary className="cursor-pointer text-xs font-medium text-ink">
            Decided this week <span className="text-muted tabular">({decided.length})</span>
          </summary>
          {decided.length === 0 ? (
            <p className="mt-1.5 text-xs text-muted">Nothing decided yet this week.</p>
          ) : (
            <ul className="mt-1">
              {decided.map(({ proposal, decision }) => (
                <DecidedRow key={proposal.id} proposal={proposal} decision={decision} onOpenBrief={handlers.onOpenBrief} />
              ))}
            </ul>
          )}
        </details>

        {expired.length > 0 && (
          <details className="mt-2 rounded-[4px] border border-line px-3 py-2">
            <summary className="cursor-pointer text-xs font-medium text-muted">
              Expired without a decision <span className="tabular">({expired.length})</span>
            </summary>
            <p className="mt-1 text-[11px] text-muted">Cards expire after 7 days. The simulation treats them as do nothing.</p>
            <ul className="mt-1">
              {expired.map((p) => (
                <li key={p.id} className="border-t border-line py-1 text-xs text-muted first:border-t-0">
                  {REGION_TILE_LABEL[p.regionId]} · {KIND_LABEL[p.kind]} · {formatWeekOf(p.asOf)}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </section>
  );
}
