// Expected value (DESIGN.md §7.4). Pure arithmetic, used by proposals and the Edit slider.

import type { Config, SourceKind } from "./config";
import type { Option, OptionId } from "./types";

export interface EvInput {
  units: number;                // option quantity q (units)
  projectedDailyDemand: number;
  currentCoverUnits: number;    // store on hand + in transit (store move) or DC on hand (DC pre-position)
  leadDays: number;             // ℓ
  probability: number;
  sourceKind: SourceKind;
}

export interface EvBreakdown {
  shortfall: number;
  avoidedUnits: number;
  avoidedGP: number;
  transferCost: number;
  carrying: number;
  ev: number;
}

/**
 * shortfall    = max(0, projectedDailyDemand × H − currentCoverUnits)
 * avoidedUnits = min(q, shortfall) × (H − ℓ) / H
 * avoidedGP    = avoidedUnits × lostShare × price × margin × probability
 * transferCost = ceil(q / unitsPerCase) × costPerCase(sourceKind)
 * carrying     = max(0, q − shortfall) × price × (1 − margin) × carryingRate × (H / 365)
 * EV           = avoidedGP − transferCost − carrying
 */
export function evBreakdown(input: EvInput, cfg: Config): EvBreakdown {
  const H = cfg.evHorizonDays;
  const q = Math.max(0, input.units);
  const shortfall = Math.max(0, input.projectedDailyDemand * H - input.currentCoverUnits);
  const avoidedUnits = (Math.min(q, shortfall) * Math.max(0, H - input.leadDays)) / H;
  const avoidedGP = avoidedUnits * cfg.lostShare * cfg.price * cfg.margin * input.probability;
  const transferCost = Math.ceil(q / cfg.unitsPerCase) * cfg.costPerCase[input.sourceKind];
  const carrying = Math.max(0, q - shortfall) * cfg.price * (1 - cfg.margin) * cfg.carryingRate * (H / 365);
  return { shortfall, avoidedUnits, avoidedGP, transferCost, carrying, ev: avoidedGP - transferCost - carrying };
}

export function expectedValue(input: EvInput, cfg: Config): number {
  return evBreakdown(input, cfg).ev;
}

/** One option for a given case count. */
export function buildOption(id: OptionId, cases: number, base: Omit<EvInput, "units">, cfg: Config): Option {
  const units = cases * cfg.unitsPerCase;
  const b = evBreakdown({ ...base, units }, cfg);
  return { id, cases, units, transferCostCad: b.transferCost, expectedValueCad: b.ev };
}

/** Do nothing · Half move · Full move. half = round(full / 2) cases. */
export function buildOptions(fullCases: number, base: Omit<EvInput, "units">, cfg: Config): Option[] {
  return [
    buildOption("none", 0, base, cfg),
    buildOption("half", Math.round(fullCases / 2), base, cfg),
    buildOption("full", fullCases, base, cfg),
  ];
}

const EV_EPSILON = 1e-9;

/**
 * Highest EV; ties go to the smaller quantity. If every EV ≤ 0, recommend "none"
 * (the honest do-nothing case; the card is still shown).
 */
export function recommendOption(options: readonly Option[]): OptionId {
  const sorted = [...options].sort((a, b) => a.cases - b.cases);
  let best = sorted.find((o) => o.id === "none") ?? sorted[0];
  for (const o of sorted) {
    if (o.expectedValueCad > best.expectedValueCad + EV_EPSILON) best = o;
  }
  if (best.expectedValueCad <= EV_EPSILON) return "none";
  return best.id;
}
