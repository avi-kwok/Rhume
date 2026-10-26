// Edit card (F10): expected value for any case count, recomputed client-side with lib/engine/ev.ts.

import type { Config } from "./engine/config";
import { buildOption, evBreakdown, type EvBreakdown, type EvInput } from "./engine/ev";
import type { Option, Proposal } from "./engine/types";

/** The EV inputs the engine used for this proposal (current cover units = cover days × projected demand). */
export function evBaseFor(proposal: Proposal): Omit<EvInput, "units"> {
  return {
    projectedDailyDemand: proposal.projectedDailyDemand,
    currentCoverUnits: proposal.coverDays * proposal.projectedDailyDemand,
    leadDays: proposal.leadDays,
    probability: proposal.probability,
    sourceKind: proposal.sourceKind,
  };
}

export function fullCases(proposal: Proposal): number {
  return proposal.options.find((o) => o.id === "full")!.cases;
}

/** Cases, units, transfer cost and EV for an edited quantity (clamped to 0 … full). */
export function optionForCases(proposal: Proposal, cases: number, cfg: Config): Option {
  const c = Math.max(0, Math.min(fullCases(proposal), Math.round(cases)));
  const named = proposal.options.find((o) => o.cases === c);
  return buildOption(named?.id ?? "full", c, evBaseFor(proposal), cfg);
}

export function breakdownForCases(proposal: Proposal, cases: number, cfg: Config): EvBreakdown {
  return evBreakdown({ ...evBaseFor(proposal), units: Math.max(0, Math.round(cases)) * cfg.unitsPerCase }, cfg);
}
