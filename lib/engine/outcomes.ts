// Outcomes, lead table and card precision (DESIGN.md §7.6). Evaluation code: it may use
// hindsight (e.g. lab data after a card's date), unlike the decision engine.

import type { Config } from "./config";
import { daysBetween, mondaysBetween, addDays } from "./dates";
import { INITIAL_DC_DAYS } from "./simulate";
import { getStageEngine } from "./stage";
import type { Proposal, RegionId, Season, SimResult } from "./types";
import { visible } from "./visible";
import { REGION_BY_ID, REGION_IDS } from "../data/regions";

export interface PolicyOutcome {
  policy: SimResult["policy"];
  stockoutRegionDays: number;
  lostSalesCad: number;
  lostGpCad: number;
  transferCostCad: number;
  seasonEndExcessCad: number;
}

export interface OutcomeComparison {
  statusQuo: PolicyOutcome;
  rhume: PolicyOutcome;
  /** (lost GP_sq − lost GP_rh) + (excess_sq − excess_rh) − transfer cost_rh */
  netBenefitCad: number;
}

const UNMET_EPSILON = 1e-9;

export function computeOutcomes(result: SimResult, cfg: Config): PolicyOutcome {
  let stockoutRegionDays = 0;
  let unmetUnits = 0;
  let excessUnitsCost = 0;
  for (const id of REGION_IDS) {
    const days = result.days[id];
    for (const d of days) {
      if (d.unmet > UNMET_EPSILON) stockoutRegionDays++;
      unmetUnits += d.unmet;
    }
    const last = days[days.length - 1];
    const region = REGION_BY_ID[id];
    const finalTotal = last ? last.storeOnHand + last.storeInTransit + last.dcOnHand + last.dcInbound : 0;
    const normal = INITIAL_DC_DAYS * region.stores * region.baselineUnitsPerStorePerDay;
    excessUnitsCost += Math.max(0, finalTotal - normal) * cfg.price * (1 - cfg.margin) * cfg.carryingRate;
  }
  const lostSalesCad = unmetUnits * cfg.lostShare * cfg.price;
  return {
    policy: result.policy,
    stockoutRegionDays,
    lostSalesCad,
    lostGpCad: lostSalesCad * cfg.margin,
    transferCostCad: result.transferCostCad,
    seasonEndExcessCad: excessUnitsCost,
  };
}

export function compareOutcomes(statusQuo: SimResult, rhume: SimResult, cfg: Config): OutcomeComparison {
  const sq = computeOutcomes(statusQuo, cfg);
  const rh = computeOutcomes(rhume, cfg);
  return {
    statusQuo: sq,
    rhume: rh,
    netBenefitCad: sq.lostGpCad - rh.lostGpCad + (sq.seasonEndExcessCad - rh.seasonEndExcessCad) - rh.transferCostCad,
  };
}

export interface LeadRow {
  regionId: RegionId;
  firstWatch: string | null;
  firstRising: string | null;
  /** First Monday reported lab positivity ≥ labOnsetPct. */
  labOnset: string | null;
  /** lab date − flag date (positive = Rhume flagged first). */
  leadDaysWatch: number | null;
  leadDaysRising: number | null;
  /** Lead from the earlier of the two flags. */
  leadDays: number | null;
}

/**
 * Lead table. Flags are evaluated on the replay's weekly dates (Mondays), which is when Rhume
 * runs and what the timeline shows.
 */
export function leadTable(season: Season, cfg: Config): LeadRow[] {
  const engine = getStageEngine(season, cfg);
  const mondays = mondaysBetween(season.startDate, season.endDate);
  return REGION_IDS.map((regionId) => {
    let firstWatch: string | null = null;
    let firstRising: string | null = null;
    for (const d of mondays) {
      const stage = engine.stateAt(regionId, d).stage;
      if (stage === "watch" && !firstWatch) firstWatch = d;
      if (stage === "rising" && !firstRising) firstRising = d;
    }
    const labOnset = season.labReported[regionId].find((p) => p.positivity >= cfg.labOnsetPct)?.date ?? null;
    const lead = (flag: string | null) => (flag && labOnset ? daysBetween(flag, labOnset) : null);
    const earliest = [firstWatch, firstRising].filter((x): x is string => x !== null).sort()[0] ?? null;
    return {
      regionId, firstWatch, firstRising, labOnset,
      leadDaysWatch: lead(firstWatch), leadDaysRising: lead(firstRising), leadDays: lead(earliest),
    };
  });
}

export const PRECISION_WINDOW_DAYS = 21;

/** Was the card "right": reported lab ≥ onset already at asOf, or within 21 days after asOf? */
export function cardHit(proposal: Proposal, season: Season, cfg: Config): boolean {
  const series = season.labReported[proposal.regionId];
  const atAsOf = visible(series, proposal.asOf);
  const latest = atAsOf[atAsOf.length - 1];
  if (latest && latest.positivity >= cfg.labOnsetPct) return true;
  const until = addDays(proposal.asOf, PRECISION_WINDOW_DAYS);
  return series.some((p) => p.date > proposal.asOf && p.date <= until && p.positivity >= cfg.labOnsetPct);
}

export interface CardPrecision { total: number; hits: number; precision: number | null }

export function cardPrecision(proposals: readonly Proposal[], season: Season, cfg: Config): CardPrecision {
  const hits = proposals.filter((p) => cardHit(p, season, cfg)).length;
  return { total: proposals.length, hits, precision: proposals.length ? hits / proposals.length : null };
}
