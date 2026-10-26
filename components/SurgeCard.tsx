"use client";

import { REGION_TILE_LABEL } from "@/lib/data/regions";
import { KIND_LABEL } from "@/lib/engine/proposals";
import type { Decision, Proposal } from "@/lib/engine/types";
import { formatCad, formatDate, formatDays, formatInt } from "@/lib/format";
import { PERSONA } from "@/lib/persona";
import { APPROVE_ALL_REASON, isAutoDecision, recommendedOption } from "@/lib/store";
import { ConfidencePip, StageBadge } from "./Badge";

/** Card handlers. The queue passes store-backed defaults: brief drawer, SAP order modal, edit slider, reject dialog. */
export interface CardHandlers {
  onOpenBrief: (proposal: Proposal) => void;
  onApprove: (proposal: Proposal) => void;
  onEdit: (proposal: Proposal) => void;
  onReject: (proposal: Proposal) => void;
}

/** Top label: store moves are a forming surge; DC pre-positions are an early signal. */
export function cardHeadline(proposal: Proposal): string {
  return proposal.kind === "store_move" ? "Surge forming" : "Early signal";
}

export function decisionLabel(decision: Decision, proposal: Proposal): string {
  // Manual decisions are the signed-in planner's (lib/persona.ts).
  if (decision.action === "reject") return `Rejected by ${PERSONA.name}`;
  const cases =
    decision.action === "edit_approve"
      ? (decision.cases ?? 0)
      : (proposal.options.find((o) => o.id === (decision.optionId ?? proposal.recommended))?.cases ?? 0);
  const verb = isAutoDecision(decision)
    ? "Auto-approved"
    : decision.reason === APPROVE_ALL_REASON
      ? "Approved (weekly plan)"
      : decision.action === "edit_approve"
        ? `Approved (edited) by ${PERSONA.name}`
        : `Approved by ${PERSONA.name}`;
  return `${verb} · ${formatInt(cases)} cases`;
}

export interface SurgeCardProps extends CardHandlers {
  proposal: Proposal;
  highlighted?: boolean;
}

export default function SurgeCard({ proposal, highlighted = false, onOpenBrief, onApprove, onEdit, onReject }: SurgeCardProps) {
  const rec = recommendedOption(proposal);
  const region = REGION_TILE_LABEL[proposal.regionId];
  const kind = KIND_LABEL[proposal.kind];
  const doNothing = proposal.recommended === "none";

  return (
    <article
      aria-label={`${cardHeadline(proposal)}: ${region}, ${kind}`}
      data-proposal-id={proposal.id}
      className={`rounded-[4px] border bg-bg p-3 ${highlighted ? "border-accent ring-2 ring-accent" : "border-line"}`}
    >
      <header className="flex items-baseline justify-between gap-2">
        <p className="text-[11px] font-semibold tracking-[0.12em] text-accent uppercase">{cardHeadline(proposal)}</p>
        <span className="text-[11px] text-muted tabular">{formatDate(proposal.asOf)}</span>
      </header>
      <h3 className="mt-0.5 text-sm leading-5 font-semibold text-ink">
        {region} <span className="font-normal text-muted">· {kind}</span>
      </h3>

      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
        <StageBadge stage={proposal.stage} />
        <ConfidencePip confidence={proposal.confidence} />
        <span className="tabular">· {formatDays(Math.round(proposal.coverDays))} cover</span>
      </div>

      <dl className="mt-2 grid grid-cols-3 gap-1 text-xs">
        <div>
          <dt className="text-muted">Proposed</dt>
          <dd className="font-semibold text-ink tabular">{formatInt(rec.cases)} cases</dd>
        </div>
        <div>
          <dt className="text-muted">Cost</dt>
          <dd className="font-semibold text-ink tabular">{formatCad(rec.transferCostCad)}</dd>
        </div>
        <div>
          <dt className="text-muted">EV</dt>
          <dd className="font-semibold text-ink tabular">{formatCad(rec.expectedValueCad)}</dd>
        </div>
      </dl>
      {doNothing && <p className="mt-1 text-xs text-muted">Engine recommends doing nothing: no option has a positive expected value.</p>}
      {highlighted && <p className="mt-1 text-[11px] font-semibold text-accent">Presenter pause · B brief · A approve · R reject</p>}

      <div className="mt-2.5 flex gap-1.5">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenBrief(proposal)}>
          Open brief
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={() => onApprove(proposal)}>
          Approve
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(proposal)}>
          Edit
        </button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onReject(proposal)}>
          Reject
        </button>
      </div>
    </article>
  );
}

/** Compact row for the "Decided this week" list. */
export function DecidedRow({ proposal, decision, onOpenBrief }: { proposal: Proposal; decision: Decision; onOpenBrief: (p: Proposal) => void }) {
  return (
    <li className="flex items-center justify-between gap-2 border-t border-line py-1.5 first:border-t-0">
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-ink">
          {REGION_TILE_LABEL[proposal.regionId]} · {KIND_LABEL[proposal.kind]}
        </span>
        <span className="block text-[11px] text-muted tabular">{decisionLabel(decision, proposal)}</span>
      </span>
      <button type="button" className="btn btn-ghost btn-sm shrink-0" onClick={() => onOpenBrief(proposal)}>
        Brief
      </button>
    </li>
  );
}
