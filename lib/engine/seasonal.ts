// National seasonal pre-build baseline (the "seasonal" and "seasonal + Rhume" policies).
//
// A realistic status quo: the retailer pre-builds for flu season from a NATIONAL seasonal profile,
// the same week-by-week shape for every region. The profile is learned from the other season in the
// dataset, which stands in for "last year":
//   - 2023–24 is planned with the 2024–25 national shape;
//   - 2024–25 is planned with the 2023–24 national shape.
// Seasons are aligned by week-of-season (week 0 = the season's first Monday).
//
// index[k] = national true demand in week k of the reference season / national baseline demand
//          = Σ_r Σ_{days in week k} demand_r / (7 × Σ_r stores_r × baseline_r)
// where demand_r is the same demand model the simulation uses (§7.5). The current season's data,
// regional or national, is never read, so the profile carries no knowledge of this season's timing.

import type { Config } from "./config";
import { addDays, daysBetween } from "./dates";
import type { Region, Season } from "./types";
import { labPeakPct, REGION_BY_ID, REGION_IDS } from "../data/regions";
import { LAB_BASELINE_PCT } from "../data/generate";
import { loadSeason, type SeasonId } from "../data/loadSeason";

/** Season id → the season whose national shape stands in for "last year". */
export const REFERENCE_SEASON: Readonly<Record<SeasonId, SeasonId>> = { "2023-24": "2024-25", "2024-25": "2023-24" };

/** Weekly national seasonal index (1 = baseline), by week-of-season. */
export interface SeasonalProfile {
  referenceSeasonId: string;
  referenceLabel: string;
  index: number[];
}

function trueDemandMultiplier(labTruePct: number, peakPct: number, cfg: Config): number {
  const span = peakPct - LAB_BASELINE_PCT;
  const norm = span > 0 ? Math.min(1, Math.max(0, (labTruePct - LAB_BASELINE_PCT) / span)) : 0;
  return 1 + cfg.surgeAmplitude * norm;
}

/** National weekly demand shape of a (reference) season, relative to national baseline demand. */
export function nationalSeasonalIndex(reference: Season, cfg: Config): number[] {
  const nDays = daysBetween(reference.startDate, reference.endDate) + 1;
  const nWeeks = Math.floor(nDays / 7);
  const nationalBase = REGION_IDS.reduce((s, id) => s + REGION_BY_ID[id].stores * REGION_BY_ID[id].baselineUnitsPerStorePerDay, 0);
  const index: number[] = [];
  const byDate = REGION_IDS.map((id) => new Map(reference.labTrue[id].map((p) => [p.date, p.positivity])));
  for (let k = 0; k < nWeeks; k++) {
    let demand = 0;
    for (let i = 0; i < 7; i++) {
      const d = addDays(reference.startDate, 7 * k + i);
      REGION_IDS.forEach((id, j) => {
        const r = REGION_BY_ID[id];
        const lab = byDate[j].get(d) ?? LAB_BASELINE_PCT;
        demand += r.stores * r.baselineUnitsPerStorePerDay * trueDemandMultiplier(lab, labPeakPct(reference, id), cfg);
      });
    }
    index.push(demand / (7 * nationalBase));
  }
  return index;
}

/** The national profile used to plan `season` (from the other season). Flat (all 1) if none is known. */
export function seasonalProfileFor(season: Season, cfg: Config): SeasonalProfile {
  const refId = REFERENCE_SEASON[season.id as SeasonId];
  if (!refId) return { referenceSeasonId: "", referenceLabel: "none (flat)", index: [] };
  const reference = loadSeason(refId);
  return { referenceSeasonId: reference.id, referenceLabel: reference.label, index: nationalSeasonalIndex(reference, cfg) };
}

/** Index for week-of-season k; outside the reference season it is baseline (1). */
export function indexAtWeek(profile: SeasonalProfile, k: number): number {
  return k >= 0 && k < profile.index.length ? profile.index[k] : 1;
}

/**
 * Forecast daily demand for a region averaged over [from, from + days): region baseline × national
 * index for each day's week-of-season. This is the rate the seasonal policy replenishes against.
 */
export function seasonalForecastRate(profile: SeasonalProfile, season: Season, region: Region, from: string, days: number): number {
  const base = region.stores * region.baselineUnitsPerStorePerDay;
  const offset = daysBetween(season.startDate, from);
  let total = 0;
  for (let i = 0; i < days; i++) total += indexAtWeek(profile, Math.floor((offset + i) / 7));
  return days > 0 ? (base * total) / days : base;
}
